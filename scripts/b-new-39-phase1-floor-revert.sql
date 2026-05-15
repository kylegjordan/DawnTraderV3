-- ══════════════════════════════════════════════════════════════════════════════
-- B-NEW-39 Phase 1 — Floor revert
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Reverts `module_constants.regime_classifier.b67_5_post_composition_floor`
-- from 0.20 (set by B70.3b 2026-05-05 as visibility-window override) to 0.45
-- (the original pre-B70.3b production value).
--
-- B70.3b's change log explicitly named 0.45 as the revert target: "until B67.5
-- lands and re-tunes based on real distribution data" (SIM §B70.3b line 1246).
--
-- Per B-NEW-37 forensic (FINDING-2026-05-15-A): 15.4% of post-modulation
-- confidence values are pinned at exactly 0.200, with pinned-trades WR 34.5%
-- vs free-floating WR 23.6% — the floor is actively contributing to the b76
-- confidence-inversion at the top decile.
--
-- Per B-NEW-39 Step 1+2 Langston review APPROVE (2026-05-15/16): 0.45 is the
-- correct target — peer-floor-consistent (`pattern_pool_gates.final_score_floor
-- = 0.45`), as-shipped production value, named explicitly in B70.3b commit log.
-- Code default 0.40 at signal-orchestrator.ts:943-944 is a cold-start fallback,
-- not a configured production value.
--
-- Rollback: `scripts/b-new-39-phase1-floor-rollback.sql`.
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Pre-update snapshot
SELECT 'PRE-UPDATE STATE' AS phase,
       module_name, constant_name, exchange, asset_class, strategy, regime,
       value, updated_at, updated_by
FROM module_constants
WHERE module_name = 'regime_classifier'
  AND constant_name = 'b67_5_post_composition_floor';

-- Apply the revert (wildcard scope; value as JSONB numeric)
UPDATE module_constants
SET value = '0.45'::jsonb,
    updated_at = NOW(),
    updated_by = 'b-new-39-phase1-floor-revert'
WHERE module_name = 'regime_classifier'
  AND constant_name = 'b67_5_post_composition_floor'
  AND value::text = '0.20';

-- Verify exactly 1 row updated (wildcard scope was the only matching row)
SELECT 'POST-UPDATE STATE' AS phase,
       module_name, constant_name, exchange, asset_class, strategy, regime,
       value, updated_at, updated_by
FROM module_constants
WHERE module_name = 'regime_classifier'
  AND constant_name = 'b67_5_post_composition_floor';

COMMIT;

-- Note: getConstant cache TTL is 60s (module-constants-service.ts:51). New
-- signal emissions will pick up floor=0.45 within ~60s of this UPDATE
-- completing. Verification via B-NEW-37 forensic CLI with `--since=<update_ts>`
-- filter after ~1-2 hours of natural emission accumulation.
