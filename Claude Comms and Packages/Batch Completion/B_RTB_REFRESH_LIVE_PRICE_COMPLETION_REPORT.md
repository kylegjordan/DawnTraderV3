# B-RTB-REFRESH-LIVE-PRICE — Completion Report (sprint row 59e)

**Owner:** CC-B (NEW Claude) · **change-class:** `architecture` · **Sprint plan row:** 59e — row 59 `B-ENTRY-LEVEL-RECHECK`'s pre-sprint increment, P1a (Kyle's directive 3, 2026-10-07) · **Issues:** `#1168` (frozen-levels half — note 2), `#1189` (Coltrane's [C1], closed here)
**Scope / pre-audit:** `Claude Comms and Packages/Scope Files/B_RTB_REFRESH_LIVE_PRICE_SCOPE.md` r1, `…_PRE_AUDIT.md` (r2 §5) · **Change list:** `Change Lists/B_RTB_REFRESH_LIVE_PRICE_STEP4_CHANGE_LIST.md` (r1 + r2) · **Deploy record:** `Scope Files/RELEASE_DEPLOY_2026-10-12_CCB.md`
**Code:** `40306a0a0` (Step 3) → `e8f575d3c` (Step-4 r2, APPROVED) · **CI:** run `38225689498` on `e8f575d3c`, per job TypeScript Check, Test Suite, Build, Docker Build — all `success` · **Deployed:** `e8f575d3c180bef3fb218d8e424d8f7d9048d725`, 2026-10-12T08:58:11Z (`pm_uptime` 08:58:01.358Z), with Analyst Claude's three row-33 commits (`839aeb386`, `9114cbdf8`, `1e48298ab`), cleared by them.

## 1. What it was for
The RTB refresh re-checked every queued signal every couple of minutes — on the levels stored at queue time. The refresh service fetched the live price (`priceCache.getBatch('readyToBuy', …)`) and discarded it, from the day it was built (`7a029f390`, 2025-12-23), against its own directive's `refreshAndRank(signals, prices)`. So a signal could wait days with its price already past its stop or target: at the audit's first read DOT/USD was 25 % past its planned entry four days after queueing; the oldest row had waited 4.8 days. And ([C1], Coltrane) a signal the refresh rejected stayed selectable until the batch delete ran, while one selected before a refresh could be opened after the refresh deleted it.

## 2. What shipped
| item | change |
|---|---|
| the ask | `server/services/rtb-retirement-ask.ts` — `readRetirementAsk`: the exit's own contract, dispatched on the row's persisted `asset_class`; crypto `selectCryptoTouch` with the paper exit policy (2,000 ms, 2 %); xStock the equities tick, refused when absent, cold, crossed/one-sided, without ask quantity, over the exit's staleness ceiling, or with an implausible spread against the symbol's own yardstick; every ambiguous arm ⇒ keep |
| the decision | `server/core/rtb/rtb-price-retirement.ts` — `decideRetirement`: `refuseTakerBooking` (its fifth caller); crypto first pass, xStock second consecutive; the ask's age re-checked at decision time (`ask_expired`) |
| the refresh | `server/services/rtb-refresh-service.ts` reads the asks and hands them in; the refresh runs whenever its bucket has signals; `cyclesRun` keeps its old gate. `server/core/rtb/ready_to_buy_service.ts` — the price decision before the SQE, retirement through the batch delete (`rejectedInRefresh`, `signal_eval_archive` `rtb-refresh`/`rtb_price`), the sampled shadow (`rtb_price_shadow`, ≤ 7 per signal per hour), the `[PASS]` counters |
| [C1] | the latch held through the delete and the map entry removed with it; `promoteSignal` returns `'deleted' \| 'missing' \| 'refreshing' \| 'delete_failed'` (the delete count read; the `promoted` fallback gone); the engine opens only on `'deleted'`; the dead second call removed |
| C8 | `EXIT_TRIGGER_MAX_AGE_MS` / `EXIT_TRIGGER_MAX_SPREAD_FRACTION` moved with their derivations into `server/core/trading/crypto-touch.ts`; one readers object, `server/services/execution/crypto-touch-readers.ts` |
| rule 18 | `hasPair`, `purgeInactiveClassSignals` (zero callers), fx5-scanner's unused import — archived and logged |
| schema | `shared/schema.ts` declares the unique index the database has, `(mode, symbol, strategy)` |
| tests | `b-rtb-refresh-live-price.test.ts` (28) + `b-rtb-retirement-ask.test.ts` (15); mutants caught |

## 3. Objectives
| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | the refresh reads the transactable ask from fail-closed sources; no price ⇒ no price decision | **YES** | `[PASS]` lines on every pass (57 in the window); `crypto_no_book_stale_book`, `xstock_cold_mark`, `xstock_implausible_spread`, `ask_expired` all counted as `unpriced` — none retired |
| 2 | LIVE: retire a signal whose ask is at or through its stop or target, durably | **YES** | 29 retirements in 14 minutes, stdout and archive agreeing (crypto 13 stop / 13 target, `passes=1`; xStock 3, `passes=2`); the pre-deploy named list (TAO, SKHY ×2, SNDK) — 0 of 4 left; every retirement on a two-sided book; STX/USD retired on its crypto book (0.3844) while the xStock book stood at 772.25/784.00 |
| 3 | SHADOW: reward-to-risk at the ask, the adverse move, the stop room against the spread | **YES** | 65 `rtb_price_shadow` rows, 65 distinct signals, exactly 1 each |
| 4 | [C1] closed in both windows | **YES** (code + driven tests); **live: unexercised** | the latch held open across a held delete in the test; the four claim outcomes tested; staging `claimRefused=0` across 20 summaries against a positive control of 31 summaries + 25 `OPEN_FAILED` — a measured zero, not evidence |
| 5 | the latch map cleaned; rule 18 | **YES** | the test reads the entry gone after the delete; `DELETED_COMPONENTS_LOG` |
| 6 | documented | **YES** | System Manual and System Impact Map (§7) |

## 4. Reviews
- **Step 1:** PROCEED (Langston), conditions C1-C4.
- **Step 2:** PROCEED, conditions C5-C9 (two blockers: the class dispatch; every ambiguous arm keeps). The dead admission tiebreak ruled a defect and homed (`#1190`, row 59f). Pre-registration committed first (`16e2dfb6c`).
- **Step 4:** CHANGES (three: the read-to-decide gap, the zero-row delete, the shadow change path's rate) → r2 → **APPROVED** at `e8f575d3c`.
- **Step 7:** CC-B, the deploy record.
- **Step 8:** **CONFIRMED** by Langston 2026-10-12, re-derived on his own instruments; three record corrections folded (the crypto denominator 478; two examples outside the window; the shadow excludes a retirement within a pass) and two additions (the per-signal coverage figure; row 59 increment 1's first live refusal).

## 5. Numeric corrections
- **PREVIOUSLY STATED** (Step 7): crypto outcomes 477. **NOW:** 478. **REASON:** a summing slip.
- **PREVIOUSLY STATED** (Step 7): "most get priced within the hour". **NOW:** 91 distinct signals across 73 symbols priced at least once in 14½ minutes, of a pool of ~101. **REASON:** the per-pass rate was the wrong object — `no_book` is a property of the symbol (Langston).

## 6. New findings / dispositions
- **The R-multiple admission tiebreak never runs** (`getQueuedSignal` filters a status no row carries) — ruled a defect; `HOME: B-RTB-ADMISSION-TIEBREAK-LIVE, owner CC-B, placed in SPRINT_TO_LIVE_PLAN at row 59f, after row 59e` (`#1190`).
- **Coverage.** The crypto check priced 37.87 % of passes (181 of 478) but 91 distinct signals in 14½ minutes; the never-priced tail is the missing WS book for queued symbols — the same root as the depth gate's `no_book` refusals now failing most promotion attempts. `#1085` / row 8b (Analyst Claude) — §9.4 disposition 5 on the cause; nothing new filed.
- **Row 59 increment 1's refusal fired live** in this window (KLAC/USD 09:09:36Z, fill 193.9 below its stop 195.246) — recorded on that batch's report and on `#915`.

## 7. Governance ledger
CHANGE-CLASS: architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | entry, at Step 11 |
| T1 | PHASE_HISTORY.md | ✅ | plain-language entry |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 59e) | ✅ | at Step 11 with this report in the report column; row 59f placed |
| T1 | PHASE_19_PLAN.md | N/A — no row there | the row is sprint row 59e |
| T1 | shared MEMORY.md + MEMORY_CC_B.md | ✅ mine / N/A shared | mine: position |
| T1 | the batch SCOPE | ✅ | r1 |
| T1 | the batch PRE_AUDIT | ✅ | r2, with the pre-registration, the measurements and C5-C9 |
| T1 | COMPLETION_REPORT | ✅ | this file |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B: 59e at Step 11; 59f added |
| T1 | Langston's MEMORY.md | ⏳ owed at Step 11 | Langston writes his own with his Step-11 confirm; ticked when the write lands |
| T2 | SYSTEM_MANUAL.md | ✅ | "the RTB refresh's price check" in the refresh section; `fetchFreshMetrics()` (the line that hid the defect) corrected as the headline; the clock table row, the call-site count, the boot line and the bootstrap step corrected |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | S6 rewritten (the latch's writer, reader, [C1] and the price-check state); §4.3 corrected (no TTL, the cadence, the price check, the fifth caller, the switch, the claim); §4.4's file; the clock subscriber `TCL_${mode}` |
| T2 | ACTIVE_PATH_FLOW.md | ✅ | the promotion block rewritten (the claim and its outcomes; the two removed calls; the maker `'pending'` warning) |
| T2 | RUNNING_ISSUES.md | ✅ | `#1189` closed; `#1168` note 2; `#1190` opened and placed; `#915` — the live refusal |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-12-A |
| T2 | DELETED_COMPONENTS_LOG.md | ✅ | `hasPair`, `purgeInactiveClassSignals`, the `promoted` fallback, the second call, the unused import |
| T2 | ADJUSTMENT_FRAMEWORK.md | N/A | no tunable gate threshold: the pass count is the pre-registered structural rule (M3), the shadow intervals are logging cadence, the exit constants moved unchanged |
| T2 | STORAGE_POLICY.md | N/A | new rows in an existing table (~700 shadow rows an hour at most, beside ~106,000 an hour already); retention unchanged |
| T2 | POST_AUDIT_ROADMAP.md · AUTHORITY_BASELINE.md · MULTI_ASSET_VTS_EXPANSION_PLAN.md · ASSET_CLASS_ONBOARDING_WORKFLOW.md · BUILD_METHOD_PLAYBOOK.md · LANGSTON_ARCHITECTURE.md · CLAUDE.md / CONDUCT.md · PRE_LIVE_SPRINT.md | N/A | not touched by the refresh's price check |
| T2 | MISTAKE_PATTERNS.md | N/A | no new instance |

## 8. Honest residual
- **The claim's refusal outcomes have not fired live** (`claimRefused=0`); they are proved by driven tests.
- **The never-priced tail:** a queued crypto symbol with no WS book and ticker sides never under 2 s at its refresh is never price-checked — kept, the safe direction; its cause is `#1085`.
- **The xStock leg is unreachable for a symbol whose admissibility is intermittent at the refresh cadence** (an unpriced pass resets the streak — the conservative choice; Langston's live instance KLAC/USD at a 37.5 s mark age) — a zero on the xStock leg there is unmeasurable, not evidence.
- **The series break:** `refreshedAttempted` grows from 2026-10-12T08:58Z (the refresh now runs on buckets the mark cache did not price) — filter at that boundary.
- **A signal whose entry has drifted INSIDE its levels is still kept on stored levels** — the band, row 59c (`#1186`).
