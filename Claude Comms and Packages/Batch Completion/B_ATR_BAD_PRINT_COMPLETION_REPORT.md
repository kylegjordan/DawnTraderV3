# B-ATR-BAD-PRINT — Completion Report

**Owner:** CC-B (NEW Claude) · **change-class:** `architecture` · **Sprint plan row:** 2a, after row 2 · **Issue:** `#1153` (closed at Step 10); `#972` annotated; `#371` identity preserved by construction
**Scope / pre-audit:** `Claude Comms and Packages/Scope Files/B_ATR_BAD_PRINT_SCOPE.md`, `…_PRE_AUDIT.md` (evidence: `Scope Files/B_ATR_BAD_PRINT_evidence/`) · **Change list:** `Change Lists/B_ATR_BAD_PRINT_STEP4_CHANGE_LIST.md`
**Code:** `ef4c7c8be` (Step 3) → `934d0d6a3` → `2297c285f` → `66530fc48` (Step 4 APPROVED) → `cf881d302` (Step-8 condition; behaviour unchanged, ships with the next deploy) · **Deployed:** `0c8ef5da2582e03effd21070fb09b9ad5715ed77`, 2026-10-07T15:56:00Z; CI run `37566679783` on that sha, 4/4 per job. CI on `cf881d302`: run `38085049493`, 4/4 per job (TypeScript Check, Test Suite, Build, Docker Build).

## 1. What it was for
A trade's stop and target are set from the ATR, the pair's typical hourly move. Every ATR was a plain mean of the last 14 hourly ranges, so one off-market trade in Kraken's hourly candles could carry the whole value. On 2026-09-23 GBP/USD printed a high of 1.70000 against ~1.324; the ATR rose more than tenfold and the trade got a 5.4 % target on a currency that moves well under 1 % a day. LIGHTER did the same with a 0.110 low. Both were among the seven stuck paper positions Kyle asked about on 2026-10-05 (`#1153`). There were six copies of the calculation, so a fix in one could miss the others.

## 2. What shipped
| item | change |
|---|---|
| one estimator | `server/core/calculations/true-range-atr.ts`: `trueRange`, `computeAtr` (E3 — each bar's high and low clipped to its own body ± 3 × the window's median true range, then the plain mean), `atrOrZero`, `WICK_CLIP_MULTIPLE = 3`. Chosen against criteria committed before any estimator was run (pre-audit §0-§1d; Langston ruled E3) |
| six copies repointed in one commit | MCE `computeATR`, `strategy-engine.ts` `computeATR`, `strategy-helpers.ts` `calculateATR`, and the three scanner DBS copies (`fx5-scanner.ts`, `market-scanner.ts`, `xstock_spot/scanner.ts`). A source fence over `server/` keeps it that way, with named carve-outs: the 1-minute exit-replay ATR (`#866`) and ADX (row 2a1) |
| fallbacks fail closed (ruling (e)) | the pattern path's `?? price × 0.02` ATR and its `× 0.97 / × 1.03` stop/target; `patternToTradeSignal`'s 1 % / 2 %; `strategy-engine.ts`'s `(high24h − low24h) × atr_fallback_daily_range_frac` (row retired by migration, rollback tracked). A pattern with no usable ATR is dropped and counted (`PATTERN_ATR_DROPS`), with evaluation errors counted beside it (`PATTERN_EVAL_ERRORS`) |
| the clamp | kept as the GUARD-2 data-integrity bound (10 % of price, floor 0.1 %), now NaN/∞-safe; guard and MCE read the same function, so clamped ≤ raw (`#371`) by construction |
| VTS and dashboard (Step 4 §9b) | the VTS score fabricates no ATR or 24-hour range; the drift dashboard honours the exclusion flag and divides its % averages over rows that have an entry price |
| labels | the false "14-period Wilder" in `market-scanner.ts` and `LEVER_INVENTORY.md:168` corrected (a plain mean, as every copy was) |
| Step-8 condition | the pattern loop's gate and counter moved into `usableAtrOrCount` (`true-range-atr.ts`), so a test drives the counted branch (7 bad values ⇒ 7 counted; with the increment removed the test fails) |
| tests | `server/tests/unit/b-atr-bad-print.test.ts` — 24 |

## 3. Objectives
| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | one ATR for every decision, robust to a single off-market bar | **YES** | the census fence (every ATR call site resolves to the shared function, carve-outs named). **On a real bad print, in CI:** `b-atr-bad-print.test.ts:45` runs the actual GBP/USD Kraken 60-minute bars 2026-09-23 06:00–20:00Z — plain mean > 10× the clean 13-range mean, E3 ≤ 1.5×. **Live, on every crypto open since the deploy (Langston re-derived, 2026-10-10):** stored ATR vs E3 recomputed from Kraken's public 60-minute bars on **17 of 17** — min 0.688×, median 1.000×, max 1.198×, none above 1.25× |
| 2 | a real volatility jump still raises the ATR | **YES** | pre-registered fixtures: (b) three moving wide bars and (c) a gap-and-hold each keep ≥ 80 % of the plain rise; the 128-row harm check moved no ATR by more than 1.34 %; the 18 GENUINE rows unchanged at 1.16-1.65×. Live: the three wide post-deploy targets Langston checked (RLC/USD +52.2 % on an ATR of 8.74 % of price, ORCA +35.8 %, MET +34.6 %) agree with the recompute within 20 % — genuinely volatile pairs, not bad prints |
| 3 | every ATR fallback on a geometry path fails closed | **YES** | five sites dispositioned per ruling (e). Staging: `atr_fallback_daily_range_frac` 0 rows (control: 17 other `strategy.vwap_pullback` rows present), read 2026-10-10. Pool line: `PATTERN_ATR_DROPS 0` / `PATTERN_EVAL_ERRORS 0` on 283 of 283 lines of the running process, and the same lines carry 26,966 `PATTERN_NOMATCH_DROPS`, which are tallied strictly after the ATR gate in the same loop — so the gate was reached and passed 26,966 times and the zero is readable (Langston). The counted branch itself never fired live; it is proven by the driven test |
| 4 | correct the labels | **YES** | `market-scanner.ts:20` and `LEVER_INVENTORY.md:168` at the ref |
| 5 | document the one ATR | **YES** | System Manual "ATR — the one shared estimator (E3)"; System Impact Map 5.2.5a and the pattern-gate note; both updated again at Step 10 with the live check and the clip-observability gap |

## 4. Reviews
- **Step 1:** APPROVED on r2 (Langston 2026-10-06); ADX placed at row 2a1, the volatility cache left whole at row 2a2.
- **Step 2:** APPROVED with ruling (e) fail closed; the estimator chosen against criteria committed first (`d4c96ef76`), re-scored under a predicate registered before the re-score (`0c4c9adf1`).
- **Step 4:** APPROVED at `66530fc48` after conditions 1-2 (count evaluation errors; drop a dead entry-price fallback), the §9b fold (the VTS and drift dashboard) and R1/R2.
- **Step 7:** CC-B, recorded in `Change Lists/RELEASE_DEPLOY_2026-10-07_PLAN.md` row 2a: code live, `atr_at_open` agrees with Kraken (read 2026-10-10 19:35Z).
- **Step 8:** **CONFIRMED** by Langston 2026-10-10 20:41Z, re-derived at the running tree (`e1b37c2d5`, which contains the batch; `true-range-atr.ts` blob identical three ways). One condition — drive the counter once — met at `cf881d302`, CI `38085049493` 4/4.

## 5. Numeric corrections
- **PREVIOUSLY STATED:** the live `atr_at_open` check covered the 3 crypto positions still open, and `closed_trades` "does not carry `atr_at_open`", so closed trades could not be used. **NOW:** 17 of 17 crypto opens since the deploy. **REASON:** `closed_trades` carries `metadata.atr`, which is the same value — `active-execution-engine.ts:5916` writes `atr_at_open: signal.metadata.atr ?? 0`, and on the three open rows the two keys are byte-identical. My object discarded 14 measurable trades (Langston). Corrected in the release record.
- **PREVIOUSLY STATED:** 18 tests (System Impact Map 5.2.5a). **NOW:** 24. **REASON:** the Step-4 conditions and the Step-8 condition added tests.
- **PREVIOUSLY STATED (release record):** "`PATTERN_ATR_DROPS` non-zero" as the pass condition. **NOW:** 0 is the healthy reading. **REASON:** the counter counts candidates dropped for having no usable ATR; my wording, corrected in place on 2026-10-08.

## 6. New findings / dispositions
- **When the clip fires it records nothing** — no stamp, no log, no field — and the hourly candle cache is in memory for five minutes and never saved. So no open's bars can be recovered, the record can never show whether the clip acted, and the evidence needed to move `WICK_CLIP_MULTIPLE` is exactly the evidence that is never written. The two sub-1 ratios (Q/USD 0.688×, W/USD 0.796×) cannot be told apart between a clip that fired and a cache-staleness difference for the same reason (the safe direction either way). The fix is one field: raw and clipped ATR when they differ. **Disposition 2:** `HOME: fold into B-ADX-TRUE-RANGE-SHARED, owner CC-B, placed in SPRINT_TO_LIVE_PLAN at row 2a1, after row 2a` (Langston's routing; same estimator, same call sites).
- **xStock `atr_at_open` is 0 on 14 of 14 post-deploy xStock opens with the `atr` key absent** — the `?? 0` at `active-execution-engine.ts:5916` dresses an absent value as a zero (the `#546` shape). This is `#972` (open, owner CC-B), not this batch. **Disposition 2:** added to `#972`'s record.
- `#1157` (`risk_index.ts` orphan, found by the second reader at Step 4): already placed, row 2a1a.

## 7. Governance ledger
CHANGE-CLASS: architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: what changed, the live result, issues |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (rows 2a, 2a1) | ✅ | 2a at Step 11; the clip-observability field folded into 2a1's description |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the row is sprint row 2a |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ mine / N/A shared | mine: position |
| T1 | the batch SCOPE | ✅ | Step 1, r2 |
| T1 | the batch PRE_AUDIT | ✅ | Step 2: pre-registration, rounds, ruling, audit A1-A12, plan |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B: the open-and-stalled table moved to Step 11 for 2a, the 10-10 deploy row brought current |
| T1 | Langston's MEMORY.md | ⏳ owed at Step 11 | Langston writes his own with his Step-11 confirm; ticked when the write lands (his nit, 2026-10-07) |
| T2 | SYSTEM_MANUAL.md | ✅ | in-batch (`ef4c7c8be`): the E3 section; Step 10: the live 17-of-17 check and the clip records nothing |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | in-batch: 5.2.5a, the MCE/DBS/pattern-gate notes, the forming-hour note; Step 10: tests 18 → 24, `usableAtrOrCount`, the clip-observability gap |
| T2 | RUNNING_ISSUES.md | ✅ | `#1153` closed; `#972` annotated (14 of 14, the `?? 0` shape) |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-07-B — a real trading-system defect (stops and targets set off a bad print) |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | the five plain-mean bodies, the five fallbacks and the retired `atr_fallback_daily_range_frac` row |
| T2 | ADJUSTMENT_FRAMEWORK.md | ✅ | Appendix B: `WICK_CLIP_MULTIPLE = 3` is a code constant tied to a pre-registered test; moving it needs the clip field first |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | ✅ | in-batch (`6839e30b2`): xStock's MCE ATR window added to the 15-minute working list (F.3) |
| T2 | LEVER_INVENTORY.md | ✅ | in-batch: the false "Wilder" label |
| T2 | POST_AUDIT_ROADMAP.md · AUTHORITY_BASELINE.md · STORAGE_POLICY.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md · BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · PRE_LIVE_SPRINT.md | N/A | no roadmap, authority, storage, onboarding, method, reviewer or rules change |
| T2 | MISTAKE_PATTERNS.md | N/A | the 3-vs-17 population is a `wrong-object` instance, carried in the Step-10 commit's trailer |

## 8. Honest residual
- **The clip has not been seen to fire in production.** On the venue's own bars it was inert on 17 of 17 opens. What it does on a real bad print is shown by the CI test on GBP/USD's real bars and by the Step-4 replay, not by a live event — and a live event would leave no trace until row 2a1 adds the field.
- **The drop counter has never been non-zero live.** The counted branch is proven by the driven test only; the live pass branch has 26,966 exercises.
- **`cf881d302` is not deployed yet.** It changes no behaviour (the same gate and counter, moved into a function); it ships with the next deploy.
- **Not covered here:** ADX's own true ranges (row 2a1); xStock's 14-bar ATR on 15-minute bars (CC-C's working list, F.3); xStock `atr_at_open` = 0 (`#972`).
