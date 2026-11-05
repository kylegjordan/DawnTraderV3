#!/usr/bin/env python3
"""Audit the crew-status turn classifier against the real transcript corpus.

WHY THIS FILE IS COMMITTED (Langston, Step-2): "A number that only exists as a table in a scope
doc is an assertion; the same number produced by a committed script is a measurement anyone with
the corpus -- including Kyle -- can re-derive." He cannot reach the corpus (it lives on Kyle's
laptop, not Helsinki) and correctly refuses to rule on numbers he cannot re-derive.

r2 REVIEW CORRECTIONS FOLDED IN:
  * R2-2: this script used to `sys.exit(None)` -- always 0. It now EXITS NON-ZERO on any
    contamination or divergence, so it can gate something mechanically instead of being
    human-read output that always looks like success.
  * R2-3: Section B did NOT reproduce the shipped reader. The shipped reader BREAKS and drops
    the whole session on a summariser transcript (crew-status.py:232-235); the audit merely
    skipped the record, making the audit strictly MORE capable and biasing the result toward
    "does not reproduce". Section B now runs BOTH and declares the difference.
  * B3 coverage: the origin.kind distribution and the scheduled-task observations were quoted
    in the scope but produced by throwaway scripts. They are Sections C and D now, so the
    scope's claim that every number comes from this file is true rather than aspirational.

WHAT IT MEASURES, and why the first version of this measurement was wrong.

Scope r1 claimed "~7 of every 8 user turns is a machine" and used it to argue the classifier
needed rebuilding. Langston caught that this is a RAW-RECORD ratio, not the population the
SHIPPED filter admits -- right object, wrong denominator. The shipped predicate already excludes
any turn whose extracted text begins with "<", so most machine turns were never admitted.

The number that measures the defect is: OF THE RECORDS THE SHIPPED PREDICATE ADMITS, how many
are not Kyle, and how did each evade. That is Section A.

Run:  python crew-status-audit.py          exit 0 = clean, 1 = contamination/divergence found
"""
import io, json, os, glob, sys
from collections import Counter

TR = os.path.expanduser(r"~/.claude/projects")
SESSIONS = {"OLD Claude": "C--DawnTraderV3-old", "NEW Claude": "C--DawnTraderV3-new",
            "ANALYST Claude": "C--DawnTraderV3-analyst", "Infra Claude": "G--My-Drive"}
SUMMARY_PREAMBLE = "You are given EVIDENCE about four AI sessions"

# ── the shipped behaviour, reproduced rather than imported ───────────────────────────────────
# Deliberate: this must measure what SHIPPED does even if the module changes underneath, and a
# divergence between the two is itself a finding. Anchored by CONTENT, not line number -- the
# r2 review caught line citations that had rotted when a comment shifted the file (the #655
# shape: the artifact moved under the citation). See verify_anchors().
SHIPPED_PREDICATE = 'if role == "user" and text and not text.lstrip().startswith("<"):'
SHIPPED_COMPACT_GUARD = 'if ev.get("isCompactSummary") or ev.get("isMeta"):'
SHIPPED_MODEL_LINE = "/usr/bin/claude -p --model haiku"
CREW_STATUS = os.path.join(os.path.dirname(os.path.abspath(__file__)), "crew-status.py")


def verify_anchors():
    """Prove the shipped file still contains what this audit claims to reproduce, and print the
    CURRENT line numbers so any citation taken from this run is correct at this sha."""
    try:
        src = io.open(CREW_STATUS, encoding="utf-8", errors="replace").read().splitlines()
    except Exception as e:
        print(f"  !! cannot read crew-status.py: {e}")
        return False
    ok = True
    for label, anchor in (("shipped predicate", SHIPPED_PREDICATE),
                          ("compaction guard", SHIPPED_COMPACT_GUARD),
                          ("model line", SHIPPED_MODEL_LINE)):
        hits = [i + 1 for i, l in enumerate(src) if anchor in l]
        if len(hits) == 1:
            print(f"  {label:<20} :{hits[0]}")
        else:
            print(f"  {label:<20} !! found {len(hits)} times -- audit may not reproduce shipped")
            ok = False
    return ok


def extract_text(msg):
    """EXACTLY the shipped extraction (concatenates only type=='text' blocks)."""
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return " ".join(b.get("text", "") for b in c
                        if isinstance(b, dict) and b.get("type") == "text")
    return ""


def shipped_admits(ev):
    """The shipped predicate INCLUDING the compaction guard that now precedes it."""
    if ev.get("isCompactSummary") or ev.get("isMeta"):
        return False, ""
    msg = ev.get("message") or {}
    if msg.get("role") != "user":
        return False, ""
    text = extract_text(msg)
    if not text or text.lstrip().startswith("<"):
        return False, text
    return True, text


def prefix_admits(ev):
    """The predicate as it stood BEFORE the compaction fix -- kept so Section A can still
    demonstrate the contamination the fix removed. Without this the audit can only ever report
    zero, which is the tautology Langston flagged as R2-1."""
    msg = ev.get("message") or {}
    if msg.get("role") != "user":
        return False, ""
    text = extract_text(msg)
    if not text or text.lstrip().startswith("<"):
        return False, text
    return True, text


def truth_is_kyle(ev, text):
    """Ground truth, deliberately NOT the shipped rule. (is_kyle, reason_if_not).

    NOTE the honest limit, per Langston R2-1: records with no `origin` fall through to True, so
    this cannot detect contamination in the fallback population. Section A is therefore a
    REGRESSION GUARD against re-admission of the known classes, not a proof of purity."""
    if ev.get("isCompactSummary"):
        return False, "compact-summary"
    if ev.get("isMeta"):
        return False, "isMeta"
    org = ev.get("origin")
    kind = org.get("kind") if isinstance(org, dict) else None
    s = text.lstrip()[:400]
    if "<scheduled-task" in s:
        return False, f"scheduled-task (origin.kind={kind})"
    if "<task-notification" in s:
        return False, f"task-notification (origin.kind={kind})"
    if kind == "task-notification":
        return False, "origin.kind=task-notification"
    return True, ""


def iter_records(slug):
    d = os.path.join(TR, slug)
    if not os.path.isdir(d):
        return
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
                yield f, ev


def main():
    failures = []

    print("=" * 100)
    print("ANCHORS -- current line numbers in the shipped file (cite THESE, not older ones)")
    print("=" * 100)
    if not verify_anchors():
        failures.append("shipped anchors did not resolve uniquely")

    # ── A ───────────────────────────────────────────────────────────────────────────────────
    print()
    print("=" * 100)
    print("SECTION A -- what the predicate ADMITS that is not Kyle")
    print("  regression guard (R2-1): after the compaction fix SHIPPED must be 0; the PRE-FIX")
    print("  column is retained so the guard has a demonstrable failing case and is not a")
    print("  tautology that cannot fail.")
    print("=" * 100)
    print(f"  {'session':<16}{'admitted':>10}{'NOT-Kyle':>10}   |  {'pre-fix adm':>12}{'pre-fix bad':>12}")
    print("  " + "-" * 96)
    t_adm = t_bad = p_adm = p_bad = 0
    reasons, pre_reasons = Counter(), Counter()
    for sess, slug in SESSIONS.items():
        a = b = pa = pb = 0
        for _f, ev in iter_records(slug):
            ok, text = shipped_admits(ev)
            if ok:
                a += 1
                is_k, why = truth_is_kyle(ev, text)
                if not is_k:
                    b += 1; reasons[why] += 1
            pok, ptext = prefix_admits(ev)
            if pok:
                pa += 1
                is_k, why = truth_is_kyle(ev, ptext)
                if not is_k:
                    pb += 1; pre_reasons[why] += 1
        t_adm += a; t_bad += b; p_adm += pa; p_bad += pb
        print(f"  {sess:<16}{a:>10}{b:>10}   |  {pa:>12}{pb:>12}")
    print("  " + "-" * 96)
    pct = (100.0 * p_bad / p_adm) if p_adm else 0
    print(f"  {'TOTAL':<16}{t_adm:>10}{t_bad:>10}   |  {p_adm:>12}{p_bad:>12}  ({pct:.1f}% pre-fix)")
    if pre_reasons:
        print("\n  pre-fix contamination, by how it evaded:")
        for r, c in pre_reasons.most_common():
            print(f"    {c:>5}  {r}")
    if reasons:
        print("\n  ★ STILL ADMITTED POST-FIX:")
        for r, c in reasons.most_common():
            print(f"    {c:>5}  {r}")
        failures.append(f"{t_bad} non-Kyle records still admitted")
    else:
        print("\n  post-fix: 0 admitted records fail the truth test (regression guard clean)")
    if p_bad == 0:
        failures.append("pre-fix column is 0 -- the guard has no demonstrable failing case")

    # ── C: origin.kind distribution (was quoted in scope, produced nowhere) ──────────────────
    print()
    print("=" * 100)
    print("SECTION C -- origin.kind distribution")
    print("  object: type=='user', string content, non-sidechain. This is a DIFFERENT and")
    print("  narrower population than Section A's, which is why the two do not reconcile by")
    print("  subtraction: A admits records whose content is a BLOCK LIST containing text.")
    print("=" * 100)
    kinds = Counter(); strpop = 0
    for sess, slug in SESSIONS.items():
        for _f, ev in iter_records(slug):
            msg = ev.get("message") or {}
            if msg.get("role") != "user" or not isinstance(msg.get("content"), str):
                continue
            if not msg["content"].strip():
                continue
            strpop += 1
            org = ev.get("origin")
            kinds[repr(org.get("kind") if isinstance(org, dict) else None)] += 1
    print(f"  population (string-content user records): {strpop}")
    for k, v in kinds.most_common():
        print(f"    {k:<26} {v:>6}   ({100.0*v/max(strpop,1):.1f}%)")

    # ── D: the scheduled-task observations (§10's empirical basis) ───────────────────────────
    print()
    print("=" * 100)
    print("SECTION D -- scheduler submissions and how they are tagged")
    print("  This is the empirical basis for the scope's claim that origin.kind cannot")
    print("  discriminate the SCHEDULER from Kyle. Langston: put these in the script or the")
    print("  claim rests on a number nobody can re-derive.")
    print("=" * 100)
    sched = Counter(); notif = Counter()
    for sess, slug in SESSIONS.items():
        for _f, ev in iter_records(slug):
            msg = ev.get("message") or {}
            t = extract_text(msg).lstrip()[:400]
            org = ev.get("origin")
            kind = org.get("kind") if isinstance(org, dict) else None
            if "<scheduled-task" in t:
                sched[repr(kind)] += 1
            elif "<task-notification" in t:
                notif[repr(kind)] += 1
    print("  <scheduled-task> records by origin.kind:")
    for k, v in sched.most_common():
        print(f"    {k:<26} {v}")
    print("  <task-notification> records by origin.kind:")
    for k, v in notif.most_common():
        print(f"    {k:<26} {v}")
    human_sched = sched.get("'human'", 0)
    print(f"\n  ⇒ scheduler submissions tagged as HUMAN: {human_sched}")
    print("    Positive control: task-notification records are tagged distinguishably")
    print(f"    ({dict(notif) or 'NONE FOUND -- control FAILED, treat the above as unreadable'}).")
    if not notif:
        failures.append("Section D positive control failed: no task-notification records found")

    # ── B: trailhead reach, shipped reader vs a more capable one ────────────────────────────
    print()
    print("=" * 100)
    print("SECTION B -- does the one-file read reach the real trailhead?")
    print("  R2-3: the shipped reader DROPS a whole session on a summariser transcript;")
    print("  the audit's variant only skips the record. Both are run so the advantage is")
    print("  declared rather than silently flattering the result.")
    print("=" * 100)

    def trailhead(paths, shipped_semantics):
        best = None
        for p in paths:
            try:
                fh = io.open(p, encoding="utf-8", errors="replace")
            except Exception:
                continue
            dropped = False
            local = None
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
                        if shipped_semantics:
                            dropped = True      # shipped: break, session dropped entirely
                            break
                        continue                # audit variant: merely skip the record
                    is_k, _ = truth_is_kyle(ev, text)
                    if not is_k:
                        continue
                    ts = ev.get("timestamp")
                    if ts and (local is None or ts > local[0]):
                        local = (ts, text.replace("\n", " ")[:100], os.path.basename(p))
            if dropped:
                return None
            if local and (best is None or local[0] > best[0]):
                best = local
        return best

    for sess, slug in SESSIONS.items():
        d = os.path.join(TR, slug)
        files = glob.glob(os.path.join(d, "*.jsonl"))
        if not files:
            continue
        newest = max(files, key=os.path.getmtime)
        one_shipped = trailhead([newest], True)
        one_audit = trailhead([newest], False)
        allf = trailhead(files, False)
        print(f"\n{sess}   ({len(files)} files)  newest={os.path.basename(newest)}")
        print(f"  one file, SHIPPED semantics : {one_shipped[0] if one_shipped else 'NONE (session would be dropped)'}")
        print(f"  one file, audit variant     : {one_audit[0] if one_audit else 'none'}")
        print(f"  all files                   : {allf[0] if allf else 'none'}")
        if allf:
            print(f'     "{allf[1]}"  [{allf[2]}]')
        if allf and (not one_shipped or one_shipped[0] != allf[0]):
            print("  >>> DIVERGENCE: the shipped one-file read MISSES the real trailhead.")
            failures.append(f"{sess}: shipped one-file read misses the trailhead")

    print()
    print("=" * 100)
    if failures:
        print("RESULT: FAIL")
        for f in failures:
            print("  - " + f)
        return 1
    print("RESULT: PASS -- no contamination admitted, no trailhead divergence")
    return 0


if __name__ == "__main__":
    sys.exit(main())
