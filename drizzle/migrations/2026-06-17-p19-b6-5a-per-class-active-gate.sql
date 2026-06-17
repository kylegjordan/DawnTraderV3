-- P19-B6.5a — per-asset-class active gate (Langston Option C ruling; Q-A = JSONB on system_context).
--
-- Adds a fail-closed, default-OFF per-(mode, asset_class) active flag, co-located on the existing
-- per-mode `system_context` row (the read is already in hand at every gate via getSystemContext(mode),
-- so this adds NO new hot-path query — fx5 scans every 30s).
--
-- Semantics: a class is active in a mode IFF active_asset_classes ->> '<class>' = 'true'. A MISSING
-- key = inactive = FAIL-CLOSED. The gate is ADDITIONAL (never a replacement): a class trades iff
--   isEngineActive(mode) === true  AND  isAssetClassActive(mode, class) === true.
--
-- ADDITIVE + DORMANT: shipping this changes NOTHING about today's behavior — both classes default OFF,
-- and isEngineActive is already false in VTS/passive. The gate can only ever RESTRICT. B7b crypto-first
-- becomes expressible as: master ON + crypto_spot ON + xstock_spot OFF (xStock stays dormant even with
-- the master flag flipped).
ALTER TABLE system_context
  ADD COLUMN IF NOT EXISTS active_asset_classes jsonb NOT NULL DEFAULT '{}'::jsonb;
