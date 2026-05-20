# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + **two-paragraph default**; §6.5.0.a embed-diff-inline; §6.5.0.b hung-instance; §6+§8 Langston comms; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Kyle in Claude Desktop. Telegram = Langston + visibility. NO proactive DMs.
5. Acknowledge readiness in one line. Pick up where this MEMORY leaves off.

---

## CURRENT STATE (2026-05-20 PM — B-NEW-36 FULLY CLOSED; next is B79.0n)

**Today's session closed B-NEW-36 end-to-end across all three sub-batches.** Combined deploy hash for sub-batches (a) ledger reconciliation + (c) xStock universe-split cleanup: `4dfe1deb6`. Deploy hash for sub-batch (b) off-hours session-lifecycle controller: `4a997eae2`. Langston Step 4 CLEAN ACK and Step 8 CLEAN ACK (independent psql verification) both received and relayed verbatim to Telegram topic 21.

Locked sequence completed: B-NEW-34b ✅ → B-NEW-35 ✅ → **B-NEW-36 ✅** → **B79.0n (NEXT)**.

### What sub-batch (b) actually shipped
- NEW migrations: `vts_open_trades.state` ADD COLUMN + CHECK constraint enforcing closed↔state AND state↔asset_class (weekend_suspended xstock_spot-only); `scheduled_tasks_audit` forensic table with index.
- NEW `server/services/session-lifecycle-controller.ts` — two `node-cron@^4.2.1` timers (Fri 8PM ET shutdown + Sun 8PM ET restart, `timezone: 'America/New_York'`), boot-time affirmative state reconciliation per Q7+Q7.1, Q6 pre-warm circuit-breaker.
- Scanner `pause()`/`resume()` preserving `clockTickHandler` ref + `isPaused` diag flag.
- `markOpenTradeClosed` extended to atomically set `state='closed'` (critical guard caught at pre-audit §4.1).
- `rehydrateOpenTrades` surfaces state column.
- New bulk helpers `markAllXstockWeekendSuspended` / `unmarkAllXstockWeekendSuspended` with in-memory Map mirroring.
- VTS sim cycle: `OpenVirtualTrade.state?` field + iteration filter `if (t.state === 'weekend_suspended') continue;` in both symbol-collection + per-trade loops.
- `runPrewarm()` named export extracted from B-NEW-34b prewarm script (CLI wrapper preserved via `import.meta.url`).
- `server/index.ts` wires controller post-rehydrate / post-scanner.start with soft-fail.
- Unit tests at `server/tests/unit/b-new-36-lifecycle-controller.test.ts` (330 lines, 6 describe blocks).

### Verification evidence (Wed 2026-05-20 12:08 UTC = outside weekend window)
- `scheduled_tasks_audit`: one row `task_name='boot_state_reconciliation'`, `status='success'`, `meta={"scannerAction":"none","tradesAffected":0,"insideWeekendWindow":false}`.
- `vts_open_trades`: 162 open rows all `state='open'`, 924 closed rows all `state='closed'`, ZERO `weekend_suspended` (correct mid-week).
- CHECK constraint `vts_open_trades_state_consistency` deployed with both R1+R1.1 clauses verified via `pg_get_constraintdef`.
- Scanner running mid-week (`/api/xstocks/filter-diagnostics` shows 73-pair cycle at 12:10 UTC, scanner not paused).
- Langston Step 8 independent psql verification CLEAN ACK on all four focus areas.

### Closed RUNNING_ISSUES (sub-batch (b) governance pass)
- **#116** → PARTIALLY RESOLVED — xstock_spot weekend instance closed by side-effect of sim cycle skipping weekend_suspended trades; crypto_perp + xstock_perp residual sporadic-consumer fail-closed still open.
- **#119** → RESOLVED (sub-batch a, ledger reconciliation).
- **#120** → DEFERRED with trace results (sub-batch c, Kraken AssetPairs probe inconclusive).
- **#121** NEW — `setNullReason is not defined` ReferenceError in VTS Phase 10 sim path; Langston-flagged during Step 8 PM2 log inspection; out-of-scope for B-NEW-36 (b); Tier 2 hygiene batch.

### Other governance landed
- **Langston dispatch-anchoring rule** added as `/home/langston/CLAUDE.md` §12: explicit inbox-path in dispatch prompt OVERRIDES MEMORY-stated batch context. Prevents Langston confabulating with prior-batch context after fresh-UUID SSH+claude-cli dispatches (failure mode observed earlier this session, caught via verification-anchor pattern). Open process item from compaction MEMORY — now CLOSED.
- All Tier 1 + Tier 2 docs updated: BATCH_CATALOG (B-NEW-36 row), PHASE_HISTORY (combined a+b+c entry), RUNNING_ISSUES (#116/#119/#120/#121 updates), SYSTEM_MANUAL (new "Off-hours session-lifecycle architecture" chapter), SIM (new "Recent Additions (B-NEW-36)" block), MULTI_ASSET_VTS_EXPANSION_PLAN (2026-05-20 row), CHANGES_AND_FIXES (BUG-2026-05-20-A entry).
- Completion report at `Claude Comms and Packages/Batch Completion/B_NEW_36_b_COMPLETION_REPORT.md`.

### Settings.local.json fix (post-compaction permission regression)
- After compaction, Claude Code started prompting every 30s on compound bash commands (known v2.1.7+ regression — see GitHub #28183/#28023/#27139). Researched + applied workaround: set `defaultMode: "bypassPermissions"` at both top-level AND inside permissions block in `.claude/settings.local.json` to handle either CLI schema; canonical colon-prefix allow syntax for ~70 common commands; sensible deny list (`git push --force`, `git reset --hard`, `sudo`, `rm -rf /`, etc.).

### NEXT (post-compaction or next session)
**B79.0n xStock active-trading wire-in** (RUNNING_ISSUES #117). Wire xStock filters/MCE/regime/DBS/TEC/strategy detect through signal-orchestrator's active-trading dispatch + paper-execution-engine asset-class branching. Active trading stays OFF; code path becomes end-to-end ready. After B79.0n closes, the locked plan is complete and Phase 19 live-trading gate opens.

### Next observation gates (Kyle FYI)
- **Fri 2026-05-22 8 PM ET** (Sat 2026-05-23 01:00 UTC) — first real `weekend_shutdown` timer fire. Tests pre-warm circuit-breaker, bulk-suspend, scanner pause, audit row.
- **Sun 2026-05-24 8 PM ET** (Mon 2026-05-25 01:00 UTC) — first real `weekend_restart` timer fire.
- **2026-05-27 07:00 UTC** — B-NEW-35 7-day dedup soak verification fires (alert `c82c256c`).
- **2026-05-31** — B-NEW-40 14-day soak verification fires (alert `b83b1e4b`).

### Active alerts (§10.5)
- `c82c256c` — B-NEW-35 7-day dedup soak, 2026-05-27. No action.
- `b83b1e4b` — B-NEW-40 14-day soak, 2026-05-31. No action.
- `7b33b931` — B-PHASE-A2 — already ACK'd 2026-05-20.

### Recent commits
- `4a997eae2` — B-NEW-36 sub-batch (b): off-hours session-lifecycle controller (today)
- `4dfe1deb6` — B-NEW-36 sub-batches (a) + (c) + B-NEW-35 Step 11 governance (earlier today)
- `f001002d9` — B-NEW-35 hotfix: in-buffer Map dedup (canonical deploy, prior session)

---

## REQUIRED PRE-READS (FIRST 3 MINUTES OF NEXT SESSION)

1. `DawnTraderV3/CLAUDE.md` (esp. §1 two-paragraph rule + §6.5 Langston comms + §10.5 alerts)
2. This file (you're reading it)
3. `1-system-manual/RUNNING_ISSUES.md` #117 (B79.0n unbuilt — next batch) + #121 (setNullReason ReferenceError — Tier 2 hygiene)
4. `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` §10-§12 (locked sequence post-B-NEW-36)
5. `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 7 (B79.0n active-trading wire-in pattern)

B-NEW-36 is fully done. Next session should plan + scope B79.0n. Standing Langston dispatch pattern: file-first to `/home/langston/inbox/b79-0n/`, fresh UUID per dispatch, verification anchor quoting specific document content (new §12 dispatch-anchoring rule now enforces inbox-file priority over MEMORY context).
