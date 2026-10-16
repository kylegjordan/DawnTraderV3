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
import datetime as _dt
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
import gateway_watchdog as gw  # B-DISCORD-INBOUND-LIVENESS (#462): gateway receive-liveness watchdog

# Watchdog alert-cooldown marker (persisted across the os._exit→systemd restart cycle).
# This bridge runs as User=langston, so the marker lives under langston's HOME (not the
# root-owned /var/lib path the CC bridge uses) — persist_alert_epoch mkdirs the parent.
WATCHDOG_STATE = "/home/langston/.discord-bridge/langston-gateway-alert-epoch"
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
CLAUDE_MODEL = "claude-opus-5[1m]"
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
# B-COMMS-CHUNK-FIX (2026-07-22): the sender stamps this on EVERY chunk of a multi-chunk
# Langston-addressed dispatch (discord_common.GROUP_MARKER_FMT). first_id is sender-log-only
# and never reaches the wire, so this explicit token is the ONLY deterministic group key.
GROUP_MARKER_RE = re.compile(r'\u27e8grp=([0-9a-f]{8}) (\d+)/(\d+)\u27e9')
GROUP_TIMEOUT_S = 10          # seconds of SILENCE (not group age — Finding A) before a
                              # partial group is flushed WITH an explicit incomplete
                              # note. Langston ruling: never a silent hold.
_chunk_groups = {}            # grp -> {parts:{k:text}, n:int, t0:float, base:dict}
# Name-routing (crossed-wire fix): a Kyle message that names a CC session but NOT Langston is
# not Langston's to answer — skip it so the CC session handles it (mirrors the wake filter).
CC_NAME_RE = re.compile(r"claude[\s_-]*(old|new)|(old|new)[\s_-]*claude|\bcc[\s_-]*[ab]\b", re.I)


def resolve_recipient_name(task):
    """Who Langston is replying to (Kyle 2026-06-20). The rule lives in langston_queue.recipient_name
    (B-WAKE-SELF-ADVANCE-LEAD, #1177) so the queue suite can test it; this binds the config."""
    return lq.recipient_name(task, CFG.get("kyle_id"))

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


# B-CREDENTIALS-PRIVATE-REPO OBJ-4a: over ssh with langston's read-only deploy key, so this
# still resolves after the repo goes private (the service runs User=langston).
REVIEW_REMOTE = "git@github.com:kylegjordan/DawnTraderV3.git"
REVIEW_BRANCH = "migration/aws-supabase"


def resolve_review_ref():
    """Return the current review-branch head sha from GitHub, or None.

    Reads GitHub directly (git ls-remote) — no local repo, nothing to drift. EVERY failure
    is LOGGED (git's first line, an exception, or an empty answer): they used to be discarded,
    leaving only "RESOLVE FAILED". One retry after 5 s: this key has had transient publickey
    denials (13 since 2026-09-02, GB-10).
    """
    env = dict(os.environ, GIT_SSH_COMMAND="ssh -o BatchMode=yes -o ConnectTimeout=10")
    for attempt in (1, 2):
        try:
            r = subprocess.run(
                ["git", "ls-remote", REVIEW_REMOTE, "refs/heads/" + REVIEW_BRANCH],
                capture_output=True, text=True, timeout=30, env=env)
            parts = (r.stdout or "").split()
            if r.returncode == 0 and parts:
                return parts[0]
            if r.returncode != 0:
                first = next((ln for ln in (r.stderr or "").splitlines() if ln.strip()), "no message")
                log("review ref ls-remote attempt %d exit %d: %s" % (attempt, r.returncode, first[:200]))
            else:
                log("review ref ls-remote attempt %d: GitHub returned no %s" % (attempt, REVIEW_BRANCH))
        except Exception as e:
            log("review ref ls-remote attempt %d raised %s: %s" % (attempt, type(e).__name__, str(e)[:200]))
        if attempt == 1:
            time.sleep(5)
    return None


REVIEW_SOURCE_NOTE = (
    "[REVIEW SOURCE — branch migration/aws-supabase at commit %(ref)s. This is the graded ref. "
    "Do NOT read from /mnt/gdrive, any local working copy, or raw.githubusercontent.com.\n"
    " - Single file, pinned:  dt-review show %(ref)s <path>  — exact bytes on STDOUT ONLY; "
    "provenance goes to stderr, and a bare call SHOWS it above the file (with an OFF-BRANCH/DEGRADED "
    "header, that header twice). Number lines from stdout alone: save it to a file, check the exit, "
    "then grep -n / sed -n 'Np' the file; never number after 2>&1.\n"
    " - Search / list, pinned:  `dt-review grep @%(ref)s '<BRE>' [<path>...]`  |  "
    "`dt-review ls @%(ref)s`  (without @<sha> they read the mirror head AT CALL TIME and print "
    "that sha on stderr: compare it with this commit).\n"
    " - No flags; a pattern starting with '-' or '@' is written '[-]...' or '[@]...'.\n"
    " - EXCEPTION to exact output: if stdout line 1 starts OFF-BRANCH: or DEGRADED:, it is a "
    "one-line header, not file content. Read it, then drop it before numbering or counting.\n"
    " - Exit 0 = served. Exit 1 = either '# 0 matches' on stderr (a MEASURED zero: positive-control "
    "it before you assert an absence) or 'REFUSED:' (nothing was measured). Exit 2 = your request "
    "was refused; 3 = the mirror or git failed. After REFUSED, 2 or 3, assert nothing about the file.]\n\n"
)

REVIEW_SOURCE_FAIL_NOTE = (
    "[!! COULD NOT RESOLVE THE REVIEW-BRANCH HEAD from GitHub just now. Before asserting what any "
    "file contains, verify the exact commit yourself ( dt-review ref ) and read "
    "at it; if you cannot, say so plainly and decline to rule on file contents.]\n\n"
)


def invoke_claude(prompt, session_id, state=None, _retry_count=0, _noted=False):
    """Identical contract to the Telegram bridge: claude -p with a stable session-id,
    Opus 4.8 [1m], acceptEdits; auto-rotate UUID once on 'already in use'."""
    try:
        subprocess.run(["/usr/local/bin/langston-log-loaded", "discord-bridge"], timeout=5, check=False)
    except Exception:
        pass
    # --- point Langston at the review branch on GitHub; he reads off it, no checkout ---
    # ONCE per message: the UUID-rotation retry below passes the already-noted prompt with
    # _noted=True, so it neither re-resolves (a second, possibly different sha) nor adds a second note.
    if not _noted:
        _ref = resolve_review_ref()
        if _ref:
            log("review ref resolved to %s" % _ref[:9])
            prompt = (REVIEW_SOURCE_NOTE % {"ref": _ref}) + prompt
        else:
            log("REVIEW REF RESOLVE FAILED")
            prompt = REVIEW_SOURCE_FAIL_NOTE + prompt

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
                return invoke_claude(prompt, new_uuid, state=state, _retry_count=_retry_count + 1, _noted=True)
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
    # C2 (#345): per-ITEM re-fire guard that SURVIVES _cap.reset() (a real inbound resets the CapTracker's
    # same-id tier, which under sustained chatter let a stuck `ready` item re-fire forever — the churn that
    # disabled self-advance). If this item already re-fired SAME_ID_CAP times without settling, PARK it
    # (LOUD) instead of re-invoking; a re-mark clears it. Checked BEFORE the CapTracker (which stays as the
    # distinct-advance backstop).
    if lq.item_refire_halt(nxt):
        if lq.park_unmarked(items, nxt["id"]) is not None:
            lq.save_queue(QUEUE_FILE, items)
        dc.rest_send(BOT_TOKEN, channel_id,
                     f"Kyle — Langston self-advance PARKED queue item {nxt['id']}: it re-fired "
                     f"{nxt.get('self_advance_refires', lq.SAME_ID_CAP)}x without a settle marker (per-item "
                     f"runaway guard, survives inbound chatter). Re-mark [[QUEUE id={nxt['id']} status=ready]] "
                     f"to retry once its blocker clears.", LOG_FILE)
        log(f"self-advance per-item PARK: id={nxt['id']} refires>={lq.SAME_ID_CAP}")
        return
    halt, reason = _cap.should_halt()
    if halt:
        dc.rest_send(BOT_TOKEN, channel_id, f"Langston self-advance PAUSED — {reason}", LOG_FILE)
        log(f"self-advance halted: {reason}")
        return
    lq.register_item_refire(nxt)   # C2: bump the per-item re-fire count BEFORE re-invoking
    lq.save_queue(QUEUE_FILE, items)  # ...and PERSIST it (Langston Step-4 fix): _self_advance runs after
    # process_task's own save_queue, and the next cycle is a SEPARATE task that reloads from disk — without
    # this write the increment is discarded every cycle, the counter stays 0, and item_refire_halt never trips.
    _cap.register_advance(nxt["id"])
    prompt = (f"[Discord SELF-ADVANCE — your previous review is done; work your NEXT queued item NOW. "
              f"id={nxt['id']} gate={nxt['gate_type']} from {nxt['requester']}: {nxt['summary']} "
              f"pointer={nxt.get('pointer')}. End your reply with a queue marker on the LAST line: "
              f"[[QUEUE id={nxt['id']} status=done]]  (or  status=blocked on=<CC-A|CC-B|Kyle> want=\"..\"  "
              f"or  status=error reason=\"..\"). If nothing else is ready, reply 'queue clear, standing by'.]")
    task_q.put({"channel_id": channel_id, "message_id": f"adv-{nxt['id']}", "author_id": None,
                "author_name": "self-advance", "author_display": "self-advance",
                "is_dm": prev_task.get("is_dm", False), "kind": "text", "content": prompt,
                "self_advance": True, "is_alert": False,
                # #1177: whom the reply is addressed to. "self-advance" above is a LABEL (the breaker and
                # the prompt key on it); without this the reply led with the label and woke nobody.
                "addressee": nxt.get("requester")})
    log(f"self-advance: re-invoking Langston for queue item {nxt['id']} (gate={nxt['gate_type']})")


# ── B-COMMS-IMAGES: Langston-authored attachments (his invocation-7 condition (d), binding) ──
ATTACH_RE = re.compile(r"\[\[ATTACH ([^\]\n]+)\]\]")
# Allowlist entries are realpath'd ONCE at startup (Step-4 note 3): if an allowed dir is
# itself a symlink, its members realpath elsewhere and every legitimate [[ATTACH]] would
# refuse — the allowlist must live in the same resolved namespace as the checked paths.
ATTACH_ALLOWED_DIRS = tuple(os.path.realpath(d) + "/" for d in
                            ("/home/langston/outbox/", "/opt/langston-memory/exports/"))


def extract_attachments(text):
    """Parse [[ATTACH /path]] markers from Langston's reply — one path per marker.
    Markers are stripped ALWAYS, including on refusal. realpath() runs BEFORE the
    allowlist prefix check: a string-prefix check without resolution is defeated by
    ../ or a symlink planted in an allowed dir (the difference between an allowlist
    and a decoration). Refusals are LOUD — appended to the posted message, never
    silently dropped (a silently-dropped attachment is the absent-as-valid class:
    Langston would believe he shipped evidence he didn't)."""
    files, notes = [], []

    def _sub(m):
        raw = m.group(1).strip().strip('"')
        base = os.path.basename(raw) or raw
        try:
            rp = os.path.realpath(raw)
            if not any(rp.startswith(d) for d in ATTACH_ALLOWED_DIRS):
                notes.append(f"(attachment refused: {base}: outside allowlist)")
            elif not os.path.isfile(rp):
                notes.append(f"(attachment refused: {base}: not a file)")
            elif os.path.getsize(rp) > dc.MEDIA_MAX_BYTES:
                notes.append(f"(attachment refused: {base}: exceeds {dc.MEDIA_MAX_BYTES}B cap)")
            else:
                files.append(rp)
        except Exception as e:
            notes.append(f"(attachment refused: {base}: {type(e).__name__})")
        return ""

    text = ATTACH_RE.sub(_sub, text)
    if notes:
        text = (text.rstrip() + "\n" + " ".join(notes)).strip()
    return text, files


def process_task(task, state, breaker, task_q=None):
    """Handle one queued task (text or voice): invoke claude, post reply unless [SILENT].

    breaker (review 1b): {"bot_turns": int} — reset by a Kyle message, incremented by a
    CC-bot message; trips after BOT_TURN_LIMIT consecutive non-Kyle turns.
    """
    channel_id = task["channel_id"]
    msg_id = task["message_id"]
    enqueued_id = None  # OBJ-A (#345): set to the item id if THIS inbound enqueues a review item — drives the auto-settle below
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
        # Shakeout-2 finding (#344): an inbound that CARRIES a queue marker is a CONTROL message
        # (e.g. an un-park `[[QUEUE id=X status=ready]] please re-review`) — it must NOT also enqueue
        # as a phantom work-item, even though its prose may read as a review request.
        if (not task.get("is_alert") and not task.get("self_advance")
                and lq.is_review_request(prompt) and not lq.marker_attempted(prompt)):
            try:
                items = lq.load_queue(QUEUE_FILE)
                if not any(it.get("id") == str(msg_id) for it in items):
                    # OBJ-B (#345): capture a re-fetchable pointer at enqueue (inbox path / repo file / sha).
                    # #1177: the requester is the RESOLVED addressee (a Kyle item stores "Kyle", not his
                    # username) - a self-advance on this item leads its reply with it.
                    items.append(lq.new_item(msg_id, resolve_recipient_name(task) or "?",
                                             prompt, pointer=lq.extract_pointer(prompt),
                                             gate_type=lq.infer_gate_type(prompt)))
                    lq.save_queue(QUEUE_FILE, items)
                    enqueued_id = str(msg_id)  # OBJ-A: this inbound created an item → auto-settle after the reply
            except Exception as e:
                log(f"queue: enqueue failed (non-fatal): {e}")

        # #342 circle-back: a CC/Kyle can re-mark a queue item from an INBOUND message — chiefly
        # `[[QUEUE id=X status=ready]]` to UN-PARK a blocked item once its dependency lands (the
        # message starts with "Langston" to pass the gate; he then re-reviews it). Apply any inbound
        # marker passively (try/except so it can never break the reply path).
        if not task.get("is_alert") and not task.get("self_advance"):
            try:
                inbound_marker = lq.parse_marker(prompt)
                if inbound_marker:
                    items = lq.load_queue(QUEUE_FILE)
                    it2, act2 = lq.apply_marker(items, inbound_marker)
                    if it2 is not None:
                        lq.save_queue(QUEUE_FILE, items)
                        log(f"queue: inbound marker applied id={inbound_marker['id']} -> {act2}")
            except Exception as e:
                log(f"queue: inbound marker apply failed (non-fatal): {e}")

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
        # B-ALERT-PROTOCOL (#340): triage in plain language to Kyle, THEN assign the
        # follow-through owner on a single machine-parseable LAST line so the alert is
        # tracked to closure and the owning CC is woken (the wake filter routes on it).
        addressed_prompt = ("[Discord SYSTEM ALERT — routed to you from the §10.5 alert dispatcher. "
                            "Assess it and respond with your triage to Kyle in plain language (a few lines): "
                            "what it means, the likely cause, and whether action is needed now or it is FYI. "
                            "Do NOT reply with [SILENT]. THEN end your reply with a single machine-parseable "
                            "LAST line assigning who must carry the follow-through to closure:\n"
                            "[[ALERT id=<the Alert ID shown in the alert> owner=<CC-A|CC-B|Kyle> action=\"<one line>\"]]\n"
                            "Owner guide (your domain read OVERRIDES the category): governance/comms → CC-A; "
                            "trading-engine/breakage → CC-B; needs Kyle's decision → Kyle. If genuinely no action "
                            "is needed, still emit the marker as owner=Kyle action=\"FYI — no action needed\".]\n\n" + prompt)
    else:
        # OBJ-A (#345): if THIS inbound enqueued a review item, instruct Langston to emit a settle marker
        # on his FIRST pass so the item never lingers `ready` (the old degraded re-pass). The instruction
        # is CONDITIONAL — emit `done` only if he actually renders a review; if there's nothing to review
        # he just says so and the bridge auto-settles to `noop` (never falsely marked "reviewed").
        review_marker_instr = ""
        if enqueued_id:
            review_marker_instr = (
                f" This message was queued as review item id={enqueued_id}. If you ACTUALLY render a review "
                f"here, END your reply with a queue marker on the LAST line: [[QUEUE id={enqueued_id} status=done]] "
                f"(or status=blocked on=<CC-A|CC-B|Kyle> want=\"..\" if you need something first, or "
                f"status=error reason=\"..\"). If on reading it there is nothing to actually review, just say so "
                f"briefly — do NOT emit a done marker; the bridge will auto-settle the item.")
        addressed_prompt = ("[Discord: you have been directly addressed by name. Respond substantively in "
                            "one or a few lines. Do NOT reply with [SILENT] — on this channel you only "
                            "receive messages addressed to you." + review_marker_instr + "]\n\n" + prompt)
    # B-COMMS-IMAGES: worker-thread download (never on the gateway loop). media lines are
    # appended ONLY for THIS invoking message's attachments (Langston (f1)); a failed save
    # is stated as a FAILURE, never presented as an empty set (Langston (f3), #453).
    _media, _mfail = [], []
    if task.get("image_atts"):
        _media, _mfail = dc.save_image_meta(task["image_atts"], msg_id, LOG_FILE)
    if _media:
        addressed_prompt += ("\n\n[" + str(len(_media)) + " image attachment(s) on THIS message — "
                             "view them with the Read tool: " + " · ".join(_media) + "]")
    if _mfail:
        addressed_prompt += ("\n\n[⚠ attachment(s) present on this message but save FAILED — an "
                             "instrument failure, NOT an empty set (#453): " + "; ".join(_mfail) + "]")
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
    # B-COMMS-IMAGES: extract [[ATTACH]] markers BEFORE posting — markers stripped always,
    # refusals appended loudly to the message itself (Langston (d)).
    cleaned, _attach_files = extract_attachments(cleaned)
    if len(cleaned) < 3:
        cleaned = "Langston here — acknowledged."
    # Lead with the addressee's name so their wake watcher catches the reply (Kyle 2026-06-20).
    # Guarded so a reply Langston already opened with the name isn't double-prefixed. Skipped for
    # alerts — the addresser is the alerts webhook (no session to wake); CC follow-through on an
    # alert rides the existing alert-completion wake path, not a name in Langston's triage reply.
    # The rule (and the self-advance marker, #1177) is langston_queue.lead_with_addressee.
    if not task.get("is_alert"):
        cleaned = lq.lead_with_addressee(cleaned, task, CFG.get("kyle_id"))
    sent_id = dc.rest_send(BOT_TOKEN, channel_id, cleaned, LOG_FILE)
    if task.get("is_alert"):
        # B-LANGSTON-RELIEF OBJ-2 (Coltrane r3): an alert's spooled work is done ONLY when his answer is durably
        # out - a real Discord message id AND a successful direct inbox record of it (mirror_event swallows its
        # failures). Anything else - a failed post, a failed record, an exception, a suppressed bridge error -
        # leaves the spool record in place for the restore at the next start.
        _done = False
        if sent_id is not None:
            try:
                dc.append_inbox({"ts": datetime.datetime.now().astimezone().isoformat(),
                                 "source": "discord-langston-bridge", "transport": "discord",
                                 "kind": "langston_outbound", "channel_id": channel_id, "message_id": sent_id,
                                 "reply_to": msg_id, "text": cleaned})
                _done = True
            except Exception as e:
                log(f"alert spool: Langston's reply to msg {msg_id} posted but NOT recorded ({type(e).__name__}: {e}) "
                    f"- kept for restore")
        else:
            log(f"alert spool: Langston's reply to msg {msg_id} was NOT posted - kept for restore")
        if _done:
            al.spool_remove(al.SPOOL_DIR, msg_id)
    else:
        mirror_event("langston_outbound", channel_id=channel_id, message_id=sent_id, reply_to=msg_id, text=cleaned)
    # B-COMMS-IMAGES: upload his approved attachments AFTER the text lands; an upload
    # failure is announced in-channel, never silently dropped (Langston (d)).
    for _fp in _attach_files:
        _fid = dc.send_file("bot", BOT_TOKEN, channel_id, "", _fp, LOG_FILE)
        if _fid is None:
            dc.rest_send(BOT_TOKEN, channel_id,
                         f"(attachment upload FAILED: {os.path.basename(_fp)} — bridge log has the reason)",
                         LOG_FILE)
        else:
            mirror_event("langston_outbound_media", channel_id=channel_id, message_id=_fid,
                         reply_to=msg_id, text=f"[uploaded {_fp}]")
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
                # #343 (Langston Step-4): distinguish a MALFORMED-but-present marker (he signaled, the
                # grammar dropped it → worse, park LOUDER) from a genuinely absent one.
                malformed = (marker is None) and lq.marker_attempted(response)
                if lq.park_unmarked(items, advanced_id, malformed=malformed) is not None:
                    if malformed:
                        dc.rest_send(BOT_TOKEN, channel_id,
                                     f"⚠️ Kyle — Langston emitted a MALFORMED status marker on queue item "
                                     f"{advanced_id} (a [[QUEUE ...]] was present but the grammar failed, so it "
                                     f"was DROPPED — worse than a forgotten one). Parked it; his verdict is in "
                                     f"the prose above. Re-emit a valid marker to clear.", LOG_FILE)
                    else:
                        dc.rest_send(BOT_TOKEN, channel_id,
                                     f"Kyle — Langston replied on queue item {advanced_id} without a status "
                                     f"marker; parked it so the self-advance loop keeps moving (its verdict is "
                                     f"in the Discord prose above). Re-mark done/blocked/error to clear.", LOG_FILE)
        # OBJ-A (#345): a REAL inbound that enqueued an item must not leave it `ready` (the old degraded
        # re-pass that re-fed Langston the truncated summary). If his reply already settled it (a marker
        # targeting enqueued_id), nothing to do; otherwise AUTO-SETTLE to `noop` — it passed the heuristic
        # gate but produced no review marker, so it is terminally cleared WITHOUT being falsely marked
        # "done". This makes the settle robust to the model forgetting the marker (Langston Step-1 R1).
        if enqueued_id and not task.get("self_advance"):
            already_settled = (marker is not None and marker.get("id") == enqueued_id)
            if not already_settled:
                it_a, _ = lq.apply_marker(items, {"id": enqueued_id, "status": "noop"})
                if it_a is not None:
                    log(f"queue: OBJ-A auto-settled real-inbound item {enqueued_id} -> noop (no review marker emitted)")
        lq.save_queue(QUEUE_FILE, items)
        if SELF_ADVANCE_ENABLED and not task.get("is_alert"):
            _self_advance(task_q, channel_id, items, task)
    except Exception as e:
        log(f"queue: post-response handling failed (non-fatal): {e}")


def _resurface_stale_blocked():
    """#342 (Langston Step-4): re-surface blocked items whose `want` hasn't landed within the TTL so
    they don't silently rot. Re-surface only (never auto-resolve) — only the real dependency landing
    (a `ready` marker) un-parks. Gated on SELF_ADVANCE_ENABLED (part of the loop's lifecycle); fully
    try/except so it can never break the worker."""
    try:
        items = lq.load_queue(QUEUE_FILE)
        stale = lq.stale_blocked(items)
        if not stale:
            return
        WHO_NAME = {"CC-A": "OLD Claude", "CC-B": "NEW Claude", "Langston": "Langston", "Kyle": "Kyle"}
        for it in stale:
            bo = it.get("blocked_on") or {}
            owner = WHO_NAME.get(bo.get("who", ""), bo.get("who") or "one of the Claudes")
            # Plain-language, addressed to the session that OWES the dependency (its name wakes it) --
            # never a raw-id dump at Kyle (Kyle directive 2026-07-03). Kyle gets FYI framing only.
            about = (it.get("summary") or "").replace("Langston \u2014 ", "")[:160]
            waiting_for = (bo.get("want") or "the promised follow-up")[:160]
            dc.rest_send(BOT_TOKEN, CFG["channel_id"],
                         f"{owner} \u2014 one of Langston's review items is still parked waiting on you. "
                         f"What it is: {about}... What it needs: {waiting_for}. "
                         f"If this already happened in a later exchange, clear the old entry with "
                         f"`[[QUEUE id={it.get('id')} status=done]]`; if it is still owed, land it. "
                         f"(Kyle: FYI only \u2014 {owner} owns this; no action needed from you.)",
                         LOG_FILE)
            lq.mark_stale_surfaced(it)
        lq.save_queue(QUEUE_FILE, items)
    except Exception as e:
        log(f"queue: stale re-surface failed (non-fatal): {e}")


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
                    if SELF_ADVANCE_ENABLED:
                        _resurface_stale_blocked()
                continue
            try:
                process_task(task, state, breaker, task_q)
            except Exception as e:
                log(f"task worker error: {type(e).__name__}: {e}\n{traceback.format_exc()[:500]}")
            finally:
                task_q.task_done()
                # (Coltrane r3: an alert's spool record is removed in process_task only after his reply is posted AND
                #  recorded - never here, where "dequeued" would be mistaken for "answered".)
            if time.time() - last_heartbeat >= HEARTBEAT:
                _people, _adv, _alerts = task_q.depth_by_class()
                log(f"task worker alive, queue depth={task_q.qsize()} "
                    f"(people={_people} self-advance={_adv} alerts={_alerts})")
                last_heartbeat = time.time()
        except Exception as e:
            log(f"task worker outer error (resuming): {type(e).__name__}: {e}")
            time.sleep(1)


# ─── The alert lane (B-LANGSTON-RELIEF OBJ-2) ─────────────────────────────────
# Kyle 2026-10-08: system alerts stop invoking Langston. With LANGSTON_ALERT_LANE=1 the bridge sends
# alert-webhook posts to alert_q instead of task_q; ONE lane worker batches a burst (settle
# al.BATCH_SETTLE_S, at most al.BATCH_MAX), invokes the lane agent (al.LANE_MODEL, cwd al.LANE_DIR with
# its own CLAUDE.md - never Langston's memory), posts its answer through this bot so the session wake
# filters record its [[ALERT ...]] markers exactly as they record Langston's, and hands Langston an
# escalated task (people-class priority) for every alert the lane escalated, could not mark validly,
# or could not identify. A lane failure escalates the whole batch: an alert is never silently dropped.
import alert_lane as al
ALERT_LANE_ENABLED = os.environ.get("LANGSTON_ALERT_LANE", "0") == "1"


def read_live_rows(ids):
    """The alerts' live rows from staging, read by the BRIDGE (the lane has no tools). {id: row}; an id absent from
    the result is reported to the lane as unreadable, which its rules escalate. Never raises."""
    if not ids:
        return {}
    cmd = "grep -F " + " ".join("-e %s" % i for i in ids if re.fullmatch(al.UUID, i)) + \
          " /var/log/dawntrader/system-alerts.jsonl"
    try:
        r = subprocess.run(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=15", "staging", cmd],
                           env=dict(os.environ, HOME=WORK_DIR), capture_output=True, text=True, timeout=60)
    except Exception as e:
        log(f"alert lane: live-row read FAILED ({type(e).__name__}: {e}) - every row reported unreadable")
        return {}
    if r.returncode not in (0, 1):            # grep: 1 = no match, which the lane is told per id
        log(f"alert lane: live-row read exit {r.returncode}: {(r.stderr or '')[:200]} - rows reported unreadable")
        return {}
    return al.parse_live_rows(r.stdout, ids)


def invoke_lane(prompt):
    """One fresh lane invocation. Returns (answer, None) or (None, why)."""
    env = os.environ.copy()
    env["CLAUDE_CODE_OAUTH_TOKEN"] = OAUTH_TOKEN
    env["HOME"] = WORK_DIR
    env["PATH"] = "/usr/local/bin:/usr/bin:/bin"
    # ⛔ NO TOOLS (Langston r2, 2026-10-16): measured, the lane ran with HOME=/home/langston, whose settings allow Bash,
    #    and langston's key reaches deploy@staging - so "never ack" was only an instruction. Every tool is disallowed
    #    (a deny outranks any allow); the bridge reads the live rows and the precedent and puts them in the prompt.
    args = ["/usr/bin/claude", "-p", prompt, "--session-id", str(uuid.uuid4()),
            "--model", al.LANE_MODEL, "--permission-mode", "default",
            "--disallowedTools", ",".join(al.LANE_DENIED_TOOLS)]
    log(f"alert lane: invoking {al.LANE_MODEL} (prompt={len(prompt)} chars)")
    t0 = time.time()
    try:
        r = subprocess.run(args, env=env, cwd=al.LANE_DIR, capture_output=True, text=True,
                           timeout=al.LANE_TIMEOUT_S)
    except subprocess.TimeoutExpired:
        return None, f"timed out after {al.LANE_TIMEOUT_S}s"
    except Exception as e:
        return None, f"{type(e).__name__}: {e}"
    if r.returncode != 0 or not (r.stdout or "").strip():
        return None, f"exit {r.returncode}: {(r.stderr or '')[:300]}"
    log(f"alert lane: returned {len(r.stdout)} chars in {time.time() - t0:.1f}s")
    return r.stdout.strip(), None


def escalate_alert(task_q, t, reason):
    """Hand one alert to Langston, durably: the spool records it as escalated before it is queued, and the
    worker removes that record only after processing it (Coltrane send-back r2)."""
    try:
        al.spool_write(al.SPOOL_DIR, t, "escalated", reason=reason)
    except Exception as e:
        log(f"alert spool: WRITE FAILED for escalated msg {t.get('message_id')} ({type(e).__name__}: {e}) - "
            f"it is queued for Langston but would not survive a restart")
    task_q.put({**t, "escalated": True,
                "content": f"[ESCALATED to you by the alert lane — {reason}]\n\n" + t["content"]})
    log(f"alert lane: escalated msg {t['message_id']} to Langston ({reason})")


def restore_alert_spool(alert_q, task_q):
    """At start: re-queue every alert whose work was not durably finished before the last stop. Routing the
    lane already RECORDED, or an escalation Langston already ANSWERED, is cleared instead, so nothing is done
    twice; everything else goes back to the lane (or to Langston when the lane is off / it was escalated)."""
    recs, problems = al.spool_load(al.SPOOL_DIR)
    for p in problems:
        log(f"alert spool: {p}")
    if not recs:
        return
    routed, replied = al.inbox_evidence(dc.INBOX_LOG)
    counts = {"lane": 0, "langston": 0, "already done": 0}
    for r in recs:
        t, st = r["task"], r.get("state")
        mid = int(t["message_id"])
        if st == "posting" and r.get("aid") in routed and r.get("escalate"):
            # Coltrane r3: routing was recorded but the escalation it also owed Langston never happened.
            escalate_alert(task_q, t, r["escalate"])
            counts["langston"] += 1
        elif st == "posting" and r.get("aid") in routed:
            al.spool_remove(al.SPOOL_DIR, mid)
            counts["already done"] += 1
        elif st == "escalated" and mid in replied:
            al.spool_remove(al.SPOOL_DIR, mid)
            counts["already done"] += 1
        elif st == "escalated":
            task_q.put({**t, "escalated": True,
                        "content": f"[ESCALATED to you by the alert lane — {r.get('reason', 'restored after restart')}]"
                                   f"\n\n" + t["content"]})
            counts["langston"] += 1
        elif alert_q is not None:
            alert_q.put(t)
            counts["lane"] += 1
        else:
            task_q.put(t)
            counts["langston"] += 1
    log(f"alert spool: restored after restart - {counts['lane']} to the lane, {counts['langston']} to Langston, "
        f"{counts['already done']} already done and cleared")


def run_alert_batch(batch, task_q):
    """Triage one batch of alert tasks; escalate whatever the lane does not account for."""
    channel_id = batch[0]["channel_id"]
    ided, escalate = [], []                 # escalate: [(task, reason)]
    for t in batch:
        mirror_event("langston_alert_inbound", channel_id=t["channel_id"], message_id=t["message_id"],
                     author_id=t["author_id"], sender_username=t["author_name"], text=t["content"], lane="alert")
        aid = al.alert_id_of(t.get("content"))
        if aid is None:
            escalate.append((t, "the alert lane could not read an alert id in it"))
        else:
            ided.append((aid, t))
    if ided:
        # Langston's precedent ruling (2026-10-16): his OWN past assignments per (template, symbol), shown to the lane
        # AND enforced after its answer - a contradiction, a split, or a unanimity alarm goes to him.
        keys = {aid: al.alert_key(t["content"]) for aid, t in ided}
        conflicts = []
        try:
            prec = al.langston_precedent(dc.INBOX_LOG, datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                         conflicts=conflicts)
        except Exception as e:
            log(f"alert lane: precedent read FAILED ({type(e).__name__}: {e}) - every alert is treated as unprecedented")
            prec = {}
        if conflicts:
            log(f"alert lane: {len(conflicts)} alert id(s) carry two title templates after the re-surface strip; "
                f"first kept, e.g. {conflicts[0][0]}: {conflicts[0][1]} vs {conflicts[0][2]}")
        rows = read_live_rows([aid for aid, _ in ided])
        answer, why = invoke_lane(al.build_prompt([(aid, t["content"]) for aid, t in ided], keys, prec, rows))
        if answer is None:
            log(f"alert lane: FAILED ({why}) - escalating all {len(ided)} alert(s) of this batch to Langston")
            escalate += [(t, f"the alert lane failed ({why})") for _, t in ided]
        else:
            routed, esc, problems = al.read_answer(answer, [aid for aid, _ in ided])
            routed, esc, pnotes = al.apply_precedent(routed, esc, keys, prec)
            for p in problems + pnotes:
                log(f"alert lane: {p}")
            by_id = dict(ided)
            kyle_owned = any(owner == "Kyle" for owner, _ in routed.values())
            # ⛔ Coltrane send-back 1: only markers rebuilt from the VALIDATED result are published.
            text = "Alert lane — " + al.publishable(answer, routed, esc)
            # ⛔ Coltrane send-back 2: routing counts only when BOTH the post and the langston_outbound record
            #    (the wake filters' input) succeed. rest_send returns None when any chunk fails, and mirror_event
            #    swallows its own failure, so both are checked here; on either failure EVERY alert in the batch
            #    goes to Langston - a Kyle-owned row must never lose its mention silently.
            for aid, t in ided:                      # Coltrane r2: publishing is a recorded state
                try:                                 # Coltrane r3: carrying any escalation it still owes Langston
                    if aid in esc:
                        al.spool_write(al.SPOOL_DIR, t, "posting", aid=aid, escalate=esc[aid])
                    else:
                        al.spool_write(al.SPOOL_DIR, t, "posting", aid=aid)
                except Exception as e:
                    log(f"alert spool: could not mark msg {t['message_id']} posting ({type(e).__name__}: {e})")
            sent_id = dc.rest_send(BOT_TOKEN, channel_id, text, LOG_FILE,
                                   mention_user_id=CFG["kyle_id"] if kyle_owned else None)
            delivered, why = sent_id is not None, "the lane's Discord post failed"
            if delivered:
                try:
                    dc.append_inbox({"ts": datetime.datetime.now().astimezone().isoformat(),
                                     "source": "discord-langston-bridge", "transport": "discord",
                                     "kind": "langston_outbound", "channel_id": channel_id, "message_id": sent_id,
                                     "reply_to": ided[0][1]["message_id"], "text": text, "lane": "alert"})
                except Exception as e:
                    delivered, why = False, f"the lane's inbox record failed ({type(e).__name__}: {e})"
            if delivered:
                for aid, t in ided:                  # routing durably recorded: its spooled work is done
                    if aid not in esc:
                        al.spool_remove(al.SPOOL_DIR, t["message_id"])
                escalate += [(by_id[aid], reason) for aid, reason in esc.items()]
                log(f"alert lane: batch of {len(batch)} - routed {len(routed)}, escalated {len(esc)}")
            else:
                log(f"alert lane: DELIVERY FAILED ({why}) - handing all {len(ided)} alert(s) of this batch to Langston")
                escalate += [(t, why) for _, t in ided]
    for t, reason in escalate:
        escalate_alert(task_q, t, reason)


def alert_worker(alert_q, task_q):
    """Single lane worker: take one alert, gather the rest of the burst, triage them in one invocation."""
    while True:
        try:
            batch = [alert_q.get()]
            deadline = time.time() + al.BATCH_SETTLE_S
            while len(batch) < al.BATCH_MAX:
                left = deadline - time.time()
                if left <= 0:
                    break
                try:
                    batch.append(alert_q.get(timeout=left))
                except queue.Empty:
                    break
            try:
                run_alert_batch(batch, task_q)
            except Exception as e:
                log(f"alert lane: batch error {type(e).__name__}: {e} - escalating the batch to Langston")
                for t in batch:
                    escalate_alert(task_q, t, f"the alert lane errored ({type(e).__name__})")
        except Exception as e:
            log(f"alert lane: worker outer error (resuming): {type(e).__name__}: {e}")
            time.sleep(1)


# ─── Gateway client (receive only) ───────────────────────────────────────────

def build_client(task_q, recover_floor=None, alert_q=None):
    intents = discord.Intents.default()
    intents.message_content = True
    # enable_debug_events=True so on_socket_raw_receive fires — the true receive-liveness signal (#462).
    client = discord.Client(intents=intents, enable_debug_events=True)
    # B-COMMS-CHUNK-FIX follow-up (2026-07-22): the dedup below is MEMORY-ONLY, so a
    # restart forgets every message it has handled and a gateway RESUME can replay
    # history into a fresh process. Measured: one restart re-buffered 6 chunk-groups
    # at 1/2 (5 already COMPLETE pre-restart), which later flushed as spurious
    # INCOMPLETE notes and made Langston withhold rulings on intact messages.
    PROC_START = _dt.datetime.now(_dt.timezone.utc)
    seen = deque(maxlen=512)       # message-id dedup (review: RESUME can redeliver MESSAGE_CREATE)
    seen_set = set()

    recovered = {"done": False, "running": False}

    @client.event
    async def on_ready():
        log(f"gateway connected as {client.user} (id={client.user.id})")
        # B-LANGSTON-RELIEF OBJ-1: one-shot recovery of people's messages queued before a restart.
        # Runs only when main() found a valid recover-since floor. Re-feeds the channel since the floor,
        # oldest first, through on_message with _recover=True; ids the worker has already STARTED
        # (langston_inbound in the inbox) are skipped, alerts are refused inside on_message, and the
        # seen-set stops the watchdog backfill (and a retry) from enqueuing anything twice.
        # ⛔ Coltrane send-back 1 (2026-10-16): it is DONE, and the floor file is deleted, ONLY after a
        #    found channel and a COMPLETE history read and re-feed. Any failure keeps the floor, says so
        #    loudly, and the pass runs again at the next gateway ready - a failed recovery must never
        #    destroy its own retry authority.
        if recover_floor is None or recovered["done"] or recovered["running"]:
            return
        recovered["running"] = True
        try:
            started = gw.inbox_message_ids(dc.INBOX_LOG, kinds={"langston_inbound"})
            ch = client.get_channel(CFG["channel_id"])
            if ch is None:
                ch = await client.fetch_channel(CFG["channel_id"])
            if ch is None:
                raise RuntimeError("channel %s not found" % CFG["channel_id"])
            msgs = [m async for m in ch.history(after=recover_floor, oldest_first=True, limit=None)]
            # ⛔ Coltrane send-back 2: a chunked dispatch is ONE task, recorded under ONE piece's id. If the
            #    worker started any piece of a group, skip EVERY piece, or the rest rebuild an N-1/N buffer
            #    that later flushes as an INCOMPLETE duplicate.
            started_groups = set()
            for m in msgs:
                g = GROUP_MARKER_RE.search(getattr(m, "content", "") or "")
                if g and m.id in started:
                    started_groups.add(g.group(1))
            fed = skipped = 0
            for m in msgs:
                g = GROUP_MARKER_RE.search(getattr(m, "content", "") or "")
                if m.id in started or (g and g.group(1) in started_groups):
                    skipped += 1
                    continue
                await on_message(m, _recover=True)
                fed += 1
        except Exception as e:
            recovered["running"] = False
            log(f"recovery: FAILED ({type(e).__name__}: {e}) - the floor file is KEPT and recovery retries at "
                f"the next gateway ready; nothing waiting has been dropped yet")
            try:
                dc.rest_send(BOT_TOKEN, CFG["channel_id"],
                             f"Langston bridge: recovering messages from before my restart FAILED "
                             f"({type(e).__name__}). I kept the recovery point and will retry on reconnect; "
                             f"Infra Claude can also restart me.", LOG_FILE, mention_user_id=CFG["kyle_id"])
            except Exception:
                pass
            return
        recovered["done"] = True
        recovered["running"] = False
        log(f"recovery: re-read channel since {recover_floor.isoformat()} - {fed} message(s) re-fed through "
            f"the handler, {skipped} skipped as already started by the worker (whole chunk groups included; "
            f"only people's messages addressed to Langston are enqueued, never alerts)")
        try:
            os.remove(lq.RECOVER_FLOOR_FILE)
        except OSError as e:
            log(f"recovery: done, but the floor file could not be removed ({e}); remove it before the next restart")

    @client.event
    async def on_message(message, _recover=False):
        # Loop guard: never react to our own messages.
        if message.author.id == client.user.id:
            return
        is_dm = message.guild is None
        if not is_dm and message.channel.id != CFG["channel_id"]:
            return
        # Pre-startup replay guard (see PROC_START). FAIL-OPEN: an unreadable
        # timestamp means PROCESS, never drop - a comms bridge must not discard
        # real traffic to protect itself from duplicates.
        # B-LANGSTON-RELIEF OBJ-1: the one exception is the explicit recovery pass in on_ready
        # (_recover=True), and even then never a system alert: a still-live alert is re-posted by
        # the dispatcher, and the stale alert backlog is exactly what a restart is meant to shed.
        try:
            _created = getattr(message, 'created_at', None)
            if _created is not None and _created < PROC_START:
                _wh = getattr(message, "webhook_id", None)
                _from_alerts = (_wh is not None and CFG.get("alerts_webhook_id") is not None
                                and _wh == CFG["alerts_webhook_id"])
                if not _recover or _from_alerts:
                    log(f'skip replay: msg {message.id} predates process start')
                    return
        except Exception as _e:
            log(f'replay-guard check failed ({_e}) - processing anyway (fail-open)')

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
        # ── B-COMMS-CHUNK-FIX: REASSEMBLE BEFORE THE ADDRESS GATE ──────────────────────
        # A >2000-char Langston dispatch is posted as N independent Discord messages; only
        # chunk 0 carries the leading "Langston", so chunks 2..N die at the anchored gate
        # below (that IS the bug). We buffer marked chunks by group id and only fall through
        # once the group is COMPLETE — at which point `content` is the full reassembled
        # dispatch and chunk 0's leading "Langston" gates the whole thing, in ONE invoke.
        # Alerts are excluded (they bypass the gate anyway); Kyle's messages are never marked.
        if author_is_cc_bot and not is_alert and not voice:
            _now = time.time()
            for _sg in [g for g, e in list(_chunk_groups.items())
                        if _now - e['t0'] > GROUP_TIMEOUT_S]:
                _e = _chunk_groups.pop(_sg, None)
                if not _e:
                    continue
                _missing = [i for i in range(1, _e['n'] + 1) if i not in _e['parts']]
                _partial = "\n".join(_e['parts'][i] for i in sorted(_e['parts']))
                _partial += (f"\n\n[INCOMPLETE CHUNK GROUP {_sg}: received "
                             f"{len(_e['parts'])}/{_e['n']}, missing {_missing}. "
                             f"Content above is PARTIAL — treat conclusions as provisional.]")
                log(f"chunk-group {_sg}: TIMEOUT flush, missing {_missing}")
                task_q.put({**_e['base'], 'kind': 'text', 'content': _partial})
            _gm = GROUP_MARKER_RE.search(content)
            if _gm:
                _grp, _k, _n = _gm.group(1), int(_gm.group(2)), int(_gm.group(3))
                _body = GROUP_MARKER_RE.sub('', content).rstrip()
                _e = _chunk_groups.setdefault(_grp, {
                    'parts': {}, 'n': _n, 't0': time.time(),
                    'base': {'channel_id': message.channel.id, 'message_id': message.id,
                             'author_id': message.author.id, 'author_name': str(message.author),
                             'author_display': getattr(message.author, 'display_name', None)
                                               or getattr(message.author, 'name', None),
                             'is_alert': False, 'is_dm': is_dm}})
                _e['parts'][_k] = _body
                # Finding A (Langston Step-4, 2026-07-22): refresh on EVERY part so the
                # timeout measures SILENCE since the last chunk, not the group's total age.
                # Without this, a group stretched past GROUP_TIMEOUT_S by 429 backoff or by
                # sheer chunk count gets swept as INCOMPLETE while its own chunks are still
                # arriving — no content is lost, but one dispatch fragments into two
                # provisional invokes, and the trailing chunks rebuild a partial that can
                # never complete. Refreshing here makes the sweep an inactivity check.
                _e['t0'] = time.time()
                if len(_e['parts']) < _e['n']:
                    log(f"chunk-group {_grp}: buffered {len(_e['parts'])}/{_e['n']}, waiting")
                    return
                content = "\n".join(_e['parts'][i] for i in sorted(_e['parts']))
                _chunk_groups.pop(_grp, None)
                log(f"chunk-group {_grp}: COMPLETE {_n}/{_n} -> reassembled {len(content)} chars")

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
        # B-COMMS-IMAGES (Step-4 finding 1 — the reader's WRITER; it was absent from the
        # first diff and the capability was dead-from-birth): metadata-only capture, on-loop;
        # the DOWNLOAD stays in the worker (process_task). Set on `base` so text/voice/alert
        # task kinds all carry it uniformly.
        _imeta = dc.collect_image_meta(message)
        if _imeta:
            base["image_atts"] = _imeta
        if is_alert and not voice:
            if alert_q is not None:                  # B-LANGSTON-RELIEF OBJ-2: the alert lane, not Langston
                _t = {**base, "kind": "alert", "content": content}
                try:                                 # Coltrane r2: on disk BEFORE it is queued
                    al.spool_write(al.SPOOL_DIR, _t, "pending")
                except Exception as _e:
                    # Coltrane r3: never silently memory-only. Say so in the channel, to Kyle, naming the alert, so a
                    # restart cannot lose it unseen; the lane still gets it.
                    log(f"alert spool: WRITE FAILED for msg {message.id} ({type(_e).__name__}: {_e}) - "
                        f"announcing it, then queueing it")
                    try:
                        dc.rest_send(BOT_TOKEN, CFG["channel_id"],
                                     f"Langston bridge: could not save an incoming alert to disk ({type(_e).__name__}). "
                                     f"It is being triaged now, but a restart before then would lose it. Alert: "
                                     f"{(al.alert_id_of(content) or 'id unreadable')} (message {message.id}).",
                                     LOG_FILE, mention_user_id=CFG["kyle_id"])
                    except Exception:
                        pass
                alert_q.put(_t)
                log(f"ALERT to lane: msg {message.id} via alerts webhook")
                return
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

    # B-DISCORD-INBOUND-LIVENESS (#462): same receive-liveness watchdog as the CC bridge — this
    # bridge has the identical zombie failure mode. rest_send is gateway-INDEPENDENT so the loud
    # alert (+mention Kyle) reaches him while receive is dead. replay_message=on_message re-enqueues
    # missed review requests (task_q is in-memory → lost on restart; backfill recovers them). Dedup
    # against langston_inbound — the kind the worker writes once it has actually handled an id.
    _ssh = os.environ.get("WATCHDOG_SSH_ALERT_CMD") or None
    gw.install_watchdog(
        client,
        bridge_name="discord-langston-bridge",
        send_alert_fn=lambda m: dc.rest_send(BOT_TOKEN, CFG["channel_id"], m, LOG_FILE,
                                             mention_user_id=CFG["kyle_id"]),
        state_path=WATCHDOG_STATE,
        log_fn=log,
        inbox_log=dc.INBOX_LOG,
        channel_id=CFG["channel_id"],
        replay_message=on_message,
        ssh_alert_cmd=_ssh,
        dedup_kinds={"langston_inbound"},
    )
    return client


def main():
    state = load_state()
    save_state(state)
    log(f"Discord Langston bridge starting. session_id={state['session_id']} channel={CFG['channel_id']}")
    # B-LANGSTON-RELIEF OBJ-1: people's messages are served before system alerts (lq.TaskPriorityQueue).
    task_q = lq.TaskPriorityQueue()
    recover_floor, why = lq.read_recover_floor()
    if recover_floor is not None:
        log(f"recovery: will re-read people's messages since {recover_floor.isoformat()} once the gateway is ready")
    elif why != "absent":
        log(f"recovery: floor file ignored ({why}); nothing from before this start will be recovered")
    worker = threading.Thread(target=task_worker, args=(task_q, state), daemon=True, name="task-worker")
    worker.start()
    log("task worker thread started")
    alert_q = None
    if ALERT_LANE_ENABLED:
        alert_q = queue.Queue()
        threading.Thread(target=alert_worker, args=(alert_q, task_q), daemon=True, name="alert-lane").start()
        log(f"alert lane ON ({al.LANE_MODEL}, {al.LANE_DIR}): system alerts no longer invoke Langston")
    try:
        restore_alert_spool(alert_q, task_q)       # Coltrane r2: alert work left over from before this start
    except Exception as e:
        log(f"alert spool: RESTORE FAILED ({type(e).__name__}: {e}) - spooled alerts remain on disk, not queued")
    client = build_client(task_q, recover_floor, alert_q)
    # discord.py manages gateway reconnects internally; run() blocks forever.
    client.run(BOT_TOKEN, reconnect=True, log_handler=None)


if __name__ == "__main__":
    main()
