#!/usr/bin/env python3
"""Mutation controls for setter_tests.py (run as root). Each mutation breaks ONE property of the
committed setter; the suite must then fail CLEANLY (a summary line with >0 failed — a crash is a
problem, not a kill). The unmutated suite must pass first. Judge by exit code."""
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "dt-api-set-crew-password")
BASE = open(SRC, encoding="utf-8").read()
SUITE = os.path.join(HERE, "setter_tests.py")

MUTATIONS = [
    ("the budget check skipped", "    if recent:\n        last = max(", "    if False:\n        last = max("),
    ("(6) failure: env not restored", "                restore_db(m)\n                restore_env(m)\n                purge_cache()\n                cleanup_run_files()",
     "                restore_db(m)\n                purge_cache()\n                cleanup_run_files()"),
    ("no 'committing' marker before the commit", '        m["phase"] = phase = "committing"\n        write_marker(m)\n',
     '        phase = "committing"\n'),
    ("(5) purge skipped", '        purge_cache(clear_page=True)\n        say("(5) purged', '        say("(5) purged'),
    ("(6) result ignored", '        if rc != 0 or "HTTP 200 GET /api/settings" not in err:', "        if False:"),
    ("r2: signals raise asynchronously", "    INTERRUPTED.append(signum)", '    raise Interrupted("signal %d" % signum)'),
    ("r2: no checkpoint before the commit's aftermath", '        checkpoint("(3)")', "        pass"),
    ("r2: an early phase trusted without reading the row", '        n, role_now, hash_now = read_state()\n        if n == 1 and role_now == m["old_role"] and hash_now == m["old_hash"]:\n            cleanup_run_files()',
     '        n, role_now, hash_now = m and (1, m["old_role"], m["old_hash"])\n        if n == 1 and role_now == m["old_role"] and hash_now == m["old_hash"]:\n            cleanup_run_files()'),
    ("r2: the restored env is not checked", "            if st != 200:\n                durable_page(\"setter-restored-env-refused\"", "            if False:\n                durable_page(\"setter-restored-env-refused\""),
    ("(3) role check dropped", "        if role_resp != NEW_ROLE or claims.get(\"role\") != NEW_ROLE:", "        if False:"),
    ("dt-api lock released before (0)", "        DLOCK = D.Lock()\n        DLOCK.__enter__()\n",
     "        DLOCK = D.Lock()\n"),
    ("PGPASSFILE kept", "        unlink_quiet(pgfile)            # run-only", "        pass            # run-only"),
    ("reconcile ignores an unchanged row", "\n    if n == 1 and role_now == m[\"old_role\"] and hash_now == m[\"old_hash\"]:",
     "\n    if False:"),
    ("reconcile treats a live 500 as a failure", 'live = "ok" if st == 200 else ("fail" if st in (401, 404) else "unknown")',
     'live = "ok" if st == 200 else "fail"'),
    ("reconcile row-unchanged skips the env", "        try:\n            restore_env(m)\n        except Exception as e:\n            refuse(4, \"RESTORE FAILED during (0)",
     "        try:\n            pass\n        except Exception as e:\n            refuse(4, \"RESTORE FAILED during (0)"),
    ("purge keeps a standing page", "    if clear_page:\n        unlink_quiet(D.PAGE_FILE)", "    if False:\n        unlink_quiet(D.PAGE_FILE)"),
    ("no orphan check", "        if orphan_count():", "        if False:"),
    ("an unreadable marker is ignored", "        if not isinstance(m, dict) or any(k not in m for k in MARKER_KEYS):", "        if False:"),
    ("reconcile page not durable", '    durable_page("setter-restored",', '    (lambda *a: None)("setter-restored",'),
    ("restore failure leaves no marker", "        refuse(4, \"RESTORE FAILED: %s", "        unlink_quiet(MARKER)\n        refuse(4, \"RESTORE FAILED: %s"),
    ("PGPASSFILE mode not checked", "or st.st_mode & 0o077:", "or False:"),
]

b = subprocess.run([sys.executable, SUITE], env={"PATH": "/usr/bin:/bin", "SETTER_SRC": SRC},
                   capture_output=True, text=True, timeout=1800)
last = (b.stdout.strip().splitlines() or ["?"])[-1]
if b.returncode != 0 or not re.match(r"^setter suite: \d+ passed, 0 failed$", last):
    print("BASELINE DOES NOT PASS — mutation results would be meaningless:\n" + b.stdout[-800:] + b.stderr[-800:])
    sys.exit(2)
print("baseline: " + last)

bad = 0
for name, old, new in MUTATIONS:
    n = BASE.count(old)
    if n != 1:
        print("MUTATION NOT APPLIED (%d matches): %s" % (n, name))
        bad += 1
        continue
    d = tempfile.mkdtemp(prefix="setter-mut-")
    p = os.path.join(d, "setter")
    open(p, "w", encoding="utf-8").write(BASE.replace(old, new))
    r = subprocess.run([sys.executable, SUITE], env={"PATH": "/usr/bin:/bin", "SETTER_SRC": p},
                       capture_output=True, text=True, timeout=1800)
    last = (r.stdout.strip().splitlines() or ["?"])[-1]
    if r.returncode == 0:
        print("SURVIVED (the suite did not notice): %s" % name)
        bad += 1
    elif not re.match(r"^setter suite: \d+ passed, [1-9]\d* failed$", last):
        print("CRASHED, not a clean kill: %s :: %s" % (name, (r.stderr.strip().splitlines() or ["?"])[-1]))
        bad += 1
    else:
        print("killed: %-40s %s" % (name, last))
print("mutations: %d applied and killed, %d problems" % (len(MUTATIONS) - bad, bad))
sys.exit(1 if bad else 0)
