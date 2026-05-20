# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + **two-paragraph default**; §6.5.0.a embed-diff-inline; §6.5.0.b hung-instance; §6+§8 Langston comms; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Kyle in Claude Desktop. Telegram = Langston + visibility. NO proactive DMs.
5. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-20 — B-NEW-35 FULLY CLOSED including Step 11 governance)

**B-NEW-35 CLOSED.** Code shipped + verified + governance landed. Canonical deploy hash `f001002d9`.

### Step 11 governance landed this session
- `Claude Comms and Packages/Batch Completion/B_NEW_35_COMPLETION_REPORT.md` — full report, 8/8 scope objectives green, Langston independent-verification reproduced.
- `1-system-manual/BATCH_CATALOG.md` — B-NEW-35 row added.
- `1-system-manual/PHASE_HISTORY.md` — B-NEW-35 row added to Phase 24 EXTENDED sub-batches table.
- `1-system-manual/SYSTEM_MANUAL.md` — "Source-side dedup architecture (B-NEW-35, 2026-05-20)" chapter added; prior B-NEW-34 DISTINCT-ON-workaround paragraph updated to point at the new chapter as the structural-correctness model.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — "Recent Additions (B-NEW-35)" block, six new component entries (UPSERT clause, in-buffer Map dedup, UNIQUE constraint cascade, Phase 1 cleanup migrations, deploy-ordering invariant, 5-symbol snapshot gap handoff); B-NEW-34 "PENDING" line updated to "SHIPPED".
- `1-system-manual/RUNNING_ISSUES.md` — #118 closure updated with B-NEW-35 verified state; #119 expanded to note ledger drift count grew with Phase 1+2 SQL applied via psql, reconciliation folded into B-NEW-36 sub-batch (a); #120 NEW = 5-symbol gap (BITF/HOLX/PARA/SAGE/WBA) handoff to B-NEW-36 sub-batch (c).
- `1-system-manual/CHANGES_AND_FIXES.md` — `BUG-2026-05-19-B` entry added at the top of the registry.
- `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — §12 update log two new rows (2026-05-19 re-sequencing + 2026-05-20 ship).
- This file (truth at `~/.claude/projects/.../memory/MEMORY.md`) — closure block.
- `DawnTraderV3/.claude/memory/MEMORY.md` (repo mirror) — pending sync this turn.
- `/home/langston/MEMORY.md` (Hetzner) — pending §10.b sync this turn.

### Operational state confirmed working post-ship
- All three layers of dedup protection live: UNIQUE constraint (DB), UPSERT clause (`ohlc-batch-writer.ts:147-164`), in-buffer Map dedup (`:105-114`).
- Post-fix May 2026 partition row counts (this turn): xstock_perp 278,240 / xstock_spot 1,605,953 / crypto_spot 2,494,122.
- Zero duplicate `(symbol, interval_begin)` rows in any of the 3 tables.
- Scanner cycle wallclock median ~530ms (Langston measurement), >40× recovery from 25s SCAN_TIMEOUT pre-fix.
- Zero `ERROR/FATAL/ON CONFLICT/duplicate key` in `/var/log/dawntrader/out.log` post-deploy.

### 5-symbol gap traced + handed off
Diff result: `XSTOCK_SPOT_REGISTRY` 265 vs `xstock_spot_ohlc_1m_2026_05` distinct symbols 260 = **BITF, HOLX, PARA, SAGE, WBA**. Zero rows for all five in BOTH April and May 2026 source partitions. Empirical Kraken-side absence under canonical symbol form — not a B-NEW-35 bug. Filed as RUNNING_ISSUES #120, assigned to **B-NEW-36 sub-batch (c)** (universe-split cleanup) per Langston scope rev4. None of the five are designated-24/7; scanner active universe unaffected.

### Supabase tier
Small ($15/mo) post-ship. Sequence today: Micro → Small (Kyle upgrade during dedup) → Medium ($60/mo for SPY chunked path) → Small (back to baseline post-ship). Write IO ~20× lower from dedup; read IO ~5× lower.

### Locked plan — what remains

1. ✅ B-NEW-34b snapshot architecture (May 18 night)
2. ✅ B-NEW-35 source-side dedup (May 19-20) — **CLOSED including governance**
3. ⏸️ **B-NEW-36 off-hours session-lifecycle controller** — scope rev4 FINAL ACK by Langston at commit `5b9f91b40`. Three sub-batches: (a) `_migrations` ledger reconciliation [#119]; (b) lifecycle controller — Fri 8PM ET shutdown + Sun 8PM ET restart hooks; (c) xStock universe-split cleanup (retire XSTOCK_SPOT_24_7_SYMBOLS designation; folds in the #120 5-symbol gap trace). Pre-audit gate: CLEAR. Begin Step 2 pre-audit next.
4. ⏸️ **B79.0n xStock active-trading wire-in** (#117) — last in queue.

### Active alerts (§10.5)
- `b83b1e4b` — B-NEW-40 14-day soak verification scheduled 2026-05-31. No action.
- `c82c256c` — B-NEW-35 7-day dedup soak scheduled 2026-05-27. No action until then.
- `7b33b931` — B-PHASE-A2 telemetry verify — ACK'D 2026-05-20.

### Commits (B-NEW-35 timeline, ending at canonical deploy hash)
- `e1facf6cd` `756f3a25d` `4c473ff33` `75f73c930` `16efd9c3b` `1fe3b6829` `cd7e2aefe` `323538cf7` `aea5adb00` — Phase 1 SQL evolution + scope/pre-audit
- **`f001002d9`** — Phase 3 code-deploy + in-buffer Map dedup hotfix (canonical deploy)

---

## REQUIRED PRE-READS

1. `DawnTraderV3/CLAUDE.md` (esp. §1 two-paragraph rule)
2. This file
3. `Claude Comms and Packages/Batch Completion/B_NEW_35_COMPLETION_REPORT.md` — closure paper trail.
4. `Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md` (rev4 final, Langston ACK — NEXT batch)
5. `1-system-manual/RUNNING_ISSUES.md` #117 (B79.0n unbuilt), #119 (ledger drift, folded into B-NEW-36 sub-batch a), #120 (5-symbol gap, folded into B-NEW-36 sub-batch c)
