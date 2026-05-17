#!/usr/bin/env python3
"""
Langston Telegram bridge.

Polls Telegram getUpdates for messages directed at @LangstonDTBot, invokes
Claude Code in print mode with a stable session-id (so conversation context
persists across invocations), and posts the reply back to Telegram.

Filtering:
- Sender must be Kyle (user ID 8734856533).
- DM messages: handled.
- Group messages: only the DawnTrader HQ group (-1003575211453), topic 21,
  AND must @mention the bot OR be a reply to one of the bot's messages.

State at /home/langston/.langston-bridge-state.json: tracks last_update_id
(Telegram offset cursor) and session_id (Claude Code conversation UUID).
Session UUID is stable for the life of the bridge; rotate by deleting the
state file.
"""
import json
import os
import subprocess
import sys
import time
import traceback
import urllib.request
import urllib.parse
import urllib.error
import uuid
from pathlib import Path

# Config
BOT_TOKEN_FILE = "/etc/langston/telegram-bot.env"
OAUTH_TOKEN_FILE = "/etc/langston/oauth.env"
WORK_DIR = "/home/langston"
MIRROR_LOG = "/var/log/cc-bridge-inbox.jsonl"  # shared with cc-comms-bridge so main CC sees Langston traffic
STATE_FILE = "/home/langston/.langston-bridge-state.json"
LOG_FILE = "/var/log/langston-bridge.log"

# Identity
KYLE_USER_ID = 8734856533
CC_RELAY_USER_ID = 8758978168
ALLOWED_SENDERS = {KYLE_USER_ID, CC_RELAY_USER_ID}
GROUP_ID = -1003575211453
TOPIC_ID = 21  # Batch Implementation
BOT_USERNAME = "LangstonDTBot"

POLL_TIMEOUT = 25
CLAUDE_TIMEOUT = 900  # 15 min cap on one Claude invocation


def log(msg):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line, file=sys.stderr, flush=True)
    try:
        with open(LOG_FILE, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def load_token(path, key):
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError(f"{key} not found in {path}")


BOT_TOKEN = load_token(BOT_TOKEN_FILE, "TELEGRAM_BOT_TOKEN")
OAUTH_TOKEN = load_token(OAUTH_TOKEN_FILE, "CLAUDE_CODE_OAUTH_TOKEN")
TG_API = f"https://api.telegram.org/bot{BOT_TOKEN}"


def mirror_event(kind, **fields):
    """Append a JSON line to the shared inbox log so main CC sees it."""
    import datetime
    entry = {"ts": datetime.datetime.now().astimezone().isoformat(), "source": "langston-bridge", "kind": kind, **fields}
    try:
        with open(MIRROR_LOG, "a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception as e:
        log(f"mirror write failed: {e}")


def load_state():
    if Path(STATE_FILE).exists():
        try:
            return json.loads(Path(STATE_FILE).read_text())
        except Exception:
            log("state file corrupt, starting fresh")
    return {"last_update_id": 0, "session_id": str(uuid.uuid4())}


def save_state(state):
    Path(STATE_FILE).write_text(json.dumps(state, indent=2))


def tg_request(method, params=None, timeout=30):
    url = f"{TG_API}/{method}"
    if params:
        # Use JSON body for params with embedded JSON arrays/objects.
        data = json.dumps(params).encode("utf-8")
        req = urllib.request.Request(
            url, data=data, method="POST",
            headers={"Content-Type": "application/json"},
        )
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


def get_updates(offset, timeout):
    return tg_request(
        "getUpdates",
        {"offset": offset, "timeout": timeout, "allowed_updates": ["message"]},
        timeout=timeout + 10,
    )


def send_message(chat_id, text, thread_id=None, reply_to=None):
    """Send. Returns the Telegram message_id of the first chunk, or None on failure."""
    if not text:
        text = "_(empty response)_"
    chunks = []
    # Conservative chunk size — Telegram limit is 4096 but Markdown can expand.
    LIMIT = 3800
    while len(text) > LIMIT:
        cut = text.rfind("\n", 0, LIMIT)
        if cut < LIMIT // 2:
            cut = LIMIT
        chunks.append(text[:cut])
        text = text[cut:].lstrip("\n")
    chunks.append(text)

    first_id = None
    for i, chunk in enumerate(chunks):
        params = {"chat_id": chat_id, "text": chunk, "parse_mode": "Markdown"}
        if thread_id:
            params["message_thread_id"] = thread_id
        if i == 0 and reply_to:
            params["reply_to_message_id"] = reply_to
            params["allow_sending_without_reply"] = True
        r = tg_request("sendMessage", params)
        if r is None or not r.get("ok"):
            # Fallback: retry without parse_mode (Markdown parse errors common)
            params.pop("parse_mode", None)
            r = tg_request("sendMessage", params)
        if r and r.get("ok") and i == 0:
            first_id = r["result"]["message_id"]
    return first_id


def react(chat_id, message_id, emoji="👀"):
    tg_request(
        "setMessageReaction",
        {"chat_id": chat_id, "message_id": message_id, "reaction": [{"type": "emoji", "emoji": emoji}]},
    )


def should_handle(msg):
    """Return (handle: bool, cleaned_text: str)."""
    sender = msg.get("from") or {}
    if sender.get("id") not in ALLOWED_SENDERS:
        return False, ""
    chat = msg.get("chat") or {}
    chat_id = chat.get("id")
    text = msg.get("text") or msg.get("caption") or ""

    # DM
    if chat.get("type") == "private":
        return True, text.strip()

    # Group: pass every message in topic 21 from allowed senders to Langston.
    # He uses judgment to decide whether to respond (returns [SILENT] when not his to answer).
    # See his CLAUDE.md §"When to respond in the group" for the decision rules.
    if chat_id == GROUP_ID:
        thread_id = msg.get("message_thread_id")
        if thread_id != TOPIC_ID:
            return False, ""
        # Strip any @LangstonDTBot mentions for cleanliness (don't require them)
        mention = f"@{BOT_USERNAME}"
        cleaned = text
        for m in (mention, mention.lower(), mention.upper()):
            cleaned = cleaned.replace(m, "")
        return True, cleaned.strip()

    return False, ""


def invoke_claude(prompt, session_id):
    env = os.environ.copy()
    env["CLAUDE_CODE_OAUTH_TOKEN"] = OAUTH_TOKEN
    env["HOME"] = WORK_DIR
    env["PATH"] = "/usr/local/bin:/usr/bin:/bin"

    args = [
        "/usr/bin/claude",
        "-p", prompt,
        "--session-id", session_id, "--model", "claude-opus-4-7",
        "--permission-mode", "acceptEdits",
    ]
    log(f"invoking claude (prompt={len(prompt)} chars, session={session_id[:8]}...)")
    t0 = time.time()
    try:
        result = subprocess.run(
            args, env=env, cwd=WORK_DIR,
            capture_output=True, text=True, timeout=CLAUDE_TIMEOUT,
        )
        elapsed = time.time() - t0
        if result.returncode != 0:
            log(f"claude exit {result.returncode} after {elapsed:.1f}s: stderr={result.stderr[:300]}")
            return f"_Langston bridge error: claude returned exit code {result.returncode}_\n\n```\n{result.stderr[:1500]}\n```"
        log(f"claude returned {len(result.stdout)} chars in {elapsed:.1f}s")
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        log(f"claude timeout after {CLAUDE_TIMEOUT}s")
        return "_Langston bridge: claude invocation timed out (15 min cap)_"
    except Exception as e:
        log(f"claude invoke error: {type(e).__name__}: {e}")
        return f"_Langston bridge: invoke error — {type(e).__name__}: {e}_"


def main():
    state = load_state()
    save_state(state)
    log(f"Langston bridge starting. session_id={state['session_id']} last_update_id={state['last_update_id']}")

    consecutive_errors = 0
    while True:
        try:
            updates = get_updates(state["last_update_id"] + 1, POLL_TIMEOUT)
            if updates is None:
                consecutive_errors += 1
                wait = min(60, 2 ** min(consecutive_errors, 5))
                log(f"poll error #{consecutive_errors}, sleeping {wait}s")
                time.sleep(wait)
                continue
            consecutive_errors = 0
            if not updates.get("ok"):
                log(f"getUpdates not ok: {updates}")
                time.sleep(5)
                continue

            for update in updates.get("result", []):
                state["last_update_id"] = max(state["last_update_id"], update["update_id"])
                msg = update.get("message")
                if not msg:
                    continue
                try:
                    handle, cleaned = should_handle(msg)
                except Exception as e:
                    log(f"should_handle error: {e}")
                    continue
                if not handle:
                    continue
                chat_id = msg["chat"]["id"]
                thread_id = msg.get("message_thread_id")
                msg_id = msg["message_id"]
                log(f"handling msg {msg_id} chat={chat_id} thread={thread_id}: {cleaned[:120]}")
                mirror_event("langston_inbound", chat_id=chat_id, thread_id=thread_id, message_id=msg_id, sender_id=(msg.get("from") or {}).get("id"), sender_username=(msg.get("from") or {}).get("username"), text=cleaned)
                try:
                    react(chat_id, msg_id, "👀")
                except Exception:
                    pass
                response = invoke_claude(cleaned, state["session_id"])
                # Strip leading/trailing whitespace and check for SILENT marker
                resp_stripped = (response or "").strip()
                is_silent = (not resp_stripped) or resp_stripped.upper().startswith("[SILENT]") or resp_stripped.upper() == "SILENT"
                if is_silent:
                    mirror_event("langston_silent", chat_id=chat_id, thread_id=thread_id, reply_to=msg_id, reason=resp_stripped[:200])
                    log(f"silent on msg {msg_id} (no Telegram post)")
                else:
                    sent_id = send_message(chat_id, response, thread_id=thread_id, reply_to=msg_id)
                    mirror_event("langston_outbound", chat_id=chat_id, thread_id=thread_id, message_id=sent_id, reply_to=msg_id, text=response)
                    log(f"responded to msg {msg_id}")
            save_state(state)
        except KeyboardInterrupt:
            log("KeyboardInterrupt, exiting")
            break
        except Exception as e:
            log(f"main loop error: {type(e).__name__}: {e}\n{traceback.format_exc()[:1000]}")
            time.sleep(10)


if __name__ == "__main__":
    main()
