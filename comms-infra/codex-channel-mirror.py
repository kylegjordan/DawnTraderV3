"""Mirror the crew Discord channel into the Codex advisor's sandbox.

WHY THIS EXISTS. Kyle added a Codex session as an ADVISOR (not a gate). It runs
in the ChatGPT desktop app and CANNOT BE WOKEN — a desktop session takes a turn
only when a human prompts it — so a watcher would log into a terminal nobody
reads. What it CAN do is CATCH UP: this appends the crew channel to a plain file
in its sandbox, which it reads at the start of any turn Kyle gives it.

⛔ EGRESS DECISION, KYLE'S, RECORDED HERE BECAUSE IT IS THE LOAD-BEARING ONE
   (2026-09-04): the mirror is UNREDACTED. I measured the channel first — 71 of
   17,844 rows carry a real key prefix (sk-/alch_/oat01-), 77 carry a host IP,
   7 carry an /etc/<service>/ path — and proposed redacting at the write. Kyle
   ruled otherwise, with his reason: *"You can build the whole channel. This is
   my ChatGPT account on my laptop. No one else uses it."*
   ⇒ THE FILE THIS WRITES CARRIES EVERYTHING THE CHANNEL CARRIES. Anyone
   changing where it is written, or who can read that folder, is re-opening a
   decision Kyle made on the assumption of a single-user laptop.

★ THREE PROPERTIES, EACH FROM SOMETHING THIS PROJECT HAS ALREADY BEEN BITTEN BY:

  1. IT STATES ITS OWN FRESHNESS AT THE TOP. An advisor cannot tell a quiet
     channel from a dead writer, and an unstamped stale artifact reading as
     current is the `B-CROSS-SESSION-BLEED` freeze. The header carries the
     generation time, the last message time, and the row count.

  2. IT FAILS TOWARD STOPPING, NEVER TOWARD A PARTIAL FILE. The readable file
     is regenerated atomically (temp + os.replace) from an append-only local
     cache. If the fetch fails, the previous good file is left EXACTLY as it
     was and the run exits non-zero — a truncated record an advisor reads as
     fact is worse than no file.

  3. ITS CURSOR LIVES OUTSIDE THE SANDBOX. Codex can write to its own folder by
     design, so state kept there would be state the reader can perturb.

USAGE:  python3 codex-channel-mirror.py [--once]
"""

import argparse
import io
import json
import os
import subprocess
import sys
from datetime import datetime, timezone

HOST = "root@204.168.141.77"
REMOTE_LOG = "/var/log/cc-discord-inbox.jsonl"

SANDBOX = r"C:\DawnTrader-Codex\notes"
OUT_MD = os.path.join(SANDBOX, "crew-channel.md")
# ⛔ state and cache live OUTSIDE the sandbox — see property 3 above.
STATE_DIR = os.path.join(os.path.expanduser("~"), ".claude")
STATE = os.path.join(STATE_DIR, "codex-mirror-state.json")
CACHE = os.path.join(STATE_DIR, "codex-mirror-cache.jsonl")

# ⛔ THE RENDERED FILE IS A WINDOW; THE CACHE KEEPS EVERYTHING.
# The whole channel is ~17,800 rows. MEASURED: the most recent 400 rendered to
# 736,901 B — roughly 180k tokens, which a chat session cannot actually read.
# So the window is bounded by BYTES, not by message count: take the most recent
# messages that fit the budget, newest-first, and stop.
RENDER_BUDGET = 120_000     # bytes of message body
WINDOW_MAX = 400            # hard ceiling on messages regardless of size


def load_state():
    try:
        with io.open(STATE, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {"last_line": 0}


def save_state(st):
    os.makedirs(STATE_DIR, exist_ok=True)
    tmp = STATE + ".tmp"
    with io.open(tmp, "w", encoding="utf-8") as fh:
        json.dump(st, fh)
    os.replace(tmp, STATE)


def fetch_since(last_line):
    """Pull only rows after the cursor. Raises on any failure — the caller
    treats that as 'leave the previous good file alone'."""
    cmd = ["ssh", "-o", "ConnectTimeout=20", HOST,
           "tail -n +%d %s" % (last_line + 1, REMOTE_LOG)]
    # ⛔ encoding MUST be explicit. The channel is full of emoji and em-dashes;
    #    on Windows `text=True` decodes as cp1252 and dies at the first one
    #    (measured: UnicodeDecodeError at byte 0x8f on the first cold run).
    #
    # ⛔⛔ CREATE_NO_WINDOW IS THE ACTUAL FIX FOR THE FLASHING BLACK WINDOW, AND
    #    SWITCHING THE TASK TO pythonw.exe WAS NOT ENOUGH — that was the first
    #    fix and Kyle reported it STILL popping up four times an hour.
    #    WHY: pythonw gives the PYTHON process no console, but `ssh.exe` is a
    #    CONSOLE application, so Windows allocates a BRAND NEW console for the
    #    CHILD. The window was never python's; it was ssh's.
    #    ⇒ the flag must be on the SUBPROCESS, not on the interpreter.
    flags = getattr(subprocess, "CREATE_NO_WINDOW", 0)   # 0 on non-Windows
    p = subprocess.run(cmd, capture_output=True, text=True,
                       encoding="utf-8", errors="replace", timeout=180,
                       creationflags=flags)
    if p.returncode != 0:
        raise RuntimeError("fetch failed rc=%d: %s" % (p.returncode, p.stderr[:200]))
    lines = [l for l in p.stdout.split("\n") if l.strip()]
    return lines


def append_cache(lines):
    os.makedirs(STATE_DIR, exist_ok=True)
    with io.open(CACHE, "a", encoding="utf-8") as fh:
        for l in lines:
            fh.write(l + "\n")


def read_cache_window():
    """Most recent messages that fit RENDER_BUDGET, oldest-first for reading."""
    rows = []
    try:
        with io.open(CACHE, encoding="utf-8", errors="replace") as fh:
            for l in fh:
                try:
                    rows.append(json.loads(l))
                except Exception:
                    continue
    except FileNotFoundError:
        return []
    picked, used = [], 0
    for r in reversed(rows[-WINDOW_MAX * 3:]):
        body = str(r.get("message") or r.get("text") or r.get("body") or "").strip()
        if not body:
            continue
        cost = len(body.encode("utf-8"))
        if picked and (used + cost > RENDER_BUDGET or len(picked) >= WINDOW_MAX):
            break
        picked.append(r)
        used += cost
    picked.reverse()
    return picked


def render(rows, total_cached):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%SZ")
    last_ts = ""
    for r in reversed(rows):
        t = str(r.get("ts") or r.get("timestamp") or "")
        if t:
            last_ts = t[:19]
            break

    out = []
    out.append("# DawnTrader crew channel — mirror for the Codex advisor")
    out.append("")
    out.append("> **GENERATED:** %s · **LAST MESSAGE:** %s"
               % (now, last_ts or "(none)"))
    out.append("> **SHOWING:** the most recent %d of %d mirrored messages."
               % (len(rows), total_cached))
    out.append("> **IF `GENERATED` IS OLD, THIS FILE IS STALE — the mirror may have"
               " stopped. A quiet channel and a dead writer look identical without"
               " this line, so check it before relying on anything below.**")
    out.append("")
    out.append("This is the live working channel between Kyle, three Claude Code"
               " sessions (OLD/NEW/ANALYST Claude), Infra Claude, and Langston the"
               " reviewer. It is verbatim and unedited.")
    out.append("")
    out.append("---")
    out.append("")

    for r in rows:
        ts = str(r.get("ts") or r.get("timestamp") or "")[:19]
        who = str(r.get("sender") or r.get("author") or r.get("kind") or "?")
        kind = str(r.get("kind") or "")
        body = str(r.get("message") or r.get("text") or r.get("body") or "").strip()
        if not body:
            continue
        out.append("### %s — %s%s" % (ts, who, (" · %s" % kind) if kind else ""))
        out.append("")
        out.append(body)
        out.append("")
    return "\n".join(out) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--once", action="store_true", help="single pass (default)")
    ap.parse_args()

    st = load_state()
    last = int(st.get("last_line", 0))

    # ⛔ Any failure here leaves OUT_MD untouched and exits non-zero.
    new = fetch_since(last)
    if new:
        append_cache(new)
        st["last_line"] = last + len(new)
        save_state(st)

    total = 0
    try:
        with io.open(CACHE, encoding="utf-8", errors="replace") as fh:
            for _ in fh:
                total += 1
    except FileNotFoundError:
        pass

    rows = read_cache_window()
    if not rows:
        print("no rows cached yet; leaving %s untouched" % OUT_MD)
        return 1

    os.makedirs(SANDBOX, exist_ok=True)
    text = render(rows, total)
    tmp = OUT_MD + ".tmp"
    with io.open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text)
    os.replace(tmp, OUT_MD)   # atomic — no reader ever sees a partial file

    print("appended %d new; rendered %d of %d cached -> %s (%d B)"
          % (len(new), len(rows), total, OUT_MD, len(text.encode("utf-8"))))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:
        # Fail toward stopping. The previous good file stands.
        print("MIRROR FAILED (previous file left intact): %s: %s"
              % (type(e).__name__, e), file=sys.stderr)
        sys.exit(2)
