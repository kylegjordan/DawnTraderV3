import { db } from "../db";
import { learningFragments, trades, InsertLearningFragment } from "@shared/schema";
import { gte, and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { memoryLifecycle } from "../services/memory-lifecycle";
import { schedulerRegistry } from "../services/scheduler-registry";

/**
 * Learning Feedback Job
 * Runs nightly to aggregate simulation results, embed insights,
 * and update learning fragments with new checksum.
 */

async function aggregateSimulationResults(): Promise<any[]> {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  
  // Fetch simulation trades from last 24 hours
  const recentTrades = await db.select()
    .from(trades)
    .where(
      and(
        eq(trades.mode, "paper"),
        gte(trades.entryTime, yesterday)
      )
    )
    .limit(100);
  
  // Aggregate results
  const insights = [];
  
  if (recentTrades.length > 0) {
    const profitable = recentTrades.filter(t => 
      t.status === "closed" && parseFloat(t.pnl || "0") > 0
    );
    const losing = recentTrades.filter(t => 
      t.status === "closed" && parseFloat(t.pnl || "0") < 0
    );
    
    insights.push({
      type: "performance_summary",
      data: {
        totalTrades: recentTrades.length,
        profitable: profitable.length,
        losing: losing.length,
        winRate: profitable.length / recentTrades.length,
        strategies: [...new Set(recentTrades.map(t => t.strategy))],
      }
    });
  }
  
  return insights;
}

async function runLearningFeedback(): Promise<void> {
  console.log("[LearningFeedback] Starting nightly learning feedback job...");
  
  try {
    // Step 1: Aggregate simulation results & performance summaries
    const insights = await aggregateSimulationResults();
    
    if (insights.length === 0) {
      console.log("[LearningFeedback] No new insights to process");
      return;
    }
    
    console.log(`[LearningFeedback] Aggregated ${insights.length} insights from last 24h`);
    
    // Step 2: Create learning fragments
    for (const insight of insights) {
      const traceId = nanoid();
      
      const fragment: InsertLearningFragment = {
        globalContextId: "default",
        mode: "paper",
        eventType: "engine_event",
        significance: "significant",
        narrative: `Daily learning synthesis: ${insight.type}`,
        reasoning: `Aggregated ${insight.data.totalTrades} paper trades with ${(insight.data.winRate * 100).toFixed(1)}% win rate`,
        implications: [
          `Win rate: ${(insight.data.winRate * 100).toFixed(1)}%`,
          `Strategies tested: ${insight.data.strategies.join(", ")}`,
        ],
        eventCategory: "daily_synthesis",
        traceId,
        timestamp: new Date(),
      };
      
      await db.insert(learningFragments).values(fragment);
      console.log(`[LearningFeedback] Created learning fragment: ${traceId}`);
    }
    
    // Step 3: Trigger new checksum computation
    console.log("[LearningFeedback] Triggering memory checksum update...");
    const freshState = await memoryLifecycle.rehydrateMemory();
    const freshChecksum = memoryLifecycle.computeChecksum(freshState);
    await memoryLifecycle.logChecksum(
      freshChecksum,
      "VERIFIED",
      freshState,
      undefined,
      undefined
    );
    
    console.log(`[LearningFeedback] ✅ Learning feedback completed - new checksum: ${freshChecksum}`);
  } catch (error: any) {
    const errorMessage = error?.message || String(error);
    console.error("[LearningFeedback] ❌ Job failed:", errorMessage);
    throw error;
  }
}

// Register the job with scheduler
export function registerLearningFeedbackJob(): void {
  schedulerRegistry.registerTask({
    name: "learning_feedback",
    description: "Nightly learning fragment synthesis and memory checksum update",
    frequency: "daily at midnight",
    lastRun: null,
    nextRun: null,
    status: "idle",
    intervalMs: 24 * 60 * 60 * 1000, // 24 hours
    run: runLearningFeedback,
  });
  
  console.log("[LearningFeedback] Job registered with scheduler");
}
