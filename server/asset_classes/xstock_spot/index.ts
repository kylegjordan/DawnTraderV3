/**
 * Asset-class module placeholder — populated in B79 (xstock_spot).
 * Created in B78 as part of modularization scaffolding.
 */
export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} not implemented for this asset class — populated in B79/B80.`);
    this.name = 'NotImplementedError';
  }
}
