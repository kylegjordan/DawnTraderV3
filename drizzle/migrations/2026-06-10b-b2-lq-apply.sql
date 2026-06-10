-- B.2 APPLY — xStock LQ (liquidity) floor point-tighten: lq_min 43 -> 38 (22 main paths)
-- + strong_trend companion -> 33 (relational: max(30, main - 5)).
--
-- GATE SATISFIED (this was the apply precondition): >= 5 true-RTH sessions of depth.
-- Recheck 2026-06-10 (window 2026-06-03 -> 2026-06-10, five true US-RTH sessions,
-- 485 symbols, 180,959 symbol x 20-min-median observations, 55,230 RTH):
--   cand 43 (~$19,952 ask-depth): RTH pass 32.44% | names admitted majority-of-buckets 128/485 (26.39%)
--   cand 38 (~$6,309  ask-depth): RTH pass 88.60% | names admitted majority-of-buckets 433/485 (89.28%)
--   RTH ask-depth distribution: p10 $5,709 | p25 $9,681 | p50 $14,708 | p75 $23,032 | p90 $36,806
-- 38's implied floor sits AT the thin-book boundary (p10) — the lens target (ADJUSTMENT_FRAMEWORK
-- §1.1 axiom 6: filter books too thin for a clean fill; reject rate is an output, not a target).
-- The 2-day pre-check (2026-06-02) said 432/485; five-session data says 433/485 — stable.
-- Kyle GO recorded 2026-06-09 (conditional on this recheck confirming 38); Langston guardrail
-- stands: do NOT go below ~38 until the Phase-25 position-size anchor is set.
--
-- strong_trend companion (CC+Langston, Kyle GO same decision): the two strong_trend lanes
-- (paper vts_strong_trend 30 / live active_strong_trend 35) were crypto-clone artifacts with
-- no relational contract. They become max(30, main - 5) = 33 — DELIBERATELY looser than main
-- (strong_trend's tighter DI/regime gating earns a thinner-book allowance) and now MOVE WITH
-- main instead of drifting independently. Ordering strong_trend < main preserved (Q4 holds).
--
-- Scoreboard: 'imf · 22 paths' proposed -> applied. planned_result stays NULL here — the
-- matched-denominator number is the live per-family LQ-reject (num/den like 34,285/56,725),
-- which only exists after this change runs in the eval loop; the post-deploy load sanity
-- fills it (expected admitted-names ratio ~3.4x from the recheck).
--
-- Rollback: 2026-06-10b-b2-lq-apply-rollback.sql (operator-only, not in MANIFEST).

BEGIN;

-- 1) The 22 main family/pattern paths (paper+live x trend/reversal/breakout/oscillator/
--    pattern/quant active+vts minus the NULL-lq quant rows): 43 -> 38.
UPDATE screener_filters
SET lq_min = 38,
    last_updated_by = 'b2-lq-apply-2026-06-10',
    updated_at = NOW()
WHERE asset_class = 'xstock_spot'
  AND lq_min = 43;

-- 2) strong_trend companion: both lanes -> 33 = max(30, 38 - 5).
UPDATE screener_filters
SET lq_min = 33,
    last_updated_by = 'b2-lq-apply-2026-06-10',
    updated_at = NOW()
WHERE asset_class = 'xstock_spot'
  AND filter_path IN ('vts_strong_trend', 'active_strong_trend')
  AND lq_min IN (30, 35);

-- 3) Scoreboard: main row proposed -> applied (current_* stays = the 43-era "before").
UPDATE calibration_ledger
SET status = 'applied',
    notes = COALESCE(notes, '') || ' APPLIED 2026-06-10 after 5-session true-RTH recheck (06-03..06-10): cand38 RTH pass 88.60%, names 433/485 vs cand43 128/485. planned_result = live per-family LQ-reject, fills at post-deploy load sanity.',
    updated_at = NOW()
WHERE asset_class = 'xstock_spot'
  AND sub_batch = 'B.0'
  AND setting_key = 'lq_min'
  AND scope = 'imf · 22 paths';

-- 4) Scoreboard: strong_trend rows get their planned side + applied in the same step.
UPDATE calibration_ledger
SET planned_value = '33',
    planned_sub_batch = 'B.2',
    status = 'applied',
    notes = COALESCE(notes, '') || ' APPLIED 2026-06-10: relational companion max(30, main-5)=33; moves with main from now on.',
    updated_at = NOW()
WHERE asset_class = 'xstock_spot'
  AND sub_batch = 'B.0'
  AND setting_key = 'lq_min'
  AND scope IN ('imf · active_strong_trend', 'imf · vts_strong_trend');

COMMIT;
