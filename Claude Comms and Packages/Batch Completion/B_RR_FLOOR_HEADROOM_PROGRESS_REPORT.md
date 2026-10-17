# B-RR-FLOOR-HEADROOM — PROGRESS REPORT — OPEN — waiting on the pre-registered 21-day read of the fill-time RR check (window from 2026-10-17T13:03:42Z)

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

## 3. ⛔ THE PRE-REGISTERED CLOSE CRITERION — verbatim from the approved scope (objective 2), written before the data
- **Population:** `signal_eval_archive`, `source='active-execution-engine'`, `mode='paper_sim'`, `reject_stage='admitted'`, `gate_decision.entryArm='taker'`, `rrFill` non-null, **and `gate_decision ? 'consumptionArm'`** (key-present — Step-2 C2; an absent key never reads as `direct_taker`), from **2026-10-17T13:03:42Z** for **21 days** (to **2026-11-07T13:03:42Z**), ending earlier only when BOTH: rule (a) is evaluable (qualifying cells, each with ≥ 5 positive-`adverseR` fills, together covering ≥ 50 % of graded opens) **and** the `direct_taker` arm has ≥ 20 graded opens. At 30 graded opens per class rule (b)'s cost figures are first REPORTED (interim, not the end).
- **Denominator:** graded admitted takers. `entry_fill` rows are counted and reported beside it, never in it — **positive control (Step-2 C1): the `entry_fill` count is non-zero in the window and zero after the filter.** The pre-deploy taker rows the key test drops are counted and printed.
- **Rule (b):** would-refuse ≤ 5 % per class, with ≥ 20 graded opens in the `direct_taker` arm; under 20 ⇒ **INSUFFICIENT, never PASS**. Both arms' rates reported; the pooled rate is the live **cost**, not evidence the floor is safe.
- **Rule (a):** a cell (strategy × floor) qualifies with ≥ 5 graded opens and ≥ 5 positive-`adverseR` fills; in a qualifying cell the **nearest-rank** p90 of positive `adverseR` must not exceed `s* = (RR − floor)/(1 + floor)`. INSUFFICIENT if no cell qualifies, the class's positive-adverse population is under 5, or qualifying cells cover under 50 % — never PASS by absence. Coverage per cell stated. (Buy-only path: adverse = fill above intended.)
- **Both PASS ⇒ that class goes live** (a follow-up step in this batch: `would_refuse` → `refused`, tested). **FAIL or INSUFFICIENT ⇒ shadow stays**, numbers on `#1183`, re-home to `#372`. Crypto: INSUFFICIENT by policy while `maker_only` holds; a move to `maker_preferred` (row 59b) returns the crypto taker path with the shadow unpromoted and starts crypto's own read at that change.
- **Reported beside the slip figures:** the realised `close_reason` split of the graded takers, and the three refusal-burden figures (graded would-refuse; refused by the ask-through-stop guard; both).
- **Prediction, stated before the data:** ~15 xStock sessions ⇒ ~300 graded opens, ~10 positive slips at today's rate; if slips accrue, rule (a) most likely FAILS (ORCL slipped 58× its cell's s*); else INSUFFICIENT; the direct-taker gate may not clear (3 graded direct takers in the pre-registered sample, all within 70 minutes).

## 4. The read — carried by alert, and its SQL
- **Alert `07df291f-6351-4385-887b-bc6bc7ae3d21`:** fires 2026-10-24T13:00Z (interim: arm split, counts, cost figures), re-minted weekly until the window closes at 2026-11-07T13:03:42Z or both early-stop conditions hold.
- **SQL** (the read of record runs exactly this, reading the archive only):
```sql
WITH w AS (
  SELECT asset_class, strategy, reject_stage, gate_decision g
  FROM signal_eval_archive
  WHERE source = 'active-execution-engine' AND mode = 'paper_sim'
    AND captured_at >= '2026-10-17 13:03:42Z')
SELECT asset_class,
  count(*) FILTER (WHERE reject_stage = 'entry_fill')                                            AS entry_fill_rows,        -- C1 control: > 0
  count(*) FILTER (WHERE reject_stage = 'admitted' AND g->>'entryArm' = 'taker' AND NOT g ? 'consumptionArm') AS taker_rows_without_key, -- C2: printed, dropped
  count(*) FILTER (WHERE reject_stage = 'admitted' AND g->>'entryArm' = 'taker' AND g ? 'consumptionArm' AND g->>'rrFill' IS NOT NULL) AS graded,
  count(*) FILTER (WHERE reject_stage = 'admitted' AND g ? 'consumptionArm' AND g->>'rrFill' IS NOT NULL AND g->>'consumptionArm' = 'direct_taker') AS graded_direct,
  count(*) FILTER (WHERE reject_stage = 'admitted' AND g ? 'consumptionArm' AND g->>'rrFill' IS NOT NULL AND g->>'rrWouldRefuse' = 'true') AS would_refuse,
  count(*) FILTER (WHERE reject_stage = 'admitted' AND g ? 'consumptionArm' AND (g->>'adverseR')::float8 > 0) AS positive_slips
FROM w GROUP BY 1;
-- then per cell (strategy × rrFloor) and per arm the same counts, the nearest-rank p90 of positive adverseR,
-- and the close_reason split by joining closed_trades on the archive's rtbQueueId → the trade.
```

## 4b. Step 7 — the arms EXPECTED, written before Monday's session (Langston Step-8 instruction, 2026-10-17 ~14:15Z)
Written before any post-deploy taker opens exists (crypto `maker_only`, xStock shut since Friday 20:00 ET):
- **Every** admitted xStock taker row from 2026-10-17T13:03:42Z carries `consumptionArm` — **0** taker rows without the key after the deploy (a non-zero count is a defect, not a warm-up).
- **The mix, expected from the pre-registered sample (22 `maker_to_taker` / 3 `direct_taker` of 25 known):** `maker_to_taker` the large majority (~85-90 % of opens), `direct_taker` a handful — at today's rate **0-5 direct takers in Monday's regular session**. A Monday with **zero** `direct_taker` rows does not prove the direct branch stamps; a Monday with zero `maker_to_taker` rows would contradict the sample and is reported as such.
- Each row's `consumptionArm` equals its own `[CONSUMPTION_PASS] arm=` line (archive → log; a log line without a row is the TCL-blocked case, not an orphan).
- Crypto: **no** taker rows at all while `maker_only` holds.

## 5. Unproven, stated as unproven
- That the `maker_to_taker` arm stamps correctly in a live open — not exercisable until a maker cannot rest.
- That 21 days yields enough direct takers or adverse slips to decide anything.

## 6. Governance files changed so far
Scope; pre-audit; this progress report; `SYSTEM_IMPACT_MAP` (fill-time checks entry — `consumptionArm` on both archive rows); `SYSTEM_MANUAL` (`:720` — the arm, the two arm fields' relation, the read's state, the crypto rider); `RUNNING_ISSUES` `#1183`; `SPRINT_TO_LIVE_PLAN` rows 59a, 59b; `BATCH_CATALOG`; `PHASE_HISTORY`; `CC_B_SESSION_TASK_LIST`; `MEMORY_CC_B`. Tier ledger in §7.

## 7. Tier ledger (CHANGE-CLASS: `architecture`)
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
