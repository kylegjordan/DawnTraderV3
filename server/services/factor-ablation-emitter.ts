/**
 * B67.0 — Factor Ablation Emitter
 *
 * Captures, on every regime classification, the real classifier decision plus
 * N alternate decisions (one per confidence-modifying factor). Each alternate
 * is computed elsewhere as "what would the classifier have decided if this
 * factor were absent?" — this service just persists the records.
 *
 * The nightly replay-ablation.ts job picks up these rows after the corresponding
 * trade closes, replays each alternate against the actual price path, and
 * populates `replay_outcome` + `replay_completed_at`.
 *
 * Key design points (per BATCH_67_SCOPE.md §4 + BATCH_67_PRE_AUDIT.md §6.4):
 *
 * - Confidence-modifying factors covered (each adds rows to this table): B67.1
 *   macro modifier, B67.2 phase dimension, B67.4 outcome feedback, B68.1 multi-
 *   timeframe DBS agreement, B68.2 volume regime, B68.3 pair correlation, B68.4
 *   regime age, B68.5 Path B sustainability.
 *
 * - Admission-gating factors (B67.3 per-underlying limits) use a separate
 *   universe-split A/B mechanism (deterministic pair_id_hash on the trade
 *   record). This emitter does NOT handle B67.3.
 *
 * - Emit is gated on `module_constants.ablation_framework.b67_0_ablation_emit_enabled`.
 *   Default `true`. Setting to `false` disables emit globally without code change.
 *
 * - Emit is fire-and-forget. We intentionally do NOT await persistence in the
 *   hot path because any DB latency on the classifier's per-pair cycle would
 *   compound across pairs. Errors are logged but do not propagate — the
 *   classifier continues regardless of emitter health.
 *
 * - Storage growth is linear in factor_count × signal_count. Estimated 1k rows
 *   per day at current VTS scale (10 factors × 100 signals/day). Retention
 *   policy lives in `b67_0_alternates_retention_days` (default 90) and is
 *   enforced by replay-ablation.ts (deletes rows older than retention threshold
 *   after rolling up daily aggregates).
 *
 * Reference: BATCH_67_SCOPE.md §4
 * Schema:    shared/schema.ts :: regimeFactorAlternates
 * Migration: drizzle/migrations/2026-04-28-b67-0-regime-factor-alternates.sql
 */

import { db } from '../db.js';
import { regimeFactorAlternates, type InsertRegimeFactorAlternate } from '../../shared/schema.js';
import { getConstant } from './module-constants-service.js';

/**
 * The real (or alternate) regime classification decision.
 *
 * Captures the minimum information needed to (a) describe what the classifier
 * decided and (b) replay the trade outcome under that decision later. Schema
 * intentionally permissive — additional fields can be added without schema
 * change because real_decision and alternate_decision are JSONB.
 */
export interface RegimeDecision {
  /** Regime label string per `CANONICAL_REGIMES` — e.g., 'TREND_FRIENDLY_STABLE'. */
  regimeLabel: string;
  /** Classifier confidence, 0..1, after all modulators applied (or absent). */
  confidence: number;
  /** Whether the signal would admit downstream under this decision. */
  admissionPossible: boolean;
  /** Optional regime-related metadata (e.g., DBS, phase) — extensible. */
  metadata?: Record<string, unknown>;
}

/**
 * One factor's alternate decision for a single signal evaluation. Each B67/B68
 * sub-deliverable that's a confidence-modifying factor produces one of these
 * per signal it sees, by recomputing the classifier output as if its specific
 * contribution were absent.
 *
 * `factorState` records which scenario the alternate represents:
 * - `alternate_disabled` = "what if THIS factor were OFF and others kept their
 *   real state?" — the typical case for measuring contribution
 * - `alternate_enabled` = "what if THIS factor were ON and others kept their
 *   real state?" — used during initial deploy when the factor's `enabled` flag
 *   is FALSE (factor is shadow-only) and we want to measure what the WOULD-BE
 *   contribution looks like
 */
export interface FactorAlternate {
  /** Factor identifier — e.g., 'b67_1_macro_modifier', 'b68_1_multi_tf_dbs'. */
  factorName: string;
  /** Which alternate scenario this row represents. */
  factorState: 'alternate_disabled' | 'alternate_enabled';
  /** The decision the classifier would have made under this alternate scenario. */
  alternateDecision: RegimeDecision;
}

/**
 * Source identity for an ablation record. Discriminates the active-trading
 * path (writes a trading_signals row, has integer signalId) from the VTS
 * path (no trading_signals row, has its own string trade-record id).
 *
 * The DB schema enforces XOR via a CHECK constraint — exactly one of
 * signalId / vtsTradeId is populated.
 */
export type AblationSource =
  | { kind: 'active_signal'; signalId: number }
  | { kind: 'vts_trade'; vtsTradeId: string };

/**
 * Persist a single evaluation's real decision + N factor alternates.
 *
 * Fire-and-forget. Errors are logged; classifier continues regardless. Returns
 * void so callers don't accidentally `await` and block their hot path. (If a
 * caller really does need confirmation of write, it can read back the rows
 * from regime_factor_alternates.)
 *
 * @param source       — discriminated source identity (active signal or VTS trade)
 * @param pairSymbol   — pair identifier for filtering / grouping
 * @param realDecision — what the classifier actually decided (committed to RTB / VTS / paper / etc.)
 * @param alternates   — zero or more factor-level alternates; emit is a no-op when empty
 */
export function emitAblationRecord(
  source: AblationSource,
  pairSymbol: string,
  realDecision: RegimeDecision,
  alternates: FactorAlternate[],
  strategy: string | null = null,
): void {
  if (!alternates || alternates.length === 0) {
    // No factors to record — common during B67.0-only deploy before B67.1+ ships.
    return;
  }

  const sourceLabel =
    source.kind === 'active_signal'
      ? `signal=${source.signalId}`
      : `vts_trade=${source.vtsTradeId}`;

  // Fire-and-forget. We catch + log inside the async block so the synchronous
  // caller never sees the rejection.
  void persistRecord(source, pairSymbol, realDecision, alternates, strategy).catch((err) => {
    console.error(
      `[B67.0][ablation-emitter] Failed to persist ablation record for ${sourceLabel} pair=${pairSymbol}:`,
      err instanceof Error ? err.message : err,
    );
  });
}

async function persistRecord(
  source: AblationSource,
  pairSymbol: string,
  realDecision: RegimeDecision,
  alternates: FactorAlternate[],
  strategy: string | null,
): Promise<void> {
  // Gate on module_constants flag. If disabled, skip silently. Default `true`
  // when the row is missing to preserve "deploy lights-on" behavior; the
  // migration seeds the row explicitly so this fallback is only relevant if
  // someone hand-edits / drops the row.
  //
  // NOTE (Langston review breadcrumb 2026-04-28): the empty resolution key `{}`
  // means the emit toggle is GLOBAL only — there's no per-(exchange, asset_class,
  // strategy, regime) override path today. Sufficient for B67.0. If B68/B69
  // wants to disable ablation per-dimension (e.g., "skip ablation for
  // crypto_perp because storage cost is too high"), pass dimension hints in
  // the resolution key and seed dimension-specific rows. Today: global on/off.
  const enabled = await getConstant<boolean>(
    'ablation_framework',
    'b67_0_ablation_emit_enabled',
    {},
  );
  if (enabled === false) {
    return;
  }

  // Bulk insert: one row per (source, factor). The classifier already has a
  // per-cycle pattern; rolling up to N rows per evaluation keeps DB write
  // count proportional to factor count without round-tripping per factor.
  const sourceFields =
    source.kind === 'active_signal'
      ? { sourceType: 'active_signal' as const, signalId: source.signalId, vtsTradeId: null }
      : { sourceType: 'vts_trade' as const, signalId: null, vtsTradeId: source.vtsTradeId };

  const rows: InsertRegimeFactorAlternate[] = alternates.map((alt) => ({
    ...sourceFields,
    pairSymbol,
    // B67.0.1 (2026-04-30): persist strategy for (pair_symbol, evaluated_at,
    // strategy) natural-key join in replay-ablation. Per Langston cc-inbox #864.
    strategy,
    // B69: explicit asset class + exchange (not DB-default-reliant).
    // v1: all ablation is crypto_spot on kraken. When multi-asset-class trading
    // goes live, the caller (signal-orchestrator / vts-runner) will pass these
    // as parameters to emitAblationRecord.
    exchange: 'kraken',
    assetClass: 'crypto_spot',
    factorName: alt.factorName,
    factorState: alt.factorState,
    realDecision: realDecision as unknown as Record<string, unknown>,
    alternateDecision: alt.alternateDecision as unknown as Record<string, unknown>,
  }));

  await db.insert(regimeFactorAlternates).values(rows);
}

/**
 * Public surface for B67.1+ producers.
 *
 * Each factor implementation builds a FactorAlternate by recomputing its own
 * classifier contribution under the alternate scenario, then passes the array
 * of alternates to emitAblationRecord. The emitter is intentionally agnostic
 * to which factors exist — it just persists what producers hand it.
 *
 * Example wire-in (will land in B67.1):
 *
 *   const realDecision: RegimeDecision = { ... computed by market-regime.ts ... };
 *   const alternates: FactorAlternate[] = [];
 *
 *   if (b67_1_macro_modifier_enabled) {
 *     const decisionWithoutMacro = recomputeWithoutMacroModifier(...);
 *     alternates.push({
 *       factorName: 'b67_1_macro_modifier',
 *       factorState: 'alternate_disabled',
 *       alternateDecision: decisionWithoutMacro,
 *     });
 *   }
 *
 *   emitAblationRecord(signalId, pair, realDecision, alternates);
 */
