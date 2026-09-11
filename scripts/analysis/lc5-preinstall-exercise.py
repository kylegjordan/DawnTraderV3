#!/usr/bin/env python3
"""B-LANGSTON-CONTEXT P-6b, Step 6 part B - PRE-INSTALL EXERCISE of amendment E (writer bd6a00ed1) and the
per-source backup report (backup c0e37e650). PRE-REGISTERED: the EXPECTED block is committed and pushed BEFORE this is
run (Langston 19:16Z, the two-clause rider on #744: exercise the real failure branch, and state the expected output
first). Runs the STAGED copies in /root/lc5-install. The writer runs against a synthetic fixture in /root/lc5-exercise
(700). The backup runs --dry-run only, which returns before anything is written; B3 checks that. Nothing live is touched.
Run as root on Helsinki:  python3 lc5-preinstall-exercise.py      exit 0 = every case matched its expectation."""
EXPECTED = """
W1 control: a clean one-entry ledger append              -> exit 0; target sha changes; ledger bullets 5 -> 6
W2 a stray second bullet declared as 1, NO corruption    -> exit 5; target byte-identical to before; last index row
                                                            restored_byte_identical = true
W3 the same refusal WITH LMW_TEST_CORRUPT_RESTORE=1      -> exit 6, not 5; output contains 'did NOT restore' and
                                                            '.memory-archive'; target sha != the old sha; the archive
                                                            file <old sha>.md holds exactly the old bytes; last index
                                                            row restored_byte_identical = false
W4 /opt/langston-memory/bin/__pycache__                  -> owner, mode and mtime unchanged across W1-W3 (amendment A)
B1 staged backup --dry-run against the REAL folders      -> exit 0; exactly two source lines; 'memory' present with
                                                            members >= 1; '.memory-archive' present with members 1,
                                                            bytes 241 (the SENTINEL alone - more members only if a real
                                                            write went through the installed writer since 19:09Z, which
                                                            the member list would show)
B2 the same, archive path pointed at a missing folder    -> exit 0; the '.memory-archive' line reads ABSENT with
                                                            members 0 - listed, never dropped; 'memory' still present
B3 side effects of B1 and B2                             -> run log and manifest mtimes unchanged; the backup
                                                            destination listing unchanged
"""
import hashlib, json, os, shutil, subprocess, sys

NL = chr(10)
EM = chr(0x2014)
STAR = chr(0x2605)
DOT = chr(0xB7)
W = "/root/lc5-install/langston-memory-write"
BK = "/root/lc5-install/langston-selfmemory-backup"
TOP = "/root/lc5-exercise"
TARGET = TOP + "/MEMORY.md"
ARCH = TOP + "/.memory-archive"
ANCHOR = "### Rulings of mine that GENERALISE"
PYC = "/opt/langston-memory/bin/__pycache__"
RUNLOG = "/opt/langston-memory/usage/selfmemory-backup.jsonl"
MANIFEST = "/opt/langston-memory/usage/selfmemory-backup-manifest.md"
DEST = "/root/backups/langston-selfmemory"

# the writer self-test's own fixture, rebuilt byte-for-byte: 2 retractions; 2 + 2 + 1 = 5 ledger bullets
BASE = NL.join([
    "# MEMORY " + EM + " fixture", "",
    "## " + STAR * 2 + " REVIEWER LEDGER " + EM + " MY OWN RETRACTIONS, RULINGS AND ERRORS", "",
    "### Retractions (things I asserted and then withdrew " + EM + " do NOT re-assert)",
    "- **first retraction**, a fixture entry long enough to look like one.",
    "- **second retraction**, with a continuation line below.",
    "  " + DOT + " a continuation led by a middle dot",
    "", ANCHOR + " (reusable)",
    "- a generalised ruling, which the reader must NOT count as a retraction",
    "- a second generalised ruling", "",
    "### CC-A errors I logged",
    "- an error note", "",
    "## " + STAR + " STANDING NOTES", "- a note outside the ledger", ""])

results = []


def verdict(case, ok, observed):
    results.append((case, ok))
    print("%s  %-3s %s" % ("MATCH " if ok else "DIFFER", case, observed))


def sha(b):
    return hashlib.sha256(b).hexdigest()


def interp(path):
    with open(path, encoding="utf-8") as fh:
        first = fh.readline()
    return first[2:].split() if first.startswith("#!") else [sys.executable]


def reset():
    os.makedirs(TOP, exist_ok=True)
    os.chmod(TOP, 0o700)
    with open(TARGET, "w", encoding="utf-8", newline="") as fh:
        fh.write(BASE)
    os.chmod(TARGET, 0o644)
    if os.path.isdir(ARCH):
        shutil.rmtree(ARCH)


def cur():
    with open(TARGET, "rb") as fh:
        b = fh.read()
    return b, sha(b)


def ledger_bullets(b):
    n, inside = 0, False
    for line in b.decode("utf-8").split(NL):
        if line.startswith("## "):
            inside = "REVIEWER LEDGER" in line
        elif inside and line.startswith("- "):
            n += 1
    return n


def write(s, stdin_text, corrupt=False):
    env = dict(os.environ, LANGSTON_HOME=TOP)
    env.pop("LMW_TEST_CORRUPT_RESTORE", None)
    env.pop("LANGSTON_MEMORY_READER", None)
    if corrupt:
        env["LMW_TEST_CORRUPT_RESTORE"] = "1"
    args = ["--expect-sha", s, "--ledger-append", "--entries", "1", "--by", "lc5-exercise", "--reason", "pre-install exercise"]
    p = subprocess.run(interp(W) + [W] + args, input=stdin_text.encode("utf-8"), capture_output=True, env=env)
    return p.returncode, (p.stdout + p.stderr).decode("utf-8", "replace")


def last_index():
    with open(ARCH + "/index.jsonl", encoding="utf-8") as fh:
        return [json.loads(l) for l in fh if l.strip()][-1]


def stat_of(path):
    try:
        st = os.stat(path)
        return (st.st_uid, st.st_gid, oct(st.st_mode), st.st_mtime_ns)
    except FileNotFoundError:
        return "absent"


print("EXPECTED (pre-registered):" + EXPECTED)
with open(W, "rb") as fh:
    print("staged writer sha256 %s" % sha(fh.read()))
with open(BK, "rb") as fh:
    print("staged backup sha256 %s" % sha(fh.read()))
pyc_before = stat_of(PYC)

reset()
b0, s0 = cur()
rc, out = write(s0, "- one clean entry" + NL)
b1, s1 = cur()
verdict("W1", rc == 0 and s1 != s0 and ledger_bullets(b0) == 5 and ledger_bullets(b1) == 6,
        "exit %d, sha changed %s, bullets %d -> %d" % (rc, s1 != s0, ledger_bullets(b0), ledger_bullets(b1)))

reset()
b0, s0 = cur()
rc, out = write(s0, "- one entry" + NL + "- a stray second column-0 bullet" + NL)
b2, s2 = cur()
row = last_index()
verdict("W2", rc == 5 and s2 == s0 and row.get("restored_byte_identical") is True,
        "exit %d, byte-identical %s, index restored_byte_identical=%s" % (rc, s2 == s0, row.get("restored_byte_identical")))

reset()
b0, s0 = cur()
rc, out = write(s0, "- one entry" + NL + "- a stray second column-0 bullet" + NL, corrupt=True)
b3, s3 = cur()
row = last_index()
arch_file = os.path.join(ARCH, s0 + ".md")
arch_ok = False
if os.path.isfile(arch_file):
    with open(arch_file, "rb") as fh:
        arch_ok = sha(fh.read()) == s0
verdict("W3", rc == 6 and "did NOT restore" in out and ".memory-archive" in out and s3 != s0 and arch_ok
        and row.get("restored_byte_identical") is False,
        "exit %d, says-not-restored %s, names-archive %s, target differs %s, archive holds old bytes %s, index=%s"
        % (rc, "did NOT restore" in out, ".memory-archive" in out, s3 != s0, arch_ok, row.get("restored_byte_identical")))
print("     W3 output: " + out.strip().replace(NL, " | ")[:400])

pyc_after = stat_of(PYC)
verdict("W4", pyc_before == pyc_after, "before %s, after %s" % (pyc_before, pyc_after))


def side_effects():
    return (stat_of(RUNLOG), stat_of(MANIFEST), sorted(os.listdir(DEST)) if os.path.isdir(DEST) else "absent")


side_before = side_effects()


def dry(extra_env=None):
    env = dict(os.environ)
    for k in ("SELFMEM_STORE", "SELFMEM_ARCHIVE", "SELFMEM_DEST", "SELFMEM_MANIFEST", "SELFMEM_RUNLOG"):
        env.pop(k, None)
    if extra_env:
        env.update(extra_env)
    p = subprocess.run(interp(BK) + [BK, "--dry-run"], capture_output=True, env=env)
    text = (p.stdout + p.stderr).decode("utf-8", "replace")
    srcs = {}
    for line in text.split(NL):
        parts = line.split()
        if len(parts) >= 7 and parts[0] == "source":
            srcs[parts[1]] = {"state": parts[2], "members": int(parts[4]), "bytes": int(parts[6])}
    return p.returncode, srcs, text


rc, srcs, text = dry()
m, a = srcs.get("memory", {}), srcs.get(".memory-archive", {})
verdict("B1", rc == 0 and len(srcs) == 2 and m.get("state") == "present" and m.get("members", 0) >= 1
        and a.get("state") == "present" and a.get("members") == 1 and a.get("bytes") == 241,
        "exit %d, sources %s" % (rc, json.dumps(srcs)))
if a.get("members") != 1:
    print("     B1 archive members listed: " + " | ".join(l.strip() for l in text.split(NL) if ".memory-archive/" in l))

rc, srcs, text = dry({"SELFMEM_ARCHIVE": TOP + "/absent/.memory-archive"})
m, a = srcs.get("memory", {}), srcs.get(".memory-archive", {})
verdict("B2", rc == 0 and len(srcs) == 2 and m.get("state") == "present" and a.get("state") == "ABSENT" and a.get("members") == 0,
        "exit %d, sources %s" % (rc, json.dumps(srcs)))

side_after = side_effects()
verdict("B3", side_before == side_after, "run log, manifest and destination unchanged: %s" % (side_before == side_after))

bad = [c for c, ok in results if not ok]
print("RESULT: %d of %d matched%s" % (len(results) - len(bad), len(results), "" if not bad else "; DIFFER: " + ", ".join(bad)))
sys.exit(1 if bad else 0)
