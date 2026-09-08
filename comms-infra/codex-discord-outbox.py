"""Let the Codex advisor POST to the crew Discord channel — the write half of the
mirror, so it can iterate to consensus rather than only read.

WHY IT IS A FILE DROP AND NOT AN API CALL. Codex runs inside the ChatGPT desktop
app, sandboxed to one folder. It can write files and it cannot reach the network,
hold a credential, or run a daemon. So the only shape available is the one the
mirror already uses in reverse: it writes a file, something outside picks it up.
That is a constraint, not a preference — and it is why this is symmetric with
`codex-channel-mirror.py` rather than clever.

⛔⛔ THE SENDER NAME IS SET HERE AND CANNOT BE SET BY THE FILE. Codex writes the
    BODY; this watcher supplies the identity. If the message file could name its
    own sender, an advisor outside the crew could post as OLD Claude or as
    Langston, and every wake-routing and attribution rule in the project keys off
    that name. ★ Making impersonation IMPOSSIBLE rather than forbidden is the
    §29 preference — a rule in a document is a habit; a name the writer cannot
    reach is a mechanism.

⛔ `--notify` IS NOT AVAILABLE TO CODEX. That flag @-mentions Kyle and pushes to
   his phone. An advisor that cannot be woken should not be able to wake HIM;
   escalation stays with the sessions that can be held to it.

⚠️⚠️ THE PROPERTY THAT MATTERS MOST, AND IT IS NOT A BUG: CODEX CANNOT BE WOKEN.
    It takes a turn only when Kyle prompts it. So it can START a conversation it
    cannot FOLLOW — post a question, and be absent when the answer arrives. That
    is stated here, stated in its rules file, and it is the whole reason the wake
    research is a separate piece of work. Do not paper over it by pretending the
    channel is symmetric: reading is polled, writing is one-shot, and nothing
    tells Codex that a reply came.

★ ORDERING AND COMPLETENESS. A file is only sent once its mtime has been stable
  for STABLE_SECONDS — a half-written message posted to a live channel cannot be
  recalled. Files are sent OLDEST FIRST so a multi-part thought arrives in the
  order it was thought.

USAGE:  python3 codex-discord-outbox.py [--once] [--dry-run]
"""

import argparse
import io
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone

HOST = "root@204.168.141.77"
SENDER = "Codex"                    # ⛔ fixed here; the file cannot change it
SANDBOX = r"C:\DawnTrader-Codex"
OUTBOX = os.path.join(SANDBOX, "out", "discord")
SENT = os.path.join(OUTBOX, "sent")
FAILED = os.path.join(OUTBOX, "failed")
STATE_DIR = os.path.join(os.path.expanduser("~"), ".claude")
RUNLOG = os.path.join(STATE_DIR, "codex-outbox.jsonl")

STABLE_SECONDS = 10                 # mtime must be this old before we send
MAX_BYTES = 60_000                  # one message; the bridge chunks beyond 2000
MAX_PER_RUN = 5                     # flood guard — a runaway loop cannot spam the channel


# ⛔ CREATE_NO_WINDOW OR THIS TASK FLASHES A BLACK CONSOLE ON KYLE'S SCREEN. `scp` and
#    `ssh` are CONSOLE applications, so Windows allocates a NEW console for the CHILD even
#    when the parent is pythonw. Kyle reported exactly this on the mirror on 2026-09-05 and
#    the first fix — switching the task to pythonw — did not stop it, because the window was
#    never python's. ★ The flag belongs on the SUBPROCESS, not on the interpreter.
NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0)   # 0 on non-Windows


def utc():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def log(row):
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        with io.open(RUNLOG, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
    except Exception:
        pass


def candidates():
    """Ready message files, oldest first. A file is ready when its mtime has been
    stable for STABLE_SECONDS — Codex may still be writing it, and a half-sent
    message cannot be unsent."""
    try:
        names = os.listdir(OUTBOX)
    except FileNotFoundError:
        return []
    now = time.time()
    out = []
    for n in sorted(names):
        if not n.lower().endswith(".md"):
            continue
        p = os.path.join(OUTBOX, n)
        if not os.path.isfile(p):
            continue
        try:
            st = os.stat(p)
        except OSError:
            continue
        if now - st.st_mtime < STABLE_SECONDS:
            continue
        out.append((st.st_mtime, p))
    out.sort()
    return [p for _m, p in out]


def send(path, dry):
    body = io.open(path, encoding="utf-8", errors="replace").read().strip()
    if not body:
        return False, "empty file — nothing to post"
    nbytes = len(body.encode("utf-8"))
    if nbytes > MAX_BYTES:
        return False, "%d B exceeds the %d B ceiling for one message" % (nbytes, MAX_BYTES)
    if dry:
        return True, "DRY RUN — would post %d B as %s" % (nbytes, SENDER)

    # ⛔ THE BODY GOES OVER AS A FILE, NEVER AS AN ARGUMENT. It is arbitrary prose
    #    written by another agent: apostrophes, backticks, `#`, newlines. This project
    #    has had a Discord post, a heredoc, a CLI prompt, a commit message, a review
    #    dispatch and a live alert body mangled by exactly that, most recently two days
    #    ago in a tool whose job was to be readable.
    remote = "/tmp/codex-outbox-%d.md" % int(time.time() * 1000)
    scp = subprocess.run(["scp", "-q", "-o", "ConnectTimeout=20", path, HOST + ":" + remote],
                         capture_output=True, text=True, encoding="utf-8",
                         errors="replace", timeout=180, creationflags=NO_WINDOW)
    if scp.returncode != 0:
        return False, "scp failed rc=%d %s" % (scp.returncode, (scp.stderr or "")[:200])

    # `--sender` is supplied HERE. Nothing in the file can influence it.
    cmd = ("cc-send --sender %s --message \"$(cat %s)\"; rc=$?; rm -f %s; exit $rc"
           % (json.dumps(SENDER), remote, remote))
    p = subprocess.run(["ssh", "-o", "ConnectTimeout=20", HOST, cmd],
                       capture_output=True, text=True, encoding="utf-8",
                       errors="replace", timeout=300, creationflags=NO_WINDOW)
    if p.returncode != 0:
        return False, "cc-send failed rc=%d %s" % (p.returncode, (p.stderr or "")[:200])
    return True, (p.stdout or "").strip()[:200]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="single pass (default)")
    ap.add_argument("--dry-run", action="store_true", help="report what would be sent; post nothing")
    args = ap.parse_args()

    for d in (OUTBOX, SENT, FAILED):
        os.makedirs(d, exist_ok=True)

    ready = candidates()
    if not ready:
        return 0

    sent_n = 0
    for path in ready[:MAX_PER_RUN]:
        ok, detail = send(path, args.dry_run)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        base = os.path.basename(path)
        row = {"ts": utc(), "file": base, "sent": ok, "detail": detail,
               "sender": SENDER, "dry_run": args.dry_run,
               "measures": ("one row per outbound message file; records that it was POSTED, "
                            "not that anyone read it — and Codex cannot be woken, so nothing "
                            "here says whether a reply arrived")}
        log(row)
        print(("SENT  " if ok else "FAILED") + "  " + base + "  " + str(detail)[:120])
        if args.dry_run:
            continue
        dest = os.path.join(SENT if ok else FAILED, stamp + "__" + base)
        try:
            os.replace(path, dest)
        except OSError as e:
            print("  (could not move %s: %s)" % (base, e))
        if ok:
            sent_n += 1

    if len(ready) > MAX_PER_RUN:
        # ⚠️ Say so rather than silently deferring — a queue nobody mentions is a queue
        #    nobody knows is backing up.
        msg = "%d more file(s) queued; flood guard sends at most %d per run" % (
            len(ready) - MAX_PER_RUN, MAX_PER_RUN)
        print(msg)
        log({"ts": utc(), "deferred": len(ready) - MAX_PER_RUN, "note": msg})
    return 0 if sent_n or args.dry_run else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        print("OUTBOX FAILED: %s: %s" % (type(e).__name__, e), file=sys.stderr)
        log({"ts": utc(), "error": "%s: %s" % (type(e).__name__, e)})
        sys.exit(2)
