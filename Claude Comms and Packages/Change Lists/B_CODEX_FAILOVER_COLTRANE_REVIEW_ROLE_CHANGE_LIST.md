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
- Re-read the trusted mode and its root-owned monotonic generation immediately before publication.
  Discard the generated answer if either differs, so even a Codex-to-Claude-to-Codex round trip
  during one invocation cannot publish work from the earlier shift.
- Advance the generation only when `crew-switch` actually changes the whole-crew mode. Repeated
  same-mode commands, individual-session changes and Langston-only changes leave it unchanged.
- Name both the Claude and Codex actors in Coltrane's routing table so the temporary crew has the
  same addressable roles instead of inheriting Claude-only labels.
- Preserve every evidence, independence, sandbox, review-ref and communication rule. The correction
  changes only which reviewer owns the normal gates during the already-authorized Codex shift.

## Required proof

1. Offline mutation matrix across both invocation modules: exact `codex` and case/whitespace
   variants select the temporary reviewer role; `claude` selects advisor-only; missing, malformed,
   unsupported and deterministically unreadable states select `UNKNOWN` and refuse routine review.
2. Transition mutations start in `CODEX` and prove both `CODEX` to `CLAUDE` and
   `CODEX` to `CLAUDE` to `CODEX` reject the generated response before publication in both modules;
   a same-mode, same-generation control preserves it.
3. The `crew-switch` suite proves the generation advances on each real whole-crew transition and
   remains unchanged for repeated same-mode, individual-session and Langston-only commands.
4. After review, initialize the root-owned live record's generation without changing mode, install
   exact reviewed bytes for `crew-switch` and both Coltrane invocation paths, then prove their bytes.
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

That bootstrap installed the first candidate and made normal review available. This follow-up does
not need another bootstrap: the generation correction remains source-only until Coltrane approves
the exact ref, after which source, root-owned state initialization and live files are installed as
one reviewed change.

## Pre-review evidence

- The six-method reviewer-role suite passes against both corrected invocation modules.
- The same suite against the prior candidate fails (seven assertions and two execution errors), so
  the added checks discriminate the old mode-only implementation from the generation-bound one.
- The 46-check `crew-switch` suite passes on Linux, including real-transition increments and the
  three reviewer-neutral controls. Python compilation passes for all four changed Python modules.
- No live source, service or root-owned state has been changed by this follow-up.

## Boundaries

This does not turn Coltrane into a permanent second reviewer, turn Langston on during a Codex shift,
change crew membership, relax any review gate, or change DawnTrader runtime code. The live crew mode
remains owned exclusively by `crew-switch`; the reviewer reads it but cannot alter it.

REVIEWER: verify the Codex-only exception, the fail-closed non-Codex states, the per-invocation read,
and that no sender-controlled input can select the reviewer role.
