# B-CRYPTO-FEED-WATCHDOG (#1232) — STEP 7, FIRST-PASS VERIFICATION (in progress)

**Deployed:** `b8685a45316a352e5c2287f28a077bc5dcaef471` by `dt-deploy --by cc-b`, 2026-11-04T15:47:10Z — "live, engine resumed, identity asserted"; migration `2026-11-04-b-crypto-feed-watchdog.sql` applied at 15:46:57Z (9-row seed assertion passed). Rollback target: `e1becf80122864d59bb675a19a376b9591b3b1c1` (deployed 12:13:26Z the same day).
**CI on the deployed sha:** run `41857051966` — Build success · Test Suite success · TypeScript Check (baseline gate) success · Docker Build success.
**Runtime code in the range `e1becf801..b8685a453`:** this batch's files plus `client/src/pages/status-board/StatusBoardPage.tsx` (CC-A's B-STATUS-BOARD `222f7bf8c`, Langston-approved, waiting for a restart — told to CC-A).

## Read so far (instrument, object, result)
| # | check | instrument | result |
|---|---|---|---|
| 1 | every recorder connection reconnected and subscribed | `out.log` 15:47:09-10Z | crypto-perp (184 symbols), equity-perp (10), crypto-spot shard0 (207), shard1 (231) — each `connected (attempt 1)` then `subscribed` |
| 2 | the new health line prints the DATA age beside the any-frame age | `out.log` 15:48:03Z and 15:49:03Z | shard0 `last_msg_age_ms=38 data_age_ms=38 rows_persisted_60s=450`; shard1 `178 / 204 / 628` (the two clocks differ by a heartbeat — the distinction the batch exists for); crypto-perp `data_age_ms=10`, equity-perp `240` |
| 3 | no subscription rejected, no partial reply set, no silent-socket reconnect, no config-missing | `error.log` + `out.log`, `[B74]…(SUBSCRIBE|SILENT|WATCH)` | none. **Instrument reach, stated:** a rejection, a partial reply set (`got < expected`) and a zero-reply reconnect each print a line (`recorder-connection.ts`, the subscribe timer); only a COMPLETE reply set prints nothing. So the silence here reads "complete", not "unchecked". |
| 4 | the witness-age backfill | `scripts/b-crypto-feed-watchdog-witness-backfill.ts`, dry run then `--apply` 2026-11-04 ~15:52Z | population 255 crypto closes with a witness since 2026-08-27 → **78 `backfill_matched`, 177 `underivable`, 255 stamped**; 14 older than the 6 h ceiling. **Split by close date (control):** closes on/after 2026-10-01: 78 of 78 matched; before: 0 of 177 — the recorder's August/September partitions are already tiered out of the hot table (only `…_2026_10` onward remain; min `captured_at` 2026-10-01 00:00:00Z). The 14 flagged are exactly pre-audit A7's list (GLMR/USD 44.5 h; 13 shard0 closes, witness 10-21 10:19:57-10:20:37Z, 55.6-320.2 h). |

## Still to read (pre-registered, pre-audit §4)
- **(4) the recorder live share ≥ 0.60 per connection** — NOT GRADED until 2 h after the restart (C2), so first readable ~17:47Z.
- **48 h window to 2026-11-06 ~15:47Z:** (1) data age < 120 s + one 30 s tick except across a logged reconnect; (2) every natural 1006 cut followed by data within 120 s; (3) zero forced reconnects on a connection receiving data; (5) no `passive-archive-silent` alert unless a shared pause occurs, and if one does it resolves itself; (6) any `walk_witness_unvouched` close not refused; plus the post-deploy per-symbol max gap on a healthy shard (Langston record item, for the 6 h ceiling).
- **UI (Claude-in-Chrome):** the feed-health report's recorder line and the Passive Archive panel, after the 2 h warm-up.
- ⚠️ **Neither the silence raise nor the clear has fired live** (Langston, #661 leg 3): until one does, the fences are the only evidence for them, and nothing in the window may be cited as proof they work.
