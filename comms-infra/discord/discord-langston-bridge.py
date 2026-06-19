#!/usr/bin/env python3
"""
discord-langston-bridge.py — Discord gateway bridge for Langston.

Mirrors comms-infra/telegram-reference/langston-bridge.py, but inbound arrives
via the Discord gateway (push) instead of Telegram getUpdates (poll). The big
win: Discord delivers the CC bot's messages to this bot, so CC↔Langston is an
in-channel exchange (no SSH-deliver workaround).

Architecture:
  - discord.py Client receives messages on the gateway (on_message).
  - on_message is a pure enqueuer → queue.Queue → single worker thread.
  - The worker invokes claude-cli (blocking) and posts the reply via plain REST
    (discord_common.rest_send), so the worker never touches the asyncio loop.
  - Single-claude-at-a-time invariant preserved (one worker thread, one FIFO).

Who Langston handles: Kyle (KYLE_DISCORD_ID) OR any OTHER bot in the configured
channel (= the CC bot — bot-to-bot), plus DMs from Kyle. Self-messages ignored
(loop guard). Langston returns [SILENT] by his CLAUDE.md §11 judgment → no post.

Parallel-run: writes to /var/log/cc-discord-inbox.jsonl (SEPARATE from Telegram).
The live Telegram fabric is untouched.
"""
import datetime
import json
import os
import queue
import re
import subprocess
import sys
import threading
import time
import traceback
import uuid
from collections import deque
from pathlib import Path

import discord  # provided by /opt/discord-bridges/venv

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import discord_common as dc

# ─── Config ──────────────────────────────────────────────────────────────────
BOT_TOKEN_FILE = "/etc/langston/discord-langston-bot.env"
OAUTH_TOKEN_FILE = "/etc/langston/oauth.env"
WORK_DIR = "/home/langston"
STATE_FILE = "/home/langston/.discord-langston-bridge-state.json"
LOG_FILE = "/var/log/discord-langston-bridge.log"
VOICE_ARCHIVE_ROOT = "/var/log/cc-bridge-voice-archive/discord-langston"
CLAUDE_TIMEOUT = 900
CLAUDE_MODEL = "claude-opus-4-8[1m]"
# Circuit breaker (Langston review 1b): if this many CC-bot-authored turns occur with no
# intervening Kyle message, stop auto-replying + post one alert. Hard floor under [SILENT].
BOT_TURN_LIMIT = 6
ADDRESS_RE = re.compile(r"langston", re.I)  # CC-bot messages engage Langston only when they name him

BOT_TOKEN = dc.load_env_value(BOT_TOKEN_FILE, "DISCORD_BOT_TOKEN")
OAUTH_TOKEN = dc.load_env_value(OAUTH_TOKEN_FILE, "CLAUDE_CODE_OAUTH_TOKEN")
CFG = dc.load_shared_config()


def log(msg):
    dc.log(msg, LOG_FILE)


def mirror_event(kind, **fields):
    entry = {
        "ts": datetime.datetime.now().astimezone().isoformat(),
        "source": "discord-langston-bridge",
        "transport": "discord",
        "kind": kind,
        **fields,
    }
    try:
        dc.append_inbox(entry)
    except Exception as e:
        log(f"mirror write failed: {e}")


def load_state():
    if Path(STATE_FILE).exists():
        try:
            return json.loads(Path(STATE_FILE).read_text())
        except Exception:
            log("state file corrupt, starting fresh")
    return {"session_id": str(uuid.uuid4())}


def save_state(state):
    Path(STATE_FILE).write_text(json.dumps(state, indent=2))


def invoke_claude(prompt, session_id, state=None, _retry_count=0):
    """Identical contract to the Telegram bridge: claude -p with a stable session-id,
    Opus 4.8 [1m], acceptEdits; auto-rotate UUID once on 'already in use'."""
    env = os.environ.copy()
    env["CLAUDE_CODE_OAUTH_TOKEN"] = OAUTH_TOKEN
    env["HOME"] = WORK_DIR
    env["PATH"] = "/usr/local/bin:/usr/bin:/bin"
    args = [
        "/usr/bin/claude", "-p", prompt,
        "--session-id", session_id, "--model", CLAUDE_MODEL,
        "--permission-mode", "acceptEdits",
    ]
    log(f"invoking claude (prompt={len(prompt)} chars, session={session_id[:8]}..., retry={_retry_count})")
    t0 = time.time()
    try:
        result = subprocess.run(args, env=env, cwd=WORK_DIR,
                                capture_output=True, text=True, timeout=CLAUDE_TIMEOUT)
        elapsed = time.time() - t0
        if result.returncode != 0:
            stderr_lc = (result.stderr or "").lower()
            log(f"claude exit {result.returncode} after {elapsed:.1f}s: stderr={result.stderr[:300]}")
            if "already in use" in stderr_lc and state is not None and _retry_count == 0:
                new_uuid = str(uuid.uuid4())
                log(f"session UUID locked, rotating {session_id[:8]}... -> {new_uuid[:8]}...")
                state["session_id"] = new_uuid
                save_state(state)
                return invoke_claude(prompt, new_uuid, state=state, _retry_count=_retry_count + 1)
            return f"_Langston bridge error: claude returned exit code {result.returncode}_\n\n```\n{result.stderr[:1500]}\n```"
        log(f"claude returned {len(result.stdout)} chars in {elapsed:.1f}s")
        return result.stdout.strip()
    except subprocess.TimeoutExpired:
        log(f"claude timeout after {CLAUDE_TIMEOUT}s")
        return "_Langston bridge: claude invocation timed out (15 min cap)_"
    except Exception as e:
        log(f"claude invoke error: {type(e).__name__}: {e}")
        return f"_Langston bridge: invoke error — {type(e).__name__}: {e}_"


def process_voice(task):
    """Download + transcribe a voice attachment. Returns (text, None) or (None, error)."""
    att = task["voice"]
    message_id = task["message_id"]
    if att["size"] and att["size"] > dc.ATTACHMENT_SIZE_CAP:
        return None, f"oversize {att['size']}>{dc.ATTACHMENT_SIZE_CAP}"
    date_str = time.strftime("%Y-%m-%d")
    archive_dir = Path(VOICE_ARCHIVE_ROOT) / date_str
    archive_dir.mkdir(parents=True, exist_ok=True)
    ext = Path(att["filename"]).suffix or ".ogg"
    archive_path = str(archive_dir / f"{message_id}{ext}")
    ok, size = dc.download_attachment(att["url"], archive_path, LOG_FILE)
    if not ok:
        return None, f"download_failed: {att['url'][:80]}"
    if size == 0:
        return None, "zero_byte_file"
    task["audio_archive_path"] = archive_path
    log(f"voice: transcribing {archive_path} (size={size}B)")
    text, error, duration_ms = dc.transcribe_audio(archive_path, LOG_FILE)
    task["transcription_duration_ms"] = duration_ms
    if text is None:
        return None, error
    return text, None


def process_task(task, state, breaker):
    """Handle one queued task (text or voice): invoke claude, post reply unless [SILENT].

    breaker (review 1b): {"bot_turns": int} — reset by a Kyle message, incremented by a
    CC-bot message; trips after BOT_TURN_LIMIT consecutive non-Kyle turns.
    """
    channel_id = task["channel_id"]
    msg_id = task["message_id"]
    is_dm = task["is_dm"]
    kind = task["kind"]

    # ── Circuit breaker: a hard floor under the soft [SILENT] discipline ──────
    if task["author_id"] == CFG["kyle_id"]:
        breaker["bot_turns"] = 0
    else:
        breaker["bot_turns"] += 1
        if breaker["bot_turns"] > BOT_TURN_LIMIT:
            if breaker["bot_turns"] == BOT_TURN_LIMIT + 1:  # alert exactly once
                dc.rest_send(BOT_TOKEN, channel_id,
                             "⚠️ CC↔Langston circuit breaker tripped: too many consecutive automated turns "
                             "with no message from Kyle. Pausing Langston auto-replies until Kyle posts.", LOG_FILE)
            mirror_event("langston_silent", channel_id=channel_id, reply_to=msg_id, reason="circuit_breaker")
            log(f"circuit breaker: skipping msg {msg_id} (bot_turns={breaker['bot_turns']})")
            return

    if kind == "voice":
        prompt, error = process_voice(task)
        if prompt is None:
            if is_dm:
                dc.rest_send(BOT_TOKEN, channel_id,
                             f"⚠️ Voice transcription failed (reason: {error[:200]}).", LOG_FILE)
            mirror_event("langston_inbound_voice_failed",
                         channel_id=channel_id, message_id=msg_id,
                         failure_reason=error[:500], silent_in_channel=not is_dm)
            return
        if is_dm:
            preview = prompt[:dc.ACK_PREVIEW_CHARS] + ("..." if len(prompt) > dc.ACK_PREVIEW_CHARS else "")
            dc.rest_send(BOT_TOKEN, channel_id, f"✅ Voice transcribed: \"{preview}\"", LOG_FILE)
        mirror_event("langston_inbound_voice",
                     channel_id=channel_id, message_id=msg_id,
                     author_id=task["author_id"], sender_username=task["author_name"],
                     text=prompt, transcription_source="whisper.cpp/ggml-small.en",
                     transcription_duration_ms=task.get("transcription_duration_ms"),
                     audio_archive_path=task.get("audio_archive_path"),
                     silent_in_channel=not is_dm)
    else:
        prompt = task["content"]
        mirror_event("langston_inbound",
                     channel_id=channel_id, message_id=msg_id,
                     author_id=task["author_id"], sender_username=task["author_name"],
                     text=prompt)

    log(f"handling msg {msg_id} channel={channel_id} kind={kind}: {prompt[:120]}")
    response = invoke_claude(prompt, state["session_id"], state=state)
    resp_stripped = (response or "").strip()
    is_silent = (not resp_stripped) or resp_stripped.upper().startswith("[SILENT]") or resp_stripped.upper() == "SILENT"
    is_bridge_error = resp_stripped.startswith("_Langston bridge error:") or resp_stripped.startswith("_Langston bridge:")
    if is_bridge_error and not is_dm:
        is_silent = True
    if is_silent:
        mirror_event("langston_silent", channel_id=channel_id, reply_to=msg_id,
                     reason=resp_stripped[:200])
        log(f"silent on msg {msg_id} (no Discord post)")
    else:
        sent_id = dc.rest_send(BOT_TOKEN, channel_id, response, LOG_FILE)
        mirror_event("langston_outbound", channel_id=channel_id, message_id=sent_id,
                     reply_to=msg_id, text=response)
        log(f"responded to msg {msg_id}")


def task_worker(task_q, state):
    """Single worker thread: serial claude invocation (one at a time)."""
    HEARTBEAT = 60
    last_heartbeat = time.time()
    breaker = {"bot_turns": 0}
    while True:
        try:
            try:
                task = task_q.get(timeout=HEARTBEAT)
            except queue.Empty:
                if time.time() - last_heartbeat >= HEARTBEAT:
                    log("task worker alive, queue depth=0")
                    last_heartbeat = time.time()
                continue
            try:
                process_task(task, state, breaker)
            except Exception as e:
                log(f"task worker error: {type(e).__name__}: {e}\n{traceback.format_exc()[:500]}")
            finally:
                task_q.task_done()
            if time.time() - last_heartbeat >= HEARTBEAT:
                log(f"task worker alive, queue depth={task_q.qsize()}")
                last_heartbeat = time.time()
        except Exception as e:
            log(f"task worker outer error (resuming): {type(e).__name__}: {e}")
            time.sleep(1)


# ─── Gateway client (receive only) ───────────────────────────────────────────

def build_client(task_q):
    intents = discord.Intents.default()
    intents.message_content = True
    client = discord.Client(intents=intents)
    seen = deque(maxlen=512)       # message-id dedup (review: RESUME can redeliver MESSAGE_CREATE)
    seen_set = set()

    @client.event
    async def on_ready():
        log(f"gateway connected as {client.user} (id={client.user.id})")

    @client.event
    async def on_message(message):
        # Loop guard: never react to our own messages.
        if message.author.id == client.user.id:
            return
        is_dm = message.guild is None
        if not is_dm and message.channel.id != CFG["channel_id"]:
            return
        # Dedup
        if message.id in seen_set:
            return
        if len(seen) == seen.maxlen:
            seen_set.discard(seen[0])
        seen.append(message.id)
        seen_set.add(message.id)

        author_is_kyle = (message.author.id == CFG["kyle_id"])
        author_is_cc_bot = (message.author.id == CFG["cc_bot_id"])
        voice = dc.detect_voice_attachment(message)
        content = (message.content or "").strip()

        # Address-gate (review 1a/1b): Kyle always engages; the CC bot (pinned id, not the
        # generic .bot flag) engages ONLY when the message names Langston — so CC's ACK /
        # bookkeeping posts never burn a paid Langston turn, and stray bots are ignored.
        if voice:
            if not author_is_kyle:
                return  # only Kyle sends voice notes
        elif author_is_kyle:
            pass
        elif author_is_cc_bot and ADDRESS_RE.search(content):
            pass
        else:
            return

        base = {
            "channel_id": message.channel.id,
            "message_id": message.id,
            "author_id": message.author.id,
            "author_name": str(message.author),
            "is_dm": is_dm,
        }
        if voice:
            task_q.put({**base, "kind": "voice", "voice": voice})
            log(f"voice enqueued: msg {message.id} from {message.author}")
            return
        if not content:
            return
        task_q.put({**base, "kind": "text", "content": content})
        log(f"text enqueued: msg {message.id} from {message.author}: {content[:80]}")

    return client


def main():
    state = load_state()
    save_state(state)
    log(f"Discord Langston bridge starting. session_id={state['session_id']} channel={CFG['channel_id']}")
    task_q = queue.Queue()
    worker = threading.Thread(target=task_worker, args=(task_q, state), daemon=True, name="task-worker")
    worker.start()
    log("task worker thread started")
    client = build_client(task_q)
    # discord.py manages gateway reconnects internally; run() blocks forever.
    client.run(BOT_TOKEN, reconnect=True, log_handler=None)


if __name__ == "__main__":
    main()
