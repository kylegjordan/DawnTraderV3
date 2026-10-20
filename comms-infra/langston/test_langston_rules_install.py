"""Tests for langston-rules-install (B-LANGSTON-CLAUDEMD-RESIDUAL). Run as ROOT on Helsinki from a root-only dir
holding the installer and this file: python3 test_langston_rules_install.py
Builds a throwaway "GitHub" repo, a separate mirror and a target; never touches the live ones. Each case states its
expectation first. Part B is Langston's protection test (r1 on 9384b919a): a NON-root account that owns the target's
directory tries to write, unlink and rename-over a root:root 0644 file - first without the immutable flag, then with
it - with the expected outcome of each stated before it runs."""
import hashlib, os, pwd, shutil, stat, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
INST = os.path.join(HERE, "langston-rules-install")
REPO_PATH = "comms-infra/langston/LANGSTON_CLAUDE.md"
fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  expected %r got %r" % (want, got)))


def run(args, env):
    r = subprocess.run([sys.executable, INST] + args, capture_output=True, text=True, env=env, timeout=120)
    return r.returncode, r.stdout + r.stderr


def g(cwd, *a):
    return subprocess.run(["git", "-C", cwd] + list(a), capture_output=True, text=True, check=True).stdout.strip()


def lsattr_i(p):
    out = subprocess.run(["lsattr", "-d", p], capture_output=True, text=True).stdout
    return "i" in out.split()[0] if out else None


def part_a(top):
    upstream, mirror = os.path.join(top, "github"), os.path.join(top, "mirror.git")
    g(top, "init", "-q", upstream)
    for k, v in (("user.email", "t@t"), ("user.name", "t")):
        g(upstream, "config", k, v)
    g(upstream, "checkout", "-q", "-b", "migration/aws-supabase")
    os.makedirs(os.path.join(upstream, "comms-infra/langston"))
    v1, v2, live0 = b"# rules v1\n", b"# rules v2\n", b"# hand-edited live\n"
    open(os.path.join(upstream, REPO_PATH), "wb").write(v1)
    g(upstream, "add", "-A")
    g(upstream, "commit", "-q", "-m", "v1")
    s1 = g(upstream, "rev-parse", "HEAD")
    open(os.path.join(upstream, REPO_PATH), "wb").write(v2)
    g(upstream, "commit", "-q", "-am", "v2")
    s2 = g(upstream, "rev-parse", "HEAD")
    g(upstream, "checkout", "-q", "-b", "side")
    open(os.path.join(upstream, REPO_PATH), "wb").write(b"# never reviewed\n")
    g(upstream, "commit", "-q", "-am", "side")
    s_off = g(upstream, "rev-parse", "HEAD")
    g(upstream, "checkout", "-q", "migration/aws-supabase")
    subprocess.run(["git", "clone", "-q", "--bare", "--no-local", upstream, mirror], check=True)
    subprocess.run(["git", "-C", mirror, "fetch", "-q", upstream, "side:side"], check=True)
    home = os.path.join(top, "home")
    os.makedirs(home)
    target = os.path.join(home, "CLAUDE.md")
    open(target, "wb").write(live0)
    os.chown(target, 65534, 65534)
    env = dict(os.environ, LRI_MIRROR=mirror, LRI_UPSTREAM="file://" + upstream, LRI_TARGET=target,
               LRI_BACKUP=os.path.join(top, "bak"), LRI_PUBLIC_RECORD=os.path.join(top, "etc", "rules-installed"))

    rc, out = run(["abc"], env)
    check("A1 a short sha is refused (exit 2)", rc, 2)
    rc, out = run([s_off], env)
    check("A2 a sha not on the UPSTREAM branch is refused (exit 4)", rc, 4)
    subprocess.run(["git", "-C", mirror, "update-ref", "refs/heads/migration/aws-supabase", s_off], check=True)
    rc, out = run([s_off], env)
    check("A3 B-1: moving the MIRROR's branch ref onto the unreviewed commit does not admit it (exit 4)", rc, 4)
    check("   ...and the live file is untouched", open(target, "rb").read(), live0)
    subprocess.run(["git", "-C", mirror, "update-ref", "refs/heads/migration/aws-supabase", s2], check=True)
    rc, out = run([s2, "--dry-run"], env)
    check("A4 a dry run exits 0 and writes nothing", (rc, open(target, "rb").read()), (0, live0))
    rc, out = run([s2], env)
    st = os.lstat(target)
    check("A5 install exits 0 and the live file is the commit's bytes", (rc, open(target, "rb").read()), (0, v2))
    check("   ...root:root 0644, regular, immutable", (st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode),
          stat.S_ISREG(st.st_mode), lsattr_i(target)), (0, 0, 0o644, True, True))
    bpath = os.path.join(top, "bak", hashlib.sha256(live0).hexdigest() + ".md")
    check("   ...the previous version is kept, by its own sha", open(bpath, "rb").read(), live0)
    check("   ...nothing is left beside the target", sorted(os.listdir(home)), ["CLAUDE.md"])
    check("   ...no staging file is left in the backup dir", [f for f in os.listdir(os.path.join(top, "bak"))
          if f.startswith("stage-")], [])
    rec = open(os.path.join(top, "etc", "rules-installed")).read()
    check("   ...the readable record names the commit and the sha256, root:root 0644",
          (s2 in rec, hashlib.sha256(v2).hexdigest() in rec,
           stat.S_IMODE(os.stat(os.path.join(top, "etc", "rules-installed")).st_mode)), (True, True, 0o644))
    rc, out = run([s2], env)
    check("A6 the same commit again, fully protected, is a no-op", (rc, "already installed" in out), (0, True))
    subprocess.run(["chattr", "-i", target], check=True)
    os.chown(target, 65534, 65534)
    rc, out = run([s2], env)
    st = os.lstat(target)
    check("A7 B-2: same content but wrong owner and no flag is NOT a no-op - it is fixed",
          (rc, "already installed" in out, st.st_uid, lsattr_i(target)), (0, False, 0, True))
    subprocess.run(["chattr", "-i", target], check=True)
    os.remove(target)
    decoy = os.path.join(top, "decoy")
    open(decoy, "wb").write(b"must not change\n")
    os.symlink(decoy, target)
    rc, out = run([s1], env)
    check("A8 a link at the target is replaced, NOT followed and NOT filed as the previous version",
          (rc, open(decoy, "rb").read(), os.path.islink(target), open(target, "rb").read(),
           os.path.exists(os.path.join(top, "bak", hashlib.sha256(b"must not change\n").hexdigest() + ".md"))),
          (0, b"must not change\n", False, v1, False))
    subprocess.run(["chattr", "-i", target], check=True)


def as_user(uid, code):
    pid = os.fork()
    if pid == 0:
        try:
            os.setgid(uid)
            os.setuid(uid)
            exec(code, {"os": os})
            os._exit(0)
        except PermissionError:
            os._exit(13)
        except OSError:
            os._exit(14)
    return os.waitpid(pid, 0)[1] >> 8


def part_b():
    nobody = pwd.getpwnam("nobody").pw_uid
    d = tempfile.mkdtemp(prefix="lri-prot-", dir="/var/tmp")
    try:
        os.chown(d, nobody, nobody)
        os.chmod(d, 0o750)
        f, other = os.path.join(d, "CLAUDE.md"), os.path.join(d, "other")

        def fresh(flag):
            for p in (f, other):
                if os.path.lexists(p):
                    subprocess.run(["chattr", "-i", p], capture_output=True)
                    os.remove(p)
            open(f, "w").write("rules\n")
            os.chown(f, 0, 0)
            os.chmod(f, 0o644)
            open(other, "w").write("x\n")
            os.chown(other, nobody, nobody)
            if flag:
                subprocess.run(["chattr", "+i", f], check=True)
        write = "open(%r, 'w').write('edited')" % f
        unlink = "os.remove(%r)" % f
        rename = "os.rename(%r, %r)" % (other, f)
        print("B: expected WITHOUT the flag: write refused (13), unlink allowed (0), rename-over allowed (0)")
        for name, code, want in (("write", write, 13), ("unlink", unlink, 0), ("rename-over", rename, 0)):
            fresh(False)
            check("B1 no flag, the directory's owner tries %s" % name, as_user(nobody, code), want)
        print("B: expected WITH the flag: all three refused (13)")
        for name, code in (("write", write), ("unlink", unlink), ("rename-over", rename)):
            fresh(True)
            check("B2 immutable, the directory's owner tries %s" % name, as_user(nobody, code), 13)
        fresh(True)
        check("B3 lsattr reports the flag", lsattr_i(f), True)
        subprocess.run(["chattr", "-i", f], capture_output=True)
    finally:
        for p in os.listdir(d):
            subprocess.run(["chattr", "-i", os.path.join(d, p)], capture_output=True)
        shutil.rmtree(d, ignore_errors=True)


def main():
    if os.geteuid() != 0:
        print("run as root")
        return 2
    top = tempfile.mkdtemp(prefix="lri-test-", dir="/root")
    os.chmod(top, 0o700)
    try:
        part_a(top)
    finally:
        for dp, _dn, fn in os.walk(top):
            for x in fn:
                subprocess.run(["chattr", "-i", os.path.join(dp, x)], capture_output=True)
        shutil.rmtree(top, ignore_errors=True)
    part_b()
    print("ALL PASS" if not fails else "%d FAIL" % fails)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
