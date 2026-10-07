# OBJ-1 resolver for B-CENSUS-OWNERLESS-TRIAGE. Its OWN plan parser (Langston Step-1 condition 2: never census parsePlan,
# which drops deeper row ids). Usage: python resolve1n.py <ref> [--from-ledger] [--bad-control]
#   default: resolve the tokens in data1n.py;  --from-ledger: resolve the CITE tokens written in the W41 TRIAGE lines at <ref>
import re, subprocess, sys, shlex, importlib.util, os
sys.stdout.reconfigure(encoding="utf-8")
REPO = r"C:\DawnTraderV3-old"
ref = sys.argv[1] if len(sys.argv) > 1 else "origin/migration/aws-supabase"
def git(*a, ok=False):
    r = subprocess.run(["git", "-C", REPO, *a], capture_output=True)
    return (r.returncode == 0) if ok else r.stdout.decode("utf-8", "replace")
def show(path):
    r = subprocess.run(["git", "-C", REPO, "show", f"{ref}:{path}"], capture_output=True)
    if r.returncode != 0: raise SystemExit(f"REFUSE: cannot read {path} at {ref}: {r.stderr.decode()[:200]}")
    return r.stdout.decode("utf-8").replace("\r\n", "\n")
plan = show("1-system-manual/SPRINT_TO_LIVE_PLAN.md").split("\n")
al = show("Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md").split("\n")
reports = set(git("ls-tree", "--name-only", f"{ref}:Claude Comms and Packages/Batch Completion").split("\n"))
if len(reports) < 50: raise SystemExit("REFUSE: report listing too small — the read failed")
# §4 rows and §0 lines, by a line scan of their own
sec, s4, s0 = None, {}, []
for l in plan:
    m = re.match(r"^## (\d+)\.", l)
    if m: sec = int(m.group(1)); continue
    if not l.strip().startswith("|"): continue
    c = [x.strip() for x in l.strip().strip("|").split("|")]
    if sec == 4 and len(c) == 7 and re.fullmatch(r"\d+[a-z0-9]*", c[0]): s4[c[0]] = c
    if sec == 0: s0.append(l)
if len(s4) < 200: raise SystemExit(f"REFUSE: only {len(s4)} §4 rows parsed")
after, w = [], False
for l in al:
    if l.startswith("## "): w = l.startswith("## After live"); continue
    if w and l.startswith("- "): after.append(l)
CLOSEMARK = re.compile(r"^(?:✅|~~|\*\*✅|(?:\*\*)?(?:CLOSED|DONE)\b)", re.I)
filecache = {}
def check(tok):
    kind, _, arg = tok.partition(" ")
    if kind == "commit":
        return git("cat-file", "-e", arg + "^{commit}", ok=True) and git("merge-base", "--is-ancestor", arg, ref, ok=True)
    if kind == "report":
        return arg in reports
    if kind == "file":
        m = re.match(r'(.+?):(\d+) "(.*)"$', arg)   # a path may hold spaces
        if not m: return False
        p, n, needle = m.group(1), int(m.group(2)), m.group(3).replace('\\"', '"')
        if p not in filecache:
            try: filecache[p] = show(p).split("\n")
            except SystemExit: filecache[p] = None
        L = filecache[p]
        return bool(L) and n <= len(L) and needle in L[n - 1]
    if kind == "row":
        c = s4.get(arg)
        return bool(c) and not CLOSEMARK.match(c[4])
    if kind == "after":
        t = arg.strip('"'); return any(t in l for l in after)
    if kind == "inflight":
        return any(arg in l for l in s0)
    if kind == "measured":
        return None
    return False
def toks_from_data():
    spec = importlib.util.spec_from_file_location("d", os.path.join(os.path.dirname(__file__), "data1n.py"))
    d = importlib.util.module_from_spec(spec); spec.loader.exec_module(d)
    out = {n: v[2] for n, v in {**d.D, **d.FIVE}.items()}
    out["410b"] = d.SECOND_410[2]
    return out
def toks_from_ledger():
    L = show("1-system-manual/RUNNING_ISSUES.md").split("\n")
    HEAD = re.compile(r"^(?:#{2,4} |- \*\*|\*\*)#(\d+)\b")
    cur, out = None, {}
    for l in L:
        m = HEAD.match(l)
        if m: cur = int(m.group(1))
        if "W41 TRIAGE (CC-A" in l and cur is not None:
            m2 = re.search(r"CITE: (.*?)(?: ¶|$)", l)
            key = cur if cur not in out else f"{cur}b"
            out[key] = [t.strip() for t in m2.group(1).split(" · ")] if m2 else []
    return out
toks = toks_from_ledger() if "--from-ledger" in sys.argv else toks_from_data()
if "--bad-control" in sys.argv:
    toks["CONTROL"] = ["commit deadbeef1", "report NO_SUCH_REPORT.md", 'file server/index.ts:1 "no such needle xyz"', "row 999z", 'after "no such after-live line"']
bad, meas, okc = [], 0, 0
for n, ts in toks.items():
    if not ts: bad.append((n, "(no CITE tokens)")); continue
    for t in ts:
        r = check(t)
        if r is None: meas += 1
        elif r: okc += 1
        else: bad.append((n, t))
print(f"{ref}: issues {len(toks)} · tokens resolved {okc} · measured (not scriptable) {meas} · UNRESOLVED {len(bad)}")
for n, t in bad: print(f"  UNRESOLVED #{n}: {t}")
