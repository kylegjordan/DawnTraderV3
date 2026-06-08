# B-NEW-54 SCOPE — ML helper process-management unification

> **Between Phase-24→19 plan, ITEM 3.** Status: **DRAFT (Step 1 — awaiting Langston agreement).** Active trading is OFF throughout. Author: CC, 2026-06-08. Source: `PHASE_24_TO_19_READINESS_CHECKLIST.md` §4 + `MULTI_ASSET_VTS_EXPANSION_PLAN.md` working-list item F.2.

---

## 0. ONE-LINE SUMMARY
The Python ML helper runs in production under a hand-registered PM2 name with **no restart guardrails attached**, pointed at a **different Python environment** than the repo's PM2 config defines, while a **second latent spawn path** exists in the boot orchestrator. Unify the helper under one managed process — config-defined name, guardrails attached, single owner of the port — so a future crash loop is capped and the runtime can never silently drift from the repo config.

---

## 1. PROBLEM STATEMENT (structural root cause — NOT a patch)

The Step-1.a architectural read (ecosystem config + live `pm2 jlist` + boot_orchestrator + ml_service.py + SIM §7.4 / §boot_orchestrator) surfaced four distinct facts:

**1.1 — Name mismatch ⇒ guardrails not attached (the headline).**
- `ecosystem.config.cjs` defines the ML app as **`dawntrader-ml`** with crash-loop guardrails: `max_restarts: 5`, `min_uptime: 10s`, `restart_delay: 3000`, `max_memory_restart: 512M`.
- The **live** process on staging is named **`ml-service`** (hand-registered, batch B54 era; `created_at` ≈ 2026-04-10). Because the running name ≠ the config app name, **none of those guardrails are attached to the live process.** If the helper ever enters a crash loop, nothing caps it.

**1.2 — Environment-path divergence (buried detail).**
- Live `ml-service` interpreter: `/home/deploy/dawntrader/ml_venv/bin/python3` (a venv **inside the app folder**), env has **no `ML_SERVICE_PORT`** set (helper defaults to 5001 internally — `ml_service.py:1864` — so the port is fine).
- Config `dawntrader-ml` interpreter: **`/opt/ml-venv/bin/python3`** with `ML_SERVICE_PORT: 5001` explicit.
- These point at **different Python environments**. A naive "rename" cutover would silently change which interpreter/venv the helper runs under — must be reconciled, not assumed. (Which venv actually carries the installed deps is a Step-2 staging-reality check.)

**1.3 — Deploy flow never manages the helper ⇒ drift persists.**
- The canonical deploy command (`CLAUDE.md` §7) is `pm2 restart dawntrader` — it **never touches** the ML helper. `pm2 save`/resurrect persists whatever is currently registered (the hand-started `ml-service`), so the config-defined `dawntrader-ml` has **likely never actually run** on staging. The repo config and the live reality have diverged with nothing to reconcile them.

**1.4 — Second latent spawn path (double-management hazard).**
- `server/core/boot_orchestrator.ts` (`startMLService`, ~L188-208) **also** spawns its own `python services/ml_service.py` child of the main `dawntrader` node process — **but it is GUARDED by a health pre-check** (L192-197): it only spawns if nothing already answers on the ML port. So in steady-state staging (PM2 helper healthy on :5001) the node process sees it healthy and does **not** double-spawn. The hazard is latent: if PM2's helper is down at node-boot, node spawns a child PM2 doesn't manage; if PM2 then restarts its helper, two processes contend for :5001. Single-owner needs to be made explicit, not incidental.

**Why pre-19 (not deferred):** when Phase 19 turns active-paper trading on, the SQE / Ready-to-Buy / Signal-Orchestrator path leans on the ML helper (SIM §7.4: client `ml-service-client.ts` serves those consumers). An un-guardrailed, drift-prone helper is exactly the kind of latent fragility that should be removed before the trading pipeline depends on it under load.

> **Counter cosmetic note (NOT the fix):** the live `ml-service` shows `restart_time ≈ 184,185`, but this is **cumulative-since-creation and never reset**; `unstable_restarts: 0`, ~49 days continuous uptime, empty error log. The big number is historical churn, not a live crash loop. Resetting it is cosmetic and optional — the real fix is the guardrail/ownership unification above.

---

## 2. NUMBERED OBJECTIVES (each with its verification criterion)

**O1 — ONE managed process under the config-defined name, with guardrails attached.**
The ML helper runs as the PM2 app the repo config defines (proposed: keep the config name `dawntrader-ml`), with `max_restarts` / `min_uptime` / `restart_delay` / `max_memory_restart` **attached to the running process.**
*Verify:* `pm2 show <name>` on staging displays the guardrail values (not blank); `pm2 jlist` shows the app under the config name; the orphaned `ml-service` registration is gone.

**O2 — Environment path reconciled (config ↔ reality), no silent runtime change.**
The managed process points at the Python environment that actually carries the deps (Flask / numpy / scikit-learn / psutil), and `ecosystem.config.cjs` matches that reality exactly.
*Verify:* helper boots cleanly from the managed config (no `ImportError` in `ml-error.log`); `/health` returns `{status:"READY"}`; repo config interpreter path == the path the live process actually uses.

**O3 — Single owner of the ML port (dual-spawn resolved structurally).**
Exactly one `ml_service.py` process runs. The boot-orchestrator fallback-spawn relationship is made explicit per the design decision in §3 (Q-C), not left to incidental health-check timing.
*Verify:* `pgrep -af ml_service.py` on staging returns exactly one PID; the chosen design (PM2-sole-owner vs. guarded-fallback) is documented in SIM.

**O4 — Deploy flow keeps the helper managed (no re-drift).**
The deploy procedure (and `pm2 save` state) manages the ML helper under the config name, so future `git pull && build && pm2 restart` cycles do not re-orphan it.
*Verify:* after a simulated redeploy on staging, `pm2 save` + resurrect brings back the helper under the config name with guardrails intact; `CLAUDE.md` §7 deploy block updated to reflect the managed helper.

**O5 — Guardrails proven effective (capped crash loop).**
A controlled crash demonstrates the guardrails actually engage (PM2 stops restarting after `max_restarts` within `min_uptime`), OR — if a live crash test is judged too risky on the shared staging box — the guardrails are confirmed attached via `pm2 show` and the cap behavior is reasoned from PM2 semantics + documented.
*Verify:* `pm2 show` guardrail values present; if crash-tested, PM2 marks the app `errored`/stopped after the cap rather than looping forever.

**O6 — Zero data-loss / zero-meaningful-downtime cutover.**
The cutover does not interrupt the VTS/passive learning data stream beyond the brief ML-helper restart the app already tolerates (boot_orchestrator handles a DEGRADED ML window and recovers — L123-130, L298-313).
*Verify:* main `dawntrader` app stays online throughout; after cutover, ML health recovers to READY and ML-dependent telemetry resumes; no gap in VTS archive writes attributable to the cutover.

**O7 — Governance reflects the unified reality.**
SIM §7.4 + §boot_orchestrator and the System Manual ML section describe the single managed process, the guardrails, the chosen spawn-ownership model, and the deploy flow. VTS-plan item F.2 flipped to done. CHANGES_AND_FIXES + BATCH_CATALOG + PHASE_HISTORY updated.
*Verify:* Step-10 governance diff lists each edited doc; completion report enumerates them.

---

## 3. OPEN DESIGN QUESTIONS FOR LANGSTON (resolve in Step-1 agreement / early Step-2)

- **Q-A (name choice):** Adopt the existing config name **`dawntrader-ml`** as canonical (rename the live process to it), or rename the config to match the live `ml-service`? CC recommends **`dawntrader-ml`** — the repo config is the source of truth and already carries the guardrails; the live hand-registration is the drift. Agree?
- **Q-B (venv reconciliation direction):** Once Step-2 confirms which venv (`/opt/ml-venv` vs in-repo `ml_venv`) actually has the deps, do we (i) point the config at the existing good venv, or (ii) standardize on one canonical location and (re)build it? CC leans toward **(i) point config at the proven-good venv** for this batch (minimal blast radius), and log "standardize venv location" as a separate cleanup if the in-repo venv is the live one (an in-repo `ml_venv` is itself a smell — it shouldn't be inside the deploy tree). Agree, or standardize now?
- **Q-C (dual-spawn ownership model) — the real design call:** Two clean options:
  - **(C1) PM2 is sole owner.** Set `ML_SERVICE_AUTO_START=false` in the managed `dawntrader` env so the node process never spawns its own child; PM2's `dawntrader-ml` is the only spawner. Pro: unambiguous ownership. Con: if PM2's helper is down, node runs DEGRADED instead of self-healing.
  - **(C2) Keep the guarded fallback.** PM2 is primary; the boot_orchestrator's health-gated spawn stays as an in-process fallback. Pro: self-heal if PM2 helper is briefly down. Con: two potential spawners (mitigated by the health pre-check, but still two code paths).
  CC leans **(C1) PM2 sole owner** for production clarity (NO-PATCHES: one owner, documented), treating the in-process spawn as a **local-dev convenience only** (guarded by `ML_SERVICE_AUTO_START`). Your call?
- **Q-D (crash-test on staging):** Is a controlled crash-loop test (O5) acceptable on the shared staging box, or should we settle for "guardrails confirmed attached via `pm2 show`" + reasoned semantics? CC leans **confirm-attached + a single safe forced-restart**, not a real runaway loop, to avoid disturbing the live VTS stream.

---

## 4. WHAT THE STEP-2 CODE-LEVEL AUDIT WILL COVER (deferred per Kyle sequencing)
Listed here so the scope is honest about what's not yet verified:
- Full read of `server/services/ml-service-client.ts` — every consumer/call-site of the helper, timeouts, degraded-mode handling (blast radius if the helper blips during cutover).
- Full read of `boot_orchestrator.ts` ML lifecycle + `ML_SERVICE_AUTO_START` / `ML_SERVICE_HOST` env wiring.
- Deep read of SIM §7.4 + §boot_orchestrator and the System Manual ML chapter for any documented behavior the change touches.
- **Staging reality checks:** which venv exists and carries deps (`ls /opt/ml-venv/bin`, `ls /home/deploy/dawntrader/ml_venv/bin`, import probe); current `~/.pm2/dump.pm2` contents; whether `dawntrader-ml` has ever been registered; `ml-error.log` / `ml-out.log` recent tail; confirm exactly one `ml_service.py` PID today.
- Confirm no other consumer hard-codes the name `ml-service` (deploy scripts, health dashboards, alert wiring).

---

## 5. OUT OF SCOPE
- Any change to ML **model logic**, training, calibration math, or the helper's REST surface — this batch is process-management only.
- The standalone always-on VTS sim service (between-plan item 4) and its storage-architecture decision — separate item.
- Migrating the helper off Flask / changing its port / containerizing it.
- The cosmetic restart-counter reset is **optional** (O-note in §1), not a load-bearing objective.

## 6. RISK NOTES
- **ML helper is in the live passive/VTS path** (SQE/RTB/orchestrator scoring). Cutover causes a brief :5001 outage; the app tolerates a DEGRADED ML window and recovers, but the cutover must be sequenced (delete orphan → start managed → health-confirm) and watched.
- **Shared staging box** — no runaway crash-loop test that could starve the main app (see Q-D).
- **`pm2 save` is global** — saving the dump to capture the new managed set will also capture the main `dawntrader` app; confirm the dump is correct (both apps, right names) before relying on resurrect.

## 7. GOVERNANCE DOCS TO UPDATE (Step 10)
SIM §7.4 + §boot_orchestrator; SYSTEM_MANUAL ML section; CHANGES_AND_FIXES; BATCH_CATALOG; PHASE_HISTORY; MULTI_ASSET_VTS_EXPANSION_PLAN (F.2 → done); PHASE_24_TO_19_READINESS_CHECKLIST (§4 item 3 → done); MEMORY (truth + mirror + Langston). CLAUDE.md §7 deploy block (managed-helper note).

---
*Step 1 deliverable. On Langston agreement → Step 2 code-level pre-audit (with the §4 staging-reality checks) → implementation.*
