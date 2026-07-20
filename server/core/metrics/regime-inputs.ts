/**
 * regime-inputs — the SINGLE source of the two RegimeWeight inputs, read LIVE from the MCE.
 *
 * ═══ WHY THIS EXISTS (B-REGIME-INPUTS-LIVE, 2026-07-19; RUNNING_ISSUES #543 + #538) ═══
 * The RegimeWeight admission gate — one of only TWO gates that can reject a signal on the
 * active path — had NO REACHABLE REJECT PATH, because BOTH of its inputs were constants:
 *
 *   calculateRegimeWeight = trendScore×0.70 + (1 − min(1,volatility))×0.30, clamped [0.1,1]
 *
 *   • `volatility`   → `market-metrics.getNormalizedVolatility()` returned a hardcoded
 *                      `0.015` because its ONLY cache writer (`updateVolatilityData`) has
 *                      ZERO production callers. The cache is never filled, so the fallback
 *                      fired 100% of the time — SILENTLY, no log, no alarm (#543).
 *   • `trendStrength`→ hardcoded `0.5`, never set at all (#538). Absent from every queued
 *                      row: `COUNT(metadata->>'trendStrength') = 0` across 21/21.
 *
 * ⇒ output pinned at 0.6455 forever, against a floor of 0.3000 ⇒ 0.6455 < 0.30 is NEVER
 * true ⇒ the gate has never rejected anything and structurally could not.
 *
 * ★ IT WAS NEVER A BROKEN CAPABILITY — it works correctly on the VTS path, fed by the MCE:
 * 16,183 trades (2026-05-10→07-19) carry 9,041 DISTINCT regimeWeight values spanning
 * 0.0000–1.0000, of which 41.11% fall BELOW the floor. The ACTIVE path was simply never
 * re-pointed at the MCE when the MCE became the market-context source (rule-24 outcome 3).
 * So this module ROUTES; it does not compute, and it must never grow a computation.
 *
 * ⚠️ DO NOT "FIX" THIS BY RESURRECTING `updateVolatilityData`. That would build a SECOND
 * volatility source beside the MCE. It is the wrong repair and it is what the first
 * (outcome-1) reading of the defect would have produced.
 *
 * ═══ THE FAIL-LOUD CONTRACT (OBJ-3; Kyle's standing rule, CLAUDE.md §11) ═══
 * "We're not supposed to be using any fallback numbers… when things aren't happening right,
 * we're supposed to call it out and learn what's going on, why we have to use a fallback."
 * The `0.015` was NEVER a chosen default — it was the FAILURE MODE of an unfilled cache,
 * returned silently. Had it failed loud on the first miss, this surfaces on day one instead
 * of after months. So: this module returns `null` on a miss and NEVER substitutes. Callers
 * MUST reject the signal. There is no default here, by design — adding one re-creates the
 * exact defect this module was written to remove.
 */
import { getMarketContextEngine } from '../../services/market-context-engine.js';
import type { AssetClass } from '../../../shared/asset-classes.js';
import type { OHLCData } from '../../types/market-regime.types.js';

export interface RegimeInputs {
  /** LIVE volatility from the MCE's calculatePairRegime (NOT the orphaned market-metrics cache). */
  volatility: number;
  /** Derived from the MCE's live ADX — see ADX_TREND_DIVISOR for the provisional mapping. */
  trendStrength: number;
  /** Raw ADX, carried for telemetry + the Phase-25 curve calibration. */
  adx: number;
}

/**
 * ⚠️ PROVISIONAL — Langston-ruled interim (Q1, 2026-07-19), NOT a calibrated constant.
 *
 * ADX is 0–100; `trendStrength` is 0–1. The curve between them is a MODELLING choice, and
 * picking one silently would replace an unexplained constant (#538's 0.5) with an
 * unexplained formula — the same disease in better clothes. Langston ruled: ship an interim
 * NOW rather than defer, because OBJ-0 forbids a gate live on volatility and still pinned on
 * trend (that is the "looks-alive-can't-reject" failure, which is WORSE than honest deadness
 * because it ends the search).
 *
 * The interim is ANCHORED, not arbitrary: linear, monotonic, bounded, with the conventional
 * ADX-25 "trending" threshold landing at 0.5 and ADX-50 (strong trend) at 1.0.
 *
 * ★ CALIBRATION IS HOMED TO PHASE-25, beside the 0.30 floor, with the SAME treatment: measure
 * the real ADX distribution FIRST, then set the curve on evidence. Note the floor itself has
 * no derivation either — it was dictated verbatim by Directive 11.0B (≈2026-01-07) as a given
 * constant inside a STRUCTURAL change, with zero justification recorded. Neither number has
 * anything behind it worth preserving; both get set first-time-on-evidence.
 */
export const ADX_TREND_DIVISOR = 50;

/** Reason a read failed — carried into the alert/telemetry so a miss is never silent. */
export type RegimeInputsMiss = 'mce_context_absent' | 'mce_raw_absent' | 'non_finite';

export interface RegimeInputsResult {
  inputs: RegimeInputs | null;
  miss: RegimeInputsMiss | null;
}

/**
 * Read the live regime inputs for a symbol. Returns `{inputs:null, miss:<reason>}` when the
 * MCE has nothing usable — NEVER a substituted value.
 *
 * Cheap by construction: `getCachedContext` is a pure map lookup that returns null past the
 * entry's TTL. No recompute, no I/O. Safe to call at every site rather than threading a
 * value through — which is REQUIRED here, because the orchestrator's existing `mceCtx` local
 * (`signal-orchestrator.ts:611`) is block-scoped inside a 3-line try and is NOT in scope at
 * the SQEInput build sites (Langston Step-1 flag 1; CC-A's scope claimed otherwise and was
 * wrong).
 *
 * ⚠️ NO try/catch SWALLOW HERE. The site we route through (`:613`) is
 * `} catch { /* MCE not ready *\/ }` — and per Langston that catch was ITSELF installed to fix
 * an EARLIER silent-swallow at the same spot, so this shape has already burned us once here.
 * A genuine throw from the engine must propagate to the caller's fail-loud path, not be
 * converted into a quiet miss that looks like a cold symbol.
 */
export function readRegimeInputs(symbol: string, assetClass: AssetClass): RegimeInputsResult {
  const ctx = getMarketContextEngine().getCachedContext(symbol, assetClass);
  if (!ctx) return { inputs: null, miss: 'mce_context_absent' };

  const raw = ctx.raw;
  if (!raw) return { inputs: null, miss: 'mce_raw_absent' };

  const { volatility, adx } = raw;
  if (!Number.isFinite(volatility) || !Number.isFinite(adx)) {
    return { inputs: null, miss: 'non_finite' };
  }

  return {
    inputs: {
      volatility,
      trendStrength: Math.min(1, Math.max(0, adx / ADX_TREND_DIVISOR)),
      adx,
    },
    miss: null,
  };
}

/**
 * B-REGIME-REFRESH-PIPE (2026-07-21) — FRESH regime inputs for the RTB REFRESH path.
 *
 * `readRegimeInputs` (above) is a pure cache-router: it hits the MCE's survivor-populated
 * context cache. But queued pairs are DELIBERATELY excluded from the FX5 survivor set
 * (market-scanner.ts:773 — don't re-signal an already-queued/traded pair), so that cache is
 * cold for them (54/55 miss live post-6d22a9b63). This function is the refresh's OWN compute
 * path: it fetches fresh 60m bars for the queued pair, carries the queue-time DBS, and computes
 * vol/adx via the MCE's PURE `computeRegimeInputsOnly` (zero side-effects — no phase-tick, no
 * cache write, no DBS-store write, no telemetry, no archive; see that method's docstring).
 *
 * Returns the SAME `RegimeInputsResult` shape as `readRegimeInputs` so the refresh's downstream
 * is unchanged. Async because the OHLC fetch is async. Fail-loud preserved: any miss (fetch
 * fails / sparse bars / cold engine) → `{inputs:null}` and the caller MUST reject — never
 * substitute (#546).
 */
export async function computeRefreshRegimeInputs(
  symbol: string,
  assetClass: AssetClass,
  dbsScoreAtQueue: number | undefined,
): Promise<RegimeInputsResult> {
  let ohlc: OHLCData[];
  try {
    if (assetClass === 'xstock_spot') {
      const { xstockOhlcCache } = await import('../../services/xstock-ohlc-cache.js');
      const res = await xstockOhlcCache.getOHLCData(symbol, 60);
      ohlc = res.bars;
    } else {
      const { ohlcCache } = await import('../../services/ohlc-cache.js');
      const res = await ohlcCache.getOHLCData(symbol, 60);
      // OHLCCandle[] (string fields + `time`) → OHLCData[] (number fields + `timestamp`),
      // mirroring signal-orchestrator.ts:1837 exactly (no divergence).
      ohlc = res.ohlc.map((d) => ({
        open: parseFloat(d.open),
        high: parseFloat(d.high),
        low: parseFloat(d.low),
        close: parseFloat(d.close),
        volume: parseFloat(d.volume || '0'),
        timestamp: d.time * 1000,
      }));
    }
  } catch {
    // A fetch failure is a MISS, not a crash — the caller rejects (fail-loud), never scores.
    return { inputs: null, miss: 'mce_context_absent' };
  }

  const dbs =
    typeof dbsScoreAtQueue === 'number' && Number.isFinite(dbsScoreAtQueue)
      ? { score: dbsScoreAtQueue }
      : undefined;

  const raw = getMarketContextEngine().computeRegimeInputsOnly(symbol, ohlc, dbs, assetClass);
  if (!raw) {
    // B-REGIME-REFRESH-PIPE diagnostic: differentiate WHY the refresh compute missed —
    // insufficient bars (data/#441) vs a healthy-but-empty result — by surfacing the bar count.
    // Cheap, one line per miss; makes "no live market context" actionable instead of opaque.
    console.warn(
      `[B-REGIME-REFRESH-PIPE][COMPUTE_MISS] ${symbol} (${assetClass}): bars=${Array.isArray(ohlc) ? ohlc.length : 'n/a'} ` +
      `— computeRegimeInputsOnly returned null (insufficient bars for adx, cold config, or non-finite result).`,
    );
    return { inputs: null, miss: 'mce_context_absent' };
  }

  return {
    inputs: {
      volatility: raw.volatility,
      trendStrength: Math.min(1, Math.max(0, raw.adx / ADX_TREND_DIVISOR)),
      adx: raw.adx,
    },
    miss: null,
  };
}

/* ═══ OBJ-3 / Langston Q4 — THE MISS-RATE CIRCUIT BREAKER ══════════════════════════
 *
 * The per-signal disposition above is REJECT, full stop. But rejecting is the right
 * answer to "this ONE symbol has no context yet" and the WRONG-shaped answer to "the
 * MCE is down and the pool is draining to zero". Langston's ruling: solve that at the
 * SYSTEM layer, not by admitting the signal (explicitly NOT admit-and-alarm) — so a
 * storm becomes LOUD AND OBSERVED rather than a silently-empty ready-to-buy pool.
 *
 * Deliberately a bounded in-memory ring: no I/O on the hot path, no new singleton, no
 * schema. It answers one question — "are misses NORMAL right now, or SYSTEMIC?"
 */
interface MissWindow { at: number; miss: RegimeInputsMiss; symbol: string }

const MISS_WINDOW_MS = 5 * 60_000;      // rolling 5 minutes
const MISS_ALERT_THRESHOLD = 20;        // distinct misses in-window before we shout
const MISS_ALERT_COOLDOWN_MS = 30 * 60_000; // never more than one alert per 30 min

const _missRing: MissWindow[] = [];
let _lastMissAlertAt = 0;

/** Telemetry hook — the accumulated window, for the funnel + post-deploy verification. */
export function getRegimeInputsMissStats(): { inWindow: number; distinctSymbols: number; byReason: Record<string, number> } {
  const cutoff = Date.now() - MISS_WINDOW_MS;
  const live = _missRing.filter((m) => m.at >= cutoff);
  const byReason: Record<string, number> = {};
  for (const m of live) byReason[m.miss] = (byReason[m.miss] ?? 0) + 1;
  return { inWindow: live.length, distinctSymbols: new Set(live.map((m) => m.symbol)).size, byReason };
}

/**
 * Record a miss and, if the rate crosses the threshold, emit ONE system alert.
 *
 * ⚠️ FIRE-AND-FORGET + degrade-never-throw: a failure to ALERT must never break signal
 * generation. The whole point of this batch is that a silent failure hid a dead gate for
 * months — so the alert path failing must not, in turn, take down the path that rejects.
 */
export function recordRegimeInputsMiss(symbol: string, _assetClass: AssetClass, miss: RegimeInputsMiss): void {
  const now = Date.now();
  _missRing.push({ at: now, miss, symbol });
  // bound the ring: drop anything outside the window (cheap, amortised)
  while (_missRing.length && _missRing[0].at < now - MISS_WINDOW_MS) _missRing.shift();

  const stats = getRegimeInputsMissStats();
  if (stats.inWindow < MISS_ALERT_THRESHOLD) return;
  if (now - _lastMissAlertAt < MISS_ALERT_COOLDOWN_MS) return;
  _lastMissAlertAt = now;

  void (async () => {
    try {
      // ⚠️ REAL API, VERIFIED AGAINST THE MODULE — NOT ASSUMED (2026-07-20).
      // The first cut invented `systemAlerts.raise({...})` with `category:'system'`.
      // BOTH were wrong, and the second was the dangerous one: 'system' is NOT in
      // ALERT_CATEGORIES, so addAlert's assertCategoryCreatable would have THROWN —
      // straight into the degrade-never-throw catch below, which would have
      // swallowed it. THE ALERT WOULD HAVE SILENTLY NEVER FIRED, and the swallow
      // would have hidden that fact. That is precisely the defect this batch exists
      // to remove, reproduced inside the batch's own alarm. Caught by the typecheck
      // on the import name; the CATEGORY error it could NOT catch (the field accepts
      // `string`) and would have been a live silent failure.
      // 'health_check' is the correct category — its own comment scopes it to
      // "disk / archival-cron-silence / freshness system health", which is exactly
      // a market-context staleness storm.
      const { addAlert } = await import('../../services/system-alerts.js');
      await addAlert({
        triggers_at: new Date(),          // required; past/now => dispatcher promotes on next run
        category: 'health_check',
        severity: 'warning',
        title: 'Market context unavailable at scale — signals are being rejected',
        body:
          `${stats.inWindow} regime-input misses across ${stats.distinctSymbols} symbols in the last ` +
          `${MISS_WINDOW_MS / 60000} minutes (${JSON.stringify(stats.byReason)}). Signals are being ` +
          `REJECTED rather than scored on a substituted constant, which is correct — but at this rate ` +
          `the ready-to-buy pool will drain. Check the MCE is computing and its cache is populating.`,
        dedupe_key: 'regime-inputs-miss-storm',
        metadata: { inWindow: stats.inWindow, distinctSymbols: stats.distinctSymbols, byReason: stats.byReason },
      });
    } catch (err) {
      // degrade-never-throw: alerting must never break signal generation.
      // ⚠️ BUT NOT SILENT — the swallow above is exactly how the first version of
      // this function would have hidden its own dead alert. Log it.
      console.error('[B-REGIME-INPUTS-LIVE] miss-storm alert FAILED to dispatch:', err);
    }
  })();
}
