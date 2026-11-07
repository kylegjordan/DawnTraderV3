#!/usr/bin/env python3
"""dt_index — B-TRANSCRIPT-ARCHIVE P6: the INDEX, the ACTION LIST and the TOPIC-FREE index, rebuilt from the archive.

    python3 -I dt_index.py --root <archive dir> --shared <shared memory folder>

Rebuilt WHOLE from the archive files on every run (no state of its own, so it cannot drift from what it indexes):
  <root>/INDEX.md          one line per CONVERSATION (a top-level session; its nested transcripts are counted on its
                           line): alias, session id, first and last day, day files, lines, nested count, the batch ids
                           it mentions most, and a TOPIC - the first thing a person said in it. Outside every repo.
  <root>/ACTIONS.tsv       one row per action line, all sessions: alias, date, time, session8, file:line, tool, summary.
  <shared>/TRANSCRIPT_INDEX.md   the same lines WITHOUT the topic (Kyle, KD-49 option iii): the shared memory folder is
                           mirrored into git, and the topic is the one field that can carry a private message. Refused
                           (exit 4) if it would exceed the memory-file cap of 24,576 bytes: the SHARED copy is not
                           written (the old one is left as it was), while INDEX.md and ACTIONS.tsv above ARE.
All output is LF. The archive is already redacted; nothing here reads a raw conversation.
The run (`dt_archive_run`) passes the folders on no list (`unlisted`) to build(); this bare CLI does not, so an index
rebuilt by hand carries no such line - rebuild through the run when that line matters.
"""
import os
import re
import sys
from collections import Counter

MEMORY_CAP = 24576
DAY_FILE = re.compile(r"^(\d{4}-\d{2}-\d{2})_([0-9a-f]{8})\.md$")
HEADER = re.compile(r"^# (\S+) — (\d{4}-\d{2}-\d{2}) — session (\S+)$")
ACTION = re.compile(r"^- `(\d\d:\d\d:\d\d)` (\S+) — (.*)$")
USER = re.compile(r"^\*\*\[(\d\d:\d\d:\d\d)\] User:\*\* (.*)$")
BATCH = re.compile(r"\b(?:B-[A-Z0-9]+(?:-[A-Z0-9]+)*|P\d{1,2}-B\d+(?:\.\d+[a-z]?)?)\b")
TOP_BATCHES = 4


def _read(p):
    with open(p, encoding="utf-8", errors="replace") as fh:
        return fh.read().split("\n")


def scan(root):
    """{(alias, sid8): conversation dict}, plus every action row."""
    convs, actions = {}, []
    for alias in sorted(os.listdir(root)):
        adir = os.path.join(root, alias)
        if alias.startswith(".") or not os.path.isdir(adir):
            continue
        for name in sorted(os.listdir(adir)):
            m = DAY_FILE.match(name)
            if not m:
                continue
            day, sid8 = m.groups()
            rel = alias + "/" + name
            lines = _read(os.path.join(adir, name))
            c = convs.setdefault((alias, sid8), {"alias": alias, "sid": sid8, "days": [], "lines": 0, "batches": Counter(),
                                                 "topic": None, "nested": 0})
            c["days"].append(day)
            c["lines"] += len([l for l in lines if l.strip()])
            for i, l in enumerate(lines, 1):
                h = HEADER.match(l)
                if h and len(h.group(3)) > len(c["sid"]):
                    c["sid"] = h.group(3)
                c["batches"].update(BATCH.findall(l))
                u = USER.match(l)
                if u and c["topic"] is None and u.group(2).strip():
                    c["topic"] = " ".join(u.group(2).split())[:100]
                a = ACTION.match(l)
                if a:
                    actions.append((alias, day, a.group(1), sid8, "%s:%d" % (rel, i), a.group(2), a.group(3)))
        sub = os.path.join(adir, "sub")
        if os.path.isdir(sub):
            for parent8 in sorted(os.listdir(sub)):
                pdir = os.path.join(sub, parent8)
                if not os.path.isdir(pdir):
                    continue
                n = 0
                for name in sorted(os.listdir(pdir)):
                    if not name.endswith(".md"):
                        continue
                    n += 1
                    rel = "%s/sub/%s/%s" % (alias, parent8, name)
                    for i, l in enumerate(_read(os.path.join(pdir, name)), 1):
                        a = ACTION.match(l)
                        if a:
                            actions.append((alias, "", a.group(1), parent8, "%s:%d" % (rel, i), a.group(2), a.group(3)))
                if (alias, parent8) in convs:
                    convs[(alias, parent8)]["nested"] = n
    return convs, actions


def _cell(s):
    return str(s).replace("|", "/").replace("\t", " ").replace("\n", " ")


def index_lines(convs, with_topic):
    head = "| alias | session | first | last | days | lines | nested | batches mentioned most |"
    sep = "|---|---|---|---|---|---|---|---|"
    if with_topic:
        head += " topic (first thing a person said) |"
        sep += "---|"
    out = [head, sep]
    for (alias, _s), c in sorted(convs.items(), key=lambda kv: (kv[1]["alias"], min(kv[1]["days"]), kv[1]["sid"])):
        b = ", ".join(x for x, _n in c["batches"].most_common(TOP_BATCHES))
        row = "| %s | %s | %s | %s | %d | %d | %d | %s |" % (alias, c["sid"], min(c["days"]), max(c["days"]), len(c["days"]),
                                                            c["lines"], c["nested"], _cell(b))
        if with_topic:
            row += " %s |" % _cell(c["topic"] or "(no typed message)")
        out.append(row)
    return out


def _write(path, text):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    os.replace(tmp, path)


COVERAGE = ("COVERAGE, and its bound: every conversation folder whose NAME carries `DawnTrader` or `Dawn-Trader` is "
            "archived, archived per conversation (heartbeat runs holding a human turn), or excluded by a measured class "
            "- a run checks that. A crew conversation in a folder named WITHOUT that string is not covered, so a clean run "
            "says nothing about it (the duplicate list inherits the same bound).")


def build(root, shared, unlisted=()):
    """`unlisted`: folders NOT named Dawn Trader's, on no list, holding a conversation. Their NAMES go only into the
    laptop-local index; the shared copy (mirrored into git) carries the count (Langston P10 r4 condition 1)."""
    convs, actions = scan(root)
    full = ["# Conversation archive — index", "",
            "One line per conversation. Read the archive file for anything you rely on; this index only points.", "",
            COVERAGE, ""]
    if unlisted:
        full += ["Folders on no list that hold conversations (not read; add each to `outside-folders.txt` or map it): "
                 + ", ".join("`%s`" % u for u in unlisted), ""]
    full += index_lines(convs, True)
    _write(os.path.join(root, "INDEX.md"), "\n".join(full) + "\n")
    rows = ["alias\tdate\ttime\tsession8\tfile:line\ttool\tsummary"]
    rows += ["\t".join(_cell(x) for x in a) for a in actions]
    _write(os.path.join(root, "ACTIONS.tsv"), "\n".join(rows) + "\n")
    lean = ["# Conversation archive — index (no topics)", "",
            "Where the full conversations are: `~/.claude/transcript-archive/` on Kyle's laptop (not in git). Search with",
            "`python -I <any DawnTraderV3 clone>/comms-infra/laptop/transcript-archive/dt_recall.py \"<words>\"` (e.g. the",
            "clone `C:/DawnTraderV3-old`); it runs from a clone, never an installed copy. Topics are left out on purpose: this",
            "file is mirrored into git (Kyle, KD-49).", "",
            COVERAGE, ""]
    if unlisted:
        lean += ["%d folder(s) on no list hold conversations; their names are in the laptop's own index only." % len(unlisted), ""]
    lean += index_lines(convs, False)
    text = "\n".join(lean) + "\n"
    size = len(text.encode("utf-8"))
    if size > MEMORY_CAP:
        raise OverflowError("the topic-free index would be %d bytes, over the %d-byte memory-file cap; not written"
                            % (size, MEMORY_CAP))
    _write(os.path.join(shared, "TRANSCRIPT_INDEX.md"), text)
    return {"conversations": len(convs), "actions": len(actions), "shared_bytes": size}


def main(argv):
    opts, it = {}, iter(argv[1:])
    for a in it:
        if a in ("--root", "--shared"):
            opts[a] = next(it, None)
        else:
            sys.stderr.write("REFUSED: unknown argument at position %d\n" % argv.index(a))
            return 2
    if not opts.get("--root") or not opts.get("--shared"):
        sys.stderr.write("REFUSED: --root and --shared are required\n")
        return 2
    try:
        r = build(opts["--root"], opts["--shared"])
    except OverflowError as e:
        sys.stderr.write("REFUSED: %s\n" % e)
        return 4
    sys.stderr.write("index: %(conversations)d conversations, %(actions)d actions, shared copy %(shared_bytes)d bytes\n" % r)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
