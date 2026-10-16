#!/usr/bin/env python3
"""Red controls for coltrane-telegram-corpus-install (Coltrane r2 security blocker, 2026-10-16). Run as ROOT on the
agent box beside the installer: `python3 test_telegram_corpus_install.py [installer-path]`. Every attack case must
exit NON-zero and leave its canary's bytes, mode and owner unchanged; the happy path must hand over a correct copy."""
import hashlib, json, os, pwd, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, "coltrane-telegram-corpus-install")
OWNER = "coltrane"
ok = True


def check(name, got, want):
    global ok
    good = got == want
    ok = ok and good
    print("  %-4s %-82s expected %-8s got %s" % ("PASS" if good else "FAIL", name, str(want)[:8], str(got)[:100]))


def meta(p):
    st = os.lstat(p)
    with open(p, "rb") as fh:
        return (hashlib.sha256(fh.read()).hexdigest(), st.st_mode & 0o7777, st.st_uid, st.st_gid)


def run(src, dest):
    p = subprocess.run([sys.executable, TOOL, "--source", src, "--dest", dest, "--owner", OWNER],
                       capture_output=True, timeout=60)
    return p.returncode, (p.stdout + p.stderr).decode("utf-8", "replace")


def fixture():
    top = tempfile.mkdtemp(prefix="tgci-", dir="/root")
    os.chmod(top, 0o755)
    src = os.path.join(top, "src")
    os.makedirs(src)
    for n, b in (("A.md", b"alpha quokka\n"), ("B.jsonl", b'{"text": "beta"}\n')):
        open(os.path.join(src, n), "wb").write(b)
    store = os.path.join(top, "home", "memory")
    os.makedirs(store)
    pw = pwd.getpwnam(OWNER)
    for d in (os.path.join(top, "home"), store):
        os.chown(d, pw.pw_uid, pw.pw_gid)
    victim = os.path.join(top, "victim")
    os.makedirs(victim)
    open(os.path.join(victim, "A.md"), "wb").write(b"ROOT-OWNED CANARY\n")
    os.chmod(os.path.join(victim, "A.md"), 0o600)
    secret = os.path.join(top, "secret.txt")
    open(secret, "wb").write(b"SECRET CANARY\n")
    os.chmod(secret, 0o600)
    return top, src, store, victim, secret


def main():
    if os.geteuid() != 0:
        sys.exit("run as root")
    pw = pwd.getpwnam(OWNER)

    print("1. happy path")
    top, src, store, victim, secret = fixture()
    dest = os.path.join(store, ".corpus", "telegram")
    rc, out = run(src, dest)
    check("exit 0", rc, 0)
    st = os.lstat(dest)
    check("dest handed over: owner %s, mode 0750, a real dir" % OWNER,
          (st.st_uid, st.st_mode & 0o7777, os.path.islink(dest)), (pw.pw_uid, 0o750, False))
    man = json.load(open(os.path.join(dest, "PROVENANCE.json")))
    check("every file 0640 owned by %s with its source hash" % OWNER, all(
        meta(os.path.join(dest, f["name"]))[1:3] == (0o640, pw.pw_uid)
        and meta(os.path.join(dest, f["name"]))[0] == f["sha256"] for f in man["files"]), True)
    rc, out = run(src, dest)
    check("a second run refuses (dest exists)", rc != 0, True)
    shutil.rmtree(top)

    print("2. a pre-planted symlink AT the destination (the r2 reproduction)")
    top, src, store, victim, secret = fixture()
    os.makedirs(os.path.join(store, ".corpus"))
    dest = os.path.join(store, ".corpus", "telegram")
    os.symlink(victim, dest)
    before = meta(os.path.join(victim, "A.md"))
    rc, out = run(src, dest)
    check("refuses (non-zero)", rc != 0, True)
    check("  ...the victim's bytes, mode and owner are unchanged", meta(os.path.join(victim, "A.md")), before)
    shutil.rmtree(top)

    print("3. a symlink at the destination's PARENT (.corpus -> victim)")
    top, src, store, victim, secret = fixture()
    os.symlink(victim, os.path.join(store, ".corpus"))
    before = meta(os.path.join(victim, "A.md"))
    rc, out = run(src, os.path.join(store, ".corpus", "telegram"))
    check("refuses (non-zero)", rc != 0, True)
    check("  ...nothing created inside the victim", sorted(os.listdir(victim)), ["A.md"])
    check("  ...the victim file unchanged", meta(os.path.join(victim, "A.md")), before)
    shutil.rmtree(top)

    print("4. a symlink HIGHER on the path (memory -> victim)")
    top, src, store, victim, secret = fixture()
    shutil.rmtree(store)
    os.symlink(victim, store)
    before = meta(os.path.join(victim, "A.md"))
    rc, out = run(src, os.path.join(store, ".corpus", "telegram"))
    check("refuses (non-zero)", rc != 0, True)
    check("  ...nothing created inside the victim", sorted(os.listdir(victim)), ["A.md"])
    shutil.rmtree(top)

    print("5. a symlink planted in the SOURCE (A.md -> a root-only secret)")
    top, src, store, victim, secret = fixture()
    os.remove(os.path.join(src, "A.md"))
    os.symlink(secret, os.path.join(src, "A.md"))
    before = meta(secret)
    dest = os.path.join(store, ".corpus", "telegram")
    rc, out = run(src, dest)
    check("refuses (non-zero)", rc != 0, True)
    leaked = False
    if os.path.isdir(dest):
        for n in os.listdir(dest):
            p = os.path.join(dest, n)
            if os.path.isfile(p) and b"SECRET CANARY" in open(p, "rb").read():
                leaked = True
        dst = os.lstat(dest)
        check("  ...the partial destination stays ROOT-owned 0700 (never handed over)",
              (dst.st_uid, dst.st_mode & 0o7777), (0, 0o700))
    check("  ...the secret's bytes were NOT copied", leaked, False)
    check("  ...the secret is unchanged", meta(secret), before)
    shutil.rmtree(top)

    print("ALL PASS" if ok else "FAILURES")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
