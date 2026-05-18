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

**For Langston dispatches:** embed diff snippets inline + explicit "DO NOT cd to gdrive" (per §6.5.0.a). Check status at 5-10 min, kill+re-dispatch by 12 min max (per §6.5.0.b). File-first protocol per §6.5.0 for any prompt >3KB.

---

## CURRENT STATE (2026-05-18 night, post-B-NEW-34b ship)

**B-NEW-34b SHIPPED.** Snapshot architecture deployed. Scanner recovery in progress as I write.

### What just happened (chronological, condensed):
- Mon 2026-05-18 13:30 UTC ARCA reopened — scanner went into `insufficient_history=75` every cycle (60h lookback < 48h weekend close + ~21× B74 source-row duplication crushed the DISTINCT ON dedup).
- B-NEW-34a hotfix iterations (240h, 168h, 120h) ALL failed — first two SCAN_TIMEOUT, 120h partial recovery but unreliable. Kyle directive 22:25 UTC: abandon lookback-tuning entirely.
- B-NEW-34b designed + implemented + Langston Step 4 ACK (3 findings actioned: Finding 1 sql.raw → TODO B-NEW-35 hygiene; Finding 2 timestamp type verified ✓; Finding 3 nit-only). Q1-Q7 design ACK applied (write-back N=24, source_bar_count=0 sentinel ok, 24h overlay ok, default 120h preserved with WARNING, 240-min DEAD comment added, 3 override unit tests added).
- Deployed via Langston-approved psql bypass (NOT via runner — see #119 ledger drift below): `psql -f` the migration + manual `INSERT INTO _migrations` + `npm run b-new-34b:prewarm` + `npm run build` + `pm2 restart`.

### Commits on `migration/aws-supabase`:
- `d9031fe8d` — B-NEW-34b initial implementation (snapshot table + prewarm script + cache mod + aggregator override param).
- `4fd780c3d` — Langston Step 4 revisions.
- Stagings now points at `4fd780c3d` (pulled + built).

### Verification gates ahead:
1. Pre-warm finishes (5-15 min runtime; populates 265 symbols × up to 60 buckets = ~16k rows in `xstock_spot_ohlc_60m_snapshot`).
2. `pm2 restart dawntrader` (NOT done yet — must wait for pre-warm to be meaningfully populated; the current PM2 process is still on the pre-B-NEW-34b code).
3. First scanner cycle post-restart should show:
   - `pairs_scanned > 0` and `insufficient_history` near zero (down from 75)
   - New `[B-NEW-34b][SNAPSHOT_READ]` log lines with bar counts
   - `[B-NEW-34b][SNAPSHOT_WRITEBACK]` log lines (write-back-on-miss)
   - `db_roundtrip_ms` well under the 25s budget (target single-digit seconds for the snapshot read + 24h live overlay)
4. Govern (SIM, System Manual, BATCH_CATALOG, PHASE_HISTORY) + Step 11 completion report.
5. Move to Step B (B-NEW-36 off-hours session-lifecycle controller).

---

## 🚨 MANUAL PRE-WARM PROTOCOL (interim — until B-NEW-36 ships, per Langston Q7 ACK)

**Until the B-NEW-36 lifecycle controller automates the Fri-shutdown + Sun-startup snapshot refresh:**

Anyone restarting the staging xStock scanner — for ANY reason (deploy, restart, infra recovery, etc.) — **MUST run the pre-warm script BEFORE restart**:

```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && npm run b-new-34b:prewarm -- --days 14'"
```

Then build + restart:

```bash
ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && npm run build && pm2 restart dawntrader'"
```

**Why:** the cache's write-back-on-miss path keeps the snapshot ≤5 min stale DURING active scanning, but a long downtime window (>24h) lets the snapshot go stale beyond the cache's 24h live overlay window, opening a gap for 24/7 names. Pre-warm refreshes everything to NOW.

Pre-warm takes 5-15 min. Idempotent (ON CONFLICT DO UPDATE). Use `--symbols AAPL/USD,MSFT/USD` flag for partial reruns; `--dry-run` for validation.

---

## OPEN GAPS

- **#117 — xStock active-trading wire-in (B79.0n) NEVER SHIPPED.** Sequenced last in the 4-item plan (after B-NEW-34b ✓, B-NEW-36, B-NEW-35).
- **#116 — TEC refresh-on-demand misses sporadic-consumer classes.** Solved as a side-effect of B-NEW-36 (sim cycle skips weekend-suspended trades → no consumer call → no fail-closed).
- **#119 — `_migrations` ledger drift (17 migrations applied without ledger record).** New entry tonight. Langston direction: separate ~1-2 hr investigation batch; verify each pending migration's DDL effects in DB, INSERT into `_migrations` where present, run via `db:migrate` where absent.

### B-NEW-34b deferred (per Langston Q6 ACK — pick up in B-NEW-36 or Step 9 follow-up):
- Cache merge-logic unit tests (need DB fixture or mock — not in tonight's scope)
- Cache write-back-on-miss unit tests
- Finding 1 sql.raw IN/VALUES → `ANY($1::text[])` parameterization refactor (tracked as TODO B-NEW-35 in code; functionally safe today)

---

## OPERATIONAL FACTS (current as of 2026-05-18 ~21:10 UTC)

- PM2 still on `935094a48` (B-NEW-34a-tune2 120h) pre-B-NEW-34b restart. New B-NEW-34b code is in `dist/` post-build but not yet running.
- `xstock_spot_ohlc_60m_snapshot` table created on staging (migration recorded in `_migrations`).
- Pre-warm script in-flight; ~24s/symbol at current rate; expected completion ~21:50-22:00 UTC.
- B-PHASE-A2 telemetry verification alert `7b33b931` still ACTIVE/UNACK'D. Will be re-runnable once scanner recovers + cycles fire normally.
- B-NEW-40 14-day soak verification alert `b83b1e4b` fires 2026-05-31T12:46:47Z (untouched).
- Supabase Disk IO Budget warning received 2026-05-18 ~14:40 ET — depleting-not-exhausted. B-NEW-34b reduces per-cycle DB IO ~75-85% vs the 120h live path (snapshot read is cheap PK-indexed scan; live aggregator now narrow 24h not wide 120h).
- Recent commits on `migration/aws-supabase`: `d9031fe8d` (B-NEW-34b implementation), `4fd780c3d` (Langston Step 4 revisions).

---

## REQUIRED PRE-READS ON SESSION START

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `1-system-manual/RUNNING_ISSUES.md` entries #117, #118 ✓ B-NEW-34b shipped, #119 ledger drift, #116
4. `Claude Comms and Packages/Langston Design Asks/B_NEW_34b_design_review_rev1.md` (Step 4 review + 7-question design ACK + deploy-blocker direction)
5. `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` row dated 2026-05-18 (snapshot architecture + lifecycle controller sequence)
6. `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` — Phase A.3 NEXT (gated on scanner being healthy AND B-NEW-36 lifecycle controller for weekly reliability)
