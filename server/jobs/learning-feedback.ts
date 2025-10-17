import { db } from "../db";
import { learningFragments, trades, InsertLearningFragment } from "@shared/schema";
import { gte, and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { memoryLifecycle } from "../services/memory-lifecycle";
import { schedulerRegistry } from "../services/scheduler-registry";
import OpenAI from "openai";

/**
 * Learning Feedback Job
 * Runs nightly at 2 AM to aggregate last 24h trade insights,
 * synthesize learnings via GPT-4o mini, generate embeddings,
 * and update learning fragments with provenance tracking.
 */

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

interface TradeInsight {
  tradeId: number;
  symbol: string;
  strategy: string;
  outcome: string;
  realizedPL: string;
  reasonSnapshot: string | null;
  notes: string | null;
  entryTime: Date;
  exitTime: Date | null;
}

async function aggregateLast24hTrades(): Promise<TradeInsight[]> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Fetch closed trades from last 24 hours with all required fields
  const recentTrades = await db.select({
    tradeId: trades.id,
    symbol: trades.symbol,
    strategy: trades.strategy,
    outcome: trades.outcome,
    realizedPL: trades.realizedPL,
    reasonSnapshot: trades.reasonSnapshot,
    notes: trades.notes,
    entryTime: trades.entryTime,
    exitTime: trades.exitTime,
  })
    .from(trades)
    .where(
      and(
        eq(trades.mode, "paper"),
        eq(trades.status, "closed"),
        gte(trades.entryTime, yesterday)
      )
    )
    .limit(100);
  
  return recentTrades as TradeInsight[];
}

async function synthesizeLearnings(tradeInsights: TradeInsight[]): Promise<string> {
  // Build synthesis prompt with trade details
  const tradeDetails = tradeInsights.map(t => ({
    symbol: t.symbol,
    strategy: t.strategy,
    outcome: t.outcome,
    pnl: t.realizedPL,
    reason: t.reasonSnapshot || "N/A",
    notes: t.notes || "N/A",
  }));
  
  const prompt = `Analyze the following ${tradeInsights.length} paper trades from the last 24 hours and synthesize key learnings:

${JSON.stringify(tradeDetails, null, 2)}

Provide a concise narrative learning summary covering:
1. Strategy performance patterns
2. What worked well and why
3. What failed and lessons learned
4. Actionable insights for live trading

Keep the response under 300 words, focused on transferable knowledge.`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "You are a trading performance analyst. Synthesize actionable learnings from paper trading results." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });
  
  return response.choices[0]?.message?.content || "No synthesis available";
}

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  
  return response.data[0].embedding;
}

async function runLearningFeedback(): Promise<void> {
  console.log("[LearningFeedback] Starting nightly learning feedback job (2 AM)...");
  
  try {
    // Step 1: Aggregate last 24h trades with outcome, realizedPL, reasonSnapshot, notes
    const tradeInsights = await aggregateLast24hTrades();
    
    if (tradeInsights.length === 0) {
      console.log("[LearningFeedback] No closed trades in last 24h");
      return;
    }
    
    console.log(`[LearningFeedback] Aggregated ${tradeInsights.length} trade insights from last 24h`);
    
    // Step 2: Synthesize narrative learnings via GPT-4o mini
    const narrativeLearning = await synthesizeLearnings(tradeInsights);
    console.log(`[LearningFeedback] GPT-4o mini synthesis complete (${narrativeLearning.length} chars)`);
    
    // Step 3: Generate embedding for semantic search
    const embedding = await generateEmbedding(narrativeLearning);
    console.log(`[LearningFeedback] Embedding generated (${embedding.length} dimensions)`);
    
    // Step 4: Calculate performance metrics
    const profitable = tradeInsights.filter(t => parseFloat(t.realizedPL || "0") > 0);
    const totalPL = tradeInsights.reduce((sum, t) => sum + parseFloat(t.realizedPL || "0"), 0);
    const winRate = profitable.length / tradeInsights.length;
    
    // Step 5: Create learning fragment with full provenance
    const traceId = nanoid();
    
    const fragment: InsertLearningFragment = {
      globalContextId: "default",
      mode: "paper",
      eventType: "engine_event",
      significance: "significant",
      narrative: narrativeLearning,
      reasoning: `24h paper trading synthesis: ${tradeInsights.length} trades, ${(winRate * 100).toFixed(1)}% win rate, total P/L: $${totalPL.toFixed(2)}`,
      implications: [
        `Profitable trades: ${profitable.length}/${tradeInsights.length}`,
        `Win rate: ${(winRate * 100).toFixed(1)}%`,
        `Total P/L: $${totalPL.toFixed(2)}`,
        `Strategies: ${[...new Set(tradeInsights.map(t => t.strategy))].join(", ")}`,
      ],
      eventCategory: "nightly_learning_synthesis",
      traceId,
      embedding,
    };
    
    await db.insert(learningFragments).values(fragment);
    console.log(`[LearningFeedback] Learning fragment created with traceId: ${traceId}`);
    
    // Step 6: Trigger memory checksum update
    console.log("[LearningFeedback] Triggering memory checksum update...");
    const freshState = await memoryLifecycle.rehydrateMemory();
    const freshChecksum = memoryLifecycle.computeChecksum(freshState);
    await memoryLifecycle.logChecksum(
      freshChecksum,
      "VERIFIED",
      freshState,
      traceId,
      undefined
    );
    
    console.log(`[LearningFeedback] ✅ Learning feedback completed - checksum: ${freshChecksum}`);
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    console.error("[LearningFeedback] ❌ Job failed:", errorMessage);
    throw error;
  }
}

// Register the job with scheduler (runs daily at 2 AM)
export function registerLearningFeedbackJob(): void {
  schedulerRegistry.registerTask({
    name: "learning_feedback",
    description: "Nightly learning feedback synthesis at 2 AM (GPT-4o mini + embeddings)",
    frequency: "daily at 02:00",
    lastRun: null,
    nextRun: null,
    status: "idle",
    intervalMs: 24 * 60 * 60 * 1000, // 24 hours
    run: runLearningFeedback,
  });
  
  console.log("[LearningFeedback] Job registered with scheduler (runs at 2 AM)");
}
