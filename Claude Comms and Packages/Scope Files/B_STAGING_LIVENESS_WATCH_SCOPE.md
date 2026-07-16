# B-STAGING-LIVENESS-WATCH — Step-1 scope (rev1)

change-class: architecture
Owner: CC-B · 2026-07-16 · Homes discharged: **#512** (the 2026-07-15 staging outage,
09:15→13:49Z unnoticed — my code-first deploy vs the b72 zero-row hard-fail; owned) +
**#520** (B8.8 Step-8 finding: the engine SILENTLY halts on every process restart).
DEADLINE: Friday 2026-07-18 (Kyle-slotted).

## The problem, in one sentence each
- **#512:** when staging goes DOWN, nothing notices — the system-alerts dispatcher
  lives INSIDE the app, so the alerting machinery dies with the patient (4.5h blind).
- **#520:** when the process RESTARTS, the app comes back but the engine does not —
  the 41F-B orphan-recovery classifies the previously-running session as an orphan and
  closes it (~5 min post-boot), the R9.3.HF-4.FIX auto-resume never wins, and an
  unattended deploy/crash leaves paper-active trading silently OFF mid-soak (no alert;
  the absence of trades is the only symptom, and nothing watches for absence).

## OBJ-1 — the OUT-OF-PROCESS watchdog (the #512 fix)
A **systemd timer** on the staging box (root-owned, independent of pm2/the app),
every 5 minutes, running a small script that checks, in order:
1. **HTTP liveness**: `curl -m 10 http://localhost:5000/` expects 200/3xx.
2. **Process liveness**: `pm2 jlist` shows `dawntrader` online (as deploy).
3. **Engine liveness (the #520 detector)**: `/api/active-engine/status` isRunning
   compared against an EXPECTED-STATE marker — the `system_context.isEngineActive`
   flag the resume path already maintains (expected=true + isRunning=false for 2
   consecutive ticks → engine-halt alert). No new state store; the DB flag is already
   the resume path's own source of truth.
4. **On failure**: write a system alert. Primary path = the app's alerts CLI; the
   FALLBACK (load-bearing — the exact case is "the app is down") = DIRECT append of a
   schema-valid alert line to `/var/log/dawntrader/system-alerts.jsonl` (same shape
   `addAlert` writes; dedupe via a `dedupe_key` per check so a sustained outage is ONE
   alert, not 288/day). §10.5 pickup + the Discord alert path do the rest — they run
   on the OTHER box (Helsinki), which is exactly why an on-box outage still surfaces.
5. **Watchdog self-liveness**: systemd `OnFailure=` + a weekly heartbeat line, so a
   dead watchdog is itself visible (a liveness loop cannot close inside its own
   failure domain — the F10 principle applied here).

NOT in scope: auto-remediation (no auto-restart of the app or engine by the watchdog —
detection only; remediation stays a human/CC act on the alert. Reason: an auto-restart
loop on a genuinely broken deploy would flap and can mask a real failure).

## OBJ-2 — fix the resume-vs-orphan-recovery race (the #520 fix)
Root-cause first (Step-2 deliverable): WHY does the boot classify a healthy running
session as an orphan — the `[ActiveEngineHeartbeat] Session missing required fields —
skipping check` seconds earlier is the likely discriminator (a session row missing
fields the heartbeat/recovery expects → treated as unresumable). Fix DESIGN (to be
confirmed against the actual code at Step-2, not assumed):
- The 41F-B recovery and the R9.3.HF-4.FIX auto-resume must agree on ONE classifier:
  a session row with `status='running'` and a trustworthy balance (the B8.2
  RESUME-REFUSED gate already defines "trustworthy") is RESUMED, never orphan-closed.
- Orphan-close remains for genuinely unresumable rows (the B8.2 refusal already
  alerts on those — that path is correct and stays).
- Ordering: resume runs BEFORE (or is checked BY) the recovery sweep, so the sweep
  only ever sees sessions resume declined.
- Every orphan-close writes a system alert (today it is a silent log line) — even
  post-fix, an orphan-close during the soak is a reportable event.

## Verification
- OBJ-1: kill the app on staging (controlled, off-hours, engine state preserved) →
  watchdog alert lands in the jsonl within one tick → §10.5 sweep surfaces it →
  restore. Engine-halt leg: stop the engine via the API (continue-restart after) →
  2-tick alert proven.
- OBJ-2: pm2 restart with a running session → session RESUMES unattended (no manual
  continue-start), positions intact, `[41F-B]` shows zero orphan-closes of the live
  session; the manual continue-start ritual retires from the deploy runbook.
- §9.3: N/A-visual for the watchdog (no UI surface); the engine-resume proof is
  observable on the Paper page (ACTIVE without manual intervention post-restart).
- Governance: SIM new-component entry (watchdog) + engine-lifecycle seam update;
  SysManual applicability judged at Step-10 (boot lifecycle = arguably Chapter-level
  architecture; judgment applied explicitly).
