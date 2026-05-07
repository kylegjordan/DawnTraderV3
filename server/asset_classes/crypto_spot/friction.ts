/**
 * Crypto-spot friction model (B79 — populated; was placeholder in B78).
 *
 * Values mirror `server/config/exchange-defaults.ts` (the historical
 * single-source-of-truth). Extracting them here is the asset-class-keyed
 * resolution layer that `server/core/math/cost-model.ts` now consumes.
 *
 * Crypto_spot path is on the no-touch fence through 2026-05-15: these
 * values MUST equal the exchange-defaults.ts constants so cost-model
 * back-compat is exact.
 *
 * NO IMPORTS at module boundary except the leaf type + the centralized
 * defaults — no risk of cycles.
 */
import type { AssetClassFrictionModel } from '../types.js';
import {
  DEFAULT_TAKER_FEE,
  DEFAULT_MAKER_FEE,
  DEFAULT_SLIPPAGE,
  DEFAULT_SPREAD,
  MAX_COST_BOUND,
} from '../../config/exchange-defaults.js';

export const CRYPTO_SPOT_FRICTION: AssetClassFrictionModel = {
  feeRateTaker: DEFAULT_TAKER_FEE,        // 0.0026
  feeRateMaker: DEFAULT_MAKER_FEE,        // 0.0016
  spreadRateDefault: DEFAULT_SPREAD,       // 0.0010
  slippageRateDefault: DEFAULT_SLIPPAGE,   // 0.0005
  maxCostBound: MAX_COST_BOUND,            // 0.01
  perPairOverrides: {},
};
