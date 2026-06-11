/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-5 AMR (Obj-0a) — XstockFrictionSample store
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * THE per-class measured-friction source for xstock_spot. Captures the
 * scanner's per-cycle MEASURED spread + depth (the `tickerEnrichmentBySymbol`
 * + `depthBySymbol` ephemeral maps, scanner.ts ~:638-692) which were
 * previously computed every 30s cycle, used once by the max-spread filter
 * gate, then discarded.
 *
 * Why this store exists (pre-audit v2 §0.1 + §3.1, Langston-ratified):
 *   - The activeFilterPool has THREE write surfaces, ALL crypto-only — the
 *     B-4.7 per-class friction read pointed xstock at a source with no
 *     members (0 of 983 live readings sampled; RUNNING_ISSUES entry at B-5
 *     governance). This store is BOTH the membership and the metrics source
 *     for xstock friction (F7) — it bypasses the crypto-only cost caches
 *     entirely.
 *   - Obj-12 (Pull-in A): the xstock COST MODEL reads per-symbol measured
 *     spread from here (fallback static + reason + spread-source stamp).
 *   - The AMR weather aggregator reads the per-class aggregate + trend.
 *
 * Reason-coded absence (Kyle ruling 2026-06-11 — low-volume ≠ shutdown):
 *   NO_SOURCE        — store never received a cycle write (error-grade after
 *                      this batch; should not occur once the scanner hook is
 *                      live).
 *   MARKET_CLOSED    — isXstockMarketOpenUTC() false (weekend window). The
 *                      ONLY legitimate "off" state; xStocks trade 24/5.
 *   LOW_VOLUME_THIN  — market open, source wired, but fewer than the
 *                      DB-tunable minimum names carry fresh two-sided
 *                      measurements (genuine overnight-thin case).
 *   WARMING          — post-boot/post-idle fill, quantified n=k/N (Langston
 *                      C1: every restart zeroes in-memory state; the flip
 *                      read must know how warm the input was).
 *
 * All adjustables are DB-resolved per scope §11 (module_constants module
 * `amr_friction_sample`, per-class rows) — no hardcoded thresholds. Keys are
 * seeded by the B-5 migration; getCachedNumberRequired fail-hards if absent
 * (ships in the same deploy as the migration; tests seed via the vitest
 * helper per the B-4.5 pattern).
 *
 * Singleton, in-memory, cycle-driven (no own timer — the scanner cycle is
 * the clock). Not persisted: rebuilds within one 30s cycle after restart,
 * and WARMING is reported honestly while it does.
 */

import { getCachedNumberRequired } from '../../services/module-constants-service.js';
import { isXstockMarketOpenUTC } from './market-hours.js';

const _FS_KEY = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' } as const;

export interface XstockFrictionSnapshot {
  symbol: string;
  /** Measured bid/ask spread, PERCENT form (0.1 = 0.1%). -1 = no valid two-sided quote this cycle. */
  bidAskSpreadPct: number;
  /** Rolling-median top-of-book depth (USD), entry side. -1 sentinel. */
  askDepthUsd: number;
  /** Rolling-median top-of-book depth (USD), exit side. -1 sentinel. */
  bidDepthUsd: number;
  /** Wall-clock of the scanner cycle that captured this sample. */
  capturedAt: number;
}

export type XstockFrictionSampleStatus =
  | { kind: 'OK'; sampleCount: number }
  | { kind: 'NO_SOURCE' }
  | { kind: 'MARKET_CLOSED' }
  | { kind: 'LOW_VOLUME_THIN'; sampleCount: number; minRequired: number }
  | { kind: 'WARMING'; cyclesSeen: number; cyclesRequired: number };

export interface XstockFrictionSampleRead {
  status: XstockFrictionSampleStatus;
  /** Per-symbol fresh samples (only symbols with a valid spread this window). */
  samples: ReadonlyMap<string, XstockFrictionSnapshot>;
  /** Median measured spread (percent form) across fresh valid samples; null unless status OK. */
  p50SpreadPct: number | null;
  /** 95th percentile spread (percent form); null unless status OK. */
  p95SpreadPct: number | null;
  lastCycleAt: number | null;
}

// ─── Module state ────────────────────────────────────────────────────────────
const samplesBySymbol = new Map<string, XstockFrictionSnapshot>();
let lastCycleAt: number | null = null;
let cyclesSinceReset = 0; // boot or post-idle resume

function freshnessWindowMs(): number {
  return getCachedNumberRequired('amr_friction_sample', 'freshness_window_seconds', _FS_KEY) * 1000;
}
function minFreshNames(): number {
  return getCachedNumberRequired('amr_friction_sample', 'min_fresh_names', _FS_KEY);
}
function warmupCycles(): number {
  return getCachedNumberRequired('amr_friction_sample', 'warmup_cycles', _FS_KEY);
}

/**
 * Scanner-cycle capture hook. Called once per xstock scan cycle with the
 * cycle's ephemeral measurement maps (same objects the eval fan-out uses —
 * read-only here, copied into snapshots).
 */
export function recordXstockFrictionCycle(
  tickerEnrichmentBySymbol: ReadonlyMap<string, { bidAskSpreadPct: number; volume24hShares: number }>,
  depthBySymbol: ReadonlyMap<string, { askDepthUsd: number; bidDepthUsd: number }>,
  now: number = Date.now(),
): void {
  for (const [symbol, tick] of tickerEnrichmentBySymbol) {
    const depth = depthBySymbol.get(symbol);
    samplesBySymbol.set(symbol, {
      symbol,
      bidAskSpreadPct: tick.bidAskSpreadPct,
      askDepthUsd: depth?.askDepthUsd ?? -1,
      bidDepthUsd: depth?.bidDepthUsd ?? -1,
      capturedAt: now,
    });
  }
  lastCycleAt = now;
  cyclesSinceReset++;
}

/** Idle-boundary re-seed (weekend resume): counts restart as a fresh warmup. */
export function resetXstockFrictionWarmup(): void {
  cyclesSinceReset = 0;
}

/**
 * Per-symbol measured spread for the COST MODEL (Obj-12 / Pull-in A).
 * Returns DECIMAL spread (0.0012 = 12 bps) when a fresh valid measurement
 * exists; null otherwise (caller falls back to the static default and stamps
 * spread-source accordingly).
 */
export function getMeasuredSpreadDecimal(symbol: string, now: number = Date.now()): number | null {
  const s = samplesBySymbol.get(symbol);
  if (!s) return null;
  if (now - s.capturedAt > freshnessWindowMs()) return null;
  if (!(s.bidAskSpreadPct >= 0)) return null; // -1 sentinel / NaN guard
  return s.bidAskSpreadPct / 100;
}

/**
 * Per-class aggregate read for the friction gauge + AMR weather aggregator.
 * Reason-coded per Kyle's ruling — absence is NEVER ambiguous.
 */
export function getXstockFrictionSample(now: number = Date.now()): XstockFrictionSampleRead {
  // MARKET_CLOSED keys off the SAME predicate the scanner/SQE use — never
  // off sample-absence (pre-audit v2 §1).
  if (!isXstockMarketOpenUTC('SPY/USD', new Date(now))) {
    return { status: { kind: 'MARKET_CLOSED' }, samples: new Map(), p50SpreadPct: null, p95SpreadPct: null, lastCycleAt };
  }
  if (lastCycleAt === null) {
    return { status: { kind: 'NO_SOURCE' }, samples: new Map(), p50SpreadPct: null, p95SpreadPct: null, lastCycleAt: null };
  }
  const required = warmupCycles();
  if (cyclesSinceReset < required) {
    return {
      status: { kind: 'WARMING', cyclesSeen: cyclesSinceReset, cyclesRequired: required },
      samples: new Map(), p50SpreadPct: null, p95SpreadPct: null, lastCycleAt,
    };
  }
  const windowMs = freshnessWindowMs();
  const fresh = new Map<string, XstockFrictionSnapshot>();
  const spreads: number[] = [];
  for (const [symbol, s] of samplesBySymbol) {
    if (now - s.capturedAt <= windowMs && s.bidAskSpreadPct >= 0) {
      fresh.set(symbol, s);
      spreads.push(s.bidAskSpreadPct);
    }
  }
  const min = minFreshNames();
  if (fresh.size < min) {
    return {
      status: { kind: 'LOW_VOLUME_THIN', sampleCount: fresh.size, minRequired: min },
      samples: fresh, p50SpreadPct: null, p95SpreadPct: null, lastCycleAt,
    };
  }
  spreads.sort((a, b) => a - b);
  const q = (p: number) => spreads[Math.min(spreads.length - 1, Math.floor(p * spreads.length))];
  return {
    status: { kind: 'OK', sampleCount: fresh.size },
    samples: fresh,
    p50SpreadPct: q(0.5),
    p95SpreadPct: q(0.95),
    lastCycleAt,
  };
}

/** Vitest-only state reset (worker-shared singleton — the B-4.7 pattern). */
export function _resetXstockFrictionStoreForTests(): void {
  if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
    throw new Error('[B-5] _resetXstockFrictionStoreForTests is test-only');
  }
  samplesBySymbol.clear();
  lastCycleAt = null;
  cyclesSinceReset = 0;
}
