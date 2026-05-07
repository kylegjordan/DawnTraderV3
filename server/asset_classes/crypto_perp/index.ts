/**
 * Asset-class module placeholder — populated in B80 (crypto_perp).
 * Created in B78 as part of modularization scaffolding.
 */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} not implemented for this asset class — populated in B79/B80.`);
    this.name = 'NotImplementedError';
  }
}
