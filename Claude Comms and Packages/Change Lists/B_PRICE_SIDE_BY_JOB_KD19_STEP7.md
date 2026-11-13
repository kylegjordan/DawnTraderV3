# B-PRICE-SIDE-BY-JOB KD-19 (b) + (c) exit leg — Step-7 48-hour evidence

**Implementer:** ANALYST Codex (`codex-c`), standing in for CC-C.
**Deployed ref:** `6c39f14cb275ade22ff2cc220b3a4214007b83ec` at `2026-11-07T15:15:11Z`.
**Registered population:** selected real-lane VTS exits in the half-open window `[2026-11-07T15:15:11Z, 2026-11-09T15:15:11Z)`, per class. The predicates are `B_PRICE_SIDE_BY_JOB_KD19_PRE_AUDIT.md` §7 as restated, without predicate changes, in §11.

**STEP: 8 of 11 · NEXT STEP: 9 of 11.**

## 1. Population and instrument proof

The decision-grade object is `exit_decision_archive`: `source='vts-runner'`, carried `mode='vts'`, exact registered time window. It held **166 rows / 166 distinct trade ids**, from `2026-11-07T15:20:04.552Z` through `2026-11-09T15:14:41.761Z`: **32 crypto and 134 xStock**, all priced selected-lane closes.

The closed VTS JSON is the independent sink and population control. Its 280 in-window records reconcile as follows: 32 crypto selected priced + 134 xStock selected priced = the 166 archive rows; 41 xStock maker/taker twins are counterfactual rows and carry `countsInAggregates=false`; 11 crypto + 62 xStock rows are `never_filled` and never opened. Every one of the 166 selected priced JSON records carries `exitWalk`; twins and never-filled rows correctly do not.

The durable open-trade store is the independent control against an archive-write omission. Its **1,419** rows closed in the same half-open window reconcile as **1,139 shadow rows + 41 xStock counterfactual twins + 73 closes without an exit-decision row + 166 selected closes with an exit-decision row**. The class split of the last two groups is exactly crypto **11 without / 32 with** and xStock **62 without / 134 with**, matching the JSON `never_filled` and selected populations rather than leaving an unexplained archive gap.

The runtime counter stream is the positive control for the zero cells. Across **2,875** `[8a-P3][VTS_TOUCH]` pass lines from `2026-11-07T15:16:04Z` through `2026-11-09T15:14:41Z`, the summed priced decisions were crypto `walked=32` and xStock `walked=175`; the 41-row xStock difference is exactly the counterfactual-twin population above. Both classes printed `noDepthConfig=0`, `sizeAbsent=0`, and `unitLane=0`. The exact-ref fixture deliberately exercises `no_depth_config`, so that zero is not an instrument that cannot find the arm.

## 2. Registered cells

| cell | object and population | result | verdict |
|---|---|---:|---|
| (a) every priced selected real-lane close carries `exitWalk.sizeBasis` | archive, all 166 priced closes | crypto **32/32**; xStock **134/134** | PASS |
| (b) xStock extrapolated quantity | archive, 134 priced xStock closes | **0/134 = 0.0000%**, registered ceiling 5% | PASS |
| (c) crypto size-basis and certainty mix, per rung | archive, 32 priced crypto closes | exact: **6 certain / 6 impact-priced**; REST rounded: **12 certain + impact-priced**, **14 uncertain + not impact-priced**; 11 of the 14 uncertain REST closes extrapolated | REPORTED |
| C6 REST reach | archive, 26 REST-rung crypto closes | **12/26 = 46.1538%** impact-priced | MEASURED — no numeric threshold was registered for “material”; Step 8 must adjudicate the word rather than convert it into a mechanical pass |
| (d) missing depth configuration | archive, all 166 priced closes; runtime-counter control above | **0** | PASS |
| (e) epochs moved exactly once | migration ledger + epoch rows | pre-image **crypto 7 / xStock 9**; KD-19 applied at `15:14:58Z` and moved them to **8 / 10**. Crypto remains 8. xStock is now 11 only because `#1250` applied its separate +1 at `19:06:15Z`. | PASS |
| (f) VTS equals paper on the same book | exact deployed ref, `kd19-vts-exit-walk.test.ts` | **17/17 tests passed**, including the bit-for-bit equality fixture and its top-bid mutation control | PASS |
| FAIL: booked price ≤ 0 | archive, all 166 priced closes | **0** | PASS |
| FAIL: walked + extrapolated quantity does not conserve quantity | archive, all 166 priced closes, parsed with the runtime's JavaScript number semantics | **0/166** | PASS |

### Conservation read, including the representation boundary

PostgreSQL `numeric` reparsing of the three separately serialized JSON numbers reports **5** non-identical decimal strings, with a maximum absolute delta of **0.0000000000002 units**. Re-reading the same 166 stored JSON objects through JavaScript and applying the registered runtime predicate `(walkedQty + extrapolatedQty) !== quantity` reports **0 mismatches**. Both readings are disclosed: the five are decimal-rendering residue, not lost quantity, and Step 8 must explicitly confirm that the registered object is the runtime number rather than silently treating the SQL reparse as the producer's arithmetic.

## 3. Other required Step-7 evidence

- **Unpriced behavioral arm:** UNEXERCISED. From the KD-19 deploy through this read, `exit_decision_archive` contains **0 selected real-lane unpriced closes**. Therefore no live first-unpriced row exists on which to prove absence of `exitWalk`. The exact-ref structural fixture proves the guarded write shape, but it is not substituted for the requested live behavior. Alert `7e20ed0f-692a-4899-8af3-c3db071bd97a` remains active and unacknowledged; it is not resolved without that evidence or a Step-8 ruling that splits the event wait from this completed 48-hour read.
- **Intervening deploys:** `#1250` and row `8c` crossed the window. Diffing KD-19 to the later `5c3b14496` deploy shows no change to `vts-exit-booking`, friction, counters, the close walk, or the KD-19 exit path. The only shared-file changes are `#1250`'s carried level metadata and row `8c`'s signal-birth shadow/knob read; neither changes the registered exit predicates.
- **CI:** run `42381090707` at the deployed ref completed successfully in all four required jobs: TypeScript Check, Test Suite, Build, Docker Build.
- **UI:** no UI surface exists for `exitWalk`, `walkedQty`, or `impactPriced`: the positive repo control finds 12 server files and the client search finds 0. This Step-7 result is therefore database/log/fixture evidence; there is no affected page to navigate.

## 4. Exact reproduction

Run from staging after loading `/home/deploy/dawntrader/.env` without printing the connection string.

```sql
-- Decision-grade population and (a), keyed on the carried source/mode and exact half-open window.
SELECT asset_class, count(*) AS priced,
       count(*) FILTER (WHERE state_snapshot ? 'exitWalk') AS with_walk,
       count(*) FILTER (WHERE NOT (state_snapshot ? 'exitWalk')) AS without_walk
FROM exit_decision_archive
WHERE source='vts-runner' AND mode='vts' AND exit_price IS NOT NULL
  AND captured_at >= '2026-11-07T15:15:11Z'
  AND captured_at <  '2026-11-09T15:15:11Z'
GROUP BY asset_class ORDER BY asset_class;

-- (b), (c), C6: grouping is the stored rung basis and stored certainty, never a re-derivation.
SELECT asset_class, state_snapshot->'exitWalk'->>'sizeBasis' AS size_basis,
       (state_snapshot->'exitWalk'->>'sizeCertain')::boolean AS size_certain,
       (state_snapshot->'exitWalk'->>'impactPriced')::boolean AS impact_priced,
       count(*) AS closes,
       count(*) FILTER (WHERE (state_snapshot->'exitWalk'->>'extrapolatedQty')::numeric > 0) AS extrapolated
FROM exit_decision_archive
WHERE source='vts-runner' AND mode='vts' AND exit_price IS NOT NULL
  AND captured_at >= '2026-11-07T15:15:11Z'
  AND captured_at <  '2026-11-09T15:15:11Z'
GROUP BY 1,2,3,4 ORDER BY 1,2,3,4;

-- (d) and the two FAIL cells. The final two columns deliberately expose the decimal-rendering boundary.
SELECT count(*) FILTER (WHERE state_snapshot->'exitWalk'->>'sizeBasis'='no_depth_config') AS no_depth_config,
       count(*) FILTER (WHERE exit_price <= 0) AS nonpositive_price,
       count(*) FILTER (WHERE NOT (state_snapshot ? 'exitWalk')) AS missing_walk,
       count(*) FILTER (WHERE (state_snapshot->'exitWalk'->>'walkedQty')::numeric
                              + (state_snapshot->'exitWalk'->>'extrapolatedQty')::numeric
                              <> (state_snapshot->>'quantity')::numeric) AS decimal_reparse_mismatch,
       max(abs((state_snapshot->'exitWalk'->>'walkedQty')::numeric
             + (state_snapshot->'exitWalk'->>'extrapolatedQty')::numeric
             - (state_snapshot->>'quantity')::numeric)) AS max_decimal_delta
FROM exit_decision_archive
WHERE source='vts-runner' AND mode='vts' AND exit_price IS NOT NULL
  AND captured_at >= '2026-11-07T15:15:11Z'
  AND captured_at <  '2026-11-09T15:15:11Z';

-- Live unpriced behavioral proof: currently returns 0 rows.
SELECT captured_at, trade_id, asset_class, exit_reason,
       state_snapshot ? 'exitWalk' AS has_exit_walk
FROM exit_decision_archive
WHERE source='vts-runner' AND mode='vts' AND exit_price IS NULL
  AND captured_at >= '2026-11-07T15:15:11Z'
ORDER BY captured_at LIMIT 1;

-- Independent durable-store reconciliation. This prevents a missing archive write from
-- masquerading as a clean selected population.
SELECT t.asset_class,
       CASE WHEN COALESCE((t.context->>'shadow')::boolean,false) THEN 'shadow'
            WHEN COALESCE((t.context->>'mtTwin')::boolean,false) THEN 'counterfactual_twin'
            WHEN a.trade_id IS NOT NULL THEN 'selected_with_exit_archive'
            ELSE 'closed_without_exit_archive' END AS class,
       count(*) AS rows
FROM vts_open_trades t
LEFT JOIN exit_decision_archive a
  ON a.trade_id=t.id AND a.source='vts-runner' AND a.mode='vts'
 AND a.captured_at >= '2026-11-07T15:15:11Z'
 AND a.captured_at <  '2026-11-09T15:15:11Z'
WHERE t.closed=true
  AND t.closed_at >= '2026-11-07T15:15:11Z'
  AND t.closed_at <  '2026-11-09T15:15:11Z'
GROUP BY 1,2 ORDER BY 1,2;
```

Exact-ref fixture command, run from a plain `git archive` of the deployed SHA (not a worktree):

```text
vitest run server/tests/unit/kd19-vts-exit-walk.test.ts
```

Result: one test file passed, 17 tests passed, 0 failed.

## 5. Fresh-reader record

`REVIEWER: claim-only · necessary objects found independently · qualified hit on twin population/materiality wording; core numeric claim supported · re-derived y.`

Both hits were re-derived before dispatch. “Selected” now explicitly excludes counterfactual twins and never-filled rows, and the C6 row reports the measured 12/26 reach without inventing a numeric definition for “material.”

## 6. Step-8 independent confirmation

Coltrane independently reran the registered staging read and **CONFIRMED** the completed 48-hour Step-7 read at exact ref `8a19a33c7a5d7f206f5aee8af64d4a513c05f117` on `2026-11-10T00:08:03Z`.

His explicit rulings were:

1. Runtime JavaScript conservation is the registered object. All 166 stored objects reproduce with 0 runtime mismatches; the five PostgreSQL exact-decimal differences, maximum `2e-13` units, are serialization residue rather than lost quantity.
2. Crypto REST reach of 12/26 is material because it is nearly half of the complete REST population and is plainly non-de-minimis; C6 does not fire.
3. The fixed 48-hour window may advance separately from the event-triggered unpriced arm. Alert `7e20ed0f-692a-4899-8af3-c3db071bd97a` remains active and unacknowledged until a live selected unpriced close supplies the missing behavioral proof; the fixture is not a substitute, and KD-19 is not fully closed before that event proof.

**Step-8 verdict: CONFIRMED. Advance to Step 9 carrying the unpriced event wait.**

## 7. Step-9 event-wait registration

The only objective not yet green is the live behavioral proof for an unpriced selected real-lane close. This is an event wait, not a code correction and not a hold on unrelated batches or deployments.

- **Owner:** ANALYST Codex (`codex-c`), standing in for CC-C.
- **Placed home:** KD-19 Step 9, this evidence record, the CURRENT POSITION block, Delivery Board status `Verification` / blocked on `External`, and active alert `7e20ed0f-692a-4899-8af3-c3db071bd97a`.
- **Closing condition:** the first post-deploy selected real-lane archive row with `source='vts-runner'`, carried `mode='vts'`, and `exit_price IS NULL` has no `state_snapshot.exitWalk`; reconcile its trade id to the durable VTS record, record the row as evidence, resolve the alert without a separate acknowledgement, and advance to Step 10.
- **Failure condition:** that first row carries `exitWalk`, or the durable record and archive disagree on whether the close was unpriced. Enter the Step-9 fix → Coltrane review → push → CI → deploy → verify loop; do not resolve or acknowledge the alert.
- **No-event rule:** continued absence of the event is neither pass nor fail. Keep the alert active and unacknowledged and continue other sequenced work.

**STEP: 9 of 11 · NEXT STEP: 9 completion on the first qualifying live event.**

## 8. Step-9 completion — the first live unpriced close (ANALYST Claude, 2026-11-13)

Read on staging at 2026-11-13 ~15:40Z against the registered closing condition in §7, predicates unchanged.

**The first qualifying row.** `exit_decision_archive`, `source='vts-runner'`, `mode='vts'`, `exit_price IS NULL`, `captured_at >= 2026-11-07T15:15:11Z`, ordered by `captured_at`:
`2026-11-11T14:31:08.171Z` · `vts_xstock_spot_1793802632943_82jpuil` · SYY/USD · `xstock_spot` · `time_stop_unpriced` · `state_snapshot ? 'exitWalk'` = **false**.

**Reconciliation to the durable record — the two agree that the close was unpriced:**
- `vts_open_trades` row: `closed=true`, `state='closed'`, `closed_at=2026-11-11T14:31:08.188Z`, pool `rotational`, no `shadow` or `mtTwin` flag in `context`, no `exitWalk` in `context`.
- Runner log (`error.log`, warn stream): `[3n.q3][VTS_UNPRICED_CLOSE] SYY/USD trade vts_xstock_spot_1793802632943_82jpuil class=xstock_spot arm=clamp_no_bid held=168h 0m — max-hold reached with no usable sell side; closed with no price`.
- `logs/virtual_trades/*.json`: the id is **absent**, as designed — `closeVtsTradeUnpriced` (`server/services/vts-runner.ts`, the 3n.q3 P2 block) never calls `persistRealPriceTrade` for an unpriced close. **Positive control:** three priced xStock selected closes archived in the same hour (`…1794401928894_gqhyzw6`, `…1793984324792_uol2dzw`, `…1794240735985_8rtmho9`) are all present in `2026-11-11.json`, so the absence is the instrument reading, not a blind spot.
- Not a twin: the twin branch of `closeVtsTradeUnpriced` writes no archive row, so an archived unpriced row is the selected lane by construction.

**Population beyond the first row.** All **3** post-deploy selected unpriced rows carry no `exitWalk` (SYY 11-11 `clamp_no_bid`, EPAM 11-12 `clamp_no_bid`, WTW 11-13 `clamp_no_mark`), against **1,637** selected VTS archive rows since the window start (latest 2026-11-13T15:32:30Z), so the archive is live. The `?` operator's positive control is §3: 166/166 priced rows read `true`.

**Verdict against §7:** closing condition MET; failure condition not met. Alert `7e20ed0f-692a-4899-8af3-c3db071bd97a` is resolved with this commit as evidence, no separate acknowledgement.
REVIEWER: none — NOT RE-READ (an evidence read against a pre-registered predicate, carried to Coltrane/Langston at Step 10/11).

**STEP: 9 of 11 COMPLETE · NEXT STEP: 10 of 11 (KD-19 governance).**
