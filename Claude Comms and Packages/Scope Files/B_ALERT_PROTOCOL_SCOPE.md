# B-ALERT-PROTOCOL — Post-diagnosis system-alert handling protocol

**Owner:** OLD Claude (CC-A). **Created:** 2026-06-23. **change-class:** non_architecture (observability/comms infra — the §10.5 system-alerts lifecycle + dispatcher + the Langston handler; no trading-engine/strategy/regime/math touch → System Manual N/A, SIM applies). **Comms:** Discord. **Reviewer:** Langston (he asked to weigh in AT SCOPE — this process touches his lane directly). **Source issue:** RUNNING_ISSUES #340.

---

## §0 — The problem (Kyle directive 2026-06-21)

Today: a system alert fires → Langston diagnoses it → sometimes he farms it to a CC → but **sometimes "nothing comes back."** Kyle wants a CLEAR, DEFINITE post-diagnosis process: **who OWNS the follow-through, the explicit steps after Langston's diagnosis, tracking-to-closure, and what each alert class triggers** — not figured-out ad-hoc per alert. An alert that's been diagnosed but not actually fixed must never silently rot.

## §1 — Pre-audit findings (verified against source, not assumed)

The full §10.5 alert lifecycle, traced through the actual code:

1. **Create** — `addAlert()` (`server/services/system-alerts.ts`) writes a `scheduled` alert to `/var/log/dawntrader/system-alerts.jsonl` (file-locked JSONL). Writers: the CLI (`scripts/system-alerts.ts add`), the governance-checker, cron-arm smoke-test + CRON-FIRE-VERIFIER, amr-input-health sentinels, soak/verify gates. States: `scheduled → active → acknowledged → resolved`.
2. **Fire** — the dispatcher cron (15-min systemd timer on staging) runs `fire-due` → `fireDue()` promotes `scheduled` whose `triggers_at ≤ now` to `active`, then for each non-`info` promotion: `pushToTelegram` + `pushToDiscord` (alerts webhook) + `invokeLangstonForAlert`.
3. **Diagnose** — `invokeLangstonForAlert` SSHes to Helsinki → `langston-alert-handler.sh` (B-NEW-46) runs a fresh Langston `claude -p` session with a plain-language prompt ("open with `re: <id> <title>`, state what it means + what action you're taking/recommending"), **appends the response to `/var/log/langston-alert-invokes.log`**, and **relays it to Kyle** (Telegram topic 21 today → Discord post-cutover). Failure-visibility invariant: every path posts *something*.
4. **CC awareness** — the CC wake watcher tails `langston-alert-invokes.log`; every `invoke DONE` line wakes the CC sessions.
5. **Close** — `ackAlert()` (state→`acknowledged`) and `resolveAlert()` (state→`resolved`, terminal) via the CLI or the UI ack button.

**The gaps (the root of "nothing comes back"):**
- **(G1) The handler never assigns an owner.** After diagnosis the alert is still `active`; nobody is recorded as responsible for the follow-through.
- **(G2) The follow-through is untracked.** "Usually a CC's" work (Kyle's words), but there is no link from the alert to the fix, no owner field, no state that means "diagnosed, owned, in-progress."
- **(G3) No no-silent-drop guarantee.** A diagnosed-but-unresolved alert relies entirely on the **pull-based** §10.5 per-turn check (a CC happening to notice). Nothing **pushes** a stuck alert back up. The 2026-06-11 gap-fix (per-turn surfacing of `acknowledged_by=langston` within 24h) is a patch on the same pull mechanism, not a closure guarantee.
- **(G4) `acknowledged` vs `resolved` are unused as a discipline.** The two states exist and are exactly right for "owned" vs "closed," but no protocol assigns them meaning, so in practice alerts get diagnosed and left `active`.

## §2 — Objectives (numbered, each with verification)

**OBJ-1 — Write the protocol (the definitive process), homed where it's always findable.** A concise, authoritative "what happens after an alert fires" sequence + a per-class action table, written into `1-system-manual/ALERT_HANDLING_PROTOCOL.md` and pointer-referenced from CLAUDE.md §10.5 (so it's reachable from the always-loaded file without bloating it). The sequence:
   1. Alert fires → Langston diagnoses (existing).
   2. **Langston's diagnosis names a recommended OWNER + a one-line ACTION** in a parseable trailing line (see OBJ-2).
   3. The **owning party ACKs the alert** (`ack --by <owner>`) — ack now means *"I own this and am acting on it,"* not "seen."
   4. Owner does the follow-through → **RESOLVES** the alert (`resolve --by <owner>`) with a one-line evidence note — resolve means *"the underlying condition is actually fixed/closed,"* verified, not just diagnosed.
   5. If an alert sits un-resolved past a TTL → it **re-surfaces/escalates** (OBJ-4) — nothing rots silently.
   **Verify:** the doc exists, CLAUDE.md §10.5 points to it, and the per-class table covers every `AlertCategory` (`soak_verification | health_check | breakage | one_off | recurring | governance`).

**OBJ-2 — Langston's diagnosis assigns an owner (parseable).** Extend the handler prompt (`langston-alert-handler.sh`) so Langston ends his response with a structured last line: `[[ALERT id=<id> owner=<CC-A|CC-B|Kyle> action="<one line>"]]` (same single-machine-parseable-last-line discipline that worked for the review queue). His plain-language message to Kyle is unchanged above it. The owner is his call from the alert's domain (governance→CC-A; trading/breakage→CC-B; etc. — the per-class table is the default he can override).
   **Verify:** a test alert's invoke-log entry + relayed message carry a well-formed `[[ALERT …]]` marker with a valid owner.

**OBJ-3 — Track ownership on the alert + route the wake to the owner.** (a) Record the owner on the alert (an `owner` field or `metadata.owner`); (b) the CC wake watcher, which already tails the invoke log, routes the wake to the **named owner** (reusing the existing display-name routing) so the right CC is pulled in and the other stands down — with a both-CC fallback if no owner parses.
   **Verify:** a test alert naming `owner=CC-A` wakes CC-A (not just a broadcast), and the owner is readable on the alert record.

**OBJ-4 — No-silent-drop: a stale-alert re-surface (the closure guarantee).** A scheduled check (folded into the existing dispatcher's 15-min run, OR a sibling step) that finds alerts `active`/`acknowledged` (not `resolved`) older than a TTL and **re-surfaces them** — re-pushes to the channel + escalates to Kyle, on a back-off cadence so it nudges without spamming. This is the push mechanism that makes "nothing comes back" impossible. (Mirrors the review-queue's blocked-staleness re-surface; same principle.)
   **Verify:** an alert left unresolved past a (test-shortened) TTL produces exactly one re-surface per back-off window, and a `resolved` alert produces none.

**OBJ-5 — Per-class default action table.** For each `AlertCategory`, the default owner + the concrete follow-through (e.g. `governance` → CC-A fixes the doc gap or marks the exception; `breakage` → CC-B fixes/escalates; `soak_verification` → owner reads the numbers + brings the recommendation; `health_check` → confirm healthy or escalate). Lives in OBJ-1's doc.
   **Verify:** the table is complete + Langston-reviewed.

**OBJ-6 — Discord-native (rides the cutover).** The handler's relay + the re-surface posts go to Discord (consistent with the item-5 cutover). If the cutover lands first, this is already covered; if not, OBJ-6 ensures the protocol is written Discord-first with Telegram as the documented rollback.
   **Verify:** post-cutover, a test alert's diagnosis + a re-surface both appear in the Discord channel.

## §3 — Out of scope / non-goals
- Not rebuilding the alert lifecycle or the dispatcher — this adds *ownership + tracking + a closure guarantee* on top of the existing, working pipeline.
- Not changing how alerts are *created* (the writers stay as-is).
- No new npm deps (Kyle B75 directive).

## §4 — Verification plan
Helsinki handler change + a small staging dispatcher/code change → bench-test the marker parse + the stale-resurface logic (unit-testable pure functions) → deploy → fire a synthetic test alert end-to-end: confirm Langston emits the owner marker, the owner CC is woken, ack→resolve closes it, and a deliberately-unresolved test alert re-surfaces once per window then stops on resolve. Langston Step-4 on the diff; Step-8 second-pass.

## §5 — Open questions for Langston (Step-1)
- (a) **Owner-assignment authority:** you naming the owner in your diagnosis (OBJ-2) vs a pure category→owner table (OBJ-5) with no per-alert override — I lean *both* (table is the default, your marker can override). Agree?
- (b) **Stale TTL + cadence (OBJ-4):** first re-surface at how long un-resolved (I lean 6h for warning, 2h for critical), and re-surface every TTL after, escalating to Kyle by name on the 2nd. Reasonable?
- (c) **Ack-means-owned redefinition (OBJ-1 step 3):** repurposing `acknowledged` to mean "owned + acting" (vs today's looser "seen") — any objection, or do you want a distinct field instead of overloading the state?
- (d) **Re-surface home:** fold OBJ-4 into the existing dispatcher 15-min run vs a separate sibling timer — I lean folding in (it already runs + holds the file). Concern?

## §6 — Langston Step-1 answers (APPROVED to proceed, 2026-06-23) — BUILD-LOCKED

**(a) Owner authority — BOTH.** Category table = default (the 90%); Langston's `[[ALERT … owner=…]]` marker OVERRIDES. The override matters most when an alert's *category* says `governance` but its *cause* is a breakage symptom — his domain read beats the static map.

**(b) TTL/cadence — 6h warning / 2h critical, with three refinements (build to these):**
- **Two-tier staleness, NOT one timer:** an `active` alert that is **un-acked** (nobody owns it) is the WORSE state → re-surfaces at the SHORT TTL; an `acknowledged` (owned, being worked) alert gets a LONGER leash before its own re-surface.
- **Ack does NOT reset the staleness clock** — otherwise "owned+acting" becomes a way to silence the alarm without fixing. **Only `resolve` stops re-surfacing.**
- **Widen the back-off after the 2nd re-surface escalates to Kyle:** 1×TTL → 2× → … — once it's in front of Kyle the forcing function is done; keep nudging without spamming. (NOT fixed cadence forever.)

**(c) Overload `acknowledged` = owned+acting — YES, prefer overload (fewer states).** Two conditions: **`--by <owner>` becomes MANDATORY on `ack`** (an ownerless ack is meaningless under the new semantics); and **retire/clarify the langston-self-ack path** from the 2026-06-11 fix so "seen" vs "owned" isn't double-counted.

**(d) Fold into the 15-min dispatcher — YES, no sibling timer** (it holds the file lock; a 2nd cron reintroduces the 2026-06-09 shared-event-loop top-of-hour stall). But keep the stale-scan a **separate PURE function `resurfaceStale()` called after `fireDue()`** so OBJ-4's "exactly one re-surface per back-off window" is independently unit-testable.

**Step-4:** send Langston the diff; he verifies the marker parse + the re-surface idempotency against the actual code.
