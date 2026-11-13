#!/usr/bin/env python3
"""Tests for dt-deploy-notice.py (B-DEPLOY-WINDOW-GUARD P12 (iv)). Run: python3 comms-infra/discord/test_dt_deploy_notice.py

In-process: the module's ssh/post are replaced by recorders that answer from a fake staging. EVERY start and outcome
post is fed back through address_list.opening_addressees - the same parser every consumer's wake decision uses - and
must return EXACTLY the owner sessions. Expected outcomes are written in each check before it runs. Exit 0 = all pass.
`--mutate` removes one property at a time and requires the suite to fail for each (judged by exit code).
"""
import importlib.util
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("NOTICE_SRC") or os.path.join(HERE, "dt-deploy-notice.py")
spec = importlib.util.spec_from_file_location("address_list", os.path.join(HERE, "address_list.py"))
AL = importlib.util.module_from_spec(spec)
spec.loader.exec_module(AL)
PASS = FAIL = 0


def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print("FAIL: %s %s" % (name, str(detail)[:400]))


def load():
    s = importlib.util.spec_from_file_location("dtn", SRC)
    m = importlib.util.module_from_spec(s)
    s.loader.exec_module(m)
    return m


SHA = "1" * 40
OTHER = "2" * 40
T0 = 1_800_000_000          # a fixed clock
ISO0 = "2027-01-15T08:00:00Z"
D = tempfile.mkdtemp(prefix="dtn-t-")


class World:
    def __init__(self):
        self.notice = []
        self.record = {"sha": OTHER, "deployed_at": "2027-01-14T08:00:00Z", "deployed_via": "deploy@x via root"}
        self.posts, self.resolves, self.adds, self.hb = [], [], [], []
        self.post_ok, self.resolve_ok, self.ssh_ok = True, True, True


def wire(m, w, clock):
    m.STATE, m.LOG, m.NOW = os.path.join(D, "state.json"), os.path.join(D, "log"), clock

    def ssh(cmd, timeout=120):
        if not w.ssh_ok:
            return None, "unreachable"
        if "resolve-key" in cmd:
            (w.hb if "heartbeat" in cmd else w.resolves).append(cmd)
            return ("ok", None) if w.resolve_ok else (None, "exit 1")
        if " add " in cmd:
            w.adds.append(cmd)
            return "ok", None
        rec = "\n".join("%s=%s" % kv for kv in w.record.items())
        return "\n".join(w.notice) + ("\n" if w.notice else "") + m.SEP + "\n" + rec + "\n", None

    def post(text):
        if not w.post_ok:
            return None
        w.posts.append(text)
        return str(900 + len(w.posts))
    m.ssh, m.post = ssh, post


def line(sha, at, in_window, notice="alerted"):
    return "attempt_at=%s sha=%s by=cc-infra in_window=%s window_notice=%s register_sha=%s" % (at, sha, in_window, notice, "c" * 40)


def fresh():
    try:
        os.unlink(os.path.join(D, "state.json"))
    except FileNotFoundError:
        pass


def wakes(text):
    return AL.opening_addressees(text, AL.REGISTRY)


def suite():
    m = load()
    w = World()
    fresh()
    w.notice = [line(OTHER, "2027-01-14T07:59:00Z", "B-OLD/cc-b/open")]
    wire(m, w, T0)
    rc = m.run()
    check("first run: silent, exit 0, the existing line is not posted", rc == 0 and w.posts == [], w.posts)
    w.notice.append(line(SHA, ISO0, "B-X/cc-b/open,B-Y/cc-a/stale"))
    wire(m, w, T0 + 30)
    rc = m.run()
    check("a new in-window line -> ONE start post", rc == 0 and len(w.posts) == 1, w.posts)
    check("the start post wakes EXACTLY the two owner sessions (opening list parsed by address_list)",
          w.posts and wakes(w.posts[0]) == {"CC-B", "CC-A"}, w.posts and wakes(w.posts[0]))
    check("... and names both windows and their states", w.posts and "B-X (open, owner cc-b)" in w.posts[0]
          and "B-Y (stale, owner cc-a)" in w.posts[0], w.posts)
    wire(m, w, T0 + 600)
    m.run()
    check("no record yet, under 30 min: nothing more is posted or resolved", len(w.posts) == 1 and w.resolves == [],
          (w.posts, w.resolves))
    w.record = {"sha": SHA, "deployed_at": "2027-01-15T08:04:00Z", "deployed_via": "deploy@x via root"}
    wire(m, w, T0 + 660)
    m.run()
    check("the record shows the sha after the attempt -> a COMPLETED post to the same owners",
          len(w.posts) == 2 and "COMPLETED" in w.posts[1] and wakes(w.posts[1]) == {"CC-B", "CC-A"}, w.posts)
    keys = sorted(c.split("resolve-key ")[1].split(" ")[0].strip("'") for c in w.resolves)
    check("... and resolves each window's alert by its exact key, as the machine actor",
          keys == sorted(["deploy-in-window:B-X:%s:20270115T080000Z" % SHA, "deploy-in-window:B-Y:%s:20270115T080000Z" % SHA])
          and all("--by deploy-notice-watcher" in c for c in w.resolves), w.resolves)
    check("... the evidence cites the record and both post ids", w.resolves and "deployed_at=2027-01-15T08:04:00Z" in w.resolves[0]
          and "901,902" in w.resolves[0], w.resolves)
    n = len(w.posts)
    wire(m, w, T0 + 720)
    m.run()
    check("a finished attempt is not posted again", len(w.posts) == n, w.posts[n:])

    # an attempt whose record never comes: DID NOT COMPLETE after 30 min
    w.resolves.clear()
    w.notice.append(line(OTHER, "2027-01-15T09:00:00Z", "B-X/cc-b/open"))
    wire(m, w, T0 + 3600 + 10)
    m.run()
    wire(m, w, T0 + 3600 + 31 * 60)
    m.run()
    check("no record within 30 min -> DID NOT COMPLETE, to the owner", "DID NOT COMPLETE" in w.posts[-1]
          and wakes(w.posts[-1]) == {"CC-B"}, w.posts[-1])
    check("... and its alert is resolved citing that", len(w.resolves) == 1 and "did not complete" in w.resolves[0], w.resolves)

    # an OLDER deploy of the same sha is not this attempt's completion
    w.resolves.clear()
    w.record = {"sha": SHA, "deployed_at": "2027-01-15T08:04:00Z"}
    w.notice.append(line(SHA, "2027-01-15T10:00:00Z", "B-X/cc-b/open"))
    wire(m, w, T0 + 7200 + 60)
    m.run()
    wire(m, w, T0 + 7200 + 120)
    m.run()
    check("a record of the same sha deployed BEFORE the attempt is not its completion",
          "COMPLETED" not in w.posts[-1] and "STARTED" in w.posts[-1], w.posts[-1])

    # notice-only: posts, never resolves
    fresh(); w2 = World(); w2.notice = []
    wire(m, w2, T0); m.run()
    w2.notice.append(line(SHA, ISO0, "B-X/cc-c/open", notice="notice-only"))
    w2.record = {"sha": SHA, "deployed_at": "2027-01-15T08:05:00Z"}
    wire(m, w2, T0 + 400); m.run()
    check("notice-only: the start post says the alert could NOT be raised", "COULD NOT BE RAISED" in w2.posts[0], w2.posts)
    check("notice-only: completed is posted and NOTHING is resolved (there is no alert)",
          len(w2.posts) == 2 and w2.resolves == [], (w2.posts, w2.resolves))

    # owners with no session: the post wakes nobody, and says so
    fresh(); w3 = World(); w3.notice = []
    wire(m, w3, T0); m.run()
    w3.notice.append(line(SHA, ISO0, "B-Z/codex-b/open"))
    wire(m, w3, T0 + 30); m.run()
    check("a Codex owner is named but not put in the opening list; the post wakes nobody (control)",
          wakes(w3.posts[0]) == set() and "codex-b" in w3.posts[0], w3.posts)

    # a post that fails: the line is not skipped
    fresh(); w4 = World(); w4.notice = []
    wire(m, w4, T0); m.run()
    w4.notice.append(line(SHA, ISO0, "B-X/cc-b/open"))
    w4.post_ok = False
    wire(m, w4, T0 + 30); rc = m.run()
    check("a failed start post -> exit 1 and the line is NOT marked seen", rc == 1 and json.load(open(m.STATE))["seen"] == 0,
          json.load(open(m.STATE)))
    w4.post_ok = True
    wire(m, w4, T0 + 90); m.run()
    check("... and the next run posts it", len(w4.posts) == 1 and wakes(w4.posts[0]) == {"CC-B"}, w4.posts)

    # a resolve that fails is retried, the outcome is not re-posted
    w4.record = {"sha": SHA, "deployed_at": "2027-01-15T08:05:00Z"}
    w4.resolve_ok = False
    wire(m, w4, T0 + 400); m.run()
    n = len(w4.posts)
    w4.resolve_ok = True
    wire(m, w4, T0 + 460); m.run()
    check("a failed resolve is retried next run without a second outcome post",
          len(w4.posts) == n and json.load(open(m.STATE))["pending"] == {}, (w4.posts, json.load(open(m.STATE))))

    # staging unreachable: exit 1, nothing changes
    w4.ssh_ok = False
    wire(m, w4, T0 + 500)
    check("staging unreachable -> exit 1", m.run() == 1)

    # heartbeat: armed once per UTC day, due 26 h out
    fresh(); w5 = World()
    wire(m, w5, T0); m.run(); m.run()
    check("heartbeat: armed once per day, not every run", len(w5.adds) == 1 and "--dedupe-key deploy-notice-watcher-heartbeat" in w5.adds[0],
          w5.adds)
    check("heartbeat: due 26 h ahead", m.iso(T0 + 26 * 3600) in w5.adds[0], w5.adds)
    wire(m, w5, T0 + 86400); m.run()
    check("heartbeat: re-armed the next day", len(w5.adds) == 2, w5.adds)
    print("dt-deploy-notice suite: %d passed, %d failed" % (PASS, FAIL))
    return 1 if FAIL else 0


MUTATIONS = [
    ("owners not put in the opening list", '    head = ", ".join(names) if names else', '    head = "Deploy notice" if names else'),
    ("an older deploy of the sha counts as completion", "and parse_iso(rec[\"deployed_at\"]) >= started)", ")"),
    ("no 30-min not-completed", "if not done and now() - started < OUTCOME_WAIT_S:", "if not done:"),
    ("a failed post skips the line", "            failed = True\n            break", "            failed = True\n            st[\"seen\"] += 1\n            break"),
    ("notice-only lines resolve too", '        if f.get("window_notice") == "alerted":', "        if True:"),
    ("outcome re-posted on retry", '        if "outcome_post" not in p:', "        if True:"),
    ("first run posts", '        log("INIT %d existing notice line(s), silent" % len(lines))', '        st["seen"] = 0'),
    ("heartbeat every run", '    if st.get("heartbeat_day") == day:\n        return', '    if False:\n        return'),
]


def mutate():
    src = open(SRC, encoding="utf-8").read()
    base = subprocess.run([sys.executable, os.path.abspath(__file__)], capture_output=True, text=True)
    if base.returncode != 0:
        print("ABORT: the unmutated suite fails:\n" + base.stdout[-800:])
        return 2
    bad = 0
    for label, a, b in MUTATIONS:
        if src.count(a) != 1:
            print("MUTATION NOT APPLIED (%d matches): %s" % (src.count(a), label)); bad += 1; continue
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "dt-deploy-notice.py")
            open(p, "w", encoding="utf-8").write(src.replace(a, b))
            r = subprocess.run([sys.executable, os.path.abspath(__file__)], env=dict(os.environ, NOTICE_SRC=p),
                               capture_output=True, text=True)
            last = (r.stdout.strip().splitlines() or ["?"])[-1]
            clean = last.startswith("dt-deploy-notice suite:") and not last.endswith(" 0 failed")
            print("%-9s %-48s %s" % ("killed" if r.returncode != 0 and clean else "PROBLEM", label, last))
            bad += 0 if (r.returncode != 0 and clean) else 1
    print("mutations: %d, problems: %d" % (len(MUTATIONS), bad))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(mutate() if sys.argv[1:] == ["--mutate"] else suite())
