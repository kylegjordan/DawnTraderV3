#!/usr/bin/env python3
"""dt_secret_hashes — B-TRANSCRIPT-ARCHIVE P3(c): the VALUE-HASH PRODUCER for redaction layer (c).

Runs ON THE MACHINE THAT HOLDS THE SECRETS (each server as root, and the laptop for its own key files) and prints
ONLY {name, length, sha256} per named secret. The values never leave the machine: they are not printed, logged,
written or put in an error message. Stdlib only; run with `python3 -I`. Typical remote use, nothing copied to disk:

    ssh root@<host> 'python3 -I - --env /path/.env --names A,B --file C=/path/key' < dt_secret_hashes.py > hashes.json

ARGUMENTS
  --env PATH          a KEY=VALUE file (dotenv / systemd EnvironmentFile form). Repeatable. Only names in --names
                      are taken from it; every other key is ignored, so a non-secret setting is never hashed.
  --names A,B,...     the secret names to take from the --env files. Every listed name must be found in at least one
                      of them (a name in two files gives two entries, both kept).
  --file NAME=PATH    a file whose whole content (one trailing newline stripped) IS the secret. Repeatable.
  --json NAME=PATH:a.b  one string field of a JSON file, by its dotted key path (split at the LAST ":"). Repeatable.
                      A missing key, or a value that is not a string, is REFUSED (exit 4), never skipped.

OUTPUT (stdout, one JSON list, sorted by name then source):
  {"name", "length", "sha256", "source"}            — the value is within layer (c)'s reach (the CONTRACT below);
  {"name", "reachable": false, "reason", "source"}  — it is not, and NO hash or length is emitted for the whole value:
                                                       a hash of a short value can be reversed by guessing;
  {"name": "NAME#n", "length", "sha256", "source"}  — for a value holding a separator (`keyid:key`, a URL with a
                                                       password), each run of 12+ token characters inside it.

THE TOKENIZABILITY CONTRACT (scope C-3, owned by this piece): the redactor finds a value only where it stands as text
made of the characters  A-Z a-z 0-9 _ - + / = .  and is at least 12 long. So a value is REACHABLE only if it is made
entirely of those characters and is 12 or more long. The redactor also catches it glued behind the first `=` of a run
(`token=<value>`, `--key=<value>`) and with one trailing `.` (end of a sentence). It does NOT catch it glued to any
other prefix or suffix made of those characters (`-p<value>`, `<value>-old`). A value containing any other character
(`:` `@` `%` `!` space ...) is reported unreachable WHOLE, by name, so the gap is visible instead of silent — and its
runs of 12+ token characters are hashed as NAME#1.. (the redactor splits text at exactly those characters, so each
run is caught wherever it stands). A run under 12 inside such a value is not caught, and the reason says so.

FAILS CLOSED: an unreadable file, a malformed --file argument, or a listed name found nowhere prints NOTHING on stdout
and exits 4 — a partial list would read as full coverage. Exit 2 = bad arguments. Exit 0 = every name found.
"""
import hashlib
import json
import os
import re
import socket
import sys

REACHABLE = re.compile(r"[A-Za-z0-9_\-+/=.]{12,}\Z")      # must equal dt_transcript.TOKEN, anchored
PART = re.compile(REACHABLE.pattern[:-2])                  # the same set, unanchored: the runs the redactor sees
LINE = re.compile(r"\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)\Z")


def parse_env(text):
    """Yield (name, value) from KEY=VALUE text. Quoted values keep their inside verbatim; an unquoted value is cut at
    ` #` (an inline comment) and stripped. Never raises on content and never returns a line number with a value."""
    for raw in text.splitlines():
        m = LINE.match(raw)
        if not m:
            continue
        name, v = m.group(1), m.group(2).strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in "\"'":
            v = v[1:-1]
        else:
            v = v.split(" #", 1)[0].strip()
        yield name, v


def _hashed(name, v, source):
    return {"name": name, "length": len(v), "sha256": hashlib.sha256(v.encode("utf-8")).hexdigest(), "source": source}


def entries(name, value, source):
    """The entries for one secret. A value holding a separator (`keyid:key`, a URL with a password) is not reachable
    WHOLE, but the redactor splits text at exactly the characters this splits at, so each run of 12+ token characters
    inside it is hashed on its own as NAME#1, NAME#2 ... and caught wherever it stands alone in text."""
    if REACHABLE.match(value):
        return [_hashed(name, value, source)]
    if len(value) < 12:
        return [{"name": name, "reachable": False, "reason": "under 12 characters", "source": source}]
    parts = PART.findall(value)
    if parts:
        reason = ("contains characters outside the token set; its %d part(s) of 12+ characters are hashed as %s#1..%d"
                  " and a shorter part is not caught" % (len(parts), name, len(parts)))
    else:
        reason = "contains characters outside the token set and has no part of 12+ characters"
    return ([{"name": name, "reachable": False, "reason": reason, "source": source}]
            + [_hashed("%s#%d" % (name, i), p, source) for i, p in enumerate(parts, 1)])


def main(argv):
    envs, files, jsons, names = [], [], [], None
    it = iter(argv)
    for a in it:
        try:
            if a == "--env":
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
    host = socket.gethostname()
    out, found = [], set()
    for path in envs:
        try:
            text = open(path, encoding="utf-8").read()
        except (OSError, UnicodeDecodeError) as e:
            sys.stderr.write("REFUSED: cannot read %s (%s)\n" % (path, type(e).__name__))
            return 4
        for n, v in parse_env(text):
            if n in names:
                out.extend(entries(n, v, "%s:%s" % (host, path)))
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
        out.extend(entries(n, v, "%s:%s" % (host, path)))
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
        out.extend(entries(n, v, "%s:%s:%s" % (host, path, keypath)))
    missing = [n for n in (names or []) if n not in found]
    if missing:
        sys.stderr.write("REFUSED: not found in any --env file: %s\n" % ", ".join(missing))
        return 4
    out.sort(key=lambda e: (e["name"], e["source"]))
    print(json.dumps(out, indent=1))
    reach = sum(1 for e in out if "sha256" in e)
    sys.stderr.write("ok: %d entr%s, %d reachable, %d not reachable\n"
                     % (len(out), "y" if len(out) == 1 else "ies", reach, len(out) - reach))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
