# B-OHLC-FRAME-GUARD — COMPLETION REPORT

**Batch:** `B-OHLC-FRAME-GUARD` · owner CC-C · sprint row 13 · Phase-19 row `3b.h-6` · issues `#1028`, `#1029` (and item 46) · **change-class `non_architecture`** (scope header).
**State:** ✅ CLOSED 2026-11-06 — Step 11 CONFIRMED by Langston (Langston, Discord `1568262167302770764`; Step 8 stands, its premise re-derived by him at the close ref against the live deployed `0f4835b5a`). Written 2026-11-06.

## OPEN ITEMS AND LIMITS — STATED FIRST
1. **The reject path has never fired in production.** `ohlcFramesSkipped` was 0 on all four classes at every read (2026-09-11, 2026-11-06) — zero opportunity. The guard's firing is proved by its 38 unit cases and the 29-mutation proof, not by traffic; the panel's amber `> 0` branch (`analytics.tsx:1985`) has never rendered. **No live silence may be cited for it** (`#661` leg 3).
2. **The on-screen panel check never ran.** The pre-registered instrument (open Analytics → Drift Dashboard, abort at 7 of 10 pool connections) is **UNREACHABLE**: the tab's sibling panels exhaust the shared pool (`#1037`, `#1239`; aborted 2026-10-02, lock-up 2026-11-04). Langston ruled the bounded read of the card's own endpoint discharges Step 7 (below). **The one leg still unproven — whether the card's fetch completes under that contention — is a named leg on `B-DB-POOL-GUARD` increment 3's Step 7, owner CC-A.**
3. **Moved out, not in this batch:** OBJ-8 (`#1030`, the futures poller storing a minute as first polled) → `3b.h-7` `B-FUTURES-BAR-FINAL`; OBJ-9 (`#1031`, write order) → the F-G-1 reopen, closed 2026-11-06. The 7-day and 30-day panel windows will mostly read UNKNOWN (exact counts cannot finish in 4 s on these tables) — a cheaper measure is design work, homed with the diagnostic screens.

## 1. WHAT THE BATCH IS FOR, AND WHAT SHIPPED
Alert `b48a743f` (2026-09-11): a one-minute price bar arriving with no price became the text "undefined", and the archive writer threw away the whole batch with it (`#1028`). ⚠️ **What this close does NOT say: "the writer stopped failing."** Of all 7 writer-failure alerts with `source=ohlc-batch-writer` ever minted, only the pre-fix `b48a743f` carries `invalid input syntax for type numeric: "undefined"`; the 6 after the deploy (2026-10-17 ×2, 2026-11-04 ×4) are database timeouts and the retry-buffer bound — a different cause, homed on `#705` / `#1037` / `#1078` / `3b.h-8` (Langston's measurement at Step 11). Those are mints under a dedupe key, so a lower bound on failures; `ohlcFramesSkipped` 0 remains the only statement about bars actually skipped. The 1-minute xStock table feeds the higher-timeframe bars the scanner builds signals from (`ohlc-aggregator.ts`), so a dropped batch is a gap in signal input.
- **One validator** (`server/services/passive-archive/ohlc-frame-validator.ts` `validateOhlcFrame`, pure) over all eight bar fields — OBJ-1. ⛔ It does not use `Number.isFinite(Number(v))`, which accepts `""`, `null`, `" "`, `[]` and `false`.
- **All three producers call it and skip a failing bar BEFORE `bufferOhlcBar`** (`equity-spot-archiver.ts`, `crypto-spot-archiver.ts`, `kraken-futures-archiver.ts`), so a bad bar never takes good rows down with it — OBJ-2.
- **A skipped bar is counted and logged, never silent** (`ohlc-frame-skip-tracker.ts`: a rate-limited stderr line naming symbol, field and reason; a sustained-skip alert at `passive_archive.ohlc_frame_skip_alert_streak = 10`); the counter is carried end to end to the Passive Archive panel's `skipped (since PID)` column — OBJ-3.
- **Two false comments corrected:** "OHLC is REST-replayable" (it is not for the spot classes) and "every further flush for this class will fail the same way" (a malformed row is per-batch) — OBJ-4, OBJ-5.
- **The panel's counters mean the same thing in every producer** (`scanned` counts every item a parser receives, before the guard) — OBJ-7 (`#1029`).
- **r6, item 46:** the panel's window counts are read correctly — each count in its own transaction with `SET LOCAL statement_timeout`, three at a time; a count that cannot finish is `null` with `countUnknownReason` and status `COUNT_UNKNOWN`, never 0 — OBJ-10.

## 2. EVERY STEP, WITH ITS EVIDENCE
- **Steps 1-2:** scope r1-r6 (`Scope Files/B_OHLC_FRAME_GUARD_SCOPE.md`), pre-audit approved with seven conditions (`33c6c2a03`).
- **Steps 3-6, first ship:** `c0b102ebf`, `12d1bd1cd`, `29cce1076`; deployed `29cce1076de1130793bafc2eb5ef8fc4701ff118` 2026-09-11T11:19:37Z (`dt-deploy --by cc-c`).
- **Steps 3-6, r6:** `2b26efb96`, conditions `21d7e84a2`, follow-up `e7dc17cf8` (Step 4 approved; CI `36475941280` 4/4); shipped in release deploy A `ea456ad40936b1fbde463e43e473d3ff11432ba0`, 2026-10-02T20:38Z — all three are its ancestors (checked 2026-11-06).
- **Step 7:** `Change Lists/B_OHLC_FRAME_GUARD_STEP7_VERIFICATION.md` — §1 the guard admits live traffic (per-minute upserts at pre-restart rates on all four classes); §2 the knob landed (with control); §3 the warm-up did not fail (0 `prefetch failed`, live-file control); §4 the reject path not exercised (0 lines; pattern proven against the unit test's output); **§8 (2026-11-06) the bounded read**: `GET /api/analytics/passive-archive-status?window=rolling_24h` HTTP 200 with the pool sampled (peak 6 of 10) — finished counts real (233,794 / 14,390 / 264,783), unfinished `null` + `timeout` + `COUNT_UNKNOWN`, `ohlcFramesSkipped` on all four classes.
- **Step 8: Langston (Discord `1568254284053745685`), ruling (a) with three conditions** — the card is a pure function of that one payload (`analytics.tsx:1881-1884`, `:1899-1913`, `:1968`, `:1980-1989`), and `analytics.tsx` and `drift-dashboard-aggregator.ts` are byte-identical at the deployed `0f4835b5a`, at `9ca9b2f03` and at his graded ref; his Step 8 rests on that read. Conditions met at `a7ce69ac4`: §8 says UNREACHABLE and names the cause; the on-screen leg is on `B-DB-POOL-GUARD` inc 3 (handed to OLD Claude); item 1 above.
- **Step 9:** none.
- **Step 10:** this turn.

## 3. OBJECTIVES
| objective | result | evidence |
|---|---|---|
| OBJ-1 one validator, all eight fields | **YES** | unit cases + mutation proof; Step 4 |
| OBJ-2 producers skip before buffering | **YES** | unit test; §1 live rates unchanged |
| OBJ-3 skips counted and logged, end to end | **YES — mechanism; never fired live** | unit test; the API carries `ohlcFramesSkipped` on all four classes (§8); item 1 |
| OBJ-4 the "REST-replayable" comment | **YES** | diff review, Step 4 |
| OBJ-5 the per-class alert wording | **YES** | diff review, Step 4 |
| OBJ-6 SIM + System Manual | **YES** | this Step 10 |
| OBJ-7 one meaning for the panel's counters | **YES** | Step 4; unit tests |
| OBJ-10 panel counts read correctly, unknown never 0 | **YES — payload; render by entailment** | §8; Langston's ruling; item 2 |
| OBJ-8, OBJ-9 | **MOVED OUT** | item 3 |

## 4. NEW FINDINGS
None owed. `#1037` (opening the dashboard tab exhausts the pool) was found by this batch at Step 7 and is homed with `B-DB-POOL-GUARD` / `#1239`.

## 5. GOVERNANCE — THE STEP-10 LEDGER
CHANGE-CLASS: non_architecture

| tier | document | verdict | line |
|---|---|---|---|
| R | scope | ✅ | `Scope Files/B_OHLC_FRAME_GUARD_SCOPE.md` r6 |
| R | pre-audit | ✅ | `Scope Files/B_OHLC_FRAME_GUARD_PRE_AUDIT.md` |
| R | completion report | ✅ | this file |
| R | `BATCH_CATALOG.md` | ✅ | new entry |
| R | `PHASE_HISTORY.md` | ✅ | new entry |
| judged | `SYSTEM_IMPACT_MAP.md` | ✅ | new §2.6c, the bar frame guard (validator, producers, skip tracker, the knob) and the panel's count contract (OBJ-6, required by the scope) |
| judged | `SYSTEM_MANUAL.md` | ✅ | the xStock aggregation note: what reaches the 1-minute table is guarded, and a skipped bar is a counted gap, not a dropped batch (OBJ-6) |
| judged | `RUNNING_ISSUES.md` | ✅ | `#1028` closed with this record |
| judged | `GOVERNANCE_EXCEPTIONS.md` | ✅ | the batch's `open` row (2026-09-30T02:45:00Z) is retired in the Step-11 confirm commit, as the close precedent does |
| judged | `CHANGES_AND_FIXES.md` | ✅ | `FIX-2026-11-06-E` (a defect fix: a malformed bar threw away whole batches) |
| judged | `DELETED_COMPONENTS_LOG.md` | N/A | nothing deleted (the old truthiness check was replaced in place) |
| judged | `POST_AUDIT_ROADMAP.md` / `ADJUSTMENT_FRAMEWORK.md` | N/A | no roadmap item; the one new knob is a log/alert threshold, not a trading tunable |
| plan | `PHASE_19_PLAN.md` | ✅ | row `3b.h-6` closed |
| plan | `SPRINT_TO_LIVE_PLAN.md` | ✅ | row 13 closed, report linked |
| — | shared `MEMORY.md` | N/A | no new consensus truth |
| — | `MEMORY_CC_C.md` | ✅ | position |
| — | Langston's `MEMORY.md` | N/A | no line on this batch (checked 2026-11-06) |
| T1 | session task lists (`CC_A`, `CC_B`, `CC_C`, `CC_INFRA`) | ✅ mine / N/A ×3 | `CC_C_SESSION_TASK_LIST.md` row 13 |
