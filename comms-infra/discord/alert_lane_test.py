#!/usr/bin/env python3
"""Unit tests for alert_lane.py (B-LANGSTON-RELIEF OBJ-2). Run: python3 comms-infra/discord/alert_lane_test.py"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import alert_lane as al

P = F = 0
def ok(name, cond):
    global P, F
    if cond: P += 1
    else: F += 1; print("  FAIL: " + name)

A = "91e923a4-55f0-49e6-8f2d-558af8f68192"
B = "0292fa4c-02f9-4ba6-a8a8-2cabaf936880"
C = "f41812ab-c0fe-4406-8d38-d549470a8f89"

# alert_id_of: the labelled id wins over others quoted in the body
body = "see also %s\nClose it: resolve %s --by x\n_Category:_ breakage  ·  _Alert ID:_ `%s`" % (B, A, A)
ok("labelled id wins over another quoted id", al.alert_id_of(body) == A)
ok("single bare uuid is used", al.alert_id_of("only %s here" % C) == C)
ok("two bare uuids and no label -> None (escalated)", al.alert_id_of("%s and %s" % (A, B)) is None)
ok("no uuid -> None", al.alert_id_of("nothing") is None)
ok("upper-case id normalised", al.alert_id_of("_Alert ID:_ `%s`" % A.upper()) == A)

p = al.build_prompt([(A, "first"), (B, "second")])
ok("prompt lists every id once", p.count(A) == 1 and p.count(B) == 1 and "(2)" in p)

ans = ("Two VTS alerts, one problem.\n"
       '[[ALERT id=%s owner=CC-B action="check the bid cache"]]\n'
       '[[ALERT id=%s owner=Kyle action="decide the ceiling"]]\n'
       '[[ESCALATE id=%s reason="contradiction with the row"]]' % (A, B, B))
r, e, pr = al.read_answer(ans, [A, B])
ok("both routed", r == {A: ("CC-B", "check the bid cache"), B: ("Kyle", "decide the ceiling")})
ok("explicit escalation kept", e == {B: "contradiction with the row"})
ok("no problems", pr == [])

r, e, pr = al.read_answer('[[ALERT id=%s owner=CC-B action="x"]]' % A, [A, B, C])
ok("missing markers are escalated, never dropped", set(e) == {B, C} and A in r)

r, e, pr = al.read_answer('[[ALERT id=%s owner=Langston action="x"]]' % A, [A])
ok("unknown owner -> escalated, not routed", A in e and A not in r and pr)

r, e, pr = al.read_answer('[[ALERT id=%s owner=CC-B action="x"]]\n[[ALERT id=%s owner=CC-C action="y"]]' % (A, A), [A])
ok("conflicting markers -> escalated", A in e and A not in r)

r, e, pr = al.read_answer('[[ALERT id=%s owner=CC-B action="x"]]' % C, [A])
ok("marker for an id outside the batch is ignored and the batch id escalated", A in e and C not in r and pr)

r, e, pr = al.read_answer("", [A])
ok("empty answer escalates everything", e == {A: "the alert lane gave no routing marker for it"})

r, e, pr = al.read_answer('[[ESCALATE id=%s reason="r"]]' % C, [A])
ok("escalation for an id outside the batch ignored", C not in e)

# publishable (Coltrane send-back 1): only validated markers, rebuilt; raw and unterminated markers removed
NL = chr(10)
raw = NL.join(["Summary line.", '[[ALERT id=%s owner=CC-B action="x"]]' % A, '[[ALERT id=%s owner=Kyle action="evil"]]' % C,
               '[[ESCALATE id=%s reason="r"]]' % B, "stray [[ALERT id=%s owner=CC-A" % A])
pub = al.publishable(raw, {A: ("CC-B", 'x "quoted" ]] y')}, {B: "r"})
ok("publishable keeps the prose", pub.startswith("Summary line."))
ok("publishable drops the out-of-batch marker", C not in pub)
ok("publishable emits exactly one marker, canonical", pub.count("[[ALERT") == 1 and ("[[ALERT id=%s owner=CC-B" % A) in pub)
ok("publishable defuses an unterminated opener", "stray [ALERT" in pub)
ok("publishable sanitises the action", '"quoted"' not in pub and "] ] y" in pub)
ok("publishable lists escalations in plain text, no marker", ("handed to Langston: %s" % B) in pub and "[[ESCALATE" not in pub)

print("\nalert_lane tests: %d passed, %d failed" % (P, F))
sys.exit(0 if F == 0 else 1)
