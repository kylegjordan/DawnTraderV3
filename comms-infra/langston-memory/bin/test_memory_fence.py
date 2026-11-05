#!/usr/bin/env python3
"""B-LANGSTON-MEMORY-WRITE-FENCE P6(a) - the PURE suite: no root, no Linux, nothing outside a temp dir. It loads the
real writer, allowlist and spool service from SOURCE and drives their functions with fakes where a call would need root
(chown, the immutable flag, the live spool). The root-only, real-filesystem suite is test_memory_fence_root.py.

    python3 test_memory_fence.py            (exit 0 = every check passed; mutate_memory_fence.py proves it bites)

Named checks marked ★ are the ones the mutation runner looks for."""
import base64, errno, json, os, shutil, stat, sys, tempfile, types

sys.dont_write_bytecode = True
sys.stdout.reconfigure(encoding="utf-8", errors="replace")     # the ★ names, on a cp1252 console
HERE = os.path.dirname(os.path.abspath(__file__))
# Windows test hosts only: these constants exist on Linux, where the code runs. Stub values are distinct HIGH bits -
#   0x20000 is the CRT's _O_U16TEXT there, which turns a byte write into EINVAL.
for name, val in (("O_NOFOLLOW", 0x1000000), ("O_NONBLOCK", 0x2000000), ("O_CLOEXEC", 0x4000000),
                  ("O_DIRECTORY", 0x8000000)):
    if not hasattr(os, name):
        setattr(os, name, val)
if not hasattr(os, "getuid"):                    # the writer's index rows record via_uid
    os.getuid = lambda: 1000

ACCOUNTS = {"root": (0, 0), "langston": (999, 987)}


def _pw(name, uid, gid):
    return types.SimpleNamespace(pw_name=name, pw_uid=uid, pw_gid=gid, pw_dir="/" + name)


FAKE_PWD = types.SimpleNamespace(
    getpwnam=lambda n: _pw(n, *ACCOUNTS[n]),
    getpwuid=lambda u: next(_pw(n, a, b) for n, (a, b) in ACCOUNTS.items() if a == u))
for modname in ("fcntl", "pwd"):                 # Windows: the writer imports both at the top
    if modname not in sys.modules:
        try:
            __import__(modname)
        except ImportError:
            sys.modules[modname] = types.ModuleType(modname)

ok = True


def check(name, got, want):
    global ok
    good = got == want
    ok = ok and good
    print("  %-4s %-92s expected %-14s got %s" % ("PASS" if good else "FAIL", name, str(want)[:14], str(got)[:140]))


def load(path, name, env=None):
    saved = {k: os.environ.get(k) for k in (env or {})}
    os.environ.update(env or {})
    try:
        with open(path, "rb") as fh:
            src = fh.read()
        mod = types.ModuleType(name)
        mod.__file__ = path
        exec(compile(src, path, "exec"), mod.__dict__)
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v
    if hasattr(mod, "pwd"):
        mod.pwd = FAKE_PWD
    return mod


def raises(fn, *a):
    try:
        fn(*a)
    except Exception as e:
        return e
    return None


TOP = tempfile.mkdtemp(prefix="lmw-fence-pure-")
HOME = os.path.join(TOP, "home")
os.makedirs(os.path.join(HOME, "memory-parts"))
W = load(os.path.join(HERE, "langston-memory-write"), "lmw", {"LANGSTON_HOME": HOME})
AL = load(os.path.join(HERE, "langston_memory_allowlist.py"), "lmw_allowlist")
SP = load(os.path.join(HERE, "langston-memory-spoold"), "lmw_spoold")
SHA0 = "a" * 64


def t_table():
    print("1. the FENCE table (P1, C-14)")
    # pinned from the pre-audit: A1/A3, C-13 (MEMORY-ARCHIVE.md fenced), C-7 (group read), compose-state root:root;
    # the lock row (root:root 0600) is this implementation's reading - nothing but the writer opens it
    expect = {
        "MEMORY.md": ("root", "langston", 0o640, True, "a"),
        "MEMORY-ARCHIVE.md": ("root", "langston", 0o640, True, "a"),
        "compose-state.json": ("root", "root", 0o600, True, "b"),
        ".memory-archive/": ("root", "langston", 0o750, False, "b"),
        "index.jsonl": ("root", "langston", 0o640, False, "b"),
        "archive file <sha256>.md": ("root", "langston", 0o640, False, "b"),
        "the write lock": ("root", "root", 0o600, False, "b"),
        "LEDGER.md": ("langston", "langston", 0o600, False, "c"),
        "memory part": ("langston", "langston", 0o600, False, "c"),
    }
    got = {r["name"]: (r["user"], r["group"], r["mode"], r["immutable"], r["cat"]) for r in W.FENCE}
    check("★ every row's owner, group, mode, flag and category equal the r2a table", got, expect)
    paths = {r["name"]: r.get("path") for r in W.FENCE}
    check("the table's paths ARE the paths the writer writes",
          [paths["MEMORY.md"], paths["MEMORY-ARCHIVE.md"], paths["compose-state.json"], paths[".memory-archive/"],
           paths["index.jsonl"], paths["the write lock"], paths["LEDGER.md"]],
          [os.path.abspath(p) for p in (W.TARGET, W.ARCHIVE_FILE, W.COMPOSE_STATE, W.ARCHIVE_DIR, W.ARCHIVE_INDEX,
                                        W.LOCK, W.LEDGER_FILE)])
    check("★ C-2: the lock lives inside the root-owned .memory-archive/", os.path.dirname(W.LOCK), W.ARCHIVE_DIR)
    check("★ C-10: every replace is staged in .memory-archive/, never in his home", W.STAGE_DIR, W.ARCHIVE_DIR)
    check("no fenced row is group- or other-writable",
          [r["name"] for r in W.FENCE if r["cat"] != "c" and r["mode"] & 0o022], [])
    check("every immutable row is a file", [r["name"] for r in W.FENCE if r["immutable"] and r["kind"] != "file"], [])
    check("only MEMORY.md may be adopted from another owner", [r["name"] for r in W.FENCE if r["adopt"]], ["MEMORY.md"])
    samples = [W.TARGET, W.ARCHIVE_FILE, W.COMPOSE_STATE, W.ARCHIVE_INDEX, W.LOCK, W.LEDGER_FILE,
               os.path.join(W.ARCHIVE_DIR, SHA0 + ".md"), os.path.join(W.PARTS_DIR, "00-legacy.md")]
    check("★ C-7: owner_only() gives every written path its TABLE mode (group read kept)",
          [oct(W.owner_only(p)) for p in samples], [oct(W.fence_row(p)["mode"]) for p in samples])
    check("  ...MEMORY.md is 0640, not owner-only", oct(W.owner_only(W.TARGET)), "0o640")
    calls = []
    real = getattr(os, "fchown", None)
    W.euid = lambda: 0
    os.fchown = lambda fd, u, g: calls.append((u, g))
    try:
        for p in samples:
            W.hand_to_owner(5, p)
    finally:
        if real is None:
            del os.fchown
        else:
            os.fchown = real
        W.euid = os.geteuid if hasattr(os, "geteuid") else (lambda: 1000)
    want = [W.row_ids(W.fence_row(p)) for p in samples]
    check("★ C-14: hand_to_owner() chowns each path to ITS row's owner, not the TARGET's", calls, want)
    check("  ...compose-state.json goes to root:root", calls[2], (0, 0))
    for bad in (os.path.join(TOP, "elsewhere.md"), os.path.join(W.ARCHIVE_DIR, "not-a-sha.md"),
                os.path.join(W.PARTS_DIR, ".hidden")):
        e = raises(W.fence_row, bad)
        check("a path with no row refuses (exit 6): %s" % os.path.relpath(bad, TOP),
              (type(e).__name__, getattr(e, "code", None)), ("Refused", 6))
    row = W.fence_row(W.TARGET)
    check("fence_drift: equal -> nothing", W.fence_drift(0, 987, stat.S_IFREG | 0o640, row, 0, 987), [])
    check("fence_drift: his old langston:langston 0600 -> owner and mode differ (the group already matches)",
          len(W.fence_drift(999, 987, stat.S_IFREG | 0o600, row, 0, 987)), 2)
    check("fence_drift: root:root 0644 -> group and mode", len(W.fence_drift(0, 0, stat.S_IFREG | 0o644, row, 0, 987)), 2)


def t_allowlist():
    print("2. the allowlist (A5) - the authority on what his account may run")
    parts = os.path.join(HOME, "memory-parts")
    with open(os.path.join(parts, "00-legacy.md"), "w") as fh:
        fh.write("x\n")
    os.makedirs(os.path.join(parts, "adir"), exist_ok=True)
    with open(os.path.join(HOME, "outside.md"), "w") as fh:
        fh.write("not a part\n")
    try:
        os.symlink(os.path.join(HOME, "outside.md"), os.path.join(parts, "linked"))
        linked = True
    except (OSError, NotImplementedError):
        linked = False
    append = ["--expect-sha", SHA0, "--ledger-append", "--entries", "1", "--by", "langston", "--reason", "r"]
    whole = ["--expect-sha", SHA0, "--ledger-delta", "0", "--retractions-delta", "-1", "--by", "langston",
             "--reason", "r"]
    v = lambda argv, stdin=b"x": AL.validate(argv, stdin, parts)
    check("an append passes, --by forced to langston and last", v(append),
          ("append", ["--expect-sha", SHA0, "--ledger-append", "--entries", "1", "--reason", "r", "--by", "langston"]))
    check("a whole-part write with --part passes", v(whole + ["--part", "00-legacy.md"])[0], "whole")
    check("compose passes (no stdin)", v(["--compose", "--by", "langston", "--reason", "r"], b""),
          ("compose", ["--compose", "--reason", "r", "--by", "langston"]))
    forced = v(whole[:6] + ["--by", "OLD Claude", "--reason", "r"])[1]
    check("★ --by is never taken from the request", (forced.count("--by"), "OLD Claude" in forced, forced[-2:]),
          (1, False, ["--by", "langston"]))
    check("--by may be absent; the service adds it", v(whole[:6] + ["--reason", "r"])[1][-2:], ["--by", "langston"])
    check("a --reason that looks like a flag is a value (the writer's FINDING-1)",
          v(whole[:6] + ["--reason", "--self-test"])[0], "whole")
    refused = lambda argv, stdin=b"x": type(raises(v, argv, stdin)).__name__
    for flag in ("--trim", "--split-ledger", "--self-test", "--bogus"):
        check("%s is refused" % flag, refused(whole + [flag]), "Refusal")
    for flag in ("--rename-part", "--to"):
        check("%s is refused" % flag, refused(whole + [flag, "x.md"]), "Refusal")
    check("★ --allow-growth is refused (r2, DROPPED)", refused(whole + ["--allow-growth", "a reason"]), "Refusal")
    # Step-4 C-2 (Langston): --dry-run struck everywhere; --part struck from the append shape
    check("★ --dry-run is refused on a whole-part write (C-2)", refused(whole + ["--dry-run"]), "Refusal")
    check("★ --dry-run is refused on an append (C-2)", refused(append + ["--dry-run"]), "Refusal")
    check("★ --dry-run is refused on compose (C-2)",
          refused(["--compose", "--by", "langston", "--reason", "r", "--dry-run"], b""), "Refusal")
    check("★ --part on an append is refused - the append would ignore it (C-2)",
          refused(append + ["--part", "00-legacy.md"]), "Refusal")
    for bad in ("../outside.md", os.path.join(HOME, "outside.md"), "sub/x", ".hidden", "nonexistent.md", "adir"):
        check("★ --part %r is refused" % bad, refused(whole + ["--part", bad]), "Refusal")
    if linked:
        check("--part naming a symlink in memory-parts is refused", refused(whole + ["--part", "linked"]), "Refusal")
    for flag, val in (("--expect-sha", "a" * 63), ("--expect-sha", "new"), ("--expect-sha", "g" * 64),
                      ("--ledger-delta", "1.5"), ("--ledger-delta", "1e3"), ("--retractions-delta", "")):
        argv = list(whole)
        argv[argv.index(flag) + 1] = val
        check("%s %r is refused" % (flag, val), refused(argv), "Refusal")
    for val in ("0", "-1", "x"):
        argv = list(append)
        argv[argv.index("--entries") + 1] = val
        check("--entries %r is refused" % val, refused(argv), "Refusal")
    check("a --reason over the cap is refused", refused(whole[:8] + ["--reason", "r" * 1001]), "Refusal")
    check("a NUL in a value is refused", refused(whole[:8] + ["--reason", "a\x00b"]), "Refusal")
    check("a flag given twice is refused", refused(whole + ["--reason", "again"]), "Refusal")
    check("a value flag with no value is refused", refused(whole[:-1]), "Refusal")
    check("a missing required flag is refused", refused(whole[2:]), "Refusal")
    check("two shapes mixed are refused", refused(append + ["--compose"]), "Refusal")
    check("--compose with stdin is refused", refused(["--compose", "--reason", "r"], b"x"), "Refusal")
    rid = "0" * 32
    good = W.build_request(rid, whole, b"\xffbytes")
    check("the client's request parses back to its argv and stdin, byte for byte", AL.parse_request(good, rid),
          (whole, b"\xffbytes"))
    big = W.build_request(rid, ["--reason", "r" * AL.MAX_REQUEST_BYTES], b"")     # valid JSON: only the size is wrong
    e = raises(AL.parse_request, big, rid)
    check("★ an oversize request is refused", (type(e).__name__, "too large" in str(e)), ("Refusal", True))
    cases = [("not JSON", b"{"), ("id mismatch", W.build_request("1" * 32, whole, b"")),
             ("an extra key", json.dumps({"v": 1, "id": rid, "argv": [], "stdin_b64": "", "x": 1}).encode()),
             ("version 2", json.dumps({"v": 2, "id": rid, "argv": [], "stdin_b64": ""}).encode()),
             ("argv not a list", json.dumps({"v": 1, "id": rid, "argv": "--compose", "stdin_b64": ""}).encode()),
             ("bad base64", json.dumps({"v": 1, "id": rid, "argv": [], "stdin_b64": "!!"}).encode()),
             ("stdin over its cap", W.build_request(rid, whole, b"x" * (AL.MAX_STDIN_BYTES + 1)))]
    for label, data in cases:
        check("a request with %s is refused" % label, type(raises(AL.parse_request, data, rid)).__name__, "Refusal")


class FakeOS:
    """Stands in for os inside take_entry/remove_entry: records every call. `contents` are what successive OPENS see -
    a second open would see the swapped bytes, which is how a re-read by path would show."""

    def __init__(self, contents, uid=999, nlink=1, mode=stat.S_IFREG | 0o600, open_errno=None, ino_after=42):
        self.contents, self.uid, self.nlink, self.mode = list(contents), uid, nlink, mode
        self.open_errno, self.ino_after, self.calls = open_errno, ino_after, []

    def open(self, path, flags):
        self.calls.append(("open", flags))
        if self.open_errno:
            raise OSError(self.open_errno, os.strerror(self.open_errno))
        self.cur, self.pos = (self.contents.pop(0) if len(self.contents) > 1 else self.contents[0]), 0
        return 7

    def fstat(self, fd):
        self.calls.append(("fstat",))
        return types.SimpleNamespace(st_mode=self.mode, st_uid=self.uid, st_nlink=self.nlink, st_dev=1, st_ino=42)

    def read(self, fd, n):
        b = self.cur[self.pos:self.pos + n]
        self.pos += len(b)
        self.calls.append(("read", len(b)))
        return b

    def close(self, fd):
        self.calls.append(("close",))

    def lstat(self, path):
        self.calls.append(("lstat",))
        return types.SimpleNamespace(st_mode=stat.S_IFREG | 0o600, st_dev=1, st_ino=self.ino_after)

    def unlink(self, path):
        self.calls.append(("unlink",))


def t_spoold():
    print("3. the root service: read once, by fd, then the in-memory copy is what runs (A6 ORDER BINDING)")
    rid = "ab" * 16
    argv = ["--compose", "--by", "langston", "--reason", "r"]
    a = W.build_request(rid, argv, b"")
    b = W.build_request(rid, ["--compose", "--reason", "SWAPPED"], b"")

    def ctx_for():
        ran, replies = [], []
        return ran, replies, {"spool": os.path.join(TOP, "spool"), "home": HOME, "owner_uid": 999, "owner_gid": 987,
                              "allowlist": AL, "execute": lambda av, si: ran.append((av, si)) or (0, b"out", b""),
                              "reply": lambda sp, r, rc, o, e, g: replies.append((r, rc, o, e))}
    fake = FakeOS([a, b])
    ran, replies, ctx = ctx_for()
    SP.handle(rid + ".req", ctx, fake)
    kinds = [c[0] for c in fake.calls]
    opens = [c for c in fake.calls if c[0] == "open"]
    last_read = max([i for i, k in enumerate(kinds) if k == "read"] or [len(kinds)])
    by_name = [i for i, k in enumerate(kinds) if k in ("lstat", "unlink")]
    check("★ the entry is opened ONCE", len(opens), 1)
    check("★ ...with O_NOFOLLOW", bool(opens) and bool(opens[0][1] & os.O_NOFOLLOW), True)
    check("★ the name is unlinked only AFTER the read (nothing touches it by name before)",
          (bool(by_name), all(i > last_read for i in by_name), "unlink" in kinds), (True, True, True))
    check("★ what runs is the IN-MEMORY copy (the swapped bytes never run)", ran,
          [(["--compose", "--reason", "r", "--by", "langston"], b"")])
    check("  ...and the answer goes back under the request's id", [(r[0], r[1]) for r in replies], [(rid, 0)])
    for label, kw, want in (("a symbolic link", {"open_errno": errno.ELOOP}, "symbolic link"),
                            ("not his", {"uid": 1234}, "not created by"),
                            ("a hard link", {"nlink": 2}, "links"),
                            ("not a regular file", {"mode": stat.S_IFIFO | 0o600}, "not a regular file")):
        fake = FakeOS([a], **kw)
        ran, replies, ctx = ctx_for()
        SP.handle(rid + ".req", ctx, fake)
        check("an entry that is %s is refused, nothing runs, the entry is removed" % label,
              (ran, replies[0][1] if replies else None, want in replies[0][3].decode() if replies else False,
               ("unlink",) in fake.calls), ([], 2, True, True))
    fake = FakeOS([b"x" * (AL.MAX_REQUEST_BYTES + 10)])
    ran, replies, ctx = ctx_for()
    SP.handle(rid + ".req", ctx, fake)
    check("★ an oversize entry stops reading at the cap and is refused", (ran, replies[0][1],
          "too large" in replies[0][3].decode(), sum(c[1] for c in fake.calls if c[0] == "read") <= AL.MAX_REQUEST_BYTES + 1),
          ([], 2, True, True))
    fake = FakeOS([W.build_request(rid, ["--trim", "--by", "x", "--reason", "r"], b"")])
    ran, replies, ctx = ctx_for()
    SP.handle(rid + ".req", ctx, fake)
    check("a disallowed request is answered exit 2 with the service's reason, nothing runs",
          (ran, replies[0][1], b"REFUSED by the root memory service" in replies[0][3]), ([], 2, True))
    fake = FakeOS([a])
    ran, replies, ctx = ctx_for()
    SP.handle("not-an-id.req", ctx, fake)
    check("an entry whose name is no request id is removed and answered to no one",
          (ran, replies, ("unlink",) in fake.calls), ([], [], True))
    fake = FakeOS([a], ino_after=43)
    ran, replies, ctx = ctx_for()
    SP.handle(rid + ".req", ctx, fake)
    check("a name re-pointed after the read is left for the next run, not unlinked", ("unlink",) in fake.calls, False)


def t_client():
    print("4. the client (P2): hand-off first, verbatim relay, the exit-7 text")
    spool = os.path.join(TOP, "spool-client")
    for d in ("tmp", "in", "out"):
        os.makedirs(os.path.join(spool, d), exist_ok=True)
    rid = "cd" * 16
    touched = []

    def tripwire(name):
        def f(*a, **k):
            touched.append(name)
            raise RuntimeError("touched " + name)
        return f
    for name in ("open_lock", "load_reader", "read_compose_state", "ensure_fence", "read_parts"):
        setattr(W, name, tripwire(name))
    W.SPOOL_DIR, W.new_request_id, W.RESULT_UID = spool, (lambda: rid), os.stat(spool).st_uid
    W.euid, W.owner_uid = (lambda: 999), (lambda: 999)
    W._SPOOL_ENV = spool

    def answer(rc, out, err):
        with open(os.path.join(spool, "out", rid + ".res"), "w") as fh:
            json.dump({"v": 1, "id": rid, "rc": rc, "stdout_b64": base64.b64encode(out).decode(),
                       "stderr_b64": base64.b64encode(err).decode()}, fh)

    def go(argv, stdin):
        try:
            W.run(argv, stdin)
        except Exception as e:
            return e
        return None
    argv = ["--expect-sha", SHA0, "--ledger-delta", "0", "--retractions-delta", "0", "--by", "langston", "--reason", "r"]
    err4 = b"REFUSED: ... was written OUTSIDE the composer (out-of-band). \xff\n"
    answer(4, b"", err4)
    got = go(argv, b"new part bytes\n")
    check("★ C-9: as the owner, the hand-off comes before ANY stat, lock or state read",
          (type(got).__name__, touched), ("ClientResult", []))
    check("★ exit 4 and its text come back verbatim, byte for byte", (getattr(got, "code", None), getattr(got, "err", None)),
          (4, err4))
    req = os.path.join(spool, "in", rid + ".req")
    check("the request landed whole in in/, and tmp/ is empty",
          (AL.parse_request(open(req, "rb").read(), rid), os.listdir(os.path.join(spool, "tmp"))),
          ((argv, b"new part bytes\n"), []))
    os.remove(req)
    W.read_ratchet = lambda n: {"state": "s", "live": True, "no_state": False, "ceiling_bytes": 10, "other": 5,
                                "missing": [], "total": 5 + n, "unknown": None}
    W.append_index = lambda row: None
    e7 = raises(W.growth_gate, b"aaaa", b"aaaaaaaa", {"--by": "langston", "--reason": "r"}, "part-whole-file")
    check("the writer's own growth refusal is exit 7 and offers --allow-growth",
          (getattr(e7, "code", None), "--allow-growth" in str(e7)), (7, True))
    answer(7, b"", str(e7).encode("utf-8") + b"\n")
    got = go(argv, b"x\n")
    check("★ exit 7 through the client: --allow-growth is gone, the advice is his to take",
          (got.code, b"--allow-growth" in got.err, b"ask Infra Claude to run it as root" in got.err), (7, False, True))
    check("  ...and the rest of the text is the service's, untouched",
          got.err, str(e7).encode().replace(W.GROWTH_ADVICE.encode(), W.CLIENT_GROWTH_ADVICE.encode()) + b"\n")
    check("an exit-4 text is not rewritten", W.rewrite_growth_advice(4, err4), err4)
    os.remove(os.path.join(spool, "in", rid + ".req"))
    os.remove(os.path.join(spool, "out", rid + ".res"))
    W.CLIENT_TIMEOUT = 0.3
    got = go(argv, b"x\n")
    check("no answer within the timeout refuses exit 6 and says it may still run",
          (getattr(got, "code", None), "may still run" in str(got)), (6, True))
    W._SPOOL_ENV = None
    got = go(argv, b"x\n")
    check("LANGSTON_HOME set off the live home, without LMW_SPOOL_DIR, refuses exit 2 (never silently ignored)",
          getattr(got, "code", None), 2)
    check("touched nothing on any client path", touched, [])
    W.euid = lambda: 0
    check("client_mode: root keeps the direct path", W.client_mode(), False)
    W.euid = lambda: 1234
    check("client_mode: another account is not a client", W.client_mode(), False)
    W.owner_uid = lambda: (_ for _ in ()).throw(KeyError("langston"))
    check("client_mode: no owner account -> not a client", W.client_mode(), False)
    live = load(os.path.join(HERE, "langston-memory-write"), "lmw_live", {"LANGSTON_HOME": "/home/langston",
                                                                          "LMW_OWNER": "someone"})
    check("LMW_OWNER beside the LIVE home: OWNER stays langston", live.OWNER, "langston")
    live.euid = lambda: 0
    e = raises(live.run, ["--compose", "--by", "x", "--reason", "r"], b"")
    check("  ...and a root run REFUSES exit 2 rather than ignore it", (type(e).__name__, getattr(e, "code", None)),
          ("Refused", 2))


def t_root_flags():
    print("5. the ROOT path refuses an ignored --part too (Langston Step-4 fold-in, parse_args' own class)")
    e = raises(W.parse_args, ["--expect-sha", SHA0, "--ledger-append", "--entries", "1", "--part", "00-legacy.md",
                              "--by", "x", "--reason", "r"])
    check("★ --ledger-append with --part is refused by parse_args (exit 2), naming --part",
          (type(e).__name__, getattr(e, "code", None), "--part" in str(e)), ("Refused", 2, True))
    e = raises(W.parse_args, ["--expect-sha", SHA0, "--ledger-append", "--entries", "1", "--by", "x", "--reason", "r"])
    check("POSITIVE CONTROL: the same append without --part parses", e, None)
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "langston-memory-write"), encoding="utf-8").read()
    i = src.index('if opts.get("--compose"):')
    block = src[i:src.index("raise Refused(2, \"REFUSED: %s does not apply to --compose\"", i)]
    check("★ run()'s --compose refusal list carries --part", '"--part"' in block, True)


def t_shrink():
    print("6. the shrink gate (Step 7, Langston): a drastic part or body shrink refuses without a root override")
    big, half, tiny = b"a" * 10000 + b"\n", b"a" * 6000 + b"\n", b"x\n"
    e = raises(W.shrink_gate, big, tiny, {}, "part 00-legacy.md")
    check("★ 10,001 B -> 2 B refuses with exit 8, naming the part and the sizes",
          (type(e).__name__, getattr(e, "code", None), "00-legacy.md" in str(e) and "10001 B to 2 B" in str(e)),
          ("Refused", 8, True))
    check("an ordinary shrink (10,001 -> 6,001 B) passes", W.shrink_gate(big, half, {}, "p"), None)
    check("a small file (under 4 KiB) is not gated, however it shrinks", W.shrink_gate(b"a" * 3000, tiny, {}, "p"), None)
    ov = W.shrink_gate(big, tiny, {"--allow-shrink": "deliberate", "--by": "cc-infra"}, "p")
    check("root's --allow-shrink records the override instead of refusing",
          (ov or {}).get("reason"), "deliberate")
    v = lambda argv, stdin=b"x": AL.validate(argv, stdin, os.path.join(HOME, "memory-parts"))
    whole = ["--expect-sha", SHA0, "--ledger-delta", "0", "--retractions-delta", "0", "--reason", "r"]
    check("★ --allow-shrink is refused through the spool (his account cannot pass it)",
          type(raises(v, whole + ["--allow-shrink", "please"])).__name__, "Refusal")


def main():
    try:
        t_table()
        t_allowlist()
        t_spoold()
        t_client()
        t_root_flags()
        t_shrink()
    finally:
        shutil.rmtree(TOP, ignore_errors=True)      # a plain temp dir: no flag is ever set in this suite
    print("ALL PASS" if ok else "FAILURES")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
