#!/usr/bin/env python3
"""
cc-comms-bridge — replaces OpenClaw `ccdt-relay`.

Two responsibilities:
1. Long-poll @CCDTCommsBot for inbound messages (Kyle direct, or Langston's
   bot replies in the group), append to /var/log/cc-bridge-inbox.jsonl for
   Claude Code to tail via SSH.
2. Provide a `send` mode for outbound — post messages via @CCDTCommsBot.
   Replaces `openclaw message send --account ccdt-relay ...`.

Daemon mode (default): no args, runs the polling loop.
Send mode: `cc-comms-bridge.py send --thread-id 21 --message "..."`.
"""
import argparse
import json
import os
import sys
import time
import traceback
import urllib.request
import urllib.parse
import urllib.error
from pathlib import Path

CCDT_BOT_TOKEN_FILE = "/etc/langston/ccdt-bot.env"
INBOX_LOG = "/var/log/cc-bridge-inbox.jsonl"
STATE_FILE = "/var/lib/cc-comms-bridge/state.json"
DAEMON_LOG = "/var/log/cc-comms-bridge.log"

GROUP_ID = -1003575211453
KYLE_USER_ID = 8734856533
LANGSTON_BOT_ID = 7953472847

POLL_TIMEOUT = 25


def log(msg):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line, file=sys.stderr, flush=True)
    try:
        Path(DAEMON_LOG).parent.mkdir(parents=True, exist_ok=True)
        with open(DAEMON_LOG, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def load_token():
    for line in Path(CCDT_BOT_TOKEN_FILE).read_text().splitlines():
        line = line.strip()
        if line.startswith("TELEGRAM_BOT_TOKEN="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError("TELEGRAM_BOT_TOKEN not found")


def tg_request(method, params=None, timeout=30):
    tok = load_token()
    url = f"https://api.telegram.org/bot{tok}/{method}"
    if params:
        data = json.dumps(params).encode("utf-8")
        req = urllib.request.Request(url, data=data, method="POST",
                                     headers={"Content-Type": "application/json"})
    else:
        req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:300]
        log(f"TG {method} HTTP {e.code}: {body}")
        return None
    except Exception as e:
        log(f"TG {method} error: {type(e).__name__}: {e}")
        return None


def load_state():
    if Path(STATE_FILE).exists():
        try:
            return json.loads(Path(STATE_FILE).read_text())
        except Exception:
            log("state corrupt, starting fresh")
    return {"last_update_id": 0}


def save_state(s):
    Path(STATE_FILE).parent.mkdir(parents=True, exist_ok=True)
    Path(STATE_FILE).write_text(json.dumps(s, indent=2))


def append_inbox(entry):
    Path(INBOX_LOG).parent.mkdir(parents=True, exist_ok=True)
    with open(INBOX_LOG, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def daemon():
    log("cc-comms-bridge daemon starting")
    state = load_state()
    save_state(state)
    consecutive_errors = 0
    while True:
        try:
            updates = tg_request(
                "getUpdates",
                {"offset": state["last_update_id"] + 1,
                 "timeout": POLL_TIMEOUT,
                 "allowed_updates": ["message"]},
                timeout=POLL_TIMEOUT + 10,
            )
            if updates is None:
                consecutive_errors += 1
                wait = min(60, 2 ** min(consecutive_errors, 5))
                time.sleep(wait)
                continue
            consecutive_errors = 0
            if not updates.get("ok"):
                time.sleep(5)
                continue
            for update in updates.get("result", []):
                state["last_update_id"] = max(state["last_update_id"], update["update_id"])
                msg = update.get("message")
                if not msg:
                    continue
                sender = msg.get("from") or {}
                chat = msg.get("chat") or {}
                entry = {
                    "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                    "update_id": update["update_id"],
                    "message_id": msg.get("message_id"),
                    "chat_id": chat.get("id"),
                    "chat_type": chat.get("type"),
                    "thread_id": msg.get("message_thread_id"),
                    "sender_id": sender.get("id"),
                    "sender_username": sender.get("username"),
                    "sender_is_bot": sender.get("is_bot", False),
                    "text": msg.get("text") or msg.get("caption") or "",
                    "reply_to_id": (msg.get("reply_to_message") or {}).get("message_id"),
                }
                append_inbox(entry)
                log(f"inbox: msg {entry['message_id']} from {entry['sender_username']} chat={entry['chat_id']} thread={entry['thread_id']}: {entry['text'][:80]}")
                # B79.0c (2026-05-09): auto-ACK on inbound — restore OpenClaw-era UX.
                # Skip ACK on bot messages (CC own outbound + LangstonDTBot) so we
                # do not loop or clutter. ACK every human inbound (DM + group).
                if not entry["sender_is_bot"]:
                    ack_text = f"✅ Logged (msg {entry['message_id']}) — CC will see this at next session start. For real-time, use the Claude Desktop conversation."
                    # Try ACKing in the originating thread first; if Telegram refuses
                    # (e.g. # General forum topic closed to bot replies), fall back
                    # to topic 21 (Batch Implementations) where the bot has confirmed
                    # write access. This guarantees Kyle gets an ACK SOMEWHERE.
                    primary_params = {
                        "chat_id": entry["chat_id"],
                        "text": ack_text,
                        "allow_sending_without_reply": True,
                    }
                    if entry["thread_id"] is not None:
                        primary_params["message_thread_id"] = entry["thread_id"]
                    if entry["chat_type"] != "private":
                        primary_params["reply_to_message_id"] = entry["message_id"]
                    try:
                        r = tg_request("sendMessage", primary_params)
                        if r and not r.get("ok") and entry["chat_type"] == "supergroup":
                            # Fallback to topic 21 with explicit reference back to the
                            # original chat/thread so Kyle can locate the message that
                            # was logged.
                            log(f"ack primary failed: {r.get('description')}; falling back to topic 21")
                            fallback_text = (
                                f"✅ Logged msg {entry['message_id']} from chat {entry['chat_id']} "
                                f"thread {entry['thread_id']}: '{(entry['text'] or '')[:120]}'"
                            )
                            tg_request("sendMessage", {
                                "chat_id": entry["chat_id"],
                                "message_thread_id": 21,
                                "text": fallback_text,
                                "allow_sending_without_reply": True,
                            })
                    except Exception as e:
                        log(f"ack send failed: {e}")
            save_state(state)
        except KeyboardInterrupt:
            log("KeyboardInterrupt, exit")
            break
        except Exception as e:
            log(f"main loop: {type(e).__name__}: {e}\n{traceback.format_exc()[:500]}")
            time.sleep(10)


def send(target, message, thread_id=None, reply_to=None):
    """Post a message via @CCDTCommsBot. Auto-chunks long text on \\n boundaries."""
    text = message
    LIMIT = 3800
    chunks = []
    while len(text) > LIMIT:
        cut = text.rfind("\n", 0, LIMIT)
        if cut < LIMIT // 2:
            cut = LIMIT
        chunks.append(text[:cut])
        text = text[cut:].lstrip("\n")
    chunks.append(text)
    first_id = None
    for i, c in enumerate(chunks):
        params = {"chat_id": target, "text": c}
        if thread_id:
            params["message_thread_id"] = int(thread_id)
        if i == 0 and reply_to:
            params["reply_to_message_id"] = int(reply_to)
            params["allow_sending_without_reply"] = True
        r = tg_request("sendMessage", params)
        if r is None or not r.get("ok"):
            print(f"chunk {i}: FAILED {r}", file=sys.stderr)
            return None
        if i == 0:
            first_id = r["result"]["message_id"]
        print(f"chunk {i}: id={r['result']['message_id']}")
        # Mirror outbound so Langston (and the unified log) see what main CC posted
        try:
            entry = {
                "ts": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
                "source": "cc-comms-bridge",
                "kind": "cc_outbound",
                "chat_id": int(target),
                "thread_id": int(thread_id) if thread_id else None,
                "message_id": r["result"]["message_id"],
                "reply_to": int(reply_to) if reply_to else None,
                "text": c,
            }
            with open(INBOX_LOG, "a") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
        except Exception as e:
            print(f"mirror append failed: {e}", file=sys.stderr)
    return first_id


def main():
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="cmd")
    sub.add_parser("daemon")
    s = sub.add_parser("send")
    s.add_argument("--target", default=str(GROUP_ID), help="chat_id (default: DawnTrader HQ group)")
    s.add_argument("--thread-id", default="21", help="forum topic thread ID (default: 21)")
    s.add_argument("--reply-to", default=None, help="message_id to reply to (optional)")
    s.add_argument("--message", required=True)
    args = parser.parse_args()
    if args.cmd in (None, "daemon"):
        daemon()
    elif args.cmd == "send":
        send(args.target, args.message, args.thread_id, args.reply_to)


if __name__ == "__main__":
    main()
