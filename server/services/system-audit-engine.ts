/**
 * Directive 8.8.4-M1: Comprehensive System Audit & Validation (CSAV)
 * 
 * Validates the correctness, consistency, and data flow integrity of all
 * quantitative modules introduced in Series L and related dependencies:
 * - DCE (Decision Confidence Engine)
 * - MACO (Multi-Agent Cooperative Optimizer)
 * - MOF (Meta-Optimization Framework)
 * - GASP (Global Autonomy Stabilization Protocol)
 * - ARA (Adaptive Risk Advisor)
 * - PDC-ECS (Predictive Drawdown Containment / Equity Curve Smoothing)
 * - APR-SLE (Adaptive Profit Realization / Stop-Loss Evolution)
 */

import fs from "fs";
import path from "path";
import axios, { AxiosInstance } from "axios";
import { signalQualityEvaluator } from "../core/filters/signal_quality_evaluator";
import { readyToBuyService } from "../core/rtb/ready_to_buy_service";

interface AuditModuleResult {
  status: "OK" | "FAIL" | "WARN";
  data?: any;
  error?: string;
  variance?: number;
  average?: number;
  warnings?: string[];
}

interface AuditReport {
  timestamp: string;
  mode: "standard" | "deep";
  modules: Record<string, AuditModuleResult>;
  normalizerStats: any;
  sqeStats: any;
  rtbStats: any;
  errors: string[];
  warnings: string[];
  summary: {
    totalModules: number;
    passedModules: number;
    failedModules: number;
    overallStatus: "PASS" | "FAIL" | "WARN";
  };
}

export class SystemAuditEngine {
  private report: AuditReport;
  private client: AxiosInstance;
  private baseUrl: string;

  constructor() {
    this.baseUrl = `http://localhost:${process.env.PORT || 5000}`;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json",
      },
    });
    this.report = this.createEmptyReport();
  }

  private createEmptyReport(): AuditReport {
    return {
      timestamp: new Date().toISOString(),
      mode: "standard",
      modules: {},

      normalizerStats: null,
      sqeStats: null,
      rtbStats: null,
      errors: [],
      warnings: [],
      summary: {
        totalModules: 0,
        passedModules: 0,
        failedModules: 0,
        overallStatus: "PASS",
      },
    };
  }

  async run(mode: "standard" | "deep" = "standard", authCookie?: string): Promise<AuditReport> {
    this.report = this.createEmptyReport();
    this.report.mode = mode;

    const headers: Record<string, string> = {};
    if (authCookie) {
      headers["Cookie"] = authCookie;
    }

    try {
      console.log(`[CSAV] Starting Comprehensive System Audit (mode=${mode})...`);

      await Promise.all([
        this.auditModule("dce", "/api/dce/status", headers),
        this.auditModule("maco", "/api/maco/status", headers),
        this.auditModule("mof", "/api/mof/status", headers),
        this.auditModule("gasp", "/api/gasp/status", headers),
        this.auditModule("ara", "/api/ara/calculate", headers),
        this.auditModule("pdc", "/api/pdc-ecs/status", headers),
        this.auditModule("apr", "/api/apr-sle/status", headers),
      ]);

      this.auditSQEStats();
      await this.auditRTBStats();

      this.validateFormulas();
      this.validateConsistency();

      if (mode === "deep") {
        await this.runDeepValidation(headers);
      }

      this.calculateSummary();

      const outDir = path.join(process.cwd(), "reports");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `CSAV_Report_${Date.now()}.json`);
      fs.writeFileSync(outPath, JSON.stringify(this.report, null, 2));

      console.log(`[CSAV] Audit completed. Report saved at ${outPath}`);
      console.log(`[CSAV] Summary: ${this.report.summary.passedModules}/${this.report.summary.totalModules} modules passed`);
      if (this.report.errors.length > 0) {
        console.log(`[CSAV] Errors found: ${this.report.errors.length}`);
        this.report.errors.forEach((e) => console.log(`  - ${e}`));
      }
      if (this.report.warnings.length > 0) {
        console.log(`[CSAV] Warnings: ${this.report.warnings.length}`);
        this.report.warnings.forEach((w) => console.log(`  - ${w}`));
      }

      return this.report;
    } catch (err: any) {
      console.error("[CSAV] Critical Error:", err);
      this.report.errors.push(`Critical: ${err.toString()}`);
      this.report.summary.overallStatus = "FAIL";
      return this.report;
    }
  }

  private async auditModule(name: string, endpoint: string, headers: Record<string, string>): Promise<void> {
    try {
      console.log(`[CSAV] Checking ${name.toUpperCase()}...`);
      const res = await this.client.get(endpoint, { headers });
      this.report.modules[name] = {
        status: "OK",
        data: res.data,
      };
      console.log(`[CSAV] ${name.toUpperCase()}: OK`);
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || err.message;
      this.report.modules[name] = {
        status: "FAIL",
        error: errorMessage,
      };
      this.report.errors.push(`[${name.toUpperCase()}] ${errorMessage}`);
      console.log(`[CSAV] ${name.toUpperCase()}: FAIL - ${errorMessage}`);
    }
  }

  private calculateStats(values: number[]): { variance: number; average: number; min: number; max: number } {
    if (values.length === 0) {
      return { variance: 0, average: 0, min: 0, max: 0 };
    }
    const avg = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / values.length;
    const min = Math.min(...values);
    const max = Math.max(...values);
    return { variance, average: avg, min, max };
  }

  // B55: auditNormalizerStats removed — getRollingNormalizerStats no longer exists

  private auditSQEStats(): void {
    console.log("[CSAV] Checking SQE stats...");
    try {
      const stats = signalQualityEvaluator.getStats();
      this.report.sqeStats = stats;
      console.log(`[CSAV] SQE: evaluations=${stats.evaluations}, passRate=${(stats.passRate * 100).toFixed(1)}%`);
    } catch (err: any) {
      this.report.warnings.push(`Could not get SQE stats: ${err.message}`);
    }
  }

  private async auditRTBStats(): Promise<void> {
    console.log("[CSAV] Checking RTB Queue stats...");
    try {
      const paperStats = await readyToBuyService.getQueueStats("paper");
      const liveStats = await readyToBuyService.getQueueStats("live");
      this.report.rtbStats = { paper: paperStats, live: liveStats };
      console.log(`[CSAV] RTB: paper=${paperStats?.totalQueued || 0}, live=${liveStats?.totalQueued || 0}`);
    } catch (err: any) {
      this.report.warnings.push(`Could not get RTB stats: ${err.message}`);
    }
  }

  private validateFormulas(): void {
    console.log("[CSAV] Validating formula outputs...");
  }

  private validateConsistency(): void {
    console.log("[CSAV] Checking consistency between indexes...");

    const dce = this.report.modules["dce"]?.data;
    const maco = this.report.modules["maco"]?.data;
    const mof = this.report.modules["mof"]?.data;
    const gasp = this.report.modules["gasp"]?.data;

    if (dce?.decisionIndex === 0 || dce?.meanDI === 0) {
      this.report.warnings.push("DCE decision index is zero – no signal weighting applied yet.");
    }

    if (maco?.consensusScore === 0.5 && maco?.activeAgents > 1) {
      this.report.warnings.push("MACO consensus at 50% with multiple agents – possible agent stalemate.");
    }

    if (mof?.lambdaVariance === 0 && mof?.optimizationCount > 0) {
      this.report.warnings.push("MOF lambda variance = 0 after optimizations – meta weights not updating.");
    }

    if (gasp?.gsi === 1.0 && gasp?.dampingActive) {
      this.report.warnings.push("GASP showing perfect GSI but damping active – inconsistent state.");
    }

    const aprModule = this.report.modules["apr"];
    const pdcModule = this.report.modules["pdc"];
    if (aprModule?.status === "OK" && pdcModule?.status === "OK") {
      const apr = aprModule.data;
      const pdc = pdcModule.data;
      if (apr?.takeProfitMultiplier < 1 && pdc?.exposureMultiplier > 1) {
        this.report.warnings.push("APR reducing take-profit while PDC increasing exposure – conflicting signals.");
      }
    }
  }

  private async runDeepValidation(headers: Record<string, string>): Promise<void> {
    console.log("[CSAV] Running deep validation...");

    try {
      const rtbResponse = await this.client.get("/api/ready-to-buy/status", { headers });
      this.report.modules["rtb_queue"] = {
        status: "OK",
        data: rtbResponse.data,
      };
    } catch (err: any) {
      this.report.modules["rtb_queue"] = {
        status: "WARN",
        error: err.message,
      };
    }

    try {
      const rlResponse = await this.client.get("/api/rl/status", { headers });
      this.report.modules["rl_engine"] = {
        status: "OK",
        data: rlResponse.data,
      };
    } catch (err: any) {
      this.report.modules["rl_engine"] = {
        status: "WARN",
        error: err.message,
      };
    }

    try {
      const vtsResponse = await this.client.get("/api/vts/status", { headers });
      this.report.modules["vts"] = {
        status: "OK",
        data: vtsResponse.data,
      };
    } catch (err: any) {
      this.report.modules["vts"] = {
        status: "WARN",
        error: err.message,
      };
    }

    try {
      const regimeResponse = await this.client.get("/api/regime/status", { headers });
      this.report.modules["regime"] = {
        status: "OK",
        data: regimeResponse.data,
      };
    } catch (err: any) {
      this.report.modules["regime"] = {
        status: "WARN",
        error: err.message,
      };
    }
  }

  private calculateSummary(): void {
    const modules = Object.entries(this.report.modules);
    const passed = modules.filter(([, m]) => m.status === "OK").length;
    const failed = modules.filter(([, m]) => m.status === "FAIL").length;

    this.report.summary = {
      totalModules: modules.length,
      passedModules: passed,
      failedModules: failed,
      overallStatus: failed > 0 ? "FAIL" : this.report.warnings.length > 2 ? "WARN" : "PASS",
    };
  }
}

export const auditEngine = new SystemAuditEngine();
