# Schema Reference v1.5.2

## Directive 11.1A — Persistent Intelligence: SQL-based Telemetry Persistence

**Schema Version:** v1.5.2  
**Directive:** 11.1A  
**Metric Engine:** v1.0 (Canonical)  
**Date:** January 2026

---

## Overview

This document serves as the official schema reference for DawnTrader v3.1 after the completion of Directive 11.1A. It covers the new telemetry_history table, market regime tagging, and SQL-based persistence mechanisms.

---

## New Table: telemetry_history

The `telemetry_history` table provides durable, SQL-backed persistence for adaptive telemetry data.

### Columns

| Column | Type | Required | Description |
|--------|------|----------|-------------|
| `id` | VARCHAR | Yes | Primary key (UUID) |
| `mode` | ENUM | Yes | Trading mode (`paper` or `live`) |
| `symbol` | VARCHAR(20) | Yes | Trading pair symbol |
| `regime` | ENUM | Yes | Market regime at capture time |
| `final_score` | DECIMAL(5,4) | Yes | FinalScore metric |
| `hybrid_score` | DECIMAL(5,4) | No | Hybrid strategy score |
| `regime_weight` | DECIMAL(5,4) | No | Market regime weight |
| `predictive_confidence` | DECIMAL(5,4) | No | ML predictive confidence |
| `success_rate` | DECIMAL(5,4) | No | Historical success rate |
| `sample_count` | INTEGER | No | Number of samples |
| `timeframe` | VARCHAR(10) | No | Timeframe (1h, 15m, 5m) |
| `checksum` | VARCHAR(64) | No | SHA-256 integrity checksum |
| `metadata` | JSONB | No | Additional metadata |
| `timestamp` | TIMESTAMP | Yes | Telemetry capture time |
| `persisted_at` | TIMESTAMP | Yes | Database persistence time |

### Indexes

| Index | Columns | Purpose |
|-------|---------|---------|
| `telemetry_history_regime_idx` | regime | Efficient regime-based queries |
| `telemetry_history_symbol_idx` | symbol | Symbol lookup |
| `telemetry_history_mode_timestamp_idx` | mode, timestamp | Time-series queries |

---

## Market Regime Enum

The `market_regime` enum classifies market conditions:

| Value | Description |
|-------|-------------|
| `EXTREME_NOISE` | High volatility, auto-veto zone |
| `BULL_STABLE` | Uptrend with low volatility |
| `BULL_VOLATILE` | Uptrend with high volatility |
| `BEAR_STABLE` | Downtrend with low volatility |
| `BEAR_VOLATILE` | Downtrend with high volatility |
| `LOW_VOL_CHOP` | Sideways/range-bound market |

---

## Telemetry Repository API

### Functions

```typescript
// Load recent telemetry by regime
loadRecentTelemetry(regime: MarketRegime, mode?: 'live' | 'paper', limit?: number): Promise<TelemetryHistory[]>

// Save telemetry record with checksum
saveTelemetryRecord(entry: TelemetryEntry): Promise<boolean>

// Batch save telemetry records
saveTelemetryBatch(entries: TelemetryEntry[]): Promise<number>

// Compute SHA-256 checksum
computeTelemetryChecksum(entry: TelemetryEntry): string

// Verify record checksum
verifyTelemetryChecksum(record: TelemetryHistory): boolean

// Check if persistence is enabled
shouldPersist(): boolean
```

---

## Environment Guards

| Variable | Values | Description |
|----------|--------|-------------|
| `MODE` | `paper`, `live` | Trading mode |
| `FORCE_PERSIST` | `true`, `false` | Override for testing |
| `PERSIST_TELEMETRY` | `true`, `false` | Disable persistence |

### Persistence Logic

```
shouldPersist() = (MODE === 'live' && PERSIST_TELEMETRY !== 'false') || FORCE_PERSIST === 'true'
```

---

## Checksum Validation

Telemetry checksums are computed using SHA-256:

```typescript
const input = JSON.stringify({
  symbol: entry.symbol,
  mode: entry.mode,
  regime: entry.regime,
  finalScore: entry.finalScore,
  schemaVersion: SCHEMA_VERSION,
  metricEngineVersion: METRIC_ENGINE_VERSION,
});
const checksum = crypto.createHash('sha256').update(input).digest('hex');
```

---

## Telemetry Aggregator Integration

The `TelemetryAggregatorService` now includes:

```typescript
// Update current market regime
updateMarketRegime(metrics: DSSMetrics): MarketRegime

// Get current market regime
getCurrentMarketRegime(): MarketRegime

// Rehydrate state from SQL on startup
rehydrateTelemetryState(): Promise<number>
```

---

## Migration File

The formal migration file for v1.5.2 is located at:

```
drizzle/migrations/2026-11-1A-persistent-intelligence.sql
```

---

## Governance Rules

1. **JSON file persistence is deprecated** — The file `telemetry_history.json` must be deleted
2. **SQL-only storage** — All telemetry writes and reads use the SQL repository layer
3. **Mandatory regime tagging** — Every telemetry record must include market regime
4. **FORCE_PERSIST restriction** — Only for non-production environments

---

## Schema Version History

| Version | Directive | Date | Description |
|---------|-----------|------|-------------|
| v1.5.2 | 11.1A | 2026-01-08 | Persistent Intelligence - SQL-based Telemetry |
| v1.5.1 | 11.0G | 2026-01-08 | Schema Integrity & Telemetry Validation Hardening |
| v1.5.0 | 11.0F | 2026-01-08 | Legacy Data Purge & Schema Finalization |
| v1.4.6 | 11.0E | 2026-01-07 | FinalScore Transition Phase |

---

## Next Steps

After v1.5.2 verification:
- Proceed to Directive 11.1B — Adaptive Weight Persistence
- Leverage regime-tagged telemetry for predictive intelligence calibration
