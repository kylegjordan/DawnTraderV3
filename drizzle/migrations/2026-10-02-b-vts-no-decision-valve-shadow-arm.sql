-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-10-02 — B-VTS-NO-DECISION-VALVE (row 3n.q3, P5 / OBJ-2): the booking arm on the shadow sink
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plan: Claude Comms and Packages/Scope Files/B_VTS_NO_DECISION_VALVE_PRE_AUDIT.md (Step 2 approved, P5 + C7)
--
-- One nullable column, `exit_booking_arm varchar(16)`, on `rtb_shadow_pairings`: HOW the shadow close was booked —
-- `bid` (priced on the bid), `clamp_no_bid` (a live mark, no usable bid) or `clamp_no_mark` (no live mark). The two
-- clamp arms are UNPRICED closes (`close_reason = 'timeout_unpriced'`, exit/P&L/R NULL). A column, not a suffix on
-- `close_reason`: the reason and the arm are two facts, and one string would pool them.
--
-- ⛔ C7 (Langston): NULL MEANS "WRITTEN BEFORE THE ARM WAS RECORDED" — every row closed before this deploy. It is
-- NEVER an arm, and no reader may treat it as one. The column's only constraint is the TypeScript union in
-- `server/core/trading/vts-exit-booking.ts` (`VtsBookingArm`).
--
-- METADATA-ONLY: a nullable column with no default rewrites no rows. `lock_timeout` so it fails fast rather than
-- queue behind a shadow write; a timeout stops `db:migrate`, and `dt-deploy` stops before the restart.
--
-- Rollback: 2026-10-02-b-vts-no-decision-valve-shadow-arm-rollback.sql (IN git, beside this file; never in MANIFEST.txt).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE rtb_shadow_pairings ADD COLUMN IF NOT EXISTS exit_booking_arm VARCHAR(16);

COMMENT ON COLUMN rtb_shadow_pairings.exit_booking_arm IS
  'B-VTS-NO-DECISION-VALVE (3n.q3): how the shadow close was booked - bid | clamp_no_bid | clamp_no_mark; the clamp arms are unpriced closes (timeout_unpriced). NULL = written before 2026-10-02, never an arm.';

COMMIT;
