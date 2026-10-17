# B-ORCHESTRATOR-ROUTES-REMOVAL — SCOPE (Step 1, r1)

change-class: non_architecture

**Issue:** `#1210` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 59g1 (after 59g, before 59g2) · **Owner:** CC-B (NEW Claude)
*Read at `origin/migration/aws-supabase` `06b1b2886`; staging probed 2026-10-17 ~15:55Z UTC.*

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (`#1210`): `POST /orchestrator/audit` is "the 'Run Audit Now' button behind the empty formula-audit card". NOW: it is the "Run System Audit" button in the tab header; the formula card's "Run Audit Now" calls `GET /api/system/formula-audit/run`, a live route. REASON:** read the page's mutations (`ai-transparency.tsx:173-177` vs `:194-196`).
- **PREVIOUSLY STATED (`#1210`): the four routes "never work" because they import the deleted module. NOW: three are wholly the deleted module's; the fourth (`/audit`) does its own work and dies only at one unused line.** `const { aiOrchestrator } = await import('./orchestrator/orchestrator')` (`routes.ts:18483`) — `aiOrchestrator` is never referenced after it.

## 0. What is there (census, tests excluded, at the ref)
**The deleted module** `server/orchestrator/orchestrator.ts` (491 lines) and `server/orchestrator/summaries/telemetry.json` were removed 2025-11-05 in `b5eba38a7` — a Replit checkpoint that deleted 3,145 files (152,920 lines) in one purge. Four `await import()` sites remain, all in `routes.ts`: `:18387`, `:18404`, `:18421`, `:18483`. `.tsc-baseline.json:171` carries them as one known error ×4. **Live on staging:** `GET /api/orchestrator/telemetry` and `/analysis` → **500** *"Cannot find module '…/dist/orchestrator/orchestrator'"* (measured ~15:55Z through `dt-api`).

**Every consumer of the four endpoints** — `client/src/pages/ai-transparency.tsx` only (no `shared`, `scripts`, or test reader):
| endpoint | client reader | what it drives |
|---|---|---|
| `GET /orchestrator/telemetry` (`:18385`) | query `:121-124`, invalidated `:161` | the gate `telemetryLoading ? … : telemetry ? (…) : "No telemetry data available"` (`:538` → `:867`) and, inside it, five cards: System (CPU / memory / uptime), Trading (total P&L / win rate / ROI), AI (learning cycles / opportunities / adjustments), Active Goals, Active Guardrails |
| `GET /orchestrator/analysis` (`:18402`) | query `:127-130`, invalidated `:160` | the urgency badge in the tab header (`:485-493`) and the whole **AI Analysis tab** (`:1041-1111`, trigger `:431-434`: anomalies + optimizations) |
| `POST /orchestrator/analyze` (`:18419`, admin) | mutation `:151-171` | the "Trigger Analysis" button (`:515-534`) — *"GPT-4o is analyzing the system"* |
| `POST /orchestrator/audit` (`:18432`, admin) | mutation `:173-189`, state `auditReport` | the "Run System Audit" button (`:496-514`) and the System Audit Report card (inside the gate) |

**Two LIVE pieces sit inside the same dead gate** and are therefore never drawn: the **System Audit Report** card (fed by the mutation, not the gate) and the **Formula Health** card (`card-formula-health`, its own query `GET /api/system/formula-audit`, `:139-142`). The Feed Health card had the same problem and was hoisted by row 3a (`07bf5d37b`).

**Out of scope, confirmed live:** `GET /orchestrator/learning-summary` (`:18588`), `GET`/`POST`/`PATCH /orchestrator/logs` (`:18672-18734`), `POST /orchestrator/updateGoal` / `updateStrategy` (`:18755`, `:18806`) — none imports the module (Langston measured learning-summary and logs at 200 with real data, row 59g Step 8).

## 1. Provenance (TIER 1) and the five dispositions
- **Intent, quoted:** the routes were introduced in `c56d8af53` (2025-10-11, Replit): *"Add AI analysis and logging capabilities to the trading platform … new API endpoints for AI analysis, telemetry, and logs, along with database schema updates for AI orchestrator logs … a check to prevent AI analysis if the OpenAI API key is not configured."* The module was a GPT-4o reviewer: it assembled system, trading and AI telemetry and asked OpenAI for anomalies and optimizations (`b5eba38a7^:server/orchestrator/orchestrator.ts:1-40`, the `Telemetry` / `SystemMetrics` / `TradingMetrics` / `AIMetrics` interfaces).
- **Its retirement was deliberate:** the System Manual §22 (Walter Shutdown Gate) records *"The AI Orchestrator import is already commented out with 'Phase 0: Removed AI Orchestrator (legacy module)'. This confirms the orchestrator was deprecated before the Walter shutdown gate was added."* The routes were left behind by the purge, not kept on purpose: `BATCH_56_SCOPE.md:132` lists them as a tsc error (*"deleted module"*), never as a decision.
- **Corpora searched:** `BATCH_CATALOG`, `RUNNING_ISSUES`, the completion reports, `SYSTEM_MANUAL` + sections, `SYSTEM_IMPACT_MAP` (by route, symbol, page and "Command Center"); `git log -S "aiOrchestrator.getLatestTelemetry"`; `bridge/canonical/` — **no coverage**: every "orchestrator" hit there is the signal orchestrator.

| piece | disposition | why |
|---|---|---|
| telemetry route, its query, the gate and the five telemetry cards | **(5) disconnected, delete** | the module that fed it was retired on purpose; nothing else produces that shape |
| analysis route, its query, the urgency badge, the AI Analysis tab | **(5) delete** | same module; the tab has no other content |
| analyze route, its mutation and the "Trigger Analysis" button | **(5) delete** | it asked the retired GPT-4o reviewer to run |
| audit route, its mutation, "Run System Audit" and the System Audit Report card | **(4) REMOVE — recommended; Langston to rule** | see §1a |
| Formula Health card | **(3) reconnect** — draw it outside the deleted gate | live, own query; hidden only by the gate |

### 1a. The system audit — remove, not repair (the one judgement call)
Deleting the one unused import (`:18483`) would make the route answer again — but what it would answer is partly made up:
- **Database:** `storage.getDatabaseStatus?.()` — **no such method exists** on `storage` (repo-wide `git grep` at the ref: the one call site, no definition — the same search finds `getErrorLogs`' definition at `storage.ts:2070`, so it reaches the file), so the optional call returns `undefined` and the fallback `{ sizeMb: 0 }` prints **"0.00 MB — healthy"** every time.
- **AI:** `ai.orchestrator.status: 'running'` is a hard-coded string, and its three counts are read from `server/orchestrator/summaries/telemetry.json`, deleted with the module — always 0.
- **Thresholds are Replit-era:** database healthy below 100 MB, configuration *fails* without an OpenAI key.
- What is left that is real (CPU load, memory, uptime, engine running flags, the error-log count) is served live elsewhere: `GET /api/system/health` (`routes.ts:537`: `cpuLoad`, `rss`, `uptime`, event-loop lag) and the engine status routes.
⇒ **Repairing it means rewriting half of it to stop it reporting fabricated values; the rest duplicates live views. Recommend delete** (route, mutation, button, card, `auditReport` state). **Alternative (3):** keep the route minus the import, the fabricated DB and AI sections and the OpenAI check. **Rule which.**
⚠️ **Interlock:** `active-engine-service.ts:1302-1304` (B-ENGINE-HEARTBEAT-DEAD-PATHS, `#1158`) and `SYSTEM_IMPACT_MAP.md:142` say *"only `POST /orchestrator/audit` reads the flip"* — that reader has been returning 500 since before that batch. Either disposition rewrites both sentences (remove ⇒ "no reader"; repair ⇒ unchanged).

## 2. Objectives
1. **Delete** the telemetry, analysis and analyze routes; their queries, mutation, invalidations, the gate and its five cards, the urgency badge, the "Trigger Analysis" button, and the AI Analysis tab + trigger; any helper or import left unused (`getUrgencyColor`, icons). **Test:** the page source names none of `/api/orchestrator/telemetry`, `/analysis`, `/analyze`; `routes.ts` registers none of the three.
2. **The audit, per §1a's ruling.** If removed: the route, mutation, button, card and `auditReport` state; if repaired: the import, the DB and AI sections and the OpenAI check go, and a test pins that the route answers. **Test either way:** no `import('./orchestrator/orchestrator')` anywhere.
3. **Draw the Formula Health card** at the top level of the AI Command Center tab, beside Feed Health (the gate is gone). **Fence:** the card is not nested inside any conditional on removed data (the row-3a fence shape).
4. **The tsc baseline:** `.tsc-baseline.json:171` entry (×4) removed; `scripts/check-tsc-baseline.mjs` passes at the lower count.
5. **Stale statements fixed in the same commit:** `active-engine-service.ts:1302-1304` and `SYSTEM_IMPACT_MAP.md:142` (§1a interlock).
6. **Verify (Step 7, Chrome):** AI Transparency → AI Command Center draws Feed Health and Formula Health with data; the AI Analysis tab is gone; the network log for the page shows no `/api/orchestrator/telemetry|analysis` request; Automation Logs / Orchestrator Activity (the live `/logs`, `/learning-summary`) still load.

**Record (no change, for Step 2 to measure):** `GET /api/system/formula-audit` — the card's *read* — calls `formulaAuditService.runAudit()` on every request (`routes.ts:15137-15140`), and the page polls it every 5 minutes (`:141`) whether or not the card is drawn. Drawing the card does not change the call rate. Step 2 states its cost before deciding whether it needs a home.
**Docset (non_architecture):** scope, pre-audit, completion report, `BATCH_CATALOG`, `PHASE_HISTORY`, `DELETED_COMPONENTS_LOG` + archive, System Impact Map (`:142` and the routes), System Manual (§22's note gains "and its four routes were removed"; the route table if it lists them), the plan row, the task list.
**Out of scope:** the live `/orchestrator/*` routes listed in §0; the `ai_orchestrator_logs` table; the page decomposition (RISK-064).
