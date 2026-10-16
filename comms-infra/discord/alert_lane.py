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
# Every tool the invoking account's settings allow (/home/langston/.claude/settings.json, measured 2026-10-16), all
# DENIED for the lane: it reads nothing and runs nothing; the bridge supplies the live rows and the precedent.
LANE_DENIED_TOOLS = ("Bash", "Read", "Write", "Edit", "Glob", "Grep", "WebSearch", "WebFetch", "Agent", "TodoWrite",
                     "Skill", "NotebookEdit")

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
#   3. NEVER CONTRADICT his EFFECTIVE assignment (r2): the newest owner wins when it is a TRANSITION (no other owner
#      marked at or after the newest owner's first marker - Kyle himself moves ownership); an interleave goes to him;
#      the action names the superseded owner, so a wrong supersession is catchable on read;
#   4. KYLE IS NEVER AUTO-ROUTED (r2): the lane may not put work in front of Kyle - an owner of Kyle, chosen or
#      inherited, goes to Langston;
#   5. NEVER EXTEND a decision to an unseen symbol - no precedent means the rulebook routes it AND says so;
#   6. a UNANIMITY GUARD: one owner for >= UNANIMITY_N alerts of one template in a batch, on a template whose EFFECTIVE
#      owners differ across symbols (or interleave), is itself the alarm signature - one sample goes to him.
# Honest limit (his): no alert field reproduces his CC-C/Kyle split, so this REPLAYS his decisions per symbol without
# justifying them; the authoritative owner of an alert class is the plan row / GOVERNANCE_EXCEPTIONS, and reading it is
# `B-ALERT-LANE-LEDGER-OWNER` (CC-B, after this batch) - this marker-cache rule is the cheap interim.
# ⛔ THE LANE CANNOT ACK (r2): it runs with every tool DISALLOWED; the bridge reads each alert's live row and passes it
#   in, so the no-ack invariant is structural, not an instruction.
PRECEDENT_DAYS = 7
UNANIMITY_N = 10
_SYM = re.compile(r"\b[A-Z0-9][A-Z0-9.\-]{0,11}/(?:USD|USDT|USDC|EUR|XBT|BTC)\b")
_BOLD = re.compile(r"^\*\*(.+?)\*\*\s*$", re.M)
# r2 BLOCKER-2 (Langston): the dispatcher's re-surface banner prefixes the SAME alert's title, so without stripping it
#   one alert id carried two templates and the later one overwrote the first (326 of 1,661 marked ids).
_RESURFACE = re.compile(r"^\W*RE-SURFACE\s*#\d+\s*[—-]\s*STILL UNRESOLVED:\s*", re.I)


def alert_key(content):
    """(template, symbol) from the alert's TITLE - its first bold line that is not the `SYSTEM ALERT` banner, with any
    `RE-SURFACE #<N> — STILL UNRESOLVED:` prefix removed. The symbol is the first `XXX/USD`-shaped token in the title
    (None when the title names none); the template is the title with that symbol -> <SYM> and digits -> <N>."""
    for m in _BOLD.finditer(content or ""):
        title = _RESURFACE.sub("", m.group(1).strip())
        if title.upper().startswith("SYSTEM ALERT"):
            continue
        sm = _SYM.search(title)
        sym = sm.group(0) if sm else None
        tmpl = _SYM.sub("<SYM>", title) if sym else title
        return re.sub(r"\d+", "<N>", tmpl), sym
    return None


def langston_precedent(inbox_path, now_iso, days=PRECEDENT_DAYS, until_iso=None, conflicts=None):
    """{(template, symbol): [(ts, owner), ...] oldest first} from Langston's OWN markers in the last `days` days, joined
    to the alert each marker names (its inbound post gives the key). Lane posts (`lane: "alert"`) and every other kind
    are ignored. `until_iso` (a replay's cut) ignores markers at or after it. An id whose posts still yield two keys
    after the re-surface strip is appended to `conflicts` (when given) and keeps its FIRST key - never overwritten
    silently. An unreadable inbox returns {} - the caller then treats every alert as having no precedent."""
    cutoff = _iso_minus_days(now_iso, days)
    keys, marks = {}, []
    try:
        with open(inbox_path, "rb") as fh:
            for raw in fh:
                # r2 BLOCKER-1 (Langston): the old `b"ALERT" not in raw` prefilter dropped 378 of 2,634 inbound alert
                #   rows (their text says "Alert", not "ALERT"). Both discriminators below are exact-case stable.
                if b"[[ALERT" not in raw and b"langston_alert_inbound" not in raw:
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
                        if aid in keys and keys[aid] != k:
                            if conflicts is not None:
                                conflicts.append((aid, keys[aid], k))
                        else:
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
        out[k].sort()
    return out


def _iso_minus_days(now_iso, days):
    import datetime
    t = datetime.datetime.fromisoformat(now_iso[:19])
    return (t - datetime.timedelta(days=days)).isoformat()[:19]


def effective_owner(rows):
    """(owner, superseded, ok) for one key's [(ts, owner)] oldest first - Langston's r2 rule (1):
    NEWEST WINS when it is a TRANSITION, i.e. no other owner has a marker at or after the newest owner's FIRST marker.
    Otherwise (an interleave - he flip-flopped) ok=False. `superseded` is the owner just before the newest, or None.
    ⚠️ Honest limit (his): with two owners every split is trivially a transition, so the guard only bites at n>=3."""
    if not rows:
        return None, None, True
    newest = rows[-1][1]
    first_new = min(ts for ts, o in rows if o == newest)
    if any(o != newest and ts >= first_new for ts, o in rows):
        return newest, None, False
    prior = [o for ts, o in rows if ts < first_new]
    return newest, (prior[-1] if prior else None), True


def precedent_line(key, prec):
    if not key:
        return "LANGSTON PRECEDENT: none (no title could be read)"
    rows = prec.get(key)
    if not rows:
        return "LANGSTON PRECEDENT: none for %s - route by your rules; do not guess his intent" % (key[1] or key[0])
    owner, sup, ok = effective_owner(rows)
    if not ok:
        return ("LANGSTON PRECEDENT for %s: he has gone back and forth between owners - ESCALATE it to him"
                % (key[1] or key[0]))
    return ("LANGSTON PRECEDENT for %s: %s since %s%s. Route to THAT owner; if you disagree, ESCALATE - never "
            "contradict him." % (key[1] or key[0], owner, [t for t, o in rows if o == owner][0][:16],
                                 (" (superseding %s)" % sup) if sup else ""))


def apply_precedent(routed, escalate, keys, prec):
    """Enforce Langston's ruling on the lane's VALIDATED routing. Returns (routed, escalate, notes); never drops an
    alert: whatever leaves `routed` lands in `escalate` with its reason."""
    routed, escalate, notes = dict(routed), dict(escalate), []
    for aid in list(routed):
        owner, action = routed[aid]
        key = keys.get(aid)
        rows = prec.get(key) if key else None
        if owner == "Kyle":
            # r2 (1b): routing to Kyle is a judgement about THIS instance, never a class property - the lane may not put
            # work in front of him; Langston decides
            del routed[aid]
            escalate[aid] = "the lane would route this to Kyle - only Langston decides that Kyle must see an instance"
            continue
        if rows:
            eff, sup, ok = effective_owner(rows)
            name = key[1] or key[0]
            if not ok:
                del routed[aid]
                escalate[aid] = ("Langston has gone back and forth on %s within %d days - the lane may not choose"
                                 % (name, PRECEDENT_DAYS))
            elif eff == "Kyle":
                del routed[aid]
                escalate[aid] = ("Langston's last routing of %s was to Kyle - the lane may not route to Kyle; he "
                                 "decides whether this instance needs Kyle" % name)
            elif owner != eff:
                del routed[aid]
                escalate[aid] = ("the lane chose %s, contradicting Langston's assignment of %s to %s"
                                 % (owner, name, eff))
            else:
                since = [t for t, o in rows if o == eff][0][:10]
                tag = " (Langston precedent %s%s)" % (since, (", superseding %s" % sup) if sup else "")
                routed[aid] = (owner, (action + tag).strip())
        else:
            routed[aid] = (owner, (action + " (no Langston precedent)").strip())
    # unanimity guard - r2 BLOCKER-3: a template counts as SPLIT only if its keys' EFFECTIVE owners differ, or one of its
    #   keys is interleaved; an owner he legitimately moved is a transition, not a split, or the guard fires forever
    by_tmpl = {}
    for aid, (owner, _a) in routed.items():
        if keys.get(aid):
            by_tmpl.setdefault((keys[aid][0], owner), []).append(aid)
    for (tmpl, owner), aids in by_tmpl.items():
        if len(aids) < UNANIMITY_N:
            continue
        effs, inter = set(), False
        for (t, _s), rows in prec.items():
            if t != tmpl:
                continue
            e_, _sp, ok = effective_owner(rows)
            effs.add(e_)
            inter = inter or not ok
        if len(effs) > 1 or inter:
            sample = sorted(aids)[0]
            del routed[sample]
            escalate[sample] = ("unanimity alarm: the lane sent %d alerts of \"%s\" to %s in one batch, a class your "
                                "current routing splits across %s - sample for your check"
                                % (len(aids), tmpl[:80], owner, "/".join(sorted(effs)) or "interleaved owners"))
            notes.append("unanimity guard fired on %r (%d -> %s)" % (tmpl[:60], len(aids), owner))
    return routed, escalate, notes


def parse_live_rows(text, ids):
    """{id: last row dict} from `grep` output of the staging alert file - the LAST row for an id is its state."""
    want, out = set(i.lower() for i in ids), {}
    for line in (text or "").splitlines():
        try:
            d = json.loads(line)
        except ValueError:
            continue
        i = str(d.get("id") or "").lower()
        if i in want:
            out[i] = d
    return out


def live_row_line(row):
    """One line telling the lane the alert's live state - the bridge reads it, so the lane needs NO tools (r2 record:
    a stated no-ack invariant plus a doc test was a rule where an instrument is cheap; the lane now cannot act)."""
    if row is None:
        return "LIVE ROW: could not be read - ESCALATE this id"
    return "LIVE ROW: state=%s acknowledged_at=%s resolved_at=%s severity=%s" % (
        row.get("state"), row.get("acknowledged_at"), row.get("resolved_at"), row.get("severity"))


def build_prompt(batch, keys=None, prec=None, rows=None):
    """batch: [(alert_id, content)]. The instructions live in the lane's own CLAUDE.md; this is the data: each alert's
    LIVE ROW (read by the bridge) and LANGSTON PRECEDENT line (the code enforces it after the answer as well)."""
    lines = ["System alerts to triage (%d). For EACH alert id below, end with exactly one [[ALERT ...]] line, "
             "and add one [[ESCALATE ...]] line when your rules say Langston must see it." % len(batch), ""]
    for n, (aid, content) in enumerate(batch, 1):
        lines.append("=== ALERT %d - id %s ===" % (n, aid))
        if rows is not None:
            lines.append(live_row_line(rows.get(aid)))
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
