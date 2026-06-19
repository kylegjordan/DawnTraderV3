# Discord bridges — test + switch + rollback runbook

The concrete operational checklist. Build is done + committed; this is what CC executes once Kyle provisions the tokens/IDs. Nothing here touches the live Telegram fabric until the explicit SWITCH step, which is one line and instantly reversible.

## Pre-req (Kyle, one-time) — see DISCORD_SETUP_KYLE_CHECKLIST.md
- Discord account + private server + 1 channel.
- Two bot apps ("DawnTrader CC", "Langston"), MESSAGE_CONTENT intent ON for both, both invited to the server.
- Provide / place: CC bot token, Langston bot token, channel ID, Kyle's Discord user ID (guild ID optional).

## Deploy (parallel, non-destructive)
1. scp `comms-infra/discord/{discord_common.py, discord-langston-bridge.py, discord-cc-bridge.py, *.service, cc-send, comms-active.env}` → `/opt/discord-bridges/` on 204.168.141.77.
2. Provision (Kyle's values):
   - `/etc/langston/discord-cc-bot.env`        → `DISCORD_BOT_TOKEN=<CC token>`  (chmod 640 root:langston)
   - `/etc/langston/discord-langston-bot.env`  → `DISCORD_BOT_TOKEN=<Langston token>` (chmod 640 root:langston)
   - `/etc/dawntrader/discord-comms.env`       → from template (channel + kyle + guild IDs)
3. Run `bash /opt/discord-bridges/deploy.sh` (sets up venv+discord.py, installs the two services, leaves Telegram untouched).
4. Verify: `systemctl is-active discord-cc-bridge discord-langston-bridge` → active; `langston-bridge cc-comms-bridge` → still active.
5. CC arms a SECOND wake watcher tailing the Discord log (Telegram watcher stays as-is):
   `tail -F /var/log/cc-discord-inbox.jsonl | python3 cc-wake-filter.py CC-A` (added to the existing watcher's source list).

## Test battery (all must pass before SWITCH)
| # | Test | How | Pass criteria |
|---|---|---|---|
| 1 | Kyle→CC log+ACK | Kyle posts in the Discord channel | `discord_inbound` in cc-discord-inbox.jsonl + ✅ ACK appears |
| 2 | Kyle→Langston reply | Kyle posts a question | Langston bot replies in-channel; `langston_inbound`+`langston_outbound` logged |
| 3 | **Bot-to-bot CC→Langston** | `cc-send` (backend=discord, temporarily) posts a message addressed to Langston | Langston's bot SEES the CC-bot message + replies in-channel — the capability Telegram blocks |
| 4 | Voice note | Kyle sends a Discord voice message | transcript in log + ✅ preview ACK |
| 5 | Wake watcher | any of the above | CC session wakes on the Discord event |
| 6 | **Phone push parity** | Kyle backgrounds the app; CC posts with `cc-send --notify` (@-mentions Kyle) OR channel set to All Messages | Discord mobile push reaches Kyle's phone (gates §6.10 blocked-notify). Plain posts do NOT notify by default — must @-mention or set All Messages |
| 7 | Long chunked relay | post a >2000-char message via cc-send | arrives as clean multi-part, no truncation |

Document results inline in this file under a "## Test run <date>" heading. Any failure → do NOT switch (no-op; we never left Telegram).

## ⚠️ Trial-window constraint (Langston review 3): drive ONE channel at a time
Inbound on BOTH transports stays live during parallel-run AND after the switch (Telegram keeps receiving until decommission — "dormant" describes outbound only). Because `cc-send` routes by the global `COMMS_BACKEND`, a message posted in the *other* channel would get its reply routed to the active one. So during the trial and the post-switch bake: **post in only one channel at a time.** Also note the two Langston brains (Telegram-Langston and Discord-Langston have separate session state) — don't expect shared context across channels.

## SWITCH (only after all 7 green + Kyle satisfied)
- `echo 'COMMS_BACKEND=discord' > /etc/dawntrader/comms-active.env`
- From now CC posts via `cc-send` → Discord (add `--notify` on must-reach-phone messages → @-mention push); Langston auto-responds in-channel; wake watcher already tails both logs.
- Telegram services LEFT RUNNING (outbound fallback; still receiving — drive one channel).
- Update CLAUDE.md §6/§8 to the Discord model; retire §6.5.0/.0a/.0b/.1; SIM comms-component update; per §5 rule 18 the eventual Telegram removal goes in DELETED_COMPONENTS_LOG.md (later step, after a bake window).

## ROLLBACK (instant, lossless)
- `echo 'COMMS_BACKEND=telegram' > /etc/dawntrader/comms-active.env`
- CC's outbound returns to Telegram immediately; Langston-Telegram bridge was never stopped. Done.

## Decommission Telegram (LATER — only after a clean bake window on Discord)
- Stop+disable `langston-bridge cc-comms-bridge`; archive per §5 rule 18; log in DELETED_COMPONENTS_LOG.md.
