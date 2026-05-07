/**
 * Xstock-spot regime classifier thresholds (B79).
 *
 * NO IMPORTS ALLOWED. Leaf module by design — re-imported only by
 * server/core/metrics/market-regime.ts. Adding imports here would risk
 * introducing an import cycle.
 *
 * Branch CONDITION constants only. Formula coefficients and runtime-tunable
 * regime config (RegimeConfig in types/market-regime.types.ts) live elsewhere.
 *
 * Layer 1 domain-knowledge baseline per scope §2.3 obj 8. Equity ATR% runs
 * ~0.5-2% (vs crypto's 2-8%); ADX trends weaker but more reliable. Rough
 * scale: vol/momentum thresholds halved relative to crypto, DX thresholds
 * pulled down 10-15 points, DBS scale-invariant.
 *
 * Crypto_spot path is on a no-touch fence — these constants are read ONLY
 * when calculatePairRegime is invoked with assetClass='xstock_spot'.
 *
 * Layer 2 spot-check / Layer 3 deep calibration may iterate these values
 * post-deploy without re-deploy if they get promoted to module_constants
 * later. For B79: TS constants is the simplest path (matches crypto_spot).
 */

// RBS branch (low vol, low DX, low DBS)
export const RBS_VOL_MAX_XSTOCK = 0.006;
export const RBS_DX_MAX_XSTOCK = 35;
export const RBS_DBS_MAX_XSTOCK = 0.10;

// IE branch (impulse explosion — Path A: high vol+DX, Path B: moderate vol + strong DBS)
export const IE_VOL_MIN_PATH_A_XSTOCK = 0.010;
export const IE_DX_MIN_PATH_A_XSTOCK = 40;
export const IE_VOL_MIN_PATH_B_XSTOCK = 0.0075;
export const IE_DBS_STRONG_XSTOCK = 0.50;

// TFS branch (trend-following — momentum + DX, DBS gates)
export const TFS_MOM_MIN_PATH_A_XSTOCK = 0.0015;
export const TFS_DX_MIN_XSTOCK = 35;
export const TFS_DBS_MODERATE_XSTOCK = 0.30;

// HVU branch (high-vol unstable — Path A: vol + neg momentum, Path B: high DX + strong neg momentum)
export const HVU_VOL_MIN_XSTOCK = 0.0075;
export const HVU_MOM_NEG_PATH_A_XSTOCK = -0.0015;
export const HVU_DX_STRONG_XSTOCK = 45;
export const HVU_MOM_NEG_PATH_B_XSTOCK = -0.0025;
