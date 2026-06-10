/**
 * Xstock-spot friction model (B79 — populated; B-4.5 — fee fields are
 * DB-governed tombstones).
 *
 * FEE FIELDS ARE NaN TOMBSTONES (B-4.5): feeRateTaker/feeRateMaker resolve
 * from module_constants 'fee_model' (per asset_class, fail-hard) and are
 * merged over this object at cost-model.getFrictionForAssetClass (new object,
 * never mutated). The old hardcoded 0.0026/0.0016 literals priced ~Kraken
 * Tier 6 — the account is Tier 1 (0.008/0.004) under the July-2026
 * cross-platform schedule.
 *
 *   - spreadRateDefault: 12 bps mid-range of 5-15 bps observed for top
 *     XStocks pairs in the B79 pre-audit.
 *   - slippageRateDefault: 5 bps — tighter than crypto_spot (10-15 bps)
 *     due to ARCA-aligned book depth on US equity hours.
 *   - maxCostBound: per-COMPONENT sanity clamp (types.ts contract), aligned
 *     to the global 0.02 in B-4.5. The previous 0.005 here carried a WRONG
 *     "total round-trip cap" comment and — had anything enforced it — would
 *     have silently cut the Tier-1 taker 0.008 to 0.005, reproducing the
 *     exact under-estimation B-4.5 kills. NOTE: per-class bounds are still
 *     declared-not-enforced (only the cost-cache global clamp bites today);
 *     kept as the declared contract for B81 per-pair overrides (SIM note).
 *
 * `perPairOverrides` left empty for B79 — per-pair friction tuning
 * (e.g. lower-liquidity xstocks needing wider spread defaults) will be
 * promoted to module_constants in B81 alongside filter-as-first-class.
 *
 * Crypto_spot no-touch fence: nothing in this module is read on the
 * crypto_spot codepath; cost-model dispatches by assetClass.
 */
import type { AssetClassFrictionModel } from '../types.js';
import { MAX_COST_BOUND } from '../../config/exchange-defaults.js';

export const XSTOCK_SPOT_FRICTION: AssetClassFrictionModel = {
  feeRateTaker: NaN,            // B-4.5 tombstone — DB-resolved at merge
  feeRateMaker: NaN,            // B-4.5 tombstone — DB-resolved at merge
  spreadRateDefault: 0.0012,    // 0.12% (12 bps) mid-range
  slippageRateDefault: 0.0005,  // 0.05% (5 bps)
  maxCostBound: MAX_COST_BOUND, // 0.02 per-component sanity clamp (B-4.5)
  perPairOverrides: {},
};
