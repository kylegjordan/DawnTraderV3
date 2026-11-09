---
name: pm-codex-usage-stop
description: PM CODEX CHATGPT ALLOWANCE STOP ONLY - stop and later resume every Codex-side consumer when Kyle's recorded ChatGPT usage line is reached. NOT a crew switch and never runs without Kyle's stop line and explicit resume word.
---

# PM Codex ChatGPT usage stop

This is the Codex-side equivalent of PM Claude's stop duty, not a copy of its mechanisms. It stops only ChatGPT/Codex allowance consumers. The Claude crew's tasks and Langston are controlled by the Claude procedure.

## Fixed facts and honest limits

- Read the percentage in **ChatGPT → Settings → Usage**. Record the percentage, local and UTC time, the reset time shown, and which allowance the screen names.
- The stop line is **85% of ChatGPT token usage used**, as recorded in the `CODEX USAGE STOP LINE` in `MEMORY_PM.md` (Kyle, 2026-11-09). If the memory value is absent or differs, stop and ask Kyle rather than guessing.
- Consumers are the four building Codex chats, PM Codex, Coltrane's bot on the Helsinki box, and any active Codex Scheduled tasks. A chat spends only while a turn is running. The Windows Discord mirror and outbox tasks move files but do not invoke a model, so they stay on.
- Codex has no reliable session-to-session message or wake route. A Discord stop line is a durable notice, not proof a Codex chat read it. PM Codex can identify the chats Kyle must stop or avoid opening; only Kyle can press Stop in another running chat.
- The current Codex conversation history has no crew backup. PM Codex's durable state is therefore the pushed PM notebook and handover sheet; never claim the ChatGPT conversation itself is backed up.

## Stop, only at or above Kyle's line

1. Re-read `MEMORY_PM.md`. If a stop is already active, do not create a second record.
2. Read ChatGPT usage. If it is below Kyle's line, record the reading and continue normal PM work. At or above the line, start one `CODEX USAGE STOP` block in CURRENT POSITION with the reading, reset, trigger and an initially empty checklist.
3. Inspect the five Codex chats and all five clone POSITION blocks. Bring each running task to the safest visible boundary. Post one complete Discord line naming the five Codex identities and the stop reading. Because it wakes nobody, list for Kyle any chat whose running turn he must stop by hand.
4. Open the Codex app's **Scheduled** view and record every ACTIVE automation by exact name and id. Pause each active automation and read it back as PAUSED. If the app has no active automation, record `none` plus the checked time. Do not stop `codex-channel-mirror` or `codex-discord-outbox`; they do not use the ChatGPT allowance.
5. Run `ssh root@204.168.141.77 'crew-switch coltrane off'`, then `crew-switch status`. The command refuses while a Coltrane review is active rather than killing it. If refused, record the active review, wait for it to finish, and retry; never kill a Coltrane process by user or broad process name.
6. For each clone that changed, require a current POSITION block, explicit-path commit, push, and 0 behind / 0 ahead. Record the exact stopped list: five chats, Coltrane readback, paused Scheduled task names/ids, and anything that was already stopped.
7. Tell Kyle the stop is complete and what, if anything, he must stop by hand. Then PM Codex stops working. A timer, heartbeat, Discord post or app reopen is not permission to resume.

## Resume, only on Kyle's words in PM Codex chat

1. Read the active stop block; reverse **that recorded list only**.
2. Run `crew-switch coltrane on` and require active/enabled readback.
3. Resume only the Scheduled task ids recorded as paused by this stop, and read each back ACTIVE.
4. Tell Kyle which Codex chats to reopen. Each pulls and reads its own POSITION block before work. A Discord message cannot do this for him.
5. Add the resume time and readbacks to the stop block. Do not issue `crew-switch start` unless Kyle separately asked for a crew transition.
