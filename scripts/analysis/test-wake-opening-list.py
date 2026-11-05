# -*- coding: utf-8 -*-
"""B-WAKE-OPENING-LIST (#1241) P6: the session wake filter's crew branch under the opening-list rule, and its latch.
Run: python scripts/analysis/test-wake-opening-list.py [path-to-cc-wake-filter.py]   (default: the repo copy)

The filter runs as a SUBPROCESS fed real tail-format input - every input starts with the `==> file <==` header the
filter requires (scope OBJ-4, Langston C-2: three hand-fed tests once read PASS while processing nothing). A POSITIVE
CONTROL runs first and must produce a WAKE line before any other result is read; if it does not, the run ABORTS (2).
Expected outcomes are in each case name; a failure prints `FAIL: <name>` and the run exits 1.
  1. every session x every alternative in its NAMES list: a post opening with that form wakes THAT session and no
     other - asserted on the filter's WAKE lines, not on the parser's return value (Langston C-1);
  2. the crew rule: lists, later-only mentions, @crew, quotes, mention placement, self posts; Kyle's and Langston's
     branches unchanged. CONTROL: the pre-batch filter (git, R1_REF) DOES wake on the later-only mention;
  3. the latch: drift, absence, a broken module, a parser failing the probe, a registry missing the alias - each
     gives ONE WAKE[WATCHER-DRIFT], none on the next arm with the same cause, a new one for a new sha, and a mid-text
     mention still wakes while latched (it does not when healthy - the control)."""
import ast, hashlib, json, os, re, shutil, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILTER = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "comms-infra", "laptop", "cc-wake-filter.py")
MODULE = os.path.join(ROOT, "comms-infra", "discord", "address_list.py")
R1_REF = "5e577e84192c7f1693b6c6393a595dc7ac9865dc"   # the last commit before this batch
R1_GIT = os.environ.get("ADDRESS_LIST_R1_GIT", ROOT)   # mutate_address_list.py runs a copy that is not a git repo
LOG = "/var/log/cc-discord-inbox.jsonl"
SCRATCH = tempfile.mkdtemp(prefix="wake-opening-")

P = F = 0


def ok(name, cond, detail=""):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print("  FAIL: " + name + (("   [" + str(detail)[:300] + "]") if detail else ""))


def row(text, sender="NEW Claude", kind="cc_outbound"):
    d = {"ts": "2026-11-05T09:00:00+00:00", "source": "discord-cc-bridge", "transport": "discord", "kind": kind,
         "text": text}
    if sender is not None:
        d["sender"] = sender
    return json.dumps(d, ensure_ascii=False)


def stream(alias, rows, flt=FILTER):
    """Streaming mode: (wake lines, stderr). A non-zero exit is a harness failure, never a result."""
    st = os.path.join(tempfile.mkdtemp(dir=SCRATCH), alias + ".json")
    p = subprocess.run([sys.executable, flt, alias, "--state", st],
                       input=("==> %s <==\n" % LOG + "\n".join(rows) + "\n").encode("utf-8"),
                       capture_output=True, timeout=120)
    if p.returncode != 0:
        print("HARNESS FAILED - filter exited %d: %s" % (p.returncode, p.stderr.decode("utf-8", "replace")[-600:]))
        sys.exit(2)
    out = p.stdout.decode("utf-8", "replace").splitlines()
    return [l for l in out if l.startswith("WAKE[")], p.stderr.decode("utf-8", "replace")


def once(alias, flt, state_dir, rows):
    """--once mode, framed the way cc-wake-follow.py frames it. Returns (rc, wake lines, stderr)."""
    st = os.path.join(state_dir, alias + ".json")
    lines = ["==> %s <==" % LOG, "#@AT %s 7 0" % LOG]
    for i, r in enumerate(rows):
        lines += ["#@POS %s 7 %d" % (LOG, i * 1000), r]
    lines += ["#@POS %s 7 %d" % (LOG, len(rows) * 1000), "#@CAUGHTUP"]
    p = subprocess.run([sys.executable, flt, alias, "--once", "--state", st, "--lease-root", state_dir],
                       input=("\n".join(lines) + "\n").encode("utf-8"), capture_output=True, timeout=120)
    out = p.stdout.decode("utf-8", "replace").splitlines()
    return p.returncode, [l for l in out if l.startswith("WAKE[")], p.stderr.decode("utf-8", "replace")


# ── the positive control, FIRST ────────────────────────────────────────────────────────────────────────────────
_w, _e = stream("CC-A", [row("OLD Claude — positive control")])
if not any("positive control" in w for w in _w):
    print("HARNESS FAILED - the positive control produced no WAKE line; no result below would mean anything.")
    print(_e[-600:])
    sys.exit(2)
ok("positive control: a post opening 'OLD Claude' wakes CC-A, and nothing is latched", len(_w) == 1, _w)
print("positive control: WAKE seen - the instrument speaks")

# ── 1. every session x every NAMES form ───────────────────────────────────────────────────────────────────────
_tree = ast.parse(open(FILTER, encoding="utf-8").read())
_vals = {t.id: n.value for n in _tree.body if isinstance(n, ast.Assign) for t in n.targets if isinstance(t, ast.Name)}
NAMES = ast.literal_eval(_vals["NAMES"])
ALIAS_NAME = ast.literal_eval(_vals["ALIAS_NAME"])


def sample(alt):
    """A concrete string for one NAMES alternative, checked to match it - a sampler that produced a non-matching
    string would turn every case below into a silent pass."""
    s = re.sub(r"\(\?<![^)]*\)", "", alt).replace("(?-i:PM)", "PM").replace(r"[\s_-]*", " ")
    return s if re.fullmatch(alt, s, re.I) else None


POSTS = []   # (owner alias, token, text)
for alias, alts in NAMES.items():
    for i, alt in enumerate(alts):
        s = sample(alt)
        ok("sampler: a concrete string for %s form %r" % (alias, alt), s is not None)
        if s:
            tok = "tok-%s-%d" % (alias, i)
            POSTS.append((alias, tok, "%s, %s please look" % (s, tok)))
ok("every NAMES alternative has a post (%d)" % sum(len(v) for v in NAMES.values()),
   len(POSTS) == sum(len(v) for v in NAMES.values()))
print("1. every session x every NAMES form, through the WAKE line (%d posts x %d sessions)" % (len(POSTS), len(NAMES)))
for alias in NAMES:
    wakes, _ = stream(alias, [row(t, sender="Coltrane") for _, _, t in POSTS])
    for owner, tok, text in POSTS:
        got = any(tok in w for w in wakes)
        if owner == alias:
            ok("%s wakes on its own form: %r" % (alias, text.split(",")[0]), got and
               any(w.startswith("WAKE[Coltrane via Discord->%s]" % alias) and tok in w for w in wakes))
        else:
            ok("%s stays silent on %s's form %r" % (alias, owner, text.split(",")[0]), not got)

# ── 2. the crew rule, and the branches that must not change ─────────────────────────────────────────────────
print("2. the crew rule")
CASES = [
    ("CC-A", row("Kyle — the census is done; OLD Claude may want it."), False,
     "a later-only mention in a session post does NOT wake (KD-21)"),
    ("CC-A", row("Langston, and Coltrane, OLD Claude, NEW Claude — all of you", sender="Infra Claude"), True,
     "KD-21 list: OLD Claude in the list wakes CC-A"),
    ("CC-B", row("Langston, and Coltrane, OLD Claude, NEW Claude — all of you", sender="Infra Claude"), True,
     "KD-21 list: NEW Claude in the list wakes CC-B"),
    ("CC-C", row("Langston, and Coltrane, OLD Claude, NEW Claude — all of you", sender="Infra Claude"), False,
     "KD-21 list: CC-C, not in the list, stays silent"),
    ("CC-A", row("Langston, and OLD Claude — r2", sender="NEW Claude"), True,
     "a reviewer then a session: the session wakes"),
    ("CC-C", row("Kyle — heads up @crew, the plan moved", sender="NEW Claude"), True, "@crew anywhere still wakes"),
    ("CC-C", row("Kyle — ALL SESSIONS: pull now", sender="NEW Claude"), True, "ALL SESSIONS anywhere still wakes"),
    ("CC-B", row("> @NEW Claude — do X", sender="OLD Claude"), True, "'> @NEW Claude' (a quote) wakes CC-B, pinned"),
    ("CC-A", row("<@42> OLD Claude — x", sender="NEW Claude"), False,
     "a mention placed FIRST empties the list (why the sender puts it after)"),
    ("CC-A", row("OLD Claude <@42> — x", sender="NEW Claude"), True, "the mention after the list keeps the wake"),
    ("CC-PM", row("Infra Claude, at 3 PM Claude will post", sender="NEW Claude"), False,
     "a clock time after a list does not name CC-PM"),
    ("CC-A", row("OLD Claude — note to self", sender="OLD Claude"), False, "a session's own post never wakes it"),
    ("CC-A", row("please ask OLD Claude about it", sender=None, kind=""), True,
     "Kyle naming a session ANYWHERE still wakes it (unchanged)"),
    ("CC-A", row("nothing named here", sender=None, kind=""), True, "Kyle naming nobody still broadcasts (unchanged)"),
    ("CC-A", row("OLD Claude — a reply for you", sender=None, kind="langston_outbound"), True,
     "Langston's reply opening with my name still wakes (OPEN_RE, unchanged)"),
    ("CC-A", row("NEW Claude — fine; OLD Claude's part is done", sender=None, kind="langston_outbound"), False,
     "Langston's reply naming me only later still does not wake (unchanged)"),
]
for alias, r, want, name in CASES:
    wakes, _ = stream(alias, [r])
    ok(name, bool(wakes) == want, wakes)

_old = subprocess.run(["git", "-C", R1_GIT, "show", "%s:comms-infra/laptop/cc-wake-filter.py" % R1_REF],
                      capture_output=True)
ok("control harness: the pre-batch filter was read from git at R1_REF", _old.returncode == 0,
   _old.stderr.decode("utf-8", "replace")[-200:])
if _old.returncode == 0:
    _of = os.path.join(tempfile.mkdtemp(dir=SCRATCH), "cc-wake-filter.py")
    open(_of, "wb").write(_old.stdout)
    w_old, _ = stream("CC-A", [row("Kyle — the census is done; OLD Claude may want it.")], flt=_of)
    ok("CONTROL pre-batch: the later-only mention DID wake CC-A (so the case above discriminates)", bool(w_old))

# ── 3. the latch ──────────────────────────────────────────────────────────────────────────────────────────────
print("3. the latch: one WAKE per cause, then the old rule (name anywhere)")
GOOD = open(MODULE, "rb").read()
MID = row("Kyle — FYI, OLD Claude may want this one", sender="NEW Claude")


def filter_copy(module_bytes=None, pin_to=None, drop_alias=None):
    """A filter in its own dir, as installed: address_list.py beside it (or absent). pin_to re-pins the copy to a
    planted module's sha (a committed-but-broken module); drop_alias removes that alias's NAMES line."""
    d = os.path.join(tempfile.mkdtemp(dir=SCRATCH), "laptop")
    os.makedirs(d)
    src = open(FILTER, "rb").read()
    if pin_to is not None:
        src, n = re.subn(rb'^ADDRESS_LIST_SHA256 = "[0-9a-f]{64}"',
                         b'ADDRESS_LIST_SHA256 = "' + hashlib.sha256(pin_to).hexdigest().encode() + b'"', src, flags=re.M)
        assert n == 1
    if drop_alias is not None:
        src, n = re.subn(rb'^    "' + drop_alias.encode() + rb'": \[.*\],\r?\n', b"", src, flags=re.M)
        assert n == 1, "NAMES line for %s not found" % drop_alias
    open(os.path.join(d, "cc-wake-filter.py"), "wb").write(src)
    if module_bytes is not None:
        open(os.path.join(d, "address_list.py"), "wb").write(module_bytes)
    return os.path.join(d, "cc-wake-filter.py"), d


def drift_lines(wakes):
    return [w for w in wakes if w.startswith("WAKE[WATCHER-DRIFT->CC-A]")]


_hf, _hd = filter_copy(GOOD)
rc, wakes, err = once("CC-A", _hf, _hd, [MID])
ok("latch CONTROL: healthy install - no DRIFT WAKE, and the mid-text mention stays silent",
   not drift_lines(wakes) and not wakes and rc == 3, (rc, wakes, err[-200:]))

BROKEN = b"import re\nraise re.error('planted at import')\n"
LOWER = GOOD.replace(b"names.append(best[0])", b"names.append(best[0].lower())")
DRIFT1, DRIFT2 = GOOD + b"# drift one\n", GOOD + b"# drift two\n"
for label, kw, cause in [
    ("drift", dict(module_bytes=DRIFT1), "expected " + hashlib.sha256(GOOD).hexdigest()),
    ("absence", dict(), "FileNotFoundError"),
    ("a broken module", dict(module_bytes=BROKEN, pin_to=BROKEN), "planted at import"),
    ("a parser failing the probe", dict(module_bytes=LOWER, pin_to=LOWER), "does not find CC-A"),
    ("a registry without the alias", dict(module_bytes=GOOD, drop_alias="CC-A"), "no entry for CC-A"),
]:
    flt, d = filter_copy(**kw)
    rc1, w1, e1 = once("CC-A", flt, d, [MID])
    ok("latch (%s): the first arm gives ONE WATCHER-DRIFT WAKE naming the cause" % label,
       len(drift_lines(w1)) == 1 and cause in drift_lines(w1)[0], (rc1, w1, e1[-300:]))
    ok("latch (%s): ...and the mid-text mention STILL wakes (noise, never silence)" % label,
       any("FYI, OLD Claude" in w for w in w1) and rc1 == 0, (rc1, w1))
    try:
        rec = json.load(open(os.path.join(d, "CC-A.json"), encoding="utf-8")).get("address_list_latch") or {}
    except (OSError, ValueError) as e:
        rec = {"unreadable": str(e)}
    ok("latch (%s): the cause is recorded in the state file" % label, len(rec) == 1, rec)
    rc2, w2, e2 = once("CC-A", flt, d, [MID])
    ok("latch (%s): the next arm on the SAME cause gives NO drift WAKE" % label, not drift_lines(w2), w2)
    ok("latch (%s): ...and the mid-text mention still wakes" % label, any("FYI, OLD Claude" in w for w in w2), w2)
    if label == "drift":
        open(os.path.join(os.path.dirname(flt), "address_list.py"), "wb").write(DRIFT2)
        rc3, w3, _ = once("CC-A", flt, d, [MID])
        ok("latch (drift): a DIFFERENT sha is a new cause - one new WAKE",
           len(drift_lines(w3)) == 1 and hashlib.sha256(DRIFT2).hexdigest() in drift_lines(w3)[0], w3)
        open(os.path.join(os.path.dirname(flt), "address_list.py"), "wb").write(GOOD)
        rc4, w4, _ = once("CC-A", flt, d, [MID])
        rec4 = json.load(open(os.path.join(d, "CC-A.json"), encoding="utf-8")).get("address_list_latch")
        ok("latch (drift): re-installed - no WAKE, the mention is decided by the list again, the record cleared",
           not w4 and rec4 is None, (w4, rec4))

_sf, _sd = filter_copy(DRIFT1)
for n in (1, 2):
    w, _ = stream("CC-A", [MID], flt=_sf)
    ok("streaming mode (no saved state) reports the latch at every start (start %d)" % n, len(drift_lines(w)) == 1, w)

print("%d passed, %d failed" % (P, F))
shutil.rmtree(SCRATCH, ignore_errors=True)
sys.exit(1 if F else 0)
