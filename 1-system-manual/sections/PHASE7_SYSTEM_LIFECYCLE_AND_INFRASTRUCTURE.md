# Phase 7: System Lifecycle & Infrastructure

**Version:** 1.1
**Audit Date:** 2026-02-16
**Auditor:** Claude Code (System Cartographer & Lead Architect)
**Scope:** Boot sequence, startup orchestration, scheduler registry, task queues, health monitoring, self-repair, graceful shutdown
**Status:** COMPLETE

### Kyle's Executive Position (Phase 7 Addendum)

> Phase 7 infrastructure is stable. There are no hidden kill switches, no silent trade shutdown mechanisms, no unexpected execution overrides. However, several subsystems are actively instantiated at boot, running on schedulers, not clearly required for core paper trading, and potentially legacy or autonomy-era artifacts. **These are not being deprecated immediately.** They are flagged for **Post-Audit Cleanup Investigation & Formal Decision.** Architectural simplification is required but will be handled as a deliberate cleanup phase, not as reactive removal.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Server Entry Point (server/index.ts)](#2-server-entry-point)
3. [Boot Orchestrator](#3-boot-orchestrator)
4. [Startup Sequence — Deterministic Order](#4-startup-sequence)
5. [Startup Module: invariants.ts](#5-startup-invariants)
6. [Startup Module: trading-bootstrap.ts](#6-startup-trading-bootstrap)
7. [Startup Module: fx5-scanner-bootstrap.ts](#7-startup-fx5-scanner-bootstrap)
8. [Startup Module: portfolio-initializer.ts](#8-startup-portfolio-initializer)
9. [Startup Module: lazy-loader.ts](#9-startup-lazy-loader)
10. [Startup Module: Other Seeders & Utilities](#10-startup-seeders)
11. [Bootstrap: Schema Validator](#11-bootstrap-schema-validator)
12. [Scheduler Registry](#12-scheduler-registry)
13. [System Health (system-health.ts — LOCKED)](#13-system-health-locked)
14. [System Health Monitor (system-health-monitor.ts)](#14-system-health-monitor)
15. [Health Monitor (health-monitor.ts — Phase 41F-C)](#15-health-monitor-41f)
16. [Feed Integrity Monitor](#16-feed-integrity-monitor)
17. [Self-Repair Service](#17-self-repair-service)
18. [Operation Queue (operation-queue.ts — Phase 41F-A/B)](#18-operation-queue)
19. [Task Queue (task-queue.ts)](#19-task-queue)
20. [Task Router (task-router.ts) — Phase 17.0 Cluster System](#20-task-router)
21. [Task Worker (task-worker.ts) — Phase 17.0 Cluster System](#21-task-worker)
22. [Walter Shutdown Gate](#22-walter-shutdown-gate)
23. [Graceful Shutdown](#23-graceful-shutdown)
24. [Data Flow — Boot to Steady-State](#24-data-flow)
25. [Critical Findings](#25-critical-findings)
26. [Post-Audit Infrastructure Review (Kyle Directive)](#26-post-audit-infrastructure-review)
27. [File Catalog](#27-file-catalog)
28. [Revision History](#28-revision-history)

---

## 1. Architecture Overview

DawnTrader's system lifecycle is managed through a **single-file monolithic boot sequence** (`server/index.ts`, ~1,260 lines) that orchestrates ~40+ service initializations in a carefully ordered async IIFE. The system follows a **degraded-mode-first** philosophy — every service initialization is wrapped in try/catch, and failures produce warnings rather than crashes (with one exception: the single-tenant database invariant check, which calls `process.exit(1)`).

### Boot Architecture Layers

```
┌────────────────────────────────────────────────────────┐
│                server/index.ts (~1260 lines)            │
│   Single-file monolithic boot sequence                  │
├────────────────────────────────────────────────────────┤
│  Layer 1: Express Setup & Middleware                    │
│    CORS, JSON parsing, single-tenant guard,            │
│    telemetry compression, request logging               │
├────────────────────────────────────────────────────────┤
│  Layer 2: Core Service Bootstrap (blocking)             │
│    Boot Orchestrator → Price Cache → Central Clock →    │
│    RTB Refresh → Data Aggregator → FX5 Scanner         │
├────────────────────────────────────────────────────────┤
│  Layer 3: Route Registration & Database Services        │
│    Routes → Queues → PaperSim Reset → Rate Limiter →   │
│    Test User → Kraken Metadata → Trading State Sync     │
├────────────────────────────────────────────────────────┤
│  Layer 4: Application Services (blocking)               │
│    Ethical Principles → Strategy Sync → Portfolio Init → │
│    Trading Bootstrap → Purpose Layer → Context Loader    │
├────────────────────────────────────────────────────────┤
│  Layer 5: Non-blocking Background Services              │
│    Walter (if enabled) → Memory Lifecycle →              │
│    Scheduler Registry (13 tasks) → Vite/Static          │
├────────────────────────────────────────────────────────┤
│  Layer 6: Post-Listen Services (after port binding)     │
│    Live Pricing → WebSocket → Lazy Loader (+1.5s) →     │
│    Health Monitor → Heartbeat → Learning Cycle →        │
│    Autonomy Scheduler → Config Audit Telemetry          │
├────────────────────────────────────────────────────────┤
│  Layer 7: Graceful Shutdown Handlers                    │
│    SIGTERM/SIGINT → queues → RTB → DataAgg → Clock →    │
│    PriceCache → SystemHealth                            │
└────────────────────────────────────────────────────────┘
```

### Dual Shutdown Handler Problem

**⚠️ BUG-015 (MEDIUM):** Both `server/index.ts` and `server/core/boot_orchestrator.ts` independently register SIGTERM/SIGINT handlers. The boot orchestrator registers first (in constructor), then index.ts registers its own handlers later. Node.js allows multiple handlers per signal, so **both execute on shutdown**, but in unpredictable order. The boot orchestrator handler calls `stopVTSRunner()` and `stopMLService()`, while the index.ts handler stops RTB, DataAggregator, CentralClock, PriceCache, SystemHealth, and calls `process.exit(0)`. Since the index.ts handler calls `process.exit()`, the boot orchestrator's handler may not complete.

---

## 2. Server Entry Point

**File:** `server/index.ts` (~1,260 lines)
**Directive:** A4.R10R-3 (Central Clock Synchronized Startup Sequence)

### Express Configuration
- **CORS:** Restricts to localhost:3000, localhost:5000, Replit dev domain, and custom ALLOWED_ORIGINS
- **Body parsing:** JSON with rawBody capture, URL-encoded
- **Middleware:** Single-tenant guard, telemetry compression, API request logging with 80-char truncation
- **Profiling:** Phase 4A-5 Gemini profiler records per-endpoint latency
- **Sampling:** Non-error requests logged at 10% sample rate

### Route Mounting Order
1. Regime Archive routes (mounted before registerRoutes)
2. API router from registerRoutes()
3. Status routes at `/api/status`
4. Health routes at `/api/health`
5. DSE routes at `/api/diagnostics`
6. Chaplet routes at `/chaplet` (read-only)
7. Phase 8.6.5 enhancement routes
8. Provenance debug routes
9. Global error handler (catch-all JSON)
10. Vite middleware (dev) or static serving (prod)

### Post-Listen Audit Telemetry
After port binding, the server runs extensive config audit telemetry:
- **ConfigSnapshot:** Builds MD5 hashes of guardrails/filters/goals for paper & live
- **FilterCoherence:** Validates LATTI-managed vs manual-override field counts
- **GuardrailsCoherence:** Validates locked-by-user params vs LATTI-managed
- **OverridesHistory:** Logs last 10 config changes grouped by mode/type
- **CrossMode Audit:** Compares paper vs live structural coherence

**Note:** These audit telemetry blocks total ~150 lines of inline code in the server listen callback. This is diagnostic telemetry, not a security gate — mismatches produce log warnings but don't block operation.

---

## 3. Boot Orchestrator

**File:** `server/core/boot_orchestrator.ts` (~348 lines)
**Directive:** 8.8.4-L3
**Module Status:** Active (singleton, exports `bootOrchestrator`)

### Purpose
Manages the Python ML microservice lifecycle: auto-spawn, health check polling, metrics collection, and graceful shutdown. Also initializes the VTS Runner with auto-start logic for passive learning mode.

### Startup Sequence
1. Check `ML_SERVICE_AUTO_START` env var (default: true)
2. Probe `localhost:5001/health` for existing ML service
3. If not found, spawn `python services/ml_service.py`
4. Poll health endpoint every 1s for up to 15 attempts
5. Start 30-second recurring health monitoring
6. Initialize VTS Runner + preload pattern recognition (2,000 entries)
7. Check system config for passive learning mode → auto-start VTS if applicable

### ML Service States
| State | Meaning |
|-------|---------|
| STARTING | Spawn initiated, waiting for health |
| READY | Health check passing |
| DEGRADED | Failed to start, or health check failing after being READY |
| FAILED | Initialization threw an error |
| STOPPED | Shutdown complete or not started |

### VTS Auto-Start Logic
```typescript
const isPassiveLearning = !paperActive && !liveActive;
if (isPassiveLearning) {
  await startAutonomousSimulation(); // VTS auto-start in passive mode
}
```
This correctly prevents VTS from running when trading engines are active.

### Memory Warning Threshold
ML service memory > 500MB triggers a warning log. No remediation action is taken.

---

## 4. Startup Sequence — Deterministic Order

The startup sequence enforced by `server/index.ts` is:

| Order | Service | Blocking? | Directive | Failure Mode |
|-------|---------|-----------|-----------|--------------|
| 1 | Boot Orchestrator (ML + VTS) | ✅ await | 8.8.4-L3 | Degraded mode |
| 2 | Canonical Consistency Validator | ✅ sync | 11.4H.6G | Warning only |
| 3 | System Health Monitor | ✅ sync | A4.R10R-4 | Silent failure |
| 4 | Price Cache | ✅ sync | A4.R10R-1 | Silent failure |
| 5 | Central Clock | ✅ sync | A4.R10R-3 | Warning only |
| 6 | RTB Refresh Service | ✅ sync | A4.R10R-3 | Warning only |
| 7 | Data Aggregator | ✅ import | 8.8.4-L1 | Warning only |
| 8 | FX5 Scanner Bootstrap | ❌ fire-and-forget | R9.3.HF-5 | Error log |
| 9 | Route Registration | ✅ await | — | Fatal |
| 10 | Operation Queues | ✅ await | 41F-B-5 | Warning only |
| 11 | PaperSim Reset + Resume | ✅ await | 27.F.8 | Warning only |
| 12 | Rate Limiter Reset | ✅ await | — | Non-prod only |
| 13 | Test User Seeder | ✅ await | — | Non-prod only |
| 14 | Permission Cache | ✅ await | 27.3 | Warning only |
| 15 | Kraken Pair Metadata | ✅ await | 8.8.3 | Non-fatal |
| 16 | Kraken Auto-Map | ✅ await | I7-MAP-AUTO | Non-fatal |
| 17 | Trading State Sync | ✅ await | 27.4 | Warning only |
| 18 | Ethical Principles Seeder | ✅ await | 13.0 | Warning only |
| 19 | Strategy Sync | ✅ await | 8.5-F | Warning only |
| 20 | Portfolio Initializer | ✅ await | 8.5-K.4.1 | Warning only |
| 21 | Trading Bootstrap | ✅ await | A3.R2 | Warning only |
| 22 | Purpose Layer | ✅ await | 8.6.5 | Warning only |
| 23 | Corpus Domain Service | ✅ await | 8.6.5 | Warning only |
| 24 | Context Loader | ✅ await | 27 | Warning only |
| 25 | Phase 8.6.5 Routes | ✅ sync | 8.6.5 | Warning only |
| 26 | File Persistence Self-Test | ✅ await | 8.4-E.1 | Degraded mode |
| 27 | **Single-Tenant DB Invariant** | ✅ await | **2D** | **`process.exit(1)`** |
| 28 | Route Map Print/Dump | ✅ await | 2E/2F | Warning only |
| 29 | Walter Services | ❌ fire-and-forget | 27.F.14.B | Error log |
| 30 | Memory Lifecycle | ❌ fire-and-forget | 8.8.2 | Error log |
| 31 | Scheduler Registry | ❌ fire-and-forget | — | Error log |

**Key observation:** The single-tenant DB invariant check (step 27) is the **only startup step that causes a hard crash**. Everything else degrades gracefully. This is appropriate — data integrity is non-negotiable.

---

## 5. Startup Module: invariants.ts

**File:** `server/startup/invariants.ts` (~58 lines)
**Directive:** Phase 2D

### Purpose
Verifies single-tenant database architecture by checking that no `user_id` columns exist in the 5 core operational tables: `portfolio_state`, `strategy_settings`, `paper_sim_sessions`, `system_context`, `trading_settings_legacy`.

### Behavior
- If `SINGLE_TENANT=false`: skips check entirely
- Queries `information_schema.columns` for violations
- On violation: throws `[SingleTenantViolation]` → caught in index.ts → `process.exit(1)`
- Only checks operational tables — AI, Walter, audit, and backup tables intentionally keep `user_id`

**This is the only hard-crash invariant in the system.** Correctly implemented.

---

## 6. Startup Module: trading-bootstrap.ts

**File:** `server/startup/trading-bootstrap.ts` (~99 lines)
**Directive:** 8.8.4-A3.R2, A3.R7

### Purpose
On server restart, checks if trading engines were active (via `isEngineActive` in system_context) and reinitializes RTB refresh cycle + TCL watchdog for both paper and live modes.

### Startup Order (within this module)
1. Start Central Clock (idempotent)
2. Register event listeners (TCL_ACTIVATED, SlotOpened)
3. For each mode (paper, live):
   - Check `systemContext.isEngineActive`
   - If active: cleanup expired signals → start RTB refresh → set engine start time → start TCL watchdog

### Guard
- Boolean `bootstrapped` flag prevents double-initialization
- Central Clock start is idempotent (checks `getIsRunning()`)

---

## 7. Startup Module: fx5-scanner-bootstrap.ts

**File:** `server/startup/fx5-scanner-bootstrap.ts` (~33 lines)
**Directive:** R9.3.HF-5

### Purpose
Resilient FX5 Scanner initialization. Replaces stale singleton pattern that could block reinit.

### Behavior
- Prevents duplicate inits unless `force=true` or last attempt >60s ago
- Called from index.ts with `force=true` (fire-and-forget, non-blocking)
- On failure: resets `bootstrapped` flag for retry

---

## 8. Startup Module: portfolio-initializer.ts

**File:** `server/startup/portfolio-initializer.ts` (~55 lines)
**Directive:** 8.5 Addendum K.4.1

### Purpose
Ensures both `live` and `paper` entries exist in `portfolio_state` table.

### Behavior
- Live mode: Fetches balance from Kraken API; falls back to $0.00 on failure
- Paper mode: Creates with default $1000.00
- Uses `globalContextId = 'default'` (single-tenant)
- Idempotent — skips creation if entries already exist

---

## 9. Startup Module: lazy-loader.ts

**File:** `server/startup/lazy-loader.ts` (~189 lines)
**Directive:** Phase 5A (Parallel Lazy Loading + Deferral)

### Purpose
Loads non-critical services after the main startup sequence, using parallel `Promise.all` for critical services and `setTimeout` deferral for low-priority services.

### Critical Services (loaded in parallel)
1. **Cortex Core** — core trading intelligence + Bob snapshot sync
2. **Analytics Scheduler** — 15-min analytics cycle
3. **System Health Monitor** — wired to BobCore
4. **LATTI Manager** — **REMOVED** (Directive 11.8B-B, logs removal notice)
5. **Audit Report** — one-time Phase 30 report generation
6. **Market Data Health Check** — daily health checks

### Deferred Services
| Service | Delay | Interval |
|---------|-------|----------|
| DatabaseMonitor | +4s | Daily |
| StrategicDrive (SDPOE) | +6s | Hourly |
| SQE Distribution Logging | +8s | 10-min for 30min |
| MarketEventScheduler | +10s | 30s regime/friction checks |

**RISK-044 (LOW):** The lazy loader references the removed LATTI system (Directive 11.8B-B) with a stub that logs its removal. This is correct behavior for now but the stub should be cleaned up.

---

## 10. Startup Module: Other Seeders & Utilities

### ethical-principles-seeder.ts (~92 lines) — Phase 13.0
Seeds 5 foundational ethical principles to `ethicalPrinciple` table:
1. `transparency` (foundational, priority 1)
2. `harm_prevention` (foundational, priority 2)
3. `fairness` (foundational, priority 3)
4. `autonomy_bounds` (operational, priority 4)
5. `accountability` (operational, priority 5)

Idempotent — checks for existing principles before inserting.

**POTENTIAL LEGACY — REQUIRES INTENT CONFIRMATION:** These ethical principles appear to be part of the Walter-era autonomous AI framework. They reference concepts like "autonomous decision-making" and constraints like `require_reasoning_log`, `prohibit_manipulation`, `prohibit_front_running`. If the Walter-era learning stack is confirmed dead (per Phase 6), these principles may have no consumers. However, they may serve as compliance documentation or future-proofing. **Flagged for Kyle review.**

### rate-limiter-reset.ts (~39 lines)
Resets express-rate-limit store on startup. **Non-production only** (`NODE_ENV !== 'production'`). Logs to transparency system.

### test-user-seeder.ts (~86 lines)
Creates/updates test user account for automated testing. **Non-production only.** Creates user with `isAdmin: true` and default credentials from environment variables.

### printRoutes.ts (~46 lines) — Phase 2E/2F
Two functions:
- `printRoutes()`: Collects and prints registered routes to console
- `dumpRoutes()`: Writes route manifest to `diagnostics/phase2f_route_manifest.json` and warns about any `:userId` routes

---

## 11. Bootstrap: Schema Validator

**File:** `server/bootstrap/schema-validator.ts` (~97 lines)
**Directive:** 11.7F

### Purpose
Validates schema version consistency between canonical TypeScript definitions and bridge JSON files.

### Expected Schema
`regime-mapping/v1.4b`

### Behavior
- Reads `bridge/canonical/mapping-regime-strategy.json`
- Compares `_schema` field against expected version
- Major mismatch (not v1.4.x): error
- Minor mismatch (v1.4.x but not v1.4b): warning
- `validateSchemaVersionsStrict()`: throws on any errors (for production startup)

**Note:** This validator is defined but **not called from server/index.ts**. It must be invoked elsewhere (CI/CD or direct import). If it's not called during startup, schema mismatches would go undetected at runtime.

**RISK-045 (LOW):** Schema validator may not be invoked during server startup. Needs verification of calling site.

---

## 12. Scheduler Registry

**File:** `server/services/scheduler-registry.ts` (~134 lines)

### Purpose
Centralized registry for all autonomous scheduled tasks. Provides unified start/stop/execute lifecycle management.

### Interface
```typescript
interface ScheduledTask {
  name: string;
  description: string;
  frequency: string;
  intervalMs: number;
  run: () => Promise<void>;
  getInitialDelay?: () => number;
  lastRun: Date | null;
  nextRun: Date | null;
  status: 'running' | 'idle' | 'error';
}
```

### Registered Tasks (13 total, registered in index.ts)
| # | Task | Module |
|---|------|--------|
| 1 | Screener Recalibration | screener-recalibration-task |
| 2 | Market Scan | market-scan-task |
| 3 | AI Summary | ai-summary-task |
| 4 | System Health Check | system-health-check-task |
| 5 | CLE (Continuous Learning Engine) | cle-task |
| 6 | CWA (Cognitive Weight Adjustment) | cwa-task |
| 7 | Cache Purge | cache-purge-task |
| 8 | Semantic Ingestion | semantic-ingestion-task |
| 9 | Diagnostic Analysis | diagnostic-analysis-task |
| 10 | Optimization Analysis | optimization-analysis-task |
| 11 | Weekly Expert Insights | weekly-expert-insights-task |
| 12 | Trading Signals Cleanup | trading-signals-cleanup |
| 13 | Audit Anomaly Detection | audit-anomaly-task |

**Additionally, 3 jobs registered via their own functions (not through the registry interface):**
- `registerLearningFeedbackJob()`
- `registerFormulaAuditJob()`
- `registerFeedIntegrityJob()`

### Execution
- `startAllTasks()`: starts all tasks in parallel, each with their interval
- Initial execution uses `setTimeout` with either custom delay or intervalMs
- All results logged to `transparencyLog` table
- Task errors don't crash — caught and logged

**⚠️ POST-AUDIT INVESTIGATION REQUIRED (Kyle, Phase 7 Addendum):** At boot, 15+ scheduled tasks are registered and started, including AI summaries, weekly expert insights, semantic ingestion, optimization analysis, diagnostic analysis, audit anomaly tasks, plus the AutonomyScheduler, AwarenessScheduler, and LearningCycleService started separately. **None of these are directly required for the core paper trading path** (FX5 → SQE → RTB → TCL → PaperExecutionEngine). Kyle's directive: Investigate each scheduled task post-audit — does it directly support core paper trading? Is it autonomy-era infrastructure? Is it observational only? Can it be disabled in a "Core Trading Mode"? Should it be deprecated or removed? **No immediate shutdown required. Formal review required.**

Tasks #5 (CLE) and #6 (CWA) are specifically flagged as Walter-era learning components (Continuous Learning Engine and Cognitive Weight Adjustment). If the Walter-era stack is confirmed dead (Phase 6), these tasks may be executing against dead systems.

---

## 13. System Health (system-health.ts — LOCKED)

**File:** `server/services/system-health.ts` (~147 lines)
**Directive:** 8.8.4-A4.R10R-4
**Module Status:** 🔒 LOCKED

### Purpose
Low-level system health monitor for real-time metrics: CPU load, memory usage, event loop lag, process uptime.

### Implementation
- **Sampling interval:** 10 seconds
- **Event loop lag detection:** 100ms setInterval, measures actual vs expected delay
- **Health thresholds:** Memory <350MB, event loop lag <10ms
- **Global state:** Sets `global.__eventLoopLag` for cross-service access
- **Events:** Emits `update` event with full metrics on each sample

### Metrics Collected
| Metric | Source |
|--------|--------|
| CPU load | `os.loadavg()[0]` |
| RSS memory (MB) | `process.memoryUsage().rss` |
| Heap used/total | `process.memoryUsage()` |
| Event loop lag | Timer-based measurement |
| Uptime | `process.uptime()` |

---

## 14. System Health Monitor (system-health-monitor.ts)

**File:** `server/services/system-health-monitor.ts` (~437 lines)

### Purpose
Higher-level health analysis with anomaly detection, cache statistics, latency tracking, and scheduler monitoring. Consumed by BobCore and the self-repair service.

### Tracked Domains
1. **Cache:** Hit/miss rates (from BobCore)
2. **Latency:** Cortex, database, API (rolling 100-entry windows)
3. **Schedulers:** CortexSync and Analytics last-run timestamps
4. **File persistence:** Success/failure/timeout counts
5. **Execution layer:** Market data source, tick age, slippage, fees, rate pressure
6. **Context refresh:** Refresh latency, total/failed counts, discrepancy tracking

### Anomaly Thresholds
| Metric | Warning | Critical |
|--------|---------|----------|
| Cortex latency | 200ms | 500ms |
| Database latency | 500ms | 1000ms |
| Cache hit rate | <60% | <40% |
| Memory usage | >80% | >90% |
| CPU usage | >75% | >90% |
| Scheduler inactivity | >5 min (after 2min uptime) | — |

### Health States
- **healthy:** No warnings or critical issues
- **degraded:** Warnings present, no critical
- **critical:** One or more critical thresholds breached

---

## 15. Health Monitor (health-monitor.ts — Phase 41F-C)

**File:** `server/services/health-monitor.ts` (~1,495 lines)
**Directive:** Phase 41F-C/F/G/I

### Purpose
Comprehensive engine-level health monitoring with 5-second heartbeat, auto-recovery, anomaly detection, circuit breaker, and WebSocket broadcasting.

### Heartbeat Architecture
- **Interval:** 5 seconds
- **Ring buffer:** 250 heartbeats (~21 minutes)
- **Parallel checks:** Paper queue, live queue, paper engine, live engine, market data, SSOT, DB, broadcasts, external connectivity
- **Overall health:** Logical AND of all component `ok` flags

### Monitored Components
| Component | Check Method | OK Criteria |
|-----------|-------------|-------------|
| Paper/Live Queue | OperationQueue.getStatus() | Depth <10, executing job <3s |
| Paper/Live Engine | global.tradingEngines map | Running + tick <60s ago |
| Market Data | MarketDataCoordinator | WS connected or REST fallback <20s |
| SSOT Cache | MarketEvaluationService | Hit rate >50% |
| Database | `SELECT 1` probe | Query time <1s |
| Broadcasts | Internal tracking | Last broadcast <30s, avg latency <100ms |
| External (Kraken) | Internal tracking | Last success > last error |

### Anomaly Detection (Phase 41F-F)
| Metric | Warning | Critical |
|--------|---------|----------|
| Heartbeat latency | 200ms | 400ms |
| Broadcast latency | 120ms | 200ms |
| Queue depth | 5 | 10 |
| Job age | 15s | 30s |
| WS silence | 2 cycles | 4 cycles |
| Trade pipeline idle | — | 60s (while engine active) |

### Auto-Recovery Framework (Phase 41F-G)
- **Cooldown:** 120 seconds between recovery attempts
- **Circuit breaker:** Activates after 3 recoveries in 10 minutes, suspends for 10 minutes
- **Recovery actions:** Currently all "simulated" (log + emit only). No actual restarts are executed.

**RISK-046 (MEDIUM):** Auto-recovery actions are all placeholder implementations. Every recovery handler logs a warning but takes no corrective action. The `executeRecovery()` method has a full framework for planned actions (force_websocket_reconnect, purge_old_queue_jobs, restart_trading_engine, etc.) but all paths end with `success = true` and a console.log. This means the health monitor detects problems but cannot fix them.

---

## 16. Feed Integrity Monitor

**File:** `server/services/feed-integrity-monitor.ts` (~572 lines)

### Purpose
Monitors Kraken WebSocket and REST fallback feed health with configurable thresholds, grading, and alert deduplication.

### Health Categories
| Status | Criteria |
|--------|----------|
| Healthy | <3 reconnects AND <5s tick age |
| Warning | ≥3 reconnects OR ≥5s tick age |
| Critical | ≥5 reconnects OR ≥10s tick age |

### Grading System (A-F)
| Grade | Max Latency | Min Uptime | Max Reconnects | Max Tick Age |
|-------|------------|-----------|---------------|-------------|
| A | 500ms | 99% | 0 | 2s |
| B | 1000ms | 95% | 2 | 5s |
| C | 2000ms | 90% | 5 | 10s |
| D | 3000ms | 80% | 10 | 20s |
| F | Worse than D | | | |

### Configuration
All thresholds are env-configurable via `FEED_*` environment variables with sensible defaults.

### Tracking
- Rolling 12-snapshot history (1 hour at 5-min intervals)
- Time-based uptime percentage (minutes healthy / total minutes)
- Alert deduplication with 5-minute cooldown
- Report export to JSON file

---

## 17. Self-Repair Service

**File:** `server/services/self-repair.ts` (~303 lines)

### Purpose
Automated repair for critical system health issues. Triggered when SystemHealthMonitor detects critical status.

### Repair Strategies
| Issue Type | Action |
|-----------|--------|
| Cortex latency / Cache | Flush BobCore cache + prefetch rebuild |
| Database latency | Retry connection 3x with exponential backoff |
| Memory usage | Force GC (if available) + cache clear |
| CPU usage | Monitor only (no direct action) |
| Unknown | Log only |

### Safeguards
- `isRepairing` flag prevents concurrent repairs
- Max 3 retry attempts with 1s × attempt delay
- All actions recorded in repair history (last 100)
- Manual trigger via `manualRecover()` method

---

## 18. Operation Queue (operation-queue.ts — Phase 41F-A/B)

**File:** `server/utils/operation-queue.ts` (~200+ lines)
**Directive:** Phase 41F-A/B

### Purpose
Lightweight in-memory FIFO queue for serializing trading operations (start/stop) to prevent concurrent request collisions.

### Features
- Sequential execution (one job at a time)
- Request deduplication by `userId:mode:action` key
- Duplicate requests piggyback on existing jobs
- Automatic retry (once) with 500ms backoff
- Promise-based result notification
- Telemetry logging with queue depth tracking
- Graceful shutdown support

### Two Instances
- `paperOperationQueue` — paper mode operations
- `liveOperationQueue` — live mode operations

Both initialized in index.ts via `initializeQueues()`.

---

## 19. Task Queue (task-queue.ts)

**File:** `server/services/task-queue.ts` (~367 lines)
**Directive:** Phase 8.8.3

### Purpose
PostgreSQL-backed async task queue for AI reasoning tasks (DevOpsBob, FullStackBob, UXBob). Uses optimistic locking with `FOR UPDATE SKIP LOCKED` for concurrent worker safety.

### Implementation
- **Backing store:** `reasoning_queue` PostgreSQL table
- **Worker ID:** Random nanoid per instance
- **Concurrency:** Configurable via `TASK_QUEUE_CONCURRENCY` env (default: 5)
- **Retry:** 3 attempts with exponential backoff (1s, 2s, 4s) + random jitter
- **Cleanup:** Auto-deletes completed/failed tasks older than 7 days
- **Forensics:** Permanent failures logged to `memory_audit_log` table
- **Broadcasts:** Queue events sent to Context Bridge for real-time UI updates

---

## 20. Task Router (task-router.ts) — Phase 17.0 Cluster System

**File:** `server/services/task-router.ts` (~428 lines)
**Directive:** Phase 17.0

### Purpose
Routes cluster tasks to appropriate nodes based on task type affinity, node capacity, and load balancing.

### Task Type → Role Affinity
| Task Type | Preferred Roles |
|-----------|----------------|
| trading_signal | trading, general |
| market_analysis | analysis, research, general |
| risk_assessment | analysis, compliance, general |
| compliance_check | compliance, general |
| research | research, general |
| optimization | general |
| general | general |

### Implementation
- **Admission control:** Max global queue depth of 1,000 tasks
- **Load balancing:** Assigns to least-loaded healthy node with matching role
- **Node health:** Requires heartbeat within 2 minutes
- **Max load:** Rejects assignment if node >90% capacity
- **Retry:** Exponential backoff with ±25% jitter, 1s base, 60s max
- **Dead letter:** Failed tasks after max retries marked as permanently failed
- **Rebalancing:** `rebalanceStuckTasks()` rescues tasks stuck >30 minutes

**POTENTIAL LEGACY — REQUIRES INTENT CONFIRMATION:** The entire Phase 17.0 cluster system (TaskRouter + TaskWorker + ClusterBus + ClusterRegistry) references multi-node distributed computing capabilities. DawnTrader is currently a single-node system. This cluster infrastructure appears to be pre-built scaffolding for a feature that was never activated. The TaskRouter queries `cluster_node` table for healthy nodes, but there is no evidence of cluster node registration in the startup sequence. **Flagged for Kyle review.**

---

## 21. Task Worker (task-worker.ts) — Phase 17.0 Cluster System

**File:** `server/services/task-worker.ts` (~407 lines)
**Directive:** Phase 17.0, 17.5, 17.6

### Purpose
Executes cluster tasks through a full gate pipeline: Circuit Breaker → Safety → Federated Ethics → Ethical Reasoner → Knowledge Acquisition → Execution.

### Implementation
- **Poll interval:** 5 seconds
- **Max concurrent:** 5 tasks
- **Gate pipeline:** Simulated (all gates always pass) — `simulateGateExecution()` returns `true`
- **Task handlers:** All return placeholder results (e.g., `{ signal: "processed" }`)
- **Audit logging:** Per-gate execution logged to `cluster_audit_log` table
- **Circuit breaker:** Integrates with per-node circuit breaker service

**This module is entirely non-functional.** The gate pipeline always passes. The task handlers return stub responses. The worker polls for tasks but the cluster_node registration required for task assignment doesn't exist in the startup sequence. This is dead infrastructure.

---

## 22. Walter Shutdown Gate

**Referenced in:** `server/index.ts` lines 381-420
**Directive:** 27.F.14.B

### Purpose
When `WALTER_DISABLED=true`, skips initialization of:
- AI Opportunities service (hourly)
- Daily Brief service
- Market Analysis scheduler
- AI Orchestrator (already commented out — "Phase 0: Removed")
- Walter Health Monitor

When enabled, these 4 services start as fire-and-forget promises. Failures are caught and logged but don't affect server startup.

**Note:** The AI Orchestrator import is already commented out with "Phase 0: Removed AI Orchestrator (legacy module)". This confirms the orchestrator was deprecated before the Walter shutdown gate was added.

---

## 23. Graceful Shutdown

**Primary handler:** `server/index.ts` lines 1228-1259
**Secondary handler:** `server/core/boot_orchestrator.ts` lines 51-73

### Primary Shutdown Order (index.ts)
1. Operation queues (`shutdownAllQueues`)
2. RTB Refresh Service (`stop()`)
3. Data Aggregator (`shutdown()` — flushes pending data)
4. Central Clock (`stop()`)
5. Price Cache (`shutdown()`)
6. System Health (`stop()`)
7. `process.exit(0)`

### Secondary Shutdown (boot_orchestrator.ts)
1. VTS Runner (`stopVTSRunner()`)
2. ML Service (`stopMLService()` — SIGTERM → 5s timeout → SIGKILL)
3. Health check interval cleared

### Shutdown Race Condition (BUG-015)
Both handlers register independently for SIGTERM/SIGINT. Since the primary handler calls `process.exit(0)`, the secondary handler's ML service graceful shutdown (5-second timeout for SIGTERM before SIGKILL) may be truncated or never executed.

---

## 24. Data Flow — Boot to Steady-State

```
Server Start
    │
    ▼
Express Setup (CORS, middleware, guards)
    │
    ▼
Boot Orchestrator → ML Service spawn → VTS init → pattern preload
    │
    ▼
Core Services: PriceCache → CentralClock → RTB Refresh → DataAggregator
    │
    ▼
Route Registration + API mounting
    │
    ▼
Queue Init → PaperSim Reset → Rate Limiter → Test User
    │
    ▼
Kraken Metadata → Auto-Map → Trading State Recovery
    │
    ▼
Ethics Seed → Strategy Sync → Portfolio Init → Trading Bootstrap
    │
    ▼
Purpose Layer → Corpus Domains → Context Loader → Debug Routes
    │
    ▼
File Persistence Self-Test
    │
    ▼
█ HARD GATE: Single-Tenant DB Invariant (exit on failure)
    │
    ▼
Route Map Print/Dump
    │
    ▼
═══════════ server.listen() ═══════════
    │
    ▼
POST-LISTEN (parallel fire-and-forget):
├── Walter services (if enabled)
├── Memory Lifecycle
├── Scheduler Registry (13 tasks)
│
▼
LIVE PRICING + WEBSOCKET CHAIN:
LivePricingAdapter → WebSocket checker → VolumeClassifier →
ActiveFilterPool → TrailingStates → KrakenWS start
    │
    ▼
LAZY LOADER (+1.5s):
├── Cortex Core + Analytics (parallel)
├── System Health Monitor + BobCore wire-up
├── Market Data Health Check
├── DatabaseMonitor (+4s deferred)
├── StrategicDrive (+6s deferred)
├── SQE Distribution (+8s deferred)
├── MarketEventScheduler (+10s deferred)
│
▼
ML Calibration Scheduler (+1.5s, 8-hour cadence)
Archival Scheduler (+1.5s)
    │
    ▼
Config Audit Telemetry (ConfigSnapshot, FilterCoherence,
                         GuardrailsCoherence, OverridesHistory,
                         CrossMode)
    │
    ▼
Health Report Scheduler (hourly)
PaperSim Heartbeat (recovery + monitoring)
Learning Cycle Service (24-hour)
Autonomy Scheduler (hourly self-checks, daily optimization)
Awareness Scheduler (hourly state, 6-hour reflections)
Engine Health Monitor (5s heartbeat + WebSocket broadcasting)
    │
    ▼
PRICE FORWARDING LOOP (1s interval):
LivePricingAdapter → MicroExecutionService (paper + live) ⚠️ [POST-AUDIT REVIEW]
    │
    ▼
═══════════ STEADY STATE ═══════════
```

**⚠️ Kyle (Phase 7 Addendum) — MicroExecutionService:** Receives price updates every second, wired during boot, but not confirmed to be part of active trade path. Post-audit investigation required: Is it referenced by paper or live execution engines? Is it purely experimental? Is it safe to disable at boot? Should it be deprecated pending future micro-coin strategy work?

---

## 25. Critical Findings

### New Bugs

| ID | Severity | Description | File | Kyle Decision |
|----|----------|-------------|------|---------------|
| BUG-015 | MEDIUM | Dual shutdown handlers (index.ts + boot_orchestrator.ts) create race condition. ML service may not get graceful shutdown. | server/index.ts, server/core/boot_orchestrator.ts | Post-audit investigation |

### New Risks

| ID | Severity | Description | File | Kyle Decision |
|----|----------|-------------|------|---------------|
| RISK-044 | LOW | Lazy loader contains LATTI removal stub (correct but should be cleaned up) | server/startup/lazy-loader.ts | Post-audit LATTI cleanup |
| RISK-045 | LOW | Schema validator (11.7F) defined but not called from startup sequence | server/bootstrap/schema-validator.ts | Post-audit verification |
| RISK-046 | MEDIUM | Health monitor auto-recovery actions are all placeholder implementations — detects but cannot fix | server/services/health-monitor.ts | Post-audit investigation |
| RISK-047 | INFORMATIONAL | Startup sequence ~1,260 lines in single file. High coupling but functional. | server/index.ts | Acknowledged — architectural accumulation |

### Systems Flagged for Post-Audit Investigation (Kyle Directive)

Kyle's Phase 7 Addendum reclassifies all potential legacy findings from "AWAITING KYLE CONFIRMATION" to **"POST-AUDIT CLEANUP INVESTIGATION REQUIRED"**. These systems are not emergency defects — they are hygiene candidates that will be formally reviewed after the audit is complete.

| System | Status | Investigation Required |
|--------|--------|----------------------|
| Phase 17.0 Cluster System (TaskRouter + TaskWorker) | FLAGGED — Post-Audit | Scope verification, dependency tracing, mutation impact review |
| CLE/CWA Scheduler Tasks | FLAGGED — Post-Audit | Does it support core trading? Is it autonomy-era? Can it be disabled? |
| Ethical Principles Seeder | FLAGGED — Post-Audit | Are there active consumers? Compliance data or dead code? |
| Background Scheduler Tasks (13+ tasks) | FLAGGED — Post-Audit | Which tasks support core trading? Which are autonomy-era? |
| MicroExecutionService | FLAGGED — Post-Audit | Is it part of active trade path? Experimental? Safe to disable? |
| AutonomyScheduler | FLAGGED — Post-Audit | Does it mutate trading config, risk settings, or filters? Or read-only? |
| AwarenessScheduler | FLAGGED — Post-Audit | Does it mutate trading config, risk settings, or filters? Or read-only? |
| LearningCycleService | FLAGGED — Post-Audit | Premature activation during ML refactor? Disable or rebuild after VTS correction? |
| LATTI/Coherence Residual Flags | FLAGGED — Post-Audit | Do lattiManaged, lockedByUser, manualOverride fields still serve purpose? |

### Required Corrections (from audit findings + Kyle addendum)

1. **POST-AUDIT:** Consolidate shutdown handlers to prevent ML service shutdown race (BUG-015)
2. **POST-AUDIT:** Formal investigation of all 9 systems listed above — each requires: scope verification, dependency tracing, mutation impact review, performance impact review, and final decision (retain / disable / refactor / deprecate / remove)
3. **POST-AUDIT:** Determine whether AutonomyScheduler and AwarenessScheduler have write paths that mutate trading configuration, risk settings, or filters
4. **POST-AUDIT:** Evaluate whether LearningCycleService should remain active during ML refactor, be temporarily disabled, or be rebuilt after strategy-specific VTS correction
5. **POST-AUDIT:** Confirm whether residual LATTI coherence flags (`lattiManaged`, `lockedByUser`, `manualOverride`) serve any active purpose; if LATTI is fully removed, eliminate residual fields
6. **POST-AUDIT:** Implement actual auto-recovery actions in health-monitor.ts or remove the framework (RISK-046)
7. **LOW:** Verify schema-validator.ts is invoked somewhere (CI/CD or startup)
8. **LOW:** Clean up LATTI removal stub in lazy-loader.ts

---

## 26. Post-Audit Infrastructure Review (Kyle Directive)

> **Kyle (Phase 7 Addendum):** "Phase 7 does not indicate instability. It indicates architectural accumulation. These items must be revisited during the structured cleanup phase after the audit is complete. They are not emergency defects. They are hygiene candidates."

### Post-Audit Cleanup Investigation List

The following systems are flagged for formal investigation after audit completion. Each will undergo:

1. **Scope verification** — What does this system actually do?
2. **Dependency tracing** — What imports it? What does it import?
3. **Mutation impact review** — Does it modify any trading state, configuration, or risk parameters?
4. **Performance impact review** — Does it consume meaningful CPU/memory/database resources?
5. **Final decision:** Retain | Disable | Refactor | Deprecate | Remove

#### Systems Under Review

| # | System | Core Trading Required? | Risk Level | Notes |
|---|--------|----------------------|------------|-------|
| 1 | Background scheduler tasks not on core trading path | Unknown | LOW | AI summaries, weekly insights, semantic ingestion, optimization analysis, diagnostic analysis, audit anomaly |
| 2 | MicroExecutionService | Unknown | MEDIUM | Receives 1s price updates, wired at boot. May be experimental micro-coin infrastructure. |
| 3 | AutonomyScheduler | Unknown | MEDIUM | Hourly self-checks, daily optimization. May mutate guardrails or filters. |
| 4 | AwarenessScheduler | Unknown | MEDIUM | Hourly state updates, 6-hour reflections. Write paths unknown. |
| 5 | LearningCycleService | Possibly premature | MEDIUM | 24-hour learning cycle running during active ML refactor and VTS correction. |
| 6 | LATTI/Coherence residual flags | Unknown | LOW | `lattiManaged`, `lockedByUser`, `manualOverride` in boot audit telemetry. |
| 7 | CLE/CWA Scheduler Tasks | Likely Walter-era | LOW | Continuous Learning Engine and Cognitive Weight Adjustment tasks. |
| 8 | Ethical Principles Seeder | Unknown | LOW | Seeds autonomous AI decision-making principles. May have no consumers. |
| 9 | Phase 17.0 Cluster System | No (dead infra) | LOW | TaskRouter + TaskWorker. No cluster nodes registered. Simulated gates. |

#### Core Trading Path (for reference — systems NOT under review)

These systems **directly support** the active paper trading pipeline and are confirmed required:

```
FX5 Scanner → SQE (Signal Quality Evaluator) → RTB (Ready To Buy) →
TCL (Trade Candidate List) → PaperExecutionEngine →
Signal Generation → Risk Management → Execution → Telemetry → Calibration
```

Any service not directly tied to signal generation, risk management, execution, telemetry, or calibration is a candidate for this review.

---

## 27. File Catalog

| File | Lines | Directive | Status |
|------|-------|-----------|--------|
| server/index.ts | ~1,260 | A4.R10R-3 | ACTIVE — monolithic boot |
| server/core/boot_orchestrator.ts | ~348 | 8.8.4-L3 | ACTIVE |
| server/startup/invariants.ts | ~58 | 2D | ACTIVE — hard gate |
| server/startup/trading-bootstrap.ts | ~99 | A3.R2, A3.R7 | ACTIVE |
| server/startup/fx5-scanner-bootstrap.ts | ~33 | R9.3.HF-5 | ACTIVE |
| server/startup/portfolio-initializer.ts | ~55 | 8.5-K.4.1 | ACTIVE |
| server/startup/lazy-loader.ts | ~189 | Phase 5A | ACTIVE |
| server/startup/ethical-principles-seeder.ts | ~92 | 13.0 | POTENTIAL LEGACY |
| server/startup/rate-limiter-reset.ts | ~39 | — | ACTIVE (non-prod) |
| server/startup/test-user-seeder.ts | ~86 | — | ACTIVE (non-prod) |
| server/startup/printRoutes.ts | ~46 | 2E/2F | ACTIVE |
| server/bootstrap/schema-validator.ts | ~97 | 11.7F | ACTIVE (call site unknown) |
| server/services/scheduler-registry.ts | ~134 | — | ACTIVE |
| server/services/system-health.ts | ~147 | A4.R10R-4 | 🔒 LOCKED |
| server/services/system-health-monitor.ts | ~437 | — | ACTIVE |
| server/services/health-monitor.ts | ~1,495 | 41F-C/F/G/I | ACTIVE |
| server/services/feed-integrity-monitor.ts | ~572 | — | ACTIVE |
| server/services/self-repair.ts | ~303 | — | ACTIVE |
| server/utils/operation-queue.ts | ~200+ | 41F-A/B | ACTIVE |
| server/services/task-queue.ts | ~367 | 8.8.3 | ACTIVE |
| server/services/task-router.ts | ~428 | 17.0 | POTENTIAL LEGACY |
| server/services/task-worker.ts | ~407 | 17.0/17.5/17.6 | POTENTIAL LEGACY |

---

## 28. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-16 | Claude Code | Initial audit: 22 files deep-read, 1 bug, 4 risks, 3 potential legacy systems identified |
| 1.1 | 2026-02-16 | Claude Code | Phase 7 Addendum applied: Kyle's executive position added. All potential legacy systems reclassified from "AWAITING KYLE CONFIRMATION" to "POST-AUDIT CLEANUP INVESTIGATION REQUIRED". 9 systems added to Post-Audit Infrastructure Review list. MicroExecutionService, AutonomyScheduler, AwarenessScheduler, LearningCycleService, LATTI/coherence residual flags added as investigation items per Kyle's directives. New Section 26 (Post-Audit Infrastructure Review) added. Required Corrections updated from deprecation actions to post-audit investigation items. |
