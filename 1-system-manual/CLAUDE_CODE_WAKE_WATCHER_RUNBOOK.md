# CLAUDE CODE WAKE-WATCHER RUNBOOK — arming, re-arming, and the traps (B-RULES-1b C4 home, 2026-08-06)

> **The durable home of the wake-watcher procedure** (relocated from the shared `MEMORY.md` §4.5 at the C4 conversion — a volatile capped file was scheduling this content's deletion, Langston's C4 bounce). The shared MEMORY §4.5 holds the arm command + a pointer here. `CLAUDE.md` §6.9 holds the protocol-level rules (names, routing, wake sources). This runbook holds the OPERATIONAL depth: the traps, the verify-before-re-arm judgment, and the three reliability layers.

## 1. THE ARM COMMAND (verbatim; §4.5 carries the same — the two must not drift)
Run via the **Monitor tool with `persistent: true`** — never Bash `run_in_background`:
```
while true; do ssh -o ServerAliveInterval=60 -o ServerAliveCountMax=2 -o ConnectTimeout=15 root@204.168.141.77 'tail -n0 -F /var/log/cc-discord-inbox.jsonl /var/log/langston-alert-invokes.log /var/log/cc-wake.log' | python3 -u "C:/Users/kyleg/.claude/cc-wake-filter.py" <ALIAS>; echo "WAKE[WATCHER]: ssh dropped - reconnecting"; sleep 30; done
```
`<ALIAS>` = CC-A | CC-B | CC-C (your roster-bound name — `(repo)/.claude/cc-session-roster.json`; unbound → ask Kyle + register, NEVER infer from role).

## 2. THE TRAPS (each with its incident — the content this home exists to preserve)
- **⚠️ THE 06-19 TRAP — Monitor tool, NOT `run_in_background`:** a background Bash task only notifies on EXIT; a `while true` watcher never exits, so it streams forever WITHOUT ever waking you. This silently broke CC-B's wake 2026-06-19. Via Monitor, each stdout line is a wake event that re-invokes the session.
- **⚠️ MULTI-file tail, never split:** the single `tail -F` over all three files keeps the `==>` headers the filter needs to attribute lines; three single-file tails lose them.
- **⚠️ TaskList CANNOT verify the watcher (06-25 trap):** TaskList shows todo items only, NOT Monitor tasks — it always reads "absent," and a blind re-arm spawns a DUPLICATE that double-wakes (hit exactly this at the 2026-06-25 cutover). **Judge liveness from whether WAKE events have been arriving.** Doubled events after an arm = an old watcher survived → TaskStop one.
- **⚠️ Compaction USUALLY kills the watcher but NOT always** (2026-06-25 it survived) — the doubled-event check is the reliable dedup, not an assumption either way.

## 3. THE THREE RELIABILITY LAYERS (all outside the conversation, so they survive compaction)
1. **SessionStart hook** (`.claude/settings.local.json`, matcher `startup|resume|compact`): auto-injects a re-arm reminder every start/resume/compaction. Act on it FIRST thing that turn + sweep the Discord inbox for anything missed.
2. **The rule in both loaded files** (`CLAUDE.md` §6.9 + shared MEMORY §4.5-pointer): the reloaded post-compaction context always carries the instruction.
3. **Hourly heartbeat** (per-session scheduled task; CC-A `wake-watcher-heartbeat-cc-a` cron `0 * * * *`, CC-B staggered): a fresh-context run health-checking the bridges, whose real value is the completion notification that WAKES the session hourly. On it: verify liveness (recent WAKE events?) → re-arm only if dead (dup-safe) → sweep the inbox. Covers the mid-session idle-death gap the other layers miss.

**Honest residual gap:** a fully-CLOSED desktop session — nothing to wake. Platform limitation, unfixable from here.

## 4. WHAT WAKES A SESSION (summary; protocol detail in `CLAUDE.md` §6.9)
Discord msgs/voice (`/var/log/cc-discord-inbox.jsonl`) · Langston alert completions (`invoke DONE` in `/var/log/langston-alert-invokes.log`) · the wake file (`/var/log/cc-wake.log`). Name-routing: your name anywhere → wake; only another's → silent; none → broadcast. The filter holds the name registry and forces UTF-8 (the cp1252 pipe-encoding silently ate non-ASCII events — fixed 2026-06-11).

## 5. HISTORY POINTERS
Built 2026-06-11/12 (naming + routing live-verified 06-12) · reliability hardening 2026-06-24 (Kyle directive; GitHub #25188 compaction behavior) · heartbeat layer 2026-07-13 (Kyle) · Telegram inbox dropped from the tail at the 2026-07-02 decommission. Full protocol: `CLAUDE.md` §6.9.
