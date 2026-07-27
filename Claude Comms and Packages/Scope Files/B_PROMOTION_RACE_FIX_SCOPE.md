# B-PROMOTION-RACE-FIX — SCOPE

change-class: architecture

**Owner:** Claude Analyst (CC-C) · Kyle-directed 2026-07-28 ("proceed as suggested", after the orphan-trace) · **DESIGN REVIEW REQUESTED FROM LANGSTON BEFORE IMPLEMENTATION** (core-engine concurrency — the approach has real choices).

## PROBLEM (verified in current code + live data — the orphan trace)
Three exploration crypto trades (MET 07-15, ETH + AVAX 07-18) are **orphaned**: a `closed_trades` record with entry data, NO live position, and never closed (`closed_at` NULL, `close_reason` NULL). They are the only 3 true orphans in all history (census confirmed), and each is one half of a **same-second duplicate pair** (identical entry_price + quantity, 30-48ms apart), all `chosen_entry_mode=maker`, all exploration.

**Root cause (two verified parts):**
1. **Concurrency source — `checkRtbPromotion()` (`active-execution-engine.ts:2277`) has NO concurrency lock** and is triggered by BOTH a continuous timer (`continuousPromotionInterval` `setInterval`, `:421`) AND event handlers (TRADE_CLOSED / TCL_ACTIVATED, doc `:2273`). When two triggers fire near-simultaneously, two promotion cycles run concurrently, read the same queue snapshot (`getRankedSignals` `:2307`), and promote+open the same signal. The double-activation guard (`:2386-2388`, RTB-remove-before-execute) prevents re-promoting the *same signal-id within one cycle* but does NOT serialize concurrent cycles.
2. **Orphan mechanism — the open path (`processSignal`) is not atomic.** The duplicate guard (`:3069`) reads `active_open_positions`; the position isn't inserted until `createActiveOpenPosition` (`:3288`), ~220 lines / ~30ms later. Two concurrent same-symbol opens both pass the guard (no position yet), both write the trade record (`createClosedTrade` `:3203`), then the **`UNIQUE (symbol, side)` constraint** on `active_open_positions` lets ONE insert succeed — the other throws and its already-written record is **orphaned with no compensation.**

**Status:** still-present vulnerability (rare — needs a ~30ms trigger collision on the same signal). None since 07-18, likely because #532's retirement (07-22) removed a third concurrent queue-driver, lowering the collision rate — but the flaw remains.

## OBJECTIVES
1. **Serialize promotion — single-flight guard on `checkRtbPromotion`** so two cycles can never run concurrently. **Design choice for Langston:** (a) skip-if-in-progress (simplest; a skipped trigger is re-attempted by the next timer tick) vs (b) a re-run-requested flag (no missed promotion, slightly more state). Recommendation: (a) — the continuous timer re-attempts within seconds; note the re-run option.
2. **Compensate the non-atomic open — no stranded record if the position insert fails.** **Design choice for Langston:** (a) wrap `createActiveOpenPosition` (`:3288`); on failure DELETE the just-written record (`trade.id`); (b) finalize it (closed_at + `close_reason='dup_position_race'` + excluded from aggregates); (c) REORDER position-before-record so a rejected position writes no record (cleanest but riskiest — the ~85-line window may depend on the record existing). Recommendation: (a) delete — the record never represented a real trade; least coupling (no anneal-exclusion needed).
3. **Clean up the 3 existing orphans** (MET/ETH/AVAX) consistent with the chosen disposition (delete, or finalize-as-`dup_position_race`). Kyle-authorized. Also removes 3 of the 4 over-counts the A4 anneal fix flagged.

## VERIFICATION
- Unit test: two concurrent `checkRtbPromotion` calls → only one runs (single-flight). Unit test: `createActiveOpenPosition` throws → no orphan record remains.
- Post-deploy: re-run the true-orphan census → **0** true orphans. Backend (no UI surface); the exploration anneal/budget count becomes exact.
- CI 4-green; deploy in a coordinated window (engine restart).

## GOVERNANCE (architecture doc-set)
scope (this) + pre_audit + completion_report + BATCH_CATALOG + PHASE_HISTORY + PHASE_19_PLAN §5 + SYSTEM_MANUAL (the promotion concurrency model + open-path atomicity) + SIM (checkRtbPromotion single-flight state; open-path compensation) + RUNNING_ISSUES (open a numbered entry for the orphan-race). MEMORY_CC_C + Langston MEMORY sync.
