#!/usr/bin/env python3
"""dt-deploy-notice — tell an observation window's owners that a staging deploy is landing in it, and how it ended.
B-DEPLOY-WINDOW-GUARD (#1249), pre-audit P8 + Part D (Langston BLOCKER-1, C-14). Helsinki, as langston, every 2 min
(dt-deploy-notice.timer); OnFailure pages the crew through agent-unit-failure@.

WHAT IT READS: /home/deploy/dawntrader-deploy.notice on staging - one line per deploy attempt that lands in a window,
appended by dt-deploy BEFORE the tree is touched (fail-closed there), so an attempt that later aborts is still seen.
Plus /home/deploy/dawntrader-deploy.record, written only when a deploy completes.

WHAT IT DOES, per new notice line:
  1. posts a START notice whose OPENING LIST is every owner session's display name, so each owner is woken
     (cc-wake-filter's crew branch: a non-session sender waking everyone in the opening list - pre-audit A-8);
  2. when the record shows that sha deployed at or after the attempt: posts COMPLETED and resolves each window's
     deploy-in-window:<batch>:<sha>:<attempt> alert, citing the record and the post ids;
  3. if no such record appears within OUTCOME_WAIT_S: posts DID NOT COMPLETE (the tree may be at the new sha while
     the old build runs - the drift line does NOT catch an abort before the build stamp) and resolves, citing that.
A notice-only line (dt-deploy could not raise the alert) gets both posts; there is no alert to resolve.
THE FIRST RUN IS SILENT: it records how many lines exist and posts nothing (the dt-push-notice precedent).
HEARTBEAT (Langston #661 leg 3): once per UTC day it resolves its previous heartbeat alert and arms the next, due
HEARTBEAT_HOURS ahead. A watcher that stops running stops re-arming, and the armed alert fires.
EXIT: 0 = ran (a resolve that failed is retried next run and logged) · 1 = could not read staging or post.
"""
import datetime
import json
import os
import re
import subprocess
import sys
import time

# ── CONSTANTS (a test harness substitutes ONLY this block) ──
STATE = "/var/lib/dt-deploy-notice/state.json"
LOG = "/var/log/dt-deploy-notice.log"
SSH = ["/usr/bin/ssh", "-n", "-i", "/home/langston/.ssh/id_ed25519", "-o", "BatchMode=yes",
       "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20", "deploy@188.245.193.8"]
CC_SEND = ["/usr/local/bin/cc-send", "--sender", "Deploy notice", "--message"]
NOW = None                     # None = the wall clock; a test pins it
# ── END CONSTANTS ──

ACTOR = "deploy-notice-watcher"
OUTCOME_WAIT_S = 30 * 60
HEARTBEAT_HOURS = 26
HEARTBEAT_KEY = "deploy-notice-watcher-heartbeat"
NOTICE = "/home/deploy/dawntrader-deploy.notice"
RECORD = "/home/deploy/dawntrader-deploy.record"
APP = "/home/deploy/dawntrader"
# Owner (canonical actor) -> the Discord display name that wakes that session. Sessions only: a reviewer in the
# opening list would invoke the reviewer, and the Codex crew does not wake on this channel's opening list.
WAKE_NAME = {"cc-a": "OLD Claude", "cc-b": "NEW Claude", "cc-c": "ANALYST Claude", "cc-infra": "Infra Claude"}
SEP = "===DT-DEPLOY-NOTICE-SEP==="


def now():
    return NOW if NOW is not None else time.time()


def iso(t):
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s):
    return datetime.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc).timestamp()


def log(msg):
    try:
        with open(LOG, "a") as fh:
            fh.write("%s %s\n" % (iso(now()), msg))
    except OSError:
        pass


def ssh(cmd, timeout=120):
    try:
        r = subprocess.run(SSH + [cmd], capture_output=True, text=True, timeout=timeout)
    except (subprocess.TimeoutExpired, OSError) as e:
        return None, type(e).__name__
    return (r.stdout, None) if r.returncode == 0 else (None, (r.stderr.strip() or "exit %d" % r.returncode)[:200])


def q(s):
    return "'" + s.replace("'", "'\\''") + "'"


def post(text):
    """Returns the Discord message id, or None."""
    try:
        r = subprocess.run(CC_SEND + [text], capture_output=True, text=True, timeout=120)
    except (subprocess.TimeoutExpired, OSError) as e:
        log("POST FAILED %s" % type(e).__name__)
        return None
    m = re.search(r"sent id=(\d+)", r.stdout + r.stderr)
    if r.returncode != 0 or not m:
        log("POST FAILED exit %d %s" % (r.returncode, (r.stdout + r.stderr).strip()[-160:]))
        return None
    return m.group(1)


def resolve_key(key, evidence):
    out, err = ssh("cd %s && npm run --silent system-alerts -- resolve-key %s --by %s --evidence %s"
                   % (APP, q(key), ACTOR, q(evidence)))
    if out is None:
        log("RESOLVE FAILED %s: %s" % (key, err))
        return False
    return True


def fields(line):
    return dict(kv.split("=", 1) for kv in line.split() if "=" in kv)


def windows(f):
    """[(batch, owner, state)] from in_window=b/o/s,..."""
    out = []
    for w in (f.get("in_window") or "").split(","):
        parts = w.split("/")
        if len(parts) == 3:
            out.append(tuple(parts))
    return out


def opening(owners):
    names = []
    for o in owners:
        n = WAKE_NAME.get(o)
        if n and n not in names:
            names.append(n)
    others = sorted({o for o in owners if o not in WAKE_NAME})
    head = ", ".join(names) if names else "Deploy notice (no session owner to wake)"
    tail = (" Also owned by: %s (not woken from here; the alert reaches every session)." % ", ".join(others)) if others else ""
    return head, tail


def start_text(f):
    ws = windows(f)
    head, tail = opening([o for _, o, _ in ws])
    wl = ", ".join("%s (%s, owner %s)" % (b, s, o) for b, o, s in ws)
    alert = ("One alert per window was raised" if f.get("window_notice") == "alerted"
             else "The in-window ALERT COULD NOT BE RAISED - this post is the only notice until the daily check raises it")
    return ("%s — a staging deploy of `%s` by %s STARTED at %s inside your observation window(s): %s. The app restarts. "
            "%s. I will post the outcome.%s (B-DEPLOY-WINDOW-GUARD)" % (head, f.get("sha", "?")[:12], f.get("by", "?"),
                                                                       f.get("attempt_at", "?"), wl, alert, tail))


def outcome_text(f, completed, rec):
    head, tail = opening([o for _, o, _ in windows(f)])
    if completed:
        return ("%s — the deploy of `%s` that started at %s in your window COMPLETED (record deployed_at=%s). %s"
                "(B-DEPLOY-WINDOW-GUARD)" % (head, f.get("sha", "?")[:12], f.get("attempt_at", "?"),
                                              rec.get("deployed_at", "?"), tail + " " if tail else ""))
    return ("%s — the deploy of `%s` that started at %s in your window DID NOT COMPLETE within %d min: the record still "
            "names `%s`. The tree may now be at the new sha while the OLD build runs; the hourly drift line does not "
            "catch an abort before the build stamp. Check staging before trusting your window's data.%s "
            "(B-DEPLOY-WINDOW-GUARD)" % (head, f.get("sha", "?")[:12], f.get("attempt_at", "?"), OUTCOME_WAIT_S // 60,
                                         rec.get("sha", "none")[:12], tail))


def heartbeat(st):
    day = iso(now())[:10]
    if st.get("heartbeat_day") == day:
        return
    ok = resolve_key(HEARTBEAT_KEY, "dt-deploy-notice ran at %s and re-armed" % iso(now()))
    due = iso(now() + HEARTBEAT_HOURS * 3600)
    out, err = ssh("cd %s && npm run --silent system-alerts -- add --triggers-at %s --category breakage --severity "
                   "warning --dedupe-key %s --title %s --body %s" % (
                       APP, due, HEARTBEAT_KEY,
                       q("The Helsinki deploy-notice watcher has not run for %d h" % HEARTBEAT_HOURS),
                       q("dt-deploy-notice (Helsinki, langston, every 2 min) re-arms this alert once a day. It did not, "
                         "so a staging deploy landing in an observation window would raise its alert but WAKE NO OWNER. "
                         "Check systemctl status dt-deploy-notice.timer on 204.168.141.77. Resolve, never ack. Owner: "
                         "Infra Claude. (B-DEPLOY-WINDOW-GUARD, #1249)")))
    if ok and out is not None:
        st["heartbeat_day"] = day
    else:
        log("HEARTBEAT NOT RE-ARMED (resolve %s, add %s)" % (ok, err))


def run():
    try:
        st = json.load(open(STATE))
    except FileNotFoundError:
        st = None
    except ValueError:
        log("STATE UNREADABLE - starting over silently")
        st = None
    out, err = ssh("if [ -e %s ]; then cat %s; fi; echo %s; cat %s" % (NOTICE, NOTICE, SEP, RECORD))
    if out is None or SEP not in out:
        log("STAGING UNREADABLE: %s" % (err or "no separator"))
        print("dt-deploy-notice: could not read staging (%s)" % (err or "no separator"), file=sys.stderr)
        return 1
    notice_txt, rec_txt = out.split(SEP, 1)
    lines = [ln for ln in notice_txt.splitlines() if ln.strip()]
    # the record is key=value per line, split on the FIRST '=' (deployed_via carries spaces; SIM #649)
    rec = dict(ln.strip().split("=", 1) for ln in rec_txt.splitlines() if "=" in ln)
    if st is None:
        st = {"seen": len(lines), "pending": {}}
        log("INIT %d existing notice line(s), silent" % len(lines))
        heartbeat(st)
        json.dump(st, open(STATE + ".tmp", "w")); os.replace(STATE + ".tmp", STATE)
        return 0
    if len(lines) < st["seen"]:
        log("NOTICE FILE SHRANK %d -> %d - re-basing, nothing posted for the lost lines" % (st["seen"], len(lines)))
        st["seen"] = len(lines)
    failed = False
    for ln in lines[st["seen"]:]:
        f = fields(ln)
        tag = "%s@%s" % (f.get("sha", "?"), f.get("attempt_at", "?"))
        pid = post(start_text(f))
        if pid is None:
            failed = True
            break                           # do not advance past a line nobody was told about
        st["pending"][tag] = {"line": ln, "start_post": pid}
        st["seen"] += 1
        log("START %s post %s" % (tag, pid))
    for tag, p in list(st["pending"].items()):
        f = fields(p["line"])
        try:
            started = parse_iso(f["attempt_at"])
        except (KeyError, ValueError):
            started = 0
        done = (rec.get("sha") == f.get("sha") and "deployed_at" in rec
                and parse_iso(rec["deployed_at"]) >= started)
        if not done and now() - started < OUTCOME_WAIT_S:
            continue
        if "outcome_post" not in p:
            oid = post(outcome_text(f, done, rec))
            if oid is None:
                failed = True
                continue
            p["outcome_post"] = oid
            p["completed"] = done
        if f.get("window_notice") == "alerted":
            ev = ("%s; record sha=%s deployed_at=%s; posts %s,%s" % (
                "completed" if p["completed"] else "did not complete in %d min" % (OUTCOME_WAIT_S // 60),
                rec.get("sha", "none"), rec.get("deployed_at", "none"), p["start_post"], p["outcome_post"]))
            # The key's attempt part is the line's attempt_key FIELD, written by dt-deploy - never rebuilt from
            # attempt_at (Langston, Step 4 gate A): a reformatting join is a bug waiting to happen.
            key_t = f.get("attempt_key")
            if not key_t:
                # not retried: without the key there is nothing to retry with. The posts went out; say so once.
                log("NO attempt_key in %s - cannot name its alert; left for a hand resolve" % tag)
            elif not all([resolve_key("deploy-in-window:%s:%s:%s" % (b, f.get("sha"), key_t), ev) for b, _, _ in windows(f)]):
                continue                    # retried next run; the posts are not repeated
        del st["pending"][tag]
        log("OUTCOME %s %s" % (tag, "completed" if p["completed"] else "NOT completed"))
    heartbeat(st)
    json.dump(st, open(STATE + ".tmp", "w")); os.replace(STATE + ".tmp", STATE)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(run())
