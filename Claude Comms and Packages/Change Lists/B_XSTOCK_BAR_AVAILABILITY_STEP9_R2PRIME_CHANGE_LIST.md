# B-XSTOCK-BAR-AVAILABILITY — Step 9 R2' round 2: change list for the Step-4 re-dispatch

**Header (Step-4 dispatch fields):**
- **(i) Declared change-class:** `architecture` (scope header, `Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md:3`).
- **(ii) Doc set for that class, row by row:**
  - scope `Scope Files/B_XSTOCK_BAR_AVAILABILITY_SCOPE.md`: **present**.
  - pre-audit `Scope Files/B_XSTOCK_BAR_AVAILABILITY_PRE_AUDIT.md`: **present**; this round is its new section `### Step 9 R2' round 2 - after Langston's Step-4 send-back`; the round-1 section now carries a SUPERSEDED-IN-PART banner.
  - completion report: **absent** (batch open at Step 9).
  - `BATCH_CATALOG`, `PHASE_HISTORY`, System Manual, System Impact Map: **owed at Step 10** (unchanged; R2' adds the window date and the Sunday session start to the System Manual's gate description then).
  - `DEPLOY_WINDOWS.jsonl`: **present** (four append-only `amend` rows on the open window; `dt-obs-windows census` parses the register and shows the amended window).
  - `GOVERNANCE_EXCEPTIONS.md`: **present** (the batch's row corrected in place to the new start).
- **(iii) Step 2:** the pre-audit section above. It answers the send-back in its order: Sunday session start, weekday gap rate, then the start date.

**Round 1** is `052572603` (+ change list `632c5c966`) on the review branch — **sent back, not deployed** ("Do not deploy this diff"). This round is one commit on top; the sha is in the dispatch.

## What changed and why (each answers one send-back item)

| send-back item | disposition | where |
|---|---|---|
| Sunday session start vs `sun_reopen` | **Fixed, not exempted.** A Sunday session now starts at the reopen's live minute (20:15 ET). An exemption would leave a stretch where the head test is off, so a real writer stall at 20:01-20:15 Sunday would pass unseen; moving the start keeps the 60 s test whole over every minute we count. | `market-hours.ts` new constant; gate-read session-bounds SQL; integration test |
| the ~20 % weekday gap rate | **Keep 60 s; widen the sample.** 26 sessions (ET 10-15..11-19, Sunday already at 20:15), 21 pass, 5 fail. Two are genuine (11-03 855 s writer stall; 11-15 3,596 s DB outage). 10-20 (1,230 s) and 10-28 (78 s) may be venue-side — NOT RE-READ, and unresolvable from our data: `empty_flushes_in_gap = 0` on every gap row, so quiet-venue and dead-writer leave the same trace. Choosing a looser line after seeing which sessions it passes would be fitting the test to the data. At p_fail ≈ 0.19: 6 sessions pass with p ≈ 0.68, 7 with ≈ 0.87 (binomial, independence assumed — an outage can span two). | pre-audit round 2 point 2; queries `scripts/analysis/b_xstock_bar_availability_r2prime_session_read.sql` (NEW) |
| the start date | **`2026-11-30T01:00:00Z`** (Sunday 20:00 ET, the venue week open). Final gate `2026-12-09T01:10:00Z`; first due fire 12-10 00:15Z. Counted: ET 11-29 (Sun), 11-30, 12-01, 12-02, 12-03, 12-06 (Sun), 12-07 = **7** (00:00Z drops 12-07, which ends 12-09 01:00Z). **NOT RE-READ: the session count — please re-derive.** Pre-registered costs: the 12-09 02:15Z sweep holds the 11-30 partition one night (expected sweep-hold warning, clears 12-10); the R7b cap margin falls to 2 runner-failure nights; the read lands ~23 h after the window (C6: 471,843 / 1,200,000 ms). | migration, gate constant, usage line, unit test, R7b comment, DEPLOY_WINDOWS, GE |

## Files (round 2 only; 12 paths, +202/−61 by the commit stat, incl. governance and this change list)
| file | change |
|---|---|
| `server/asset_classes/xstock_spot/market-hours.ts` | +10: `export const XSTOCK_SUNDAY_REOPEN_LIVE_MIN_ET = 20 * 60 + 15`, beside `PAUSE_SUN_REOPEN`, policy-not-knob comment |
| `server/scripts/b-xstock-bar-availability-gate-read.ts` | imports it; Sunday CASE in `SESSION_BOUNDS_SQL`; `$3` passed by `readSessionsChunked` |
| `server/tests/integration/b-xstock-bar-availability-gate-read.test.ts` | oracle uses a literal 20:15 for Sunday (does not read the constant it checks); new case: Sunday opens 20:15 ET, Monday 20:00 ET |
| `drizzle/migrations/2026-11-22-b-xstock-bar-availability-window-r2prime.sql` | value → `2026-11-30T01:00:00Z`; header rewritten. Rollback unchanged (restores `2026-11-09T00:05:00Z`). |
| `server/scripts/b-xstock-bar-availability-capacity-gate.ts` | `EXPECTED_GRADED_WINDOW_START = '2026-11-30T01:00:00.000Z'`; usage line |
| `server/tests/unit/b-xstock-bar-availability-observation.test.ts` | expects 01:00Z, Monday-UTC hour 1, final gate `2026-12-09T01:10:00.000Z`; usage line names the new start, not 00:00Z |
| `server/services/data-archive/xstock-revision-verdict-hold.ts` | comment only: 2-night margin + the expected one-night hold |
| pre-audit, `DEPLOY_WINDOWS.jsonl`, `GOVERNANCE_EXCEPTIONS.md`, NEW analysis SQL | as above |

## The load-bearing hunks
Constant (`market-hours.ts`, after `PAUSE_SUN_REOPEN = [1200, 1235]`):
```ts
+export const XSTOCK_SUNDAY_REOPEN_LIVE_MIN_ET = 20 * 60 + 15;
```
Session start (`SESSION_BOUNDS_SQL`):
```sql
-            (et_date + time '20:00') AT TIME ZONE 'America/New_York' AS session_start,
+            (et_date + CASE WHEN extract(isodow FROM et_date) = 7
+                            THEN make_interval(mins => $3::int)
+                            ELSE interval '20 hours' END) AT TIME ZONE 'America/New_York' AS session_start,
             (et_date + 1 + time '20:00') AT TIME ZONE 'America/New_York' AS session_end
```
Caller: `SESSION_BOUNDS_SQL, [windowStart, observedAt, XSTOCK_SUNDAY_REOPEN_LIVE_MIN_ET]`.
Migration + gate constant: `to_jsonb('2026-11-30T01:00:00Z'::text)` · `EXPECTED_GRADED_WINDOW_START = '2026-11-30T01:00:00.000Z'`.

## Local evidence
- vitest on the touched unit + integration files: 180/180 on three consecutive runs (one earlier run had one unnamed failure that did not recur — an unidentified intermittent, stated rather than dropped).
- CI type-check baseline gate run locally: 324 = baseline 324, no regressions.
- CI on the pushed head: in the dispatch.

## Judgement calls to attack
1. Fix-the-start over exempt-the-pause (reason above).
2. Not reclassifying 10-20/10-28 as venue-side: is there a capture-side signal I have missed that separates quiet venue from dead writer?
3. 01:00Z over any other start later than 00:05Z (all give 7, read at the 12-10 fire; 00:05Z itself puts the gate at 00:15Z, the 12-09 fire): chosen to align with the venue week; the cost is the one held partition night.

## Alert order at deploy (unchanged except the trigger time)
Read the governed row back → resolve `3306c5c3` as superseded → create the new event-wait alert on `xstock-bar-availability-capacity-gate`, triggering about **12-10 00:45Z**, metadata `supersedes 3306c5c3`; its body names a hand resolve with evidence as its own clearing edge, because no code resolves this key (that is why `3306c5c3` sat active from 11-06), and it is largely redundant with `…verdict-runner-failed:<start>`, which the runner does clear. `ba8b42e2` is hand-resolved with evidence at the 12-10 graded read: the runner clears only `RUNNER_FAILURE_KEY_PREFIX` keys (`verdict-runner.ts:598`, `:499`), so the new window's verdict cannot reach the 11-09 verdict key. Never acked. *(Corrected after Langston's Step-4 PROCEED, `1574079693408305166`: this line said the graded read resolves `ba8b42e2`.)*
