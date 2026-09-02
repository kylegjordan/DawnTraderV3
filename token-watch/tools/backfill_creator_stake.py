"""Backfill the creator's opening stake over every birth already recorded.

★ IT COSTS NOTHING. The stake comes out of the CREATE payload the receiver
  already stored, so 83,786 births recorded before the field existed can be
  filled in without spending a credit -- which is the entire reason the
  provenance store is kept. An extraction defect costs a re-parse; discarding
  the payload would have cost the observation.

⛔ ONE EXTRACTOR, NOT TWO. It calls `receiver.creator_stake` -- the same
   function the live path calls. A backfill with its own copy would be free to
   drift, and a value written by a second implementation is a second chance to
   be wrong rather than a check on the first (`fix-relocates`).

⛔ THE BIRTH FILES ARE NOT REWRITTEN. Append-only, so this writes a separate
   record set and the originals stand. `store.census()` applies it on the
   DEFAULT read path -- Langston's rule, earned the hard way in this batch:
   "a raw store plus a correction set joined by convention is two objects that
   must be combined correctly by every reader forever, and it fails quietly in
   whichever one forgot."

USAGE (on the host holding the store):
    python3 backfill_creator_stake.py            # dry run, counts only
    python3 backfill_creator_stake.py --write
"""

import argparse
import collections
import glob
import gzip
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, "/opt/token-watch")

import provenance  # noqa: E402
provenance.record_raw = lambda *a, **k: None
provenance.record_follow_up = lambda *a, **k: None

import receiver  # noqa: E402
import store  # noqa: E402

RAW = "/var/lib/token-watch/provenance/raw"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--write", action="store_true")
    args = ap.parse_args()

    # Which births already carry a stake? Only the gap is filled.
    have = set()
    need = set()
    for f in sorted(glob.glob("/var/lib/token-watch/births/*.jsonl")):
        for line in open(f, encoding="utf-8", errors="replace"):
            try:
                r = json.loads(line)
            except Exception:
                continue
            m = r.get("mint")
            if not m:
                continue
            if r.get("creator_stake_source", "not_extracted") == "not_extracted":
                need.add(m)
            else:
                have.add(m)

    sources = collections.Counter()
    records = []
    seen = set()
    # ⛔ COLD STORAGE COUNTS. The raw payloads tier to `cold/` after a day and
    #    are GZIPPED, not deleted -- the first version of this read only the
    #    hot directory and reported 59,562 births as "not reachable from any
    #    stored payload", which was true of where it LOOKED and false of the
    #    store. An absence produced by not looking is not an absence.
    payload_files = sorted(glob.glob(RAW + "/*.jsonl")) +         sorted(glob.glob("/var/lib/token-watch/cold/provenance-raw-*.jsonl.gz"))
    print("payload files to scan: %d hot, %d cold"
          % (len(glob.glob(RAW + "/*.jsonl")),
             len(glob.glob("/var/lib/token-watch/cold/provenance-raw-*.jsonl.gz"))))
    for f in payload_files:
        opener = gzip.open if f.endswith(".gz") else open
        for line in opener(f, "rt", encoding="utf-8", errors="replace"):
            try:
                rec = json.loads(line)
            except Exception:
                continue
            body = rec.get("body")
            if isinstance(body, str):
                try:
                    body = json.loads(body)
                except Exception:
                    continue
            ev = body[0] if isinstance(body, list) and body else body
            if not isinstance(ev, dict) or ev.get("type") != "CREATE":
                continue
            mint = receiver._launched_mint(ev)
            if not mint or mint in seen:
                continue
            seen.add(mint)
            if mint not in need:
                continue
            tokens, share, src = receiver.creator_stake(ev, ev.get("feePayer"))
            sources[src] += 1
            records.append({"mint": mint, "creator_tokens": tokens,
                            "creator_share": share, "creator_stake_source": src})

    print("births already carrying a stake        : %d" % len(have))
    print("births needing one                     : %d" % len(need))
    print("...for which a CREATE payload was found: %d" % len(records))
    print("...NOT reachable from any stored payload: %d" % (len(need) - len(records)))
    print("   (a coverage limit, not a result. It read 59,562 before this tool")
    print("    learned to read COLD storage -- an absence produced by not")
    print("    looking is not an absence.)")
    print("")
    print("EXTRACTION ROUTE:")
    for k, c in sources.most_common():
        print("   %-30s %6d  (%.1f%%)" % (k, c, 100.0 * c / len(records) if records else 0))
    if records:
        with_tokens = [r for r in records if (r["creator_tokens"] or 0) > 0]
        if with_tokens:
            shares = sorted(r["creator_share"] for r in with_tokens)
            print("")
            print("CREATOR SHARE OF SUPPLY, over the %d who took any:" % len(with_tokens))
            print("   median %.2f%%   90th %.2f%%   max %.2f%%"
                  % (100 * shares[len(shares) // 2],
                     100 * shares[int(len(shares) * 0.9)], 100 * shares[-1]))
            over = [s for s in shares if s > 0.20]
            print("   holding more than 20%% of supply at launch: %d (%.2f%%)"
                  % (len(over), 100.0 * len(over) / len(shares)))

    if not args.write:
        print("\ndry run -- nothing written. Re-run with --write.")
        return 0
    for r in records:
        store.record_creator_stake(r)
    print("\nappended %d stake records to %s"
          % (len(records), store.CREATOR_STAKE_PATH))
    return 0


if __name__ == "__main__":
    sys.exit(main())
