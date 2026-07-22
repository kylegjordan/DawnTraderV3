-- B-CREW-COORD (2026-07-22): crew coordination registry — RUNNING_ISSUES #554.
-- Owner: Claude Analyst (CC-C). Langston Step-2 ruled the substrate: a REGISTERED
-- migration, never an out-of-band table (versioned, reviewable, and immune to the
-- `db:push` / drizzle-kit foot-gun that could otherwise act on unmanaged objects).
--
-- WHY THIS TABLE EXISTS (Kyle directive 2026-07-20): three CC sessions plus Langston
-- share ONE working tree on a FUSE mount. "Who holds the wrench" is announced in chat,
-- which works only if every session posts AND every other session reads it in time —
-- a practice you have to remember is not a control. This makes it queryable state.
--
-- ★ WHAT THIS DOES **NOT** DO (Langston-ruled, stated here so a reader of the schema
--   cannot over-read it): the board provides contention-VISIBILITY, a queryable
--   safe-to-touch answer, and push serialization. It does **NOT** provide ATOMICITY.
--   It cannot close #557 (one session's commit capturing another's staged paths) —
--   that is an index race, and in the case that occurred NO coordination rule was
--   broken by anyone. A green board is not a guarantee.
--
-- Nothing in the trading path reads this table, by design — that is what keeps
-- rollback trivial and makes it incapable of affecting trading behaviour.
--
-- Idempotent + additive only. No DROP anywhere in this file: it creates one new
-- table that no existing code references, so it cannot disturb existing data.

CREATE TABLE IF NOT EXISTS crew_coordination (
  id           BIGSERIAL PRIMARY KEY,
  session      TEXT        NOT NULL,          -- 'OLD Claude' | 'NEW Claude' | 'ANALYST Claude'
  kind         TEXT        NOT NULL,          -- 'claim' (editing shared paths) | 'push'
  paths        TEXT[]      NOT NULL DEFAULT '{}',
  status       TEXT        NOT NULL DEFAULT 'active',   -- 'active' | 'released' | 'expired'
  note         TEXT,                          -- batch id / intent, free text
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  released_at  TIMESTAMPTZ,
  CONSTRAINT crew_coordination_kind_chk   CHECK (kind   IN ('claim','push')),
  CONSTRAINT crew_coordination_status_chk CHECK (status IN ('active','released','expired')),
  -- A released/expired row must carry its release timestamp; an active row must not.
  -- This is what makes OBJ-5 honest: an expiry is a visible state transition with a
  -- timestamp, never a silent delete.
  CONSTRAINT crew_coordination_release_chk CHECK (
    (status = 'active' AND released_at IS NULL) OR
    (status <> 'active' AND released_at IS NOT NULL)
  )
);

-- OBJ-2: push serialization enforced by the DATABASE, not by application logic —
-- at most one active push at a time. A second `push-begin` is refused by Postgres.
-- (Application-side serialization would be another thing to remember; this cannot
-- be forgotten.) NOTE: this constrains the BOARD only — per Langston, if the board
-- is unreachable, pushes fall back to today's behaviour rather than hitting a wall.
CREATE UNIQUE INDEX IF NOT EXISTS crew_coordination_one_active_push
  ON crew_coordination ((kind))
  WHERE kind = 'push' AND status = 'active';

-- The board's hot read is "what is active right now" (`crew board`, plus the guard
-- hook's lookup on every commit) — keep it cheap, since the hook fires constantly.
CREATE INDEX IF NOT EXISTS crew_coordination_active_idx
  ON crew_coordination (status, kind)
  WHERE status = 'active';

COMMENT ON TABLE crew_coordination IS
  'B-CREW-COORD #554: cross-session claim/push board. Visibility + serialization, NOT atomicity (Langston 2026-07-22). No trading-path code may read this table.';
