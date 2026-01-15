/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.4H.6G — Canonical Regime-Strategy Enforcement
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Purpose: Provides regime-based strategy and signal type recommendations.
 * This module imports from the canonical JSON file - the SINGLE SOURCE OF TRUTH.
 * 
 * Governance: 
 * - All mappings MUST come from /bridge/canonical/mapping-regime-strategy.json
 * - No hardcoded regime-strategy arrays permitted
 * - Runtime validation prevents canonical drift
 * 
 * ══════════════════════════════════════════════════════════════════════════════
 */

import canonicalMap from '../../bridge/canonical/mapping-regime-strategy.json' with { type: 'json' };

interface CanonicalEntry {
  favoredStrategies: string[];
  favoredSignalTypes: string[];
}

type CanonicalMapType = Record<string, CanonicalEntry | string>;

const typedCanonicalMap = canonicalMap as CanonicalMapType;

export function getFavoredStrategiesForRegime(regime: string): string[] {
  const canonical = typedCanonicalMap[regime] as CanonicalEntry | undefined;
  if (!canonical || typeof canonical === 'string') {
    console.warn(`[11.4H.6G][Mapper] Missing canonical regime entry: ${regime}`);
    return ["Unknown Strategy"];
  }
  console.log(`[11.4H.6G][Mapper] Regime=${regime} | Strategies=${canonical.favoredStrategies.join(", ")}`);
  return canonical.favoredStrategies;
}

export function getFavoredSignalTypesForRegime(regime: string): string[] {
  const canonical = typedCanonicalMap[regime] as CanonicalEntry | undefined;
  if (!canonical || typeof canonical === 'string') {
    console.warn(`[11.4H.6G][Mapper] Missing canonical regime entry for signals: ${regime}`);
    return ["Quantitative"];
  }
  return canonical.favoredSignalTypes;
}

export function getCanonicalRegimes(): string[] {
  return Object.keys(typedCanonicalMap).filter(k => !k.startsWith('_'));
}
