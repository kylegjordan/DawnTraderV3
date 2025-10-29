import express from "express";
import { db } from "../db";
import { lottieOversightLog, strategyMixLog } from "../../shared/schema";
import { desc } from "drizzle-orm";

const router = express.Router();

router.get("/api/system/health", async (_, res) => {
  try {
    const audits = await db
      .select({
        event: lottieOversightLog.event,
        status: lottieOversightLog.status,
        createdAt: lottieOversightLog.createdAt,
      })
      .from(lottieOversightLog)
      .orderBy(desc(lottieOversightLog.createdAt))
      .limit(3);

    const mix = await db
      .select({
        strategy: strategyMixLog.strategy,
        newWeight: strategyMixLog.newWeight,
        createdAt: strategyMixLog.createdAt,
      })
      .from(strategyMixLog)
      .orderBy(desc(strategyMixLog.createdAt))
      .limit(3);

    res.json({
      uptime: process.uptime(),
      lastAuditEvents: audits,
      lastStrategyRebalances: mix,
      status: "healthy",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[HealthEndpoint] Error:", error.message);
    res.status(500).json({
      uptime: process.uptime(),
      status: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
