# B-ORCHESTRATOR-ROUTES-REMOVAL — Step 4 change list (row 59g1, `#1210`)

**Code commit:** `2d53886a0` · **Audit and plan (approved):** `Scope Files/B_ORCHESTRATOR_ROUTES_REMOVAL_PRE_AUDIT.md` · **Owner:** CC-B

## Gate A — the deletions (plan B1, B2; archive `1-system-manual/_archive/deleted-code/b-orchestrator-routes-removal.removed`)
- `server/routes.ts`: the four routes `GET /orchestrator/telemetry`, `GET /orchestrator/analysis`, `POST /orchestrator/analyze`, `POST /orchestrator/audit` — **203 lines**, from `// Get latest telemetry snapshot` to the audit route's closing `});`. The section header `// ==================== AI Orchestrator / Command Center API` stays (it heads the live learning-summary / logs / updateGoal / updateStrategy routes).
- `client/src/pages/ai-transparency.tsx` (original line numbers): `auditReport` state `:33`; the telemetry + analysis queries `:120-131`; the analyze + audit mutations `:150-192`; `telemetry` / `analysis` consts `:357-358`; the AI Analysis tab trigger `:431-434`; the tab header (urgency badge, "Run System Audit", "Trigger Analysis") `:483-537`; the telemetry gate and its five cards and the System Audit Report card `:538-712`; the gate's close and else-Alert `:862-869`; the AI Analysis tab `:1041-1112`. Helpers kept: `getUrgencyColor` (still used by the recommendation logs, `:757` after the edit), `Sparkles` / `Brain` (still used).
- **Line endings:** both files are CRLF; the edits split and re-joined on CRLF (routes: 203 of 203 removed lines CRLF).

## Gate B — Formula Health drawn (plan B3, B4)
- The Formula Health card (original `:713-861`) is now the tab's first child, de-indented four spaces, followed by Feed Health. The row-3a comment above Feed Health is rewritten (it named `/api/orchestrator/telemetry` and "OUTSIDE the telemetry ternary").

## Gate C — the tsc baseline (plan B5, your C1)
- `.tsc-baseline.json`: `server/routes.ts` loses TS2307 `Cannot find module './orchestrator/orchestrator'` ×4, TS2339 `getDatabaseStatus` ×1, TS2339 `getStatus` on `TradingEngine` ×1; `total_errors` 335 → **329**. Edited through a JSON round-trip proven byte-identical before the edit. `node scripts/check-tsc-baseline.mjs`: *"Current: 329 errors. Baseline: 329 errors. OK"*. `TS2552 tradingEngines` ×2 left (`:3991/:3993`, outside the region).

## Gate D — the comment (plan B6, your fold-in)
- `active-engine-service.ts` above `isRunning: hasManager`: the readers are the three `/active-engine` routes, each also guarding on its own `getGlobalActiveEngineManager('paper')` — the same object `hasManager` reads — so the field decides none of their answers (it can only refuse harder across the await), none reads `sessionInfo` or `diagnostics`, and the awaited `getRunningEngineSession` decides nothing for them; removing the call is a behaviour change. Comment only.

## Gate E — tests
- **New** `server/tests/unit/b-orchestrator-routes-removal.test.ts` (9): routes.ts registers none of the four paths · positive control, the five live `/orchestrator` paths are registered · nothing under `server/` imports the module (walk asserted > 100 files) · the baseline carries none of the three messages · the page requests none of the four endpoints · no removed identifier and no `ai-analysis` tab · positive control, the page still names the live endpoints · Formula Health and Feed Health drawn ungated (brace balance between the tab's tag and the card) · the fence's twin: a `{formulaAuditData && (` wrapper fails it.
- **Against the original files:** 5 fail (the four discriminating tests and the ungated fence — the original had Formula Health inside the gate), 4 pass (two controls, the twin, and the baseline test, which reads the edited baseline). Then restored.
- **Re-pointed** `b-feed-health-grade-arm.test.ts` fence: it measured from `'No telemetry data available'`, which is gone; it now asserts the Feed Health card is a direct child of the AI Command Center tab (brace balance), because Formula Health above it carries its own conditionals and a text scan for `&&` / `?(` would fire on them.
- Related suites: `b-feed-health-grade-arm`, `b-engine-heartbeat-dead-paths`, `b-sizing-legacy-deletion-fence`, the new file — 113 / 113.

## Step 7 (plan B8)
Chrome: the AI Command Center tab draws Formula Health and Feed Health with data; no AI Analysis tab; the page's network log has no `/api/orchestrator/telemetry|analysis|analyze|audit` request; Automation Logs and Orchestrator Activity still load.

## Steps 5-7 — CI, deploy, verification (2026-10-17)
- **Step 4:** Langston APPROVED at `59ea15c80` (four changes landed; re-derived by him). Reach-limit note added at `f0abf8494`.
- **Step 5:** CI run `39050708281` at `f0abf8494` — Build ✅ · Test Suite ✅ · TypeScript Check ✅ · Docker Build ✅ (per job). Range `0dabe1a78..f0abf8494`, runtime paths: CC-B's commits only.
- **Step 6:** `dt-deploy f0abf8494e4a9d10c66ea6bd3ee306e25680b280 --by cc-b` — live 2026-10-17T16:47:34Z, engine resumed, identity asserted (rollback target `0dabe1a78`).
- **Step 7 (Claude-in-Chrome, AI Transparency, ~16:50Z):** tabs now begin *AI Command Center · AI Recommendations · Automation Logs · Orchestrator …* — **no AI Analysis tab**; no `button-run-audit`, no `button-trigger-analysis`. **Formula Health drawn with data:** *"10 Total Formulas · 9 Passed · 1 Warnings · 0 Failed · Last audit: less than a minute ago"* (the page's `/api/system/formula-audit` request fired). **Feed Health drawn:** grade A, Healthy, *warming up* (restart 16:47Z). **The page's resource log names only `/api/orchestrator/logs?limit=50` and `/api/orchestrator/learning-summary`** — no telemetry / analysis / analyze / audit request. Through the page's session: `logs` 200, `learning-summary` 200, `telemetry` **404**, `analysis` **404** (both were 500 *Cannot find module*). Server logs since 16:47:34Z: **0** `orchestrator/orchestrator` / `Cannot find module` lines; the same pattern matched **116** lines in `error.log` 13:00-16:47Z (positive control).
