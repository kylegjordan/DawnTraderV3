# B-XSTOCK-CORRELATION-COLLECT — COMPLETION REPORT

- **Batch:** `B-XSTOCK-CORRELATION-COLLECT` · owner CC-A (OLD Claude) · `SPRINT_TO_LIVE_PLAN.md` row 105 · roadmap `25-9` · Kyle 2026-11-04 (KD-14: approved before live, collection only)
- **CHANGE-CLASS: architecture** (scope header)
- **Record:** `Scope Files/B_XSTOCK_CORRELATION_COLLECT_SCOPE.md` · `Scope Files/B_XSTOCK_CORRELATION_COLLECT_PRE_AUDIT.md` · `Change Lists/B_XSTOCK_CORRELATION_COLLECT_CHANGE_LIST.md`
- **Live:** deployed `0f4835b5a4fe3af461113b52f626017b01dbafa9` 2026-11-05 14:40:02Z (rollback `0abfd7102`). Step 4 PROCEED on `c74ff4dbf` (Discord `1567830296206901349`), re-landed with his conditions at `bd76492b4` → `0f4835b5a`. Step 8 PROCEED (Discord `1574059564003754106`); Step 9 not needed. Step 10 governance `369cb70fd`.
- **Status: CLOSED 2026-11-22** — Langston Step 11 CONFIRMED (Discord `1574087675890114686`).

> **No scaffolding.** The xStock correlation record is being written on staging today, one row per real xStock VTS trade. It is deliberately record-only: the factor is computed and stored, never applied to an xStock decision. Applying it is roadmap `25-9`'s later calibration call, not a switch this batch left half-built.

> Claims labelled **NOT RE-READ** were not handed to a fresh reader (`workflow-11-completion`, one-pass rule); Langston is their second pass. Every figure below was measured at Step 7 and re-derived by Langston at Step 8 unless the line says otherwise.

---

## 0. OPEN ITEMS — STATED FIRST

Neither item has a placed home yet: each would be a new plan row, which needs Kyle's agreement (2026-10-19 rule). Both were put to him through PM Claude; no work has started on either.

| # | item | why it is open | home (owner) | closes when / fails when |
|---|---|---|---|---|
| 1 | **`#1265` — the nightly replay marks a record before its trade has closed** | it labels the record `unreplayable_real_rejected` and never looks again. xStock: 1,370 records so labelled, all join their trade; 1,347 closed after the marking, 0 before, 23 still open. Same ~38-40 % share in crypto, so it predates this batch (`server/scripts/replay-ablation.ts:193`, `:233`; `server/services/factor-replay-core.ts:180-182`, at `fcd838134`). The rows are not lost: a fix can clear the two replay fields and re-run them (answered YES to PM Claude, Discord `1574062181270691952`). | **decision required — no work**, with Kyle via PM Claude (Discord `1574060303736381561`) | closes when Kyle slots or declines it; fails if records keep being marked early with no decision |
| 2 | **`#1266` — the correlation SKIP has no counter** | when the reference cannot be paired the record is skipped by design (`[B-XSTOCK-CORRELATION-COLLECT][SKIP]`), but only a log line records it, so a rising skip rate is invisible. 5 skips since the deploy, all TBLL/USD on 2026-11-10 (a 15-minute instrument with missing bars). | **decision required — no work**, with Kyle via PM Claude (Discord `1574060303736381561`) | closes when Kyle slots or declines it |

---

## 1. OBJECTIVES — YES / NO / PARTIAL

| objective | result | evidence |
|---|---|---|
| **OBJ-0** — the reference fetch is routed by asset class | **YES** | `resolveCorrelationInputs` in `server/core/metrics/pair-correlation.ts`: crypto reads the Kraken 60-minute reference through the same mapper the call sites carried (moved verbatim); xStock reads `xstockOhlcCache` at the pair's own interval (15 or 60, else skip) and pairs both series on shared timestamps. **P-9, pre-registered stop line ≥ 90 % of non-SPY symbols with ≥ 30 shared 15-minute timestamps with SPY: 461 of 472 = 97.7 % (median 98) — PASS** (2026-11-05 14:36:52Z, US hours). Control in the same run: positional pairing lines up only 42 of 469 (9.0 %), which is why the timestamp pairing is needed. |
| **OBJ-1** — record-only mode per class, nothing to fall back to | **YES** | new constant `b68_3_apply_factor` (`*` = true, `xstock_spot` = false), loaded by `market-context-engine.ts` with the existing throw when missing. The `?? getCurrentPairCorrelationConfig()` fallback is removed at both call sites (`signal-orchestrator.ts`, `vts-runner.ts`) and the function deleted. Control: crypto rows in the window, 43, all `factor_applied=true`. The Drift Dashboard's calibration view excludes record-only rows (`computeFactorCalibration`, `factor_applied IS DISTINCT FROM 'false'`). |
| **OBJ-2** — the xStock VTS path records one row per trade | **YES** (pre-registered magnitude criterion ruled **VOID AS SPECIFIED**) | **The criterion, quoted as written:** *"expected magnitude: within a factor of two of the xStock VTS trades OPENED in the same window … Fewer than a quarter of the opened trades ⇒ the emit is failing."* **Measured:** 417 records against 2,409 opened rows = 17 % — as written, below the line. **Why:** 1,808 of the 2,409 are shadow rows and 184 are twin rows, which never reach the emit (`eval-cycle.ts:1407`, inside `if (tradeId)` at `:1396`, at `a61c60f22`). **Langston's ruling:** void as specified — the 17 % stands as measured and is not a FAIL; discharged on the named object: **417 of 417 real xStock VTS trades in the window carry a record, and 3,177 of 3,182 since** (the 5 are `#1266`'s designed skips). Join: 3,594 of 3,594 records join their trade. Field census in the change list (OBJ-2 section, MRNA sample row): `source_type=vts_trade`, `asset_class=xstock_spot`, all fields present. |
| **OBJ-3** — reference `SPY/USD`, recorded on the row | **YES** | every xStock row carries `reference_symbol` = `SPY/USD` (OBJ-2 field census). Sector funds stay gated on `B-PHASE-E-PRE-1`, unchanged; when that ships only the reference constant changes. |
| **OBJ-4** — collection only, no xStock decision changes | **YES** | on all 417 window records the trade's real confidence equals the record's `alternate.confidence` and `confidence_without_factor`; `confidence_with_factor` = without × factor, the factor between 1.0047 and 1.0500. xStock VTS opens 21.1/h in the 24 h before against 17.4/h after (normal weekday range 174–502 a day). xStock paper positions 37 before against 42 after (daily range 1–70). All within normal variation. The `[B68.3][correlation]` log lines were not read: that stream leaves the box after about 3.5 days; the record fields carry the same fact. |
| **OBJ-5** — governance | **YES** | Step-10 ledger, §6 below (`369cb70fd`). |

**UI (Claude-in-Chrome, Drift Dashboard, 2026-11-22 13:36Z):** Factor Ablation Comparison, 7 days: `b68_3_pair_correlation` 1,209 rows (1,196 replayed, 13 pending) against 193 for each other factor — the extra 1,016 are the xStock record-only rows, real values, no "--". Factor Calibration, 7 days: `b68_3` n = 180, the same as the other factors — the record-only rows stay out of the calibration view, as intended.

---

## 2. CI — PER JOB

| run | sha | TypeScript Check | Test Suite | Build | Docker Build |
|---|---|---|---|---|---|
| `42007695325` | `0f4835b5a` (the deployed sha) | success | success | success | success |
| `42006857513` | `bd76492b4` (the re-land) | success | cancelled | success | cancelled |

On the re-land run, Test Suite and Docker Build were cancelled when the next push started a new run (three sessions push minutes apart); TypeScript Check and Build finished green. The deployed sha `0f4835b5a` is the graded, all-green run.

---

## 3. TESTS

- New `server/tests/unit/b-xstock-correlation-collect.test.ts`: 17/17 after the Step-4 conditions (routing by class, timestamp pairing, unreadable interval ⇒ skip with no fetch, record-only confidence, the NaN case).
- The 31 test files that reference the changed modules: 392 passed, 4 skipped. `b63-item12-geometry-override` needs a local Postgres and fails identically without these changes.
- Mutations run, each restored: timestamp alignment removed → fails · record-only made to divide out → fails · replay key without the class → fails · rank loop put back to the old form → the run hangs · xStock routed to Kraken → fails.

---

## 4. FIX-ON-FIND AND LEGACY

- **Fix on find:** `spearmanRankCorrelation` (`server/strategies/strategy-helpers.ts`) looped forever on a single NaN — `let j = i`, and `NaN === NaN` is false, so the index never advanced (introduced `67afdc1e0`, 2026-03-03). Now `let j = i + 1`: identical ranks for every finite input; NaN input now terminates. The helper is shared with `defensive-hedge.ts`, whose `computeReturns` also now requires a finite current close, the same gap as `pair-correlation.ts` (Langston's C-2, folded under rule 23). Found because the new NaN test hung the test worker. Recorded `CHANGES_AND_FIXES` FIX-2026-11-22-D.
- **Legacy deleted:** `buildVtsTradeIndex` / `findVtsTradeByNaturalKey` (the old class-less trade key in `replay-ablation.ts`) and `getCurrentPairCorrelationConfig()` (callers were only the two fallbacks OBJ-1 removed). Both in `DELETED_COMPONENTS_LOG.md`.

---

## 5. RECORD NOTE AND HONEST RESIDUAL

- **Commit `469d3ee06` (2026-11-07) carries this batch's Step-3 subject but touches only `token-watch/tests/test_measure_followup_memory.py`.** It is not part of this batch's change set; a reader grepping the batch id will find it. The mismatch also runs the other way: the deployed sha `0f4835b5a` carries the subject *"B-DISK-FILE-TIERING Step-7 OBJ-10..."*, so a reader grepping this batch id will not find the deploy sha.
- **Not established:** whether the correlation predicts xStock per-pair win rate. That is what the collection is for; it is roadmap `25-9`'s calibration read, later.
- **Not established:** whether the crypto replay records join their trades — crypto ids do not join `vts_open_trades` (0 of 420); unmeasured, carried with `#1265`.
- **Weekend and holiday hours:** xStocks are closed at the weekend, so records accrue Sunday–Friday only; the 24-hour Sunday read showed crypto rows alone, as expected.

---

## 6. GOVERNANCE FILES CHANGED — TRANSCRIBED FROM THE STEP-10 LEDGER (`369cb70fd`)

`CHANGE-CLASS: architecture`

| document | verdict | one line |
|---|---|---|
| the batch `SCOPE` | ✅ | present, unchanged at Step 10 |
| the batch `PRE_AUDIT` | ✅ | present, unchanged at Step 10 |
| `COMPLETION_REPORT` | ✅ | this file (Step 11) |
| `BATCH_CATALOG.md` | ✅ | new entry: why, what it built, verified, not discharged |
| `PHASE_HISTORY.md` | ✅ | 2026-11-05 entry |
| `SYSTEM_MANUAL.md` | ✅ | modulator row 6 (per-class reference, compute vs apply, NaN fix), pair_correlation constants, `resolveCorrelationInputs`, the xStock emit, the b68_3 row |
| `SYSTEM_IMPACT_MAP.md` | ✅ | `eval-cycle.ts` emitter with its four readers, modulator row 6, constants count |
| `CHANGES_AND_FIXES.md` | ✅ | FIX-2026-11-22-D |
| `RUNNING_ISSUES.md` | ✅ | `#1265`, `#1266` — both decision required via PM Claude |
| `POST_AUDIT_ROADMAP.md` | ✅ | 25-9 notes collection started 2026-11-05 |
| `DELETED_COMPONENTS_LOG.md` | ✅ | both COMMIT lines carry `c74ff4dbf` / `ca10b8534` / `bd76492b4` / `0f4835b5a` |
| `ADJUSTMENT_FRAMEWORK.md` | N/A | collection only; no calibration rule or epoch changed |
| `PHASE_19_PLAN.md` | N/A | no row there |
| `SPRINT_TO_LIVE_PLAN.md` row 105 | ✅ | Step 10 → 11, this report linked; flips to CLOSED after Langston's confirm |
| shared `MEMORY.md` | N/A | no project-consensus truth changed |
| `MEMORY_CC_A.md` + mirror | ✅ | position block |
| Langston's `MEMORY.md` | ✅ | `00-legacy.md` line 104 via `langston-memory-write`, net −8 B |
| T1 · session task list(s) — CC_A_SESSION_TASK_LIST | ✅ | row 5 set to Step 11 now and CLOSED at the confirm; CC-B / CC-C / CC-INFRA task lists N/A, not mine |
| `XSTOCK_CALIBRATION_PLAN.md` | ✅ | E.2 done for correlation only; sector-fund reference still gated |
| `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | judged; sector-fund placeholder unchanged |
| `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | ✅ | Step 6.6 record-only form + the timestamp-pairing learning (97.7 % against 9.0 %) |
| observation / progress report | N/A | no observation window; the coverage criterion was ruled void as specified at Step 8 |
| `CONDUCT.md` / `CLAUDE.md` | N/A | no rule changed |
| `Change Lists/B_XSTOCK_CORRELATION_COLLECT_CHANGE_LIST.md` | ✅ | Step-8 section, OBJ-2 field census, emit site re-cited at `a61c60f22`, confidence factor range corrected |

**Asset-class onboarding learning (rule 3.3):** a reference series from another venue cannot be paired by position — line the bars up by timestamp. Positional pairing matched the right hours for 9.0 % of symbols; timestamp pairing reached 97.7 %. Folded into `ASSET_CLASS_ONBOARDING_WORKFLOW.md` Step 6.6.
