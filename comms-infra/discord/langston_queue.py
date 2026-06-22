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
# `ready` is a first-class status (#342): a CC (or Langston) emits it to UN-PARK a blocked item once
# its dependency lands; pick_next_ready then re-picks it (the consumer already exists). want/reason
# accept EITHER a quoted multi-word value OR an unquoted single token (#343, Langston Step-4): a
# stateless LLM will sometimes omit quotes, and a malformed marker must not silently drop. `on=` and
# the unquoted forms stop at whitespace or `]` so the trailing `]]` still anchors.
_MARKER_RE = re.compile(
    r"\[\[QUEUE\s+id=(?P<id>[^\s\]]+)\s+status=(?P<status>done|blocked|error|ready)"
    r"(?:\s+on=(?P<on>[^\s\]]+))?"
    r"(?:\s+want=(?P<want>\"[^\"]*\"|[^\s\]]+))?"
    r"(?:\s+reason=(?P<reason>\"[^\"]*\"|[^\s\]]+))?\s*\]\]",
    re.I,
)
# Detects a marker ATTEMPT even when the full grammar fails — so the caller can tell a
# malformed-but-present marker (Langston signaled, grammar dropped it → LOUDER park) from a genuinely
# absent marker (#343, Langston Step-4: "make the malformed-present case the LOUDER of the two").
_MARKER_ATTEMPT_RE = re.compile(r"\[\[\s*QUEUE\b", re.I)


def _unquote(v):
    if v and len(v) >= 2 and v[0] == '"' and v[-1] == '"':
        return v[1:-1]
    return v


def parse_marker(text):
    """Return the LAST well-formed queue-marker dict in text, or None. Last-line wins (Langston emits
    one). A None here does NOT mean 'no marker' — use marker_attempted() to tell malformed from absent."""
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
        out["want"] = _unquote(m.group("want"))
    if m.group("reason"):
        out["reason"] = _unquote(m.group("reason"))
    return out


def marker_attempted(text):
    """True iff the text contains a `[[QUEUE ...` marker attempt (well-formed or not). Lets the caller
    distinguish a MALFORMED-but-present marker from a genuinely absent one (#343)."""
    return bool(text) and bool(_MARKER_ATTEMPT_RE.search(text))


def new_item(item_id, requester, summary, pointer=None, gate_type=None, now=None):
    now = now if now is not None else time.time()
    gt = gate_type if gate_type in GATE_PRIORITY else DEFAULT_GATE
    return {
        "id": str(item_id), "requester": requester, "summary": (summary or "")[:500],
        "pointer": pointer, "state": "ready", "gate_type": gt,
        "blocked_on": None, "added_ts": now, "last_touched_ts": now,
    }


# ── OBJ-1 enqueue gate (Langston Step-4 FINDING-1) ────────────────────────────────
# Only a CC's REVIEW REQUEST creates a queue item — NOT every addressed inbound. Coordination
# chatter ("are you still on B2.1?", "coordinate on X", "thanks, noted") must not enqueue, or the
# queue fills with non-reviewables and the self-advance loop tries to "work" them. Heuristic: an
# explicit review-intent term, a workflow-step reference, or an inbox/diff pointer.
_REVIEW_INTENT_RE = re.compile(
    r"\b(review|step[\s-]*\d|diff|sign[\s-]*-?off|approve|changes[\s-]*-?needed|"
    r"pre[\s-]*-?audit|completion[\s-]*report|verif|second[\s-]*-?pass|code[\s-]*-?review|"
    r"scope|design[\s-]*ask)\b|/inbox/",
    re.I,
)


def is_review_request(text):
    """True iff the inbound reads as a review request (OBJ-1 enqueue gate). Conservative on the
    NON-enqueue side is fine — a missed enqueue just means the CC re-asks; an over-enqueue pollutes
    the loop, which is the exact thing FINDING-1 flags."""
    if not text:
        return False
    return bool(_REVIEW_INTENT_RE.search(text))


def park_unmarked(items, item_id, malformed=False, now=None):
    """FINDING-2 (Langston Step-4): a self-advance reply that carried NO usable status marker for the
    item it was working leaves that item `ready` → the next advance re-picks the SAME id → trips the
    Tier-1 same-id HALT and pauses the WHOLE loop over a merely-missing marker. Park it (state=blocked,
    LOUD via the caller) so the loop moves on; a re-mark clears it. `malformed=True` means a marker WAS
    present but the grammar failed (#343) — recorded as a distinct, louder `park_kind` so a dropped
    signal isn't mistaken for a forgotten one. Returns the parked item, or None if not found / already
    terminal (done|error) / already blocked."""
    now = now if now is not None else time.time()
    item = next((i for i in items if i.get("id") == str(item_id)), None)
    if item is None or item.get("state") in ("done", "error", "blocked"):
        return None
    item["state"] = "blocked"
    if malformed:
        item["blocked_on"] = {"who": "Langston",
                              "want": "MALFORMED marker (a [[QUEUE ...]] was present but the grammar failed) — re-emit a valid marker"}
        item["park_kind"] = "malformed_marker"
    else:
        item["blocked_on"] = {"who": "Langston",
                              "want": "status marker (none emitted; verdict is in the Discord prose) — re-mark to advance"}
        item["park_kind"] = "no_marker"
    item["last_touched_ts"] = now
    item["unmarked_park"] = True
    return item


# ── blocked-item staleness (#342 follow-gap, Langston Step-4) ──────────────────────
# A `blocked` item whose `want` never lands would sit forever — an open loop. Re-surface it to Kyle
# on a TTL cadence so it can't silently rot. Re-surfacing (not auto-resolving) is deliberate: only the
# real dependency landing (a `ready` marker) should un-park it.
BLOCKED_TTL_SECONDS = 6 * 3600  # 6h


def stale_blocked(items, now=None, ttl=None):
    """Blocked items due for a staleness re-surface: blocked AND (now - last_surface) >= ttl, where
    last_surface defaults to when it became blocked (last_touched_ts). Re-surfaces every ttl while it
    stays blocked (mark_stale_surfaced advances the clock)."""
    now = now if now is not None else time.time()
    ttl = ttl if ttl is not None else BLOCKED_TTL_SECONDS
    out = []
    for i in items:
        if i.get("state") != "blocked":
            continue
        last_surface = i.get("last_stale_surface_ts", i.get("last_touched_ts", now))
        if (now - last_surface) >= ttl:
            out.append(i)
    return out


def mark_stale_surfaced(item, now=None):
    item["last_stale_surface_ts"] = now if now is not None else time.time()


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
    elif st == "ready":
        # #342 circle-back UN-PARK: a CC/Langston re-readies a blocked item once its dependency lands;
        # pick_next_ready re-picks it (the consumer already exists), so the self-advance loop retries it.
        item["state"] = "ready"
        item["blocked_on"] = None
        item.pop("unmarked_park", None)
        item.pop("park_kind", None)
        item.pop("last_stale_surface_ts", None)
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
