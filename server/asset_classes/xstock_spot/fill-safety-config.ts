/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B4a (C3) — xStock active-fill SAFETY config resolver
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Single read-site for the DB-governed fill-safety knobs that gate active xStock
 * fills + drive the equity-feed silent-stall watchdog. All knobs are per-asset-
 * class rows in `module_constants` (module `xstock_fill_safety`, asset_class
 * `xstock_spot`, exchange/strategy/regime = `*`), seeded by
 * `2026-06-14-p19-b4a-c3-xstock-fill-safety-seed.sql`.
 *
 * FAIL-CLOSED contract (Langston C3 review condition 3 + CLAUDE.md rule 15): if
 * the row set is missing or incomplete, the resolver returns `null` and every
 * caller MUST block (no fill / conservative watchdog) and surface it loudly —
 * never silently default a behavioral knob. For a safety gate, "no config → do
 * not fill" is the safe failure, and it is a loud block (counter + alert), not a
 * silent default.
 *
 * Thresholds derived from the Fri 2026-06-12 measurement (7.9M ticks, 485
 * symbols): RTH p99 inter-tick gap 8.75s → freshness floor 15s; off-RTH p99
 * 192s → off-RTH stall threshold well above it; real price discovery (last
 * moving) 12–22% RTH vs 2–7% off-RTH → fill window = US regular hours 09:30–16:00 ET.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { getModuleConstants } from '../../services/module-constants-service.js';

export interface XstockFillSafetyConfig {
  /** Max age of a symbol's latest tick before its fill is blocked as stale (ms). */
  activeFillMaxAgeMs: number;
  /** Liquid-fill window open, minutes since ET-midnight (570 = 09:30 ET). */
  liquidFillWindowOpenMinEt: number;
  /** Liquid-fill window close (exclusive), minutes since ET-midnight (960 = 16:00 ET). */
  liquidFillWindowCloseMinEt: number;
  /** Silent-stall reconnect threshold while inside the liquid (RTH) window (ms). */
  stallReconnectMsRth: number;
  /** Silent-stall reconnect threshold off-RTH but inside the 24/5 feed-live window (ms). */
  stallReconnectMsOffrth: number;
}

const REQUIRED_KEYS = [
  'active_fill_max_age_ms',
  'liquid_fill_window_open_min_et',
  'liquid_fill_window_close_min_et',
  'stall_reconnect_ms_rth',
  'stall_reconnect_ms_offrth',
] as const;

interface CachedConfig { value: XstockFillSafetyConfig | null; expiresAt: number; }
let _cache: CachedConfig | null = null;
const _CACHE_TTL_MS = 60_000;

/** Test-only cache reset. */
export function _testClearFillSafetyCache(): void { _cache = null; }

/**
 * Resolve the xStock fill-safety config from module_constants. Returns `null`
 * (fail-closed) if the row set is missing/incomplete or the lookup throws.
 * Both hits and the fail-closed null are cached (short TTL on null) so the hot
 * dispatch path never hammers the resolver; a freshly-seeded row appears ≤60s.
 */
export async function resolveXstockFillSafetyConfig(): Promise<XstockFillSafetyConfig | null> {
  const now = Date.now();
  if (_cache && now < _cache.expiresAt) return _cache.value;

  let value: XstockFillSafetyConfig | null = null;
  try {
    const rows = await getModuleConstants('xstock_fill_safety', {
      exchange: '*',
      assetClass: 'xstock_spot',
      strategy: '*',
      regime: '*',
    });
    const missing = REQUIRED_KEYS.filter((k) => typeof rows[k] !== 'number');
    if (missing.length > 0) {
      console.error(
        `[P19-B4a][C3][FILL_SAFETY_CONFIG] FAIL-CLOSED: missing/non-numeric module_constants keys [${missing.join(', ')}] — blocking xStock active fills until seeded`,
      );
      value = null;
    } else {
      value = {
        activeFillMaxAgeMs: rows['active_fill_max_age_ms'] as number,
        liquidFillWindowOpenMinEt: rows['liquid_fill_window_open_min_et'] as number,
        liquidFillWindowCloseMinEt: rows['liquid_fill_window_close_min_et'] as number,
        stallReconnectMsRth: rows['stall_reconnect_ms_rth'] as number,
        stallReconnectMsOffrth: rows['stall_reconnect_ms_offrth'] as number,
      };
    }
  } catch (err) {
    console.error('[P19-B4a][C3][FILL_SAFETY_CONFIG] resolve threw — FAIL-CLOSED (blocking fills):', err);
    value = null;
  }
  _cache = { value, expiresAt: now + (value ? _CACHE_TTL_MS : 5_000) };
  return value;
}
