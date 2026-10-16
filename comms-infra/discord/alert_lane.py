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
import re

LANE_DIR = "/srv/alert-lane"                # cwd of the lane invoke: its CLAUDE.md, never Langston's
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


def build_prompt(batch):
    """batch: [(alert_id, content)]. The instructions live in the lane's own CLAUDE.md; this is the data."""
    lines = ["System alerts to triage (%d). For EACH alert id below, end with exactly one [[ALERT ...]] line, "
             "and add one [[ESCALATE ...]] line when your rules say Langston must see it." % len(batch), ""]
    for n, (aid, content) in enumerate(batch, 1):
        lines.append("=== ALERT %d - id %s ===" % (n, aid))
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
