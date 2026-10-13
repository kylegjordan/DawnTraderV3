# B-CODEX-FAILOVER — PRE-IMPLEMENTATION AUDIT (RETROACTIVE — written at Step 10, 2026-10-13)

change-class: non_architecture

> ⛔ **THIS AUDIT DID NOT GATE THE IMPLEMENTATION AND MUST NEVER BE CITED AS THOUGH IT DID.** Kyle directed the failover to be stood up immediately when his weekly Claude allowance reached 87%. This document reconstructs the audit that should have preceded the work, under the `#1005` precedent accepted by Langston at Step 4.

## 1. Intended change

Add a temporary Codex crew that works in the existing four Claude folders, carries its own canonical actor identities, uses Coltrane as reviewer while Langston is off, and changes shifts through a durable handover order with confirmation and escalation.

## 2. Surfaces that should have been audited before implementation

| surface | pre-implementation question | landed answer |
|---|---|---|
| identity | Can alerts and deploys attribute every Codex session and Coltrane without free text? | `ALERT_ACTORS` is the source; four Codex actors plus Coltrane and both-order aliases were added, and deploy parity remains derived from it. |
| workspace ownership | Can a Codex stand-in work without creating a competing checkout? | `AGENTS.md` binds each stand-in to its counterpart's existing folder and bans worktrees. |
| review separation | Can the reviewer read a pushed ref without gaining a write path? | Coltrane uses the existing read-only Helsinki mirror and is engaged only when a post starts with his name. |
| shift authority | Can one Kyle-authored line change duty without an agent interpreting prose? | `crew-switch` accepts a fixed command grammar and only Kyle's Discord identity. |
| handover durability | Can a switch finish without every outgoing session parking and confirming? | Orders persist in one state file; missing outgoing receipts are re-sent and escalated; late incoming receipts are recorded but never hold completion. |
| reviewer shutdown | Does “Langston off” mean both stopped and unable to restart? | The switch reads back both inactive and disabled; either mismatch is a failure. |
| failure isolation | Can a failed post or service action silently abort the rest of a switch? | Posts are attempted independently, command failures are retained, and Kyle is told when the final state is not the requested state. |

## 3. Blast radius

**Low for trading behaviour, high for crew coordination.** No strategy, pricing, filter, signal, order, schema, retention or trading-setting path changed. The code changes are the actor registry, deployment actor parity, instruction surface and Helsinki crew-switch tooling. A coordination failure can leave the wrong session or reviewer on duty, so the switch is fail-loud and its live state is directly readable.

## 4. Controls reconstructed after the fact

- The actor parity test proves the deployment allowlist is derived from the alert actor registry rather than copied by hand.
- The Helsinki suite runs with a fake sender and fake service name; it refuses to start if either fake is absent, after an earlier fixture mistake touched the live reviewer service.
- The final suite is 41 passed, 0 failed; the late-incoming regression fails when the completed-history predicate is inverted.
- The reviewed shared ref `25d7bcf2e9a546730ba994c93a2bea4271bc9ff4` passed all four CI jobs individually.
- The installed `crew-switch` bytes matched that ref, and switch S1 accepted one late incoming receipt, kept the order closed, and emitted no duplicate on a reverse-order alias.

## 5. What a real Step 2 would have caught earlier

1. The first design closed an order on the final outgoing handover but still instructed the incoming session to confirm; Coltrane caught that contradiction at Step 8.
2. A test fixture initially named the live reviewer service; an explicit fake-service assertion now makes that class impossible to repeat inside the suite.
3. The first scope left Codex automation gaps as prose; Step 10 gives them a real follow-up home instead of treating manual substitutes as finished automation.

## 6. Residuals and homes

- **Codex automation gaps** — automatic wake/alert delivery, hook-equivalent guards, reviewer-command wake noise and board identity options: `B-CODEX-FAILOVER-AUTOMATION`, issue `#731`, sprint row `1z`, after row `1y`.
- **Push guard false refusal from a subfolder:** existing `B-TSC-GUARD-CWD`, issue `#926`, Phase-19 tail.
- **Tracked generated file rewritten after start:** existing `B-CANONICAL-CORPUS-ACCURACY`, issue `#733`, Phase-19 row `3n.e`; the separate untracked CSAV reports remain evidence for that batch's first census rather than an inferred cause here.
- **Single overwritten deployment record:** existing provenance class `#1004`, placed at `P19-B12`; this batch does not enlarge the deployment-history contract.

## 7. Retrospective verdict

The shipped design is fit for the first failover shift and verified on the real switch. The audit is documentation of the actual boundary and lessons, not evidence that the missing Step 2 protected the implementation.
