/**
 * `B-PRICE-SIDE-BY-JOB` row `8c` (switch-on) — THE ONE SOURCE of the crypto level-build knobs, `level_basis.*` (crypto_spot).
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
 *   crypto_birth_sided_enabled       THE 8c SWITCH-ON (0 | 1, seeded 0). Off: the birth re-base, its walk record and the open
 *                                    refusal are skipped, no `levelGeometry` stamp is written, and every cost site reads 'mid'
 *                                    — today's behaviour. On: crypto levels are built on the transactable sides. Flipped only
 *                                    after Kyle's §6(b) report (his 2026-10-19 rule: every on/off outcome is reported).
 *   level_build_drift_ref_60s        the bid-side drift reference for the stamped `f` — his leg: p90 0.3727 % one-minute
 *                                    bid drift, ≈ 0.429 % at 60 s. `f = (drift / stop distance) · √(age / 60 s)`.
 *
 * ⛔ Read SYNCHRONOUSLY at signal birth (active) and at the VTS level-build shadow, so the module is in `b72-warmup.ts`
 * `PREFETCH_MODULES` and asserted at boot — an unreadable row is a deploy-time failure, never a quiet lane.
 */
import { getCachedNumberRequired } from '../../services/module-constants-service.js';

export const LEVEL_BASIS_MODULE = 'level_basis';
const CRYPTO_KEY = { exchange: '*', assetClass: 'crypto_spot' as const, strategy: '*', regime: '*' };

/** Open bounds. Age: ≤ 0 refuses everything, > 10 min is not a quote. Spread: ≤ 0 refuses everything, ≥ 1 admits a bid at
 *  or below zero. Drift: ≤ 0 makes every `f` zero, ≥ 10 % is not a one-minute drift. */
export const LEVEL_BUILD_BOUNDS = {
  maxAgeMs: { gt: 0, le: 600_000 },
  maxSpreadFraction: { gt: 0, lt: 1 },
  driftRef60s: { gt: 0, lt: 0.10 },
} as const;

export interface LevelBuildKnobs {
  maxAgeMs: number;
  maxSpreadFraction: number;
  driftRef60s: number;
  /** The 8c switch-on. Read as a 0/1 number (the house form, `book_state.enabled`); anything else throws. */
  sidedEnabled: boolean;
}

/** The three crypto level-build knobs. Throws on a missing row or a cold module — the caller REFUSES, never defaults. */
export function readCryptoLevelBuildKnobs(): LevelBuildKnobs {
  return {
    maxAgeMs: getCachedNumberRequired(LEVEL_BASIS_MODULE, 'level_build_max_age_ms', CRYPTO_KEY),
    maxSpreadFraction: getCachedNumberRequired(LEVEL_BASIS_MODULE, 'level_build_max_spread_fraction', CRYPTO_KEY),
    driftRef60s: getCachedNumberRequired(LEVEL_BASIS_MODULE, 'level_build_drift_ref_60s', CRYPTO_KEY),
    sidedEnabled: readSidedSwitch(),
  };
}

function readSidedSwitch(): boolean {
  const v = getCachedNumberRequired(LEVEL_BASIS_MODULE, 'crypto_birth_sided_enabled', CRYPTO_KEY);
  if (v !== 0 && v !== 1) throw new Error(`module_constants: ${LEVEL_BASIS_MODULE}.crypto_birth_sided_enabled must be 0 or 1, got ${v}`);
  return v === 1;
}

/** Boot assertion: every row exists, is reachable from a sync reader, and is inside its bounds. */
export function assertLevelBuildKnobsAtBoot(): LevelBuildKnobs {
  let k: LevelBuildKnobs;
  try {
    k = readCryptoLevelBuildKnobs();
  } catch (err) {
    throw new Error(
      `[8c][warmup] ${LEVEL_BASIS_MODULE}.level_build_* for asset_class='crypto_spot' is unreadable — either migration `
      + `drizzle/migrations/2026-11-08-b-price-side-8c-level-build-knobs.sql has not been applied, or the module is missing `
      + `from PREFETCH_MODULES. Without it no crypto signal can be born. (${(err as Error).message})`,
    );
  }
  const B = LEVEL_BUILD_BOUNDS;
  if (!(k.maxAgeMs > B.maxAgeMs.gt && k.maxAgeMs <= B.maxAgeMs.le)) {
    throw new Error(`[8c][warmup] level_build_max_age_ms=${k.maxAgeMs} outside (${B.maxAgeMs.gt}, ${B.maxAgeMs.le}] — refusing to start.`);
  }
  if (!(k.maxSpreadFraction > B.maxSpreadFraction.gt && k.maxSpreadFraction < B.maxSpreadFraction.lt)) {
    throw new Error(`[8c][warmup] level_build_max_spread_fraction=${k.maxSpreadFraction} outside (0, 1) — refusing to start.`);
  }
  if (!(k.driftRef60s > B.driftRef60s.gt && k.driftRef60s < B.driftRef60s.lt)) {
    throw new Error(`[8c][warmup] level_build_drift_ref_60s=${k.driftRef60s} outside (0, 0.10) — refusing to start.`);
  }
  return k;
}
