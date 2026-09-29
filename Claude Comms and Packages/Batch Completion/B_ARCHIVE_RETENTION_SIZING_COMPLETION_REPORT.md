# B-ARCHIVE-RETENTION-SIZING — COMPLETION REPORT · **✅ CLOSED 2026-09-29 — a decision item, decided by Kyle; the work it named is placed in the Sprint to Live plan**

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
- **The 2026-10-01 check that the August move landed** — **CC-B keeps it, as two scheduled alerts:** `a881c69c` (2026-10-01T12:00Z: verify the August tier ran, then resolve the parked disk warning so its key re-arms) and `c25e722d` (2026-10-02T08:00Z: verify the enumerated 52.24 GiB was reclaimed). Pass: every August partition logged dropped with `bytes_warm > 0` and `failed=0`; one failed night = re-check the next day; two = investigate. ⚠️ A third check minted 2026-09-28 (`04c3acc8`) duplicated these and was withdrawn on 2026-09-29. The disk alert `3035e031` resolves on them.
- **The one-minute-bar flip and the months-of-headroom measurement** — `SPRINT_TO_LIVE_PLAN` row 6 `DISK-HEADROOM`, owner **Infra**, wave 0.
- **The never-installed 14-day job on `context_bridge_log`** (1.48 GB) — `SPRINT_TO_LIVE_PLAN` row 7 `CONTEXT-BRIDGE-TTL`, owner **Infra**, wave 0.
- **`#688`** (four monthly-partitioned tables) rides the disk row.

## 4. Honest residual
**The retention windows are still not sized to the write rate** — Langston's diagnosis of this alert class stands. Kyle chose not to size them now because the October move and the one-minute flip buy the room. **Measured steady state for the one-minute family alone at the current 365/365/365/30 windows was ≈ 68–83 GB** (row 2.4f amendment, Langston 2026-09-29); the flip to 30 days takes most of that off the table. If the database climbs back above its warning line after both land, the sizing question reopens — with the slope, not the level.

## 5. Governance files changed — the tier ledger
**CHANGE-CLASS: none declared — a decision item with no scope and no code.** *(The scope, pre-audit and CI rows below are N/A for that reason, not skipped.)*

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | Entry added: closed as a decision item. |
| T1 | `PHASE_HISTORY.md` | N/A | No build and no behaviour change; the decision is recorded where it acts (plan, issue, this report). |
| T1 | `PHASE_19_PLAN.md` | ✅ | Row 2.4f marked CLOSED with the two Kyle decisions and the hand-ons. |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | N/A shared / ✅ mine | Own position updated. |
| T1 | the batch `SCOPE` / `PRE_AUDIT` | N/A | A decision item; nothing was scoped for build. |
| T1 | this `COMPLETION_REPORT` | ✅ | — |
| T1 | THE FOUR SESSION TASK LISTS | ✅ mine / N/A ×3 | `CC_B_SESSION_TASK_LIST.md` row updated from "blocked on Kyle" to closed. |
| T1 | Langston's `MEMORY.md` | OWED | Asked in the close dispatch; ticked only when he writes it. |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#592` given its owner (CC-B) and its close, with the hand-ons. |
| T2 | `STORAGE_POLICY.md` | N/A | No window changed by this close; the 30-day flip is Infra's row and updates this doc when it executes. |
| T2 | `SYSTEM_MANUAL.md` / `SYSTEM_IMPACT_MAP.md` | N/A | No component or behaviour changed. |
| T2 | `SPRINT_TO_LIVE_PLAN.md` | ✅ | Section-0 plate line marked closed; row 6 note names who holds the October 1 check. |
| T2 | all other Tier-2 documents | N/A | Nothing in their scope moved. |
