/**
 * B-EVIDENCE-SINK (CC-A 2026-07-14) — durable capture of the three switch-on behavioral proofs.
 *
 * The FINALSCORE_SHADOW / EV_REJECT / maker-taker-pick proofs were console.log-only, so the now-
 * rotating stdout (B-OPS-PM2-LOG #499, ~2d hold) would age them out before the WEEKS-long paper-
 * validation window (STORAGE_POLICY §5.5). This extracts them to `switch_on_shadow_evidence` — a
 * retained (90d hot → tiered), queryable table (migration 2026-07-14-b-evidence-sink.sql).
 *
 * ISOLATION (Langston Flag A): every emit is fire-and-forget through the batch writer's synchronous
 * `enqueueArchiveRow` (no awaits, bounded drop-oldest) and wrapped in an internal try/catch that
 * NEVER throws into the live decision path. On any failure it degrades — the caller's existing
 * console.log remains the evidence-of-last-resort (OBJ-3 dual-write, retired by the post-paper
 * FinalScore field-kill batch, Flag B). A sink insert cannot add latency to, nor throw into, a trade.
 */
import { enqueueArchiveRow, registerArchiveTable } from './archive-batch-writer.js';

const TABLE = 'switch_on_shadow_evidence';

// Column order matches the migration. `evidence_id` is sequence-backed → SQL DEFAULT when undefined.
const COLUMNS = [
  'captured_at', 'evidence_id', 'proof_type',
  'symbol', 'strategy', 'asset_class', 'regime', 'source_pool', 'mode',
  'final_score', 'final_score_threshold', 'would_have_rejected',
  'chosen_net_ev', 'reject_reason',
  'chosen_entry_mode', 'taker_net_ev', 'maker_net_ev_adjusted', 'signal_strength',
  'adverse_selection_pct', 'non_fill_cost_pct', 'maker_fill_probability', 'hard_floor_fired',
];

/** Register the sink's table with the batch writer. Idempotent; call once at startup. */
export function registerSwitchOnEvidenceSink(): void {
  registerArchiveTable(TABLE, COLUMNS, ['evidence_id']);
}

interface CommonCtx {
  symbol: string;
  strategy: string;
  assetClass: string;
  regime?: string | null;
  sourcePool?: string | null;
  mode: string; // 'paper' | 'live'
}

function base(ctx: CommonCtx, proofType: string): Record<string, unknown> {
  return {
    captured_at: new Date().toISOString(),
    evidence_id: undefined, // → SQL DEFAULT (sequence)
    proof_type: proofType,
    symbol: ctx.symbol,
    strategy: ctx.strategy,
    asset_class: ctx.assetClass,
    regime: ctx.regime ?? null,
    source_pool: ctx.sourcePool ?? null,
    mode: ctx.mode,
    // proof-specific columns default to null; each emitter fills only its own
    final_score: null, final_score_threshold: null, would_have_rejected: null,
    chosen_net_ev: null, reject_reason: null,
    chosen_entry_mode: null, taker_net_ev: null, maker_net_ev_adjusted: null, signal_strength: null,
    adverse_selection_pct: null, non_fill_cost_pct: null, maker_fill_probability: null, hard_floor_fired: null,
  };
}

/** (i) SQE shadow — the retired finalScore gate's would-have-rejected verdict. */
export function emitSqeShadow(
  ctx: CommonCtx,
  args: { finalScore: number; threshold: number },
): void {
  try {
    enqueueArchiveRow(TABLE, {
      ...base(ctx, 'sqe_shadow'),
      final_score: args.finalScore,
      final_score_threshold: args.threshold,
      would_have_rejected: args.finalScore < args.threshold,
    });
  } catch (err) {
    warnDegrade('sqe_shadow', ctx.symbol, err);
  }
}

/** (ii) EV_REJECT — the 11.8B open-stage net-EV backstop reject (rate numerator, offending netEV). */
export function emitEvReject(
  ctx: CommonCtx,
  args: { chosenNetEv: number; rejectReason?: string | null },
): void {
  try {
    enqueueArchiveRow(TABLE, {
      ...base(ctx, 'ev_reject'),
      chosen_net_ev: args.chosenNetEv,
      reject_reason: args.rejectReason ?? null,
    });
  } catch (err) {
    warnDegrade('ev_reject', ctx.symbol, err);
  }
}

/** (iii) maker/taker pick + the decision-time haircut snapshot (Phase-25 pFill-calibration substrate). */
export function emitMakerTaker(
  ctx: CommonCtx,
  args: {
    chosenEntryMode: string;
    takerNetEv: number;
    makerNetEvAdjusted: number;
    signalStrength?: number | null;
    adverseSelectionPct?: number | null;
    nonFillCostPct?: number | null;
    makerFillProbability?: number | null;
    hardFloorFired?: boolean | null;
  },
): void {
  try {
    enqueueArchiveRow(TABLE, {
      ...base(ctx, 'maker_taker'),
      chosen_entry_mode: args.chosenEntryMode,
      taker_net_ev: args.takerNetEv,
      maker_net_ev_adjusted: args.makerNetEvAdjusted,
      signal_strength: args.signalStrength ?? null,
      adverse_selection_pct: args.adverseSelectionPct ?? null,
      non_fill_cost_pct: args.nonFillCostPct ?? null,
      maker_fill_probability: args.makerFillProbability ?? null,
      hard_floor_fired: args.hardFloorFired ?? null,
    });
  } catch (err) {
    warnDegrade('maker_taker', ctx.symbol, err);
  }
}

// Degradation path: log once and continue. The caller's own console.log is the evidence-of-last-resort.
function warnDegrade(proofType: string, symbol: string, err: unknown): void {
  console.warn(
    `[B-EVIDENCE-SINK][DEGRADE] proof='${proofType}' symbol='${symbol}' enqueue failed (evidence remains in stdout): ${err instanceof Error ? err.message : String(err)}`,
  );
}
