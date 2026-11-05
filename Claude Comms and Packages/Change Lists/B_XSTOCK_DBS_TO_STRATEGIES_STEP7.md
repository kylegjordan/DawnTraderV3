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

**⚠️ Rows 5-6 are a first look over ~90 seconds, NOT the pre-registered first-full-US-session read** (14:30-21:00Z today). PASS or FAIL is decided only on that session.

## Still to read (pre-registered)
- **(a)** over the first full US regular session: zero disagreements on all `mode='vts'` rows, with the 1 % floors on the `strategy_detect` rows, plus the null arm.
- **(a′)** per-row equality ≥ 99 % against `pair_scan_archive`, and coverage ≥ 93.9 % (baseline 96.89 %).
- **(b-observe)** SBT signals, VTS opens and paper opens. INVESTIGATE at > 10 paper opens, or > 50 % of xStock paper opens, or a geometry mismatch at open (the ratio vs the resolved multipliers, tolerance 0.02; crypto control 230/230), or an `EVAL_DETECT_FAIL`. Report how many evaluations clear the floor.
- **(c)** crypto unchanged; the P7 carrier counts before vs after.
- The evaluation-level refusal share beside the 18.3 % trade figure.
- **(d)** Filter Diagnostics for paper xStock in Chrome. ⛔ Not the Drift Dashboard.
- The B72 suite run against staging.
- **C-1:** `dd588f0d` (2026-11-06T10:47:40Z) records the structural cause; the SBT replacement window starts at **2026-11-05T05:36:24Z**.
