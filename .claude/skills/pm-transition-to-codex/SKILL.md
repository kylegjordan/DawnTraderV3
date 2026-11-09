---
name: pm-transition-to-codex
description: PM CREW HANDOVER TO CHATGPT ONLY - how PM Claude runs the move of the building crew from Claude Code to ChatGPT Codex (Kyle's SWITCH TO CODEX), so nothing is left un-handed-over and Kyle never has to chase a session himself. Covers the handover inventory, the crew-switch order, chasing receipts, Langston and Coltrane, open reviews, alerts and declaring it complete. NOT for the return to Claude (PM Codex runs that), NOT for a plain usage stop (that is pm-usage-stop).
---

# PM transition - Claude crew to ChatGPT (Codex) crew

Kyle, 2026-11-09: the last switch left "a lot of stuff that hadn't been handed over, and I didn't know that I needed to follow up with the session." **The PM owns the follow-up, not Kyle.** PM Claude runs the move to ChatGPT; PM Codex runs the move back (its own skill, from the build brief `1-system-manual/pm/reviews/2026-11-09_PM_CODEX_BUILD_BRIEF.md`).

## The machinery (built in B-CODEX-FAILOVER #1192; read it, do not re-derive it)
- **Kyle alone starts a switch** with one bare Discord line: `SWITCH TO CODEX` / `SWITCH TO CLAUDE`, or `<session> ON|OFF`, `LANGSTON ON|OFF` (`AGENTS.md` §5 orders; `comms-infra/crew-switch/crew-switch.py`).
- `crew-switch-watch` on the Helsinki box reads his line, posts each session its OUTGOING / ON-DUTY order by name, turns Langston's bridge off (on for a switch back), and keeps a checklist in `/var/lib/crew-switch/state.json`. `nag` re-sends to outgoing sessions that have not confirmed at 15 minutes, then hourly, and pings Kyle; after 24 hours the order closes EXPIRED.
- Each session confirms with `ssh root@204.168.141.77 'crew-switch ack <id> "<name>"'`. **`crew-switch status`** shows duty, open orders, the bridge and who has not confirmed.
- **Nothing can wake a closed Claude window or any Codex session. Kyle opens each Codex session by hand** (switch S2, 2026-10-16: no session confirmed until he opened all eight; `RUNNING_ISSUES` #731, the fix is plan row 1z, still queued).
- A receipt is only a name typed at a command. It proves nothing about what was handed over, so the PM checks the work itself.
- **The PM is not in `crew-switch` yet** (`CREWS` lists OLD, NEW, ANALYST, Infra). PM hands over by hand until PM Codex is built (KD-62).

## Before Kyle types the switch line
1. **Usage first.** If the Claude allowance is near the line, run `pm-usage-stop` first, or at least its Langston and scheduled-task steps. A Codex shift does not need the heartbeat or the daily Claude checks.
2. **Ask each building session for a handover block**, if allowance permits, written in its own `MEMORY_CC_<X>.md` POSITION block and pushed. If the sessions are already stopped, build the block yourself from their memory files, their stop lines on Discord and the plan. Each block must name:
   - the batch and step (`STEP: N of 11 · NEXT STEP`), and what exactly comes next;
   - every review sent to Langston and not answered (the Codex session re-sends it to Coltrane);
   - every deploy held or pending, with its sha;
   - every scheduled check or alert it owns, with its time (for example an observation read due Monday 21:30Z);
   - everything waiting on Kyle;
   - anything uncommitted or unpushed (should be none).
3. **Write the crew handover sheet**: `1-system-manual/pm/handovers/<YYYY-MM-DD>_claude-to-codex.md`, one section per session from step 2, plus Langston's open reviews, open alerts by owner, and the items waiting on Kyle. Commit and push it. This is what the incoming Codex sessions and PM Codex read, so the knowledge survives even if a session's own note is thin.
4. **Check every clone is synced** (read-only, in each folder `C:\DawnTraderV3-old|-new|-analyst|-infra`): `git fetch` then 0 behind, 0 ahead, no uncommitted files, no untracked work. Ask the owner to fix anything that is not, before the switch.
5. **Tell Kyle exactly what to do**, in plain language: post `SWITCH TO CODEX` on Discord, then open the four Codex sessions (one per folder, named in `AGENTS.md` §1), and which one starts the PM Codex build first (OLD Codex, KD-62).

## After Kyle types it
6. **Watch the order**, without polling in a loop: check `crew-switch status` after each Discord wake, or when Kyle returns. Chase any OUTGOING Claude session that has not confirmed (`send_message`). Tell Kyle, by name, which Codex sessions still need opening; he is the only one who can open them.
7. **Langston and Coltrane.** Confirm `Langston bridge: inactive/disabled`. Coltrane is the reviewer for the shift, woken by a post starting `Coltrane`.
8. **Your own handover to PM Codex** (until `crew-switch` covers the PM): update MEMORY_PM.md CURRENT POSITION with a "PM handover" block covering the pending Kyle decisions, the open KD ACKs, the follow-ups with their times, and where the handover sheet is. Push it. Until PM Codex is live, OLD Codex coordinates.

## Declare it complete only when ALL of these hold, then report to Kyle
- `crew-switch status`: no open order, every outgoing and incoming session confirmed, nothing EXPIRED or superseded with names missing.
- Every Codex session has read the handover sheet. Check that its first Discord post or commit names its batch and step correctly.
- Every unanswered Langston review has been re-sent to Coltrane.
- Every held deploy has an owner on the Codex side.
- The alert queue has an on-duty reader (Codex sessions read it by hand, acking under their own `codex-` actor name).
- The PM handover block is pushed.
**Report to Kyle in plain language:** who is on duty, what each session is working on, anything still missing and who is chasing it. Kyle should not have to follow up with anyone.

## Limits, stated
- Kyle must type the switch line and open the Codex sessions. Nothing automates either yet (plan row 1z).
- Receipts are self-asserted. The handover sheet and the git checks are the real evidence.
- Codex has no browser path for the staging check (Step 7): it marks the check "UI not yet checked" and asks Kyle to look at the page.
