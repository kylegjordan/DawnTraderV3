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

### Supabase tier — Small (downgraded 2026-05-20)
Kyle downgraded back to Small tier ($15/mo, 2GB RAM, 196 Mbps baseline IO) post-B-NEW-35-ship. Confirmed comfortable for post-fix workload (write IO dropped ~20× from dedup, read IO ~5×). Tier sequence today: Micro (initial) → Small (Kyle's first upgrade during dedup) → Medium (needed for heavy-symbol cleanup) → Small (back to baseline post-ship).

### Locked plan — what remains

Original 4-step plan locked May 18 evening + re-sequenced today:

1. ✅ B-NEW-34b snapshot architecture (May 18 night)
2. ✅ B-NEW-35 source-side dedup (May 19-20 — JUST SHIPPED)
3. ⏸️ **B-NEW-36 off-hours session-lifecycle controller** — scope FINAL ACK'd by Langston at rev4. Three sub-batches: (a) `_migrations` ledger reconciliation [#119]; (b) lifecycle controller — Fri 8PM ET shutdown + Sun 8PM ET restart hooks; (c) xStock universe-split cleanup (retire XSTOCK_SPOT_24_7_SYMBOLS designation; empirically not supported per Q9). Pre-audit gate: CLEAR (Langston ACK'd at rev4 + Q9 empirically confirmed). Begin Step 2 pre-audit in next session.
4. ⏸️ **B79.0n xStock active-trading wire-in** (#117) — wire xStock filters / MCE / regime / DBS / TEC / strategy detect through signal-orchestrator's active-trading dispatch + paper-execution-engine asset-class branching. Active trading stays OFF; codepath becomes end-to-end ready. Last in queue.

### Langston independent verification (2026-05-20 ~07:30 UTC) — VERIFIED ✅
Empirical checks all passed against staging at deployed commit `f001002d9`:
- xstock_perp 277,970 / xstock_spot 1,604,733 / crypto_spot 2,492,118 (expected ~280K / 1.59M / 2.47M)
- 0 duplicate (symbol, interval_begin) rows in any of the 3 tables
- UNIQUE constraints present on all 3
- Hotfix Map dedup verified at ohlc-batch-writer.ts:105-114
- Zero DB errors in /var/log/dawntrader/out.log post-deploy
- Scanner cycle wallclock: median ~530ms (last 20 cycles, range 275-1077ms) — BETTER than the 1.3s CC reported
- DBS compute 1-8ms, pairs_with_dbs 73-74/75

### Deferred for fresh session (folded into B-NEW-35 Step 11 + minor next-batch items)

- **B-NEW-35 Step 11 completion report.** Multi-page write-up. Empirical numbers + Langston verification + commit log all ready in this MEMORY.
- **B-NEW-35 governance updates (MANDATORY):** SIM (add 5+ components), System Manual chapter on source-side dedup, RUNNING_ISSUES #118/#119 closure, MULTI_ASSET_VTS_EXPANSION_PLAN row, BATCH_CATALOG entry. Per CLAUDE.md §3. **Use `f001002d9` as canonical deploy hash** (Langston flagged my earlier `19e80f76b` was the post-deploy governance commit, not the deploy itself).
- **NEW investigation item (Langston flag):** trace why the xStock 60-min snapshot has 260 symbols (not 265). 5-symbol gap from pre-warm result. Possible causes: 5 symbols had no source rows in the 14-day look-back window, 5 dropped from XSTOCK_SPOT_REGISTRY between pre-warm and now, or silent-skip in the snapshot path. Not blocking (scanner still reads 73-74/75 universe). Trace + document in Step 11 OR roll into B-NEW-36 sub-batch (c) since universe-cleanup is in scope there anyway.
- **B-NEW-35 7-day soak verification SCHEDULED ✅** Alert id `c82c256c-66e3-4ce4-a6c9-c8ef4041bdbf`, triggers `2026-05-27T07:00:00Z` (state=scheduled). Verifies: zero duplicate (symbol, interval_begin) rows persisted across all 3 _ohlc_1m tables 7 days post-ship + Supabase Disk IO burst budget consumption stays under 30 percent per day. Per Kyle directive + Langston suggestion.

### Active alerts (§10.5)
- `b83b1e4b` — B-NEW-40 14-day soak verification scheduled 2026-05-31. No action.
- `c82c256c-66e3-4ce4-a6c9-c8ef4041bdbf` — **NEW** B-NEW-35 7-day dedup soak scheduled 2026-05-27. No action until then.
- `7b33b931` — B-PHASE-A2 telemetry verify — ACK'D 2026-05-20.

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
