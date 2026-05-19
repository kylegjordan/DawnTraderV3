# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language; §6.5.0.a embed-diff-inline; §6.5.0.b hung-instance checking; §6+§8 Langston comms; §10.5 per-turn alerts).
2. Read this file.
3. **§10.5 alerts check (mandatory every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"` — surface any unack'd active entries.
4. Kyle messages me in Claude Desktop. Telegram = Langston comms + outbound visibility. **No proactive DMs to Kyle.**
5. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; use jargon in Kyle-facing summaries; assume — verify.

---

## 🚨 IMMEDIATE POST-COMPACT ACTION (Kyle directive 2026-05-19 23:00 UTC)

**B-NEW-35 source-side dedup is IN FLIGHT.** Scope + pre-audit + Langston Step 1+2 ACK all done; consensus reached. Per Kyle proceed-on-consensus authorization, implementation began. Supabase Micro→Small tier upgrade was the unblocker.

### Phase 1 dedup status (as of session-end / pre-compact)

| Table | Status | Detail |
|---|---|---|
| xstock_perp_ohlc_1m | ✅ COMPLETE | 3.22M rows deleted (97%), 271K remain, VACUUM clean |
| xstock_spot_ohlc_1m | 🟡 IN FLIGHT (per-symbol bash loop) | Started ~22:20 UTC; ~3M deleted of ~14M expected by completion; ETA ~80 more min |
| crypto_spot_ohlc_1m | ⏸️ QUEUED | Run serially after xstock_spot to avoid IO contention |

**Per-symbol bash loop is the working approach.** Earlier DO-block attempts (rev1-rev6) all failed because PG's statement_timeout counts whole DO blocks as one statement regardless of internal COMMITs. Per-symbol psql calls each get fresh 2-min budget.

**Script:** `/tmp/dedup_per_symbol.sh xstock_spot_ohlc_1m` (staged on staging at deploy user). To restart: `ssh root@188.245.193.8 "su - deploy -c '/tmp/dedup_per_symbol.sh xstock_spot_ohlc_1m'"`.

### Post-Phase-1 step-by-step

**Phase 2 — ADD UNIQUE constraints:** `psql -f drizzle/migrations/2026-05-19-b-new-35-phase2-add-unique-constraints.sql` on staging. Then manual `INSERT INTO _migrations` for all 4 Phase 1+2 files with bypass comment "B-NEW-35 bypass — ledger reconciliation pending in B-NEW-36 sub-batch (a)". Per RUNNING_ISSUES #119.

**Phase 3 — Deploy UPSERT code:** Code already committed (commit `1fe3b6829` and earlier). Just `ssh staging "su - deploy -c 'cd /home/deploy/dawntrader && npm run build && pm2 restart dawntrader'"`.

**Phase 4 — Re-pre-warm + spot check:**
- Pre-state spot-check: capture last-3 bucket OHLCV values for AAPL/JPM/JNJ/BABA/GLD from snapshot table BEFORE re-pre-warm.
- Run: `npm run b-new-34b:prewarm -- --days 14` (should complete in 5-15 min on clean source).
- Post-state spot-check: re-query same buckets; values should match within ±0.01%.

**Phase 5 — Verify scanner:** Watch `[B79.0a][SCAN_CYCLE_DONE]` log lines. Expect `pairs_scanned ≥ 65` with `db_roundtrip_ms < 5000`. Also expect new `[B-NEW-34b][SNAPSHOT_READ]` + `[SNAPSHOT_WRITEBACK]` telemetry. Then `ack` system-alert `7b33b931` (B-PHASE-A2 telemetry verify).

**Step 11 completion report:** Write `Claude Comms and Packages/Batch Completion/B_NEW_35_COMPLETION_REPORT.md` covering all 5 phases + empirical results + governance file changes.

**Governance updates (MANDATORY per Step 10):** SIM (add 5 B-NEW-35 components), System Manual (add chapter), RUNNING_ISSUES (#119 update + B-NEW-35 close + add B-NEW-37 follow-up for aggregator DISTINCT-ON-CTE removal), MULTI_ASSET_VTS_EXPANSION_PLAN row, BATCH_CATALOG entry. THEN sync Langston's MEMORY per §10.b.

### Open commits on `migration/aws-supabase` (newest first)

- `cd7e2aefe`, `323538cf7` — B-NEW-35 Phase 1 SQL evolution rev3/rev4/rev5 (per-symbol via index seek + recursive CTE + ROW_NUMBER). NOTE: these SQL files are superseded by `/tmp/dedup_per_symbol.sh` bash loop approach — the SQL files in repo are STALE for the actual deploy path. Update them post-success.
- `e1facf6cd` — B-NEW-35 scope rev1
- `4c473ff33` — B-NEW-35 Step 2 pre-audit + Phase 1-3 SQL/code initial
- `75f73c930` — B-NEW-35 Phase 1 R1 (per-chunk COMMIT)
- `1fe3b6829` — B-NEW-35 Phase 1 rev3 + the **committed UPSERT change in `ohlc-batch-writer.ts`** (key Phase 3 artifact)
- `756f3a25d` — B-NEW-35 scope rev2 (Langston Step 1 ACK)
- `5b9f91b40`, `f02196411`, `8033939af` — B-NEW-36 scope rev4/3/2 (on hold pending B-NEW-35 close)
- `686d13ae4` — B-NEW-34b governance
- `4fd780c3d`, `d9031fe8d` — B-NEW-34b core (shipped 2026-05-18 night)

### Active alerts (§10.5)

- `7b33b931` — B-PHASE-A2 telemetry verify, active+unack'd since 2026-05-18, **DEFER until scanner recovers + first cycles with new code emit `CYCLE_DBS_TIMING`** then ack with `npm run system-alerts -- ack 7b33b931 --by cc-session-<date>`.
- `b83b1e4b` — B-NEW-40 14-day soak verification, scheduled 2026-05-31. No action this side.

### Key facts to remember

- Supabase tier: **Small** (Kyle upgraded from Micro 2026-05-19 to unblock IO budget). 2GB RAM, 196 Mbps baseline IO. ~$15/mo on Pro. Can downgrade post-B-NEW-35 once write IO drops ~20× from dedup.
- Q9 confirmed: all 10 "designated 24/7" xStock names empirically have ZERO weekend trading activity (verified Sat 14-15 ET window). The `XSTOCK_SPOT_24_7_SYMBOLS` set is stale code — B-NEW-36 retires it.
- B-NEW-36 scope is FINAL ACK'd by Langston at rev4 — three sub-batches: (a) ledger reconciliation, (b) lifecycle controller, (c) universe-split cleanup. Begins after B-NEW-35 closes.
- B79.0n active-trading wire-in (RUNNING_ISSUES #117) still last in queue.

---

## REQUIRED PRE-READS ON SESSION START

1. `DawnTraderV3/CLAUDE.md`
2. This file (especially IMMEDIATE POST-COMPACT ACTION)
3. `1-system-manual/RUNNING_ISSUES.md` entries #117, #118, #119 (B-NEW-34a abandoned; B-NEW-34b shipped; ledger drift)
4. `Claude Comms and Packages/Scope Files/B_NEW_35_SCOPE.md` (rev2, consensus) + `B_NEW_35_PRE_AUDIT.md` (rev1, all 7 deliverables)
5. `Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md` (rev4, Langston FINAL ACK, on hold pending B-NEW-35)
6. The `/tmp/dedup_per_symbol.sh` script on staging (the working dedup tool — not yet committed to repo)
