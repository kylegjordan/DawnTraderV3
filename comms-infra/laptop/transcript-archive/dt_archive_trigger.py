#!/usr/bin/env python3
"""dt_archive_trigger — B-TRANSCRIPT-ARCHIVE P7: the TRIGGERS that call the one archive run (dt_archive_run), and how a
run that FAILED or NEVER HAPPENED reaches a person.

    python -I dt_archive_trigger.py nightly       # the Windows scheduled task
    python -I dt_archive_trigger.py precompact    # the PreCompact hook: starts a run in the background, returns at once

THE RUN LOCK. One run at a time, across every trigger: `<root>/.run.lock`, created exclusively, holding pid + UTC stamp.
Two runs at once would collide on the writer's per-file locks and one would exit 5 for nothing. A PRECOMPACT trigger that
finds the lock held SKIPS (logged, no alert - the run in progress covers it). The NIGHTLY trigger waits up to
NIGHTLY_WAIT_S for it; still held after that is a FAILURE (exit 9, alerted, naming the lock). The nightly trigger holds
the lock until its RUNS.log line is written, so the line its alert cites is exactly its own. Never broken automatically - the
writer's rule: a human reads the pid and stamp, confirms no run is alive, then deletes it.

RUNS.log. Every attempt appends one line, `<UTC>\t<trigger>\t<exit>\t<last line>`, to `<root>/RUNS.log` - including a
skip, and including when the alert leg below could not be delivered (`ALERT LEG FAILED: <why>`).

HOW A FAILURE REACHES A PERSON (nightly only; one dedupe key, `transcript-archive-nightly`, in the staging system-alerts
queue, which the per-turn alert check and Langston's triage already read and which re-surfaces until RESOLVED):
  * success  -> resolve every open row on the key (a standing failure, or the scheduled check below), then schedule a
                warning at now + DEADMAN_H: "the nightly archive has not succeeded since <stamp>". The next success
                resolves it before it fires. A night with NO run - laptop off, task disabled, the trigger dying before
                it reaches this code - therefore fires it, so "never ran" is loud, not silent.
  * failure  -> resolve the key (so the dedupe rule does not swallow it behind the scheduled row), then raise an ACTIVE
                warning now, carrying the run's last line. No new scheduled check: the active alert stands until a
                success resolves it.
  * alert leg cannot reach staging -> recorded in RUNS.log; the check scheduled by the LAST success still stands and
                fires, so an unreachable staging can delay the alarm by up to DEADMAN_H, never silence it. (Its text
                then says "has not succeeded", which is wrong if the run did succeed: RUNS.log is the tiebreak.)
The PreCompact trigger raises nothing: it is a freshness top-up, and the nightly run is the one the alarm watches.
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

KEY = "transcript-archive-nightly"
ACTOR = "cc-infra"
DEADMAN_H = 26
NIGHTLY_WAIT_S = 15 * 60
STAGING = "root@188.245.193.8"
HOME = os.path.expanduser("~")
ROOT = os.path.join(HOME, ".claude", "transcript-archive")


def utc(t=None):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() if t is None else t))


def log_line(root, trigger, code, line):
    os.makedirs(root, exist_ok=True)
    with open(os.path.join(root, "RUNS.log"), "a", encoding="utf-8", newline="\n") as fh:
        fh.write("%s\t%s\t%s\t%s\n" % (utc(), trigger, code, " ".join(str(line).split())))


def next_log_ref(root):
    """The reference the alert's resolve evidence cites: `transcript-archive/RUNS.log:<n>`, n = the line this attempt is
    about to write (the evidence gate wants a re-derivable reference, and this one is the record of the run itself)."""
    try:
        with open(os.path.join(root, "RUNS.log"), "rb") as fh:
            n = sum(1 for _ in fh) + 1
    except FileNotFoundError:
        n = 1
    return "transcript-archive/RUNS.log:%d" % n


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


def remote_alerts(args, timeout=120):
    """One system-alerts CLI call on staging, as the deploy user. Raises with the reason on any failure."""
    cmd = "cd /home/deploy/dawntrader && npm run -s system-alerts -- " + " ".join(shlex.quote(a) for a in args)
    p = subprocess.run(["ssh", "-o", "ConnectTimeout=15", "-o", "BatchMode=yes", STAGING,
                        "su - deploy -c " + shlex.quote(cmd)], capture_output=True, timeout=timeout)
    if p.returncode != 0:
        raise RuntimeError("system-alerts %s exit %d: %s" % (args[0], p.returncode,
                                                             (p.stderr or p.stdout).decode("utf-8", "replace")[-200:]))
    return p.stdout.decode("utf-8", "replace")


def alert_leg(code, line, now, ref, remote=remote_alerts):
    """The nightly result -> the alerts queue. `ref` is this attempt's RUNS.log line. Returns None, or why it failed."""
    stamp = utc(now)
    try:
        remote(["resolve-key", KEY, "--by", ACTOR, "--evidence", "%s (nightly %s, exit %s)" % (ref, stamp, code)])
        if code == 0:
            remote(["add", "--triggers-at", utc(now + DEADMAN_H * 3600), "--category", "health_check",
                    "--severity", "warning", "--dedupe-key", KEY,
                    "--title", "Transcript archive: the nightly run has not succeeded since %s" % stamp,
                    "--body", ("The laptop's nightly transcript archive last succeeded at %s and no success has replaced "
                               "this check since. Either the run did not happen (laptop off, task disabled or broken) "
                               "or it could not reach staging to cancel this - read RUNS.log in "
                               "~/.claude/transcript-archive on the laptop. Owner: Infra Claude." % stamp),
                    "--metadata", json.dumps({"owner": "CC-INFRA", "source": "dt_archive_trigger", "last_ok": stamp})])
        else:
            remote(["add", "--triggers-at", stamp, "--category", "health_check", "--severity", "warning",
                    "--dedupe-key", KEY, "--title", "Transcript archive: the nightly run FAILED (exit %s)" % code,
                    "--body", ("The laptop's nightly transcript archive failed at %s: %s. Nothing new was archived. "
                               "Owner: Infra Claude." % (stamp, line))[:1500],
                    "--metadata", json.dumps({"owner": "CC-INFRA", "source": "dt_archive_trigger", "exit": code})])
    except Exception as e:  # noqa: BLE001 - recorded in RUNS.log by the caller; the scheduled check still stands
        return "%s: %s" % (type(e).__name__, str(e)[:300])
    return None


def run_once(projects, root, shared):
    try:
        return ar.run(projects, root, shared)
    except Exception as e:  # noqa: BLE001 - every attempt ends on a result, never a traceback
        return 8, "ARCHIVE RUN FAILED — unexpected %s: %s" % (type(e).__name__, str(e)[:300])


def nightly(projects, root, shared, remote=remote_alerts, runner=run_once, wait_s=NIGHTLY_WAIT_S, sleep=time.sleep,
            clock=time.time):
    waited, held = 0, False
    while not take_lock(root):
        if waited >= wait_s:
            break
        sleep(30)
        waited += 30
    else:
        held = True
    try:          # the lock is held through the log write, so the RUNS.log line the alert cites is exactly this one
        if held:
            code, line = runner(projects, root, shared)
        else:
            code, line = 9, ("ARCHIVE RUN FAILED — another run has held %s for over %d min; read its pid and stamp, "
                             "confirm no run is alive, then delete it" % (os.path.join(root, ".run.lock"), wait_s // 60))
        ref = next_log_ref(root)
        why = alert_leg(code, line, clock(), ref, remote)
        log_line(root, "nightly", code, line if why is None else "%s | ALERT LEG FAILED: %s" % (line, why))
    finally:
        if held:
            drop_lock(root)
    return code, line, why


def precompact_run(projects, root, shared, runner=run_once):
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
