# B-VENUE-QUIET-ALERTING — PROGRESS REPORT — OPEN — waiting on the first weekday: the venue reopening, one US close and one regular session

**Owner:** CC-B (NEW Claude) · **change-class:** `architecture` · **Sprint plan row:** 3a1 (paired with 3a) · **Issues:** `#526`, `#994` (Kyle 2026-09-03), `#638`
**Scope / pre-audit:** `Claude Comms and Packages/Scope Files/B_VENUE_QUIET_ALERTING_SCOPE.md` r3, `…_PRE_AUDIT.md` · **Change list:** `Change Lists/B_VENUE_QUIET_ALERTING_STEP4_CHANGE_LIST.md` (r1-r5)
**Deployed:** `fe830d69cfcbcbebe9d6a96e9691d3afedb4d5b3`, `pm_uptime` 2026-10-10T21:20:58.182Z, CI `38086670741` 4/4 per job; record `Scope Files/RELEASE_DEPLOY_2026-10-10_CCB_EVENING.md`.

## 1. What the batch is for, and what shipped
Kyle's decision (`#994`): when an xStock price goes stale because the US market is quiet or closed, keep the count and raise no alert; alert only when OUR feed or subscription is impaired. Before this batch the exit monitor paged on every quiet close (15 pages in the first hour after the 2026-10-06 close) and its pages never cleared themselves (`#638`).
Shipped (code `ae6ae8ff8` → r2 `ee4920646` → r3 `b70ab5975` → r4 `955f7f115` → r5 `2b005902b` → `fe830d69c`):
- a per-class rule that tells a quiet or closed venue from our own failure, by how many xStock symbols received a venue **update** in the last 60 s (`T`), with `closed` read from the DST-aware weekend window and `thin` (too few updating to judge) paging for every reason family;
- one standing info-level record per quiet window listing each waiting position, instead of a page per position; a streak joins it only if **every** reason family in it would (the minority veto);
- a duration page when a listed position stays unpriced too long, worded for its own family;
- pages and the record clear themselves on a re-measured condition (a sweep every cycle), resolved `--by active-exit-monitor`, transport `engine`;
- the hard-coded threshold fallback removed; `>=` in place of `===`;
- the archiver heartbeat prints `T`'s own control (`ticker_snaps_60s=update:…,snapshot:…,other:…`).

## 2. Steps completed, with evidence
| step | evidence |
|---|---|
| 1 | scope r3, PROCEED (Langston 2026-10-07), C1-C3 carried |
| 2 | pre-audit + plan; PROCEED with the pre-registration corrected before code to 1 of 14 quiet-family rows (`494f49b02`) |
| 3-4 | Step 4 APPROVED at r3 `b70ab5975` (CI `37587281300`) |
| 5-6 | first deployed in CC-C's 10-10 release `ad01f5339` |
| 7 | 10-10 Step 7 found three causes of weekend pages (the restart's snapshot replay counted as ticking; weekend near-silence read as `thin`; book-state holds paging off-session) |
| 9 | r4 + r5 fixed them; Langston's gate CLEARED at `2b005902b`; record items 1-2 at `fe830d69c` |
| 6-7 (again) | deployed `fe830d69c` by CC-B; Step 7 PASS on the weekend arm (the release record): before the restart 27 sweeps read `thin` on the shut venue; after it every sweep reads `closed`, 16 of 16 skip streaks joined the standing record, no page, `newEscalations=0` on all sweeps; the first heartbeat after the restart read `update:0,snapshot:468` with `T=0` |
| 8 | **CONFIRMED** by Langston 2026-10-10, re-derived on a named window (60 sweeps 20:54→21:54Z, 27 `thin` + 33 `closed`, 0 escalations, 0 failed). His controlled case: BKR, RBLX and STZ each paged ~63 s after the 12:00Z and 17:05Z restarts on a free key and did not page after the 21:21Z restart on the same shut venue |

## 3. ⛔ PRE-REGISTERED CLOSE CRITERIA — written 2026-10-11 before any weekday data
The scope's staging criterion, quoted: *"at the next US close with xStocks held, ZERO `price-skip-*` breakage rows for quiet names; one standing quiet record that resolves at the open, with `--by active-exit-monitor` on the row; the per-position skip log intact; and the share of rows paged matching objective 2's pre-registered prediction."* Objective 2's prediction (pre-audit, corrected by Langston C1): **1 of 14** quiet-family rows of the 2026-10-06 close would still page.

**Window:** from the xStock reopen (Sunday 20:00 ET = 2026-10-12T00:00Z) through the end of the first full weekday — the regular session (13:30-20:00Z) and the US close at 20:00Z on 2026-10-12, and the after-hours to 2026-10-13T00:00Z. One extension of one weekday at most, if no xStock is held across the close.

**PASS — all of:**
1. **Reopen:** the standing record `venue-quiet-paper-xstock_spot` resolves within the first sweeps after the venue resumes, by `active-exit-monitor`, transport `engine`.
2. **The count at the reopen (Langston):** the first archiver lines after 00:00Z show `ticker_snaps_60s=update:N` with `symbols_updated_60s` above the `thin` floor (50) once updates flow — the measurement, read beside the verdict line, not the verdict line alone.
3. **The close:** at and after the 20:00Z close, every xStock skip streak whose families are all quiet-market joins the standing record; **zero** `price-skip-*` rows minted for quiet-family streaks; any page that does mint is a book-state family in the regular session, a `not_quiet` symbol, or `thin`, and each is named with its reason.
4. **The skip log is intact:** `[VENUE_QUIET][STANDING]` and the per-position skip lines continue.
5. **In session:** no `price-skip` row minted for a symbol whose cohort is updating normally (`not_quiet` with a real book-state or staleness cause is a correct page and is listed, not counted against the batch).

**FAIL — any of:** the standing record does not resolve at the reopen; a quiet-family streak mints a `price-skip` row after the close; `T` reads `thin` through a normal after-hours (the knobs 346/50 were calibrated on all-frame counts; `T` now counts updates only — Langston: an upper bound, 2.24× headroom at p05). A FAIL reopens the batch at Step 9 with the measurement.

**FINDING-1 (Langston, Step 8) — read in the same window, with its own outcome:** eight `price-skip` rows minted on 2026-10-10 (ORCL, GEV, CRWD, KKR, UNH, AMAT, COPX, MCD) carry a book-state basis and clear only when the position is priced; a book-state refusal never reaches the engine's "priced" note. If a refusal persists past Monday 13:30Z on any of them, its held key **suppresses the regular-session page the rule promises**, under a Saturday row that describes a closed venue. **Read:** any of the eight still active after 2026-10-12T13:30Z with book-state refusals continuing ⇒ the shadow is live ⇒ fixed in this batch before close (Step 9: a held key whose session context has changed must not suppress the new page — design and Langston review then). All eight resolved by then ⇒ recorded as not observed, and the structural gap carried to the completion report with its home.

## 4. What is unproven, stated as unproven
- The weekday arms (`quiet`, `not_quiet`, `thin` in session and after hours) have not run on the deployed code.
- `T` counts updates only; the thresholds were measured on all frames. Off-session steady state should differ little (no resubscribes), but that is Monday's measurement.
- **US market holidays (`#392`, parked by Kyle, no calendar):** on a holiday `closed` is false and the session reads `regular`, so holds page on a shut venue and `T` likely reads `thin`. Named, not silenced — Langston, §13 disposition 5; the next holiday is its first test.

## 5. Governance files changed so far
Step 10 (2026-10-11): the System Impact Map (the alert-store entry: the component, the rule, the four writers, the first production resolver and its actor/transport, the settings, the control line) and the System Manual (§3.5 position exit evaluation: who is told when the mark is too old) — both were declared OWED at Step 10 in the change list and are written here; the module's header comment brought to r4 (comment only). In-batch: `RUNNING_ISSUES` (`#526`, `#994`, `#638`, `#743` notes), `ALERT_ACTORS` in `system-alerts.ts` (the canonical engine actor), the sprint plan (row 3a1 status), the CC-B task list, the release records (`RELEASE_DEPLOY_2026-10-10_PLAN.md`, `RELEASE_DEPLOY_2026-10-10_CCB_EVENING.md`), this report. The full ledger is written at conversion.
