#!/usr/bin/env python3
"""dt_offset_census — B-TRANSCRIPT-ARCHIVE P5 r8 (Langston's ask 1): a READ-ONLY census of every archive state's offset
against its raw file today, BEFORE the first run that stamps fingerprints. Writes nothing.

    python3 -I dt_offset_census.py [--root DIR] [--held]

Per state: the raw file's size; whether `offset` lands immediately after a newline (a whole-line boundary); and whether the
record ending there (the line just before the offset) parses as JSON. A NON-boundary offset, or a non-parsing record, is
positive proof that the raw file was rewritten in place since that state was written. ⛔ A clean census proves NOTHING
about the opposite (#453): a rewrite that happens to leave a whole JSON line ending at the old offset is invisible to it.
--held also lists every held notice's id, key and timestamp, so their fate across the re-read can be checked by hand."""
import json
import os
import sys

ROOT = os.path.join(os.path.expanduser("~"), ".claude", "transcript-archive")


def check(st):
    raw, off = st["raw"], st["offset"]
    try:
        size = os.path.getsize(raw)
    except OSError as e:
        return "unreadable raw (%s)" % type(e).__name__
    if off == 0:
        return "offset 0"
    if size < off:
        return "SHORTER than offset (%d < %d)" % (size, off)
    with open(raw, "rb") as fh:
        fh.seek(max(0, off - 65536))
        before = fh.read(off - max(0, off - 65536))
    if not before.endswith(b"\n"):
        return "NOT A LINE BOUNDARY"
    prev = before[:-1]
    start = prev.rfind(b"\n") + 1
    if start == 0 and off > 65536:
        return "record longer than 64 KiB (not checked)"
    try:
        json.loads(prev[start:].decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return "RECORD BEFORE OFFSET DOES NOT PARSE"
    return "ok"


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    except (AttributeError, ValueError):
        pass
    root = argv[argv.index("--root") + 1] if "--root" in argv else ROOT
    counts, bad, held = {}, [], []
    for dp, _d, fs in os.walk(os.path.join(root, ".state")):
        for f in fs:
            if not f.endswith(".json"):
                continue
            st = json.load(open(os.path.join(dp, f), encoding="utf-8"))
            r = check(st)
            counts[r] = counts.get(r, 0) + 1
            if r not in ("ok", "offset 0"):
                bad.append((r, st["raw"], st["offset"]))
            for h in st.get("held") or []:
                held.append((os.path.basename(st["raw"]), h.get("id"), h.get("key"), h.get("ts")))
    total = sum(counts.values())
    print("states: %d" % total)
    for k in sorted(counts, key=lambda k: -counts[k]):
        print("  %-45s %d" % (k, counts[k]))
    for r, raw, off in bad:
        print("  ! %s: %s (offset %d)" % (r, raw, off))
    print("fingerprint present: %d of %d" % (sum(1 for dp, _d, fs in os.walk(os.path.join(root, ".state")) for f in fs
                                             if f.endswith(".json") and json.load(open(os.path.join(dp, f), encoding="utf-8")).get("tail")), total))
    if "--held" in argv:
        print("held notices: %d" % len(held))
        for raw, i, k, ts in held:
            print("  %s  %s  ts=%s  key=%s" % (raw, i, ts, (k or "")[:60]))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
