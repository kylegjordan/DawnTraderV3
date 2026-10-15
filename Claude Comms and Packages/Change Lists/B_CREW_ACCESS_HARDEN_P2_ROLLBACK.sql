\set ON_ERROR_STOP on

BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '10s';
LOCK TABLE public.users IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE crew_access_rollback_before ON COMMIT DROP AS
SELECT id, username, role, is_admin
FROM public.users
WHERE username IN ('kylegjordan', 'testuser', 'testuser123');

CREATE TEMP TABLE crew_admin_rollback_before ON COMMIT DROP AS
SELECT id, username, role
FROM public.users
WHERE is_admin IS TRUE;

DO $crew_access_rollback$
DECLARE
  changed_rows integer;
BEGIN
  IF current_database() <> 'postgres'
     OR current_user <> 'postgres'
     OR to_regclass('public.users') IS NULL THEN
    RAISE EXCEPTION 'crew access rollback destination precondition failed';
  END IF;

  IF (SELECT count(*) FROM crew_access_rollback_before) <> 3 THEN
    RAISE EXCEPTION 'crew access rollback precondition failed: expected exactly three named rows';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM crew_access_rollback_before
    WHERE id = '56523b4f-d5b4-412a-bd5c-d12ddc09d50f'
      AND username = 'kylegjordan' AND role = 'owner' AND is_admin IS TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM crew_access_rollback_before
    WHERE id = '05066a82-5317-4490-8867-805acc4c609e'
      AND username = 'testuser' AND role = 'owner' AND is_admin IS TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM crew_access_rollback_before
    WHERE id = '6c591801-3072-431d-b192-30aaf426f15e'
      AND username = 'testuser123' AND role = 'editor' AND is_admin IS FALSE
  ) THEN
    RAISE EXCEPTION 'crew access rollback precondition failed: named population differs';
  END IF;

  IF (SELECT count(*) FROM crew_admin_rollback_before) <> 2 OR NOT EXISTS (
    SELECT 1 FROM crew_admin_rollback_before
    WHERE id = '56523b4f-d5b4-412a-bd5c-d12ddc09d50f'
      AND username = 'kylegjordan' AND role = 'owner'
  ) OR NOT EXISTS (
    SELECT 1 FROM crew_admin_rollback_before
    WHERE id = '05066a82-5317-4490-8867-805acc4c609e'
      AND username = 'testuser' AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'crew access rollback precondition failed: complete administrator population differs';
  END IF;

  UPDATE public.users
  SET is_admin = TRUE
  WHERE id = '6c591801-3072-431d-b192-30aaf426f15e'
    AND username = 'testuser123'
    AND role = 'editor'
    AND is_admin IS FALSE;
  GET DIAGNOSTICS changed_rows = ROW_COUNT;

  IF changed_rows <> 1 THEN
    RAISE EXCEPTION 'crew access rollback failed: expected exactly one changed row';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.users AS current_row
    JOIN crew_access_rollback_before AS before_row USING (id)
    WHERE current_row.id <> '6c591801-3072-431d-b192-30aaf426f15e'
      AND ROW(current_row.username, current_row.role, current_row.is_admin)
          IS DISTINCT FROM
          ROW(before_row.username, before_row.role, before_row.is_admin)
  ) OR NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '6c591801-3072-431d-b192-30aaf426f15e'
      AND username = 'testuser123' AND role = 'editor' AND is_admin IS TRUE
  ) THEN
    RAISE EXCEPTION 'crew access rollback postcondition failed';
  END IF;

  IF (SELECT count(*) FROM public.users WHERE is_admin IS TRUE) <> 3 OR NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '56523b4f-d5b4-412a-bd5c-d12ddc09d50f'
      AND username = 'kylegjordan' AND role = 'owner' AND is_admin IS TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '05066a82-5317-4490-8867-805acc4c609e'
      AND username = 'testuser' AND role = 'owner' AND is_admin IS TRUE
  ) OR NOT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = '6c591801-3072-431d-b192-30aaf426f15e'
      AND username = 'testuser123' AND role = 'editor' AND is_admin IS TRUE
  ) THEN
    RAISE EXCEPTION 'crew access rollback postcondition failed: complete administrator population differs';
  END IF;
END
$crew_access_rollback$;

SELECT phase, id, username, role, is_admin
FROM (
  SELECT 0 AS phase_order, 'before_rollback' AS phase, id, username, role, is_admin
  FROM crew_access_rollback_before
  UNION ALL
  SELECT 1 AS phase_order, 'after_rollback' AS phase, id, username, role, is_admin
  FROM public.users
  WHERE username IN ('kylegjordan', 'testuser', 'testuser123')
) AS evidence
ORDER BY phase_order, username;

COMMIT;
