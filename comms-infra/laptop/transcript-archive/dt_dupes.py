#!/usr/bin/env python3
"""dt_dupes — B-TRANSCRIPT-ARCHIVE P10: LIST byte-identical raw conversation files. READ-ONLY.

    python3 -I dt_dupes.py --projects <~/.claude/projects> [--out <file.tsv>]

Scope: only Dawn Trader folders - the five session folders and any older copy whose folder name carries "DawnTrader" or
"Dawn-Trader" (pre-junction and backup copies). Every other project folder (Kyle's personal ones) is never opened.
Duplicates are decided by SHA-256 of the whole file, after a size match; a group is two or more files with the same
hash. This tool moves nothing: removal is a separate, explicit step after the archive's counts are checked (scope
OBJ-6, Kyle's order), and it will MOVE to a dated folder, never delete.
Output: TSV `sha256  size  count  path` one row per file in a duplicate group, sorted by group; a summary on stderr.
"""
import hashlib
import os
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import dt_archive as da  # noqa: E402


def in_scope(slug):
    """Dawn Trader's folders - the writer's ONE test (dt_archive.dt_folder_class), never a second literal here."""
    return da.dt_folder_class(slug) != "outside"


def _refuse(err):
    raise err


def raw_files(projects):
    """Every .jsonl in a Dawn Trader folder. A folder it cannot read REFUSES (os.walk's default is silence - the P5 r2
    precedent; this census is what the P10 move is justified against, so an under-count must be loud)."""
    out = []
    for slug in sorted(os.listdir(projects)):
        base = os.path.join(projects, slug)
        if not in_scope(slug) or not os.path.isdir(base):
            continue
        for root, _d, files in os.walk(base, onerror=_refuse):
            for f in files:
                if f.endswith(".jsonl"):
                    out.append(os.path.join(root, f))
    return sorted(out)


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def groups(paths):
    by_size = defaultdict(list)
    for p in paths:
        by_size[os.path.getsize(p)].append(p)
    out = defaultdict(list)
    for size, ps in by_size.items():
        if len(ps) < 2:
            continue
        for p in ps:
            out[(sha256(p), size)].append(p)
    return {k: sorted(v) for k, v in out.items() if len(v) >= 2}


def main(argv):
    opts, it = {}, iter(argv[1:])
    for a in it:
        if a in ("--projects", "--out"):
            opts[a] = next(it, None)
        else:
            sys.stderr.write("REFUSED: unknown argument at position %d\n" % argv.index(a))
            return 2
    if not opts.get("--projects"):
        sys.stderr.write("REFUSED: --projects is required\n")
        return 2
    try:
        paths = raw_files(opts["--projects"])
    except OSError as e:
        sys.stderr.write("REFUSED: cannot read %s (%s) - the census would be incomplete\n" % (getattr(e, "filename", "?"), e))
        return 3
    g = groups(paths)
    rows = ["sha256\tsize\tcount\tpath"]
    for (h, size), ps in sorted(g.items()):
        rows += ["%s\t%d\t%d\t%s" % (h, size, len(ps), p) for p in ps]
    text = "\n".join(rows) + "\n"
    if opts.get("--out"):
        with open(opts["--out"], "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
    else:
        try:
            sys.stdout.reconfigure(encoding="utf-8", newline="\n")
        except (AttributeError, ValueError):
            pass
        sys.stdout.write(text)
    extra = sum(len(ps) - 1 for ps in g.values())
    waste = sum((len(ps) - 1) * size for (_h, size), ps in g.items())
    sys.stderr.write("scanned %d raw files in scope; %d duplicate group(s); %d extra cop(ies) = %d bytes; nothing moved\n"
                     % (len(paths), len(g), extra, waste))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
