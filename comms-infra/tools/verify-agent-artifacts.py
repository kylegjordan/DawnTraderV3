"""Step 6 for THIS batch: do the tools running on Helsinki match the reviewed ref?

⛔⛔ THE TRADING APP IS NOT THIS BATCH'S DEPLOY TARGET. Nothing here runs on staging: every
    file is either governance prose or a script that runs on the Helsinki agent box. So
    `dt-deploy` is not the instrument — `install` is, and it has already run. What Step 6
    still owes is the same thing dt-deploy would owe: PROVE THE RUNNING ARTIFACT IS THE
    REVIEWED ONE, at the objects, rather than asserting it because I remember copying it.

★ dt-deploy's own strongest property is that it "asserts the running code's own identity
  and that the engine resumed — never a bare 'the server responded'." This is that
  assertion, done by hand for the box this batch actually ships to.

⚠️ BOTH SIDES COME FROM ONE SURFACE. The repo side is read with `git show <ref>:<path>`,
   never the worktree — this repo stores LF and checks out CRLF, so a worktree comparison
   would report every file as differing and I would "fix" a difference that is not there.
"""
import hashlib
import subprocess
import sys

# ⛔⛔ PIN THE REF, DO NOT CERTIFY AGAINST A MOVING ONE. `origin/migration/aws-supabase`
#    changes under this script as three other sessions push, so a PASS recorded on Monday
#    is a statement about a tree that no longer exists by Tuesday. Pass a sha to certify a
#    specific state; the branch name is the convenience default and is labelled as such in
#    the output.
REF = sys.argv[1] if len(sys.argv) > 1 else "origin/migration/aws-supabase"
REPO = r"C:\DawnTraderV3-infra"
HOST = "root@204.168.141.77"

PAIRS = [
    ("comms-infra/langston-memory/bin/langston-load-canary", "/usr/local/bin/langston-load-canary"),
    ("comms-infra/codex/coltrane-load-canary", "/usr/local/bin/coltrane-load-canary"),
    ("comms-infra/codex/coltrane-size-watch", "/usr/local/bin/coltrane-size-watch"),
    ("comms-infra/codex/coltrane-memory", "/usr/local/bin/coltrane-memory"),
    ("comms-infra/codex/coltrane-review", "/usr/local/bin/coltrane-review"),
    ("comms-infra/codex/coltrane-repo-refresh", "/usr/local/bin/coltrane-repo-refresh"),
    ("comms-infra/agent-staging-session", "/usr/local/bin/agent-staging-session"),
    ("comms-infra/codex/coltrane-bot.py", "/usr/local/bin/coltrane-bot.py"),
    ("comms-infra/codex/AGENTS.md", "/home/coltrane/.codex/AGENTS.md"),
    ("comms-infra/AGENT_AUTHORING_GUIDE.md", "/home/langston/AGENT_AUTHORING_GUIDE.md"),
    ("comms-infra/AGENT_AUTHORING_GUIDE.md", "/home/coltrane/AGENT_AUTHORING_GUIDE.md"),
    # added 2026-09-11 (B-LANGSTON-CONTEXT increment 2) - files this batch changed that the list did not cover.
    # NOT covered, stated rather than implied: langston-size-watch, langston-selfmemory-backup,
    # langston-log-loaded, coltrane-selfmemory-backup, agent-work-sync, agent-unit-failure-alert.
    ("comms-infra/langston-memory/bin/langston_memory.py", "/opt/langston-memory/bin/langston_memory.py"),
    ("comms-infra/langston-memory/bin/langston-promote-patterns", "/usr/local/bin/langston-promote-patterns"),
    ("comms-infra/langston-memory/bin/langston-privacy-check", "/usr/local/bin/langston-privacy-check"),
    ("comms-infra/codex/coltrane-bridge.py", "/usr/local/bin/coltrane-bridge.py"),
]


def repo_sha(path):
    p = subprocess.run(["git", "show", "%s:%s" % (REF, path)], cwd=REPO,
                       capture_output=True)
    if p.returncode != 0:
        return None, p.stderr.decode("utf-8", "replace").strip()[:80]
    return hashlib.sha256(p.stdout).hexdigest(), None


def live_modes(paths):
    """⛔ CONTENT PARITY IS NOT DEPLOYMENT PARITY. A byte-identical file installed WITHOUT
    the execute bit hashes the same and does not run — so a content-only comparator returns
    MATCH on a command nobody can execute. Found by a fresh reviewer on this very script.
    ⚠️ MEASURED at the same time: the repo copies were committed 100644 while the live ones
    are 750/755, because `install -m` set the mode explicitly rather than copying it. So
    nothing was broken — but a `cp`-based deploy would have been, silently, and this
    comparator would have said MATCH."""
    cmd = "stat -c '%a %n' " + " ".join("'%s'" % x for x in paths)
    p = subprocess.run(["ssh", HOST, cmd], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    out = {}
    for line in (p.stdout or "").split(chr(10)):
        bits = line.split(None, 1)
        if len(bits) == 2:
            out[bits[1]] = bits[0]
    return out


def live_shas(paths):
    cmd = "sha256sum " + " ".join("'%s'" % x for x in paths)
    p = subprocess.run(["ssh", HOST, cmd], capture_output=True, text=True,
                       encoding="utf-8", errors="replace")
    out = {}
    for line in (p.stdout or "").split("\n"):
        bits = line.split()
        if len(bits) == 2:
            out[bits[1]] = bits[0]
    return out, (p.stderr or "").strip()


live, err = live_shas([d for _s, d in PAIRS])
modes = live_modes([d for _s, d in PAIRS])
if err:
    print("ssh stderr:", err[:300])

match = differ = missing = 0
for src, dest in PAIRS:
    rs, rerr = repo_sha(src)
    ls = live.get(dest)
    if rerr:
        print("  REPO-READ-FAILED  %-46s %s" % (src, rerr))
        missing += 1
    elif ls is None:
        print("  NOT-ON-BOX        %-46s -> %s" % (src, dest))
        missing += 1
    elif rs == ls:
        m = modes.get(dest, "?")
        runs = m != "?" and int(m[0]) % 2 == 1        # owner-execute bit
        shebang = src.split("/")[-1] not in ("AGENTS.md", "AGENT_AUTHORING_GUIDE.md")
        if shebang and not runs:
            print("  ⛔ NOT EXECUTABLE %-46s -> %s (mode %s) — content matches and it "
                  "CANNOT RUN" % (src, dest, m))
            differ += 1
        else:
            print("  MATCH             %-46s (mode %s)" % (src, m))
            match += 1
    else:
        print("  ⛔ DIFFERS        %-46s -> %s" % (src, dest))
        print("        repo %s" % rs[:16])
        print("        live %s" % ls[:16])
        differ += 1

print()
print("ref: %s" % REF)
print("match %d | DIFFER %d | missing %d  (of %d pairs)" % (match, differ, missing, len(PAIRS)))
print()
print("POSITIVE CONTROL — the comparator must be able to say DIFFERS. Same live file,")
print("hashed against a DIFFERENT repo path:")
a, _ = repo_sha("comms-infra/codex/coltrane-memory")
b = live.get("/usr/local/bin/coltrane-review")
print("  coltrane-memory(repo) vs coltrane-review(live): %s"
      % ("DIFFERS — comparator works" if a and b and a != b else "SAME?? — comparator is broken"))
sys.exit(1 if (differ or missing) else 0)
