# B-STORAGE-HARDEN — Scope: honor "we never drop data" + relieve the disk ceiling

change-class: architecture

**Owner:** Claude Old (CC-A) · **Reviewer:** Langston · **Kyle green-light:** 2026-07-07 (Desktop; "scope it, I'll get the Backblaze credentials")
**Trigger:** Supabase disk auto-expanded 135→202 GB (2026-07-07 email) — hit the 200 GB Pro auto-expand ceiling. CC-A live investigation surfaced two directive-violations + two efficiency levers.

## 0. Findings (live DB, staging, 2026-07-07 — the evidence this batch acts on)
- **Disk:** 202 GB provisioned (auto-expand ceiling reached — no more auto-growth), **118 GB logical data** (80 GB heap + 38 GB indexes), ~84 GB empty-provisioned + WAL (never reclaimed — Supabase disk only grows).
- **No archival GAP for the tiered tables:** every hot ticker/OHLC partition is within its retention window; April+May already moved to warm; June ticker not yet eligible (30-day window → ~end-July) — correct by design.
- **★ VIOLATION 1 — the B70 analytics tables are DROP-ONLY, contradicting the Kyle directive "we don't ever drop data" (2026-05-06, SIM:2038 / CHANGES:1349).** `b70-retention-sweep.ts` DROPs monthly partitions >90 d for `signal_eval_archive` (25.6 GB), `pair_scan_archive` (8.4 GB), `signal_eval_provenance` (4.2 GB), `exit_decision_archive` (~0), `macro_feed_archive` (~0) — **~38 GB, deleted every 90 days, never tiered to warm/cold.** ROOT CAUSE (governance trace): B70 shipped 2026-05-04/05 with drop-at-90d placeholder retention; the never-drop directive + hot/warm/cold system shipped 2 days later in B75 wired ONLY to the B74 market-data tables (ticker/OHLC/ctx-bridge), never retrofitted to B70. The open question "confirm what B70 does — drop vs archive" was logged (#530 item 4, 2026-05-29) and left as drop. **Oversight, not a decision.** Critically, `signal_eval_archive.features` is the exact Phase-25 calibration data B-NEW-53.1/.2 spent effort populating cleanly — dropping it undercuts that.
- **★ VIOLATION 2 — the COLD tier (Backblaze B2) has NEVER been activated.** `cold_rotator_dry_run=true` since B75 shipped (no B2 creds); manifest has 1 cold row (a May-6 dev test) vs 67 warm. So the "indefinite, never-deleted" bottom layer the whole never-drop architecture depends on is not running — warm data at its 365-day warm limit has nowhere to fall.
- **★ LEVER 1 — xStock ticker over-capture.** `xstock_spot_ticker_snap` = **63.6 GB** (June 50 GB / 160.6 M rows alone), the #1 disk consumer. Rows are NARROW (~168 B, 21 numeric cols — not wide JSON); the size is pure VOLUME: **~477 xStock symbols captured up to ~1 snapshot/second** (95 k snapshots/hour sampled). Crypto equivalent is 2.9 GB (~17×). This recurs every month.
- **★ LEVER 2 — Kyle's rolling-30-day idea.** Current design keeps up to ~60 days of ticker hot (whole monthly partition stays until the entire month is >30 d old). A true rolling 30-day window (archive one day as it ages past 30) roughly halves the hot ticker footprint.

## 1. Objectives (numbered; proposed as risk-ordered sub-batches)

**OBJ-1 — Activate the COLD tier (low risk, high value; NO external blocker — creds present + verified).**
★ CORRECTION (2026-07-08): the B2 creds are ALREADY in staging `.env` from the May setup (`B2_KEY_ID=0053ddb685320530000000001` [the `dt-cold-archive` key], `B2_APPLICATION_KEY`, `B2_BUCKET=dt-archive-cold`, `B2_ENDPOINT`, `B2_BUCKET_ID`) and CC-A **live-verified them 2026-07-08** (b2_authorize_account → AUTH OK; bucket readable; already holds the May dev-test object `context_bridge_log/2025-12.jsonl.gz` 99.87 MB). So cold was never blocked on creds — only `cold_rotator_dry_run=true` + the unscheduled cron. OBJ-1 = flip `data_lifecycle.cold_rotator_dry_run=false`; schedule `b75-cold-rotator.ts` (03:00 UTC monthly); confirm a real warm→cold rotation + download-verify + manifest `tier=cold state=active`. No Kyle action required.

**OBJ-2 — Extend warm/cold tiering to the B70 analytics tables (the directive fix — the core of the batch).**
Stop `b70-retention-sweep.ts` DROP-ing these; route them through the B75 export→warm→cold move-not-delete path (the machinery already exists + is proven). **Per-table decision (Kyle+Langston):** default = PRESERVE per the never-drop directive; explicitly decide if any table is genuinely reproducible/worthless (candidate: `pair_scan_archive` is producer-agnostic raw scan at ~255 k rows/day — big; is it re-derivable, or keep?). `signal_eval_archive` + `exit_decision_archive` + `signal_eval_provenance` = KEEP (calibration/learning data). Set per-table hot/warm retention in `data_lifecycle`. **No data destroyed before this lands** — coordinate so the 90-day drop doesn't delete more in the interim (the oldest at-risk partition age check is a Step-2 item).

**OBJ-3 — Rolling-30-day retention for the high-volume ticker tables (Kyle's idea; higher risk = schema).**
Evaluate + implement daily partitioning for `xstock_spot_ticker_snap` (and siblings) so a true rolling 30-day window is possible with O(1) partition-DROP space reclaim (monthly partitions can only drop whole months → up to ~60 d hot; row-level DELETE bloats). B75 export already slices by day, so the warm side is ready. **Step-2 must confirm** the partition-granularity change is safe (write path, partition-creation cron, query plans, the write-sealed invariant). Alternative if daily partitioning is too invasive: accept monthly + shorten retention. Decide in Step-2.

**OBJ-4 — Reduce xStock ticker capture cost (biggest $ lever; needs consumer audit FIRST).**
Audit who READS `xstock_spot_ticker_snap` at what granularity BEFORE cutting (candidate consumers: the Q-D friction probe reads latest-per-symbol via index seek; the paper/live fill model may want recent depth). If nothing needs ~1-second granularity: reduce capture cadence (e.g. 1/sec → 1/15s or 1/min) and/or narrow the symbol set to the active universe, and/or shorten `xstock_spot_ticker_snap.hot_retention_days` 30→14 (the #530 Kyle directive from May that was never applied). Each is a `module_constants` knob — the audit determines which are safe. **No capture change without the consumer audit.**

**OBJ-5 — Archival-health alert (so archival-failure can't silently sink the disk).**
Now that archival is load-bearing against the fixed 202 GB ceiling, add a monitor: a small staging check (cron) that fires a §10.5 system-alert if (a) the b70/b75 sweeps didn't run or logged `failed>0`, or (b) disk usage crosses a threshold (e.g. 80 % of plan cap). Wire it into the existing `system-alerts` + Langston-triage path.

## 2. What each objective needs from Kyle
- **OBJ-1:** NOTHING — creds present + live-verified 2026-07-08 (no external blocker; earlier "getting creds" is moot).
- **OBJ-2:** per-table keep-vs-drop confirmation (default keep).
- **OBJ-3/4:** the retention/cadence dials are Kyle's calls once Step-2 gives the safe ranges.

## 3. Verification criteria
- OBJ-1: a real warm→cold rotation lands a `tier=cold` manifest row + a download-verified restore; dry-run flag off; cron scheduled.
- OBJ-2: a B70 analytics partition past retention is EXPORTED (warm object + manifest) and only DROPped after download-verify — never a bare drop; a rehydrate test restores it.
- OBJ-3: (if daily partitions) 30-day-old daily partition archives+drops; hot footprint of the ticker table drops to a rolling ~30 d; write path + partition cron verified.
- OBJ-4: post-change capture volume measured (rows/hour) vs baseline; consumer audit documented; no consumer starved.
- OBJ-5: a forced sweep-failure fires the alert + routes to a CC.
- All: CI 4-green per sub-batch; governance (SIM storage section + System Manual data-capture chapter + CHANGES + RUNNING_ISSUES #530 closed + this batch's docs).

## 4. Risk order (implement in this sequence)
OBJ-1 (cold activate, isolated) → OBJ-5 (alert, additive) → OBJ-2 (B70 tiering, reuses proven B75 path, but touches the drop logic — Langston Step-4 on the export-before-drop fence) → OBJ-4 (capture reduction, after consumer audit) → OBJ-3 (daily-partition schema, highest risk, possibly its own sub-batch).

## 5. Open questions for Langston (Step-1 review)
1. Sub-batch split vs one batch? (I lean: OBJ-1+5 together quick; OBJ-2 its own; OBJ-3+4 a xStock-capture sub-batch after a consumer audit.)
2. `pair_scan_archive` — genuinely re-derivable (drop OK) or preserve? (Producer-agnostic raw scan; ITEM_4 §A.1 calls it "compute-once shared substrate.")
3. OBJ-3 daily-partitioning `xstock_spot_ticker_snap` — worth the schema change, or monthly + shortened retention is enough?
4. Interim protection: do we pause the B70 90-day DROP until OBJ-2 lands so no more analytics data is lost? (I lean yes — one-line cron disable until the tiering ships.)
5. change-class=architecture agreed (schema + capture-behavior + retention)?
