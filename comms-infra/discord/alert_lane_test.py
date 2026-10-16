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

# spool (Coltrane send-back r2): durable, atomic, unreadable files kept aside, oldest message first
import json as _json, tempfile as _tf
with _tf.TemporaryDirectory() as _d:
    sp = os.path.join(_d, "spool")
    al.spool_write(sp, {"message_id": 20, "content": "b"}, "pending")
    al.spool_write(sp, {"message_id": 10, "content": "a"}, "pending")
    al.spool_write(sp, {"message_id": 10, "content": "a"}, "escalated", reason="r")
    recs, probs = al.spool_load(sp)
    ok("spool: one record per message, latest state wins", [r["task"]["message_id"] for r in recs] == [10, 20]
       and recs[0]["state"] == "escalated" and recs[0]["reason"] == "r")
    ok("spool: no temp files left", not any(n.endswith(".tmp") for n in os.listdir(sp)))
    open(os.path.join(sp, "30.json"), "w").write("{not json")
    recs, probs = al.spool_load(sp)
    ok("spool: an unreadable file is reported and set aside, not dropped", len(probs) == 1 and os.path.exists(os.path.join(sp, "30.json.bad")))
    al.spool_remove(sp, 20); al.spool_remove(sp, 999)
    ok("spool: remove is idempotent", [r["task"]["message_id"] for r in al.spool_load(sp)[0]] == [10])
    inbox = os.path.join(_d, "inbox.jsonl")
    with open(inbox, "w", encoding="utf-8") as fh:
        fh.write(_json.dumps({"kind": "langston_outbound", "lane": "alert", "text": '[[ALERT id=%s owner=CC-B action="a"]]' % A}) + NL)
        fh.write(_json.dumps({"kind": "langston_outbound", "reply_to": 555, "text": "his reply"}) + NL)
        fh.write(_json.dumps({"kind": "langston_outbound", "reply_to": "adv-Q1", "text": "self-advance"}) + NL)
        fh.write("garbage" + NL)
    routed_ids, replied = al.inbox_evidence(inbox)
    ok("inbox evidence: lane-recorded alert ids", routed_ids == {A})
    ok("inbox evidence: Langston's replies by message id, odd ids ignored", replied == {555})

# ---- Langston precedent (his ruling after the lane's first live burst, 2026-10-16) ----
def _alert(aid, title, body="body text"):
    return "🚨 **SYSTEM ALERT — WARNING**\n**%s**\n%s\n_Category:_ breakage  ·  _Alert ID:_ `%s`" % (title, body, aid)

ok("key: template + symbol from the title, digits -> <N>",
   al.alert_key(_alert(A, "VTS exit decisions unavailable — 10 min with no decision for SBAC/USD"))
   == ("VTS exit decisions unavailable — <N> min with no decision for <SYM>", "SBAC/USD"))
ok("key: a symbol in the BODY only is not the key's symbol",
   al.alert_key(_alert(A, "Change-class undeclared for B-SILENT", "for HUT/USD")) == ("Change-class undeclared for B-SILENT", None))
ok("key: no title -> None", al.alert_key("plain text") is None)
ok("prompt carries the precedent line", "LANGSTON PRECEDENT" in al.build_prompt([(A, "x")], {A: None}, {}))
ok("prompt without precedent stays as before", "LANGSTON PRECEDENT" not in al.build_prompt([(A, "x")]))

D_ = "11111111-1111-4111-8111-111111111111"; E_ = "22222222-2222-4222-8222-222222222222"
F_ = "33333333-3333-4333-8333-333333333333"; G_ = "44444444-4444-4444-8444-444444444444"
T_ = "VTS exit decisions unavailable — <N> min with no decision for <SYM>"
with _tf.TemporaryDirectory() as _d2:
    inbox = os.path.join(_d2, "inbox.jsonl")
    rows = [
        {"kind": "langston_alert_inbound", "ts": "2026-10-15T10:00:00", "text": _alert(D_, "VTS exit decisions unavailable — 10 min with no decision for AAA/USD")},
        {"kind": "langston_alert_inbound", "ts": "2026-10-15T10:00:00", "text": _alert(E_, "VTS exit decisions unavailable — 12 min with no decision for BBB/USD")},
        {"kind": "langston_alert_inbound", "ts": "2026-10-15T10:00:00", "text": _alert(F_, "VTS exit decisions unavailable — 10 min with no decision for CCC/USD")},
        {"kind": "langston_alert_inbound", "ts": "2026-10-15T10:00:00", "text": _alert(G_, "VTS exit decisions unavailable — 10 min with no decision for CCC/USD")},
        {"kind": "langston_outbound", "ts": "2026-10-15T11:00:00", "text": '[[ALERT id=%s owner=CC-C action="a"]]' % D_},
        {"kind": "langston_outbound", "ts": "2026-10-15T11:00:00", "text": '[[ALERT id=%s owner=Kyle action="a"]]' % E_},
        {"kind": "langston_outbound", "ts": "2026-10-15T11:00:00", "text": '[[ALERT id=%s owner=CC-C action="a"]]' % F_},
        {"kind": "langston_outbound", "ts": "2026-10-15T12:00:00", "text": '[[ALERT id=%s owner=CC-B action="a"]]' % G_},
        # a LANE marker must never be precedent (Blocker 2): it would make BBB look settled on CC-B
        {"kind": "langston_outbound", "lane": "alert", "ts": "2026-10-15T13:00:00", "text": '[[ALERT id=%s owner=CC-B action="a"]]' % E_},
        # older than the window: ignored
        {"kind": "langston_outbound", "ts": "2026-09-01T11:00:00", "text": '[[ALERT id=%s owner=CC-A action="a"]]' % D_},
    ]
    with open(inbox, "w", encoding="utf-8") as fh:
        for r_ in rows:
            fh.write(_json.dumps(r_) + "\n")
    prec = al.langston_precedent(inbox, "2026-10-16T13:47:00")
    ok("precedent: Langston-sourced only, lane markers excluded", prec.get((T_, "BBB/USD")) == [("2026-10-15T11:00:00", "Kyle")])
    ok("precedent: outside the 7-day window ignored", prec.get((T_, "AAA/USD")) == [("2026-10-15T11:00:00", "CC-C")])
    ok("precedent: a symbol he split keeps both, newest first",
       prec.get((T_, "CCC/USD")) == [("2026-10-15T12:00:00", "CC-B"), ("2026-10-15T11:00:00", "CC-C")])
    ok("precedent: an unreadable inbox is {} (never agreement)", al.langston_precedent(os.path.join(_d2, "none"), "2026-10-16T13:47:00") == {})

    H_ = "55555555-5555-4555-8555-555555555555"; I_ = "66666666-6666-4666-8666-666666666666"
    J_ = "77777777-7777-4777-8777-777777777777"; K_ = "88888888-8888-4888-8888-888888888888"
    keys = {H_: (T_, "AAA/USD"), I_: (T_, "BBB/USD"), J_: (T_, "CCC/USD"), K_: (T_, "ZZZ/USD")}
    routed = {H_: ("CC-C", "x"), I_: ("CC-B", "x"), J_: ("CC-C", "x"), K_: ("CC-B", "x")}
    r2, e2, n2 = al.apply_precedent(routed, {}, keys, prec)
    ok("agrees with Langston -> kept, cites the precedent", r2.get(H_, ("", ""))[0] == "CC-C" and "Langston precedent" in r2[H_][1])
    ok("contradicts Langston -> to him, never routed", I_ not in r2 and "contradicting Langston's assignment" in e2.get(I_, ""))
    ok("a symbol he split -> to him", J_ not in r2 and "may not choose" in e2.get(J_, ""))
    ok("no precedent -> rulebook routing kept and SAYS so", r2.get(K_, ("", ""))[1].endswith("(no Langston precedent)"))
    ok("every alert accounted for (routed or escalated)", set(r2) | set(e2) == set(routed))

    many = {("%08d-0000-4000-8000-000000000000" % n): ("CC-B", "x") for n in range(12)}
    mk = {a_: (T_, "N%d/USD" % i) for i, a_ in enumerate(many)}
    r3, e3, n3 = al.apply_precedent(many, {}, mk, prec)
    ok("unanimity guard: 12 to one owner on a class he split -> one sample to him", len(e3) == 1 and len(r3) == 11 and n3)
    few = dict(list(many.items())[:9])
    r4, e4, n4 = al.apply_precedent(few, {}, mk, prec)
    ok("unanimity guard: below N it stays quiet", not e4 and not n4)
    r5, e5, n5 = al.apply_precedent(many, {}, mk, {})
    ok("unanimity guard: needs a split in HIS history, not just volume", not e5)

# the stated invariant: the lane never acks or resolves (its own instruction file says so)
_lane_md = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "alert-lane", "CLAUDE.md"), encoding="utf-8").read()
ok("invariant: the lane's instructions forbid ack/resolve", "Never ack, resolve or change anything" in _lane_md)

print("\nalert_lane tests: %d passed, %d failed" % (P, F))
sys.exit(0 if F == 0 else 1)
