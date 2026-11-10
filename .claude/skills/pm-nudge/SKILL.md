---
name: pm-nudge
description: ONLY for waking or chasing a stalled building owner or reviewer after a sourced crew check. NOT for routine status requests, sessions waiting on Kyle, technical instructions or more than one nudge per stall per hour.
---

# PM nudge

Use a nudge to restore movement, not to substitute for the owner. Read the latest chat, commit, POSITION, Discord reply and `STALL_AND_DRIFT_LOG.md` first.

## Limits

- Never nudge an owner waiting on Kyle. Tell Kyle the owner and exact action needed.
- Send at most one nudge for the same stall in one hour.
- After two nudges with no visible movement, tell Kyle in one line and send no third nudge until the condition changes.
- A queued, delivered or accepted message is not proof of receipt. Receipt is the visible reply or resulting progress.
- Do not prescribe a technical answer. State the evidence, the coordination item and the recorded batch and step to resume.

## Building-owner wording

For Codex, the first line is exactly:

`PM PRIORITY — HANDLE THEN RESUME`

Then write: `<identity> — <UTC evidence of the stall or routed item>. Address <coordination item>, report the result, then resume <batch> <step>. PM HOLD` only when the PM is explicitly ordering a hold under existing authority.

The Codex owner replies `PM PRIORITY RECEIVED — <identity>` and later `PM PRIORITY CLEARED — <identity>: <result>`. The work cannot pre-empt a tool call already executing.

For Claude, start or message the existing session with:

`PM CHECK — <UTC evidence>. Please address <coordination item>, report the result, then resume <batch> <step>.`

This works only while that existing, non-archived Claude session is available to the Claude app. If it is not, tell Kyle which one chat to open. A message arriving during a turn waits for the safe boundary there too.

## Reviewer wording

A Discord chase starts with the reviewer's exact wake name, then gives the original requester, ref, request time and question. Ask whether the review is received and when it will be ruled. Do not restate the evidence as a new review claim. During a Codex shift Coltrane owns review; during a Claude shift Langston does.

## Log and escalation

Append this row to `STALL_AND_DRIFT_LOG.md` and cite it from the session log:

`| <UTC> | <owner/reviewer> | <stall-id> | <evidence and source> | nudge <1 or 2> | <message destination/id> | pending |`

When movement appears, update the result with its source and UTC time. After two unanswered nudges, tell Kyle only: `<owner> has not moved after two nudges; please <exact action>.`
