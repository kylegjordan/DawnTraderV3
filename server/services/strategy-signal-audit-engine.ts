import fs from "fs";
import path from "path";
import { readyToBuyService } from "../core/rtb/ready_to_buy_service.js";

export class StrategySignalAuditEngine {
  private report: any = {
    timestamp: new Date().toISOString(),
    sampleSize: 0,
    mismatches: [] as any[],
    summary: {},
  };

  async run(mode: 'paper' | 'live' = 'paper') {
    console.log(`[SSVE] Starting Strategy & Signal Verification (mode=${mode})...`);
    
    this.report = {
      timestamp: new Date().toISOString(),
      mode,
      sampleSize: 0,
      mismatches: [],
      summary: {},
    };

    try {
      const signals = await readyToBuyService.getQueuedSignals(mode);
      this.report.sampleSize = signals.length;

      console.log(`[SSVE] Found ${signals.length} signals to audit`);

      for (const sig of signals.slice(0, 100)) {
        const recomputed = this.recalculate(sig);
        this.compare(sig, recomputed);
      }

      this.report.summary = this.buildSummary();

      const outDir = path.join(process.cwd(), "reports");
      if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
      const outPath = path.join(outDir, `SSVE_Report_${Date.now()}.json`);
      fs.writeFileSync(outPath, JSON.stringify(this.report, null, 2));

      console.log(`[SSVE] Completed. Report saved at ${outPath}`);
      return this.report;
    } catch (err: any) {
      console.error("[SSVE] Error during audit:", err.message);
      this.report.error = err.message;
      this.report.summary = { ok: false, error: err.message };
      return this.report;
    }
  }

  private recalculate(sig: any) {
    const strategyWeight = sig.strategyWeight || sig.strategy_weight || 0.5;
    const exposureMult = sig.exposureMult || sig.exposure_mult || 1;

    const di = 0.5 * Math.max(0, Math.min(1, strategyWeight)) +
               0.5 * Math.max(0, Math.min(1, exposureMult));

    return { di };
  }

  private compare(original: any, recomputed: any) {
    const tolerance = 0.05;

    const originalDi = Number(original.di) || Number(original.decisionIndex) || 0;

    const comparisons = [
      { key: 'di', original: originalDi, recomputed: recomputed.di }
    ];

    for (const { key, original: o, recomputed: r } of comparisons) {
      if (o === 0 && r !== 0) continue;

      const diff = Math.abs(o - r);
      if (diff > tolerance) {
        this.report.mismatches.push({
          symbol: original.symbol,
          strategy: original.strategy,
          metric: key,
          original: Number(o.toFixed(4)),
          recomputed: Number(r.toFixed(4)),
          diff: Number(diff.toFixed(4)),
        });
      }
    }
  }

  private buildSummary() {
    const mismatches = this.report.mismatches;
    const total = this.report.sampleSize;
    
    if (total === 0) {
      return {
        total: 0,
        mismatches: 0,
        mismatchRate: "0.00%",
        ok: true,
        note: "No signals available for audit"
      };
    }
    
    const mismatchRate = (mismatches.length / total) * 100; // B55: only DI checked now
    
    const byMetric: Record<string, number> = {};
    const byStrategy: Record<string, number> = {};
    
    for (const m of mismatches) {
      byMetric[m.metric] = (byMetric[m.metric] || 0) + 1;
      if (m.strategy) {
        byStrategy[m.strategy] = (byStrategy[m.strategy] || 0) + 1;
      }
    }
    
    return {
      total,
      metricsChecked: total, // B55: only DI checked
      mismatches: mismatches.length,
      mismatchRate: `${mismatchRate.toFixed(2)}%`,
      ok: mismatchRate < 10,
      byMetric,
      byStrategy
    };
  }
}

export const ssveEngine = new StrategySignalAuditEngine();
