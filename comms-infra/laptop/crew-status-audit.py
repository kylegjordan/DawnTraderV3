#!/usr/bin/env python3
"""Audit the crew-status turn classifier against the real transcript corpus.

WHY THIS FILE IS COMMITTED (Langston, Step-2): "A number that only exists as a table in a scope
doc is an assertion; the same number produced by a committed script is a measurement anyone with
the corpus -- including Kyle -- can re-derive." He could not reach the corpus (it lives on Kyle's
laptop, not Helsinki) and correctly refused to rule on my reported numbers.

WHAT IT MEASURES, and why the first version of this measurement was wrong.

My Step-2 scope claimed "~7 of every 8 user turns is a machine" and used it to argue the
classifier needed rebuilding. Langston caught that this is a RAW-RECORD ratio, not the
population the SHIPPED filter admits -- right object, wrong denominator. The shipped predicate
at crew-status.py:212 already excludes any turn whose extracted text begins with "<", so most of
those machine turns were never admitted in the first place.

The number that actually measures the defect is: OF THE RECORDS THE SHIPPED PREDICATE ADMITS,
how many are not Kyle -- and for each, why it evaded. That is what section A reports.

Section B measures the second blocker: the shipped reader takes the NEWEST transcript file by
mtime and parses THAT FILE ONLY, while the trailheads this tool must recover are 8-9 days old.
If the trailhead lives in an older file, the tool reports "not recoverable" for a record that is
present on disk and merely unread -- abstention failing in the honest direction and still wrong,
for exactly the two sessions the batch exists to serve.

Run:  python crew-status-audit.py            (uses ~/.claude/projects)
"""
import io, json, os, glob, sys
from collections import Counter
from datetime import datetime, timezone

TR = os.path.expanduser(r"~/.claude/projects")
SESSIONS = {"OLD Claude": "C--DawnTraderV3-old", "NEW Claude": "C--DawnTraderV3-new",
            "ANALYST Claude": "C--DawnTraderV3-analyst", "Infra Claude": "G--My-Drive"}
SUMMARY_PREAMBLE = "You are given EVIDENCE about four AI sessions"


def extract_text(msg):
    """EXACTLY the shipped extraction at crew-status.py:209-211. Reproduced rather than
    imported so this audit measures the shipped behaviour even if the module changes under it;
    if they diverge, that divergence is itself the finding."""
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return " ".join(b.get("text", "") for b in c
                        if isinstance(b, dict) and b.get("type") == "text")
    return ""


def shipped_admits(ev):
    """crew-status.py:212 verbatim in effect."""
    msg = ev.get("message") or {}
    if msg.get("role") != "user":
        return False, ""
    text = extract_text(msg)
    if not text or text.lstrip().startswith("<"):
        return False, text
    return True, text


def truth_is_kyle(ev, text):
    """Best available ground truth, and it is deliberately NOT the shipped rule.
    Returns (is_kyle, reason_if_not)."""
    if ev.get("isCompactSummary"):
        return False, "compact-summary"
    if ev.get("isMeta"):
        return False, "isMeta"
    org = ev.get("origin")
    kind = org.get("kind") if isinstance(org, dict) else None
    stripped = text.lstrip()
    # The scheduler submits through the human path, so origin.kind cannot discriminate it.
    # This is a STRUCTURAL property, not an observation about a sample size.
    if "<scheduled-task" in stripped[:400]:
        return False, "scheduled-task (origin.kind=%s)" % kind
    if "<task-notification" in stripped[:400]:
        return False, "task-notification (origin.kind=%s)" % kind
    if kind == "task-notification":
        return False, "origin.kind=task-notification"
    if kind == "human":
        return True, ""
    return True, ""            # no origin -> fallback path; prose is treated as Kyle


def main():
    print("=" * 100)
    print("SECTION A -- what the SHIPPED predicate ADMITS that is not Kyle")
    print("  (the denominator that measures the defect, replacing the raw-record ratio)")
    print("=" * 100)
    tot_admit = tot_bad = 0
    reasons = Counter()
    examples = []
    raw_user = 0
    for sess, slug in SESSIONS.items():
        d = os.path.join(TR, slug)
        if not os.path.isdir(d):
            print(f"{sess}: no transcript dir"); continue
        admit = bad = 0
        for f in glob.glob(os.path.join(d, "*.jsonl")):
            try:
                fh = io.open(f, encoding="utf-8", errors="replace")
            except Exception:
                continue
            with fh:
                for line in fh:
                    if '"user"' not in line:
                        continue
                    try:
                        ev = json.loads(line)
                    except Exception:
                        continue
                    if ev.get("isSidechain"):
                        continue
                    if (ev.get("message") or {}).get("role") == "user":
                        raw_user += 1
                    ok, text = shipped_admits(ev)
                    if not ok:
                        continue
                    admit += 1
                    is_kyle, why = truth_is_kyle(ev, text)
                    if not is_kyle:
                        bad += 1
                        reasons[why] += 1
                        if len(examples) < 12:
                            examples.append((ev.get("timestamp"), sess, why,
                                             text.replace("\n", " ")[:150]))
        tot_admit += admit; tot_bad += bad
        pct = (100.0 * bad / admit) if admit else 0.0
        print(f"  {sess:<16} admitted={admit:>5}   NOT-Kyle={bad:>4}  ({pct:.2f}%)")
    print("-" * 100)
    print(f"  {'TOTAL':<16} admitted={tot_admit:>5}   NOT-Kyle={tot_bad:>4}  "
          f"({(100.0*tot_bad/tot_admit) if tot_admit else 0:.2f}%)   [raw user records: {raw_user}]")
    if reasons:
        print("\n  how each evaded the shipped filter:")
        for r, c in reasons.most_common():
            print(f"    {c:>4}  {r}")
    if examples:
        print("\n  examples:")
        for ts, sess, why, t in examples:
            print(f"    [{ts} {sess}] ({why})\n        {t}")
    else:
        print("\n  (no admitted record failed the truth test)")

    print()
    print("=" * 100)
    print("SECTION B -- does the SHIPPED one-file read reach the real trailhead?")
    print("  crew-status.py:183-198 takes newest-by-mtime and parses that file ONLY")
    print("=" * 100)
    for sess, slug in SESSIONS.items():
        d = os.path.join(TR, slug)
        if not os.path.isdir(d):
            continue
        files = glob.glob(os.path.join(d, "*.jsonl"))
        if not files:
            continue
        newest = max(files, key=os.path.getmtime)
        # trailhead per file vs across all files
        def newest_kyle(paths):
            best = None
            for p in paths:
                try:
                    fh = io.open(p, encoding="utf-8", errors="replace")
                except Exception:
                    continue
                with fh:
                    for line in fh:
                        if '"user"' not in line:
                            continue
                        try:
                            ev = json.loads(line)
                        except Exception:
                            continue
                        if ev.get("isSidechain"):
                            continue
                        ok, text = shipped_admits(ev)
                        if not ok:
                            continue
                        if SUMMARY_PREAMBLE in text:
                            continue
                        is_kyle, _ = truth_is_kyle(ev, text)
                        if not is_kyle:
                            continue
                        ts = ev.get("timestamp")
                        if ts and (best is None or ts > best[0]):
                            best = (ts, text.replace("\n", " ")[:110], os.path.basename(p))
            return best
        one = newest_kyle([newest])
        allf = newest_kyle(files)
        print(f"\n{sess}   ({len(files)} transcript files)")
        print(f"  newest file          : {os.path.basename(newest)}")
        print(f"  trailhead, ONE file  : {one[0] if one else 'NONE FOUND -> would report unrecoverable'}")
        if one:
            print(f"                         \"{one[1]}\"")
        print(f"  trailhead, ALL files : {allf[0] if allf else 'none'}")
        if allf:
            print(f"                         \"{allf[1]}\"   [in {allf[2]}]")
        if allf and (not one or one[0] != allf[0]):
            print("  >>> DIVERGENCE: the one-file read MISSES the real trailhead.")


if __name__ == "__main__":
    sys.exit(main())
