# B-LANGSTON-QUEUE-345 — Scope (Step-1)

**Owner:** OLD Claude (CC-A). **change-class:** non_architecture (comms-infra — the Langston Discord review-queue engine + bridge wiring; no trading-engine/strategy/regime/math → System Manual N/A, SIM applies). **Source:** RUNNING_ISSUES #345 (expanded 2026-06-24 with the cap-defeat finding). **Reviewer:** Langston (Step-1 scope → Step-2 pre-audit → Step-4 diff → Step-8).

> **Context.** B-LANGSTON-QUEUE went live 2026-06-22 (`LANGSTON_SELF_ADVANCE=1`). On 2026-06-24, under the sustained CC↔Langston traffic of the B-ALERT batch, the self-advance loop entered an effective re-feed loop — Langston re-reviewed already-settled topics over and over. I traced the root causes (below), applied a stopgap (self-advance DISABLED + ready backlog cleared; Langston still answers direct messages), and homed the permanent fix here. **This batch is the permanent fix + the gate to re-enabling `LANGSTON_SELF_ADVANCE=1`.**

## Root causes (verified in `comms-infra/discord/langston_queue.py` + the live bridge)

1. **Over-enqueue of conversational replies.** `is_review_request()` matches `_REVIEW_INTENT_RE`, which fires on the bare TOKEN `verif` (among others). So any CC reply that merely *mentions* having "verified" / "a verification" — e.g. a thread reply like "Langston — I checked the code rather than wave it off … verified the timestamps" — matches and gets enqueued as a NEW review item, even though it is a discussion reply, not a review REQUEST. (Observed: my dispatcher-flag replies all enqueued this way.) Conservative-on-the-non-enqueue-side was the design intent (FINDING-1); the heuristic is simply too loose on the enqueue side.

2. **The same-id runaway brake is defeated by inbound chatter.** The two-tier `CapTracker`: `register_advance(id)` tracks distinct advances + same-id repeats; `should_halt()` trips at same-id-twice-without-done (halt@2) or 10 distinct advances. BUT `process_task` calls `_cap.reset()` on EVERY real (non-self-advance) inbound. Under continuous Kyle/CC inbound, the same-id counter is reset before it can reach 2 — so a stuck (ready, never-`done`) item re-fires indefinitely. Observed: queue item `1519109514383720469` re-invoked at 22:56 / 22:57 / 23:01 with no halt.

3. **Degraded re-pass (the original #345).** A real-inbound review enqueues the item but the real-inbound invocation prompt does NOT instruct the queue marker, so Langston's first (full) review carries no `done` marker → the item stays `ready` → the loop re-feeds it ONCE from the truncated 500-char summary with no `pointer` → a shallower re-take. Self-completes, but wastes one degraded pass + posts a confusing shallow reply.

## Objectives (the 3-part fix)

- **OBJ-A — First review marks done (kills the degraded re-pass).** When an inbound ENQUEUES an item, append a queue-marker instruction to the SAME real-inbound invocation prompt, so Langston's first complete review emits `[[QUEUE id=<id> status=done|blocked|...]]` and the item never needs a re-pass. Verification: a real review request → exactly ONE Langston review, item→done, zero self-advance re-pass.

- **OBJ-B — Capture a `pointer` at enqueue.** Regex an inbox path (`/home/langston/inbox/...`, `/inbox/`), a repo file path, or a commit SHA out of the inbound and store it on the item, so any future re-feed (or a human reading the queue) is not degraded to the truncated summary. Verification: an enqueue carrying a `/inbox/...md` path or a sha stores it in `item["pointer"]`.

- **OBJ-C — Stop the re-feed loop at BOTH causes.**
  - **C1 (enqueue gate):** tighten `is_review_request()` to require review-REQUEST intent, not a bare mention. Concretely: enqueue only when the message contains an explicit request/ask (imperative "review/sign-off/approve/Step-N please", "requesting your", "ready for review", "please look at") OR a concrete pointer (an `/inbox/` file, a diff, a commit sha). A reply that merely *discusses* a review/verification ("I verified…", "agreed on…", "the proof is…") must NOT enqueue. Stay conservative on the non-enqueue side (a missed enqueue just means the CC re-asks with an explicit verb).
  - **C2 (cap survives inbound):** make the same-id halt independent of the distinct-advance reset. Track same-id re-fires for the CURRENTLY-pending self-advance item in a way that a real inbound does NOT zero (e.g. a per-id re-fire counter persisted on the queue item, or a cap field that inbound resets only the DISTINCT-advance tier of, not the same-id tier). A stuck item must HALT after 2 same-id re-fires regardless of intervening chatter.

## Non-objectives
- Re-enabling `LANGSTON_SELF_ADVANCE=1` is NOT part of this batch's deploy — it is the FOLLOW-UP step once this ships Langston-reviewed (so the re-enable is a deliberate, observed flip, not bundled with the code change).
- No change to the marker grammar, the priority model, or the staleness TTL.

## Verification (Step-8)
- Unit tests (the engine has 56; add cases): C1 — a "verified/agreed/proof" discussion reply does NOT enqueue while an explicit "please review /inbox/x.md" DOES; OBJ-B — pointer extracted; C2 — same-id re-fire halts at 2 even with an interleaved `_cap.reset()`.
- A live shakeout on the bridge (self-advance temporarily re-enabled in a controlled window): a real review → one review, no re-pass; a conversational reply during it → no enqueue, no re-feed; a deliberately-stuck item → HALT at 2 under interleaved inbound.
- Then re-enable `LANGSTON_SELF_ADVANCE=1` as the dated follow-up.

## Files (expected)
- `comms-infra/discord/langston_queue.py` (`is_review_request`/`_REVIEW_INTENT_RE`, a pointer-extractor, `CapTracker`)
- `comms-infra/discord/discord-langston-bridge.py` (real-inbound invocation prompt gets the marker instruction + pointer capture)
- `comms-infra/discord/langston_queue_test.py` (new cases)

## Step-1 refinements (Langston APPROVED with refinements, folded 2026-06-24)

> Langston's Step-1 was APPROVE-with-refinements (RC1→C1 / RC2→C2 / RC3→OBJ-A mapping confirmed clean). Folded below; the two refinements that tension each other are RECONCILED.

- **R1 — OBJ-A must not depend solely on the model emitting the marker (belt-and-suspenders), BUT must not falsely mark a non-review as "reviewed" (reconciliation).** The bridge AUTO-SETTLES the enqueuing-inbound's item whenever that inbound produces ANY Langston response (so it can never stay `ready` → no re-pass), regardless of whether Langston emitted a marker. **However**, because C1 is a heuristic and some non-reviews will pass the gate, the auto-settle STATUS must distinguish a real review from a non-review: an explicit `[[QUEUE id=… status=done|blocked|…]]` marker from Langston is the OVERRIDE (authoritative verdict); absent a marker, the bridge settles the item to a NEW terminal status **`noop`** ("passed the enqueue gate but was not an actual review — nothing rendered"), NOT `done`. This keeps OBJ-A robust to model non-compliance AND never masks a real miss as "reviewed."
- **R2 — amend the non-objective on the marker grammar.** Adding the `noop` (a.k.a. dismissed) terminal status DOES touch the marker/status grammar — so the "no change to marker grammar" non-objective is **amended**: this batch adds the `noop` terminal settle status (and the bridge auto-settle path), nothing else (no priority/TTL change). Per the change-class rule, this is a bounded amendment, still non_architecture.
- **R3 — C1: request-VERB is the PRIMARY gate; a bare pointer is a BOOSTER, not sufficient.** A discussion reply can legitimately mention an `/inbox/` path or a sha while SETTLING a topic ("agreed, the proof's in /inbox/x.md") — pointer-alone must NOT enqueue. Enqueue requires an explicit review-REQUEST verb/imperative; a pointer raises confidence but cannot stand alone. (OBJ-B still extracts the pointer when something DOES enqueue — the two stay decoupled.)
- **R4 — C2: the per-id re-fire counter persisted on the item must be ZEROED on reaching `done` (and `noop`).** Otherwise a topic that legitimately comes back later carries a stale same-id count and could false-halt. Terminal settle clears it.

## Governance (Tier-1 + applicable Tier-2)
- BATCH_CATALOG entry; RUNNING_ISSUES #345 → RESOLVED; SIM "Langston self-advance loop" entry updated (re-enabled state + the cap-survives-inbound + enqueue-gate change); completion report. System Manual N/A (no trading-engine/strategy/math).
