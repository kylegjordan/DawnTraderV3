# B-NEW-54 (REVISED) SCOPE — Retire the legacy ML predictive microservice

> **★ DIRECTION CHANGE (Kyle decision, 2026-06-08): FIX → REMOVE.** This supersedes the original `B_NEW_54_SCOPE.md` (process-management unification). Status: **DRAFT (Step 1 — awaiting Langston agreement on the removal approach).** Active trading OFF throughout. Author: CC, 2026-06-08.

---

## 0. WHY THE PIVOT (evidence-backed — Kyle asked "is this current or abandoned?")
The Step-2 audit + a roadmap/code review established that the Python ML microservice (promotion/profit predictor) is the **older predictive-learning layer and is currently DECORATIVE**, not part of the active or near-term ML plan:
- **Its predictions are computed-and-discarded.** The only runtime consumer is `signal-orchestrator.ts:548-570`, a **fire-and-forget** block: it fetches `predictPromotion`/`predictProfit`, computes a `blendedConfidence`, **logs it, and throws it away.** Nothing downstream (SQE, sizing, execution) reads it. The only other reference is the health-status panel.
- **The real planned ML is future + unbuilt.** `POST_AUDIT_ROADMAP.md` current-state: *"Machine Learning — Not designed."* The "ML Adaptive Intelligence Layer" is **Phases 17/18, POST-live.** The roadmap explicitly lists, as post-live backlog: *"Predictive learning full teardown — remove the cosmetic predictive learning services that B59 labeled as placeholders."*
- **So item 3's original premise was wrong:** active trading does NOT lean on this helper today. Hardening it would polish an inert, teardown-listed component. Kyle's decision: **retire it now** — removes the alarming ~184k restart counter + the broken `/metrics` for good, and removes a maintenance liability before Phase 19.

**Governance note (CLAUDE.md §5#18 — legacy register / mark-don't-delete):** §18 defers ad-hoc legacy deletions to the Phase-16 consolidated keep/remove review. This removal is NOT ad-hoc — **Kyle made the deliberate keep/remove decision explicitly** (the exact call §18 reserves for that review), with evidence, as the whole purpose of this batch. Proceeding is consistent with §18's intent. Langston to confirm he is comfortable with the early-retire vs. parking to Phase 16.

---

## 1. SCOPE — what gets removed vs. surgically edited vs. left alone

### DELETE (whole files)
- **`services/ml_service.py`** — the Python helper.
- **`server/services/ml-service-client.ts`** — its Node client (`predictPromotion`, `predictProfit`, `getMLServiceStatus`, `blendConfidence`). Grep-confirmed: `blendConfidence` has no other consumer.
- **`services/requirements.txt`** — ML-only Python deps (verify nothing else references it in Step-2).

### SURGICAL EDIT (remove ML, preserve the rest)
- **`server/core/boot_orchestrator.ts`** — **the delicate one.** It manages the ML helper **AND** boots the VTS runner. Strip ALL ML lifecycle (constants L29-33, `MLServiceStatus` interface L35-45, `pythonProcess`/`mlServiceStatus` fields, ML branch in `initialize()` L105-138, all ML methods L188-370, `getStatus`/`isMLReady`/`isDegraded` L372-381, `import {spawn,ChildProcess}`, ML stop in shutdown L68). **KEEP** the VTS init (`initializeVTSWithAutoStart` L140-186), VTS stop in shutdown (L65-66), the `bootOrchestrator` singleton export, and `initialize()` (reduced to: load baseline → validate config → init VTS). No VTS behavior change.
- **`server/index.ts:217-220`** — keep `bootOrchestrator.initialize()`; remove the `isMLReady()` boot log (replace with a plain boot-complete line).
- **`server/routes/health.ts:11,214` + payload** — remove the `getMLServiceStatus` import + call + the `mlStatus` field from the `/api/health` response. **KEEP** the drift status block (L324, independent).
- **`server/services/signal-orchestrator.ts:55,548-570`** — remove the `ml-service-client` import + the entire fire-and-forget ML block. No other pipeline change (the block already feeds nothing).
- **`server/services/drift-detector.ts:281-334` (`triggerRecalibration`)** — **neuter the one ML coupling.** Today it POSTs `http://localhost:5001/drift/retrain/${strategy}`. Remove that fetch; replace with a logged no-op + a `recalibration_skipped` event (reason: ML retired) so drift is still detected/logged/broadcast but no longer hits a dead endpoint (avoids recurring failed-fetch error noise). **drift-detector otherwise STAYS** — it's a real consumed service (drift dashboard via `vts.ts`, `autonomy-scheduler`, `health.ts`, `back_audit_engine`).
- **`ecosystem.config.cjs:43-63`** — remove the `dawntrader-ml` app block.
- **`.env.example`** — remove/annotate `ML_SERVICE_*` (Step-2 verify which are present). The `INTERNAL_SERVICE_KEY=...ml-service-key...` value (L54) is an unrelated key NAME — leave it (or rename cosmetically, non-blocking).

### LEFT ALONE (explicitly NOT in scope — avoid creep)
- **`server/services/ml-calibration.ts`** — despite the name, it does **NOT** call the Python helper (pure-TS VTS-trade analysis → predictive-adjustments log). It's a SEPARATE decorative predictive-learning piece. **Out of scope** → log it to the Phase-16 legacy register as its own teardown candidate. *(SIM §7.3's "Downstream: Python ML microservice" is stale — fix that line in governance.)*
- **drift-detector's observational role** (drift dashboard, history, freeze controller) — untouched; only the ML-retrain action is neutered.
- The B67 regime-confidence modifier chain, MCE `predictiveConfidence` metric — unrelated to this helper; untouched.

### STAGING (operational, in the cutover — Step 6)
- `pm2 delete ml-service` → redeploy (new code never spawns the helper) → `pm2 save` → verify `grep ml-service ~/.pm2/dump.pm2 → 0`.
- Set `ML_SERVICE_AUTO_START=false` in staging `.env` BEFORE redeploy (belt-and-suspenders so the interim node restart can't respawn the broken helper), then remove the `ML_SERVICE_*` lines after.
- Clean up the now-orphaned artifacts: `/opt/ml-venv`, in-repo `/home/deploy/dawntrader/ml_venv`, `models/*.pkl` + `model_versions.json`, `logs/vts_calibration.json` (verify each is gitignored / not referenced).

---

## 2. NUMBERED OBJECTIVES (+ verification)
- **O1 — Python helper + client + deps gone.** `services/ml_service.py`, `ml-service-client.ts`, `services/requirements.txt` deleted; no import of them remains. *Verify:* repo grep for `ml-service-client` / `ml_service.py` → 0 code refs (governance docs excepted); `tsc` clean.
- **O2 — boot_orchestrator de-ML'd, VTS preserved.** *Verify:* `tsc` clean; on staging boot, VTS runner still initializes + first cycle runs (PM2 log shows VTS init, autonomous-sim start in passive mode); no `[ML_SERVICE]` log lines; no ML spawn.
- **O3 — no dead consumers.** signal-orchestrator block, health `mlStatus`, index boot log all removed. *Verify:* `tsc` clean; `/api/health` returns 200 with no `mlStatus` field and the drift block intact.
- **O4 — drift-detector neutered cleanly.** *Verify:* drift detection still logs/broadcasts; forcing a recalibration logs the skip (no fetch to :5001), no error-log noise; `vts.ts` drift endpoints still work.
- **O5 — PM2 + env clean.** *Verify:* `pm2 list` shows ONLY `dawntrader` (no ml-service, no dawntrader-ml); `pm2 save` dump has no `ml-service`; staging `.env` has no `ML_SERVICE_*`; `pgrep -f ml_service.py` → 0.
- **O6 — no functional/behavioral regression.** *Verify:* main app online throughout; VTS archive writes continue uninterrupted; SQE/signal flow unchanged (the removed block fed nothing); Claude-in-Chrome UI check of the health/diagnostics tab renders (no broken ML panel).
- **O7 — CI green + tests pass.** All 4 GitHub jobs green; `vitest` no new failures (no test referenced the ML surface); `tsc` baseline not regressed.
- **O8 — governance reflects the retirement.** SIM (§7.4 retire, §9.1 VTS-only, §7.3 stale-line fix, §7.5 update, PM2 row), System Manual (ML client chapter retired, deploy chain), roadmap (teardown slice done early), RUNNING_ISSUES (#24 superseded, #136 register note for ml-calibration), CHANGES_AND_FIXES, BATCH_CATALOG, PHASE_HISTORY, VTS-plan F.2, readiness-checklist item 3, MEMORY ×3, CLAUDE.md §7.

## 3. RISK REGISTER
- **R1 — boot_orchestrator surgery could disturb VTS boot.** Mitigation: surgical edit + `tsc` + a staging boot watch confirming VTS init + autonomous-sim start; Langston code-review the diff before push (Step 4).
- **R2 — removing the helper while the node app still references it.** Mitigation: remove code refs in the SAME commit set; deploy the de-ML'd build, THEN delete the PM2 process (order: deploy new code → `pm2 delete ml-service` → save).
- **R3 — drift-detector recalibration event consumers.** If anything subscribes to `recalibration_complete`, confirm the new `recalibration_skipped` path doesn't strand a listener. Step-2 checks the event consumers.
- **R4 — `pm2 save` global.** Verify the dump after save contains only `dawntrader`.
- **R5 (LOW) — someone later wants ML back.** It's fully recoverable from git history; and the real ML is a fresh Phase-17/18 design anyway, not a revival of this.

## 4. OPEN QUESTIONS FOR LANGSTON (Step-1 agreement)
- **Q1 — early-retire vs park-to-Phase-16:** comfortable retiring now given Kyle's explicit decision + the decorative/teardown-listed evidence (vs. §18 "defer to Phase 16")?
- **Q2 — boot_orchestrator approach:** agree with surgical strip-ML/keep-VTS, `initialize()` reduced to baseline+config+VTS? Any reason to instead split VTS boot into its own module while we're in here (bigger change — CC leans NO, keep surgical)?
- **Q3 — drift-detector `triggerRecalibration`:** neuter to logged no-op + `recalibration_skipped` event (CC lean) vs. fully remove the recalibration path vs. something else? (The whole drift→retrain→ML loop is decorative since ML output is discarded, but drift-detector's dashboard/observation is real and stays.)
- **Q4 — staging cleanup extent:** remove `/opt/ml-venv` + in-repo `ml_venv` + `models/` + `vts_calibration.json` this batch, or leave the data artifacts and only remove the process? (CC lean: remove venvs + process now; leave `models/`+`vts_calibration.json` only if Langston wants a keep-for-reference, else remove.)
- **Q5 — anything missed:** any consumer / event / governance ref the surface map omits.

---
*Step 1 deliverable (revised, removal). On Langston agreement → finalize removal pre-audit (full boot_orchestrator edit plan + drift-detector event-consumer check + health payload) → Step 3 implementation → review → CI → cutover → verify → govern → close.*
