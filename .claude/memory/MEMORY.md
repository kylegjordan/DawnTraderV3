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

**For Langston dispatches:** embed diff snippets inline + explicit "DO NOT cd to gdrive" (per §6.5.0.a). Check status at 5-10 min, kill+re-dispatch by 12 min max (per §6.5.0.b). Never let polling loops run unbounded. File-first protocol per §6.5.0 for any prompt >3KB.

---

## 🟢 JUST CLOSED (2026-05-17)

- **B-PHASE-A2** — xStock DBS foundation. Commits `e84657110` → `9cdafa7df` → `2a9341b87` → `ba2689141` → `d567399bc` → `e7f9902f2` → `a418a7731` (6 sub-tasks A→F + pg ESM fix). PM2 #294. Closes the synthesized-neutral DBS gap for xStocks: every pair with ≥48 archive bars + ATR>0 + registry sector now gets a real DBS computed pre-cycle + threaded through MCE end-to-end. **Mirror invariant honored** (component weights/lookback/EMA byte-identical to crypto; no pre-emptive equity-tune). Two-instance store (`directionalBiasStore` crypto unchanged + new `xstockDirectionalBiasStore` mode='xstock' with GICS partition + dual floor); 265-entry sector mapping (11 GICS + 3 special buckets, 26 ADR-flagged, 11 cryptoAdjacent-flagged); 8 xstock_spot module_constants rows; new `xstock_dbs_backfill` table populated 31,481 rows / 260/265 symbols / all 14 sector tags. Langston Step 1+2+4(BLOCKER fix)+8 ACK'd. CI baseline held +2 passing tests. Companion ref doc `xstock_sector_mappings_reference.md`. Completion: `B_PHASE_A2_COMPLETION_REPORT.md`.

- **B-NEW-42b** — price-discontinuity detector + TEC integration. Earlier 2026-05-17. PM2 #293. All 3 confirmed B-NEW-42 exit-side gaps closed structurally.

- **B-NEW-42** — Phase 0 audit (DIRTY verdict). Spawned B-NEW-42b.

- **B-NEW-40 + B-NEW-41** — closed earlier 2026-05-17.

## 🟡 OPEN GAP (accepted via Option A — Kyle directive 2026-05-17)

- **Entry-side discontinuity gating NOT BUILT.** Detector covers EXIT decisions only. Scanner does NOT consult detector before opening positions. Phase 19 live-trading prep adds entry-side counterpart.

## 🚨 CRITICAL DIRECTIVE BEFORE PHASE A.3 (Kyle 2026-05-18)

**xStock infrastructure has been routing into VTS-only since B79.0m (RUNNING_ISSUES #117).** Active-trading wire-in batch B79.0n was planned but NEVER SHIPPED. All xStock batches since (B79.0m.a, B79.0m.b, B79.0m.b2, B-NEW-14, B-NEW-34, B-NEW-42b, B-PHASE-A2) inherited the same gap. Kyle standing directive (re-confirmed 2026-05-18): wire active-trading code path now, full testing deferred to Phase 19.

**Locked plan order:**
1. PAUSE further xStock infrastructure additions in the current VTS-only pattern.
2. **B79.0n — Active-trading wire-in batch.** Wire xStock filters / MCE / regime / DBS / TEC / all strategy detect paths into signal-orchestrator's active-trading dispatch. Active trading stays OFF; the code path becomes end-to-end ready. Estimated 5-10 days.
3. **B-PHASE-A2 DBS becomes a consumer that flows automatically through B79.0n** — no extension to A.2 needed; the singleton + registry sector data + MCE non-crypto branch are all in place. B79.0n threads `propagatedDbs` from `getLatestXstockGlobalDbsSnapshot()` into the orchestrator's xStock-handling code path.
4. **Off-hours session-lifecycle controller batch** after B79.0n — proactive Fri 8PM ET wind-down + Sun 8PM ET re-up (vs current short-circuit). Coordinates scanner / signal-orchestrator / paper-execution-engine / TEC cache via explicit session state.

Phase A.3 verification can run in parallel with B79.0n design if the verification logic doesn't depend on active-trading-path outcomes — confirm before opening.

---

## ⏳ NEXT — Phase A.3 (DBS verification gate)

**Plan reference:** `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` Phase A.3.

**What:** compare xStock DBS distributions vs crypto distributions at component level (slope / return / EMA / final score). Confirm values are moving (not stuck at zero or floor/ceiling). **Volume-weighted-median skew analysis** (Langston design rev2 C7): inspect whether top-5 xStock names exceed 60% volume weight — if severe, post-A.3 calibration considers equal-weighted alternatives.

**Live ARCA-open telemetry verification gate (FIRST ACTION when ARCA opens):**
- Scheduled alert `7b33b931-aeb5-4a25-adc8-60fa0ba2e1e3` fires **2026-05-18T13:35Z** (Mon 13:30 UTC ARCA opens; 5min margin).
- Steps per the alert body: (1) `ssh root@188.245.193.8 'pm2 logs dawntrader --lines 200 --nostream | grep -E "B-PHASE-A2.CYCLE_DBS_TIMING"'` should show per-cycle log every 30s with dbs_compute_ms <50ms and pairs_with_dbs in 50-200 range. (2) `grep -E "B-PHASE-A2.FIRST_FLOOR_CLEAR"` should show one log per session when both floors first clear. (3) `psql -c "SELECT count(*) FROM xstock_dbs_backfill"` should be >30000. (4) Navigate via Claude-in-Chrome to staging xStocks tab; verify `/api/xstocks/filter-diagnostics` shows non-zero pair counts.
- Expected per pre-audit §3.7: cold-start at ARCA open may take 5-10 min before first publish-success as ATR + 48-bar lookback accumulate; stale-prior served during warmup is intentional.

**Phase A.3 deliverable (after live telemetry verified):** DBS distribution comparison report; block Phase B if anomalies surface.

## ⏳ NEXT — Phase B (after A.3 ACK)

**Plan reference:** `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` Phase B.

7 sub-batches: B.1 regime classifier threshold calibration (tune 14 `_XSTOCK` constants per equity microstructure); B.2 IMF family threshold calibration (per-family rows in screener_filters); B.3 per-strategy gate calibration (replace 26 wildcards in module_constants with xStock-specific values; strategy-watchlist for redesign-not-retune: pivot_shift / mean_reversion / range_trade); B.4 friction model calibration; B.5 max_bid_ask_spread validation (sequenced immediately after B.4 in coupled-retune unit); B.6 TEC threshold calibration (archive-replay priors); B.7 position-sizing review + sector concentration gate.

## ⏳ QUEUED — B-PHASE-E-PRE-1 (Phase E prerequisite)

11 of 11 SPDR sector ETFs MISSING from xStock registry (verified by B-PHASE-A1 §3.3). Phase E sector-correlation factor work (`b68_3_pair_correlation` repurposed) requires SPDR ETF prices per symbol. **Path-1 (FRED daily-close + Yahoo intraday offline feed) locked as recommended** per Langston Step 4 R2. Estimated 5-7 days. Triggers at Phase E kickoff design ask. Not blocking A.3 / B / C / D — DBS itself uses pair-OHLC only.

---

## 🟡 SHELVED until Phase 19

- Confidence calibration vs VTS outcomes.
- B-NEW-38 stratified re-run.
- B67.5 consumer-gate-from-VTS in current form.
- B-NEW-39 Phase 2 (forensic shape).
- TFS sustainability gate value-scope decision (RUNNING_ISSUES #111).
- Detector module_constants DB-resolution (Phase E calibration batch).
- **Entry-side discontinuity gating** (mirror-image scanner consult; Phase 19 live-trading prep).

---

## OPERATIONAL FACTS

- PM2 #294 on staging since 2026-05-17 22:16:00Z (B-PHASE-A2). Pipeline healthy; HTTP 200.
- B-PHASE-A2 wiring loaded; xstockDirectionalBiasStore singleton ready; ARCA-closed weekend short-circuit until Mon 01:00 UTC (24/7 universe partial) → Mon 13:30 UTC (full ARCA + 265 pairs).
- 8 xstock_spot DBS module_constants rows applied; crypto wildcard rows untouched.
- `xstock_dbs_backfill` table populated 31,481 rows / 260 symbols / 14 sectors. DBS distribution healthy (38% up / 42% down / 20% neutral, range -1.00 to +0.99, avg -0.006, 0 sentinels).
- Scheduled alerts queue: `b83b1e4b` (B-NEW-40 14-day soak verify, fires 2026-05-31T12:46:47Z) + `7b33b931` (B-PHASE-A2 live telemetry verify, fires 2026-05-18T13:35Z).
- Langston SSH alias `staging` → `deploy@188.245.193.8`. IP-restricted to `204.168.141.77`.
- DATABASE_URL: direct Postgres port 5432 (Supabase Frankfurt).
- **CI red baseline ACCEPTED as pre-existing technical debt** (RUNNING_ISSUES #113). TS Check non-blocking since 2026-03-30; Test Suite 13 failures from Directive 11.3/11.7F era. B-PHASE-A2 held the baseline: +2 passing test files (13 failed | 77 passed vs B-NEW-42b baseline 13/75).

---

## RECENT RUNNING_ISSUES SUMMARY

- **#115 OPEN Tier 3** — crypto `dbs_calculation` module_constants asymmetry (only `min_sample_count` exists as wildcard; other 7 knobs code-defaulted). Filed during B-PHASE-A2 Step 8 (Langston).
- **#114 OPEN low-severity** — crypto DBS floor counts sentinel-zero entries; xStock applies stricter rule from day one. Filed during B-PHASE-A2 Step 10 from B-PHASE-A1 design call.
- **#113 OPEN accepted-baseline** — pre-existing CI red (10+ days); Phase 19 paper-trading prep reckons with it.
- **#112 DEFERRED Phase D (INTERIM POSTURE DEPLOYED via B-NEW-42b)** — xStock dividend-credit question; curated calendar live.
- **#111 DEFERRED Phase 19** — TFS sustainability gate value-scope.
- **#110 OPEN Tier 2** — ForceCommand wrapper on Langston pubkey.
- **#109 OPEN Tier 3** — TEC diagnostic endpoint stale-no-consumer disambiguation.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md` — esp. §6.5.0.a (embed-diff-inline) + §6.5.0.b (hung-instance checking)
2. This file
3. `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` — Phase A.2 SHIPPED; Phase A.3 NEXT
4. `Claude Comms and Packages/Langston Design Asks/B_PHASE_A1_DBS_design_ask_rev2.md` — design LOCKED
5. `Claude Comms and Packages/Batch Completion/B_PHASE_A2_COMPLETION_REPORT.md` — once written in Step 11
6. Latest active scope/pre-audit if mid-batch
