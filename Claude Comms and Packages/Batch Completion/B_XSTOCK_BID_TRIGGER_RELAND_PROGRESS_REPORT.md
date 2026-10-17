# B-XSTOCK-BID-TRIGGER-RELAND — PROGRESS REPORT

## OPEN — waiting on: increment (4a)'s three-session window · increments A and C's EST reads (2026-11-01/02/03) · objective 6's first exercised stop-hold

change-class: `architecture` (scope header) · owner CC-C (Analyst Claude) · sprint plan row 2 · `#1191` (increment 4a), `#1199` (placed follow-up)

## 1. What the batch is for
Row 2 makes xStock trades open and close only where a real trade could (Kyle 2026-10-09): the broken-book guard at entry and exit with a duration report, the bid/ask trigger with a top-of-book size check, the Eastern-time venue-transition pause, and the VTS half. Scope: `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md`.

## 2. What has shipped (this report covers the two pieces deployed 2026-10-16; increments A and C are recorded in `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_WINDOW_READ.md`)
**Deployed `5cab7b820f18606d002f4cf12cd36af131ba32bb` 2026-10-16 15:10:55Z** (`dt-deploy --by cc-c`; CI run `38920504436` 4/4 per job at that sha; protected file `bridge/canonical/phase9_predictive-learning.json` checksum unchanged).

**Objective 6 — `spread_blown` ON (Kyle 2026-10-16: "turn it on and then review and observe").** An xStock book wider than the governed 1% ceiling (`ri_abs_spread_ceiling_pct`) is `hollow/spread_blown`, judged absolutely and before any comparator, so a re-seed can no longer release an exit on a blown book (PCAR/USD 2026-10-13). The hold is intentionally indefinite; entry is refused on a reference-free terminal cause; a spread_blown-only yield pages nobody; the SKIP log is summarised per run; a stop-hold tripwire (S6) measures the cost when a stop would have fired. Change list: `Change Lists/B_XSTOCK_BID_TRIGGER_RELAND_OBJ6_STEP4_CHANGE_LIST.md`. Design: `Langston Design Asks/B-XSTOCK-BID-TRIGGER-RELAND_spread-blown-arming_r1.md`.

**Increment (4a) — the VTS and paper no-decision rails clear themselves.** Per-trade VTS keys; expected wide/quiet books join one info record and page only after 30 min of session time; durable decision marks so rows clear across a restart; per-position paper keys; unpriced closes recorded with hold and last refusal. Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_PRE_AUDIT.md` r1-r5f. Change list: `Change Lists/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_STEP4_CHANGE_LIST.md`.

## 3. Steps completed, with evidence
| piece | step | evidence |
|---|---|---|
| obj 6 | 2 | plan r2 + r2a; Coltrane approved S2/S5, S6 corrected (design doc above) |
| obj 6 | 4 | Langston APPROVED at `83177ba6e`; Coltrane SENT BACK (terminal-cause gate, SKIP log volume), folded, APPROVED at `f7413a96a` |
| (4a) | 2 | Coltrane APPROVED r5 at `7977b2d01`; Langston APPROVED r4 (five conditions) and r5 (two conditions), all folded |
| (4a) | 4 | Coltrane: three send-backs folded, APPROVED r4 at `49308fcf4`; Langston: per-position paper key, APPROVED r3 at `af1b3f5b6` with three document conditions, folded at `5cab7b820`; NEW Claude notified of the engine touch (watcher down at the time) |
| both | 5 | CI `38920504436` 4/4 per job at `5cab7b820` |
| both | 6 | deployed `5cab7b820` 15:10:55Z; `spread_blown_enabled = 1` read back (`updated_by b-xstock-bid-trigger-reland-obj6`, 15:10:43Z, before the restart) |
| (4a) | 7 (first read) | two-sided legacy-row read PASS: of 60 open rows (pre-deploy snapshot 15:09:56Z: 28 closed / 32 open trades) 28/28 `TRADE-CLOSED`, 32/32 `DECIDED-AFTER-MINT`, 0 open-trade rows `TRADE-CLOSED` (pre-audit "STEP 6 + FIRST STEP-7 READ") |
| obj 6 | 7 | first overnight 20:00Z→01:00Z: 16 held, 0 closes (control 31), 53 releases all above the stop (min +0.083%), 0 pages (change list "STEP 7 — FIRST OVERNIGHT READ") |
| obj 6 | 8 | Langston CONFIRMED 2026-10-17 01:25Z, all five legs re-derived by him; 15 legacy `book-state-hollow-paper-*` rows resolved citing the change list's line 72 |

## 4. PRE-REGISTERED close criteria (written before the data)
**(4a), objective 11 — WINDOW: the first three full weekday US regular sessions after the deploy (2026-10-19, 10-20, 10-21).** Quoted from the pre-audit (r5e, Langston's reading): *"crossings conserved against A3 · joins taking the too_wide/quiet share · pagesAttempted falling · `dedupeHits == 0` as a SEPARATE tripwire, never a term (non-zero = FAIL)."* Also PASS requires `markMissedRowMarks` near zero and zero `no-trigger-vts-*` rows resolved by `cli`. **FAIL:** any `no_usable_mark` or isolated-staleness crossing that joins instead of paging; minted down with `dedupeHits` up; or `alertFileBytes` growing faster than ~1 MB/day. Source: the `[VTS_RAIL][SWEEP]` lines (cumulative since start).
**Objective 6 — S6 (the stop-hold cost) — QUANTITY WINDOW: the first `spread_blown` refused tick with the bid at or below the stop.** PASS: `spreadBlownFirstStopRefusedBid` and `spreadBlownStopHeldMs` are populated for that position and its release or close records the bid against the stop. Until then S6 is **UNEXERCISED** and no silence may be cited as a pass (Langston, Step 8).
**Increments A and C** — their pre-registered EST reads (2026-11-01/02/03) stand as written in `WINDOW_READ.md`.

## 5. Unproven, stated
- S6 has never fired (above).
- The release after a `spread_blown` hold is a fresh seed on two sub-ceiling frames with no movement test — `#1199`, placed after this objective's observation read (53 releases on 17 symbols in the first five hours show how often books oscillate around the ceiling).
- The paper rail clears on a `position_closed` row; 9 of 259 paper closes over 14 days wrote none (joined `active_trade_logs.trade_id = closed_trades.id`) — those rows stay for a human, blocking nothing.
- `serialPerKey` assumes one process writes the alert rows (PM2 one fork; Docker one process) — false the day a second writer lands.

## 6. Governance files changed so far (Step 10, 2026-10-17)
The Step-10 ledger, transcribed from the governance commit message:

CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | new OPEN entry for row 2: what shipped (A, C, objective 6, (4a)) and what it is open on |
| T1 | PHASE_HISTORY.md | ✅ | 2026-10-16 entry, OPEN: blown books held not sold; VTS alerts clear themselves |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 2) | ✅ | status: OPEN, `5cab7b820` deployed, objective 6 Step 8 confirmed, (4a) window, report linked |
| T1 | PHASE_19_PLAN.md | N/A — no row there | `3n.q7` has no row of its own; it is only named inside rows `3n.q2` and `3n.q8` |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | ✅ | shared: the "xStock paper holds on a book wider than 1%" truth (net shrink, 24,561 B); own: row 2 position |
| T1 | the batch SCOPE | ✅ | §INC-4A objectives 10-13 and objective 6's "DECIDER CHANGED" section (landed 10-16) |
| T1 | the batch PRE_AUDIT | ✅ | INC4A_PRE_AUDIT r1-r5f plus the Step 6/7 read |
| T1 | COMPLETION_REPORT | ✅ | parked batch: PROGRESS REPORT written (converts at close); criteria pre-registered in §4 |
| T1 | the Observation column | ✅ | card moved to Observation, blocked on External: (4a) window 10-19/20/21, A/C EST reads, S6's first stop-hold |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC_C row 2 updated (deployed pieces, windows, next B and (4b)); CC_A, CC_B, CC_INFRA not mine |
| T1 | Langston's MEMORY.md | ✅ | row 2 state block in, two F-G-1 mechanics lines out (heading repeat + evidence in its progress report); sum 162,267 → 162,233 B |
| T2 | SYSTEM_MANUAL.md | ✅ | §3.5.1: branch 2b `spread_blown` and the indefinite-hold exception to the yield |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | book-state entry (12 → 14 knobs, stale since inc-2; branch order) + objective 6 consumers/state + new rails entry |
| T2 | RUNNING_ISSUES.md | ✅ | `#1191` update (deployed, first read, window); `#684` updates and `#1199` filed 10-16 |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-16-B (objective 6) and -C ((4a)) |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change; row 2's place in the plan is unchanged |
| T2 | ADJUSTMENT_FRAMEWORK.md | ✅ | the rail key named in the valve register is now per-trade |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional rule touched |
| T2 | STORAGE_POLICY.md | N/A | no table or retention change; the alert file's growth is a pre-registered FAIL line, not a policy |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | ✅ | working-list review: no item A–F change; one paper xStock outcome boundary at the 10-16 15:10:55Z deploy |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no onboarding learning surfaced |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role, gate or method changed |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build, model and read path unchanged |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no stable rule changed |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md change |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | no module, route or function removed; the inc-2 `spread_blown` branch was replaced in place in `book-state.ts` |
| T2 | MISTAKE_PATTERNS.md | N/A | this batch's trailers (`wrong-object` A5, `skipped-the-gate`) are in commit bodies, where the weekly pass reads them; no promotion is this batch's call |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception granted |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | ack/resolve process unchanged; a new machine resolver (`vts-exit-monitor`) follows the existing pattern |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | board columns and fields unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | the daily check is not this batch's |
