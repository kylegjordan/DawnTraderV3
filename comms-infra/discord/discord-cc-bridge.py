#!/usr/bin/env python3
"""
discord-cc-bridge.py — Discord gateway bridge for CC (Claude Code).

Mirrors comms-infra/telegram-reference/cc-comms-bridge. Two modes:

  daemon : gateway client. Logs inbound messages (Kyle + the Langston bot) to
           /var/log/cc-discord-inbox.jsonl so the wake watcher + §10.5 reader
           see them. Auto-ACKs human inbound (skips bots). Transcribes voice
           notes (whisper) → voice_inbound entry + preview ACK.

  send   : POST a message to the configured channel as the CC bot via REST.
           `discord-cc-bridge.py send --message "..."`  (chunked at 2000,
           mirrored as cc_outbound). This is how CC speaks on Discord.

Parallel-run: SEPARATE log from Telegram; live Telegram fabric untouched.
"""
import argparse
import datetime
import json
import os
import queue
import sys
import threading
import time
import traceback
from pathlib import Path

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import discord_common as dc
import gateway_watchdog as gw  # B-DISCORD-INBOUND-LIVENESS (#462): gateway receive-liveness watchdog

# Watchdog alert-cooldown marker (persisted across the os._exit→systemd restart cycle so a
# sustained outage alerts once per cooldown, not once per restart — Langston F2/Q1).
WATCHDOG_STATE = "/var/lib/discord-bridges/cc-gateway-alert-epoch"

BOT_TOKEN_FILE = "/etc/langston/discord-cc-bot.env"
LOG_FILE = "/var/log/discord-cc-bridge.log"
VOICE_ARCHIVE_ROOT = "/var/log/cc-bridge-voice-archive/discord-cc"

BOT_TOKEN = dc.load_env_value(BOT_TOKEN_FILE, "DISCORD_BOT_TOKEN")
CFG = dc.load_shared_config()


def log(msg):
    dc.log(msg, LOG_FILE)


def append_inbox(kind, **fields):
    entry = {
        "ts": datetime.datetime.now().astimezone().isoformat(),
        "source": "discord-cc-bridge",
        "transport": "discord",
        "kind": kind,
        **fields,
    }
    dc.append_inbox(entry)


# ─── Voice worker (transcribe + ACK), mirrors cc-comms-bridge ────────────────

def handle_voice_task(task):
    att = task["voice"]
    channel_id = task["channel_id"]
    message_id = task["message_id"]
    if att["size"] and att["size"] > dc.ATTACHMENT_SIZE_CAP:
        return fail_voice(task, "oversize", f"{att['size']}>{dc.ATTACHMENT_SIZE_CAP}")
    date_str = time.strftime("%Y-%m-%d")
    archive_dir = Path(VOICE_ARCHIVE_ROOT) / date_str
    archive_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(att["filename"]).suffix or ".ogg"
    archive_path = str(archive_dir / f"{message_id}{ext}")
    ok, size = dc.download_attachment(att["url"], archive_path, LOG_FILE)
    if not ok:
        return fail_voice(task, "download_failed", att["url"][:80])
    if size == 0:
        return fail_voice(task, "zero_byte_file", archive_path)
    log(f"voice: transcribing {archive_path} (size={size}B)")
    text, error, duration_ms = dc.transcribe_audio(archive_path, LOG_FILE)
    if text is None:
        return fail_voice(task, "transcription_failed", error, archive_path, duration_ms)
    append_inbox("voice_inbound",
                 channel_id=channel_id, message_id=message_id,
                 author_id=task["author_id"], sender_username=task["author_name"],
                 sender_is_bot=task["author_is_bot"], text=text,
                 transcription_source="whisper.cpp/ggml-small.en",
                 transcription_duration_ms=duration_ms,
                 audio_archive_path=archive_path, file_size=size)
    log(f"voice_inbound: msg {message_id} transcribed in {duration_ms}ms ({len(text)} chars)")
    # Post the FULL transcription (Kyle directive 2026-06-22: show the whole message, not a
    # 1-2 sentence preview) attributed as "Kyle voice note transcription" via the webhook so it
    # reads as Kyle's words, not a "DawnTrader CC" bot post. webhook_send auto-chunks at 2000.
    # The leading 🎙️ guarantees the body never STARTS with "Langston" → it cannot trip Langston's
    # address-gate (he already receives Kyle's voice directly via his own bridge; this ACK is
    # Kyle-visibility only — must not cause a double-process).
    label = "Kyle voice note transcription"
    if CFG.get("webhook_url"):
        dc.webhook_send(CFG["webhook_url"], label, f"🎙️ {text}", LOG_FILE)
    else:
        dc.rest_send(BOT_TOKEN, channel_id, f"🎙️ {label}: {text}", LOG_FILE)


def fail_voice(task, reason, details, archive_path=None, duration_ms=None):
    append_inbox("voice_inbound_failed",
                 channel_id=task["channel_id"], message_id=task["message_id"],
                 author_id=task["author_id"], failure_reason=reason,
                 details=str(details)[:500] if details else None,
                 audio_archive_path=archive_path, transcription_duration_ms=duration_ms)
    log(f"voice_inbound_failed: msg {task['message_id']} reason={reason}")
    dc.rest_send(BOT_TOKEN, task["channel_id"],
                 f"⚠️ Voice transcription failed (reason: {reason}). Please retry as text. (msg {task['message_id']})",
                 LOG_FILE)


def voice_worker(voice_q):
    HEARTBEAT = 60
    last_heartbeat = time.time()
    while True:
        try:
            try:
                task = voice_q.get(timeout=HEARTBEAT)
            except queue.Empty:
                if time.time() - last_heartbeat >= HEARTBEAT:
                    log("voice worker alive, queue depth=0")
                    last_heartbeat = time.time()
                continue
            try:
                handle_voice_task(task)
            except Exception as e:
                log(f"voice worker task error: {type(e).__name__}: {e}\n{traceback.format_exc()[:500]}")
            finally:
                voice_q.task_done()
        except Exception as e:
            log(f"voice worker outer error (resuming): {type(e).__name__}: {e}")
            time.sleep(1)


# ─── Gateway client (daemon mode) ────────────────────────────────────────────

def daemon():
    import discord
    log(f"discord-cc-bridge daemon starting. channel={CFG['channel_id']}")
    voice_q = queue.Queue()
    threading.Thread(target=voice_worker, args=(voice_q,), daemon=True, name="voice-worker").start()
    log("voice worker thread started")

    intents = discord.Intents.default()
    intents.message_content = True
    # enable_debug_events=True so on_socket_raw_receive fires — that frame (incl. the ~41s
    # heartbeat ACK) is the TRUE receive-liveness signal the watchdog tracks (#462).
    client = discord.Client(intents=intents, enable_debug_events=True)
    from collections import deque
    seen = deque(maxlen=512)
    seen_set = set()

    @client.event
    async def on_ready():
        log(f"gateway connected as {client.user} (id={client.user.id})")

    @client.event
    async def on_message(message):
        if message.author.id == client.user.id:
            return  # ignore own messages
        is_dm = message.guild is None
        if not is_dm and message.channel.id != CFG["channel_id"]:
            return
        # CC bridge logs ONLY Kyle's messages. The Langston bridge mirrors its own
        # langston_* entries, so logging bot messages here would double-log and confuse the
        # wake filter. (Review: removed the generic-bot logging + the redundant auto-ACK.)
        if message.author.id != CFG["kyle_id"]:
            return
        if message.id in seen_set:
            return
        if len(seen) == seen.maxlen:
            seen_set.discard(seen[0])
        seen.append(message.id)
        seen_set.add(message.id)

        base = {
            "channel_id": message.channel.id,
            "message_id": message.id,
            "author_id": message.author.id,
            "author_name": str(message.author),
            "author_is_bot": False,
        }
        voice = dc.detect_voice_attachment(message)
        if voice:
            voice_q.put({**base, "voice": voice})
            log(f"voice enqueued: msg {message.id} from {message.author}")
            return
        content = (message.content or "").strip()
        # B-COMMS-IMAGES: capture Kyle's image attachments. Metadata on-loop, DOWNLOAD
        # off-loop (executor) so a slow CDN can't stall the gateway. Save failures are
        # RECORDED, not swallowed — a failed save must never read as "no image" (#453).
        _imeta = dc.collect_image_meta(message)
        _media, _mfail = [], []
        if _imeta:
            _media, _mfail = await client.loop.run_in_executor(
                None, dc.save_image_meta, _imeta, message.id, LOG_FILE)
        _extra = {}
        if _media:
            _extra["media_paths"] = _media
        if _mfail:
            _extra["media_failed"] = _mfail
        # Kyle text inbound: empty kind so cc-wake-filter.py treats it as a Kyle message
        # (its Telegram convention) + sender_id present for any field-based filtering.
        append_inbox("", channel_id=message.channel.id, message_id=message.id,
                     author_id=message.author.id, sender_id=message.author.id,
                     sender_username=str(message.author), is_dm=is_dm, text=content, **_extra)
        log(f"inbox: Kyle msg {message.id}: {content[:80]}"
            + (f" [+{len(_media)} image(s)]" if _media else "")
            + (f" [!{len(_mfail)} save-FAILED]" if _mfail else ""))
        # No auto-ACK: redundant in a shared channel (Kyle sees his own message land; the
        # wake watcher wakes CC immediately). Removing it also avoids the on-loop blocking
        # send + a paid Langston turn per message (Langston review 1b/2a).

    # B-DISCORD-INBOUND-LIVENESS (#462): wire the receive-liveness watchdog. Coexists with the
    # on_ready/on_message above via add_listener. send() uses the gateway-INDEPENDENT REST path,
    # so the loud alert reaches Kyle even while receive is dead. replay_message=on_message reuses
    # this bridge's own (Kyle-only) logging for backfill. ssh §10.5 leg optional via env.
    _ssh = os.environ.get("WATCHDOG_SSH_ALERT_CMD") or None
    gw.install_watchdog(
        client,
        bridge_name="discord-cc-bridge",
        send_alert_fn=lambda m: send(m, notify=True),
        state_path=WATCHDOG_STATE,
        log_fn=log,
        inbox_log=dc.INBOX_LOG,
        channel_id=CFG["channel_id"],
        replay_message=on_message,
        ssh_alert_cmd=_ssh,
        # dedup backfill only against the kinds THIS bridge writes for inbound (Kyle text = "",
        # voice) — never against another bridge's rows for the same id (would false-skip a miss).
        dedup_kinds={"", "voice_inbound", "voice_inbound_failed"},
    )
    client.run(BOT_TOKEN, reconnect=True, log_handler=None)


def send(message, notify=False, sender=None, file=None):
    """Post a message to the configured channel. Mirrors as cc_outbound.

    sender ("Claude Old"/"Claude New"): if a webhook is configured, post via it with that
    display name (+ optional avatar) so the two CC sessions show as distinct senders. Falls
    back to a normal bot post (name "DawnTrader CC") when no webhook/sender is set.
    notify (Test 6 / §6.10): @-mention Kyle so Discord pushes a phone notification.
    file (B-COMMS-IMAGES): path ON THIS BOX to upload with the message (≤ dc.MEDIA_MAX_BYTES,
    fail-closed). File posts are single-message (no chunking): content caps at 2000 chars.
    """
    channel_id = CFG["channel_id"]
    mention = CFG["kyle_id"] if notify else None
    if file:
        if not os.path.isfile(file):
            print(f"send FAILED: --file not found on this box: {file}", file=sys.stderr)
            return None
        body = (f"<@{mention}> " + message) if mention else message
        if sender and CFG.get("webhook_url"):
            first_id = dc.send_file("webhook", None, CFG["webhook_url"], body, file, LOG_FILE,
                                    username=sender)
        else:
            first_id = dc.send_file("bot", BOT_TOKEN, channel_id, body, file, LOG_FILE)
        if first_id is None:
            print("send FAILED (file upload refused or failed — bridge log has the reason)", file=sys.stderr)
            return None
        append_inbox("cc_outbound", channel_id=channel_id, message_id=first_id, text=message,
                     notify=notify, sender=sender, media_paths=[file])
        print(f"sent id={first_id}")
        return first_id
    if sender and CFG.get("webhook_url"):
        avatar = CFG.get("avatars", {}).get(sender)
        first_id = dc.webhook_send(CFG["webhook_url"], sender, message, LOG_FILE,
                                   avatar_url=avatar, mention_user_id=mention)
    else:
        first_id = dc.rest_send(BOT_TOKEN, channel_id, message, LOG_FILE, mention_user_id=mention)
    if first_id is None:
        print("send FAILED", file=sys.stderr)
        return None
    for chunk in dc.chunk_text(message):
        append_inbox("cc_outbound", channel_id=channel_id, message_id=first_id, text=chunk,
                     notify=notify, sender=sender)
    print(f"sent id={first_id}")
    return first_id


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("daemon")
    s = sub.add_parser("send")
    s.add_argument("--message", required=True)
    s.add_argument("--notify", action="store_true", help="@-mention Kyle so Discord pushes a phone notification")
    s.add_argument("--sender", default=None, help='display name for webhook posts, e.g. "Claude Old" / "Claude New"')
    s.add_argument("--file", default=None, help="path ON THIS BOX to upload with the message (image etc.; fail-closed size cap)")
    args = parser.parse_args()
    if args.cmd in (None, "daemon"):
        daemon()
    elif args.cmd == "send":
        send(args.message, notify=args.notify, sender=args.sender, file=args.file)


if __name__ == "__main__":
    main()
