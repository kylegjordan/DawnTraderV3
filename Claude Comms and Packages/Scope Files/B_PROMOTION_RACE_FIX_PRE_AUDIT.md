# B-PROMOTION-RACE-FIX — PRE-AUDIT (Step 2)

change-class: architecture
**Owner:** Claude Analyst (CC-C) · Scope: `B_PROMOTION_RACE_FIX_SCOPE.md`. All line numbers at `active-execution-engine.ts` unless noted.

## SIM / System Manual consultation
- **SIM — Cross-Cutting Runtime State:** `checkRtbPromotion` currently holds NO liveness/in-progress state — this batch ADDS a per-instance single-flight flag (a new cross-cutting runtime-state item to register). The open path (`processSignal`) writes to `closed_trades` then `active_open_positions` non-atomically.
- **System Manual:** the signal-pipeline chapter documents RTB → promotion → open. The promotion concurrency model (unguarded, multi-triggered) and the open-path write ordering are the architectural facts this batch changes → System Manual content update at close.

## Component census (§9.5 — who reads/writes/schedules the affected paths)
- **Who SCHEDULES `checkRtbPromotion`:** (1) `continuousPromotionInterval` `setInterval` (`:421`); (2) event handlers on TRADE_CLOSED / TCL_ACTIVATED (doc `:2273`; the event-bus emits TRADE_CLOSED at close). ⇒ **≥2 concurrent-capable triggers, no mutual exclusion.** This is the §9.5(a) "who schedules" census answer: NOT one entry — at least two, and they can overlap.
- **Who WRITES `active_open_positions`:** `createActiveOpenPosition` (`:3288`, open) + `deleteActiveOpenPosition` (`:996`, `:2118` close paths) + the stop-flow cleanup (`active-engine-service.ts:851`). The **`UNIQUE (symbol)` index** (`active_open_positions_symbol_idx`, `shared/schema.ts:1875` — symbol ALONE; the `unique_symbol_side` is the *paper* table, a different object) is the serialization backstop — **but the rejection is NOT surfaced as a throw:** `createActiveOpenPosition` (`storage.ts:3323-3341`) catches the 23505 and silently returns the winner's existing row (I8E-DB-DEDUP), so the loser continues as if it opened (Langston Corrections 1 & 2).
- **Who READS the duplicate guard state:** `checkRtbPromotion` slot calc (`:2288`) + the open-path guard (`:3069`) both read `getActiveOpenPositions`. Both read BEFORE the position is inserted (`:3288`) → the guard is blind to an in-flight open.
- **Who READS `closed_trades` unclosed rows:** the anneal driver `closedExplorationCount` (post-A4: `closed_at IS NOT NULL`, so orphans no longer over-count) + `usedBudgetToday` (opened-today) + the reconciler `reconcileIncompleteTrades` (`active-engine-service.ts:290`, **STOP-flow only** — matches by SYMBOL, so it can't finalize an orphan while a live same-symbol position exists; NOT a reliable orphan sweep).

## (a-ii) Deletion/'compensation'-time state-write census
Adding compensation (delete/finalize the record on position-insert failure) touches state that is READ by: the anneal driver + budget count (both keyed on `admissionBasis`/`closed_at`), the closed-trades display adapter, and any per-trade telemetry. Deleting a never-positioned record removes an artifact no live path depends on (it never had a position, never a lifecycle event). Finalizing-with-reason instead would require adding the reason to the anneal exclusion (coupling) — favouring the DELETE disposition.

## Blast radius
- **Lock (Obj-1):** a per-instance boolean + a guarded entry — behavior change is "a second concurrent trigger skips" (re-attempted by the timer). No change to WHICH signals promote, only that they don't double-run. Risk: the flag must release in a `finally` across ALL early-returns (`:2284/:2295/:2301`) or promotion wedges.
- **Compensation (Obj-2):** a try/catch around one insert + a cleanup call on the failure branch. Only fires on the (rare) constraint violation. No happy-path change.
- **Cleanup (Obj-3):** a one-time UPDATE/DELETE of 3 known rows (MET/ETH/AVAX), verified by id before/after.

## Provenance (§9.5(b))
The double-activation guard (`:2386-2388`, Directive 8.8.4-A3.R1) was built to prevent re-activating the SAME signal-id — it is real and correct for that purpose; this batch does NOT remove it, it adds the missing CONCURRENCY serialization one level up (the guard assumed single-threaded promotion). The `UNIQUE (symbol)` constraint is the existing invariant that (correctly) refuses the duplicate position — the defects are (a) the concurrent unlocked promotion cycles that reach it, and (b) `createActiveOpenPosition`'s SILENT dedup-return (`storage.ts:3323-3341`, I8E) that swallows the rejection so the loser's already-written record is orphaned uncompensated — NOT the constraint itself. **Already filed as #508 (homed P19-B8.5); this batch owns it (M1 reconcile per §13).**

## Open question for Langston (design)
Does locking `checkRtbPromotion` fully cover the open path, or can `processSignal` be reached by another caller (making a per-symbol guard in `processSignal` necessary in addition to the promotion lock)? The Obj-2 compensation covers any residual race regardless, which is why it is defense-in-depth, not either/or.
