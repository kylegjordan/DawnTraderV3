/**
 * Xstock-spot asset-class module — public surface (B79).
 *
 * Re-exports the live submodules for callers that want a single import path.
 * Submodules can also be imported directly for tree-shake friendliness.
 *
 * The B78 placeholder NotImplementedError class is retained for any callers
 * that imported it during the scaffold-only phase; populated submodules now
 * supersede it for normal use.
 */
export * from './regime-thresholds.js';
export * from './friction.js';
export * from './market-hours.js';
export * from './pattern-pool-filters.js';

export class NotImplementedError extends Error {
  constructor(feature: string) {
    super(`${feature} not implemented for this asset class.`);
    this.name = 'NotImplementedError';
  }
}
