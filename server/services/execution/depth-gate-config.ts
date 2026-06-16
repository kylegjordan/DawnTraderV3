/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B4b.1 — per-class FILL DEPTH-GATE config resolver
 * ════════════════════════════════════════════════════════════════════════════
 *
 * DB-governed knobs for the 24/5 book-depth-sufficiency fill gate + the
 * depth-walked fill model (#295 — replaces the B4a-C3 RTH liquid-fill-window
 * clock proxy with a direct depth measure). Per-asset-class rows in
 * `module_constants` (module `fill_depth_gate`; exchange/strategy/regime = `*`),
 * seeded by `2026-06-16-p19-b4b1-fill-depth-gate-seed.sql`.
 *
 * FAIL-CLOSED contract (CLAUDE.md rule 11/15; Langston Step-2 Q-C): a missing/
 * incomplete row set returns `null` and EVERY caller MUST block the fill (open
 * side) / apply the conservative penalty (close side) and surface it loudly —
 * never silently default a behavioral/EV knob. A missing threshold is a config
 * error, not a "use a default". (Cold-start warmup-seed is the migration above;
 * the resolver itself never invents a value.)
 *
 * The `sufficiency_multiple` is an EV knob, not a safety-only knob — see the
 * migration header for the per-class net-expectancy justification.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { getModuleConstants } from '../module-constants-service.js';
import type { AssetClass } from '../../../shared/asset-classes.js';

export interface FillDepthGateConfig {
  /** Max age of the depth snapshot before a fill is blocked as stale (ms). */
  warmthMaxAgeMs: number;
  /** Required available depth notional as a multiple of order notional (ratio gate). */
  sufficiencyMultiple: number;
  /** Minimum number of book levels that must be present for a fillable book. */
  minLevels: number;
  /** Close-side slippage (bps) applied to any order remainder beyond captured depth. */
  beyondDepthPenaltyBps: number;
}

const REQUIRED_KEYS = [
  'warmth_max_age_ms',
  'sufficiency_multiple',
  'min_levels',
  'beyond_depth_penalty_bps',
] as const;

interface CachedConfig { value: FillDepthGateConfig | null; expiresAt: number; }
const _cache = new Map<AssetClass, CachedConfig>();
const _CACHE_TTL_MS = 60_000;
const _NULL_TTL_MS = 5_000;

/** Test-only cache reset. */
export function _testClearDepthGateCache(): void { _cache.clear(); }

/**
 * Resolve the per-class fill-depth-gate config. Returns `null` (fail-closed) if
 * the row set is missing/incomplete or the lookup throws. Both hits and the
 * fail-closed null are cached (short TTL on null) so the hot fill path never
 * hammers the resolver; a freshly-seeded row appears ≤60s.
 */
export async function resolveFillDepthGateConfig(
  assetClass: AssetClass,
): Promise<FillDepthGateConfig | null> {
  const now = Date.now();
  const cached = _cache.get(assetClass);
  if (cached && now < cached.expiresAt) return cached.value;

  let value: FillDepthGateConfig | null = null;
  try {
    const rows = await getModuleConstants('fill_depth_gate', {
      exchange: '*',
      assetClass,
      strategy: '*',
      regime: '*',
    });
    const missing = REQUIRED_KEYS.filter((k) => typeof rows[k] !== 'number');
    if (missing.length > 0) {
      console.error(
        `[P19-B4b.1][DEPTH_GATE_CONFIG] FAIL-CLOSED: missing/non-numeric module_constants keys [${missing.join(', ')}] for assetClass=${assetClass} — blocking active fills until seeded`,
      );
      value = null;
    } else {
      value = {
        warmthMaxAgeMs: rows['warmth_max_age_ms'] as number,
        sufficiencyMultiple: rows['sufficiency_multiple'] as number,
        minLevels: rows['min_levels'] as number,
        beyondDepthPenaltyBps: rows['beyond_depth_penalty_bps'] as number,
      };
    }
  } catch (err) {
    console.error(
      `[P19-B4b.1][DEPTH_GATE_CONFIG] resolve threw for assetClass=${assetClass} — FAIL-CLOSED (blocking fills):`,
      err,
    );
    value = null;
  }
  _cache.set(assetClass, { value, expiresAt: now + (value ? _CACHE_TTL_MS : _NULL_TTL_MS) });
  return value;
}
