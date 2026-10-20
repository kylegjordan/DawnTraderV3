"""Tests for the size watch's rules_check (B-LANGSTON-CLAUDEMD-RESIDUAL). Run as ROOT on Helsinki from a root-only
dir holding this file and a copy of langston-size-watch: python3 test_rules_check.py
Builds a throwaway "GitHub", mirror, target and install record; never touches the live ones. Expectation first."""
import hashlib, importlib.machinery, importlib.util, json, os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ld = importlib.machinery.SourceFileLoader("sw", os.path.join(HERE, "langston-size-watch"))
spec = importlib.util.spec_from_loader("sw", ld)
sw = importlib.util.module_from_spec(spec)
sys.dont_write_bytecode = True
ld.exec_module(sw)
PATH = "comms-infra/langston/LANGSTON_CLAUDE.md"
fails = 0


def check(name, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else "  expected %r got %r" % (want, got)))


def g(cwd, *a):
    return subprocess.run(["git", "-C", cwd] + list(a), capture_output=True, text=True, check=True).stdout.strip()


def main():
    if os.geteuid() != 0:
        print("run as root")
        return 2
    top = tempfile.mkdtemp(prefix="rules-check-", dir="/root")
    target = os.path.join(top, "CLAUDE.md")
    try:
        up, mirror = os.path.join(top, "github"), os.path.join(top, "mirror.git")
        g(top, "init", "-q", up)
        g(up, "config", "user.email", "t@t")
        g(up, "config", "user.name", "t")
        g(up, "checkout", "-q", "-b", "migration/aws-supabase")
        os.makedirs(os.path.join(up, "comms-infra/langston"))
        v1 = b"# rules v1\n"
        open(os.path.join(up, PATH), "wb").write(v1)
        g(up, "add", "-A")
        g(up, "commit", "-q", "-m", "v1")
        c1 = g(up, "rev-parse", "HEAD")
        b1 = g(up, "rev-parse", "HEAD:" + PATH)
        subprocess.run(["git", "clone", "-q", "--bare", "--no-local", up, mirror], check=True)
        record = os.path.join(top, "INSTALLED")
        json.dump({"commit": c1, "blob": b1, "sha256": hashlib.sha256(v1).hexdigest(), "installed_at": "t"},
                  open(record, "w"))

        def install(data=v1, owner=(0, 0), mode=0o644, flag=True):
            if os.path.lexists(target):
                subprocess.run(["chattr", "-i", target], capture_output=True)
                os.remove(target)
            open(target, "wb").write(data)
            os.chown(target, *owner)
            os.chmod(target, mode)
            if flag:
                subprocess.run(["chattr", "+i", target], check=True)

        def rc():
            return sw.rules_check(target=target, record=record, mirror=mirror, upstream="file://" + up)

        install()
        r = rc()
        check("C1 control: a clean install has no tamper, no pending, no unknown",
              (r["tamper"], r["pending"], r["unknown"]), ([], None, []))
        install(data=b"# edited by hand\n")
        check("C2 changed content is TAMPER", any("content differs" in t for t in rc()["tamper"]), True)
        install(owner=(65534, 65534))
        check("C3 a langston-owned file is TAMPER", any("not root:root 0644" in t for t in rc()["tamper"]), True)
        install(flag=False)
        check("C4 a missing immutable flag is TAMPER", any("immutable flag is NOT set" in t for t in rc()["tamper"]), True)
        subprocess.run(["chattr", "-i", target], capture_output=True)
        os.remove(target)
        os.symlink(record, target)
        check("C5 a link at the target is TAMPER, not followed", any("following a link" in t for t in rc()["tamper"]),
              True)
        os.remove(target)
        install()
        open(os.path.join(up, PATH), "wb").write(b"# rules v2, reviewed, not installed\n")
        g(up, "commit", "-q", "-am", "v2")
        subprocess.run(["git", "-C", mirror, "fetch", "-q", up, "migration/aws-supabase:migration/aws-supabase"],
                       check=True)
        r = rc()
        check("C6 a newer reviewed version is PENDING, never TAMPER", (r["tamper"], r["pending"] is not None), ([], True))
        os.remove(record)
        r = rc()
        check("C7 no install record is UNKNOWN only - no tamper page before the first install",
              (r["tamper"], len(r["unknown"])), ([], 1))
    finally:
        subprocess.run(["chattr", "-i", target], capture_output=True)
        shutil.rmtree(top, ignore_errors=True)
    print("ALL PASS" if not fails else "%d FAIL" % fails)
    return 1 if fails else 0


if __name__ == "__main__":
    sys.exit(main())
