-- B-XSTOCK-BAR-AVAILABILITY, Step 3 / capture layer (P2-P4).
--
-- Preserve Kraken's interval_begin and F-G-1's maximum-arrival/equal-arrival-last-applied
-- projection semantics while retaining every post-buffer xStock projection attempt.  The
-- immutable event and compact projection are committed together.  A later transaction then
-- certifies that the exact event IDs were readable on the authoritative primary.

CREATE SEQUENCE IF NOT EXISTS xstock_bar_visible_seq AS bigint;

CREATE TABLE IF NOT EXISTS xstock_bar_clock_guard (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_observed_at timestamptz NOT NULL,
  primary_identity text NOT NULL,
  contract_version text NOT NULL,
  contract_active boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO xstock_bar_clock_guard(singleton, last_observed_at, primary_identity, contract_version)
VALUES (
  true,
  clock_timestamp(),
  current_database() || '@' || COALESCE(inet_server_addr()::text, 'local') || ':'
    || COALESCE(inet_server_port()::text, 'local') || '/system:'
    || (SELECT system_identifier::text FROM pg_control_system()),
  'xstock-bar-availability/v1'
)
ON CONFLICT (singleton) DO NOTHING;

CREATE OR REPLACE FUNCTION guard_xstock_bar_contract_activation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.contract_active AND NOT NEW.contract_active THEN
    RAISE EXCEPTION 'xStock bar availability contract activation is one-way';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_xstock_bar_contract_activation ON xstock_bar_clock_guard;
CREATE TRIGGER trg_guard_xstock_bar_contract_activation
BEFORE UPDATE OF contract_active ON xstock_bar_clock_guard
FOR EACH ROW EXECUTE FUNCTION guard_xstock_bar_contract_activation();

CREATE TABLE IF NOT EXISTS xstock_bar_revision_event (
  revision_id uuid NOT NULL,
  arrived_at timestamptz NOT NULL,
  symbol text NOT NULL,
  interval_begin timestamptz NOT NULL,
  asset_class text NOT NULL CHECK (asset_class = 'xstock_spot'),
  exchange text NOT NULL,
  open numeric(20,8) NOT NULL,
  high numeric(20,8) NOT NULL,
  low numeric(20,8) NOT NULL,
  close numeric(20,8) NOT NULL,
  volume numeric(28,8) NOT NULL,
  vwap numeric(20,8),
  trade_count integer,
  source_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[0-9a-f]{64}$'),
  writer_boot_id uuid NOT NULL,
  contract_version text NOT NULL,
  projection_applied boolean NOT NULL,
  projection_generation bigint,
  supersedes_revision_id uuid,
  observed_winner_revision_id uuid,
  payload_repeated_from_winner boolean NOT NULL,
  reject_reason text,
  visible_by timestamptz,
  visible_seq bigint,
  certificate_primary_identity text,
  certificate_clock_healthy boolean,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (revision_id, arrived_at),
  CHECK (
    (projection_applied AND projection_generation IS NOT NULL AND reject_reason IS NULL)
    OR
    (NOT projection_applied AND projection_generation IS NULL AND reject_reason IS NOT NULL)
  ),
  CHECK (
    (visible_by IS NULL AND visible_seq IS NULL AND certificate_primary_identity IS NULL
      AND certificate_clock_healthy IS NULL)
    OR
    (visible_by IS NOT NULL AND visible_seq IS NOT NULL AND certificate_primary_identity IS NOT NULL
      AND certificate_clock_healthy = true)
  )
) PARTITION BY RANGE (arrived_at);

CREATE INDEX IF NOT EXISTS idx_xstock_bar_revision_event_id
  ON xstock_bar_revision_event (revision_id);
CREATE INDEX IF NOT EXISTS idx_xstock_bar_revision_event_winner
  ON xstock_bar_revision_event (symbol, interval_begin, projection_generation DESC)
  WHERE projection_applied;
CREATE INDEX IF NOT EXISTS idx_xstock_bar_revision_event_visibility
  ON xstock_bar_revision_event (visible_seq)
  WHERE visible_seq IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_xstock_bar_revision_event_pending_certificate
  ON xstock_bar_revision_event (created_at, revision_id)
  WHERE visible_by IS NULL;

ALTER TABLE xstock_spot_ohlc_1m
  ADD COLUMN IF NOT EXISTS winning_revision_id uuid,
  ADD COLUMN IF NOT EXISTS winning_payload_hash text,
  ADD COLUMN IF NOT EXISTS projection_generation bigint NOT NULL DEFAULT 0;

-- Before the first immutable event exists, the still-running pre-deploy process may finish its
-- legacy writes while the migration is being installed. The first new-writer event is the durable
-- activation boundary. From then onward, rollback/legacy writes may not mutate the projection
-- without rotating its immutable winner ID.
CREATE OR REPLACE FUNCTION guard_xstock_projection_revision_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  contract_active boolean;
BEGIN
  -- A legacy write holds this shared row lock until its transaction ends. The
  -- first revision-aware writer must UPDATE the same row, so activation waits
  -- for every pre-boundary write to finish before it can become visible.
  SELECT g.contract_active INTO contract_active
    FROM xstock_bar_clock_guard g WHERE g.singleton = true FOR SHARE;
  IF NOT contract_active THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.arrived_at IS NOT NULL AND NEW.winning_revision_id IS NULL THEN
      RAISE EXCEPTION 'xStock projection write missing immutable winner revision';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.open, NEW.high, NEW.low, NEW.close, NEW.volume, NEW.vwap,
      NEW.trade_count, NEW.arrived_at) IS DISTINCT FROM
     ROW(OLD.open, OLD.high, OLD.low, OLD.close, OLD.volume, OLD.vwap,
      OLD.trade_count, OLD.arrived_at)
     AND NEW.winning_revision_id IS NOT DISTINCT FROM OLD.winning_revision_id THEN
    RAISE EXCEPTION 'xStock projection mutation did not rotate immutable winner revision';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_xstock_projection_revision_link ON xstock_spot_ohlc_1m;
CREATE TRIGGER trg_guard_xstock_projection_revision_link
BEFORE INSERT OR UPDATE ON xstock_spot_ohlc_1m
FOR EACH ROW EXECUTE FUNCTION guard_xstock_projection_revision_link();

-- Pre-create today plus the daily creator's full 14-day look-ahead.  The runtime registry added
-- by this batch keeps the same coverage after deployment.
DO $$
DECLARE
  d date;
  child_name text;
BEGIN
  FOR offset_days IN 0..14 LOOP
    d := (clock_timestamp() AT TIME ZONE 'UTC')::date + offset_days;
    child_name := 'xstock_bar_revision_event_' || to_char(d, 'YYYY_MM_DD');
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF xstock_bar_revision_event FOR VALUES FROM (%L) TO (%L)',
      child_name, d, d + 1
    );
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION guard_xstock_bar_revision_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('dawntrader.archive_mode', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'xstock_bar_revision_event is append-only outside reviewed archive mode';
    END IF;
    RETURN OLD;
  END IF;

  IF ROW(
      NEW.revision_id, NEW.arrived_at, NEW.symbol, NEW.interval_begin, NEW.asset_class,
      NEW.exchange, NEW.open, NEW.high, NEW.low, NEW.close, NEW.volume, NEW.vwap,
      NEW.trade_count, NEW.source_metadata, NEW.payload_hash, NEW.writer_boot_id,
      NEW.contract_version, NEW.projection_applied, NEW.projection_generation,
      NEW.supersedes_revision_id, NEW.observed_winner_revision_id,
      NEW.payload_repeated_from_winner, NEW.reject_reason,
      NEW.created_at
    ) IS DISTINCT FROM ROW(
      OLD.revision_id, OLD.arrived_at, OLD.symbol, OLD.interval_begin, OLD.asset_class,
      OLD.exchange, OLD.open, OLD.high, OLD.low, OLD.close, OLD.volume, OLD.vwap,
      OLD.trade_count, OLD.source_metadata, OLD.payload_hash, OLD.writer_boot_id,
      OLD.contract_version, OLD.projection_applied, OLD.projection_generation,
      OLD.supersedes_revision_id, OLD.observed_winner_revision_id,
      OLD.payload_repeated_from_winner, OLD.reject_reason,
      OLD.created_at
    ) THEN
    RAISE EXCEPTION 'immutable xstock bar revision fields cannot be changed';
  END IF;

  IF OLD.visible_by IS NOT NULL AND ROW(
      NEW.visible_by, NEW.visible_seq, NEW.certificate_primary_identity,
      NEW.certificate_clock_healthy
    ) IS DISTINCT FROM ROW(
      OLD.visible_by, OLD.visible_seq, OLD.certificate_primary_identity,
      OLD.certificate_clock_healthy
    ) THEN
    RAISE EXCEPTION 'xstock bar visibility certificate cannot be replaced';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_xstock_bar_revision_event_mutation
  ON xstock_bar_revision_event;
CREATE TRIGGER trg_guard_xstock_bar_revision_event_mutation
BEFORE UPDATE OR DELETE ON xstock_bar_revision_event
FOR EACH ROW EXECUTE FUNCTION guard_xstock_bar_revision_event_mutation();

-- One server-side call applies a deduplicated writer slice.  The advisory transaction lock closes
-- the absent-row race as well as the existing-row race; the SELECT FOR UPDATE supplies the actual
-- predecessor after lock acquisition.  Equal arrivals apply, exactly matching F-G-1's <= guard.
CREATE OR REPLACE FUNCTION apply_xstock_bar_revision_events(
  p_rows jsonb,
  p_writer_boot_id uuid,
  p_contract_version text
)
RETURNS TABLE (
  revision_id uuid,
  arrived_at timestamptz,
  projection_applied boolean,
  projection_generation bigint,
  supersedes_revision_id uuid,
  observed_winner_revision_id uuid,
  payload_hash text,
  payload_repeated_from_winner boolean
)
LANGUAGE plpgsql
AS $$
DECLARE
  item jsonb;
  new_revision_id uuid;
  in_arrived_at timestamptz;
  in_interval_begin timestamptz;
  prior_revision_id uuid;
  prior_generation bigint;
  prior_arrived_at timestamptz;
  prior_payload_hash text;
  did_apply boolean;
  row_exists boolean;
  inserted_count integer;
  next_generation bigint;
  hash_text text;
BEGIN
  IF jsonb_typeof(p_rows) IS DISTINCT FROM 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'apply_xstock_bar_revision_events requires a non-empty JSON array';
  END IF;
  IF p_contract_version IS DISTINCT FROM 'xstock-bar-availability/v1' THEN
    RAISE EXCEPTION 'unsupported xstock bar availability contract: %', p_contract_version;
  END IF;

  -- This is the one-way cutover from migration-compatible legacy writes to the
  -- revision-linked projection contract. A rollback to the old writer remains
  -- fail-closed because no rollback clears this durable state.
  UPDATE xstock_bar_clock_guard
  SET contract_active = true, updated_at = clock_timestamp()
  WHERE singleton = true AND NOT contract_active;

  FOR item IN SELECT value FROM jsonb_array_elements(p_rows) LOOP
    IF item->>'assetClass' IS DISTINCT FROM 'xstock_spot' THEN
      RAISE EXCEPTION 'xstock revision path received assetClass=%', item->>'assetClass';
    END IF;
    new_revision_id := gen_random_uuid();
    in_arrived_at := (item->>'arrivedAt')::timestamptz;
    in_interval_begin := (item->>'intervalBegin')::timestamptz;
    IF in_arrived_at IS NULL OR in_interval_begin IS NULL THEN
      RAISE EXCEPTION 'xstock revision path requires arrivedAt and intervalBegin';
    END IF;

    hash_text := item->>'payloadHash';
    IF hash_text IS NULL OR hash_text !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'xstock revision path requires a lowercase SHA-256 payloadHash';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended((item->>'symbol') || '|' || in_interval_begin::text, 0));

    prior_revision_id := NULL;
    prior_generation := 0;
    prior_arrived_at := NULL;
    prior_payload_hash := NULL;
    SELECT o.winning_revision_id, o.projection_generation, o.arrived_at, o.winning_payload_hash
      INTO prior_revision_id, prior_generation, prior_arrived_at, prior_payload_hash
      FROM xstock_spot_ohlc_1m o
      WHERE o.symbol = item->>'symbol' AND o.interval_begin = in_interval_begin
      FOR UPDATE;
    row_exists := FOUND;

    -- Try the absent-row insert without an UPDATE arm. An overlapping pre-cutover process does
    -- not take our advisory lock, so it can still win the unique-key race; ON CONFLICT DO NOTHING
    -- detects that case, after which we lock and judge the actual row below.
    IF NOT row_exists THEN
      INSERT INTO xstock_spot_ohlc_1m (
        symbol, asset_class, exchange, interval_begin, open, high, low, close,
        volume, vwap, trade_count, metadata, captured_at, arrived_at,
        winning_revision_id, winning_payload_hash, projection_generation
      ) VALUES (
        item->>'symbol', 'xstock_spot', item->>'exchange', in_interval_begin,
        (item->>'open')::numeric, (item->>'high')::numeric, (item->>'low')::numeric,
        (item->>'close')::numeric, (item->>'volume')::numeric,
        NULLIF(item->>'vwap', '')::numeric, NULLIF(item->>'tradeCount', '')::integer,
        COALESCE(item->'metadata', '{"schema_version":1}'::jsonb), NOW(), in_arrived_at,
        new_revision_id, hash_text, 1
      )
      ON CONFLICT (symbol, interval_begin) DO NOTHING;
      GET DIAGNOSTICS inserted_count = ROW_COUNT;
      IF inserted_count = 1 THEN
        did_apply := true;
        next_generation := 1;
      ELSE
        SELECT o.winning_revision_id, o.projection_generation, o.arrived_at, o.winning_payload_hash
          INTO prior_revision_id, prior_generation, prior_arrived_at, prior_payload_hash
          FROM xstock_spot_ohlc_1m o
          WHERE o.symbol = item->>'symbol' AND o.interval_begin = in_interval_begin
          FOR UPDATE;
        IF NOT FOUND THEN
          RAISE EXCEPTION 'xStock projection conflict row disappeared before lock';
        END IF;
        row_exists := true;
      END IF;
    END IF;

    IF row_exists THEN
      did_apply := prior_arrived_at IS NULL OR prior_arrived_at <= in_arrived_at;
      next_generation := CASE WHEN did_apply THEN COALESCE(prior_generation, 0) + 1 ELSE NULL END;
      IF did_apply THEN
        UPDATE xstock_spot_ohlc_1m SET
          open = (item->>'open')::numeric,
          high = (item->>'high')::numeric,
          low = (item->>'low')::numeric,
          close = (item->>'close')::numeric,
          volume = (item->>'volume')::numeric,
          vwap = NULLIF(item->>'vwap', '')::numeric,
          trade_count = NULLIF(item->>'tradeCount', '')::integer,
          captured_at = NOW(),
          arrived_at = in_arrived_at,
          winning_revision_id = new_revision_id,
          winning_payload_hash = hash_text,
          projection_generation = next_generation
        WHERE symbol = item->>'symbol' AND interval_begin = in_interval_begin;
      END IF;
    END IF;

    INSERT INTO xstock_bar_revision_event (
      revision_id, arrived_at, symbol, interval_begin, asset_class, exchange,
      open, high, low, close, volume, vwap, trade_count, source_metadata,
      payload_hash, writer_boot_id, contract_version, projection_applied,
      projection_generation, supersedes_revision_id, observed_winner_revision_id,
      payload_repeated_from_winner, reject_reason
    ) VALUES (
      new_revision_id, in_arrived_at, item->>'symbol', in_interval_begin,
      'xstock_spot', item->>'exchange', (item->>'open')::numeric,
      (item->>'high')::numeric, (item->>'low')::numeric, (item->>'close')::numeric,
      (item->>'volume')::numeric, NULLIF(item->>'vwap', '')::numeric,
      NULLIF(item->>'tradeCount', '')::integer, COALESCE(item->'metadata', '{}'::jsonb),
      hash_text, p_writer_boot_id, p_contract_version, did_apply, next_generation,
      CASE WHEN did_apply THEN prior_revision_id ELSE NULL END,
      prior_revision_id,
      prior_payload_hash IS NOT NULL AND prior_payload_hash = hash_text,
      CASE WHEN did_apply THEN NULL ELSE 'older_arrival' END
    );

    revision_id := new_revision_id;
    arrived_at := in_arrived_at;
    projection_applied := did_apply;
    projection_generation := next_generation;
    supersedes_revision_id := CASE WHEN did_apply THEN prior_revision_id ELSE NULL END;
    observed_winner_revision_id := prior_revision_id;
    payload_hash := hash_text;
    payload_repeated_from_winner := prior_payload_hash IS NOT NULL AND prior_payload_hash = hash_text;
    RETURN NEXT;
  END LOOP;
END $$;

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
  SELECT last_observed_at INTO prior_clock
    FROM xstock_bar_clock_guard WHERE singleton = true FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'xstock bar clock guard row missing';
  END IF;
  observed_at := clock_timestamp();
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

COMMENT ON TABLE xstock_bar_revision_event IS
  'B-XSTOCK-BAR-AVAILABILITY v1: append-only post-buffer projection attempts. interval_begin remains the Kraken label; visibility is a later primary observation.';
COMMENT ON COLUMN xstock_bar_revision_event.visible_by IS
  'Conservative database wall-time upper bound from a later primary statement; causal order is visible_seq. Not venue publication or exact commit time.';
COMMENT ON COLUMN xstock_spot_ohlc_1m.winning_revision_id IS
  'Current compact projection winner in xstock_bar_revision_event; NULL means pre-cutover/legacy.';
