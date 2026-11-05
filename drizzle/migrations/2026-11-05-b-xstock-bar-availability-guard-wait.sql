-- B-XSTOCK-BAR-AVAILABILITY Step 9 R6a (C5): time the certify function's wait for the singleton
-- clock-guard lock, server-side, without changing the function's signature.
-- The function takes clock_timestamp() just before the singleton FOR UPDATE and, after its existing
-- observed_at := clock_timestamp(), stores observed_at - pre_lock (ms) in the transaction-local
-- setting xstock_bar.guard_wait_ms. The writer reads current_setting('xstock_bar.guard_wait_ms', true)
-- in the same bounded transaction. CREATE OR REPLACE with an unchanged RETURNS TABLE: no DROP of a
-- function the live writer calls about every 5 s. Certification semantics are unchanged.
-- The body is the 2026-10-14 capture migration's, verified equal to the live definition on
-- 2026-11-05 (pg_get_functiondef), plus the three marked lines.

CREATE OR REPLACE FUNCTION certify_xstock_bar_revision_events(
  p_revision_ids uuid[],
  p_contract_version text
)
RETURNS TABLE (
  revision_id uuid,
  visible_by timestamptz,
  visible_seq bigint,
  certificate_primary_identity text
)
LANGUAGE plpgsql
AS $$
DECLARE
  observed_at timestamptz;
  primary_id text;
  prior_clock timestamptz;
  pre_lock timestamptz;
  expected_count integer;
  matched_count integer;
BEGIN
  IF p_contract_version IS DISTINCT FROM 'xstock-bar-availability/v1' THEN
    RAISE EXCEPTION 'unsupported xstock bar availability contract: %', p_contract_version;
  END IF;
  IF pg_is_in_recovery() THEN
    RAISE EXCEPTION 'xstock visibility certification refused on a recovery/replica server';
  END IF;
  SELECT count(DISTINCT u.revision_id) INTO expected_count
    FROM unnest(p_revision_ids) AS u(revision_id);
  IF expected_count = 0 OR expected_count <> cardinality(p_revision_ids) THEN
    RAISE EXCEPTION 'xstock visibility certification requires a non-empty unique ID set';
  END IF;

  primary_id := current_database() || '@' || COALESCE(inet_server_addr()::text, 'local') || ':'
    || COALESCE(inet_server_port()::text, 'local') || '/system:'
    || (SELECT system_identifier::text FROM pg_control_system());
  -- R6a guardWaitMs: the clock just before the singleton lock; the wait is observed_at - pre_lock.
  pre_lock := clock_timestamp();
  SELECT last_observed_at INTO prior_clock
    FROM xstock_bar_clock_guard WHERE singleton = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'xstock bar clock guard row missing';
  END IF;
  observed_at := clock_timestamp();
  -- Transaction-local, so only this transaction's caller can read it (current_setting, same transaction).
  -- ⛔ FORWARD-BINDING (Langston): do NOT add an EXCEPTION handler or a function-level SET clause to this
  -- function. A plpgsql EXCEPTION block runs in a subtransaction and would roll this setting back; a SET
  -- clause restores settings at exit. Either silently reverts the guard wait, and nothing would notice.
  PERFORM set_config('xstock_bar.guard_wait_ms',
    round(extract(epoch FROM (observed_at - pre_lock)) * 1000)::text, true);
  IF observed_at < prior_clock THEN
    RAISE EXCEPTION 'xstock bar database clock regression: observed %, prior %', observed_at, prior_clock;
  END IF;

  SELECT count(*) INTO matched_count
    FROM xstock_bar_revision_event e
    WHERE e.revision_id = ANY(p_revision_ids)
      AND e.contract_version = p_contract_version;
  IF matched_count <> expected_count THEN
    RAISE EXCEPTION 'xstock visibility certificate exact-ID mismatch: expected %, matched %',
      expected_count, matched_count;
  END IF;

  UPDATE xstock_bar_clock_guard SET
    last_observed_at = observed_at,
    primary_identity = primary_id,
    contract_version = p_contract_version,
    updated_at = clock_timestamp()
  WHERE singleton = true;

  UPDATE xstock_bar_revision_event e SET
    visible_by = observed_at,
    visible_seq = nextval('xstock_bar_visible_seq'),
    certificate_primary_identity = primary_id,
    certificate_clock_healthy = true
  WHERE e.revision_id = ANY(p_revision_ids)
    AND e.contract_version = p_contract_version
    AND e.visible_by IS NULL;

  RETURN QUERY
    SELECT e.revision_id, e.visible_by, e.visible_seq, e.certificate_primary_identity
    FROM xstock_bar_revision_event e
    WHERE e.revision_id = ANY(p_revision_ids)
      AND e.contract_version = p_contract_version
      AND e.visible_by IS NOT NULL
    ORDER BY e.revision_id;
END $$;
