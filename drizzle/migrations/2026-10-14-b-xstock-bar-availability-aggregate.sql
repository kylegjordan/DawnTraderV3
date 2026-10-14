-- B-XSTOCK-BAR-AVAILABILITY, Step 3 / aggregate layer (P5-P7).
--
-- Add immutable 15m/60m aggregate revisions, a primary read-observation clock,
-- and availability pointers on the existing snapshot tables. Existing snapshot
-- rows remain explicitly legacy/unknown until rebuilt from certified revisions.

CREATE SEQUENCE IF NOT EXISTS xstock_bar_read_observed_seq AS bigint;

CREATE TABLE IF NOT EXISTS xstock_bar_aggregate_revision (
  aggregate_revision_id uuid NOT NULL DEFAULT gen_random_uuid(),
  bucket_ts timestamptz NOT NULL,
  symbol text NOT NULL,
  interval_minutes smallint NOT NULL CHECK (interval_minutes IN (15, 60)),
  open numeric(20,8) NOT NULL,
  high numeric(20,8) NOT NULL,
  low numeric(20,8) NOT NULL,
  close numeric(20,8) NOT NULL,
  volume numeric(28,8) NOT NULL,
  source_bar_count integer NOT NULL CHECK (source_bar_count > 0),
  source_revision_ids uuid[] NOT NULL CHECK (cardinality(source_revision_ids) > 0),
  source_revision_set_hash text NOT NULL CHECK (source_revision_set_hash ~ '^[0-9a-f]{64}$'),
  source_max_visible_by timestamptz NOT NULL,
  source_max_visible_seq bigint NOT NULL,
  certificate_primary_identity text NOT NULL,
  aggregate_hash text NOT NULL CHECK (aggregate_hash ~ '^[0-9a-f]{64}$'),
  canonical_payload jsonb NOT NULL,
  contract_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (aggregate_revision_id, bucket_ts),
  UNIQUE (symbol, interval_minutes, bucket_ts, aggregate_hash)
) PARTITION BY RANGE (bucket_ts);

CREATE INDEX IF NOT EXISTS idx_xstock_bar_aggregate_revision_lookup
  ON xstock_bar_aggregate_revision (symbol, interval_minutes, bucket_ts DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_xstock_bar_aggregate_revision_source_hash
  ON xstock_bar_aggregate_revision (source_revision_set_hash);

DO $$
DECLARE
  d date;
  child_name text;
BEGIN
  FOR offset_days IN -14..14 LOOP
    d := (clock_timestamp() AT TIME ZONE 'UTC')::date + offset_days;
    child_name := 'xstock_bar_aggregate_revision_' || to_char(d, 'YYYY_MM_DD');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF xstock_bar_aggregate_revision FOR VALUES FROM (%L) TO (%L)',
      child_name, d, d + 1
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION guard_xstock_bar_aggregate_revision_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('dawntrader.archive_mode', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'xstock_bar_aggregate_revision is append-only outside reviewed archive mode';
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'xstock_bar_aggregate_revision rows are immutable';
END $$;

DROP TRIGGER IF EXISTS trg_guard_xstock_bar_aggregate_revision_mutation
  ON xstock_bar_aggregate_revision;
CREATE TRIGGER trg_guard_xstock_bar_aggregate_revision_mutation
BEFORE UPDATE OR DELETE ON xstock_bar_aggregate_revision
FOR EACH ROW EXECUTE FUNCTION guard_xstock_bar_aggregate_revision_mutation();

CREATE OR REPLACE FUNCTION observe_xstock_bar_read(p_contract_version text)
RETURNS TABLE (
  read_observed_at timestamptz,
  read_observed_seq bigint,
  certificate_primary_identity text
)
LANGUAGE plpgsql
AS $$
DECLARE
  observed_at timestamptz;
  observed_seq bigint;
  primary_id text;
  prior_clock timestamptz;
BEGIN
  IF p_contract_version IS DISTINCT FROM 'xstock-bar-availability/v1' THEN
    RAISE EXCEPTION 'unsupported xstock bar availability contract: %', p_contract_version;
  END IF;
  IF pg_is_in_recovery() THEN
    RAISE EXCEPTION 'xstock read observation refused on a recovery/replica server';
  END IF;

  primary_id := current_database() || '@' || COALESCE(inet_server_addr()::text, 'local') || ':'
    || COALESCE(inet_server_port()::text, 'local') || '/system:'
    || (SELECT system_identifier::text FROM pg_control_system());
  observed_at := clock_timestamp();

  SELECT last_observed_at INTO prior_clock
    FROM xstock_bar_clock_guard WHERE singleton = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'xstock bar clock guard row missing';
  END IF;
  IF observed_at < prior_clock THEN
    RAISE EXCEPTION 'xstock bar database clock regression: observed %, prior %', observed_at, prior_clock;
  END IF;

  observed_seq := nextval('xstock_bar_read_observed_seq');
  UPDATE xstock_bar_clock_guard SET
    last_observed_at = observed_at,
    primary_identity = primary_id,
    contract_version = p_contract_version,
    updated_at = clock_timestamp()
  WHERE singleton = true;

  RETURN QUERY SELECT observed_at, observed_seq, primary_id;
END $$;

CREATE OR REPLACE FUNCTION record_xstock_bar_aggregate_revisions(
  p_rows jsonb,
  p_contract_version text
)
RETURNS TABLE (client_key text, aggregate_revision_id uuid)
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  source_ids uuid[];
  found_id uuid;
  found_payload jsonb;
  matched_count integer;
  distinct_count integer;
  source_rows_healthy boolean;
  matched_ordered_source_ids uuid[];
  matched_max_visible_by timestamptz;
  matched_max_visible_seq bigint;
BEGIN
  IF p_contract_version IS DISTINCT FROM 'xstock-bar-availability/v1' THEN
    RAISE EXCEPTION 'unsupported xstock bar availability contract: %', p_contract_version;
  END IF;
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'aggregate revision payload must be a JSON array';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF (item->>'intervalMinutes')::integer NOT IN (15, 60) THEN
      RAISE EXCEPTION 'unsupported xstock aggregate interval: %', item->>'intervalMinutes';
    END IF;
    IF item->>'aggregateHash' !~ '^[0-9a-f]{64}$'
       OR item->>'sourceRevisionSetHash' !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'xstock aggregate revision requires lowercase SHA-256 hashes';
    END IF;
    source_ids := ARRAY(
      SELECT value::uuid FROM jsonb_array_elements_text(item->'sourceRevisionIds')
    );
    IF cardinality(source_ids) = 0 THEN
      RAISE EXCEPTION 'xstock aggregate revision requires source revisions';
    END IF;

    SELECT
      count(*),
      count(DISTINCT e.revision_id),
      bool_and(
        e.symbol = item->>'symbol'
        AND e.projection_applied
        AND e.contract_version = p_contract_version
        AND e.visible_by IS NOT NULL
        AND e.visible_seq IS NOT NULL
        AND e.certificate_clock_healthy
        AND e.certificate_primary_identity = item->>'certificatePrimaryIdentity'
        AND to_timestamp(
          floor(extract(epoch from e.interval_begin)
            / ((item->>'intervalMinutes')::integer * 60))
          * ((item->>'intervalMinutes')::integer * 60)
        ) = (item->>'bucketTs')::timestamptz
      ),
      array_agg(e.revision_id ORDER BY e.interval_begin),
      max(e.visible_by),
      max(e.visible_seq)
      INTO matched_count, distinct_count, source_rows_healthy,
        matched_ordered_source_ids, matched_max_visible_by, matched_max_visible_seq
      FROM xstock_bar_revision_event e
      WHERE e.revision_id = ANY(source_ids);
    IF matched_count <> cardinality(source_ids)
       OR distinct_count <> cardinality(source_ids)
       OR (item->>'sourceBarCount')::integer <> cardinality(source_ids)
       OR matched_ordered_source_ids IS DISTINCT FROM source_ids
       OR source_rows_healthy IS DISTINCT FROM true THEN
      RAISE EXCEPTION 'xstock aggregate source revision exact-set mismatch for %', item->>'clientKey';
    END IF;
    IF matched_max_visible_by IS DISTINCT FROM (item->>'sourceMaxVisibleBy')::timestamptz
       OR matched_max_visible_seq IS DISTINCT FROM (item->>'sourceMaxVisibleSeq')::bigint THEN
      RAISE EXCEPTION 'xstock aggregate source availability mismatch for %', item->>'clientKey';
    END IF;
    IF item->'canonicalPayload' IS DISTINCT FROM jsonb_build_object(
      'symbol', item->>'symbol',
      'intervalMinutes', (item->>'intervalMinutes')::integer,
      'bucketTs', item->>'bucketTs',
      'open', item->>'open',
      'high', item->>'high',
      'low', item->>'low',
      'close', item->>'close',
      'volume', item->>'volume',
      'sourceBarCount', (item->>'sourceBarCount')::integer,
      'sourceRevisionIds', item->'sourceRevisionIds',
      'sourceRevisionSetHash', item->>'sourceRevisionSetHash',
      'sourceMaxVisibleBy', item->>'sourceMaxVisibleBy',
      'sourceMaxVisibleSeq', (item->>'sourceMaxVisibleSeq')::bigint,
      'certificatePrimaryIdentity', item->>'certificatePrimaryIdentity',
      'contractVersion', p_contract_version
    ) THEN
      RAISE EXCEPTION 'xstock aggregate canonical payload mismatch for %', item->>'clientKey';
    END IF;

    INSERT INTO xstock_bar_aggregate_revision (
      bucket_ts, symbol, interval_minutes, open, high, low, close, volume,
      source_bar_count, source_revision_ids, source_revision_set_hash,
      source_max_visible_by, source_max_visible_seq, certificate_primary_identity, aggregate_hash,
      canonical_payload, contract_version
    ) VALUES (
      (item->>'bucketTs')::timestamptz,
      item->>'symbol',
      (item->>'intervalMinutes')::smallint,
      (item->>'open')::numeric,
      (item->>'high')::numeric,
      (item->>'low')::numeric,
      (item->>'close')::numeric,
      (item->>'volume')::numeric,
      (item->>'sourceBarCount')::integer,
      source_ids,
      item->>'sourceRevisionSetHash',
      (item->>'sourceMaxVisibleBy')::timestamptz,
      (item->>'sourceMaxVisibleSeq')::bigint,
      item->>'certificatePrimaryIdentity',
      item->>'aggregateHash',
      item->'canonicalPayload',
      p_contract_version
    )
    ON CONFLICT (symbol, interval_minutes, bucket_ts, aggregate_hash) DO NOTHING;

    SELECT a.aggregate_revision_id, a.canonical_payload
      INTO found_id, found_payload
      FROM xstock_bar_aggregate_revision a
      WHERE a.symbol = item->>'symbol'
        AND a.interval_minutes = (item->>'intervalMinutes')::smallint
        AND a.bucket_ts = (item->>'bucketTs')::timestamptz
        AND a.aggregate_hash = item->>'aggregateHash';
    IF NOT FOUND THEN
      RAISE EXCEPTION 'xstock aggregate revision insert/readback failed for %', item->>'clientKey';
    END IF;
    IF found_payload IS DISTINCT FROM item->'canonicalPayload' THEN
      RAISE EXCEPTION 'xstock aggregate hash collision for %', item->>'clientKey';
    END IF;

    client_key := item->>'clientKey';
    aggregate_revision_id := found_id;
    RETURN NEXT;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS xstock_bar_window_manifest (
  manifest_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  interval_minutes smallint NOT NULL CHECK (interval_minutes IN (15, 60)),
  window_hash text NOT NULL CHECK (window_hash ~ '^[0-9a-f]{64}$'),
  aggregate_revision_ids uuid[] NOT NULL CHECK (cardinality(aggregate_revision_ids) > 0),
  bar_count integer NOT NULL CHECK (bar_count = cardinality(aggregate_revision_ids)),
  first_bucket_ts timestamptz NOT NULL,
  last_bucket_ts timestamptz NOT NULL CHECK (last_bucket_ts >= first_bucket_ts),
  source_max_visible_by timestamptz NOT NULL,
  source_max_visible_seq bigint NOT NULL,
  certificate_primary_identity text NOT NULL,
  canonical_payload jsonb NOT NULL,
  contract_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (symbol, interval_minutes, window_hash)
);

CREATE INDEX IF NOT EXISTS idx_xstock_bar_window_manifest_created
  ON xstock_bar_window_manifest (created_at DESC);

CREATE OR REPLACE FUNCTION guard_xstock_bar_window_manifest_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('dawntrader.archive_mode', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'xstock_bar_window_manifest is append-only outside reviewed archive mode';
    END IF;
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'xstock_bar_window_manifest rows are immutable';
END $$;

DROP TRIGGER IF EXISTS trg_guard_xstock_bar_window_manifest_mutation
  ON xstock_bar_window_manifest;
CREATE TRIGGER trg_guard_xstock_bar_window_manifest_mutation
BEFORE UPDATE OR DELETE ON xstock_bar_window_manifest
FOR EACH ROW EXECUTE FUNCTION guard_xstock_bar_window_manifest_mutation();

CREATE OR REPLACE FUNCTION record_xstock_bar_window_manifest(
  p_manifest jsonb,
  p_contract_version text
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  aggregate_ids uuid[];
  found_id uuid;
  found_payload jsonb;
  matched_count integer;
  distinct_count integer;
  aggregate_rows_healthy boolean;
  ordered_buckets timestamptz[];
  matched_max_visible_by timestamptz;
  matched_max_visible_seq bigint;
BEGIN
  IF p_contract_version IS DISTINCT FROM 'xstock-bar-availability/v1' THEN
    RAISE EXCEPTION 'unsupported xstock bar availability contract: %', p_contract_version;
  END IF;
  IF (p_manifest->>'intervalMinutes')::integer NOT IN (15, 60) THEN
    RAISE EXCEPTION 'unsupported xstock manifest interval: %', p_manifest->>'intervalMinutes';
  END IF;
  IF p_manifest->>'windowHash' !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'xstock window manifest requires a lowercase SHA-256 hash';
  END IF;
  aggregate_ids := ARRAY(
    SELECT value::uuid FROM jsonb_array_elements_text(p_manifest->'aggregateRevisionIds')
  );
  IF cardinality(aggregate_ids) = 0 THEN
    RAISE EXCEPTION 'xstock window manifest requires aggregate revisions';
  END IF;

  SELECT
    count(*),
    count(DISTINCT a.aggregate_revision_id),
    bool_and(
      a.symbol = p_manifest->>'symbol'
      AND a.interval_minutes = (p_manifest->>'intervalMinutes')::smallint
      AND a.certificate_primary_identity = p_manifest->>'certificatePrimaryIdentity'
      AND a.contract_version = p_contract_version
    ),
    array_agg(a.bucket_ts ORDER BY u.ordinality),
    max(a.source_max_visible_by),
    max(a.source_max_visible_seq)
    INTO matched_count, distinct_count, aggregate_rows_healthy, ordered_buckets,
      matched_max_visible_by, matched_max_visible_seq
    FROM unnest(aggregate_ids) WITH ORDINALITY AS u(aggregate_revision_id, ordinality)
    JOIN xstock_bar_aggregate_revision a
      ON a.aggregate_revision_id = u.aggregate_revision_id;
  IF matched_count <> cardinality(aggregate_ids)
     OR distinct_count <> cardinality(aggregate_ids)
     OR aggregate_rows_healthy IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'xstock manifest aggregate exact-set mismatch';
  END IF;
  IF ordered_buckets IS DISTINCT FROM (
       SELECT array_agg(bucket_ts ORDER BY bucket_ts)
       FROM unnest(ordered_buckets) AS ordered(bucket_ts)
     )
     OR ordered_buckets[1] IS DISTINCT FROM (p_manifest->>'firstBucketTs')::timestamptz
     OR ordered_buckets[cardinality(ordered_buckets)]
       IS DISTINCT FROM (p_manifest->>'lastBucketTs')::timestamptz THEN
    RAISE EXCEPTION 'xstock manifest aggregate order/bounds mismatch';
  END IF;
  IF matched_max_visible_by IS DISTINCT FROM (p_manifest->>'sourceMaxVisibleBy')::timestamptz
     OR matched_max_visible_seq IS DISTINCT FROM (p_manifest->>'sourceMaxVisibleSeq')::bigint THEN
    RAISE EXCEPTION 'xstock manifest source availability mismatch';
  END IF;
  IF p_manifest->'canonicalPayload' IS DISTINCT FROM jsonb_build_object(
    'symbol', p_manifest->>'symbol',
    'intervalMinutes', (p_manifest->>'intervalMinutes')::integer,
    'aggregateRevisionIds', p_manifest->'aggregateRevisionIds',
    'firstBucketTs', p_manifest->>'firstBucketTs',
    'lastBucketTs', p_manifest->>'lastBucketTs',
    'sourceMaxVisibleBy', p_manifest->>'sourceMaxVisibleBy',
    'sourceMaxVisibleSeq', (p_manifest->>'sourceMaxVisibleSeq')::bigint,
    'certificatePrimaryIdentity', p_manifest->>'certificatePrimaryIdentity',
    'contractVersion', p_contract_version
  ) THEN
    RAISE EXCEPTION 'xstock manifest canonical payload mismatch';
  END IF;

  INSERT INTO xstock_bar_window_manifest (
    symbol, interval_minutes, window_hash, aggregate_revision_ids, bar_count,
    first_bucket_ts, last_bucket_ts, source_max_visible_by, source_max_visible_seq,
    certificate_primary_identity, canonical_payload, contract_version
  ) VALUES (
    p_manifest->>'symbol',
    (p_manifest->>'intervalMinutes')::smallint,
    p_manifest->>'windowHash',
    aggregate_ids,
    cardinality(aggregate_ids),
    (p_manifest->>'firstBucketTs')::timestamptz,
    (p_manifest->>'lastBucketTs')::timestamptz,
    (p_manifest->>'sourceMaxVisibleBy')::timestamptz,
    (p_manifest->>'sourceMaxVisibleSeq')::bigint,
    p_manifest->>'certificatePrimaryIdentity',
    p_manifest->'canonicalPayload',
    p_contract_version
  )
  ON CONFLICT (symbol, interval_minutes, window_hash) DO NOTHING;

  SELECT m.manifest_id, m.canonical_payload
    INTO found_id, found_payload
    FROM xstock_bar_window_manifest m
    WHERE m.symbol = p_manifest->>'symbol'
      AND m.interval_minutes = (p_manifest->>'intervalMinutes')::smallint
      AND m.window_hash = p_manifest->>'windowHash';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'xstock window manifest insert/readback failed';
  END IF;
  IF found_payload IS DISTINCT FROM p_manifest->'canonicalPayload' THEN
    RAISE EXCEPTION 'xstock window manifest hash collision';
  END IF;
  RETURN found_id;
END $$;

ALTER TABLE xstock_spot_ohlc_15m_snapshot
  ADD COLUMN IF NOT EXISTS aggregate_revision_id uuid,
  ADD COLUMN IF NOT EXISTS aggregate_hash text,
  ADD COLUMN IF NOT EXISTS source_revision_set_hash text,
  ADD COLUMN IF NOT EXISTS source_max_visible_by timestamptz,
  ADD COLUMN IF NOT EXISTS source_max_visible_seq bigint,
  ADD COLUMN IF NOT EXISTS read_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_observed_seq bigint,
  ADD COLUMN IF NOT EXISTS certificate_primary_identity text,
  ADD COLUMN IF NOT EXISTS availability_contract_version text,
  ADD COLUMN IF NOT EXISTS eligibility_state text;

ALTER TABLE xstock_spot_ohlc_60m_snapshot
  ADD COLUMN IF NOT EXISTS aggregate_revision_id uuid,
  ADD COLUMN IF NOT EXISTS aggregate_hash text,
  ADD COLUMN IF NOT EXISTS source_revision_set_hash text,
  ADD COLUMN IF NOT EXISTS source_max_visible_by timestamptz,
  ADD COLUMN IF NOT EXISTS source_max_visible_seq bigint,
  ADD COLUMN IF NOT EXISTS read_observed_at timestamptz,
  ADD COLUMN IF NOT EXISTS read_observed_seq bigint,
  ADD COLUMN IF NOT EXISTS certificate_primary_identity text,
  ADD COLUMN IF NOT EXISTS availability_contract_version text,
  ADD COLUMN IF NOT EXISTS eligibility_state text;

ALTER TABLE xstock_spot_ohlc_15m_snapshot
  DROP CONSTRAINT IF EXISTS xstock_spot_ohlc_15m_snapshot_availability_shape,
  ADD CONSTRAINT xstock_spot_ohlc_15m_snapshot_availability_shape CHECK (
    (aggregate_revision_id IS NULL
      AND aggregate_hash IS NULL
      AND source_revision_set_hash IS NULL
      AND source_max_visible_by IS NULL
      AND source_max_visible_seq IS NULL
      AND read_observed_at IS NULL
      AND read_observed_seq IS NULL
      AND certificate_primary_identity IS NULL
      AND availability_contract_version IS NULL
      AND eligibility_state IS NULL)
    OR
    (aggregate_revision_id IS NOT NULL
      AND aggregate_hash IS NOT NULL
      AND source_revision_set_hash IS NOT NULL
      AND source_max_visible_by IS NOT NULL
      AND source_max_visible_seq IS NOT NULL
      AND read_observed_at IS NOT NULL
      AND read_observed_seq IS NOT NULL
      AND certificate_primary_identity IS NOT NULL
      AND availability_contract_version = 'xstock-bar-availability/v1'
      AND eligibility_state = 'eligible_certified')
  ) NOT VALID;

ALTER TABLE xstock_spot_ohlc_60m_snapshot
  DROP CONSTRAINT IF EXISTS xstock_spot_ohlc_60m_snapshot_availability_shape,
  ADD CONSTRAINT xstock_spot_ohlc_60m_snapshot_availability_shape CHECK (
    (aggregate_revision_id IS NULL
      AND aggregate_hash IS NULL
      AND source_revision_set_hash IS NULL
      AND source_max_visible_by IS NULL
      AND source_max_visible_seq IS NULL
      AND read_observed_at IS NULL
      AND read_observed_seq IS NULL
      AND certificate_primary_identity IS NULL
      AND availability_contract_version IS NULL
      AND eligibility_state IS NULL)
    OR
    (aggregate_revision_id IS NOT NULL
      AND aggregate_hash IS NOT NULL
      AND source_revision_set_hash IS NOT NULL
      AND source_max_visible_by IS NOT NULL
      AND source_max_visible_seq IS NOT NULL
      AND read_observed_at IS NOT NULL
      AND read_observed_seq IS NOT NULL
      AND certificate_primary_identity IS NOT NULL
      AND availability_contract_version = 'xstock-bar-availability/v1'
      AND eligibility_state = 'eligible_certified')
  ) NOT VALID;

CREATE OR REPLACE FUNCTION guard_xstock_snapshot_revision_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  persisted xstock_bar_aggregate_revision%ROWTYPE;
  expected_interval smallint;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.aggregate_revision_id IS NOT NULL THEN
    IF NEW.aggregate_revision_id IS NULL THEN
      RAISE EXCEPTION 'xStock snapshot cannot discard aggregate revision identity';
    END IF;
    IF NEW.aggregate_revision_id IS NOT DISTINCT FROM OLD.aggregate_revision_id
       AND ROW(
         NEW.open, NEW.high, NEW.low, NEW.close, NEW.volume, NEW.source_bar_count,
         NEW.aggregate_hash, NEW.source_revision_set_hash, NEW.source_max_visible_by,
         NEW.source_max_visible_seq, NEW.read_observed_at, NEW.read_observed_seq,
         NEW.certificate_primary_identity, NEW.availability_contract_version,
         NEW.eligibility_state
       ) IS DISTINCT FROM ROW(
         OLD.open, OLD.high, OLD.low, OLD.close, OLD.volume, OLD.source_bar_count,
         OLD.aggregate_hash, OLD.source_revision_set_hash, OLD.source_max_visible_by,
         OLD.source_max_visible_seq, OLD.read_observed_at, OLD.read_observed_seq,
         OLD.certificate_primary_identity, OLD.availability_contract_version,
         OLD.eligibility_state
       ) THEN
      RAISE EXCEPTION 'xStock snapshot revision evidence changed without rotating aggregate revision';
    END IF;
  END IF;

  IF NEW.aggregate_revision_id IS NOT NULL THEN
    expected_interval := CASE
      WHEN TG_TABLE_NAME = 'xstock_spot_ohlc_15m_snapshot' THEN 15
      WHEN TG_TABLE_NAME = 'xstock_spot_ohlc_60m_snapshot' THEN 60
      ELSE NULL
    END;
    SELECT a.* INTO persisted
      FROM xstock_bar_aggregate_revision a
      WHERE a.aggregate_revision_id = NEW.aggregate_revision_id
        AND a.bucket_ts = NEW.bucket_ts;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'xStock snapshot aggregate revision does not exist';
    END IF;
    IF expected_interval IS NULL
       OR persisted.symbol IS DISTINCT FROM NEW.symbol
       OR persisted.interval_minutes IS DISTINCT FROM expected_interval
       OR persisted.open IS DISTINCT FROM NEW.open
       OR persisted.high IS DISTINCT FROM NEW.high
       OR persisted.low IS DISTINCT FROM NEW.low
       OR persisted.close IS DISTINCT FROM NEW.close
       OR persisted.volume IS DISTINCT FROM NEW.volume
       OR persisted.source_bar_count IS DISTINCT FROM NEW.source_bar_count
       OR persisted.aggregate_hash IS DISTINCT FROM NEW.aggregate_hash
       OR persisted.source_revision_set_hash IS DISTINCT FROM NEW.source_revision_set_hash
       OR persisted.source_max_visible_by IS DISTINCT FROM NEW.source_max_visible_by
       OR persisted.source_max_visible_seq IS DISTINCT FROM NEW.source_max_visible_seq
       OR persisted.certificate_primary_identity IS DISTINCT FROM NEW.certificate_primary_identity
       OR persisted.contract_version IS DISTINCT FROM NEW.availability_contract_version THEN
      RAISE EXCEPTION 'xStock snapshot values/evidence do not match aggregate revision';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_xstock_snapshot_revision_link
  ON xstock_spot_ohlc_15m_snapshot;
CREATE TRIGGER trg_guard_xstock_snapshot_revision_link
BEFORE INSERT OR UPDATE ON xstock_spot_ohlc_15m_snapshot
FOR EACH ROW EXECUTE FUNCTION guard_xstock_snapshot_revision_link();

DROP TRIGGER IF EXISTS trg_guard_xstock_snapshot_revision_link
  ON xstock_spot_ohlc_60m_snapshot;
CREATE TRIGGER trg_guard_xstock_snapshot_revision_link
BEFORE INSERT OR UPDATE ON xstock_spot_ohlc_60m_snapshot
FOR EACH ROW EXECUTE FUNCTION guard_xstock_snapshot_revision_link();

COMMENT ON TABLE xstock_bar_aggregate_revision IS
  'B-XSTOCK-BAR-AVAILABILITY v1: immutable 15m/60m value plus exact ordered certified source-revision set.';
COMMENT ON TABLE xstock_bar_window_manifest IS
  'B-XSTOCK-BAR-AVAILABILITY v1: content-addressed ordered aggregate window, shared by decision provenance instead of repeating revision arrays.';
COMMENT ON COLUMN xstock_spot_ohlc_15m_snapshot.read_observed_at IS
  'Original primary read observation for the exact aggregate revision; snapshot refresh time is not availability.';
COMMENT ON COLUMN xstock_spot_ohlc_60m_snapshot.read_observed_at IS
  'Original primary read observation for the exact aggregate revision; snapshot refresh time is not availability.';
