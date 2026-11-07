#!/usr/bin/env python3
"""dt_recall — B-TRANSCRIPT-ARCHIVE P6: search the conversation archive.

    python3 -I dt_recall.py "<words>" [--root DIR] [--alias CC-B] [--since YYYY-MM-DD] [--batch B-NAME] [--actions]

A line matches when it holds EVERY word (case-insensitive). Prints `file:line`, the time, and two lines of context on
each side; with --actions it searches ACTIONS.tsv (one row per action) instead of the conversation text. --since keeps
day files dated on or after it; --batch keeps only conversations whose files mention that batch id. Nested transcripts
have no date in their name, so --since leaves them out, in BOTH arms (an action row with no date too), and every --since
run SAYS how many it left out (Langston P6 review must-fix 2).
Every run ends by saying what a result is: a hit is a LEAD to go and read, never a fact; and NOT FOUND IS NOT EVIDENCE
that something did not happen (#453) - the archive holds what was archived, redacted, from the five session folders.
Exit 0 = hits, 1 = no hits, 2 = bad arguments (an unknown flag, a flag with no value, an empty query), 3 = the search
itself FAILED (an unreadable or unexpected archive layout) - a failure never wears the no-hits code.
"""
import os
import re
import sys

DEFAULT_ROOT = os.path.join(os.path.expanduser("~"), ".claude", "transcript-archive")
DAY_FILE = re.compile(r"^(\d{4}-\d{2}-\d{2})_([0-9a-f]{8})\.md$")
STAMP = re.compile(r"\[(\d\d:\d\d:\d\d)\]|`(\d\d:\d\d:\d\d)`")
FOOTER = ("\n-- A hit is a LEAD: open the file and read it before relying on it. No hit is NOT evidence that something "
          "did not happen (#453): the archive holds what was archived, redacted, from the five session folders only.")


def files(root, alias, since, skipped=None):
    """[(rel, path, date-or-None, sid8)] of archive .md files that pass the filters. `skipped`, a list, receives one entry
    per nested transcript --since left out, so the run can say so."""
    out = []
    for a in sorted(os.listdir(root)):
        adir = os.path.join(root, a)
        if a.startswith(".") or not os.path.isdir(adir) or (alias and a != alias):
            continue
        for name in sorted(os.listdir(adir)):
            m = DAY_FILE.match(name)
            if m and (not since or m.group(1) >= since):
                out.append(("%s/%s" % (a, name), os.path.join(adir, name), m.group(1), m.group(2)))
        sub = os.path.join(adir, "sub")
        if os.path.isdir(sub):
            for p8 in sorted(os.listdir(sub)):
                pdir = os.path.join(sub, p8)
                if not os.path.isdir(pdir):    # a stray file in sub/ is not a nested transcript (must-fix 4)
                    continue
                for name in sorted(os.listdir(pdir)):
                    if name.endswith(".md"):
                        if since:
                            if skipped is not None:
                                skipped.append("%s/sub/%s/%s" % (a, p8, name))
                            continue
                        out.append(("%s/sub/%s/%s" % (a, p8, name), os.path.join(pdir, name), None, p8))
    return out


def _lines(p):
    with open(p, encoding="utf-8", errors="replace") as fh:
        return fh.read().split("\n")


def search(root, words, alias=None, since=None, batch=None, actions=False, skipped=None):
    ws = [w.lower() for w in words.split() if w]
    if not ws:
        raise ValueError("an empty query matches nothing it measured")
    hits = []
    if actions:
        tsv = os.path.join(root, "ACTIONS.tsv")
        rows = _lines(tsv)[1:] if os.path.exists(tsv) else []
        for r in rows:
            f = r.split("\t")
            if len(f) < 7 or (alias and f[0] != alias):
                continue
            if since and not f[1]:             # an undated (nested) row: left out under --since, as in the text arm
                if skipped is not None:
                    skipped.append(f[4])
                continue
            if since and f[1] < since:
                continue
            if batch and batch.lower() not in r.lower():
                continue
            if all(w in r.lower() for w in ws):
                hits.append((f[4], f[2], [" ".join(f[5:])]))
        return hits
    fl = files(root, alias, since, skipped)
    if batch:
        keep = set()
        for rel, p, _d, sid8 in fl:
            if batch in "\n".join(_lines(p)):
                keep.add((rel.split("/")[0], sid8))
        fl = [x for x in fl if (x[0].split("/")[0], x[3]) in keep]
    for rel, p, _d, _s in fl:
        ls = _lines(p)
        last = ""
        for i, l in enumerate(ls):
            m = STAMP.search(l)
            if m:
                last = m.group(1) or m.group(2)
            if all(w in l.lower() for w in ws):
                hits.append(("%s:%d" % (rel, i + 1), last, ls[max(0, i - 2):i + 3]))
    return hits


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    except (AttributeError, ValueError):
        pass
    if len(argv) < 2 or argv[1].startswith("--"):
        sys.stderr.write(__doc__)
        return 2
    words, opts, it = argv[1], {}, iter(argv[2:])
    for a in it:
        if a in ("--root", "--alias", "--since", "--batch"):
            v = next(it, None)
            if v is None or v.startswith("--") or not v.strip():
                # a flag with no value must never silently DROP its filter (the writer's MF3 rule, P6 must-fix 1)
                sys.stderr.write("REFUSED: %s needs a value\n" % a)
                return 2
            opts[a] = v
        elif a == "--actions":
            opts[a] = True
        else:
            sys.stderr.write("REFUSED: unknown argument at position %d\n" % argv.index(a))
            return 2
    root = opts.get("--root") or DEFAULT_ROOT
    if not os.path.isdir(root):
        sys.stderr.write("REFUSED: no archive at %s\n" % root)
        return 2
    if not words.strip():
        sys.stderr.write("REFUSED: an empty query - it would report a zero it never measured\n")
        return 2
    skipped = []
    try:
        hits = search(root, words, opts.get("--alias"), opts.get("--since"), opts.get("--batch"),
                      bool(opts.get("--actions")), skipped)
    except (OSError, ValueError, UnicodeError) as e:
        sys.stderr.write("SEARCH FAILED: %s: %s - this is not a 'no hits' answer\n" % (type(e).__name__, e))
        return 3
    for where, t, ctx in hits:
        print("%s  %s" % (where, t or "--:--:--"))
        for c in ctx:
            print("    " + c)
    if opts.get("--since"):
        print("--since left out %d nested transcript(s) / undated row(s): they carry no date to filter on"
              % len(skipped))
    print("%d hit(s)%s" % (len(hits), FOOTER))
    return 0 if hits else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
