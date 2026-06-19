# Discord comms bridges — design spec (parallel build, no cutover)

**Author:** Claude Old (CC-A), 2026-06-19. **Goal:** stand up a fully testable Discord equivalent of the two Telegram bridges, running in parallel with zero changes to the live Telegram fabric, with an instant switch + instant rollback. Build now; switch later only after live tests pass.

Mirrors `comms-infra/telegram-reference/{langston-bridge.py, cc-comms-bridge}`. Reuses the exact inbox-log JSONL schema (so the wake watcher + §10.5 surfacing work unchanged) and the exact whisper.cpp voice pipeline.

---

## 1. The win being captured
Discord delivers one bot's messages to another bot (the `author.bot` flag exists because bots see each other's `MESSAGE_CREATE` events). So **CC↔Langston becomes an in-channel message exchange** — the entire §6.5 SSH-deliver / file-first / hung-instance apparatus is replaced by a normal `on_message` handler. Telegram blocks this at the platform level; Discord does not.

## 2. Components (all NEW; nothing existing is touched)
| New file | Role | Mirrors |
|---|---|---|
| `discord-langston-bridge.py` | gateway client for the Langston bot; on_message → claude-cli → reply in-channel; voice transcription | `langston-bridge.py` |
| `discord-cc-bridge.py` | gateway client for the CC bot; logs inbound (Kyle + Langston-bot) to inbox log; `send` CLI for outbound; voice transcription/ACK | `cc-comms-bridge` |
| `discord-langston-bridge.service` / `discord-cc-bridge.service` | systemd units | the two `.service` files |
| `/etc/langston/discord-langston-bot.env` / `discord-cc-bot.env` | bot tokens (Kyle-provisioned) | `telegram-bot.env` / `ccdt-bot.env` |
| `/etc/dawntrader/comms-active.env` | `COMMS_BACKEND=telegram` (the switch) | (new) |
| `cc-send` | dispatcher wrapper: routes outbound to telegram OR discord per `COMMS_BACKEND` | (new) |

## 3. Isolation during the parallel-run (the safety guarantee)
- Discord bridges write to a **SEPARATE** log: `/var/log/cc-discord-inbox.jsonl` (NOT the live `/var/log/cc-bridge-inbox.jsonl`). Same JSONL schema.
- The live Telegram services, their log, their state, and the existing wake watcher are **NOT modified at all**. Telegram keeps running exactly as today.
- The two channels are independent: Kyle posting in Discord triggers only the Discord-Langston bot; posting in Telegram triggers only the Telegram-Langston bot. No cross-talk, no double-answers.
- For testing, CC arms a SECOND wake watcher tailing the Discord log (the existing Telegram watcher is untouched).

## 4. Inbox-log schema (unchanged — wake filter depends on it)
Same `kind` values and fields the wake filter + §10.5 reader expect: `langston_inbound`, `langston_outbound`, `langston_silent`, `cc_outbound`, `voice_inbound`, `voice_inbound_failed`. Plus a `transport: "discord"` tag and Discord-native IDs (`guild_id`, `channel_id`, `author_id`) replacing Telegram's `chat_id`/`thread_id`/`sender_id` (both kept where sensible so the filter's username/text reads work). The wake filter keys off `text` + author identity, which are preserved.

## 5. Langston bot logic (discord-langston-bridge.py)
- Connect via gateway (discord.py), `intents.message_content = True`.
- `on_message(m)`: ignore if `m.author == self` (loop guard). Handle if `m.author.id == KYLE_DISCORD_ID` OR `m.author.id == CC_BOT_ID` (← bot-to-bot) AND channel == CONFIGURED_CHANNEL (or DM). Enqueue to the single-FIFO worker.
- Worker: `invoke_claude(prompt, session_id, model=claude-opus-4-8[1m], --permission-mode acceptEdits)` — identical to Telegram, including the "Session ID already in use" auto-UUID-rotation. `[SILENT]` / empty / bridge-error-in-group → no post (mirrored only). Else post the reply in-channel, chunked at **2000** chars (Discord limit; Telegram was 3800).
- Voice attachments (flag IS_VOICE_MESSAGE / `attachment.is_voice_message()`): download `.ogg` from CDN → same ffmpeg→whisper pipeline → transcript becomes the prompt. DM gets preview-ACK; channel stays silent (CC bot ACKs) — mirrors the Telegram race-fix.

## 6. CC bot logic (discord-cc-bridge.py)
- `daemon` mode: gateway client; `on_message(m)`: ignore self. Log Kyle's messages + the Langston-bot's messages to `/var/log/cc-discord-inbox.jsonl`. Auto-ACK human inbound (skip bots) — same as Telegram. Voice → transcribe → `voice_inbound` entry + preview-ACK.
- `send` mode: `discord-cc-bridge.py send --message "..."` posts to the configured channel via the CC bot (REST), chunked at 2000, mirrored as `cc_outbound`. This is what CC calls to talk.

## 7. Bot-to-bot loop safety
- Each bot hard-ignores its own messages (`author == self`).
- Langston answers only when addressed (Kyle, or CC-bot message in-channel) and returns `[SILENT]` by his CLAUDE.md §11 judgment otherwise → no runaway ping-pong (CC only posts when it has something to say; Langston only answers when it's his to answer).
- Optional belt-and-suspenders: Langston ignores CC-bot messages that don't contain an address token (e.g. "Langston" / a leading marker), tunable after the first live test.

## 8. Switch + instant rollback (the transition mechanism)
- **Single source of truth:** `/etc/dawntrader/comms-active.env` → `COMMS_BACKEND=telegram` (default) or `discord`.
- **Outbound** goes through `cc-send` which reads that var and dispatches to the right bridge. CC always calls `cc-send` (not the underlying bridge) — so flipping the var reroutes all of CC's outbound with no code change.
- **Wake watcher** tails BOTH inbox logs permanently (harmless; during parallel run it simply sees whichever channel has traffic). No flip needed there.
- **CC↔Langston:** once on Discord, Langston auto-responds in-channel — nothing to flip; CC just posts via `cc-send`.
- **SWITCH** = set `COMMS_BACKEND=discord` (one line). **ROLLBACK** = set it back to `telegram` (one line). The Telegram services are never stopped during the trial, so rollback is instant and lossless. Decommission Telegram only after a bake window, as its own later step.

## 9. Deploy (parallel; non-destructive)
1. `apt install -y python3-venv` on the box; create `/opt/discord-bridges/venv` with `discord.py`.
2. Drop the two `.py` + two `.service` files; Kyle provisions the two token env files + `comms-active.env`.
3. `systemctl enable --now discord-langston-bridge discord-cc-bridge`. Telegram services untouched.
4. CC arms the second (Discord-log) wake watcher for the test window.

## 10. Test battery (gates the switch)
Bot-to-bot CC→Langston→CC in-channel · Kyle→CC log+ACK · Kyle→Langston reply · voice note (Kyle) → transcript · wake watcher fires on Discord events · **phone push parity** (Discord mobile notification reaches Kyle — gates §6.10) · long chunked relay. All green + Kyle satisfied → switch. Any failure → stay on Telegram (no-op, since we never left).
