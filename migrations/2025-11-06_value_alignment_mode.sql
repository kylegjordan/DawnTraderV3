-- Phase 3B: Value Alignment Matrix - Single-Tenant Migration
-- Migrate value_alignment_matrix from user_id to mode-based architecture
-- Date: 2025-11-06
-- Description: Remove user_id column, add mode column for paper/live isolation

-- =====================================================
-- STEP 1: Add mode column (nullable first to allow data)
-- =====================================================

ALTER TABLE value_alignment_matrix
ADD COLUMN IF NOT EXISTS mode trading_mode;

-- =====================================================
-- STEP 2: Migrate existing data to mode = 'paper' (default)
-- =====================================================

-- Set all existing records to 'paper' mode
-- (In a multi-user system, this would involve more complex logic,
--  but for single-tenant, we default to paper mode)
UPDATE value_alignment_matrix
SET mode = 'paper'::trading_mode
WHERE mode IS NULL;

-- =====================================================
-- STEP 3: Make mode column NOT NULL
-- =====================================================

ALTER TABLE value_alignment_matrix
ALTER COLUMN mode SET NOT NULL;

-- =====================================================
-- STEP 4: Drop old user_id-based index
-- =====================================================

DROP INDEX IF EXISTS idx_value_alignment_matrix_user;

-- =====================================================
-- STEP 5: Create new mode-based index
-- =====================================================

CREATE INDEX IF NOT EXISTS value_alignment_matrix_mode_objective_idx
ON value_alignment_matrix(mode, objective_name);

-- =====================================================
-- STEP 6: Drop user_id column
-- =====================================================

-- Drop the foreign key constraint first
ALTER TABLE value_alignment_matrix
DROP CONSTRAINT IF EXISTS value_alignment_matrix_user_id_fkey;

-- Drop the user_id column
ALTER TABLE value_alignment_matrix
DROP COLUMN IF EXISTS user_id;

-- =====================================================
-- VERIFICATION QUERY (commented out - for manual testing)
-- =====================================================
-- SELECT 
--   COUNT(*) as total_records,
--   mode,
--   COUNT(DISTINCT objective_name) as distinct_objectives
-- FROM value_alignment_matrix
-- GROUP BY mode;

-- =====================================================
-- MIGRATION COMPLETE
-- =====================================================
-- Changes applied:
-- ✓ user_id column removed
-- ✓ mode column added (trading_mode enum: 'paper' | 'live')
-- ✓ Existing data migrated to 'paper' mode
-- ✓ Indexes updated for mode-based queries
-- ✓ Foreign key constraint removed
-- =====================================================
