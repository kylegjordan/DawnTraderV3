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
    The hold also records the layer (c) state line its display line was redacted under: released after a switch, it
    is written under ITS OWN state line (C-9 holds line by line); a re-read refreshes it from the bytes under the
    current state; a hold from before this was recorded is written under a `NOT RECORDED` state line. The reachable
    switch is `ON, N values` -> `ON, N+1` (the run refuses layer (c) OFF): a hold minted before the new value is
    written under `ON, N`, with that value in clear - LEGIBLE, not hidden (Langston P5 r7 review).
KNOWN LIMITS, stated: a value held under a layer (c) state that could not reach it is written to the append-only
archive in clear at release, and sits in clear in `.state/<alias>/*.json` until then - bounded by HOLD_S plus the run
cadence; the raw .jsonl holds it regardless, so the archive is not the exposure boundary. Re-redacting a stored
display line at release is deliberately not done (double-redaction artifacts; it would not touch the .state copy); an action whose tool result (and so its ERROR) lands in a LATER run is written without the ERROR;
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
# WHICH FOLDERS ARE DAWN TRADER'S, AND WHAT THE ARCHIVE DOES WITH EACH - ONE function, imported by dt_dupes and the run
# (Langston, P10 counts leg, 2026-11-07: two literals in one batch is fix-follows-pointer). A folder whose name carries
# "DawnTrader" or "Dawn-Trader" (any case) is Dawn Trader's: it is archived (SLUG_ALIAS) or EXCLUDED with its measured
# class - EXCLUDED is total over every such folder that holds a conversation, and one that is neither is UNMAPPED,
# which the run makes loud. Any other folder is Kyle's other work (Kasia's, Mundo's, personal) and is never read.
DT_NAME = re.compile(r"dawntrader|dawn-trader", re.IGNORECASE)
EXCLUDED = {   # measured 2026-11-07, every user entry parsed; the counts are the change list's
    "C--DawnTraderV3": "the spare clone: daily-claude-model-check runs, no human turn",
    "C--Users-kyleg-AppData-Local-Temp-claude-C--DawnTraderV3-old-66dbb030-b3cb-4448-8086-39344c645007-scratchpad":
        "model probes ('ok'), no human turn",
    "G--My-Drive-Dawn-Trader-DT-Clone-Repo-DawnTraderV3": "one daily-claude-model-check run, no human turn",
    "G--My-Drive-Dawn-Trader-DT-Clone-Repo-DawnTraderV3-ARCHIVE-20260727-201449":
        "the pre-session-fix store (04-15 to 07-27): whether it becomes searchable is a question for Kyle's list",
    "G--My-Drive-Dawn-Trader-DT-Clone-Repo-DawnTraderV3-BACKUP-20260727-201449":
        "the pre-session-fix store (04-15 to 07-27): whether it becomes searchable is a question for Kyle's list",
}
# Dawn Trader's by content, not by name - so the name test cannot see them; recorded so a from-disk count reads them as
# known, never as a miss. Nothing reads them.
KNOWN_OUTSIDE = {
    "C--Users-kyleg--claude-crew-status-work": "the deleted crew-status tool's headless summariser runs, frozen 11-05",
}


# A GATED folder is LIVE and mostly machine runs: a conversation in it is archived only if it holds a human turn
# (Langston P10 r3 (iii): exclude FILES with zero human turns, not the folder - a folder exclusion would drop the next
# Kyle message, measured by a census taken before it existed).
GATED = {"G--My-Drive-Dawn-Trader": "HEARTBEAT"}   # wake-watcher-heartbeat scheduled runs, ~24 a day (live)
# DEFAULT-HUMAN (Langston's condition): these are the MACHINE shapes; anything else a user entry or a queued_command
# attachment carries is a human turn. Written the other way round, a new human shape would be dropped in silence; this
# way a new machine shape only adds noise, and noise is visible.
MACHINE_TEXT = re.compile(r"\s*(<scheduled-task |<task-notification>|continue (wake-watcher-)?heartbeat"
                          r"|resume wake-watcher-heartbeat|# Autonomous loop check|\[Request interrupted"
                          r"|\[Your previous response)")


def _human_content(c):
    if isinstance(c, str):
        return bool(c.strip()) and not MACHINE_TEXT.match(c)
    if not isinstance(c, list):
        return False
    blocks = [b for b in c if isinstance(b, dict)]
    if any(b.get("type") not in ("tool_result", "text") for b in blocks):
        return True                                   # an image, a document... - something a person put there
    text = " ".join(b.get("text", "") for b in blocks if b.get("type") == "text")
    return bool(text.strip()) and not MACHINE_TEXT.match(text)


def human_turn(path):
    """Does this raw file hold a human turn? A user entry or a queued_command attachment (a message typed while the
    session was busy - measured 2026-11-07: one exists in the heartbeat folder that a user-entry count never saw)."""
    with open(path, encoding="utf-8", errors="replace") as fh:
        for ln in fh:
            try:
                e = json.loads(ln)
            except ValueError:
                continue                              # a line still being written: not a turn yet
            if not isinstance(e, dict) or e.get("isMeta"):
                continue
            if e.get("type") == "user" and _human_content((e.get("message") or {}).get("content")):
                return True
            a = e.get("attachment") if e.get("type") == "attachment" else None
            if isinstance(a, dict) and a.get("type") == "queued_command" and _human_content(a.get("prompt")):
                return True
    return False


class Gate:
    """The per-file question for GATED folders, with a cache `(size, mtime_ns, verdict)` per file at <root>/gate-cache.json
    so a run re-reads only files that changed. A file with a state is archived already and stays in (a conversation
    never drops out of the archive). The cache is never trusted over a changed size or time; losing it costs a re-scan,
    never a miss. A dry run never writes it."""

    def __init__(self, root, dry=False):
        self.path, self.dry, self.root = os.path.join(root, "gate-cache.json"), dry, root
        try:
            self.cache = json.load(open(self.path, encoding="utf-8"))
        except FileNotFoundError:
            self.cache = {}
        self.changed = False

    def __call__(self, rf):
        p = rf[2]
        if os.path.exists(state_path(self.root, rf)):
            return True
        try:
            st = os.stat(p)
            key, now = identity(p), [st.st_size, st.st_mtime_ns]
            hit = self.cache.get(key)
            if hit and hit[:2] == now:
                return hit[2]
            verdict = human_turn(p)
        except OSError as e:          # unreadable is a refusal, never "no human turn" (the raw set would be incomplete)
            raise Refused("cannot read %s to judge it (%s) - nothing written" % (p, e))
        self.cache[key] = now + [verdict]
        self.changed = True
        return verdict

    def save(self):
        if self.dry or not self.changed:
            return
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
            json.dump(self.cache, fh)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, self.path)


def dt_folder_class(slug):
    """'<alias>' archived (a GATED alias: per conversation) · 'excluded' · 'UNMAPPED' (Dawn Trader's, neither - the run
    is loud if it holds a .jsonl) · 'outside' (not Dawn Trader's by name: never read)."""
    if slug in SLUG_ALIAS:
        return SLUG_ALIAS[slug]
    if slug in GATED:
        return GATED[slug]
    if not DT_NAME.search(slug):
        return "outside"
    return "excluded" if slug in EXCLUDED else "UNMAPPED"


HOLD_S = 3600
# The C-9 line for a notice held before holds recorded their layer (c) state (states written before 2026-11-07): the
# state it was redacted under is unknown, so the archive says so rather than borrowing the current one.
C9_UNRECORDED = ("> redaction layer (c), shapeless values: NOT RECORDED - a notice held before the writer stored the "
                 "state it was redacted under")
SAFE = re.compile(r"[^A-Za-z0-9_.-]+")


class Refused(Exception):
    pass


def raw_files(projects, gate=None):
    """[(alias, kind, raw_path, session_id, parent_id, nested_name)] for the five session folders, sorted. kind is 'top'
    (<slug>/<session>.jsonl) or 'sub' (any .jsonl below <slug>/<session>/). A GATED folder's conversations are listed
    only where `gate(rf)` says so (a nested file follows its parent); with no gate, a gated folder is not listed."""
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

    for slug in sorted(SLUG_ALIAS) + (sorted(GATED) if gate is not None else []):
        alias, base = (SLUG_ALIAS.get(slug) or GATED[slug]), os.path.join(projects, slug)
        start = len(out)
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
        if slug in GATED:            # (Langston P10 r3 (iii)) only conversations holding a human turn; nested follow
            kept = [rf for rf in out[start:] if rf[1] == "top" and gate(rf)]
            ids = {rf[3] for rf in kept}
            out[start:] = kept + [rf for rf in out[start:] if rf[1] == "sub" and rf[4] in ids]
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
    Detected when the file is SHORTER than the offset, or the bytes just before it no longer match the fingerprint; a
    state with an offset but NO fingerprint (written before fingerprints existed) is re-read once, so its first
    fingerprint is stamped at an offset that re-read established, never at an unvouched one. The fingerprint is
    POSITIONAL: any length change before the offset shifts the window's content and is caught. Only an edit of the
    early prefix that preserves its byte length escapes it - and if such an edit SUBSTITUTES content, the substituted-in
    lines are lost to the archive, since the read resumes at the old offset. None of trim, dedup or distill can make
    that edit (all three change length), so for the reachable set the residual is fidelity (archived lines keep their
    earlier text), not loss."""
    off = st["offset"]
    base = max(0, off - TAIL)
    reread = None
    with open(raw, "rb") as fh:
        fh.seek(base)
        data = fh.read()                                   # [base, EOF): the fingerprint window AND the new bytes
        if off:
            if base + len(data) < off:
                reread = "now %d bytes, shorter than the %d already read" % (base + len(data), off)
            elif not st.get("tail"):
                # Langston P5 r7: a state written before fingerprints has NOTHING vouching for its offset, and the first run
                # that stamps one would make a wrong offset look healthy forever. So it is re-read once (ids already
                # archived are skipped), and the fingerprint is stamped at an offset the re-read itself established.
                reread = "no fingerprint yet (a state written before fingerprints existed): re-read once to vouch for the offset"
            elif hashlib.sha256(data[:off - base]).hexdigest() != st["tail"]:
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
        state_line = red.layer_c_state()
        # A notice still HELD from an earlier run is in no skip set until it is written; a re-read yields it again from
        # the same bytes, and without this it was held - then archived - once per re-read (Langston P5 r6 FINDING-1:
        # 4 copies of one notice after 3 rewrites). Its id is sha(ts + text), so the earlier hold IS this notice - and
        # it is REFRESHED from these bytes: its display line redacted again under the CURRENT layer (c), so a re-read
        # never lets an older redaction outlive the bytes it came from (held-notice item, P5 r7). It fires on ANY
        # re-yield - a re-read, or a byte-identical duplicate enqueue in new bytes - and always toward the CURRENT
        # state, which only ever ADDS values: dt_archive_run refuses a run with no layer (c) (exit 3), so a refresh can
        # never rewrite a stored line back to clear. The order is refreshed too: a trim can move the enqueue.
        # NOTE: these dicts are the ones in st["held"], so the intent-first write_state below persists the REFRESHED
        # holds in what is otherwise the pre-run state. Harmless across a crash: the old offset re-yields the notice,
        # and the refresh repeats.
        held_by_id = {h["id"]: h for h in held}
        for uid, ts, line, order in ylds:
            if uid in held_by_id:
                held_by_id[uid].update(line=line, c9=state_line, order=list(order))
                continue
            if uid in done or (uid, line) in seen_run:
                continue
            seen_run.add((uid, line))
            if str(uid).startswith("queue:"):       # (2) a queued-only notice is HELD, not written yet - with the
                # layer (c) state its display line was redacted under, so its release can say which (C-9)
                held.append({"id": uid, "ts": ts, "key": ledger["queued_key"][uid], "line": line, "order": list(order),
                             "c9": state_line})
                held_by_id[uid] = held[-1]
                continue
            out.append((ts, tuple(order), uid, check_links(line, rf[0], nested), state_line))
        # (3) release held notices whose hour has passed - on the session's clock, or of file quiet
        quiet = now - os.path.getmtime(raw) >= HOLD_S
        keep = []
        for h in held:
            a, b = _secs(newest), _secs(h["ts"])
            if quiet or (a is not None and b is not None and a - b >= HOLD_S):
                out.append((h["ts"], tuple(h["order"]), h["id"], h["line"], h.get("c9") or C9_UNRECORDED))
            else:
                keep.append(h)
        out.sort(key=lambda x: (x[0], x[1]))
        by_file, day_of = {}, {}
        for ts, _o, uid, line, c9 in out:
            by_file.setdefault(target(rf, ts[:10] or "undated"), []).append((uid, line, c9))
            day_of[target(rf, ts[:10] or "undated")] = ts[:10] or "undated"
        if dry:
            return {"raw": raw, "files": sorted(by_file), "lines": len(out), "held": len(keep), "would_cut": would_cut,
                    "reread": reread}
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
            for _u, line, c9 in items:
                if st["layer_c"].get(rel) != c9:              # C-9: the state wherever it changes, LINE BY LINE - a
                    chunk += c9 + "\n"                        # hold released under a different state is written under
                    st["layer_c"][rel] = c9                   # its own state line, the next line under the current one
                chunk += line + "\n"
            with open(p, "ab") as fh:
                fh.write(chunk.encode("utf-8"))
                fh.flush()
                os.fsync(fh.fileno())
            st["lengths"][rel] = os.path.getsize(p)
            done.update(u for u, _l, _c in items)
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
    gate = Gate(root, dry=dry)
    rfs = raw_files(projects, gate=gate)
    gate.save()
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
