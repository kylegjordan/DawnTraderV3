/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-5 AMR (Obj-14b / Pull-in C) — equity external macro feed (xstock_spot)
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The xStock-class counterpart of B67.1's crypto external-macro-feed: VIX +
 * dollar-index inputs for the AMR weather aggregator. Raw z-scores feed the
 * per-class weather rules (scope Obj-14a doctrine: NEVER a modifier output —
 * lateral reuse happens at the posture layer, not ranking).
 *
 * SOURCES (Langston-ratified 2026-06-11 on live probe evidence; Stooq
 * WITHDRAWN — its endpoints sit behind a JS proof-of-work wall; Yahoo +
 * AlphaVantage remain VETOED):
 *   VIX primary   — CBOE owner-official delayed-quote JSON (keyless):
 *                   https://cdn.cboe.com/api/global/delayed_quotes/quotes/_VIX.json
 *   VIX cross-chk — FRED VIXCLS via keyed API (FRED_API_KEY in staging .env,
 *                   CoinGecko-key precedent). Next-business-day publication:
 *                   compared on TRADE DATE with lag tolerance (R5) — an
 *                   unpublished date is PENDING, never a mismatch.
 *   DXY           — exact ICE formula computed from frankfurter.dev ECB daily
 *                   reference rates (keyless). Documented as ECB-DERIVED
 *                   ICE-FORMULA, not the licensed ICE feed (~tens of bps off
 *                   true DXY intraday — the 14:15-CET snapshot effect; the
 *                   DTWEXBGS sanity check is therefore DIRECTION-ONLY).
 *                   Fallback if frankfurter disappears: ECB eurofxref-daily.xml
 *                   (same upstream data, keyless).
 *
 * RATIFICATION CONDITIONS implemented here:
 *   1. CBOE SCHEMA GUARD — the exact consumed fields are validated each poll;
 *      drift fails LOUD (feed errored + health surfaced), never a silent
 *      fallback. Value drift is the FRED cross-check's job.
 *   2. VIX observations are keyed + DEDUPED on `last_trade_time` — pre-open
 *      polls return the prior session close and MUST NOT inflate the
 *      observation-denominated baselines.
 *   3. FRED not-yet-published = PENDING (cross-check skipped, no alert).
 *   4. ECB no-new-date days (weekends/TARGET holidays) = NO new observation,
 *      never a repeat.
 *   5. Divergence tolerance documented in amr_input_health rails
 *      (vix_divergence_max_points), never tuned tighter than the source.
 *
 * Z-BASELINES are denominated in DISTINCT OBSERVATIONS (scope Pull-in C
 * rider) — the ring buffers only grow when a genuinely new reading arrives.
 * State persists to /tmp (B67.1 pattern) so restarts do not zero the
 * baselines.
 *
 * All knobs DB-governed: module_constants `amr_external_equity` (§11).
 */

import * as fs from 'fs';
import { getCachedNumberRequired } from './module-constants-service.js';

const _EQ_KEY = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' } as const;
const STATE_FILE = '/tmp/amr-equity-feed-state.json';
const CBOE_VIX_URL = 'https://cdn.cboe.com/api/global/delayed_quotes/quotes/_VIX.json';
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR,JPY,GBP,CAD,SEK,CHF';
const FRED_VIXCLS_URL = 'https://api.stlouisfed.org/fred/series/observations?series_id=VIXCLS&file_type=json&sort_order=desc&limit=7';

// ICE dollar-index constant + weights (fixed by contract definition).
const DXY_CONSTANT = 50.14348112;

interface RingStats { count: number; mean: number; stdDev: number }

/** Observation-denominated rolling window (push only on DISTINCT readings). */
class ObservationWindow {
  private values: number[] = [];
  constructor(private maxObservations: number) {}
  /** A1 (Langston Step-4): window size is the DB knob, applied at start. */
  setMax(n: number): void {
    this.maxObservations = Math.max(30, Math.floor(n));
    while (this.values.length > this.maxObservations) this.values.shift();
  }
  push(v: number): void {
    this.values.push(v);
    if (this.values.length > this.maxObservations) this.values.shift();
  }
  stats(): RingStats {
    const n = this.values.length;
    if (n === 0) return { count: 0, mean: 0, stdDev: 0 };
    const mean = this.values.reduce((a, b) => a + b, 0) / n;
    const variance = this.values.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
    return { count: n, mean, stdDev: Math.sqrt(variance) };
  }
  dump(): number[] { return [...this.values]; }
  load(vs: number[]): void { this.values = vs.slice(-this.maxObservations); }
}

export interface EquityMacroSnapshot {
  /** Latest deduped VIX reading (CBOE delayed). null until first observation. */
  vix: number | null;
  /** z vs the observation-denominated rolling baseline; null below min obs. */
  vixZ: number | null;
  /** The CBOE last_trade_time the reading belongs to (dedupe key). */
  vixObservedAt: string | null;
  vixObservationCount: number;
  /** ECB-derived ICE-formula dollar index. null until first observation. */
  dxy: number | null;
  dxyZ: number | null;
  /** The ECB reference-rate date the DXY reading belongs to. */
  dxyEcbDate: string | null;
  dxyObservationCount: number;
  /** Seconds since the last successful poll of ANY source. */
  ageSeconds: number;
  /** True when one source is flowing and the other is not. */
  partialFeed: boolean;
  /** FRED cross-check state: ok | pending | divergent | disabled (no key). */
  fredCrossCheck: 'ok' | 'pending' | 'divergent' | 'disabled';
  /** Last CBOE-vs-FRED same-trade-date difference in VIX points (null = none yet). */
  fredDivergencePoints: number | null;
  /** Set when the CBOE schema guard tripped (structural drift — fail loud). */
  schemaGuardTripped: boolean;
}

interface FeedState {
  vix: number | null;
  vixObservedAt: string | null;        // last_trade_time dedupe key
  dxy: number | null;
  dxyEcbDate: string | null;           // ECB date dedupe key
  lastPollOkAt: number;
  schemaGuardTripped: boolean;
  fredCrossCheck: 'ok' | 'pending' | 'divergent' | 'disabled';
  fredDivergencePoints: number | null;
  /** CBOE close per trade date (yyyy-mm-dd) for the R5 trade-date comparison. */
  cboeCloseByTradeDate: Record<string, number>;
}

const state: FeedState = {
  vix: null, vixObservedAt: null, dxy: null, dxyEcbDate: null,
  lastPollOkAt: 0, schemaGuardTripped: false,
  fredCrossCheck: 'pending', fredDivergencePoints: null,
  cboeCloseByTradeDate: {},
};
const vixWindow = new ObservationWindow(2000);
const dxyWindow = new ObservationWindow(2000);
let pollTimer: NodeJS.Timeout | null = null;

function persistState(): void {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
      state, vixWindow: vixWindow.dump(), dxyWindow: dxyWindow.dump(),
    }));
  } catch { /* best-effort; baselines rebuild from observations */ }
}

function restoreState(): void {
  try {
    if (!fs.existsSync(STATE_FILE)) return;
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    Object.assign(state, raw.state ?? {});
    vixWindow.load(raw.vixWindow ?? []);
    dxyWindow.load(raw.dxyWindow ?? []);
    console.log(`[B-5][equity-feed] state restored: vixObs=${raw.vixWindow?.length ?? 0} dxyObs=${raw.dxyWindow?.length ?? 0}`);
  } catch (err) {
    console.warn('[B-5][equity-feed] state restore failed (clean start):', err instanceof Error ? err.message : err);
  }
}

/**
 * Condition 1 — CBOE schema guard. Validates EXACTLY the fields we consume;
 * returns null (and trips the guard flag) on structural drift. Never throws,
 * never silently substitutes.
 */
function parseCboeVix(payload: unknown): { price: number; lastTradeTime: string } | null {
  const p = payload as { data?: { current_price?: unknown; last_trade_time?: unknown } } | null;
  const price = p?.data?.current_price;
  const ltt = p?.data?.last_trade_time;
  if (typeof price !== 'number' || !Number.isFinite(price) || typeof ltt !== 'string' || ltt.length < 10) {
    return null;
  }
  return { price, lastTradeTime: ltt };
}

/** ICE formula over frankfurter USD-base rates (rates.EUR = EUR per USD, etc.). */
export function computeIceDxyFromUsdBaseRates(r: { EUR: number; JPY: number; GBP: number; CAD: number; SEK: number; CHF: number }): number {
  const eurusd = 1 / r.EUR;
  const gbpusd = 1 / r.GBP;
  return DXY_CONSTANT
    * Math.pow(eurusd, -0.576)
    * Math.pow(r.JPY, 0.136)
    * Math.pow(gbpusd, -0.119)
    * Math.pow(r.CAD, 0.091)
    * Math.pow(r.SEK, 0.042)
    * Math.pow(r.CHF, 0.036);
}

async function pollCboe(): Promise<void> {
  const res = await fetch(CBOE_VIX_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`CBOE HTTP ${res.status}`);
  const parsed = parseCboeVix(await res.json());
  if (!parsed) {
    if (!state.schemaGuardTripped) {
      // Fail LOUD once per trip — structural drift is an infrastructure event.
      console.error('[B-5][equity-feed][SCHEMA_GUARD] CBOE payload shape changed — VIX ingestion halted (no fallback by design). Inspect cdn.cboe.com response.');
    }
    state.schemaGuardTripped = true;
    return;
  }
  state.schemaGuardTripped = false;
  // Condition 2 — dedupe on last_trade_time: identical = NOT an observation.
  if (parsed.lastTradeTime !== state.vixObservedAt) {
    state.vix = parsed.price;
    state.vixObservedAt = parsed.lastTradeTime;
    vixWindow.push(parsed.price);
    // Track the running close per trade date for the R5 FRED comparison.
    const tradeDate = parsed.lastTradeTime.slice(0, 10);
    state.cboeCloseByTradeDate[tradeDate] = parsed.price;
    // bound the map (keep ~14 trade dates)
    const dates = Object.keys(state.cboeCloseByTradeDate).sort();
    while (dates.length > 14) delete state.cboeCloseByTradeDate[dates.shift()!];
  }
}

async function pollFrankfurter(): Promise<void> {
  const res = await fetch(FRANKFURTER_URL, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`frankfurter HTTP ${res.status}`);
  const body = await res.json() as { date?: string; rates?: Record<string, number> };
  const r = body?.rates;
  if (!body?.date || !r || !['EUR', 'JPY', 'GBP', 'CAD', 'SEK', 'CHF'].every(c => typeof r[c] === 'number' && r[c] > 0)) {
    throw new Error('frankfurter payload incomplete');
  }
  // Condition 4 — a repeated ECB date is NO observation (weekend/holiday).
  if (body.date !== state.dxyEcbDate) {
    state.dxy = computeIceDxyFromUsdBaseRates(r as { EUR: number; JPY: number; GBP: number; CAD: number; SEK: number; CHF: number });
    state.dxyEcbDate = body.date;
    dxyWindow.push(state.dxy);
  }
}

async function pollFredCrossCheck(): Promise<void> {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    state.fredCrossCheck = 'disabled';
    return;
  }
  const res = await fetch(`${FRED_VIXCLS_URL}&api_key=${apiKey}`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`FRED HTTP ${res.status}`);
  const body = await res.json() as { observations?: Array<{ date: string; value: string }> };
  const obs = (body.observations ?? []).filter(o => o.value !== '.');
  if (obs.length === 0) { state.fredCrossCheck = 'pending'; return; }
  // R5: compare on TRADE DATE. FRED publishes next business day — walk the
  // recent FRED observations and compare each against our CBOE close for the
  // SAME date when we hold one. Unmatched dates (we weren't running, or FRED
  // not yet published) are PENDING, never divergence.
  const tolerance = getCachedNumberRequired('amr_input_health', 'vix_divergence_max_points', _EQ_KEY);
  let compared = false;
  for (const o of obs) {
    const ours = state.cboeCloseByTradeDate[o.date];
    if (ours === undefined) continue;
    const fredV = parseFloat(o.value);
    if (!Number.isFinite(fredV)) continue;
    const diff = Math.abs(ours - fredV);
    state.fredDivergencePoints = diff;
    state.fredCrossCheck = diff > tolerance ? 'divergent' : 'ok';
    compared = true;
    break; // most recent comparable trade date is the decision point
  }
  if (!compared) state.fredCrossCheck = 'pending';
}

async function pollOnce(): Promise<void> {
  const results = await Promise.allSettled([pollCboe(), pollFrankfurter(), pollFredCrossCheck()]);
  const labels = ['cboe', 'frankfurter', 'fred'] as const;
  let anyOk = false;
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.warn(`[B-5][equity-feed] ${labels[i]} poll failed: ${r.reason instanceof Error ? r.reason.message : r.reason}`);
    } else {
      anyOk = true;
    }
  });
  if (anyOk) state.lastPollOkAt = Date.now();
  persistState();
}

export function startAmrEquityFeed(): void {
  if (pollTimer) return;
  restoreState();
  const pollSeconds = getCachedNumberRequired('amr_external_equity', 'poll_seconds', _EQ_KEY);
  // A1: the baseline window length is DB-governed (sec 11) — wire it, never
  // shadow it with a hardcoded cap.
  const zWindow = getCachedNumberRequired('amr_external_equity', 'z_baseline_observations', _EQ_KEY);
  vixWindow.setMax(zWindow);
  dxyWindow.setMax(zWindow);
  void pollOnce();
  pollTimer = setInterval(() => void pollOnce(), pollSeconds * 1000);
  pollTimer.unref?.();
  console.log(`[B-5][equity-feed] started (poll=${pollSeconds}s; CBOE VIX + ECB-formula DXY + FRED cross-check ${process.env.FRED_API_KEY ? 'keyed' : 'DISABLED (no FRED_API_KEY)'})`);
}

export function stopAmrEquityFeed(): void {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

export function getLatestEquitySnapshot(): EquityMacroSnapshot {
  const minObs = getCachedNumberRequired('amr_external_equity', 'min_observations_for_z', _EQ_KEY);
  const z = (v: number | null, w: ObservationWindow): number | null => {
    if (v === null) return null;
    const s = w.stats();
    if (s.count < minObs || s.stdDev === 0) return null;
    return (v - s.mean) / s.stdDev;
  };
  const vixStats = vixWindow.stats();
  const dxyStats = dxyWindow.stats();
  return {
    vix: state.vix,
    vixZ: z(state.vix, vixWindow),
    vixObservedAt: state.vixObservedAt,
    vixObservationCount: vixStats.count,
    dxy: state.dxy,
    dxyZ: z(state.dxy, dxyWindow),
    dxyEcbDate: state.dxyEcbDate,
    dxyObservationCount: dxyStats.count,
    ageSeconds: state.lastPollOkAt === 0 ? Infinity : (Date.now() - state.lastPollOkAt) / 1000,
    partialFeed: (state.vix === null) !== (state.dxy === null),
    fredCrossCheck: state.fredCrossCheck,
    fredDivergencePoints: state.fredDivergencePoints,
    schemaGuardTripped: state.schemaGuardTripped,
  };
}

/** Test-only full reset. */
export function _resetAmrEquityFeedForTests(): void {
  if (!process.env.VITEST && process.env.NODE_ENV !== 'test') {
    throw new Error('[B-5] _resetAmrEquityFeedForTests is test-only');
  }
  stopAmrEquityFeed();
  Object.assign(state, {
    vix: null, vixObservedAt: null, dxy: null, dxyEcbDate: null,
    lastPollOkAt: 0, schemaGuardTripped: false,
    fredCrossCheck: 'pending', fredDivergencePoints: null,
    cboeCloseByTradeDate: {},
  });
  vixWindow.load([]);
  dxyWindow.load([]);
}
