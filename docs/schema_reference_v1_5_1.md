# Schema Reference v1.5.1

## Directive 11.0G — Schema Integrity & Telemetry Validation Hardening

**Schema Version:** v1.5.1  
**Directive:** 11.0G  
**Metric Engine:** v1.0 (Canonical)  
**Date:** January 2026

---

## Overview

This document serves as the official schema reference for DawnTrader v3.1 after the completion of Directive 11.0G. It covers the finalized database schema, metric formulas, and validation mechanisms.

---

## RTB Signals Table Schema

The `rtb_signals` table is the primary queue for Ready-to-Buy signals.

### Active Columns (v1.5.1)

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | VARCHAR | Yes | Primary key (UUID) |
| `mode` | ENUM | Yes | Trading mode (`paper` or `live`) |
| `signal_id` | VARCHAR(100) | Yes | SLAL signal identifier |
| `symbol` | VARCHAR(20) | Yes | Trading pair symbol |
| `strategy` | ENUM | Yes | Strategy type |
| `entry_price` | DECIMAL(20,8) | Yes | Entry price for the trade |
| `stop_price` | DECIMAL(20,8) | Yes | Stop-loss price |
| `target_price` | DECIMAL(20,8) | No | Target exit price |
| `quantity` | DECIMAL(20,8) | No | Position quantity |
| `notional` | DECIMAL(20,2) | No | Position notional value |
| `confidence` | DECIMAL(5,4) | Yes | Signal confidence (0-1) |
| `risk_score` | DECIMAL(5,4) | Yes | Risk score (0-1, lower is better) |
| `expected_return` | DECIMAL(5,4) | Yes | Expected return (0-1) |
| `final_score` | DECIMAL(5,4) | Yes | **Primary ranking metric** |
| `regime_weight` | DECIMAL(5,4) | No | Market regime alignment |
| `hybrid_score` | DECIMAL(5,4) | No | Hybrid strategy score |
| `decay_penalty` | DECIMAL(5,4) | No | Signal age decay factor |
| `current_price` | DECIMAL(20,8) | No | Price at queue time |
| `volume_24h` | DECIMAL(20,2) | No | 24h USD volume |
| `status` | ENUM | Yes | Signal status |
| `queued_at` | TIMESTAMP | Yes | Queue timestamp |
| `promoted_at` | TIMESTAMP | No | Promotion timestamp |
| `expired_at` | TIMESTAMP | No | Expiration timestamp |
| `expires_at` | TIMESTAMP | No | Scheduled expiry (optional) |
| `last_refreshed_at` | TIMESTAMP | No | Last refresh timestamp |
| `missed_refreshes` | INTEGER | No | Failed refresh count |
| `block_reason` | VARCHAR(50) | No | Capacity block reason |
| `promoted_trade_id` | VARCHAR | No | Trade ID if promoted |
| `metadata` | JSONB | No | Additional signal data |

### Deprecated Columns (Removed in v1.5.0)

The following columns have been permanently removed per Directive 11.0F:

- `cwqi` — Replaced by `final_score`
- `ngc` — Incorporated into `confidence` component
- `profit_rate` — Removed entirely

---

## FinalScore Formula (Metric Engine v1.0)

The canonical FinalScore formula is:

```
FinalScore = (HybridScore × 0.4) + (Confidence × 0.3) + (RegimeWeight × 0.2) - (DecayPenalty × 0.1)
```

### Score Weights

| Component | Weight | Range |
|-----------|--------|-------|
| HybridScore | 0.4 | 0.0 - 1.0 |
| Confidence | 0.3 | 0.0 - 1.0 |
| RegimeWeight | 0.2 | 0.0 - 1.0 |
| DecayPenalty | 0.1 | 0.0 - 0.1 |

### Minimum Threshold

- `MIN_FINAL_SCORE = 0.35` — Signals below this threshold are rejected

---

## Archive Integrity (Directive 11.0G)

Legacy metric data is preserved in `server/legacy/data/legacy_metrics_snapshot.json` with SHA-256 checksum validation.

### Checksum Functions

```typescript
import { sealLegacyArchive, verifyArchiveIntegrity } from './legacy/metrics_archive';

// Seal archive with checksum
const sealed = sealLegacyArchive(data);

// Verify archive integrity
const isValid = verifyArchiveIntegrity(sealed);
```

---

## Telemetry Schema Validation (Directive 11.0G)

The telemetry aggregator now validates schema versions between backend and frontend:

```typescript
const telemetry = getTelemetryAggregator();
const validation = telemetry.validateSchemaSync(frontendSchemaVersion);
// Returns: { isValid, health, mismatchReason }
```

### Health Status

| Status | Meaning |
|--------|---------|
| 🟢 green | Schema versions match |
| 🟡 yellow | Version mismatch or frontend version missing |
| 🔴 red | Critical validation failure |

---

## ExecutionConfig Read-Only Lock

The TEC (Trade Execution Controller) configuration is immutable at runtime:

```typescript
export const EXECUTION_CONFIG = Object.freeze({
  ADAPTIVE_EXPAND_FACTOR: 1.10,
  ADAPTIVE_CONTRACT_FACTOR: 0.90,
  TRAILING_STOP_BASE: 0.015,
  TRAILING_STOP_ACCELERATION: 0.002,
  MAX_POSITION_RISK: 0.02,
  VERSION: "v1.0.0"
});
```

The `readOnly: true` flag is exposed in telemetry to prevent UI modification.

---

## Schema Version History

| Version | Directive | Date | Description |
|---------|-----------|------|-------------|
| v1.5.1 | 11.0G | 2026-01-08 | Schema Integrity & Telemetry Validation Hardening |
| v1.5.0 | 11.0F | 2026-01-08 | Legacy Data Purge & Schema Finalization |
| v1.4.6 | 11.0E | 2026-01-07 | FinalScore Transition Phase |

---

## Migration File

The formal migration file for v1.5.1 is located at:

```
drizzle/migrations/2026-11-0G-schema-hardening.sql
```

---

## Next Steps

After v1.5.1 verification:
- Tag schema: `v1.5.1-final`
- Begin Directive 11.1 — Persistent Intelligence
