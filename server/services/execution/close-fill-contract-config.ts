/**
 * ═════════════════════════════════════════════════
 * B-FEED-MISMATCH-FIX P1 — per-class CLOSE-FILL CONTRACT config resolver
 * ═════════════════════════════════════════════════
 *
 * Two DB-governed knobs for the taker CLOSE fill (module `close_fill_contract`,
 * exchange/strategy/regime = `*`), seeded by
 * `2026-09-19-b-feed-mismatch-fix-close-fill-contract.sql`:
 *
 *  - `up_tol` — the signed-divergence refusal bound. A close is a SELL and walks
 *    the BID side, so a legitimate walked fill sits AT OR BELOW the contemporaneous
 *    best bid; it can never fill ABOVE it. On a NOT-WARM book the walk is refused
 *    iff `walkedFill > referenceBid × (1 + up_tol)`. The downward side is the depth
 *    walk itself and is NOT bounded by this knob.
 *    ⛔ The seed (0.01) is a CHOICE INSIDE AN EMPTY INTERVAL, not a derivation — see
 *    the migration header. It must not be read as calibrated.
 *  - `cold_refusal_cap` — consecutive refused closes on ONE position before the
 *    close YIELDS (walks anyway, stamps the yield, raises an alert). The same
 *    bounded-hold pattern as `hollow_skip_cap` (asset_classes/xstock_spot/book-state.ts),
 *    so a refused close can never become a position that can never exit.
 *
 * ⛔ A SEPARATE MODULE FROM `fill_depth_gate` ON PURPOSE: `resolveFillDepthGateConfig`
 * returns null when ANY of its keys is missing, and a null there BLOCKS EVERY OPEN.
 * Adding these close-side keys to that module would let a missing close knob stop
 * all entries. Here a missing row fails closed on the CLOSE contract only.
 *
 * FAIL-CLOSED: a missing/non-numeric/out-of-range row set, or an asset class with
 * no rows (the unknown-token arm), returns `null`. The caller then REFUSES the
 * not-warm walk rather than grading it against an invented bound — and the
 * consecutive-refusal cap cannot be read either, so the caller alerts instead of
 * yielding silently.
 * ═════════════════════════════════════════════════
 */

import { getModuleConstants } from '../module-constants-service.js';
import type { AssetClass } from '../../../shared/asset-classes.js';

export interface CloseFillContractConfig {
  /** Signed-divergence refusal bound as a FRACTION (0.01 = 1 %). */
  upTol: number;
  /** Consecutive refused closes on one position before the close yields. */
  coldRefusalCap: number;
}

const REQUIRED_KEYS = ['up_tol', 'cold_refusal_cap'] as const;

interface CachedConfig { value: CloseFillContractConfig | null; expiresAt: number; }
const _cache = new Map<AssetClass, CachedConfig>();
const _CACHE_TTL_MS = 60_000;
const _NULL_TTL_MS = 5_000;

/** Test-only cache reset. */
export function _testClearCloseFillContractCache(): void { _cache.clear(); }

export async function resolveCloseFillContractConfig(
  assetClass: AssetClass,
): Promise<CloseFillContractConfig | null> {
  const now = Date.now();
  const cached = _cache.get(assetClass);
  if (cached && now < cached.expiresAt) return cached.value;

  let value: CloseFillContractConfig | null = null;
  try {
    const rows = await getModuleConstants('close_fill_contract', {
      exchange: '*',
      assetClass,
      strategy: '*',
      regime: '*',
    });
    const missing = REQUIRED_KEYS.filter((k) => typeof rows[k] !== 'number');
    if (missing.length > 0) {
      console.error(
        `[B-FEED-MISMATCH-FIX][CLOSE_FILL_CONTRACT] FAIL-CLOSED: missing/non-numeric module_constants keys [${missing.join(', ')}] for assetClass=${assetClass} — not-warm closes are REFUSED until seeded`,
      );
    } else {
      const upTol = rows.up_tol as number;
      const cap = rows.cold_refusal_cap as number;
      if (!(upTol > 0 && upTol < 1) || !(Number.isInteger(cap) && cap >= 1)) {
        console.error(
          `[B-FEED-MISMATCH-FIX][CLOSE_FILL_CONTRACT] FAIL-CLOSED: out-of-range up_tol=${upTol} cold_refusal_cap=${cap} for assetClass=${assetClass}`,
        );
      } else {
        value = { upTol, coldRefusalCap: cap };
      }
    }
  } catch (err) {
    console.error(`[B-FEED-MISMATCH-FIX][CLOSE_FILL_CONTRACT] FAIL-CLOSED: lookup threw for assetClass=${assetClass}:`, err);
    value = null;
  }
  _cache.set(assetClass, { value, expiresAt: now + (value ? _CACHE_TTL_MS : _NULL_TTL_MS) });
  return value;
}

/**
 * The signed-divergence predicate, pure. `true` ⇒ REFUSE the walk.
 * Only ever called on a NOT-WARM book with a reference present — a warm book walks
 * unchanged and a missing reference is the caller's `no_reference` arm.
 */
export function walkAboveReference(walkedFill: number, referenceBid: number, upTol: number): boolean {
  return walkedFill > referenceBid * (1 + upTol);
}
