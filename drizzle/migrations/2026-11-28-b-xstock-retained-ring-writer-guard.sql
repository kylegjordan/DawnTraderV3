-- B-XSTOCK-BID-TRIGGER-RELAND increment 1 (D1). Reserve generation zero
-- for legacy writers. Activation and restore are separate application
-- statements in the same READ COMMITTED transaction.
BEGIN;

CREATE TABLE xstock_book_state_ring_writer_guard (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  generation bigint NOT NULL CHECK (generation >= 0),
  boot_id uuid,
  CHECK ((generation = 0) = (boot_id IS NULL))
);

INSERT INTO xstock_book_state_ring_writer_guard (generation) VALUES (0);

ALTER TABLE xstock_book_state_rings
  ADD COLUMN writer_generation bigint,
  ADD COLUMN writer_boot_id uuid,
  ADD COLUMN writer_sequence bigint,
  ADD CONSTRAINT xstock_book_state_rings_writer_version CHECK (
    (writer_generation IS NULL AND writer_boot_id IS NULL AND writer_sequence IS NULL)
    OR (
      writer_generation IS NOT NULL AND writer_generation > 0
      AND writer_boot_id IS NOT NULL
      AND writer_sequence IS NOT NULL AND writer_sequence > 0
    )
  );

CREATE FUNCTION lock_xstock_book_state_ring_writer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
DECLARE
  locked boolean;
BEGIN
  IF TG_OP IN ('DELETE', 'TRUNCATE') THEN
    RAISE EXCEPTION 'xStock retained rings are upsert-only' USING ERRCODE = '55000';
  END IF;

  -- Even legacy commands hold the shared lock until commit. The lock must
  -- precede any symbol tuple lock, including for an unconditional UPDATE.
  EXECUTE format(
    'SELECT singleton FROM %I.xstock_book_state_ring_writer_guard WHERE singleton FOR SHARE',
    TG_TABLE_SCHEMA
  ) INTO STRICT locked;
  RETURN NULL;
END;
$$;

CREATE TRIGGER lock_xstock_book_state_ring_writer
BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON xstock_book_state_rings
FOR EACH STATEMENT EXECUTE FUNCTION lock_xstock_book_state_ring_writer();

CREATE FUNCTION validate_xstock_book_state_ring_version()
RETURNS trigger
LANGUAGE plpgsql
VOLATILE
SET search_path = pg_catalog
AS $$
DECLARE
  active_generation bigint;
  active_boot_id uuid;
BEGIN
  -- The statement trigger already holds the shared lock. Resolve the
  -- singleton in the target table's schema. The volatile read sees a claim
  -- committed while the calling statement was waiting for the shared lock.
  EXECUTE format(
    'SELECT generation, boot_id FROM %I.xstock_book_state_ring_writer_guard WHERE singleton',
    TG_TABLE_SCHEMA
  ) INTO STRICT active_generation, active_boot_id;

  IF active_generation = 0 THEN
    IF NEW.writer_generation IS NOT NULL THEN
      RAISE EXCEPTION 'xStock retained-ring writer is not activated' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.writer_generation IS DISTINCT FROM active_generation
    OR NEW.writer_boot_id IS DISTINCT FROM active_boot_id
    OR NEW.writer_sequence IS NULL
    OR NEW.writer_sequence <= 0
  THEN
    RAISE EXCEPTION 'xStock retained-ring writer is fenced' USING ERRCODE = '55000';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.symbol IS DISTINCT FROM OLD.symbol THEN
      RAISE EXCEPTION 'xStock retained-ring symbol is immutable' USING ERRCODE = '55000';
    END IF;
    IF NEW.writer_generation = OLD.writer_generation THEN
      IF NEW.writer_sequence < OLD.writer_sequence THEN
        RETURN NULL; -- A later invocation already owns the durable row.
      END IF;
      IF NEW.writer_sequence = OLD.writer_sequence THEN
        IF ROW(NEW.spreads, NEW.seed_basis, NEW.source, NEW.written_at, NEW.persisted_at)
          IS DISTINCT FROM ROW(OLD.spreads, OLD.seed_basis, OLD.source, OLD.written_at, OLD.persisted_at)
        THEN
          RAISE EXCEPTION 'xStock retained-ring equal version changed payload' USING ERRCODE = '55000';
        END IF;
        RETURN NULL; -- Exact replay. Keep the original row and both stamps.
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_xstock_book_state_ring_version
BEFORE INSERT OR UPDATE ON xstock_book_state_rings
FOR EACH ROW EXECUTE FUNCTION validate_xstock_book_state_ring_version();

COMMIT;
