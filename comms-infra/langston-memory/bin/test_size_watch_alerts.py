#!/usr/bin/env python3
"""B-SIZE-WATCH-BREACH-ALARM (#1215) - the size watches' alert rows, driven through their PRODUCTION entry points.

    python3 test_size_watch_alerts.py            (exit 0 = every check passed)

⛔ WHY IT DRIVES run() / cmd_run() AND NOT THE HELPERS (my standing lesson, Langston: "your tests test the function;
   nothing tests the connection"). Every check below calls the tool's own daily-run entry with only its OUTSIDE world
   replaced: the staging alert CLI (`_alerts`) by FakeStore, Discord (`post`) by a recorder, the rules check and the
   archive walk by fixtures, and the state/run-log/watched paths by files in a private directory.
⛔ FakeStore reproduces the behaviours of server/services/system-alerts.ts the design rests on, and nothing else:
   ADD - a dedupe key matching a NON-resolved row returns that row unchanged; a resolved row does not block a fresh one.
   RESOLVE (Langston, Step 4: the first version modelled this WRONG) - resolveAlert has no state guard, so re-resolving
   a resolved row succeeds (exit 0); an id that does not exist exits 1 with exactly `Alert <id> not found` on stderr
   (scripts/system-alerts.ts cmdResolve). A broken transport (`fail_resolve` set to an error string) exits non-zero
   with that string. If the real store ever changes any of these, these checks stop describing production.
⛔ The private directory is under $HOME, never /tmp (#979: a shared /tmp shadowed an import on Helsinki 2026-11-13).
Paths of the tools under test can be overridden (SIZE_WATCH_PATH, COLTRANE_WATCH_PATH, MEMORY_WRITE_PATH) so the
mutation runner can point this at a mutated copy."""
import importlib.machinery
import importlib.util
import json
import os
import shutil
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
SIZE_WATCH = os.environ.get("SIZE_WATCH_PATH") or os.path.join(HERE, "langston-size-watch")
COLTRANE_WATCH = os.environ.get("COLTRANE_WATCH_PATH") or os.path.join(REPO, "comms-infra", "codex", "coltrane-size-watch")
MEMORY_WRITE = os.environ.get("MEMORY_WRITE_PATH") or os.path.join(HERE, "langston-memory-write")

FAILS = []
PASSES = 0


def check(name, got, want):
    global PASSES
    if got == want:
        PASSES += 1
        print("PASS  %s" % name)
    else:
        FAILS.append(name)
        print("FAIL  %s  (expected %r, got %r)" % (name, want, got))


def load(path, name):
    loader = importlib.machinery.SourceFileLoader(name, path)
    spec = importlib.util.spec_from_loader(name, loader)
    mod = importlib.util.module_from_spec(spec)
    sys.dont_write_bytecode = True
    loader.exec_module(mod)
    return mod


class FakeStore:
    def __init__(self):
        self.rows, self.calls, self.n = [], [], 0
        self.fail_resolve = False
        self.fail_add = False

    def __call__(self, argv):
        self.calls.append(list(argv))
        if argv[0] == "add":
            if self.fail_add:
                return 1, "", "ssh: connect to host 188.245.193.8 port 22: Connection timed out"
            key = argv[argv.index("--dedupe-key") + 1]
            for r in self.rows:
                if r["key"] == key and r["state"] != "resolved":
                    return 0, json.dumps({"id": r["id"]}), ""
            self.n += 1
            row = {"id": "id-%03d" % self.n, "key": key, "state": "scheduled",
                   "severity": argv[argv.index("--severity") + 1],
                   "title": argv[argv.index("--title") + 1], "body": argv[argv.index("--body") + 1],
                   "triggers_at": argv[argv.index("--triggers-at") + 1]}
            self.rows.append(row)
            return 0, json.dumps({"id": row["id"]}), ""
        if argv[0] == "resolve":
            if self.fail_resolve:
                err = self.fail_resolve if isinstance(self.fail_resolve, str) else "ssh: connect: Connection timed out"
                return (127 if "command not found" in err else 1), "", err
            for r in self.rows:
                if r["id"] == argv[1]:
                    r["state"] = "resolved"                         # no state guard: a re-resolve also exits 0
                    r["evidence"] = argv[argv.index("--evidence") + 1]
                    return 0, json.dumps({"id": r["id"]}), ""
            return 1, "", "Alert %s not found" % argv[1]
        return 2, "", "unknown verb"

    def by_key(self, key):
        return [r for r in self.rows if r["key"] == key]

    def active(self, key):
        return [r for r in self.by_key(key) if r["state"] != "resolved"]

    def adds(self, key):
        return [c for c in self.calls if c[0] == "add" and c[c.index("--dedupe-key") + 1] == key]

    def hand_resolve(self, key):
        for r in self.active(key):
            r["state"] = "resolved"


# ─────────────────────────────── langston-size-watch ───────────────────────────────

def langston_world(tmp, ceiling=1000):
    m = load(SIZE_WATCH, "lsw_%d" % len(os.listdir(tmp)))
    f1, f2, f3 = (os.path.join(tmp, n) for n in ("CLAUDE.md", "MEMORY.md", "INDEX.md"))
    m.WATCHED = [(f1, "rules"), (f2, "memory"), (f3, "index")]
    m.STATE = os.path.join(tmp, "ratchet-state.json")
    m.RUNLOG = os.path.join(tmp, "size-watch.jsonl")
    m.GUARD_PATH = os.path.join(tmp, "langston-index-guard")       # absent unless a test writes it
    m.GUARD_LOG = os.path.join(tmp, "langston-index-guard.jsonl")
    m.CLI_PACKAGE = os.path.join(tmp, "package.json")
    store = FakeStore()
    m._alerts = store
    m.post = lambda msg, quiet: "recorded"
    world = {"rules": {"target": "x", "record": {"commit": "c"}, "tamper": [], "pending": None, "unknown": []},
             "archive": {"path": "a", "present": True, "bytes": 10, "files": 1, "unreadable": []}}
    m.rules_check = lambda *a, **k: json.loads(json.dumps(world["rules"]))
    m.measure_archive = lambda: json.loads(json.dumps(world["archive"]))
    with open(m.STATE, "w", encoding="utf-8") as fh:
        json.dump({"ceiling_bytes": ceiling, "set_at": "2026-09-05T09:33:05Z", "set_by": "first-run seed",
                   "history": [{"ts": "2026-09-05T09:33:05Z", "ceiling": ceiling, "by": "first-run seed"}]}, fh)
    return m, store, world, (f1, f2, f3)


def sizes(paths, a, b, c):
    for p, n in zip(paths, (a, b, c)):
        with open(p, "w", encoding="utf-8") as fh:
            fh.write("x" * n)


def state(m):
    with open(m.STATE, encoding="utf-8") as fh:
        return json.load(fh)


def test_langston(tmp):
    B, MF, AR, TP = (m_key for m_key in ("langston-size-watch-breach", "langston-size-watch-missing-file",
                                          "langston-size-watch-archive", "langston-rules-tamper"))
    m, store, world, paths = langston_world(tmp)

    # 1. over -> one add on the breach key, id saved
    sizes(paths, 600, 400, 100)                        # 1100 > 1000
    rc = m.run(quiet=True)
    check("L1 an over-ceiling run exits 1", rc, 1)
    check("L1 exactly one breach row exists", len(store.by_key(B)), 1)
    check("L1 its id is stored", state(m).get("breach_alert_id"), store.by_key(B)[0]["id"])
    body = store.by_key(B)[0]["body"]
    check("L1 the body states its measurement time", "Measured 20" in body, True)
    check("L1 the body names where the live number is", "langston-size-watch --status" in body, True)
    check("L1 the body names the owner", "Owner CC-INFRA" in body, True)
    check("L1 the body names which file is which size", "CLAUDE.md=600" in body, True)
    check("L1 an episode is open", state(m)["breach_episodes"][-1]["end"], None)

    # 2. over again -> add called, the SAME id, no new row
    first = store.by_key(B)[0]["id"]
    n_adds = len(store.adds(B))
    m.run(quiet=True)
    check("L2 a second over run still calls add", len(store.adds(B)), n_adds + 1)
    check("L2 and gets the SAME id back", state(m).get("breach_alert_id"), first)
    check("L2 and NO new row exists", len(store.by_key(B)), 1)

    # 2a. over, prior resolved by hand -> a NEW row, its id stored (the r1 latch)
    store.hand_resolve(B)
    sizes(paths, 700, 400, 100)                        # peak rises to 1200
    m.run(quiet=True)
    check("L2a after a hand-resolve a NEW breach row exists", len(store.by_key(B)), 2)
    check("L2a exactly one is active", len(store.active(B)), 1)
    check("L2a the stored id is the new one", state(m).get("breach_alert_id"), store.active(B)[0]["id"])
    check("L2a the episode peak follows the larger overage", state(m)["breach_episodes"][-1]["peak_over"], 200)

    # 4. a file missing with the total UNDER the ceiling -> missing row, breach NOT resolved (C-1)
    sizes(paths, 300, 300, 1)
    os.remove(paths[2])                                # 600 < 1000 with the index MISSING
    open_breach = state(m).get("breach_alert_id")
    rc = m.run(quiet=True)
    check("L4 a missing-file run exits 1", rc, 1)
    check("L4 a missing-file row is raised", len(store.active(MF)), 1)
    check("L4 the breach id is NOT cleared", state(m).get("breach_alert_id"), open_breach)
    check("L4 the breach row is still active", len(store.active(B)), 1)
    check("L4 the open episode is NOT closed", state(m)["breach_episodes"][-1]["end"], None)

    # 5. file restored, set still over -> missing resolved, breach still open (C-2)
    sizes(paths, 600, 400, 100)
    m.run(quiet=True)
    check("L5 the missing-file row is resolved", len(store.active(MF)), 0)
    check("L5 the missing-file id is cleared", state(m).get("missing_alert_id"), None)
    check("L5 the breach row is still active", len(store.active(B)), 1)

    # 6. under, but the transport fails -> id kept, retried next run. ⛔ These are the REAL failure strings Langston
    #    drove the old discharge test with: each one contains "no such" or "not found" and was read as DISCHARGED.
    sizes(paths, 300, 300, 100)                        # 700 < 1000
    for err in ("cd: /home/deploy/dawntrader: No such file or directory", "bash: npm: command not found",
                "sudo: ssh: command not found", "ssh: connect to host 188.245.193.8 port 22: Connection timed out"):
        store.fail_resolve = err
        m.run(quiet=True)
        check("L6 a transport failure is NOT a discharge (%s)" % err[:30], state(m).get("breach_alert_id"),
              open_breach)
    check("L6 and the row stays active", len(store.active(B)), 1)
    store.fail_resolve = False

    # 3. under -> resolve with run-log evidence, id cleared, episode closed
    m.run(quiet=True)
    check("L3 an under run resolves the breach row", len(store.active(B)), 0)
    check("L3 the id is cleared", state(m).get("breach_alert_id"), None)
    ev = [r for r in store.by_key(B) if r["id"] == open_breach][0].get("evidence", "")
    check("L3 the evidence is a run-log line reference", ev.startswith(m.RUNLOG + ":"), True)
    check("L3 the episode is closed", state(m)["breach_episodes"][-1]["end"] is not None, True)
    check("L3 an under run exits 0", m.run(quiet=True), 0)

    # 7. a prior resolved by hand, then a clean run -> discharged, id cleared
    sizes(paths, 600, 500, 100)
    m.run(quiet=True)
    store.hand_resolve(B)
    sizes(paths, 300, 300, 100)
    m.run(quiet=True)
    check("L7 a hand-resolved prior is discharged, id cleared", state(m).get("breach_alert_id"), None)

    # 7b. a prior that no longer exists (the CLI's exact not-found shape) -> discharged, id cleared
    sizes(paths, 600, 500, 100)
    m.run(quiet=True)
    gone = state(m).get("breach_alert_id")
    store.rows = [x for x in store.rows if x["id"] != gone]
    sizes(paths, 300, 300, 100)
    m.run(quiet=True)
    check("L7b a prior that no longer exists is discharged, id cleared", state(m).get("breach_alert_id"), None)

    # 9. tamper: unknown from lsattr -> no resolve; unknown only from the branch-head read -> resolves
    world["rules"]["tamper"] = ["its immutable flag is NOT set (lsattr ----)"]
    m.run(quiet=True)
    check("L9 a tamper row is raised", len(store.active(TP)), 1)
    world["rules"]["tamper"] = []
    world["rules"]["unknown"] = ["lsattr could not read its flags (1)"]
    m.run(quiet=True)
    check("L9 tamper NOT resolved while lsattr could not answer", len(store.active(TP)), 1)
    world["rules"]["unknown"] = ["the branch-head comparison could not run (OSError: x)"]
    m.run(quiet=True)
    check("L9 tamper resolved when only assertion (3) is unknown", len(store.active(TP)), 0)
    world["rules"]["unknown"] = []

    # archive
    world["archive"]["unreadable"] = ["/x"]
    m.run(quiet=True)
    check("LA an unreadable archive file raises the archive row", len(store.active(AR)), 1)
    world["archive"]["unreadable"] = []
    m.run(quiet=True)
    check("LA a clean archive resolves it", len(store.active(AR)), 0)

    # 8. drill -> its own key only; a real id is untouched; a failed drill resolve is not a pass
    sizes(paths, 600, 500, 100)
    m.run(quiet=True)
    real = state(m).get("breach_alert_id")
    rc = m.run(quiet=True, injected_total=5000, drill_store=True)
    check("L8 a drill exits 1 like a breach", rc, 1)
    check("L8 the drill row exists and is resolved",
          [r["state"] for r in store.by_key("langston-size-watch-breach-drill")], ["resolved"])
    check("L8 the drill row is info", store.by_key("langston-size-watch-breach-drill")[0]["severity"], "info")
    check("L8 the real breach id is untouched", state(m).get("breach_alert_id"), real)
    store.fail_resolve = "cd: /home/deploy/dawntrader: No such file or directory"
    rc = m.run(quiet=True, injected_total=5000, drill_store=True)
    store.fail_resolve = False
    check("L8 a drill whose resolve fails exits 3", rc, 3)
    drills_before = len(store.by_key("langston-size-watch-breach-drill"))
    calls_before = len(store.calls)
    rc = m.run(quiet=True, injected_total=5000)
    check("L8 a self-test run (no drill_store) writes no drill row",
          len(store.by_key("langston-size-watch-breach-drill")), drills_before)
    check("L8 and makes no alert call at all", len(store.calls), calls_before)

    # C-3: a crash after the add keeps the id (it was saved before anything else could fail)
    m2, store2, _w2, paths2 = langston_world(tmp)
    sizes(paths2, 600, 500, 100)

    def boom(*a, **k):
        raise RuntimeError("simulated crash after the alerts")
    m2.update_episodes = boom
    try:
        m2.run(quiet=True)
        crashed = False
    except RuntimeError:
        crashed = True
    check("C3 the simulated crash happened", crashed, True)
    check("C3 the breach id was persisted before the crash",
          state(m2).get("breach_alert_id"), store2.by_key("langston-size-watch-breach")[0]["id"])

    # (g) the episode cap drops the oldest and says so in the run row
    m3, store3, _w3, paths3 = langston_world(tmp)
    st3 = state(m3)
    st3["breach_episodes"] = [{"start": "s%d" % i, "end": "e%d" % i, "peak_over": 1, "peak_total": 1}
                              for i in range(100)]
    with open(m3.STATE, "w", encoding="utf-8") as fh:
        json.dump(st3, fh)
    sizes(paths3, 600, 500, 100)
    m3.run(quiet=True)
    check("G the cap keeps 100 episodes", len(state(m3)["breach_episodes"]), 100)
    with open(m3.RUNLOG, encoding="utf-8") as fh:
        last = json.loads(fh.read().strip().split("\n")[-1])
    check("G the run row says an episode was dropped", "dropped the 1 oldest" in (last.get("episodes_note") or ""),
          True)

    # LR. rules_check: a missing file is named as missing; an lsattr that cannot run does NOT discard (1)/(2) findings
    m4 = load(SIZE_WATCH, "lsw_rules")
    rec = os.path.join(tmp, "INSTALLED")
    with open(rec, "w", encoding="utf-8") as fh:
        json.dump({"commit": "c0ffee", "blob": "b", "sha256": "0" * 64, "installed_at": "t"}, fh)

    class NoLsattr:
        @staticmethod
        def run(*a, **k):
            raise FileNotFoundError("lsattr")
    m4.subprocess = NoLsattr
    gone = os.path.join(tmp, "no-such-CLAUDE.md")
    try:
        r1 = m4.rules_check(target=gone, record=rec, installer=os.path.join(tmp, "no-installer"))
    except Exception as e:
        r1 = {"tamper": ["raised %s" % type(e).__name__], "unknown": []}
    check("LR a missing rules file reads as missing, not as a link", r1["tamper"], ["%s does not exist" % gone])
    present = os.path.join(tmp, "CLAUDE-rules.md")
    with open(present, "w", encoding="utf-8") as fh:
        fh.write("not the installed content")
    try:
        r2 = m4.rules_check(target=present, record=rec, installer=os.path.join(tmp, "no-installer"))
    except Exception as e:
        r2 = None
    check("LR an lsattr that cannot run does not raise out of rules_check", r2 is not None, True)
    check("LR and the content mismatch already found is KEPT",
          any("differs from the installed commit" in t for t in (r2 or {}).get("tamper", [])), True)
    check("LR and the lsattr failure is reported as unknown",
          any("lsattr could not read" in u for u in (r2 or {}).get("unknown", [])), True)

    # 10. langston-memory-write still reads the ceiling from a state file carrying the new fields
    os.environ["LANGSTON_HOME"] = tmp
    os.environ["LMW_RATCHET_STATE"] = m.STATE
    try:
        w = load(MEMORY_WRITE, "lmw_test")
        r = w.read_ratchet(0)
        check("R10 read_ratchet reads the ceiling unchanged", r.get("ceiling_bytes"), 1000)
        check("R10 and raises no unknown about the state", r.get("unknown"), None)
    finally:
        os.environ.pop("LANGSTON_HOME", None)
        os.environ.pop("LMW_RATCHET_STATE", None)


def test_guard(tmp):
    """R-3 (Langston Step 4): the size watch is the reader of the index guard's version and its unenumerated refusals."""
    GC, GT = "langston-index-guard-cli-mismatch", "langston-index-guard-unenumerated-tool"
    GU = "langston-index-guard-could-not-establish"
    GB = "langston-index-guard-reader-blind"
    m, store, world, paths = langston_world(tmp)
    sizes(paths, 300, 300, 100)                         # 700 < 1000: nothing else is active

    def guard(ver):
        with open(m.GUARD_PATH, "w", encoding="utf-8") as fh:
            fh.write('#!/usr/bin/env python3\nCLI_VERSION_ENUMERATED = "%s"\n' % ver)

    def cli(ver):
        with open(m.CLI_PACKAGE, "w", encoding="utf-8") as fh:
            json.dump({"version": ver}, fh)

    def logrow(**kw):
        with open(m.GUARD_LOG, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(kw) + "\n")

    # G0. guard not installed -> neither condition touched, exit 0
    cli("2.1.318")
    rc = m.run(quiet=True)
    check("G0 no guard: exit 0", rc, 0)
    check("G0 no guard: no add on either guard key", (len(store.adds(GC)), len(store.adds(GT))), (0, 0))

    # G1. installed, versions match, empty log -> nothing raised
    guard("2.1.318")
    rc = m.run(quiet=True)
    check("G1 match: exit 0, no guard rows", (rc, len(store.by_key(GC)), len(store.by_key(GT))), (0, 0, 0))

    # G2. CLI bumped -> cli-mismatch row, exit 1; back in step -> NOT auto-resolved (re-review (a): hand resolve + evidence)
    cli("2.1.400")
    rc = m.run(quiet=True)
    check("G2 mismatch: exit 1", rc, 1)
    check("G2 mismatch: one active cli row", len(store.active(GC)), 1)
    check("G2 the body names both versions", all(v in store.active(GC)[0]["body"] for v in ("2.1.400", "2.1.318")), True)
    guard("2.1.400")
    rc = m.run(quiet=True)
    check("G2b back in step: the cli row is NOT auto-resolved", len(store.active(GC)), 1)
    check("G2b and the run exits 0 (nothing is currently wrong)", rc, 0)
    check("G2b the body says resolve by hand with the checklist evidence", "resolve by hand" in store.active(GC)[0]["body"], True)
    store.hand_resolve(GC)

    # G3. an unenumerated refusal in the log -> tool row; the offset moves; a quiet next run does NOT resolve it
    logrow(verdict="allowed-no-growth", tool="Edit")
    logrow(verdict="refused", tool="NotebookEdit", message="REFUSED by langston-index-guard: 'NotebookEdit' is not a "
           "tool this guard was enumerated for (Claude Code 2.1.400)", cli_running="2.1.400")
    rc = m.run(quiet=True)
    check("G3 unenumerated refusal: exit 1", rc, 1)
    check("G3 one active tool row", len(store.active(GT)), 1)
    check("G3 the offset is the log's size", state(m).get("guard_log_offset"), os.path.getsize(m.GUARD_LOG))
    n = len(store.adds(GT))
    rc = m.run(quiet=True)
    check("G3b quiet next run: no new add", len(store.adds(GT)), n)
    check("G3b and the row is NOT auto-resolved", len(store.active(GT)), 1)
    check("G3b and the run exits 0 (nothing new)", rc, 0)

    # G4. an OVER refusal (an enumerated tool) is the guard working: no tool row, no could-not-establish row
    store.hand_resolve(GT)
    logrow(verdict="refused", tool="Write", message="REFUSED by langston-index-guard: ... OVER its ceiling ...")
    m.run(quiet=True)
    check("G4 an over-ceiling refusal raises no tool row", len(store.active(GT)), 0)
    check("G4 and no could-not-establish row", len(store.active(GU)), 0)

    # G6. a fail-closed refusal (could not establish) gets its OWN row, never auto-resolved (re-review (b))
    logrow(verdict="refused", tool="Edit", message="REFUSED by langston-index-guard: this write grows the auto-memory "
           "index by 9 B and the loaded-set size COULD NOT BE ESTABLISHED: the ratchet state cannot be read")
    rc = m.run(quiet=True)
    check("G6 a could-not-establish refusal: exit 1", rc, 1)
    check("G6 one active could-not-establish row", len(store.active(GU)), 1)
    check("G6 and no tool row", len(store.active(GT)), 0)
    m.run(quiet=True)
    check("G6b quiet next run: still active", len(store.active(GU)), 1)
    store.hand_resolve(GU)

    # G5. the log replaced by a shorter one -> read from 0, the new refusal is seen
    with open(m.GUARD_LOG, "w", encoding="utf-8") as fh:
        fh.write(json.dumps({"verdict": "refused", "tool": "FutureWrite",
                             "message": "x is not a tool this guard was enumerated for"}) + "\n")
    m.run(quiet=True)
    check("G5 a shorter log is read from 0", len(store.active(GT)), 1)
    check("G5 the body names the byte to re-read from", "re-read it from byte 0" in store.active(GT)[0]["body"], True)
    store.hand_resolve(GT)

    # G7. C-1: a refusal whose alert add FAILED is not skipped - the offset stays, the next healthy run mints it
    off_before = state(m).get("guard_log_offset")
    logrow(verdict="refused", tool="FutureWrite", message="FutureWrite is not a tool this guard was enumerated for")
    store.fail_add = True
    m.run(quiet=True)
    check("G7 add failing: no tool row", len(store.active(GT)), 0)
    check("G7 add failing: the offset did NOT advance", state(m).get("guard_log_offset"), off_before)
    store.fail_add = False
    m.run(quiet=True)
    check("G7b healthy store: the refusal is minted on the next run", len(store.active(GT)), 1)
    check("G7b and the offset now covers it", state(m).get("guard_log_offset"), os.path.getsize(m.GUARD_LOG))
    store.hand_resolve(GT)

    # G9. fold-in 1: a row cut short is NOT consumed - the offset stops at the last newline, the row is read whole later
    store.hand_resolve(GB)
    off9 = state(m).get("guard_log_offset")
    part = json.dumps({"verdict": "refused", "tool": "HalfWrite", "message": "HalfWrite is not a tool this guard was "
                                                                             "enumerated for"})
    with open(m.GUARD_LOG, "a", encoding="utf-8") as fh:
        fh.write(part[:40])
    m.run(quiet=True)
    check("G9 a half-written row: offset stays at the last newline", state(m).get("guard_log_offset"), off9)
    check("G9 and no blind row for a line still being written", len(store.active(GB)), 0)
    with open(m.GUARD_LOG, "a", encoding="utf-8") as fh:
        fh.write(part[40:] + "\n")
    m.run(quiet=True)
    check("G9b completed: the refusal is read whole and minted", len(store.active(GT)), 1)
    store.hand_resolve(GT)
    with open(m.GUARD_LOG, "a", encoding="utf-8") as fh:
        fh.write("{not json at all\n")
    m.run(quiet=True)
    check("G9c a complete line that does not parse: a blind row", len(store.active(GB)), 1)
    check("G9c the body says it does not parse", "do not parse as a guard row" in store.active(GB)[0]["body"], True)
    store.hand_resolve(GB)
    m.run(quiet=True)                                  # the bad line is behind the offset now: nothing left active
    store.hand_resolve(GB)

    # G9e. fold-in 1b: a complete line of valid JSON that is not a row (`123`) is a bad line, never a crash
    with open(m.GUARD_LOG, "a", encoding="utf-8") as fh:
        fh.write("123\n")
    try:
        rc9e = m.run(quiet=True)
    except Exception as exc:                           # the defect: AttributeError out of guard_check
        rc9e = "raised %s" % type(exc).__name__
    check("G9e a non-row JSON line does not crash the run", rc9e, 1)
    check("G9e and it raises a blind row", len(store.active(GB)), 1)
    store.hand_resolve(GB)
    m.run(quiet=True)
    store.hand_resolve(GB)

    # G9d. fold-in 1a: an unparseable line whose blind add FAILED is not consumed - the offset holds, the next healthy
    #      run mints the blind row
    off9d = state(m).get("guard_log_offset")
    with open(m.GUARD_LOG, "a", encoding="utf-8") as fh:
        fh.write("{also not json\n")
    store.fail_add = True
    m.run(quiet=True)
    check("G9d blind add failing: the offset did NOT advance", state(m).get("guard_log_offset"), off9d)
    store.fail_add = False
    m.run(quiet=True)
    check("G9d healthy store: the blind row is minted on the next run", len(store.active(GB)), 1)
    check("G9d and the offset now covers the line", state(m).get("guard_log_offset"), os.path.getsize(m.GUARD_LOG))
    store.hand_resolve(GB)

    # G10. 1c: a package.json that is valid JSON but not an object is a blind row, never a raise
    with open(m.CLI_PACKAGE, "w", encoding="utf-8") as fh:
        fh.write("[]")
    try:
        rc10 = m.run(quiet=True)
    except Exception as exc:
        rc10 = "raised %s" % type(exc).__name__
    check("G10 a non-object package.json does not crash the run", rc10, 1)
    check("G10 and it raises a blind row naming it", len(store.active(GB)) == 1
          and "not a JSON object" in store.active(GB)[0]["body"], True)
    cli("2.1.400")
    m.run(quiet=True)
    store.hand_resolve(GB)

    # G8. C-2: the reader blind on each input raises its own row; back to readable resolves it
    os.remove(m.CLI_PACKAGE)
    rc = m.run(quiet=True)
    check("G8 package.json gone: a reader-blind row", len(store.active(GB)), 1)
    check("G8 and the run exits 1", rc, 1)
    check("G8 the body names package.json", "package.json" in store.active(GB)[0]["body"], True)
    check("G8 and no FALSE cli-mismatch row (an unread version is not a mismatch)", len(store.active(GC)), 0)
    cli("2.1.400")
    m.run(quiet=True)
    check("G8b readable again: the blind row resolves", len(store.active(GB)), 0)
    with open(m.GUARD_PATH, "w", encoding="utf-8") as fh:
        fh.write("CLI_VERSION_ENUMERATED = '2.1.400'  # single quotes break the parse\n")
    m.run(quiet=True)
    check("G8c an unparseable guard constant: a reader-blind row", len(store.active(GB)), 1)
    guard("2.1.400")
    m.run(quiet=True)
    off_d = state(m).get("guard_log_offset")
    os.chmod(m.GUARD_LOG, 0)
    readable = os.access(m.GUARD_LOG, os.R_OK)          # root can read a 0-mode file: skip the arm, say so
    m.run(quiet=True)
    if not readable:
        check("G8d an unreadable log: a reader-blind row", len(store.active(GB)), 1)
        check("G8d and the stored offset is untouched", state(m).get("guard_log_offset"), off_d)
    else:
        print("SKIP  G8d (running as root: a 0-mode file is still readable)")
    os.chmod(m.GUARD_LOG, 0o600)


def test_state(tmp):
    """1c + the re-seed defect: an EXISTING state that cannot be used is refused, never re-seeded over."""
    m, store, world, paths = langston_world(tmp)
    sizes(paths, 300, 300, 100)
    for label, body in (("non-object", "123"), ("unparseable", "{not json"), ("empty", "")):
        with open(m.STATE, "w", encoding="utf-8") as fh:
            fh.write(body)
        try:
            rc = m.run(quiet=True)
        except Exception as exc:
            rc = "raised %s" % type(exc).__name__
        check("S-%s state: the run refuses with exit 2" % label, rc, 2)
        check("S-%s state: the file is untouched (no re-seed)" % label, open(m.STATE, encoding="utf-8").read(), body)
        check("S-%s state: no alert row was written" % label, len(store.calls), 0)
    os.remove(m.STATE)
    rc = m.run(quiet=True)
    check("S-missing state: the first run still seeds (exit 0)", (rc, state(m).get("ceiling_bytes")), (0, 700))
    # rules record that is valid JSON but not an object -> unknown, not a raise
    real = load(SIZE_WATCH, "lsw_rules_%d" % len(os.listdir(tmp)))
    rec = os.path.join(tmp, "record.json")
    with open(rec, "w", encoding="utf-8") as fh:
        fh.write("[1]")
    try:
        r = real.rules_check(target=os.path.join(tmp, "CLAUDE.md"), record=rec)
        got = any("not a JSON object" in u for u in r.get("unknown", []))
    except Exception as exc:
        got = "raised %s" % type(exc).__name__
    check("S-rules a non-object install record is unknown, not a raise", got, True)


# ─────────────────────────────── coltrane-size-watch ───────────────────────────────

def test_coltrane(tmp):
    m = load(COLTRANE_WATCH, "csw_test")
    f1 = os.path.join(tmp, "AGENTS.md")
    m.WATCHED = [(f1, "instructions")]
    m.STATE = os.path.join(tmp, "c-state.json")
    m.RUNLOG = os.path.join(tmp, "c-size-watch.jsonl")
    store = FakeStore()
    m._alerts = store
    m.post = lambda text, quiet: "recorded"
    B, MF, HB = "coltrane-size-watch-breach", "coltrane-size-watch-missing-file", "coltrane-size-watch-heartbeat"

    class A:
        quiet = True
        by = "cc-infra"
        set_ceiling = None

    def put(n):
        with open(f1, "w", encoding="utf-8") as fh:
            fh.write("x" * n)

    put(1000)
    check("C0 a first run seeds and exits 0", m.cmd_run(A()), 0)
    check("C11 the first run arms a heartbeat row", len(store.active(HB)), 1)
    hb1 = store.active(HB)[0]["id"]
    check("C11 the heartbeat fires in the future, not now", store.active(HB)[0]["triggers_at"] > m.utc(), True)
    m.cmd_run(A())
    check("C11 the next run resolves the old heartbeat", [r["state"] for r in store.by_key(HB) if r["id"] == hb1],
          ["resolved"])
    check("C11 and arms exactly one new one", len(store.active(HB)), 1)
    store.fail_resolve = "bash: npm: command not found"
    before = len(store.by_key(HB))
    adds_before = len(store.adds(HB))
    m.cmd_run(A())
    store.fail_resolve = False
    check("C11 a failed heartbeat resolve leaves the row count alone", len(store.by_key(HB)), before)
    # ⛔ the row count alone cannot see a wrong re-arm: the add would COLLAPSE onto the unresolved row (same id, its
    #    OLD fire time) - which is exactly the harm. So assert no re-arm was attempted at all.
    check("C11 and does NOT attempt a re-arm", len(store.adds(HB)), adds_before)

    put(1100)
    check("C1 an over run exits 1", m.cmd_run(A()), 1)
    check("C1 a breach row is raised", len(store.active(B)), 1)
    store.hand_resolve(B)
    m.cmd_run(A())
    check("C2a after a hand-resolve a new breach row exists", len(store.by_key(B)), 2)
    check("C2a exactly one active", len(store.active(B)), 1)

    os.remove(f1)
    check("C4 a missing-file run exits 4", m.cmd_run(A()), 4)
    check("C4 a missing-file row is raised", len(store.active(MF)), 1)
    check("C4 the breach row is left as it is", len(store.active(B)), 1)

    put(900)
    m.cmd_run(A())
    check("C5 restored and under: missing resolved", len(store.active(MF)), 0)
    check("C5 and the breach resolved", len(store.active(B)), 0)

    calls_before = len(store.calls)
    check("CS the self-test passes", m.cmd_self_test(A()), 0)
    check("CS the self-test wrote nothing to the alert store", len(store.calls), calls_before)


def main():
    base = tempfile.mkdtemp(prefix="size-watch-alerts-test-", dir=os.path.expanduser("~"))
    try:
        t1 = os.path.join(base, "langston"); os.makedirs(t1)
        t2 = os.path.join(base, "coltrane"); os.makedirs(t2)
        t3 = os.path.join(base, "guard"); os.makedirs(t3)
        t4 = os.path.join(base, "state"); os.makedirs(t4)
        test_langston(t1)
        test_guard(t3)
        test_state(t4)
        test_coltrane(t2)
    finally:
        shutil.rmtree(base, ignore_errors=True)
    print("\n%d passed, %d failed" % (PASSES, len(FAILS)))
    return 1 if FAILS else 0


if __name__ == "__main__":
    sys.exit(main())
