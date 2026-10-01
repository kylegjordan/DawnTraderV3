# CLAUDE CODE WAKE-WATCHER RUNBOOK — arming, re-arming, and the traps (B-RULES-1b C4 home, 2026-08-06)

> **The durable home of the wake-watcher procedure** (relocated from the shared `MEMORY.md` §4.5 at the C4 conversion — a volatile capped file was scheduling this content's deletion, Langston's C4 bounce). The shared MEMORY §4.5 holds the arm command + a pointer here. `CLAUDE.md` §6.9 holds the protocol-level rules (names, routing, wake sources). This runbook holds the OPERATIONAL depth: the traps, the verify-before-re-arm judgment, and the three reliability layers.

## 1. THE ARM COMMAND (verbatim; §4.5 carries the same — the two must not drift)
Run via **Bash with `run_in_background: true`** (since 2026-09-30, `B-TOKEN-BURN-CUT` `#1127`):
```
S=C:/Users/kyleg/.claude; A=<ALIAS>; while :; do P=$(python3 "$S/cc-wake-filter.py" $A --positions); ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=2 -o ConnectTimeout=15 root@204.168.141.77 "python3 - $P" < "$S/cc-wake-follow.py" | python3 -u "$S/cc-wake-filter.py" $A --once; [ "${PIPESTATUS[1]}" = 0 ] && break; sleep 30; done
```
**The task ends on the first message for you, and its completion notification is the wake.** Read the task's output file (the `WAKE[...]` lines, each tagged `[src=<file>@<offset> id=<message_id>]`), act, then re-arm with the same command. It resumes from `C:/Users/kyleg/.claude/cc-wake-state/<ALIAS>.json`, so nothing written between two arms is lost; a burst is delivered as one wake. `cc-wake-follow.py` is never installed on Helsinki — the laptop pipes it over ssh, so the laptop copy is the only copy.
`<ALIAS>` = CC-A | CC-B | CC-C (your roster-bound name — `(repo)/.claude/cc-session-roster.json`; unbound → ask Kyle + register, NEVER infer from role).

## 2. THE TRAPS (each with its incident — the content this home exists to preserve)
- **⚠️ THE 06-19 TRAP, NOW USED ON PURPOSE:** a background Bash task notifies only when it EXITS, so the 06-19 `while true` watcher, which never exited, never woke anyone. The event-only watcher is built on exactly that property: it EXITS on the first message, so its one exit notification is the wake. **A watcher that does not end on a message is the broken one.**
- **⚠️ THE MONITOR FORM IS RETIRED (2026-09-30):** since CC 2.1.271 every Monitor ends within 30 minutes (`CLAUDE_CODE_FEATURE_WATCH.md`, the 2026-09-15 row), and each ending woke the session with nothing to say — measured in `B_TOKEN_BURN_CUT_PRE_AUDIT.md` §0. Do not arm a Monitor for the wake watcher.
- **⚠️ MULTI-file tail, never split:** the single `tail -F` over all three files keeps the `==>` headers the filter needs to attribute lines; three single-file tails lose them.
- **⚠️ TaskList CANNOT verify the watcher (06-25 trap):** it shows todo items only. **Judge liveness by the file `C:/Users/kyleg/.claude/cc-wake-state/<ALIAS>.json.alive`, rewritten every 5 minutes.** ⛔ **Older than 15 minutes is NOT proof of dead (since `cfe70f92c`, Langston Step 7):** a watcher that runs but cannot save its position stops refreshing `.alive` on purpose — its output says `keepalive save skipped` — and the usual reason it cannot save is a SECOND watcher of the same alias holding the file. So **count before arming: `bash ~/.claude/cc-wake-count.sh <ALIAS>` — 0 = dead, re-arm; 1 = running, do NOT arm another (find what holds the state file); 2+ = TaskStop all but one.** Two watchers deliver every wake twice with the same `[src=…@offset]` tag. (The one-per-session lock that makes a second arm impossible is `B-WAKE-ARM-EXCLUSIVE`, `#1140`.)
- **⚠️ The app may end idle background tasks when the laptop is short of memory** (CC 2.1.193). Kyle decided 2026-09-30 to change nothing: the hourly heartbeat's liveness check is how we find out whether it ever happens.
- **⚠️ Compaction USUALLY kills the watcher but NOT always** (2026-06-25 it survived) — the doubled-event check is the reliable dedup, not an assumption either way.

## 3. THE THREE RELIABILITY LAYERS (all outside the conversation, so they survive compaction)
1. **SessionStart hook** (`.claude/settings.local.json`, matcher `startup|resume|compact`): auto-injects a re-arm reminder every start/resume/compaction. Act on it FIRST thing that turn + sweep the Discord inbox for anything missed.
2. **The rule in both loaded files** (`CLAUDE.md` §6.9 + shared MEMORY §4.5-pointer): the reloaded post-compaction context always carries the instruction.
3. **Hourly heartbeat** (scheduled task `wake-watcher-heartbeat`): reads every session's `.alive` file on the laptop and wakes NOBODY when all are alive; a DEAD watcher is reported with `--notify` to Kyle, because a dead watcher cannot be reached through itself (`B-WAKE-OUT-OF-BAND`, after live, is the out-of-band fix). Once a day it plants `WATCHER-CONTROL <ALIAS> <date>` in `cc-wake.log`; a live watcher answers with `<ALIAS>.json.control` — no print, no wake.

**Honest residual gap:** a fully-CLOSED desktop session — nothing to wake. Platform limitation, unfixable from here.

## 4. WHAT WAKES A SESSION (summary; protocol detail in `CLAUDE.md` §6.9)
Discord msgs/voice, Langston's replies and alert triage (`/var/log/cc-discord-inbox.jsonl`) · the wake file (`/var/log/cc-wake.log`). *(`langston-alert-invokes.log` removed 2026-09-30 — no writer since the Discord cutover, `#1054`.)* Name-routing: your name anywhere → wake; only another's → silent; none → broadcast. The filter holds the name registry and forces UTF-8 (the cp1252 pipe-encoding silently ate non-ASCII events — fixed 2026-06-11).

## 5. HISTORY POINTERS
Built 2026-06-11/12 (naming + routing live-verified 06-12) · reliability hardening 2026-06-24 (Kyle directive; GitHub #25188 compaction behavior) · heartbeat layer 2026-07-13 (Kyle) · Telegram inbox dropped from the tail at the 2026-07-02 decommission. Full protocol: `CLAUDE.md` §6.9.
