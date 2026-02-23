# Directive 12.2.7: NLAI System Removal (Wave 4.7)

> **Status**: COMPLETE
> **Date Issued**: 2026-02-24
> **Date Complete**: 2026-02-24
> **Batch**: 4
> **Commit**: `5d5c2051`
> **Registry Items**: RISK-037 (NLAI deprecated)

---

## Background

The NLAI (Natural Language Action Interpreter) system was Walter AI's command bridge. It parsed chat commands into executable actions through a three-layer architecture:

1. **nlai-interpreter.ts** — Parsed natural language messages into structured action intents
2. **nlai-execution-broker.ts** — Dispatched intents to registered action handlers through a policy controller
3. **nlai-action-registry.ts** — Registered action definitions with regex pattern matching (simulation start/stop, health checks, guardrail updates, goal changes, watchlist management)
4. **contextual-nlai-interpreter.ts** — Enhanced interpreter with CIE (Contextual Intelligence Engine) awareness
5. **execution-policy-controller.ts** — Approval hooks and execution gating for autonomous actions

Kyle formally deprecated the NLAI system in the Phase 5 Addendum (2026-02-16):
> "Walter has been deprecated. Conversational goal system removed. Goals tab removed. System now operates via deterministic UI and services. NLAI is legacy conversational control infrastructure, no longer aligned with system direction."

## What Was Changed

### 5 Files Deleted (~2,147 lines)
| File | Lines | Purpose |
|------|-------|---------|
| `server/services/nlai-interpreter.ts` | 194 | Core NLAI interpreter |
| `server/services/nlai-execution-broker.ts` | 478 | Action dispatch broker |
| `server/services/nlai-action-registry.ts` | 854 | Registered action definitions |
| `server/services/contextual-nlai-interpreter.ts` | 312 | CIE-aware interpreter |
| `server/services/execution-policy-controller.ts` | 309 | Approval hooks (NLAI-only) |

### 6 Files Modified (Import/Reference Cleanup)
| File | Changes |
|------|---------|
| `server/routes.ts` | 3 NLAI imports removed, ExecutionPolicyController init removed, NLAI chat handler block removed (intent parser + command router now primary) |
| `server/services/live-trading-service.ts` | ExecutionPolicyController + ActionResult imports removed, ActionResult type inlined, approval comment updated |
| `server/services/auto_test_harness.ts` | nlai-action-registry import removed, multi-intent test scenario removed, EPC reference updated |
| `server/services/paper-sim-service.ts` | Comment reference to ExecutionPolicyController removed |
| `server/services/config-update-service.ts` | NLAI comment reference removed, "Updated via Walter NLAI" string replaced with "Updated via API" |
| `server/services/cognitive-tuner.ts` | NLAI test references renamed to "reasoning" |

## Architectural Impact

**Zero impact on active trading pipeline.** NLAI had no connection to:
- Signal Orchestrator (signal generation)
- SQE/RTB/TEC (signal quality, ready-to-buy, execution)
- VTS (machine learning calibration)
- TradeSafety / Guardrails V2 (risk management)
- FX5 Scanner (market scanning)
- DSE / Trading Engine (order execution)

The chat handler in `routes.ts` now falls through directly to the intent-parser + command-router path, which already handled trading commands. The NLAI layer was an additional parsing step that rarely matched — removing it simplifies the chat flow.

## Why NLAI Was Removed Before Walter

NLAI is the command bridge between Walter's chat interface and the execution layer. Removing it first ensures that when we delete Walter's files in Wave 3 (Directive 12.2.3), there are no dangling command dispatch paths or circular dependencies. This is the logical prerequisite.

## Verification

- **Grep**: Zero NLAI references remain in `server/` (only directive annotation comments)
- **TSC**: No NLAI-related errors (all errors pre-existing)
- **Vitest**: 816 pass / 81 fail — matches baseline exactly
- **Server startup**: Clean, no NLAI-related errors
