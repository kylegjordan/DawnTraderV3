/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Phase 14 — Regime Map API Endpoint
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Exposes CANONICAL_REGIME_STRATEGY_MAP data for dynamic rendering on the
 * Analytics & Diagnostics Overview tab.
 *
 * GET /api/regime-map
 *   Returns the full canonical regime-strategy map with:
 *   - Regime names, metrics, descriptions, narratives
 *   - Strategy definitions per regime
 *   - Risk multipliers and minimum confidence thresholds
 *   - Regime display names
 *
 * This replaces the hardcoded static table in analytics.tsx.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { Router } from 'express';
import {
  CANONICAL_REGIME_STRATEGY_MAP,
  CANONICAL_REGIMES,
  REGIME_METRICS,
  REGIME_DISPLAY_NAMES,
  REGIME_NARRATIVES,
  CANONICAL_SCHEMA_VERSION,
  type CanonicalRegimeType,
} from '../config/canonical-regime-strategy-map.js';

const router = Router();

/**
 * GET /api/regime-map
 *
 * Returns the full canonical regime-strategy map for dynamic UI rendering.
 */
router.get('/regime-map', (_req, res) => {
  try {
    // B-4.7 (#163): membership is per-class. Top-level array stays the crypto
    // tree (back-compat for the current panel); byAssetClass carries both.
    const buildRegimeMap = (assetClass: 'crypto_spot' | 'xstock_spot') => CANONICAL_REGIMES.map((regime: CanonicalRegimeType) => {
      const mapping = CANONICAL_REGIME_STRATEGY_MAP[assetClass][regime];
      const narrative = REGIME_NARRATIVES[regime];

      return {
        regime,
        displayName: REGIME_DISPLAY_NAMES[regime],
        title: narrative.title,
        description: narrative.description,
        metrics: mapping.metrics,
        strategies: mapping.strategies.map(s => ({
          strategy: s.strategy,
          strategyKey: s.strategyKey,
          signalType: s.signalType,
          patternType: s.patternType,
          secondaryMetrics: s.secondaryMetrics,
        })),
        riskMultiplier: mapping.riskMultiplier,
        minConfidence: mapping.minConfidence,
      };
    });

    res.json({
      schemaVersion: CANONICAL_SCHEMA_VERSION,
      regimeCount: CANONICAL_REGIMES.length,
      regimes: buildRegimeMap('crypto_spot'), // back-compat: crypto top-level
      // B-4.7 (#163): both class trees for per-class UI rendering.
      regimesByAssetClass: {
        crypto_spot: buildRegimeMap('crypto_spot'),
        xstock_spot: buildRegimeMap('xstock_spot'),
      },
    });
  } catch (err) {
    console.error('[Phase14][RegimeMap] Error serving regime map:', err);
    res.status(500).json({ error: 'Failed to load regime map' });
  }
});

export default router;
