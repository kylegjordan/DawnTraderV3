# DawnTrader Stabilization & Reintegration Plan v1.9.7

**Author:** GPT-5 (Oversight Agent)  
**Date:** November 7, 2025  
**Version:** 1.9.7  
**Project:** DawnTrader Refactor Continuation (Post-Phase 5B)

---

## 🧭 Executive Summary
This document defines the complete roadmap for the stabilization, observability, configuration, and reintegration of DawnTrader — transforming the refactored V1 system into a production-grade, self-monitoring, and autonomy-ready architecture.  

It covers Phases **5C through 9**, each structured with clear objectives, implementation details, validation requirements, and expected deliverables.

---

## 📋 Summary of Phases (Overview)

### **Phase 5C — Observability Setup**
**Goal:** Implement full-stack observability for metrics, health, and logs.
- Integrate system-wide metrics collection (TradingEngine, Guardrails, LATTI, Queue, Telemetry).
- Implement `/api/metrics`, `/api/health`, and `/api/logs/recent` endpoints.
- Build frontend **Observability Dashboard** (uptime, queue depth, latency charts).
- Add JSON-structured logging with correlation IDs and timestamps.
- Define 5 key SLOs: signal latency, order latency, portfolio staleness, queue depth, and event-loop lag.
- Introduce color-coded alerts for SLO violations.
- Validate with 48-hour runtime test and metrics reporting.

### **Phase 6 — Config Registry & Runtime Governance**
**Goal:** Centralize configuration management and runtime safety.
- Create Config Registry (`config_registry` table + REST API).
- Register all critical runtime flags: `ENABLE_LATTI`, `CLE_ENABLED`, `MAX_POSITIONS`, `KILL_SWITCH%`, etc.
- Implement `GET /api/config` and `PUT /api/config` endpoints (role-gated).
- Add runtime change tracking (ConfigAuditService).
- Build Config UI panel with editable toggles (admin-only).
- Integrate registry into startup logic; remove hard-coded flags.
- Validate with runtime flag toggles and persistence verification.

### **Phase 7 — Paper Mode Stability Test**
**Goal:** Verify 24/7 runtime stability and trade coherence under simulated conditions.
- Run 48-hour paper trading stress test.
- Validate zero memory leaks and sub-5s portfolio lag.
- Monitor queue saturation and trade lifecycle consistency.
- Add `runtime_metrics.csv` export per hour.
- Detect and auto-handle stuck trades or missed heartbeats.
- Generate continuous anomaly reports and verify recovery logic.
- Pass/fail criteria: no crashes, <1% SLO violations.

### **Phase 7.5 — Automated Tests & CI Enhancements**
**Goal:** Reinforce stability via automation.
- Create Jest + Playwright test suites for backend and UI.
- Add CI/CD workflow (GitHub Actions or Replit Deploy Hooks).
- Automate linting, type checks, build validation, and E2E tests.
- Integrate code coverage thresholds (>85%).
- Schedule nightly builds and health tests.
- Generate `/audit/phase7.5-test-results.md` with pass/fail logs.

### **Phase 8 — Controlled Autonomy Re-Enable**
**Goal:** Reactivate LATTI and Orchestrator autonomy safely.
- Gradual reactivation: Reasoning → CLE → Ethics.
- Enforce two-person approval rule for live mode autonomy.
- Restore `AdaptiveGuardrails` and `MotivationEngine` modules.
- Validate Lottie’s learning adjustments in paper mode.
- Implement hard throttles (max 3 adaptive changes / 24h).
- Create `LATTI Insights` dashboard (reasoning logs, motive states).
- Verify alignment: no rogue actions or unsafe signals.

### **Phase 9 — Code Hardening & Legacy Purge**
**Goal:** Achieve final production readiness.
- Audit for deprecated imports, unused files, and duplicate code.
- Replace temporary debug logs with structured telemetry.
- Run `npm audit`, fix vulnerabilities.
- Implement read-only API key enforcement and final security sweep.
- Finalize documentation: `/docs/v1.9.9-architectural-summary.md`.
- Tag stable release: `v2.0.0-Alpha`.

---

# 📘 Detailed Phase Plans

---

## **Phase 5C – Observability Setup (Full Implementation)**

### 🎯 Objective
Establish a comprehensive observability layer enabling real-time monitoring of the trading engine, telemetry, LATTI, and queue systems.

### 🧩 Components
1. **Metrics Service (`server/services/metrics-service.ts`)**
   - Aggregates metrics from core subsystems.
   - Calculates SLO adherence.
   - Emits JSON metrics payloads via WebSocket (`metrics_update`).
2. **Health Endpoint**
   - `/api/health`: returns uptime, CPU usage, memory footprint, event-loop lag.
   - `/api/metrics`: returns system SLOs and subsystem performance.
3. **Frontend Observability Dashboard**
   - `/monitoring` route.
   - Displays color-coded cards (green/yellow/red) per metric.
   - Auto-refresh every 15 seconds.
4. **Structured Logging**
   - Replace console.log with `logger.info()` / `logger.error()`.
   - Include `trace_id`, `symbol`, `mode`, and timestamp.
5. **Alert Engine**
   - Emits warnings when any metric breaches defined thresholds.
   - Integrated into health monitor.

### 🧪 Validation
- Run 48-hour paper-mode operation.
- Capture metrics every minute.
- Validate metrics accuracy ±2%.
- Verify zero log gaps >5 seconds.
- Deliverable: `/audit/phase5c-observability-validation.md`.

---

## **Phase 6 – Config Registry & Runtime Governance**

### 🎯 Objective
Create a central repository for runtime flags, enforcing traceability and operational safety.

### 🧩 Implementation Steps
1. **Schema Definition**
   - Create `config_registry` table:
     ```sql
     id UUID PRIMARY KEY,
     key VARCHAR(100) UNIQUE NOT NULL,
     value JSONB NOT NULL,
     type VARCHAR(20) NOT NULL,
     updated_at TIMESTAMP DEFAULT NOW(),
     updated_by VARCHAR(100)
     ```
2. **Backend Services**
   - `ConfigService`: manages CRUD + change audit.
   - `ConfigAuditService`: logs every modification.
3. **API Endpoints**
   - `GET /api/config` → fetch all configs.
   - `PUT /api/config` → update (role=admin).
4. **Frontend Integration**
   - Config Panel under `System Settings`.
   - Editable toggles, JSON validation.
5. **Runtime Hooks**
   - Inject into engine startup.
   - Example: `if (config.get('ENABLE_LATTI')) startLATTI()`.
6. **Validation**
   - Modify flags live and confirm reflected behavior.
   - Deliverable: `/audit/phase6-config-validation.md`.

---

## **Phase 7 – Paper Mode Stability Test**

### 🎯 Objective
Prove runtime stability and trade coherency through long-duration simulation.

### 🧩 Implementation Steps
1. Enable continuous trading in `mode=paper`.
2. Log trade lifecycle events every 10 seconds.
3. Export metrics to CSV hourly (`runtime_metrics.csv`).
4. Inject minor network delays to test resilience.
5. Validate portfolio refresh under 5s latency.
6. Analyze heap and memory usage for leaks.
7. Deliverable: `/audit/phase7-stability-burnin-report.md`.

---

## **Phase 7.5 – Automated Tests & CI Enhancements**

### 🎯 Objective
Guarantee consistency and repeatability across builds.

### 🧩 Implementation Steps
1. Add `jest` for backend unit/integration tests.
2. Add `playwright` for frontend regression tests.
3. CI workflow:
   - Lint, typecheck, build, test, deploy.
4. Add code coverage badge in README.
5. Nightly build validation in GitHub Actions.
6. Deliverable: `/audit/phase7.5-ci-validation.md`.

---

## **Phase 8 – Controlled Autonomy Re-Enable**

### 🎯 Objective
Reactivate Lottie’s adaptive systems under strict control.

### 🧩 Implementation Steps
1. Enable `LATTI` core modules.
2. Sequentially re-enable Orchestrators:
   - Phase 8A: Reasoning.
   - Phase 8B: CLE.
   - Phase 8C: Ethics Consensus.
3. Add approval flow for live mode (two-person rule).
4. Activate adaptive throttles (≤3/day).
5. Add telemetry view for Lottie activity.
6. Validate learning loops in paper mode.
7. Deliverable: `/audit/phase8-autonomy-validation.md`.

---

## **Phase 9 – Code Hardening & Legacy Purge**

### 🎯 Objective
Finalize code quality, performance, and compliance for release.

### 🧩 Implementation Steps
1. Full repo audit using `eslint`, `depcheck`, `npm audit`.
2. Remove obsolete files and old debug logic.
3. Harden API endpoints (role validation, rate limits).
4. Encrypt stored credentials and secrets.
5. Validate schema migrations and backups.
6. Document architecture (diagrams + service map).
7. Deliverable: `/docs/v1.9.9-architectural-summary.md`.

---

# ✅ Final Deliverables Overview
| Phase | Deliverable | Output File |
|--------|--------------|--------------|
| 5C | Observability validation | `audit/phase5c-observability-validation.md` |
| 6 | Config registry validation | `audit/phase6-config-validation.md` |
| 7 | Stability test report | `audit/phase7-stability-burnin-report.md` |
| 7.5 | CI pipeline validation | `audit/phase7.5-ci-validation.md` |
| 8 | Autonomy re-enable validation | `audit/phase8-autonomy-validation.md` |
| 9 | Final architecture documentation | `docs/v1.9.9-architectural-summary.md` |

---

**End of Document – DawnTrader Stabilization & Reintegration Plan v1.9.7**

