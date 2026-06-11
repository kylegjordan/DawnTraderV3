/**
 * ══════════════════════════════════════════════════════════════════════════════
 * B-5 AMR (Obj-5/6) — per-(mode, class) admission gates
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The AMR throttle surface: roster allowance, confidence floor, hard-pause,
 * and open-slot cap, evaluated at the three entry-decision chokepoints
 * (pre-audit §2): SQE admission, RTB promotion re-check, execution entry.
 * Exits are NEVER touched (entry-only invariant).
 *
 * F1 (Langston adversarial walk): the SQE gate call is UNCONDITIONAL and
 * SELF-SOURCING — the gate resolves flag/mode/class state itself rather than
 * trusting caller-injected context, because the RTB refresh path re-runs SQE
 * with PARTIAL inputs; a parameter-injected design would silently skip gates
 * on that path.
 *
 * F3 (pause precedence): killSwitch > AMR hard-pause > TCL — implemented as
 * INDEPENDENT ANDs at the consumer sites (no precedence coupling here; this
 * module only answers the AMR question).
 *
 * DRY-RUN (A4/B3): the same gate functions run with execution='dry_run' under
 * the shadow flag at the SAME call sites; results land on the decision ledger
 * (would_blocks) with per-gate + per-site tags. 'enforce' is reachable ONLY
 * when the per-class flag is 'active'.
 *
 * The lane-bypass split (geometry-vs-posture) is preserved: AMR gates consult
 * POSTURE only — strategy-fit/geometry lanes (B3.1) are untouched upstream.
 */

import { getCachedConstant } from '../../services/module-constants-service.js';
import {
  getSlotCapForMode,
  meetsConfidenceFloorForClass,
  type StrategyMode,
} from './strategy-modes.js';
import {
  getAmrFlagState,
  getCurrentModeForClass,
  getActiveModeForClass,
  recordWouldBlock,
  type AmrFlagState,
} from '../../services/amr-weather-report.js';
import type { AssetClass } from '../../../shared/asset-classes.js';

export type AmrGateSite = 'sqe_admission' | 'rtb_promotion' | 'execution_entry';

export interface AmrGateBlock {
  gate: 'roster_strategy' | 'roster_source_pool' | 'confidence_floor' | 'hard_pause' | 'slot_cap' | 'no_posture';
  site: AmrGateSite;
  reason: string;
  ts: number;
}

export interface AmrGateResult {
  /** Under enforce: admission verdict. Under dry_run/inactive: always true. */
  allowed: boolean;
  /** What the gates WOULD have blocked (dry_run) or DID block (enforce). */
  blocks: AmrGateBlock[];
  mode: StrategyMode | null;
  flagState: AmrFlagState | null;
  executed: 'enforce' | 'dry_run' | 'skipped';
}

function dialKey(assetClass: AssetClass) {
  return { exchange: '*', assetClass, strategy: '*', regime: '*' };
}

const MODE_PREFIX: Record<StrategyMode, string> = {
  NORMAL: 'normal_', AGGRESSIVE: 'aggressive_', DEFENSIVE: 'defensive_', SURVIVAL: 'survival_',
};

function readAllowance(mode: StrategyMode, assetClass: AssetClass, which: 'allowed_strategy_families' | 'allowed_source_pools'): string[] {
  const v = getCachedConstant<string[]>('amr_response_dials', MODE_PREFIX[mode] + which, dialKey(assetClass));
  if (!Array.isArray(v) || v.length === 0) {
    throw new Error(`[B-5][amr-gates] ${MODE_PREFIX[mode]}${which} for '${assetClass}' missing/empty — migration seeds ["all"]; no fallback by design.`);
  }
  return v;
}

function readHardPause(mode: StrategyMode, assetClass: AssetClass): boolean {
  const v = getCachedConstant<boolean>('amr_response_dials', MODE_PREFIX[mode] + 'hard_pause', dialKey(assetClass));
  if (typeof v !== 'boolean') {
    throw new Error(`[B-5][amr-gates] ${MODE_PREFIX[mode]}hard_pause for '${assetClass}' missing/non-boolean — no fallback by design.`);
  }
  return v;
}

export interface AmrGateInput {
  assetClass: AssetClass;
  site: AmrGateSite;
  strategy?: string;
  /** Signal family/pool tag where the site has one (SQE has; promotion may not). */
  sourcePool?: string;
  confidence?: number;
  /** Caller-supplied SAME-CLASS open position count (per-class group-by at the
   *  engine — the gate stays pure; sites without a cheap count omit it and the
   *  slot gate is skipped AT THAT SITE, the execution-entry site always has it). */
  openPositionCountForClass?: number;
}

/**
 * THE gate evaluation. Self-sourcing (F1): flag + mode resolved here.
 *   disabled → skipped (zero behavior, zero ledger noise)
 *   shadow   → dry_run: full evaluation, blocks → ledger relay, allowed=true
 *   active   → enforce: blocks are real; allowed=false on any block
 */
export function evaluateAmrGates(input: AmrGateInput): AmrGateResult {
  let flagState: AmrFlagState;
  try {
    flagState = getAmrFlagState(input.assetClass);
  } catch {
    return { allowed: true, blocks: [], mode: null, flagState: null, executed: 'skipped' };
  }
  if (flagState === 'disabled') {
    return { allowed: true, blocks: [], mode: null, flagState, executed: 'skipped' };
  }
  const execution: 'enforce' | 'dry_run' = flagState === 'active' ? 'enforce' : 'dry_run';
  const mode = execution === 'enforce'
    ? getActiveModeForClass(input.assetClass)
    : getCurrentModeForClass(input.assetClass);
  if (mode === null) {
    // B-5.1 (#224, pre-audit Note-3): execution-aware null handling.
    // Under ENFORCE a null mode (boot / sentinel warm-up / idle) must FAIL
    // CLOSED — the prior allowed:true/skipped left every ACTIVE restart
    // ungated until the first weather cycle, and the friction-warm-up IDLE
    // extension would have WIDENED that window. All gate sites are
    // entry-side (exits never gated), so fail-closed cannot trap an open
    // position; posture is in-memory-only, so there is no persisted-
    // FAVORABLE resume hazard. Under dry_run (shadow) nothing changes:
    // there is no posture to rehearse — skip as before.
    if (execution === 'enforce') {
      return {
        allowed: false,
        blocks: [{
          gate: 'no_posture', site: input.site,
          reason: `no live weather read for ${input.assetClass} (boot/warm-up/idle) — new entries blocked under active`,
          ts: Date.now(),
        }],
        mode: null, flagState, executed: 'enforce',
      };
    }
    return { allowed: true, blocks: [], mode: null, flagState, executed: 'skipped' };
  }

  const blocks: AmrGateBlock[] = [];
  const now = Date.now();

  try {
    if (readHardPause(mode, input.assetClass)) {
      blocks.push({ gate: 'hard_pause', site: input.site, reason: `mode ${mode} hard_pause=true for ${input.assetClass}`, ts: now });
    }
    if (input.strategy) {
      const fams = readAllowance(mode, input.assetClass, 'allowed_strategy_families');
      if (!fams.includes('all') && !fams.includes(input.strategy)) {
        blocks.push({ gate: 'roster_strategy', site: input.site, reason: `strategy '${input.strategy}' not in ${mode} allowance [${fams.join(',')}]`, ts: now });
      }
    }
    if (input.sourcePool) {
      const pools = readAllowance(mode, input.assetClass, 'allowed_source_pools');
      if (!pools.includes('all') && !pools.includes(input.sourcePool)) {
        blocks.push({ gate: 'roster_source_pool', site: input.site, reason: `pool '${input.sourcePool}' not in ${mode} allowance [${pools.join(',')}]`, ts: now });
      }
    }
    if (input.confidence !== undefined && !meetsConfidenceFloorForClass(input.confidence, mode, input.assetClass)) {
      blocks.push({ gate: 'confidence_floor', site: input.site, reason: `confidence ${input.confidence.toFixed(3)} below ${mode} floor for ${input.assetClass}`, ts: now });
    }
    if (input.openPositionCountForClass !== undefined) {
      const cap = getSlotCapForMode(mode, input.assetClass);
      if (input.openPositionCountForClass >= cap) {
        blocks.push({ gate: 'slot_cap', site: input.site, reason: `open ${input.openPositionCountForClass} >= ${mode} cap ${cap} for ${input.assetClass}`, ts: now });
      }
    }
  } catch (err) {
    // A gate-internal resolution failure must never crash an admission path —
    // but it is NEVER a silent allow under enforce (fail-closed there).
    console.warn(`[B-5][amr-gates] gate evaluation error at ${input.site} (${input.assetClass}): ${err instanceof Error ? err.message : err}`);
    if (execution === 'enforce') {
      blocks.push({ gate: 'hard_pause', site: input.site, reason: 'gate_resolution_error (fail-closed under active)', ts: now });
    }
  }

  if (blocks.length > 0 && execution === 'dry_run') {
    for (const b of blocks) recordWouldBlock(input.assetClass, b);
  }

  return {
    allowed: execution === 'enforce' ? blocks.length === 0 : true,
    blocks,
    mode,
    flagState,
    executed: execution,
  };
}
