/**
 * Xstock-spot friction model (B79 — populated).
 *
 * Source values: scope §2.3 obj 11 (Layer 1 domain-knowledge baseline).
 *   - feeRateTaker / feeRateMaker: Kraken Spot fee schedule (XStocks share
 *     the spot fee table; verified against Kraken docs in B79 pre-audit).
 *   - spreadRateDefault: 12 bps mid-range of 5-15 bps observed for top
 *     XStocks pairs in pre-audit.
 *   - slippageRateDefault: 5 bps — tighter than crypto_spot (10-15 bps)
 *     due to ARCA-aligned book depth on US equity hours.
 *   - maxCostBound: 50 bps total round-trip cap (half of crypto_spot's
 *     1.0% to reflect tighter expected execution cost).
 *
 * `perPairOverrides` left empty for B79 — per-pair friction tuning
 * (e.g. lower-liquidity xstocks needing wider spread defaults) will be
 * promoted to module_constants in B81 alongside filter-as-first-class.
 *
 * Crypto_spot no-touch fence: nothing in this module is read on the
 * crypto_spot codepath; cost-model dispatches by assetClass.
 */
import type { AssetClassFrictionModel } from '../types.js';

export const XSTOCK_SPOT_FRICTION: AssetClassFrictionModel = {
  feeRateTaker: 0.0026,         // 0.26% Kraken Spot taker
  feeRateMaker: 0.0016,         // 0.16% Kraken Spot maker
  spreadRateDefault: 0.0012,    // 0.12% (12 bps) mid-range
  slippageRateDefault: 0.0005,  // 0.05% (5 bps)
  maxCostBound: 0.005,          // 0.50% total round-trip cap
  perPairOverrides: {},
};
