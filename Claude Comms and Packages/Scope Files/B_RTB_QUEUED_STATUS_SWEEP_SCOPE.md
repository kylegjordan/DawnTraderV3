# B-RTB-QUEUED-STATUS-SWEEP — SCOPE (Step 1, r1)

change-class: non_architecture

**Issue:** `#1204` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 59g (after 59f) · **Owner:** CC-B (NEW Claude)
*Read at `origin/migration/aws-supabase` after `c4e7244f5`; staging read 2026-10-17 ~09:40Z UTC.*

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (`#1204`): two reads of the dead `'queued'` status. NOW: four code reads, plus the column default that would put a row there. REASON:** the predicate census (below) also finds `tcl_watchdog.ts:167` and `routes.ts:12245`; and `rtb_signals.status` defaults to `'queued'` (`shared/schema.ts:2137`; staging `column_default 'queued'::rtb_signal_status`).

## 0. What is there
- **Live rows (staging, 2026-10-17 ~09:40Z):** 27, all `paper | reconfirmed`. 0 `queued`, 0 `promoted`.
- **Status writers at the ref:** `active` — the only insert, `upsertRtbSignal` from `queueSQESignal` (`ready_to_buy_service.ts:2447`) · `reconfirmed` (`:1189`) · `expired` (`:1705`) · `promoted` — **only** `removeSignalBySymbol` (`:586`), which can never match. ⇒ `'queued'` and `'promoted'` are written by nothing that runs.
- **Readers of `'queued'` (census of the predicate, tests excluded):** `removeSignalBySymbol` (`:580`) · the legacy leg of `getQueuedSignals` (`:1530-1536`) · **`tcl_watchdog.ts:167`** `getLivePoolCount` (adds a `queued` count into the TCL threshold total and logs it) · **`routes.ts:12245`** SQL `status IN ('queued', 'active', 'reconfirmed')` (queue depth) · `routes.ts:4909` a UI label case (`'promoted'` beside it at `:4907`). Comments only: `:2302`, `:991`.
- **The promotion cleanup (`registerPromotionHandler`, `:535-567`):** subscribes to `PROMOTION`, calls `removeSignalBySymbol`, and broadcasts `rtb:cleared` only if it returned true — so it never broadcasts. `PROMOTION` has one emitter (`active-execution-engine.ts:5373`, after the open) and three subscribers: this handler and the C13/C14 validation services (`c13-validation-service.ts:117`, `c14-validation-service.ts:137`, untouched). **The queue row is already gone by then:** the engine deletes it through the claim *before* opening (`readyToBuyService.promoteSignal(signal.id)`, `:5352`, opens only on `'deleted'`). Measured, Langston: 20 open positions, 0 `rtb_signals` rows sharing a symbol.
- **⚠️ Why the broadcast must NOT be switched back on:** its one consumer, the RTB table (`client/src/components/trading/ready-to-buy-table.tsx:128-131`), **clears the whole table** on any `rtb:cleared` — it ignores `symbol`. Reviving it would blank the Ready-to-Buy table on every promotion until the next 30 s refetch (`:100`). `rtb:cleared` stays for the whole-queue clear it was built for (`clear-routines.ts:27`, reset / stop trading).
- *Log control, stated:* `out.log` today holds 0 `RTB_CLEANUP` lines **and** 0 `Successfully promoted` lines — the control is also zero (retention hours, Saturday), so the log says nothing either way. The mechanism above rests on the code.

## 1. Provenance (TIER 1) and the five dispositions
- **`registerPromotionHandler` + `removeSignalBySymbol`** — Directive 8.8.4-A1, introduced `754b9779a` (2025-12-17), commit message verbatim: *"Saved progress after completing a task"* — no intent recorded; the intent is the docstring's (`:531-533`): *"When a signal is promoted to active trade, immediately remove it from RTB queue and broadcast rtb:cleared to all clients."* Superseded by Directive 8.8.4-A3.R1 (removal **before** trade creation, the claim at `:5352`) and by A3.R8 (2025-12-18: new rows written `active`, only the plural reader widened — `DELETED_COMPONENTS_LOG`, the row-59f entry). Reusing `rtb:cleared` for a single symbol is **INFERRED-FROM-CODE** as a mismatch with C.14.D, which built the listener for whole-queue clears. → **Disposition 5 (disconnected, stays disconnected — delete, rule 18).**
- **The `'queued'` legs** (`getQueuedSignals`, `tcl_watchdog`, the routes SQL and label) — the A3.R8 *"backward compatibility"* leg (its own comment, `:1531`) for rows written before 2025-12-18; none has existed since. → **Disposition 5 — delete.**
- **The column default `'queued'`** — the original schema default; the one insert sets `status` explicitly. Once the readers go, a row inserted without a status would sit in a status nothing reads. → **Disposition 2 (relevant, needs updating): DROP the default**, so an insert without a status fails at the database (no hard-coded fallback for a decision value) and the insert type requires it at compile time.
- **The enum values** `queued` / `promoted` / `rejected` — left in `rtb_signal_status` intentionally: removing a Postgres enum value is a table rewrite for no behaviour; listed as "left intentionally" in `DELETED_COMPONENTS_LOG`.
- Ledger searched: `#1204`, `#1190` (row 59f), `#558`, `DELETED_COMPONENTS_LOG`, `B_RTB_REFRESH_LIVE_PRICE_PRE_AUDIT.md` (it lists `removeSignalBySymbol` among the `updateRtbSignal` callers).

## 2. Objectives
1. **Delete** `registerPromotionHandler`, the `promotionHandlerRegistered` field and `removeSignalBySymbol`; archive per rule 18. **Test:** constructing the service adds no `PROMOTION` listener; the names are absent.
2. **Delete the `'queued'` reads:** the `getQueuedSignals` leg, the `tcl_watchdog` count term (and its log field), `'queued'` in the `routes.ts:12245` IN-list, and the `'queued'` / `'promoted'` label cases at `routes.ts:4907-4909` (the `default` branch already shows a raw status). **Test:** `getQueuedSignals` and `getLivePoolCount` query only `active` + `reconfirmed`.
3. **Drop the column default** — migration + tracked rollback + MANIFEST entry; `shared/schema.ts:2137` loses `.default("queued")`. **Test:** `tsc` proves every insert passes a status; the insert path's status stays `'active'`.
4. **Verify (Step 7):** after deploy, the TCL count line no longer prints `queued=`; the queue depth and the RTB table read as before (27-ish rows, unchanged values); a promotion leaves the table populated.

**Docset (non_architecture):** scope, pre-audit, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `DELETED_COMPONENTS_LOG` + archive, **System Impact Map** (the RTB service loses its `PROMOTION` subscription — a removed component edge; judged applicable), System Manual §19 judged (RTB status lifecycle line, if it lists `queued`).
**Out of scope:** the C13/C14 `PROMOTION` subscribers; the enum values.
