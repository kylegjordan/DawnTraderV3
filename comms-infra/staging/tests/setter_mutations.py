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
    # RETIRED at r2 as an EQUIVALENT mutant: since reconcile reads the row before trusting an early
    # phase, dropping the 'committing' marker write changes no observable end state. The write stays as
    # defence in depth; "r2: an early phase trusted without reading the row" is the live control for it.
    ("(5) purge skipped", '        purge_cache(clear_page=True)\n        say("(5) purged', '        say("(5) purged'),
    ("(6) result ignored", '        if rc != 0 or "HTTP 200 GET /api/settings" not in err:', "        if False:"),
    ("r2: signals raise asynchronously", "    INTERRUPTED.append(signum)", '    raise Interrupted("signal %d" % signum)'),
    ("r2: no checkpoint before the commit's aftermath", '        checkpoint("(3)")', "        pass"),
    ("r2: an early phase trusted without reading the row", '        n, role_now, hash_now = read_state()\n        if n == 1 and role_now == m["old_role"] and hash_now == m["old_hash"]:\n            cleanup_run_files()',
     '        n, role_now, hash_now = m and (1, m["old_role"], m["old_hash"])\n        if n == 1 and role_now == m["old_role"] and hash_now == m["old_hash"]:\n            cleanup_run_files()'),
    ("r2: the restored env is not checked", "            if v == \"fail\":\n                ok = durable_page(\"setter-restored-env-refused\"", "            if False:\n                ok = durable_page(\"setter-restored-env-refused\""),
    ("(3) role check dropped", "        if role_resp != NEW_ROLE or claims.get(\"role\") != NEW_ROLE:", "        if False:"),
    ("dt-api lock released before (0)", "        try:\n            DLOCK.__enter__()\n        except SystemExit:",
     "        try:\n            pass\n        except SystemExit:"),
    ("PGPASSFILE kept", "        unlink_quiet(pgfile)            # run-only", "        pass            # run-only"),
    ("reconcile ignores an unchanged row", "\n    if n == 1 and role_now == m[\"old_role\"] and hash_now == m[\"old_hash\"]:",
     "\n    if False:"),
    ("reconcile treats a live 500 as a failure", '    if st in (401, 404):\n        return "fail"\n    return "unknown"', '    return "fail"'),
    ("r3 S1: a foreign env accepted in reconcile", "    if foreign_user(live_env) or foreign_user(temp_env):", "    if False:"),
    ("r3 S1: a foreign env accepted anywhere", '    return env is not None and env.get("DT_API_USER") != CREW_USER', "    return False"),
    ("r3 S2: a changed early-phase row is reconciled", '        refuse(4, "(0) the marker says this setter never wrote the row',
     '        say("(0) the marker says this setter never wrote the row'),
    ("r3 S3: a no-answer check login pages", '            if v == "unknown":\n                # r3 S3', '            if False:\n                # r3 S3'),
    ("r3 S4: no page after a (6) restore", '                durable_page("setter-restored", "the setter\'s (6) check',
     '                (lambda *a: None)("setter-restored", "the setter\'s (6) check'),
    ("r3 S4: the cleared page is not put back", "                if cleared is not None:", "                if False:"),
    ("r3 S5: a restored env leaves the page", "            # or dt-api stays blocked by a page about a login that now works\n            purge_cache(clear_page=True)",
     "            # or dt-api stays blocked by a page about a login that now works\n            pass"),
    ("r3: an interrupt exits 1", "        if isinstance(e, Interrupted):\n            refuse(3,", "        if False:\n            refuse(3,"),
    ("r3: an orphan exits 3", '            refuse(2, "REFUSED: a psql session from an earlier', '            refuse(3, "REFUSED: a psql session from an earlier'),
    ("r3: no env-copy precheck", '    if m.get("had_env") and not os.path.isfile(OLD_ENV):', "    if False:"),
    ("r3: a durable page overwrites the first cause", "body = json.dumps(D.page_merge(None if unreadable else standing, kind, detail, True)).encode()",
     'body = json.dumps({"ts": "x", "kind": kind, "detail": detail, "sticky": True}).encode()'),
    ("r3: the /home check on the raw path", '    if (os.path.realpath(p) + "/").startswith("/home/"):', '    if p.startswith("/home/"):'),
    ("r3: a malformed 200 is ok", '        return "ok" if ok else "unknown"', '        return "ok"'),
    ("r3: a setup error exits 1", "        except (OSError, KeyError) as e:\n            # r3: an uncaught", "        except ZeroDivisionError as e:\n            # r3: an uncaught"),
    ("reconcile row-unchanged skips the env", "        try:\n            restore_env(m)\n        except Exception as e:\n            refuse(4, \"RESTORE FAILED during (0)",
     "        try:\n            pass\n        except Exception as e:\n            refuse(4, \"RESTORE FAILED during (0)"),
    ("purge keeps a standing page", "    if clear_page:\n        unlink_quiet(D.PAGE_FILE)", "    if False:\n        unlink_quiet(D.PAGE_FILE)"),
    ("no orphan check", "        if orphan_count():", "        if False:"),
    ("an unreadable marker is ignored", "        if not isinstance(m, dict) or any(k not in m for k in MARKER_KEYS):", "        if False:"),
    ("reconcile page not durable", '    ok = durable_page("setter-restored", "an interrupted', '    ok = (lambda *a: True)("setter-restored", "an interrupted'),
    ("restore failure leaves no marker", "        refuse(4, \"RESTORE FAILED: %s", "        unlink_quiet(MARKER)\n        refuse(4, \"RESTORE FAILED: %s"),
    ("PGPASSFILE mode not checked", "or st.st_mode & 0o077:", "or False:"),
    ("Gate 1-2: the page text always claims a page", '    return "PAGE raised" if ok else', '    return "PAGE raised" if True else'),
    ("Gate 1-1 carry: the page write does not loop", "                view = view[n:]", "                view = view[len(view):]"),
    ("Gate 1-1 carry: an unreadable page is written over",
     '    target = ("%s.unreadable.%d" % (D.PAGE_FILE, os.getpid())) if unreadable else D.PAGE_FILE', "    target = D.PAGE_FILE"),
    ("Gate 1-2: a lock open error escapes as a traceback", "        sfd = os.open(SETTER_LOCK, os.O_RDWR | os.O_CREAT, 0o600)\n    except OSError as e:",
     "        sfd = os.open(SETTER_LOCK, os.O_RDWR | os.O_CREAT, 0o600)\n    except ZeroDivisionError as e:"),
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
