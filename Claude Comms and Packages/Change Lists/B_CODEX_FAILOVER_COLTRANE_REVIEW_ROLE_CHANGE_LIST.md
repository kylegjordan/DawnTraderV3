# B-CODEX-FAILOVER — Coltrane Codex-shift reviewer-role correction

## Defect

`B-CODEX-FAILOVER` made Coltrane the reviewer while the crew is in Codex mode, and the
repository `AGENTS.md`, System Impact Map, System Manual and completion record all say so.
Coltrane's own authoritative instructions and both invocation paths still said routine reviews
always belong to Langston. On 2026-10-15 this made Coltrane refuse the
`B-ENTRY-CONSUMPTION-FRESHNESS` Step 1 review twice while `crew-switch status` reported Codex mode,
all four Codex sessions on duty and the Langston bridge inactive.

## Correction

- Add a narrowly bounded exception to Coltrane's authoritative instructions: when the live
  invocation proves crew mode `CODEX`, Coltrane replaces Langston for the normal review gates.
- Read `/var/lib/crew-switch/state.json` for every invocation in both the live Discord bot and the
  dormant log-tail fallback, rather than inferring the mode from the sender or a stale startup.
- Keep the existing advisor-only role for proven `CLAUDE`; fail closed with an explicit refusal
  when the state is missing, unreadable, malformed or unsupported.
- Re-read the trusted mode immediately before publication and discard the generated answer if the
  crew mode or its root-owned generation changed while Coltrane was working, so a review cannot
  cross a `CODEX -> CLAUDE -> CODEX` boundary and still look current.
- Have `crew-switch` advance that generation only on an actual whole-crew mode change. Repeating
  the current mode, changing Langston alone, or changing an individual session preserves it.
- Name both the Claude and Codex actors in Coltrane's routing table so the temporary crew has the
  same addressable roles instead of inheriting Claude-only labels.
- Preserve every evidence, independence, sandbox, review-ref and communication rule. The correction
  changes only which reviewer owns the normal gates during the already-authorized Codex shift.

## Required proof

1. Offline mutation matrix across both invocation modules: exact `codex` and case/whitespace
   variants select the temporary reviewer role; `claude` selects advisor-only; missing, malformed,
   unsupported and deterministically unreadable states select `UNKNOWN` and refuse routine review.
2. Publication-boundary mutations prove a same-generation response is preserved, a direct
   `CODEX -> CLAUDE` change is rejected, and a `CODEX -> CLAUDE -> CODEX` change is still rejected
   by its later generation in both invocation modules.
3. The `crew-switch` suite proves the generation advances on actual whole-crew mode changes and is
   stable across repeated same-mode commands, Langston-only changes and per-session changes.
4. Exact-byte installation of the reviewed source into Coltrane's home, both invocation paths and
   the root-owned `crew-switch` command, with a locked migration of the live state to generation 0.
5. A live Codex-mode invocation accepts and completes the queued routine Step 1 review.
6. A non-live state-file mutation demonstrates that `claude` produces the advisor-only prompt and
   an unreadable state produces an explicit `UNKNOWN` refusal, without changing the actual crew state.

## Bootstrap order

The normal review-before-install order cannot operate for this correction because the defect is the
instruction that makes Coltrane refuse the review. Kyle directly authorized Coltrane's routine
Codex-shift review role in the active session. The correction therefore uses this narrow bootstrap:
push one exact candidate, install only its Coltrane instruction and invocation files, prove their
bytes and fail-closed role matrix, then ask Coltrane to review that same exact candidate before any
other use. Any correction he requires is applied to source and live together before the queued batch
review resumes. DawnTrader runtime and staging are untouched.

## Boundaries

This does not turn Coltrane into a permanent second reviewer, turn Langston on during a Codex shift,
change crew membership, relax any review gate, or change DawnTrader runtime code. The live crew mode
remains owned exclusively by `crew-switch`; the reviewer reads it but cannot alter it.

REVIEWER: verify the Codex-only exception, the fail-closed non-Codex states, the per-invocation read,
and that no sender-controlled input can select the reviewer role.
