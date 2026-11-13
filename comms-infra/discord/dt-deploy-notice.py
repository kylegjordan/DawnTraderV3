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
A notice-only line gets both posts and the resolve is STILL attempted: the field is per line while the mint is per
window, so a mixed line may hold a minted row (Langston B-1). A resolve matching nothing is a no-op; its count is logged.
IT REACHES STAGING ONLY THROUGH ITS OWN KEY, pinned to dt-deploy-notice-gate (forced command): read, resolve its own
two keys, arm its own heartbeat - nothing else (Langston gate B attack 1).
THE FIRST RUN IS SILENT: it records how many lines exist and posts nothing (the dt-push-notice precedent).
HEARTBEAT (Langston #661 leg 3): once per UTC day it resolves its previous heartbeat alert and arms the next, due
HEARTBEAT_HOURS ahead. A watcher that stops running stops re-arming, and the armed alert fires.
EXIT: 0 = ran (a resolve that failed is retried next run and logged) · 1 = could not read staging or post.
"""
import base64
import datetime
import json
import os
import re
import subprocess
import sys
import time

# ── CONSTANTS (a test harness substitutes ONLY this block) ──
STATE = "/var/lib/dt-deploy-notice/state.json"
# B-2 (Langston, gate B): a LogsDirectory= of the unit, langston-owned. /var/log itself is root:syslog and a
# langston write there fails - silently, before this was fixed.
LOG = "/var/log/dt-deploy-notice/log"
# Attack (1): the watcher's OWN key, pinned on staging to dt-deploy-notice-gate (forced command) - never the
# reviewer's key, which can do anything deploy can.
SSH = ["/usr/bin/ssh", "-n", "-i", "/home/langston/.ssh/dt_deploy_notice_ed25519", "-o", "BatchMode=yes",
       "-o", "StrictHostKeyChecking=accept-new", "-o", "ConnectTimeout=20", "deploy@188.245.193.8"]
CC_SEND = ["/usr/local/bin/cc-send", "--sender", "Deploy notice", "--message"]
NOW = None                     # None = the wall clock; a test pins it
# ── END CONSTANTS ──

ACTOR = "deploy-notice-watcher"
OUTCOME_WAIT_S = 30 * 60
HEARTBEAT_HOURS = 26
HEARTBEAT_KEY = "deploy-notice-watcher-heartbeat"
# Owner (canonical actor) -> the Discord display name that wakes that session. A reviewer in the opening list would
# invoke the reviewer, and the Codex crew does not wake on this channel's opening list, so those are named in the
# tail. PM Claude's canonical actor is pm-claude (Langston gate B: PM must be able to own a window).
WAKE_NAME = {"cc-a": "OLD Claude", "cc-b": "NEW Claude", "cc-c": "ANALYST Claude", "cc-infra": "Infra Claude",
             "pm-claude": "PM Claude"}
# C-1 (Langston, gate B): Kyle reads neither the alert queue nor an opening list he is not in. He is put IN the
# opening list (a list-only name: it wakes no session) and the post @-mentions him (--notify, a phone push).
KYLE = "kyle"
SEP = "===DT-DEPLOY-NOTICE-SEP==="


def now():
    return NOW if NOW is not None else time.time()


def iso(t):
    return datetime.datetime.fromtimestamp(t, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s):
    return datetime.datetime.strptime(s, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc).timestamp()


def log(msg):
    line = "%s %s\n" % (iso(now()), msg)
    try:
        with open(LOG, "a") as fh:
            fh.write(line)
    except OSError as e:          # B-2: never swallowed - the journal keeps it
        sys.stderr.write("dt-deploy-notice: LOG UNWRITABLE (%s): %s" % (type(e).__name__, line))


def request(req, timeout=180):
    """One request to staging's dt-deploy-notice-gate: a base64url JSON token, so no shell parses free text."""
    token = base64.urlsafe_b64encode(json.dumps(req, sort_keys=True).encode()).decode()
    try:
        r = subprocess.run(SSH + [token], capture_output=True, text=True, timeout=timeout)
    except (subprocess.TimeoutExpired, OSError) as e:
        return None, type(e).__name__
    return (r.stdout, None) if r.returncode == 0 else (None, (r.stderr.strip() or "exit %d" % r.returncode)[:200])


def post(text, notify=False):
    """Returns the Discord message id, or None."""
    try:
        r = subprocess.run(CC_SEND[:-1] + (["--notify"] if notify else []) + CC_SEND[-1:] + [text],
                           capture_output=True, text=True, timeout=120)
    except (subprocess.TimeoutExpired, OSError) as e:
        log("POST FAILED %s" % type(e).__name__)
        return None
    m = re.search(r"sent id=(\d+)", r.stdout + r.stderr)
    if r.returncode != 0 or not m:
        log("POST FAILED exit %d %s" % (r.returncode, (r.stdout + r.stderr).strip()[-160:]))
        return None
    return m.group(1)


def resolve_key(key, evidence):
    """True when the call succeeded. resolve-key exits 0 on ZERO matching rows (scripts/system-alerts.ts cmdResolveKey),
    so success is not proof anything was resolved: the count is read from its JSON and LOGGED (Langston B-1)."""
    out, err = request({"op": "resolve", "key": key, "evidence": evidence[:400]})
    if out is None:
        log("RESOLVE FAILED %s: %s" % (key, err))
        return False
    try:
        n = len(json.loads(out[out.index("{"):])["resolved"])
    except (ValueError, KeyError, TypeError):
        n = "unknown"
    log("RESOLVED %s rows=%s" % (key, n))
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


def opening(owners, alerted=True):
    """(opening list, tail, notify Kyle?)"""
    names = []
    for o in owners:
        n = WAKE_NAME.get(o) or ("Kyle" if o == KYLE else None)
        if n and n not in names:
            names.append(n)
    others = sorted({o for o in owners if o not in WAKE_NAME and o != KYLE})
    head = ", ".join(names) if names else "Deploy notice (no session owner to wake)"
    # C-2: the reassurance is TRUE only when the alert was raised; on a notice-only line it would contradict the post.
    reach = "the alert reaches every session" if alerted else "and the alert could NOT be raised, so read this post"
    tail = (" Also owned by: %s (not woken from here; %s)." % (", ".join(others), reach)) if others else ""
    return head, tail, KYLE in owners


def start_text(f):
    ws = windows(f)
    head, tail, _ = opening([o for _, o, _ in ws], f.get("window_notice") == "alerted")
    wl = ", ".join("%s (%s, owner %s)" % (b, s, o) for b, o, s in ws)
    alert = ("One alert per window was raised" if f.get("window_notice") == "alerted"
             else "The in-window ALERT COULD NOT BE RAISED - this post is the only notice until the daily check raises it")
    return ("%s — a staging deploy of `%s` by %s STARTED at %s inside your observation window(s): %s. The app restarts. "
            "%s. I will post the outcome.%s (B-DEPLOY-WINDOW-GUARD)" % (head, f.get("sha", "?")[:12], f.get("by", "?"),
                                                                       f.get("attempt_at", "?"), wl, alert, tail))


def outcome_text(f, completed, rec):
    head, tail, _ = opening([o for _, o, _ in windows(f)], f.get("window_notice") == "alerted")
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
    out, err = request({"op": "heartbeat", "due": due})
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
    out, err = request({"op": "read"})
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
        pid = post(start_text(f), notify=KYLE in [o for _, o, _ in windows(f)])
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
            oid = post(outcome_text(f, done, rec), notify=KYLE in [o for _, o, _ in windows(f)])
            if oid is None:
                failed = True
                continue
            p["outcome_post"] = oid
            p["completed"] = done
        # B-1 (Langston, gate B): ALWAYS attempt it. window_notice is one field for the whole line while the mint is
        # per window, so a MIXED deploy (A minted, B failed) reads notice-only - and guarding on it orphaned A's row.
        # A resolve that matches nothing is a no-op, and its row count is logged.
        if True:
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
