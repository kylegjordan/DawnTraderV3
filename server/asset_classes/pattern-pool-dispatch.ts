/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.ORCHESTRATOR — Pattern Pool Guardrails Per-Class Dispatcher
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sub-batch 12 of 16 in B79.0n umbrella v4 arc (renumbered from #14 after POOL
 * skip 2026-05-27).
 *
 * Replaces direct `import { PATTERN_POOL_GUARDRAILS } from
 * '../asset_classes/crypto_spot/pattern-pool-filters.js'` at 3 consumer sites
 * (`server/services/active-position-sizing.ts:29`,
 * `server/core/filters/signal_quality_evaluator.ts:28`, and
 * `server/routes.ts:12645` diagnostic) with a single per-asset-class dispatch
 * function. Crypto signals continue to read crypto literal constants (no
 * behavioral change); xstock signals now correctly route to
 * `XSTOCK_PATTERN_POOL_GUARDRAILS` DB-resolved getters (B79.0n.PATTERN-DETECT
 * naming-converge pattern).
 *
 * Mirrors the B79.0n.MCE `getFrictionForAssetClass` pattern at
 * `server/core/math/cost-model.ts:67-89` — domain-specific dispatcher file
 * rather than central `dispatch.ts` SSOT (avoids all-classes-import coupling).
 *
 * Discipline rules (Langston Step 1 §6 ACK):
 *   1. Exhaustive switch on AssetClass union
 *   2. `_exhaustive: never` in default — locks compile-time exhaustiveness
 *   3. `[CLASS_NOT_WIRED]` throws for perp classes (crypto_perp, xstock_perp)
 *   4. Return type explicitly typed as PatternPoolGuardrails (not inferred)
 *
 * Perp classes are NOT wired today — there is no pattern pool config for
 * perpetual futures in the current B79.0n umbrella arc. crypto_perp moved to
 * post-launch (Kyle directive 2026-05-27); xstock_perp is a registry
 * placeholder (Backed Finance issues xStocks as spot only, no perp product
 * at Kraken). Throws guide future activators to the right wire-in path.
 *
 * Behavioral correction post-batch: xstock pattern signals' position-cap
 * routes from crypto's 0.15 (pre-batch) → xstock's 0.50 (post-batch DB-
 * resolved). Real correction, not regression. Active-trading impact ZERO
 * today (active trading off); takes effect at WIRE-IN #14. Phase 19 calibration
 * window should validate xstock's 0.50 value (currently placeholder-clone).
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { AssetClass } from '../../shared/asset-classes.js';
import { PATTERN_POOL_GUARDRAILS } from './crypto_spot/pattern-pool-filters.js';
import { XSTOCK_PATTERN_POOL_GUARDRAILS } from './xstock_spot/pattern-pool-filters.js';

/**
 * Shape of the per-class pattern pool guardrails contract.
 *
 * Crypto returns literal constants; xstock returns DB-resolved getters from
 * `module_constants.pattern_pool_gates.xstock_spot.*`. Both implement the
 * same readable interface — the consumer never needs to know which storage
 * mechanism backs the values.
 */
export interface PatternPoolGuardrails {
  readonly FINAL_SCORE_FLOOR: number;
  readonly MAX_POSITION_PCT: number;
}

/**
 * Resolve the per-asset-class pattern pool guardrails for a given assetClass.
 *
 * @throws Error with `[CLASS_NOT_WIRED]` tag for perp classes (crypto_perp,
 *         xstock_perp) — perpetual futures don't have pattern pool config in
 *         current B79.0n arc.
 * @throws Error via the `_exhaustive: never` default branch if a new
 *         AssetClass enum value is added without updating this dispatcher.
 *         Compile-time TypeScript exhaustiveness catches this BEFORE runtime.
 */
export function getPatternPoolGuardrailsForAssetClass(
  assetClass: AssetClass,
): PatternPoolGuardrails {
  switch (assetClass) {
    case 'crypto_spot':
      return PATTERN_POOL_GUARDRAILS;
    case 'xstock_spot':
      return XSTOCK_PATTERN_POOL_GUARDRAILS;
    case 'crypto_perp':
    case 'xstock_perp':
    case 'equity_spot':
    case 'equity_futures':
    case 'commodity_futures':
    case 'fx_spot':
      throw new Error(
        `[B79.0n.ORCHESTRATOR][CLASS_NOT_WIRED] assetClass='${assetClass}' has no pattern-pool guardrails wired. ` +
        `Pattern-pool gates are not configured for perpetual futures or reserved-future classes in the ` +
        `current B79.0n umbrella arc. If activating: (1) create server/asset_classes/${assetClass}/pattern-pool-filters.ts ` +
        `with the same FINAL_SCORE_FLOOR + MAX_POSITION_PCT contract; (2) seed module_constants ` +
        `pattern_pool_gates rows for the new class; (3) add a case here. See ` +
        `ASSET_CLASS_ONBOARDING_WORKFLOW.md §4.22 for the per-class consumer-site swap pattern.`,
      );
    default: {
      // Compile-time exhaustiveness lock. If a new AssetClass enum value is
      // added without a case above, TypeScript will fail at this line.
      const _exhaustive: never = assetClass;
      throw new Error(
        `[B79.0n.ORCHESTRATOR][dispatch] unreachable assetClass=${String(_exhaustive)}`,
      );
    }
  }
}
