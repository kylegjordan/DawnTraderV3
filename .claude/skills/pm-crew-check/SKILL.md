---
name: pm-crew-check
description: ONLY for a PM routine crew sweep that establishes each owner's real batch, step, movement, waits, stalls and drift from current evidence. NOT for technical review, implementation work, slotting or a crew transition.
---

# PM crew check

Use this for the scheduled sweep and whenever Kyle asks what the crew is doing. The outcome is a sourced classification for every building owner, an updated record, and only the coordination that is actually needed.

## Read in this order

1. Run `crew-switch status`. If this PM is off duty or an outgoing order is open, follow the applicable transition skill and do no crew management.
2. Read `MEMORY_PM.md` CURRENT POSITION, the active handover sheet, and any active usage-stop record.
3. Fetch the shared branch. For each owner, read the latest relevant commit, branch, ahead/behind state, tracked dirt and unpushed work. Do not treat a commit in another clone as that owner's progress until its batch and author are established.
4. Read every owner's POSITION block. Compare its batch, workflow step, next action and waits with the commits.
5. Read the current turn in each existing building chat. Claude PM starts or messages the four existing Claude chats through the Claude app. Codex PM reads and messages only the four DawnTrader building chats authorized in `AGENTS.md`; never inspect Command Center chats. In either app, queued or accepted delivery is not receipt.
6. Read recent Discord posts and reviewer replies, then the due-alert queue. Route each new ruling or alert to its owner; do not silence an event-waiting alert merely to clear the queue.
7. Read `OPEN_BATCH_REGISTER.md`, unresolved `DECISIONS.md` rows, the applicable sprint or pre-sprint rows, and the batch intent or scope. Run `scripts/pm/reconcile-decisions.mjs` before reporting status.

## Classify what the evidence shows

- **Moving** means a visible commit, test, review request, observation, reply or recorded step-boundary advance consistent with the current step.
- **Legitimately waiting** names the exact party or gate: Kyle, reviewer, CI, timed observation, another owner or an explicit deploy window. Waiting on Kyle is reported to Kyle and is never nudged.
- **Stalled** means the owner is on duty, has an eligible next action, is not at a legitimate wait, and has made no visible progress beyond the normal duration of that action.
- **Drifted or off track** means the chat, commit or POSITION conflicts with the agreed batch intent, plan order, decision, handover, or recorded return point. The PM identifies the conflict; the owner and reviewer decide the technical correction.
- **Unknown** is valid when a source is stale, missing or contradictory. Name the missing read instead of guessing.

## Record and act

Append one UTC row per owner to `1-system-manual/pm/SESSION_LOG.md`, naming the sources read. Put a genuine stall or drift in `STALL_AND_DRIFT_LOG.md`. Use `pm-nudge` only after that classification. Update `OPEN_BATCH_REGISTER.md` when the authoritative batch or step changed.

Claude PM can start a turn in an existing, non-archived Claude session while the Claude app is open. Codex PM can directly message the existing Codex chats under KD-66. Both wait for a visible reply or resulting progress before claiming receipt. Neither PM performs the owner's work or settles its technical question.
