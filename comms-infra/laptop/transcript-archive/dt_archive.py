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
a held notice's delivery that never reaches this raw file (another file) does not cancel it; a held notice released
late is appended at the END of its day file, so a day file is not strictly chronological; for an abandoned session
only the file-quiet arm can release a hold (no new lines, so the session clock never advances). The state's file keys
are os.sep paths, so a state folder is not portable between Windows and Linux (a move fails LOUD, via the
shorter-than-committed refusal) - the LF guarantee is about archive bytes, not state. A lock left by a killed run is
never broken here: the trigger wiring (P7) must raise a loud condition on exit 5 or a lock older than one interval,
with a written operator procedure (Langston P5 (b)). A dry run takes no lock and writes nothing at all.
"""
import calendar
import hashlib
import json
import stat
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

    def unreadable(err):
        # Langston P5 r2 must-fix 3: os.walk's default is SILENCE on a folder it cannot read, which made a nested
        # transcript vanish and its parent's link read "not on disk" - an absence asserted by an instrument that never
        # checked its reach, stamped into an append-only file. Any read failure refuses the WHOLE run before a write.
        why = getattr(err, "strerror", None)
        raise Refused("cannot read %s (%s%s) - the raw set would be incomplete; nothing written" % (
            getattr(err, "filename", "?"), type(err).__name__, ": " + why if why else ""))

    def kind_of(path):
        """The dir-vs-file decision WITH its reach checked (Langston P5 r3 must-fix): os.path.isdir/isfile swallow
        OSError by design, so a dangling junction or an unstattable entry read as 'neither' and vanished silently -
        and a missing nested file then stamped a false 'not on disk'. One os.stat per entry; any error refuses."""
        try:
            st = os.stat(path)          # follows a junction / symlink: a DANGLING one raises here
        except OSError as e:
            unreadable(e)
        if stat.S_ISDIR(st.st_mode):
            return "dir"
        if stat.S_ISREG(st.st_mode):
            return "file"
        return "other"

    for slug in sorted(SLUG_ALIAS):
        alias, base = SLUG_ALIAS[slug], os.path.join(projects, slug)
        try:
            os.stat(base)
        except FileNotFoundError:
            if os.path.lexists(base):   # the name is there but points nowhere: a dangling junction, never "absent"
                unreadable(FileNotFoundError(2, "dangling link", base))
            continue                    # genuinely absent: this session has no folder yet
        except OSError as e:
            unreadable(e)               # present but unstattable: refuse, never read as absent
        if kind_of(base) != "dir":
            unreadable(NotADirectoryError(20, "not a folder", base))
        try:
            names = sorted(os.listdir(base))
        except OSError as e:
            unreadable(e)
        for name in names:
            p = os.path.join(base, name)
            k = kind_of(p)
            if name.endswith(".jsonl") and k == "other":   # a FIFO, a device... named like a conversation: never
                unreadable(OSError(0, "neither a file nor a folder", p))   # dropped silently (Langston P5 r4)
            if name.endswith(".jsonl") and k == "file":
                out.append((alias, "top", p, name[:-6], None, None))
            elif k == "dir":
                for root, _dirs, files in sorted(os.walk(p, onerror=unreadable)):
                    for f in sorted(files):
                        if f.endswith(".jsonl"):
                            fp = os.path.join(root, f)
                            if kind_of(fp) != "file":
                                unreadable(OSError(0, "neither a file nor a folder", fp))
                            rel = os.path.relpath(fp, p)[:-6]
                            out.append((alias, "sub", fp, None, name, SAFE.sub("_", rel.replace(os.sep, "__"))))
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


def identity(path):
    """The raw file's identity: its real path, case-folded where the filesystem folds case. Two spellings of one file
    (absolute and relative, a symlink, a case difference on Windows) are ONE identity (Langston P5 must-fix 1)."""
    return os.path.normcase(os.path.realpath(os.path.abspath(path)))


def state_path(root, rf):
    """Keyed on file_key ALONE - already proven injective over the whole set by check_injective (C-5). It used to carry a
    sha of the path as spelled, so two spellings of one file got two offset owners: the session re-archived from offset
    0 (duplicated), or one spelling cut the other's committed bytes and that one then refused forever."""
    alias = rf[0]
    k = "_".join(file_key(rf)[1:])
    return os.path.join(root, ".state", alias, k + ".json")


def load_state(path, raw):
    try:
        st = json.load(open(path, encoding="utf-8"))
    except FileNotFoundError:
        return {"raw": identity(raw), "offset": 0, "ids": [], "lengths": {}, "held": [], "layer_c": {}}
    if st.get("raw") != identity(raw):     # a GENUINE rename or a different file under one key: loud, never re-archived
        raise Refused("state %s belongs to %s, not %s" % (path, st.get("raw"), identity(raw)))
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


def recover(root, st, dry=False):
    """Cut each archive file back to its committed length: bytes past it were written by a run that never committed.
    With dry=True NOTHING is cut - it returns what WOULD be cut (Langston P5 must-fix 2: a dry run that mutates the
    archive destroys exactly the evidence an operator inspects after a crash)."""
    would = []
    for rel, n in st["lengths"].items():
        p = os.path.join(root, rel)
        size = os.path.getsize(p) if os.path.exists(p) else 0
        if size < n:
            raise Refused("%s is %d bytes, shorter than its committed %d - something else changed it; not repairing" % (p, size, n))
        if size > n:
            would.append((rel, size - n))
            if not dry:
                with open(p, "r+b") as fh:
                    fh.truncate(n)
    return would


TAIL = 4096


def read_raw(raw, st):
    """ONE open of the raw file covers the rewrite check, the read and the next fingerprint (Langston P5 r6 FINDING-2: the
    fingerprint used to be taken by RE-OPENING the file after the write, so a rewrite landing in between could commit a
    state that matched the NEW file, or tail=None - the legacy blind condition). Returns
    (lines, new_offset, tail, reread): whole lines only; `tail` = sha256 of the <=TAIL bytes before new_offset, taken
    from the bytes this call read; `reread` = why the file was re-read from the start, or None.

    Why a re-read: the transcript tools (trim, dedup, distill - pre-audit A3) rewrite a raw file IN PLACE, and resuming
    at the old offset then reads from the middle of other content (measured: 19 of 20 new lines lost, 0 refused).
    Detected when the file is SHORTER than the offset, or the bytes just before it no longer match the fingerprint
    (a state written before the fingerprint existed can show only the first). The fingerprint is POSITIONAL: any length
    change before the offset shifts the window's content and is caught; only a byte-length-preserving edit of the early
    prefix escapes it, which none of those tools makes, and then the archived lines keep their earlier text - a
    fidelity residual, never a loss."""
    off = st["offset"]
    base = max(0, off - TAIL)
    reread = None
    with open(raw, "rb") as fh:
        fh.seek(base)
        data = fh.read()                                   # [base, EOF): the fingerprint window AND the new bytes
        if off:
            if base + len(data) < off:
                reread = "now %d bytes, shorter than the %d already read" % (base + len(data), off)
            elif st.get("tail") and hashlib.sha256(data[:off - base]).hexdigest() != st["tail"]:
                reread = "the %d bytes before the stored offset changed" % (off - base)
        if reread:
            fh.seek(0)
            base, data = 0, fh.read()
    start = 0 if reread else off
    new = data[start - base:]
    end = new.rfind(b"\n")
    new_off = start + end + 1 if end >= 0 else start
    lines = new[:end + 1].decode("utf-8", errors="replace").splitlines() if end >= 0 else []
    tail = hashlib.sha256(data[max(0, new_off - TAIL) - base:new_off - base]).hexdigest() if new_off else None
    return lines, new_off, tail, reread


def header(rf, day):
    alias, kind, p, sid, parent, nested = rf
    if kind == "top":
        return "# %s — %s — session %s\n> source: `%s`\n" % (alias, day, sid, os.path.basename(p))
    return ("# %s — nested transcript `%s` of session %s… (linked by FOLDER)\n> source: `%s`\n"
            % (alias, nested, parent[:8], os.path.relpath(p, os.path.dirname(os.path.dirname(p)))))


LINK = re.compile(r" → nested transcript `sub/([0-9A-Za-z-]{8})/(subagents__agent-[A-Za-z0-9_-]+)\.md`")


def check_links(line, alias, nested):
    """A link to a nested transcript is written only when that transcript is ON DISK (measured 2026-11-06: 20 of 266 agent
    calls name an agent whose file is gone - trimmed). Otherwise the line says so, never a pointer nobody can follow."""
    def sub(m):
        if (alias, m.group(1), m.group(2)) in nested:
            return m.group(0)
        return " → nested transcript for agent `%s` is not on disk" % m.group(2)[len("subagents__agent-"):]
    return LINK.sub(sub, line)


def archive_file(root, rf, red, now=None, dry=False, nested=frozenset()):
    """Archive the new bytes of one raw file. Returns a dict of what happened."""
    now = time.time() if now is None else now
    raw = rf[2]
    sp = state_path(root, rf)
    if not dry:          # a dry run writes NOTHING - not even a lock file or the .state folder
        lock(sp)
    try:
        st = load_state(sp, raw)
        would_cut = recover(root, st, dry=dry)
        # A raw file rewritten in place since the last run is RE-READ FROM THE START: every line already archived is
        # skipped by its id (every archived line carries one - a uuid, or a queued notice's ts+text id), so only what
        # is genuinely new is appended, and the run says so (`reread`).
        lines, new_off, tail, reread = read_raw(raw, st)
        ledger = {}
        ylds = list(dt.distill(lines, red, ledger=ledger))
        done, seen_run = set(st["ids"]), set()
        # (1) deliveries in these bytes cancel notices held from earlier runs, oldest first. NOT on a re-read: those
        # bytes include deliveries earlier runs already weighed, which could cancel a notice they had rightly held.
        left = {} if reread else dict(ledger.get("delivered_key", {}))
        held = []
        for h in sorted(st["held"], key=lambda h: h["ts"]):
            if left.get(h["key"], 0) > 0:
                left[h["key"]] -= 1
                done.add(h["id"])
            else:
                held.append(h)
        out, newest = [], max([y[1] for y in ylds] + [h["ts"] for h in held] + [""])
        # A notice still HELD from an earlier run is in no skip set until it is written; a re-read yields it again from
        # the same bytes, and without this it was held - then archived - once per re-read (Langston P5 r6 FINDING-1:
        # 4 copies of one notice after 3 rewrites). Its id is sha(ts + text), so the earlier hold IS this notice.
        held_ids = {h["id"] for h in held}
        for uid, ts, line, order in ylds:
            if uid in done or uid in held_ids or (uid, line) in seen_run:
                continue
            seen_run.add((uid, line))
            if str(uid).startswith("queue:"):       # (2) a queued-only notice is HELD, not written yet
                held.append({"id": uid, "ts": ts, "key": ledger["queued_key"][uid], "line": line, "order": list(order)})
                continue
            out.append((ts, tuple(order), uid, check_links(line, rf[0], nested)))
        # (3) release held notices whose hour has passed - on the session's clock, or of file quiet
        quiet = now - os.path.getmtime(raw) >= HOLD_S
        keep = []
        for h in held:
            a, b = _secs(newest), _secs(h["ts"])
            if quiet or (a is not None and b is not None and a - b >= HOLD_S):
                out.append((h["ts"], tuple(h["order"]), h["id"], h["line"]))
            else:
                keep.append(h)
        out.sort(key=lambda x: (x[0], x[1]))
        by_file, day_of = {}, {}
        for ts, _o, uid, line in out:
            by_file.setdefault(target(rf, ts[:10] or "undated"), []).append((uid, line))
            day_of[target(rf, ts[:10] or "undated")] = ts[:10] or "undated"
        if dry:
            return {"raw": raw, "files": sorted(by_file), "lines": len(out), "held": len(keep), "would_cut": would_cut,
                    "reread": reread}
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
                chunk += header(rf, day_of.get(rel, "undated"))
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
        st["tail"] = tail          # from the bytes this run read, never a second open
        write_state(sp, st)
        return {"raw": raw, "files": sorted(by_file), "lines": len(out), "held": len(keep), "offset": new_off,
                "cut": would_cut, "reread": reread}
    finally:
        if not dry:
            unlock(sp)


def _secs(ts):
    """Seconds since the epoch for a UTC stamp - calendar.timegm, never time.mktime, which reads it as LOCAL time and
    collapses a daylight-saving fold (Langston P5 must-fix 4). None when unreadable, so the caller HOLDS."""
    try:
        return calendar.timegm(time.strptime(str(ts)[:19], "%Y-%m-%dT%H:%M:%S"))
    except (ValueError, TypeError):
        return None


def archive_all(root, projects, red, now=None, dry=False):
    rfs = raw_files(projects)
    check_injective(rfs)                    # BEFORE any write (C-5)
    nested = frozenset((rf[0], rf[4][:8], rf[5]) for rf in rfs if rf[1] == "sub")
    results, refused = [], []
    for rf in rfs:
        try:
            results.append(archive_file(root, rf, red, now=now, dry=dry, nested=nested))
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
            v = next(it, None)
            if v is None or v.startswith("--"):     # never degrade a privacy control on a missing value (must-fix 3)
                sys.stderr.write("REFUSED: %s needs a value\n" % a)
                return 2
            opts[a] = v
        elif a == "--dry-run":
            opts[a] = True
        else:
            sys.stderr.write("REFUSED: unknown argument at position %d\n" % (argv.index(a)))
            return 2
    if not opts.get("--root") or not opts.get("--projects"):
        sys.stderr.write("REFUSED: --root and --projects are required\n")
        return 2
    hashes, key = [], None
    if opts.get("--key-file") and not opts.get("--hashes"):
        sys.stderr.write("REFUSED: --key-file without --hashes would run with layer (c) OFF\n")
        return 3
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
        for rel, n in r.get("would_cut") or []:     # a repair is an EVENT, said on both paths (Langston P5 r2 must-fix 1)
            print("WOULD CUT %d uncommitted byte(s) from %s (left by a run that never committed)" % (n, rel))
        for rel, n in r.get("cut") or []:
            print("RECOVERED: cut %d uncommitted byte(s) from %s (left by a run that never committed)" % (n, rel))
        if r.get("reread"):
            print("REREAD %s: rewritten in place since the last run (%s); re-read from the start, archived lines skipped"
                  % (r["raw"], r["reread"]))
        if r["lines"] or r["held"]:
            print("%s: %d line(s) into %d file(s), %d held" % (r["raw"], r["lines"], len(r["files"]), r["held"]))
    for e in refused:
        sys.stderr.write("REFUSED (file skipped): %s\n" % e)
    sys.stderr.write("files: %d processed, %d refused; redactions: %s\n"
                     % (len(results), len(refused), json.dumps(red.counts, sort_keys=True)))
    return 5 if refused else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
