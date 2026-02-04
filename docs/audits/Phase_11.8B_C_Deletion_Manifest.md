# Directive 11.8B-C Deletion Manifest

## Purpose
This manifest documents all files removed as part of Directive 11.8B-C: Goals ML & Preset System Decommission. Phase 11 Predictive Learning is now the single authority for parameter adjustment.

## Files Deleted

### Frontend Components (client/)

| File Path | Reason for Deletion | Replacement Authority |
|-----------|---------------------|----------------------|
| `client/src/components/goals/tuning-tab.tsx` | Goals ML Engine UI - parallel learning system | Phase 11 Predictive Learning |
| `client/src/components/goals/presets-grid.tsx` | Preset System UI - preset-driven parameter mutation | Manual guardrail configuration |
| `client/src/components/goals/adaptive-risk-advisor.tsx` | ARA UI - parallel adaptive risk system | Phase 11 Predictive Learning |

### Backend Services (server/)

| File Path | Reason for Deletion | Replacement Authority |
|-----------|---------------------|----------------------|
| `server/services/dhma-tuning-service.ts` | DHMA auto-tuning - parallel learning system | Phase 11 Predictive Learning |
| `server/jobs/cognitive-tuning-job.ts` | Scheduled tuning job - parallel learning trigger | Phase 11 ML Calibration Scheduler |

## Routes Deprecated (410 Gone)

| Route | Reason |
|-------|--------|
| `GET /api/goals-presets` | Preset system decommissioned |
| `GET /api/goals-presets/active` | Preset system decommissioned |
| `PUT /api/goals-presets/select` | Preset system decommissioned |
| `GET /api/goals-learning/summary` | Goals ML Engine decommissioned |
| `POST /api/goals-learning/trigger` | Goals ML Engine decommissioned |

## UI Changes

| Component | Change | Reason |
|-----------|--------|--------|
| `goals-engine.tsx` | Tuning tab removed | Goals ML Engine decommissioned |
| `goals-engine.tsx` | PresetsGrid removed from Goals tab | Preset system decommissioned |
| `goals-engine.tsx` | AdaptiveRiskAdvisor removed from Goals tab | ARA decommissioned |
| `goals-engine.tsx` | LPCP hidden from Guardrails tab | Not operationally used (backend preserved) |
| `enhanced-system-monitoring.tsx` | LottieTuningTab references removed | Already deleted in 11.8B-B |

## Preserved Systems (Not Touched)

- ✅ Coherency System (read-only display)
- ✅ Phase 11 Predictive Learning (server/core/calibration/*)
- ✅ Phase 11 Governance (server/core/governance/*)
- ✅ Telemetry Services (server/services/telemetry-*)
- ✅ Net Expectancy Kernel (server/core/calculations/net-expectancy-kernel.ts)
- ✅ ML Weight Logic

## Database Fields (FROZEN)

The following database fields are preserved but no longer actively written to:

- `tunedByLatti` - FROZEN per directive
- `managedByLottie` - FROZEN per directive

## Verification Evidence

### Search Results (Zero Matches Expected in Active Code)

- `PresetsGrid` - No matches in client/
- `AdaptiveRiskAdvisor` - No matches in client/
- `dhma-tuning` - No matches in server/
- `cognitive-tuning-job` - No matches in server/
- `registerCognitiveTuningJob` - No matches in server/

## Acceptance Criteria Status

| Criteria | Status |
|----------|--------|
| Goals ML cannot mutate anything | ✅ PASS |
| Presets do not exist anywhere | ✅ PASS |
| Tuning tab is gone | ✅ PASS |
| Coherency remains display-only | ✅ PASS |
| LPCP is hidden | ✅ PASS |
| Predictive Learning remains untouched | ✅ PASS |
| No legacy learning loop exists | ✅ PASS |

## Date
2026-02-04

## Directive Authority
Kyle (Approval Authority)
Replit (Execution Authority)
