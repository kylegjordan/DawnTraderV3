# -*- coding: utf-8 -*-
"""B-TOKEN-BURN-CUT (#1127) — the ARM-INSTRUCTION SWITCH, applied at Step 6, NOT at Step 3.

WHY IT IS HELD: these edits tell every session to arm the event-only watcher. If they landed before the
live copies of cc-wake-filter.py / cc-wake-follow.py were installed under C:/Users/kyleg/.claude/, a
session that re-armed from them (a compaction, a restart) would loop on a missing file and go DEAF.
So: Langston reviews this file at Step 4 as part of the diff; at Step 6 the live copies are installed
(sha256 against the blob at the ref) and this script is run in the SAME turn, then committed.

Every edit is an exact, unique-match replacement; the script aborts on any miss and writes nothing.
usage: python B_TOKEN_BURN_CUT_ARM_SWITCH.py <repo-root> [--dry]
"""
import sys, os
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

ROOT = sys.argv[1]
DRY = "--dry" in sys.argv

ARM = ('S=C:/Users/kyleg/.claude; A=<ALIAS>; while :; do P=$(python3 "$S/cc-wake-filter.py" $A --positions); '
       'ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=2 -o ConnectTimeout=15 root@204.168.141.77 "python3 - $P" '
       '< "$S/cc-wake-follow.py" | python3 -u "$S/cc-wake-filter.py" $A --once; [ "${PIPESTATUS[1]}" = 0 ] && break; sleep 30; done')

EDITS = [
    # ── shared MEMORY.md §4.5 (the inline command, kept inline by design) + the alert-log line ──
    (".claude/memory/MEMORY.md",
     "4.5. **★ARM WAKE WATCHER — Monitor tool (`persistent: true`), NEVER Bash `run_in_background`** (a bg task only notifies on EXIT — the 06-19 trap). Command, executed verbatim (kept INLINE by design — post-compaction sessions must not need to follow a pointer to re-arm):",
     "4.5. **★ARM WAKE WATCHER — Bash `run_in_background: true`, NOT the Monitor tool (since 2026-09-30, `B-TOKEN-BURN-CUT` `#1127`: the app now ends every Monitor within 30 minutes and each ending woke the session with nothing to say).** The task ENDS on the first message for you — **its completion notification IS the wake: read the task's output file (the WAKE lines), act, then RE-ARM with the same command.** It resumes where it stopped, so a message that arrived while you were busy is delivered by the next arm. Command, executed verbatim (kept INLINE by design — post-compaction sessions must not need to follow a pointer to re-arm):"),
    (".claude/memory/MEMORY.md",
     "`while true; do ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=2 -o ConnectTimeout=15 root@204.168.141.77 'tail -n0 -F /var/log/cc-discord-inbox.jsonl /var/log/langston-alert-invokes.log /var/log/cc-wake.log' | python3 -u \"C:/Users/kyleg/.claude/cc-wake-filter.py\" <ALIAS>; echo \"WAKE[WATCHER]: ssh dropped - reconnecting\"; sleep 30; done`",
     "`" + ARM + "`"),
    (".claude/memory/MEMORY.md",
     "**VERIFY before re-arm — by recent WAKE events, NEVER TaskList** (shows todo items only → blind re-arm double-wakes); doubled events → TaskStop one. Multi-file tail, never split.",
     "**VERIFY liveness by its FILE, not by recent events: `C:/Users/kyleg/.claude/cc-wake-state/<ALIAS>.json.alive` is rewritten every 5 min — older than 15 min = dead, re-arm.** Two watchers running deliver every wake twice (same `[src=…@offset]` tag) → TaskStop one."),
    (".claude/memory/MEMORY.md",
     "his response lives in Helsinki /var/log/langston-alert-invokes.log;",
     "his response is his reply in `/var/log/cc-discord-inbox.jsonl` (`kind=langston_outbound`; the old `langston-alert-invokes.log` has had no writer since 2026-06-28);"),
    # ── CLAUDE.md §6 comms block + §6.9 ──
    ("CLAUDE.md",
     "The wake watcher tails `/var/log/cc-discord-inbox.jsonl` and **MUST be armed with the Monitor tool, NOT Bash `run_in_background`** (§6.9 + MEMORY §4.5/4.6).",
     "The wake watcher reads `/var/log/cc-discord-inbox.jsonl` and is **armed as a Bash `run_in_background` task that ends on the first message for you** (§6.9 + MEMORY §4.5/4.6; the Monitor form retired 2026-09-30, `#1127`)."),
    ("CLAUDE.md",
     "**What wakes a session (four log sources, one watcher):**",
     "**What wakes a session (two log sources, one watcher):**"),
    ("CLAUDE.md",
     "2. **Langston alert completions** — every `invoke DONE` line in `/var/log/langston-alert-invokes.log` (Helsinki) wakes CC automatically so alert follow-through starts immediately (Langston ACK ≠ resolved; the work is usually CC's).\n3. **The wake file**",
     "2. **The wake file**"),
    ("CLAUDE.md",
     "**Mechanics (re-arm EVERY session start — MEMORY.md session-start item 4.5 is the canonical command):** persistent Monitor running a self-healing SSH loop tailing the three Helsinki sources (`cc-discord-inbox.jsonl` = Discord, `langston-alert-invokes.log`, `cc-wake.log`) through the filter `C:\\Users\\kyleg\\.claude\\cc-wake-filter.py <ALIAS>`.",
     "*(Langston's alert triage reaches you as his Discord reply, routed by its `[[ALERT … owner=]]` marker — source 1. The old `langston-alert-invokes.log` source was removed 2026-09-30: no writer since the Discord cutover, `#1054`.)*\n\n**Mechanics (arm at EVERY session start AND re-arm after EVERY wake — MEMORY.md session-start item 4.5 is the canonical command):** a Bash `run_in_background` task — a self-healing SSH loop that runs `cc-wake-follow.py` on Helsinki over the two sources into the filter `C:\\Users\\kyleg\\.claude\\cc-wake-filter.py <ALIAS> --once`, which ENDS the task on the first message for you and saves where it stopped, so the next arm delivers anything that arrived meanwhile. **The Monitor form is retired:** since CC 2.1.271 every Monitor ends within 30 minutes, and each ending woke the session with nothing to say (`#1127`)."),
    # ── the runbook, sections 1-4 ──
    ("1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md",
     "Run via the **Monitor tool with `persistent: true`** — never Bash `run_in_background`:\n```\nwhile true; do ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=2 -o ConnectTimeout=15 root@204.168.141.77 'tail -n0 -F /var/log/cc-discord-inbox.jsonl /var/log/langston-alert-invokes.log /var/log/cc-wake.log' | python3 -u \"C:/Users/kyleg/.claude/cc-wake-filter.py\" <ALIAS>; echo \"WAKE[WATCHER]: ssh dropped - reconnecting\"; sleep 30; done\n```",
     "Run via **Bash with `run_in_background: true`** (since 2026-09-30, `B-TOKEN-BURN-CUT` `#1127`):\n```\n" + ARM + "\n```\n**The task ends on the first message for you, and its completion notification is the wake.** Read the task's output file (the `WAKE[...]` lines, each tagged `[src=<file>@<offset> id=<message_id>]`), act, then re-arm with the same command. It resumes from `C:/Users/kyleg/.claude/cc-wake-state/<ALIAS>.json`, so nothing written between two arms is lost; a burst is delivered as one wake. `cc-wake-follow.py` is never installed on Helsinki — the laptop pipes it over ssh, so the laptop copy is the only copy."),
    ("1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md",
     "- **⚠️ THE 06-19 TRAP — Monitor tool, NOT `run_in_background`:** a background Bash task only notifies on EXIT; a `while true` watcher never exits, so it streams forever WITHOUT ever waking you. This silently broke CC-B's wake 2026-06-19. Via Monitor, each stdout line is a wake event that re-invokes the session.",
     "- **⚠️ THE 06-19 TRAP, NOW USED ON PURPOSE:** a background Bash task notifies only when it EXITS, so the 06-19 `while true` watcher, which never exited, never woke anyone. The event-only watcher is built on exactly that property: it EXITS on the first message, so its one exit notification is the wake. **A watcher that does not end on a message is the broken one.**\n- **⚠️ THE MONITOR FORM IS RETIRED (2026-09-30):** since CC 2.1.271 every Monitor ends within 30 minutes (`CLAUDE_CODE_FEATURE_WATCH.md`, the 2026-09-15 row), and each ending woke the session with nothing to say — measured in `B_TOKEN_BURN_CUT_PRE_AUDIT.md` §0. Do not arm a Monitor for the wake watcher."),
    ("1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md",
     "- **⚠️ TaskList CANNOT verify the watcher (06-25 trap):** TaskList shows todo items only, NOT Monitor tasks — it always reads \"absent,\" and a blind re-arm spawns a DUPLICATE that double-wakes (hit exactly this at the 2026-06-25 cutover). **Judge liveness from whether WAKE events have been arriving.** Doubled events after an arm = an old watcher survived → TaskStop one.",
     "- **⚠️ TaskList CANNOT verify the watcher (06-25 trap):** it shows todo items only. **Judge liveness by the file `C:/Users/kyleg/.claude/cc-wake-state/<ALIAS>.json.alive`, rewritten every 5 minutes — older than 15 minutes means dead.** Two watchers deliver every wake twice with the same `[src=…@offset]` tag → TaskStop one.\n- **⚠️ The app may end idle background tasks when the laptop is short of memory** (CC 2.1.193). Kyle decided 2026-09-30 to change nothing: the hourly heartbeat's liveness check is how we find out whether it ever happens."),
    ("1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md",
     "3. **Hourly heartbeat** (per-session scheduled task; CC-A `wake-watcher-heartbeat-cc-a` cron `0 * * * *`, CC-B staggered): a fresh-context run health-checking the bridges, whose real value is the completion notification that WAKES the session hourly. On it: verify liveness (recent WAKE events?) → re-arm only if dead (dup-safe) → sweep the inbox. Covers the mid-session idle-death gap the other layers miss.",
     "3. **Hourly heartbeat** (scheduled task `wake-watcher-heartbeat`): reads every session's `.alive` file on the laptop and wakes NOBODY when all are alive; a DEAD watcher is reported with `--notify` to Kyle, because a dead watcher cannot be reached through itself (`B-WAKE-OUT-OF-BAND`, after live, is the out-of-band fix). Once a day it plants `WATCHER-CONTROL <ALIAS> <date>` in `cc-wake.log`; a live watcher answers with `<ALIAS>.json.control` — no print, no wake."),
    ("1-system-manual/CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md",
     "Discord msgs/voice (`/var/log/cc-discord-inbox.jsonl`) · Langston alert completions (`invoke DONE` in `/var/log/langston-alert-invokes.log`) · the wake file (`/var/log/cc-wake.log`).",
     "Discord msgs/voice, Langston's replies and alert triage (`/var/log/cc-discord-inbox.jsonl`) · the wake file (`/var/log/cc-wake.log`). *(`langston-alert-invokes.log` removed 2026-09-30 — no writer since the Discord cutover, `#1054`.)*"),
    # ── the session-start reminder hook ──
    (".claude/hooks/session-reminder.mjs",
     "  '   re-arm the Monitor per MEMORY 4.5 (judge liveness by recent WAKE events; do NOT blind-re-arm —\\n' +\n  '   a duplicate Monitor double-wakes). Then sweep the Discord inbox for anything missed.\\n'",
     "  '   re-arm the watcher per MEMORY 4.5 - a background task, NOT a Monitor (judge liveness by its file\\n' +\n  '   ~/.claude/cc-wake-state/<ALIAS>.json.alive; do NOT blind-re-arm - two watchers deliver every wake twice).\\n'"),
    # ── other prose that named the old arm or the dead source ──
    ("1-system-manual/COMMS_BRIDGE_RUNBOOK.md",
     "the wake watcher tails the Discord inbox (`/var/log/cc-discord-inbox.jsonl`) and **MUST be armed with the Monitor tool, not Bash `run_in_background`** (see §6.9 + MEMORY session-start 4.5/4.6).",
     "the wake watcher reads the Discord inbox (`/var/log/cc-discord-inbox.jsonl`) and is **armed as a Bash `run_in_background` task that ends on the first message for the session** (see §6.9 + MEMORY session-start 4.5/4.6; the Monitor form retired 2026-09-30, `#1127`)."),
    ("1-system-manual/SEARCH_SURFACES.md",
     "**`CLAUDE.md` §6.9 lists it as wake source 2 of 3, and the `MEMORY.md` §4.5 arm command tails it in every session.**",
     "**`CLAUDE.md` §6.9 lists it as wake source 2 of 3, and the `MEMORY.md` §4.5 arm command tails it in every session.** ✅ *Both removed 2026-09-30 by `B-TOKEN-BURN-CUT` (`#1127`, discharging `#1054`'s documentation leg).*"),
    ("comms-infra/discord/TEST_AND_SWITCH_RUNBOOK.md",
     "5. CC FOLDS the Discord log into its EXISTING multi-file wake watcher",
     "5. *(HISTORY — the 2026-06-25 cutover step. Since 2026-09-30 the watcher is event-only and reads two sources, not a `tail -F` over four: `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md` §1, `B-TOKEN-BURN-CUT`.)* CC FOLDS the Discord log into its EXISTING multi-file wake watcher"),
    ("1-system-manual/CLAUDE_CODE_FEATURE_WATCH.md",
     "Recommend: update §4.5 + the runbook to arm with the 30-minute maximum and re-arm on every expiry, then test that a session idle between turns actually re-arms. | (Kyle decision: pending)",
     "Recommend: update §4.5 + the runbook to arm with the 30-minute maximum and re-arm on every expiry, then test that a session idle between turns actually re-arms. | (Kyle decision: pending) → **ACTED ON 2026-09-30: `B-TOKEN-BURN-CUT` (`#1127`) — the watcher became an event-only background task; the 15 days in between are `#1128`.**"),
]

files = {}
for rel, a, b in EDITS:
    p = os.path.join(ROOT, *rel.split("/"))
    if p not in files:
        raw = open(p, "rb").read().decode("utf-8")
        files[p] = ["\r\n" if "\r\n" in raw else "\n", raw.replace("\r\n", "\n")]
    n = files[p][1].count(a)
    if n != 1:
        sys.exit(f"ABORT {rel}: {n} matches for: {a[:90]!r}")
    files[p][1] = files[p][1].replace(a, b)
    print("ok", rel, "|", a[:70].replace("\n", " "))
if DRY:
    print(f"DRY RUN: {len(EDITS)} edits across {len(files)} files match exactly once; nothing written")
else:
    for p, (nl, t) in files.items():
        open(p, "wb").write(t.replace("\n", nl).encode("utf-8"))
    print(f"wrote {len(EDITS)} edits across {len(files)} files")
