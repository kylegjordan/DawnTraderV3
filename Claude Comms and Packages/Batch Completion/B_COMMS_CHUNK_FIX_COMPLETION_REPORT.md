# B-COMMS-CHUNK-FIX — COMPLETION REPORT (#553)

> **Owner:** Claude Analyst (CC-C). **Reviewer:** Langston — **APPROVED as-is, sign-off given 2026-07-22**, verified against the LIVE `/opt/discord-bridges/` sources, not the paste.
> **change-class: non_architecture** (comms infra — no tsc/vitest/CI gate applies).
> ⚠️ **CORRECTED (see §8b):** the pre-audit said "Helsinki infra, NOT the repo." **Wrong.** The bridge sources are **repo-canonical at `comms-infra/discord/`** and pushed to Helsinki by `deploy.sh`. Deploy is therefore `scp` + `systemctl restart` **AND the repo copy must be updated**, or the next deploy silently reverts the fix. Both files are now ported and byte-identical repo↔Helsinki.
> **Docs:** pre-audit `af4cf6f87` · change list `1d7c6d3e6` · adoption `c604e4f10`. **Backups:** `/opt/discord-bridges/*.pre-chunkfix-20260722-103410`, `*.pre-findingA-*`, `*.pre-findingB-*`.

## 1. OBJECTIVES — ALL YES

| # | Objective | Result |
|---|---|---|
| 1 | Stop >2000-char Langston dispatches being silently half-delivered | **YES** — reassembled into ONE task before the address gate |
| 2 | Fix the adjacent notify-mention defect found in pre-audit | **YES** — same batch, per Langston ruling |
| 3 | Leave all other traffic byte-identical | **YES** — by construction, not by runtime check |
| 4 | Adoption with zero burden on other senders | **YES** — proven in production (below) |

## 2. ROOT CAUSE — three verified code facts (Langston re-verified each independently)

1. `discord_common.py::_send_chunks` splits at `MSG_LIMIT = 2000` **chars** and posts each chunk as its **own Discord message**.
2. `first_id` is captured in-loop and returned once — **structurally sender-log-only; it never reaches the wire**, so the receiver has no group key. (This killed the originally-proposed "group by shared `first_id`" fix; the pre-audit caught it before any code was written.)
3. `discord-langston-bridge.py::on_message` applies the anchored `ADDRESS_START_RE` gate **pre-enqueue**. Only chunk 0 carries the leading "Langston" ⇒ **chunks 2..N were discarded before ever becoming tasks.**

**★ ADJACENT DEFECT (found in pre-audit, worse than the reported one):** `_send_chunks` prepended the `--notify` mention as `<@id> `, and `<` is not in the gate's allowed leading class ⇒ **a notify-flagged dispatch to Langston was dropped ENTIRELY — not truncated — and he would never know it existed.** Latent only because `--notify` had been used for Kyle-facing posts.

## 3. WHAT SHIPPED

- **Send** (`discord_common.py`): group marker stamped on every chunk of a multi-chunk **Langston-addressed** dispatch; mention applied **after** the address token; `split_on_whitespace()` so cuts land only on whitespace.
- **Receive** (`discord-langston-bridge.py`): buffer by group id, reassemble into ONE task **above** the gate (Langston's load-bearing ordering requirement); incomplete groups flush with an explicit `[INCOMPLETE CHUNK GROUP …]` note — never a silent hold.

## 4. LANGSTON'S TWO FINDINGS — BOTH FIXED IN-BATCH (neither deferred)

**Finding A — the timeout measured group AGE, not SILENCE.** A group stretched past 10s by 429 backoff or chunk count could be swept as INCOMPLETE *while its own chunks were still arriving*, fragmenting one dispatch into two provisional invokes. He offered a deferral; **I took the fix-on-find path (rule 23: deferral is what you argue FOR)** — one line, in a file I already held, in an open batch. `_e['t0']` now refreshes on every received part.

**Finding B — reassembly was not byte-faithful on newlines.** I first accepted this as cosmetic. **CC-A and CC-B both escalated it independently, and they were right:** `path:line` refs are the evidence currency across all four parties, and a mid-token cut **does not throw** — it yields a different, still-plausible coordinate, so the reader verifies against the wrong line and concludes a TRUE claim is FALSE. That is the false-absence class arriving through the transport. **Fixed** via CC-B's suggested mitigation: never cut inside a non-whitespace run.
> **Full byte-fidelity was considered and REJECTED, deliberately:** it requires slices that begin/end with whitespace, and Discord normalises leading/trailing whitespace on send — a "byte-exact" scheme would have been *silently wrong*. Whitespace-only cutting is robust to that and protects what actually matters.

## 5. VERIFICATION

- **Send-side unit tests, 4 cases:** non-Langston long → byte-identical, no marker; Langston long → all marked, max 1971 with marker, chunk 0 still gates; §2 notify case → now passes (pre-fix: total drop); non-Langston + mention → unchanged.
- **Token integrity across 60 boundary offsets — ALL PASS.** No piece begins or ends with whitespace (so Discord's own trimming can't bite). An unbreakable >1952-char run stays **lossless** and now **logs a warning** instead of corrupting quietly.
- **Live, four reassemblies:** synthetic 3,109-char with the proof token deliberately in the FINAL chunk; a 4,165-char seam-straddling test with `path:line` refs planted AT the seam (both intact, reassembled to 4,165 exactly); **and two genuine unplanned production cases — CC-B's 2,219-char and CC-A's 2,134-char dispatches, reassembled with zero change on either sender's part.**
- **Langston's own end-to-end confirmation:** *"REASSEMBLY-CONFIRMED TOKEN=QX7-BRIDGE-9F2 — received 3112 characters across all chunks, final chunk included… Fix verified end to end."*

## 6. ★ PROCESS FINDING — recorded as debt, not softened

**The deploy preceded Langston's Step-4 review.** He signed off on the inversion because the conditions justified it: `non_architecture` with Helsinki edit-and-restart as the only deploy gate (no CI/staging bench — the running bridge *is* the test surface); the defect was actively corrupting the review channel itself; revert is ~10 seconds; send-side unit tests ran pre-deploy so it wasn't blind. **His words, kept verbatim: this is "an exception earned by change-class + active-corruption + high reversibility, NOT a precedent that `non_architecture` skips the gate."** Had he found a blocker it would have been live-corrupting until caught.

## 7. ★ CORRECTION TO MY OWN CLAIM (stated publicly, not quietly fixed)

I told Kyle and the crew the adoption step was "retire the under-2000 workaround from CLAUDE.md §6.5 and the per-session MEMORY files." **When I went to do it, that rule was not in CLAUDE.md and not in either other session's memory file — it existed in exactly one place: my own.** The other two were following an in-channel practice, not a written rule. So the adoption step became an **addition**, not a retirement. CC-A independently verified the landed text and confirmed the correction.

**What §6.5 actually said** was file-first for anything large or multi-turn, justified by Langston's **statelessness** — which is untouched and still binds: he still cannot recall his own prior turn, so multi-turn context still goes in the prompt or a staged file regardless of length. **Only the LENGTH motivation is dead**, and the text now distinguishes the two.

## 8. GOVERNANCE FILES CHANGED

`CLAUDE.md` §6.5 (new capability + its narrow scope) · `1-system-manual/RUNNING_ISSUES.md` (#553, #554) · `1-system-manual/CREW_COORDINATION_AND_COMMS_PROPOSAL_2026-07-20.md` (Part 3/4) · `1-system-manual/BATCH_CATALOG.md` · `1-system-manual/PHASE_HISTORY.md` · `.claude/cc-session-roster.json` (my stale read-only role note) · `.claude/memory/MEMORY_CC_C.md` + truth copy · this report.

## 8b. ★ CORRECTION TO §8 — AND A REAL DEFECT THE CHECK EXPOSED

**§8's governance list was written from intent, not from what had landed.** When I went to verify it, SIM / CHANGES_AND_FIXES / BATCH_CATALOG had NOT been edited — I had listed them as done. Caught by re-reading my own claim against the repo; corrected in the same turn.

**★ The SIM read then exposed a genuine defect in this batch:** SIM records the bridge sources as **repo-canonical at `comms-infra/discord/`**, pushed to Helsinki by `deploy.sh`. **My pre-audit asserted "Helsinki comms infra, NOT the repo" — that was WRONG, and Langston's sign-off rested on it.** The fix existed only on the deployed copy, so **the next `deploy.sh` would have silently reverted it.** Verified before porting: `discord-cc-bridge.py` was already byte-identical repo↔Helsinki (proving the repo IS maintained and my two files were the outliers); the diff on the other two contained **no foreign drift** — the only repo-side line absent on Helsinki was the exact mention-prepend my §2 fix replaced. Both files ported down and re-verified byte-identical. **Lesson for the class: "infra, not the app repo" is not the same as "not in the repo" — check for a source-of-truth copy before treating a live edit as the deploy.**

**SYSTEM_MANUAL:** not applicable (no architecture/strategy/regime/filter/signal-pipeline/math change). **SIM:** the Discord Comms Fabric entry gets the reassembly path — judged applicable and carried.

## 9. RESIDUAL — flagged, not buried

Langston's **own** long replies still chunk in the channel view (they lead with "OLD Claude —"/"Kyle —", so they take the untouched path). Assessed **cosmetic**: `append_inbox` writes his full text as ONE `langston_outbound` row and the CC sessions read the log, so no CC loses content — only the human Discord view splits. Langston then **independently VERIFIED it at code level** rather than accepting the assessment: `discord-langston-bridge.py:425` logs `text=cleaned` — the full reply — as ONE `langston_outbound` row, **independent of how `rest_send` chunks it for the wire**. So the claim is verified, not asserted. If that judgement is ever wrong, it becomes its own issue rather than a late add here.
