// server/services/ai-market-analyzer.ts
// AI Market Analyzer service that calls OpenAI to classify market regime

import OpenAI from "openai";
import { getMarketSnapshot } from "./market-snapshot";
import { type InsertAiMarketAnalysis } from "@shared/schema";
import { storage } from "../storage";

const MODEL = process.env.OPENAI_MODEL_MARKET || "gpt-4o-mini"; // cost-aware default

export async function runAiMarketAnalysis(mode: 'live' | 'paper'): Promise<InsertAiMarketAnalysis> {
  const snapshot = await getMarketSnapshot();
  
  const prompt = `
You are a trading market analyst. Given the JSON snapshot of crypto market conditions, classify:
- regime: one of ["bullish","bearish","neutral","accumulation","distribution","high_volatility","low_volatility"]
- confidence: 0..100
- summary: 2-3 sentences in plain English
- recommendations: 3-5 concise bullet actions for strategy posture (e.g., risk per trade, number of concurrent positions, long/short bias)

Return ONLY valid JSON with keys: regime, confidence, summary, recommendations.

SNAPSHOT:
${JSON.stringify(snapshot)}
`;

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  try {
    const res = await client.chat.completions.create({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 600,
    });

    // Defensive parse
    const text = res.choices[0]?.message?.content || "{}";
    let parsed: any = {};
    try { 
      parsed = JSON.parse(text); 
    } catch { 
      parsed = {}; 
    }

    const row: InsertAiMarketAnalysis = {
      date: new Date().toISOString().slice(0, 10), // yyyy-mm-dd
      mode,
      regime: parsed.regime || "neutral",
      confidence: Number(parsed.confidence ?? 50),
      summary: parsed.summary || "Market context unavailable.",
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      snapshot,
    };

    await storage.upsertAiMarketAnalysisByDateMode(row);
    return row;
  } catch (error) {
    console.error(`[AI Market Analyzer] Error for ${mode} mode:`, error);
    
    // Return safe fallback analysis
    const fallbackRow: InsertAiMarketAnalysis = {
      date: new Date().toISOString().slice(0, 10),
      mode,
      regime: "neutral",
      confidence: 50,
      summary: "Market analysis temporarily unavailable due to API error.",
      recommendations: ["Monitor market conditions", "Maintain conservative position sizing"],
      snapshot,
    };
    
    await storage.upsertAiMarketAnalysisByDateMode(fallbackRow);
    return fallbackRow;
  }
}
