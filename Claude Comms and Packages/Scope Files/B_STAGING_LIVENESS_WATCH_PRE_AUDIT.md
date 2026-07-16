# B-STAGING-LIVENESS-WATCH — Step-2 pre-audit (rev1)

Owner: CC-B · 2026-07-16 · Companion to B_STAGING_LIVENESS_WATCH_SCOPE.md (Step-1
PASSED w/ 4 items). SIM read: Cross-Cutting Liveness Registry (S1 cluster + heartbeat
reader row cited); the operation-queue session sweep has NO registry entry — a SIM
gap this batch's Step-10 closes.

## OBJ-2 ROOT CAUSE — PROVEN, and STRONGER than scoped: not a race, a deterministic kill
The boot sequence in `server/index.ts` is sequential in one async function:
1. `:422` → `initializeQueues()` → `operation-queue.ts:293-316`: selects ALL
   `active_engine_sessions` rows `status='running'` and **unconditionally marks every
   one stopped** ("graceful recovery" — the comment says "these should have been
   stopped on previous shutdown", a PRE-auto-resume-era assumption).
2. `:437` → `resumeActiveEngines()` → reads `systemContext.isEngineActive` (true) →
   `getRunningEngineSession('paper')` → **finds nothing — the sweep just closed it** →
   `active-engine-service.ts:1171-1173` "No active session found" → **resets
   `isEngineActive=false`**.

So the resume can NEVER win — the sweep destroys its input every boot, then the
resume erases the expected-state flag. Two consequences beyond the halt itself:
- **Langston item 4 answered structurally:** the fix is not ordering — the sweep's
  session-closing block is DELETED (rule 18; the in-memory cleanups below it at
  :318-333 are correct and stay). One owner for boot session disposition:
  `resumeActiveEngines` resumes, or REFUSES via the existing B8.2 gate. No ordering
  dependency can exist when only one actor touches session rows at boot.
- **Langston item 1 answered, and it's worse than a false alarm:** the flag-flip
  means the OBJ-1 engine check (expected=isEngineActive) would today see
  expected=false after a halt → the watchdog would be BLIND to exactly this failure,
  not noisy. OBJ-1's engine leg is only honest WITH OBJ-2 landed → the two ship in
  ONE batch, one deploy (coupling stated; the 2-tick/10-min debounce is then safe —
  post-fix resume completes in seconds, and a clean cold start has expected=false).

## OBJ-2 fix design (confirmed against code)
- `operation-queue.ts` `:296-316` session-closing block DELETED (in-memory manager +
  global-engine cleanup kept; `DELETED_COMPONENTS_LOG` entry).
- `resumeActiveEngines` gains the two missing dispositions, both LOUD:
  (a) **REFUSED sessions get their row marked `stopped`** — today the B8.2 refusal
  leaves the row `running` (`:1126-1142` sets the flag false + alerts + returns), so
  every subsequent boot re-refuses the same corpse. Mark stopped w/ metadata reason.
  (b) **flag-true-but-no-session** (`:1171-1173`) becomes an ALERT, not just a reset —
  that state is exactly the silent-halt symptom; post-fix it should be unreachable,
  which is what makes it alarm-worthy.
- Legitimate stops are untouched: `/active-engine/start` continue-mode + stop routes
  mark rows stopped themselves; the orphan case (row running + process died) is now
  the RESUME's job, which is the whole point.

## NEW FINDING — the ActiveEngineHeartbeat is STRUCTURALLY DEAD (→ #521)
`active-engine-heartbeat.ts:127-131` requires `session.userId` — but
`active_engine_sessions` has NO user column (mode-based architecture; schema verified
live). Every `checkSession` call skips at :130 (`"Session missing required fields"` —
the log line observed seconds before the halt). The heartbeat's real functions
(mode-mismatch auto-stop :143-163, expiration enforcement) have NEVER run post-rename.
Rule-18 userId-coupling. **Deliberately NOT silently re-enabled in this batch** —
un-deadening a monitor that auto-STOPS sessions, mid-soak, as a drive-by is the wrong
risk. Disposition for Langston's ruling: #521 fix-or-retire with the OBJ-1 watchdog's
overlap considered (out-of-process watchdog may supersede the in-process heartbeat
entirely) — recommend Phase-20 hardening, alongside #518/#519.

## Langston items 2 + 3 (OBJ-1)
- **Item 2 — full-host-down residual → OBJ-3 (small, in-batch, recommended):** a
  HELSINKI-side systemd timer (the box that already hosts the bridges) curls the
  staging HTTPS URL every 5 min; N=3 consecutive failures → posts to Discord
  `#general` via the existing `cc-send --notify` (Kyle phone push). The staging-side
  alert path can't cover host-down by construction (the jsonl lives on the dead box);
  the Helsinki probe closes the class with ~20 lines + a unit file, no new
  infrastructure. If Langston prefers deferral: #522 with a Phase-20 home; recommend
  in-batch (Friday-compatible).
- **Item 3 — fallback drift + dedupe:** the watchdog script ships IN THE REPO
  (`server/scripts/staging-liveness-watchdog.mjs`, plain node — runs even when the
  app build is broken, the exact #512 scenario). Primary alert path = the alerts CLI
  (validates via addAlert). Fallback = direct append of a template carrying
  `schema_version: 1` + the full SystemAlert field set; a CI unit test imports the
  template and asserts shape-equality against a real `addAlert` output (drift breaks
  the build, not the outage report). Dedupe: BEFORE append, scan the jsonl for a
  non-resolved row with the same `dedupe_key` (the same semantic addAlert applies) —
  idempotent against file contents, and since the CLI path uses the SAME dedupe_key,
  the two paths converge on one alert per outage.

## Blast radius
- `operation-queue.ts` deletion: callers of `initializeQueues` = index.ts:422 only;
  the deleted block's only effect was the session close (verified — no return value
  consumed). The queue machinery itself untouched.
- `resumeActiveEngines`: called from index.ts:437 only. The added stop-on-refuse
  writes through the existing `storage.updateActiveEngineSession` (same call the
  sweep used). No new writers to portfolio_state (B8.2 single-writer intact).
- Watchdog: additive, out-of-process, read-only against the app (HTTP GET + pm2 jlist
  + one SELECT-equivalent via the status endpoint); writes only to the alerts jsonl.
- systemd artifacts (unit + timer, staging; unit + timer, Helsinki): documented in
  SIM as new components; install commands in the completion report (infra-as-record).

## Verification plan (unchanged from Step-1, plus)
- The unattended-restart proof now ALSO asserts the flag: post-restart
  `isEngineActive` stays TRUE and the SAME session row remains `running` (resume
  re-attaches) or a NEW session continues it — whichever the code path does today is
  pinned in the test expectation after Step-3 confirms it.
- Fallback shape-equality CI test + dedupe idempotence test.
- Controlled kill test (off-hours): app stop → watchdog alert within one tick via
  the FALLBACK path (CLI unavailable proves the fallback); host-down leg: block the
  probe target (firewall or stop caddy) → Helsinki Discord alert at N=3.
