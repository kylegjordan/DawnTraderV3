-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.CONFIDENCE-CHAIN — ROLLBACK for 2026-05-25 per-class seed migration
-- ════════════════════════════════════════════════════════════════════════════
-- Removes all xstock_spot rows seeded by the matching forward migration plus
-- the two new global flag constants (b67_1_asset_class_no_op_active +
-- b68_3_compute_correlation_enabled).
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Delete xstock_spot rows for all 9 modulator modules
DELETE FROM module_constants
WHERE asset_class = 'xstock_spot'
  AND module_name IN (
    'macro_modifier', 'regime_phase', 'regime_classifier', 'outcome_feedback',
    'regime_age', 'path_b_sustainability', 'volume_regime', 'pair_correlation',
    'multi_tf_agreement'
  )
  AND updated_by LIKE 'b79.0n.confidence-chain-seed%';

-- Delete the two new global flag constants
DELETE FROM module_constants
WHERE constant_name IN ('b67_1_asset_class_no_op_active', 'b68_3_compute_correlation_enabled')
  AND updated_by LIKE 'b79.0n.confidence-chain-seed%';

COMMIT;
