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
import subprocess
import sys
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
    """Returns dict with channel_id:int, kyle_id:int (guild_id optional)."""
    cfg = {}
    cfg["channel_id"] = int(load_env_value(SHARED_CONFIG_FILE, "DISCORD_CHANNEL_ID"))
    cfg["kyle_id"] = int(load_env_value(SHARED_CONFIG_FILE, "KYLE_DISCORD_ID"))
    try:
        cfg["guild_id"] = int(load_env_value(SHARED_CONFIG_FILE, "DISCORD_GUILD_ID"))
    except Exception:
        cfg["guild_id"] = None
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


def rest_send(token, channel_id, content, log_file):
    """POST a message to a channel via the Discord REST API as the bot.

    Auto-chunks at 2000 chars. Returns the message_id of the first chunk, or None.
    """
    url = f"{DISCORD_API}/channels/{channel_id}/messages"
    first_id = None
    for i, chunk in enumerate(chunk_text(content)):
        body = json.dumps({"content": chunk}).encode("utf-8")
        req = urllib.request.Request(
            url, data=body, method="POST",
            headers={
                "Authorization": f"Bot {token}",
                "Content-Type": "application/json",
                "User-Agent": "DawnTraderBridge (https://dawntrader, 1.0)",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                resp = json.loads(r.read())
                if i == 0:
                    first_id = resp.get("id")
        except urllib.error.HTTPError as e:
            body_tail = e.read().decode("utf-8", errors="replace")[:300]
            log(f"REST send HTTP {e.code}: {body_tail}", log_file)
            return None
        except Exception as e:
            log(f"REST send error: {type(e).__name__}: {e}", log_file)
            return None
    return first_id


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
