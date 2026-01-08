# Directive 11.0 Summary — Metric Engine Consolidation

## Overview

Directive 11.0 represents the complete transition from legacy multi-metric scoring (CWQI, NGC, ProfitRate) to the unified FinalScore metric system. This three-phase initiative (11.0E, 11.0F, 11.0G) establishes FinalScore as the sole operational metric for signal quality evaluation.

---

## Phase 11.0E — FinalScore Transition Phase

**Schema Version:** v1.4.6  
**Status:** Complete

### Objectives
- Deprecate legacy metrics (CWQI, NGC, ProfitRate) in favor of FinalScore
- Establish the canonical FinalScore formula
- Update Signal Quality Evaluator (SQE) to use FinalScore-based filtering

### Key Changes
1. **Formula Definition**: Established the canonical FinalScore calculation:
   ```
   FinalScore = (HybridScore × 0.4) + (Confidence × 0.3) + (RegimeWeight × 0.2) - (DecayPenalty × 0.1)
   ```

2. **Threshold Standardization**: Set `MIN_FINAL_SCORE = 0.35` as the universal quality threshold

3. **SQE Integration**: Signal Quality Evaluator updated to filter by `finalScoreMin` and `regimeWeightMin`

4. **Deprecation Markers**: Legacy columns (cwqi, ngc, profit_rate) marked for removal

---

## Phase 11.0F — Legacy Data Purge & Schema Finalization

**Schema Version:** v1.5.0  
**Status:** Complete

### Objectives
- Permanently remove legacy metric columns from database schema
- Archive historical metric data for audit purposes
- Lock scoring coefficients as immutable constants

### Key Changes
1. **Column Removal**: Dropped `cwqi`, `ngc`, and `profit_rate` columns from `rtb_signals` table

2. **Legacy Archive Created**: 
   - File: `server/legacy/data/legacy_metrics_snapshot.json`
   - Contains archived metric definitions and formulas

3. **Immutable Coefficients**: Score weights locked in `server/config/scoring-coefficients.ts`:
   ```typescript
   export const SCORE_WEIGHTS = Object.freeze({
     HYBRID: 0.4,
     CONFIDENCE: 0.3,
     REGIME: 0.2,
     DECAY: 0.1
   });
   ```

4. **Metric Engine v1.0**: Declared FinalScore as the canonical and sole operational metric

---

## Phase 11.0G — Schema Integrity & Telemetry Validation Hardening

**Schema Version:** v1.5.1  
**Status:** Complete

### Objectives
- Create formal migration file with audit trail
- Implement archive integrity verification (SHA-256 checksums)
- Add telemetry schema validation between backend and frontend
- Enforce ExecutionConfig read-only lock

### Key Changes

1. **Formal Migration File**:
   - File: `drizzle/migrations/2026-11-0G-schema-hardening.sql`
   - Contains deprecation markers and audit comments
   - Documents column assertions for FinalScore-era schema

2. **Archive Integrity Checksum**:
   - Functions: `sealLegacyArchive()`, `verifyArchiveIntegrity()`
   - Uses SHA-256 for tamper detection
   - Checksum stored in `archiveChecksum` field

3. **Schema Version Tracking**:
   - File: `server/config/schema-version.ts`
   - Exports: `SCHEMA_VERSION`, `SCHEMA_DIRECTIVE`, `METRIC_ENGINE_VERSION`
   - Includes `SCHEMA_HISTORY` array for version tracking

4. **Telemetry Schema Validation**:
   - Method: `validateSchemaSync(frontendVersion)`
   - Returns health status: green (match), yellow (mismatch), red (critical)
   - Exposed in telemetry summary via `schemaSync` object

5. **ExecutionConfig Read-Only Lock**:
   - TEC configuration is `Object.freeze()`'d
   - Telemetry exposes `readOnly: true` flag
   - Prevents runtime modification

6. **Integration Test Suite**:
   - File: `server/tests/integration/schema_v1_5_1.test.ts`
   - Tests: version tracking, checksum validation, telemetry sync, config immutability

---

## Final Schema State (v1.5.1)

### RTB Signals Table — Active Columns
| Column | Type | Required | Purpose |
|--------|------|----------|---------|
| final_score | DECIMAL(5,4) | Yes | Primary ranking metric |
| confidence | DECIMAL(5,4) | Yes | Signal confidence |
| risk_score | DECIMAL(5,4) | Yes | Risk assessment |
| expected_return | DECIMAL(5,4) | Yes | Expected return |
| regime_weight | DECIMAL(5,4) | No | Market regime alignment |
| hybrid_score | DECIMAL(5,4) | No | Hybrid strategy score |
| decay_penalty | DECIMAL(5,4) | No | Signal age decay |

### Removed Columns (Permanently Deleted)
- `cwqi` — Replaced by `final_score`
- `ngc` — Incorporated into `confidence`
- `profit_rate` — Removed entirely

---

## File Artifacts

| File | Purpose |
|------|---------|
| `server/config/schema-version.ts` | Schema version constants |
| `server/config/scoring-coefficients.ts` | Immutable score weights |
| `server/config/execution-config.ts` | Frozen TEC configuration |
| `server/legacy/metrics_archive.ts` | Archive checksum functions |
| `server/legacy/data/legacy_metrics_snapshot.json` | Archived legacy metrics |
| `server/services/telemetry-aggregator.ts` | Schema validation methods |
| `drizzle/migrations/2026-11-0G-schema-hardening.sql` | Formal migration file |
| `server/tests/integration/schema_v1_5_1.test.ts` | Integration tests |
| `docs/schema_reference_v1_5_1.md` | Complete schema reference |

---

## Summary

Directive 11.0 successfully consolidated the trading engine's signal scoring from three legacy metrics to a single, unified FinalScore. The implementation includes:

- Canonical formula with immutable coefficients
- Complete database schema cleanup
- Archive integrity with cryptographic verification
- Frontend/backend schema synchronization
- Comprehensive test coverage
- Full documentation trail

**Next Steps**: Tag schema `v1.5.1-final` and proceed to Directive 11.1 — Persistent Intelligence
