/**
 * B76 (2026-05-06) — Factor ablation builder dispatch
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The two-pass orchestrator pattern Langston validated in B76 Step-1 review:
 *
 *   PASS 1 (per-factor fire point in orchestrator/vts-runner):
 *     - compute the factor's value
 *     - multiply into running `_modulatedConfChain`
 *     - PUSH a `FactorAlternateInput` discriminated-union record onto a stash
 *       array. The record captures everything the helper needs except the
 *       chain-final reference confidence — which doesn't exist yet.
 *
 *   PASS 2 (after final clamp of `_modulatedConfChain`):
 *     - call `buildAllAlternates(stash, realConfidenceFinal, regimeLabel)`
 *     - dispatch table-drives each input to its corresponding `buildXAlternate`
 *       helper, passing chain-final as the reference confidence
 *     - returns flat `FactorAlternate[]` ready for `emitAblationRecord`
 *
 * Why discriminated-union rather than closures (per Langston's call):
 *   - Pure data: each input is a serializable struct, debuggable in logs
 *   - Auditable: `stash.length` at emit time should equal the number of
 *     `stash.push()` call sites traversed (factor producers that fire)
 *   - No leakage of orchestrator-frame state into the closure capture
 *   - Unit-testable: dispatch can be exercised over fixture inputs without
 *     instantiating the orchestrator
 *
 * If you add a new factor producer, extend `FactorAlternateInput` with a new
 * `kind` tag and add the dispatch arm in `buildOneAlternate` below.
 * ════════════════════════════════════════════════════════════════════════════
 */

import type { FactorAlternate } from './factor-ablation-emitter.js';
import type { MacroModifierResult, MacroModifierConfig } from '../core/metrics/macro-modifier.js';
import { buildB67_1Alternates } from '../core/metrics/macro-modifier.js';
import { buildB67_2Alternate, type RegimePhase } from '../core/metrics/regime-phase.js';
import { buildB67_4Alternate } from '../core/metrics/outcome-feedback-store.js';
import type { OutcomeFeedbackEntry } from '../core/metrics/outcome-feedback-store.js';
import { buildB68_1Alternate, type MultiTfAgreementResult, type MultiTfAgreementConfig } from '../core/metrics/multi-tf-agreement.js';
import { buildB68_2Alternate, type VolumeRegimeResult, type VolumeRegimeConfig } from '../core/metrics/volume-regime.js';
import { buildB68_3Alternate, type PairCorrelationResult, type PairCorrelationConfig } from '../core/metrics/pair-correlation.js';
import { buildB68_4Alternate, buildB68_5Alternate } from '../core/metrics/regime-age-factor.js';
import type { OHLCData, RegimeConfig } from '../types/market-regime.types.js';

/**
 * Discriminated-union inputs for every factor that emits an alternate row.
 *
 * Each kind captures the factor-specific data needed by its `buildXAlternate`
 * helper EXCEPT the chain-final reference confidence (which is computed after
 * the chain completes and passed to the dispatcher).
 */
export type FactorAlternateInput =
  | {
      kind: 'b67_1';
      modifier: MacroModifierResult;
      admissionPossible: boolean;
      config: MacroModifierConfig;
    }
  | {
      kind: 'b67_2';
      phase: RegimePhase;
      phaseAgeSeconds: number;
      strategy: string;
      phaseWeight: number;
    }
  | {
      kind: 'b67_4';
      result: { factor: number; coldStart: boolean };
      context: {
        regime: string;
        strategy: string;
        entry: OutcomeFeedbackEntry | undefined;
      };
    }
  | {
      kind: 'b68_1';
      result: MultiTfAgreementResult;
      config: MultiTfAgreementConfig;
    }
  | {
      kind: 'b68_2';
      result: VolumeRegimeResult;
      config: VolumeRegimeConfig;
    }
  | {
      kind: 'b68_3';
      result: PairCorrelationResult;
      config: PairCorrelationConfig;
    }
  | {
      kind: 'b68_4';
      result: { factor: number; coldStart: boolean; ageHours: number };
      targetAgeHours: number;
    }
  | {
      // B68.5 is the special case — label-counterfactual, not divide-out. The
      // dispatcher passes through to `buildB68_5Alternate` which re-runs
      // `calculatePairRegime` with the gate disabled. The chain-final reference
      // is still attached for completeness but the alternate's `confidence`
      // field comes from the re-classification, not from divide-out math.
      kind: 'b68_5';
      ohlcData: OHLCData[];
      dbsScore: number;
      dbsSlope: number;
      macroModifier: number;
      regimeConfig: RegimeConfig;
    };

/**
 * Build the FactorAlternate (or array thereof, for B67.1's 3-tuple) for one
 * stashed input record, given the chain-final reference confidence + regime
 * label.
 */
function buildOneAlternate(
  input: FactorAlternateInput,
  realConfidenceFinal: number,
  realRegimeLabel: string,
): FactorAlternate | FactorAlternate[] {
  switch (input.kind) {
    case 'b67_1':
      return buildB67_1Alternates(
        realConfidenceFinal,
        input.modifier,
        realRegimeLabel,
        input.admissionPossible,
        input.config,
      );
    case 'b67_2':
      return buildB67_2Alternate(
        realConfidenceFinal,
        realRegimeLabel,
        input.phase,
        input.phaseAgeSeconds,
        input.strategy,
        input.phaseWeight,
      );
    case 'b67_4':
      return buildB67_4Alternate(
        realConfidenceFinal,
        realRegimeLabel,
        input.result,
        input.context,
      );
    case 'b68_1':
      return buildB68_1Alternate(
        realConfidenceFinal,
        realRegimeLabel,
        input.result,
        input.config,
      );
    case 'b68_2':
      return buildB68_2Alternate(
        realConfidenceFinal,
        realRegimeLabel,
        input.result,
        input.config,
      );
    case 'b68_3':
      return buildB68_3Alternate(
        realConfidenceFinal,
        realRegimeLabel,
        input.result,
        input.config,
      );
    case 'b68_4':
      return buildB68_4Alternate(
        realConfidenceFinal,
        realRegimeLabel,
        input.result,
        input.targetAgeHours,
      );
    case 'b68_5':
      return buildB68_5Alternate(
        input.ohlcData,
        input.dbsScore,
        input.dbsSlope,
        input.macroModifier,
        input.regimeConfig,
        realRegimeLabel,
        realConfidenceFinal,
      );
    default: {
      // Exhaustiveness check — TS errors if a kind is missing
      const _exhaustive: never = input;
      throw new Error(`[B76][builder-dispatch] unknown input kind: ${(_exhaustive as any).kind}`);
    }
  }
}

/**
 * Dispatch every stashed factor input to its build helper and flatten the
 * result. Pass this output array directly to `emitAblationRecord`.
 *
 * Audit invariant: the orchestrator's number of `inputs.push(...)` call sites
 * traversed should equal `inputs.length` at this call site, and the returned
 * array length equals `inputs.length` for divide-out factors plus 2 extra for
 * `b67_1` (which expands to 3 alternates).
 */
export function buildAllAlternates(
  inputs: FactorAlternateInput[],
  realConfidenceFinal: number,
  realRegimeLabel: string,
): FactorAlternate[] {
  const out: FactorAlternate[] = [];
  for (const input of inputs) {
    const built = buildOneAlternate(input, realConfidenceFinal, realRegimeLabel);
    if (Array.isArray(built)) out.push(...built);
    else out.push(built);
  }
  return out;
}
