/**
 * Crypto-spot friction module placeholder (B78).
 *
 * Per-asset-class friction extraction is DEFERRED to B79/B80 per Langston's
 * rev 1 review §A — `server/core/math/cost-model.ts` is exchange-keyed
 * (not asset-class-keyed), and extracting now would invert the
 * (exchange, asset_class, ...) resolution hierarchy. The xstock_spot and
 * crypto_perp friction shapes will inform the right module boundary.
 *
 * For B78: file exists for structural completeness; no exports.
 */
export {};
