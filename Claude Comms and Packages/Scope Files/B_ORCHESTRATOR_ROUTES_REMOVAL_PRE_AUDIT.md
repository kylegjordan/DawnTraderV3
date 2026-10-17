# B-ORCHESTRATOR-ROUTES-REMOVAL — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · **Issue:** `#1210` · **Plan row:** 59g1 · **Owner:** CC-B
*Read at `origin/migration/aws-supabase` `bb4e82fc5`+ (`routes.ts`, `ai-transparency.tsx`, `active-engine-service.ts` byte-identical to `06b1b2886`, Langston). Scope r1 PROCEED with three conditions and §1a ruled **(4) REMOVE** (Langston, 2026-10-17 ~16:10Z).*

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED (scope obj 4): one tsc-baseline entry dies (×4). NOW: three entries, ×6 — 335 → 329. REASON (Langston C1):** the audit route also holds the only `getDatabaseStatus` call (`routes.ts:18467`, baseline `:143` TS2339 ×1) and the only `TradingEngine`-typed `.getStatus` call (`:18474`, baseline `:144` TS2339 ×1). `check-tsc-baseline.mjs` does not fail on a drop, so an unremoved entry would ship silently.
- **PREVIOUSLY STATED (scope §1a interlock): "only `POST /orchestrator/audit` reads the flip". NOW: four `getActiveEngineStatus` callers, three survive this batch (`/active-engine/metrics` `:13211`, `/health` `:13278`, `POST /close-all` `:13297`) — all three indifferent to the `#1158` flip in both directions. REASON (Langston C2, with its premise corrected at the code — A3):** the sentence is false as a census; the behaviour it implied did not change.

## A. AUDIT

**A1 — code, the six sources.** (1) Code at the ref: §0 of the scope, line-cited; four import sites `:18387/:18404/:18421/:18483` only, under all of `server/`; one client reader. (2) Runtime: `/telemetry` and `/analysis` → 500 *Cannot find module* on staging (2026-10-17 ~15:55Z, `dt-api`). (3) SIM: the routes and the AI Command Center are **absent** from the System Impact Map — its only mention is `:142`'s `#1158` sentence (A3) — **a gap: the SIM never recorded that the tab's body depended on a deleted module.** (4) System Manual: §22 records the orchestrator's retirement as deliberate; no API table lists the four routes; the page table (`:9357`) lists `/ai-transparency`, unaffected. (5) Ledger: `BATCH_56_SCOPE.md:132` lists the import as a tsc error only; nothing decided to keep the routes. (6) `bridge/canonical/`: no coverage (every hit is the signal orchestrator).

**A2 — entry points, enumerated first, repo-wide (tests excluded).** The code this batch deletes is reached only by HTTP: four route registrations (`:18385`, `:18402`, `:18419`, `:18432`), each called from exactly one place — `ai-transparency.tsx` (two queries on 30 s refetch, two mutations behind buttons). No timer, cron, bootstrap or event subscription calls any of them. **Exactly one consumer file.**

**A2b — state-write census (§9.5(a-ii)).** What the deleted pieces write, and who reads it:
| deleted piece | writes | surviving reader |
|---|---|---|
| telemetry / analysis / analyze routes | nothing (each threw at the import) | — |
| audit route | nothing (returned JSON; threw at `:18483`) | — |
| client `auditReport` state | page-local React state | only the System Audit Report card, deleted with it |
| client queries | the react-query cache keys `/api/orchestrator/telemetry`, `/analysis` | the two `invalidateQueries` calls inside the deleted mutation |
⇒ **no surviving reader of anything deleted.**

**A3 — the `getActiveEngineStatus` readers after this batch (Langston C2), re-derived against the pre-`#1158` code.** Three callers survive, each guarding `if (!status.isRunning || !manager)`: `/active-engine/metrics` `:13211`, `/health` `:13278`, `POST /close-all` `:13297`. **Before `#1158`** the field was `isRunning: !!dbSession || hasManager` (`4a17ca8f4^:server/services/active-engine-service.ts:1226`); **after**, `isRunning: hasManager` (`active-engine-service.ts:1305` at the ref).
| state | `isRunning` before → after | guard result before → after |
|---|---|---|
| session row, no manager | `true` → `false` | 400 → 400 — the `!manager` arm decided both times (`#1158` A2) |
| **manager, no session row** | `true` → `true` | **proceeds → proceeds — no change** |
| neither | `false` → `false` | 400 → 400 |
| both | `true` → `true` | proceeds → proceeds |
⇒ **Langston's C2 premise — "pre-`#1158` they returned 400" for a manager without a row — does not hold at the code:** the old field was an OR, so a manager alone already read running. **`#1158` changed the guard's outcome in neither direction for these three routes; its census was complete for them.** What C2 does establish, and stands: the sentence *"only `POST /orchestrator/audit` reads the flip"* is false as a census — three other routes read the field (they are indifferent to the flip because of their `!manager` arm). ⇒ plan item 6 rewrites it to that census. **Whether `close-all` should act on an orphaned manager** is then not a change anyone made — it is today's and the old behaviour, consistent with `#1158`'s stated contract *"`isRunning = hasManager` (the engine that actually runs)"* (`B_ENGINE_HEARTBEAT_DEAD_PATHS_SCOPE.md:31`): **§9.4 disposition 5, no work.**

**A4 — the formula audit's read (scope record item), measured.** `GET /api/system/formula-audit` runs `formulaAuditService.runAudit()` per request (`routes.ts:15137-15140`); the page polls it every 5 min (`:141`) while open. Staging `out.log` from 13:55:11Z: **0** runs; the previous file: **3**, at 13:09:36Z, 13:14:36Z and 13:33:51Z — the window of row 3a's Chrome check — each logging `Starting` and `Completed: 9 passed, 1 warnings, 0 failed` **in the same second**. ⇒ sub-second, and only while someone has the page open. **§9.4 disposition 5 — no work** (cheap and bounded by viewers; a read that runs the check is the design of that card).

**A5 — out-of-scope finding (Langston §13): `GET /system/health` is registered three times** — `routes.ts:537` (no auth), `:5768` (authenticated), `:15104`; Express takes the first, so two handlers are unreachable. Not this batch's code. **Disposition 3:** `HOME: B-DUP-HEALTH-ROUTE-SHADOW, owner CC-B, placed in SPRINT_TO_LIVE_PLAN at row 59g3, after row 59g2` (not folded into 59g2, which is the cron verifier — a different component). Filed as `#1212` in this commit.

**A6 — what the page loses and keeps.** Loses: the five telemetry cards (never drawn since 2025-11-05), the urgency badge (never shown), the "Trigger Analysis" and "Run System Audit" buttons (both 500), the System Audit Report card (never drawn), the AI Analysis tab (always "No analysis data available"). Keeps, drawn: Feed Health (already outside), **Formula Health** (hoisted). The tab label "AI Command Center" stays — renaming it is not this batch.

## B. PLAN (each item back-references its finding)
1. **(A1, A2; scope obj 1)** `routes.ts`: delete the telemetry, analysis and analyze routes. `ai-transparency.tsx`: delete both queries, the analyze mutation and its invalidations, the urgency badge, the "Trigger Analysis" button, the telemetry gate and its five cards, the else-Alert (`:864-868`), the AI Analysis tab trigger (`:431-434`) and content (`:1041-1111`), and any helper or icon import left unused (`getUrgencyColor`; icons checked by tsc + a grep). Archive to `1-system-manual/_archive/deleted-code/b-orchestrator-routes-removal.removed`.
2. **(§1a ruling; scope obj 2)** Delete the audit route, `runSystemAuditMutation`, the "Run System Audit" button, the System Audit Report card and `auditReport` state. **Test:** no `import('./orchestrator/orchestrator')` anywhere under `server/`; `routes.ts` registers none of the four paths.
3. **(A6; scope obj 3)** Draw Formula Health at the tab's top level beside Feed Health. **Fence:** the card's position is after every conditional that read the removed data — none remain (assert the page names none of `telemetry`, `telemetryLoading`, `analysis`, `analysisLoading`, `auditReport` as identifiers).
4. **(Langston C3)** Rewrite the row-3a comment at `ai-transparency.tsx:871-872` (it names `/api/orchestrator/telemetry` and "OUTSIDE the telemetry ternary"; with the gate gone neither is true). Objective 1's test stays literal.
5. **(Langston C1; scope obj 4)** `.tsc-baseline.json`: remove `:171` (×4), `:143` (×1), `:144` (×1) — 335 → 329; `node scripts/check-tsc-baseline.mjs` passes; state that the script does not enforce a drop.
6. **(A3; scope obj 5)** Rewrite `active-engine-service.ts:1302-1304` and `SYSTEM_IMPACT_MAP.md:142`: the field's readers are the three `/active-engine/*` routes, each also guarding `!manager`, so the flip changes none of their answers. Comment-only in code.
7. **(A5)** `#1212` filed; plan row 59g3 written; §6 tally recounted with `recountS6`.
8. **(scope obj 6)** Step 7 in Chrome: the AI Command Center tab draws Feed Health and Formula Health with data; no AI Analysis tab; the page's network log shows no `/api/orchestrator/telemetry|analysis|analyze|audit` request; Automation Logs and Orchestrator Activity (live `/logs`, `/learning-summary`) still load.
9. **Governance (non_architecture):** `DELETED_COMPONENTS_LOG` + archive; SIM (`:142`, and a line for the AI Transparency page's remaining sources — the gap in A1(3)); System Manual §22 (the four routes removed); `#1210` closed; `BATCH_CATALOG`, `PHASE_HISTORY`, plan row, task list, memory.
No `UNAUDITED` items.

**Blast radius:** one route file region and one page; three admin/viewer buttons that returned 500 since 2025-11-05; no trading path, no table, no migration. The live `/orchestrator/*` routes (learning-summary, logs, updateGoal, updateStrategy) are untouched.
