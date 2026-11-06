# B-VTS-NO-DECISION-VALVE — Completion Report

change-class: `architecture` · sprint plan row 4 · Phase-19 row `3n.q3` · `#1075`, `#1145` · owner CC-C (Analyst Claude) · ⏳ **STEP 11 — closes on Langston's confirm**

**Scope items left open:** none in this batch. **Homed elsewhere and not claimed here:** `#1144` (the `clamp_no_bid` arm has no age term, and the shadow lane's 48 h hold runs on wall-clock time — row 4c), `#1143` (weekday xStock Class B — row 40, `3b.f-c`), `#1073` (increment 2, a maker rest that can fill after its deadline while a price is refused — row 4b).
⚠️ **Two owed items done late, stated:** the rule-8 register enumeration owed at the landing (2026-10-06) ran 2026-11-06, so 2026-09-30 can only be recorded UNDETERMINED (the hot tables keep 30 days); and the collision set's quarterly re-audit alert, which the code comment and plan said was armed at Step 6, did not exist until 2026-11-06 (`53ec89a7`).

## 1. What it was for
When a VTS trade reached its time limit with no usable sell price, the booking resolver gave it a made-up price — the mark if the bid was refused (rule-8 Class A), the entry price if no mark existed (Class B) — and the trade was counted as a real outcome in everything the system learns from. On the shadow lane, 216 of 217 such xStock closes in September fell inside the weekend shutdown, booked at entry. Separately, the archive labelled a VTS trade's class from its ticker (`#1075`), and 8 tickers missing from the xStock/Kraken collision set let the crypto STX and STRK tokens be judged against the equities' prices (`#1145`).

## 2. What shipped
- `server/core/trading/vts-exit-booking.ts` — the clamp arms (`clamp_no_mark`, `clamp_no_bid`) return `price: null`.
- `server/services/vts-runner.ts` (LOCKED MODULE, named per `#1076`) — the real lane closes an unpriced trade through `closeVtsTradeUnpriced` (`time_stop_unpriced`, NULL outcome; no JSON record, friction, telemetry or outcome feedback); `archiveVtsExit` / `finishVtsClose` shared by priced and unpriced closes; the shadow lane writes `timeout_unpriced` with its arm and skips xStock while the weekend window is shut; per-class counters on both lanes; the `stale_timeout → shadow_max_hold` relabel removed (rule 18).
- `shared/asset-classes.ts` — collision set re-run in both directions (+8 tickers, USD and EUR; −BDX/USD), the `§10c.X` non-trigger replaced.
- `vts-trade-persistence.ts`, `vts-service.ts` — the carried class kept by the boot repair and used by the outcome feedback.
- `shared/schema.ts` + migration — `rtb_shadow_pairings.exit_booking_arm` (rollback in git).
- Tests: `server/tests/unit/b-vts-no-decision-valve.test.ts` (new) plus updated suites.
- Code `b24b755cd` + reader fix; Step 4 APPROVED by Langston 2026-10-01 (two in-commit conditions). Deployed in release deploy B, `3576d39810fa7428501b68ce341ee46533c24935`, 2026-10-06T15:45:04Z.

## 3. Objectives
| # | objective | result | evidence |
|---|---|---|---|
| 1 | A forced VTS exit with no usable sell price books NO price, both lanes | **YES** | since the deploy: 0 `shadow_max_hold`; 428 shadow `timeout_unpriced` (239 `clamp_no_bid`, 189 `clamp_no_mark`) and 5 real `time_stop_unpriced`, every one NULL price and P&L; 0 of 9,438 `virtual_trades` JSON records unpriced (change list "Step 7", `scripts/analysis/b_vts_no_decision_valve_step7.sql`) |
| 2 | The arm is on every closed row, both lanes | **YES** | 0 NULL `exit_booking_arm` across 70,924 post-deploy shadow closes; real-lane archive rows carry `exitBookingArm` (141 `time_stop` all `bid`) |
| 3 | The `clamp_no_mark` arm is counted | **YES** | `[8a-P3][VTS_TOUCH]` (real) and `[8a-P3][VTS_SHADOW_TOUCH]` (shadow, stdout) print `unpricedNoBid` / `unpricedNoMark` / `closedUnpriced` per class (read 2026-11-06 01:55Z) |
| 4 | The refusal alert carries the real refusal reason | **YES** | `no-trigger-vts-*` bodies name it, e.g. `most recent reason: no_transactable_side (too_old)` (STRK/USD, 2026-11-05) |
| 5 | The VTS close writes the carried class; collision intersection re-run | **YES** | archive rows with a `vts_xstock_spot_` trade id: 5,556 post-deploy, all `xstock_spot` (4 `crypto_spot` before); 23 post-deploy crypto STX/STRK closes all `crypto_spot`, median holds 1,138-1,868 min against STX's 1.0 min before; the archive's 1,477 post-deploy crypto-lane closes all `crypto_spot`; in the `virtual_trades` JSON, every post-deploy crypto-lane record on the 8 collision tickers is `crypto_spot` (A 5, STX 21, STRK 13) and every `xstock_spot` one is a genuine xStock-lane trade (read by `signal.id`, since the record id is the same shape in both lanes) |
| 6 | (P6, Langston C5) The shadow lane honours the weekend shutdown | **YES** | 0 xStock shadow closes inside the first shut window [10-10 00Z, 10-12 00Z) against 193 in the same window a week earlier, all at entry price; 186 closed at the reopen, 66% unpriced — a floor, the build live then (`620b1b6b5`) held the first pass to 00:35Z |

**Calibration line (epoch rule 2):** impact NAMED, not epoch-bumped. The change removes made-up outcomes from VTS learning rather than shifting a scale; the rows it would have made are now absent, and the ones already made are excluded by id or selector in the rule-8 register (Classes A and B, and the STX/STRK selector).

## 4. Reviews
Step 1 scope r2 APPROVED · Step 2 APPROVED 2026-10-01T22:12Z (C4-C7) · Step 4 APPROVED 2026-10-01 · Step 7 read 2026-11-05 · Step 8: Langston confirmed (a)-(e) and (f)'s substance, sent back (f)'s attribution (F1 the build, F2 the band argument, F3 the arm's meaning), folded at `7330350e5`, plus the STRK observation datum at `fc946003c`.

## 5. Numeric corrections
**PREVIOUSLY STATED (pre-registration):** the first reopen closes ≈ 100-115 xStock shadows. **NOW:** 186. **REASON:** the band was set from two weekends (114, 103) before the 10-03 weekend (193) existed; the population before 10-10 was ~60× larger (30,461 eligible opens), so the band was never tested against such a week — the excess is unexplained, not attributed (Langston F2).

## 6. New findings / dispositions
- **The `clamp_no_bid` arm has no age term** — `DISPOSITION: added to B-SHADOW-HOLD-CLOCK (row 4c, #1144)`.
- **A 60× burst in xStock shadow minting on 10-07..10-09, cause unestablished** — surfaced by Langston to Kyle; not this batch's to place.
- **An open STRK/USD VTS trade has had no transactable side for ~30 h** — the batch's subject arriving live; its 7-day max-hold falls 2026-11-11 17:24Z (change list observation datum). `DISPOSITION: folded into this batch's record — read at its max-hold`, carried by scheduled alert `00b727aa-e1b6-4277-902f-4c6f628c167f` (Langston's Step-8 condition).
- **The collision re-audit alert never existed** — `DISPOSITION: folded into this batch`; armed 2026-11-06 (`53ec89a7-b481-47e8-841e-c8fcadfb825a`, 2027-01-01, dedupe `collision-set-reaudit`).

## 7. Governance ledger
CHANGE-CLASS: `architecture`

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry: what it fixed, how, result, issues closed and left |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 4) | ✅ | row 4 at Step 11 with this report linked |
| T1 | PHASE_19_PLAN.md (row `3n.q3`, in flight there) | ✅ | the row finished: Step 11, report linked, its counter item marked landed |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | ✅ mine / N/A shared | mine: position line; no shared truth changed |
| T1 | the batch SCOPE | ✅ | written at Step 1 |
| T1 | the batch PRE_AUDIT | ✅ | written at Step 2 |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | Observation column | ✅ | the pre-registered first-weekend reads (c) and (f), read 2026-11-05; the STRK max-hold 2026-11-11 is a datum, not a gate, carried by scheduled alert `00b727aa-e1b6-4277-902f-4c6f628c167f` (2026-11-11T17:30Z) |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-C: row 4 at Step 11 |
| T1 | Langston's MEMORY.md | ✅ | the valve section collapsed to a pointer at Step 11 — part `37721052e210`→`95fcbfdffd24`, −3,291 B; loaded set 140,415 B against the 143,856 ceiling |
| T2 | SYSTEM_MANUAL.md | ✅ | §18.0.1: the VTS crypto booking cell corrected, and a paragraph on unpriced closes, the weekend skip, the carried class and the re-audit |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | the exit-booking entry and S19 (the shadow lane's weekend skip and arm column) |
| T2 | RUNNING_ISSUES.md | ✅ | `#1075` and `#1145` closed; `#1144` gained the arm item (Step 8) |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-11-06-B |
| T2 | ADJUSTMENT_FRAMEWORK.md | ✅ | rule 8: the landing enumeration (late) with its directions, the register closed to new A/B members and the `exit = entry` predicate retired, the collision selector (lane vs stamp, all 8 tickers) |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | the `stale_timeout → shadow_max_hold` relabel |
| T2 | GOVERNANCE_EXCEPTIONS.md | BLOCKED — Langston's Step-11 confirm | the two `open` rows (2026-10-07, 2026-11-05) flip to closed when the confirm lands |
| T2 | STORAGE_POLICY.md | N/A | the new column sits on an existing table; no retention change |
| T2 | MISTAKE_PATTERNS.md | N/A | this batch's `wrong-object` trailers (`7330350e5`, `1107fde64`) fall after the W44 pass window and are counted at W45 |
| T2 | POST_AUDIT_ROADMAP.md · AUTHORITY_BASELINE.md · MULTI_ASSET_VTS_EXPANSION_PLAN.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md · BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · rule history · ALERT_HANDLING_PROTOCOL.md · DELIVERY_BOARD_PROTOCOL.md · CLAUDE_CODE_FEATURE_WATCH.md | N/A | no phase, constitutional, expansion-plan, onboarding, method, reviewer, rule or process change |

## 8. Honest residual
- **The unpriced population is small so far** — 5 real-lane and 428 shadow closes in a month; the valve's real test is a refused max-hold on an open trade, and one (STRK/USD) is due 2026-11-11.
- **Weekday Class B is not covered** (SYK/USD 09-16) — homed at row 40.
- **The excess at the first reopen (186 against 100-115) is unexplained**, and so is the minting burst behind it.
- **September's register rows can no longer be re-derived from the hot tables** — the 2026-09-30 §9.7 enumeration stands as the record for that month.
