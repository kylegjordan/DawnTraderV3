# B-ARCHIVE-RETENTION-SIZING — COMPLETION REPORT · **✅ CLOSED 2026-09-29 — a decision item, decided by Kyle; the work it named is placed in the Sprint to Live plan. Langston confirmed the close 2026-09-29; his four record fixes are in §3, §4 and §5.**

`PHASE_19_PLAN` row `2.4f` · issue `#592` · alert `74424570` · owner **CC-B** · **no code, no deploy.** This row was placed 2026-09-12 as a **decision item**: its deliverable was never a fix but *"for each actively-written archive family, the window that its write rate implies at the 200 GB cap, priced against what the data is FOR"* — a decision for Kyle, handed to him as a rate, not a level (row 2.4f). It had no scope document because there was nothing to build.

## 1. The decision, and who took it
**KYLE, 2026-09-23:** *"I am not worried about the database because the full month of August will migrate to the warm storage at the beginning of October."* ⇒ **no change to any retention window for the archive family.**
**KYLE, 2026-09-28 (Desktop chat), on the one family that was not moving:** the one-minute price bars go to a 30-day hot window — *"for the one minute bar storage, we'll go with your recommendation"* — executing Langston's 2026-08-17 ruling (C) in `STORAGE_POLICY.md` §3: after the October 1 move lands, move one month as the proof (`#685`), then flip `crypto_spot_ohlc_1m`, `xstock_spot_ohlc_1m` and `xstock_perp_ohlc_1m` from 365 to 30 days (about 19 GB out of about 22 GB). Recorded in `scripts/inventory/kyle_decisions.json` (`OHLC-1M-30D`).

## 2. What the decision rests on — checked, not assumed (2026-09-28/29)
| claim | evidence |
|---|---|
| August's archive partitions leave hot storage at the start of October | `signal_eval_archive`, `signal_eval_provenance`, `exit_decision_archive`, `pair_scan_archive`, `macro_feed_archive` read `hot_retention_days = 30` in `module_constants`; their 2026-08 partitions are monthly, and the sweep log reports *"no partitions older than 2026-08-01 (retentionDays=30)"*, so they become eligible on the 2026-10-01 02:15Z run |
| the move will not stall on the 38 GB August evaluation partition | the sweep slices any partition above `slice_threshold_hot_bytes` (3 GB) into day pieces; July's 31.3 GB `signal_eval_archive` moved that way in 3,406 s on 2026-09-01; a failed upload retries the next night (`xstock_spot_ticker_snap/2026-07` failed 08-31 on a 504, dropped 09-01) |
| September onward does not repeat the lump | the large families write daily partitions from September (`signal_eval_archive_2026_09_01` …) |
| nothing is lost | every dropped partition is exported to warm storage first (`bytes_warm` on each drop line); the closed-trade tables are 365-day with archive-before-delete (`2403bd231`) |

⚠️ **The size right now:** about 83 % of the 200 GB cap (Langston, 2026-09-28). **The expected relief is about 53 GB on 2026-10-01**, then about 19 GB more once the one-minute-bar flip executes. **Neither has happened yet**, so the disk alert stays open until they do.

## 3. What this close hands on — each placed, one owner each
- **The October checks — three alerts existed; one is the deliverable** (corrected at Langston's close review, 2026-09-29):
  - ★ **`c25e722d` — THE PRE-REGISTERED CHECK** (2026-10-02T08:00Z; placed by Langston 2026-09-26, follow-through owner CC-B). It verifies the enumerated **52.24 GiB** was reclaimed by the 2026-10-01 run, and it **replaced the early export-and-drop contingency**, so that decision rests on it. Its own terms: size back to about 130 GiB / 65 %; every one of the seven August partitions warm in the archive manifest with its drop dated 2026-10-01; the seven `*_2026_08` partitions gone; and **`signal_eval_archive_2026_08` (38.10 GiB) absent is the discriminating evidence** — a falling percentage alone is not a pass, because the daily families tier every night anyway. If the sweep did not fire, its contingency applies (manual export and drop, largest first) and the no-op is filed as a defect at `SPRINT_TO_LIVE_PLAN` row 6 `DISK-HEADROOM`, which owns headroom now that row 2.4f is closed.
  - **`a881c69c` — DISCHARGED** (was 2026-10-01T12:00Z; placed by Langston 2026-09-14). Its job was to resolve the parked disk WARNING so that key could re-arm; that warning (`74424570`) was resolved on 2026-09-16, so nothing was left for it to do. Resolved by CC-B 2026-09-29 with that evidence. Its tier checks are the same as `c25e722d`'s.
  - **`04c3acc8` — WITHDRAWN** (was 2026-10-01T06:00Z; minted by CC-B 2026-09-28). It duplicated `c25e722d`.
- **The disk alarm after its resolve — one check, 2026-09-30.** Langston resolved the critical disk alert `3035e031` himself at **2026-09-29T13:00:19Z**: the row had frozen at 81.1 % while the database read 84.2 %, and only a resolve frees that alert's key. He measured **181,040,376,979 B = 168.6 GiB = 84.3 %** of the cap, growing about **2.26 GiB/day** — about 14 days of headroom against relief due in 2. **The re-raise is unproven:** the database monitor runs about once a day, and nothing had minted since the resolve. If no fresh critical alert appears, the gauge is silent while the condition is true and worsening. **Scheduled: `602d4638` (2026-09-30T15:00Z, owner CC-B)** — PASS = a new critical row minted after 13:00:19Z.
- **The one-minute-bar flip and the months-of-headroom measurement** — `SPRINT_TO_LIVE_PLAN` row 6 `DISK-HEADROOM`, owner **Infra**, wave 0.
- **The never-installed 14-day job on `context_bridge_log`** (1.48 GB) — `SPRINT_TO_LIVE_PLAN` row 7 `CONTEXT-BRIDGE-TTL`, owner **Infra**, wave 0.
- **`#688`** (four monthly-partitioned tables) rides the disk row.

## 4. Honest residual
**The retention windows are still not sized to the write rate** — Langston's diagnosis of this alert class stands. Kyle chose not to size them now because the October move and the one-minute flip buy the room. **Measured steady state for the one-minute family alone at the current 365/365/365/30 windows was ≈ 68–83 GB** (row 2.4f amendment, Langston 2026-09-29); the flip to 30 days takes most of that off the table. If the database climbs back above its warning line after both land, the sizing question reopens — with the slope, not the level.
⚠️ **Until the one-minute flip lands, the critical disk alarm fires every month by design:** its line is 80 %, and the normal monthly peak before the sweep is about 87 % (`c25e722d`'s own measurement). A fresh critical alert on 2026-09-30 is therefore the gauge WORKING, not a new fault. The flip takes about 19 GB off the peak; whether that brings it under the line is measured at sprint row 6.

## 5. Governance files changed — the tier ledger
**CHANGE-CLASS: none declared — a decision item with no scope and no code.** *(The scope, pre-audit and CI rows below are N/A for that reason, not skipped.)*
**Checked 2026-09-29 whether the governance checker grades an undeclared class here (Langston's close item 3): it does not.** It grades only batches with a commit touching code (`poller.mjs:86`, `applyCutoff` drops a batch whose last code commit is null; code = `server/ shared/ client/ scripts/ drizzle/`, `config.mjs:92`). This batch's commits touch only governance files, so the class, doc-set and ledger-row grades never run on it. **Control:** the alert log holds 64 `gov-classundeclared` and 201 `gov-docgap` rows for other batches, and none for this one. ⇒ **no `na-skip` rows filed, and no class invented.**

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Entry added: closed as a decision item. |
| T1 | `PHASE_HISTORY.md` | ✅ | One-line entry added at close review (Langston's item 4: an N/A here under an undeclared class was the `B-CLAUDEMD-SLIM` shape). |
| T1 | `PHASE_19_PLAN.md` | ✅ | Row 2.4f marked CLOSED with the two Kyle decisions and the hand-ons. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | N/A shared / ✅ mine | Own position updated. |
| T1 | the batch `SCOPE` / `PRE_AUDIT` | N/A | A decision item; nothing was scoped for build. |
| T1 | this `COMPLETION_REPORT` | ✅ | — |
| T1 | THE FOUR SESSION TASK LISTS | ✅ mine / N/A ×3 | `CC_B_SESSION_TASK_LIST.md` row updated from "blocked on Kyle" to closed. |
| T1 | Langston's `MEMORY.md` | ✅ | Written by Langston at his close confirmation, 2026-09-29. |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#592` given its owner (CC-B) and its close, with the hand-ons. |
| T2 | `STORAGE_POLICY.md` | N/A | No window changed by this close; the 30-day flip is Infra's row and updates this doc when it executes. |
| T2 | `SYSTEM_MANUAL.md` / `SYSTEM_IMPACT_MAP.md` | N/A | No component or behaviour changed. |
| T2 | `SPRINT_TO_LIVE_PLAN.md` | ✅ | Section-0 plate line marked closed; row 6 note names who holds the October 1 check. |
| T2 | all other Tier-2 documents | N/A | Nothing in their scope moved. |
