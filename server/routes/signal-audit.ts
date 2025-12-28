import express from "express";
import { ssveEngine } from "../services/strategy-signal-audit-engine.js";
import fs from "fs";
import path from "path";

const router = express.Router();

router.get("/run", async (req, res) => {
  try {
    const mode = (req.query.mode as 'paper' | 'live') || 'paper';
    console.log(`[M2][SSVE] Running signal verification audit (mode=${mode})...`);
    const report = await ssveEngine.run(mode);
    res.json({ status: report.summary?.ok ? "OK" : "FAIL", report });
  } catch (err: any) {
    console.error("[M2][SSVE] Audit error:", err);
    res.status(500).json({ status: "FAIL", error: err.toString() });
  }
});

router.get("/reports", async (_req, res) => {
  try {
    const reportsDir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(reportsDir)) {
      return res.json({ reports: [] });
    }
    
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith("SSVE_Report_") && f.endsWith(".json"))
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 20);
    
    res.json({ reports: files });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/latest", async (_req, res) => {
  try {
    const reportsDir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(reportsDir)) {
      return res.status(404).json({ error: "No reports found" });
    }
    
    const files = fs.readdirSync(reportsDir)
      .filter(f => f.startsWith("SSVE_Report_") && f.endsWith(".json"))
      .sort((a, b) => b.localeCompare(a));
    
    if (files.length === 0) {
      return res.status(404).json({ error: "No SSVE reports found" });
    }
    
    const latestPath = path.join(reportsDir, files[0]);
    const content = JSON.parse(fs.readFileSync(latestPath, "utf-8"));
    res.json({ filename: files[0], report: content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
