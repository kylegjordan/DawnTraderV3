# B-NEW-42 — xStock Calibration Phase 0: Corporate Actions + Dividend Ex-Dates + Halts Pre-flight Audit

**Batch ID:** B-NEW-42
**Type:** Pre-flight audit (xStock calibration plan §0) — primarily investigation + targeted regression tests; conditional code work iff bugs surface
**Author:** Claude Code
**Date:** 2026-05-17
**Branch:** `migration/aws-supabase`
**Plan reference:** `Claude Comms and Packages/Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_REVIEW.md` §0
**Plan lock:** Langston ACK on 2026-05-15 (`XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_ACK_ROUND2.md`) — "Plan is locked from my side. Proceed to Phase 0 corporate-actions audit."

**Revision history:**
- **rev1** (initial draft) — 2026-05-17
- **rev2** (Langston round-1 review absorbed) — 2026-05-17. Eight revisions applied per `B_NEW_42_scope_review_rev1_reply.md`:
  1. §2.2.3 — added "1-2 hours before market open on ex-date" window specifier on Phase D dependency flag
  2. §2.3.4 — explicit conditional reinterpretation of v2 §0.3.4 halt-sentinel directive
  3. §2.1.4 — added reverse-split (2× single-bar jump) test variant
  4. §2.2.1 — widened scan to catch special divs / spin-offs (>0.3% gap window)
  5. §4 verification rows 2.1.5, 2.2.3, 2.2.4, 2.3.4, 2.4 — enumerated required content; mirrored 2.1.1 across CSV rows
  6. §2.4 + intro — DIRTY forks to separate B-NEW-42b hotfix batch (no in-place expansion)
  7. §5 — moved artifacts from `Claude Comms and Packages/Scope Files/b-new-42-artifacts/` to `1-system-manual/audits/b-new-42/`
  8. §6 — LOW-to-MEDIUM blast decomposition; xStock VTS observation-continuity note

---

## §1 Background

xStock calibration plan v2 elevates **Phase 0** (corporate actions + dividends + halts) from a Phase-A.3 verification gate to a **pre-flight audit that runs in parallel with the A.1 DBS design call**. Three real-world equity behaviors that crypto does NOT have can break the existing TEC trailing-stop / data-freshness path if they fire on a live xStock position:

1. **Splits** — a 2:1 (or 10:1 NVIDIA-style) split halves (or 10×-reduces) the quote overnight. Naive trailing-stop logic interprets that as a catastrophic drop and fires a stop.
2. **Dividend ex-dates** — the quote drops by the dividend amount on the morning of ex-date. Magnitude varies: 0.3-1.5% on quarterly-paying names. Whether Kraken credits xStock holders a synthetic dividend (no gap) or doesn't (gap-down) is currently UNKNOWN.
3. **Trading halts** — when a stock gets halted intraday (LULD limit, news pending, circuit breaker), the ticker pauses. Whether Kraken's WebSocket pauses ticker updates, holds stale, or fabricates synthetic ticks is currently UNKNOWN.

The audit answers three questions for each:
- **What is the actual behavior?** (Kraken WebSocket schema, archived data inspection, live-probe if needed)
- **Does our existing TEC + data-freshness code already handle this correctly?** (regression test in unit harness)
- **What documentation needs to live in `SYSTEM_MANUAL.md` so future devs / future calibration phases don't re-discover this?**

**Conditional code-work rule (Langston rev2 §2.4 fork-into-B-NEW-42b):** if 0.1, 0.2, or 0.3 reveals a bug (e.g. TEC fires a stop on a simulated 2:1 split), B-NEW-42 closes with DIRTY verdict + evidence and a **separate B-NEW-42b hotfix batch is spawned** (its own Step 1 scope, design, code review, and verification) BEFORE Phase A starts. If all three audits surface clean (verified policies documented + tests pass), B-NEW-42 closes CLEAN with "no code change required" and Phase A is unblocked. **B-NEW-42 itself never expands in place** — scope-discipline alignment with §5 #15 NO PATCHES doctrine.

---

## §2 Objectives

### 2.1 Corporate actions verification (xStock Calibration Plan §0.1)

1. **Archive scan for step-changes.** Query `xstock_spot_ticker_snap` (confirmed in pre-audit reading — `shared/schema.ts:4677`) and `xstock_spot_ohlc_1m` for any xStock pair where `prev_day_close / open_24h` ratio shows >40% step-change between consecutive minute bars in the archived window (early May 2026 → today). Any such row = candidate corporate-action event. Document hits in a CSV under `1-system-manual/audits/b-new-42/corp-actions-scan.csv` (NEW directory per Langston rev2 §Q4 — establishes `1-system-manual/audits/<batch-id>/` convention).
2. **Kraken WebSocket schema review.** Inspect `https://docs.kraken.com/api/docs/websocket-v2/ticker` (and adjacent endpoints — instrument metadata, status) for `corporate_action` / `split` / `adjustment_factor` / `event` envelope fields. Document findings in the audit report. If schema is silent, file an open question for Phase A.1 (does Kraken send adjusted-vs-raw price?).
3. **Adjustment metadata flag inspection.** Query the archived OHLC `metadata` jsonb column (or equivalent — confirm in Step 2 pre-audit) for `adjustment_factor`, `adjusted`, `event_type`, or similar keys. Document presence/absence + any populated values.
4. **TEC split-resilience regression test.** Add `server/tests/unit/b-new-42-tec-split-resilience.test.ts` (NEW). Mock an open xStock position with trailing stop active. Two test variants per Langston rev2 Q1 edge-case flag:
   - **Forward-split test (2:1):** inject synthetic 50% single-bar price drop. Assert: (a) TEC does NOT trigger a stop, (b) the price-drop is recognized as a structural event (some `adjustment` signal short-circuits the trailing logic).
   - **Reverse-split test (1:2):** inject synthetic 2× single-bar price jump (e.g. struggling ticker doing 1:10 reverse). Assert: (a) BE-stop / moonbag logic doesn't fire prematurely on the synthetic jump, (b) high-water-mark + target-lock latches handle the jump correctly without phantom-promoting to TRAILING_TAKE mode.
   
   If either variant fails — i.e. TEC fires the stop OR moonbag logic phantom-promotes — the test surfaces a real bug and B-NEW-42 closes DIRTY with a B-NEW-42b hotfix batch spawned. Likely hotfix surface area: `server/services/trailing-exit-controller.ts` + a new `server/services/corporate-action-detector.ts` sentinel.
5. **SYSTEM_MANUAL documentation.** Add a "Corporate Actions" subsection to `1-system-manual/SYSTEM_MANUAL.md` (the storage / data-pipeline section). Document: archive findings, Kraken WebSocket behavior, our handling policy (whether TEC needs a split-detector or not).

### 2.2 Dividend ex-dates audit (xStock Calibration Plan §0.2)

1. **Archive scan for ex-dividend gap-downs.** For top-15 xStock dividend-paying names — **KO, JNJ, PG, XOM, CVX, JPM, BAC, T, VZ, MCD, HD, WMT, MMM, IBM, MO** (subset of those actually present in xStock_spot universe — cross-reference `XSTOCK_SPOT_REGISTRY` in `shared/asset-classes.ts:214`) — scan archive for prev-day-close → open-24h gap events. **Two scan windows per Langston rev2 Q1 edge-case flag:**
   - **Primary scan:** gap-downs of magnitude consistent with quarterly dividend yields (0.3-1.5% range).
   - **Widened scan (catches special divs / spin-offs):** any unexplained overnight gap >0.3% — captures one-time special cash dividends (typically 5-15% one-time gap-downs, e.g. Kellogg's WK Kellogg spin-off) that a tight 0.3-1.5% window would miss.
   Document hits in `1-system-manual/audits/b-new-42/dividend-gaps-scan.csv` with a `category` column distinguishing 'regular_quarterly' from 'special_or_spinoff'.
2. **Kraken synthetic dividend hypothesis test.** From the archive scan in step 1: if regular-quarterly hits ARE found → Kraken does NOT credit, gap-downs are real, ex-dates need same scheduled-event blocking as earnings. If regular-quarterly hits are NOT found (or are random magnitude not aligned with declared dividend amounts) → Kraken credits synthetic dividends, no TEC handling needed. Special-div / spin-off hits (if any) are flagged separately for Phase D follow-up regardless of the quarterly outcome.
3. **Document the policy.** Outcome of step 2 determines: either (a) no TEC handling required + no scheduled-event blocking → document in `SYSTEM_MANUAL.md` as a known property, OR (b) ex-dividend dates need same scheduled-event-blocking machinery that Phase D earnings handling will build — **specifically a 1-2 hour pre-market-open block window on ex-dividend date** (per v2 plan §0.2.3 specifier; shorter than earnings' 24h-pre / 4h-post window because ex-dividend impact is localized to the open). Flag as a Phase D dependency in BOTH `1-system-manual/POST_AUDIT_ROADMAP.md` Phase D entry AND the completion report.
4. **Calendar source identification.** Decide which ex-dividend calendar source we'll wire when Phase D earnings handling lands. Default: **Yahoo Finance free tier** (same source Phase D D.1 will use for earnings). Document in `SYSTEM_MANUAL.md` with: source name, retrieval cadence (e.g. daily morning poll), free-tier limits (e.g. unofficial rate cap ~2000 requests/hour; major-name coverage validated).

### 2.3 Halts / circuit breakers audit (xStock Calibration Plan §0.3)

1. **Archive scan for tick-stream gaps.** For each xStock pair in the archive, scan for extended gaps in the ticker stream during RTH (US equity regular trading hours, 9:30-16:00 ET):
   - >5 min without ticker update on a 24/7-quoted name, OR
   - >5 min during RTH on a 24/5-quoted name with other names still updating
   - Output to `1-system-manual/audits/b-new-42/halt-gaps-scan.csv` with row count + any hits annotated (timestamp ranges, affected symbols, gap duration, ticker behavior observed).
2. **Kraken WebSocket halt behavior.** If hits ARE found in step 1, inspect the surrounding rows: does the ticker pause (no rows), stale (last-price persists, `captured_at` advances), or continue synthetically (different price, normal updates)?
3. **TEC halt-resilience regression test.** Add `server/tests/unit/b-new-42-tec-halt-resilience.test.ts` (NEW). Mock an open xStock position with trailing stop active. Freeze the ticker for 10 simulated minutes (no new bars). Assert: (a) TEC does NOT trigger a stop based on stale-price drift, (b) on resume, TEC re-evaluates from the new live price not the stale-frozen one. If the test fails, B-NEW-42 closes DIRTY with a B-NEW-42b hotfix batch spawned — likely a halt-detection sentinel in the data-freshness layer.
4. **SYSTEM_MANUAL documentation + halt-sentinel directive reinterpretation (Langston rev2 Q1 Delta B).** v2 plan §0.3.4 directive language is "+ add halt-detection sentinel to data-freshness layer." Scope reinterprets this as **conditional on §2.3.3 test outcome** (consistent with v2 plan §0 closing line — "If clean … proceed to A.1 design call"). The reinterpretation is explicit so the paper trail doesn't drift:
   - If §2.3.3 test passes (existing staleness detection suffices) → no sentinel built; document "no sentinel required, existing data-freshness layer suffices" with the test evidence as proof.
   - If §2.3.3 test fails → sentinel is the B-NEW-42b hotfix surface area; built there, not in B-NEW-42.
   Either way, add a "Trading Halts" subsection to `SYSTEM_MANUAL.md` documenting: archive findings, Kraken WebSocket halt behavior, the §2.3.3 test outcome, and the resulting policy.

### 2.4 Phase 0 gate decision + Phase A unblock

After 2.1-2.3 complete, the completion report includes an explicit GATE DECISION:

- **CLEAN** → all three resilience tests pass + policies documented → Phase A is unblocked; plan proceeds to A.1 DBS design call as a separate follow-on batch.
- **DIRTY** → one or more resilience tests failed → **B-NEW-42 closes with DIRTY verdict + evidence; B-NEW-42b is spawned as a separate hotfix batch** with its own Step 1 scope, design, code review, and verification. Phase A is gated on B-NEW-42b ship (NOT on B-NEW-42b being merged into B-NEW-42).

**Required completion-report section (Langston rev2 §4 row 2.4):** `§Phase 0 Gate Decision` containing verdict (CLEAN/DIRTY), evidence (test results + CSV row counts + documentation links), and Phase A unblock status (TRUE/FALSE).

---

## §3 Out of Scope

- **Phase A DBS implementation** — this batch is the pre-flight audit only. The DBS design call (A.1) can run in parallel as a separate working document but is NOT in this batch's verification scope.
- **Live corporate-action event** during the audit window. We're auditing archive + WebSocket schema + regression coverage. Catching a live split/dividend/halt during the audit is bonus evidence but not required for the gate decision.
- **Polygon / paid market-data feeds** — calendar source decision in 2.2.4 stays on free tier (Yahoo) per v2 plan.
- **PEAD / sector rotation / index rebalance handling** — those are Phase D / Phase G concerns, not Phase 0.

---

## §4 Verification Criteria (Step 7 first-pass + Step 8 second-pass)

Langston rev2 §Q2 tightened five rows from "section exists" / "documented" / "named" to enumerated content-requirement checks. CSV rows 2.2.1 + 2.3.1 mirrored against 2.1.1's row-count+annotation bar.

| # | Objective | YES/NO/PARTIAL Verification |
|---|---|---|
| 2.1.1 | Archive step-change scan complete | CSV exists at `1-system-manual/audits/b-new-42/corp-actions-scan.csv` with row count + any hits annotated (timestamp ranges, affected symbols, ratio observed, candidate-event classification). |
| 2.1.2 | Kraken WS schema reviewed for splits | Audit report at `1-system-manual/audits/b-new-42/audit-report.md` quotes findings (verbatim Kraken doc URL + relevant field names or "field absent" statement). |
| 2.1.3 | OHLC metadata flag inspected | Query result documented in audit report (presence/absence + value distribution if present). |
| 2.1.4 | TEC split-resilience tests exist + pass | `npm test -- b-new-42-tec-split-resilience` returns green. Both forward-split (50% drop) AND reverse-split (2× jump) variants must pass. If either fails → B-NEW-42 closes DIRTY. |
| 2.1.5 | SYSTEM_MANUAL "Corporate Actions" subsection added | Section exists in `1-system-manual/SYSTEM_MANUAL.md` containing H3 headings **'Archive Findings'**, **'Kraken WebSocket Behavior'**, **'TEC Handling Policy'**, each ≥1 paragraph with cited evidence (CSV row count, Kraken doc URL, test name + result). |
| 2.2.1 | Archive gap-down scan complete | CSV exists at `1-system-manual/audits/b-new-42/dividend-gaps-scan.csv` with row count + any hits annotated (timestamp, symbol, gap magnitude, category column 'regular_quarterly' vs 'special_or_spinoff'). |
| 2.2.2 | Synthetic-dividend hypothesis tested | Audit report states "Kraken credits" or "Kraken does NOT credit" with evidence (regular-quarterly hit count + magnitude alignment data). Special-div hits flagged separately. |
| 2.2.3 | Dividend handling policy documented | Either: (a) "no handling needed" decision documented in `SYSTEM_MANUAL.md` Corporate Actions subsection, OR (b) Phase-D blocking dependency flagged in BOTH `1-system-manual/POST_AUDIT_ROADMAP.md` Phase D entry AND completion report, **with the 1-2 hour pre-market-open block window specifier on ex-dividend date** explicitly stated. |
| 2.2.4 | Calendar source identified | Source named in `SYSTEM_MANUAL.md` Corporate Actions subsection with: source name, retrieval cadence, free-tier limits / coverage notes. |
| 2.3.1 | Tick-stream gap scan complete | CSV exists at `1-system-manual/audits/b-new-42/halt-gaps-scan.csv` with row count + any hits annotated (timestamp ranges, affected symbols, gap duration, ticker behavior observed). |
| 2.3.2 | Kraken WS halt behavior characterized | Audit report classifies behavior as pause / stale / synthetic, with row-evidence from CSV cited. |
| 2.3.3 | TEC halt-resilience test exists + passes | `npm test -- b-new-42-tec-halt-resilience` returns green. If fails → B-NEW-42 closes DIRTY. |
| 2.3.4 | SYSTEM_MANUAL "Trading Halts" subsection added | Section exists in `1-system-manual/SYSTEM_MANUAL.md` containing H3 headings **'Archive Findings'**, **'Kraken WebSocket Behavior'**, **'§2.3.3 Test Outcome'**, **'Halt Sentinel Decision'** (reinterpretation of v2 §0.3.4 directive into conditional). |
| 2.4 | Gate decision recorded in completion report | Completion report contains `§Phase 0 Gate Decision` with verdict (CLEAN/DIRTY), evidence (test results + CSV row counts + documentation links), Phase A unblock status (TRUE/FALSE). |

---

## §5 Files Touched (anticipated)

**NEW (audit artifacts + tests):**
- `1-system-manual/audits/b-new-42/corp-actions-scan.csv` (NEW directory — establishes `1-system-manual/audits/<batch-id>/` convention per Langston rev2 §Q4)
- `1-system-manual/audits/b-new-42/dividend-gaps-scan.csv`
- `1-system-manual/audits/b-new-42/halt-gaps-scan.csv`
- `1-system-manual/audits/b-new-42/audit-report.md` (consolidated findings)
- `server/tests/unit/b-new-42-tec-split-resilience.test.ts`
- `server/tests/unit/b-new-42-tec-halt-resilience.test.ts`

**MODIFIED (governance):**
- `1-system-manual/SYSTEM_MANUAL.md` — add "Corporate Actions" + "Trading Halts" subsections.
- `1-system-manual/BATCH_CATALOG.md` — B-NEW-42 row.
- `1-system-manual/PHASE_HISTORY.md` — xStock calibration Phase 0 entry.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — IF Phase 0 surfaces TEC code work (DIRTY path → B-NEW-42b), SIM gets updated **in B-NEW-42b**, not B-NEW-42. B-NEW-42 itself touches SIM only if the audit reveals a new dependency edge worth documenting.
- `1-system-manual/POST_AUDIT_ROADMAP.md` — IF 2.2.3 lands as Phase D dependency.
- `.claude/memory/MEMORY.md` + repo mirror — close out Phase 0.

**OUT OF SCOPE (handled in B-NEW-42b if spawned):**
- `server/services/trailing-exit-controller.ts` — split + halt resilience modifications.
- `server/services/corporate-action-detector.ts` (NEW sentinel module).
- Data-freshness layer file (TBD) — halt detector sentinel.

---

## §6 Risk + Blast Radius

**Blast radius if CLEAN (likely outcome):** ZERO. Audit-only batch. No code changes. CI runs against added unit tests only; no behavioral surface area changes for crypto, xStock, or any other consumer.

**Blast radius if DIRTY → B-NEW-42b (Langston rev2 §Q5 decomposition):**

- **LOW** if the DIRTY fix is a new sentinel module (`server/services/corporate-action-detector.ts` or halt-detector equivalent) consumed by TEC via a single `if (detector.isActionActive(pair)) skip stop` gate. Sentinel is read-only, contained, easily regression-tested. Crypto path unaffected because the gate is no-op (`isActionActive` returns false for crypto pairs since their detector has no events to find).
- **MEDIUM** if the DIRTY fix requires modifying TEC's core trailing-stop logic in `trailing-exit-controller.ts` (changing stop-trigger threshold formula, adding asset-class branching deeper in the path, etc.). That's the genuine cross-asset blast surface. Any TEC core modification must be guarded by `asset_class === 'xstock_spot'` checks unless the fix is genuinely cross-asset-correct (e.g. a step-change detector that crypto would also benefit from for flash crashes). Langston code-level review mandatory; pre-existing crypto TEC behavior must be regression-tested.

**Risk: archive is too thin to find evidence.** xStock archive started early May 2026 (~2 weeks ago). 14 days of trade-hours data may not contain a real corporate action event (splits are rare; dividends are quarterly so we get 1-2 per name in 2 weeks; halts are intermittent). The audit reports the archive thinness explicitly and falls back to WebSocket schema review + simulated test coverage when archive evidence is absent. This is acceptable — the regression tests provide the coverage the archive can't.

**Risk: Kraken WS schema is silent on corporate actions.** If schema docs don't mention adjustment-factor or event envelope, we can't tell from docs alone whether they send it. Fallback: hand-watch the WS firehose for any of the candidate event rows during the audit window OR file as a Phase A.1 open question for the DBS design call. Both are acceptable per v2 plan §0 ("If schema is silent, file an open question for Phase A.1").

**xStock VTS observation continuity during hotfix window (Langston rev2 §Q5):** If Phase 0 closes DIRTY and B-NEW-42b takes 3-5 days, xStock VTS observations continue during that window with the known split/halt bug still active. Not catastrophic — we're in observation mode with no live capital exposed. The observation data collected in that window carries known-defective TEC behavior; it gets excluded from later calibration analysis anyway via the existing `calibration_state = 'pre_calibration_xstock_2026_05'` tag (Phase F-NOW from v2 plan). This is noted here so future readers don't wonder why a stretch of observation data looks anomalous. **No mitigation action needed** — disabling xStock trading during the window would be overkill for an observation-only path.

---

## §7 Sequencing

This batch can ship sequentially while Phase A.1 DBS design discussion runs in parallel as a separate working document. Phase A.2 implementation is BLOCKED until both this batch closes AND A.1 design lands. There is no critical-path dependency from A.1 design call back into this batch.

---

## §8 Estimated Effort

- Step 1 scope (this doc) + Langston review: 0.5 day (≤ today)
- Step 2 pre-audit (file discovery, schema review, SIM consultation): 0.5 day
- Step 3 audit execution (archive queries, test authoring, audit report): 1-2 days
- Step 4 Langston code review of any test files: 0.25 day
- Steps 5-8 CI + deploy (if code changes) + verification: 0.5 day
- Steps 10-11 governance + completion report: 0.25 day

**Total nominal: 2-4 days CLEAN path. Add 3-5 days if DIRTY surfaces TEC code work.**

---

— Claude Code, 2026-05-17
