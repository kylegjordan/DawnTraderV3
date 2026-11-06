#!/usr/bin/env python3
"""dt_secret_hashes — B-TRANSCRIPT-ARCHIVE P3(c): the VALUE-HASH PRODUCER for redaction layer (c).

Runs ON THE MACHINE THAT HOLDS THE SECRETS (each server as root, and the laptop for its own key files) and prints
ONLY {name, length, hmac, key_id} per named secret. The values never leave the machine: they are not printed, logged,
written or put in an error message. Stdlib only; run with `python3 -I`.

THE KEY (Langston F1): every value is fingerprinted with HMAC-SHA256 under a key held APART from the output, so the
output alone is worthless to a guesser — even for a 12-character part. On the laptop: `--key-file`. On a server the
archive runner streams a copy of this script with the RUN_KEY_HEX line set, so the key touches neither the server's
disk nor any command line (`ps` shows command lines to every local account):

    ssh root@<host> 'python3 -I - --env /path/.env --names A,B --file C=/path/key' < <copy with RUN_KEY_HEX set>

ARGUMENTS
  --key-file PATH     the HMAC key: 64 hex characters, or 32+ raw bytes. Required unless RUN_KEY_HEX is set.
  --env PATH          a KEY=VALUE file (dotenv / systemd EnvironmentFile form). Repeatable. Only names in --names
                      are taken from it; every other key is ignored, so a non-secret setting is never hashed.
  --names A,B,...     the secret names to take from the --env files. Every listed name must be found WITH A VALUE in
                      at least one of them (a name in two files gives two entries, both kept); a name defined empty
                      does not count as found and is named in the refusal (Langston F3).
  --file NAME=PATH    a file whose whole content (one trailing newline stripped) IS the secret. Repeatable.
  --json NAME=PATH:a.b  one string field of a JSON file, by its dotted key path (split at the LAST ":"). Repeatable.
                      A missing key, or a value that is not a string, is REFUSED (exit 4), never skipped.

OUTPUT (stdout, one JSON list, sorted by name then source):
  {"name", "length", "hmac", "key_id", "source"}    — the value is within layer (c)'s reach (the CONTRACT below);
  {"name", "reachable": false, "reason", "source"}  — it is not, and NO fingerprint or length is emitted for the whole;
  {"name": "NAME#n", "length", "hmac", ...}         — for a value holding a separator (`keyid:key`, a URL with a
                                                       password), each run of 12+ token characters inside it.
  An unquoted env value whose ` #...` tail was cut as an inline comment carries a "note", and the UNCUT reading is
  listed too (systemd EnvironmentFile has no inline comments, so the uncut one may be the true value — Langston F2).

THE TOKENIZABILITY CONTRACT (scope C-3, owned by this piece): the redactor finds a value only where it stands as text
made of the characters  A-Z a-z 0-9 _ - + / = .  and is at least 12 long. So a value is REACHABLE only if it is made
entirely of those characters and is 12 or more long. The redactor also catches it glued behind ANY `=` of a run
(`token=<value>`, `--key=<value>`, `X=Y=<value>`) and with one trailing `.` (end of a sentence). It does NOT catch it
glued to any other prefix or suffix made of those characters (`-p<value>`, `<value>-old`). A value containing any
other character (`:` `@` `%` `!` space ...) is reported unreachable WHOLE, by name, so the gap is visible instead of
silent — and its runs of 12+ token characters are hashed as NAME#1.. (the redactor splits text at exactly those
characters, so each run is caught wherever it stands). A run under 12 inside such a value is not caught, and the
reason says so. A `#n` can be STRUCTURE, not secret (a database host inside DATABASE_URL): over-redaction is chosen.

FAILS CLOSED: no usable key, an unreadable file, a malformed --file/--json argument, or a listed name found nowhere
prints NOTHING on stdout and exits 4 (2 for the key or bad arguments) — a partial list would read as full coverage.
Exit 0 = every name found.
"""
import hashlib
import hmac
import json
import os
import re
import socket
import sys

REACHABLE = re.compile(r"[A-Za-z0-9_\-+/=.]{12,}\Z")      # must equal dt_transcript.TOKEN, anchored
PART = re.compile(REACHABLE.pattern[:-2])                  # the same set, unanchored: the runs the redactor sees
LINE = re.compile(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)\Z")
RUN_KEY_HEX = ""   # the archive runner sets THIS LINE in the copy it streams to a server; never committed with a value
KEY_ID_MSG = b"dt-transcript value-hash key id v1"        # must equal dt_transcript.KEY_ID_MSG


def key_id(key):
    """A short public name for a key, so the redactor can refuse hashes made with a different key instead of
    silently matching nothing."""
    return hmac.new(key, KEY_ID_MSG, hashlib.sha256).hexdigest()[:16]


def load_key(path):
    """The HMAC key: 64 hex characters, or 32+ raw bytes. None when unusable (the caller refuses)."""
    try:
        raw = open(os.path.expanduser(path), "rb").read()
    except OSError:
        return None
    raw = raw[:-1] if raw.endswith(b"\n") else raw
    raw = raw[:-1] if raw.endswith(b"\r") else raw
    try:
        k = bytes.fromhex(raw.decode("ascii"))
    except (UnicodeDecodeError, ValueError):
        k = raw
    return k if len(k) >= 32 else None


def parse_env(text):
    """Yield (name, value, unstripped) from KEY=VALUE text. Quoted values keep their inside verbatim; an unquoted value
    is cut at ` #` (an inline comment) and stripped. When that cut removed something, `unstripped` is the value WITHOUT
    the cut (systemd EnvironmentFile has no inline comments, so it may be the true value — Langston F2); else None.
    Never raises on content and never returns a line number with a value."""
    for raw in text.splitlines():
        m = LINE.match(raw)
        if not m:
            continue
        name, v = m.group(1), m.group(2).strip()
        unstripped = None
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        else:
            cut = v.split(" #", 1)[0].strip()
            if cut != v:
                unstripped = v
            v = cut
        yield name, v, unstripped


def _hashed(name, v, source, key):
    return {"name": name, "length": len(v), "hmac": hmac.new(key, v.encode("utf-8"), hashlib.sha256).hexdigest(),
            "key_id": key_id(key), "source": source}


def entries(name, value, source, key):
    """The entries for one secret. A value holding a separator (`keyid:key`, a URL with a password) is not reachable
    WHOLE, but the redactor splits text at exactly the characters this splits at, so each run of 12+ token characters
    inside it is hashed on its own as NAME#1, NAME#2 ... and caught wherever it stands alone in text."""
    if REACHABLE.match(value):
        return [_hashed(name, value, source, key)]
    if len(value) < 12:
        return [{"name": name, "reachable": False, "reason": "under 12 characters", "source": source}]
    parts = PART.findall(value)
    if parts:
        reason = ("contains characters outside the token set; its %d part(s) of 12+ characters are hashed as %s#1..%d"
                  " and a shorter part is not caught" % (len(parts), name, len(parts)))
    else:
        reason = "contains characters outside the token set and has no part of 12+ characters"
    return ([{"name": name, "reachable": False, "reason": reason, "source": source}]
            + [_hashed("%s#%d" % (name, i), p, source, key) for i, p in enumerate(parts, 1)])


def main(argv):
    envs, files, jsons, names, key_file = [], [], [], None, None
    it = iter(argv)
    for a in it:
        try:
            if a == "--key-file":
                key_file = next(it)
            elif a == "--env":
                envs.append(next(it))
            elif a == "--file":
                files.append(next(it))
            elif a == "--json":
                jsons.append(next(it))
            elif a == "--names":
                names = [n.strip() for n in next(it).split(",") if n.strip()]
            else:
                sys.stderr.write("REFUSED: unknown argument %r\n" % a)
                return 2
        except StopIteration:
            sys.stderr.write("REFUSED: %s needs a value\n" % a)
            return 2
    if envs and not names:
        sys.stderr.write("REFUSED: --env given without --names\n")
        return 2
    if names and not envs:
        sys.stderr.write("REFUSED: --names given without --env\n")
        return 2
    if not envs and not files and not jsons:
        sys.stderr.write("REFUSED: nothing to hash\n")
        return 2
    if key_file is not None:
        key = load_key(key_file)
    else:
        try:
            key = bytes.fromhex(RUN_KEY_HEX) if RUN_KEY_HEX else None
        except ValueError:
            key = None
        key = key if key and len(key) >= 32 else None
    if key is None:
        sys.stderr.write("REFUSED: no usable key - pass --key-file (64 hex characters or 32+ bytes), or stream a copy "
                         "with RUN_KEY_HEX set\n")
        return 2
    host = socket.gethostname()
    out, found, empty = [], set(), []
    for path in envs:
        try:
            text = open(path, encoding="utf-8").read()
        except (OSError, UnicodeDecodeError) as e:
            sys.stderr.write("REFUSED: cannot read %s (%s)\n" % (path, type(e).__name__))
            return 4
        for n, v, unstripped in parse_env(text):
            if n not in names:
                continue
            src = "%s:%s" % (host, path)
            if v == "":                     # Langston F3: defined-but-empty is the wrong source, never "found"
                empty.append("%s (in %s)" % (n, path))
                continue
            got = entries(n, v, src, key)
            if unstripped is not None:      # Langston F2: the cut is SAID, and the uncut reading is emitted too
                for e in got:
                    e["note"] = "inline comment stripped; the uncut reading is also listed"
                got += [dict(e, note="read WITHOUT the inline-comment strip (systemd files have none)")
                        for e in entries(n, unstripped, src, key)]
            out.extend(got)
            found.add(n)
    for spec in files:
        n, sep, path = spec.partition("=")
        if not sep or not n or not path:
            sys.stderr.write("REFUSED: --file wants NAME=PATH\n")
            return 4
        path = os.path.expanduser(path)
        try:
            v = open(path, encoding="utf-8").read()
        except (OSError, UnicodeDecodeError) as e:
            sys.stderr.write("REFUSED: cannot read %s (%s)\n" % (path, type(e).__name__))
            return 4
        if v.endswith("\n"):
            v = v[:-1]        # text mode already turned a Windows "\r\n" into "\n" (universal newlines)
        out.extend(entries(n, v, "%s:%s" % (host, path), key))
    for spec in jsons:
        n, sep, rest = spec.partition("=")
        path, colon, keypath = rest.rpartition(":")
        if not sep or not n or not colon or not path or not keypath:
            sys.stderr.write("REFUSED: --json wants NAME=PATH:key.path\n")
            return 4
        path = os.path.expanduser(path)
        try:
            v = json.load(open(path, encoding="utf-8"))
        except (OSError, UnicodeDecodeError, ValueError) as e:
            sys.stderr.write("REFUSED: cannot read %s as JSON (%s)\n" % (path, type(e).__name__))
            return 4
        for k in keypath.split("."):
            if not isinstance(v, dict) or k not in v:
                sys.stderr.write("REFUSED: %s has no key %s\n" % (path, keypath))
                return 4
            v = v[k]
        if not isinstance(v, str):
            sys.stderr.write("REFUSED: %s key %s is a %s, not a string\n" % (path, keypath, type(v).__name__))
            return 4
        out.extend(entries(n, v, "%s:%s:%s" % (host, path, keypath), key))
    missing = [n for n in (names or []) if n not in found]
    if missing:
        sys.stderr.write("REFUSED: not found (with a value) in any --env file: %s%s\n"
                         % (", ".join(missing), "; defined but EMPTY: " + ", ".join(empty) if empty else ""))
        return 4
    out.sort(key=lambda e: (e["name"], e["source"]))
    print(json.dumps(out, indent=1))
    reach = sum(1 for e in out if "hmac" in e)
    sys.stderr.write("ok: %d entr%s, %d reachable, %d not reachable\n"
                     % (len(out), "y" if len(out) == 1 else "ies", reach, len(out) - reach))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
