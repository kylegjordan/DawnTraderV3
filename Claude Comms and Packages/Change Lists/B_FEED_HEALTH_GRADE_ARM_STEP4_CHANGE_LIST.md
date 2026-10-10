# B-FEED-HEALTH-GRADE-ARM — Step-4 change list (Langston code review)

**Batch:** `B-FEED-HEALTH-GRADE-ARM` · `#1123` · sprint row 3a (paired with 3a1) · owner CC-B.
**Graded ref:** commit `3a549e3a9f58764a51504f7fab6da1ff0d6935b2` on `origin/migration/aws-supabase` (one commit, 7 paths, no migration).
**CI:** run recorded in the dispatch post.

## DISPATCH HEADER
**(i) CHANGE-CLASS:** `non_architecture` (your Step-1 ruling: telemetry and reads, no new active-path emission; the System Impact Map update binds regardless).
**(ii) DOC SET for `non_architecture`, at this ref:**
| document | state |
|---|---|
| batch `SCOPE` | present — `Scope Files/B_FEED_HEALTH_GRADE_ARM_SCOPE.md` r2 |
| batch `PRE_AUDIT` | present — `Scope Files/B_FEED_HEALTH_GRADE_ARM_PRE_AUDIT.md` (§D `#439`, §E your Step-2 conditions) |
| `SYSTEM_IMPACT_MAP.md` | OWED at Step 10 — monitor (`activeAlertId` removed; `getLastStatus`, `getLastLiveness` added; the edge to 3a1); the recorder universe |
| `SYSTEM_MANUAL.md` | N/A — judged: the grade's definition is unchanged (conditional for this class) |
| `DELETED_COMPONENTS_LOG.md` (T2) | OWED at Step 10 — `cleanupOldFeedAlerts`, the dead `getActiveAlertId` branch |
| `RUNNING_ISSUES.md` (T2) | `#1123` at Step 10; `#439` carried (pre-audit §D) |
| `COMPLETION_REPORT`, `BATCH_CATALOG`, `PHASE_HISTORY` (both REQUIRED — your record item), plan, task list, MEMORYs | Steps 10-11 |
**(iii) STEP-2 REFERENCE:** the pre-audit, plan items 1-9, and §E (C1-C3).

## 1. Plan item / condition → change
| item | change |
|---|---|
| 1 | `server/startup/b72-warmup.ts` — `'feed_health'` in `PREFETCH_MODULES` with its reason; the guard test's `PREFETCH_EXCEPTIONS` is now `[]`, `:248` asserts `[]`, and `feed_health` joins the prefetched assertion |
| 2 / C1 (Step 1) | `feed-integrity-monitor.ts` — `activeAlertId`, `getActiveAlertId()` removed; `updateAlertState(status, grade)`; **`getLastStatus()` is the recovery read site**. `feed-integrity-auto-check.ts` — the dead `:91-94` branch removed; on `metrics.status === 'healthy' && monitor.getLastStatus() !== 'healthy'`: `acknowledgeFeedHealthAlerts(admin.id)` per admin, logged `[FeedIntegrity][CLEAR] … (live x, paper y)`, then `updateAlertState('healthy', grade)` — once per recovery |
| 2 / Q1 | the check-failed path: `shouldSendAlert('critical','CHECK_FAILED')` gates the two mints per admin, then `updateAlertState('critical','CHECK_FAILED')` — shared state |
| 3 / C2 (Step 1) | the cooldown comment states the 300 s = cron-period margin; default unchanged |
| 4 | `alerts-service.ts` — `cleanupOldFeedAlerts` deleted (rule 18) |
| 5 / C3 | monitor keeps the last per-class reading (`thresholdPresent`, `suppressed`, `suppressReason`, `symbolCount`, `freshestAgeMs`, `grade`; `configMissing` when no class had thresholds); `getLastLiveness()` is the 3a1 accessor; the job prints one `[FeedIntegrity][liveness]` line per class per cycle, `threshold=present|absent`, `segment=` from fixed UTC bounds (DST-valid to 2026-11-01; Saturday/Sunday = `weekend`) |
| 6 / C1 (Step 2) | `passive-archive/universe-loader.ts` — the BASE is taken from the venue `wsname`, then through `XBASE_TO_PLAIN` |

## 2. C1 (Step 2) — the 8 + 6, re-derived from Kraken's live `AssetPairs` (1,458 pairs, `error: []`) before the test was written
Old rule mis-named (8): `ZGBPZUSD`→`ZGBP/USD`, `ZEURZUSD`→`ZEUR/USD`, `AUDUSD`→`ZAUD/USD`, `XLTCZUSD`→`XLTC/USD`, `XETCZUSD`→`XETC/USD`, `XMLNZUSD`→`XMLN/USD`, `LTCUSDT`→`XLTC/USDT`, `LTCUSDC`→`XLTC/USDC`. Raw `wsname` differs from our canonical (6): `XXBTZUSD` `XBT/USD`, `XBTUSDT`, `XBTUSDC`, `XDGUSD` `XDG/USD`, `XDGUSDT`, `XDGUSDC`. 8 + 6 = your 14. The test fixture is exactly these 14 plus `XETHZUSD` as a control.
**Your "free instrument" (subscribe errors), run:** `ZGBP/USD` 0, `ZEUR/USD` 0, `XLTC/USD` 0, `XMLN/USD` 1 across `out*`/`error*`/`b74*` logs — and the control `BTC/USD` on a `B74` line is also **0**. ⇒ **the recorder does not log the symbols it subscribes, so these zeros carry no information** (rule 29(b)); the unit test on the real response shape is the deciding read.

## 3. Tests and their honest strength
`b-feed-health-grade-arm.test.ts` (9), running the real job and the real monitor singleton (only `generateReport`/`recordSnapshot`/`saveReport` are stubbed; `FEED_ALERT_COOLDOWN_SEC=600` set explicitly):
- critical → mint (2 rows: live + paper) → healthy → acknowledged once for the admin, state `healthy`;
- **C2 discriminator:** warning, then healthy with grade A → B → A → acknowledged **exactly once**;
- healthy start → nothing acknowledged;
- check-failed: throw → 2 mints; second throw inside the 600 s cooldown → none; healthy → acknowledged;
- segments at the bounds; `not_graded=config_missing`; `threshold=absent` printed, never a bare healthy;
- the universe: all 14 + control canonical, none of `ZGBP/USD`, `ZEUR/USD`, `XLTC/USD`, `XBT/USD`, `XDG/USD`;
- fences: `feed_health` prefetched; no `getActiveAlertId(` call / `activeAlertId:` field; no `cleanupOldFeedAlerts`.
**Mutation (your C2):** with the recovery predicate swapped to `monitor.shouldSendAlert(metrics.status, overallGrade)`, the discriminator test and the healthy-start test FAIL (run, restored). Guard test 40/40, aggregate test 37/37, **tsc 337 = 337** — reported fact. One fence first matched my own comment naming the removed method; narrowed to a call form.

## 4. Residual
- The dormancy block (`:104-133`) unchanged — your disposition (1).
- `routes.ts:15350-15365` (manual feed_health cleanup) and readers `:15294/:15306` — untouched; the "only acknowledger" sentence is corrected in the Step-10 record.
- Step 7 reads the 1,088 unacknowledged rows **per user** before and after the first post-deploy healthy cycle, and the first 8 recorder pairs (GBP/USD, EUR/USD, LTC/USD …) appearing in `crypto_spot_ticker_snap` within an hour of the restart.
- Deploy: this commit sits after `b523c86bf` (2a0c), so it rides whichever deploy carries 2a0c, not today's (which is `0c8ef5da2` unless you rule 2a0c in).

## Step-4 VERDICT — Langston, recorded by CC-C at the 2026-10-10 release (CC-B was not running)
Langston gave this verdict in Discord at 11:57:24Z (message `1558448355061792849`) and RE-AFFIRMED it on substance at 14:16:05Z, after a separate stateless run (12:02Z) had read only this file, found no verdict here, and said hold. He ruled that the 12:02 finding (the record did not carry the verdict) was real and its HOLD vacated; nothing withdrawn, no rollback. Shipped in release `ad01f5339b558ee968a7686d719e98b66e5fd01d` (2026-10-10T11:59:29Z, `RELEASE_DEPLOY_2026-10-10_PLAN.md`). Step 7 is CC-B's.
- **APPROVED at `3a549e3a9`** (two record items, neither blocking). Removals census-verified at head (`cleanupOldFeedAlerts` zero callers; `getActiveAlertId` only a comment + two narrowed call-form fences); premise measured (3 admins; 1,088 unacked `feed_health` rows). ⛔ **Citation as corrected by Langston 14:16Z:** `feed-health-aggregate.ts` is byte-identical between `0c8ef5da2` and the deployed sha, so its `isXstockMarketOpenUTC` suppression was already live and is NOT what this batch changed. **The batch's change is the WIRING:** `feed-integrity-monitor.ts` (+64; the filter at `:299`, the predicate injection at `:325`) and `feed-integrity-auto-check.ts` (+105). The direction is safe: xStock suppresses only when ALL considered symbols are closed (`:207-212`). **Record items for CC-B:** (a) `sessionSegmentUtc` uses fixed UTC bounds valid only to 2026-11-01 (a log label; needs a §13 home); (b) the Step-7 read must be a non-healthy→healthy TRANSITION, because `lastStatus` initialises `'healthy'` (`feed-integrity-monitor.ts:148`). **§13 disposition 5 (pre-existing, not this batch):** `feed-health-aggregate.ts:223` grades a class with no threshold row `healthy` forever; byte-identical in the rollback target.
