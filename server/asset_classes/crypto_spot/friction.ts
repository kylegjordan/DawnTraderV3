/**
 * Crypto-spot friction model (B79 — populated; B-4.5 — fee fields are
 * DB-governed tombstones).
 *
 * FEE FIELDS ARE NaN TOMBSTONES (B-4.5): feeRateTaker/feeRateMaker resolve
 * from module_constants 'fee_model' (per asset_class, fail-hard) and are
 * merged over this object at the single dispatch site
 * cost-model.getFrictionForAssetClass — which constructs a NEW object and
 * NEVER mutates this one. Any path that reads these statics directly will
 * poison its math with NaN immediately (loud), never silently price ~Tier-6
 * fees (the pre-B-4.5 bug class).
 *
 * spread/slippage/bound remain real static values (out of B-4.5 scope).
 *
 * NO IMPORTS at module boundary except the leaf type + the centralized
 * defaults — no risk of cycles.
 */
import type { AssetClassFrictionModel } from '../types.js';
import {
  DEFAULT_SLIPPAGE,
  DEFAULT_SPREAD,
  MAX_COST_BOUND,
} from '../../config/exchange-defaults.js';

export const CRYPTO_SPOT_FRICTION: AssetClassFrictionModel = {
  feeRateTaker: NaN,                       // B-4.5 tombstone — DB-resolved at merge
  feeRateMaker: NaN,                       // B-4.5 tombstone — DB-resolved at merge
  spreadRateDefault: DEFAULT_SPREAD,       // 0.0010
  slippageRateDefault: DEFAULT_SLIPPAGE,   // 0.0005
  maxCostBound: MAX_COST_BOUND,            // 0.02 (B-4.5: per-component sanity ceiling)
  perPairOverrides: {},
};
