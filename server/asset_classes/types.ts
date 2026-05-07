/**
 * Per-asset-class friction model interface (B79).
 *
 * Shared shape for the per-asset-class `friction.ts` modules under
 * `server/asset_classes/<class>/`. Consumed by `server/core/math/cost-model.ts`
 * via the asset_class-keyed lookup pattern (back-compat default = 'crypto_spot').
 *
 * Unit consistency (Langston B79 rev 1 callout): all `*Rate` fields are
 * DECIMAL FRACTIONS (e.g. 0.0026 = 0.26%), NOT bps integers. This avoids
 * the B81 unit-confusion bug class.
 *
 * `perPairOverrides` is an OPTIONAL hash for per-symbol tuning (e.g. a
 * specific high-liquidity xstock pair with tighter spread than the asset-
 * class default). Empty in B79 — DB-backed per-pair overrides land in B81
 * alongside filter-as-first-class promotion.
 *
 * NO IMPORTS expected at this leaf level except types — keeping the module
 * graph cycle-free per B78 modularization discipline.
 */
export interface AssetClassFrictionModel {
  feeRateTaker: number;          // decimal (e.g. 0.0026 = 0.26%)
  feeRateMaker: number;          // decimal
  spreadRateDefault: number;     // decimal (bid/ask half-spread cost component)
  slippageRateDefault: number;   // decimal (execution price drift)
  maxCostBound: number;          // decimal (clamp on any single cost component)
  perPairOverrides?: Record<string, Partial<Omit<AssetClassFrictionModel, 'perPairOverrides'>>>;
}
