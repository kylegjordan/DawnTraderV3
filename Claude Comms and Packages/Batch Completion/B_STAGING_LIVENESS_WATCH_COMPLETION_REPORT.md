# B-STAGING-LIVENESS-WATCH — COMPLETION REPORT

Owner: CC-B · 2026-07-16 (closed 2 days AHEAD of the Friday 07-18 deadline)
change-class: architecture (declared Step-1; Langston endorsed vs the under-declaration class)
Head `2d163cf08` (code) · CI green (run `29526521147` covering the head after a
concurrency-cancel of `29526432619`'s superseded run — same tree) · NO migration ·
deployed 19:06Z · Langston Step-1 PASS / Step-2 PASS (root cause independently
confirmed) / Step-4 APPROVED (engine-leg liveness + refuse-path signature + CI
drift-guard independently verified at code). Discharges **#512** + **#520**.

## Objectives — all YES
1. **OBJ-1 out-of-process watchdog** — YES. `server/scripts/staging-liveness-watchdog.mjs`
   (plain node, runs on a broken build — the exact #512 scenario), systemd timer 5-min,
   User=deploy. Checks: HTTP, pm2, engine (`GET /api/health/liveness`, NEW public
   route: engineExpected = the system_context flag / engineRunning = the in-process
   manager). 2-tick debounce; per-condition latch re-armed on recovery. Alert paths:
   CLI (gained `--dedupe-key`, exposing the B-NEW-51 dedup) + direct-append fallback
   whose template is CI-PINNED against a real addAlert row (shape drift breaks the
   build). Self-liveness: OnFailure → `--self-fail` through the fallback path; weekly
   `--heartbeat` info alert whose ABSENCE is the alarm.
2. **OBJ-2 the #520 engine-halt fix** — YES. The `initializeQueues` DB session sweep
   DELETED (rule 18; `DELETED_COMPONENTS_LOG` + `.removed` archive, pre-delete ref
   `d10a24487`): it deterministically orphan-closed the running session BEFORE
   `resumeActiveEngines` (index.ts :422 vs :437) — not a race, sequential destruction.
   Single boot-disposition owner = resume; refusal now also marks the row stopped
   (w/ runForMs — Langston note 1 folded); flag-true-no-session → dedupe-keyed
   breakage alert (post-fix unreachable = regression alarm). Step-3 pin resolved at
   code: resume RE-ATTACHES the same session row (rows are created only in the start
   flow, active-engine-service :542) — asserted by the live proofs below.
3. **OBJ-3 Helsinki host-down probe** — YES (Langston ruled in-batch). Script + units
   on the box that hosts the bridges; 3 consecutive fails → Discord `#general` w/
   phone notify; recovery posts once + re-arms.

## Verification evidence (the drills)
- **Unattended resume ×2 (the headline)**: the 19:06Z deploy restart AND the 20:31Z
  deploy restart each auto-resumed the engine — `engineExpected:true/engineRunning:true`
  with ZERO manual intervention, same session row continuing (`paper_-i05tFriAB`
  survived 19:06Z; positions intact both times). The manual continue-start ritual is
  RETIRED from the deploy runbook.
- **Fallback-path drill** (no downtime): dead URL + broken CLI dir + seeded streak →
  `FAIL (streak 2/2)` → `CLI emit failed … using direct-append fallback` → schema-valid
  row `4242fb26…` (`emit_path=fallback_direct_append`, `dedupe_key=watchdog-http`) —
  resolved with drill evidence.
- **CLI path + heartbeat**: `--heartbeat` emitted via the CLI
  (`watchdog-heartbeat-2026-07-16`).
- **Helsinki drill** (pre-announced in-channel): 3 runs vs an unreachable target →
  the HOST DOWN notify post fired; recovery run → RECOVERED post + state re-armed
  `0 0`. (First-read-of-missing-state-file stderr noise is handled by the fallback
  read; cosmetic.)
- **Timers live**: `dawntrader-watchdog.timer` (first tick ran on install),
  `dawntrader-watchdog-heartbeat.timer` (Mon 09:00 UTC), `helsinki-staging-probe.timer`.
- **Honest boundary**: the ENGINE-leg alarm was not end-to-end drilled (both liveness
  states were read live today — stopped pre-fix, running post-fix — and the check
  shares the drilled code path; a full drill requires stopping the engine mid-soak,
  declined). Langston may rule at Step-8 if he wants the drill at the weekend gap.
- Real-world rail validation same evening: alert `975fd498` (BSX/USD venue-quiet, 40
  skips) fired + self-recovered at 20:37Z — resolved with log-trace evidence.

## Homes / riders
#512 RESOLVED · #520 RESOLVED · #521 (dead ActiveEngineHeartbeat) Phase-20 per
Langston's ruling · full-host-down external leg = OBJ-3 (closed, no residual #522
deferral needed).

## Governance files changed
BATCH_CATALOG · PHASE_HISTORY · PHASE_19_PLAN §5 · RUNNING_ISSUES (#512/#520
RESOLVED; #521 filed earlier) · SYSTEM_IMPACT_MAP (new components: watchdog +
liveness route + Helsinki probe; boot-lifecycle seam update) · DELETED_COMPONENTS_LOG
(the session sweep) · MEMORY_CC_B + repo mirror + Langston MEMORY sync · this report.
SysManual: boot-lifecycle disposition judged SIM-scope (component/seam, no
strategy/regime/math change) — judgment applied explicitly per §9.
