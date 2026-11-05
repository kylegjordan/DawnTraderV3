#!/usr/bin/env python3
"""B-WAKE-OPENING-LIST (#1241) P6: the opening-list parser, and the pins that bind every consumer to it.
Run: python3 comms-infra/discord/address_list_test.py   (stdlib only; any OS)

Every expected outcome is stated in the case before it runs. A failing case prints `FAIL: <name>`, and the run exits 1;
mutate_address_list.py judges by the exit code AND that named line.
  1. the parser cases of scope OBJ-1, plus the end offset the sender uses to place a mention;
  2. the sha-256 of THIS repo's address_list.py, computed here, equals every consumer's ADDRESS_LIST_SHA256;
  3. address_list.SESSION_NAMES equals the wake filter's NAMES (the authority), read from the filter's source."""
import ast, hashlib, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import address_list as al

P = F = 0


def ok(name, cond, detail=""):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print("  FAIL: " + name + (("   [" + detail + "]") if detail else ""))


R = al.REGISTRY

# (text, expected opening-list keys IN ORDER, case name)
CASES = [
    ("Langston, and Coltrane — x", ["LANGSTON", "COLTRANE"], "KD-12 shape: 'Langston, and Coltrane' -> both"),
    ("Coltrane and Langston: x", ["COLTRANE", "LANGSTON"], "'Coltrane and Langston:' -> both"),
    ("OLD Claude / NEW Claude — x", ["CC-A", "CC-B"], "'OLD Claude / NEW Claude' -> both"),
    ("Infra Claude, ANALYST Claude - from PM Claude, …", ["CC-INFRA", "CC-C"],
     "'Infra Claude, ANALYST Claude - from PM Claude' -> CC-INFRA and CC-C, not CC-PM"),
    ("at 3 PM Claude will post", [], "clock time 'at 3 PM Claude' -> nobody"),
    ("Langston, 3 PM Claude will post", ["LANGSTON"], "clock time inside a list 'Langston, 3 PM Claude' -> Langston only"),
    ("Langston, PM Claude - x", ["LANGSTON", "CC-PM"], "'Langston, PM Claude' -> Langston and CC-PM"),
    ("Langston Coltrane x", ["LANGSTON"], "bare whitespace is not a separator: 'Langston Coltrane x' -> Langston only"),
    ("SWITCH TO CODEX", [], "'SWITCH TO CODEX' -> nobody (a name only later)"),
    ("**Langston**, **Coltrane** — x", ["LANGSTON", "COLTRANE"], "leading and inner markdown -> both"),
    ("@Langston, @Coltrane — x", ["LANGSTON", "COLTRANE"], "'@Langston, @Coltrane' -> both (one markup class)"),
    ("<@123456789> Langston — x", [], "'<@id> Langston' -> nobody ('<' is not markup)"),
    ("> @NEW Claude — do X", ["CC-B"], "'> @NEW Claude' quote -> CC-B (pinned, not prevented)"),
    ("Langston, Coltrane, OLD Claude, NEW Claude — all of you", ["LANGSTON", "COLTRANE", "CC-A", "CC-B"],
     "KD-21's own example -> all four"),
    ("Langston — and Coltrane may comment", ["LANGSTON"], "OBJ-5 live case: Coltrane only later -> Langston only"),
    ("Kyle — the census is done; OLD Claude may want it.", [], "a later-only mention -> nobody"),
    ("Langstonish words", [], "a name must end at a word boundary: 'Langstonish' -> nobody"),
    ("CC-A & CC-INFRA + cc pm — x", ["CC-A", "CC-INFRA", "CC-PM"], "'&' and '+' separate; the CC-x forms -> three"),
    ("Langston, Langston — x", ["LANGSTON"], "a repeated name is listed once"),
    ("", [], "an empty post -> nobody"),
]
for text, want, name in CASES:
    got = al.opening_list(text, R)[0]
    ok(name, got == want, "got %r" % (got,))
    ok(name + " (opening_addressees agrees)", al.opening_addressees(text, R) == set(want))
ok("None is an empty post", al.opening_list(None, R) == ([], 0))

# The end offset: just past the LAST name, so a mention placed there leaves the list intact for every reader.
for text, last in (("Coltrane, and Langston — x", "Langston"), ("**Langston**, **Coltrane** — x", "Coltrane"),
                   ("OLD Claude / NEW Claude — x", "NEW Claude")):
    end = al.opening_list(text, R)[1]
    ok("end offset sits just past %r in %r" % (last, text), text[:end].endswith(last), "end=%d" % end)
ok("end offset is 0 for an empty list", al.opening_list("Kyle — x", R)[1] == 0)
_t = "Coltrane, and Langston — x"
_e = al.opening_list(_t, R)[1]
ok("a mention placed at the end offset keeps the whole list",
   al.opening_list(_t[:_e] + " <@5>" + _t[_e:], R)[0] == ["COLTRANE", "LANGSTON"])

# ── the pins ─────────────────────────────────────────────────────────────────────────────────────────────────────
SHA = hashlib.sha256(open(os.path.join(HERE, "address_list.py"), "rb").read()).hexdigest()
print("address_list.py sha256 (computed now, from the file): " + SHA)
CONSUMERS = ["comms-infra/discord/discord_common.py", "comms-infra/codex/coltrane-bot.py",
             "comms-infra/laptop/cc-wake-filter.py"]
for rel in CONSUMERS:
    src = open(os.path.join(ROOT, rel), encoding="utf-8").read()
    pins = re.findall(r'^ADDRESS_LIST_SHA256 = "([0-9a-f]{64})"', src, re.M)
    ok("%s carries exactly one ADDRESS_LIST_SHA256 pin" % rel, len(pins) == 1, "found %d" % len(pins))
    ok("%s pins this address_list.py" % rel, pins == [SHA], "pins %r" % pins)
# Langston's bridge has no pin of its own: it refuses on discord_common's load (same install group, same file).
_br = open(os.path.join(HERE, "discord-langston-bridge.py"), encoding="utf-8").read()
ok("the Langston bridge gates on discord_common's load and refuses when it failed",
   "if dc.ADDRESS_LIST is None:" in _br and "sys.exit(2)" in _br and 'dc.opening_list(content)' in _br)

# SESSION_NAMES is a pinned copy of the filter's NAMES - read from the source, because importing the filter runs it.
_ft = ast.parse(open(os.path.join(ROOT, "comms-infra/laptop/cc-wake-filter.py"), encoding="utf-8").read())
_names = [ast.literal_eval(n.value) for n in _ft.body
          if isinstance(n, ast.Assign) and any(getattr(t, "id", None) == "NAMES" for t in n.targets)]
ok("the filter defines NAMES exactly once at top level", len(_names) == 1, "found %d" % len(_names))
ok("address_list.SESSION_NAMES equals the filter's NAMES (the authority)", _names[:1] == [al.SESSION_NAMES],
   "filter %r" % (_names[:1],))
ok("the registry is the sessions plus the two reviewers, nothing else",
   set(R) == set(al.SESSION_NAMES) | {"LANGSTON", "COLTRANE"})

print("%d passed, %d failed" % (P, F))
sys.exit(1 if F else 0)
