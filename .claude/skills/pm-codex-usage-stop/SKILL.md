---
name: pm-codex-usage-stop
description: PM CODEX CHATGPT ALLOWANCE STOP ONLY - stop and later resume every Codex-side consumer when Kyle's recorded ChatGPT usage line is reached. NOT a crew switch and never runs without Kyle's stop line and explicit resume word.
---

# PM Codex ChatGPT usage stop

This is the Codex-side equivalent of PM Claude's stop duty, not a copy of its mechanisms. It stops only ChatGPT/Codex allowance consumers. The Claude crew's tasks and Langston are controlled by the Claude procedure.

## Fixed facts and honest limits

- Read the percentage in **ChatGPT → Settings → Usage**. Record the percentage, local and UTC time, the reset time shown, and which allowance the screen names.
- The stop line is **92% of Codex weekly usage used**, as recorded in the `CODEX USAGE STOP LINE` in `MEMORY_PM.md` (Kyle, KD-71, 2026-11-10). If the memory value is absent or differs, stop and ask Kyle rather than guessing. Do not spend a rate-limit reset credit unless Kyle separately directs it.
- Consumers are the four building Codex chats, PM Codex, Coltrane's bot on the Helsinki box, and any active Codex Scheduled tasks. A chat spends only while a turn is running. The Windows Discord mirror and outbox tasks move files but do not invoke a model, so they stay on.
- Under KD-66, PM Codex can list, read, watch and send a stop instruction directly to each existing DawnTrader Codex chat. If a turn is already running, the instruction waits until that turn ends; an accepted message is not proof that the chat read or acted on it, so PM Codex must observe the reply or stopped state. This is a cooperative boundary stop, not an in-flight interrupt: until a direct interrupt control is exposed and proven, an immediately running turn still requires Kyle to press Stop if it cannot be allowed to finish.
- The current Codex conversation history has no crew backup. PM Codex's durable state is therefore the pushed PM notebook and handover sheet; never claim the ChatGPT conversation itself is backed up.

## Stop, only at or above Kyle's line

1. Re-read `MEMORY_PM.md`. If a stop is already active, do not create a second record.
2. Read ChatGPT usage. If it is below Kyle's line, record the reading and continue normal PM work. At or above the line, start one `CODEX USAGE STOP` block in CURRENT POSITION with the reading, reset, trigger and an initially empty checklist.
3. Inspect the five Codex chats and all five clone POSITION blocks. Send one complete direct stop instruction to each existing building chat, bring each task to the safest visible boundary, and watch for an acted-on reply; message acceptance alone does not close the item. Post one complete Discord line naming the five Codex identities and the stop reading. List for Kyle only a turn that must be interrupted immediately rather than allowed to reach its boundary.
4. Open the Codex app's **Scheduled** view and record every ACTIVE automation by exact name and id. Pause each active automation and read it back as PAUSED. If the app has no active automation, record `none` plus the checked time. Do not stop `codex-channel-mirror` or `codex-discord-outbox`; they do not use the ChatGPT allowance.
5. Run `ssh root@204.168.141.77 'crew-switch coltrane off'`, then `crew-switch status`. The command refuses while a Coltrane review is active rather than killing it. If refused, record the active review, wait for it to finish, and retry; never kill a Coltrane process by user or broad process name.
6. For each clone that changed, require a current POSITION block, explicit-path commit, push, and 0 behind / 0 ahead. Record the exact stopped list: five chats, Coltrane readback, paused Scheduled task names/ids, and anything that was already stopped.
7. Tell Kyle the stop is complete only after every direct instruction is visibly acted on, and name any in-flight turn that still needs his immediate Stop control. Then PM Codex stops working. A timer, heartbeat, Discord post or app reopen is not permission to resume.

## Resume, only on Kyle's words in PM Codex chat

1. Read the active stop block; reverse **that recorded list only**.
2. Run `crew-switch coltrane on` and require active/enabled readback.
3. Resume only the Scheduled task ids recorded as paused by this stop, and read each back ACTIVE.
4. Send the resume instruction directly to each existing Codex chat, then verify its reply and that it pulled and read its own POSITION block. A message accepted while another turn is active waits and is not proof of action. Ask Kyle to open a chat only if that chat no longer exists or no direct start/resume control has been proven for it.
5. Add the resume time and readbacks to the stop block. Do not issue `crew-switch start` unless Kyle separately asked for a crew transition.

## Token-economy settings and their smoke check (B-TOKEN-ECONOMY OBJ-9)
**A Codex allowance stop or resume changes none of these.** At a Codex resume, run only the two repo checks below from a Codex clone; the Claude settings are left exactly as they are.

**What the repo carries (Claude only; reaches each clone at pull, applies only after that session restarts — canary Obs 1-2, `Claude Comms and Packages/Change Lists/B_TOKEN_ECONOMY_CANARY.md`):**
- `.claude/settings.local.json`: `autoCompactWindow: 250000` and `idleCompaction: false` (a 250k window, compaction near 87% of it).
- `.claude/agents/Explore.md`: Explore helpers run on Haiku. `.claude/agents/general-purpose.md`: default helpers on Sonnet — **only once it is committed**; until then it exists in PM's clone alone.
- Hooks: `alert-delta.mjs` (shadow mode; the full alert list is still injected), `warn-dedupe.mjs` (each warning kind once per session), `claude-md-cap.mjs` (silent while `CLAUDE.md` is under 78,000 B).

**Smoke check, per Claude session after its restart:** `get_usage(session_id)` shows `contextWindow` 250,000, and from any clone `node scripts/crew-tooling/claude-md-cap.mjs --report` and `node scripts/crew-tooling/move-ledger-check.mjs --dupes` both report OK. **A session still showing 1,000,000 has not restarted since the pull: name it to Kyle; never work around it.**

**Codex reads none of these files.** It reaches the same rules through `AGENTS.md`, which sends it to `CLAUDE.md`, whose pointers name every moved passage's home; the two checks run in CI for both crews. The Codex mirror is complete: B-TOKEN-ECONOMY OBJ-3 Observation 6 proves the user-level 250,000-token total threshold loads in all five Codex roots and preserves continuity through compaction.
