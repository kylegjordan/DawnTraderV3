/**
 * B-VTS-TELEMETRY-AGGREGATES (sprint row 4a, #1141) — the VTS win-rate store behind predictive confidence.
 *
 * Plan: Claude Comms and Packages/Scope Files/B_VTS_TELEMETRY_AGGREGATES_PRE_AUDIT.md (P1-P5; Langston Step 2, 2026-10-06).
 *   P1 — `getRegimePerformance` returns the strategy's own cell or null: the `SKIPPED` fallback is gone.
 *        MUTATION: put `|| regimeData['SKIPPED']` back and test 1 fails.
 *   P2 — each run REPLACES the store with what the 7-day window yields (it used to merge, so a quiet strategy kept its
 *        last win rate until the next restart). MUTATION: merge into the old store and test 2 fails.
 *   Residual — the no-data 0.5 fallback is counted, so how often confidence is made up is visible.
 *   P4 — the dead code is gone (fence).
 * The store reads `logs/` under `process.cwd()` at import, so cwd is pointed at a temp dir BEFORE the module loads.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = mkdtempSync(join(tmpdir(), 'b-vts-telemetry-'));
const EXEC = join(ROOT, 'logs', 'virtual_trades');
const SKIP = join(ROOT, 'logs', 'vts_skipped_signals');

let tel: typeof import('../../core/logging/vts-telemetry');
let sc: typeof import('../../core/utils/score-calculator');

beforeAll(async () => {
  mkdirSync(EXEC, { recursive: true });
  mkdirSync(SKIP, { recursive: true });
  writeFileSync(join(SKIP, 'skipped.json'), JSON.stringify([{ regime: 'R1', reason: 'Low_ROI' }]));
  vi.spyOn(process, 'cwd').mockReturnValue(ROOT);
  tel = await import('../../core/logging/vts-telemetry');
  sc = await import('../../core/utils/score-calculator');
});

function writeTrades(rows: Array<{ regime: string; strategy: string; netProfitPercent: number }>) {
  writeFileSync(join(EXEC, 'trades.json'), JSON.stringify(rows));
}

describe('B-VTS-TELEMETRY-AGGREGATES', () => {
  it('1 — P1: an absent strategy reads null even when a SKIPPED cell exists (no fallback to another cell)', () => {
    const store = tel.getVTSTelemetry();
    const saved = store.regimePerformance;
    store.regimePerformance = {
      R9: { SKIPPED: { source: 'VTS', winRate: 0.9, avgPnL: 1, skipRatio: 0, illiquidRatio: 0, tradeCount: 50, updatedAt: 'x' } },
    };
    try {
      expect(tel.getRegimePerformance('R9', 'some_strategy')).toBeNull();
      expect(tel.getRegimePerformance('R9', 'SKIPPED')?.winRate).toBe(0.9); // control: the lookup itself works
    } finally {
      store.regimePerformance = saved;
    }
  });

  it('2 — P2: a strategy with no trade in this run\'s window has no cell after the run (replace, not merge)', async () => {
    writeTrades([
      { regime: 'R1', strategy: 'sA', netProfitPercent: 1.0 },
      { regime: 'R1', strategy: 'sB', netProfitPercent: -1.0 },
    ]);
    const r1 = await tel.updateRegimePerformanceFromVTS();
    expect(r1.success).toBe(true);
    expect(tel.getRegimePerformance('R1', 'sA')?.winRate).toBe(1);
    expect(tel.getRegimePerformance('R1', 'sB')?.winRate).toBe(0);

    writeTrades([{ regime: 'R1', strategy: 'sA', netProfitPercent: 2.0 }]);
    const r2 = await tel.updateRegimePerformanceFromVTS();
    expect(r2.success).toBe(true);
    expect(tel.getRegimePerformance('R1', 'sA')?.tradeCount).toBe(1); // control: the present cell is rebuilt
    expect(tel.getRegimePerformance('R1', 'sB')).toBeNull();           // the quiet one is gone, not stale
  });

  it('3 — P2: an empty window leaves an empty store', async () => {
    writeTrades([]);
    await tel.updateRegimePerformanceFromVTS();
    expect(tel.getVTSTelemetry().regimePerformance).toEqual({});
  });

  it('4 — the no-data 0.5 fallback is counted; a served cell is counted separately', async () => {
    const before = sc.predictiveConfidenceFallbackCounts();
    expect(sc.getPredictiveConfidence('xstock_spot', 'ZZZ/USD', 'R_none', 'nothing_here')).toBe(0.5);
    writeTrades([{ regime: 'R2', strategy: 'sC', netProfitPercent: 1.0 }]);
    await tel.updateRegimePerformanceFromVTS();
    expect(sc.getPredictiveConfidence('xstock_spot', 'ZZZ/USD', 'R2', 'sC')).toBeGreaterThan(0.5);
    const after = sc.predictiveConfidenceFallbackCounts();
    expect(after.noDataFallback - before.noDataFallback).toBe(1);
    expect(after.served - before.served).toBe(1);
  });

  it('5 — P4: the dead code is gone from server/ (and expectancy_tuning is no longer prefetched)', () => {
    const files = {
      expectancy: '../../core/calculations/expectancy.ts',
      telemetry: '../../core/logging/vts-telemetry.ts',
      score: '../../core/utils/score-calculator.ts',
      vts: '../../services/vts-service.ts',
      warmup: '../../startup/b72-warmup.ts',
    };
    const text = Object.fromEntries(Object.entries(files).map(([k, f]) => [k, readFileSync(join(__dirname, f), 'utf8')]));
    expect(text.expectancy).not.toMatch(/function getAdjustedMinROI|function getAdaptiveExpectancy|function checkExpectancyDrift/);
    expect(text.telemetry).not.toMatch(/function checkConfidenceDrift|DRIFT_LOG_PATH|\|\| regimeData\['SKIPPED'\] \|\| null/);
    expect(text.score).not.toMatch(/function clearPredictiveConfidenceCache/);
    expect(text.vts).not.toMatch(/\bsimulateTrade\(signal/);
    expect(text.warmup).not.toMatch(/'expectancy_tuning'/);
    expect(text.warmup).toMatch(/'roi_gating'|'expectancy_gates'/); // control: the warm-up list itself is still read
    expect(existsSync(join(__dirname, files.expectancy))).toBe(true);
  });
});
