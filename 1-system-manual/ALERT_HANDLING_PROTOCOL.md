# Alert Handling Protocol — what happens after a system alert fires

> **The definitive post-diagnosis process for §10.5 system alerts.** Built in B-ALERT-PROTOCOL (#340, 2026-06-23) to close the "nothing comes back" gap: an alert used to get diagnosed and then sit, because nobody owned the follow-through and nothing forced it to closure. This is the always-true sequence. CLAUDE.md §10.5 points here.

---

## The lifecycle (states)

`scheduled → active → acknowledged → resolved`. An alert is created `scheduled`; the dispatcher promotes it to `active` when due; **`acknowledged` now means "an owner has it and is acting on it"** (not merely "seen"); **`resolved` means the underlying condition is actually fixed + verified** (terminal). Source: `server/services/system-alerts.ts`.

## The sequence (every alert, no exceptions)

1. **Fire.** The dispatcher (15-min systemd timer on staging, `scripts/system-alerts.ts fire-due`) promotes the alert to `active` and posts it to the Discord alerts channel (warning + critical; `info` never pushes).

2. **Diagnose.** Langston's bridge always-engages on the alerts webhook and triages it: a plain-language message to Kyle (what it means, likely cause, action-now vs FYI).

3. **Assign the owner.** Langston ends his triage with a single machine-parseable last line:
   ```
   [[ALERT id=<id> owner=<CC-A|CC-B|Kyle> action="<one line>"]]
   ```
   The owner is **who must carry the fix to closure.** The per-class table below is the default; **Langston's domain read overrides it** (e.g. an alert whose *category* is `governance` but whose *cause* is a breakage symptom → he can route it to CC-B). No-action alerts still get a marker: `owner=Kyle action="FYI — no action needed"`.

4. **Route + claim.** The wake filter (`cc-wake-filter.py`) routes the wake to the **named owner** (the other CC stands down; `owner=Kyle` wakes no CC — he sees it in-channel). The owning party **acknowledges the alert**, which records ownership:
   ```
   npm run system-alerts -- ack <id> --by <CC-A|CC-B|kyle|...>
   ```
   `--by` is mandatory — an ownerless ack is meaningless. `acknowledged_by` IS the owner record.

5. **Do the follow-through.** The owner does the actual work (the `action`), through the normal workflow if it's a code/governance change.

6. **Resolve.** When the underlying condition is genuinely fixed + verified, the owner closes it:
   ```
   npm run system-alerts -- resolve <id> --by <owner>
   ```
   **Only `resolve` ends the alert.** Acking does not — see the closure guarantee.

7. **Closure guarantee (no silent drop).** If an alert stays un-`resolved` past its TTL, the dispatcher **re-surfaces** it (re-posts to Discord, Langston re-engages and re-routes to the owner) on a **widening back-off**, and **escalates to Kyle by name** on the 2nd+ re-surface. So a diagnosed-but-unfixed alert can never silently rot. TTLs (`computeResurfaceStale`):
   - **un-acked `active`** (nobody owns it — the worse state) re-surfaces *faster*: **critical 2h / warning 6h**.
   - **`acknowledged`** (owned, being worked) gets a longer leash: **critical 4h / warning 12h**.
   - **Acking does NOT reset the staleness clock** — only `resolve` stops re-surfacing (so "owned" can't be used to silence the alarm without fixing it).
   - Back-off widens each re-surface (1× → 2× → 4× TTL).

## Per-class default owner + action (`AlertCategory`)

| Category | Default owner | Follow-through |
|---|---|---|
| `governance` | CC-A | Fix the missing/thin doc (or declare the exception in `GOVERNANCE_EXCEPTIONS.md`), then resolve. |
| `breakage` | CC-B | Reproduce → fix or escalate the broken path; resolve once verified healthy. |
| `health_check` | owner of the checked system (CC-B for trading, CC-A for comms) | Confirm healthy (resolve) or escalate if degraded. |
| `soak_verification` | the batch owner | Read the numbers, bring Kyle the recommendation, then resolve. |
| `one_off` | per the alert body | Do the one-off task; resolve. |
| `recurring` | owner of the recurring concern | Handle this instance; resolve (the next instance re-fires fresh). |

(Defaults only — Langston's marker overrides per the actual cause.)

## Roles
- **Dispatcher** — fires, posts, invokes Langston, and runs the re-surface closure guarantee.
- **Langston** — diagnoses + assigns the owner. He reviews/verifies; he does not own code follow-through.
- **The owning CC** — acks (claims), does the work, resolves with evidence.
- **Kyle** — sees every alert + every escalation; owns alerts routed `owner=Kyle`; the re-surface escalation is the forcing function that pulls him in only when something is genuinely stuck.

## Anti-patterns (the failure modes this kills)
- Diagnosing an alert and leaving it `active` (no owner, no closure) → the owner marker + the re-surface make this impossible.
- Acking to silence an alarm without fixing it → ack doesn't stop re-surfacing; only `resolve` does.
- An alert silently dropped because no CC was looking → the push re-surface + Kyle escalation replace reliance on the pull-based per-turn check.
