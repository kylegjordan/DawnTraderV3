#!/usr/bin/env python3
"""dt_archive_trigger — B-TRANSCRIPT-ARCHIVE P7: the TRIGGERS that call the one archive run (dt_archive_run), and how a
run that FAILED or NEVER HAPPENED reaches a person.

    python -I dt_archive_trigger.py nightly       # the Windows scheduled task
    python -I dt_archive_trigger.py precompact    # the PreCompact hook: starts a run in the background, returns at once

Both are installed from the INSTALLED copy at ~/.claude/transcript-archive-bin (copied from a reviewed sha, each file's
sha256 checked against its blob) - the task AND the hook - so no working clone's unreviewed edit runs unattended
(Langston P7 r1 CONDITION-2: the hook spawns its own __file__, so it must be the installed copy too).

THE RUN LOCK. One run at a time, across every trigger: `<root>/.run.lock`, created exclusively, holding pid + UTC stamp.
Two runs at once would collide on the writer's per-file locks and one would exit 5 for nothing. A PRECOMPACT trigger that
finds it held SKIPS (logged, no alert - the run in progress covers it). The NIGHTLY trigger waits up to NIGHTLY_WAIT_S;
still held after that is a FAILURE (exit 9, alerted, naming the lock). Never broken automatically - the writer's rule: a
human reads the pid and stamp, confirms no run is alive, then deletes it. EXPECTED AND LOUD BY DESIGN: if Windows kills
the nightly at its 1 h limit, the lock is orphaned and every later nightly exits 9 and alerts until a human removes it.

RUNS.log. Every attempt appends `<UTC>\t<trigger>\t<exit>\t<last line>` to `<root>/RUNS.log`, including skips, and a
second line when the alert leg fails. The RUN lock does NOT fence this file (a PreCompact skip writes it without the run
lock); the log has its OWN lock - a byte-range lock held only while counting and appending - and `log_line` returns the
line number it wrote, which is the number the alert's evidence cites (Langston P7 r1 CONDITION-1).

PRECOMPACT FLOOR. A PreCompact run is skipped (logged) when the last successful run of either trigger ended under
PRECOMPACT_FLOOR_S ago: four sessions compacting in an hour must not mean four full passes.

HOW A FAILURE REACHES A PERSON - nightly only, in the staging system-alerts queue (read every turn by every session's
alert check and by Langston's triage; re-surfaced until RESOLVED). TWO kinds of row, never one key for both
(Langston P7 r1 BLOCKER-1: one key forced resolve-then-add, so a failed `add` left NOTHING armed and the night exited 0):
  * the NEVER-RAN CHECK - a scheduled warning at now + DEADMAN_H, "has not succeeded since <stamp>", on its OWN key per
    arm (`transcript-archive-deadman-<stamp>`), so a new one is never swallowed by addAlert's dedupe behind the last one.
    The keys this laptop has armed and not yet seen resolved are kept in `<root>/.alert-state.json`.
  * the FAILURE ALERT - an active warning now, key `transcript-archive-nightly-failed`, carrying the run's own line. A
    failure never touches the never-ran check: a failed night followed by a dark laptop still fires at +26 h.
  success -> ARM FIRST, RESOLVE LAST: add the new check; only once it is in, resolve the older checks' keys and then the
             failure key. A failure part-way leaves the old check standing (add failed) or two checks (a resolve failed -
             retried at the next success): a duplicate alarm, NEVER none.
  failure -> add the failure alert. Nothing is resolved.
  Any alert-leg failure is written to RUNS.log AND makes the nightly exit non-zero (10 when the run itself succeeded), so
  the task's own result shows it too. If `.alert-state.json` is lost, the older checks are never resolved and fire -
  loud, and the human resolves them.
  Ack discipline: an ACKED but unresolved failure row suppresses the next failure mint on its key (addAlert's dedupe) and
  drops out of the per-turn read; it stays the owned record until a success resolves it. It cannot reach the never-ran
  check, which has its own key.
The PreCompact trigger raises nothing: it is a freshness top-up, and the nightly run is the one the alarm watches.

Resolve evidence: `laptop:~/.claude/transcript-archive/RUNS.log:<n> (nightly <stamp>, exit <code>)` - the run's own line,
host named so it is never read as a repo path (Langston P7 r1 (b)).
"""
import json
import os
import shlex
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import dt_archive_run as ar  # noqa: E402

DEADMAN_PREFIX = "transcript-archive-deadman-"
FAIL_KEY = "transcript-archive-nightly-failed"
ACTOR = "cc-infra"
DEADMAN_H = 26
NIGHTLY_WAIT_S = 15 * 60
PRECOMPACT_FLOOR_S = 30 * 60
STAGING = "root@188.245.193.8"
HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, ".claude", "transcript-archive")


def utc(t=None):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() if t is None else t))


def _lock_fh(fh, on):
    if os.name == "nt":
        import msvcrt
        fh.seek(0)
        msvcrt.locking(fh.fileno(), msvcrt.LK_LOCK if on else msvcrt.LK_UNLCK, 1)
    else:
        import fcntl
        fcntl.flock(fh.fileno(), fcntl.LOCK_EX if on else fcntl.LOCK_UN)


def log_line(root, trigger, code, line):
    """Append one line under the log's own lock; return the 1-based number of the line written."""
    os.makedirs(root, exist_ok=True)
    with open(os.path.join(root, "RUNS.log"), "a+b") as fh:
        _lock_fh(fh, True)
        try:
            fh.seek(0)
            n = sum(1 for _ in fh) + 1
            fh.seek(0, os.SEEK_END)
            fh.write(("%s\t%s\t%s\t%s\n" % (utc(), trigger, code, " ".join(str(line).split()))).encode("utf-8"))
            fh.flush()
        finally:
            _lock_fh(fh, False)
    return n


def last_success(root):
    """UTC epoch of the last exit-0 line of either trigger in RUNS.log, or None."""
    try:
        lines = open(os.path.join(root, "RUNS.log"), encoding="utf-8").read().splitlines()
    except FileNotFoundError:
        return None
    for l in reversed(lines):
        f = l.split("\t")
        if len(f) >= 3 and f[1] in ("nightly", "precompact") and f[2] == "0":
            try:
                return float(__import__("calendar").timegm(time.strptime(f[0], "%Y-%m-%dT%H:%M:%SZ")))
            except ValueError:
                return None
    return None


def take_lock(root):
    """True if this process now holds the run lock; False if another holds it. Raises on any other failure."""
    os.makedirs(root, exist_ok=True)
    try:
        fd = os.open(os.path.join(root, ".run.lock"), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        return False
    with os.fdopen(fd, "w") as fh:
        fh.write("%d %s\n" % (os.getpid(), utc()))
    return True


def drop_lock(root):
    try:
        os.remove(os.path.join(root, ".run.lock"))
    except FileNotFoundError:
        pass


def read_state(root):
    """The never-ran check keys armed and not yet seen resolved. A missing file is an empty list; a corrupt one RAISES
    (never read as empty: that would strand the armed checks silently - they would fire, but nothing would say why)."""
    try:
        d = json.load(open(os.path.join(root, ".alert-state.json"), encoding="utf-8"))
    except FileNotFoundError:
        return []
    keys = d.get("deadman_keys") if isinstance(d, dict) else None
    if not isinstance(keys, list) or not all(isinstance(k, str) and k.startswith(DEADMAN_PREFIX) for k in keys):
        raise ValueError("unreadable .alert-state.json")
    return keys


def write_state(root, keys):
    p = os.path.join(root, ".alert-state.json")
    tmp = p + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        json.dump({"deadman_keys": keys}, fh)
    os.replace(tmp, p)


def remote_alerts(args, timeout=120):
    """One system-alerts CLI call on staging, as the deploy user. Raises with the reason on any failure."""
    cmd = "cd /home/deploy/dawntrader && npm run -s system-alerts -- " + " ".join(shlex.quote(a) for a in args)
    p = subprocess.run(["ssh", "-o", "ConnectTimeout=15", "-o", "BatchMode=yes", STAGING,
                        "su - deploy -c " + shlex.quote(cmd)], capture_output=True, timeout=timeout)
    if p.returncode != 0:
        raise RuntimeError("system-alerts %s exit %d: %s" % (args[0], p.returncode,
                                                             (p.stderr or p.stdout).decode("utf-8", "replace")[-200:]))
    return p.stdout.decode("utf-8", "replace")


def evidence(n, stamp, code):
    return "laptop:~/.claude/transcript-archive/RUNS.log:%d (nightly %s, exit %s)" % (n, stamp, code)


def alert_leg(code, line, now, n, root, remote=remote_alerts):
    """The nightly result -> the alerts queue. `n` is this attempt's RUNS.log line. Returns None, or why it failed."""
    stamp = utc(now)
    meta = {"owner": "CC-INFRA", "source": "dt_archive_trigger"}
    if code != 0:
        try:
            remote(["add", "--triggers-at", stamp, "--category", "health_check", "--severity", "warning",
                    "--dedupe-key", FAIL_KEY, "--title", "Transcript archive: the nightly run FAILED (exit %s)" % code,
                    "--body", ("The laptop's nightly transcript archive failed at %s: %s. Nothing new was archived; the "
                               "never-ran check armed by the last success still stands. Owner: Infra Claude."
                               % (stamp, line))[:1500],
                    "--metadata", json.dumps(dict(meta, exit=code))])
        except Exception as e:  # noqa: BLE001
            return "failure alert not raised: %s: %s" % (type(e).__name__, str(e)[:300])
        return None
    try:
        armed = read_state(root)
    except (OSError, ValueError) as e:
        armed, state_problem = None, "%s: %s" % (type(e).__name__, e)
    else:
        state_problem = None
    new_key = DEADMAN_PREFIX + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(now))
    try:                                   # ARM FIRST
        remote(["add", "--triggers-at", utc(now + DEADMAN_H * 3600), "--category", "health_check",
                "--severity", "warning", "--dedupe-key", new_key,
                "--title", "Transcript archive: the nightly run has not succeeded since %s" % stamp,
                "--body", ("The laptop's nightly transcript archive last succeeded at %s and no later success has "
                           "resolved this check. Either the run did not happen (laptop off, task disabled or broken) or "
                           "it could not reach staging to resolve this - read RUNS.log in ~/.claude/transcript-archive "
                           "on the laptop. Owner: Infra Claude." % stamp),
                "--metadata", json.dumps(dict(meta, last_ok=stamp))])
    except Exception as e:  # noqa: BLE001 - the older check still stands, which is the correct alarm
        return "never-ran check not armed (the previous one still stands): %s: %s" % (type(e).__name__, str(e)[:300])
    problems = []
    if armed is None:
        kept = os.path.join(root, ".alert-state.json.unreadable-" + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(now)))
        try:
            os.replace(os.path.join(root, ".alert-state.json"), kept)   # kept for the human, never overwritten
        except OSError:
            kept = "(could not be moved aside)"
        problems.append("older never-ran checks NOT resolved - %s (kept at %s); they will fire and must be resolved by "
                        "hand" % (state_problem, kept))
        write_state(root, [new_key])
        return "; ".join(problems)
    pending = armed + [new_key]
    write_state(root, pending)
    for k in armed:                        # RESOLVE LAST
        try:
            remote(["resolve-key", k, "--by", ACTOR, "--evidence", evidence(n, stamp, code)])
            pending.remove(k)
            write_state(root, pending)
        except Exception as e:  # noqa: BLE001 - stays in the state, retried next success; two checks meanwhile
            problems.append("older never-ran check %s not resolved: %s: %s" % (k, type(e).__name__, str(e)[:200]))
    try:
        remote(["resolve-key", FAIL_KEY, "--by", ACTOR, "--evidence", evidence(n, stamp, code)])
    except Exception as e:  # noqa: BLE001
        problems.append("failure alert not resolved: %s: %s" % (type(e).__name__, str(e)[:200]))
    return "; ".join(problems) or None


def run_once(projects, root, shared):
    try:
        return ar.run(projects, root, shared)
    except Exception as e:  # noqa: BLE001 - every attempt ends on a result, never a traceback
        return 8, "ARCHIVE RUN FAILED — unexpected %s: %s" % (type(e).__name__, str(e)[:300])


def nightly(projects, root, shared, remote=remote_alerts, runner=run_once, wait_s=NIGHTLY_WAIT_S, sleep=time.sleep,
            clock=time.time):
    """Returns (exit, last line, alert-leg problem or None). exit is the run's, or 10 if the run succeeded and the alert
    leg did not."""
    waited, held = 0, False
    while not take_lock(root):
        if waited >= wait_s:
            break
        sleep(30)
        waited += 30
    else:
        held = True
    try:
        if held:
            code, line = runner(projects, root, shared)
        else:
            code, line = 9, ("ARCHIVE RUN FAILED — another run has held %s for over %d min; read its pid and stamp, "
                             "confirm no run is alive, then delete it" % (os.path.join(root, ".run.lock"), wait_s // 60))
        n = log_line(root, "nightly", code, line)
        why = alert_leg(code, line, clock(), n, root, remote)
        if why:
            log_line(root, "nightly-alert", code, "ALERT LEG FAILED: %s" % why)
    finally:
        if held:
            drop_lock(root)
    return (code if code != 0 else (10 if why else 0)), line, why


def precompact_run(projects, root, shared, runner=run_once, clock=time.time):
    last = last_success(root)
    if last is not None and clock() - last < PRECOMPACT_FLOOR_S:
        log_line(root, "precompact", "-", "SKIPPED — the last success ended %s, under %d min ago"
                 % (utc(last), PRECOMPACT_FLOOR_S // 60))
        return None
    if not take_lock(root):
        log_line(root, "precompact", "-", "SKIPPED — a run is already in progress")
        return None
    try:
        code, line = runner(projects, root, shared)
    finally:
        drop_lock(root)
    log_line(root, "precompact", code, line)
    return code, line


def precompact_hook(stdin_text, root=ROOT, spawn=None):
    """The hook itself: record that it fired (and whether it was handed a transcript path - pre-audit P7b), start the
    run DETACHED so compaction is never held up, and return. Prints nothing; never fails the hook."""
    try:
        keys = sorted(json.loads(stdin_text or "{}").keys())
    except ValueError:
        keys = ["<unparseable stdin>"]
    try:
        log_line(root, "precompact-hook", "-", "fired; input keys: %s" % ",".join(keys))
        args = [sys.executable, "-I", os.path.abspath(__file__), "precompact-run"]
        if spawn is not None:
            spawn(args)
        else:
            flags = 0x00000008 | 0x00000200 | 0x08000000 if os.name == "nt" else 0   # DETACHED | NEW_GROUP | NO_WINDOW
            subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                             creationflags=flags, close_fds=True, start_new_session=(os.name != "nt"))
    except Exception as e:  # noqa: BLE001 - a hook must never block compaction; the failure is still written down
        try:
            log_line(root, "precompact-hook", "-", "COULD NOT START THE RUN: %s: %s" % (type(e).__name__, e))
        except OSError:
            pass
    return 0


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    except (AttributeError, ValueError):
        pass
    mode = argv[1] if len(argv) > 1 else ""
    projects = os.path.join(HOME, ".claude", "projects")
    shared = os.path.join(projects, "DT-SHARED-MEMORY")
    if mode == "nightly":
        code, line, why = nightly(projects, ROOT, shared)
        print(line)
        if why:
            print("ALERT LEG FAILED — %s" % why)
        return code
    if mode == "precompact":
        return precompact_hook(sys.stdin.read())
    if mode == "precompact-run":
        precompact_run(projects, ROOT, shared)
        return 0
    print("usage: dt_archive_trigger.py nightly | precompact | precompact-run")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
