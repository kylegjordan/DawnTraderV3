# B-CREW-ACCESS-HARDEN — Codex-shift reviewer mode

**Workflow:** Step 9 iteration · live Helsinki instruction correction · exact-ref review required

## Defect reproduced

The repository `AGENTS.md` assigns Coltrane every Langston review gate while crew mode is
CODEX, but both instruction surfaces loaded by a live Coltrane invocation said routine reviews
always belong to Langston. On 2026-10-15 Coltrane therefore refused the same routine Step 1
review twice while `crew-switch status` reported CODEX and Langston was off duty. The live
instruction file and bot source were byte-identical to their repository sources, so this was a
source defect rather than installation drift.

## Correction

- `comms-infra/codex/AGENTS.md` now makes Coltrane the complete workflow reviewer only in
  CODEX mode, keeps his advisor-only role in CLAUDE mode, fails closed when mode is unknown,
  and names all four Claude/Codex session pairs.
- `comms-infra/codex/coltrane-bot.py` reads the root-owned live crew-switch state for every
  invocation and places the resulting CODEX, CLAUDE or UNKNOWN role at the top of the trusted
  prompt. The static prompt no longer contradicts the selected role. It reads the mode again
  immediately before posting and discards the generated response if the crew changed while the
  review was running.
- `comms-infra/codex/test_coltrane_bot_mode.py` drives the production selector with CODEX,
  CLAUDE, missing, malformed and unsupported state. It requires full routine review assignment
  only for CODEX and refusal for every unknown state.
- CI runs that selector test with the existing access-hardening checks.

## Exact-ref review question

Verify that no caller-supplied Discord text selects the reviewer role, CODEX assigns every
routine workflow review to Coltrane, CLAUDE preserves Langston's ownership, and an unreadable or
unsupported state cannot silently authorize either reviewer.

## Installation and live proof gate

After exact-ref approval and green CI, install the reviewed instruction file and bot source with
their existing owners and modes, prove byte equality to the reviewed blobs, and restart only the
Coltrane bot. Require the bot active with a new process start time. Then run the production role
selector against three controlled copies of crew state and require CODEX → Coltrane reviewer,
CLAUDE → Langston reviewer, and invalid → refusal. Finally, with the real state still CODEX,
re-send the waiting routine Step 1 request and require Coltrane to accept the review rather than
repeat the prior refusal.

The production crew-switch state is read-only throughout; no mode switch is performed for this
proof. The Coltrane repository refresh timer remains held only until the exact-ref reviews finish.

REVIEWER: claim-only · verify Codex-shift-only authority and fail-closed mode selection · pending
