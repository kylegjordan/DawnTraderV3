# B-XSTOCK-DBS-TO-STRATEGIES (#1235) — STEP 6 + STEP 7 RECORD (in progress)

## Step 6 — deploy
- **Deployed:** `8636040255b9ffb0a83edf6bf189d97e6e227763` by `dt-deploy --by cc-b`, **2026-11-05T05:36:24Z**: "live, engine resumed, identity asserted", restart 674.
  - Migration ran at **05:36:11Z**, BEFORE the restart (818 ms; `dt-deploy` migrate-between-build-and-restart).
  - Rollback target: `10df95fb0e227ec12b0d33f7aa8b09dba193906b`, which OLD Claude deployed 04:35:29Z.
- **CI on the deployed sha:** run `41974716842`: TypeScript Check (baseline gate), Build, Test Suite and Docker Build all success.
- **Runtime diff staging → deployed sha:** this batch's 11 files only (`git diff --stat 10df95fb0 863604025` over `server shared client scripts drizzle package.json`). OLD Claude's unreviewed `dc766f721` was held out at `863604025`.
- **History of the landing:** first pushed `e50523209`; reverted `c037f629a` (unreviewed, was blocking OLD/ANALYST's D-2 order-2/3 deploy); Langston Step-4 PROCEED on `e3a295e93`; re-landed `d35670b5c` (byte-identical on all 11 paths); condition fix `da796affa`.

## Step 7 — first reads (pre-registered criteria: pre-audit r5 P10, change list)
| # | check | instrument | result |
|---|---|---|---|
| 1 | the 3 settings rows exist | `module_constants WHERE updated_by='b-xstock-dbs-to-strategies'`, 05:37Z | exactly 3: `strategy_dbs_routing_guards.dbs_min_threshold */*/volatility_edge/* = 0.35`; `strategy.vwap_pullback.strong_trend_override_stop_atr_mult crypto_spot = 4.0`; `…target_r_multiple = 3.0` |
| 2 | OBJ-3 coverage on the cycle summary | `out.log`, first three xStock cycles after the restart | 05:37:11Z `detect_evals=204 dbs_carried=204 dbs_ge_035=112`; 05:37:24Z `132/132/64`; 05:37:54Z `112/112/65` → **coverage 100 %** (per detect call, strategy-weighted; a different population from (a′)'s archive rows) |
| 3 | (E) the archive switch | `out.log` 05:36:22Z bootstrap line | `pre_filter=true` (read at the deploy; read again at the measurement) |
| 4 | P7 carrier, xStock | `error.log` `[B79.0m.b2][EVAL_DETECT_FAIL]` | 0 lines in the whole current file, and 0 since 05:36Z |
| 5 | **(a) EARLY agreement, NOT the pre-registered session read** | `signal_eval_archive`, xStock, `mode='vts'`, since 05:36:24Z, ~1.5 min | **morning_star** 264 rows (260 detect): `b63_strong_dbs_exclusion` 167, `b63b` 19; **disagreements 0 (≥ 0.35 side) and 0 (≤ −0.35 side)**. **sma_trend_ride** 20 rows, `b63b` 12, disagreements 0. **vwap_pullback** 104 rows, `b63b` 0, disagreements 0. Every row carries `detectDbsScore`; 0 null. |
| 6 | (b-control) strong_bull_trend | same | 69 detect rows, **`dbs_below_threshold` 26 of 69 (37.7 %)**, down from 100 % (31,509 / 31,509 on 11-04); **5 SBT rows at post-detect gates** (signals produced, the first ever on xStock). |
| 7 | (b-observe) (iii) geometry at open — **criterion object corrected (pre-audit r6)** | `signal_eval_archive` xStock SBT `mode='vts'` `admitted`, 05:36:13Z → 06:27Z, 06:31Z read | **7 of 7 plans exact: `(target − stopLoss)/atrAtOpen` = 9.0000** (3 + 6). Langston's hit, `MSFT/USD` 298129138 at 1.5751, was the FILL, not the plan: booked at the ask 552.43 (`entryPriceBasis: ask`), plan entry 551.94 (out.log `[B5.SIGNAL_CREATED]` 06:20:53Z). 1 of 7 fills off the plan, 0.49 above: **taker/maker split 1 taker (MSFT, off plan) and 6 makers (on plan by construction)**, re-read from the EFFECTIVE mode (`[B79.0m.b2][EVAL] … mode=`) at each open; the `[VTS][MAKER_TAKER]` line first used is the pre-fallback choice and is the wrong read-site (Langston, msg 1567827634472353949). ⚠️ **A snapshot of 05:36-06:27Z, not the session figure:** 00:00-08:01Z held 29 xStock SBT VTS opens (24 maker, 5 taker, Langston's count); the pre-registered read is the 14:30Z session. Multipliers as of each open: 3.0 / 6.0, unchanged since 2026-05-05 (r7). Control: crypto 231/231 at 9.0000, 0 fills off plan. |

**⚠️ Rows 5-6 are a first look over ~90 seconds, NOT the pre-registered first-full-US-session read** (14:30-21:00Z today). PASS or FAIL is decided only on that session.

**Pre-session look, 2026-11-05 14:20Z (NOT the pre-registered session read):** (b-observe) xStock PAPER opens since 05:36:13Z = **7** (`closed_trades.strategy_name`): vwap_pullback 3, strong_bull_trend **2** (11:48Z, 12:44Z), sma_trend_ride 1, morning_star 1 — below both INVESTIGATE lines (> 10 paper opens; > 50 % of xStock paper opens). xStock VTS admitted rows over the same window: strong_bull_trend **88 of 111** (79 %); the VTS is not the trigger's object, but the share is recorded for the session read.

**Restart inside the observation window (recorded, not a confound for the session read):** OLD Claude deployed `c0214c9736ee86d7523fd33319ad4c935a929b80` at 2026-11-05T08:08:30Z (restart 675 → 676). This batch's runtime content in it vs `8636040255` is `686d62c9e` only (comments). It lands before the 14:30Z session, so the session read runs on one build.

## THE PRE-REGISTERED SESSION READ — 2026-11-05, US regular session 14:30-21:00Z (read 21:20-21:35Z)
| check | result | verdict |
|---|---|---|
| **(a)** disagreement, all xStock `mode='vts'` rows | morning_star 101,269 rows (100,641 detect; `b63_strong_dbs_exclusion` 62,013, `b63b` 7,836): **0 / 0** disagreements; sma_trend_ride 14,048 (13,728 detect; `b63b` 8,405): **0**; vwap_pullback 35,085 (33,138 detect; `b63b` 116): **0**; strong_bull_trend 32,410. **Null arm: 0 rows without `detectDbsScore` in 182,812.** Floors: every gate count is far above 1 % of its detect rows except vwap_pullback `b63b` (116 of 33,138 = 0.35 %), which sits BELOW the 1 % floor — reported, not a disagreement | **PASS** (agreement); vwap `b63b` under its 1 % floor flagged for Step 8 |
| **(b-control)** SBT `dbs_below_threshold` | **12,138 of 31,530** detect rows (38.5 %), from 100 % (31,509 / 31,509, 11-04 session) | **PASS** |
| **(b-observe)(i)** SBT xStock paper opens | **14** (`closed_trades`, opened in the session) — 2 `never_filled` rests, so **12 filled** | ⚠️ **INVESTIGATE — over the pre-registered 10 either way** |
| **(b-observe)(ii)** SBT share of xStock paper opens | 14 of 31 (45 %) — vwap_pullback 15, morning_star 1, pivot_shift 1 | under 50 % |
| **(b-observe)(iii)** geometry at open | **159 of 159** SBT xStock VTS admitted rows at span **9.0000** (min = max), 0 off by > 0.02; multipliers 3.0 / 6.0, unchanged since 2026-05-05T15:24:26Z | **PASS** |
| VTS admitted, SBT share | 159 of 310 xStock VTS admitted rows (51 %) | recorded (the VTS is not the trigger's object) |

| **(a′)** per-row equality vs `pair_scan_archive` | 2026-11-05 15:00-16:00Z (the baseline's own hour shape): 43,756 xStock VTS rows; **matched 42,388 = 96.87 %** (same or previous minute, scan at or before the row); **equal 42,185 of 42,388 = 99.52 %** (\|Δ\| < 1e-6) | **PASS** (≥ 99 %, ≥ 93.9 %) |
| evaluation-level refusal share (beside the 18.3 % trade figure) | the four strategies' DBS guards refused **90,508 of 179,037** xStock VTS detect rows in the session (50.6 %): strong-exclusion 62,013, counter-trend 7,836 + 8,405 + 116, SBT below-threshold 12,138 | recorded |
| **(c)** EVAL_DETECT_FAIL | 0 lines in the current and every kept rotated `error*.log` | 0 (instrument: no positive control in these files) |
| **(c)** crypto, same hour 11-04 vs 11-05 | crypto VTS rows morning_star 179 → 32, strong_bull_trend 728 → 169, vwap_pullback 2,882 → 72, sma_trend_ride 0 → 35 (all `b63b`); every other guard share 0 % both days | ⚠️ NOT decision-grade: one hour per day, different markets, and the batch's migration seeds two `crypto_spot` rows (`vwap_pullback` strong-trend override 4.0 / 3.0) — the claim "crypto unchanged" is not established by this read; carried to Step 8 |

**Alert `dbc60600-e93b-40cf-b4b1-3561b4084bff` resolved 2026-11-05 ~21:45Z; its `--evidence` reads `ef9b901897`, a TYPO for `ef9b901898c5c13745ab3de2176e4620d502a4c4` (this record's commit).**

**Still owed before Step 8:** (c)'s three P7 carrier log counts before vs after (as named in pre-audit P7), a decision-grade crypto comparison, (d) Filter Diagnostics paper xStock in Chrome (never the Drift Dashboard), the B72 suite against staging. Next working session, with the `dd588f0d` SBT verdict (11-06 10:47:40Z).

**THE INVESTIGATE — the 14 trades (read 21:30Z):** 14:45 APP never_filled · 14:48 TPR stop 14:49 −0.41 · 14:49 BDX open · 14:52 WFC stop 14:56 −0.26 · 14:55 EPAM open · 14:56 TAP stop 17:24 −1.06 · 14:58 EIX stop 15:19 −0.32 · 14:59 ALB stop 16:06 −1.28 · 15:11 BTI stop 19:19 −0.47 · 15:24 XEL stop 15:43 −0.22 · 15:25 USB stop 15:26 −0.18 · 15:26 MCK never_filled · 15:45 D stop 15:49 −0.16 · 16:00 MSI stop 17:26 −1.41. **10 closed, 10 stop_hit, 0 wins, −$5.75** on ~$40 notionals; 2 open. Stop distance from entry ranges 0.21 % (D) to 3.9 % (MSI); the four tightest (D 0.21 %, USB 0.28 %, XEL 0.38 %, WFC 0.47 %) stopped in 1-19 minutes. Context, not a comparison: the whole session's closed xStock paper trades are 0 wins of 21 (vwap_pullback 8, −$2.67; pivot_shift 1). **What this is and is not:** an observation, reported as pre-registered. It is NOT a defect finding — no cause is claimed (the stop/spread relationship is unmeasured). Kyle's standing rule: strategies run until calibration; the structural verdict is alert `dd588f0d` (2026-11-06 10:47:40Z, C-1). DISPOSITION: decision required — no work, reported to Kyle with the trades (Discord + Desktop, 2026-11-05 ~21:35Z); the SBT verdict alert decides.

## Still to read (pre-registered)
- **(a)** over the first full US regular session: zero disagreements on all `mode='vts'` rows, with the 1 % floors on the `strategy_detect` rows, plus the null arm.
- **(a′)** per-row equality ≥ 99 % against `pair_scan_archive`, and coverage ≥ 93.9 % (baseline 96.89 %).
- **(b-observe)** SBT signals, VTS opens and paper opens. INVESTIGATE at > 10 paper opens, or > 50 % of xStock paper opens, or a geometry mismatch at open (the ratio vs the resolved multipliers, tolerance 0.02; crypto control 230/230), or an `EVAL_DETECT_FAIL`. Report how many evaluations clear the floor.
- **(c)** crypto unchanged; the P7 carrier counts before vs after.
- The evaluation-level refusal share beside the 18.3 % trade figure.
- **(d)** Filter Diagnostics for paper xStock in Chrome. ⛔ Not the Drift Dashboard.
- The B72 suite run against staging.
- **C-1:** `dd588f0d` (2026-11-06T10:47:40Z) records the structural cause; the SBT replacement window starts at **2026-11-05T05:36:24Z**.
