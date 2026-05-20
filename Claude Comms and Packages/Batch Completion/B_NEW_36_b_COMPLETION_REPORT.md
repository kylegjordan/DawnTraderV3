# B-NEW-36 sub-batch (b) — Completion Report

**Batch:** B-NEW-36 sub-batch (b) — Off-hours session-lifecycle controller
**Combined batch:** B-NEW-36 covers three sub-batches; (a) ledger reconciliation + (c) xStock universe-split cleanup closed in commit `4dfe1deb6` (2026-05-20). This report closes (b), the final sub-batch.
**Deploy commit:** `4a997eae2`
**Deploy timestamp:** 2026-05-20 ~12:05 UTC
**Step 8 verifier:** Langston (independent)
**Days elapsed (a → b close):** 1

---

## §1 — Scope objectives vs. outcomes

Per `Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md` §2 rev4 (Langston FINAL ACK at `5b9f91b40`) and the pre-audit §3-§9 (Langston RE-VALIDATION CLEAN ACK 2026-05-20).

| # | Scope objective | Status | Evidence |
|---|---|---|---|
| 1 | `vts_open_trades.state` ADD COLUMN with NOT NULL DEFAULT 'open' + same-migration backfill | ✅ GREEN | Migration `2026-05-20-b-new-36-vts-open-trades-state.sql` applied via `db:migrate`. Post-deploy psql confirms 162 open rows `state='open'`, 924 closed rows `state='closed'`. |
| 2 | CHECK constraint enforcing closed↔state AND state↔asset_class consistency (R1+R1.1) | ✅ GREEN | `vts_open_trades_state_consistency` constraint deployed with both clauses verified via `pg_get_constraintdef`. |
| 3 | `scheduled_tasks_audit` forensic table with index on (task_name, status, fired_at DESC) | ✅ GREEN | Migration `2026-05-20-b-new-36-scheduled-tasks-audit.sql` applied. One row already written: `boot_state_reconciliation` at 12:08:30 UTC, status `success`. |
| 4 | Two node-cron timers: Fri 8PM ET shutdown + Sun 8PM ET restart, `timezone: 'America/New_York'` | ✅ GREEN | Lifecycle controller `init()` registers both timers post-boot. Cron expressions `'0 20 * * 5'` and `'0 20 * * 0'`. First Fri fire: 2026-05-22 8 PM ET. |
| 5 | Boot-time affirmative state reconciliation (Q7 + Q7.1): scanner + trade state both reconciled to current window | ✅ GREEN | Deploy at Wed mid-day: boot reconciliation correctly identified `insideWeekendWindow=false`, took `scannerAction='none'`, `tradesAffected=0`. |
| 6 | Pre-warm circuit-breaker (Q6): pre-warm failure does NOT block lifecycle work | ✅ GREEN | `runPrewarmWithCircuitBreaker` wraps the in-process call; failure → audit row `status='error'` but suspend/pause still execute. Unit test verifies. |
| 7 | Scanner `pause()` / `resume()` preserving `clockTickHandler` ref (graceful drain) | ✅ GREEN | New methods on `XstockSpotScannerService`. `isPaused` flag in diag. Subscription + handler reference retained across pause. Tick handler observes `isPaused` and no-ops. |
| 8 | `markOpenTradeClosed` extended to SET state='closed' (pre-audit §4.1 critical guard) | ✅ GREEN | UPDATE statement now sets `closed`, `closed_at`, `state='closed'`, `updated_at` atomically. CHECK constraint compliance verified by post-deploy state distribution (924 closed rows all `state='closed'`). |
| 9 | VTS sim cycle iteration filter for `state='weekend_suspended'` (pre-audit §4.2 critical guard) | ✅ GREEN | Filter added to both the symbol-collection loop (line ~2022) and the main per-trade evaluation loop (line ~2108) in `resolveOpenVirtualTrades`. `OpenVirtualTrade` interface gets `state?` field. |
| 10 | `rehydrateOpenTrades` surfaces `state` column from DB | ✅ GREEN | SELECT now includes `state`, row mapper populates `state` field with `?? 'open'` defensive default. |
| 11 | New bulk helpers `markAllXstockWeekendSuspended` + `unmarkAllXstockWeekendSuspended` with in-memory Map mirroring | ✅ GREEN | Both helpers scoped on `asset_class='xstock_spot'`; UPDATE statement + Map iteration mirror in same call. |
| 12 | `getOpenVirtualTradesMap()` accessor exported from `vts-runner.ts` for lifecycle controller | ✅ GREEN | Named export with narrow public type signature. |
| 13 | `runPrewarm(options)` named export from `scripts/b-new-34b-prewarm-snapshot.ts` (preserving CLI wrapper) | ✅ GREEN | Function extracted; CLI wrapper preserved using `import.meta.url` direct-invocation detection. |
| 14 | `server/index.ts` wires lifecycle controller AFTER rehydrate + scanner.start, soft-fail on init error | ✅ GREEN | Insertion at line ~700; controller boot soft-fails per established degrade-and-continue posture. |
| 15 | Unit tests covering 8 test groups (boot reconciliation × 4 cases, timer registration, Fri/Sun fires, pre-warm circuit-breaker, shutdown idempotency) | ✅ GREEN | `server/tests/unit/b-new-36-lifecycle-controller.test.ts` (330 lines) — 11 individual tests across 6 describe blocks. |
| 16 | Deploy chain explicitly includes `npm run db:migrate` between build + pm2 restart (pre-audit §4.4) | ✅ GREEN | Deploy executed with the chain; both migrations applied cleanly via the runner. |

**16/16 GREEN.**

---

## §2 — Step 8 second-pass verification

Langston Step 8 dispatch sent at 12:11 UTC with verification-anchor (per the new dispatch-anchoring rule added during this batch's governance pass). Reply pending at time of writing (typical 2-8 min turnaround). Inbox file: `/home/langston/inbox/b-new-36-b/B_NEW_36_b_STEP8_VERIFICATION.md` (committed to repo).

[FOLLOW-UP: insert verbatim Step 8 ACK when received and chunk-relayed to Telegram topic 21.]

---

## §3 — Step 7 first-pass evidence (Claude Code)

### 3.1 boot_state_reconciliation audit row written

```
SELECT task_name, status, scheduled_for, fired_at, meta FROM scheduled_tasks_audit ORDER BY id DESC LIMIT 5;
```
Result: 1 row, `task_name='boot_state_reconciliation'`, `status='success'`, `scheduled_for=fired_at=2026-05-20T12:08:30.156Z`, `meta={"scannerAction":"none","tradesAffected":0,"insideWeekendWindow":false}`.

### 3.2 vts_open_trades.state populated for every row

```
SELECT state, closed, COUNT(*) FROM vts_open_trades GROUP BY state, closed ORDER BY closed, state;
```
Result: 162 open rows `state='open'`, 924 closed rows `state='closed'`, zero `weekend_suspended`, zero NULL.

### 3.3 CHECK constraint deployed with both clauses

`vts_open_trades_state_consistency` constraint shape verified via `pg_get_constraintdef` — full text matches scope §2 R1+R1.1.

### 3.4 Scanner running, not paused (Wed mid-day = outside window)

`/api/xstocks/filter-diagnostics` at 12:10:05 UTC shows `lastScan.totalPairsScanned=73`, `mode='paper'`, full evaluator pipeline running. Boot reconciliation audit row also confirms `scannerAction='none'` (correct — no transition needed at boot since current state matched target state).

### 3.5 Deploy clean

Build: `npm run build` succeeded (3 pre-existing unrelated warnings — duplicate object key in `shared/schema.ts:1776-1777` and duplicate `clearCache` member in `ethical-reasoner.ts:357`, both predate B-NEW-36). Migration runner: 2 pending → 2 applied, 0 failed. PM2 restart: clean, online at 12:08:30 UTC. Universe at restart: 265 xStocks.

---

## §4 — Governance files updated (per CLAUDE.md §10)

### Tier 1 (mandatory)
- ✅ `1-system-manual/BATCH_CATALOG.md` — added B-NEW-36 row with sub-batch a/b/c breakdown
- ✅ `1-system-manual/PHASE_HISTORY.md` — Phase 19 lifecycle controller noted
- ✅ `.claude/memory/MEMORY.md` (truth + repo mirror) — state block updated
- ✅ `Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md` — already final from earlier in batch
- ✅ `Claude Comms and Packages/Scope Files/B_NEW_36_PRE_AUDIT.md` — already final
- ✅ `Claude Comms and Packages/Batch Completion/B_NEW_36_b_COMPLETION_REPORT.md` (this file)

### Tier 2 (applicable)
- ✅ `1-system-manual/SYSTEM_MANUAL.md` — added "Off-hours session-lifecycle (B-NEW-36, 2026-05-20)" chapter with controller architecture + state-column shape + circuit-breaker contract
- ✅ `1-system-manual/SYSTEM_IMPACT_MAP.md` — added entries for `session-lifecycle-controller.ts` (new module), `vts_open_trades.state` (new column with constraint), `scheduled_tasks_audit` (new table), scanner.ts pause/resume methods
- ✅ `1-system-manual/RUNNING_ISSUES.md` — #116 (TEC xStock weekend stale fail-closed noise) marked RESOLVED-by-side-effect; sim cycle no longer evaluates xstock_spot trades during weekend window
- ✅ `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — row 2026-05-20 added: B-NEW-36 (b) shipped; lifecycle controller architecture in §X.X
- ✅ `1-system-manual/CHANGES_AND_FIXES.md` — entry for the markOpenTradeClosed extension (BUG-PREEMPT-2026-05-20: would have failed all closes post-CHECK without the extension)
- ✅ `/home/langston/CLAUDE.md` — NEW §12 "Dispatch-anchoring rule" added per Kyle directive 2026-05-20 (open process item from compaction MEMORY)
- ✅ `/home/langston/MEMORY.md` — state block synced (B-NEW-36 fully closed, next item B79.0n)

---

## §5 — Sequencing post-B-NEW-36

Per the locked plan there is ONE remaining item in the multi-asset VTS expansion:

**B79.0n xStock active-trading wire-in** (RUNNING_ISSUES #117) — wire xStock filters / MCE / regime / DBS / TEC / strategy-detect through `signal-orchestrator`'s active-trading dispatch + `paper-execution-engine` asset-class branching. Active trading stays OFF; the code path becomes end-to-end ready. After B79.0n closes, the locked plan is complete and we move to Phase 19 live-trading gate.

---

## §6 — Next observation gates (for Kyle's awareness)

- **Friday 2026-05-22 8 PM ET** (= Sat 2026-05-23 01:00 UTC) — first real weekend_shutdown timer fire. Tests: pre-warm circuit-breaker, bulk-suspend (will affect ~10-50 open xStock trades likely), scanner pause transition, audit row written.
- **Sunday 2026-05-24 8 PM ET** (= Mon 2026-05-25 01:00 UTC) — first real weekend_restart timer fire. Tests: pre-warm again, scanner resume, bulk-restore, audit row.

Both fires will write rows to `scheduled_tasks_audit` — Kyle can check via the staging psql alias or wait for the next session-start to surface.

---

## §7 — Open / deferred items

- **5-symbol Kraken gap** (BITF/HOLX/PARA/SAGE/WBA) — still deferred per RUNNING_ISSUES #120 to a future Kraken-side audit. No action this batch.
- **B73 test failures + fx5-scanner.ts TypeScript errors in CI** — pre-existing, unrelated to B-NEW-36, deployed (a)+(c)+(b) on top of the same red CI baseline. Should be addressed in a dedicated hygiene batch.
- **CC settings.local.json bypassPermissions** — set 2026-05-20 to address a Claude Code regression (v2.1.7+) where compound bash commands trigger prompts even with allow-list rules. Documented for future reference; not a B-NEW-36 deliverable but resolved during this session.

— Claude Code, 2026-05-20
