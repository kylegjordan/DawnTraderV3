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

## Repository classification — ruling requested, not assumed

- `client/src/lib/api.ts` arms one 30-second abort before token validation and the fetch.
- `client/src/pages/analytics.tsx` asks for this endpoint and refreshes it every 30 seconds.
- `computeDataArchiveStatus` reads the hot-horizon row and then five archive tables serially through the four-slot diagnostic pool; each statement has a 25-second server bound.
- `RUNNING_ISSUES.md` `#1037` already records Data Archive requests ending when the client gives up, and `SPRINT_TO_LIVE_PLAN.md` row 119 assigns the archive-writer lifecycle/time-boxing work to `B-ARCHIVE-WRITER-LIFECYCLE` (CC-B).
- `B_DB_POOL_GUARD_PRE_AUDIT.md` P5 explicitly left time-boxing the Data Archive counts with `#1037` / row 119.
- `B-DB-SIZE-RELIEF` added the hot-horizon read and the PARTIAL fields. The new read succeeded in the 63.52-second response, but the present evidence has no per-stage timing, so its contribution to the 30-second crossing is not isolated.

**REVIEWER:** claim-only · *The signed-in abort belongs to already-homed `#1037` / row 119 rather than a new `B-DB-SIZE-RELIEF` implementation defect.* · HIT: the existing objects also permit the added hot-horizon read, page-wide database contention, token-validation time, or changed data shape to contribute; the new fields can be correct while their UI acceptance remains unreachable · re-derived yes — the endpoint, timeout values, two HTTP 499s, 63.52-second HTTP 200, full five-row response and pool-minute records were read directly.

**Coltrane ruling requested:** whether Step 7 should carry this failed UI evidence as the existing row-119 dependency while `B-DB-SIZE-RELIEF` continues its registered 01:00Z/02:15Z checks, or whether OBJ-2 requires a current-batch correction because its UI acceptance condition is presently unreachable.

## Timed evidence still owed

- First post-deploy `01:00Z` daily-partition creator result.
- First post-deploy `02:15Z` retention sweep result, followed by a fresh whole-database measurement.
- Database warning `c0a0b00d-4868-41e5-b8b3-8c8adaff6724` remains active and unacknowledged unless that fresh whole-database measurement is below 133,120 MiB.
