"""alert_lane.py — the alert lane's pure logic (B-LANGSTON-RELIEF OBJ-2; Kyle 2026-10-08, built 2026-10-16).

★ WHY. 254 of 407 Langston invocations in the 48 h to 2026-10-08 were system-alert triage, and on
  2026-10-16 an alert burst put ~117 tasks ahead of Kyle's own messages. Kyle's design: alerts stop
  waking Langston. A separate triage agent on a cheaper model, with its OWN instruction file and
  working directory (so Langston's model never changes and his memory is never loaded for it), reads
  each alert, emits the same `[[ALERT id=.. owner=..]]` routing marker the session wake filters
  already trust in Langston's posts, and ESCALATES to Langston only by the rules in its instruction
  file. Anything the lane cannot account for goes to Langston: an alert is never silently dropped.

This module is the testable part: batching, the prompt, and reading the lane's answer.
The bridge (discord-langston-bridge.py) owns the thread, the invocation and the posting.
"""
import json
import os
import re
import time

LANE_DIR = "/srv/alert-lane"
SPOOL_DIR = "/home/langston/.alert-lane/spool"   # durable alert work (Coltrane send-back r2, 2026-10-16)                # cwd of the lane invoke: its CLAUDE.md, never Langston's
LANE_MODEL = "claude-sonnet-5-5"            # cheaper than Langston's; confirmed by a live one-off invoke at install
LANE_TIMEOUT_S = 600
BATCH_SETTLE_S = 20                         # after the first alert, wait this long for the rest of a burst
BATCH_MAX = 15                              # alerts per invocation
OWNERS = ("CC-A", "CC-B", "CC-C", "CC-INFRA", "Kyle")

UUID = r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
_LABELLED_ID = re.compile(r"Alert ID:_?\s*`?(" + UUID + r")`?", re.I)
_ANY_ID = re.compile(r"\b(" + UUID + r")\b")
MARKER_RE = re.compile(r"\[\[ALERT\s+id=(" + UUID + r")\s+owner=([A-Za-z-]+)\s+action=\"([^\"\n]*)\"\]\]")
ESCALATE_RE = re.compile(r"\[\[ESCALATE\s+id=(" + UUID + r")\s+reason=\"([^\"\n]*)\"\]\]")


def alert_id_of(content):
    """The alert's own id. The dispatcher ends every alert with `_Alert ID:_ \\`<uuid>\\``; a body can also
    quote OTHER alerts' ids (63 of 395 measured carried more than one uuid), so the labelled form wins
    and a bare uuid is used only when the body holds exactly one. Otherwise None -> escalated."""
    m = _LABELLED_ID.search(content or "")
    if m:
        return m.group(1).lower()
    ids = set(i.lower() for i in _ANY_ID.findall(content or ""))
    return ids.pop() if len(ids) == 1 else None


_ANY_MARKER = re.compile(r"\[\[\s*(ALERT|ESCALATE)\b[^\n]*?\]\]", re.I)
_MARKER_OPEN = re.compile(r"\[\[(?=\s*(ALERT|ESCALATE)\b)", re.I)


def publishable(answer, routed, escalate):
    """The text the bridge posts and mirrors (Coltrane send-back 1, 2026-10-16). The wake filters record EVERY
    `[[ALERT ...]]` they see and keep the last, so the lane's raw markers are never published: every marker
    and every unterminated `[[ALERT`/`[[ESCALATE` opener is removed from its prose, and the ONLY markers in
    the post are rebuilt from the VALIDATED `routed` result. Escalations are listed in plain text."""
    prose = _ANY_MARKER.sub("", answer or "")
    prose = _MARKER_OPEN.sub("[", prose)
    prose = re.sub(r"\n{3,}", "\n\n", prose).strip()
    out = [prose] if prose else []
    for aid, reason in escalate.items():
        out.append("(handed to Langston: %s - %s)" % (aid, reason))
    for aid, (owner, action) in routed.items():
        clean = action.replace('"', "'").replace("]]", "] ]").replace("\n", " ")
        out.append('[[ALERT id=%s owner=%s action="%s"]]' % (aid, owner, clean))
    return "\n".join(out)


# ---------------- durable alert work (Coltrane send-back r2) ----------------
# The bridge's queues are in memory and a restart recovers only PEOPLE's messages (OBJ-1), while some alert
# classes are never re-surfaced by the dispatcher (info-severity governance/breakage). So every alert is
# spooled to disk BEFORE it is queued and the file is removed only when its work is durably done:
#   pending   - waiting for the lane
#   posting   - the lane is publishing routing for it (recorded => done; not recorded => triage again)
#   escalated - handed to Langston; done when the worker has processed his task for it
# On start the bridge re-queues whatever is left, after checking the inbox so nothing is done twice.

def spool_path(spool_dir, message_id):
    return os.path.join(spool_dir, "%d.json" % int(message_id))


def spool_write(spool_dir, task, state, **extra):
    """Atomically record (or move) one alert's state: temp file, fsync, rename, fsync the directory."""
    os.makedirs(spool_dir, mode=0o700, exist_ok=True)
    path = spool_path(spool_dir, task["message_id"])
    rec = dict(extra, state=state, ts=time.time(), task=task)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, default=str))
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)
    dfd = os.open(spool_dir, os.O_RDONLY)
    try:
        os.fsync(dfd)
    finally:
        os.close(dfd)


def spool_remove(spool_dir, message_id):
    try:
        os.remove(spool_path(spool_dir, message_id))
    except FileNotFoundError:
        pass


def spool_load(spool_dir):
    """(records oldest message first, problems). An unreadable file is renamed *.bad and reported, never dropped."""
    recs, problems = [], []
    if not os.path.isdir(spool_dir):
        return recs, problems
    for name in sorted(os.listdir(spool_dir)):
        if not name.endswith(".json"):
            continue
        path = os.path.join(spool_dir, name)
        try:
            with open(path, encoding="utf-8") as fh:
                rec = json.load(fh)
            int(rec["task"]["message_id"])
            recs.append(rec)
        except Exception as e:
            problems.append("unreadable spool file %s (%s: %s) - renamed .bad" % (name, type(e).__name__, e))
            try:
                os.replace(path, path + ".bad")
            except OSError:
                pass
    recs.sort(key=lambda r: int(r["task"]["message_id"]))
    return recs, problems


def inbox_evidence(inbox_path, tail_bytes=8_000_000):
    """(alert ids the lane has RECORDED routing for, message ids Langston has REPLIED to) from the tail of the
    inbox - the two durable facts that mean a spooled alert's work is already done."""
    routed, replied = set(), set()
    try:
        size = os.path.getsize(inbox_path)
        with open(inbox_path, "rb") as fh:
            if size > tail_bytes:
                fh.seek(size - tail_bytes)
                fh.readline()
            for raw in fh:
                try:
                    e = json.loads(raw)
                except ValueError:
                    continue
                if e.get("kind") != "langston_outbound":
                    continue
                if e.get("lane") == "alert":
                    routed.update(a.lower() for a, _o, _x in MARKER_RE.findall(e.get("text") or ""))
                elif e.get("reply_to") is not None:
                    try:
                        replied.add(int(e["reply_to"]))
                    except (TypeError, ValueError):
                        pass                      # e.g. a self-advance id, never an alert's message id
    except FileNotFoundError:
        pass
    return routed, replied


# ---- LANGSTON PRECEDENT (Langston's ruling, 2026-10-16 ~13:55Z, after the lane's first live burst) ----------------
# The lane's first burst routed 60 "VTS exit decisions unavailable … for <SYM>" alerts to CC-B by its static rulebook,
# against Langston's own recent routing of that class. His ruling, enforced HERE in code, not only asked of the model:
#   1. key on (title template, SYMBOL) - per symbol his routing is clean (0 of 52 symbols split on 10-12); per template
#      it is mixed on every day the class has fired, so a template key would escalate the whole class forever;
#   2. precedent is LANGSTON-SOURCED ONLY - a lane marker (inbox `lane: "alert"`) is never precedent, or the lane
#      cites its own errors;
#   3. NEVER CONTRADICT a Langston assignment (not "follow the newest"): a contradiction, or a symbol he has routed to
#      two owners in the window, goes to him;
#   4. NEVER EXTEND a decision to an unseen symbol - no precedent means the rulebook routes it AND says so;
#   5. a UNANIMITY GUARD: one owner for >= UNANIMITY_N alerts of one template in a batch, on a template his routing has
#      split across owners, is itself the alarm signature - one sample goes to him.
# Honest limit (his): no alert field reproduces his CC-C/Kyle split, so this REPLAYS his decisions per symbol without
# justifying them; on 2026-10-16's burst it would have caught 14 of 60 (19 had precedent; 33 had none).
# ⛔ STATED INVARIANT: the lane never acks or resolves an alert - it only routes (its CLAUDE.md rule 4; tested).
PRECEDENT_DAYS = 7
UNANIMITY_N = 10
_SYM = re.compile(r"\b[A-Z0-9][A-Z0-9.\-]{0,11}/(?:USD|USDT|USDC|EUR|XBT|BTC)\b")
_BOLD = re.compile(r"^\*\*(.+?)\*\*\s*$", re.M)


def alert_key(content):
    """(template, symbol) from the alert's TITLE - its first bold line that is not the `SYSTEM ALERT` banner. The
    symbol is the first `XXX/USD`-shaped token in the title (None when the title names none); the template is the
    title with that symbol -> <SYM> and every digit run -> <N>. No title -> None."""
    for m in _BOLD.finditer(content or ""):
        title = m.group(1).strip()
        if title.upper().startswith("SYSTEM ALERT"):
            continue
        sm = _SYM.search(title)
        sym = sm.group(0) if sm else None
        tmpl = _SYM.sub("<SYM>", title) if sym else title
        return re.sub(r"\d+", "<N>", tmpl), sym
    return None


def langston_precedent(inbox_path, now_iso, days=PRECEDENT_DAYS, until_iso=None):
    """{(template, symbol): [(ts, owner), ...] newest first} from Langston's OWN markers in the last `days` days,
    joined to the alert each marker names (its inbound post gives the key). Lane posts (`lane: "alert"`) and
    every other kind are ignored. An unreadable inbox returns {} - the caller then treats every alert as having no
    precedent and SAYS so, never as agreeing with one. `until_iso` (a replay's cut) ignores markers at or after it."""
    cutoff = _iso_minus_days(now_iso, days)
    keys, marks = {}, []
    try:
        with open(inbox_path, "rb") as fh:
            for raw in fh:
                if b"ALERT" not in raw:
                    continue
                try:
                    e = json.loads(raw)
                except ValueError:
                    continue
                kind, text = e.get("kind"), e.get("text") or ""
                if kind == "langston_alert_inbound":
                    aid = alert_id_of(text)
                    k = alert_key(text)
                    if aid and k:
                        keys[aid] = k
                elif kind == "langston_outbound" and e.get("lane") != "alert":
                    ts = (e.get("ts") or "")[:19]
                    if ts < cutoff or (until_iso and ts >= until_iso[:19]):
                        continue
                    for aid, owner, _a in MARKER_RE.findall(text):
                        if owner in OWNERS:
                            marks.append((ts, aid.lower(), owner))
    except OSError:
        return {}
    out = {}
    for ts, aid, owner in marks:
        k = keys.get(aid)
        if k:
            out.setdefault(k, []).append((ts, owner))
    for k in out:
        out[k].sort(reverse=True)
    return out


def _iso_minus_days(now_iso, days):
    import datetime
    t = datetime.datetime.fromisoformat(now_iso[:19])
    return (t - datetime.timedelta(days=days)).isoformat()[:19]


def precedent_line(key, prec):
    if not key:
        return "LANGSTON PRECEDENT: none (no title could be read)"
    rows = prec.get(key)
    if not rows:
        return "LANGSTON PRECEDENT: none for %s - route by your rules; do not guess his intent" % (key[1] or key[0])
    owners = sorted(set(o for _t, o in rows))
    return ("LANGSTON PRECEDENT for %s: %s (newest %s %s). Route to THAT owner; if you disagree, ESCALATE - never "
            "contradict him." % (key[1] or key[0], "/".join(owners), rows[0][1], rows[0][0][:16]))


def apply_precedent(routed, escalate, keys, prec):
    """Enforce the ruling on the lane's VALIDATED routing. Returns (routed, escalate, notes); never drops an alert:
    whatever leaves `routed` lands in `escalate` with its reason."""
    routed, escalate, notes = dict(routed), dict(escalate), []
    for aid in list(routed):
        owner, action = routed[aid]
        key = keys.get(aid)
        rows = prec.get(key) if key else None
        if rows:
            owners = set(o for _t, o in rows)
            if len(owners) > 1:
                del routed[aid]
                escalate[aid] = ("Langston has routed %s to %s within %d days - the lane may not choose between them"
                                 % (key[1] or key[0], "/".join(sorted(owners)), PRECEDENT_DAYS))
            elif owner != rows[0][1]:
                del routed[aid]
                escalate[aid] = ("the lane chose %s, contradicting Langston's assignment of %s to %s (%s)"
                                 % (owner, key[1] or key[0], rows[0][1], rows[0][0][:16]))
            else:
                routed[aid] = (owner, (action + " (Langston precedent %s)" % rows[0][0][:10]).strip())
        else:
            routed[aid] = (owner, (action + " (no Langston precedent)").strip())
    # unanimity guard: one owner for >= UNANIMITY_N of one template in this batch, on a template he has split
    by_tmpl = {}
    for aid, (owner, _a) in routed.items():
        if keys.get(aid):
            by_tmpl.setdefault((keys[aid][0], owner), []).append(aid)
    for (tmpl, owner), aids in by_tmpl.items():
        if len(aids) < UNANIMITY_N:
            continue
        split = set(o for (t, _s), rows in prec.items() if t == tmpl for _ts, o in rows)
        if len(split) > 1:
            sample = sorted(aids)[0]
            del routed[sample]
            escalate[sample] = ("unanimity alarm: the lane sent %d alerts of \"%s\" to %s in one batch, a class you "
                                "have split across %s - sample for your check" % (len(aids), tmpl[:80], owner,
                                                                                  "/".join(sorted(split))))
            notes.append("unanimity guard fired on %r (%d -> %s)" % (tmpl[:60], len(aids), owner))
    return routed, escalate, notes


def build_prompt(batch, keys=None, prec=None):
    """batch: [(alert_id, content)]. The instructions live in the lane's own CLAUDE.md; this is the data, with each
    alert's LANGSTON PRECEDENT line (the code enforces it after the answer as well)."""
    lines = ["System alerts to triage (%d). For EACH alert id below, end with exactly one [[ALERT ...]] line, "
             "and add one [[ESCALATE ...]] line when your rules say Langston must see it." % len(batch), ""]
    for n, (aid, content) in enumerate(batch, 1):
        lines.append("=== ALERT %d - id %s ===" % (n, aid))
        if prec is not None:
            lines.append(precedent_line((keys or {}).get(aid), prec))
        lines.append((content or "").strip())
        lines.append("")
    return "\n".join(lines)


def read_answer(answer, batch_ids):
    """Split the lane's answer into (routed, escalate, problems).
    routed:   {alert_id: (owner, action)} for ids in this batch with ONE valid marker.
    escalate: {alert_id: reason} - every id the lane escalated, PLUS every id with no valid marker, a
              marker naming an unknown owner, or conflicting markers. An alert is never left unaccounted.
    problems: human-readable notes for the bridge log."""
    want = set(batch_ids)
    found, problems = {}, []
    for aid, owner, action in MARKER_RE.findall(answer or ""):
        aid = aid.lower()
        if aid not in want:
            problems.append("marker for %s, which is not in this batch - ignored" % aid)
            continue
        if owner not in OWNERS:
            problems.append("marker for %s names unknown owner %r" % (aid, owner))
            found.setdefault(aid, []).append(None)
            continue
        found.setdefault(aid, []).append((owner, action))
    escalate = {}
    for aid, reason in ESCALATE_RE.findall(answer or ""):
        aid = aid.lower()
        if aid in want:
            escalate[aid] = reason
    routed = {}
    for aid in batch_ids:
        marks = found.get(aid, [])
        good = [m for m in marks if m is not None]
        if len(good) == 1 and len(marks) == 1:
            routed[aid] = good[0]
        elif not marks:
            escalate.setdefault(aid, "the alert lane gave no routing marker for it")
        else:
            escalate.setdefault(aid, "the alert lane's routing marker for it was invalid or conflicting")
    return routed, escalate, problems
