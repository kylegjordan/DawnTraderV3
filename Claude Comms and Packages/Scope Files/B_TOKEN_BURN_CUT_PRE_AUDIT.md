# B-TOKEN-BURN-CUT — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · owner CC-A · Step 1 APPROVED by Langston 2026-09-30T10:36Z (BLOCKER-1 + conditions 1-5 + OBJ-4 addition + a feature-watch home)

## 0. PREVIOUSLY STATED vs NOW — read first

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| D1 | expiry notices 09-29/09-30: CC-A 66/36, CC-B 60/34, CC-C 74/48, Infra 62/8 (scope §0, dispatch) | **CC-A 19/11, CC-B 20/11, CC-C 31/8, Infra 13/2**; CC-C 40-48 a day on 09-23..09-28 | each notice is written TWICE in a transcript — a `queue-operation` enqueue line and the delivered `user` entry — and the first count took lines. Now: `user` entries only, deduped by (task-id, uuid) (`tbc_expiry.py`) |
| D2 | turns started by an expiry cost **$421**, 164 of 165 ended in text | **$214 (10% of the four conversations' $2,104), 115 of 115 ended in text** | the first tally also treated a notice injected mid-turn (`queued_command` attachment) as a NEW turn and charged the running turn's calls to it. Now only delivered `user` entries start a turn (`tok_turns2.py`) |
| D3 | Kyle's messages drove **12%** of the conversations' spend on 09-29/30; 42-55% in early September (to Kyle, Desktop + Discord) | **21%** (440 of 2,104) on 09-29/30; **37-63%** per session across 09-01..09-28 (pre-trim copies) | same turn-start defect as D2 |
| D4 | the expiries were "the overnight burn" (to Kyle) | overnight 09-30 00:00-07:59Z ≈ **$1,087 + Langston ~$166**; CC-A alone **$587** (main $183 + helper agents $404 — Ultracode workflows on `B-PLAN-CURRENCY-CHECK`), CC-C ~$367 iterating with Langston; expiry wakes are ~10% | hourly table (`tbc_hourly.py`), below |
| D5 | "the transcripts are trimmed nightly" (to Kyle) | trimmed ONCE, 2026-09-29 ~12:00-13:00Z; pre-trim copies `*.BACKUP-20260929-*-pre-trim` hold full history (Infra's was not trimmed) | Kyle corrected it; file listing |

Corrected in `#1127` and the scope §0 in this step's commit.

## 1. AUDIT

### A1 — the platform change, quoted (BLOCKER-1, schema half)
`CLAUDE_CODE_FEATURE_WATCH.md:96` (surfaced 2026-09-15), verbatim from the changelog: *"Changed Monitor watches to always have a deadline (at most 30 minutes; 10 in single-prompt `-p` runs) and notify Claude to re-arm"* (CC 2.1.271). That reconciles Langston's reading (10 min: he runs `-p`) with mine (30 min: Desktop). My surface's live schema: `timeout_ms` `"maximum": 3600000`, description *"Deadlines above 1800000ms are capped to 1800000ms"*.

### A2 — the expiry population, split by watch (BLOCKER-1, population half)
Every expiry notice in the four current transcripts (09-15..09-30 as they now stand; A/B/Infra were trimmed 09-29, so their earlier days are partial) is a wake-watcher monitor (summary contains "wake watcher"); **zero** from any other watch; all read "expired after 30m". Counts: D1. ⇒ **OBJ-1(a) restated: zero expiry notices from the WAKE WATCHER** (other watches a session arms are out of scope and unaffected).
Arms: CC-A on 09-29 armed 27 wake-watcher monitors (16 at 1,800,000 ms, 11 at 3,600,000 — capped to 30m), against 19 expiries ⇒ some were superseded mid-life; CC-C re-armed 40-49 a day since 09-22 (its earlier arms were per-question watches).

### A3 — where the money went (context for the plan, not its object)
Four conversations, 09-29/30, by what started the turn (list rates, yardstick): Langston replies $661 (31%) · finished background jobs/agents $555 + $73 mislabelled `task:heartbeat` (my own probe output contained the word; it is background-job traffic) · Kyle $440 (21%) · **wake-watcher expiry $214 (10%)** · other sessions' posts naming them $147 (7%) · push notices $14. Helper agents $1,524; Langston $403. Hourly, overnight: D4. `RULED ON REPORTED FACT` stays the right tag for Langston — laptop-side.

### A4 — the new mechanism's lifetime (the plan's foundation)
A background Bash task is not a Monitor and carries no 30-minute deadline in its tool contract. **Positive control running:** a background task started 10:40:06Z that sleeps 40 minutes; result recorded in §1.A4-result before dispatch.
**A4-result: PASS.** Started 10:40:06Z, printed "survived 40 min, ended 11:20:06", exit 0, and its completion notification arrived in this session (task b1pzdeqsb). A background Bash task outlives the 30-minute watch deadline. What this does NOT show: behaviour under the memory-pressure reaper (A5), or across a session compaction.

### A5 — the reaper (Langston's worry, measured)
`CLAUDE_CODE_FEATURE_WATCH.md:122` (CC 2.1.193): *"Claude Code now auto-kills idle background shell commands under memory pressure; disable with `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1`."* Read `~/.claude/settings.json`: no `env` block — **the reaper is armed on this laptop.** Unknown and to be tested at Step 3: whether a reaped task produces a completion notification. Either way the design must not rely on it (condition 1).

### A6 — the three sources (condition 4)
Helsinki, `stat` 2026-09-30: `cc-discord-inbox.jsonl` 44,679,099 B, inode 2056, live · `cc-wake.log` 87,901 B, inode 1255, mtime 2026-09-19 (live channel, rarely written) · `langston-alert-invokes.log` **0 B, mtime 2026-06-28** — its writer retired at the Discord cutover (`#333`); the live alert path is `kind='langston_alert_inbound'` rows inside the inbox. Its filter branch (`cc-wake-filter.py` `elif "langston-alert-invokes" in cur:`) is a `pass`. **Disposition (5): disconnected, stays disconnected — drop it from the tail and delete the branch (rule 18, `DELETED_COMPONENTS_LOG`).** `/etc/logrotate.d/langston-alert-invokes` rotates the dead file — Helsinki `/etc` is Infra Claude's; handed to Infra (disposition 2 there). No logrotate exists for the two live files (listing of `/etc/logrotate.d`).

### A7 — the filter's input contract
`cc-wake-filter.py` (repo copy = live copy, compared CRLF-normalised): routes by `cur`, set ONLY by a `==> path <==` header; a line without one is dropped with a stderr notice. It holds no position and prints one line per wake; the Monitor turned each stdout line into a notification.

### A8 — the census of arm-instruction sites (condition 5), at `origin/migration/aws-supabase`
Positive control: the pattern hits the runbook (1 match) before the wide run. Sites carrying the Monitor/persistent arm or a re-arm instruction: `CLAUDE.md:224` (§6 comms block), `:320`, `:322`, `:328` (§6.9) · shared `.claude/memory/MEMORY.md:18` (§4.5 inline command), `:20` · `MEMORY_CC_A.md:79,98` · `MEMORY_CC_B.md:6,32,34` · `MEMORY_CC_C.md:60,107` · `MEMORY_CC_INFRA.md:71` · `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md:1-21` · `COMMS_BRIDGE_RUNBOOK.md:58` · `CLAUDE_CODE_FEATURE_WATCH.md:55,96` (history note) · `.claude/hooks/session-reminder.mjs:13` · `.claude/hooks/fresh-rules.mjs:218` · `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat{,-cc-a}/SKILL.md` (and their LIVE copies under `C:\Users\kyleg\.claude\scheduled-tasks\`, hand-copied like the filter) · `comms-infra/laptop/cc-wake-filter.py:4` (docstring). `_archive/` and frozen batch records are history and are not edited.
**Live copies are outside the ref** (`#1004` shape): `C:\Users\kyleg\.claude\cc-wake-filter.py` and the two scheduled-task `SKILL.md` files — verified per file at Step 7, not by the ref census.

### A9 — shared `/tmp` (condition 3)
All four sessions resolve `/tmp` to one Windows temp folder (`#979`). ⇒ the position store is **`C:\Users\kyleg\.claude\cc-wake-state\<ALIAS>.json`**, keyed by session alias, never in `/tmp`.

### A10 — SIM + System Manual
`SYSTEM_IMPACT_MAP.md` "Discord Comms Fabric" (:2806-2855) + the wake-filter content updates (:3663, :3670, :3681): the watcher has one consumer (the session). Nothing in the trading system reads any of this. `SYSTEM_MANUAL.md`: no coverage of comms tooling — correct, not a gap (trading architecture only). SIM owes a content update (Step 10).

### A11 — the reader loop sites (OBJ-4)
"CAP AT THREE ROUNDS" loop text at the ref: `bug-investigation/SKILL.md:24-53`, `workflow-02-audit-and-plan/SKILL.md:93-128`, `workflow-04-code-review/SKILL.md` (the fresh-reader block through :100), `workflow-07-verify-cc/SKILL.md:88`, `workflow-11-completion/SKILL.md:87`; my own `MEMORY_CC_A.md` (the 2026-08-31 "every dispatch" line). Kept verbatim in meaning: HIT = lead re-derived at the ref; CLEAN ≠ evidence; the `REVIEWER:` one-line record.

### A12 — the feature-watch routing gap (Langston)
The 2026-09-15 finding (A1) was surfaced to Kyle and nothing acted on it for 15 days. Langston's home names "row 1h.1" — **a row id the plan parser cannot read** (`/^\d+[a-z]?$/`; the `1b2` lesson, `#1121`). ⇒ **row 1i**, `#1128`.

## 2. PLAN (every item → its finding)

**P1 (A4, A7, A9) — the follower, Helsinki side:** `comms-infra/discord/cc-wake-follow` (Python 3.12, installed to `/usr/local/bin/`). Args: `path:inode:offset` per source (or `path:end` on first arm). Emits tail-compatible output — a `==> path <==` header on each file switch, then each COMPLETE line (never a trailing chunk without `\n`), then a control line `#@POS path inode end_offset`. Re-opens from 0 when the inode changes or size < offset (condition 2). Emits `#@CAUGHTUP` whenever a poll pass finds nothing new on every file, and `#@KEEPALIVE <utc>` every 300 s. Polls at 1 s.

**P2 (A7, A9) — the filter, laptop side:** `cc-wake-filter.py <ALIAS> --once --state <path>`. Routing unchanged. It records `#@POS` per processed line; a suppressed line advances the position. On the FIRST wake line it keeps reading until the next `#@CAUGHTUP` (so a burst is one notification), then writes the state atomically (temp + rename) and exits 0. **Order: print and flush, THEN save** — a kill between them re-delivers (a duplicate wake) rather than losing an event; stated as the deliberate choice. `#@KEEPALIVE` touches `<state>.alive` and saves the position. EOF (ssh dropped) saves and exits 3. `--positions` prints the stored positions for the arm command. A state older than 12 h is discarded (start at end) with one line `WAKE[WATCHER]: resumed after <n> h — sweep the Discord inbox`, so a long-closed session does not replay days of chatter. The `langston-alert-invokes` branch is deleted (A6).

**P3 (A4, A5) — the arm command** (Bash `run_in_background`, not Monitor):
`while :; do ssh … root@204.168.141.77 "cc-wake-follow $(python3 filter <ALIAS> --positions --state S)" | python3 -u filter <ALIAS> --once --state S; rc=${PIPESTATUS[1]}; [ $rc -eq 0 ] && break; sleep 30; done`
One completion notification per burst; the session reads the task's output file, acts, re-arms. Two sources only: inbox + `cc-wake.log`.

**P4 (A5, condition 1) — liveness, without a wake:** the hourly heartbeat task reads each session's `<ALIAS>.alive` mtime; older than 15 min ⇒ the watcher is dead ⇒ a `--notify` post to Kyle naming the session (a dead watcher cannot be woken by a post; stated as the residual, same as today's fully-closed-session gap). Healthy ⇒ silent. **Emit-path proof:** the heartbeat plants one control line a day per session in `cc-wake.log`, which the filter recognises and answers by writing `<ALIAS>.control` (no print, no wake) — proving follower + filter + routing on the LIVE source; the print → exit → notification leg is proven by the first real wake after arming and at Step 7 by planted events. No idle window is cited as evidence the emit path works (`#661` leg 3).
**P4-K (A5) — ⭐ Kyle decision:** set `CLAUDE_CODE_DISABLE_BG_SHELL_PRESSURE_REAP=1` in `~/.claude/settings.json` `env` — a persistent settings change, his to approve. Without it P4 still detects a reap within 15 min.

**P5 (A8, condition 5) — every site updated, the live copies installed:** each A8 site gets the new form or a history note; CC-B/CC-C/Infra memory lines are theirs to edit — I post each session the new arm line and they update their own files (write-own-file rule). The live filter and the two scheduled-task files are copied by hand and verified by `sha256` against the blob at the deployed ref (the `#1004` lesson). All four sessions re-arm at their next natural turn boundary (Langston's placement constraint).

**P6 (A11, OBJ-4) — the reader rule:** each A11 site rewritten to: one fresh reader, only for a claim that would change what gets built, decided by the author BEFORE publishing; any claim not routed to a reader ships labelled **`NOT RE-READ`** (Langston's non-self-certifying addition); HIT = lead, CLEAN ≠ evidence, `REVIEWER:` record kept.

**P7 (A6) — dead source:** `DELETED_COMPONENTS_LOG.md` entry for the filter branch + the tail source; `/etc/logrotate.d/langston-alert-invokes` handed to Infra Claude.

**P8 (A12) — the feature-watch routing home:** `#1128`, `HOME: B-FEATURE-WATCH-ROUTING, owner CC-A, placed in SPRINT_TO_LIVE_PLAN.md at row 1i, after row 1h`.

**P9 — tests (Step 3, offline first, per my `#761` lesson):** follower + filter run on a copy of the real inbox on Helsinki: planted lines mid-turn and in the arm gap, delivered exactly once and in order; a partial trailing line not consumed; a rotated file (new inode) and a truncated file re-read from 0; a burst is one exit; a suppressed-only stream never exits; positive + negative routing controls per alias; the 12 h stale-state rule. Then one session (mine) on the live source before the others.

**Verification criteria, restated:** OBJ-1(a) zero wake-watcher expiry notices in ≥6 idle hours per session, AND the liveness file fresh throughout (P4) — quiet alone never passes; OBJ-1(b) planted positive/negative per session; OBJ-2 per P9 on the live source; OBJ-3 A8 census at the ref + sha256 of each live copy + each session's transcript showing the new arm; OBJ-4 the A11 census.

**UNAUDITED:** none — P4's daily control line format and P2's 12 h threshold are design choices, flagged for attack.

## 3. Plain-language summary
The expiring watcher was real but smaller than I first said: about a tenth of the sessions' own spend on 09-29/30. The first count took each notice twice and charged work in progress to it. The plan replaces the watcher with one that sleeps until a message for that session arrives, remembers where it stopped so nothing is missed or doubled, and proves it is alive every hour without waking anyone. It drops a source that has been silent since June, and cuts the second-reader check to one pass with anything unchecked labelled so. One setting — stopping the app from killing idle background tasks under memory pressure — is Kyle's to approve.
