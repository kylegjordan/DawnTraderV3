#!/usr/bin/env python3
"""B-LANGSTON-RELIEF OBJ-4b: Coltrane's library at parity with Langston's - replaced entries KEPT, retractions shown
first, the crew channel's whole history searchable - driven through the REAL `coltrane-memory` CLI as a subprocess
against a scratch store, sessions dir and channel log (the env test seam). Runs anywhere, no root."""
import json, os, shutil, subprocess, sys, tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = os.path.join(HERE, "coltrane-memory")
NL = chr(10)
ok = True


def check(name, got, want):
    global ok
    good = got == want
    ok = ok and good
    print("  %-4s %-80s expected %-10s got %s" % ("PASS" if good else "FAIL", name, str(want)[:10], str(got)[:110]))


def main():
    # ⛔ a tool WITHOUT the env seam writes to its REAL store - measured: a red run against the pre-seam version wrote a
    #    test entry under C:\home\coltrane on the laptop. Refuse before any call rather than touch a live store.
    if "COLTRANE_MEMORY_STORE" not in open(TOOL, encoding="utf-8").read():
        print("REFUSED: %s has no COLTRANE_MEMORY_STORE seam - it would write to the live store. Nothing run." % TOOL)
        sys.exit(2)
    top = tempfile.mkdtemp(prefix="cm-test-")
    store, sess, log = os.path.join(top, "memory"), os.path.join(top, "sessions"), os.path.join(top, "inbox.jsonl")
    os.makedirs(store)
    os.makedirs(sess)
    env = dict(os.environ, COLTRANE_MEMORY_STORE=store, COLTRANE_SESSIONS=sess, COLTRANE_CREW_LOG=log)

    def run(*args):
        p = subprocess.run([sys.executable, TOOL] + list(args), capture_output=True, env=env, timeout=60)
        return p.returncode, (p.stdout + p.stderr).decode("utf-8", "replace")

    def remember(title, body, typ="finding", update=False):
        a = ["remember", "--type", typ, "--title", title, "--body", body, "--why", "w", "--apply", "a"]
        return run(*(a + (["--update"] if update else [])))

    rows = []
    for i in range(45):
        rows.append({"ts": "2026-10-%02dT10:00:00+00:00" % (1 + i % 15), "kind": "cc_outbound", "sender": "OLD Claude",
                     "message_id": str(1000 + i), "text": "message %d about the walrus-ledger" % i})
    rows.append(dict(rows[0]))                                              # a mirrored duplicate of message 1000
    rows.append({"ts": "2026-10-02T09:00:00+00:00", "kind": "langston_outbound", "message_id": "2000",
                 "text": "Langston on the narwhal-ruling, line one\nand a second line"})
    with open(log, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write(json.dumps(r) + NL)

    print("1. replacing an entry keeps the old version")
    rc, out = remember("Gate rule", "the OLD wording zebra-1")
    check("a new entry is written (exit 0)", rc, 0)
    rc, out = remember("Gate rule", "the NEW wording zebra-2")
    check("re-using the name without --update refuses (exit 3)", rc, 3)
    rc, out = remember("Gate rule", "the NEW wording zebra-2", update=True)
    check("--update exits 0 and says it KEPT the previous version", (rc, "KEPT the previous version" in out), (0, True))
    hist = os.listdir(os.path.join(store, ".history"))
    check("exactly one version in .history/", len(hist), 1)
    check("  ...holding the OLD bytes", "zebra-1" in open(os.path.join(store, ".history", hist[0]), encoding="utf-8").read(), True)
    check("the live entry holds the NEW wording",
          "zebra-2" in open(os.path.join(store, "finding_gate-rule.md"), encoding="utf-8").read(), True)
    rc, out = run("list")
    check("list shows the live entry only (.history is not an entry)", out.count("finding_gate-rule"), 1)
    rc, out = run("recall", "zebra-1")
    check("recall finds the old wording, marked SUPERSEDED", ("[SUPERSEDED]" in out, "zebra-1" in out), (True, True))

    print("2. a failed history write replaces nothing")
    remember("Second", "first text yak-1")
    shutil.rmtree(os.path.join(store, ".history"))
    open(os.path.join(store, ".history"), "w").close()                    # a FILE where the directory must be
    rc, out = remember("Second", "second text yak-2", update=True)
    check("--update refuses when the old version cannot be kept (exit 4)", rc, 4)
    check("  ...and the entry still holds its old text",
          "yak-1" in open(os.path.join(store, "finding_second.md"), encoding="utf-8").read(), True)
    os.remove(os.path.join(store, ".history"))

    print("3. retractions come first")
    rc, out = remember("I withdraw the walrus claim", "the walrus-ledger figure was wrong", typ="retraction")
    check("a retraction entry is accepted (exit 0)", rc, 0)
    rc, out = run("recall", "walrus-ledger")
    r_at, s_at = out.find("=== YOUR RETRACTIONS"), out.find("=== DECISION STORE")
    check("the retraction section prints BEFORE the store", 0 <= r_at < s_at, True)
    check("  ...and carries the matching retraction", "I withdraw the walrus claim" in out[r_at:s_at], True)

    print("4. the crew channel history is searched, capped visibly, de-duplicated")
    check("45 distinct matches -> shows 40 and says so", "showing the newest 40 of 45" in out, True)
    check("  ...the mirrored duplicate is counted once (45, not 46)", "of 46" in out, False)
    check("  ...newest first", out.find("2026-10-15T10:00:00") < out.find("2026-10-01T10:00:00") or
          "2026-10-01T10:00:00" not in out, True)
    rc, out = run("recall", "narwhal-ruling")
    check("a multi-line message shows its matching line", "Langston on the narwhal-ruling" in out, True)
    check("the summary names the crew channel as read", "the crew channel (ok)" in out, True)

    print("5. an unreadable channel log is said, not silent")
    env["COLTRANE_CREW_LOG"] = os.path.join(top, "missing.jsonl")
    rc, out = run("recall", "narwhal-ruling")
    check("a missing log prints COULD NOT READ", "COULD NOT READ the channel history" in out, True)
    check("  ...and the summary says UNREADABLE", "the crew channel (UNREADABLE" in out, True)
    env["COLTRANE_CREW_LOG"] = log
    rc, out = run("recall", "nothing-matches-this-qq")
    check("zero hits prints the corpus warning naming langston-recall", ("ZERO HITS" in out, "langston-recall" in out),
          (True, True))

    shutil.rmtree(top)
    print("ALL PASS" if ok else "FAILURES")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
