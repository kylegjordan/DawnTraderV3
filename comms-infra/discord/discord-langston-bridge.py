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
import langston_queue as lq

# ─── B-LANGSTON-QUEUE (review-queue auto-advance) ────────────────────────────
# The self-advance LOOP is OFF by default (set LANGSTON_SELF_ADVANCE=1 to enable at the live
# shakeout). While OFF, the bridge ONLY passively tracks the queue (enqueue + apply Langston's
# done/blocked/error markers) — zero re-invoke, so it cannot run away. The loop's safety = the
# two-tier CapTracker in langston_queue. Every queue op below is wrapped in try/except so a
# queue bug can NEVER break Langston's live response path.
SELF_ADVANCE_ENABLED = os.environ.get("LANGSTON_SELF_ADVANCE", "0") == "1"
QUEUE_FILE = os.environ.get("LANGSTON_QUEUE_FILE", "/home/langston/.langston-review-queue.json")
_cap = lq.CapTracker()

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
# EFFECTIVELY REMOVED (Kyle directive 2026-06-20): a normal overnight CC↔Langston review run
# is routinely 30-50 messages, so any low cap silently swallows legitimate work (it tripped at
# 6, then 30 was still too low). Kyle wants the limit gone. Set to 100_000 = unreachable in
# real use (years of traffic) while still bounding a pathological infinite-loop BUG so it can't
# burn unlimited paid Langston turns. The address-gate (a CC post must START with "Langston")
# already keeps ordinary chatter from triggering him. Kyle posting anything still resets to 0.
BOT_TURN_LIMIT = 100_000
ADDRESS_RE = re.compile(r"langston", re.I)  # names Langston anywhere (used for Kyle + voice)
# CC convention (Kyle 2026-06-19): a Claude session addresses Langston by putting his name at the
# START of the post — so a passing mid-sentence mention does NOT wake him. Tolerates leading
# markdown / quote / punctuation chars before the name.
ADDRESS_START_RE = re.compile(r"^[\s*_~`>#:\".\-]*langston\b", re.I)
# Name-routing (crossed-wire fix): a Kyle message that names a CC session but NOT Langston is
# not Langston's to answer — skip it so the CC session handles it (mirrors the wake filter).
CC_NAME_RE = re.compile(r"claude[\s_-]*(old|new)|(old|new)[\s_-]*claude|\bcc[\s_-]*[ab]\b", re.I)


def resolve_recipient_name(task):
    """Who Langston is replying to, as a name the wake filter recognizes (Kyle 2026-06-20).
    The CC sessions wake only when their name appears in a post; Langston's reply must therefore
    LEAD with the addresser's name so their watcher catches it. The bridge knows the addresser
    deterministically (the triggering message's author) — don't rely on Langston's wording.
      - Kyle           -> "Kyle"
      - a CC webhook post -> its display name IS the session name ("OLD Claude" / "NEW Claude")."""
    if task.get("author_id") == CFG.get("kyle_id"):
        return "Kyle"
    return (task.get("author_display") or task.get("author_name") or "").strip()

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


def _self_advance(task_q, channel_id, items, prev_task):
    """B-LANGSTON-QUEUE: re-invoke Langston for the next READY queue item, guarded by the two-tier
    cap (LOUD on trip — silence must always mean *done*, never *stuck*). Only called when
    SELF_ADVANCE_ENABLED. Queue clear → no-op (Langston's own 'queue clear, standing by' announces)."""
    if task_q is None:
        return
    nxt = lq.pick_next_ready(items)
    if nxt is None:
        return  # queue genuinely clear
    halt, reason = _cap.should_halt()
    if halt:
        dc.rest_send(BOT_TOKEN, channel_id, f"Langston self-advance PAUSED — {reason}", LOG_FILE)
        log(f"self-advance halted: {reason}")
        return
    _cap.register_advance(nxt["id"])
    prompt = (f"[Discord SELF-ADVANCE — your previous review is done; work your NEXT queued item NOW. "
              f"id={nxt['id']} gate={nxt['gate_type']} from {nxt['requester']}: {nxt['summary']} "
              f"pointer={nxt.get('pointer')}. End your reply with a queue marker on the LAST line: "
              f"[[QUEUE id={nxt['id']} status=done]]  (or  status=blocked on=<CC-A|CC-B|Kyle> want=\"..\"  "
              f"or  status=error reason=\"..\"). If nothing else is ready, reply 'queue clear, standing by'.]")
    task_q.put({"channel_id": channel_id, "message_id": f"adv-{nxt['id']}", "author_id": None,
                "author_name": "self-advance", "author_display": "self-advance",
                "is_dm": prev_task.get("is_dm", False), "kind": "text", "content": prompt,
                "self_advance": True, "is_alert": False})
    log(f"self-advance: re-invoking Langston for queue item {nxt['id']} (gate={nxt['gate_type']})")


def process_task(task, state, breaker, task_q=None):
    """Handle one queued task (text or voice): invoke claude, post reply unless [SILENT].

    breaker (review 1b): {"bot_turns": int} — reset by a Kyle message, incremented by a
    CC-bot message; trips after BOT_TURN_LIMIT consecutive non-Kyle turns.
    """
    channel_id = task["channel_id"]
    msg_id = task["message_id"]
    is_dm = task["is_dm"]
    kind = task["kind"]

    # B-LANGSTON-QUEUE: a REAL inbound (not a self-advance re-invoke) resets the runaway cap —
    # any Kyle/CC post means we're not in an unattended loop. (No-op while the loop is disabled.)
    if not task.get("self_advance"):
        try: _cap.reset()
        except Exception as e: log(f"queue: cap reset failed (non-fatal): {e}")

    # ── Circuit breaker: a hard floor under the soft [SILENT] discipline ──────
    # System alerts + self-advance re-invokes bypass it: neither is the CC↔Langston ping-pong the
    # breaker guards (the self-advance loop has its OWN two-tier cap in langston_queue).
    if task.get("is_alert") or task.get("self_advance"):
        pass
    elif task["author_id"] == CFG["kyle_id"]:
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
        mirror_event("langston_alert_inbound" if task.get("is_alert") else "langston_inbound",
                     channel_id=channel_id, message_id=msg_id,
                     author_id=task["author_id"], sender_username=task["author_name"],
                     text=prompt)
        # B-LANGSTON-QUEUE: track a real inbound REVIEW request as a queue item (PASSIVE — runs even
        # while the self-advance loop is disabled; it just maintains the queue file). try/except so a
        # queue bug never breaks the reply. Alerts + self-advance re-invokes are not queue items.
        # FINDING-1 (Langston Step-4): gate on is_review_request — only an actual review request
        # enqueues, NOT every addressed inbound (coordination chatter must not create work-items).
        if not task.get("is_alert") and not task.get("self_advance") and lq.is_review_request(prompt):
            try:
                items = lq.load_queue(QUEUE_FILE)
                if not any(it.get("id") == str(msg_id) for it in items):
                    items.append(lq.new_item(msg_id, task.get("author_display") or task.get("author_name", "?"),
                                             prompt, gate_type=lq.infer_gate_type(prompt)))
                    lq.save_queue(QUEUE_FILE, items)
            except Exception as e:
                log(f"queue: enqueue failed (non-fatal): {e}")

    # Voice name-check (response discipline): a transcribed voice note that doesn't name
    # Langston isn't his to answer — stay silent without burning a claude turn.
    if kind == "voice" and not ADDRESS_RE.search(prompt):
        mirror_event("langston_silent", channel_id=channel_id, reply_to=msg_id,
                     reason="voice not addressed to Langston")
        log(f"voice msg {msg_id} not addressed to Langston — silent")
        return

    # Langston is ONLY ever invoked when directly addressed (the bridge gates on his name), so tell
    # him so and require a substantive reply — Kyle 2026-06-19: "Langston responds when called, ALWAYS."
    # System alerts get a triage-framed prompt instead (OBJ-5): they arrive via the dedicated alerts
    # webhook, not by name, and must be assessed + actioned, never [SILENT].
    if task.get("self_advance"):
        # B-LANGSTON-QUEUE: a self-advance re-invoke carries its own queue-item prompt; use as-is.
        addressed_prompt = prompt
    elif task.get("is_alert"):
        addressed_prompt = ("[Discord SYSTEM ALERT — routed to you from the §10.5 alert dispatcher. "
                            "Assess it and respond with your triage in one or a few lines: severity, "
                            "likely cause, and whether action is needed now or it is FYI. Do NOT reply "
                            "with [SILENT].]\n\n" + prompt)
    else:
        addressed_prompt = ("[Discord: you have been directly addressed by name. Respond substantively in "
                            "one or a few lines. Do NOT reply with [SILENT] — on this channel you only "
                            "receive messages addressed to you.]\n\n" + prompt)
    log(f"handling msg {msg_id} channel={channel_id} kind={kind}: {prompt[:120]}")
    # FRESH session id per invocation (fix 2026-06-21): a completed `claude -p --session-id X`
    # leaves X locked, so REUSING a stable session across calls fails the FIRST attempt EVERY
    # time with "Session ID already in use" → the rotation backstop fires on every message,
    # adding latency (one reply took ~2 min) that made Langston look unresponsive on Discord.
    # The bridge already had no real cross-turn continuity (it rotated every turn), so a fresh
    # UUID per call is the clean fix: first-attempt success, no rotation, no latency. The
    # rotation logic in invoke_claude stays as a backstop (now effectively never triggered).
    response = invoke_claude(addressed_prompt, str(uuid.uuid4()), state=state)
    resp_stripped = (response or "").strip()
    is_bridge_error = resp_stripped.startswith("_Langston bridge error:") or resp_stripped.startswith("_Langston bridge:")
    if is_bridge_error and not is_dm:
        # infra error, not a real reply — mirror only, don't spam the channel
        mirror_event("langston_silent", channel_id=channel_id, reply_to=msg_id, reason="bridge_error_suppressed")
        log(f"bridge error on msg {msg_id} — suppressed in channel")
        return
    # Strip any reflexive [SILENT] marker and post; brief ack only if nothing substantive remains.
    cleaned = re.sub(r"\[SILENT\]", "", resp_stripped, flags=re.I).strip()
    if len(cleaned) < 3:
        cleaned = "Langston here — acknowledged."
    # Lead with the addressee's name so their wake watcher catches the reply (Kyle 2026-06-20).
    # Guarded so a reply Langston already opened with the name isn't double-prefixed. Skipped for
    # alerts — the addresser is the alerts webhook (no session to wake); CC follow-through on an
    # alert rides the existing alert-completion wake path, not a name in Langston's triage reply.
    if not task.get("is_alert"):
        recipient = resolve_recipient_name(task)
        if recipient and not cleaned[:len(recipient) + 2].lower().startswith(recipient.lower()):
            cleaned = f"{recipient} — {cleaned}"
    sent_id = dc.rest_send(BOT_TOKEN, channel_id, cleaned, LOG_FILE)
    mirror_event("langston_outbound", channel_id=channel_id, message_id=sent_id, reply_to=msg_id, text=cleaned)
    log(f"responded to msg {msg_id}")

    # ── B-LANGSTON-QUEUE: apply Langston's done/blocked/error marker (PASSIVE, always-on), then
    #    SELF-ADVANCE only if enabled. Whole block try/except → a queue bug never breaks the reply. ──
    try:
        items = lq.load_queue(QUEUE_FILE)
        marker = lq.parse_marker(response)
        if marker:
            item, action = lq.apply_marker(items, marker)
            if action == "error" and item is not None:
                # error PARKS + must be flagged to Kyle (a wedged read must never silently vanish).
                dc.rest_send(BOT_TOKEN, channel_id,
                             f"Kyle — Langston hit an ERROR on queue item {marker['id']}: "
                             f"{marker.get('reason', '?')} — parked, needs a look.", LOG_FILE)
        # FINDING-2 (Langston Step-4): a self-advance re-invoke whose reply carried NO marker for the
        # item it was working would leave it `ready` → the next advance re-picks the SAME id → trips
        # the Tier-1 same-id HALT and pauses the WHOLE loop over a merely-missing marker. Park that
        # item (LOUD) so the loop continues to other ready items; a re-mark clears it.
        if task.get("self_advance"):
            mid = str(task.get("message_id", ""))
            advanced_id = mid[4:] if mid.startswith("adv-") else None
            if advanced_id and (not marker or marker.get("id") != advanced_id):
                if lq.park_unmarked(items, advanced_id) is not None:
                    dc.rest_send(BOT_TOKEN, channel_id,
                                 f"Kyle — Langston replied on queue item {advanced_id} without a status "
                                 f"marker; parked it so the self-advance loop keeps moving (its verdict is "
                                 f"in the Discord prose above). Re-mark done/blocked/error to clear.", LOG_FILE)
        lq.save_queue(QUEUE_FILE, items)
        if SELF_ADVANCE_ENABLED and not task.get("is_alert"):
            _self_advance(task_q, channel_id, items, task)
    except Exception as e:
        log(f"queue: post-response handling failed (non-fatal): {e}")


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
                process_task(task, state, breaker, task_q)
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
        # CC is recognized as the pinned CC bot OR a post from CC's webhook (the per-session
        # display-name path) — so bot-to-bot still works when CC posts as "Claude Old"/"New".
        wh_id = getattr(message, "webhook_id", None)
        author_is_cc_bot = (message.author.id == CFG["cc_bot_id"]) or \
                           (wh_id is not None and CFG.get("webhook_id") is not None and wh_id == CFG["webhook_id"])
        voice = dc.detect_voice_attachment(message)
        content = (message.content or "").strip()

        # ALWAYS-ENGAGE for SYSTEM ALERTS (B-DISCORD OBJ-5, Langston-approved). A §10.5 alert is
        # posted via a DEDICATED alerts webhook; its webhook_id is a Discord-native, immutable,
        # not-body-settable field → the spoof-resistant structured marker. Langston engages on it
        # UNCONDITIONALLY (bypassing the start-with-"Langston" gate) so a critical alert is never
        # silently dropped on phrasing. Inert until Kyle provisions the webhook (alerts_webhook_id
        # = None → this is never true). Scoped to EXACTLY this webhook so ordinary chatter can't
        # trip it. The alert payload is the message content (the dispatcher formats it).
        is_alert = (wh_id is not None and CFG.get("alerts_webhook_id") is not None
                    and wh_id == CFG["alerts_webhook_id"])

        # Address-gate (review 1a/1b): Kyle always engages; the CC bot (pinned id, not the
        # generic .bot flag) engages ONLY when the message names Langston — so CC's ACK /
        # bookkeeping posts never burn a paid Langston turn, and stray bots are ignored.
        # RESPONSE DISCIPLINE (Kyle 2026-06-19): Langston RESPONDS only when explicitly named
        # "Langston" — from Kyle OR a CC. No name → not his to answer (it's for a CC, a CC↔CC
        # exchange, or general). Everyone can be woken broadly; only Langston's REPLY is gated
        # here so the channel doesn't get chaotic. (Voice gets the same check post-transcription.)
        if is_alert:
            pass  # dedicated system-alerts webhook → always engage (OBJ-5), bypass the name gate
        elif voice:
            if not author_is_kyle:
                return  # only Kyle sends voice notes; name-check happens after transcription
        elif author_is_kyle:
            if not ADDRESS_RE.search(content):
                return
        elif author_is_cc_bot and ADDRESS_START_RE.match(content):
            pass  # a CC post that STARTS with "Langston" (the addressing convention)
        else:
            return

        base = {
            "channel_id": message.channel.id,
            "message_id": message.id,
            "author_id": message.author.id,
            "author_name": str(message.author),
            # For a CC webhook post the display name IS the session name (OLD Claude / NEW Claude),
            # which is what resolve_recipient_name() leads Langston's reply with.
            "author_display": getattr(message.author, "display_name", None) or getattr(message.author, "name", None),
            "is_alert": is_alert,
            "is_dm": is_dm,
        }
        if is_alert and not voice:
            task_q.put({**base, "kind": "alert", "content": content})
            log(f"ALERT enqueued: msg {message.id} via alerts webhook")
            return
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
