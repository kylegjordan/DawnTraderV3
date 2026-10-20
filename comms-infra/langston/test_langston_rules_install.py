"""Tests for langston-rules-install (B-LANGSTON-CLAUDEMD-RESIDUAL). Run as ROOT on Helsinki from a root-only dir
holding the installer and this file: python3 test_langston_rules_install.py
Builds a throwaway bare mirror and target; never touches the live ones. Each case states its expectation first."""
import hashlib, os, shutil, stat, subprocess, sys, tempfile

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


def main():
    if os.geteuid() != 0:
        print("run as root")
        return 2
    top = tempfile.mkdtemp(prefix="lri-test-", dir="/root")
    os.chmod(top, 0o700)
    try:
        work, mirror = os.path.join(top, "work"), os.path.join(top, "mirror.git")
        g(top, "init", "-q", work)
        g(work, "config", "user.email", "t@t")
        g(work, "config", "user.name", "t")
        g(work, "checkout", "-q", "-b", "migration/aws-supabase")
        os.makedirs(os.path.join(work, "comms-infra/langston"))
        v1 = b"# rules v1\nline\n"
        v2 = b"# rules v2\nline two\n"
        open(os.path.join(work, REPO_PATH), "wb").write(v1)
        g(work, "add", "-A")
        g(work, "commit", "-q", "-m", "v1")
        s1 = g(work, "rev-parse", "HEAD")
        open(os.path.join(work, REPO_PATH), "wb").write(v2)
        g(work, "commit", "-q", "-am", "v2")
        s2 = g(work, "rev-parse", "HEAD")
        g(work, "checkout", "-q", "-b", "side")
        open(os.path.join(work, REPO_PATH), "wb").write(b"# off-branch\n")
        g(work, "commit", "-q", "-am", "side")
        s_off = g(work, "rev-parse", "HEAD")
        g(work, "checkout", "-q", "migration/aws-supabase")
        subprocess.run(["git", "clone", "-q", "--bare", "--no-local", work, mirror], check=True)
        subprocess.run(["git", "-C", mirror, "fetch", "-q", work, "side:side"], check=True)
        home = os.path.join(top, "home")
        os.makedirs(home)
        target = os.path.join(home, "CLAUDE.md")
        open(target, "wb").write(b"# hand-edited live\n")
        env = dict(os.environ, LRI_MIRROR=mirror, LRI_TARGET=target, LRI_BACKUP=os.path.join(top, "bak"))

        rc, out = run(["abc"], env)
        check("a short sha is refused (exit 2)", rc, 2)
        rc, out = run([s_off], env)
        check("a sha that is not on migration/aws-supabase is refused (exit 4)", rc, 4)
        check("  ...and the live file is untouched", open(target, "rb").read(), b"# hand-edited live\n")
        rc, out = run([s2, "--dry-run"], env)
        check("a dry run exits 0 and writes nothing", (rc, open(target, "rb").read()), (0, b"# hand-edited live\n"))
        rc, out = run([s2], env)
        st = os.lstat(target)
        check("install exits 0 and the live file is the commit's bytes", (rc, open(target, "rb").read()), (0, v2))
        check("  ...owned root:root, mode 0644, a regular file", (st.st_uid, st.st_gid, stat.S_IMODE(st.st_mode),
              stat.S_ISREG(st.st_mode)), (0, 0, 0o644, True))
        old_sha = hashlib.sha256(b"# hand-edited live\n").hexdigest()
        bpath = os.path.join(top, "bak", old_sha + ".md")
        check("  ...the previous version is kept, by its own sha", open(bpath, "rb").read(), b"# hand-edited live\n")
        check("  ...the backup dir is root-only 0700", stat.S_IMODE(os.stat(os.path.join(top, "bak")).st_mode), 0o700)
        check("  ...no temp file is left beside the target", sorted(os.listdir(home)), ["CLAUDE.md"])
        rc, out = run([s2], env)
        check("installing the same commit again is a no-op (exit 0, 'already installed')",
              (rc, "already installed" in out), (0, True))
        decoy = os.path.join(top, "decoy")
        open(decoy, "wb").write(b"must not change\n")
        os.remove(target)
        os.symlink(decoy, target)
        rc, out = run([s1], env)
        check("a symlink planted at the target is REPLACED, not followed (decoy unchanged)",
              (rc, open(decoy, "rb").read(), os.path.islink(target), open(target, "rb").read()),
              (0, b"must not change\n", False, v1))
    finally:
        shutil.rmtree(top, ignore_errors=True)
    print("ALL PASS" if not fails else "%d FAIL" % fails)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
