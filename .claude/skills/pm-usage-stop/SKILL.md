---
name: pm-usage-stop
description: PM USAGE STOP ONLY - what PM Claude does when Kyle's weekly Claude usage line is reached (85% unless he says otherwise), and how to undo it on resume. Stops the sessions AND everything else that bills the Claude account - Langston and the alert lane, the hourly heartbeat, the daily scheduled jobs, PM's own cron and watcher. NOT for the Claude-to-ChatGPT crew handover (that is pm-transition-to-codex), NOT for normal nudging.
---

# PM usage stop - stop EVERYTHING that spends Claude credit

Kyle, 2026-11-09: "these functions - Langston responding to alerts and the hourly health check plus the two daily jobs - need to be stopped when you stop the sessions." Stopping only the four sessions let usage climb from 85% to 91%: Langston answered 55 times after the stop (29 by the Sonnet alert lane, about 26 by Langston himself), and the hourly heartbeat started a Claude session every hour and woke every armed session.

## When it fires
`mcp__ccd_session_mgmt__get_usage` shows "Weekly · all models" at or above the line, and MEMORY_PM.md's CURRENT POSITION does not already say `USAGE STOP SENT`.

## Do all of this in ONE turn
1. **The four sessions.** `send_message` to OLD, NEW, ANALYST and INFRA (ids in MEMORY_PM.md): reach a clean point now (finish only what is minutes from done, push only safe complete work, never leave a deploy or half-applied change), update CURRENT POSITION, post one line on Discord starting `PM Claude` saying where they stopped, then start nothing new, send nothing to Langston, arm no work-starting timer, until Kyle says resume. An immediate stop to protect money or data is still allowed.
2. **Langston and the alert lane.** Post on Discord, starting `Langston`: finish any review in hand, take no new one. Then turn him off: `ssh root@204.168.141.77 'crew-switch langston off'` and confirm `crew-switch status` reads `Langston bridge: inactive/disabled`. The alert lane (Sonnet, `alert_lane.py`) runs inside his bridge, so this stops it too. Check nothing else is calling the model: `pgrep -af 'claude -p'` on that box should be empty.
3. **Scheduled tasks.** `list_scheduled_tasks`, then `update_scheduled_task enabled:false` for every ENABLED DawnTrader task. As of 2026-11-09 that is `wake-watcher-heartbeat` (hourly), `daily-claude-currency-check` (daily) and `freshness-log-review` (Mondays). Never pause another project's task (for example `cashflow-workbench-gardening`); tell Kyle it is still running.
4. **Yourself.** Cancel your guard cron (`CronList`, `CronDelete`) and do not re-arm your wake watcher. Kyle reaches you in the Desktop chat.
5. **Tell Kyle.** Post the stop notice on Discord with `cc-send --notify` and in the Desktop chat: what was stopped, that nothing restarts until he says resume, and the reset time.
6. **Record it.** Write `USAGE STOP SENT <UTC> at N%` into MEMORY_PM.md's CURRENT POSITION with the exact list of what you paused, so the resume restores exactly that. Collect each session's stop line and confirm none left a deploy in flight before telling Kyle "nothing is mid-deploy".

## Resume (only on Kyle's word)
Reverse the recorded list: re-enable the paused tasks, `crew-switch langston on`, ask every session to re-arm its wake watcher (a stopped session's watcher dies), re-arm your own, re-create the guard cron, and clear `USAGE STOP SENT` from CURRENT POSITION. If the crew is moving to ChatGPT instead, use `pm-transition-to-codex`.

When the crew is returning from Codex, first read the codex-to-claude handover sheet. Before waking any building session, verify `MEMORY_CC_A.md`, `MEMORY_CC_B.md`, `MEMORY_CC_C.md`, `MEMORY_CC_INFRA.md` and `MEMORY_PM.md` in `C:\Users\kyleg\.claude\projects\DT-SHARED-MEMORY\` are identical to the pushed `origin/migration/aws-supabase:.claude/memory/` blobs: SHA-256 and byte size must match for all five. If one differs, replace the outside copy from the pushed blob, never the reverse, and re-check all five. Then start a turn in each existing OLD, NEW, ANALYST and Infra Claude session and point it to its own section. Re-arm the watchers and re-enable only the paused scheduled tasks recorded in the stop block, then check that each owner's first Discord post or commit names the batch and step in the sheet. This direct start works only for Claude sessions that still exist, are not archived, and are reachable while the Claude app is open. If one fails that test, tell Kyle to open that one session; do not make him open the others.

## Limits, stated
- Nothing here stops Kyle's own use or another project's.
- Coltrane runs on ChatGPT, not Claude, and is never switched off.
- A session that was mid-turn when the stop arrived may spend a little more finishing it.

## Token-economy settings and their smoke check (B-TOKEN-ECONOMY OBJ-9)
**At a stop, touch none of these: they cost nothing while sessions are stopped.** At resume, after each session re-arms its watcher, run the smoke check below on it; a resumed session is a restarted one, so this is when the settings first bite.

**What the repo carries (Claude only; reaches each clone at pull, applies only after that session restarts — canary Obs 1-2, `Claude Comms and Packages/Change Lists/B_TOKEN_ECONOMY_CANARY.md`):**
- `.claude/settings.local.json`: `autoCompactWindow: 250000` and `idleCompaction: false` (a 250k window, compaction near 87% of it).
- `.claude/agents/Explore.md`: Explore helpers run on Haiku. `.claude/agents/general-purpose.md`: default helpers on Sonnet — **only once it is committed**; until then it exists in PM's clone alone.
- Hooks: `alert-delta.mjs` (shadow mode; the full alert list is still injected), `warn-dedupe.mjs` (each warning kind once per session), `claude-md-cap.mjs` (silent while `CLAUDE.md` is under 78,000 B).

**Smoke check, per Claude session after its restart:** `get_usage(session_id)` shows `contextWindow` 250,000, and from any clone `node scripts/crew-tooling/claude-md-cap.mjs --report` and `node scripts/crew-tooling/move-ledger-check.mjs --dupes` both report OK. **A session still showing 1,000,000 has not restarted since the pull: name it to Kyle; never work around it.**

**Codex reads none of these files.** It reaches the same rules through `AGENTS.md`, which sends it to `CLAUDE.md`, whose pointers name every moved passage's home; the two checks run in CI for both crews. Whether a Codex setting can mirror the 250k window is the P3 Codex canary, not yet run (its config is per user, `~/.codex/config.toml`).
