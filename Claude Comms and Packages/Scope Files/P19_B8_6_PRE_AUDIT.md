# P19-B8.6 — MAKER TARGET-EXITS: Step-2 pre-audit (rev1, 2026-07-15)

> SIM + System Manual consulted for every touched component (active-execution-engine exit
> monitor, the B7.2c pending-maker machinery + its shared pure logic, TEC interplay,
> closed-trade record, B7.2b UI fee-mode column). Scope: `P19_B8_6_SCOPE.md`
> (change-class: architecture). All refs verified at the working tree, post the
> 2026-07-15 venue-only/single-writer cuts.

## 1. The machinery this batch EXTENDS (not invents)

- **The pure decision logic is ALREADY side-aware and reusable verbatim.**
  `pending-maker-logic.ts`: `tradedThrough('sell', price, limit)` = `price >= limit`
  (:21-24) is exactly the honest exit-fill condition (Langston AC-1 by construction —
  the same never-optimistic comparator entries use); `evaluatePendingMaker` (:40-51)
  gives one-outcome-per-tick fill/drop/rest with FILL-WINS precedence; `makerFillPrice`
  (:59-61) pins fill = limit exactly (the OBJ-7 inert-tier CI guard extends to exits).
- **Entry-rest precedent**: `_processPendingMaker` (active-execution-engine :811-855)
  is the pre-pass shape the exit rest mirrors; `maker_max_pending_ms` resolves per class
  via `maker-taker-config.ts:59` (fail-hard).
- **Venue-only pricing (the same-day cut) feeds the pre-pass** — OBJ-8 is structural:
  the only price that can reach the exit-rest evaluation is kraken_ws/kraken_rest.

## 2. Touch points (enumerated, file:line)

1. **Placement seam**: `checkExitConditions` `case 'target_hit'` (:1252-1256) currently
   returns an immediate-close condition. NEW behavior (paper only): write the exit-rest
   fields onto the position (`exit_limit_price` = the target, `exit_rest_placed_at`,
   `exit_deadline` = now + knob) and return `null` — no close this tick; the rest is
   now the exit order. Marketable-at-placement (price already ≥ target — the very
   condition that fired) is the NORMAL case here: the target was just touched. Design
   decision (below §3) governs touch-vs-through.
2. **Exit-rest pre-pass**: in `checkOpenPositions`, for positions carrying
   `exit_limit_price`, run `evaluatePendingMaker({side:'sell', ...})` BEFORE the
   normal exit checks: `fill` → close at the limit with the MAKER fee (0.40%), zero
   slippage by construction, stamps written; `drop` → CONVERT: clear the rest fields
   and let the normal (taker) exit evaluation proceed this tick — the existing
   `closePosition` path books the taker fee + real slippage, which IS Langston AC-2
   (convert friction into realized) with no new accounting code; `rest` → nothing.
3. **STOP PRECEDENCE (the OBJ-3 carve-out, made explicit)**: the stop check runs BEFORE
   the exit-rest fill check each tick. If the stop triggers while a rest is up: cancel
   the rest (clear fields) + stop out as taker immediately. A tick where price gapped
   through BOTH stop and target resolves to the STOP (conservative; document in-code).
4. **Schema**: `active_open_positions` += `exit_limit_price` (decimal), 
   `exit_rest_placed_at` (timestamptz), `exit_deadline` (timestamptz);
   `closed_trades` += `exit_fee_mode` ('maker'|'taker'), `exit_rested_at_price`
   (decimal), `exit_rest_outcome` ('fill'|'convert'|NULL), `exit_rest_duration_ms`
   (integer). All nullable — KEEP-AS-DATA, NULL = pre-B8.6 rows.
5. **Knob**: `maker_taker.exit_maker_max_pending_ms` per class (seed = same values as
   the entry `maker_max_pending_ms`; both classes explicit, no wildcard).
6. **Fill booking**: a maker exit-fill bypasses the depth-walked `closeOrder` (the fill
   is at the limit by construction) — a dedicated close leg mirroring the entry
   MAKER_FILLED semantics: exitPrice = limit, exitFee = notional × makerRate,
   exitSlippage = 0, then the standard closed-trade update with the new stamps.
7. **Denominator surfacing (AC-6)**: fills vs converts countable from
   `exit_rest_outcome`; the rtb-metrics/dashboard read is a COUNT over stamped rows —
   surfaced in the completion evidence + the Closed Trades tab fee-mode column
   (B7.2b's column renders the new maker exits with no UI change; the outcome column
   is additive if wanted — deferred to the diff).

## 3. Design decisions FOR LANGSTON at this pre-audit

- **D1 — placement is at target-TOUCH; fill requires a LATER tick ≥ limit.** The rest
  is placed the tick the target first fires; the SAME tick never both places and fills
  (that would be an optimistic touch-fill — the thing AC-1 prohibits). First subsequent
  venue tick ≥ limit fills. This mirrors real post-only mechanics closely enough for
  the measurement purpose; the alternative (place only when price is BELOW target,
  i.e., pre-position the rest before the signal) is the Phase-21 live design, out of
  scope here.
- **D2 — TEC interplay**: trailing/BE/moonbag are all OFF (verified 2026-07-15: knobs
  false ×4 classes, 15/15 recent closes plain TARGET). The exit-rest path therefore
  only ever interacts with the plain target/stop checks. If TEC modes are ever
  re-enabled, a ratchet while a rest is up is undefined — a guard refuses to place a
  rest when the position's TEC state is non-TARGET, so re-enabling cannot silently
  interact (fail-closed, loud).
- **D3 — VTS parity is OUT of this batch**: the VTS resolve loop keeps its taker exits;
  extending maker exits to VTS is a named follow-up after the paper measurement
  validates the model (avoids double-building before the design is proven).

## 4. Blast radius

- `checkExitConditions` return-shape unchanged (null already means no-exit).
- The pending-maker ENTRY path untouched (separate fields, separate pre-pass).
- `getPortfolioBalanceV2` / realized-P&L reads consume `closed_trades.net_pnl` —
  unchanged semantics; maker exits simply produce smaller fee components.
- Exploration budget/anneal: maker exit-fills close with normal close_reasons
  ('target_hit') — counted as informative closes, correct.
- UI: Open Trades renders positions with a live exit-rest via existing columns (the
  rest is visible as the unchanged open position; an "exit resting" badge is additive
  polish, deferred to the diff); Closed Trades fee-mode column (B7.2b) renders maker
  exits as-is.
- #508 (double-promotion) unaffected; #509 cooldown keys on stop_hit only — a maker
  exit-fill (target_hit) never trips it. Correct.
