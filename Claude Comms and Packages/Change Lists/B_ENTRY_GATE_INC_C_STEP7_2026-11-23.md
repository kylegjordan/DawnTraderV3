# B-ENTRY-GATE (#1224) — INCREMENT C STEP 7, FIRST FULL xSTOCK SESSION

**Registered window:** 2026-11-23 01:00:00Z–21:00:00Z, the first full xStock session after increment C entered staging at `6a9b6802fefda20843408f055697286514f44070` on 2026-11-20. The original alert title still says 11-22 01:00Z; the later authoritative register amendment corrects the start to 11-23 01:00Z because Sunday 20:00 ET is Monday 01:00Z.

**Read:** 2026-11-23 21:00Z–22:35Z · **owner:** NEW Codex (`codex-b`) · **alert:** `83667ea0-4684-45e5-83ee-ea26b6c39e96`.

## Verdict

**PASS on the registered backend criterion.** The xStock birth EntryWindow path judged 21 birth-phase outcomes: 21 passed and 0 refused, so the refusal share is **0/21 = 0.0%**, below the registered 25% INVESTIGATE line. This is an outcome tally, not a claim of 21 unique signal ids. The live carrier is non-vacuous: the same hourly tally population contains all 21 `judged_pass` outcomes, the database row remained boolean `true`, and no xStock `BIRTH_LIVE_UNRESOLVED` line preceded them.

The cost cohort is empty rather than zero-cost: no xStock birth refusal produced a `(symbol,strategy)` member, so the promised “later opened in the same window?” read is **not applicable**. Crypto remained deliberately shadowed (`entry_window_birth_live=false`), with 0 live birth-refusal lines; this is a configuration outcome, not a crypto pass.

**Step 7 is complete.** The backend evidence was captured when the observation window closed, and the 2026-11-24 browser-scoped Chrome pass in §6 completed the separate Ready-to-Buy and Filter Diagnostics rendering smoke-check. The parent remains open for Coltrane's Step 8 and the remaining workflow steps.

## 1. Window identity and the inherited deploy-enumeration condition

The staging reflog enumerates three deployments after increment C first landed and before the registered session:

| staging reset | ref | relation to window |
|---|---|---|
| 2026-11-20 23:25:28Z | `6a9b6802fefda20843408f055697286514f44070` | increment C deploy |
| 2026-11-21 00:07:40Z | `2a501de33c23ff95e18d421272d60093e4773f14` | before window |
| 2026-11-21 05:08:19Z | `c21c1502a215b428e2cba2a5214696cb9a1a5c74` | before window; served the full session |

There is no staging reset on 2026-11-22 or during 2026-11-23 01:00Z–21:00Z. **At the Step-7 read**, `/home/deploy/dawntrader-deploy.record` and the staging checkout both named exact ref `c21c1502a215b428e2cba2a5214696cb9a1a5c74`, restart 714, deployed 2026-11-21T05:08:44Z. That mutable deploy record has since advanced to `e3a96a8126f0280a9568bb1823b9210783f0afe0`, restart 715, deployed 2026-11-24T00:03:08Z, so it is not a reproducible settling object for this read; its current state proves only that the next deployment occurred after the registered window. The immutable reflog boundary and complete restart-log controls below establish that the inherited “many builds in one population” concern collapses to one build for the complete registered window; no file-delta substitution is needed.

The process log is the app-process restart control. It finds complete stop/exit/start/online sequences at 2026-11-20 23:25:52Z–23:25:55Z, 2026-11-21 00:07:52Z–00:07:55Z, and 2026-11-21 05:08:31Z–05:08:34Z, then none on 2026-11-22 or 2026-11-23. A separate engine-start census finds the paper-engine start-time marker at 2026-11-21 05:08:39Z and 05:08:40Z, then no engine-start route or start-time marker inside 01:00Z–21:00Z. Thus there was **no app-process or paper-engine restart in the registered session**, with both instruments finding their immediately preceding positive controls.

CI run `44847250518` grades the serving ref `c21c1502a`: TypeScript Check, Test Suite, Build and Docker Build each completed `success`.

## 2. Complete rotating-log population

The registered session intersects these stdout objects, selected from their observed first/last record rather than from the rotation name alone:

| object | observed content boundary | lines |
|---|---|---:|
| `out__2026-11-23_06-00-47.log.gz` | 00:00:28Z–06:00:59Z | 12,595,606 |
| `out__2026-11-23_11-00-57.log.gz` | 06:01:00Z–11:01:13Z | 12,179,596 |
| `out__2026-11-23_15-01-54.log.gz` | 11:01:13Z–15:02:11Z | 15,157,843 |
| `out__2026-11-23_17-00-23.log.gz` | 15:02:11Z–17:00:40Z | 12,734,795 |
| `out__2026-11-23_20-01-21.log` at the read; now `out__2026-11-23_20-01-21.log.gz` | 17:00:41Z–20:01:38Z | 15,413,971 |
| `out.log` at the read; registered-window bytes now in `out__2026-11-24_00-01-14.log.gz` | 20:01:39Z–22:34:35Z at the read | 6,103,005 at the read |

`error.log` was also read over its complete current object (00:00:13Z–22:34:35Z, 698,840 lines at the read) for `BIRTH_LIVE_UNRESOLVED` and error-path controls; those registered-window bytes are now preserved in `error__2026-11-24_00-01-14.log`. The two former current objects continued after the Step-7 read before rotating, so their present whole-object line totals are larger; timestamp-filtering the durable objects to the registered window reproduces the same population. The deployed refusal carrier itself is `console.log` at `c21c1502a:server/core/filters/signal_quality_evaluator.ts:385`, so its settling stream is stdout; the hourly tally writer is `:292`, while the unresolved line is stderr at `:325`.

All outcome extraction was timestamp-filtered after reading those complete objects. No selected object overlaps another; the boundary records are also the positive control that every chosen rotation was readable. “Complete population” below means all application outcomes recorded in those complete objects; it does not claim that every hypothetical market opportunity existed or that the venue feed never had a quiet interval.

## 3. Birth EntryWindow result

The hourly xStock birth population is:

| hour (UTC) | skip maker | price unavailable | judged pass | judged refuse |
|---|---:|---:|---:|---:|
| 01 | 7 | 4 | 0 | 0 |
| 05 | 5 | 0 | 0 | 0 |
| 06 | 1 | 0 | 0 | 0 |
| 07 | 3 | 0 | 0 | 0 |
| 08 | 4 | 0 | 1 | 0 |
| 09 | 7 | 1 | 1 | 0 |
| 10 | 7 | 0 | 2 | 0 |
| 11 | 6 | 0 | 0 | 0 |
| 12 | 1 | 1 | 0 | 0 |
| 13 | 2 | 2 | 0 | 0 |
| 14 | 26 | 3 | 1 | 0 |
| 15 | 54 | 0 | 1 | 0 |
| 16 | 45 | 0 | 2 | 0 |
| 17 | 38 | 0 | 6 | 0 |
| 18 | 41 | 0 | 3 | 0 |
| 19 | 22 | 0 | 4 | 0 |
| 20 | 14 | 0 | 0 | 0 |
| **total** | **283** | **11** | **21** | **0** |

Hours 02–04 emitted no xStock birth outcomes. The denominator for the registered refusal criterion is the 21 judged birth-phase outcomes, not the 315 total xStock birth outcomes; maker choices and price-unavailable skips were explicitly not judged. The final 20Z tally was emitted at 21:00:09Z and is included because it is the delayed flush for `hour=2026-11-23T20Z`, not a post-window outcome.

Controls against a false zero:

1. The same live tally returned 21 `judged_pass` outcomes after the last process start, proving the xStock birth path ran and judged.
2. The database readback returned exactly `xstock_spot=true` and `crypto_spot=false` for `entry_gate.entry_window_birth_live`, plus `xstock_spot=300000` for `promotion_price_max_age_ms`; all three rows retain their original 2026-11-20 update timestamps and increment-C seed actors, so the settling rows were not changed during the session.
3. The pre-window shadow parser found the three registered known positives: ORLY/USD 2026-11-18 14:53:58Z, SKHY/USD 2026-11-18 23:51:09Z, and DRI/USD 2026-11-20 16:05:46Z, each as `[ENTRY_WINDOW_SHADOW:birth] ... would refuse`.
4. Crypto printed `[BIRTH_LIVE_OFF] class=crypto_spot mode=shadow_off value=false` at 2026-11-21 06:14:41Z, once for restart 714. Because no later restart occurred, no second once-per-process line was expected inside the session.

The outcome is therefore xStock **0 refused / 21 judged = 0.0%**. It does not cross the registered >25% investigation line. There are no xStock `[ENTRY_WINDOW_REFUSE:birth]` lines and no xStock `(symbol,strategy)` members for the cost follow-up.

## 4. C-4 xStock promotion-price result

The existing `[B-ENTRY-GATE][P7][UNPRICED]` carrier emitted **40 promotion-refusal events over 19 distinct RTB row ids** in the registered window. Each of those 40 stdout carrier lines has a same-id `[B-RTB-REFRESH-LIVE-PRICE][CLAIM_REFUSED] ... outcome=unpriced` stderr line within one second; the full stderr population held 143 unpriced claims over 48 ids across all classes. Split at the U.S. regular-session open:

| period | event lines | distinct RTB rows |
|---|---:|---:|
| 01:00:00Z–14:29:59Z (night) | 37 | 17 |
| 14:30:00Z–21:00:00Z (regular session) | 3 | 2 |

Non-zero event hours were 05Z=3, 06Z=1, 07Z=1, 08Z=7, 09Z=2, 10Z=5, 11Z=4, 12Z=6 and 14Z=11. Hours 01–04Z, 13Z and 15–20Z were zero in the complete selected population. The 14Z hour separates into eight night events before 14:30Z and three session events at 14:30:16Z, 14:30:46Z and 14:35:17Z.

The night-id and regular-session-id sets have an empty intersection, so the period counts reconcile to 19 union ids rather than double-counting a row across the boundary. This is the predicted behavioral consequence of the 300,000 ms xStock price-age seed: unpriced overnight rows stay queued rather than promoting. It is not a deletion count and it is not a unique-signal count; both event lines and distinct row ids are stated.

## 5. Migration and settings controls

At the Step-7 read, the then-current deploy record stated that the migration runner completed before restart 714. The mutable file has since advanced with restart 715 and is not a preserved migration artifact. The deploy tool did not retain the increment-C DO-block's stdout as a separate artifact, so this report does not claim a preserved DO-block line. The reproducible settling object is the live six-column-key readback:

| constant | class | value | updated by | updated at |
|---|---|---:|---|---|
| `entry_window_birth_live` | crypto | `false` | `b-entry-gate-inc-c` | 2026-11-20 23:25:52.566436Z |
| `entry_window_birth_live` | xStock | `true` | `b-entry-gate-inc-c` | 2026-11-20 23:25:52.566436Z |
| `promotion_price_max_age_ms` | xStock | `300000` | `b-entry-gate-p7-xstock-seed` | 2026-11-20 23:25:52.508184Z |

That exact state is what the migration's DO-block requires. The separate runtime controls above prove the xStock live row was consumed rather than merely present.

## 6. UI state and Step-8 handoff

**UI smoke-check passed through browser-scoped Chrome on the signed-in staging site, 2026-11-24 13:53Z–13:56Z.** Desktop Computer Use remained off, no password was entered, and the Drift Dashboard was not opened.

- **Ready to Buy:** the selected tab rendered `Ready-to-Buy Signals (33)`, its 30-second refresh timestamp advanced to 14:55:11 local time, and the ranked table contained 33 populated signal rows, ranks 1–33. A repeated object read counted 30/33 rows explicitly marked `venue quiet`; those rows showed last-known prices instead of a blank/error state, so this smoke-check proves rendering rather than current price freshness or immediate tradability.
- **Crypto Filter Diagnostics:** the selected tab rendered Crypto Scanner (VTS), Pipeline Summary, and Last Scan Filter Breakdown. At the 13:56Z object read it showed 300 pairs in the last scan against a 300 target, universe 1,436, and a populated 24-hour summary of 525,048 pair evaluations over 1,664 cycles.
- **xStock Filter Diagnostics:** the selected tab rendered `xStocks (xstock_spot) — Paper Active-Trading Diagnostics`, Scanner `Running`, Trading Window `Open (24/5)`, `No active errors`, Pipeline Summary, and Last Scan Filter Breakdown. At the 13:56Z object read it showed 74 pairs in the latest scan against a 75 target, universe 474, and a populated 24-hour summary of 123,999 pair evaluations over 1,661 cycles. These live counters are a point-in-time UI control, not a fixed batch result.
- **Analytics & Diagnostics:** the overview page loaded normally during navigation. Its Drift Dashboard control was left untouched as required by the standing safety rule.

This completes the Step-7 staging UI smoke-check. Increment C adds no new display; the parent scope still leaves any Filter Diagnostics feature change to KD-9.

For Step 8, Coltrane should independently re-read:

1. the single-build/restart boundary;
2. the 0/21 xStock refusal result and its live positive controls;
3. the empty cost cohort as N/A rather than a zero; and
4. the 37-night / 3-session promotion-refusal split over 40 events and 19 row ids.

REVIEWER: claim-only · name the objects that settle the single-build, no-restart, no-refusal and night/session claims, and the alternative states consistent with them · **HIT: distinguish app vs engine restart, outcome tally vs unique births, pair the P7 carrier to its refusal line, and test the period-id intersection** · re-derived y (engine-start census with pre-window control; deployed source; 40/40 cross-stream pairs; period-id intersection 0; report narrowed)

REVIEWER: live signed-in staging UI object · what other states are consistent with the Ready-to-Buy and Filter Diagnostics completion claim? · **HIT: the views were still populated several minutes later, but 30/33 Ready-to-Buy rows were venue-quiet, `No active errors` coexisted with three earlier process errors, and point-in-time counters do not prove continuous backend or downstream health** · re-derived y (parent repeated the live row census: 34 table rows including header, 33 ranked data rows, 30 venue-quiet; claim narrowed to a rendering smoke-check)

## 7. Reproduction recipe

The settings read uses `dt-sql --csv` over the exact three six-column-key rows. The log read enumerates the seven objects in §2, filters 2026-11-23 01:00:00Z–21:00:00Z, and extracts:

- `[ENTRY_WINDOW_HOUR] ... birth:xstock_spot` for the denominator;
- `[ENTRY_WINDOW_REFUSE:birth]` for the xStock/crypto refusal lines;
- `[P7][UNPRICED] ... class=xstock_spot` for the event and distinct-id split;
- `[BIRTH_LIVE_UNRESOLVED] class=xstock_spot` from stderr; and
- the prior-process crypto `[BIRTH_LIVE_OFF]` control plus the three registered pre-window shadow rows.

Deployment and restart controls are the immutable transition history from `git -C /home/deploy/dawntrader reflog --date=iso`, `/home/deploy/.pm2/pm2.log`, and the complete application-log engine-start census. The live `/home/deploy/dawntrader-deploy.record` is intentionally excluded from the reproduction recipe because it advanced after this registered window. CI is `gh run view 44847250518 --json jobs`, inspected per named job.
