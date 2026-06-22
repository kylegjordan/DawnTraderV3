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

print(f"\nlangston_queue tests: {P} passed, {F} failed")
sys.exit(0 if F == 0 else 1)
