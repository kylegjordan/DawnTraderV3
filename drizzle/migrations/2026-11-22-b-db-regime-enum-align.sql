-- B-DB-REGIME-ENUM-ALIGN (#1263) — make every canonical regime storable in telemetry_history.regime and
-- adaptive_learning.regime.
--
-- The defect: market_regime was created with the six pre-canonical labels (2026-04-22-initial-schema.sql:534,
-- 2026-11-1A-persistent-intelligence.sql:38) and never extended, while the regime system emits only the canonical
-- five (CANONICAL_REGIMES, server/config/canonical-regime-strategy-map.ts). The telemetry writer always carries a
-- canonical label, so every telemetry_history insert it attempts is refused by the enum. The writer is gated off
-- in paper mode (shouldPersist), so nothing is being lost today; the refusal would bite the first live-mode write.
--
-- HIGH_VOL_IMPULSE is deliberately NOT added: it is a ghost label, normalized to IMPULSE_EXPANSION at the writer
-- (GHOST_REGIME_NORMALIZATION). shared/schema.ts drops it in the same commit, so the declared pgEnum equals the
-- stored type (six original + these five).
--
-- PG enum DDL: precedent 2026-11-05-b-balance-session-pairing-block-reasons.sql. IF NOT EXISTS makes each
-- statement idempotent. Adding a value rewrites no rows. A drift test
-- (server/tests/unit/b-db-regime-enum-align.test.ts) fails CI if a canonical regime, or a declared pgEnum value,
-- is ever not storable here.

ALTER TYPE market_regime ADD VALUE IF NOT EXISTS 'TREND_FRIENDLY_STABLE';
ALTER TYPE market_regime ADD VALUE IF NOT EXISTS 'HIGH_VOLATILITY_UNSTABLE';
ALTER TYPE market_regime ADD VALUE IF NOT EXISTS 'RANGE_BOUND_STABLE';
ALTER TYPE market_regime ADD VALUE IF NOT EXISTS 'IMPULSE_EXPANSION';
ALTER TYPE market_regime ADD VALUE IF NOT EXISTS 'STRUCTURAL_TRANSITION';
