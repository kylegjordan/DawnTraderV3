#!/usr/bin/env python3
"""
discord_common.py — shared helpers for the DawnTrader Discord comms bridges.

Mirrors the reusable logic from the Telegram bridges
(comms-infra/telegram-reference/{langston-bridge.py, cc-comms-bridge}):
  - inbox-log JSONL append (SAME schema the wake filter + §10.5 reader expect)
  - whisper.cpp voice transcription (ffmpeg Ogg→WAV → whisper-cli), identical pipeline
  - Discord REST send (chunked at 2000) + voice-attachment download
  - config loading

Design split (see DISCORD_BRIDGE_DESIGN.md): discord.py is used by the two
bridge processes ONLY for the gateway RECEIVE path (on_message). All SENDING
and voice DOWNLOAD go through plain REST here, so the blocking claude/whisper
worker thread is fully decoupled from the asyncio event loop.

Parallel-run isolation: the Discord bridges write to /var/log/cc-discord-inbox.jsonl
(SEPARATE from the live Telegram /var/log/cc-bridge-inbox.jsonl). The live Telegram
fabric is never touched.
"""
import json
import os
import re
import subprocess
import sys
import uuid
import time
import urllib.request
import urllib.error
from pathlib import Path

# ─── Paths / config ──────────────────────────────────────────────────────────
DISCORD_API = "https://discord.com/api/v10"
INBOX_LOG = "/var/log/cc-discord-inbox.jsonl"          # SEPARATE from Telegram's during the trial
SHARED_CONFIG_FILE = "/etc/dawntrader/discord-comms.env"  # CHANNEL_ID + KYLE_DISCORD_ID (Kyle-provisioned)

# Discord hard limit on message content length
MSG_LIMIT = 2000
# B-COMMS-CHUNK-FIX (2026-07-22): mirror of discord-langston-bridge.py ADDRESS_START_RE —
# the receiver's ANCHORED address gate. Deliberately kept in sync; see
# 'Claude Comms and Packages/Scope Files/B_COMMS_CHUNK_FIX_PRE_AUDIT.md'.
ADDRESS_START_RE = re.compile(r'^[\s*_~`>#:\".\-]*langston\b', re.I)
# Visible + auditable group marker (Langston ruling 2026-07-22: fail-loud beats an
# invisible sentinel in the one silent-drop path we are closing). Langston-addressed ONLY,
# so Kyle-facing and §10.5 alert traffic stay byte-identical to before.
GROUP_MARKER_FMT = '\u27e8grp={grp} {i}/{n}\u27e9'
GROUP_MARKER_RESERVE = 48  # headroom so chunk+marker can never exceed MSG_LIMIT



def split_on_whitespace(text, limit):
    """Split `text` into <=limit-char pieces, breaking ONLY at whitespace.

    Finding B (B-COMMS-CHUNK-FIX, 2026-07-22; CC-A and CC-B escalated this independently).
    `path:line` refs are the load-bearing evidence format on this channel. A hard cut
    through `ready_to_buy_service.ts:2440` does NOT throw - it yields a different, still
    PLAUSIBLE coordinate, so the reader verifies against the wrong line and concludes a
    TRUE claim is false. Same false-absence class the governed-read rule exists to stop,
    arriving via the transport instead of via a bad grep.

    Breaking only at whitespace makes that impossible by construction: a token with no
    whitespace in it (file:line, commit sha, path, URL) can never be split. Full
    byte-fidelity was considered and REJECTED - it requires slices that begin or end with
    whitespace, and Discord normalises leading/trailing whitespace on send, so a
    byte-exact scheme would be silently wrong. Seam whitespace may normalise; evidence
    coordinates cannot corrupt.

    A single non-whitespace RUN longer than `limit` is genuinely unsplittable: we hard-cut
    and the caller LOGS it, rather than silently corrupting a token nobody knows about.
    """
    pieces, i, n = [], 0, len(text)
    while i < n:
        if n - i <= limit:
            pieces.append(text[i:])
            break
        window = text[i:i + limit + 1]      # +1 so a boundary AT the limit is visible
        cut = max(window.rfind(chr(10)), window.rfind(' '))
        if cut <= 0:
            cut = limit                     # unbreakable run - caller logs this
        pieces.append(text[i:i + cut])
        i += cut
        while i < n and text[i] in (' ' + chr(10)):   # consume seam whitespace once
            i += 1
    return [p for p in pieces if p != '']
# A voice message carries this flag (IS_VOICE_MESSAGE = 1 << 13)
VOICE_MESSAGE_FLAG = 8192

# ─── whisper.cpp voice config (identical to the Telegram bridges) ─────────────
WHISPER_CLI = "/opt/whisper.cpp/build/bin/whisper-cli"
WHISPER_MODEL = "/opt/whisper.cpp/models/ggml-small.en.bin"
WHISPER_THREADS = "3"
WHISPER_TIMEOUT_S = 120
FFMPEG_BIN = "/usr/bin/ffmpeg"
FFMPEG_TIMEOUT_S = 30
ATTACHMENT_SIZE_CAP = 25 * 1024 * 1024  # Discord default upload cap; voice notes are tiny
ACK_PREVIEW_CHARS = 100


def log(msg, log_file):
    line = f"{time.strftime('%Y-%m-%d %H:%M:%S')} {msg}"
    print(line, file=sys.stderr, flush=True)
    try:
        Path(log_file).parent.mkdir(parents=True, exist_ok=True)
        with open(log_file, "a") as f:
            f.write(line + "\n")
    except Exception:
        pass


def load_env_value(path, key):
    """Read KEY=value from a simple env file. Returns the value or raises."""
    for line in Path(path).read_text().splitlines():
        line = line.strip()
        if line.startswith(f"{key}="):
            return line.split("=", 1)[1].strip()
    raise RuntimeError(f"{key} not found in {path}")


def load_shared_config():
    """Returns dict: channel_id, kyle_id, cc_bot_id (pinned), langston_bot_id (opt), guild_id (opt)."""
    cfg = {}
    cfg["channel_id"] = int(load_env_value(SHARED_CONFIG_FILE, "DISCORD_CHANNEL_ID"))
    cfg["kyle_id"] = int(load_env_value(SHARED_CONFIG_FILE, "KYLE_DISCORD_ID"))
    # CC_BOT_ID pins which bot Langston accepts as "CC" (Langston review 1a) — not the
    # generic .bot flag, so a stray webhook/utility bot can't trigger a paid Langston turn.
    cfg["cc_bot_id"] = int(load_env_value(SHARED_CONFIG_FILE, "CC_BOT_ID"))
    for opt in ("LANGSTON_BOT_ID", "DISCORD_GUILD_ID"):
        try:
            cfg[opt.lower().replace("discord_", "")] = int(load_env_value(SHARED_CONFIG_FILE, opt))
        except Exception:
            cfg[opt.lower().replace("discord_", "")] = None
    # Optional webhook for per-session display names (Claude Old / Claude New). CC_WEBHOOK_ID
    # is derived from the URL so Langston still recognizes CC's webhook posts as "CC" (the
    # address-gate keys on it in addition to CC_BOT_ID).
    try:
        cfg["webhook_url"] = load_env_value(SHARED_CONFIG_FILE, "CC_WEBHOOK_URL")
        cfg["webhook_id"] = int(cfg["webhook_url"].rstrip("/").split("/webhooks/")[1].split("/")[0])
    except Exception:
        cfg["webhook_url"] = None
        cfg["webhook_id"] = None
    # Optional dedicated SYSTEM-ALERTS webhook id (B-DISCORD OBJ-5). The §10.5 alert dispatcher
    # posts each fired alert via a dedicated "DawnTrader Alerts" webhook; Langston's bridge
    # ALWAYS engages on this webhook_id (bypassing the start-with-"Langston" gate) so a critical
    # alert can never be silently dropped on phrasing. webhook_id is NOT a secret (the URL is) —
    # it lives here in bridge config; it changes only if the webhook is deleted+recreated.
    # Inert (None) until Kyle provisions the webhook → the always-engage path stays disabled.
    try:
        cfg["alerts_webhook_id"] = int(load_env_value(SHARED_CONFIG_FILE, "ALERTS_WEBHOOK_ID"))
    except Exception:
        cfg["alerts_webhook_id"] = None
    # Optional per-sender avatar icons (URLs), keyed by sender label.
    cfg["avatars"] = {}
    for key, label in (("AVATAR_CLAUDE_OLD", "OLD Claude"), ("AVATAR_CLAUDE_NEW", "NEW Claude")):
        try:
            cfg["avatars"][label] = load_env_value(SHARED_CONFIG_FILE, key)
        except Exception:
            pass
    return cfg


def append_inbox(entry):
    """Single-write JSONL append to the Discord inbox log (atomic under PIPE_BUF)."""
    Path(INBOX_LOG).parent.mkdir(parents=True, exist_ok=True)
    with open(INBOX_LOG, "a") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def chunk_text(text, limit=MSG_LIMIT):
    """Split on newline boundaries, falling back to hard cut. Mirrors the Telegram chunker."""
    if not text:
        return ["_(empty response)_"]
    chunks = []
    while len(text) > limit:
        cut = text.rfind("\n", 0, limit)
        if cut < limit // 2:
            cut = limit
        chunks.append(text[:cut])
        text = text[cut:].lstrip("\n")
    chunks.append(text)
    return chunks


INTER_CHUNK_DELAY_S = 0.35   # stay under the per-channel ~5 msg/5s limit on multi-chunk relays
MAX_429_RETRIES = 4
UA = "DawnTraderBridge (https://dawntrader, 1.0)"


def _post_json(url, headers, payload, log_file):
    """Single POST with 429 Retry-After handling. Returns (ok: bool, resp_json|None)."""
    body = json.dumps(payload).encode("utf-8")
    for attempt in range(MAX_429_RETRIES + 1):
        req = urllib.request.Request(url, data=body, method="POST", headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                raw = r.read()
                return True, (json.loads(raw) if raw else None)
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            if e.code == 429 and attempt < MAX_429_RETRIES:
                retry_after = e.headers.get("Retry-After")
                try:
                    wait = float(retry_after) if retry_after else float(json.loads(raw).get("retry_after", 1.0))
                except Exception:
                    wait = 1.0
                log(f"POST 429, retry in {wait:.2f}s (attempt {attempt+1})", log_file)
                time.sleep(min(wait + 0.1, 10))
                continue
            log(f"POST HTTP {e.code}: {raw[:300]}", log_file)
            return False, None
        except Exception as e:
            log(f"POST error: {type(e).__name__}: {e}", log_file)
            return False, None
    return False, None


def _send_chunks(url, base_headers, content, log_file, mention_user_id=None, extra_payload=None):
    """Chunk + deliver content via repeated _post_json. Returns first chunk's message id or None.

    Aborts (returns None) if any chunk fails, so callers never log a truncated delivery.
    """
    # B-COMMS-CHUNK-FIX: decide Langston-addressing on the ORIGINAL content, before any
    # mention/marker mutation, so the test is stable.
    addressed_langston = bool(ADDRESS_START_RE.match(content or ""))
    chunks = chunk_text(content)
    multi_langston = addressed_langston and len(chunks) > 1
    if multi_langston:
        # Reserve headroom so chunk + marker can never exceed the 2000-char hard cap, and
        # split ONLY at whitespace (Finding B) so no file:line / sha / path is ever cut in
        # half across the seam.
        _lim = MSG_LIMIT - GROUP_MARKER_RESERVE
        chunks = split_on_whitespace(content, _lim)
        if any(len(_c) >= _lim for _c in chunks):
            log('send: WARNING unbreakable run >=%d chars - a token may be split' % _lim,
                log_file)
    if mention_user_id:
        if addressed_langston:
            # §2 FIX: NEVER prepend to a Langston-addressed dispatch — '<' is not in the
            # gate's allowed leading class, so a prepended mention drops the whole message.
            _m = ADDRESS_START_RE.match(chunks[0])
            _cut = _m.end() if _m else 0
            chunks[0] = chunks[0][:_cut] + f" <@{mention_user_id}>" + chunks[0][_cut:]
        else:
            chunks[0] = f"<@{mention_user_id}> " + chunks[0]
    if multi_langston:
        _grp = uuid.uuid4().hex[:8]
        _total = len(chunks)
        chunks = [f"{_c}\n" + GROUP_MARKER_FMT.format(grp=_grp, i=_i + 1, n=_total)
                  for _i, _c in enumerate(chunks)]
        log(f"send: Langston-addressed multi-chunk grp={_grp} n={_total}", log_file)
    first_id = None
    for i, chunk in enumerate(chunks):
        payload = {"content": chunk}
        if extra_payload:
            payload.update(extra_payload)
        ok, resp = _post_json(url, base_headers, payload, log_file)
        if not ok:
            log(f"send: chunk {i} failed — aborting (no truncated-delivery claim)", log_file)
            return None
        if i == 0 and resp:
            first_id = resp.get("id")
        if i < len(chunks) - 1:
            time.sleep(INTER_CHUNK_DELAY_S)
    return first_id


def rest_send(token, channel_id, content, log_file, mention_user_id=None):
    """POST to a channel as the bot. Auto-chunks at 2000, 429-safe (Langston review 2b).
    mention_user_id (Test 6 / §6.10): @-mention so Discord pushes a phone notification."""
    url = f"{DISCORD_API}/channels/{channel_id}/messages"
    headers = {"Authorization": f"Bot {token}", "Content-Type": "application/json", "User-Agent": UA}
    return _send_chunks(url, headers, content, log_file, mention_user_id=mention_user_id)


def webhook_send(webhook_url, username, content, log_file, avatar_url=None, mention_user_id=None):
    """POST via a Discord webhook with a per-message display NAME (and optional avatar),
    so each CC session ("Claude Old" / "Claude New") shows as a distinct sender even though
    they share one underlying app. ?wait=true makes Discord return the created message."""
    url = webhook_url + ("&" if "?" in webhook_url else "?") + "wait=true"
    headers = {"Content-Type": "application/json", "User-Agent": UA}
    extra = {"username": username}
    if avatar_url:
        extra["avatar_url"] = avatar_url
    return _send_chunks(url, headers, content, log_file, mention_user_id=mention_user_id, extra_payload=extra)


def download_attachment(url, dest_path, log_file):
    """Download a Discord CDN attachment (signed URL). Returns (ok, size)."""
    try:
        req = urllib.request.Request(
            url, method="GET",
            headers={"User-Agent": "DawnTraderBridge (https://dawntrader, 1.0)"},
        )
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
        Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
        with open(dest_path, "wb") as f:
            f.write(data)
        return True, len(data)
    except Exception as e:
        log(f"attachment download failed: {type(e).__name__}: {e}", log_file)
        return False, 0


def transcribe_audio(audio_path, log_file):
    """ffmpeg Ogg/Opus → 16kHz mono WAV → whisper-cli. Identical to the Telegram pipeline.

    Returns (text|None, error|None, duration_ms).
    """
    t0 = time.time()
    wav_path = f"/tmp/dwhisper-in-{os.getpid()}-{int(t0*1000)}.wav"
    out_prefix = f"/tmp/dwhisper-out-{os.getpid()}-{int(t0*1000)}"

    ffmpeg_args = [
        FFMPEG_BIN, "-loglevel", "error", "-y",
        "-i", audio_path,
        "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le",
        wav_path,
    ]
    try:
        ff = subprocess.run(ffmpeg_args, capture_output=True, text=True, timeout=FFMPEG_TIMEOUT_S)
        if ff.returncode != 0:
            return None, f"ffmpeg exit={ff.returncode} stderr_tail={ff.stderr[-500:]}", int((time.time() - t0) * 1000)
        if not Path(wav_path).exists():
            return None, f"ffmpeg produced no WAV (stderr: {ff.stderr[-500:]})", int((time.time() - t0) * 1000)
    except subprocess.TimeoutExpired:
        return None, f"ffmpeg timeout after {FFMPEG_TIMEOUT_S}s", int((time.time() - t0) * 1000)
    except Exception as e:
        return None, f"ffmpeg invoke error: {type(e).__name__}: {e}", int((time.time() - t0) * 1000)

    args = [
        WHISPER_CLI, "-m", WHISPER_MODEL, "-f", wav_path,
        "-t", WHISPER_THREADS, "-otxt", "-of", out_prefix, "-nt",
    ]
    try:
        result = subprocess.run(args, capture_output=True, text=True, timeout=WHISPER_TIMEOUT_S)
        elapsed_ms = int((time.time() - t0) * 1000)
        try:
            Path(wav_path).unlink()
        except Exception:
            pass
        if result.returncode != 0:
            return None, f"whisper exit={result.returncode} stderr_tail={result.stderr[-500:]}", elapsed_ms
        txt_path = out_prefix + ".txt"
        if not Path(txt_path).exists():
            return None, f"whisper produced no output (stderr: {result.stderr[-500:]})", elapsed_ms
        text = Path(txt_path).read_text(encoding="utf-8").strip()
        try:
            Path(txt_path).unlink()
        except Exception:
            pass
        if not text:
            return None, "whisper produced empty transcription", elapsed_ms
        return text, None, elapsed_ms
    except subprocess.TimeoutExpired:
        try:
            Path(wav_path).unlink()
        except Exception:
            pass
        return None, f"whisper timeout after {WHISPER_TIMEOUT_S}s", int((time.time() - t0) * 1000)
    except Exception as e:
        try:
            Path(wav_path).unlink()
        except Exception:
            pass
        return None, f"whisper invoke error: {type(e).__name__}: {e}", int((time.time() - t0) * 1000)


def detect_voice_attachment(message):
    """Return the first voice/audio attachment dict {url, filename, size, duration} or None.

    Detected via the IS_VOICE_MESSAGE flag, audio content_type, or .ogg/.oga suffix
    (defensive — does not depend on a specific discord.py version's helper).
    """
    try:
        is_voice_flag = bool(getattr(message.flags, "value", 0) & VOICE_MESSAGE_FLAG)
    except Exception:
        is_voice_flag = False
    for att in message.attachments:
        ctype = (att.content_type or "").lower()
        fname = (att.filename or "").lower()
        if is_voice_flag or ctype.startswith("audio/") or fname.endswith((".ogg", ".oga", ".mp3", ".m4a", ".wav")):
            return {
                "url": att.url,
                "filename": att.filename,
                "size": att.size,
                "duration": getattr(att, "duration", None),
            }
    return None
