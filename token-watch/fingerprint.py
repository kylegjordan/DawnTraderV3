"""A FINGERPRINT OF WHAT A MEASUREMENT READ, printed beside the number.

⛔ WHY (Langston, 2026-09-02, condition): between two review rounds my own
   figures moved -- 2,845 reads to 4,560, price agreement 99.39% to 98.88%.
   Both correct at their moment. NEITHER REPRODUCIBLE BY ANYONE AN HOUR LATER,
   INCLUDING ME. His words: that is `#447` in miniature, a claim with no
   re-executable provenance.

⇒ WHAT IT BUYS, STATED PRECISELY SO IT IS NOT OVERSOLD: a disagreement about
   a number resolves to EITHER "the input moved" OR "the computation is
   wrong", instead of staying a disagreement. It says which store state
   produced the figure.

⛔⛔ AND WHAT IT DOES *NOT* BUY, in his words: "that does not make me a second
   reader. It makes the claim falsifiable by re-execution instead of trusted
   by transcription." A fingerprinted number is STILL `RULED ON REPORTED FACT`
   -- reproducibility and independent verification are two different
   properties and he does not want them welded. Only his re-deriving removes
   the tag; the export at `/srv/token-watch-review` is the thing that does
   that, and it is not this.
"""

import hashlib
import json
import os


def _sha256(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def fingerprint(paths, observed_at_of=None, rows=None):
    """Return the provenance of a measurement over `paths`.

    `rows` is the caller's own row count -- the number the figure was computed
    over, which is NOT always the file's line count (blank lines, unparseable
    lines, filtered populations). Passing it explicitly keeps the fingerprint
    honest about the population rather than about the file.

    `observed_at_of` extracts a timestamp from a parsed record, so the span
    covered is reported rather than assumed from the filename -- a day file
    part-way through its day spans less than its name suggests.
    """
    out = {"inputs": [], "rows": rows}
    lo = hi = None
    for path in paths:
        entry = {"path": path}
        if not os.path.exists(path):
            entry["missing"] = True
            out["inputs"].append(entry)
            continue
        entry["sha256"] = _sha256(path)
        entry["bytes"] = os.path.getsize(path)
        n = 0
        if observed_at_of is not None:
            with open(path, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    try:
                        rec = json.loads(line)
                    except Exception:
                        continue
                    n += 1
                    t = observed_at_of(rec)
                    if not t:
                        continue
                    lo = t if lo is None or t < lo else lo
                    hi = t if hi is None or t > hi else hi
            entry["parsed_lines"] = n
        out["inputs"].append(entry)
    out["observed_at_min"] = lo
    out["observed_at_max"] = hi
    return out


def print_fingerprint(fp):
    print("")
    print("FINGERPRINT OF WHAT THIS READ -- a re-run either reproduces the")
    print("figures above or names which input moved. It does NOT make the")
    print("numbers independently verified; it makes them falsifiable.")
    for i in fp["inputs"]:
        if i.get("missing"):
            print("   MISSING  %s" % i["path"])
            continue
        print("   %s" % i["path"])
        print("      sha256 %s" % i["sha256"])
        print("      bytes  %-14d parsed lines %s"
              % (i["bytes"], i.get("parsed_lines", "n/a")))
    print("   rows the figures were computed over : %s" % fp["rows"])
    print("   observed_at span                    : %s .. %s"
          % (fp["observed_at_min"], fp["observed_at_max"]))
