# B-XSTOCK-BID-TRIGGER-RELAND — PROGRESS REPORT

## OPEN — waiting on: increment (4a)'s three-session window · increments A and C's EST reads (2026-11-01/02/03) · increment (4b), objective 8's shared paper/VTS trigger module (not yet built) · increment B Step 10 done 2026-10-20 (§6b) · objective 6's S6 EXERCISED 2026-10-19 (§3c)

change-class: `architecture` (scope header) · owner CC-C (Analyst Claude) · sprint plan row 2 · `#1191` (increment 4a), `#1199` (placed follow-up)

## 1. What the batch is for
Row 2 makes xStock trades open and close only where a real trade could (Kyle 2026-10-09): the broken-book guard at entry and exit with a duration report, the bid/ask trigger with a top-of-book size check, the Eastern-time venue-transition pause, and the VTS half. Scope: `Claude Comms and Packages/Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md`.

## 2. What has shipped (this report covers the two pieces deployed 2026-10-16; increments A and C are recorded in `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_WINDOW_READ.md`)
**Deployed `5cab7b820f18606d002f4cf12cd36af131ba32bb` 2026-10-16 15:10:55Z** (`dt-deploy --by cc-c`; CI run `38920504436` 4/4 per job at that sha; protected file `bridge/canonical/phase9_predictive-learning.json` checksum unchanged).

**Objective 6 — `spread_blown` ON (Kyle 2026-10-16: "turn it on and then review and observe").** An xStock book wider than the governed 1% ceiling (`ri_abs_spread_ceiling_pct`) is `hollow/spread_blown`, judged absolutely and before any comparator, so a re-seed can no longer release an exit on a blown book (PCAR/USD 2026-10-13). The hold is intentionally indefinite; entry is refused on a reference-free terminal cause; a spread_blown-only yield pages nobody; the SKIP log is summarised per run; a stop-hold tripwire (S6) measures the cost when a stop would have fired. Change list: `Change Lists/B_XSTOCK_BID_TRIGGER_RELAND_OBJ6_STEP4_CHANGE_LIST.md`. Design: `Langston Design Asks/B-XSTOCK-BID-TRIGGER-RELAND_spread-blown-arming_r1.md`.

**Increment (4a) — the VTS and paper no-decision rails clear themselves.** Per-trade VTS keys; expected wide/quiet books join one info record and page only after 30 min of session time; durable decision marks so rows clear across a restart; per-position paper keys; unpriced closes recorded with hold and last refusal. Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_PRE_AUDIT.md` r1-r5f. Change list: `Change Lists/B_XSTOCK_BID_TRIGGER_RELAND_INC4A_STEP4_CHANGE_LIST.md`.

**Increment B — objectives 5 + 8's size test (deployed `93dce9cb9`, 2026-10-17 07:56:13Z; `dt-deploy --by cc-c`).** The paper xStock stop/target trigger reads the guard-judged BID while the book-state guard ran and `spread_blown` is on — otherwise the mark, with the reason printed; armed with no bid ⇒ no decision. `xstockSideSize` (`transactable-sides.ts`): resting fills and the taker entry refuse a side that cannot show our size, exits are only counted; a broken own-row quantity pages once per position; a crossed book refuses entry. Epoch `xstock_spot` `paper_sim` 6 → 7. Plan: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCB_PRE_AUDIT.md` (r2, P1-P9); change list `Change Lists/B_XSTOCK_BID_TRIGGER_RELAND_INCB_STEP4_CHANGE_LIST.md`. ⚠️ **Objective 8 is PARTIAL:** B shipped its size test; the ONE shared trigger module for the engine and the VTS, with its call-site-count fence, is increment (4b) and is not built (the VTS trigger is still its own implementation, `vts-runner.ts` `_vtsTriggerPrice`).

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
| B | 2 | plan r2 (P1-P9), Langston PROCEED with forward-binding conditions (the seed-frame coupling, the `invalidQty` reading convention) |
| B | 4 | three gates, each Langston-approved; C1-C3 instrument folds rode CC-B's `162ae0537` |
| B | 5-6 | CI `39015290902` 4/4 per job; deployed `93dce9cb9` 2026-10-17 07:56:13Z; epoch read back 7 (`updated_at` 07:55:59Z); protected file unchanged |
| B | 7 | first-pass read PASS on all six pre-registered legs (§3c), `9b6c0ce4f` |
| B | 8 | Langston CONFIRMED 2026-10-20 21:17Z, both instruments re-run by him; F1-F8 folded into §3c at `2f2210a50` |
| B | 10 | 2026-10-20, ledger §6b |

## 3c. Increment B (objectives 5 + 8) — Step 7 first-pass read, Step 8 confirmed, and objective 6's S6 first exercise (read 2026-10-20 by CC-C; Step 8 by Langston 2026-10-20 21:17Z)
**Build:** `93dce9cb9` deployed 2026-10-17 07:56:13Z; the Step-4 C1-C3 instrument folds rode CC-B's `162ae0537` (13:03:42Z); the window ran on `7501f4f55` (CC-B, restart 2026-10-18 05:33:29Z — no deploy between it and 10-20 20:00Z; Langston re-derived all three ancestries and the deploy reflog). Plan and pre-registration: `Scope Files/B_XSTOCK_BID_TRIGGER_RELAND_INCB_PRE_AUDIT.md` §4, §0.r2c, §0.s4.
**Window (pre-registered):** the first two full US regular sessions after the deploy plus the overnight between — 2026-10-19 13:30Z → 2026-10-20 20:00Z (1,731,423 `error.log` lines, 84,254,830 `out.log` lines read, streamed; Langston re-ran both instruments and got the same figures). Scripts: `/home/langston/inbox/B-XSTOCK-BID-TRIGGER-RELAND/incb_read2.py` (legs), `incb_read4.py` (episodes, seeds), `incb_read5.py` (seed gaps).
**Stdout coverage — §4's retention constraint was breached:** at read time `out.log` coverage began 2026-10-19 03:52:14, so the 22.3 h of stdout after the restart (10-18 05:33:29Z →) had already rotated away (`out.log` rotates by size, 6-8 times a day). **Consequence measured at zero:** 0 exit-decided paper xStock closes in 10-18 05:33:29 → 10-19 03:52:14 (the same predicate returns 29 / 9 over the longer span; Saturday/Sunday, venue shut). Coverage has since moved on again (earliest retained 10-19 05:15:14 at 21:20Z). Forward, for (4a): its `[VTS_RAIL]` carriers are harvested before rotation — first harvest 2026-10-20 21:16Z, 1,533 `[VTS_RAIL][SWEEP]` lines (10-19 05:15:45 → 10-20 21:16:48) kept at staging `/home/deploy/harvest/incb4a-rail-2026-10-19_20.log`.
| pre-registered leg | measured | verdict |
|---|---|---|
| every armed xStock `EXIT_TRIGGER` shows `basis=bid`; a `basis=mark` line names its reason | 38 trigger lines in the window, all `basis=bid` (they count ticks, not decisions — see below); 0 `basis=mark` | PASS on the bid arm. **The `basis=mark` zero is UNCONTROLLED live** — no mark arm ran in the window. The mark fallback is fence-verified only: `server/tests/unit/b-xstock-bid-trigger-reland-inc2-chain.test.ts` CONTROL *"the same frames with the arm OFF"* asserts `markExit=y`, ` on=mark` and `basis=mark reason=spread_blown_off`; `reason=guard_off` has no fence |
| a stop/target's trigger price is the bid at decision | 38 checked, trigger ≠ bid: 0 | PASS |
| zero xStock exits on a book wider than 1% | 38 exit frames (`XS_FRAME` `bidExit=y`), spread > 1%: 0. **Stronger than the leg as written: no `XS_FRAME` line over 1% exists at all** (10-19 file: 563,824 lines, max spread 0.998%) against pre-ceiling controls of max 31.6% (10-15), 15.7% (10-12), 13.8% (10-16) | PASS — **but it proves the 1% ceiling clamps the frames upstream of the exit evaluator, not the exit hold itself**; the blown books are the 5,205 `spread_blown` SKIP lines. `XS_FRAME` `on=bid` 833,054 / `on=mark` 0 — the `on=mark` zero is uncontrolled (`on=` did not exist before increment B: every 10-13/10-16/10-17 line reads `none`) |
| `[XS_SIZE]` printed on evaluated cycles; tripwire `verdict=clean` near the row rate | 68,991 `[XS_SIZE]` lines; 31 hourly windows, all `clean` (20,596-42,803 looks/h, `sizeUnknown=0`) | PASS (counts, not rates) |
| zero resting fills on a short/unknown side | paper rest-fill size refusals 0 · `x1/x2 Short/Unknown` 0 · `SIZE_INVALID` 0 | PASS — **zero, with the instrument shown live** (68,991 lines) and the regular-session null quantity measured 0 by Langston at Step 4 |
| zero closes refused on `crossed`; entry crossed refusals populated or provably zero | close crossed walks 0 · close side-verdict refusals 0 · entry `crossed=true` refusals 0 | PASS on the close leg; the entry leg is **UNEXERCISED** in this window (no crossed book met an entry attempt) |
| the VTS size counters (COUNTS) | `xsRestSize*` 0, `xsExitFiredSize*` 0, taker entry size refusals 0 | recorded as counts |
**Decisions, reconciled:** the `EXIT_TRIGGER` line repeats every tick while a resting target exit waits (SNPS/USD 2026-10-19 06:36:12 → 06:41:43: one `EXIT_REST_PLACED`, ~190 trigger lines on a quote frozen for 5½ min, filled at its limit on the first new arrival — D1 working), so trigger lines count ticks, not decisions. **In the window: 38 trigger lines → 31 decision episodes = the 31 exit-decided paper xStock closes in the window (24 `stop_hit`, 7 `target_hit`).** Over the longer span 10-19 03:52:14 → 10-20 20:00Z: 38 episodes (29 / 9) = **38 exit-decided closes of the 44 in that span** (6 xStock + 1 crypto `never_filled` excluded — no exit decision happens on an unfilled entry); 38 − 31 = 7 = the 5 stop + 2 target closes between 03:52 and 13:30Z. ⇒ **the TARGET leg of P1 is now exercised** (§4 of the pre-audit stated it had no measured case).
**Langston's seed-frame anchor (§0.s4) — CONFIRMED:** 0 decisions on a seed frame itself (a seeded chain refuses twice before it acts). **8 of the 35 measurable decisions came 3.0 s after their chain re-seeded, none at 0 s** — the minimum (seed → validate → act) — each on a frame IDENTICAL to the seed frame (same mid and spread): CRM, TTWO, PRU, PCAR, HSIC (10-19), GE, JD, LECO (10-20); all spreads < 1% (0.13-0.91%); all released with the bid already below the stop (`bidToStopPct` −0.02 to −0.76). The other 3 of the 38 seeded inside the lost stdout stretch, so their seed is unmeasurable. Five of the eight followed a `spread_blown` hold ending (`SPREAD_BLOWN_SKIPS at=book_not_hollow`: the far side came back inside the ceiling); three (PRU, PCAR, HSIC) followed a shorter non-blown refusal. CRM traced in full: bid 237.27 steady from ≥ 11:18Z while the ask sat at 240 (blown); the ask moved to 238.98 at 11:22:17Z, the chain re-seeded, and the stop (237.4383) fired on that same bid at 11:22:20Z — the mark (238.125) would not have fired. ⇒ **a real stop, released when the book became sane; not a false stop.** These are `#1199`'s population (release with no movement test); here the release followed genuine movement of the far side.
**Objective 6 — S6, FIRST EXERCISE (the pre-registered quantity window):** the measure lives on `closed_trades.metadata.exitRefusal`. **Population: 15 closed rows carry a non-null `spreadBlownFirstStopRefusedBid`** (151 rows carry `exitRefusal` all-time; 57 post-objective-6 rows carry the `spreadBlown*` keys). **The first exercise is SNPS/USD**, closed 2026-10-19 06:41:43Z: first refused bid **400** against a 447.78 stop, held 1.53 h, released 2.61% above the stop, closed `target_hit`. All 15 (closed, first refused bid / stop, hours held, release bid vs stop):
| symbol | closed (UTC) | reason | first refused bid / stop | held h | release |
|---|---|---|---|---|---|
| SNPS | 10-19 06:41 | target | 400 / 447.78 | 1.53 | +2.61% |
| MRNA | 10-19 08:46 | stop | 180 / 213.06 | 0.02 | +0.94% |
| CRM | 10-19 11:22 | stop | 208.01 / 237.44 | 0.24 | −0.07% |
| MCD | 10-19 11:22 | stop | 240.34 / 241.55 | 0.05 | +0.42% |
| TTWO | 10-19 12:18 | stop | 190 / 203.24 | 0.59 | −0.02% |
| TXN | 10-19 14:18 | stop | 245 / 274.81 | 0.25 | +1.99% |
| O | 10-19 16:17 | stop | 55.40 / 55.45 | 0.01 | +1.13% |
| EPAM | 10-19 18:19 | target | 110.04 / 119.10 | 13.60 | +2.57% |
| GE | 10-20 00:39 | stop | 304 / 309.63 | 0.27 | −0.21% |
| JD | 10-20 13:03 | stop | 26.50 / 26.51 | 0.27 | −0.04% |
| WDAY | 10-20 13:46 | target | 160 / 188.80 | 27.86 | +5.05% |
| BRK.B | 10-20 13:47 | target | 490 / 526.48 | 0.02 | +0.48% |
| NTAP | 10-20 13:49 | stop | 199.04 / 204.37 | 17.50 | +0.34% |
| MA | 10-20 13:56 | target | 594 / 609.24 | 5.58 | +1.20% |
| LECO | 10-20 14:00 | stop | 256.97 / 257.03 | 30.54 | −0.76% |
(`spreadBlownStopHeldMs` and `lastReleaseBidToStopPct`; the five seed-frame trades above — CRM, TTWO, GE, JD, LECO — are a subset of these 15, not the S6 population.) **S6 PASS** — both fields populated and the release records the bid against the stop. **What it shows:** the hold refused sales at stub bids as far as 15.5% below the stop (MRNA 180 vs 213.06; WDAY, CRM and TXN 10-15%) and, of the 10 stop-side rows, released 5 with the bid back above the stop, 4 within 0.21% below it, and LECO 0.76% below. **Its cost is a distribution, not one number:** stop-side holds run from seconds to 30.5 h; the two long ones split — **NTAP held 17.5 h and released 0.34% ABOVE its stop** (sold 205.07 against 204.37), **LECO held 30.5 h and released 0.76% below** (closed 255.61, the worst); on the target side WDAY held 27.9 h to a `target_hit`. (The indefinite hold is Kyle's 2026-10-16 decision; this is its first measured cost.)
**Step 8 (Langston, 2026-10-20 21:17Z): CONFIRM on all six legs and the seed-frame anchor; this section folds his F1-F8 corrections into the body.**

## 4. PRE-REGISTERED close criteria (written before the data)
**(4a), objective 11 — WINDOW: the first three full weekday US regular sessions after the deploy (2026-10-19, 10-20, 10-21).** Quoted from the pre-audit (r5e, Langston's reading): *"crossings conserved against A3 · joins taking the too_wide/quiet share · pagesAttempted falling · `dedupeHits == 0` as a SEPARATE tripwire, never a term (non-zero = FAIL)."* Also PASS requires `markMissedRowMarks` near zero and zero `no-trigger-vts-*` rows resolved by `cli`. **FAIL:** any `no_usable_mark` or isolated-staleness crossing that joins instead of paging; minted down with `dedupeHits` up; or `alertFileBytes` growing faster than ~1 MB/day. Source: the `[VTS_RAIL][SWEEP]` lines (cumulative since start).
**Objective 6 — S6 (the stop-hold cost) — QUANTITY WINDOW: the first `spread_blown` refused tick with the bid at or below the stop.** PASS: `spreadBlownFirstStopRefusedBid` and `spreadBlownStopHeldMs` are populated for that position and its release or close records the bid against the stop. Until then S6 is **UNEXERCISED** and no silence may be cited as a pass (Langston, Step 8).
**Increments A and C** — their pre-registered EST reads (2026-11-01/02/03) stand as written in `WINDOW_READ.md`.

## 5. Unproven, stated
- S6 has never fired (above).
- The release after a `spread_blown` hold is a fresh seed on two sub-ceiling frames with no movement test — `#1199`, placed after this objective's observation read (53 releases on 17 symbols in the first five hours show how often books oscillate around the ceiling).
- The paper rail clears on a `position_closed` row; 9 of 259 paper closes over 14 days wrote none (joined `active_trade_logs.trade_id = closed_trades.id`) — those rows stay for a human, blocking nothing.
- `serialPerKey` assumes one process writes the alert rows (PM2 one fork; Docker one process) — false the day a second writer lands.
- **Increment B:** the mark fallback (`basis=mark`) never ran live — it is fence-verified only (the inc2-chain arm-OFF control covers `reason=spread_blown_off`; `reason=guard_off` has NO fence ⇒ folded into (4b)'s fences, §9.4 disposition 2). The entry `crossed` refusal is unexercised (no crossed book met an entry attempt). Size refusals have never fired (0 over 68,991 lines in the window). The trigger's safety on seed frames rests on the coupling with the 1% `spread_blown` ceiling (System Manual §3.5.1b, forward-binding).
- **Retention:** `out.log` rotates by size 6-8 times a day, so stdout older than ~12-16 h is gone; the window reads depend on a daily harvest (§3c).

## 6b. Governance files changed — increment B (Step 10, 2026-10-20)

CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | BATCH_CATALOG.md | ✅ | row 2 entry: B shipped (trigger on the gated bid, size test, crossed refusal); open on (4a), A/C, and (4b) still to build |
| T1 | PHASE_HISTORY.md | ✅ | 2026-10-17 entry for increment B, batch OPEN |
| T1 | SPRINT_TO_LIVE_PLAN.md (row 2) | ✅ | status: B deployed, Step 8 confirmed, Step 10; S6 exercised; A/C read dates |
| T1 | PHASE_19_PLAN.md | N/A — no row there | `3n.q7` has no row of its own there |
| T1 | shared MEMORY.md + MEMORY_CC_C.md | ✅ mine / N/A shared | own: row 2 position (B at Step 10, (4a) harvest, (4b) next); shared: the "xStock holds on a book wider than 1%" truth still holds, no new shared truth |
| T1 | the batch SCOPE | N/A | no scope change; objective 8's split between B (size) and (4b) (shared module) is recorded here and in the catalog |
| T1 | the batch PRE_AUDIT | ✅ | INCB_PRE_AUDIT r2 (landed at Step 2) — its §4 pre-registration is what §3c reads against |
| T1 | COMPLETION_REPORT | ✅ | this PROGRESS report — §2 increment B, §3 steps, §3c read with Step 8's corrections, §5 unproven |
| T1 | the Observation column | ✅ | card stays in Observation (blocked on the (4a) window, A/C reads, (4b)) |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC_C row 2: B deployed and confirmed, next the (4a) read then (4b) |
| T1 | Langston's MEMORY.md | ✅ | row 2 line updated (inc B confirmed, (4b) unbuilt); 421 → 362 B, the sum goes down |
| T2 | SYSTEM_MANUAL.md | ✅ | §3.5.1b rewritten: the gated bid trigger, the seed-frame coupling with the 1% ceiling (forward-binding), size and crossed rules, how to read the counters; §18.0.1 table cell, epoch boundaries, the crypto-ceiling note |
| T2 | SYSTEM_IMPACT_MAP.md | ✅ | NEW `transactable-sides.ts` entry (both functions, every production caller, upstream quantities, instruments, blast radius — a gap since `8a-P4c`); the `8a-P3/P4` summary line updated |
| T2 | RUNNING_ISSUES.md | ✅ | `#1191` update: the window's stdout carrier rotates faster than the window; harvest location |
| T2 | CHANGES_AND_FIXES.md | ✅ | FIX-2026-10-17-A (increment B) |
| T2 | POST_AUDIT_ROADMAP.md | N/A | no phase-level change |
| T2 | ADJUSTMENT_FRAMEWORK.md | ✅ | epoch register: third precedent (`xstock_spot/paper_sim` 6 → 7) and the unmarked objective-6 boundary inside epoch 6 |
| T2 | AUTHORITY_BASELINE.md | N/A | no constitutional rule touched |
| T2 | STORAGE_POLICY.md | N/A | no table or retention policy change; the log harvest is a read-time copy, not a policy |
| T2 | MULTI_ASSET_VTS_EXPANSION_PLAN.md | ✅ | working-list review: no item A–F change; the second paper xStock boundary, machine-visible this time |
| T2 | ACTIVE_PATH_FLOW.md | ✅ | the "still on the midpoint" line and the open-questions row: paper xStock re-landed on the bid |
| T2 | ASSET_CLASS_ONBOARDING_WORKFLOW.md | N/A | no onboarding learning surfaced |
| T2 | BUILD_METHOD_PLAYBOOK.md | N/A | no role, gate or method changed |
| T2 | LANGSTON_ARCHITECTURE.md | N/A | his build unchanged |
| T2 | CLAUDE.md / CONDUCT.md | N/A | no stable rule changed |
| T2 | _archive/CLAUDE_MD_RULE_HISTORY.md | N/A | no CLAUDE.md change |
| T2 | DELETED_COMPONENTS_LOG.md | N/A | nothing removed; C1's log-only divergence lines were re-pointed, not deleted (X3 START on the mark arm only) |
| T2 | MISTAKE_PATTERNS.md | N/A | the Step-7 slips (`wrong-object`) are in commit bodies for the weekly pass |
| T2 | GOVERNANCE_EXCEPTIONS.md | N/A | no exception granted |
| T2 | ALERT_HANDLING_PROTOCOL.md | N/A | one new alert key (`xstock-invalid-quantity-<mode>-<id>`) follows the existing pattern |
| T2 | DELIVERY_BOARD_PROTOCOL.md | N/A | unchanged |
| T2 | CLAUDE_CODE_FEATURE_WATCH.md | N/A | not this batch's |

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
