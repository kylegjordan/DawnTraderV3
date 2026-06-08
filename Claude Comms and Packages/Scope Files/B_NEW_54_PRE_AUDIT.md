# B-NEW-54 PRE-AUDIT — ML helper process-management unification (Step 2)

> **Code-level pre-audit with SIM + System Manual consultation + staging-reality probes.** Status: **DRAFT (awaiting Langston Step-2 review).** Active trading OFF. Author: CC, 2026-06-08. Scope: `B_NEW_54_SCOPE.md` (Step-1 AGREED + §8 refinements). All findings below are empirical (read-only probes on staging `188.245.193.8`) — not memory.

---

## 0. HEADLINE — the audit found the situation is WORSE than the scope, but our fix repairs all of it cleanly
The named Step-2 blockers (B1 venv-reality, B2 shell-wrapper) are **confirmed**, and the audit surfaced **a third pre-existing breakage the fix incidentally repairs**: the ML helper has been running for ~49 days **without `psutil`**, so its `/metrics` endpoint has been returning HTTP 500 the entire time, leaving ML memory/CPU/model-version telemetry blank. The pinned-venv rebuild fixes the restart fragility, attaches the guardrails, AND restores `/metrics`. Blast radius is small (two consumers, both with graceful fallbacks), so the one-way cutover is low-risk if sequenced per the runbook (§6).

---

## 1. STAGING REALITY — empirical resolution of the named blockers

### B1 — "no proven-good venv" → CONFIRMED + root-caused
- **Live python process** `216183` (`python3 services/ml_service.py`), parent **bash wrapper** `216182` (`-bash -c 'cd /home/deploy/dawntrader && source ml_venv/bin/activate && python3 services/ml_service.py &'`).
- `readlink /proc/216183/exe` → **`/usr/bin/python3.12 (deleted)`**. `VIRTUAL_ENV=/home/deploy/dawntrader/ml_venv`, `PATH` has `ml_venv/bin` first.
- **Root cause:** the in-repo `ml_venv/bin/python3` was a symlink to the system `/usr/bin/python3.12`; a later OS python upgrade replaced that binary, so the inode is now **`(deleted)`** and the running process holds it only in memory. `ml_venv/bin/python3` **no longer exists on disk** (`ls` → No such file). **⇒ The live helper is un-restartable from its own launch path:** a restart would `source ml_venv/bin/activate` (PATH points at a bin dir with no `python3`) → fall through to system `python3` → **system python3 has NO Flask** (`import flask` → ModuleNotFoundError) → `ml_service.py` `sys.exit(1)` on import (lines 18-21). So today, **if this process ever stops, it cannot come back.**
- **`/opt/ml-venv`** (root, Mar 30): `python3 -> /usr/bin/python3`; `import flask,numpy,sklearn` **OK**, but **`import psutil` FAILS**. Python 3.12.3. So /opt is closer but NOT cutover-ready (psutil missing).

### B2 — "PM2 watches a shell wrapper, not an interpreter" → CONFIRMED
- `pm2 show ml-service`: `interpreter: none`, `script path: /home/deploy/dawntrader/ml_venv/bin/python3` (a path that **doesn't exist**), `restarts: 184185`, `unstable restarts: 0`, fork_mode. The stored metadata is internally inconsistent (script path ≠ the actual bash-wrapper launch) — an artifact of the hand-registration.
- **However:** `ecosystem.config.cjs`'s `dawntrader-ml` is already defined correctly for B2 — `script: '/opt/ml-venv/bin/python3', args: 'services/ml_service.py'` runs the **interpreter directly** (fork mode, no shell wrapper). Verified that invoking `/opt/ml-venv/bin/python3` directly activates the venv site-packages (the import probe imported Flask from the venv, not system) — venv detection works via `pyvenv.cfg` even though `bin/python3` is a symlink. **So once `/opt/ml-venv` has psutil, the existing config satisfies B2 with no config rewrite of the launch shape.**

### Third finding (NOT in scope) — psutil gap ⇒ /metrics 500, pre-existing
- `curl :5001/metrics` → **HTTP 500** (Flask `import psutil` lazy-import at `ml_service.py:559` raises). `curl :5001/health` → `{"status":"READY","calibration":{"loaded":false,"strategyCount":0,...}}`.
- **`services/requirements.txt` is CORRECT** (lists `flask>=2.0.0 / numpy>=1.21.0 / scikit-learn>=1.0.0 / psutil>=5.8.0`) — but **both venvs were built without psutil.** Origin: **RUNNING_ISSUES #24 (B54, 2026-04-09)** records the hand-build installed "flask 3.1.3 + numpy + scikit-learn" — **psutil omitted.** /opt/ml-venv (Mar 30) likewise lacks it.
- **Consequence (pre-existing, fix repairs as a bonus):** `boot_orchestrator.updateMLMetrics()` (L321-344) and `ml-service-client.getMLServiceStatus()` (L214-235) both call `/metrics`, both swallow the 500 in empty `catch{}` → ML memory/CPU/model-version telemetry has been silently blank/UNKNOWN. Restoring psutil restores this telemetry.

### `calibration.loaded:false, strategyCount:0` — EXPECTED, pre-existing, NOT our batch
- Calibration is fetched FROM the Node backend after boot (`deferred_calibration_fetch()` L1850, `retry_calibration_fetch()`). In active-OFF/VTS there is no live calibration coefficient set to load → `loaded:false`. This is the Langston-flagged "don't blame the cutover" item: it is **already false pre-cutover**, so a post-cutover `loaded:false` is the unchanged baseline, not a regression. Confirm it stays false→(or loads) identically post-cutover; do NOT scope-creep into calibration loading.

### `.env` (staging) — confirms the Q-C action
`ML_SERVICE_HOST=http://localhost:5001`, **`ML_SERVICE_AUTO_START=true`**, `ML_SERVICE_TRAINING_ENABLED=false`. For Q-C (PM2 sole owner) we must set **`ML_SERVICE_AUTO_START=false`** in the staging `.env` so `boot_orchestrator.initialize()` takes the L105-109 skip branch and never in-process-spawns.

### dump.pm2 — confirms O4 risk
`grep ml-service dump.pm2 → 5` (present), `grep dawntrader-ml → 0` (absent). The orphan is what `pm2 resurrect` restores on reboot; the config app has never been registered.

---

## 2. CODE-LEVEL BLAST RADIUS (consumers of the helper)
Full grep of `server/` for the client's exports:
- **`server/routes/health.ts:214`** → `getMLServiceStatus()` (status panel only).
- **`server/services/signal-orchestrator.ts:563-567`** → `predictPromotion` + `predictProfit` + `blendConfidence` (one SQE confidence-blend, `blendFactor 0.6`).
- **That is the ENTIRE consumer surface.** SIM §7.3 (ml-calibration) and §7.5 (drift-detector) also talk to the helper over HTTP, but only through the same client boundary.
- **Every client call is non-blocking with a safe fallback** (`ml-service-client.ts`): if `!bootOrchestrator.isMLReady()` or the fetch errors/times-out (2000 ms), `predictPromotion`→`{success:false, probability:0.5}`, `predictProfit`→`{success:false, predicted_profit:0.05}`, `getMLServiceStatus`→`UNKNOWN`. **⇒ The brief ML outage during cutover degrades to neutral predictions, not crashes.** This de-risks O6.
- **No deploy script / CI job / dashboard hard-codes the process name `ml-service`.** Repo-wide grep: the only `ml-service` literals are (a) governance docs (we update them), (b) `.env.example:54 INTERNAL_SERVICE_KEY=...ml-service-key...` (an unrelated key-name string, NOT the process). **⇒ Renaming the process to `dawntrader-ml` breaks no code path.**

## 3. SIM + SYSTEM MANUAL CONSULTATION
- **SIM §7.4 "Python ML Microservice"** (file + client, localhost:5001, blast radius MEDIUM) and **SIM §9.1 "Boot Orchestrator"** ("Auto-spawn, health polling, graceful shutdown", blast radius HIGH) are the two entries that describe this component. Both are **silent on**: the PM2 registration name, the guardrails, the venv location, the AUTO_START env, and the psutil/metrics state. → Step-10 must add the process-management reality to both (governance-gap closure).
- **SIM §7.55 / PM2 row (line 755)**: "Process manager for `dist/index.js` as `dawntrader`… Ecosystem config at `ecosystem.config.cjs`." — silent on the ML app entirely. → update to note `dawntrader-ml` is the PM2-managed helper.
- **System Manual**: ML Service Client chapter (Ch6 of the Phase-6 ML section, ~line 5661) documents the client API; the deploy-chain section (~line 12189-12196) documents `git pull → build → db:migrate → pm2 restart dawntrader` and is **silent on the ML helper's PM2 management**. → Step-10 adds the managed-helper + venv-rebuild procedure.
- **No contradiction** between scope and the manuals — only silence (which is itself the governance gap this batch closes). `ml_service.py` `main()` uses Flask dev server `app.run(threaded=True)` with no custom signal handler → relies on Flask's default SIGINT/SIGTERM termination; PM2 `kill_timeout: 5000` on `dawntrader-ml` gives a clean stop. No graceful-shutdown code change needed.

---

## 4. IMPLEMENTATION PLAN (for Langston Step-2 review — design-before-build)
**Repo changes (small, reviewed before push):**
1. **`services/requirements.txt` → pin to exact versions** (reproducible env, NO-PATCHES). Proposed pins from the `/opt/ml-venv` freeze + psutil: `flask==3.1.3`, `numpy==2.4.4`, `scikit-learn==1.8.0`, `psutil==<pin>` (latest stable 5.9.x/6.x — pick one and pin). Transitive deps resolve from these. *(Open Q for Langston: pin only the 4 direct deps, or a full `pip freeze` lockfile? CC leans direct-4-pinned + a comment, to avoid over-pinning transitives that pip resolves deterministically anyway.)*
2. **Add `scripts/rebuild-ml-venv.sh`** — a documented, idempotent venv-(re)build from the pinned `requirements.txt` into `/opt/ml-venv`, ending with the full import probe (`flask/numpy/sklearn/psutil`) as a self-check. Makes the env reproducible instead of hand-built. *(This is the NO-PATCHES answer to Q-B: a known recipe, not a blessed accident.)*
3. **`.env.example`** — add `ML_SERVICE_AUTO_START=false` with a comment: production = PM2 sole owner of the helper; the in-process spawn in `boot_orchestrator` is a local-dev convenience only.
4. **`ecosystem.config.cjs`** — verify-only; the `dawntrader-ml` block already has the right launch shape + guardrails. *(Likely no change; if we pin an explicit `ML_SERVICE_TRAINING_ENABLED:false` for parity with .env, that is the only candidate edit.)*
5. **(Optional) `boot_orchestrator.ts`** — a one-line comment marking the in-process spawn path as local-dev-only under `ML_SERVICE_AUTO_START`. No behavioral code change (the env flag already gates it at L105-109).

**Staging operational changes (executed in the cutover runbook §6, NOT repo):**
6. Set `ML_SERVICE_AUTO_START=false` in `/home/deploy/dawntrader/.env`.
7. Run `scripts/rebuild-ml-venv.sh` to produce a complete, pinned `/opt/ml-venv` (with psutil). Validate offline.
8. PM2 cutover: delete orphan `ml-service`, start `dawntrader-ml` from the config, health-confirm, `pm2 save`, verify dump.
9. (Cleanup, post-cutover) remove the broken in-repo `/home/deploy/dawntrader/ml_venv` dir (nothing uses it once the orphan is gone) — **verify it is gitignored first** (ties to deploy-hygiene #202 in MEMORY). Mark-don't-delete if any doubt.

## 5. RISK REGISTER
- **R1 — one-way cutover (no restart-in-place safety net):** the live helper cannot restart from its own path, so cutover is hard stop-old → start-new. **Mitigation:** fully validate `/opt/ml-venv` + a scratch-port run of `ml_service.py` BEFORE deleting the orphan (§6). Can't dual-run on :5001.
- **R2 — version skew on pickled models:** rebuilding the venv at pinned numpy/sklearn could mismatch any pickled models in `models/`. **Likelihood LOW** (calibration not loaded, active-OFF, models retrained at runtime). **Mitigation:** after cutover, confirm `/health` READY + no unpickling errors in `ml-error.log`; if a model fails to load, that is a separate pre-existing data issue, not a cutover regression — log it, don't block.
- **R3 — brief ML outage during cutover:** SQE confidence-blend + health panel see fallbacks (0.5 / 0.05 / UNKNOWN) for the ~seconds the helper is down. **Acceptable** (graceful by design); time the cutover during a low-activity window; watch the main `dawntrader` app stays online.
- **R4 — `pm2 save` is global:** the new dump captures BOTH `dawntrader` and `dawntrader-ml`. **Mitigation:** verify the dump contains both apps under the right names + `grep ml-service dump.pm2 → 0` before relying on resurrect.

## 6. CUTOVER RUNBOOK (one-way, offline-validate-first) — executed in Step 3/6
1. **Offline venv build + probe:** `bash scripts/rebuild-ml-venv.sh` → `/opt/ml-venv/bin/python3 -c "import flask,numpy,sklearn,psutil"` must print OK.
2. **Scratch-port smoke test:** `ML_SERVICE_PORT=5099 /opt/ml-venv/bin/python3 services/ml_service.py &` from `/home/deploy/dawntrader`; `curl :5099/health` → READY; `curl :5099/metrics` → 200 (psutil now present); then stop the scratch process. *(Proves the managed launch works WITHOUT touching :5001.)*
3. **Flip env:** set `ML_SERVICE_AUTO_START=false` in `.env`.
4. **Cutover:** `pm2 delete ml-service` → `pm2 start ecosystem.config.cjs --only dawntrader-ml` → wait → `curl :5001/health` READY + `curl :5001/metrics` 200.
5. **Persist + verify:** `pm2 save` → `grep -c ml-service ~/.pm2/dump.pm2` = 0, `grep -c dawntrader-ml` ≥ 1; `pm2 show dawntrader-ml` shows `max_restarts 5 / min_uptime 10000 / restart_delay 3000 / max_memory_restart 512M / interpreter <venv python>` (NOT shell wrapper).
6. **App-side:** restart `dawntrader` once so it boots with `ML_SERVICE_AUTO_START=false` (confirms it does NOT spawn its own child; `pgrep -fa ml_service.py` → exactly one PID, the PM2 one). Confirm boot_orchestrator logs ML READY via the existing-health-check branch.
7. **Guardrail proof (O5, safe):** one `pm2 restart dawntrader-ml` → clean recovery to READY. NO runaway-loop test on the shared box.
8. **Cleanup:** remove broken in-repo `ml_venv` dir (after gitignore check).

## 7. GOVERNANCE TO UPDATE (Step 10)
SIM §7.4 + §9.1 + PM2 row (managed `dawntrader-ml`, guardrails, /opt/ml-venv pinned, AUTO_START=false, psutil/metrics restored); SYSTEM_MANUAL ML chapter + deploy-chain section (managed-helper + rebuild script); RUNNING_ISSUES #24 (append: rename to `dawntrader-ml` + psutil gap closed + guardrails attached); CHANGES_AND_FIXES (new entry); BATCH_CATALOG + PHASE_HISTORY; MULTI_ASSET_VTS_EXPANSION_PLAN F.2 → done; PHASE_24_TO_19_READINESS_CHECKLIST §4 item 3 → done; CLAUDE.md §7 (note: helper is PM2-managed as `dawntrader-ml`; if `ml_service.py` changes, deploy also `pm2 restart dawntrader-ml`); MEMORY (truth+mirror+Langston). Cross-ref deploy-hygiene #202 for the in-repo `ml_venv` removal.

## 8. OPEN ITEMS FOR LANGSTON STEP-2 REVIEW
- **Q1 (pinning depth):** pin the 4 direct deps only (CC lean) vs. a full freeze lockfile? psutil exact pin value?
- **Q2:** agree `ecosystem.config.cjs` needs no launch-shape change (already runs the venv interpreter directly)?
- **Q3:** agree the in-repo `ml_venv` removal (step 8) is safe cleanup this batch vs. defer to deploy-hygiene #202?
- **Q4:** any objection to the scratch-port (:5099) smoke test as the offline-validation gate before the one-way cutover?
- **Q5:** anything else the audit missed.

---
*Step-2 deliverable. On Langston review → Step 3 implementation (repo changes) → Step 4 code review → push/CI → Step 6 cutover runbook → verify → govern → close.*
