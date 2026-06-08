# B-NEW-54 REMOVAL PRE-AUDIT + IMPLEMENTATION BLUEPRINT (Step 2)

> Deep code-level removal audit incorporating Langston's 5 Step-2 musts. Status: **DRAFT → drives Step 3.** Active trading OFF. Author: CC, 2026-06-08. Scope: `B_NEW_54_REMOVAL_SCOPE.md` (Step-1 AGREED by Langston). All findings empirical (repo greps + staging probes).

## 0. LANGSTON STEP-2 MUSTS — RESOLVED
| # | Must | Finding | Action |
|---|---|---|---|
| 1 | grep all `ML_SERVICE_*` readers | Only `boot_orchestrator.ts` (L29-30,105,205-206,274,323) + `ml-service-client.ts` (L10,90,154,215). | Both removed/edited → no orphan reader. Remove `ML_SERVICE_*` from `.env.example` + staging `.env`. |
| 2 | `getRetrainingFreezeController` orphan | Consumed ONLY by drift-detector (import L25, call L287). No other consumer. | After edit it is orphaned → **leave `retraining-freeze-controller.ts` in place**, log to Phase-16 register. Remove the now-unused import from drift-detector. |
| 3 | recalibration event subscribers | NO external `.on('recalibration_*')`. Only `vts.ts:499 forceRecalibration` calls the path. `recalibrationPending` surfaces to the drift dashboard via `getStatus`. | **Short-circuit `triggerRecalibration` at the very top** (before the in-progress check / freeze check / `recalibrationInProgress.add`) → emit `recalibration_skipped` + log + return. Prevents the `recalibrationPending`/`isRecalibrating` latch. |
| 4 | `MLServiceStatus` imported elsewhere? | No. Interface + `isMLReady`/`isDegraded`/`getStatus` all internal to boot_orchestrator; consumed only by the deleted client + the index boot log. | Clean removal. |
| 5 | `vts_calibration.json` writer | ⚠️ Writer is **`server/utils/calibration.ts` (TS)** — `logs/vts_calibration.json`, read live by `health.ts` (loadFullCalibration L245) + drift-detector. NOT a Python-helper artifact. | **DO NOT DELETE `logs/vts_calibration.json`.** Staging cleanup removes only the helper's own `models/*.pkl` + `model_versions.json` + the venvs. |

## 1. EXACT EDIT LIST (Step 3)

**DELETE files:**
- `services/ml_service.py`
- `server/services/ml-service-client.ts`
- `services/requirements.txt` (ML-only; verify no other reference — grep clean)

**EDIT `server/core/boot_orchestrator.ts`** — strip ALL ML, keep VTS:
- Remove `import { spawn, ChildProcess }` (only used by ML spawn).
- Remove `ML_SERVICE_HOST` / `ML_SERVICE_AUTO_START` / health-check consts (L29-33).
- Remove `MLServiceStatus` interface (L35-45), `pythonProcess` + `mlServiceStatus` fields.
- Remove ML from shutdown handler (the `await this.stopMLService()` at L68) — keep `stopVTSRunner()` + healthCheckInterval clear (healthCheckInterval was ML-only → remove it too).
- `initialize()` → drop the ML branch (L105-138); reduce to: load baseline → validate config → `await this.initializeVTSWithAutoStart()` → return true. Keep all VTS logic + try/catch.
- Delete ML methods: `startMLService`, `waitForMLReady`, `checkMLHealth`, `startHealthMonitoring`, `updateMLMetrics`, `stopMLService`, `getStatus`, `isMLReady`, `isDegraded` (L188-381).
- Keep: constructor, `setupShutdownHandlers` (VTS-only now), `initializeVTSWithAutoStart`, `sleep` (if used by VTS — verify; else remove), the `bootOrchestrator` singleton export (L389) byte-identical name.

**EDIT `server/index.ts` (L213-220):** keep `await bootOrchestrator.initialize()`; replace the `8.8.4-L3 ... ML microservice` comment + the `isMLReady()` log with a plain `[BOOT] Boot Orchestrator initialized (VTS runner)` line.

**EDIT `server/routes/health.ts`:** remove `import { getMLServiceStatus }` (L11), the `const mlStatus = await getMLServiceStatus()` (L214), and the `mlStatus`/`ml` field in the response object (locate in the `res.json` near L303-380). Keep the VTS calibration health + drift status blocks.

**EDIT `server/services/signal-orchestrator.ts`:** remove the `ml-service-client` import (L55) and the entire fire-and-forget block (L548-570: the `mlInput` const + the `Promise.all([...]).then().catch()`). Leave the surrounding diagnosticTrace (L572+) intact.

**EDIT `server/services/drift-detector.ts`:** remove `import { getRetrainingFreezeController }` (L25); rewrite `triggerRecalibration(strategy)` to short-circuit at the top → `console.log('[L11][DRIFT] Recalibration skipped — ML predictive helper retired (B-NEW-54)')`; `this.emit('recalibration_skipped', { strategy, reason: 'ML helper retired' })`; `return;`. Delete the old body (freeze-check, `recalibrationInProgress` add, the `:5001/drift/retrain` fetch, the result handling). Verify `forceRecalibration` (L426) still composes (it returns the method's result — now a clean skip).

**EDIT `ecosystem.config.cjs`:** remove the `dawntrader-ml` app block (L43-63) + its trailing comma; leave the `dawntrader` app.

**EDIT `.env.example`:** remove any `ML_SERVICE_*` lines (verify presence); leave `INTERNAL_SERVICE_KEY` (unrelated name).

## 2. STAGING CUTOVER (Step 6) — order matters
1. Deploy the de-ML'd build (git pull → build → `pm2 restart dawntrader`) — new code never spawns the helper; boot logs show VTS init, no `[ML_SERVICE]`.
2. `pm2 delete ml-service` (the LIVE name; the config block is already gone). `pm2 save`.
3. Verify: `pm2 list` shows only `dawntrader`; `grep -c ml-service ~/.pm2/dump.pm2` = 0 AND `grep -c dawntrader-ml ~/.pm2/dump.pm2` = 0; `pgrep -f ml_service.py` = 0.
4. Remove `ML_SERVICE_*` from staging `.env`.
5. Cleanup artifacts (verify gitignored/untracked first): `/opt/ml-venv`, `/home/deploy/dawntrader/ml_venv`, `models/*.pkl`, `models/model_versions.json`. **KEEP `logs/vts_calibration.json`.**

## 3. VERIFICATION (Steps 7-8)
- `tsc` clean (C:\dev bench) + `vitest` no new failures (no test referenced the ML surface — grep-confirmed) + baseline not regressed.
- CI all-4-green on the head commit.
- Staging boot: VTS runner initializes + autonomous-sim starts in passive mode; no `[ML_SERVICE]` lines; `/api/health` 200 with NO `mlStatus` field and the drift + VTS-calibration blocks intact.
- Drift dashboard (Chrome UI, §9.3): renders; no perpetual "recalibrating"; the panel that showed ML status renders without `undefined`.
- `pgrep -f ml_service.py` = 0; `pm2 list` = only `dawntrader`.

## 4. GOVERNANCE (Step 10)
SIM (§7.4 retire, §9.1 → VTS-only, §7.3 stale-line fix, §7.5 retrain-removed, PM2 row); System Manual (ML Service Client chapter retired + Phase-6 section pointer, deploy-chain unchanged); POST_AUDIT_ROADMAP (note the predictive-learning teardown slice executed early for the ML microservice; ml-calibration + retraining-freeze-controller remain as the post-live teardown remainder); RUNNING_ISSUES (#24 superseded/retired; **#136 Phase-16 register: add `ml-calibration.ts` + `retraining-freeze-controller.ts` as sibling teardown candidates + a one-line note that the ML-microservice teardown was executed early under explicit Kyle decision** per Langston Q1); CHANGES_AND_FIXES; BATCH_CATALOG; PHASE_HISTORY; MULTI_ASSET_VTS_EXPANSION_PLAN F.2 → resolved-via-removal; PHASE_24_TO_19_READINESS_CHECKLIST §4 item 3 → done; CLAUDE.md §7 (no ML helper in deploy considerations); MEMORY ×3. Completion report documents the 184k counter cause (cumulative-historical churn + the broken `/metrics`, NOT a live crash loop — reconciles Langston's "crash-loop" phrasing with the unstable_restarts:0 / 49d-uptime evidence).

## 5. NOTES / RECONCILIATIONS
- **184k restart counter:** cumulative-since-creation, `unstable_restarts: 0`, ~49d continuous uptime → historical churn, not a live crash loop. (Langston called it "confirmed crash-loop"; the evidence says stable-now. Document the true cause in the completion report per his Q5#5.)
- **ml-calibration.ts** stays (decoupled, decorative) → Phase-16 register.
- **retraining-freeze-controller.ts** becomes orphaned after the drift-detector edit → leave in place, Phase-16 register.
- Fully git-recoverable; the real ML (Phase 17/18) is a fresh design, not a revival.
