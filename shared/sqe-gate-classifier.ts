/**
 * B-FILTER-DIAG-STANDARDIZE (Langston rider R3) — THE ONE classifier for SQE gate ids and pipeline lanes.
 *
 * WHY IT IS SHARED: the engine tallies rejects by gate id and the UI renders rows by gate id. If those
 * two disagree about what "NetEV" or "quant" means, the tab shows a confident number under the wrong
 * label — and nothing errors. Both sides import THIS file, so drift is a compile-time impossibility
 * rather than a review item. Pure functions only, no imports, client-safe.
 *
 * ⚠️ THE SUB-GATE STILL LIVES IN FREE TEXT: gate_decision.reason reads
 *   "NetEV -0.011175 <= 0 (chosen maker mode — non-positive net expectancy after friction)"
 * Prefix-matching prose is acceptable HERE — pinned in a tested pure function, per Langston's ruling —
 * and a STRUCTURED sub-gate token is scoped to #662 so the UI eventually stops parsing sentences.
 */

/** Canonical SQE gate ids. MUST stay in sync with `SQE_CANONICAL_GATES` in
 *  `server/core/observability/active-funnel-tracker.ts` — the fence test pins them equal. */
export const SQE_GATE_IDS = [
  'unclassifiable_asset_class',
  'xstock_weekend_closure',
  'asset_class_disabled',
  'FinalScore',
  'RegimeWeight',
  'ROI',
  'Confidence',
  'AMR',
  'Governance',
  'NetEV',
] as const;
export type SqeGateIdShared = (typeof SQE_GATE_IDS)[number] | 'uncategorized';

const _CANON: ReadonlySet<string> = new Set(SQE_GATE_IDS);

/** Classify a free-text SQE reason into a canonical gate id.
 *  Delimiter contract: the first token up to whitespace or ':' — identical to the engine's
 *  `extractSqeGateId`, deliberately duplicated in behaviour and pinned by test, because the engine
 *  version also does throttled logging that has no place in a renderer. */
export function classifySqeGate(reason: string | null | undefined): SqeGateIdShared {
  const token = (reason ?? '').split(/[\s:]/)[0] ?? '';
  return _CANON.has(token) ? (token as SqeGateIdShared) : 'uncategorized';
}

/** The DISPLAY label for a gate id. ★ The Net-EV row must read exactly what the VTS tab reads —
 *  Kyle's "same fields, same display" is satisfied at the LABEL or not at all (Langston-ratified).
 *  VTS keys its reason `Net_EV_Negative` and displays "Net EV Below Floor"; the active lane reaches
 *  the same label from the token `NetEV`. */
export function sqeGateLabel(gateId: string): string {
  switch (gateId) {
    case 'NetEV':
    case 'Net_EV_Negative':
      return 'Net EV Below Floor';
    case 'RegimeWeight':      return 'Regime Weight';
    case 'FinalScore':        return 'Final Score';
    case 'Confidence':        return 'Confidence';
    case 'Governance':        return 'Governance';
    case 'ROI':               return 'ROI';
    case 'AMR':               return 'AMR';
    case 'xstock_weekend_closure':     return 'xStock Weekend Closure';
    case 'asset_class_disabled':       return 'Asset Class Disabled';
    case 'unclassifiable_asset_class': return 'Unclassifiable Asset Class';
    case 'uncategorized':
      // ⛔ NOT "Pre-promotion + unrecognized tokens" — that label was withdrawn 2026-08-07 after Kyle
      // called it meaningless. It named a MIGRATION ARTEFACT instead of the thing being counted. This
      // bucket means exactly one thing: a reason token the classifier does not recognise.
      return 'Unrecognised reason token';
    default:
      return gateId;
  }
}

/** THE LANE RULE, mirroring `isQuantPool` (`server/services/vts-runner.ts:271-272`):
 *    `return !sourcePool || sourcePool === 'quant' || sourcePool.startsWith('quant-')`
 *  ★ ABSENCE IS THE QUANT MARKER — it is a recorded VALUE, not missing data. Pattern-lane signals are
 *  explicitly stamped 'pattern'; xStock family lanes are stamped `xstock-<family>` and are quant-family
 *  lanes. Reading the NULL as "unrecorded" cost a scope amendment and a reviewer ruling on 2026-08-07;
 *  the rule now lives in one place so nobody re-derives it wrongly. */
export function isQuantLane(sourcePool: string | null | undefined): boolean {
  return !sourcePool || sourcePool === 'quant' || sourcePool.startsWith('quant-');
}

/** Lane bucket for display: the Quant / Pattern column split the six tabs share.
 *  Everything that is not explicitly 'pattern' is a quant lane — null/'quant'/'quant-*' by the
 *  `isQuantPool` rule above, and `xstock-<family>` because those ARE the xStock quant families. */
export function laneBucket(sourcePool: string | null | undefined): 'quant' | 'pattern' {
  return sourcePool === 'pattern' ? 'pattern' : 'quant';
}
