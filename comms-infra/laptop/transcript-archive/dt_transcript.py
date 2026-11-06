#!/usr/bin/env python3
"""dt_transcript — B-TRANSCRIPT-ARCHIVE P2 + P3: turn one raw Claude Code conversation (.jsonl) into a readable,
redacted markdown text. READ-ONLY on the raw file; stdlib only; run with `python3 -I`.

    python3 -I dt_transcript.py <raw.jsonl> [--hashes <value-hashes.json>] [--since <ISO>] [--until <ISO>]

Writes the readable text to stdout. Nothing else is written. The archive writer (P5) calls distill() and owns every
file, offset and lock; this module never touches the archive.

WHAT IS KEPT (pre-audit A1, A1b, P2):
  * the user turns (`User:` — Kyle's prompts, and also machine turns such as wake events and task notices, so the
    label never claims a human wrote it) — a `user` entry whose content is a string, or its `text` blocks; and `attachment`
    `queued_command` (a message typed while the session was busy);
  * the session's replies — `assistant` `text` blocks;
  * compaction summaries whole (`isCompactSummary`);
  * ONE LINE PER ACTION — each `tool_use`: time · tool · its own description (Bash `description`), else the file path,
    else the first line of the command or prompt, cut to one line; plus ` ERROR: <first line>` when the matching
    `tool_result` has `is_error`;
  * `system` `api_error` / `model_refusal_fallback` and `attachment` `hook_non_blocking_error` as one line.
WHAT IS DROPPED: `thinking`, tool output, every entry type without a `uuid`, `api-request-blob` (copies of the
conversation), every other `attachment` type (harness-injected context). Images become `[image]`.

REDACTION (P3), applied to every string before it is written, in this order:
  (a) SHAPES — tokens whose form identifies them;
  (b) NAMES — `NAME=value`, `NAME: value`, `"NAME": "value"` for every secret key NAME the project holds (pre-audit A7);
  (c) VALUES — for secrets with no shape: a JSON file of {name, length, sha256} produced ON EACH SERVER (P3), never the
      values; every text token of a listed length is hashed, and a hit is replaced. With no --hashes file, layer (c)
      is OFF and the output's first line says so.
Each hit becomes `[REDACTED <kind>]`. The counters are returned so the caller can publish counts per kind (P3, C-3).
"""
import hashlib
import json
import re
import sys

# ---- (a) shapes. ORDER MATTERS: the more specific pattern first, so a key is named by its own kind. --------------
SHAPES = [
    ("private-key-block", re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S)),
    ("anthropic-token", re.compile(r"sk-ant-[A-Za-z0-9_\-]{20,}")),
    ("openai-key", re.compile(r"sk-(?:proj-)?[A-Za-z0-9_\-]{20,}")),
    ("github-token", re.compile(r"\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{40,}\b")),
    ("discord-webhook", re.compile(r"https://(?:canary\.|ptb\.)?discord(?:app)?\.com/api/webhooks/\d+/[A-Za-z0-9_\-]{30,}")),
    ("discord-bot-token", re.compile(r"\b[MNO][A-Za-z0-9_\-]{23,27}\.[A-Za-z0-9_\-]{6}\.[A-Za-z0-9_\-]{27,40}\b")),
    ("telegram-bot-token", re.compile(r"\b\d{8,10}:AA[A-Za-z0-9_\-]{33}\b")),
    ("jwt", re.compile(r"\beyJ[A-Za-z0-9_\-]{8,}\.eyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b")),
    ("b2-application-key", re.compile(r"\bK00[0-9][A-Za-z0-9+/]{27}\b")),
    ("bearer-token", re.compile(r"(?i)\bBearer\s+[A-Za-z0-9._~+/\-]{16,}=*")),
    ("url-credentials", re.compile(r"\b[a-z][a-z0-9+.\-]*://[^\s/:@]+:[^\s/@]+@")),
]

# ---- (b) names: every secret key NAME the project holds (pre-audit A7, derived 2026-11-06, names only) -----------
SECRET_NAMES = [
    "B2_APPLICATION_KEY", "B2_KEY_ID", "COINGECKO_API_KEY", "DATABASE_URL", "FINNHUB_API_KEY", "FRED_API_KEY",
    "INTERNAL_SERVICE_KEY", "JWT_REFRESH_SECRET", "JWT_SECRET", "KRAKEN_API_KEY", "KRAKEN_API_SECRET",
    "OPENAI_API_KEY", "SUPABASE_SERVICE_ROLE_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "DISCORD_BOT_TOKEN",
    "DISCORD_COLTRANE_BOT_TOKEN", "GH_TOKEN", "TELEGRAM_BOT_TOKEN", "CC_WEBHOOK_URL", "HELIUS_API_KEY",
    "ALCHEMY_API_KEY", "TOKENWATCH_WEBHOOK_SECRET", "ANTHROPIC_API_KEY", "GITHUB_TOKEN", "PASSWORD", "PASSWD",
]
NAMES = re.compile(r"(?P<name>\b(?:%s)\b)(?P<sep>\"?\s*[:=]\s*\"?)(?P<val>[^\s\"',;]{4,})" % "|".join(SECRET_NAMES))

TOKEN = re.compile(r"[A-Za-z0-9_\-+/=.]{12,}")
IMAGE_B64 = re.compile(r"data:image/[a-z]+;base64,[A-Za-z0-9+/=]{40,}")


class Redactor:
    def __init__(self, hashes=None):
        self.counts = {}
        self.by_len = {}
        for h in hashes or []:
            self.by_len.setdefault(int(h["length"]), {})[h["sha256"]] = h["name"]

    def _hit(self, kind):
        self.counts[kind] = self.counts.get(kind, 0) + 1
        return "[REDACTED %s]" % kind

    def __call__(self, text):
        if not text:
            return text
        text = IMAGE_B64.sub(lambda m: self._hit("base64-image"), text)
        for kind, rx in SHAPES:
            text = rx.sub(lambda m, k=kind: self._hit(k), text)
        text = NAMES.sub(lambda m: m.group("name") + m.group("sep") + self._hit("named:" + m.group("name")), text)
        if self.by_len:
            def val(m):
                t = m.group(0)
                names = self.by_len.get(len(t))
                if names:
                    n = names.get(hashlib.sha256(t.encode("utf-8")).hexdigest())
                    if n:
                        return self._hit("value:" + n)
                return t
            text = TOKEN.sub(val, text)
        return text


def one_line(s, n=200):
    s = " ".join(str(s or "").split())
    return s if len(s) <= n else s[:n - 1] + "…"


def action_summary(name, inp):
    inp = inp if isinstance(inp, dict) else {}
    for key in ("description",):
        if inp.get(key):
            return inp[key]
    for key in ("file_path", "path", "notebook_path", "url", "pattern", "skill", "query"):
        if inp.get(key):
            return "%s %s" % (key, inp[key])
    for key in ("command", "prompt", "text", "message"):
        if inp.get(key):
            return str(inp[key]).splitlines()[0] if str(inp[key]).strip() else ""
    return ""


def _blocks(content):
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    return [b for b in content or [] if isinstance(b, dict)]


def distill(lines, redact, since=None, until=None):
    """lines: an iterable of raw .jsonl lines. Yields (uuid, timestamp, markdown_line); every yielded line comes from
    an entry that has a uuid (A1). Action lines are yielded at the end, once their results (and any ERROR) are known;
    the caller orders by timestamp."""
    pending = {}   # tool_use_id -> (uuid, ts, text) awaiting its result, so an ERROR can be appended
    order = []
    for raw in lines:
        try:
            e = json.loads(raw)
        except ValueError:
            continue
        uid, ts, typ = e.get("uuid"), e.get("timestamp") or "", e.get("type")
        if not uid:
            continue
        # api-request-blob (copies of the conversation, A1) needs no rule of its own: only the four types below
        # ever emit a line, so every other type - that one included - is dropped by construction.
        if (since and ts < since) or (until and ts >= until):
            continue
        hhmm = ts[11:19] if len(ts) >= 19 else ts
        msg = e.get("message") if isinstance(e.get("message"), dict) else {}
        if typ == "user" and e.get("isCompactSummary"):
            text = "".join(b.get("text", "") for b in _blocks(msg.get("content")) if b.get("type") == "text")
            yield uid, ts, "\n> **[%s] compaction summary**\n>\n> %s\n" % (hhmm, redact(text).replace("\n", "\n> "))
            continue
        if typ == "user":
            for b in _blocks(msg.get("content")):
                if b.get("type") == "text" and b.get("text", "").strip():
                    yield uid, ts, "\n**[%s] User:** %s\n" % (hhmm, redact(b["text"]).strip())
                elif b.get("type") == "image":
                    yield uid, ts, "**[%s] User:** [image]" % hhmm
                elif b.get("type") == "tool_result" and b.get("is_error"):
                    p = pending.get(b.get("tool_use_id"))
                    body = b.get("content")
                    if isinstance(body, list):
                        body = " ".join(x.get("text", "") for x in body if isinstance(x, dict))
                    if p:
                        p[2] += " ERROR: " + one_line(redact(str(body)), 160)
            continue
        if typ == "assistant":
            for b in _blocks(msg.get("content")):
                if b.get("type") == "text" and b.get("text", "").strip():
                    yield uid, ts, "\n**[%s] Session:** %s\n" % (hhmm, redact(b["text"]).strip())
                elif b.get("type") == "tool_use":
                    line = ["- `%s` %s — %s" % (hhmm, b.get("name", "?"),
                                                 one_line(redact(action_summary(b.get("name"), b.get("input")))))]
                    pending[b.get("id")] = [uid, ts, line[0]]
                    order.append(b.get("id"))
            continue
        if typ == "system" and e.get("subtype") in ("api_error", "model_refusal_fallback"):
            yield uid, ts, "- `%s` [%s] %s" % (hhmm, e.get("subtype"), one_line(redact(str(e.get("content", ""))), 160))
            continue
        if typ == "attachment":
            a = e.get("attachment") if isinstance(e.get("attachment"), dict) else {}
            if a.get("type") == "queued_command":
                yield uid, ts, "\n**[%s] User (queued):** %s\n" % (hhmm, redact(str(a.get("prompt") or a.get("content") or "")).strip())
            elif a.get("type") == "hook_non_blocking_error":
                yield uid, ts, "- `%s` [hook error] %s" % (hhmm, one_line(redact(str(a.get("content") or a.get("stderr") or "")), 160))
            continue
        # every other type: dropped (A1, A1b)
    for tid in order:
        p = pending.get(tid)
        if p:
            yield p[0], p[1], p[2]


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    if len(argv) < 2 or argv[1] in ("-h", "--help"):
        print(__doc__)
        return 0 if len(argv) >= 2 else 2
    args = argv[1:]
    path = args[0]
    opts = dict(zip(args[1::2], args[2::2]))
    hashes = json.load(open(opts["--hashes"], encoding="utf-8")) if "--hashes" in opts else None
    red = Redactor(hashes)
    if hashes is None:
        print("> redaction layer (c), shapeless values: OFF (no --hashes file)")
    with open(path, encoding="utf-8", errors="replace") as fh:
        for _uid, _ts, line in sorted(distill(fh, red, opts.get("--since"), opts.get("--until")), key=lambda x: x[1]):
            print(line)
    sys.stderr.write("redactions: %s\n" % json.dumps(red.counts, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
