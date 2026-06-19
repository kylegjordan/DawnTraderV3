# Discord Migration Feasibility Study + Cutover Plan

**Author:** Claude Old (CC-A). **Date:** 2026-06-19. **Status:** RESEARCH / DECISION-GRADE — not a batch yet.
**Motivation:** Telegram blocks bot-to-bot messaging at the platform level, which is the single root cause of the entire CC→Langston SSH-deliver workaround (CLAUDE.md §6.5 / §6.5.0 / §6.5.1). This study asks whether Discord removes that wall cleanly enough to justify migrating the three-way comms fabric.

---

## 0. Bottom line (read this first)

**Discord DOES solve the bot-to-bot problem, definitively.** A Discord bot receives `MESSAGE_CREATE` gateway events for messages posted by *other* bots — the `author.bot` boolean flag exists precisely because bots see each other's messages; the ubiquitous `if (message.author.bot) return;` line in tutorials is a *voluntary* filter, not an API restriction. Remove that filter and Langston's bot sees CC's bot's posts in real time. This collapses §6.5's entire SSH-deliver apparatus (file-first staging, hung-instance checking, fresh-UUID one-offs, verbatim relay) into a normal message handler.

**Recommendation: YES in principle, but NOT now, and NOT as a rushed rewrite.** This is a real win (kills a whole class of fragility — the FUSE-mount hangs in §8.2 runbook item 9, the acceptEdits hangs, the 0-byte-reply babysitting). But it is a from-scratch rewrite of two production bridges that are currently *working*, mid-Phase-19. Right sequencing: build it in parallel, prove it with a parallel-run window, cut over only when Discord round-trips are demonstrably as reliable as Telegram. Schedule it as a named batch in a cleanup window (Phase 16/20), not in the middle of the active-trading resurrection.

---

## 1. The four verification questions

### 1.1 Bot-to-bot messaging — ✅ WORKS (the whole point)
- Discord's gateway delivers `MESSAGE_CREATE` for bot-authored messages to every bot in the channel with the `MESSAGE_CONTENT` intent. Confirmed against Discord developer docs + community guides (the `author.bot` flag is the tell).
- **Requirement:** the `MESSAGE_CONTENT` privileged intent must be toggled ON in each bot's Developer Portal page. Under 100 servers this is a self-serve toggle (we run exactly ONE private server). The 100-server *application/whitelist* gate does not apply to us.
- **Consequence:** CC posts in the shared channel → Langston's gateway connection receives it → Langston reasons and replies in the channel → CC's gateway receives *that*. True peer-to-peer, no SSH, no claude-cli one-offs, no file-first staging, no hung-instance babysitting. The §6.5 family of rules largely retires.

### 1.2 Voice notes — ✅ WORKS, pipeline unchanged
- Kyle's voice notes arrive as Discord **voice messages**: an `.ogg` (Opus) attachment carrying a `duration_secs` + `waveform`. A bot with `MESSAGE_CONTENT` reads the attachment and downloads the `.ogg` from Discord's CDN.
- Our existing transcription pipeline (whisper.cpp v1.8.4 + ffmpeg Ogg→WAV, §8 voice) is **reused as-is** — only the *fetch* step changes (Discord CDN URL instead of Telegram `getFile`). Opus is already what Telegram sends, so ffmpeg's input path is identical.

### 1.3 Rate limits — ✅ NON-ISSUE at our volume
- Global: 50 requests/second/bot. Per-route buckets (e.g. message-send) are far above our traffic (a handful of messages per minute at peak). We will never approach these.

### 1.4 Fees — ✅ FREE
- Discord bots are free. No API fees, no message fees. Self-hosting stays on the same Hetzner box; the only cost is the rewrite effort.

---

## 2. Architecture mapping (Telegram → Discord)

| Concern | Telegram now | Discord after |
|---|---|---|
| Transport | `getUpdates` long-poll (single-poller; 409 conflict if two clients) | **Gateway WebSocket** (push; no single-poller conflict; lower latency) |
| Langston inbound | `langston-bridge.service` polls `@LangstonDTBot` → claude-cli | Same service, rewritten to a gateway client (discord.py/discord.js) |
| CC inbound/outbound | `cc-comms-bridge.service` polls `@CCDTCommsBot` + send CLI | Same service, gateway client + send CLI |
| **CC→Langston delivery** | **SSH + claude-cli direct (the workaround)** | **Just a channel message** — bot-to-bot delivers it |
| Channel | Forum topic 21 | One text channel in a private guild |
| Unified inbox log | `/var/log/cc-bridge-inbox.jsonl` | **Unchanged** — bridges still write the same JSONL |
| Wake watcher | tails the inbox log | **Unchanged** — same log, same filter, same aliases |
| Voice | Telegram `getFile` → whisper.cpp | Discord CDN fetch → whisper.cpp (same) |
| Kyle's phone push | Telegram mobile push | Discord mobile push (must verify @-mention/channel-notify reaches phone — gates §6.10 blocked-notify) |

**Key structural simplification:** because the inbox-log format and the wake watcher are downstream of the bridges, they do *not* change. The migration is contained to the two bridge programs + the bot registrations. Everything that reads the log (wake watcher, §10.5 surfacing, CC's tail-reads) is untouched.

---

## 3. What retires when this lands
- §6.5.0 file-first large-prompt protocol (the API-hang dodge) — **gone** (no claude-cli stdin path).
- §6.5.0.a embed-diff-inline, §6.5.0.b hung-instance checking — **gone** (no SSH dispatch to babysit).
- §6.5.1 two-step visibility+delivery, fresh-UUID, verbatim-relay — **gone** (Langston replies in-channel directly).
- §8.2 runbook item 9 (FUSE-mount hang on long reviews) — **mostly gone** (Langston still reads repo files, but the comms path no longer rides claude-cli over SSH).
- The acceptEdits-mode claude-cli hang failure mode — **gone**.

These are the bulk of the comms fragility we actively manage. That is the real prize, beyond "bot-to-bot works."

---

## 4. Risks / open items
1. **Rewrite of two working production services.** Non-trivial; must not break the live wake/alert fabric during the swap. Mitigated by parallel-run (§5).
2. **`MESSAGE_CONTENT` is a *privileged* intent.** Self-serve under 100 servers today, but it is Discord policy and could tighten. Low risk for a 1-server private setup; note it.
3. **Phone push parity.** Must verify Discord mobile push reliably reaches Kyle (it gates the §6.10 blocked-notify escalation + the Langston-flagged-approval relay). Test before decommissioning Telegram.
4. **Message length.** Discord caps at 2000 chars/message vs Telegram's 4096 → more chunking for long Langston relays. Minor; the chunker already exists.
5. **Langston's gateway connection must stay alive 24/7** like the current poll loop. Same systemd-service reliability bar; gateway reconnect logic is standard in the libraries.
6. **OAuth/token model differs** (Discord bot token vs Telegram bot token) — straightforward, but new secrets to provision at `/etc/langston/`.

---

## 5. Parallel-run cutover plan (no big-bang)
1. **Provision** two Discord bot applications + one private guild with a channel mirroring topic 21. Toggle `MESSAGE_CONTENT` on both. Store tokens at `/etc/langston/`.
2. **Build** the two gateway bridges alongside the Telegram ones — they write to the **same** `/var/log/cc-bridge-inbox.jsonl` (or a parallel log during the trial) so the wake watcher and §10.5 surfacing keep working unchanged.
3. **Parallel-run window:** both Telegram and Discord live simultaneously. Exercise: Kyle→CC, Kyle→Langston, **CC↔Langston bot-to-bot** (the new capability), voice note, long chunked relay, phone push. Verify each round-trips on Discord with parity to Telegram.
4. **Bake** for a defined window (e.g. one week) with both up; watch for gateway drops, missed events, push failures.
5. **Cut over:** point the wake watcher + CC's read-taps at the Discord log exclusively; switch CC↔Langston to in-channel (retire the SSH-deliver path).
6. **Decommission** Telegram bridges only after Discord proves out. Keep the Telegram services dormant-but-restorable for one more window as rollback.
7. **Governance:** rewrite CLAUDE.md §6 + §8 to the Discord model; retire §6.5.0/.0a/.0b/.1; update SIM (comms components) ; log the Telegram bridge removal in DELETED_COMPONENTS_LOG.md per §5 rule 18.

---

## 6. Recommendation to Kyle (plain-language summary lives in chat)
Migrate — but deliberately. Discord removes the biggest standing source of comms fragility (the whole reason the two AI helpers can't talk to each other directly today, plus the hangs we babysit). It is free and the volume is trivial. But it is a rewrite of two pieces that currently *work*, so do it as its own scheduled batch in a cleanup window with a real parallel-run trial — not mid-resurrection, and not as a flip-the-switch swap. Suggested home: a named batch in Phase 16/20 (the hardening/cleanup window), with the parallel-run trial as its verification gate.
