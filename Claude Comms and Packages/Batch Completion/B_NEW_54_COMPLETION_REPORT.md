# B-NEW-54 COMPLETION REPORT — Retire the legacy ML predictive microservice

> Between Phase-24→19 plan **ITEM 3** (reframed fix → REMOVE per Kyle 2026-06-08). Active trading OFF throughout. Status: **CLOSED pending Kyle ack.** Author: CC, 2026-06-08.

## HEADLINE
The Phase-8-era Python ML predictive microservice — **decorative** (its promotion/profit predictions were fetched fire-and-forget in the signal orchestrator, logged, and **discarded**; no decision consumed them) — has been **fully retired**. CI all-4-green; staging cutover clean; the alarming ~184k restart counter is gone with the process. Langston Step-4 (code) + Step-8 (verification) both **APPROVED**.

## WHY REMOVE (not fix) — the pivot
Item 3 was queued as "ml-service restart fix." Investigation (+ Kyle's "is this current or abandoned?" question) established: (1) the helper's output is **logged-and-discarded** (`signal-orchestrator.ts` fire-and-forget block — code-proven); (2) the **real** ML is a future, unbuilt **Phase 17/18** design (roadmap current-state: "Machine Learning — Not designed"); (3) the roadmap already lists **"predictive learning full teardown — remove the cosmetic placeholder services."** Historical trace: built in **Phase 8** (~Jan 2026, Replit era, Directive 8.8.4-L8) as the "Predictive Learning & Adaptive Risk Manager"; the blend-into-confidence wiring was never switched on; re-installed on Hetzner during the B54 migration. So item 3's premise ("active trading leans on it") was false. **Kyle decided: retire it.**

## OBJECTIVES — all met
| Obj | Result |
|---|---|
| O1 Python helper + client + deps gone | ✅ `ml_service.py` + `ml-service-client.ts` + `requirements.txt` deleted; repo grep 0 live refs |
| O2 boot_orchestrator de-ML'd, VTS preserved | ✅ surgical strip; VTS init + autonomous-sim + shutdown intact; staging boots passive-learning clean |
| O3 no dead consumers | ✅ signal-orchestrator block, health `mlService`, index boot log removed; tsc clean |
| O4 drift-detector neutered cleanly | ✅ `triggerRecalibration` short-circuits to logged no-op + `recalibration_skipped` BEFORE touching `recalibrationInProgress` (no latch); freeze import removed |
| O5 PM2 + env clean | ✅ `pm2 list` = only `dawntrader`; dump 0/0; staging `.env` 0 `ML_SERVICE_*`; `pgrep ml_service.py` = 0 |
| O6 no functional regression | ✅ app online throughout; VTS passive-learning running; `/api/health` 200, no `mlService`, `vts`+`strategyDrift` present; dashboard Chrome-clean |
| O7 CI green + tests pass | ✅ all-4-green `87865efd7` (run `27174803163`); vitest identical to clean baseline (12 pre-existing failures, 0 added); tsc 475 vs 494 (−1 fixed) |
| O8 governance | ✅ see list below |

## WHAT CHANGED (code)
- **DELETED:** `services/ml_service.py` (~1874 ln), `server/services/ml-service-client.ts` (~242 ln), `services/requirements.txt`.
- **`boot_orchestrator.ts`** — stripped all ML lifecycle (spawn/health/metrics/stop + `MLServiceStatus`/`isMLReady`/`getStatus`/`isDegraded` + EventEmitter); kept VTS init (degraded-mode-first) + graceful shutdown. ~348 → ~140 ln.
- **`index.ts`** — boot log no longer references `isMLReady`.
- **`health.ts`** — dropped `mlService` response field + `getMLServiceStatus` import/call.
- **`signal-orchestrator.ts`** — removed the fire-and-forget ML block + import.
- **`drift-detector.ts`** — `triggerRecalibration` → logged no-op (no latch); removed freeze-controller import.
- **`vts.ts`** — `POST /api/vts/retrain/:strategy` now returns the honest retired body (`success:false, retired:true`) instead of fake success (Langston Step-4 orphan #1).
- **`ecosystem.config.cjs`** — removed the `dawntrader-ml` app.
- **`Dockerfile`** — removed python3/venv install, `/opt/ml-venv` pip install, `COPY services`, `ML_SERVICE_HOST` env, `/opt/ml-venv` PATH, `EXPOSE 5001` (CI Docker Build fix — `services/` no longer exists).
- **`.env.example`** — removed `ML_SERVICE_*`.

## LEFT IN PLACE → Phase-16 register (RUNNING_ISSUES #174)
`ml-calibration.ts` (decoupled, decorative), `retraining-freeze-controller.ts` (orphaned after edit), `GET /api/vts/internal/calibration` + `INTERNAL_SERVICE_KEY` (dormant-but-functional). NO-PATCHES anti-creep: deliberate keep/remove deferred to Phase 16. **`logs/vts_calibration.json` PRESERVED** (TS calibration store, not an ML-helper artifact — Langston's Step-2 gate).

## VERIFICATION
- **CC first-pass (Step 7):** deploy clean FF (`a6767cd75`→`87865efd7`); pm2 only dawntrader; dump 0/0; `pgrep ml_service.py`=0; orphaned detached helper PIDs 216182/216183 killed (SIGTERM); `.env` cleaned; `/opt/ml-venv` + in-repo `ml_venv` + `models/*.pkl`+`model_versions.json` removed; health 200; dashboard Chrome-clean.
- **Langston second-pass (Step 8): APPROVED** — all 6 checks pass + grep `server/**/*.ts` for live ML refs (`5001`,`ML_SERVICE_URL`) = 0 hits (only the historical comment at `drift-detector.ts`). Flagged `/retrain` real path is `/api/vts/retrain/:strategy` (my spec said bare path → SPA fall-through); the honest body confirmed at the real path. `healthy:false` he noted = unrelated memory-threshold (603MB>350MB), not ML.
- **§9.3 Chrome:** staging dashboard renders fully clean (portfolio, 9 strategy cards incl. prediction-accuracy now 0.0%, filter health) — no broken ML panel, no undefined.

## THE 184k RESTART COUNTER (the original symptom)
Cumulative-since-creation, `unstable_restarts:0`, ~49d continuous uptime → historical churn, NOT a live crash loop. The deeper cause of past churn: the helper's launch path was broken (its interpreter `/usr/bin/python3.12` was `(deleted)` by an OS upgrade; the in-repo `ml_venv/bin/python3` symlink was gone), so it was **un-restartable** and `/metrics` 500'd (psutil never installed per the B54 hand-build). Retirement removes the process and the symptom entirely.

## CI / GIT
- Head: `87865efd7`. Commits: `72bf79ff2` (impl) · `0227897d4` (review doc) · `cd93d052b` (honest /retrain) · `87865efd7` (Dockerfile). CI run `27174803163` — TypeScript Check ✓ / Build ✓ / Test Suite ✓ / Docker Build ✓.
- Iteration (Step 9): CI Docker Build went red (Dockerfile `COPY services` — dir now empty); fixed in `87865efd7`, re-verified green.

## GOVERNANCE FILES CHANGED
- `1-system-manual/SYSTEM_IMPACT_MAP.md` (§7.3 stale-line fix, §7.4 retired, §7.5 drift downstream, §9.1 boot-orchestrator VTS-only, PM2 row)
- `1-system-manual/SYSTEM_MANUAL.md` (ML Service Client chapter — retired note)
- `1-system-manual/RUNNING_ISSUES.md` (#24 superseded; #174 Phase-16 register)
- `1-system-manual/CHANGES_AND_FIXES.md` (B-NEW-54 entry)
- `1-system-manual/BATCH_CATALOG.md` (B-NEW-54 row)
- `1-system-manual/PHASE_HISTORY.md` (B-NEW-54 note)
- `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` (F.2 resolved-via-removal)
- `1-system-manual/PHASE_24_TO_19_READINESS_CHECKLIST.md` (§1/§4 item 3 → DONE via removal)
- Scope/audit artifacts: `B_NEW_54_REMOVAL_SCOPE.md`, `B_NEW_54_REMOVAL_PREAUDIT.md`, `B_NEW_54_SCOPE.md` (superseded), `B_NEW_54_PRE_AUDIT.md` (evidence), `B_NEW_54_REMOVAL_CODE_REVIEW.md`
- MEMORY ×3 (CC truth + in-repo mirror + Langston Hetzner)

## OBJECTIVES CHECKLIST: O1–O8 = **YES** (all met, evidence above).
**Between-plan ITEM 3 = CLOSED.** Next: item 3.5 (RUNNING_ISSUES→roadmap-homing audit + roadmap reorder) — awaiting Kyle's go.
