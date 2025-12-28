/**
 * Directive 8.8.4-M1: Audit API Routes
 * 
 * Provides endpoints for running comprehensive system audits
 * and retrieving audit reports.
 */

import express, { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { auditEngine } from "../services/system-audit-engine";

const router = express.Router();

/**
 * GET /api/audit/run
 * Run a comprehensive system audit
 * Query params:
 *   - mode: "standard" | "deep" (default: "standard")
 */
router.get("/run", async (req: Request, res: Response) => {
  try {
    const mode = (req.query.mode as "standard" | "deep") || "standard";
    const authCookie = req.headers.cookie;
    
    console.log(`[M1][AUDIT] Starting audit with mode=${mode}`);
    
    const report = await auditEngine.run(mode, authCookie);
    
    res.json({
      status: report.summary.overallStatus,
      report,
    });
  } catch (err: any) {
    console.error("[M1][AUDIT] Error running audit:", err);
    res.status(500).json({
      status: "FAIL",
      error: err.toString(),
    });
  }
});

/**
 * GET /api/audit/reports
 * List all available audit reports
 */
router.get("/reports", async (_req: Request, res: Response) => {
  try {
    const reportsDir = path.join(process.cwd(), "reports");
    
    if (!fs.existsSync(reportsDir)) {
      return res.json({ reports: [] });
    }
    
    const files = fs.readdirSync(reportsDir)
      .filter((f) => f.startsWith("CSAV_Report_") && f.endsWith(".json"))
      .sort()
      .reverse();
    
    const reports = files.map((filename) => {
      const filePath = path.join(reportsDir, filename);
      const stats = fs.statSync(filePath);
      const timestampMatch = filename.match(/CSAV_Report_(\d+)\.json/);
      const timestamp = timestampMatch ? parseInt(timestampMatch[1]) : 0;
      
      return {
        filename,
        timestamp,
        date: new Date(timestamp).toISOString(),
        size: stats.size,
      };
    });
    
    res.json({ reports });
  } catch (err: any) {
    console.error("[M1][AUDIT] Error listing reports:", err);
    res.status(500).json({ error: err.toString() });
  }
});

/**
 * GET /api/audit/reports/:filename
 * Get a specific audit report by filename
 */
router.get("/reports/:filename", async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    
    if (!filename.startsWith("CSAV_Report_") || !filename.endsWith(".json")) {
      return res.status(400).json({ error: "Invalid report filename" });
    }
    
    const filePath = path.join(process.cwd(), "reports", filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: "Report not found" });
    }
    
    const content = fs.readFileSync(filePath, "utf-8");
    const report = JSON.parse(content);
    
    res.json(report);
  } catch (err: any) {
    console.error("[M1][AUDIT] Error reading report:", err);
    res.status(500).json({ error: err.toString() });
  }
});

/**
 * GET /api/audit/latest
 * Get the most recent audit report
 */
router.get("/latest", async (_req: Request, res: Response) => {
  try {
    const reportsDir = path.join(process.cwd(), "reports");
    
    if (!fs.existsSync(reportsDir)) {
      return res.status(404).json({ error: "No reports available" });
    }
    
    const files = fs.readdirSync(reportsDir)
      .filter((f) => f.startsWith("CSAV_Report_") && f.endsWith(".json"))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      return res.status(404).json({ error: "No reports available" });
    }
    
    const latestFile = files[0];
    const filePath = path.join(reportsDir, latestFile);
    const content = fs.readFileSync(filePath, "utf-8");
    const report = JSON.parse(content);
    
    res.json({
      filename: latestFile,
      report,
    });
  } catch (err: any) {
    console.error("[M1][AUDIT] Error reading latest report:", err);
    res.status(500).json({ error: err.toString() });
  }
});

export default router;
