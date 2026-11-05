#!/usr/bin/env python3
"""B-LANGSTON-MEMORY-WRITE-FENCE P6(b) - the ROOT-ONLY suite: the real fence on a real filesystem.

    python3 test_memory_fence_root.py --scratch DIR --user ACCOUNT          (as root, on Linux)

DIR      an existing directory on a filesystem that supports the immutable flag (ext4/xfs - NOT tmpfs), whose every
         ancestor is root-owned and not group/other-writable (the root writer refuses a reader on any other path) and
         traversable by ACCOUNT. A run directory is made inside it and removed at the end.
ACCOUNT  an existing NON-ROOT account, not `langston`, that plays Langston's part; its PRIMARY group plays his group
         (e.g. `useradd --system --no-create-home --shell /usr/sbin/nologin lmwtest`).

It NEVER touches /home/langston, /var/spool/langston-memory, a live unit or the alert path: every home and spool is
under DIR, the spool service is run HERE as root (exactly the code the unit runs, with the test seams it honours only
off the live home), and the daily check is given fake unit-state and alert functions. Needs python3 >= 3.9,
chattr/lsattr (e2fsprogs), sudo, coreutils.

What it proves (P6): each of his five modes through the REAL spool and service, with the exit codes and texts as a
root run gives them (exit 7's advice rewritten, exit 4 verbatim); after each mode every fenced path's owner, group,
mode and flag equal the TABLE (assertions generated from it); EPERM for >>, >, temp-and-rename, mv and rm on
MEMORY.md and MEMORY-ARCHIVE.md as the account (EACCES inside the root-owned .memory-archive/), and for root's own
`>`; SIGKILL between clear and set leaves the flag CLEAR and the next call re-arms it; disallowed requests, a path in
--part, a symlinked entry and an oversize entry refused; the self-test leaves nothing behind; the daily check pages
on a cleared flag, a forged sha, a stopped or masked service, an acked alert - and never resolves.
"""
import base64, hashlib, json, os, shutil, signal, stat, subprocess, sys, tempfile, time, types

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = {"writer": "langston-memory-write", "reader": "langston_memory.py", "spoold": "langston-memory-spoold",
         "allowlist": "langston_memory_allowlist.py", "check": "langston-memory-fence-check",
         "split": "test_ledger_split.py", "trim": "test_memory_trim.py"}
PATH_ENV = "/usr/sbin:/usr/bin:/sbin:/bin"
ok = True


def check(name, got, want):
    global ok
    good = got == want
    ok = ok and good
    print("  %-4s %-96s expected %-12s got %s" % ("PASS" if good else "FAIL", name, str(want)[:12], str(got)[:160]),
          flush=True)


def sha(b):
    return hashlib.sha256(b).hexdigest()


def rd(p):
    with open(p, "rb") as fh:
        return fh.read()


def load_source(path, name):
    mod = types.ModuleType(name)
    mod.__file__ = path
    exec(compile(rd(path), path, "exec"), mod.__dict__)
    return mod


def refuse(msg):
    print("REFUSED: " + msg)
    sys.exit(3)


def lsattr_i(path):
    p = subprocess.run(["lsattr", "-d", "--", path], capture_output=True, text=True, timeout=60)
    return None if p.returncode != 0 or not p.stdout.split() else "i" in p.stdout.split()[0]


def chattr(flag, path):
    subprocess.run(["chattr", flag, path], check=True, capture_output=True, timeout=60)


class Env:
    """Everything one run needs: the copies in bin/, the stand-in account, the modules loaded from those copies."""

    def __init__(self, run, user):
        import pwd
        self.run, self.user = run, user
        pw = pwd.getpwnam(user)
        self.uid, self.gid = pw.pw_uid, pw.pw_gid
        self.bin = os.path.join(run, "bin")
        os.mkdir(self.bin, 0o755)
        for key, name in FILES.items():
            dst = os.path.join(self.bin, name)
            shutil.copyfile(os.path.join(HERE, name), dst)
            os.chmod(dst, 0o755)
        self.path = {k: os.path.join(self.bin, n) for k, n in FILES.items()}
        self.W = load_source(self.path["writer"], "lmw_root_writer")
        self.SP = load_source(self.path["spoold"], "lmw_root_spoold")
        self.CHK = load_source(self.path["check"], "lmw_root_check")
        self.AL = load_source(self.path["allowlist"], "lmw_root_allowlist")
        self.SPLIT = load_source(self.path["split"], "lmw_root_split")
        self.TRIM = load_source(self.path["trim"], "lmw_root_trim")

    def as_user(self, cmd, **kw):
        return subprocess.run(["sh", "-c", cmd], capture_output=True, text=True, timeout=120, user=self.uid,
                              group=self.gid, extra_groups=[], cwd=self.run, env={"PATH": PATH_ENV}, **kw)


class Home:
    def __init__(self, env, name, text, parts=True):
        self.env, self.h = env, os.path.join(env.run, name)
        self.mem = os.path.join(self.h, "MEMORY.md")
        self.arch = os.path.join(self.h, ".memory-archive")
        self.state = os.path.join(self.arch, "compose-state.json")
        self.part = os.path.join(self.h, "memory-parts", "00-legacy.md")
        self.ledger = os.path.join(self.h, "LEDGER.md")
        self.spool = os.path.join(env.run, name + "-spool")
        os.mkdir(self.h)
        with open(self.mem, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        if parts:
            os.mkdir(os.path.dirname(self.part), 0o700)
            shutil.copyfile(self.mem, self.part)
            for p in (os.path.dirname(self.part), self.part):
                os.chown(p, env.uid, env.gid)
            os.chmod(self.part, 0o600)
        os.chown(self.h, env.uid, env.gid)                  # his home is his, as /home/langston is
        os.chmod(self.h, 0o750)
        for sub, mode in env.SP.LAYOUT:                    # the service's own layout table
            p = os.path.join(self.spool, sub) if sub else self.spool
            os.mkdir(p)
            os.chown(p, 0, env.gid)
            os.chmod(p, mode)
        if parts:
            rc, out, err = self.root(["--compose", "--by", "t", "--reason", "fixture"])
            assert rc == 0, err

    def base_env(self):
        return {"PATH": PATH_ENV, "LANGSTON_HOME": self.h, "LMW_OWNER": self.env.user,
                "LANGSTON_MEMORY_READER": self.env.path["reader"]}

    def root(self, argv, stdin=b"", extra=None):
        p = subprocess.run([sys.executable, self.env.path["writer"]] + argv, input=stdin, capture_output=True,
                           env=dict(self.base_env(), **(extra or {})), timeout=300)
        return p.returncode, p.stdout, p.stderr

    def spoold(self):
        e = dict(self.base_env(), LMW_SPOOL_DIR=self.spool, LMW_WRITER=self.env.path["writer"])
        p = subprocess.run([sys.executable, "-I", self.env.path["spoold"]], capture_output=True, env=e, timeout=600)
        return p.returncode, p.stdout.decode("utf-8", "replace")

    def via_spool(self, argv, stdin=b""):
        """His command line, as his stand-in account; the service run here whenever in/ holds a request."""
        e = dict(self.base_env(), LMW_SPOOL_DIR=self.spool, LMW_CLIENT_TIMEOUT="120", HOME=self.env.run)
        p = subprocess.Popen([sys.executable, self.env.path["writer"]] + argv, stdin=subprocess.PIPE,
                             stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=e, user=self.env.uid,
                             group=self.env.gid, extra_groups=[], cwd=self.env.run)
        p.stdin.write(stdin)
        p.stdin.close()
        deadline, svc = time.monotonic() + 180, []
        while p.poll() is None and time.monotonic() < deadline:
            if os.listdir(os.path.join(self.spool, "in")):
                svc.append(self.spoold())
            time.sleep(0.1)
        if p.poll() is None:
            p.kill()
        out, err = p.stdout.read(), p.stderr.read()
        p.wait()
        if any(rc != 0 for rc, _o in svc):
            print("  ...the service exited non-zero: %r" % [s for s in svc if s[0] != 0])
        return p.returncode, out, err

    def answer(self, rid):
        with open(os.path.join(self.spool, "out", rid + ".res"), "rb") as fh:
            r = json.loads(fh.read())
        return r["rc"], base64.b64decode(r["stderr_b64"]).decode("utf-8", "replace")


def assert_table(label, home):
    """C-14: owner, group, mode AND the flag of every fenced path, GENERATED from the table - not listed by hand."""
    W = home.env.W
    for row in W.fence_table(home.h, home.env.user):
        if row["cat"] == "c":
            continue
        uid, gid = W.row_ids(row)
        paths = W.row_paths(row)
        if row["required"]:
            check("%s: required row %s is present" % (label, row["name"]), bool(paths), True)
        for p in paths:
            st = os.lstat(p)
            check("%s: %s = the table (owner, group, mode, immutable)" % (label, os.path.relpath(p, home.h)),
                  (st.st_uid, st.st_gid, oct(stat.S_IMODE(st.st_mode)), lsattr_i(p)),
                  (uid, gid, oct(row["mode"]), row["immutable"]))
    if os.path.exists(home.state):
        st = os.lstat(home.state)
        check("%s: compose-state.json is root:root 0600 +i" % label,
              (st.st_uid, st.st_gid, oct(stat.S_IMODE(st.st_mode)), lsattr_i(home.state)), (0, 0, "0o600", True))
    for p in (home.mem, os.path.join(home.arch, "index.jsonl"), os.path.join(home.h, "MEMORY-ARCHIVE.md")):
        if os.path.exists(p):
            r = home.env.as_user("cat %s > /dev/null" % p)
            check("%s: C-7 - %s still readable as the account" % (label, os.path.basename(p)), r.returncode, 0)


def t_modes(env):
    print("1. his five modes through the real spool and service; the table after each (OBJ-3, C-7, C-14)")
    S = env.SPLIT
    a = Home(env, "home-a", S.FIXTURE)
    assert_table("after the fixture compose (root)", a)
    rc, out, err = a.via_spool(["--compose", "--by", "langston", "--reason", "t"])
    check("compose through the spool -> exit 0, COMPOSED", (rc, b"COMPOSED" in out), (0, True))
    assert_table("after compose", a)
    part = rd(a.part)
    new = part.replace(b"- a note outside the ledger", b"- a note outside the ledger, edited through the spool")
    rc, out, err = a.via_spool(["--expect-sha", sha(part), "--ledger-delta", "0", "--retractions-delta", "0",
                                "--part", "00-legacy.md", "--by", "langston", "--reason", "t"], new)
    check("part-whole-file through the spool -> exit 0, WRITTEN part", (rc, b"WRITTEN part" in out), (0, True))
    assert_table("after part-whole-file", a)
    part = rd(a.part)
    rc, out, err = a.via_spool(["--expect-sha", sha(part), "--ledger-append", "--entries", "1", "--by", "langston",
                                "--reason", "t"], b"- **fourth retraction**, appended through the spool, long enough.\n")
    check("part-ledger-append through the spool -> exit 0", (rc, b"WRITTEN part" in out), (0, True))
    assert_table("after part-ledger-append", a)
    rc, out, err = a.root(["--split-ledger", "--expect-sha", sha(rd(a.part)), "--by", "t", "--reason", "t"],
                          S.STUB.encode("utf-8"))
    check("(fixture) the split, as root -> exit 0", rc, 0)
    led = rd(a.ledger)
    rc, out, err = a.via_spool(["--expect-sha", sha(led), "--ledger-append", "--entries", "1", "--by", "langston",
                                "--reason", "t"], b"- **fifth retraction**, appended to LEDGER.md through the spool.\n")
    check("ledger-file-append through the spool -> exit 0, WRITTEN LEDGER.md", (rc, b"WRITTEN LEDGER.md" in out),
          (0, True))
    assert_table("after ledger-file-append", a)
    b = Home(env, "home-b", S.FIXTURE, parts=False)
    m = rd(b.mem)
    rc, out, err = b.via_spool(["--expect-sha", sha(m), "--ledger-delta", "0", "--retractions-delta", "0", "--by",
                                "langston", "--reason", "t"], m.replace(b"- a header note", b"- a header note, edited"))
    check("whole-file (the legacy path) through the spool -> exit 0", (rc, b"WRITTEN" in out), (0, True))
    assert_table("after whole-file", b)
    rows = [json.loads(l) for l in rd(os.path.join(a.arch, "index.jsonl")).splitlines() if l.strip()]
    check("every spooled write is recorded --by langston (forced by the service)",
          sorted({r["by_claimed"] for r in rows if r.get("via_uid") == 0 and r.get("reason") == "t"
                  and r.get("mode") != "split-ledger"}), ["langston"])
    return a, b


def t_refusals(env, a):
    print("2. refusals come back verbatim; the allowlist refuses through the real spool")
    part = rd(a.part)
    stale = ["--expect-sha", "0" * 64, "--ledger-delta", "0", "--retractions-delta", "0", "--part", "00-legacy.md",
             "--by", "langston", "--reason", "t"]
    r_root = a.root(stale, part)
    r_spool = a.via_spool(stale, part)
    check("a stale --expect-sha -> exit 4 through the spool", r_spool[0], 4)
    check("  ...and its text is byte-identical to a root run's", r_spool[2], r_root[2])
    with open(os.path.join(a.h, ".ratchet-state.json"), "w") as fh:
        json.dump({"ceiling_bytes": 1}, fh)
    try:
        grow = ["--expect-sha", sha(part), "--ledger-delta", "0", "--retractions-delta", "0", "--part", "00-legacy.md",
                "--by", "langston", "--reason", "t"]
        bigger = part.replace(b"- a header note", b"- a header note, grown by a test")
        r_root = a.root(grow, bigger)
        r_spool = a.via_spool(grow, bigger)
        W = env.W
        check("a refused growth -> exit 7 through the spool, root's text with ONLY the advice changed",
              (r_spool[0], r_spool[2]), (7, r_root[2].replace(W.GROWTH_ADVICE.encode(), W.CLIENT_GROWTH_ADVICE.encode())))
        check("  ...the root run offers --allow-growth; his does not", (b"--allow-growth" in r_root[2],
                                                                     b"--allow-growth" in r_spool[2]), (True, False))
    finally:
        os.remove(os.path.join(a.h, ".ratchet-state.json"))
    before = rd(a.mem)
    for label, argv in (("--trim", ["--trim", "--by", "x", "--reason", "r"]),
                        ("--allow-growth", ["--expect-sha", sha(part), "--ledger-delta", "0", "--retractions-delta",
                                            "0", "--allow-growth", "please", "--reason", "r"]),
                        ("--rename-part", ["--rename-part", "00-legacy.md", "--to", "01-x.md", "--expect-sha",
                                           sha(part), "--reason", "r"]),
                        ("a path in --part", ["--expect-sha", sha(part), "--ledger-delta", "0", "--retractions-delta",
                                              "0", "--part", "../LEDGER.md", "--reason", "r"])):
        rc, out, err = a.via_spool(argv, b"x\n" if "--trim" not in argv and "--rename-part" not in argv else b"")
        check("%s through the spool -> exit 2, refused by the service" % label,
              (rc, b"REFUSED by the root memory service" in err), (2, True))
    check("  ...and MEMORY.md is byte-identical after all of them", rd(a.mem), before)
    target = "/etc/hostname"
    t_before = rd(target)
    rid = "e" * 32
    r = env.as_user("ln -s %s %s" % (target, os.path.join(a.spool, "in", rid + ".req")))
    check("(fixture) the account can create an entry in in/ (1730)", r.returncode, 0)
    rc, log = a.spoold()
    check("a SYMLINKED spool entry is answered exit 2 'symbolic link', followed nowhere",
          (rc, a.answer(rid)[0], "symbolic link" in a.answer(rid)[1], os.listdir(os.path.join(a.spool, "in")),
           rd(target) == t_before), (0, 2, True, [], True))
    rid = "f" * 32
    r = env.as_user("head -c %d /dev/zero > %s" % (env.AL.MAX_REQUEST_BYTES + 1,
                                                   os.path.join(a.spool, "in", rid + ".req")))
    rc, log = a.spoold()
    check("an OVERSIZE spool entry is answered exit 2 'too large'", (rc, a.answer(rid)[0], "too large" in a.answer(rid)[1]),
          (0, 2, True))


def t_eperm(env, a):
    print("3. positive controls: nothing but the writer can change the fenced files (OBJ-2)")
    mem, arch, cs = a.mem, a.arch, a.state
    before, cs_before = rd(mem), rd(cs)
    tmp = os.path.join(a.h, ".lmw-editor-temp")
    for label, cmd, why in (
            (">> on MEMORY.md", "printf x >> %s" % mem, "Operation not permitted"),
            ("> on MEMORY.md", "printf x > %s" % mem, "Operation not permitted"),
            ("temp-and-rename over MEMORY.md", "printf x > %s && mv -f %s %s" % (tmp, tmp, mem), "Operation not permitted"),
            ("mv MEMORY.md away", "mv %s %s.moved" % (mem, mem), "Operation not permitted"),
            ("rm MEMORY.md", "rm -f %s" % mem, "Operation not permitted"),
            # the kernel checks the immutable flag before the mode bits on a WRITE open (inode_permission), so a
            # file that is both 0600 root-owned and +i refuses an append with EPERM, not EACCES; mv and rm below are
            # decided by the root-owned directory first, hence EACCES there
            (">> on compose-state.json", "printf x >> %s" % cs, "Operation not permitted"),
            ("mv compose-state.json", "mv %s %s.x" % (cs, cs), "Permission denied"),
            ("rm compose-state.json", "rm -f %s" % cs, "Permission denied"),
            (">> on index.jsonl", "printf x >> %s/index.jsonl" % arch, "Permission denied"),
            ("temp-and-rename inside .memory-archive/", "printf x > %s/.t && mv -f %s/.t %s" % (arch, arch, cs),
             "Permission denied"),
            ("rm inside .memory-archive/", "rm -f %s/index.jsonl" % arch, "Permission denied")):
        r = env.as_user(cmd)
        check("as the account, %s fails: %s" % (label, why), (r.returncode != 0, why in r.stderr), (True, True))
    if os.path.exists(tmp):
        os.remove(tmp)
    for label, path in (("MEMORY.md", mem), ("compose-state.json", cs)):
        r = subprocess.run(["sh", "-c", "printf x > %s" % path], capture_output=True, text=True, timeout=60)
        check("as ROOT, > on %s fails too (the flag)" % label, (r.returncode != 0, "Operation not permitted" in r.stderr),
              (True, True))
    check("after every attempt MEMORY.md and compose-state are byte-identical", (rd(mem), rd(cs)), (before, cs_before))


def t_trim(env):
    print("4. MEMORY-ARCHIVE.md (C-13): fenced after a trim, and the account cannot touch it")
    c = Home(env, "home-c", env.TRIM.BASE)
    rc, out, err = c.root(["--trim", "--by", "t", "--reason", "t"])
    check("(fixture) the trim, as root -> exit 0", rc, 0)
    assert_table("after a trim", c)
    ma = os.path.join(c.h, "MEMORY-ARCHIVE.md")
    before = rd(ma)
    for label, cmd in ((">>", "printf x >> %s" % ma), ("rm", "rm -f %s" % ma), ("mv", "mv %s %s.x" % (ma, ma))):
        r = env.as_user(cmd)
        check("as the account, %s on MEMORY-ARCHIVE.md -> EPERM" % label,
              (r.returncode != 0, "Operation not permitted" in r.stderr), (True, True))
    check("  ...byte-identical", rd(ma), before)


def t_kill(env, a):
    print("5. SIGKILL between clear and set: the flag is CLEAR, and the next call re-arms it (C-4)")
    e = dict(a.base_env(), LMW_TEST_HOLD_AFTER_CLEAR="MEMORY.md:60")
    p = subprocess.Popen([sys.executable, env.path["writer"], "--compose", "--by", "t", "--reason", "kill"],
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=e)
    seen = False
    while True:
        line = p.stderr.readline()
        if not line:
            break
        if b"LMW-TEST: flag cleared on " + a.mem.encode() in line:
            seen = True
            break
    os.kill(p.pid, signal.SIGKILL)
    p.wait()
    check("the write reached the window (the seam said so)", seen, True)
    check("killed there, MEMORY.md's flag is CLEAR - fails open, as stated", lsattr_i(a.mem), False)
    return lambda: rearm(a)


def rearm(a):
    rc, out, err = a.root(["--compose", "--by", "t", "--reason", "after the kill"])
    check("the next call -> exit 0, and says it re-asserted the fence", (rc, b"re-asserted" in err), (0, True))
    check("  ...MEMORY.md's flag is SET again", lsattr_i(a.mem), True)
    assert_table("after the re-arm", a)


class FakeAlerts:
    def __init__(self):
        self.calls, self.live, self.acked, self.n = [], set(), set(), 0

    def __call__(self, argv):
        self.calls.append(list(argv))
        if argv[0] == "add":
            self.n += 1
            i = "fx-%d" % self.n
            self.live.add(i)
            return 0, json.dumps({"id": i}), ""
        if argv[0] == "list":
            return 0, "\n".join("active        [warning ] health_check  triggers_at=x id=%s  t%s"
                                % (i, " (acked by y)" if i in self.acked else "") for i in sorted(self.live)), ""
        return 0, "", ""


def t_check(env, a, rearm_after_kill):
    print("6. the daily fence check (P4): pages, never resolves, never reads a failure as PASS")
    CHK = env.CHK
    state = os.path.join(env.run, "check-state")
    os.mkdir(state, 0o700)
    units = {"path": {"LoadState": "loaded", "ActiveState": "active", "UnitFileState": "enabled"},
             "service": {"LoadState": "loaded", "ActiveState": "inactive", "UnitFileState": "static"}}
    cfg = dict(CHK.CONFIG, home=a.h, owner=env.user, writer=env.path["writer"], spoold=env.path["spoold"],
               allowlist=env.path["allowlist"], reader=env.path["reader"], spool=a.spool,
               runlog=os.path.join(state, "run.jsonl"), statefile=os.path.join(state, "state.json"),
               lsattr=CHK.lsattr_immutable,
               unit_state=lambda u: dict(units["path" if u.endswith(".path") else "service"]))
    al = FakeAlerts()
    run = lambda: CHK.run_once(cfg, al)
    adds = lambda: [c for c in al.calls if c[0] == "add"]
    # the SIGKILL left MEMORY.md's flag clear: that is the "cleared flag" page, measured on the real thing
    row, code = run()
    check("a cleared flag (left by the SIGKILL) -> exit 1, BROKEN, one alert armed",
          (code, row["verdict"], len(adds()), any(f["kind"] == "flag" for f in row["findings"])), (1, "BROKEN", 1, True))
    body = adds()[0][adds()[0].index("--body") + 1]
    check("  ...its body says it clears only by a hand-resolve, and never to ack it",
          ("DOES NOT CLEAR ITSELF" in body, "Never ack" in body), (True, True))
    row, code = run()
    check("  ...still broken next run: the open alert is kept, no second one", (code, len(adds())), (1, 1))
    rearm_after_kill()
    row, code = run()
    check("fence restored -> exit 0 PASS, and the alert is NOT resolved by the machine",
          (code, row["verdict"], [c for c in al.calls if c[0] == "resolve"]), (0, "PASS", []))
    al.live.clear()                                         # a human resolved it
    chattr("-i", a.mem)
    saved = rd(a.mem)
    with open(a.mem, "ab") as fh:
        fh.write(b"a hand edit\n")
    rc, out, err = a.via_spool(["--expect-sha", sha(rd(a.part)), "--ledger-delta", "0", "--retractions-delta", "0",
                                "--part", "00-legacy.md", "--by", "langston", "--reason", "t"], rd(a.part))
    check("after a hand edit his write -> exit 4 'OUTSIDE the composer', verbatim", (rc, b"OUTSIDE the composer" in err),
          (4, True))
    check("  ...and that root call re-armed the flag on the edited file", lsattr_i(a.mem), True)
    row, code = run()
    check("a forged sha (the hand edit) -> exit 1, a NEW alert after the hand-resolve",
          (code, any(f["kind"] == "sha" for f in row["findings"]), len(adds())), (1, True, 2))
    chattr("-i", a.mem)
    with open(a.mem, "wb") as fh:
        fh.write(saved)
    chattr("+i", a.mem)
    al.live.clear()
    for label, key, val in (("a stopped path unit", "ActiveState", "inactive"), ("a masked path unit", "LoadState", "masked")):
        units["path"][key] = val
        row, code = run()
        check("%s -> exit 1, a service finding" % label,
              (code, any(f["kind"] == "service" for f in row["findings"])), (1, True))
        units["path"] = {"LoadState": "loaded", "ActiveState": "active", "UnitFileState": "enabled"}
    units["service"]["ActiveState"] = "failed"
    row, code = run()
    check("a failed service -> exit 1", (code, any(f["kind"] == "service" for f in row["findings"])), (1, True))
    units["service"]["ActiveState"] = "inactive"
    al.acked |= al.live
    chattr("-i", a.mem)
    row, code = run()
    check("a tracked alert someone ACKED -> exit 2 (silence is not delivery)", code, 2)
    chattr("+i", a.mem)
    al.live.clear()
    al.acked.clear()
    chattr("-i", a.state)
    cs = rd(a.state)
    with open(a.state, "wb") as fh:
        fh.write(b"{")
    row, code = run()
    check("compose-state unreadable -> exit 2 INSTRUMENT, never PASS", (code, row["verdict"]), (2, "INSTRUMENT"))
    with open(a.state, "wb") as fh:
        fh.write(cs)
    chattr("+i", a.state)
    al.live.clear()
    row, code = run()
    check("restored -> exit 0 PASS (control)", (code, row["verdict"]), (0, "PASS"))
    check("across every run, the check never issued a resolve", [c for c in al.calls if c[0] == "resolve"], [])


def t_gap(env, a):
    print("7. KNOWN GAP, reported not fixed: the account can rename .memory-archive/ itself (it lives in his home)")
    r = env.as_user("mv %s %s.x && mkdir %s" % (a.arch, a.arch, a.arch))
    check("as the account, mv .memory-archive away and mkdir a new one -> succeeds (the gap)", r.returncode, 0)
    rc, out, err = a.root(["--compose", "--by", "t", "--reason", "gap"])
    check("  ...the next root call REFUSES rather than adopt his directory (exit 6, 'never adopted')",
          (rc, b"never adopted" in err), (6, True))
    shutil.rmtree(a.arch)
    os.rename(a.arch + ".x", a.arch)
    rc, out, err = a.root(["--compose", "--by", "t", "--reason", "after the gap"])
    check("  ...restored by root -> the next call exit 0", rc, 0)


def t_selftest(env):
    print("8. the self-test leaves nothing behind (C-8)")
    tmpd = os.path.join(env.run, "selftmp")
    os.mkdir(tmpd, 0o755)
    import pwd
    roothome = pwd.getpwuid(0).pw_dir
    guard_before = sorted(n for n in os.listdir(roothome) if n.startswith("lmw-guard-"))
    e = {"PATH": PATH_ENV, "TMPDIR": tmpd, "LANGSTON_HOME": os.path.join(env.run, "selftest-anchor"),
         "LMW_OWNER": env.user, "LANGSTON_MEMORY_READER": env.path["reader"]}
    p = subprocess.run([sys.executable, env.path["writer"], "--self-test"], capture_output=True, text=True, env=e,
                       timeout=1800)
    check("--self-test as root -> exit 0, PASSED", (p.returncode, "self-test PASSED" in p.stdout), (0, True))
    if p.returncode != 0:
        print("\n".join(l for l in p.stdout.splitlines() if "FAIL" in l))
    check("  ...its temp homes are gone (nothing immutable leaked)", os.listdir(tmpd), [])
    check("  ...and so are its guard fixtures under root's home",
          sorted(n for n in os.listdir(roothome) if n.startswith("lmw-guard-")), guard_before)


def main(argv):
    if not sys.platform.startswith("linux") or os.geteuid() != 0:
        refuse("root on Linux only")
    if sys.version_info < (3, 9):
        refuse("python3 >= 3.9 (subprocess user=/group=)")
    args = dict(zip(argv[::2], argv[1::2]))
    if len(argv) != 4 or set(args) != {"--scratch", "--user"}:
        refuse("usage: test_memory_fence_root.py --scratch DIR --user ACCOUNT")
    import pwd
    scratch = os.path.realpath(args["--scratch"])
    if not os.path.isdir(scratch) or scratch == "/":
        refuse("--scratch must be an existing directory other than /")
    for live in ("/home/langston", "/var/spool/langston-memory", "/opt/langston-memory"):
        if scratch == live or scratch.startswith(live + "/"):
            refuse("--scratch may not be under %s" % live)
    try:
        pw = pwd.getpwnam(args["--user"])
    except KeyError:
        refuse("no account %r" % args["--user"])
    if pw.pw_uid == 0 or pw.pw_name == "langston":
        refuse("--user must be a non-root stand-in, never root and never langston")
    for tool in ("chattr", "lsattr", "sudo", "sh", "mv", "rm", "head", "ln"):
        if not shutil.which(tool):
            refuse("%s is not installed" % tool)
    run = tempfile.mkdtemp(prefix="lmwfence-", dir=scratch)
    os.chmod(run, 0o755)
    try:
        probe = os.path.join(run, "flag-probe")
        open(probe, "w").close()
        if subprocess.run(["chattr", "+i", probe], capture_output=True).returncode != 0 or not lsattr_i(probe):
            refuse("%s does not support the immutable flag (tmpfs?)" % scratch)
        chattr("-i", probe)
        os.remove(probe)
        env = Env(run, pw.pw_name)
        trust = env.W.reader_trust_problems(env.path["reader"])
        if trust:
            refuse("the root writer would refuse a reader here: %s" % "; ".join(trust))
        if env.as_user("test -x %s" % run).returncode != 0:
            refuse("%s cannot traverse to %s" % (pw.pw_name, run))
        a, _b = t_modes(env)
        t_refusals(env, a)
        t_eperm(env, a)
        t_trim(env)
        rearm_after_kill = t_kill(env, a)
        t_check(env, a, rearm_after_kill)
        t_gap(env, a)
        t_selftest(env)
    finally:
        try:
            subprocess.run(["chattr", "-R", "-i", run], check=True, capture_output=True, timeout=120)
            shutil.rmtree(run)                              # WITHOUT ignore_errors: a leak fails the run
        except Exception as e:
            check("teardown removed %s" % run, "%s: %s" % (type(e).__name__, e), "removed")
    check("the run directory is gone", os.path.exists(run), False)
    print("ALL PASS" if ok else "FAILURES")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
