#!/usr/bin/env python3
"""dt_transcript — B-TRANSCRIPT-ARCHIVE P2 + P3: turn one raw Claude Code conversation (.jsonl) into a readable,
redacted markdown text. READ-ONLY on the raw file; stdlib only; run with `python3 -I`.

    python3 -I dt_transcript.py <raw.jsonl> [--hashes <value-hashes.json> --key-file <key>] [--since <ISO>] [--until <ISO>]

Writes the readable text to stdout. Nothing else is written. The archive writer (P5) calls distill() and owns every
file, offset and lock; this module never touches the archive.

WHAT IS KEPT (pre-audit A1, A1b, P2):
  * the user turns (`User:` — Kyle's prompts, and also machine turns such as wake events and task notices, so the
    label never claims a human wrote it) — a `user` entry whose content is a string, or its `text` blocks; and `attachment`
    `queued_command` (a message typed while the session was busy);
  * the session's replies — `assistant` `text` blocks;
  * a user turn that is NOTHING BUT automatic task notices (`<task-notification>`) as ONE `Wake — task notice` line:
    its time, that it was a wake, and each notice's summary (Kyle via PM Claude, 2026-11-06 — the readable copy only;
    a turn that also holds anything else is written in full, so a person's words are never folded into a wake);
  * a QUEUED notice (`queue-operation` `enqueue`) whose text never arrives on a uuid-bearing user entry in the lines
    read, labelled `queued; no delivered copy in this file`, under a stable synthetic id (Langston P4: 1 of 16 that
    day, the only failure notice, had no other carrier);
  * compaction summaries whole (`isCompactSummary`);
  * ONE LINE PER ACTION — each `tool_use`: time · tool · its own description (Bash `description`), else the file path,
    else the first line of the command or prompt, cut to one line; plus ` ERROR: <first line>` when the matching
    `tool_result` has `is_error`;
  * `system` `api_error` / `model_refusal_fallback` and `attachment` `hook_non_blocking_error` as one line.
ONE REPLY IN TWO TEXT BLOCKS (around a tool call, or in one entry) is written as two `Session:` paragraphs at their own
times, each verbatim — by choice, not joined (Langston P4: works as designed; the archive owner keeps it).
WHAT IS DROPPED: `thinking`, tool output, every entry type without a `uuid` (except the queued notice above), `api-request-blob` (copies of the
conversation), every other `attachment` type (harness-injected context). Images become `[image]`.

REDACTION (P3), applied to every string before it is written, in this order:
  (a) SHAPES — tokens whose form identifies them;
  (b) NAMES — `NAME=value`, `NAME: value`, `"NAME": "value"` for every secret key NAME the project holds (pre-audit A7);
  (c) VALUES — for secrets with no shape: a JSON file of {name, length, hmac, key_id} produced ON EACH SERVER (P3),
      never the values; HMAC-SHA256 under a key held APART from that file (Langston F1), so the file alone is
      worthless to a guesser. Every text token of a listed length is MAC'd with the same key, and a hit is replaced.
      --hashes needs --key-file; entries made with a different key are REFUSED, not silently unmatched. With no
      --hashes file, layer (c) is OFF and the output's first line says so. The producer is dt_secret_hashes.py,
      which owns the CONTRACT: a value is caught as a whole token, behind ANY `=` of the token, or with one trailing
      `.`; a value the producer
      reports `reachable: false` (too short, or holding a character outside the token set) is NAMED in that first
      line instead of silently missing.
Each hit becomes `[REDACTED <kind>]`. The counters are returned so the caller can publish counts per kind (P3, C-3).

KNOWN LIMITS, stated (Langston r3/r4): layer (b) needs a `:`, `=` or `->` after the name, so a command-line flag
(`--password x`, `-p x`) is NOT caught by name; a value with a space inside an unclosed or odd quote (`"hunter two`,
`ab" cd`) leaves the part after the space visible; an UNQUOTED JSON value (`{"PASSWORD": 12345,"next":1}`) is
over-redacted to the end of the run. Layer (c) is off without --hashes and blind under 12 characters, and it misses a
value glued to anything other than `<prefix>=` before it or one `.` after it (`-p<value>`, `<value>-old`).
"""
import hashlib
import hmac
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
# The value, in order (Langston C-1, C-4, C-7, C-8): (1) a quoted value that may hold escapes, accepted ONLY when its
# closing quote is followed by a boundary - otherwise a quote inside the value would end it early and leave the rest
# visible under a clean marker; (2) otherwise the WHOLE non-space run, any length (no length floor to state), so an
# unquoted value, or one with an unpaired or embedded quote (`abc"def`, `"abc` never closed), is taken whole.
# (r3 first had a middle "unquoted, stop at a quote" alternative: the mutation runner showed it redundant, and it
# would have hidden only `abc` of `PASSWORD=abc"def` - removed.)
# The NAME takes any prefix of word characters (Langston r3 blocker): `DB_PASSWORD`, `PGPASSWORD`, `MYSQL_PASSWORD`,
# `APP_JWT_SECRET`, `MY_GH_TOKEN` are the same secret kinds and must not need listing one by one. One exception by
# name: the sudoers literal `NOPASSWD` (a rule, never a secret).
NAMES = re.compile(r"(?P<name>\b(?!NOPASSWD\b)\w*?(?:%s)\b)(?P<sep>[\"']?[ \t]*(?::|=|->)[ \t]*)"
                   r"(?:(?P<q>[\"'])(?P<qval>(?:\\.|[^\\\n])*?)(?P=q)(?=[\s,;})\]]|$)"
                   r"|(?P<raw>\S+))"
                   % "|".join(SECRET_NAMES), re.IGNORECASE)

TOKEN = re.compile(r"[A-Za-z0-9_\-+/=.]{12,}")
IMAGE_B64 = re.compile(r"data:image/[a-z]+;base64,[A-Za-z0-9+/=]{40,}")


KEY_ID_MSG = b"dt-transcript value-hash key id v1"        # must equal dt_secret_hashes.KEY_ID_MSG


def key_id(key):
    return hmac.new(key, KEY_ID_MSG, hashlib.sha256).hexdigest()[:16]


def load_key(path):
    """The HMAC key, same rule as dt_secret_hashes.load_key: 64 hex characters, or 32+ raw bytes; else None."""
    if not path:
        return None
    try:
        raw = open(path, "rb").read()
    except OSError:
        return None
    raw = raw[:-1] if raw.endswith(b"\n") else raw
    raw = raw[:-1] if raw.endswith(b"\r") else raw
    try:
        k = bytes.fromhex(raw.decode("ascii"))
    except (UnicodeDecodeError, ValueError):
        k = raw
    return k if len(k) >= 32 else None


class Redactor:
    def __init__(self, hashes=None, key=None):
        self.counts = {}
        self.by_len = {}
        self.key = key               # HMAC key the producer used (Langston F1); layer (c) loads nothing without it
        self.layer_c_names = 0       # usable {name,length,hmac,key_id} entries loaded (C-2: the header is derived from this)
        self.layer_c_short = []      # names shorter than TOKEN's 12-char floor: listed, but out of layer (c)'s reach (C-3)
        self.layer_c_unreachable = []  # producer said reachable:false (P3(c) contract): "<name> (<reason>)", no hash
        self.layer_c_wrong_key = 0   # entries made with a DIFFERENT key: would match nothing, so refused, not loaded
        self.layer_c_wrong_keys = {}  # key_id -> count, so a refusal names which run to redo (Langston r2 (b))
        self.layer_c_malformed = 0   # entries missing a field or with a short mac: a SILENT drop is a partial list
        kid = key_id(key) if key else None   # reading as full coverage (Langston r2 finding 1) - counted, refused
        for h in hashes or []:
            if isinstance(h, dict) and h.get("reachable") is False and h.get("name"):
                self.layer_c_unreachable.append("%s (%s)" % (h["name"], h.get("reason", "no reason given")))
                continue
            try:
                n, ln, mac, hk = str(h["name"]), int(h["length"]), str(h["hmac"]), str(h["key_id"])
            except (KeyError, TypeError, ValueError):
                self.layer_c_malformed += 1
                continue
            if len(mac) != 64:
                self.layer_c_malformed += 1
                continue
            if hk != kid:
                self.layer_c_wrong_key += 1
                self.layer_c_wrong_keys[hk] = self.layer_c_wrong_keys.get(hk, 0) + 1
                continue
            have = self.by_len.setdefault(ln, {})
            if mac in have:              # one secret listed twice (Langston r2 finding 3): count it ONCE, under the
                if "#" in have[mac] and "#" not in n:      # plainest name (`A`, not its part `A#1`)
                    have[mac] = n
                continue
            have[mac] = n
            self.layer_c_names += 1
            if ln < 12:
                self.layer_c_short.append(n)

    def layer_c_state(self):
        if not self.layer_c_names:
            return "> redaction layer (c), shapeless values: OFF — the part that catches passwords which do not look like passwords is not switched on"
        line = "> redaction layer (c), shapeless values: ON, %d value(s) loaded" % self.layer_c_names
        if self.layer_c_short:
            line += "; OUT OF REACH (under 12 characters): %s" % ", ".join(sorted(self.layer_c_short))
        if self.layer_c_wrong_key:
            line += "; %d entr(ies) made with a DIFFERENT key were NOT loaded" % self.layer_c_wrong_key
        if self.layer_c_unreachable:
            line += "; NOT REACHABLE (named by the producer): %s" % ", ".join(sorted(set(self.layer_c_unreachable)))
        return line

    def _named(self, m):
        # The counter key is the LISTED name the match ends with (longest), never the name as written - a key taken
        # from the transcript is unbounded (`hunter2PASSWORD=x` -> `named:HUNTER2PASSWORD`; Langston r4 PROCEED item).
        written = m.group("name").upper()
        listed = max((n for n in SECRET_NAMES if written.endswith(n)), key=len, default=written)
        kind = self._hit("named:" + listed)
        if m.group("q"):
            return m.group("name") + m.group("sep") + m.group("q") + kind + m.group("q")
        return m.group("name") + m.group("sep") + kind

    def _hit(self, kind):
        self.counts[kind] = self.counts.get(kind, 0) + 1
        return "[REDACTED %s]" % kind

    def __call__(self, text):
        if not text:
            return text
        text = IMAGE_B64.sub(lambda m: self._hit("base64-image"), text)
        text = NAMES.sub(self._named, text)          # names FIRST (C-4): the whole named value goes, markers stay intact
        for kind, rx in SHAPES:
            text = rx.sub(lambda m, k=kind: self._hit(k), text)
        if self.by_len:
            key = self.key

            def look(t):
                names = self.by_len.get(len(t))     # the length check first: a MAC is computed only on a length hit
                return names.get(hmac.new(key, t.encode("utf-8"), hashlib.sha256).hexdigest()) if names else None

            def val(m):
                # P3(c) contract: the whole run; the run less one trailing "."; then the part after EACH "=" of the
                # run, left to right (token=<v>, --key=<v>, X=Y=<v> — Langston J3), with and without one trailing ".".
                # Nothing else glued is caught.
                t = m.group(0)
                cands = [("", t, "")]
                if t.endswith("."):
                    cands.append(("", t[:-1], "."))
                for i, ch in enumerate(t):
                    if ch == "=":
                        pre, tail = t[:i + 1], t[i + 1:]
                        cands.append((pre, tail, ""))
                        if tail.endswith("."):
                            cands.append((pre, tail[:-1], "."))
                for pre, cand, post in cands:
                    n = look(cand)
                    if n:
                        return pre + self._hit("value:" + n) + post
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


TASK_NOTICE = re.compile(r"<task-notification>(.*?)</task-notification>", re.S)


def _tag(body, name):
    m = re.search(r"<%s>(.*?)</%s>" % (name, name), body, re.S)
    return " ".join(m.group(1).split()) if m else ""


def wake_line(text, redact):
    """A user turn that is NOTHING BUT automatic task notices becomes ONE line (Kyle via PM Claude, 2026-11-06: keep
    that a wake happened, when, and what kind). Returns the line after the time stamp, or None when the turn holds
    anything else - then it is written in full, so a person's words are never folded into a wake line."""
    blocks = TASK_NOTICE.findall(text)
    if not blocks or TASK_NOTICE.sub("", text).strip():
        return None
    parts = []
    for body in blocks:
        what = _tag(body, "summary") or ("background task %s" % (_tag(body, "status") or "notice"))
        parts.append(one_line(redact(what), 200))
    return "task notice:** " + " | ".join(parts)


def distill(lines, redact, since=None, until=None, dropped=None):
    """lines: an iterable of raw .jsonl lines. Yields (uuid, timestamp, markdown_line, order); every yielded line
    comes from an entry that has a uuid (A1) - except a QUEUED notice with no delivered copy, which gets a stable
    synthetic id `queue:<sha256[:16]>` (Langston P4 finding). `order` is (raw line index, block index): sort by
    (timestamp, order) so an exact-millisecond tie keeps the raw order (Langston P4 latent). Action lines are yielded at the end, once their results (and any ERROR) are known;
    the caller orders by timestamp. `dropped` (a dict) counts every uuid-bearing entry that matched no keep rule,
    keyed type[:subtype], so a format change shows up as a number instead of a silent loss (Langston C-5)."""
    dropped = {} if dropped is None else dropped

    def drop(key):
        dropped[key] = dropped.get(key, 0) + 1
    pending = {}
    queued = []                 # (ts, li, content) of every queue-operation enqueue
    delivered = {}              # stripped user text -> times it arrived on a uuid-bearing entry (ANY time, not only the window)   # tool_use_id -> (uuid, ts, text) awaiting its result, so an ERROR can be appended
    order = []
    for li, raw in enumerate(lines):
        try:
            e = json.loads(raw)
        except ValueError:
            continue
        uid, ts, typ = e.get("uuid"), e.get("timestamp") or "", e.get("type")
        if typ == "queue-operation" and e.get("operation") == "enqueue" and isinstance(e.get("content"), str) \
                and e["content"].strip():
            queued.append((ts, li, e["content"]))
            continue
        if not uid:
            continue
        if typ == "user" and not e.get("isCompactSummary"):
            for b in _blocks((e.get("message") or {}).get("content") if isinstance(e.get("message"), dict) else None):
                if b.get("type") == "text" and b.get("text", "").strip():
                    k = b["text"].strip()
                    delivered[k] = delivered.get(k, 0) + 1
        # The uuid gate above is what drops api-request-blob (copies of the conversation, A1): Langston measured three
        # real ones across 7,375 transcripts and none carries a uuid. "Only the types below emit" is the backstop.
        if (since and ts < since) or (until and ts >= until):
            continue
        hhmm = ts[11:19] if len(ts) >= 19 else ts
        msg = e.get("message") if isinstance(e.get("message"), dict) else {}
        if typ == "user" and e.get("isCompactSummary"):
            text = "".join(b.get("text", "") for b in _blocks(msg.get("content")) if b.get("type") == "text")
            if not text.strip():
                drop("user:compact-summary-empty")       # counted OR emitted, never both (Langston r2 nit)
                continue
            yield uid, ts, "\n> **[%s] compaction summary**\n>\n> %s\n" % (hhmm, redact(text).replace("\n", "\n> ")), (li, 0)
            continue
        if typ == "user":
            emitted = False
            for bi, b in enumerate(_blocks(msg.get("content"))):
                if b.get("type") == "text" and b.get("text", "").strip():
                    emitted = True
                    wake = wake_line(b["text"], redact)
                    if wake:
                        yield uid, ts, "\n**[%s] Wake — %s\n" % (hhmm, wake), (li, bi)
                    else:
                        yield uid, ts, "\n**[%s] User:** %s\n" % (hhmm, redact(b["text"]).strip()), (li, bi)
                elif b.get("type") == "image":
                    emitted = True
                    yield uid, ts, "**[%s] User:** [image]" % hhmm, (li, bi)
                elif b.get("type") == "tool_result" and b.get("is_error"):
                    p = pending.get(b.get("tool_use_id"))
                    body = b.get("content")
                    if isinstance(body, list):
                        body = " ".join(x.get("text", "") for x in body if isinstance(x, dict))
                    if p:
                        p[2] += " ERROR: " + one_line(redact(str(body)), 160)
            if not emitted and not any(b.get("type") == "tool_result" for b in _blocks(msg.get("content"))):
                drop("user:other")
            continue
        if typ == "assistant":
            for bi, b in enumerate(_blocks(msg.get("content"))):
                if b.get("type") == "text" and b.get("text", "").strip():
                    yield uid, ts, "\n**[%s] Session:** %s\n" % (hhmm, redact(b["text"]).strip()), (li, bi)
                elif b.get("type") == "tool_use":
                    line = ["- `%s` %s — %s" % (hhmm, b.get("name", "?"),
                                                 one_line(redact(action_summary(b.get("name"), b.get("input")))))]
                    pending[b.get("id")] = [uid, ts, line[0], (li, bi)]
                    order.append(b.get("id"))
            continue
        if typ == "system" and e.get("subtype") in ("api_error", "model_refusal_fallback", "informational"):
            yield uid, ts, "- `%s` [%s] %s" % (hhmm, e.get("subtype"), one_line(redact(str(e.get("content", ""))), 160)), (li, 0)
            continue
        if typ == "attachment":
            a = e.get("attachment") if isinstance(e.get("attachment"), dict) else {}
            if a.get("type") == "queued_command":
                yield uid, ts, "\n**[%s] User (queued):** %s\n" % (hhmm, redact(str(a.get("prompt") or a.get("content") or "")).strip()), (li, 0)
            elif a.get("type") == "hook_non_blocking_error":
                yield uid, ts, "- `%s` [hook error] %s" % (hhmm, one_line(redact(str(a.get("content") or a.get("stderr") or "")), 160)), (li, 0)
            else:
                drop("attachment:%s" % a.get("type"))
            continue
        drop("%s:%s" % (typ, e.get("subtype")) if e.get("subtype") else str(typ))   # every other type (A1, A1b)
    for tid in order:
        p = pending.get(tid)
        if p:
            yield p[0], p[1], p[2], p[3]
    # A QUEUED NOTICE THAT NEVER ARRIVED ON A uuid-BEARING ENTRY (Langston P4 finding: 1 of 16 that day, the only
    # failure notice). Matched as a multiset on the stripped text against deliveries anywhere in the file read.
    # Limit, stated: a delivery that lies OUTSIDE the lines handed in (a later file, bytes not yet read) is unseen,
    # so such a notice shows as queued-only here and as delivered where its copy is.
    for ts, li, content in queued:
        k = content.strip()
        if delivered.get(k, 0) > 0:
            delivered[k] -= 1
            continue
        if (since and ts < since) or (until and ts >= until):
            continue
        hhmm = ts[11:19] if len(ts) >= 19 else ts
        qid = "queue:" + hashlib.sha256((ts + "\0" + content).encode("utf-8")).hexdigest()[:16]
        w = wake_line(content, redact)
        if w:
            line = "\n**[%s] Wake — %s\n" % (hhmm, w.replace("task notice:**", "task notice (queued; no delivered copy in this file):**", 1))
        else:
            line = "\n**[%s] User (queued; no delivered copy in this file):** %s\n" % (hhmm, redact(content).strip())
        yield qid, ts, line, (li, 0)


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
    rest = args[1:]
    known = ("--hashes", "--key-file", "--since", "--until")
    if len(rest) % 2 or any(rest[i] not in known for i in range(0, len(rest), 2)):
        sys.stderr.write("REFUSED: arguments must be pairs from %s; got %r\n" % (", ".join(known), rest))
        return 2                  # an unknown token would shift the pairing and silently drop --hashes (Langston r2 nit)
    opts = dict(zip(rest[0::2], rest[1::2]))
    hashes = None
    if "--hashes" in opts:
        try:
            hashes = json.load(open(opts["--hashes"], encoding="utf-8"))
        except (OSError, ValueError) as e:
            sys.stderr.write("REFUSED: --hashes %s could not be read (%s)\n" % (opts["--hashes"], e))
            return 3
    key = None
    if "--hashes" in opts:
        key = load_key(opts.get("--key-file"))
        if key is None:
            sys.stderr.write("REFUSED: --hashes needs --key-file with the key they were made with "
                             "(64 hex characters or 32+ bytes)\n")
            return 3
    red = Redactor(hashes if isinstance(hashes, list) else [], key=key)
    if "--hashes" in opts and red.layer_c_wrong_key:
        sys.stderr.write("REFUSED: --hashes %s holds %d entr(ies) made with a different key - they would match nothing"
                         " (this key is %s; the others: %s)\n"
                         % (opts["--hashes"], red.layer_c_wrong_key, key_id(key) if key else "none",
                            ", ".join("%s x%d" % kv for kv in sorted(red.layer_c_wrong_keys.items()))))
        return 3
    if "--hashes" in opts and red.layer_c_malformed:
        sys.stderr.write("REFUSED: --hashes %s holds %d malformed entr(ies) (a missing field or a short mac) - loading the"
                         " rest would read as full coverage\n" % (opts["--hashes"], red.layer_c_malformed))
        return 3
    if "--hashes" in opts and not red.layer_c_names:
        sys.stderr.write("REFUSED: --hashes %s loaded 0 usable entries - layer (c) would be silently off\n" % opts["--hashes"])
        return 3
    print(red.layer_c_state())
    dropped = {}
    with open(path, encoding="utf-8", errors="replace") as fh:
        for _uid, _ts, line, _o in sorted(distill(fh, red, opts.get("--since"), opts.get("--until"), dropped),
                                          key=lambda x: (x[1], x[3])):
            print(line)
    sys.stderr.write("redactions: %s\n" % json.dumps(red.counts, sort_keys=True))
    sys.stderr.write("dropped (uuid-bearing, no keep rule): %s\n" % json.dumps(dropped, sort_keys=True))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
