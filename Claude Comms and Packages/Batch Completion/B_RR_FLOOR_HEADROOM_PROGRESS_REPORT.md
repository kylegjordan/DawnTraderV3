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
    ((f.g->>'targetPrice')::numeric - (f.g->>'intendedEntryPrice')::numeric)
      / NULLIF((f.g->>'intendedEntryPrice')::numeric - (f.g->>'stopPrice')::numeric, 0) AS rr_plan,
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
  percentile_disc(0.9) WITHIN GROUP (ORDER BY gr.adv) FILTER (WHERE gr.adv > 0) AS p90_positive_adverse_r,  -- percentile_disc = nearest-rank
  min((gr.rr_plan - gr.floor) / (1 + gr.floor))                  AS s_star_min,
  max((gr.rr_plan - gr.floor) / (1 + gr.floor))                  AS s_star_max,
  count(*) FILTER (WHERE gr.adv > (gr.rr_plan - gr.floor) / (1 + gr.floor)) AS slips_over_own_s_star,
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
- ⚠️ **OPEN FOR LANGSTON BEFORE THE 10-24 FIRE — `s*` is not a cell constant.** The control run shows the planned RR varies inside a cell: vwap_pullback `s*` runs **0.0133 → 1.33** (rows whose target sits far above the floor's RR). The scope's 0.0135 R is the cell's **minimum**. **Pre-registered default, stated now: the cell's bound is `s_star_min` (the strictest, the scope's own figure); `s_star_max` and `slips_over_own_s_star` (each slip against its own row's bound) print beside it** so the spread is visible. If Langston rules the per-row form instead, it is recorded here before the first fire.
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
