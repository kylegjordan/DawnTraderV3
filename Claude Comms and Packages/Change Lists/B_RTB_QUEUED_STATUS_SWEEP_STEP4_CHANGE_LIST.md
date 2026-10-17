# B-RTB-QUEUED-STATUS-SWEEP — Step 4 change list (row 59g, `#1204`)

**Code commit:** `7ae6329f6` · **Audit (approved):** `Scope Files/B_RTB_QUEUED_STATUS_SWEEP_PRE_AUDIT.md` · **Owner:** CC-B

## Gate A — the deletions (rule 18; archive `1-system-manual/_archive/deleted-code/b-rtb-queued-status-sweep.removed`)
- `ready_to_buy_service.ts`: `registerPromotionHandler`, `promotionHandlerRegistered`, the constructor call, `removeSignalBySymbol`, the now-unused `eventBus` / `PromotionEvent` import; `cleanupExpiredSignals`; the `getQueuedSignals` `queued` leg (docstring names the two live statuses); `:991` comment rewritten (no other writer of a queued row's fields remains).
- Callers: engine start (`active-execution-engine.ts`, the A3.R2 #6 block), startup Step 3 (`trading-bootstrap.ts`), force-refresh route (`routes.ts`; `expired=` and `expiredCount` dropped from the log and JSON — no reader in client / shared / scripts).
- `tcl_watchdog.ts` `getLivePoolCount`: `queued` term, its log field and the docstring.
- `routes.ts`: `'queued'` out of the queue-depth `IN` list; the whole `uiStatus` field (zero readers).
- `storage.ts`: **`updateRtbSignal` deleted** — after this batch its only production caller (`removeSignalBySymbol`) is gone. Surfaced by the deletion-time census, folded (§9.4 disposition 1, same class). The FSM-isolation probes that called it on the mocked storage now write the fixture table directly.
- Client `ready-to-buy-table.tsx`: `|| 'queued'` fallback, `promoted` / `expired` colour arms, union narrowed to `'active' | 'reconfirmed'` (drops the non-enum `'executed'`).
- `logRtbTrace` insert transition: `'none' → 'active'`.
- `:2302` is LEFT: it records that the deleted tiebreak read `'queued'` — still true history.

## Gate B — schema and migration
- `shared/schema.ts`: `status` loses `.default("queued")`; `promotedAt`, `expiredAt`, `promotedTradeId` removed. Edited per line, line endings preserved (the file is mixed).
- `drizzle/migrations/2026-10-17-b-rtb-queued-status-sweep.sql` (hand-written; MANIFEST; tracked rollback): `ALTER COLUMN status DROP DEFAULT`; `DROP COLUMN IF EXISTS promoted_at, promoted_trade_id, expired_at`. Touches no index — `#1006` (the four-wide drizzle snapshot) stays open.
- **Your A3 conditions:** `promoted_trade_id` taken with `promoted_at`. **I also took `expired_at`** — same class: no writer (expiry is an immediate DELETE since A3.R9.0), no reader, 0 non-null of 24 on staging — please confirm. `finalScore` / `expiresAt` stay with `#558`. The evidence is the mechanism (the sole `promoted_at` writer sat inside a `status:'queued'` branch no writer can produce), stated in the migration header; DELETED_COMPONENTS_LOG at Step 10.

## Gate C — the exit enumeration (your GATE 2)
- `active-funnel-tracker.ts` and `ACTIVE_PATH_FLOW.md` now enumerate the **six** production exits with line text, re-derived at the edited file, not decremented: (1) `refreshAndRank` duplicate pair `ready_to_buy_service.ts:866` · (2) `refreshAndRank` bulk `:1193` · (3) `expireSignal` via `reEvaluateQueue` `:1553` · (4) `promoteSignal`, the claim `:1595` · (5) `clearQueue` `:2049` · (6) `POST /active-engine/clear-data` `routes.ts:11461`. The stale `aee:2223` "promoted fires" line is replaced by the real site (`aee:5380`, the counter after the claim deletes the row). The same number in `p19-b8-4-active-funnel-tracker.test.ts` is reworded.

## Gate D — tests
- `b-rtb-queued-status-sweep.test.ts` (9): `getQueuedSignals` and the TCL count ask for exactly `active` + `reconfirmed`; no `PROMOTION` listener; fences on every deleted name, the retired reads, the schema (this table only — `rtb_shadow_pairings` keeps its own `promoted_trade_id`), the migration and the rollback.
- `b79-0n-rtb-fsm-isolation.test.ts` T3.4 → `['active','reconfirmed']`, the `queued` and `promoted` seeds now asserted NOT surfaced.
- tsc baseline 335 = 335.

## Step 7, your GATE 1 (the instrument)
Primary: `getQueueFailureStats()` count unchanged across the restart (the P19-B3b counter `signal-orchestrator.ts:1506` → `recordQueueFailure` → `[RTB_QUEUE_DROP][CRITICAL]`), with zero `23502` / `null value in column "status"` lines beside it; plus ≥ 1 `rtb_signals` row with `queued_at` after the restart and `status='active'`.

**Also folded:** `#1124` / plan row 134a carries your §13 `rtb_shadow_pairings.promoted_trade_id` item (disposition 2).
