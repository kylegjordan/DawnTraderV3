import { db } from "../db";
import { 
  aiLessons, 
  conversationSummaries, 
  portfolioAdjustments, 
  filterCalibrationLog,
  semanticMemory,
  aiTransparencyLog,
  type AILesson,
  type ConversationSummary,
  type PortfolioAdjustment,
  type FilterCalibrationLog
} from "@shared/schema";
import { EmbeddingService } from "./embedding-service";
import { sql } from "drizzle-orm";

/**
 * Semantic Ingestion Task
 * Milestone 15: Feeds insights from learning systems into semantic memory
 * 
 * Runs every 6 hours to:
 * - Pull new records from ai_lessons, conversation_summaries, portfolio_adjustments, filter_calibration_log
 * - Generate embeddings using OpenAI text-embedding-3-small
 * - Insert into semantic_memory with appropriate tags
 * - Skip duplicates based on source_id
 * - Log to ai_transparency_log
 */

import type { ScheduledTask } from "./scheduler-registry";

export class SemanticIngestionTask implements Omit<ScheduledTask, 'lastRun' | 'nextRun' | 'status'> {
  name = "Semantic Ingestion";
  description = "Feeds learning insights into semantic memory via vector embeddings";
  frequency = "Every 6 hours";
  intervalMs = 6 * 60 * 60 * 1000; // 6 hours
  private embeddingService: EmbeddingService;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for semantic ingestion");
    }
    this.embeddingService = new EmbeddingService(apiKey);
  }

  /**
   * Main ingestion pipeline
   */
  async run(): Promise<void> {
    const startTime = Date.now();
    console.log("[SemanticIngestion] Starting semantic memory ingestion...");

    try {
      let totalIngested = 0;

      // Ingest from each source
      totalIngested += await this.ingestFromAILessons();
      totalIngested += await this.ingestFromConversationSummaries();
      totalIngested += await this.ingestFromPortfolioAdjustments();
      totalIngested += await this.ingestFromFilterCalibration();

      const duration = (Date.now() - startTime) / 1000;

      // Log to transparency
      await this.logToTransparency({
        recordCount: totalIngested,
        duration,
        success: true,
      });

      console.log(
        `[SemanticIngestion] Complete: ${totalIngested} records ingested in ${duration.toFixed(2)}s`
      );
    } catch (error) {
      const duration = (Date.now() - startTime) / 1000;
      console.error("[SemanticIngestion] Error during ingestion:", error);

      await this.logToTransparency({
        recordCount: 0,
        duration,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      });

      throw error;
    }
  }

  /**
   * Ingest from ai_lessons table
   */
  private async ingestFromAILessons(): Promise<number> {
    // Find lessons not yet in semantic_memory
    const lessons = await db
      .select()
      .from(aiLessons)
      .where(
        sql`NOT EXISTS (
          SELECT 1 FROM ${semanticMemory} 
          WHERE ${semanticMemory.sourceTable} = 'ai_lessons' 
          AND ${semanticMemory.sourceId} = ${aiLessons.id}
        )`
      );

    if (lessons.length === 0) {
      return 0;
    }

    const contents = lessons.map((lesson: AILesson) => {
      const parts = [lesson.lesson];
      if (lesson.symbol) parts.push(`Symbol: ${lesson.symbol}`);
      if (lesson.strategy) parts.push(`Strategy: ${lesson.strategy}`);
      return parts.join(" | ");
    });

    const embeddings = await this.embeddingService.generateEmbeddings(contents);

    let ingested = 0;
    for (let i = 0; i < lessons.length; i++) {
      const lesson = lessons[i];
      const tags = [
        lesson.mode,
        lesson.strategy || "general",
        "learning",
      ].filter(Boolean) as string[];

      try {
        await db.insert(semanticMemory).values({
          embedding: embeddings[i],
          content: contents[i],
          sourceTable: "ai_lessons",
          sourceId: lesson.id,
          tags,
          relevance: lesson.confidence ? (parseFloat(lesson.confidence) / 100).toFixed(2) : "0.50",
        });
        ingested++;
      } catch (error) {
        // Skip duplicates (unique constraint on source_table + source_id)
        if ((error as any).code === "23505") {
          continue;
        }
        throw error;
      }
    }

    console.log(`[SemanticIngestion] Ingested ${ingested} AI lessons`);
    return ingested;
  }

  /**
   * Ingest from conversation_summaries table
   */
  private async ingestFromConversationSummaries(): Promise<number> {
    // Find summaries not yet in semantic_memory
    const summaries = await db
      .select()
      .from(conversationSummaries)
      .where(
        sql`NOT EXISTS (
          SELECT 1 FROM ${semanticMemory} 
          WHERE ${semanticMemory.sourceTable} = 'conversation_summaries' 
          AND ${semanticMemory.sourceId} = ${conversationSummaries.id}
        )`
      );

    if (summaries.length === 0) {
      return 0;
    }

    const contents = summaries.map((summary: ConversationSummary) => {
      const parts = [summary.summaryText];
      if (summary.keyDecisions) parts.push(`Decisions: ${JSON.stringify(summary.keyDecisions)}`);
      if (summary.userPreferences) parts.push(`Preferences: ${JSON.stringify(summary.userPreferences)}`);
      return parts.join(" | ");
    });

    const embeddings = await this.embeddingService.generateEmbeddings(contents);

    let ingested = 0;
    for (let i = 0; i < summaries.length; i++) {
      const summary = summaries[i];
      const tags = ["conversation", "user-context"];

      try {
        await db.insert(semanticMemory).values({
          embedding: embeddings[i],
          content: contents[i],
          sourceTable: "conversation_summaries",
          sourceId: summary.id,
          tags,
          relevance: "0.60",
        });
        ingested++;
      } catch (error) {
        if ((error as any).code === "23505") continue;
        throw error;
      }
    }

    console.log(`[SemanticIngestion] Ingested ${ingested} conversation summaries`);
    return ingested;
  }

  /**
   * Ingest from portfolio_adjustments table
   */
  private async ingestFromPortfolioAdjustments(): Promise<number> {
    // Find adjustments not yet in semantic_memory
    const adjustments = await db
      .select()
      .from(portfolioAdjustments)
      .where(
        sql`NOT EXISTS (
          SELECT 1 FROM ${semanticMemory} 
          WHERE ${semanticMemory.sourceTable} = 'portfolio_adjustments' 
          AND ${semanticMemory.sourceId} = ${portfolioAdjustments.id}
        )`
      );

    if (adjustments.length === 0) {
      return 0;
    }

    const contents = adjustments.map((adj: PortfolioAdjustment) => {
      const parts = [adj.adjustmentType];
      if (adj.parameter) parts.push(`Parameter: ${adj.parameter}`);
      if (adj.previousValue && adj.newValue) {
        parts.push(`Changed from ${adj.previousValue} to ${adj.newValue}`);
      }
      if (adj.reason) parts.push(adj.reason);
      return parts.join(" | ");
    });

    const embeddings = await this.embeddingService.generateEmbeddings(contents);

    let ingested = 0;
    for (let i = 0; i < adjustments.length; i++) {
      const adj = adjustments[i];
      const tags = [
        adj.mode,
        "portfolio",
        "adjustment",
        adj.adjustmentType,
      ].filter(Boolean) as string[];

      try {
        await db.insert(semanticMemory).values({
          embedding: embeddings[i],
          content: contents[i],
          sourceTable: "portfolio_adjustments",
          sourceId: adj.id,
          tags,
          relevance: "0.70",
        });
        ingested++;
      } catch (error) {
        if ((error as any).code === "23505") continue;
        throw error;
      }
    }

    console.log(`[SemanticIngestion] Ingested ${ingested} portfolio adjustments`);
    return ingested;
  }

  /**
   * Ingest from filter_calibration_log table
   */
  private async ingestFromFilterCalibration(): Promise<number> {
    // Find calibrations not yet in semantic_memory
    const calibrations = await db
      .select()
      .from(filterCalibrationLog)
      .where(
        sql`NOT EXISTS (
          SELECT 1 FROM ${semanticMemory} 
          WHERE ${semanticMemory.sourceTable} = 'filter_calibration_log' 
          AND ${semanticMemory.sourceId} = ${filterCalibrationLog.id}
        )`
      );

    if (calibrations.length === 0) {
      return 0;
    }

    const contents = calibrations.map((cal: FilterCalibrationLog) => {
      const parts = [];
      if (cal.minVolume) parts.push(`MinVolume: ${cal.minVolume}`);
      if (cal.minPrice) parts.push(`MinPrice: ${cal.minPrice}`);
      if (cal.maxPrice) parts.push(`MaxPrice: ${cal.maxPrice}`);
      if (cal.minMarketCap) parts.push(`MinMarketCap: ${cal.minMarketCap}`);
      if (cal.maxBidAskSpread) parts.push(`MaxSpread: ${cal.maxBidAskSpread}`);
      if (cal.reason) parts.push(`Reason: ${cal.reason}`);
      if (cal.source) parts.push(`Source: ${cal.source}`);
      return parts.join(" | ");
    });

    const embeddings = await this.embeddingService.generateEmbeddings(contents);

    let ingested = 0;
    for (let i = 0; i < calibrations.length; i++) {
      const cal = calibrations[i];
      const tags = [
        cal.mode,
        "calibration",
        "filter",
        cal.source || "system",
      ].filter(Boolean) as string[];

      try {
        await db.insert(semanticMemory).values({
          embedding: embeddings[i],
          content: contents[i],
          sourceTable: "filter_calibration_log",
          sourceId: cal.id,
          tags,
          relevance: "0.65",
        });
        ingested++;
      } catch (error) {
        if ((error as any).code === "23505") continue;
        throw error;
      }
    }

    console.log(`[SemanticIngestion] Ingested ${ingested} filter calibrations`);
    return ingested;
  }

  /**
   * Log to AI transparency
   */
  private async logToTransparency(details: any): Promise<void> {
    try {
      await db.insert(aiTransparencyLog).values({
        taskName: "semantic-ingestion",
        success: details.success,
        duration: details.duration?.toString(),
        resultSummary: `Ingested ${details.recordCount} records`,
        notes: details.error || null,
      });
    } catch (error) {
      console.error("[SemanticIngestion] Error logging to transparency:", error);
    }
  }
}

// Export singleton instance
export const semanticIngestionTask = new SemanticIngestionTask();
