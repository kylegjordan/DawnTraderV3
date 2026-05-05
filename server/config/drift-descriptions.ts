/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.7F — Drift Descriptions
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Human-readable descriptions for DriftScore ranges.
 * Provides interpretability for operators monitoring regime alignment.
 * 
 * Schema Version: regime-mapping/v1.4b
 * ══════════════════════════════════════════════════════════════════════════════
 */

export interface DriftDescription {
  range: string;
  label: string;
  description: string;
  color: string;
}

export const DRIFT_DESCRIPTIONS: DriftDescription[] = [
  {
    range: '0.0–0.5',
    label: 'Aligned',
    description: 'Strategy operating within expected regime characteristics — canonical alignment stable.',
    color: '#22c55e'
  },
  {
    range: '0.5–0.8',
    label: 'Minor Drift',
    description: 'Slight deviation from canonical regime features. Strategy remains operational.',
    color: '#84cc16'
  },
  {
    range: '0.8–1.5',
    label: 'Moderate Drift',
    description: 'Moderate drift detected — partial deviation from canonical regime features. Monitor for misalignment.',
    color: '#eab308'
  },
  {
    range: '1.5–3.0',
    label: 'Significant Drift',
    description: 'Significant drift — executing under conditions inconsistent with canonical design. Realignment or retraining recommended.',
    color: '#ef4444'
  }
];

// B72 (2026-05-05): drift boundaries from module='drift_detector'.
import { getCachedNumberRequired } from '../services/module-constants-service.js';
const _DRIFT_KEY = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' };

export function getDriftDescription(score: number): DriftDescription {
  const aligned  = getCachedNumberRequired('drift_detector', 'drift_aligned_boundary',  _DRIFT_KEY);
  const minor    = getCachedNumberRequired('drift_detector', 'drift_minor_boundary',    _DRIFT_KEY);
  const moderate = getCachedNumberRequired('drift_detector', 'drift_moderate_boundary', _DRIFT_KEY);
  if (score <= aligned)  return DRIFT_DESCRIPTIONS[0];
  if (score <= minor)    return DRIFT_DESCRIPTIONS[1];
  if (score <= moderate) return DRIFT_DESCRIPTIONS[2];
  return DRIFT_DESCRIPTIONS[3];
}

export function getDriftColor(score: number): string {
  return getDriftDescription(score).color;
}

export function getDriftLabel(score: number): string {
  return getDriftDescription(score).label;
}
