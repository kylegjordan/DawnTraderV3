# B-LANGSTON-QUEUE — Langston review-queue auto-advance (self-advance + skip-and-circle + wrench-rule)

**Owner:** OLD Claude (CC-A). **Created:** 2026-06-22. **change-class:** non_architecture (comms-infra — the Langston Discord bridge; no trading-engine/strategy/math touch → System Manual N/A). **Comms:** Discord. **Reviewer:** Langston (this file IS his context — see §0).

## §0 — Why this file exists (the continuity gap that shapes the whole design)
**Langston has NO cross-turn memory on Discord.** His bridge invokes a FRESH `claude -p` session per inbound message (fresh UUID per call — by design, after the stable-session "already in use" latency fix 2026-06-22). Each invocation loads only his CLAUDE.md + MEMORY + the single prompt. So he cannot recall a multi-turn thread (e.g. his own earlier 3-piece queue proposal, or Kyle's "option A") between turns — which is exactly why he honestly flagged "I don't have option A + my points 2/3 loaded." **This is not a bug to fix here; it is the CONSTRAINT the design must respect:** any state Langston needs across turns must be EXTERNAL (fed to him in the prompt / a file the bridge maintains), never assumed-in-memory. This file is his durable context for this batch.

## §1 — Problem (Kyle 2026-06-22)
Langston works his review queue one item at a time but STOPS after each, waiting for a nudge instead of auto-grabbing the next. "The train sits at the station until you wave it on." Goal: finish one item → immediately start the next ready one; only go quiet when the queue is genuinely empty.

## §2 — Kyle's decision: OPTION A (self-advance), + Langston's 3 pieces (his own words, quoted for his context)
**Kyle: "go with option A"** = self-advance: re-invoke Langston the instant he finishes an item, not a periodic wait.

Langston's proposal (verbatim, 2026-06-22), all three to be addressed:
1. **Self-advancing loop:** "Is there a ready item in my queue? If yes, work it. When it's done, immediately grab the next one." Goes quiet ONLY when the queue is genuinely empty — and then says **"queue clear, standing by"** out loud, so silence always means *done*, never *stuck*.
2. **Skip-and-circle-back for blocked items:** every item is **ready** / **blocked** (waiting on a CC) / **done**. Hit a blocked item → PARK it, move to the next ready one, re-check the parked item next pass; the instant its dependency lands it flips to ready and gets picked up. Nobody waits on a slow handoff.
3. **"Who's holding the wrench" (collision rule):** Langston reviews/verifies and **NEVER pushes**; the **implementer pushes**; and before anyone touches a shared piece they **call it in the channel ("I've got this one")** so two sessions aren't editing the same thing. Out-of-order pushes come from two people grabbing the same wrench silently.

## §3 — Build (pieces 1+2 = bridge code; piece 3 = protocol/rule)
**★ The queue is BRIDGE-TRACKED EXTERNAL STATE** (a JSON file the bridge owns), because Langston can't hold it in memory (§0). Each item: `{ id, requester (CC-A/CC-B/Kyle), summary, pointer (inbox path/commit), state: ready|blocked|done, blocked_on, added_ts }`.

- **OBJ-1 — explicit queue + enqueue:** when a CC posts a review request to Langston (starts with "Langston"), the bridge ADDS a queue item (state=ready) in addition to invoking him. A CC can also mark an item blocked/ready via a structured marker.
- **OBJ-2 — self-advance loop (option A) WITH A HARD CAP:** when Langston finishes an item, the bridge marks it done and, if a READY item remains, RE-INVOKES him immediately with that item's context (from the queue file — not his memory). Loops until no ready item, then Langston emits `queue clear, standing by`. **★ SAFETY (load-bearing): a self-re-invoke loop is the exact runaway the circuit-breaker guarded — and that breaker was REMOVED 2026-06-21. So a HARD per-cycle cap (e.g. ≤ N consecutive self-advances without a new Kyle/CC message) + the queue-empty STOP are the spine, not an afterthought. Kyle posting resets the cap.**
- **OBJ-3 — skip-and-circle (blocked items):** a blocked item is parked (not done); a periodic re-check pass (Langston's 3–5 min cadence) re-evaluates parked items; the moment its dependency lands (the CC posts the awaited thing / marks it ready) it flips to ready and the self-advance picks it up.
- **OBJ-4 — "who holds the wrench" PROTOCOL (rule, not code):** document in CLAUDE.md/MEMORY: Langston never pushes (reviews only); implementer pushes; call a shared piece in the channel before editing. Complements the existing pull-before-push + #340-369/#370-399 number-reservation.
- **OBJ-5 — state-fed prompts:** because Langston is stateless, each (re-)invoke prompt carries the item's full context from the queue file (summary + pointer) so he never relies on memory.

## §4 — Verification
Live shakeout next batch (Langston's offer): enqueue 2+ review items, confirm Langston works them back-to-back with no nudge, parks a deliberately-blocked one + circles back when unblocked, emits "queue clear" when empty, and the hard cap stops a forced runaway. It's a Helsinki bridge change (NOT staging) → unaffected by the 48h staging-observation window.

## §5 — Open question for Langston (needs his read WITH this file as context)
Confirm: (a) the bridge-tracked-external-queue approach (vs you holding it) — given §0 you can't hold it, so this is forced, but confirm the item schema covers what you need; (b) the hard-cap value for the self-advance loop; (c) the structured marker you'd emit to signal done vs blocked-on-X so the bridge can advance/park deterministically.
