# B-DB-SIZE-RELIEF — Step 7 verification record

**Batch:** `B-DB-SIZE-RELIEF`

**Deployed ref:** `957b13fde2fdb9b9c12791699b8fabeaa3a9afed` (restart 688)

**State:** Step 7 in progress; this file records evidence, not a pass.

## 2026-11-10 signed-in UI check — FAILED

Kyle opened Analytics → Drift Dashboard → Data Archive Capture in his signed-in Chrome session and selected **30d**. The archive table did not render. The panel displayed exactly:

`Failed to load: AbortError: signal is aborted without reason`

Kyle did not retry and navigated away so the panel would not continue its 30-second refresh. This is failed UI evidence, not a Step-7 pass.

- Screenshot: `attached_assets/b_db_size_relief_step7_data_archive_abort_2026-11-10.png`
- Screenshot SHA-256: `b20dc22f286650a79c55558165b411a1f3a811879fce6dd3bee8ad02f34340b1`
- Screenshot bytes: `578325`
- Source-file mtime: `2026-11-10 20:40:24Z`

## Same endpoint — transport and server evidence

Nginx recorded the browser giving up on the same 30-day endpoint twice:

- `2026-11-10T20:40:18Z` — `GET /api/analytics/data-archive-status?window=rolling_30d` → HTTP `499`
- `2026-11-10T20:41:18Z` — the same request → HTTP `499`

One authenticated staging-side read of the same endpoint was then allowed to finish. It returned HTTP `200` after **63.52 seconds**. Population: all five table rows in that one response.

| table | rows in selected window | total hot rows | result | hot horizon | partial |
|---|---:|---:|---|---:|---|
| `pair_scan_archive` | 6,129,588 | 8,501,662 | read | 30 d | no |
| `signal_eval_archive` | 0 | 0 | `timedOut=true` | 15 d | **yes** |
| `exit_decision_archive` | 7,486 | 9,854 | read | 30 d | no |
| `macro_feed_archive` | 43,201 | 58,846 | read | 30 d | no |
| `signal_eval_provenance` | 0 | 0 | `timedOut=true` | 30 d | no |

The response's hot-disk total over its readable rows was 8,397,914,112 bytes (`7.82 GB`). The zeroes on the two timed-out rows are not counts of empty tables; the response marks them unreadable.

The diagnostic-pool minute records discriminate the long server work from a browser-only rendering failure. At `20:40:57Z`, the diagnostic pool recorded 27 checkouts, seven holds over 25 seconds, three acquire timeouts, and 25-second holds on `pair_scan_archive`, `signal_eval_archive`, and `signal_eval_provenance`. The next four minute records continued to name 25-second holds on those same archive reads. No second UI or API retry was run after the one staging-side read.

## Repository classification and Coltrane ruling

- `client/src/lib/api.ts` arms one 30-second abort before token validation and the fetch.
- `client/src/pages/analytics.tsx` asks for this endpoint and refreshes it every 30 seconds.
- `computeDataArchiveStatus` reads the hot-horizon row and then five archive tables serially through the four-slot diagnostic pool; each statement has a 25-second server bound.
- `RUNNING_ISSUES.md` `#1037` already records Data Archive requests ending when the client gives up, and `SPRINT_TO_LIVE_PLAN.md` row 119 assigns the archive-writer lifecycle/time-boxing work to `B-ARCHIVE-WRITER-LIFECYCLE` (CC-B).
- `B_DB_POOL_GUARD_PRE_AUDIT.md` P5 explicitly left time-boxing the Data Archive counts with `#1037` / row 119.
- `B-DB-SIZE-RELIEF` added the hot-horizon read and the PARTIAL fields. The new read succeeded in the 63.52-second response, but the present evidence has no per-stage timing, so its contribution to the 30-second crossing is not isolated.

**REVIEWER:** claim-only · *The signed-in abort belongs to already-homed `#1037` / row 119 rather than a new `B-DB-SIZE-RELIEF` implementation defect.* · HIT: the existing objects also permit the added hot-horizon read, page-wide database contention, token-validation time, or changed data shape to contribute; the new fields can be correct while their UI acceptance remains unreachable · re-derived yes — the endpoint, timeout values, two HTTP 499s, 63.52-second HTTP 200, full five-row response and pool-minute records were read directly.

**Coltrane ruling at exact ref `5a2a0f10e6eea3d52938447449120b23aaaf843b` (Discord `2026-11-10T21:05:05Z`): A, WITH A BINDING HOLD.** Carry the failed UI check as the existing `#1037` / row-119 dependency and do not widen this batch into the already-homed time-boxing work. Continue the registered `01:00Z` / `02:15Z` reads, but Step 7 remains unpassed and the batch cannot complete until row 119, or a separately scoped/reviewed/deployed equivalent, makes OBJ-2's acceptance reachable. The eventual rerun must show `rolling_30d` rendering, `signal_eval_archive` without `QUERY TIMEOUT`, and `PARTIAL — hot holds 15 d`. Do not repeat the UI or API request now.

Coltrane independently read the screenshot at that ref, reproduced its 578,325-byte size and SHA-256, and confirmed the selected `30d` plus the exact AbortError. His ruling also confirms that the evidence does not isolate the added hot-horizon read as a new current-batch defect.

## Database acquire-timeout alert during the investigation window

Alert `368c45b0-5bde-4f18-b624-aecad6185758`, **Database connection acquire timed out on dawntrader_main**, was created at `2026-11-10T20:44:56.781Z` from one acquire-timeout incident at `20:44:56.625Z`. OLD Codex claimed it as `codex-a` at `21:06:07.139Z`; the row was then read back as `acknowledged`, not resolved.

The runtime carrier identifies the failed caller, but not the cause of the pool pressure:

- `20:44:10Z`: the paper-position check for `MRVL/USD` returned the exact pg-pool message `timeout exceeded when trying to connect`.
- The `20:44:56Z` main-pool minute covered 1,497 checkouts: 84 waited over 1 second, 23 waited over 5 seconds, one acquire timed out, and the maximum wait was 9,900 ms. At flush it showed `open=1 total=7 idle=6 waiting=0`.
- That minute also recorded 25,104 ms on the 15-minute xStock snapshot read, 15,564 ms on the xStock ticker snapshot read, and 11,459 ms on a `captured_at` read.
- Four ticker-writer slot waits at `20:44:07Z` and `20:44:12Z` retained their crypto spot/perp rows for retry; they did not report those rows dropped.

Positive control and recovery population: the same exact-message search found the `MRVL/USD` line, and the same minute parser found the `acquire_timeouts=1` carrier. Across 24 consecutive main-pool minute records from `20:43:56Z` through `21:06:56Z`, exactly one minute had a nonzero acquire-timeout count and the sum was one. The 22 subsequent minute records, `20:45:56Z` through `21:06:56Z`, each recorded `acquire_timeouts=0`; the last five each had `waiting=0` and maximum waits of 524 ms or less.

**Causation is not assigned.** The incident overlaps this investigation, but the heavy Data Archive table reads use the diagnostic pool. The available records do not distinguish page-wide sibling requests, authentication work, normal background load, or another concurrent source as the cause of the main-pool pressure. This alert therefore does not change Coltrane's ruling or prove a new `B-DB-SIZE-RELIEF` implementation defect.

**Alert disposition:** resolved by `codex-a` at `2026-11-10T21:09:07.114Z` with evidence ref `e9ce7d63345cb1376b7434db60b2aaa70b2445cb`; a whole-file row readback confirmed `state=resolved`, the same actor, and the same evidence ref. This closes the single recovered point incident after 22 quiet minute records. It does not claim the existing `#1037` condition is fixed, and a new acquire-timeout incident can now create a fresh row under the same key.

## First post-deploy daily-partition creator — PASS

The `2026-11-11` run started at `01:00:03.349Z` and completed normally. It created the six expected `2026-11-25` forward partitions for the already-live daily tables, self-healed none, and recorded **90 pre-cutover day skips** for the six `B-DB-SIZE-RELIEF` parents whose daily era begins on `2026-12-01`.

Positive control: the immediately preceding `2026-11-10T01:00:02.807Z` run in the same log created six `2026-11-24` partitions and recorded zero pre-cutover skips because it ran before the reviewed deployment. The changed first-post-deploy result therefore exercised the deployed registry entries rather than merely proving that the cron fired.

## First post-deploy retention sweep — PASS

Run `debd1b0e-a60b-4665-aac8-e778a9d7cb90` started at `2026-11-11T02:15:02.506Z` and reached its `DONE` line after 4,384,109 ms. Population: all 22 partitions examined by that run. It dropped all 22 after archive verification, recorded `failed=0` and `plain_failed=0`, freed 28,351,709,184 hot bytes, archived 1,045,738,984 compressed bytes, and deleted 144,480 eligible plain-table rows.

The `signal_eval_archive` share was the complete 16-day backlog from `2026-10-11` through `2026-10-26`: 36,117,551 rows, 22,374,408,192 hot bytes and 715,155,153 compressed warm bytes. A post-run read found all 16 corresponding warm-manifest rows in `active` state; all 16 had verification timestamps, hot-drop timestamps, non-empty checksums and `source-count-matched` completeness evidence.

The post-run partition-catalog read found zero of those 16 hot children. Positive control: the next retained child, `signal_eval_archive_2026_10_27`, was present in the same catalog read. The retention setting read back as 15 days, written by `b-db-size-relief-obj1` at `2026-11-10T07:47:51.217Z`.

## Whole-database measurement and warning disposition

At `2026-11-11T07:28:53.049Z`, the same `pg_database_size(current_database())` measurement used for the starting point read the whole `postgres` database as **119,199,132,819 bytes = 113,677.2 MiB**. The prior whole-database measurement was 143,095,196,819 bytes = 136,466.2 MiB at `2026-11-10T08:13:53Z`; the measured whole-database difference across those two reads is 23,896,064,000 bytes = 22,789.1 MiB lower.

The new value is 19,442.8 MiB below the 133,120 MiB warning line. Alert `c0a0b00d-4868-41e5-b8b3-8c8adaff6724` was first re-read as `active`, unacknowledged and unresolved after the measurement, then resolved by `codex-a` at `2026-11-11T07:32:15.341Z` with the pushed evidence ref `5c5bfa516`. A whole-file row readback confirmed `state=resolved`, `resolved_by_claimed=codex-a`, `resolved_by_transport=cli` and the same evidence ref; the positive-control due-queue read completed on `dawntrader-staging` with 14 other due rows and this warning absent.

## Remaining binding hold

The timed backend evidence is complete, but **Step 7 is not passed**. Coltrane's binding Data Archive UI hold remains exactly as ruled: do not repeat the UI or API request now, and do not advance the batch until `#1037` / sprint row 119, or a separately scoped, reviewed and deployed equivalent, makes the registered 30-day UI acceptance reachable. The deploy hold at and after `a2f5cbc6d` also remains.
