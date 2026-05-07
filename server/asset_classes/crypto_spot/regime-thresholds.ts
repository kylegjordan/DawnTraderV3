/**
 * Crypto-spot regime classifier thresholds.
 *
 * NO IMPORTS ALLOWED. Leaf module by design — re-imported only by
 * server/core/metrics/market-regime.ts. Adding imports here would risk
 * introducing an import cycle.
 *
 * Branch CONDITION constants only. Formula coefficients and runtime-tunable
 * regime config (RegimeConfig in types/market-regime.types.ts) live elsewhere.
 *
 * Created in B78 — extracted from market-regime.ts. Math/branch logic stays
 * in market-regime.ts; only literal constants moved here.
 */

// RBS branch (low vol, low DX, low DBS)
export const RBS_VOL_MAX = 0.012;
export const RBS_DX_MAX = 45;
export const RBS_DBS_MAX = 0.10;

// IE branch (impulse explosion — Path A: high vol+DX, Path B: moderate vol + strong DBS)
export const IE_VOL_MIN_PATH_A = 0.020;
export const IE_DX_MIN_PATH_A = 55;
export const IE_VOL_MIN_PATH_B = 0.015;
export const IE_DBS_STRONG = 0.50;

// TFS branch (trend-following — momentum + DX, DBS gates)
export const TFS_MOM_MIN_PATH_A = 0.003;
export const TFS_DX_MIN = 50;
export const TFS_DBS_MODERATE = 0.30;

// HVU branch (high-vol unstable — Path A: vol + neg momentum, Path B: high DX + strong neg momentum)
export const HVU_VOL_MIN = 0.015;
export const HVU_MOM_NEG_PATH_A = -0.003;
export const HVU_DX_STRONG = 60;
export const HVU_MOM_NEG_PATH_B = -0.005;
