-- =====================================================================
-- B79.0n.UNIVERSE-DISCOVERY — schema + seed migration
-- =====================================================================
-- Sub-batch 2 of 18 in the B79.0n umbrella arc.
--
-- Purpose: replace the hardcoded XSTOCK_SPOT_REGISTRY Map literal in
-- shared/asset-classes.ts (260 entries) + the hardcoded
-- server/config/xstocks-universe.json with a dynamically-populated
-- universe sourced from CoinGecko + Kraken WS subscription probe +
-- Finnhub metadata. Discovery service writes daily at 06:00 UTC.
--
-- Schema designed per Langston Step 2 ACK with the following key
-- decisions absorbed:
--   Q-PA-4: sector is TEXT + CHECK (not PostgreSQL ENUM) — sidesteps
--           ALTER TYPE / new-value-in-same-transaction restriction
--   Q9 #2: discovery_runs audit table for ops forensics
--   Q9 #3: is_delisted column for stale → delisted lifecycle
--          (<7d active, 7-30d stale, >30d delisted)
--
-- Seed strategy: full snapshot of current 260-row registry pre-loaded
-- via INSERT VALUES + ON CONFLICT DO NOTHING (Langston Q6 idempotency).
-- Extraction script committed at scripts/b79-0n-universe-seed-extract.ts.
--
-- Rollback: see _rollback companion file (drops the three tables).
-- =====================================================================

BEGIN;

-- Sector taxonomy: SPDR sector ETF tickers + special buckets for
-- ETFs / index proxies that don't have a direct GICS mapping.
-- UNCATEGORIZED is added for symbols where Finnhub metadata is
-- unavailable or maps to an industry we don't have an internal slot
-- for. New symbols default to UNCATEGORIZED until metadata lands.

CREATE TABLE xstock_spot_universe (
  symbol TEXT PRIMARY KEY,                -- canonical 'BASE/USD' form
  name TEXT NOT NULL,                     -- display name from Finnhub or override
  sector TEXT NOT NULL,
  crypto_adjacent BOOLEAN NOT NULL DEFAULT false,
  adr BOOLEAN NOT NULL DEFAULT false,
  source_chain JSONB NOT NULL,            -- {coingecko, kraken_ws_accept, finnhub, override_applied}
  is_delisted BOOLEAN NOT NULL DEFAULT false,  -- Langston Q9 #3: excluded from active universe when true
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT xstock_spot_universe_sector_chk CHECK (
    sector IN (
      'XLK', 'XLV', 'XLF', 'XLC', 'XLY', 'XLP', 'XLE', 'XLI',
      'XLRE', 'XLU', 'XLB',
      'BROAD_ETF', 'INDEX_PROXY', 'INTL_ETF',
      'UNCATEGORIZED'
    )
  )
);

CREATE INDEX idx_xstock_spot_universe_sector ON xstock_spot_universe(sector);
CREATE INDEX idx_xstock_spot_universe_last_seen ON xstock_spot_universe(last_seen_at);
CREATE INDEX idx_xstock_spot_universe_is_delisted ON xstock_spot_universe(is_delisted);

-- Companion override table: manual curation for flags that cannot be
-- auto-derived from Finnhub's GICS classification (cryptoAdjacent for
-- equities correlated with crypto markets — MSTR, COIN, HOOD etc.;
-- adr flag for ADR-listed non-US underlyings; sector override for
-- ETFs / index proxies that don't map cleanly to GICS).
-- NULL on any override column = use the Finnhub-derived value.

CREATE TABLE xstock_spot_universe_overrides (
  symbol TEXT PRIMARY KEY,
  sector_override TEXT NULL,
  crypto_adjacent_override BOOLEAN NULL,
  adr_override BOOLEAN NULL,
  name_override TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT xstock_spot_universe_overrides_sector_chk CHECK (
    sector_override IS NULL OR sector_override IN (
      'XLK', 'XLV', 'XLF', 'XLC', 'XLY', 'XLP', 'XLE', 'XLI',
      'XLRE', 'XLU', 'XLB',
      'BROAD_ETF', 'INDEX_PROXY', 'INTL_ETF',
      'UNCATEGORIZED'
    )
  )
);

-- Discovery audit table: every discovery cycle writes one row.
-- Operational forensics + rollback target (Langston Q9 #2).
CREATE TABLE discovery_runs (
  run_id BIGSERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NULL,
  duration_ms INTEGER NULL,
  source_chain_status JSONB NOT NULL,     -- {coingecko: {ok, count, error?}, kraken_ws: {ok, candidates_probed, accepted_count, rejected_count, error?}, finnhub: {ok, enriched_count, error?}}
  symbols_discovered INTEGER NOT NULL DEFAULT 0,
  symbols_marked_stale INTEGER NOT NULL DEFAULT 0,
  symbols_marked_delisted INTEGER NOT NULL DEFAULT 0,
  error_log TEXT NULL,
  triggered_by TEXT NOT NULL CHECK (triggered_by IN ('cron_daily', 'manual_endpoint', 'boot_smoke'))
);

CREATE INDEX idx_discovery_runs_started_at ON discovery_runs(started_at);

-- =====================================================================
-- Seed data: extracted from shared/asset-classes.ts XSTOCK_SPOT_REGISTRY
-- via scripts/b79-0n-universe-seed-extract.ts. 260 universe rows +
-- 56 override rows. ON CONFLICT (symbol) DO NOTHING ensures
-- idempotent partial-state replay (Langston Q6).
-- =====================================================================

INSERT INTO xstock_spot_universe (symbol, name, sector, crypto_adjacent, adr, source_chain) VALUES
INSERT INTO xstock_spot_universe (symbol, name, sector, crypto_adjacent, adr, source_chain) VALUES
  ('AAPL/USD', 'Apple', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ABBV/USD', 'AbbVie', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ABNB/USD', 'Airbnb', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ADBE/USD', 'Adobe', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AEP/USD', 'American Electric Power', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AFL/USD', 'Aflac', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AIG/USD', 'AIG', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ALL/USD', 'Allstate', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ALNY/USD', 'Alnylam Pharmaceuticals', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AMAT/USD', 'Applied Materials', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AMC/USD', 'AMC Entertainment', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AMD/USD', 'AMD', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AMGN/USD', 'Amgen', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AMT/USD', 'American Tower', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AMZN/USD', 'Amazon', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AON/USD', 'Aon', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ARCT/USD', 'Arcturus Therapeutics', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ARKG/USD', 'ARK Genomic Revolution ETF', 'BROAD_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ARKK/USD', 'ARK Innovation ETF', 'BROAD_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ASML/USD', 'ASML Holding', 'XLK', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AUR/USD', 'Aurora Innovation', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AVB/USD', 'AvalonBay Communities', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('AXP/USD', 'American Express', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BABA/USD', 'Alibaba', 'XLY', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BAC/USD', 'Bank of America', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BAX/USD', 'Baxter International', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BBBY/USD', 'Bed Bath & Beyond', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BCC/USD', 'Boise Cascade', 'XLB', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BDX/USD', 'Becton Dickinson', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BE/USD', 'Bloom Energy', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BHC/USD', 'Bausch Health', 'XLV', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BIDU/USD', 'Baidu', 'XLC', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BIIB/USD', 'Biogen', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BILI/USD', 'Bilibili', 'XLC', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BLDP/USD', 'Ballard Power', 'XLI', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BLNK/USD', 'Blink Charging', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BMBL/USD', 'Bumble', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BMY/USD', 'Bristol Myers Squibb', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BNTX/USD', 'BioNTech', 'XLV', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BTBT/USD', 'Bit Digital', 'XLK', true, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BTI/USD', 'British American Tobacco', 'XLP', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('BUD/USD', 'Anheuser-Busch InBev', 'XLP', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CB/USD', 'Chubb', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CBOE/USD', 'Cboe Global Markets', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CCI/USD', 'Crown Castle', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CHPT/USD', 'ChargePoint', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CI/USD', 'Cigna', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CIFR/USD', 'Cipher Mining', 'XLK', true, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CL/USD', 'Colgate-Palmolive', 'XLP', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CLSK/USD', 'CleanSpark', 'XLK', true, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CMCSA/USD', 'Comcast', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CME/USD', 'CME Group', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CNC/USD', 'Centene', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('COIN/USD', 'Coinbase', 'XLF', true, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('COP/USD', 'ConocoPhillips', 'XLE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('COST/USD', 'Costco', 'XLP', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CRCL/USD', 'Circle', 'XLF', true, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CRWD/USD', 'CrowdStrike', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CSCO/USD', 'Cisco Systems', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CVS/USD', 'CVS Health', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('CVX/USD', 'Chevron', 'XLE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('D/USD', 'Dominion Energy', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('DASH/USD', 'DoorDash', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('DE/USD', 'Deere & Company', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('DEO/USD', 'Diageo', 'XLP', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('DFDV/USD', 'DeFi Development Corp', 'XLF', true, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('DHR/USD', 'Danaher', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('DIS/USD', 'Disney', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('DLR/USD', 'Digital Realty', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('DTE/USD', 'DTE Energy', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('DUK/USD', 'Duke Energy', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ED/USD', 'Consolidated Edison', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EDU/USD', 'New Oriental Education', 'XLY', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EIX/USD', 'Edison International', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ELV/USD', 'Elevance Health', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EMR/USD', 'Emerson Electric', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EQIX/USD', 'Equinix', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EQR/USD', 'Equity Residential', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EQT/USD', 'EQT Corporation', 'XLE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ESS/USD', 'Essex Property Trust', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EVGO/USD', 'EVgo', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWA/USD', 'Australia ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWC/USD', 'Canada ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWG/USD', 'Germany ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWI/USD', 'Italy ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWL/USD', 'Switzerland ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWN/USD', 'Netherlands ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWP/USD', 'Spain ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWQ/USD', 'France ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWS/USD', 'Singapore ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWU/USD', 'United Kingdom ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EWZ/USD', 'Brazil ETF', 'INTL_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('EXC/USD', 'Exelon', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('F/USD', 'Ford', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('FAST/USD', 'Fastenal', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('FCEL/USD', 'FuelCell Energy', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('FOX/USD', 'Fox Corporation (B)', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('FOXA/USD', 'Fox Corporation (A)', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GEV/USD', 'GE Vernova', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GILD/USD', 'Gilead Sciences', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GLD/USD', 'Gold ETF', 'BROAD_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GLOB/USD', 'Globant', 'XLK', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GLXY/USD', 'Galaxy Digital', 'XLF', true, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GM/USD', 'General Motors', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GME/USD', 'GameStop', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GOOGL/USD', 'Alphabet', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GOTU/USD', 'Gaotu Techedu', 'XLY', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GS/USD', 'Goldman Sachs', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('GWW/USD', 'W.W. Grainger', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('HCA/USD', 'HCA Healthcare', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('HD/USD', 'Home Depot', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('HIG/USD', 'Hartford Financial', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('HIVE/USD', 'HIVE Digital Technologies', 'XLK', true, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('HOOD/USD', 'Robinhood', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('HUM/USD', 'Humana', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('HUT/USD', 'Hut 8 Mining', 'XLK', true, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('IBM/USD', 'IBM', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ICE/USD', 'Intercontinental Exchange', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('IEMG/USD', 'Core MSCI Emerging Markets ETF', 'BROAD_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('INTC/USD', 'Intel', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('JD/USD', 'JD.com', 'XLY', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('JNJ/USD', 'Johnson & Johnson', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('JPM/USD', 'JPMorgan Chase', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('KO/USD', 'Coca-Cola', 'XLP', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LCID/USD', 'Lucid Group', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LECO/USD', 'Lincoln Electric', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LI/USD', 'Li Auto', 'XLY', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LIDR/USD', 'AEye Inc.', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LLY/USD', 'Eli Lilly', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LMND/USD', 'Lemonade', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LMT/USD', 'Lockheed Martin', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LNC/USD', 'Lincoln National', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LOW/USD', 'Lowe''s', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LRCX/USD', 'Lam Research', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('LYFT/USD', 'Lyft', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MAA/USD', 'Mid-America Apartment', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MCD/USD', 'McDonald''s', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MCK/USD', 'McKesson', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MCO/USD', 'Moody''s', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MDB/USD', 'MongoDB', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MDLZ/USD', 'Mondelez International', 'XLP', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MDT/USD', 'Medtronic', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MET/USD', 'MetLife', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('META/USD', 'Meta Platforms', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MMM/USD', '3M', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MO/USD', 'Altria Group', 'XLP', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MOH/USD', 'Molina Healthcare', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MPC/USD', 'Marathon Petroleum', 'XLE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MRK/USD', 'Merck', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MRNA/USD', 'Moderna', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MRVL/USD', 'Marvell Technology', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MS/USD', 'Morgan Stanley', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MSCI/USD', 'MSCI Inc.', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MSFT/USD', 'Microsoft', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MSTR/USD', 'MicroStrategy', 'XLK', true, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('MTCH/USD', 'Match Group', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NBIX/USD', 'Neurocrine Biosciences', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NDAQ/USD', 'Nasdaq Inc.', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NEE/USD', 'NextEra Energy', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NET/USD', 'Cloudflare', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NFLX/USD', 'Netflix', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NIO/USD', 'NIO', 'XLY', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NKE/USD', 'Nike', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NOW/USD', 'ServiceNow', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NTES/USD', 'NetEase', 'XLC', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NTNX/USD', 'Nutanix', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NVAX/USD', 'Novavax', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NVDA/USD', 'Nvidia', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NVO/USD', 'Novo Nordisk', 'XLV', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NVT/USD', 'nVent Electric', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NWS/USD', 'News Corporation (B)', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('NWSA/USD', 'News Corporation (A)', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('O/USD', 'Realty Income', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('OPEN/USD', 'Opendoor Technologies', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ORCL/USD', 'Oracle', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('OXY/USD', 'Occidental Petroleum', 'XLE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PANW/USD', 'Palo Alto Networks', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PATH/USD', 'UiPath', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PCG/USD', 'PG&E', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PDD/USD', 'PDD Holdings', 'XLY', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PEP/USD', 'PepsiCo', 'XLP', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PFE/USD', 'Pfizer', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PG/USD', 'Procter & Gamble', 'XLP', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PGR/USD', 'Progressive', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PH/USD', 'Parker-Hannifin', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PLD/USD', 'Prologis', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PLTR/USD', 'Palantir', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PLUG/USD', 'Plug Power', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PM/USD', 'Philip Morris International', 'XLP', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PNR/USD', 'Pentair', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PRU/USD', 'Prudential Financial', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PSA/USD', 'Public Storage', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PSX/USD', 'Phillips 66', 'XLE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PWR/USD', 'Quanta Services', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('PYPL/USD', 'PayPal', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('QCOM/USD', 'Qualcomm', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('QQQ/USD', 'Nasdaq 100 ETF', 'INDEX_PROXY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('RBLX/USD', 'Roblox', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('REGN/USD', 'Regeneron', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('RGEN/USD', 'Repligen', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('RIVN/USD', 'Rivian', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('RKT/USD', 'Rocket Companies', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('RMD/USD', 'ResMed', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ROK/USD', 'Rockwell Automation', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ROOT/USD', 'Root Inc.', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ROP/USD', 'Roper Technologies', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('RTX/USD', 'RTX Corporation', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SAP/USD', 'SAP', 'XLK', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SHEL/USD', 'Shell', 'XLE', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SHOP/USD', 'Shopify', 'XLK', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SLB/USD', 'Schlumberger', 'XLE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SNDK/USD', 'SanDisk', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SNOW/USD', 'Snowflake', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SO/USD', 'Southern Company', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SOFI/USD', 'SoFi Technologies', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SPG/USD', 'Simon Property Group', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SPGI/USD', 'S&P Global', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SPY/USD', 'S&P 500 ETF', 'INDEX_PROXY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SRE/USD', 'Sempra Energy', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('STZ/USD', 'Constellation Brands', 'XLP', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SUI/USD', 'Sun Communities', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('SUPN/USD', 'Supernus Pharmaceuticals', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('T/USD', 'AT&T', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TAL/USD', 'TAL Education', 'XLY', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TAP/USD', 'Molson Coors', 'XLP', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TER/USD', 'Teradyne', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TEVA/USD', 'Teva Pharmaceuticals', 'XLV', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TGT/USD', 'Target', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('THC/USD', 'Tenet Healthcare', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TME/USD', 'Tencent Music', 'XLC', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TMO/USD', 'Thermo Fisher Scientific', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TMUS/USD', 'T-Mobile', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TONX/USD', 'TONX Inc.', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TOTL/USD', 'DoubleLine Total Return ETF', 'BROAD_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TRV/USD', 'Travelers', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TSLA/USD', 'Tesla', 'XLY', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TT/USD', 'Trane Technologies', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('TXN/USD', 'Texas Instruments', 'XLK', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('UBER/USD', 'Uber', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('UHS/USD', 'Universal Health Services', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('UL/USD', 'Unilever', 'XLP', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('UPS/USD', 'UPS', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('URI/USD', 'United Rentals', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('UWMC/USD', 'UWM Holdings', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('VIA/USD', 'Via Renewables', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('VICI/USD', 'VICI Properties', 'XLRE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('VLO/USD', 'Valero Energy', 'XLE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('VOYA/USD', 'Voya Financial', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('VRTX/USD', 'Vertex Pharmaceuticals', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('VTRS/USD', 'Viatris', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('VZ/USD', 'Verizon', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('WBD/USD', 'Warner Bros. Discovery', 'XLC', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('WFC/USD', 'Wells Fargo', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('XBI/USD', 'SPDR S&P Biotech ETF', 'BROAD_ETF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('XEL/USD', 'Xcel Energy', 'XLU', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('XOM/USD', 'ExxonMobil', 'XLE', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('XPEV/USD', 'XPeng', 'XLY', false, true, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('XYL/USD', 'Xylem', 'XLI', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('XYZ/USD', 'Block (XYZ)', 'XLF', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb),
  ('ZTS/USD', 'Zoetis', 'XLV', false, false, '{"coingecko":false,"kraken_ws_accept":false,"finnhub":false,"override_applied":true,"seed":true}'::jsonb)
ON CONFLICT (symbol) DO NOTHING;
ON CONFLICT (symbol) DO NOTHING;

-- xstock_spot_universe_overrides seed (56 rows: cryptoAdjacent / adr / non-GICS sector classifications)

INSERT INTO xstock_spot_universe_overrides (symbol, sector_override, crypto_adjacent_override, adr_override, name_override, notes) VALUES
INSERT INTO xstock_spot_universe_overrides (symbol, sector_override, crypto_adjacent_override, adr_override, name_override, notes) VALUES
  ('ARKG/USD', 'BROAD_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=BROAD_ETF'),
  ('ARKK/USD', 'BROAD_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=BROAD_ETF'),
  ('ASML/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('BABA/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('BHC/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('BIDU/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('BILI/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('BLDP/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('BNTX/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('BTBT/USD', NULL, true, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: cryptoAdjacent'),
  ('BTI/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('BUD/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('CIFR/USD', NULL, true, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: cryptoAdjacent'),
  ('CLSK/USD', NULL, true, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: cryptoAdjacent'),
  ('COIN/USD', NULL, true, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: cryptoAdjacent'),
  ('CRCL/USD', NULL, true, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: cryptoAdjacent'),
  ('DEO/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('DFDV/USD', NULL, true, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: cryptoAdjacent'),
  ('EDU/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('EWA/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('EWC/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('EWG/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('EWI/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('EWL/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('EWN/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('EWP/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('EWQ/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('EWS/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('EWU/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('EWZ/USD', 'INTL_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INTL_ETF'),
  ('GLD/USD', 'BROAD_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=BROAD_ETF'),
  ('GLOB/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('GLXY/USD', NULL, true, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: cryptoAdjacent'),
  ('GOTU/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('HIVE/USD', NULL, true, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: cryptoAdjacent'),
  ('HUT/USD', NULL, true, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: cryptoAdjacent'),
  ('IEMG/USD', 'BROAD_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=BROAD_ETF'),
  ('JD/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('LI/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('MSTR/USD', NULL, true, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: cryptoAdjacent'),
  ('NIO/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('NTES/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('NVO/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('PDD/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('QQQ/USD', 'INDEX_PROXY', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INDEX_PROXY'),
  ('SAP/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('SHEL/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('SHOP/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('SPY/USD', 'INDEX_PROXY', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=INDEX_PROXY'),
  ('TAL/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('TEVA/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('TME/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('TOTL/USD', 'BROAD_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=BROAD_ETF'),
  ('UL/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR'),
  ('XBI/USD', 'BROAD_ETF', NULL, NULL, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: sector=BROAD_ETF'),
  ('XPEV/USD', NULL, NULL, true, NULL, 'B79.0n.UNIVERSE-DISCOVERY seed: ADR')
ON CONFLICT (symbol) DO NOTHING;
ON CONFLICT (symbol) DO NOTHING;

-- =====================================================================
-- _migrations ledger entry (matches B-NEW-36 sub-batch (a) pattern)
-- =====================================================================

INSERT INTO _migrations (filename, applied_at) VALUES
  ('2026-05-21-b79-0n-universe-discovery.sql', now())
ON CONFLICT (filename) DO NOTHING;

COMMIT;
