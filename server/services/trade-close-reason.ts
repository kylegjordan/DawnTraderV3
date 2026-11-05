/**
 * B-CLOSE-WRITER-COSTS P-15 (pre-audit r3-r7; Kyle KD-17 "never drop a trade") — THE ONE CLOSE-REASON VOCABULARY.
 *
 * Every reason a trade record can be closed with, and whether that close is a TRADE OUTCOME (booked) or not
 * (non_outcome). It is a leaf module on purpose: `storage.ts` needs the lists as VALUES (its SQL binds them), and the
 * engine imports storage, so the engine cannot be the home of a value storage reads without a cycle.
 *
 * ★ THE EXHAUSTIVENESS IS STRUCTURAL: `TRADE_CLOSE_REASON_CLASS` is a `Record<TradeCloseReason, …>`, so a new reason
 * added to the union is a COMPILE ERROR here until it is classed, and in every vocabulary derived from it
 * (`closeReasonMap` in the engine, the two lifecycle diagnostics). The claim is made only for those typed sites.
 * ★ `unknown` at runtime remains for legacy and blank values (a record's reason is written at close, so an open
 * record's reason is blank) — `closeOutcomeClass` never guesses a class for a string it does not know.
 */

/** The close CONDITIONS the engine's exit monitor and flatten produce (the engine's `ExitCondition['type']`). */
export const EXIT_CONDITION_TYPES = [
  'target_hit', 'stop_hit', 'trailing_stop_hit', 'max_holding_period', 'guardrail', 'manual_stop', 'reset',
] as const;
export type ExitConditionType = (typeof EXIT_CONDITION_TYPES)[number];

/**
 * Every reason a trade record is closed with: the engine's exit conditions plus the three writers outside
 * `closePosition` — `never_filled` (a pending maker that never filled, `_dropUnfilledMaker`), `hard_reset`
 * (`closeOpenTradesForHardReset`, an erase) and `engine_stop_cleanup` (`reconcileIncompleteTrades`).
 */
export type TradeCloseReason = ExitConditionType | 'never_filled' | 'hard_reset' | 'engine_stop_cleanup';

export type CloseOutcomeClass = 'booked' | 'non_outcome';

/**
 * The class of every reason. NON-OUTCOME: a never-filled maker is no trade (no fill, no fee owed); a hard reset
 * abandons positions and is an erase, not an outcome (P-13, Langston Q1; `#1154`). Every other reason is a booked
 * trade outcome — `reset` and `manual_stop` are the stop flow's flatten at a real observed price, `guardrail` has 0
 * rows today and is booked by construction (noted at P-15 r3).
 */
export const TRADE_CLOSE_REASON_CLASS: Record<TradeCloseReason, CloseOutcomeClass> = {
  target_hit: 'booked',
  stop_hit: 'booked',
  trailing_stop_hit: 'booked',
  max_holding_period: 'booked',
  guardrail: 'booked',
  manual_stop: 'booked',
  reset: 'booked',
  engine_stop_cleanup: 'booked',
  never_filled: 'non_outcome',
  hard_reset: 'non_outcome',
};

const ALL_REASONS = Object.keys(TRADE_CLOSE_REASON_CLASS) as TradeCloseReason[];

/** The reasons that are NOT a trade outcome — the list every money/count reader excludes (SQL binds it). */
export const NON_OUTCOME_CLOSE_REASONS: readonly TradeCloseReason[] =
  Object.freeze(ALL_REASONS.filter((r) => TRADE_CLOSE_REASON_CLASS[r] === 'non_outcome'));

/** The reasons that ARE a trade outcome — the scoreboard's allowlist (SQL binds it). */
export const BOOKED_CLOSE_REASONS: readonly TradeCloseReason[] =
  Object.freeze(ALL_REASONS.filter((r) => TRADE_CLOSE_REASON_CLASS[r] === 'booked'));

/** Reason-pure classifier. Null, blank or a string outside the vocabulary ⇒ `unknown` (never guessed). */
export function closeOutcomeClass(reason: string | null | undefined): CloseOutcomeClass | 'unknown' {
  if (reason == null || reason.trim() === '') return 'unknown';
  return Object.prototype.hasOwnProperty.call(TRADE_CLOSE_REASON_CLASS, reason)
    ? TRADE_CLOSE_REASON_CLASS[reason as TradeCloseReason]
    : 'unknown';
}
