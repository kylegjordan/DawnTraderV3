#!/usr/bin/env python3
"""Unit tests for langston_queue.py — pure logic (priority, marker parse, two-tier cap).
Run: python3 comms-infra/discord/langston_queue_test.py"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import langston_queue as q

P = F = 0
def ok(name, cond):
    global P, F
    if cond: P += 1
    else: F += 1; print(f"  FAIL: {name}")

# ── parse_marker ──────────────────────────────────────────────────────────────
ok("marker done", q.parse_marker("verdict prose\n[[QUEUE id=Q17 status=done]]") == {"id": "Q17", "status": "done"})
m = q.parse_marker('[[QUEUE id=Q3 status=blocked on=CC-B want="staging deploy abcd123"]]')
ok("marker blocked on/want", m and m["status"] == "blocked" and m["on"] == "CC-B" and m["want"] == "staging deploy abcd123")
m = q.parse_marker('[[QUEUE id=Q9 status=error reason="gdrive read hung"]]')
ok("marker error reason", m and m["status"] == "error" and m["reason"] == "gdrive read hung")
ok("no marker -> None", q.parse_marker("just prose, no marker") is None)
ok("LAST marker wins", q.parse_marker("[[QUEUE id=A status=blocked]]\n[[QUEUE id=B status=done]]")["id"] == "B")

# ── pick_next_ready: priority (gate) then oldest ──────────────────────────────
items = [
    q.new_item("Q1", "CC-A", "a design ask", gate_type="design-ask", now=100),
    q.new_item("Q2", "CC-B", "a step-4 diff blocking a push", gate_type="step4-diff", now=200),
    q.new_item("Q3", "CC-A", "a step-2", gate_type="step2", now=50),
]
ok("priority: step4-diff jumps ahead of older design-ask/step2", q.pick_next_ready(items)["id"] == "Q2")
items2 = [q.new_item("Qa", "CC-A", "x", gate_type="design-ask", now=300),
          q.new_item("Qb", "CC-A", "y", gate_type="design-ask", now=100)]
ok("same gate -> oldest first", q.pick_next_ready(items2)["id"] == "Qb")
ok("no ready -> None", q.pick_next_ready([q.new_item("Qz", "CC-A", "z")] ) is not None and
   q.pick_next_ready([{"id": "Qd", "state": "done"}]) is None)

# ── apply_marker transitions ──────────────────────────────────────────────────
it = [q.new_item("Q5", "CC-A", "x")]
q.apply_marker(it, {"id": "Q5", "status": "done"})
ok("apply done", it[0]["state"] == "done")
it = [q.new_item("Q6", "CC-A", "x")]
q.apply_marker(it, {"id": "Q6", "status": "error", "reason": "boom"})
ok("apply error parks (NOT done) + keeps reason", it[0]["state"] == "error" and it[0]["error_reason"] == "boom")
_, action = q.apply_marker([q.new_item("Q7", "CC-A", "x")], {"id": "NOPE", "status": "done"})
ok("apply unknown-id", action == "unknown-id")

# ── CapTracker: the safety spine ──────────────────────────────────────────────
# Tier 1: same id re-fired without done -> halt at 2
c = q.CapTracker()
c.register_advance("Q1")
ok("1st advance on Q1: no halt", c.should_halt()[0] is False)
c.register_advance("Q1")   # SAME id again, never went done
ok("SAME-id twice without done -> HALT (the runaway signature)", c.should_halt()[0] is True)
ok("halt reason names same-item guard", "same-item" in c.should_halt()[1])
# Tier 2: 10 DISTINCT advances -> halt, and it's loud (reason given)
c2 = q.CapTracker()
for i in range(q.DISTINCT_ADVANCE_CAP):
    ok(f"distinct advance {i+1} below cap no-halt", c2.should_halt()[0] is False) if i < q.DISTINCT_ADVANCE_CAP else None
    c2.register_advance(f"Q{i}")
ok("10 distinct advances -> HALT", c2.should_halt()[0] is True)
ok("distinct-halt reason is loud (mentions cap + nudge)", "cap" in c2.should_halt()[1] and "nudge" in c2.should_halt()[1])
# reset clears both tiers (Kyle/CC post)
c2.reset()
ok("reset clears the cap (Kyle/CC post)", c2.should_halt()[0] is False and c2.distinct_advances == 0)

# ── is_review_request: OBJ-1 enqueue gate (FINDING-1) ─────────────────────────
ok("review req: 'please review my Step-4'", q.is_review_request("Langston, please review my Step-4 submission") is True)
# #345 R3: a bare pointer/handoff with NO request verb does NOT enqueue (pointer is a booster, not sufficient);
# the same handoff WITH a request verb does.
ok("review req: bare pointer alone does NOT enqueue (#345 R3)", q.is_review_request("Langston — diff at /home/langston/inbox/b-x/a.diff") is False)
ok("review req: diff handoff WITH a verb enqueues", q.is_review_request("Langston — diff ready for your review at /home/langston/inbox/b-x/a.diff") is True)
ok("review req: 'sign off on the completion report'", q.is_review_request("Langston, sign off on the completion report") is True)
ok("review req: 'scope' ask", q.is_review_request("Langston, here's the scope for B-X — your Step-1 call?") is True)
ok("NOT review: coordination chatter", q.is_review_request("Langston, coordinate with Claude New on B2.1 timing") is False)
ok("NOT review: thanks/noted", q.is_review_request("Langston — thanks, noted, standing by") is False)
ok("NOT review: empty", q.is_review_request("") is False)

# ── park_unmarked: FINDING-2 (missing-marker must not dead-lock the loop) ──────
it = [q.new_item("Q20", "CC-A", "x")]               # ready
parked = q.park_unmarked(it, "Q20")
ok("park_unmarked: ready -> blocked", parked is not None and it[0]["state"] == "blocked")
ok("park_unmarked: blocked_on = Langston marker", it[0]["blocked_on"]["who"] == "Langston" and it[0].get("unmarked_park") is True)
ok("park_unmarked: parked item is NOT ready -> pick_next_ready skips it (no same-id re-fire)", q.pick_next_ready(it) is None)
done_it = [q.new_item("Q21", "CC-A", "x")]; done_it[0]["state"] = "done"
ok("park_unmarked: already-done is a no-op", q.park_unmarked(done_it, "Q21") is None and done_it[0]["state"] == "done")
ok("park_unmarked: unknown id -> None", q.park_unmarked([q.new_item("Q22", "CC-A", "x")], "NOPE") is None)

# ── #343 marker: ready status, unquoted want/reason, malformed-vs-absent ──────
ok("marker ready status", q.parse_marker("[[QUEUE id=Q30 status=ready]]") == {"id": "Q30", "status": "ready"})
m = q.parse_marker("[[QUEUE id=Q31 status=blocked on=CC-A want=shakeout-artifact]]")
ok("marker UNQUOTED want parses (#343)", m and m["status"] == "blocked" and m["want"] == "shakeout-artifact" and m["on"] == "CC-A")
m = q.parse_marker('[[QUEUE id=Q32 status=blocked on=CC-B want="staging deploy abcd123"]]')
ok("marker QUOTED multi-word want still parses + unquoted", m and m["want"] == "staging deploy abcd123")
m = q.parse_marker('[[QUEUE id=Q33 status=error reason=gdrive-hung]]')
ok("marker UNQUOTED reason parses", m and m["reason"] == "gdrive-hung")
ok("marker_attempted: malformed present -> True", q.marker_attempted("verdict [[QUEUE id=Q status=bogus") is True)
ok("marker_attempted: absent -> False", q.marker_attempted("just prose, no marker") is False)
ok("malformed marker -> parse None BUT attempted True (the #343 split)",
   q.parse_marker("text [[QUEUE blah no id]]") is None and q.marker_attempted("text [[QUEUE blah]]") is True)

# ── #342 ready un-park transition ─────────────────────────────────────────────
it = [q.new_item("Q40", "CC-A", "x")]
q.park_unmarked(it, "Q40")
ok("setup: Q40 parked blocked", it[0]["state"] == "blocked")
q.apply_marker(it, {"id": "Q40", "status": "ready"})
ok("ready un-parks blocked -> ready (#342)", it[0]["state"] == "ready" and it[0]["blocked_on"] is None and "unmarked_park" not in it[0])
ok("un-parked item is now pickable again (consumer exists)", q.pick_next_ready(it) is not None and q.pick_next_ready(it)["id"] == "Q40")

# ── #343 park_unmarked malformed flag ─────────────────────────────────────────
it = [q.new_item("Q41", "CC-A", "x")]
q.park_unmarked(it, "Q41", malformed=True)
ok("malformed park sets distinct park_kind", it[0]["park_kind"] == "malformed_marker")
it2 = [q.new_item("Q42", "CC-A", "x")]
q.park_unmarked(it2, "Q42", malformed=False)
ok("absent-marker park sets no_marker park_kind", it2[0]["park_kind"] == "no_marker")

# ── #342 staleness re-surface ─────────────────────────────────────────────────
ttl = 100
fresh = q.new_item("Q50", "CC-A", "x", now=1000); fresh["state"] = "blocked"; fresh["last_touched_ts"] = 1000
old = q.new_item("Q51", "CC-A", "x", now=1); old["state"] = "blocked"; old["last_touched_ts"] = 1
ready_it = q.new_item("Q52", "CC-A", "x"); ready_it["last_touched_ts"] = 1  # ready, not blocked
items = [fresh, old, ready_it]
stale = q.stale_blocked(items, now=1000, ttl=ttl)
ok("stale_blocked: only the long-blocked one (not fresh, not ready)", [s["id"] for s in stale] == ["Q51"])
q.mark_stale_surfaced(old, now=1000)
ok("after mark_stale_surfaced: not re-surfaced until next ttl", q.stale_blocked(items, now=1050, ttl=ttl) == [])
ok("re-surfaces again after another ttl", "Q51" in [s["id"] for s in q.stale_blocked(items, now=1101, ttl=ttl)])

# ── #344 enqueue gate excludes marker-carrying CONTROL messages ───────────────
_ctrl = 'Langston — [[QUEUE id=X status=ready]] dep landed, please re-review'
ok("#344: control msg reads as review-request...", q.is_review_request(_ctrl) is True)
ok("#344: ...but carries a marker -> excluded from enqueue (gate uses both)",
   q.is_review_request(_ctrl) and q.marker_attempted(_ctrl) and not (q.is_review_request(_ctrl) and not q.marker_attempted(_ctrl)))

# ── #345 OBJ-C1: enqueue gate requires a review-REQUEST verb, not a bare mention ──
# Discussion replies that MENTION review-domain terms must NOT enqueue (the `verif` over-match churn).
ok("C1: 'pulled the timestamps, the proof is airtight' does NOT enqueue",
   q.is_review_request("Langston — pulled the timestamps, and the proof is airtight") is False)
ok("C1: 'agreed on the two-part framing' does NOT enqueue",
   q.is_review_request("Langston — agreed on the two-part framing, part 2 is already done") is False)
ok("C1: 'I verified the timestamps' does NOT enqueue (the bare verif match)",
   q.is_review_request("Langston — I checked the code and verified the timestamps") is False)
ok("C1: a bare /inbox/ pointer alone does NOT enqueue (pointer is booster, not sufficient — R3)",
   q.is_review_request("agreed, the proof is in /home/langston/inbox/x/proof.md") is False)
# Genuine requests DO enqueue.
ok("C1: 'requesting your Step-8 sign-off' enqueues",
   q.is_review_request("Langston — requesting your Step-8 second-pass sign-off to close") is True)
ok("C1: 'please review the scope' enqueues",
   q.is_review_request("Langston, please review the scope and give your call") is True)
ok("C1: 'the diff is ready, holding for your sign-off' enqueues",
   q.is_review_request("Langston — reorg Step-4, the diff is ready, holding for your sign-off") is True)
ok("C1: 'please re-review' (with re- prefix) still enqueues",
   q.is_review_request("Langston, I addressed your feedback, please re-review the diff") is True)

# ── #345 OBJ-B: extract_pointer (booster captured at enqueue) ──────────────────
ok("OBJ-B: inbox path extracted",
   q.extract_pointer("staged at /home/langston/inbox/B-345/scope.md please review") == "/home/langston/inbox/B-345/scope.md")
ok("OBJ-B: repo file path extracted",
   q.extract_pointer("see comms-infra/discord/langston_queue.py for the change") == "comms-infra/discord/langston_queue.py")
ok("OBJ-B: commit sha extracted (has digit+letter)",
   q.extract_pointer("deployed head 99887f90e, please verify") == "99887f90e")
ok("OBJ-B: an all-letter word is NOT mistaken for a sha",
   q.extract_pointer("reviewed and approved, looks good") is None)
ok("OBJ-B: trailing punctuation stripped off a path",
   q.extract_pointer("the report is at notes/report.md.") == "notes/report.md")

# ── #345 OBJ-A: `noop` terminal settle (passed gate, not an actual review) ─────
_n = [q.new_item("N1", "CC-A", "x")]
_n[0]["self_advance_refires"] = 1
it_noop, act_noop = q.apply_marker(_n, {"id": "N1", "status": "noop"})
ok("OBJ-A: noop marker settles state=noop", it_noop["state"] == "noop" and act_noop == "noop")
ok("OBJ-A: noop leaves the ready set (pick_next_ready skips it)", q.pick_next_ready(_n) is None)
ok("OBJ-A/R4: noop clears the per-item refire counter", "self_advance_refires" not in _n[0])
_d = [q.new_item("D1", "CC-A", "x")]; _d[0]["self_advance_refires"] = 2
q.apply_marker(_d, {"id": "D1", "status": "done"})
ok("R4: done clears the per-item refire counter", "self_advance_refires" not in _d[0])

# ── #345 OBJ-C2: per-item refire halt SURVIVES a CapTracker reset ──────────────
cap = q.CapTracker()
itc = q.new_item("C1id", "CC-A", "x")
# simulate the churn: each self-advance registers on the item; a real inbound resets the CapTracker.
q.register_item_refire(itc); cap.register_advance("C1id"); cap.reset()   # inbound between advances
ok("C2: after 1 refire, not yet halted", q.item_refire_halt(itc) is False)
q.register_item_refire(itc); cap.register_advance("C1id"); cap.reset()
ok("C2: after 2 refires, item-level halt fires EVEN THOUGH CapTracker was reset each time",
   q.item_refire_halt(itc) is True and cap.should_halt()[0] is False)
ok("C2: a fresh item is not halted", q.item_refire_halt(q.new_item("C2id", "CC-A", "y")) is False)

# ── #345 OBJ-C2 INTEGRATION (Langston Step-4): the refire count must PERSIST across save/load ──
# The unit cases above operate on one in-memory object; the bridge re-invoke is a SEPARATE task that
# reloads the queue from disk, so the increment is only real if _self_advance writes it back. This
# test round-trips through save_queue/load_queue to catch the exact bug Langston caught.
import tempfile as _tf, os as _osmod
_tmpf = _tf.mktemp(suffix="-q345.json")
try:
    q.save_queue(_tmpf, [q.new_item("INT1", "CC-A", "x")])
    for _ in range(2):  # simulate two self-advance cycles: load → pick → register_item_refire → save
        _it = q.load_queue(_tmpf)
        q.register_item_refire(q.pick_next_ready(_it))
        q.save_queue(_tmpf, _it)
    _final = q.load_queue(_tmpf)
    ok("C2 integration: refire count PERSISTS across save/load round-trips", _final[0].get("self_advance_refires") == 2)
    ok("C2 integration: item_refire_halt trips after 2 PERSISTED refires", q.item_refire_halt(_final[0]) is True)
finally:
    try: _osmod.unlink(_tmpf)
    except Exception: pass

print(f"\nlangston_queue tests: {P} passed, {F} failed")
sys.exit(0 if F == 0 else 1)
