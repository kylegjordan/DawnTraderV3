-- B-NAMES (2026-06-15) — last-resort asset-name resolution overlay table.
--
-- Backfills the human-readable asset name for symbols whose curated local
-- source (the CRYPTO_NAMES map for crypto, xstock_spot_universe.name for
-- xStock) MISSES or stores a ticker-echo (e.g. XRP→'XRP', PALL→'PALL'). The
-- server-side asset-name-resolver service writes here; GET /api/crypto/asset-
-- names (and the xStock equivalent) read it and the client merges it into the
-- name overlay. The curated local source still WINS client-side (map-first);
-- this table only fills the gaps. Implements RUNNING_ISSUES #298 — the data-
-- quality backfill half. (The structural display fix that hides a redundant
-- ticker-echo line shipped earlier in 534d582ed.) See
-- Claude Comms and Packages/Scope Files/B_NAMES_PRE_AUDIT.md.
--
-- Negative-cache (Langston condition C1): a resolved MISS is persisted as a
-- row with name = NULL and confidence in ('ambiguous','hard_miss') plus
-- next_retry_at set to a backoff horizon, so a permanently-unresolvable symbol
-- is NOT re-hit on every sweep. A positive (resolved) row has name NOT NULL and
-- next_retry_at = NULL (resolved once, never re-resolved). Manual re-resolve /
-- override = update or DELETE the row.

CREATE TABLE IF NOT EXISTS asset_names (
  symbol        text        NOT NULL,   -- base symbol, uppercased (e.g. 'XRP', 'CHIP')
  asset_class   text        NOT NULL,   -- 'crypto_spot' | 'xstock_spot' | ...
  name          text,                   -- resolved display name; NULL = negative-cache (miss)
  source        text        NOT NULL,   -- 'coingecko' | 'coingecko-pinned' | 'manual' | 'miss'
  confidence    text        NOT NULL DEFAULT 'resolved',  -- 'resolved' | 'ambiguous' | 'hard_miss'
  resolved_at   timestamptz NOT NULL DEFAULT now(),
  attempts      integer     NOT NULL DEFAULT 1,           -- negative-cache backoff counter
  next_retry_at timestamptz,            -- negative-cache retry horizon; NULL on positive rows
  PRIMARY KEY (symbol, asset_class)
);

-- Endpoint read path: WHERE asset_class LIKE 'crypto%' AND name IS NOT NULL.
CREATE INDEX IF NOT EXISTS idx_asset_names_class_resolved
  ON asset_names (asset_class)
  WHERE name IS NOT NULL;
