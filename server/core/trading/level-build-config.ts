/**
 * `B-PRICE-SIDE-BY-JOB` row `8c` — the permanent crypto level-build knobs, `level_basis.*` (crypto_spot).
 *
 * Langston's ruling on §5 (2026-11-06, Discord `1568288118241624175`): the 60 s age ceiling STANDS for an operative level,
 * re-justified for the median stop (f = 0.182 at the p50 crypto stop distance), but it is resolved through the DB, FAILS
 * HARD on an empty read, and the literals `LEVEL_BASIS_OBSERVATION_MAX_AGE_MS` / `_MAX_SPREAD_FRACTION` are DELETED with
 * this module (`level-basis.ts` said so of itself: "these two constants are then DELETED, not repurposed").
 *
 *   level_build_max_age_ms           the oldest side a level may be built on (60,000 — the ruling)
 *   level_build_max_spread_fraction  the plausibility bound on that side, a fraction of its mid (0.50 — unchanged; a wide
 *                                    but REAL spread is not refused here, it is priced: on sided levels it widens risk and
 *                                    narrows reward by a full spread, so the RR floor and the EV gate refuse it)
 *   level_build_drift_ref_60s        the bid-side drift reference for the stamped `f` — his leg: p90 0.3727 % one-minute
 *                                    bid drift, ≈ 0.429 % at 60 s. `f = (drift / stop distance) · √(age / 60 s)`.
 *
 * ⛔ Read SYNCHRONOUSLY at signal birth (active) and at the VTS level-build shadow, so the module is in `b72-warmup.ts`
 * `PREFETCH_MODULES` and asserted at boot — an unreadable row is a deploy-time failure, never a quiet lane.
 */
import { getCachedModuleRowsForAssetClass, getCachedNumberRequired } from '../../services/module-constants-service.js';

export const LEVEL_BASIS_MODULE = 'level_basis';
const CRYPTO_KEY = { exchange: '*', assetClass: 'crypto_spot' as const, strategy: '*', regime: '*' };

const REQUIRED_BOOT_ROWS = new Map([
  ['level_build_max_age_ms', 60_000],
  ['level_build_max_spread_fraction', 0.5],
  ['level_build_drift_ref_60s', 0.00429],
]);

export interface LevelBuildKnobs {
  maxAgeMs: number;
  maxSpreadFraction: number;
  driftRef60s: number;
}

/** The three crypto level-build knobs. Throws on a missing row or a cold module — the caller REFUSES, never defaults. */
export function readCryptoLevelBuildKnobs(): LevelBuildKnobs {
  return {
    maxAgeMs: getCachedNumberRequired(LEVEL_BASIS_MODULE, 'level_build_max_age_ms', CRYPTO_KEY),
    maxSpreadFraction: getCachedNumberRequired(LEVEL_BASIS_MODULE, 'level_build_max_spread_fraction', CRYPTO_KEY),
    driftRef60s: getCachedNumberRequired(LEVEL_BASIS_MODULE, 'level_build_drift_ref_60s', CRYPTO_KEY),
  };
}

/** Boot assertion after Phase B: verify the complete physical crypto row set. */
export function assertLevelBuildKnobsAtBoot(): LevelBuildKnobs {
  try {
    const rows = getCachedModuleRowsForAssetClass(LEVEL_BASIS_MODULE, CRYPTO_KEY.assetClass);
    if (rows.length !== REQUIRED_BOOT_ROWS.size) {
      throw new Error(`expected exactly ${REQUIRED_BOOT_ROWS.size} crypto_spot rows, found ${rows.length}`);
    }
    const remaining = new Map(REQUIRED_BOOT_ROWS);
    for (const { constantName, value, exchange, strategy, regime } of rows) {
      if (!remaining.has(constantName) || value !== remaining.get(constantName)
        || exchange !== CRYPTO_KEY.exchange || strategy !== CRYPTO_KEY.strategy || regime !== CRYPTO_KEY.regime) {
        throw new Error(`unexpected name, dimensions or value for ${constantName}`);
      }
      remaining.delete(constantName);
    }
    return readCryptoLevelBuildKnobs();
  } catch (err) {
    throw new Error(
      `[8c][warmup] ${LEVEL_BASIS_MODULE} crypto_spot contract failed — refusing to start. (${(err as Error).message})`,
    );
  }
}
