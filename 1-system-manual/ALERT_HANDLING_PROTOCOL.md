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
   [[ALERT id=<id> owner=<CC-A|CC-B|CC-C|CC-INFRA|Kyle> action="<one line>"]]
   ⛔ **THE OWNER TOKEN SET IS AUTHORITATIVE HERE AND IS MIRRORED BY `ALERT_OWNERS` IN `cc-wake-filter.py`.** CC-C and CC-INFRA added 2026-08-23. **THIS SPEC GOVERNS THE EMITTER (Langston); the filter governs the reader.** They drifted apart until 2026-08-23, when the filter accepted values this document forbade him to write.
   ⚠️ **AND THE CAUSAL CLAIM I FIRST WROTE HERE WAS WRONG — STRUCK, NOT SOFTENED.** It said a correctly-emitted `owner=CC-C` "was never matched, so nobody was suppressed and an alert owned by one session woke others." **The enumeration was not what broke it.** The reader searched a **400-character truncation** while the marker is the **LAST line** of a triage whose median length is **2,289 characters**. **MEASURED (Langston, all history, both tailed files): 3,836 `langston_outbound` records · 1,025 carry `[[ALERT` · 1,021 past byte 400 ⇒ 99.6% discarded before the regex ran.** Both defects were real and both are fixed; only the attribution was wrong. ★ **If you change the set, change it in BOTH or the emitter and the reader disagree silently.**
   ⚠️ **AN OWNER ALIAS WITH NO `NAMES` ENTRY IS SILENTLY UNROUTABLE** — it suppresses every other session and wakes nobody, which is **indistinguishable from `owner=Kyle`** (a deliberate no-wake). `CC-INFRA` is in exactly that state today, ON PURPOSE: Kyle has deferred Infra Claude’s onboarding, and the triage still lands in `#general` where he reads it. **HOME: `B-CREW-BOARD-REMOVAL` carries it alongside Infra onboarding — owner CC-A, QUEUED (§9.4 — no batch due dates).** ⚠️ **Its real gate is not a date but KYLE: Infra Claude’s onboarding is his, and this batch follows it.** **The invariant to restore then: every token in the owner set has a `NAMES` entry, or it is not in the set.**
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
- **⚠️ REPORTING AN ACK THAT NEVER LANDED — `ack`/`resolve` REQUIRE THE FULL UUID; A SHORT ID RETURNS `Alert <id> not found` AND CHANGES NOTHING.** *(Added 2026-07-31 after this bit TWO of the three sessions within one hour: CC-C on `b68902c7`, CC-A on `157e758c` — who then posted "ACKED by cc-a" in an escalation and had to correct it in the open.)* The failure is nasty because **the command exits without an obvious error and the alert stays `active`** — so the session reports the loop closed while the dispatcher will keep re-surfacing it. ⇒ **ALWAYS pass the full `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`** (get it from the alert row, not the heartbeat summary, which prints the short form), **and VERIFY BY RE-READING THE ROW — `state` + `acknowledged_by` — NEVER from the exit code.** Same discipline as `resolve`, which additionally no-ops without `--evidence <sha>`.
- **Claiming a state change you have not observed** is the general form of the above: **`ack`, `resolve` and "the alert is handled" are all CLAIMS ABOUT A ROW, and the row is cheap to read.** State it after you have read it back, not after you have run the command.
