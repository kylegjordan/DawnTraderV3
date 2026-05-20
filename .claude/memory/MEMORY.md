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

## CURRENT STATE (2026-05-20 02:00 UTC — B-NEW-35 SHIPPED)

**B-NEW-35 COMPLETE.** Scanner recovered. All 5 phases verified.

### What shipped
- **Phase 1 dedup:** all 3 partitioned tables. xstock_perp: 3.22M deleted (97%). xstock_spot: 14M+ deleted across main pass + retry + SPY chunked. crypto_spot: 6.4M+ deleted. Post-dedup row counts (May 2026 partitions): xstock_spot 1.59M, crypto_spot 2.47M, xstock_perp 280K.
- **Phase 2 UNIQUE constraints** on (symbol, interval_begin) for all 3 _ohlc_1m tables.
- **Phase 3 UPSERT code deploy** (commit `f001002d9`) — ohlc-batch-writer.ts now uses `ON CONFLICT DO UPDATE` + in-buffer dedup hotfix (the "ON CONFLICT cannot affect row twice" failure caught & fixed mid-deploy).
- **Phase 4 pre-warm re-run:** 265 symbols in 206 seconds, 0 errors (vs 9+ hours with 26 failures yesterday).
- **Phase 5 scanner verified:** SCAN_CYCLE_DONE tick=60 + tick=90, 74/75 pairs scanned in ~1.3s cycle time. DBS telemetry firing (CYCLE_DBS_TIMING dbs_compute_ms=2 pairs_with_dbs=73).
- **Alert `7b33b931` (B-PHASE-A2 telemetry verify) ACK'D** by cc-session-2026-05-20.

### Operational state confirmed working
- Archiver UPSERTs successful: `[B74][batch-writer] xstock_spot upserted N rows` / crypto_spot / xstock_perp — ongoing flushes every 5s, ~10-50 rows per flush (vs 90-200 pre-dedup, 5× cleaner).
- Scanner cycle DB time: ~1s (was 25s timeout).
- No more "ON CONFLICT cannot affect row a second time" errors.
- All three layers of dedup protection in place: UNIQUE constraint (DB), UPSERT clause (code), in-buffer dedup (code).

### Commits
- `f001002d9` — in-buffer dedup hotfix
- `aea5adb00` — MEMORY mid-deploy handoff
- `f001002d9` ... back through Phase 1 SQL iterations
- `e1facf6cd` `4c473ff33` `75f73c930` `1fe3b6829` `cd7e2aefe` `323538cf7` — Phase 1 SQL evolution
- `756f3a25d` — scope rev2 Langston ACK

### Supabase tier — SAFE TO DOWNGRADE
Currently Medium ($60/mo) — was bumped during dedup. Post-fix write IO dropped ~20× (no more 18-56× row duplication), read IO ~5× (queries scan deduped data). Small tier ($15/mo) should comfortably handle ongoing operations. **Kyle approved downgrade — safe to revert now.**

### Locked plan — what remains

Original 4-step plan locked May 18 evening + re-sequenced today:

1. ✅ B-NEW-34b snapshot architecture (May 18 night)
2. ✅ B-NEW-35 source-side dedup (May 19-20 — JUST SHIPPED)
3. ⏸️ **B-NEW-36 off-hours session-lifecycle controller** — scope FINAL ACK'd by Langston at rev4. Three sub-batches: (a) `_migrations` ledger reconciliation [#119]; (b) lifecycle controller — Fri 8PM ET shutdown + Sun 8PM ET restart hooks; (c) xStock universe-split cleanup (retire XSTOCK_SPOT_24_7_SYMBOLS designation; empirically not supported per Q9). Pre-audit gate: CLEAR (Langston ACK'd at rev4 + Q9 empirically confirmed). Begin Step 2 pre-audit in next session.
4. ⏸️ **B79.0n xStock active-trading wire-in** (#117) — wire xStock filters / MCE / regime / DBS / TEC / strategy detect through signal-orchestrator's active-trading dispatch + paper-execution-engine asset-class branching. Active trading stays OFF; codepath becomes end-to-end ready. Last in queue.

### Deferred for fresh session

- **B-NEW-35 Step 11 completion report.** Multi-page write-up. Has all the empirical numbers ready in this MEMORY + the commit log.
- **B-NEW-35 governance updates (MANDATORY):** SIM (add 5+ components), System Manual chapter on source-side dedup, RUNNING_ISSUES #118/#119 closure, MULTI_ASSET_VTS_EXPANSION_PLAN row, BATCH_CATALOG entry. Pattern is post-batch governance per CLAUDE.md §3.

### Active alerts (§10.5)
- `b83b1e4b` — B-NEW-40 14-day soak verification scheduled 2026-05-31. No action.
- `7b33b931` — B-PHASE-A2 telemetry verify — **ACK'D 2026-05-20**.

---

## REQUIRED PRE-READS

1. `DawnTraderV3/CLAUDE.md` (esp. §1 two-paragraph rule)
2. This file
3. `Claude Comms and Packages/Scope Files/B_NEW_35_SCOPE.md` + `B_NEW_35_PRE_AUDIT.md` (consensus reached + 7 deliverables documented — Step 11 completion report will reference these)
4. `Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md` (rev4 final, Langston ACK — NEXT batch)
5. `1-system-manual/RUNNING_ISSUES.md` #117 (B79.0n unbuilt), #118 (B-NEW-34a abandoned), #119 (ledger drift)
