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

## Candidate proof — `e43a23ed0a6232e1bb9aeb067d87c15c9f08c69c`

- CI run `38710215736`: Test Suite, TypeScript Check, Build and Docker Build each passed.
- The installed instruction, live bot, dormant fallback and `crew-switch` command matched the
  candidate's Git blobs byte-for-byte. SHA-256 respectively:
  `1caffbb08c296ae7582ff32042a061716f79f1bb63a0a9dfc13e52f66ecd4d63`,
  `3b96d4855cdc7bf6a8c8bad0e837aa7995e511c49bbe92460e201e1fe04db4de`,
  `d380a691a24c0ebaa88b0201893725df5c4ad3e98c520fd943eed2bbe4773df8`, and
  `e7aec0e79302cd0a50e8e2169a970b916ebecb55212307ad712a2c51885db309`.
- The locked live-state migration added only `mode_generation: 0`; mode remained `codex`, the
  order sequence remained 1, every duty/order/history value was unchanged, and the live state was
  byte-identical before and after the isolated role probes.
- The exact installed `crew-switch` source passed 46 of 46 tests. Controls prove generation 0 -> 1
  on the first whole-crew change, remains 1 on a repeated same-mode command, advances to 2 on the
  return change, and remains 2 through Langston-only and per-session changes.
- Both exact installed invocation modules returned reviewer authority for live `CODEX#0`, advisor
  authority for isolated `CLAUDE#1`, and explicit `UNKNOWN` refusal under deterministic
  `PermissionError`. Both preserved the generated response at the same generation, discarded it
  after direct `CODEX#0 -> CLAUDE#1`, and discarded it after the ABA
  `CODEX#0 -> CLAUDE#1 -> CODEX#2` boundary even though the final mode matched the starting mode.
- The live bot was restarted successfully and read back active. The pre-change files and state are
  recoverable at `/root/coltrane-role-before-e43a23ed0`.
