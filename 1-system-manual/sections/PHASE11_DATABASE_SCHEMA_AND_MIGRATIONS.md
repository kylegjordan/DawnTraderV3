# Phase 11: Database Schema & Migrations

> **Author**: Claude Code (System Cartographer)
> **Date**: 2026-02-17
> **Scope**: Database schema (shared/schema.ts), table inventory, enum definitions, migration infrastructure, connection management, data access patterns, legacy table identification
> **Status**: Complete

---

## 1. Database Infrastructure Overview

| Component | Technology | Version | Config File |
|-----------|-----------|---------|-------------|
| **Database** | PostgreSQL (Neon Serverless) | — | `DATABASE_URL` env var |
| **ORM** | Drizzle ORM | ^0.39.1 | `server/db.ts` |
| **Schema Validation** | drizzle-zod | ^0.7.0 | `shared/schema.ts` |
| **Migration Tool** | Drizzle Kit | ^0.31.4 | `drizzle.config.ts` |
| **Connection Pool** | @neondatabase/serverless | ^0.10.4 | `server/db.ts` |
| **WebSocket Transport** | ws | ^8.18.0 | `server/db.ts` |
| **Vector Extension** | pgvector | — | Used for `semantic_memory.embedding` |

### Connection Configuration

**File**: `server/db.ts` (16 lines)

```
neonConfig.webSocketConstructor = ws;  // WebSocket for Neon serverless
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle({ client: pool, schema });
```

- **Pool type**: Neon Serverless Pool (built-in connection pooling for edge/serverless)
- **No explicit pool settings**: max connections, idle timeout, etc. are all Neon defaults
- **Single export**: `db` instance used throughout the application
- **No pool monitoring**: Pool stats are not exposed to the health monitor (health monitor checks DB via query, not pool metrics)

### Architecture: Single-Tenant with Mode Isolation

- **Single-tenant**: One user, one database instance. `user_id` columns removed from 5 operational tables (Phase 2C migration)
- **Mode isolation**: `trading_mode` enum (`live` | `paper`) separates data at the row level. Most trading tables have a `mode` column with unique indexes enforcing one-row-per-mode for config tables
- **globalContextId**: Present in several tables with default `"default"` — remnant of an earlier multi-context architecture, now vestigial

---

## 2. Schema File Statistics

**File**: `shared/schema.ts` — **4,836 lines**

| Metric | Count |
|--------|-------|
| Tables (pgTable) | ~160 |
| Enum definitions (pgEnum) | ~80 |
| Insert schemas (createInsertSchema) | ~60 |
| Type exports (z.infer + $inferSelect) | ~120 |
| Relations definitions | 14 |
| Indexes (total) | ~200+ |
| Vector columns (pgvector) | 1 (`semantic_memory.embedding`, 1536 dimensions) |
| JSON columns (jsonb) | ~50+ |

---

## 3. Table Classification — Active vs. Legacy

### Tier 1: Core Trading Pipeline (ACTIVE) — ~35 tables

These tables serve the canonical paper/live trading flow:

| Table | Purpose | Key Columns | Mode Isolated |
|-------|---------|-------------|---------------|
| `users` | Auth, roles, preferences | id (UUID), username, email, tradingMode, tradingStatus, userRole, approvalMatrix (jsonb) | N (single user) |
| `trading_settings` | Per-user trading config | ~45 columns, FK to users, uniqueIndex(userId) | Y |
| `guardrails_v2` | Risk management (active version) | ~25 columns, uniqueIndex(mode) | Y |
| `screener_filters` | FX5 filter configuration | ~25 columns, uniqueIndex(mode), 4 jsonb columns | Y |
| `strategy_settings` | Per-strategy parameters | uniqueIndex(contextId, mode, strategy), params (jsonb) | Y |
| `strategy_settings_audit` | Strategy change history | prevParams/nextParams (jsonb) | Y |
| `watchlist_pairs` | Active watchlist | unique(mode, symbol) | Y |
| `trading_signals` | Signal detection log | 3 indexes, metadata (jsonb) | Y |
| `trades` | Live/paper trade records | 22 columns, 2 indexes, metadata (jsonb) | Y |
| `portfolio_state` | Balance tracking | uniqueIndex(contextId, mode) | Y |
| `paper_sim_trades` | Paper simulation trades | ~30 columns, 4 indexes | Y (paper only) |
| `paper_sim_open_positions` | Open paper positions | ~25 columns, uniqueIdx on symbol | Y (paper only) |
| `paper_sim_trade_logs` | Paper trade event log | 3 indexes, metadata (jsonb) | N |
| `paper_sim_sessions` | Paper session management | 3 indexes, metadata (jsonb) | N |
| `rtb_signals` | Ready-to-Brief signal queue | ~25 columns, 5 indexes | Y |
| `execution_attempt_audit` | Execution decision log | 14 columns, 5 indexes, executionDecision/blockReason enums | Y |
| `system_context` | Engine state / LATTI | ~25 columns, 3 indexes, extensive defaults | Y |
| `telemetry_history` | Signal telemetry persistence | 14 columns, 4 indexes, marketRegime enum | Y |
| `adaptive_learning` | Adaptive weight persistence | weights/metadata (jsonb), marketRegime enum | Y |
| `daily_performance_summary` | Performance tracking | 3 indexes | Y |
| `screener_results` | Screener output | uniqueIndex(mode, scannedAt) | Y |
| `system_settings` | Key-value system config | PK = varchar(key), FK to users | N |
| `system_config` | System flags (jsonb typed) | systemFlags with passiveLearning flag | N |
| `config_registry` | Runtime config | unique(key), value (jsonb) | N |
| `goals_presets` | Goal configuration | uniqueIndex(mode, name), goalsPresetName enum | Y |
| `goals_learning_metrics` | Goal learning metrics | index(mode, date) | Y |
| `goals_live` / `goals_paper` | Goal state per mode | 7 columns each | Y (separate tables) |
| `goal_audit_log` | Goal change history | 8 columns | N |
| `safety_telemetry` | Safety guardrail checks | 14 columns | N |
| `telemetry_lineage` | Data flow lineage | 6 columns | N |
| `kill_switch_events` | Kill switch history | 12 columns | N |
| `error_logs` | Error diagnosis | 10 columns | N |
| `system_alerts` | System alerts | 10 columns | N |

### Tier 2: Walter AI Assistant — 10 tables (LEGACY per Wave 3)

| Table | Purpose | Lines |
|-------|---------|-------|
| `walter_chats` | Chat sessions | 939-953 |
| `walter_pending_approvals` | Approval queue | 956-979 |
| `walter_chat_logs` | Messages | 982-993 |
| `walter_approvals_audit` | Approval history | 996-1009 |
| `walter_execution_log` | Action execution | 1012-1038 |
| `walter_purpose` | Walter purpose config | 1041-1051 |
| `walter_memory` | Memory store | 1054-1069 |
| `walter_user_preferences` | UI preferences | 1072-1082 |
| `walter_actions` | Autonomous actions | 1087-1139 |
| `execution_config` | Auto-execution config | 1142-1158 |

All 10 Walter tables have FK relationships to `users`. These tables will become dead when the Walter backend is removed in Wave 3.

### Tier 3: AI Analytics & Reports — 14 tables (ACTIVE)

| Table | Purpose |
|-------|---------|
| `ai_reports` | AI-generated reports |
| `ai_conversations` | AI chat sessions |
| `ai_chat_logs` | Chat message/token tracking |
| `conversation_summaries` | Conversation compression |
| `response_cache` | API response cache |
| `semantic_memory` | Vector embeddings (pgvector, 1536d) |
| `ai_market_analyses` | Market regime classification |
| `ai_opportunity_runs` | Opportunity batch runs |
| `ai_opportunities` | AI-generated trade opportunities |
| `daily_briefs` | Daily narrative summaries |
| `ai_audit_log` | GPT action audit |
| `ai_transparency_log` | Scheduler transparency |
| `ai_orchestrator_logs` | AI orchestrator |
| `context_chats` | Context-tab chats |

### Tier 4: L-Series Cognitive Architecture — ~32 tables (LEGACY)

**Phases 8.6–10.0**: These tables represent an aspirational multi-agent cognitive system that was designed but likely never fully populated:

| Phase | Tables | System |
|-------|--------|--------|
| 8.6.3 | `data_lineage`, `bob_trace_log` | Provenance, Bob module traces |
| 8.7.2-8.7.4 | `intent_audit_log`, `context_bridge_log` | Intent execution, WebSocket bridge |
| 8.8.1-8.8.4 | `reasoning_trace`, `reasoning_queue`, `memory_audit_log`, `cognitive_tuning_log` | Reasoning orchestrator, memory lifecycle, cognitive tuning |
| 8.9.1-8.9.4 | `autonomy_audit_log`, `meta_reasoning_log`, `awareness_state_log` | Autonomy, meta-reasoning, awareness |
| 9.0 | `experience_memory_log`, `alignment_policies`, `alignment_audit_log`, `goal_alignment_profile` | Experience memory, alignment |
| 9.2 | `strategic_plan_log`, `learning_weight_profile` | Strategic planning, learning weights |
| 9.3 | `strategic_simulation_log`, `decision_trace_log`, `strategic_memory_snapshot` | Simulations, decision traces |
| 9.4 | `reflection_log`, `decision_quality_audit` | Self-reflection, decision quality |
| 9.5 | `value_alignment_matrix` | Value alignment |
| 9.6 | `collaboration_sessions`, `collaboration_messages`, `consensus_snapshots` | Cross-domain collaboration |
| 9.7 | `agent_learning_feedback` | Agent feedback |
| 9.8 | `meta_cognition_log` | Meta-cognition |
| 9.9 | `strategic_memory_archive`, `model_calibration_log` | Long-term memory, calibration |
| 10.0 | `cognitive_core_state`, `agent_registry` | Cognitive core, agent registry |

### Tier 5: Safety, Ethics & Governance — ~16 tables (LEGACY)

**Phases 11–16**: An aspirational governance framework:

| Phase | Tables | System |
|-------|--------|--------|
| 11.0 | `safety_policy`, `safety_event_log`, `kill_switch` (Phase 11) | Safety guardrails (not the active kill_switch_events) |
| 13.0 | `ethical_principle`, `ethical_violation_log` | Ethical principles |
| 14.0 | `federated_ethics_state`, `cross_agent_ethics_session`, `ethics_conflict_register`, `ethics_propagation_journal` | Federated ethics |
| 15.0 | `bias_observation_log`, `confidence_drift_log`, `introspection_report`, `bias_correction_log` | Bias detection, introspection |
| 16.0 | `knowledge_retrieval_log`, `knowledge_cache`, `knowledge_trust_record` | Knowledge management |

### Tier 6: Distributed Cluster — 9 tables (LEGACY)

**Phases 17–18**: A distributed multi-node architecture:

| Table | Phase | Purpose |
|-------|-------|---------|
| `cluster_node` | 17.0 | Node registry |
| `cluster_task_queue` | 17.0 | Task queue |
| `cluster_result_log` | 17.0 | Result tracking |
| `cluster_bus_event` | 17.0 | Event bus |
| `cluster_circuit_breaker` | 17.5 | Circuit breaker |
| `cluster_audit_log` | 17.6 | Gate audit |
| `agent_learning_delta` | 18 | Learning deltas |
| `model_consistency_snapshot` | 18 | Model consistency |
| `cross_node_alignment_log` | 18 | Cross-node alignment |

### Tier 7: Paper-Specific Duplicates — 3 tables (LEGACY)

| Table | Status | Superseded By |
|-------|--------|--------------|
| `paper_trades` | Explicitly marked legacy (line 1226 comment) | `trades` table with mode column |
| `paper_daily_briefs` | Duplicate | `daily_briefs` with mode |
| `paper_ai_reports` | Duplicate | `ai_reports` |

### Tier 8: Other Active Tables — ~20 tables

Tuning, actuation, strategy drive, learning, behavioral, oversight, audit, expert context — these are actively used by the tuning engine, strategy drive system, and expert context modules.

---

## 4. Legacy Table Count Summary

| Category | Table Count | Status |
|----------|------------|--------|
| Core Trading (active) | ~35 | ACTIVE |
| Walter (Wave 3 removal) | 10 | LEGACY |
| AI Analytics (active) | 14 | ACTIVE |
| L-Series Cognitive (Phases 8.6-10.0) | ~32 | LEGACY (aspirational) |
| Safety/Ethics/Governance (Phases 11-16) | ~16 | LEGACY (aspirational) |
| Distributed Cluster (Phases 17-18) | 9 | LEGACY (aspirational) |
| Paper-Specific Duplicates | 3 | LEGACY |
| Tuning/Strategy/Learning/Expert (active) | ~20 | ACTIVE |
| `guardrails` (V1, superseded by V2) | 1 | LEGACY |
| **TOTAL** | **~160** | **~71 legacy (~44%)** |

**~71 tables (~44% of total) serve deprecated or aspirational systems that are not part of the canonical trading pipeline.** These tables exist in the schema definition and presumably in the database, consuming storage and adding DDL complexity. **Important nuance**: Not all legacy tables are fully inert — some (e.g., Walter tables, certain L-Series tables) may still have active writers from background services or lazy-loaded modules that have not been disconnected. These should be classified as "Deprecated — Removal Required" (still written to) rather than "Inert — Safe to Drop" (confirmed zero writers). A pre-drop audit must verify zero active writers for each table before removal.

---

## 5. Enum Definitions (~80 pgEnum)

### Core Trading Enums (actively used)

| Enum | Values | Used By |
|------|--------|---------|
| `tradingModeEnum` | live, paper | Most tables |
| `tradingStatusEnum` | active, stopped | users |
| `strategyTypeEnum` | vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trading, vwap_bounce, liquidity_trap, dhma | trades, signals, strategy_settings |
| `tradeStatusEnum` | open, closed, cancelled | trades |
| `tradeTypeEnum` | buy, sell | trades |
| `signalTypeEnum` | QUANT, PATTERN, HYBRID | rtb_signals, trades |
| `patternTypeEnum` | PINBAR, ENGULFING, INSIDE_BAR, MORNING_STAR, THREE_SOLDIERS | rtb_signals, trades |
| `rtbSignalStatusEnum` | queued, promoted, expired, rejected, reconfirmed, active | rtb_signals |
| `executionDecisionEnum` | OPENED, BLOCKED | execution_attempt_audit |
| `executionBlockReasonEnum` | KILL_SWITCH, NO_STOP_LOSS, ... (13 values) | execution_attempt_audit |
| `marketRegimeEnum` | EXTREME_NOISE, BULL_STABLE, BULL_VOLATILE, BEAR_STABLE, BEAR_VOLATILE, LOW_VOL_CHOP | telemetry_history |
| `userRoleEnum` | owner, editor, admin, trader, viewer | users |
| `goalsPresetNameEnum` | conservative, baseline, optimistic, maximum, custom | goals_presets |

### Walter Enums (legacy)

| Enum | Values | Status |
|------|--------|--------|
| `walterActionTypeEnum` | feed_reconnect, feed_pause, formula_recalc, cache_refresh, health_check, threshold_adjust, auto_suppress, escalate | LEGACY (Wave 3) |
| `walterActionStatusEnum` | pending, in_progress, completed, failed, acknowledged, approved, rejected | LEGACY (Wave 3) |
| `walterActionCategoryEnum` | feed, formula, system, risk, performance | LEGACY (Wave 3) |

### L-Series / Cognitive Enums (~40, all LEGACY)

Phases 8.x through 18 define approximately 40 enums for the cognitive architecture, ethics, governance, and distributed cluster systems. These include: `agentStateEnum`, `reflectionDepthEnum`, `biasTypeEnum`, `knowledgeSourceEnum`, `federatedScopeEnum`, `consensusStateEnum`, `collaborationRoleEnum`, `learningDeltaTypeEnum`, `alignmentStrategyEnum`, `domainChannelEnum`, and many more.

**All ~40 L-Series enums are legacy** — they exist in the database but have no active producers.

---

## 6. Migration Infrastructure

### Migration Directories (Dual — FINDING)

Two separate migration directories exist:

| Directory | Files | Tracked By | Purpose |
|-----------|-------|-----------|---------|
| `migrations/` | 4 files + journal | Drizzle Kit v7 journal (`meta/_journal.json`) | Primary migrations (initial schema + incremental) |
| `drizzle/migrations/` | 5 files | **No journal** — manually numbered | Secondary directive-based migrations |

### Migration Files

**Primary (`migrations/`)**:

| File | Size | Content |
|------|------|---------|
| `0000_flaky_freak.sql` | 162 KB | Initial schema — all tables, 70+ enums, indexes. Single massive DDL file. |
| `0001_familiar_pete_wisdom.sql` | 4 KB | RTB signals table, pattern recognition columns, signal type additions |
| `2025-11-06_single_tenant.sql` | 2 KB | Drops user_id from 5 operational tables, adds mode-based indexes |
| `2025-11-06_value_alignment_mode.sql` | 3 KB | Adds mode column with NOT NULL migration pattern |

**Secondary (`drizzle/migrations/`)**:

| File | Size | Content |
|------|------|---------|
| `2026-11-0G-schema-hardening.sql` | 3 KB | Directive 11.0G: hybrid_score, decay_penalty columns |
| `2026-11-0H-add-pool-to-telemetry.sql` | 594 B | Directive 11.2 R1: pool column on telemetry_history |
| `2026-11-0J-telemetry-sizes.sql` | 559 B | Telemetry sizing adjustments |
| `2026-11-1A-persistent-intelligence.sql` | 4 KB | Directive 11.1A: marketRegimeEnum + telemetry_history table |
| `2026-11-1B-adaptive-learning.sql` | 1.4 KB | Adaptive learning enhancements |

### Migration Management

- **Primary method**: `drizzle-kit push` (pushes schema directly to database — no migration files generated)
- **Migration journal**: Only 2 entries tracked in `_journal.json` (0000 and 0001). The 2025 date-based files and all `drizzle/migrations/` files are NOT in the journal
- **No down migrations**: No rollback files exist. Migrations are forward-only
- **No migration runner in code**: The server does not run migrations on startup. `drizzle-kit push` is the sole mechanism
- **`db:push` script**: The only migration-related npm script

### Migration Concerns

1. **Dual directories**: `migrations/` and `drizzle/migrations/` create confusion about which is canonical
2. **Untracked migrations**: 7 of 9 migration files are not in the Drizzle Kit journal
3. **Push-based workflow**: `drizzle-kit push` compares schema.ts to live DB and pushes changes directly — no review step, no staging
4. **No rollback capability**: Forward-only migrations with no `down()` functions
5. **162 KB initial migration**: The initial schema DDL is a single massive file, making it hard to audit what was in the original schema vs. what was added later

---

## 7. Primary Key Strategies

| Strategy | Usage | Tables |
|----------|-------|--------|
| `varchar(UUID).default(gen_random_uuid())` | ~90% of tables | Most tables |
| `serial` (auto-increment) | ~8 tables | aiOrchestratorLogs, contextChats, lattiBaselineHistory, auditLog, behavioralLog, learningHistory, lottieOversightLog, strategyMixLog |
| `varchar(key)` (natural key) | 1 table | systemSettings |
| `varchar("global_kill_switch")` | 1 table | kill_switch (Phase 11) |

The predominant UUID strategy is good for distributed systems but generates non-sequential keys, which can cause B-tree index fragmentation on PostgreSQL. This is mitigated by Neon's serverless architecture.

---

## 8. Column Type Patterns

| Type | Usage | Notes |
|------|-------|-------|
| `varchar` | IDs, enums, status, symbols | Most common |
| `text` | Long-form content | Narratives, reasons, messages |
| `decimal(precision, scale)` | Financial values | `(20, 8)` for prices, `(5, 4)` for percentages |
| `doublePrecision` | Scores, ratios | Used in later phases (9.x+) instead of decimal |
| `integer` | Counts, thresholds | Limits, trade counts |
| `boolean` | Flags | Toggles, status |
| `jsonb` | Structured metadata | ~50+ columns across all tables |
| `timestamp with timezone` | All time fields | Universal pattern via `{ withTimezone: true }` |
| `date` | Calendar dates | Goals, briefs, reports |
| `text[].array()` | Tag lists | Filter arrays, domain lists |
| `vector(1536)` | OpenAI embeddings | 1 column in semantic_memory |

### Financial Precision

Trading-related tables consistently use `decimal(20, 8)` for prices and quantities, and `decimal(10, 4)` for percentages. This provides 8 decimal places for crypto prices (necessary for BTC sub-satoshi precision) and 4 decimal places for percentage calculations.

**Concern**: Later-phase tables (9.x+) use `doublePrecision` instead of `decimal` for scores and ratios. `doublePrecision` is a floating-point type subject to rounding errors, while `decimal` is exact. For financial calculations, this inconsistency could cause subtle precision issues if double-precision scores flow into decimal-precision trade calculations.

---

## 9. JSON Column Usage

Approximately 50+ columns use `jsonb` across the schema. Key patterns:

| Table | Column | Typed? | Content |
|-------|--------|--------|---------|
| `users` | `approvalMatrix` | No | 15-line default JSON object with approval categories |
| `screener_filters` | `quoteCurrencies`, `activeTimeframes`, `filterOverrides`, `lockedByUser` | No | Array and object filters |
| `strategy_settings` | `params` | No | Strategy-specific parameters |
| `system_context` | `metadata`, `lastSafeState` | No | Engine state snapshots |
| `system_config` | `systemFlags` | **Yes** (`$type<{passiveLearning?: boolean}>`) | Typed JSON — rare pattern |
| `config_registry` | `value` | No | Arbitrary config values |
| `telemetry_history` | `metadata` | No | Signal telemetry context |

**Observation**: Only 1 of ~50 jsonb columns uses Drizzle's `$type<>()` for TypeScript type safety. The rest are untyped `jsonb`, meaning their contents are only validated at the application layer (if at all), not at the ORM/compile level.

---

## 10. Relationship Definitions

14 Drizzle `relations()` are defined (lines 1943–2117), all centered around the `users` table:

```
users → one-to-many → tradingSettings, aiReports, aiConversations, killSwitchEvents,
                       aiOpportunityRuns, aiOpportunities, dailyBriefs, paperDailyBriefs,
                       paperAIReports, learningSources, signalWeights, predictionOutcomes,
                       walterPendingApprovals, walterChats, walterChatLogs, walterApprovalsAudit
```

**Missing relations**: The vast majority of tables (~145 of ~160) have NO Drizzle relations defined. This means:
- Drizzle's relational query API (`db.query.users.findMany({ with: { trades: true } })`) is not available for most tables
- Joins must be done manually using Drizzle's `leftJoin`/`innerJoin` API
- The actual FK relationships exist at the database level (via `.references()`) but are not exposed to the ORM's relational API

---

## 11. Database Monitoring

**File**: `server/services/database-monitor.ts` (77 lines)

| Setting | Value |
|---------|-------|
| Check interval | 24 hours |
| Warning threshold | 6.5 GB (65% of 10 GB Neon limit) |
| Critical threshold | 8 GB (80% of 10 GB limit) |
| Query | `pg_database_size(current_database())` |
| Storage | Logs to `database_size_logs` table |

The 10 GB limit is a Neon free/starter tier constraint. With ~71 legacy tables potentially accumulating data, monitoring database growth is important.

---

## 12. Startup Invariant Checks

**File**: `server/startup/invariants.ts` (59 lines)

At server boot, `assertSingleTenantDB()` queries `information_schema.columns` to verify that `user_id` columns do NOT exist in the 5 operational tables:
- `portfolio_state`
- `strategy_settings`
- `paper_sim_sessions`
- `system_context`
- `trading_settings_legacy`

If any `user_id` column is found, the server throws a `SingleTenantViolation` error and refuses to start. This is a runtime architectural guard.

**Note**: AI, Walter, audit, and backup tables intentionally KEEP `user_id` for historical data (per comment in code).

---

## 13. Data Access Layer

**File**: `server/storage.ts` — **4,580 lines**

The storage layer is a monolithic service class that wraps all Drizzle ORM operations. It provides typed CRUD methods for every table, organized by domain:

- **Portfolio management** (live/paper modes)
- **Trading signals and orders**
- **Strategy settings and audit**
- **Goals presets and learning metrics**
- **AI reports, conversations, and transparency**
- **Walter chats, approvals, and execution**
- **Telemetry persistence with checksums**
- **System context and configuration**
- **Diagnostic and audit logging**

At 4,580 lines, `storage.ts` is the **third-largest file in the codebase** (after `routes.ts` at 23,349 and `schema.ts` at 4,836).

### Storage Layer Concerns

1. **Monolithic**: Single file with all data operations for all domains
2. **Limited transaction usage**: Transactions exist in the codebase but are limited — most operations are individual queries without multi-table transactional guarantees. Critical financial paths (trade execution, position updates) should be verified for proper transaction wrapping.
3. **Walter methods still present**: Storage methods for Walter tables will become dead code on Wave 3 removal
4. **No connection pool tuning**: Uses Neon defaults without explicit pool size or timeout configuration
5. **Storage layer coupling risk**: storage.ts must be modularized BEFORE legacy tables are dropped. Dropping tables while storage methods still reference them will cause runtime errors. The safe order is: (1) modularize storage.ts → (2) remove legacy storage methods → (3) drop tables from schema → (4) drop tables from database.

---

## 14. Production Concerns

### 14.1 Schema Bloat — 71 Legacy Tables

Approximately 44% of tables serve deprecated or aspirational systems. These tables:
- Consume database storage (even if empty, they have DDL overhead)
- Add complexity to the schema file (4,836 lines)
- Have corresponding enum definitions (~40 legacy enums) that cannot be dropped while tables exist
- May accumulate stale data if any background processes write to them

### 14.2 No Database Pruning Strategy

There is no mechanism to:
- Archive old data from active tables (telemetry, signals, logs grow unbounded)
- Drop legacy tables safely
- Identify which tables have zero rows (to confirm they're truly dead)

Given the 10 GB Neon limit, this is a capacity planning concern.

### 14.3 Push-Based Migration Workflow

`drizzle-kit push` applies schema changes directly to the live database without:
- A review/approval step
- A staging environment
- Migration versioning (the journal only tracks 2 of 9 files)
- Rollback capability

This is acceptable for a single-developer project but becomes risky as the codebase matures.

### 14.4 Mixed Numeric Types for Financial Data

Active trading tables use `decimal` (exact arithmetic), but later-phase tables use `doublePrecision` (floating-point). If data flows between these table types, precision loss could occur. A standardization pass should enforce `decimal` for all financial/scoring values and reserve `doublePrecision` only for non-financial floating-point data (e.g., ML features, probabilities where exact precision is not required).

### 14.5 Index Usage Review — ~200+ Indexes Without Audit

The schema defines over 200 indexes across ~160 tables. No index usage review has been performed. In PostgreSQL, unused indexes consume storage, slow down writes (every INSERT/UPDATE/DELETE must maintain the index), and increase vacuum overhead. A `pg_stat_user_indexes` audit should identify:
- Indexes with zero scans (candidates for removal)
- Duplicate or overlapping indexes (e.g., single-column index + composite index starting with the same column)
- Missing indexes on high-cardinality query patterns
- Legacy table indexes that will be dropped with their tables but currently waste I/O

### 14.6 No Table Partitioning for Append-Only Tables

Several high-volume append-only tables would benefit from time-based partitioning:
- `telemetry_history` — continuous signal telemetry, grows with every cycle
- `paper_sim_trade_logs` — every trade event logged
- `execution_attempt_audit` — every execution decision logged
- `safety_telemetry` — guardrail check results
- `error_logs` — diagnostic errors
- `ai_audit_log`, `ai_transparency_log` — AI action audit trails

Without partitioning, these tables will become large monolithic heaps where queries on recent data must scan entire tables. Time-based partitioning (e.g., monthly) would enable efficient queries on recent data, simpler data retention (drop old partitions), and faster vacuum operations.

### 14.7 Migration Drift — Schema Cannot Be Rebuilt from History

The current migration state has a fundamental integrity issue: the database schema **cannot be reconstructed** from migration history alone. The initial migration (`0000_flaky_freak.sql`, 162 KB) captures the schema at one point, but subsequent changes were applied via `drizzle-kit push` without generating migration files. The 7 untracked migration files were applied manually. This means:
- A fresh database cannot be reliably set up by replaying migrations
- There is no way to verify what schema version is running on a given database
- Disaster recovery requires a full pg_dump, not migration replay
- **Recommendation**: Perform a migration rebaseline — generate a fresh "baseline" migration from the current schema.ts state that captures the full current schema. This becomes the new `0000` and all previous migration files are archived.

### 14.8 Enum Proliferation — ~80 Enum Types

PostgreSQL enum types (`CREATE TYPE ... AS ENUM`) are schema-level objects. With ~80 enums defined, ~40 of which are legacy:
- Enums cannot be dropped while any table column references them (even if the table is empty)
- Adding values to enums requires `ALTER TYPE ... ADD VALUE` (no transaction rollback)
- Removing values from enums requires dropping and recreating the type
- Legacy enums for the L-Series cognitive system (agentStateEnum, reflectionDepthEnum, etc.) add clutter to the type catalog
- **Drop order**: Tables first, then enums — this is already captured in the deprecation plan but bears repeating as an operational constraint

### 14.9 LATTI Residual Fields in system_context

The `system_context` table contains fields that appear to be remnants of the LATTI (Latent Attention Through Transparent Intent) system, which Kyle confirmed as deprecated. These include fields with extensive defaults related to engine state, coherence tracking, and attention management. While the `system_context` table itself is active (it stores engine state and trading mode), LATTI-specific fields within it are dead weight. These should be identified and removed as part of Wave 6 or a dedicated cleanup pass.

### 14.10 No Data Retention Policy

There is no defined data retention policy for any table. Every row ever written is preserved indefinitely. For a 10 GB database limit, this is unsustainable. A retention policy should define:
- **Hot tier** (0–30 days): Full fidelity, all tables
- **Warm tier** (30–90 days): Aggregate summaries, prune individual telemetry/log rows
- **Cold tier** (90+ days): Archive to file-based storage or delete
- Tables exempt from retention: `users`, `trading_settings`, `guardrails_v2`, `strategy_settings` (configuration, not logs)

---

## 15. Summary Statistics

| Metric | Value |
|--------|-------|
| Schema file | `shared/schema.ts` (4,836 lines) |
| Total tables | ~160 |
| Active tables | ~89 (~56%) |
| Legacy tables | ~71 (~44%) |
| Walter tables | 10 (Wave 3 removal) |
| L-Series cognitive tables | ~32 (aspirational, likely empty) |
| Ethics/governance tables | ~16 (aspirational, likely empty) |
| Cluster tables | 9 (aspirational, likely empty) |
| Paper duplicate tables | 3 (superseded) |
| Enum definitions | ~80 |
| Legacy enums | ~40+ |
| Migration files | 9 (across 2 directories) |
| Tracked migrations | 2 (in journal) |
| Storage layer | `server/storage.ts` (4,580 lines) |
| Database limit | 10 GB (Neon) |
| Connection pool | Neon serverless defaults |
| FK cascade deletes | Selective (6 tables) |
| Vector columns | 1 (semantic_memory, 1536d HNSW) |

---

---

## 16. Phase 11 Addendum — ChatGPT Feedback Integration

**Received**: 2026-02-17
**Source**: ChatGPT grounded review of Phase 11 findings

### Corrections Applied

1. **"71 legacy tables" nuance** — Not all legacy tables are fully inert. Some (Walter tables, certain L-Series tables) may still have active writers from lazy-loaded background services. Corrected classification from "no active producers or consumers" to "Deprecated — Removal Required" vs. "Inert — Safe to Drop" distinction. Pre-drop audit must verify zero active writers.

2. **"No transactions" overstatement** — Transactions exist in the codebase but are limited. Corrected from "No transaction patterns observed" to "Limited transaction usage." Critical financial paths should be verified for proper transactional wrapping.

3. **Decimal vs. doublePrecision standardization** — Added recommendation for a type standardization pass. `decimal` for all financial/scoring values, `doublePrecision` reserved for non-financial ML features only.

### Findings Added per ChatGPT Recommendations

4. **Index usage review (Section 14.5)** — ~200+ indexes with no usage audit. Unused indexes waste storage and slow writes. Recommend `pg_stat_user_indexes` audit.

5. **Table partitioning (Section 14.6)** — Append-only tables (telemetry_history, paper_sim_trade_logs, execution_attempt_audit, etc.) need time-based partitioning for retention and performance.

6. **Migration rebaseline (Section 14.7)** — Schema cannot be reconstructed from migration history. Recommend generating a fresh baseline migration from current schema.ts.

7. **Enum proliferation (Section 14.8)** — ~80 enum types, ~40 legacy. Drop order constraint: tables first, then enums.

8. **LATTI residual fields (Section 14.9)** — system_context table contains deprecated LATTI fields that should be identified and removed.

9. **Data retention policy (Section 14.10)** — No retention policy defined for any table. Unsustainable given 10 GB limit. Hot/warm/cold tier model recommended.

10. **Storage layer coupling (Section 13)** — Added critical ordering constraint: modularize storage.ts BEFORE dropping legacy tables. Safe order: modularize → remove methods → drop schema → drop tables.

### ChatGPT's Strategic Cleanup Phases (Endorsed)

ChatGPT recommended a 5-phase database cleanup strategy, which aligns with and extends the existing wave-based deprecation plan:

- **Phase A (Isolation)**: Confirm which legacy tables still have active writers. Tag each as "inert" or "deprecated-with-writers."
- **Phase B (Modularization)**: Split storage.ts into domain-specific modules. Decouple storage from schema before removals.
- **Phase C (Schema Simplification)**: Drop legacy tables in wave order (3 → 6 → 10). Remove ~40 legacy enums. Clean dead schema.ts definitions.
- **Phase D (Migration Rebaseline)**: Generate fresh baseline migration. Archive old migration files. Switch from `drizzle-kit push` to `drizzle-kit generate` + `drizzle-kit migrate`.
- **Phase E (Index & Retention Hygiene)**: Audit index usage via `pg_stat_user_indexes`. Drop unused indexes. Implement time-based retention policies. Consider partitioning for high-volume append-only tables.

---

*Phase 11 complete (with addendum). This is the final phase of the 11-phase systematic audit.*
