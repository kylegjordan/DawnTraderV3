# B-VENUE-QUIET-ALERTING — Step-4 change list (Langston code review)

**Batch:** `B-VENUE-QUIET-ALERTING` · `#526` + `#994` + `#638` · sprint row 3a1 (paired with 3a) · owner CC-B.
**Graded ref:** commit `ae6ae8ff874a9056b338508f681071022b7d0aa4` on `origin/migration/aws-supabase` (one commit, 12 paths incl. 2 migrations).
**CI:** run recorded in the dispatch post.

## DISPATCH HEADER
**(i) CHANGE-CLASS:** `architecture` (your Step-1 ruling: a new per-class standing record minted from the active path + the first production `resolveAlert` caller).
**(ii) DOC SET for `architecture`, at this ref:**
| document | state |
|---|---|
| batch `SCOPE` | present — `Scope Files/B_VENUE_QUIET_ALERTING_SCOPE.md` r3 |
| batch `PRE_AUDIT` | present — `Scope Files/B_VENUE_QUIET_ALERTING_PRE_AUDIT.md` (§D your Step-2 conditions, applied BEFORE this commit at `494f49b02`; §E the Step-3 answers) |
| `SYSTEM_MANUAL.md` | REQUIRED — OWED at Step 10: the alert lifecycle now has an in-process resolver; the quiet rule and its measured basis |
| `SYSTEM_IMPACT_MAP.md` | REQUIRED — OWED at Step 10: the standing record as cross-cutting state; the machine actor and `engine` transport; the sweep |
| `ADJUSTMENT_FRAMEWORK.md` | OWED at Step 10 — the four `venue_quiet` constants |
| `DELETED_COMPONENTS_LOG.md` | OWED at Step 10 — the hard-coded `threshold = 40` |
| `RUNNING_ISSUES.md` | `#572` amended (`3fab3411e`); `#526`/`#994`/`#638` at Step 11 |
| `COMPLETION_REPORT`, `BATCH_CATALOG`, `PHASE_HISTORY`, plan, task list, MEMORYs | Steps 10-11 |
**(iii) STEP-2 REFERENCE:** the pre-audit plan items 1-13 and §D C1-C3.

## 1. Plan item / condition → change
| item | change |
|---|---|
| 1, 2 | `server/services/venue-quiet-alerting.ts` (new): `isQuietMarketReason` (exactly `equity_tick_missing` and `equity_tick_stale_*`); `classVerdict(T)`: THIN `T < thin_ticking_min` ⇒ page, QUIET `T < quiet_ticking_min`, else not quiet. Engine `_recordPriceSkip`: a quiet-family escalation on a QUIET xStock class joins the standing record `venue-quiet-<mode>-xstock_spot` (info, `health_check` ⇒ not delivered to Discord, `shouldDeliverToDiscord` false — tested) via `_joinVenueQuietStanding`; every other case pages exactly as before |
| C2 | every page and standing member carries `metadata` = `positionId`, `dominantReason`, `reasonFamily`, `T`, `classVerdict`, `threshold`, `knob`, `streak`, `reasonCounts` |
| 3 | `streak >= threshold` + `_priceSkipEscalated` (once per streak; cleared beside the streak on a venue price, so P-7h's single-delete fence holds — `b-price-side-p7h…test.ts` test 2 passes unchanged) |
| 4 | duration escalation in the sweep: a standing member still unpriced `escalate_after_ms` after the class stopped being quiet pages on `price-skip-<mode>-<SYMBOL>` |
| 5 / C3 (Step 1) | the hard-coded 40 removed; `classifyKnobError` splits *not warm* (skip, no escalation, inside `NOT_WARM_GRACE_MS` = 120 s from engine construction) from *missing row* (`price-skip-config-<mode>-<class>` + escalate at once) |
| 6 | `system-alerts.ts` `resolveAlertsByDedupeKey` (non-terminal rows, each through `resolveAlert`, `[RESOLVE_BY_KEY][MULTI_MATCH]` on >1, no-op on none) |
| 7 / §7 | `ALERT_ACTORS` += `active-exit-monitor` (machine; deploy tool excludes machine actors — tested); `ResolveTransport` += `'engine'`, commented as a CLASS; the `:137-144` comment rewritten in the body; `mergeAlertMetadata` for the standing record's membership (title/body never re-rendered) |
| 8 / C2 (Step 1) | `sweepVenueQuiet`, exact-shape selector `^price-skip-<mode>-([A-Z0-9.]+/(USD|USDT|USDC))$`, run after each cycle unawaited and at most once a minute (`_runVenueQuietSweep`, one `[VENUE_QUIET][SWEEP]` line); resolves a price-skip row once THIS engine priced the symbol's position after `created_at` (`VenueQuietState.notePriced` at the streak reset), or the position closed (evidence = the row's `metadata.positionId`); evidence otherwise = the re-measured position's uuid; throw ⇒ `[VENUE_QUIET][RESOLVE_FAILED]`, counted, retried; failing ≥ `resolve_stuck_after_ms` ⇒ one `venue-quiet-resolve-stuck-<mode>` |
| 9 / C1 (Step 1) | `price-skip-config-…` clears once the threshold reads (evidence: its seed, `2026-07-15-p19-b8-5-venue-only-pricing.sql:13`); the stuck row clears once nothing fails |
| 10 | `xstock-stale-fill-block` untouched |
| `T` source | `equity-spot-archiver.ts` `countEquitySymbolsFramedSince` — frames received (`raw.atMs`), the same frames the recorder persists to `xstock_spot_ticker_snap`, which the pre-audit measured |
| config | migration `2026-10-07-b-venue-quiet-alerting.sql`: `quiet_ticking_min 346`, `thin_ticking_min 50`, `escalate_after_ms 1800000`, `resolve_stuck_after_ms 3600000`, count assertion; `venue_quiet` prefetched (boot hard-fails on zero rows — the guard test's census stays whole: 40/40) |

## 2. Re-measure, honestly stated
The pre-audit's item 8 said "re-measure each symbol: its mark within its own ceiling". Implemented as **"this engine priced the position after the row was minted"** — the engine prices a position only when its mark passes its own ceiling, so the two are the same condition, read from the engine's own observation (`notePriced`) instead of re-deriving the ceiling in the sweep. Restart-safe: the map is per process and fills on the first pricing after boot (tested).

## 3. Tests and their honest strength
`b-venue-quiet-alerting.test.ts` (19): the family; the constructed stall (T 0/49 thin, 50/345 quiet, 346 not — C3, no historical stall exists); **the pre-registered replay** — 46 rows with their measured `T`: quiet-family pages = `NWL` only (1 of 14 first-hour, 1 of 45), all pages = `NWL` + `HUT` (book-state); **mutation** — inverted QUIET ⇒ 45 of 46 pages (pre-audit said 44; corrected, §E); engine: quiet ⇒ standing with metadata, not-quiet ⇒ page, thin ⇒ page, book-state on quiet ⇒ page, threshold moved mid-streak ⇒ escalates once, unseeded ⇒ config + page, not-warm inside/past grace; sweep: priced-after ⇒ resolve citing the position, restart ⇒ resolve, closed ⇒ resolve citing `metadata.positionId`, throw ⇒ counted/retried/stuck/clears, config ⇒ resolves with seed ref, exact selector, standing resolves, duration escalation. `b-venue-quiet-alerting-store.test.ts` (7, temp file): by-key resolve stamps `active-exit-monitor` + `engine` + uuid, no-op, multi-match, unknown actor refused, machine tag, metadata merge refuses a resolved row, standing record not delivered.
**Mutations run:** `streak === threshold` ⇒ the mid-streak test FAILS (run, restored). **Older tests updated:** P-7h's streak test supplies 40 through the cache (the fallback is gone); the 3n.q7 chain test's stand-in gets the two new fields. **tsc 337 = 337.** Full local suite (after the chain-test fix): 10 files still fail locally — 5 integration files, `mapping_drift_integrity`, `b63-item12`, `b63-item16`, `b-staging-liveness-watch`, `b-tsc-baseline-fix`. I read the error of FOUR: two are `ECONNREFUSED ::1:5432` (no local database), two fail to parse on this Windows checkout; the other six I did not read. None imports a file this commit changed — CI's Test Suite is the arbiter.

## 4. Residual
- `_cls` keeps its `?? 'crypto_spot'` class fallback (unchanged here; FINDING-2's perp gap now surfaces through the config alert instead of a silent 40).
- The pre-registered Step-7 read: at the next US close with xStocks held, the paged share of first-hour quiet-family rows (read from `metadata.reasonFamily`, never the body) against 1 of 14; FAIL above 25 % or if a whole-feed stall is ever classed QUIET; the standing record resolved by `active-exit-monitor` over `engine`.
- Deploy order: after 3a (feed-health armed) — both sit after `b523c86bf`, so they ride with 2a0c.

## r2 — Langston Step-4 CHANGES NEEDED (2026-10-07 ~06:30Z), both blockers fixed in-commit
- **BLOCKER-1 (selector blind to non-USD quotes):** `priceSkipKeyPattern` builds its quote group from the shared bound `QUOTE_LEN_MIN`/`QUOTE_LEN_MAX` (`shared/asset-classes.ts`) — the crypto arm mints this key for EUR/GBP/CAD/CHF/AUD positions (96 historical positions, 33 symbols). Any non-terminal `price-skip-<mode>-*` key the selector rejects is counted (`unmatched`) and logged `[VENUE_QUIET][KEY_UNMATCHED]`, and printed on the sweep line. Tests: all 7 quotes + a dotted xStock base selected; an EUR row resolves; a rejected key is counted and logged. **Mutation:** the USD-only list restored ⇒ the quote test FAILS (run, restored).
- **BLOCKER-2 (`thin` read as "resumed"):** the standing record RESOLVES only on `verdict === 'not_quiet'`; the duration clock still runs on anything but quiet (a QUIET-listed member carries `_priceSkipEscalated`, so duration is its only rescue when the class turns thin); the duration alert's title and body BRANCH on the verdict — `thin` says *fewer than 50 xStock symbols are ticking at all — the whole feed is near-silent*, never *the cohort is ticking*. Tests with `verdict: 'thin'` for both halves. **Mutation:** the resolve back on `!== 'quiet'` ⇒ the thin-resolve test FAILS (run, restored).
- **Record items:** (2) the no-trigger rail's comment re-pointed — its threshold is a CODE constant and cannot move mid-streak, so strict equality is safe there; (3) duration escalations are counted once per not-quiet window (`durationEscalated`, cleared on quiet; the sweep line now prints `newEscalations=`); (4) `thresholdReadOk`'s grow-only behaviour documented; (1) **Step 7 enumerates `equity_tick_stale_floor_bound_near_stop` members separately** (#563's near-stop exposure), never pooled; and the System Manual entry (Step 10) will say the standing record, being an active info row, surfaces in every §10.5 check though it never reaches Discord.
- Tests now 24 + 7; `tsc` unchanged against baseline.

