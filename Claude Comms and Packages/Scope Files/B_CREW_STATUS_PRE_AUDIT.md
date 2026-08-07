# B-CREW-STATUS — pre-audit

> **Revised in body after Langston's Step-2 review (invocation #13).** R1 was a real census
> defect; the measurements he demanded are now in, and they changed the design rather than
> decorating it.

## Component census (§9.5(a)) — writers / readers / mutators / deleters / schedulers

| Object | Who WRITES | Who READS | Who MUTATES | Who DELETES | Who SCHEDULES |
|---|---|---|---|---|---|
| `/var/log/cc-discord-inbox.jsonl` | both bridges + `cc-send` | wake filters (×4), §10.5 readers, `langston-recall` indexer, **+ this job (read-only)** | nobody | **nobody — MEASURED, not asserted:** no logrotate stanza names it; 21 MB, no rotated siblings (2026-08-07). *No rotation configured ≠ guaranteed never* → the reader handles a shrunk file and says so. | the bridges, on message |
| Desktop transcripts (laptop) | Claude Code, per session | the app; **+ this job (read-only)** | Claude Code; **★ compaction REWRITES the file** | 100-yr retention setting | Claude Code |
| Delivery board | the four sessions (`gh`) | sessions + Kyle; **+ this job (read-only)** | sessions — **overwrites in place, NO history** | — | manual |
| `system-alerts` queue | app + CLI | all sessions, Langston; **+ this job (read-only)** | ack/resolve — **mutate in place, NO history** | — | dispatcher cron |
| Review-branch git | the four sessions | everyone; **+ this job (read-only)** | — | — | sessions |
| **NEW** snapshot archive | this job ONLY | this job + Kyle | this job (append) | roll-up compresses; **never drops** | the laptop task |
| **NEW** status Discord message | this job ONLY (create once, then edit) | **★ SEE R1 BELOW — not just Kyle** | this job | nobody | the laptop task |

★ The two **mutate-in-place, no-history** rows are why the archive is business data (scope §4):
they make these snapshots the only time-series of board and alert state. **My original scope
argued the opposite, and the refutation was sitting in my own table.**

## R1 (Langston) — the status message's READER column was wrong, and the miss was load-bearing
I listed the readers as "Kyle." The Discord inbound machinery also reads `#general`, and the
status content will *routinely* contain the words "Langston", "OLD Claude", "NEW Claude" — that is
what a blocked flag and a last-said field are made of. Three failure paths he named: invoking
Langston every edit cycle; **the job's own output becoming the job's own input**, so the
waiting-on-Langston derivation false-positives on the status message itself; and a status row
quoting a wake-formatted line reaching the wake filters (the forged-wake-line class, one hop out).

**MEASURED 2026-08-07, all three now closed by construction:**
1. **Neither bridge defines `on_message_edit` / `on_raw_message_edit`** → edits never re-enter the
   inbound path. Since the design creates once and only ever *edits*, the steady state is inert.
2. **The CC bridge logs ONLY Kyle-authored messages** (`if message.author.id != CFG["kyle_id"]:
   return`) → a bot-authored status post is never mirrored into the inbox log.
3. **The remaining live path was `cc-send`**, which explicitly calls `append_inbox` and *would*
   have put the status message into the very log the job reads. **Design changed: the status post
   uses a dedicated bot poster that does not route through `cc-send`.**
**Belt-and-braces regardless of the above:** the job's own author id is excluded from every
derivation input unconditionally, and the status text never begins with "Langston" (his bridge
gate is anchored on a leading name).

## R2 (Langston) — the injection mitigations were HTML-shaped; Discord is a second render target
1. **Discord renders markdown and resolves mentions.** `allowed_mentions: {parse: []}` on the
   create **and every edit**; markdown metacharacters neutralised at that render.
2. **The raw-evidence column was unprotected** — it puts attacker text verbatim in front of Kyle.
   Escaped at render (HTML entities on the page, markdown-neutral on Discord) and length-capped.
   *The defence has to bind the column used to CHECK the model, or the check is the hole.*
3. **A label is a convention; a schema is a mechanism.** The summariser is constrained to a fixed
   schema with length caps, validated before render, and rendered into fixed slots — so model text
   physically cannot occupy an exact-field position or emit its own "NEEDS YOU" line.
4. **Truncation is security-relevant at 2000 chars:** summaries and evidence truncate with an
   explicit marker; **the needs-you block never does.**
5. **Model output never becomes model input:** change-detection diffs on exact facts only, and the
   summariser sees source evidence only — never a prior snapshot containing its own prior output.

## State written vs read (§9.5(a-ii))
Removes no writer, so no reader loses a producer. The only originated state is the archive and the
status message, both inert to every other component. **If this job vanishes, no machinery
degrades** — true of machinery, and Langston's caveat accepted: not true of Kyle once he relies on
it, which the age-labelling covers. **Standing rule added: the page is Kyle-facing output, NEVER
evidence — no session may cite it** (#641 two-sources shape).

## Unverified → now verified, and what remains (Langston (e), in his order of expected failure)
1. **Discord edit — the quirk was AUTHOR IDENTITY, not `PATCH`.** Webhook messages can't be pinned;
   bot tokens can't edit webhook messages. **Resolved by decision: bot-authored** (see scope §5).
2. **Board from a scheduled context — expect failure as-defaulted.** Adopting his prescription: an
   explicit token file loaded into env (the `/etc/langston/github-board.env` pattern), and **raw
   GraphQL rather than `gh project` subcommands**, which mis-parse on some gh versions. Still
   unproven until first run; renders FAILED, never empty.
3. **Transcripts — two Windows hazards, both accepted:** open shared-read (the app holds the file),
   and **stateless full-file parses every cycle — never offset-tailing**, because compaction
   rewrites the file and an offset reader breaks silently across that boundary.
4. **Scheduling — 60 s is exactly Task Scheduler's repetition floor**, so no sub-minute attempt;
   "do not start a new instance" set; coalescing drift expected and covered by age-labelling.

## Provenance
`STORAGE_POLICY.md` §§1–5.5 · `#660` (cap projection ruling out a DB table) ·
`REPO_TOPOLOGY_AND_SYNC_RUNBOOK` (why an out-of-session watcher) · Kyle's directive 2026-08-07 ·
Langston invocation #13 (PROCEED with revisions; rulings on classification, unanswered-asks, R1, R2).
