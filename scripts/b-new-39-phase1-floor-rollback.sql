-- ══════════════════════════════════════════════════════════════════════════════
-- B-NEW-39 Phase 1 — Rollback (revert floor 0.45 → 0.20)
-- ══════════════════════════════════════════════════════════════════════════════
--
-- Restores the B70.3b visibility-window override (floor = 0.20). Use ONLY if
-- post-Phase-1 forensic verification shows degradation worse than pre-fix
-- baseline (per Langston Concern A/D rollback policy: human-gated, not
-- automated).
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE module_constants
SET value = '0.20'::jsonb,
    updated_at = NOW(),
    updated_by = 'b-new-39-phase1-floor-rollback'
WHERE module_name = 'regime_classifier'
  AND constant_name = 'b67_5_post_composition_floor'
  AND value::text = '0.45';

SELECT 'ROLLBACK STATE' AS phase, module_name, constant_name, value, updated_at, updated_by
FROM module_constants
WHERE module_name = 'regime_classifier'
  AND constant_name = 'b67_5_post_composition_floor';

COMMIT;
