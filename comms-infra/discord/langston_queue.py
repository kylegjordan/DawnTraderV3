#!/usr/bin/env python3
"""
langston_queue.py — B-LANGSTON-QUEUE: bridge-tracked review queue + self-advance safety logic.

PURE logic only (no IO except the queue-file load/save helpers) so the priority ordering, the
marker parsing, and — critically — the TWO-TIER runaway cap are all unit-testable. Wired into
discord-langston-bridge.py behind an OFF-by-default flag (SELF_ADVANCE_ENABLED).

Why a queue at all: Langston is STATELESS per invoke (fresh `claude -p` each message, no
cross-turn memory), so he cannot hold his own review queue between turns — it MUST live here,
external, and be fed to him each (re-)invoke. Design converged with Langston 2026-06-22, see
Claude Comms and Packages/Scope Files/B_LANGSTON_QUEUE_SCOPE.md §6.

Item: { id, requester, summary, pointer, state, gate_type, blocked_on, added_ts, last_touched_ts }
  state    ∈ ready | blocked | error | done
  gate_type∈ step4-diff | step8-verify | step2 | design-ask   (drives PRIORITY, not FIFO)
  blocked_on = { who: CC-A|CC-B|Kyle, want: "<awaited artifact/commit>" } | None
"""
import json
import re
import time
from pathlib import Path

# Priority order (Langston §6a): a step4-diff blocks a CC's push → it jumps ahead of a
# non-urgent design-ask. Lower number = worked first.
GATE_PRIORITY = {"step4-diff": 0, "step8-verify": 1, "step2": 2, "design-ask": 3}
DEFAULT_GATE = "design-ask"

# ── TWO-TIER HARD CAP (Langston §6b — the safety spine) ───────────────────────────
# Tier 1 — SAME-ITEM guard (the true runaway signature): re-invoking on the SAME id twice
#   without it reaching `done` = the infinite-re-fire bug → HALT immediately.
SAME_ID_CAP = 2
# Tier 2 — DISTINCT advances: this many consecutive self-advances with NO new Kyle/CC post.
#   Real queue depth is rarely >5; 10 = finite headroom. Any Kyle/CC post resets it.
DISTINCT_ADVANCE_CAP = 10

# ── marker: Langston's single machine-parseable LAST line (Langston §6c) ──────────
#   [[QUEUE id=Q17 status=done]]
#   [[QUEUE id=Q17 status=blocked on=CC-B want="staging deploy commit abcd123"]]
#   [[QUEUE id=Q17 status=error reason="gdrive read hung on pointer file"]]
_MARKER_RE = re.compile(
    r"\[\[QUEUE\s+id=(?P<id>\S+)\s+status=(?P<status>done|blocked|error)"
    r"(?:\s+on=(?P<on>\S+))?(?:\s+want=\"(?P<want>[^\"]*)\")?(?:\s+reason=\"(?P<reason>[^\"]*)\")?\s*\]\]",
    re.I,
)


def parse_marker(text):
    """Return the LAST queue-marker dict in text, or None. Last-line wins (Langston emits one)."""
    if not text:
        return None
    matches = list(_MARKER_RE.finditer(text))
    if not matches:
        return None
    m = matches[-1]
    out = {"id": m.group("id"), "status": m.group("status").lower()}
    if m.group("on"):
        out["on"] = m.group("on")
    if m.group("want"):
        out["want"] = m.group("want")
    if m.group("reason"):
        out["reason"] = m.group("reason")
    return out


def new_item(item_id, requester, summary, pointer=None, gate_type=None, now=None):
    now = now if now is not None else time.time()
    gt = gate_type if gate_type in GATE_PRIORITY else DEFAULT_GATE
    return {
        "id": str(item_id), "requester": requester, "summary": (summary or "")[:500],
        "pointer": pointer, "state": "ready", "gate_type": gt,
        "blocked_on": None, "added_ts": now, "last_touched_ts": now,
    }


def infer_gate_type(text):
    """Best-effort gate_type from a request's wording (the requester can override explicitly)."""
    t = (text or "").lower()
    if re.search(r"step[\s-]*4|diff review|code[\s-]*review|pre[\s-]*push", t):
        return "step4-diff"
    if re.search(r"step[\s-]*8|second[\s-]*pass|verify|completion[\s-]*report|step[\s-]*11", t):
        return "step8-verify"
    if re.search(r"step[\s-]*2|pre[\s-]*audit|step[\s-]*1|scope", t):
        return "step2"
    return DEFAULT_GATE


def pick_next_ready(items):
    """The next item to work: state=ready, ordered by gate priority then oldest added_ts. None if none."""
    ready = [i for i in items if i.get("state") == "ready"]
    if not ready:
        return None
    return sorted(ready, key=lambda i: (GATE_PRIORITY.get(i.get("gate_type"), 99), i.get("added_ts", 0)))[0]


def apply_marker(items, marker, now=None):
    """Transition the item named by the marker. Returns (item, action) where action ∈
    done|blocked|error|unknown-id. Pure (mutates the items list in place)."""
    now = now if now is not None else time.time()
    item = next((i for i in items if i.get("id") == marker.get("id")), None)
    if item is None:
        return None, "unknown-id"
    item["last_touched_ts"] = now
    st = marker["status"]
    if st == "done":
        item["state"] = "done"
    elif st == "blocked":
        item["state"] = "blocked"
        item["blocked_on"] = {"who": marker.get("on"), "want": marker.get("want")}
    elif st == "error":
        item["state"] = "error"   # parked + must be flagged to Kyle by the caller; NEVER 'done'
        item["error_reason"] = marker.get("reason")
    return item, st


class CapTracker:
    """The two-tier runaway cap (Langston §6b). Caller asks should_halt() BEFORE each self-advance
    re-invoke; resets on any Kyle/CC inbound. A trip is LOUD — caller posts the pause message,
    NEVER goes silent (silence must always mean *done*, never *stuck*)."""

    def __init__(self):
        self.distinct_advances = 0
        self.last_advanced_id = None
        self.same_id_count = 0

    def reset(self):
        """Call on any Kyle/CC inbound message."""
        self.distinct_advances = 0
        self.last_advanced_id = None
        self.same_id_count = 0

    def register_advance(self, item_id):
        """Record that we are about to re-invoke for item_id."""
        if item_id == self.last_advanced_id:
            self.same_id_count += 1
        else:
            self.last_advanced_id = item_id
            self.same_id_count = 1
        self.distinct_advances += 1

    def should_halt(self):
        """Return (halt: bool, reason: str|None). Check BEFORE registering/advancing."""
        if self.same_id_count >= SAME_ID_CAP:
            return True, (f"same-item runaway guard: re-fired on id={self.last_advanced_id} "
                          f"{self.same_id_count}x without it reaching 'done' — halting")
        if self.distinct_advances >= DISTINCT_ADVANCE_CAP:
            return True, (f"hit self-advance cap at {self.distinct_advances} consecutive advances "
                          f"with no new Kyle/CC post — paused, nudge to continue")
        return False, None


# ── queue-file IO (the only IO here) ──────────────────────────────────────────────
def load_queue(path):
    p = Path(path)
    if not p.exists():
        return []
    try:
        data = json.loads(p.read_text())
        return data if isinstance(data, list) else []
    except Exception:
        return []


def save_queue(path, items, keep_done=20):
    """Persist. Prune oldest done/error beyond keep_done so the file can't grow unbounded."""
    terminal = [i for i in items if i.get("state") in ("done", "error")]
    live = [i for i in items if i.get("state") not in ("done", "error")]
    terminal.sort(key=lambda i: i.get("last_touched_ts", 0), reverse=True)
    Path(path).write_text(json.dumps(live + terminal[:keep_done], indent=2))
