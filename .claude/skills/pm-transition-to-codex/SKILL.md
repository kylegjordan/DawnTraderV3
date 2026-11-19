---
name: pm-transition-to-codex
description: PM CREW HANDOVER TO CHATGPT ONLY - how PM Claude runs the move of the building crew from Claude Code to ChatGPT Codex when Kyle tells PM in the chat to switch, so nothing is left un-handed-over and Kyle never has to chase a session himself. Covers the handover inventory, the crew-switch order, chasing receipts, Langston and Coltrane, open reviews, alerts and declaring it complete. NOT for the return to Claude (PM Codex runs that), NOT for a plain usage stop (that is pm-usage-stop).
---

# PM transition - Claude crew to ChatGPT (Codex) crew

Kyle, 2026-11-09: the last switch left "a lot of stuff that hadn't been handed over, and I didn't know that I needed to follow up with the session." **The PM owns the follow-up, not Kyle.** PM Claude runs the move to ChatGPT; PM Codex runs the move back (its own skill, from the build brief `1-system-manual/pm/reviews/2026-11-09_PM_CODEX_BUILD_BRIEF.md`).

## The machinery (built in B-CODEX-FAILOVER #1192; read it, do not re-derive it)
- **The trigger is Kyle telling you in the chat to switch (Kyle, 2026-11-09: "me telling you to make the switch, and then you make the switch. No need for me to post in Discord.").** You then issue the order yourself: `ssh root@204.168.141.77 'crew-switch start codex'`. That is the same order his Discord line `SWITCH TO CODEX` gives (`comms-infra/crew-switch/crew-switch.py`, `start()`); the Discord line still works if he prefers it. Never switch on your own judgement, on a session's request or on a usage reading alone: a usage stop is `pm-usage-stop`, and the switch needs his word.
- `crew-switch start` (or the watcher, `crew-switch-watch`, on his Discord line) posts each session its OUTGOING / ON-DUTY order by name, turns Langston's bridge off (on for a switch back), and keeps a checklist in `/var/lib/crew-switch/state.json`. `nag` re-sends to outgoing sessions that have not confirmed at 15 minutes, then hourly, and pings Kyle; after 24 hours the order closes EXPIRED.
- Each session confirms with `ssh root@204.168.141.77 'crew-switch ack <id> "<name>"'`. **`crew-switch status`** shows duty, open orders, the bridge and who has not confirmed.
- **Nothing can wake a closed Claude window or any Codex session. Kyle opens each Codex session by hand** (switch S2, 2026-10-16: no session confirmed until he opened all eight; `RUNNING_ISSUES` #731, the fix is plan row 1z, still queued).
- A receipt is only a name typed at a command. It proves nothing about what was handed over, so the PM checks the work itself.
- **The PM is not in `crew-switch` yet** (`CREWS` lists OLD, NEW, ANALYST, Infra). PM hands over by hand until PM Codex is built (KD-62).

## When Kyle says switch: before you issue the order
1. **Usage first.** If the Claude allowance is near the line, run `pm-usage-stop` first, or at least its Langston and scheduled-task steps. A Codex shift does not need the heartbeat or the daily Claude checks.
2. **Ask each building session for a handover block**, if allowance permits, written in its own `MEMORY_CC_<X>.md` POSITION block and pushed. If the sessions are already stopped (a usage stop came first), build the block yourself from their memory files, their stop lines on Discord and the plan. Each block must name:
   - the batch and step (`STEP: N of 11 · NEXT STEP`), and what exactly comes next;
   - every review sent to Langston and not answered (the Codex session re-sends it to Coltrane);
   - every deploy held or pending, with its sha;
   - every scheduled check or alert it owns, with its time (for example an observation read due Monday 21:30Z);
   - everything waiting on Kyle;
   - anything uncommitted or unpushed (should be none).
3. **Write the crew handover sheet**: `1-system-manual/pm/handovers/<YYYY-MM-DD>_claude-to-codex.md`, one section per session from step 2, plus Langston's open reviews, open alerts by owner, and the items waiting on Kyle. Commit and push it. This is what the incoming Codex sessions and PM Codex read, so the knowledge survives even if a session's own note is thin.
4. **Check every clone is synced** (read-only, in each folder `C:\DawnTraderV3-old|-new|-analyst|-infra`): `git fetch` then 0 behind, 0 ahead, no uncommitted files, no untracked work. Ask the owner to fix anything that is not, before the switch.
5. **Issue the order:** `ssh root@204.168.141.77 'crew-switch start codex'`, then `crew-switch status` must show the crew on CODEX, one open crew order, and `Langston bridge: inactive/disabled`. If the order did not post or the status disagrees, stop and tell Kyle what failed; do not retry blind.
6. **Tell Kyle exactly what is left for him**, in plain language: open the four Codex sessions (one per folder, named in `AGENTS.md` §1), and which one starts first (OLD Codex, for the PM Codex build, KD-62). Opening them is the one step nothing can do for him.

## After the order is out
7. **Watch the order**, without polling in a loop: check `crew-switch status` after each Discord wake, or when Kyle returns. Chase any OUTGOING Claude session that has not confirmed (`send_message`). Tell Kyle, by name, which Codex sessions still need opening; he is the only one who can open them.
8. **Langston and Coltrane.** Confirm `Langston bridge: inactive/disabled`. Coltrane is the reviewer for the shift, woken by a post starting `Coltrane`.
9. **Your own handover to PM Codex** (until `crew-switch` covers the PM): update MEMORY_PM.md CURRENT POSITION with a "PM handover" block covering the pending Kyle decisions, the open KD ACKs, the follow-ups with their times, and where the handover sheet is. Push it. Until PM Codex is live, OLD Codex coordinates.

## Declare it complete only when ALL of these hold, then report to Kyle
- `crew-switch status`: no open order, every outgoing and incoming session confirmed, nothing EXPIRED or superseded with names missing.
- Every Codex session has read the handover sheet. Check that its first Discord post or commit names its batch and step correctly.
- Every unanswered Langston review has been re-sent to Coltrane.
- Every held deploy has an owner on the Codex side.
- The alert queue has an on-duty reader (Codex sessions read it by hand, acking under their own `codex-` actor name).
- The PM handover block is pushed.
**Report to Kyle in plain language:** who is on duty, what each session is working on, anything still missing and who is chasing it. Kyle should not have to follow up with anyone.

## Limits, stated
- Kyle gives the word and opens the Codex sessions; PM issues the order. Nothing can open a Codex session yet (plan row 1z).
- Receipts are self-asserted. The handover sheet and the git checks are the real evidence.
- Codex has no browser path for the staging check (Step 7): it marks the check "UI not yet checked" and asks Kyle to look at the page.

## Token-economy settings and their smoke check (B-TOKEN-ECONOMY OBJ-9)
**The handover leaves these in the repo untouched.** Name them in the handover sheet so PM Codex's return run can verify them, and do not count the switch complete until the two repo checks below pass at the ref the Codex crew starts from.

**What the repo carries (Claude only; reaches each clone at pull, applies only after that session restarts — canary Obs 1-2, `Claude Comms and Packages/Change Lists/B_TOKEN_ECONOMY_CANARY.md`):**
- `.claude/settings.local.json`: `autoCompactWindow: 250000` and `idleCompaction: false` (a 250k window, compaction near 87% of it).
- `.claude/agents/Explore.md`: Explore helpers run on Haiku. `.claude/agents/general-purpose.md`: default helpers on Sonnet — **only once it is committed**; until then it exists in PM's clone alone.
- Hooks: `alert-delta.mjs` (shadow mode; the full alert list is still injected), `warn-dedupe.mjs` (each warning kind once per session), `claude-md-cap.mjs` (silent while `CLAUDE.md` is under 78,000 B).

**Smoke check, per Claude session after its restart:** `get_usage(session_id)` shows `contextWindow` 250,000, and from any clone `node scripts/crew-tooling/claude-md-cap.mjs --report` and `node scripts/crew-tooling/move-ledger-check.mjs --dupes` both report OK. **A session still showing 1,000,000 has not restarted since the pull: name it to Kyle; never work around it.**

**Codex reads none of these files.** It reaches the same rules through `AGENTS.md`, which sends it to `CLAUDE.md`, whose pointers name every moved passage's home; the two checks run in CI for both crews. Whether a Codex setting can mirror the 250k window is the P3 Codex canary, not yet run (its config is per user, `~/.codex/config.toml`).
