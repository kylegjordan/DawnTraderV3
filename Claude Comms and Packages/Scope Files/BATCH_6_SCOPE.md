# Batch 6 Scope: Wave 3 Sub-Batch B — Walter Files with External Importers + Frontend + Routes

> **Date**: 2026-02-26
> **Directive**: 12.2.3 (Walter/Bob/Cortex Removal, Wave 3)
> **Type**: Code deletion + active service surgery + frontend cleanup
> **Estimated Size**: ~5,800 lines deleted across 10 Walter files + ~2,400 lines deleted across 5 frontend files + ~1,500 lines of route handler removal + ~50 lines of surgery across 7 consuming files

---

## Context: What Sub-Batch A (Batch 5) Completed

Batch 5 deleted 9 Walter service files with zero external importers (~2,792 lines). Test baseline moved from 816/81 to 809/81 (7 Walter-specific tests removed). No active services were modified.

**Current snapshot**: SNAPSHOT-010 (`dbe063d4`) — pending Batch 5B governance update.

---

## Strategy: Sub-Batch B Scope

Sub-Batch B is the remaining Walter cleanup — every Walter file with active external importers, all Walter frontend components, the Walter route handlers in routes.ts, and the Walter startup code in index.ts. This is HIGH complexity because it requires surgery on 7 actively-used consuming files.

### Risk Mitigation

The consuming files (ai-analyst.ts, event-broker.ts, etc.) are active production services. Each surgical modification follows the same pattern: **remove the import, remove the call site, leave the surrounding logic intact.** No behavioral replacements — these Walter integrations were never activated in production (the system runs without Walter/Bob/Cortex AI assistants).

---

## Batch 6 Targets

### Part 1: 10 Walter Backend Files to Delete

| # | File | Lines | External Importers (to be cleaned) |
|---|------|-------|------------------------------------|
| 1 | `server/services/walter-purpose.ts` | 123 | ai-analyst.ts, ai-opportunities.ts, test file |
| 2 | `server/services/walter-memory.ts` | 374 | ai-analyst.ts, context-refresh-coordinator.ts, event-broker.ts |
| 3 | `server/services/walter-expert-corpus.ts` | 369 | corpus-domain-service.ts, test file |
| 4 | `server/services/walter-chat-lifecycle.ts` | 259 | routes.ts |
| 5 | `server/services/walter-ops-engine.ts` | 1,345 | routes.ts, formula-auto-audit.ts, feed-integrity-auto-check.ts |
| 6 | `server/services/walter-tts.ts` | 96 | routes.ts |
| 7 | `server/services/walter-ingest.ts` | 310 | routes.ts |
| 8 | `server/services/walter-patch-analyst.ts` | 236 | routes.ts, test file |
| 9 | `server/services/walter-health-monitor.ts` | 207 | index.ts |
| 10 | `server/adapters/walter-compat.ts` | 80 | None (isolated adapter, missed in Sub-Batch A) |

**Subtotal**: ~3,399 lines deleted

### Part 2: 5 Frontend Files to Delete

| # | File | Lines | Notes |
|---|------|-------|-------|
| 1 | `client/src/pages/walter.tsx` | 1,386 | Main Walter chat page |
| 2 | `client/src/components/walter-floating-assistant.tsx` | 501 | Floating widget on all pages |
| 3 | `client/src/pages/walter-approvals.tsx` | 366 | Approval settings page |
| 4 | `client/src/components/walter/chat-file-attachment.tsx` | 86 | Chat file attachment sub-component |
| 5 | `client/src/hooks/useWalterPreferences.tsx` | 38 | React Query hook for Walter preferences |

**Subtotal**: ~2,377 lines deleted

### Part 3: Frontend Surgical Modifications (2 files)

#### `client/src/App.tsx` (~20 lines removed)
- Remove `WalterFloatingAssistant` import (line 18)
- Remove `WalterPage` lazy load (line 23)
- Remove `/walter` route (line 217)
- Remove `/walter` entry from `contextMap` (line 135)
- Remove `WalterFloatingAssistant` render block (lines 243-246, 4 lines)
- Remove `getPageContext()` function if only used by Walter (lines 118-139, ~22 lines)

#### `client/src/components/layout/sidebar.tsx` (~1 line removed)
- Remove Walter nav item from `navigation` array (line 37): `{ name: "Walter", href: "/walter", icon: Bot }`
- Remove `Bot` icon from lucide-react import if only used by Walter

### Part 4: Backend Surgical Modifications (7 files)

#### `server/routes.ts` — 28 Walter route handlers removed (~1,500 lines)
Walter routes span lines ~12,262 to ~19,118. All 28 `/api/walter/*` route handlers are removed:
- 3 static imports removed (walter-chat-lifecycle, walter-tts, walter-ingest)
- 4 dynamic imports removed (walter-ops-engine, walter-patch-analyst)
- Route handlers: /walter/tts, /walter/ingest, /walter/ingest/history, /walter/actions, /walter/auto-resolved-today, /walter/actions/:id/approve, /walter/actions/:id/reject, /walter/actions/:id/acknowledge, /walter/pending-approvals, /walter/approvals/:id/approve, /walter/approvals/:id/reject, /walter/chats (CRUD), /walter/chats/:id/messages, /walter/purpose (GET/POST), /walter/memory (GET/POST), /walter/analyze-file, /walter/preferences (GET/PUT), /walter/chats/:id/pin, /walter/chats/:id/unpin, /walter/chats/:id/export, /walter/interpret-command

#### `server/index.ts` — Walter health monitor startup removed (~5 lines)
- Remove dynamic import and `walterHealthMonitor.start()` call (line ~413)

#### `server/services/ai-analyst.ts` — 2 imports + ~5 call sites (~10 lines)
- Remove: `import { getWalterPurpose, createPurposePromptSection, logPurposeUsage }` from walter-purpose
- Remove: `import { createMemoryPromptSection }` from walter-memory
- Remove all call sites using these functions (purpose prompt assembly, memory injection, usage logging)

#### `server/services/ai-opportunities.ts` — 1 import + ~2 call sites (~5 lines)
- Remove: `import { getWalterPurpose, createPurposePromptSection, logPurposeUsage }` from walter-purpose
- Remove all call sites

#### `server/services/context-refresh-coordinator.ts` — 1 import + 1 call site (~3 lines)
- Remove: `import { createMemory }` from walter-memory
- Remove `createMemory()` call that stores context refresh observations

#### `server/services/event-broker.ts` — 1 import + 1 call site (~3 lines)
- Remove: `import { createMemory }` from walter-memory
- Remove `createMemory()` call that stores execution events

#### `server/services/corpus-domain-service.ts` — 1 import + usage (~5 lines)
- Remove: `import { WALTER_EXPERT_CORPUS, type CorpusDomain }` from walter-expert-corpus
- Remove any code referencing `WALTER_EXPERT_CORPUS`

#### `server/jobs/feed-integrity-auto-check.ts` — 1 import + call site (~10 lines)
- Remove: `import { WalterOpsEngine, type AnomalyInput }` from walter-ops-engine
- Remove `WalterOpsEngine.processAnomaly()` call — anomalies will still be detected but won't route to Walter's ops engine

#### `server/jobs/formula-auto-audit.ts` — 1 import + call site (~10 lines)
- Remove: `import { WalterOpsEngine, type AnomalyInput }` from walter-ops-engine
- Remove `WalterOpsEngine.processAnomaly()` call

### Part 5: Test File Cleanup

#### `server/tests/phase-6.0-simulations.test.ts`
- Remove imports of `BOB_IDENTITY`, `createSystemKnowledgeSection` from walter-purpose
- Remove imports of `WALTER_EXPERT_CORPUS` from walter-expert-corpus
- Remove any test blocks that depend on these imports

#### `server/tests/diagnostic-system.test.ts`
- Remove import of `walterPatchAnalyst` from walter-patch-analyst
- Remove any test blocks that depend on this import

### Part 6: Ancillary File Deletions (Optional — Kyle to decide)

Walter screenshot files at repo root:
- `after-open-walter.png`
- `systems_tab_walter.png`
- `walter_response.png`
- `walter_response_full.png`

Walter documentation files:
- `docs/walter-ai-response-workflow.md`
- `docs/walter-expert-corpus-v1.md`
- `docs/walter-prompt-template.md`
- `diagnostic-reports/phase-38-walter-compat-parity-report.md`
- `diagnostic-reports/phase-39-walter-adapter-validation.md`
- `diagnostic-reports/phase-40-walter-adapter-check.md`
- `docs/audits/phase_8.8.3-H11_autonomy_walter_isolation.md`
- `scripts/test-walter-behavioral-integration.ts`
- `scripts/test-walter-personality.ts`

---

## What Is NOT in This Batch

**Bob ecosystem** (deferred to Batch 7/Tier C):
- `bob-core.ts` — critical hub with 9+ importers
- `bob-routing.ts`, `bob-context.ts`, `bob-personality.ts`, etc.
- Bob API routes in routes.ts

**Cortex ecosystem** (deferred to Batch 8/Tier C):
- `cortex-core.ts` — 8 active service consumers + lazy-loader integration
- Cortex service files

**Database schema/table cleanup** — Walter tables (`walter_chats`, `walter_messages`, `walter_memories`, `walter_purpose`, `walter_preferences`, `walter_actions`, `walter_approvals`) exist in the DB but are NOT touched in code deletion batches. Schema cleanup is a separate concern tracked in `LEGACY_DEPRECATION_PLAN.md`.

---

## Dependency Safety Verification

```
DELETION SET (10 backend + 5 frontend + ancillary):
  All Walter service files removed
  All Walter frontend components removed
  walter-compat adapter removed

SURGERY SET (7 backend + 2 frontend):
  ai-analyst.ts          → Remove walter-purpose + walter-memory imports/calls
  ai-opportunities.ts    → Remove walter-purpose imports/calls
  context-refresh-coordinator.ts → Remove walter-memory import/call
  event-broker.ts        → Remove walter-memory import/call
  corpus-domain-service.ts → Remove walter-expert-corpus import/usage
  feed-integrity-auto-check.ts → Remove walter-ops-engine import/call
  formula-auto-audit.ts  → Remove walter-ops-engine import/call
  routes.ts              → Remove 3 static imports, 4 dynamic imports, 28 route handlers
  index.ts               → Remove walter-health-monitor startup
  App.tsx                → Remove Walter imports, route, floating assistant render
  sidebar.tsx            → Remove Walter nav item

NO remaining references to any walter-* module after this batch.
```

---

## Expected Validation

- **TSC**: May see reduction in pre-existing errors if some were Walter-related. No NEW errors expected — all import removals are matched with file deletions.
- **Vitest**: Test count will decrease (Walter-specific tests removed from phase-6.0-simulations and diagnostic-system). Pass/fail ratio on remaining tests should hold.
- **Server startup**: No impact — walter-health-monitor startup is removed cleanly (fire-and-forget async, non-blocking).
- **Frontend**: Walter page, floating assistant, and nav item gone. App loads without them.

---

## Estimated Total Impact

| Category | Lines Removed |
|----------|--------------|
| 10 Walter backend files deleted | ~3,399 |
| 5 frontend files deleted | ~2,377 |
| routes.ts Walter handlers removed | ~1,500 |
| Consuming file surgery (7 backend + 2 frontend) | ~75 |
| Test file cleanup | ~30 |
| Ancillary files (if included) | ~500+ |
| **Total** | **~7,900+** |

---

## Batch Deliverables

1. **INSTRUCTIONS.md** — File deletions + surgical modifications for all consuming files
2. **README.md** — Batch documentation
3. **Modified files** in repo-relative paths (routes.ts, index.ts, ai-analyst.ts, ai-opportunities.ts, context-refresh-coordinator.ts, event-broker.ts, corpus-domain-service.ts, feed-integrity-auto-check.ts, formula-auto-audit.ts, App.tsx, sidebar.tsx, 2 test files)
4. **Zip** — `BATCH_6-DIR_12.2.3_WALTER_IMPORTERS_FRONTEND_ROUTES.zip`

---

## Future Batches Roadmap (Updated)

| Batch | Tier | Scope | Estimated Complexity |
|-------|------|-------|---------------------|
| **5** | A | 9 Walter safe deletions (DONE) | LOW |
| **5B** | — | Governance update for Batch 5 (PENDING) | LOW |
| **6** (this) | B | 10 Walter files + frontend + routes.ts/index.ts surgery | HIGH |
| **7** | C | Bob ecosystem (bob-core hub + modules + bob routes) | HIGH |
| **8** | C | Cortex files + lazy-loader cleanup | MODERATE-HIGH |
| TBD | — | 12.2.1 residuals (latti-safety-monitor.tsx) | LOW |
| TBD | — | Walter/Bob/Cortex DB schema cleanup | MODERATE |

> **Note**: Batch numbers 7-8 are provisional. Actual scoping will be done after each batch validates.
