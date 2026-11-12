-- B-CRON-MISSED-CATCHUP rollback.
-- Refuse destructive rollback once any production occurrence evidence exists.

BEGIN;

DO $$
DECLARE occurrence_rows bigint;
BEGIN
  IF to_regclass('public.scheduled_job_occurrences') IS NULL THEN
    RETURN;
  END IF;

  SELECT count(*) INTO occurrence_rows FROM scheduled_job_occurrences;
  IF occurrence_rows <> 0 THEN
    RAISE EXCEPTION
      'B-CRON-MISSED-CATCHUP rollback refused: scheduled_job_occurrences contains % durable row(s)',
      occurrence_rows;
  END IF;

  DROP TABLE scheduled_job_occurrences;
END $$;

COMMIT;
