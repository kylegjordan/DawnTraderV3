#!/usr/bin/env python3
"""dt_archive — B-TRANSCRIPT-ARCHIVE P5: the ARCHIVE WRITER. The single owner of each raw conversation file's offset
(scope C-2): every trigger (nightly, compaction, on demand) goes through `archive_all`, under a per-file lock.

    python3 -I dt_archive.py --root <archive dir> --projects <~/.claude/projects> [--hashes F --key-file K] [--dry-run]

WHAT IT WRITES, under --root (LF line endings everywhere, so a byte offset or a sha agrees across machines - Langston P4):
  <alias>/<YYYY-MM-DD>_<session-id8>.md          one file per session per UTC day, from the session's raw .jsonl
  <alias>/sub/<parent-id8>/<nested-name>.md      one file per nested transcript (subagent / workflow run, pre-audit A2),
                                                 linked to its parent by FOLDER and labelled so
  .state/<alias>/<key>.json                      per raw file: offset, archived ids, committed file lengths, held notices
Each archive file opens with a header naming its source, and carries the redaction layer (c) state line wherever that
state changes (scope C-9), so a reader can see which part of the redaction was switched on for which stretch.

THE GUARANTEES:
  * NAMES ARE INJECTIVE (C-5): every target name of the whole raw set is computed and checked BEFORE anything is written;
    two raw files mapping to one name stops the run (a .md overwrite would be silent).
  * EXACTLY-ONCE: lines are appended, flushed and fsynced; then the state (new offset, ids, file lengths) is written to a
    temp file and renamed into place. A run that dies between the two leaves the OLD state: the next run first cuts each
    archive file back to its last committed length (only bytes no committed run vouches for), then re-reads from the old
    offset. An archive file SHORTER than its committed length is refused, never "repaired" - something else touched it.
  * IDEMPOTENT ON THE ENTRY uuid (A3): an id archived in an earlier run is skipped, and inside one run a repeated
    (id, line) - a uuid the raw file holds twice after a compaction re-append - is written once.
  * ONLY WHOLE LINES are read: the offset stops at the last newline, so a line still being written is left for next run.
  * A QUEUED NOTICE NOT DELIVERED in the bytes read is HELD in the state - its text KEY (a sha256, for matching) and
    its already-REDACTED display line (what the archive would show), never the raw text - for an hour of the
    session's own clock or of file quiet, because its delivery may land in the next run's bytes; a later delivery
    cancels it, otherwise it is written labelled `queued; no delivered copy in this file` (Langston P4 finding).
KNOWN LIMITS, stated: an action whose tool result (and so its ERROR) lands in a LATER run is written without the ERROR;
a held notice's delivery that never reaches this raw file (another file) does not cancel it.
"""
import hashlib
import json
import os
import re
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dt_transcript as dt  # noqa: E402

SLUG_ALIAS = {"C--DawnTraderV3-old": "CC-A", "C--DawnTraderV3-new": "CC-B", "C--DawnTraderV3-analyst": "CC-C",
              "C--DawnTraderV3-infra": "CC-INFRA", "C--DawnTraderV3-pm": "CC-PM"}
HOLD_S = 3600
SAFE = re.compile(r"[^A-Za-z0-9_.-]+")


class Refused(Exception):
    pass


def raw_files(projects):
    """[(alias, kind, raw_path, session_id, parent_id, nested_name)] for the five session folders, sorted. kind is 'top'
    (<slug>/<session>.jsonl) or 'sub' (any .jsonl below <slug>/<session>/)."""
    out = []
    for slug in sorted(SLUG_ALIAS):
        alias, base = SLUG_ALIAS[slug], os.path.join(projects, slug)
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            p = os.path.join(base, name)
            if name.endswith(".jsonl") and os.path.isfile(p):
                out.append((alias, "top", p, name[:-6], None, None))
            elif os.path.isdir(p):
                for root, _dirs, files in sorted(os.walk(p)):
                    for f in sorted(files):
                        if f.endswith(".jsonl"):
                            rel = os.path.relpath(os.path.join(root, f), p)[:-6]
                            out.append((alias, "sub", os.path.join(root, f), None, name, SAFE.sub("_", rel.replace(os.sep, "__"))))
    return out


def file_key(rf):
    alias, kind, _p, sid, parent, nested = rf
    return (alias, "top", sid[:8]) if kind == "top" else (alias, "sub", parent[:8], nested)


def check_injective(rfs):
    """C-5: every raw file must own its own name family. Two DIFFERENT raw files with one key - two session ids sharing
    their first 8 characters, two nested names colliding after sanitising - stop the run before any write."""
    seen = {}
    for rf in rfs:
        k = file_key(rf)
        if k in seen and seen[k] != rf[2]:
            raise Refused("name collision: %s and %s both map to %s" % (seen[k], rf[2], "/".join(k)))
        seen[k] = rf[2]


def target(rf, day):
    alias, kind, _p, sid, parent, nested = rf
    if kind == "top":
        return os.path.join(alias, "%s_%s.md" % (day, sid[:8]))
    return os.path.join(alias, "sub", parent[:8], nested + ".md")


def state_path(root, rf):
    alias = rf[0]
    k = "_".join(file_key(rf)[1:])
    return os.path.join(root, ".state", alias, hashlib.sha256(rf[2].encode("utf-8")).hexdigest()[:12] + "_" + k + ".json")


def load_state(path, raw):
    try:
        st = json.load(open(path, encoding="utf-8"))
    except FileNotFoundError:
        return {"raw": raw, "offset": 0, "ids": [], "lengths": {}, "held": [], "layer_c": {}}
    if st.get("raw") != raw:
        raise Refused("state %s belongs to %s, not %s" % (path, st.get("raw"), raw))
    return st


def write_state(path, st):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        json.dump(st, fh)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)


def lock(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    try:
        fd = os.open(path + ".lock", os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        raise Refused("locked: %s.lock exists (another run, or a dead one - check before removing)" % path)
    os.write(fd, ("%d %s\n" % (os.getpid(), time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))).encode())
    os.close(fd)


def unlock(path):
    try:
        os.remove(path + ".lock")
    except FileNotFoundError:
        pass


def recover(root, st):
    """Cut each archive file back to its committed length: bytes past it were written by a run that never committed."""
    for rel, n in st["lengths"].items():
        p = os.path.join(root, rel)
        size = os.path.getsize(p) if os.path.exists(p) else 0
        if size < n:
            raise Refused("%s is %d bytes, shorter than its committed %d - something else changed it; not repairing" % (p, size, n))
        if size > n:
            with open(p, "r+b") as fh:
                fh.truncate(n)


def read_new(raw, offset):
    """Whole lines from `offset`; returns (lines, new_offset)."""
    with open(raw, "rb") as fh:
        fh.seek(offset)
        data = fh.read()
    end = data.rfind(b"\n")
    if end < 0:
        return [], offset
    return data[:end + 1].decode("utf-8", errors="replace").splitlines(), offset + end + 1


def header(rf, day):
    alias, kind, p, sid, parent, nested = rf
    if kind == "top":
        return "# %s — %s — session %s\n> source: `%s`\n" % (alias, day, sid, os.path.basename(p))
    return ("# %s — nested transcript `%s` of session %s… (linked by FOLDER)\n> source: `%s`\n"
            % (alias, nested, parent[:8], os.path.relpath(p, os.path.dirname(os.path.dirname(p)))))


def archive_file(root, rf, red, now=None, dry=False):
    """Archive the new bytes of one raw file. Returns a dict of what happened."""
    now = time.time() if now is None else now
    raw = rf[2]
    sp = state_path(root, rf)
    lock(sp)
    try:
        st = load_state(sp, raw)
        recover(root, st)
        lines, new_off = read_new(raw, st["offset"])
        ledger = {}
        ylds = list(dt.distill(lines, red, ledger=ledger))
        done, seen_run = set(st["ids"]), set()
        # (1) deliveries in these bytes cancel notices held from earlier runs, oldest first
        left = dict(ledger.get("delivered_key", {}))
        held = []
        for h in sorted(st["held"], key=lambda h: h["ts"]):
            if left.get(h["key"], 0) > 0:
                left[h["key"]] -= 1
                done.add(h["id"])
            else:
                held.append(h)
        out, newest = [], max([y[1] for y in ylds] + [h["ts"] for h in held] + [""])
        for uid, ts, line, order in ylds:
            if uid in done or (uid, line) in seen_run:
                continue
            seen_run.add((uid, line))
            if str(uid).startswith("queue:"):       # (2) a queued-only notice is HELD, not written yet
                held.append({"id": uid, "ts": ts, "key": ledger["queued_key"][uid], "line": line, "order": list(order)})
                continue
            out.append((ts, tuple(order), uid, line))
        # (3) release held notices whose hour has passed - on the session's clock, or of file quiet
        quiet = now - os.path.getmtime(raw) >= HOLD_S
        keep = []
        for h in held:
            if quiet or (newest and _secs(newest) - _secs(h["ts"]) >= HOLD_S):
                out.append((h["ts"], tuple(h["order"]), h["id"], h["line"]))
            else:
                keep.append(h)
        out.sort(key=lambda x: (x[0], x[1]))
        by_file = {}
        for ts, _o, uid, line in out:
            by_file.setdefault(target(rf, ts[:10] or "undated"), []).append((uid, line))
        if dry:
            return {"raw": raw, "files": sorted(by_file), "lines": len(out), "held": len(keep)}
        state_line = red.layer_c_state()
        # INTENT FIRST: record every target's length BEFORE this run writes to it, under the OLD offset. A run that
        # dies mid-write then leaves a state whose lengths cover even a file it had just created (length 0), so the
        # next run's recover() cuts it back - without this, a new day file's partial bytes would have no owner.
        for rel in by_file:
            p = os.path.join(root, rel)
            st["lengths"].setdefault(rel, os.path.getsize(p) if os.path.exists(p) else 0)
        write_state(sp, st)
        for rel, items in sorted(by_file.items()):
            p = os.path.join(root, rel)
            os.makedirs(os.path.dirname(p), exist_ok=True)
            chunk = ""
            if not os.path.exists(p) or os.path.getsize(p) == 0:
                chunk += header(rf, rel.split(os.sep)[-1][:10])
            if st["layer_c"].get(rel) != state_line:          # C-9: the state wherever it changes
                chunk += state_line + "\n"
                st["layer_c"][rel] = state_line
            chunk += "\n".join(line for _u, line in items) + "\n"
            with open(p, "ab") as fh:
                fh.write(chunk.encode("utf-8"))
                fh.flush()
                os.fsync(fh.fileno())
            st["lengths"][rel] = os.path.getsize(p)
            done.update(u for u, _l in items)
        st["offset"], st["ids"], st["held"] = new_off, sorted(done), keep
        write_state(sp, st)
        return {"raw": raw, "files": sorted(by_file), "lines": len(out), "held": len(keep), "offset": new_off}
    finally:
        unlock(sp)


def _secs(ts):
    try:
        return time.mktime(time.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S"))
    except ValueError:
        return 0.0


def archive_all(root, projects, red, now=None, dry=False):
    rfs = raw_files(projects)
    check_injective(rfs)                    # BEFORE any write (C-5)
    results, refused = [], []
    for rf in rfs:
        try:
            results.append(archive_file(root, rf, red, now=now, dry=dry))
        except Refused as e:
            refused.append(str(e))
    return results, refused


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except (AttributeError, ValueError):
        pass
    opts, it = {}, iter(argv[1:])
    for a in it:
        if a in ("--root", "--projects", "--hashes", "--key-file"):
            opts[a] = next(it, None)
        elif a == "--dry-run":
            opts[a] = True
        else:
            sys.stderr.write("REFUSED: unknown argument at position %d\n" % (argv.index(a)))
            return 2
    if not opts.get("--root") or not opts.get("--projects"):
        sys.stderr.write("REFUSED: --root and --projects are required\n")
        return 2
    hashes, key = [], None
    if opts.get("--hashes"):
        key = dt.load_key(opts.get("--key-file"))
        if key is None:
            sys.stderr.write("REFUSED: --hashes needs --key-file\n")
            return 3
        hashes = json.load(open(opts["--hashes"], encoding="utf-8"))
    red = dt.Redactor(hashes, key=key)
    if opts.get("--hashes") and (red.layer_c_wrong_key or red.layer_c_malformed or not red.layer_c_names):
        sys.stderr.write("REFUSED: the hashes file is not fully usable (wrong key %d, malformed %d, loaded %d)\n"
                         % (red.layer_c_wrong_key, red.layer_c_malformed, red.layer_c_names))
        return 3
    try:
        results, refused = archive_all(opts["--root"], opts["--projects"], red, dry=bool(opts.get("--dry-run")))
    except Refused as e:
        sys.stderr.write("REFUSED: %s\n" % e)
        return 4
    for r in results:
        if r["lines"] or r["held"]:
            print("%s: %d line(s) into %d file(s), %d held" % (r["raw"], r["lines"], len(r["files"]), r["held"]))
    for e in refused:
        sys.stderr.write("REFUSED (file skipped): %s\n" % e)
    sys.stderr.write("files: %d processed, %d refused; redactions: %s\n"
                     % (len(results), len(refused), json.dumps(red.counts, sort_keys=True)))
    return 5 if refused else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
