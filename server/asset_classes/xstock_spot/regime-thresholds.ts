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
 *
 * ── B.4 FOUNDATION 15-MINUTE RECALIBRATION (2026-06-04) ──────────────────────
 * Recalibrated from the B79 60-minute values to the 15-minute bar substrate.
 * Method: percentile-preserving (each 60m cutoff mapped to the 15m value at its
 * 60m percentile rank), Langston-approved over fixed-ratio scaling, with
 * CALIBRATION-LENS rounding. Study `scripts/b4-regime-recalib-study.ts` over 485
 * symbols / 34 days / 101.8k clean-1m-rebuilt 60m bars + 300.9k 15m bars. At 15m
 * volatility ≈halves and ADX ≈halves (15m bars move less); momentum + |DBS| are
 * near scale-invariant. EXIT-GATE PARITY PASSED (`scripts/b4-regime-parity.ts`,
 * `B_4_REGIME_PARITY_REPORT.md`): clean-60m→clean-15m regime mix shifts ≤1.3pp
 * (no STRUCTURAL_TRANSITION collapse — the old 60m cutoffs on 15m would have
 * ballooned ST to 51%; these restore it to 30.7%). Crypto path UNCHANGED
 * (no-touch fence; these read only when assetClass='xstock_spot'). 60m prior
 * values retained inline for the audit trail.
 */

// RBS branch (low vol, low DX, low DBS)   [B.4 15m: was 0.006 / 35 / 0.10]
export const RBS_VOL_MAX_XSTOCK = 0.0037;
export const RBS_DX_MAX_XSTOCK = 17;
export const RBS_DBS_MAX_XSTOCK = 0.16;

// IE branch (impulse explosion — Path A: high vol+DX, Path B: moderate vol + strong DBS)
// [B.4 15m: was 0.010 / 40 / 0.0075 / 0.50]
export const IE_VOL_MIN_PATH_A_XSTOCK = 0.0059;
export const IE_DX_MIN_PATH_A_XSTOCK = 19;
export const IE_VOL_MIN_PATH_B_XSTOCK = 0.0045;
export const IE_DBS_STRONG_XSTOCK = 0.51;

// TFS branch (trend-following — momentum + DX, DBS gates)   [B.4 15m: was 0.0015 / 35 / 0.30]
export const TFS_MOM_MIN_PATH_A_XSTOCK = 0.0024;
export const TFS_DX_MIN_XSTOCK = 17;
export const TFS_DBS_MODERATE_XSTOCK = 0.35;

// HVU branch (high-vol unstable — Path A: vol + neg momentum, Path B: high DX + strong neg momentum)
// [B.4 15m: was 0.0075 / -0.0015 / 45 / -0.0025]
export const HVU_VOL_MIN_XSTOCK = 0.0045;
export const HVU_MOM_NEG_PATH_A_XSTOCK = -0.0010;
export const HVU_DX_STRONG_XSTOCK = 22;
export const HVU_MOM_NEG_PATH_B_XSTOCK = -0.0021;
