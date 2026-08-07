# B-CREW-STATUS — pre-audit

## Component census (§9.5(a)) — writers / readers / mutators / deleters / schedulers per hop

| Object | Who WRITES | Who READS | Who MUTATES | Who DELETES | Who SCHEDULES |
|---|---|---|---|---|---|
| `/var/log/cc-discord-inbox.jsonl` | both bridges + `cc-send` | wake filters (×4 sessions), §10.5 readers, `langston-recall` indexer, **+ this job (read-only)** | nobody | nobody (append-only) | the bridges, on message |
| Desktop transcripts (laptop) | Claude Code, per session | the app; **+ this job (read-only)** | Claude Code | its 100-yr retention setting | Claude Code |
| Delivery board | the four sessions (`gh`) | sessions + Kyle; **+ this job (read-only)** | sessions | — | manual |
| `system-alerts` queue (staging) | the app + CLI | all sessions, Langston; **+ this job (read-only)** | ack/resolve | — | dispatcher cron |
| Review-branch git | the four sessions | everyone; **+ this job (read-only)** | — | — | sessions |
| **NEW** snapshot archive | this job ONLY | this job + Kyle | this job (append) | the monthly roll-up (compress, never drop) | the laptop task |
| **NEW** pinned Discord message | this job ONLY (create once, then EDIT) | Kyle | this job | nobody | the laptop task |

**Deleters:** the archive roll-up compresses; it does not delete. No existing deleter's scope is
touched. **Schedulers:** exactly one new one (the laptop task). No existing timer is modified.

## State written vs read (§9.5(a-ii)) — the deletion-time question, asked at BUILD time
This batch **removes no writer**, so no reader loses its producer. Everything it consumes is
already produced for other reasons and would continue to be produced if this batch were deleted
tomorrow. The only state it originates is its own archive and its own Discord message — both
inert to every other component. **If this job vanishes, nothing else degrades.** That property is
the point, and it is why the design is read-only-plus-two-private-outputs rather than anything
that participates in the crew's existing flows.

## Blast radius — and the one shared surface
Zero trading-path exposure: no app code, no deploy, no bridge change, no CI, no DB.
The single shared surface is **one Discord message** in `#general`. Risks and mitigations:
- *Edit storm* → the job edits only when content CHANGED, and rate-limits to one edit per cycle.
- *Message lost/deleted* → the job re-creates it and records the new id; it must never assume the
  id it cached still exists (read-back after write, per the board-clobber lesson).
- *Bot token misuse* → uses the existing CC bridge's send path, no new credential.

## Prompt-injection surface (this design's real risk, named)
The job ingests **attacker-influenceable text** — Discord messages and, transitively, anything a
message quotes — and feeds it to a summarising model whose output Kyle then reads as fact.
Mitigations, to be built in, not bolted on:
- The summariser is given the traffic as **quoted evidence to describe**, never as instructions,
  and its output is rendered as **text only** (no links, no markup passthrough) so a crafted
  message cannot render a clickable or formatted element on Kyle's page.
- Its output is **labelled as model-written** and displayed **beside the raw evidence**, so a
  wrong summary is visibly checkable rather than authoritative.
- The exact-derived fields (blocked-state, last-said, commits) never pass through the model.
- Wake-line lesson applied: content is flattened so a crafted message cannot forge a page row.

## What I have NOT verified yet — named, because unverified assumptions bit twice this week
1. **Board read from a scheduled context.** `gh` works interactively in my session; whether the
   scheduled task inherits credentials is untested. If it fails it must render FAILED, not empty.
2. **Transcript parse across four sessions.** Verified for one; the others' files are the same
   format by construction but unread.
3. **Discord message edit** (`PATCH`) — the bridges only ever POST today. The endpoint is standard
   but unexercised here.
4. **Windows Scheduled Task at 60 s** — the existing precedent is a nightly task; sub-minute
   scheduling on Windows has its own quirks and is untested.
Each of these is a first-run failure candidate — **live proof is a step, not a ceremony** (this
week's cost: two runtime bugs that survived code review, and a criterion that was false while I
announced it true).

## Provenance
`STORAGE_POLICY.md` §§1–5.5 (tiers, and the business-vs-operational exception) · `#660` (the cap
projection that rules out a DB table) · `REPO_TOPOLOGY_AND_SYNC_RUNBOOK` (why an out-of-session
watcher, and why compaction kills in-session ones) · Kyle's directive, 2026-08-07.
