# B-RR-FLOOR-HEADROOM — COMPLETION REPORT — Step 11, awaiting Langston's confirm

**Owner:** CC-B (NEW Claude) · **change-class:** `architecture` · **Sprint plan row:** 59a · **Issue:** `#1183` · converted from the progress report below (renamed 2026-11-07), which is kept as written; §4c is the read of record.
**Records:** scope `Scope Files/B_RR_FLOOR_HEADROOM_SCOPE.md` (r3) · pre-audit + plan `Scope Files/B_RR_FLOOR_HEADROOM_PRE_AUDIT.md` · Step-7 record `Change Lists/STEP7_DEPLOY_162ae0537_2026-10-17.md` · terminal read `d57130d6e`.
**Read confirmed:** Langston, 2026-11-07 ~13:55Z, re-deriving every figure on staging, with three additions — folded in at §1(b) and in the "Confirmed by Langston" block after §4c.

## 0. ⚠️ OPEN AT CLOSE — stated first
| item | owner | home | closes when | fails when |
|---|---|---|---|---|
| **The floor question — the fill-time RR check STAYS IN SHADOW.** What `#372` inherits: **after the entry window, promoting the RR refusal buys 3 of 195 = 1.54 % additional refusals** — a scope decision (bug taxonomy outcome 2), not a defect. ⛔ NOT the "5.13 % vs 5 %" framing, which is a mix artifact (§1(b) 3). | CC-B (row 131's owner) | `#372`, carried by `SPRINT_TO_LIVE_PLAN` row 131 (roadmap 25-20, the Phase 25 per-strategy × per-class `min_rr` recalibration) — the pre-registered re-home | the floors are recalibrated per cell under row 131, or a decision to promote or retire the RR refusal is recorded on `#372` | — |
| **Crypto's own read** — never started: 0 graded crypto takers while `entry_fill_policy` is `maker_only` | CC-B | row 59b `B-MAKER-CANCEL-ON-STOP` (`#1184`) — the forward-binding rider (scope objective 5), written into the System Manual, `#1183` and row 59b | crypto moves to `maker_preferred` under row 59b; crypto's read then starts at that change, with the shadow unpromoted | — |
| **Step 7's per-row reconciliation, archive → log** (each row's `consumptionArm` equals its own `[CONSUMPTION_PASS] arm=` line — pre-audit record (iv), §4b): **NOT RUN.** No record of it in this report or in the Step-7 record (searched for `59a` and `CONSUMPTION_PASS`). What IS shown is the archive side (§2, objective 1). `NOT RE-READ` | CC-B | for Langston's ruling at this Step 11 — proposed: recorded as not run, no new work, objective 1 resting on the archive population (§9.4 disposition 5); otherwise one read over the kept logs | Langston rules | — |
| **Alerts `07df291f-6351-4385-887b-bc6bc7ae3d21` (weekly read) and `20bba77f-4070-4b57-b126-f1f4abdc0c0e` (terminal read):** the read they carry is taken and decided | CC-B | resolve whichever is still unresolved at Langston's confirm, with this report's commit as evidence — **not resolved by this draft.** Any `gov-openmaxage` alert minted off the 2026-10-17 declared-open row has no resolve edge (`#1074`): hand-resolve it at the flip; its id was not read here (NOT MEASURED) | resolved with evidence | — |

## 1. (a) WHAT DATA CAME IN — against the criterion as pre-registered (§3 below)
- **Window:** 2026-10-17T13:03:42Z → 2026-11-07T13:03:42Z, the full 21 days; neither early-stop condition held at the interim (§4a). Read by CC-B 2026-11-07 with the §4 SQL exactly as written (`statement_timeout` 900 s; commit `d57130d6e`); re-derived on staging by Langston.
- **Rule (b)**, as pre-registered: *"would-refuse ≤ 5 % per class, with ≥ 20 graded opens in the `direct_taker` arm; under 20 ⇒ **INSUFFICIENT, never PASS**. Both arms' rates reported; the pooled rate is the live **cost**, not evidence the floor is safe."* ⇒ **xStock: FAIL.** The direct-taker gate is met (28 ≥ 20); would-refuse **10 of 195 graded = 5.13 % > 5 %**. Arms: `direct_taker` 10 of 28 = 35.7 %; `maker_to_taker` 0 of 167.
- **Rule (a)**, as pre-registered: *"a cell (strategy × floor) qualifies with ≥ 5 graded opens and ≥ 5 positive-`adverseR` fills; in a qualifying cell the **nearest-rank** p90 of positive `adverseR` must not exceed `s* = (RR − floor)/(1 + floor)`. INSUFFICIENT if no cell qualifies, the class's positive-adverse population is under 5, or qualifying cells cover under 50 % — never PASS by absence."* (graded per row under Langston's 2026-10-17 ruling, §4: FAIL at a p90 of `adverseR / s_own` above 1.0) ⇒ **xStock: INSUFFICIENT.** One qualifying cell, vwap_pullback (floor 1.96): 90 graded = **46.2 % < 50 %**. Its own statistic would FAIL: p90 = **60.33**, 8 slips over their own bound.
- **Crypto:** 0 graded ⇒ **INSUFFICIENT by policy** (`maker_only`). Its 14-day baseline is non-empty (43 AEE rows), so the zero is the policy, not an absent class.
- **Controls:** C1 — 6 `entry_fill` rows in the window, excluded from `graded`; C2 — 0 taker rows without the key.
- **Reported beside the slip figures:** the graded takers closed **163 `stop_hit` / 25 `target_hit` / 0 other / 7 open** (pre-deploy baseline 21 / 0 / 9 open). Refusal burden: 5.13 % graded would-refuse · 2.99 % by the ask-through-stop guard alone (6 of 201) · 7.96 % both (16 of 201).
- **The §3 prediction:** slips accrued (14 positive); rule (a) INSUFFICIENT on coverage with its statistic 60× over; the direct-taker gate DID clear (28). Graded opens came in under the predicted ~300 (195).

## 1. (b) WHAT DECISION WAS TAKEN ON IT, AND BY WHOM
1. **The decision, by the pre-registered rule** (*"FAIL or INSUFFICIENT ⇒ shadow stays, numbers on `#1183`, re-home to `#372`"*): **the fill-time RR check STAYS IN SHADOW**, both classes. No refusal goes live from this batch, so objective 3 does not run. **Taken by CC-B applying the pre-registered rule; the read CONFIRMED by Langston 2026-11-07 ~13:55Z**, who re-derived every figure on staging. Numbers on `#1183`; the floor question re-homed to `#372` (Phase 25, sprint row 131).
2. ⛔ **THE READ OF RECORD IS NOT RE-RUNNABLE — BOUNDARY 2026-11-07T13:20:49Z (Langston addition 2).** Of the 195 graded, 7 carry `adverseR` > 0.25 and all 7 are would-refuses; only 3 would-refuses sit inside 0.25. From 2026-11-07T13:20:49Z the live entry window (`entry_window_worse_side_frac` = 0.25, `B-ENTRY-GATE`, both classes) refuses those opens before admission, so a re-run would read about 3 of 188 ≈ 1.6 % ⇒ PASS on rule (b), for a reason unrelated to the floor. **No comparison across that timestamp.** The 21-day population itself is clean of the entry gate (addition 1, the block after §4c).
3. **What `#372` inherits — and the framing it must NOT (Langston addition 3).** The pooled 5.13 % against 5 % is a **mix artifact**: the fallback arm's `adverseR` is strictly negative (max −0.00398908 over 167 rows), so that arm cannot produce a would-refuse, and the pooled rate is set by the 28 / 167 arm mix. ⇒ **The figure `#372` carries: post-entry-window, promoting the RR refusal buys 3 of 195 = 1.54 % additional refusals** — a scope decision (bug taxonomy outcome 2), not a defect. Every would-refuse and every positive slip is a `direct_taker`.
4. **"Extend for coverage" is not an option (addition 3).** Rule (a)'s coverage DILUTED over the window: 48.9 % at 141 graded → 46.2 % at 195, because vwap_pullback took 21 of the 54 new rows (38.9 %). Any extension would also cross the 13:20:49Z boundary.
5. **Correction (addition 1):** the joint deploy HAD landed when CC-B's terminal-read post said staging was "still at `0f4835b5a`" — the block after §4c.

## 2. Objectives (scope r3 §3)
| # | objective | verdict | evidence |
|---|---|---|---|
| 1 | Reconnect the arm: `consumptionArm` on every taker open's archive row, `admitted` and `entry_fill`; a maker row carries none | **YES** | `1b705c80d` + `4a640a60e`, deployed `162ae0537` 2026-10-17T13:03:42Z. **Both branches fire live:** 28 `direct_taker` + 167 `maker_to_taker` graded rows in the window; 0 taker rows without the key (C2); all 6 `entry_fill` rows carry it (Langston, C1 enumerated). The fallback arm's `adverseR` maximum (−0.00399 over 167 rows) is what its code floor predicts — a fallback fills at or below intended. Maker rows carrying none: unit-tested, not counted live. The archive → log reconciliation: NOT RUN (§0). |
| 2 | The read of record, pre-registered, forward 21 days | **YES** | run at the window's end exactly as written (§4c), re-derived by Langston; the result is §1(a) |
| 3 | If a class passes: the check refuses live, tested | **NO — not triggered** | no class passed (§1(a)), so nothing was promoted; conditional objective |
| 4 | If a class fails or is INSUFFICIENT: shadow stays, numbers on `#1183`, re-home to `#372` | **YES** | shadow unchanged; `#1183` and `#372` annotated 2026-11-07; `#372` is carried by sprint row 131 |
| 5 | The crypto rider, written forward | **YES** | System Manual fill-time row, `#1183` (2026-10-17 annotation), row 59b's item text |

## 3. Numeric deltas
- **PREVIOUSLY STATED** (interim, §4a, 2026-11-04): rule (b) would-refuse 6 of 141 = 4.3 %, `direct_taker` 18 < 20 ⇒ INSUFFICIENT. **NOW:** 10 of 195 = 5.13 %, `direct_taker` 28 ⇒ FAIL. **REASON:** 54 more graded rows and 4 more would-refuses, all direct takers.
- **PREVIOUSLY STATED** (interim): rule (a) vwap_pullback 69 graded = 48.9 % of class, 6 slips over their own bound. **NOW:** 90 = 46.2 %, 8. **REASON:** vwap_pullback took 21 of the 54 new rows (38.9 %).
- **PREVIOUSLY STATED** (§3 prediction): ~300 graded opens, ~10 positive slips. **NOW:** 195 graded, 14 positive slips. **REASON:** fewer xStock taker opens than the pre-registered sample's rate, and more of them slipped.
- **PREVIOUSLY STATED** (CC-B's terminal-read post, 2026-11-07): staging "still at `0f4835b5a`". **NOW:** reset to `e0e68dfdb` at 13:20:32Z, app restarted 13:20:49Z. **REASON:** Langston's correction — the post was wrong; the joint deploy had landed.

## 4. CI
No code changed at this close: the terminal read (`d57130d6e`) and this conversion are documents only. The batch's code: run `39034690051` at the deployed `162ae0537` — TypeScript Check, Test Suite, Build, Docker Build: all success (§2, Step 5).

## 5. Governance files changed — the Step-10 ledger
CHANGE-CLASS: architecture

| tier | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | entry set to closed at Step 11 pending confirm, with the result and the `#372` hand-off |
| T1 | `PHASE_HISTORY.md` | ✅ | the 2026-10-17 entry given its outcome in plain language |
| T1 | `SPRINT_TO_LIVE_PLAN.md` | ✅ | row 59a status → closed pending confirm; report cell → this report |
| T1 | `PHASE_19_PLAN.md` | N/A — no row there | the batch is sprint row 59a; `PHASE_19_PLAN.md` has no line naming it |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | N/A + ✅ | no shared truth changed; my position block → closed pending confirm |
| T1 | the batch `SCOPE` | ✅ | r3, written at Step 1; unchanged at close |
| T1 | the batch `PRE_AUDIT` | ✅ | written at Step 2; its Step-10 line now names this report |
| T1 | `COMPLETION_REPORT` | ✅ | this file, converted from the progress report by rename |
| T1 | the `Observation` column | ✅ | the 21-day window closed 2026-11-07T13:03:42Z, read and decided — the card leaves Observation |
| T1 | the four session task lists | ✅ mine / N/A ×3 | CC-B row 59a → closed pending confirm, carried items named; CC-A, CC-C, CC-INFRA lists not mine |
| T1 | Langston's `MEMORY.md` | BLOCKED — Langston's own write | asked in the Step-11 dispatch |
| T2 | `SYSTEM_MANUAL.md` | ✅ | the fill-time RR row: decided 2026-11-07, stays shadow — the arm finding and the 13:20:49Z boundary |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | fill-time checks entry: `consumptionArm`'s downstream read taken; pointer → this report (the field was already documented) |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1183` terminal result and decision; `#372` what it inherits; `#1074` item v: terminal read taken, the weekly reads still missed |
| T2 | `CHANGES_AND_FIXES.md` | N/A | no fix landed at close; the registry records fixes (the check itself is FIX-2026-10-11-A), not shadow-read outcomes |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | `#372` already sits at roadmap 25-20; the figure it inherits is on `#372` |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no parameter changed; the floors are untouched |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | N/A | no table or retention changed at close |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | not the VTS; the 15-minute-bar working list is unaffected |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | the method did not change |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | the reviewer's build did not change |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no stable rule changed |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | no `CLAUDE.md` rule changed |
| T2 | `DELETED_COMPONENTS_LOG.md` | N/A | nothing removed |
| T2 | `MISTAKE_PATTERNS.md` | N/A | no `MISTAKE:` trailer written at this close |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | ✅ | the 2026-10-17 declared-open row → `open-retired`; the 2026-11-05 `deploy-hold` row is CC-A's and left as is |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | unchanged |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | unchanged |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | the daily check did not run in this batch |

## 6. New findings in passing
None beyond §0 and §1(b).

## 7. Honest residual
- The read keeps the check in shadow; it does not say what the floors should be — that is `#372`.
- Rule (a) never became evaluable: its 60× statistic describes one cell holding 46.2 % of opens and decides nothing.
- Crypto was not measured: 0 graded, by policy.
- The archive → log per-row arm reconciliation was not run; objective 1 rests on the archive population.
- The weekly reads due 10-24 and 10-31 were never taken (`#1074` item v); the 11-04 interim and the terminal read are the only two.
- The window closed 17 minutes before the entry gate went live; nothing read after 2026-11-07T13:20:49Z is comparable with it.

---

# (was) B-RR-FLOOR-HEADROOM — PROGRESS REPORT — OPEN — waiting on the pre-registered 21-day read of the fill-time RR check (window from 2026-10-17T13:03:42Z)

**Owner:** CC-B (NEW Claude) · **Plan row:** `SPRINT_TO_LIVE_PLAN` 59a · **Issue:** `#1183` · **change-class:** `architecture`
**Records:** scope `Scope Files/B_RR_FLOOR_HEADROOM_SCOPE.md` (r3, approved) · pre-audit + plan `Scope Files/B_RR_FLOOR_HEADROOM_PRE_AUDIT.md` (approved) · Step-7 record `Change Lists/STEP7_DEPLOY_162ae0537_2026-10-17.md`
*Written 2026-10-17 ~13:45Z UTC.*

## 1. What the batch is for, and what shipped
`#1183` found the reward-to-risk floors sit 0.04-0.05 below the strategies' own RR, so any adverse slip at the fill breaches them; the fill-time RR check therefore shipped in **shadow** (`B-ENTRY-DISTANCE-GUARD`, 2026-10-11). This batch re-runs the pre-registered promotion read on the post-cutover system — floors unchanged (recalibration is `#372`, Phase 25) — and, because 86-88 % of today's xStock taker opens are maker fallbacks that start at or below intended, it first makes the two taker arms tellable apart.
**Shipped (objective 1):** `consumptionArm` (`direct_taker` | `maker_to_taker`) rides inside the shadow record onto BOTH archive rows (admitted, `entry_fill`) and never a maker row; `arm=` on the `[ENTRY_GEOMETRY][SHADOW]` line. `1b705c80d` + `4a640a60e`, deployed in `162ae0537` 2026-10-17T13:03:42Z.

## 2. Steps completed, with evidence
| step | evidence |
|---|---|
| 1 Scope | Langston APPROVED r3 2026-10-17 (~11:00Z); condition landed `136aa5628`, confirmed |
| 2 Pre-audit + plan | APPROVED ~12:00Z at `a2cf48fff`; two in-flight conditions (C1 entry_fill exclusion + positive control, C2 key-present denominator) recorded in the pre-audit |
| 3 Implementation | `1b705c80d`; displacement mutation run (key moved into the `entry_fill` literal ⇒ fence FAILS) |
| 4 Code review | PROCEED (Langston, ruled at `d635df83f`); condition (single assignment site pinned) `4a640a60e` |
| 5 CI | run `39034690051` at `162ae0537`: TypeScript Check, Test Suite, Build, Docker Build — success |
| 6 Deploy | `162ae0537` 2026-10-17T13:03:42Z, `dt-deploy --by cc-b`, engine resumed |
| 7 Verify | ⏳ **not observable until Monday's US session**: crypto is `maker_only` (no taker opens) and the xStock venue is shut. The first post-deploy taker rows are reconciled archive → log (`[CONSUMPTION_PASS] arm=`), and the arms actually seen are stated — a 3-of-3 `direct_taker` read is not proof of the `maker_to_taker` branch (pre-audit record (iv)). |

## 3. ⛔ THE PRE-REGISTERED CLOSE CRITERION — the approved scope's objective 2, plus Langston's two Step-2 conditions attributed inline (C1, C2); written before the data (scope last touched `136aa5628` 11:19:00Z, deploy 13:03:42Z)
- **Population:** `signal_eval_archive`, `source='active-execution-engine'`, `mode='paper_sim'`, `reject_stage='admitted'`, `gate_decision.entryArm='taker'`, `rrFill` non-null, **and `gate_decision ? 'consumptionArm'`** (key-present — Step-2 C2; an absent key never reads as `direct_taker`), from **2026-10-17T13:03:42Z** for **21 days** (to **2026-11-07T13:03:42Z**), ending earlier only when BOTH: rule (a) is evaluable (qualifying cells, each with ≥ 5 positive-`adverseR` fills, together covering ≥ 50 % of graded opens) **and** the `direct_taker` arm has ≥ 20 graded opens. At 30 graded opens per class rule (b)'s cost figures are first REPORTED (interim, not the end).
- **Denominator:** graded admitted takers. `entry_fill` rows are counted and reported beside it, never in it — **positive control (Step-2 C1): the `entry_fill` count is non-zero in the window and zero after the filter.** The pre-deploy taker rows the key test drops are counted and printed.
- **Rule (b):** would-refuse ≤ 5 % per class, with ≥ 20 graded opens in the `direct_taker` arm; under 20 ⇒ **INSUFFICIENT, never PASS**. Both arms' rates reported; the pooled rate is the live **cost**, not evidence the floor is safe.
- **Rule (a):** a cell (strategy × floor) qualifies with ≥ 5 graded opens and ≥ 5 positive-`adverseR` fills; in a qualifying cell the **nearest-rank** p90 of positive `adverseR` must not exceed `s* = (RR − floor)/(1 + floor)`. INSUFFICIENT if no cell qualifies, the class's positive-adverse population is under 5, or qualifying cells cover under 50 % — never PASS by absence. Coverage per cell stated. (Buy-only path: adverse = fill above intended.)
- **What rule (a) can decide, stated (scope §0 / objective 2):** as written it is in practice a **single-cell test on `vwap_pullback`** — the only cell holding ≥ 50 % of graded opens (17 of 30 in the pre-registered sample).
- **Baseline the outcome split is compared against (pre-deploy, 10-15 16:29:07Z → 10-16 20:57:22Z):** takers 21 `stop_hit` / 0 `target_hit` / 9 open; makers 9 / 1 / 11.
- **Both PASS ⇒ that class goes live** (a follow-up step in this batch: `would_refuse` → `refused`, tested). **FAIL or INSUFFICIENT ⇒ shadow stays**, numbers on `#1183`, re-home to `#372`. Crypto: INSUFFICIENT by policy while `maker_only` holds; a move to `maker_preferred` (row 59b) returns the crypto taker path with the shadow unpromoted and starts crypto's own read at that change.
- **Reported beside the slip figures:** the realised `close_reason` split of the graded takers, and the three refusal-burden figures (graded would-refuse; refused by the ask-through-stop guard; both).
- **Prediction, stated before the data:** ~15 xStock sessions ⇒ ~300 graded opens, ~10 positive slips at today's rate; if slips accrue, rule (a) most likely FAILS (ORCL slipped 58× its cell's s*); else INSUFFICIENT; the direct-taker gate may not clear (3 graded direct takers in the pre-registered sample, all within 70 minutes).

## 4. The read — carried by alert, and its SQL
- **Alert `07df291f-6351-4385-887b-bc6bc7ae3d21`:** fires 2026-10-24T13:00Z (interim: arm split, counts, cost figures), re-minted weekly until the window closes at 2026-11-07T13:03:42Z or both early-stop conditions hold.
- **Terminal read alert `20bba77f-4070-4b57-b126-f1f4abdc0c0e`** fires at the window's end, 2026-11-07T13:03:42Z, independent of the weekly re-mints (Langston Step-10 record item).
- *Dry run 2026-10-17 ~14:03Z:* both classes print, `rows_in_window 0` — no AEE archive row since the deploy. xStock's zero is the weekend (46 rows on 10-16; none across the 10-10/10-11 weekend). ⚠️ **Crypto's zero is NOT attributable to `maker_only`** (Langston, Step-10 finding, folded here): the active-execution engine has written **no** `crypto_spot` archive row of any stage since 2026-10-15 ~13:04Z, so the cell can read 0 from no crypto signals at all. ⇒ **every fire prints crypto's own 14-day baseline (query below) beside its row**; a crypto zero with an empty baseline is NOT MEASURED, never booked as policy.
- ⚠️ **Population fence:** a second `adverseR` writer exists at `ready_to_buy_service.ts:1340` under a different `source`. The read is `source = 'active-execution-engine'` only; widening it restates the population first.
- **SQL** (the read of record runs exactly this, reading the archive only). *Corrected per Langston's Step-10 conditions before the first fire:* every numerator carries the denominator's predicates (one `graded` flag; `positive_slips` counted within graded — `rrFill` is NOT entailed by key-presence, since a non-finite target leaves it null); the window has its **upper bound**; both classes print a row even when empty, and the row count is stated, so "control failed" and "no taker opens yet" can never print alike.
```sql
WITH w AS (
  SELECT asset_class, strategy, reject_stage, gate_decision g
  FROM signal_eval_archive
  WHERE source = 'active-execution-engine' AND mode = 'paper_sim'
    AND captured_at >= '2026-10-17 13:03:42Z' AND captured_at < '2026-11-07 13:03:42Z'),
f AS (
  SELECT asset_class, strategy, reject_stage, g,
    (reject_stage = 'admitted' AND g->>'entryArm' = 'taker' AND g ? 'consumptionArm' AND g->>'rrFill' IS NOT NULL) AS graded
  FROM w),
classes(asset_class) AS (VALUES ('crypto_spot'), ('xstock_spot'))
SELECT c.asset_class,
  count(f.*)                                                                                     AS rows_in_window,
  count(*) FILTER (WHERE f.reject_stage = 'entry_fill')                                           AS entry_fill_rows,        -- C1 control: > 0 once takers exist
  count(*) FILTER (WHERE f.reject_stage = 'admitted' AND f.g->>'entryArm' = 'taker' AND NOT f.g ? 'consumptionArm') AS taker_rows_without_key, -- C2: must be 0 post-deploy
  count(*) FILTER (WHERE f.graded)                                                                AS graded,
  count(*) FILTER (WHERE f.graded AND f.g->>'consumptionArm' = 'direct_taker')                    AS graded_direct,
  count(*) FILTER (WHERE f.graded AND f.g->>'consumptionArm' = 'maker_to_taker')                  AS graded_fallback,
  count(*) FILTER (WHERE f.graded AND f.g->>'rrWouldRefuse' = 'true')                             AS would_refuse,
  count(*) FILTER (WHERE f.graded AND (f.g->>'adverseR')::float8 > 0)                             AS positive_slips
FROM classes c LEFT JOIN f ON f.asset_class = c.asset_class
GROUP BY c.asset_class ORDER BY c.asset_class;
```

- **Rule (a)'s deciding query** (Langston Step-10 forward condition: a criterion whose deciding query does not exist is not pre-registered). Same `graded` flag; `percentile_disc(0.9)` IS nearest-rank; the `close_reason` split joins `closed_trades.metadata->>'rtbQueueId'` = the archive's `gate_decision->>'rtbQueueId'`. **Join control, 2026-10-17:** on the pre-registered sample window (10-15 16:29:07Z → 10-16 20:57:22Z inclusive) with the key predicate dropped (those rows predate the key): 30 of 30 joined, **21 `stop_hit` / 0 `target_hit` / 9 open, 0 unjoined** — the §3 baseline exactly; vwap_pullback 17 of 30 (56.7 %). Run as `psql -v lo='2026-10-17 13:03:42Z' -v hi='2026-11-07 13:03:42Z'` (an interim fire sets `hi` to its own time).
```sql
WITH w AS (
  SELECT asset_class, strategy, reject_stage, gate_decision g
  FROM signal_eval_archive
  WHERE source = 'active-execution-engine' AND mode = 'paper_sim'
    AND captured_at >= :'lo' AND captured_at < :'hi'),
f AS (
  SELECT asset_class, strategy, g,
    (reject_stage = 'admitted' AND g->>'entryArm' = 'taker' AND g ? 'consumptionArm' AND g->>'rrFill' IS NOT NULL) AS graded
  FROM w),
gr AS (
  SELECT f.asset_class, f.strategy, (f.g->>'rrFloor')::numeric AS floor, f.g->>'consumptionArm' AS arm,
    (f.g->>'adverseR')::float8 AS adv, f.g->>'rrWouldRefuse' = 'true' AS wr,
    (((f.g->>'targetPrice')::numeric - (f.g->>'intendedEntryPrice')::numeric)
      / NULLIF((f.g->>'intendedEntryPrice')::numeric - (f.g->>'stopPrice')::numeric, 0)
      - (f.g->>'rrFloor')::numeric) / (1 + (f.g->>'rrFloor')::numeric) AS s_own,   -- this row's own bound (RR_plan - floor)/(1 + floor)
    f.g->>'rtbQueueId' AS q
  FROM f WHERE f.graded),
cls AS (SELECT asset_class, count(*) n FROM gr GROUP BY asset_class)
SELECT gr.asset_class, gr.strategy, gr.floor,
  count(*)                                                       AS graded_opens,
  round(100.0 * count(*) / max(cls.n), 1)                        AS pct_of_class_graded,
  count(*) FILTER (WHERE gr.arm = 'direct_taker')                AS direct,
  count(*) FILTER (WHERE gr.arm = 'maker_to_taker')              AS fallback,
  count(*) FILTER (WHERE gr.wr)                                  AS would_refuse,
  count(*) FILTER (WHERE gr.adv > 0)                             AS positive_slips,
  (count(*) >= 5 AND count(*) FILTER (WHERE gr.adv > 0) >= 5)    AS qualifies,
  -- C1, DECIDING: nearest-rank p90 of adverseR / s_own over positive-adverse rows with s_own > 0; FAIL at > 1.0
  percentile_disc(0.9) WITHIN GROUP (ORDER BY gr.adv / gr.s_own) FILTER (WHERE gr.adv > 0 AND gr.s_own > 0) AS p90_slip_over_own_bound,
  -- C2: rows planned at or below their own floor — enumerated, never divided; breaches by construction; a PLANNER finding
  count(*) FILTER (WHERE gr.s_own IS NULL OR gr.s_own <= 0)      AS s_own_nonpositive,
  count(*) FILTER (WHERE gr.adv > 0 AND gr.s_own > 0 AND gr.adv > gr.s_own) AS slips_over_own_bound,
  -- C3, SHADOW (describes, never decides): p90 positive adverseR against the cell's minimum bound
  percentile_disc(0.9) WITHIN GROUP (ORDER BY gr.adv) FILTER (WHERE gr.adv > 0) AS shadow_p90_positive_adverse_r,
  min(gr.s_own)                                                  AS s_own_min,
  percentile_disc(0.1) WITHIN GROUP (ORDER BY gr.s_own)          AS s_own_p10,
  percentile_disc(0.5) WITHIN GROUP (ORDER BY gr.s_own)          AS s_own_median,
  max(gr.s_own)                                                  AS s_own_max,
  count(ct.id) FILTER (WHERE ct.close_reason = 'stop_hit')       AS stop_hit,
  count(ct.id) FILTER (WHERE ct.close_reason = 'target_hit')     AS target_hit,
  count(ct.id) FILTER (WHERE ct.closed_at IS NOT NULL AND ct.close_reason NOT IN ('stop_hit','target_hit')) AS other_close,
  count(ct.id) FILTER (WHERE ct.closed_at IS NULL)               AS still_open,
  count(*) - count(ct.id)                                        AS unjoined
FROM gr JOIN cls USING (asset_class)
LEFT JOIN closed_trades ct ON ct.metadata->>'rtbQueueId' = gr.q AND ct.mode = 'paper'
GROUP BY gr.asset_class, gr.strategy, gr.floor
ORDER BY gr.asset_class, graded_opens DESC;
```
- ✅ **RULED by Langston 2026-10-17 (before any graded row exists — the window held 0 graded rows at the ruling; the row-count line in the class query is what shows that zero is a measured empty, not a failed control): GRADE PER ROW.** `s*` is not a cell constant — the control run shows vwap_pullback's own bounds spanning **0.0133 → 1.33** over 17 rows. Conditions, all now in the query above:
  - **C1 — the deciding statistic:** the nearest-rank p90 (`percentile_disc(0.9)`) of `adverseR / s_own` over the cell's positive-adverse graded rows, **FAIL at > 1.0**. Only the comparator moves; the pre-registered 90th-percentile semantics and its outlier resistance stay.
  - **C2 — a row with `s_own ≤ 0`** (planned at or below its own floor) is enumerated (`s_own_nonpositive`), never divided, counted as a breach by construction and printed separately: a non-zero count is a **planner** finding (an admit with planned RR at or below its floor) with its own §9.4 disposition, not a rule-(a) FAIL. Control window: 0.
  - **C3 — the shadow comparator prints beside it, never decides:** p90 positive `adverseR` against `s_own_min`, plus the cell's bound distribution n / min / p10 / median / max.
  - **C4 — no pooled breach rate is reported without that distribution:** a cell spanning 0.0133 → 1.33 R is a mixture, and a pooled near-zero would read "safe" while its low-headroom rows breach.
  - **C5 — the scope's 0.0135 R** (scope objective 2: *"vwap_pullback: 0.04/2.96 = 0.0135 R"*) was computed from the strategy's planned RR 2.0 against its 1.96 floor — a design figure, not measured rows. On the pre-registered sample it is the cell's **median** row (0.01353); the measured **minimum** is 0.01333. **Superseded as a decision input by C1** (each row carries its own bound).
  - **Unchanged:** qualification (≥ 5 graded, ≥ 5 positive-adverse, ≥ 50 % coverage) and both INSUFFICIENT tests — `positive_slips` does not depend on `s*`.
  - **Control run of this query** (pre-registered sample, key predicate dropped, 10-15 16:29:07Z → 10-16 20:57:22Z inclusive): 30 graded, 0 `s_own_nonpositive`; the one positive slip is ORCL in the one-row vwap_bounce cell, `adverseR / s_own` = **58.24** against its own row's bound (0.0169) — so the §3 prediction's "58× its cell's s*" is a per-row figure and holds under C1. Post-deploy window (to 15:00Z): 0 rows.
- **Crypto's own baseline** — printed beside crypto's row at every fire (a missing day is a zero):
```sql
-- crypto's own baseline, printed beside its row at every fire: AEE archive rows per day (any stage) over the 14 days before the fire
SELECT asset_class, date_trunc('day', captured_at)::date AS day, count(*) AS aee_rows,
  count(*) FILTER (WHERE reject_stage = 'admitted') AS admitted
FROM signal_eval_archive
WHERE source = 'active-execution-engine' AND mode = 'paper_sim'
  AND captured_at >= (:'hi')::timestamptz - interval '14 days' AND captured_at < :'hi'
GROUP BY 1, 2 ORDER BY 1, 2;
```


### 4a. Interim read 2026-11-04 (hi = 13:52:11Z) — CC-B, alert `07df291f`. INTERIM, NOT THE VERDICT; the read of record is the terminal alert `20bba77f` at 2026-11-07T13:03:42Z.
⚠️ The weekly reads due 10-24 and 10-31 were NOT taken: the alert was minted with no repeat setting (`recurrence_interval_seconds: null`), so it never re-armed, and the crew was frozen 10-21 → 11-04. This is the first read since the window opened. The miss is homed on `#1074`.
- **Class query: did NOT complete** — `canceling statement due to statement timeout` on the full archive scan. Its counts are NOT MEASURED here, and are NOT inferred from the rule-(a) query. The terminal read must run it with a raised `statement_timeout`; that is a condition on the read of record, not a change to the criterion.
- **Rule (a) query, xStock (graded = the query's own `graded` flag):** 141 graded opens across 7 cells. **vwap_pullback: 69 graded (48.9 % of class), 18 `direct_taker` / 51 `maker_to_taker`, 9 positive slips, qualifies; nearest-rank p90 of `adverseR / s_own` = 60.33 (FAIL threshold > 1.0); 6 slips over their own bound; `s_own` min 0.0040.** Every other cell has 0 positive slips and does not qualify.
- **Against the pre-registered rules, as of this read:** rule (a) — the only qualifying cell covers **48.9 % < 50 %** ⇒ **INSUFFICIENT** (its statistic would FAIL on its own). Rule (b) — would-refuse 6 of 141 graded = 4.3 % (≤ 5 %), but `direct_taker` = 18 < 20 ⇒ **INSUFFICIENT, never PASS**. Neither early-stop condition holds; the window runs to its end.
- **Crypto:** 38 AEE rows in the 14 days to the read, all `admitted`, so its baseline is non-empty; its taker leg is assessed at the terminal read.
- **The §3 prediction** ("if slips accrue, rule (a) most likely FAILS") is tracking: the qualifying cell's statistic is 60× its bound.

### 4c. ⛔ THE TERMINAL READ OF RECORD — 2026-11-07, window 2026-10-17T13:03:42Z → 2026-11-07T13:03:42Z (alert `20bba77f`), CC-B
Run: the §4 SQL EXACTLY as written (class query, rule-(a) query, crypto baseline), `lo`/`hi` = the window, `statement_timeout` raised to 900 s (the interim's condition) — it completed. Plus one arm split (same `graded` predicate, grouped by `consumptionArm`) because rule (b) requires both arms' rates and the class query reports would-refuse pooled only.
**Class query (row counts stated):**
| class | rows in window | `entry_fill` | taker rows without key | graded | direct_taker | maker_to_taker | would-refuse | positive slips |
|---|---|---|---|---|---|---|---|---|
| crypto_spot | 47 | 0 | 0 | **0** | 0 | 0 | 0 | 0 |
| xstock_spot | 377 | **6** | **0** | **195** | **28** | 167 | **10** | **14** |
Controls: C1 — `entry_fill` 6 > 0 in the window and excluded from `graded` by the filter; C2 — 0 taker rows without the key.
**Arm split (xStock):** `direct_taker` 28 graded, **10 would-refuse (35.7 %)**, 14 positive slips · `maker_to_taker` 167 graded, **0 would-refuse**, 0 positive slips. **Every would-refuse and every positive slip is a direct taker.**
**Rule (b), as pre-registered** (*"would-refuse ≤ 5 % per class, with ≥ 20 graded opens in the `direct_taker` arm"*): the direct-taker gate is MET (28 ≥ 20); would-refuse **10 of 195 = 5.13 % > 5 %** ⇒ **FAIL.** Both arms reported: direct 35.7 %, fallback 0 %. The pooled 5.13 % is the live COST, not evidence of safety.
**Rule (a), as pre-registered** (qualifying cells must cover ≥ 50 % of graded opens; nearest-rank p90 of `adverseR / s_own` must not exceed 1.0): one qualifying cell, **vwap_pullback (floor 1.96): 90 graded = 46.2 % of class < 50 %** ⇒ **INSUFFICIENT** — never PASS. Its own statistic: **p90 = 60.33** (would FAIL by 60×); 8 slips over their own bound; `s_own` min 0.0040, p10 0.01346, median 0.01352, max 1.873; 0 `s_own_nonpositive`. Shadow comparator (describes, never decides): p90 positive `adverseR` 0.9011 vs `s_own_min` 0.0040. No other cell qualifies (strong_bull_trend 11 graded / 1 slip; vwap_bounce 5 / 2; sma_trend_ride 37 / 0; morning_star 24 / 0; pivot_shift 23 / 0; range_trading 4 / 0; mean_reversion 1 / 0).
**Crypto:** **0 graded ⇒ INSUFFICIENT by policy** (`maker_only`); its 14-day baseline is non-empty (43 AEE rows, every day 10-27 → 11-07 holds ≥ 1, all `admitted`), so the zero is the policy, not an absent class.
**The three refusal-burden figures (xStock, 201 taker attempts = 195 graded + 6 refused before grading):** graded would-refuse **10/195 = 5.13 %** · refused by the ask-through-stop guard alone (`entry_fill`) **6/201 = 2.99 %** · both, with the fill check live **16/201 = 7.96 %**.
**`close_reason` split of the graded takers** (join 195 of 195, 0 unjoined): **163 `stop_hit` / 25 `target_hit` / 0 other / 7 open** — against the §3 baseline (takers 21 / 0 / 9 open).
**The §3 prediction** (*"if slips accrue, rule (a) most likely FAILS … else INSUFFICIENT; the direct-taker gate may not clear"*): slips accrued (14); rule (a) reads INSUFFICIENT on coverage, its statistic 60× over; the direct-taker gate DID clear (28).
**DECISION, by the pre-registered rule** (*"FAIL or INSUFFICIENT ⇒ shadow stays, numbers on `#1183`, re-home to `#372`"*): **xStock: FAIL (b), INSUFFICIENT (a) ⇒ the fill-time RR check STAYS IN SHADOW.** Crypto: INSUFFICIENT ⇒ shadow stays. Numbers go on `#1183`; the floor question re-homes to `#372` (Phase 25). No refusal goes live from this batch.
**What the data says beyond the rule (for `#372`, not a decision here):** the would-refuses are concentrated entirely in the 28 DIRECT taker opens (35.7 %); the 167 maker-fallback takers never slipped adversely — consistent with §1 (fallbacks start at or below intended). The vwap_pullback cell's bounds sit at ~0.0135 R for the median row, so any adverse slip breaches; that is the 0.04 floor-headroom finding that opened `#1183`, now measured over 21 days.
⛔ **BOUNDARY, STAMPED AT CLOSE (Langston addition 2): THIS READ IS NOT RE-RUNNABLE ACROSS 2026-11-07T13:20:49Z.** From then the live entry window (`B-ENTRY-GATE`, `entry_window_worse_side_frac` = 0.25) refuses before admission the 7 would-refuses that carry `adverseR` > 0.25, so a later window reads ~3 / 188 ≈ 1.6 % — a PASS on rule (b) unrelated to the floor. No comparison across it (item 2 below).

### 4c-i. ✅ CONFIRMED BY LANGSTON — 2026-11-07 ~13:55Z, every figure re-derived on staging, with three additions (folded in at close)
1. **Correction — the joint deploy HAD landed** when CC-B wrote "still at `0f4835b5a`": staging reset to `e0e68dfdb` at 13:20:32Z, the b-entry-gate migration applied 13:20:44.849786Z, the app restarted 13:20:49Z; `entry_window_worse_side_frac` = 0.25 is live on both classes. **The 21-day population is clean of the entry gate:** `entry_window_worse_side_frac` has 0 matches in `server/services/active-execution-engine.ts` at the in-window deploy shas `d307debe5`, `0abfd7102`, `0f4835b5a` (positive control: 3 matching lines at `d57130d6e` and `e0e68dfdb`; the five counts re-run by CC-B at the ref at close, `git show <sha>:<path> | grep -c`, the same). **C1 enumerated:** all 6 `entry_fill` rows are `ask_at_or_through_stop`, every one with `adverseR` < −1, every one carrying `consumptionArm`.
2. ⛔ **THE READ OF RECORD IS NOT RE-RUNNABLE — boundary 2026-11-07T13:20:49Z.** Of the 195 graded, 7 carry `adverseR` > 0.25 and all 7 are would-refuses; only 3 would-refuses sit inside the 0.25 window. From 13:20:49Z the live entry window refuses those 7 before admission, so a re-run would read ~3 / 188 ≈ 1.6 % ⇒ PASS on rule (b), for a reason unrelated to the floor. **No comparison across the boundary.**
3. **Do not hand `#372` the "5.13 % vs 5 %" framing — it is a mix artifact.** The fallback arm's `adverseR` is strictly negative (max −0.00398908 over 167 rows), so it cannot produce a would-refuse; the pooled rate is set by the 28 / 167 arm mix. **The figure `#372` inherits:** post-entry-window, promoting the RR refusal buys **3 of 195 = 1.54 %** additional refusals — a scope decision (bug taxonomy outcome 2), not a defect. And rule (a)'s coverage DILUTED over the window (48.9 % at 141 graded → 46.2 % at 195; vwap_pullback took 21 of the 54 new rows = 38.9 %), so "extend for coverage" is not an option.

## 4b. Step 7 — the arms EXPECTED, written before Monday's session (Langston Step-8 instruction, 2026-10-17 ~14:15Z)
Written before any post-deploy taker opens exists (crypto `maker_only`, xStock shut since Friday 20:00 ET):
- **Every** admitted xStock taker row from 2026-10-17T13:03:42Z carries `consumptionArm` — **0** taker rows without the key after the deploy (a non-zero count is a defect, not a warm-up).
- **The mix, expected from the pre-registered sample (22 `maker_to_taker` / 3 `direct_taker` of 25 known):** `maker_to_taker` the large majority (~85-90 % of opens), `direct_taker` a handful — at today's rate **0-5 direct takers in Monday's regular session**. A Monday with **zero** `direct_taker` rows does not prove the direct branch stamps; a Monday with zero `maker_to_taker` rows would contradict the sample and is reported as such.
- Each row's `consumptionArm` equals its own `[CONSUMPTION_PASS] arm=` line (archive → log; a log line without a row is the TCL-blocked case, not an orphan).
- Crypto: **no** taker rows at all while `maker_only` holds.
- ⛔ **Every leg prints its denominator (Langston Step-8 condition 3):** "0 taker rows without the key" prints beside `admitted_takers`, and crypto's taker zero beside `admitted_makers` as the positive control. **If Monday opens no xStock takers, the key leg reads NOT MEASURED, never PASS; if crypto shows no makers either, its leg is NOT MEASURED** (and its baseline above says why). Dry run 14:30Z: both classes print, all zeros (weekend + crypto's quiet engine).
```sql
-- Step 7 (Monday): every leg prints its DENOMINATOR, so an empty population reads NOT MEASURED, never PASS
WITH w AS (
  SELECT asset_class, reject_stage, gate_decision g FROM signal_eval_archive
  WHERE source = 'active-execution-engine' AND mode = 'paper_sim'
    AND captured_at >= '2026-10-17 13:03:42Z' AND captured_at < :'hi'),
classes(asset_class) AS (VALUES ('crypto_spot'), ('xstock_spot'))
SELECT c.asset_class,
  count(*) FILTER (WHERE w.reject_stage = 'admitted' AND w.g->>'entryArm' = 'taker')                              AS admitted_takers,        -- denominator
  count(*) FILTER (WHERE w.reject_stage = 'admitted' AND w.g->>'entryArm' = 'taker' AND NOT w.g ? 'consumptionArm') AS takers_without_key,     -- must be 0 of admitted_takers
  count(*) FILTER (WHERE w.reject_stage = 'admitted' AND w.g->>'consumptionArm' = 'direct_taker')                  AS direct_taker,
  count(*) FILTER (WHERE w.reject_stage = 'admitted' AND w.g->>'consumptionArm' = 'maker_to_taker')                AS maker_to_taker,
  count(*) FILTER (WHERE w.reject_stage = 'admitted' AND w.g->>'entryArm' = 'maker')                               AS admitted_makers         -- positive control beside crypto's taker zero
FROM classes c LEFT JOIN w ON w.asset_class = c.asset_class
GROUP BY c.asset_class ORDER BY c.asset_class;
```

## 5. Unproven, stated as unproven
- That the `maker_to_taker` arm stamps correctly in a live open — not exercisable until a maker cannot rest.
- That 21 days yields enough direct takers or adverse slips to decide anything.

## 6. Governance files changed so far *(as of the progress report; the close's ledger is §5 at the top)*
Scope; pre-audit; this progress report; `SYSTEM_IMPACT_MAP` (fill-time checks entry — `consumptionArm` on both archive rows); `SYSTEM_MANUAL` (`:720` — the arm, the two arm fields' relation, the read's state, the crypto rider); `RUNNING_ISSUES` `#1183`; `SPRINT_TO_LIVE_PLAN` rows 59a, 59b; `BATCH_CATALOG`; `PHASE_HISTORY`; `CC_B_SESSION_TASK_LIST`; `MEMORY_CC_B`. Tier ledger in §7.

## 7. Tier ledger (CHANGE-CLASS: `architecture`) *(as of the progress report; the close's ledger is §5 at the top)*
| tier | document | verdict | line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | entry: open, in observation |
| T1 | `PHASE_HISTORY.md` | ✅ | entry: open |
| T1 | `SPRINT_TO_LIVE_PLAN.md` | ✅ | row 59a → observation; row 59b carries the crypto rider |
| T1 | shared `MEMORY.md` + `MEMORY_CC_B.md` | N/A + ✅ | no shared truth changed; my position block |
| T1 | the batch `SCOPE` | ✅ | r3, approved |
| T1 | the batch `PRE_AUDIT` | ✅ | approved, conditions recorded |
| T1 | `COMPLETION_REPORT` | — | this progress report, converted at close |
| T1 | the four session task lists | ✅ mine / N/A ×3 | 59a moved to open-and-stalled |
| T1 | Langston's `MEMORY.md` | his | asked |
| T2 | `SYSTEM_MANUAL.md` | ✅ | `:720` the arm + its relation to `entryArm` + read state + crypto rider |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | fill-time checks entry: `consumptionArm` on both archive rows |
| T2 | `RUNNING_ISSUES.md` | ✅ | `#1183` annotated (numbers, arm split, rider) |
| T2 | `CHANGES_AND_FIXES.md` | N/A | no bug fixed; a measurement field added |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | `#372` already holds the recalibration |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no parameter changed |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | N/A | one JSONB key on an existing table |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | not the VTS; working list unaffected |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | N/A | method unchanged |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | reviewer build unchanged |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no rule change |
