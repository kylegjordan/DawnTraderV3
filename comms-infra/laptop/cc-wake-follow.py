#!/usr/bin/env python3
"""cc-wake-follow — the Helsinki-side reader for the event-only wake watcher (B-TOKEN-BURN-CUT, #1127).

WHY IT EXISTS: the desktop app's Monitor tool gained a hard deadline in CC 2.1.271 (at most 30
minutes; `CLAUDE_CODE_FEATURE_WATCH.md`, the 2026-09-15 row), so a never-ending `tail -F` watcher
now expires and wakes its session twice an hour with nothing to say. The watcher became a
background task that ENDS on its first wake — and a task that ends must be able to RESUME where it
stopped, which `tail -n0 -F` cannot: everything written between two arms would be lost.

HOW IT RUNS: never installed on Helsinki. The laptop pipes this file into `ssh … "python3 - ARGS"`,
so the laptop copy is the only copy (no hand-installed remote twin to drift, `#1004`).

ARGS: one per source, `path:inode:offset` (resume) or `path:end` (first arm: start at the end).
OUTPUT (the filter's input contract, `cc-wake-filter.py`):
  ==> path <==              a header BEFORE the first content line of every run, and on every
                            switch of file (condition C7: the filter drops a header-less line)
  <line>                    one COMPLETE line from the file (never a trailing chunk without \\n)
  (the line comes AFTER its #@POS — see below)
  #@POS path inode offset   written BEFORE each line: the byte offset just past that NEXT line,
                            i.e. its resume point; the filter commits it only after it has
                            processed the line
  #@AT path inode offset    where this run starts reading each file, and where it restarts after a
                            rotation — so a file with no traffic still has a stored position and
                            lines written to it between two arms are not skipped
  #@CAUGHTUP                a pass found nothing new on any file (the filter's "burst is over")
  #@KEEPALIVE <utc>         every 300 s — the liveness signal (the filter touches <state>.alive)
POSITION RULES (condition C2): (inode, offset). A changed inode, or a file now shorter than the
offset (copytruncate), re-reads from 0. A missing file is skipped until it exists.
TEARDOWN (condition C8): #@CAUGHTUP is written on every idle pass (1 s), so when the laptop side
exits, the next write fails and this process ends within about a second rather than lingering.
"""
import os, sys, time
from datetime import datetime, timezone

POLL_S = 1.0
KEEPALIVE_S = int(os.environ.get("CC_WAKE_KEEPALIVE_S", "300"))   # env override for the tests only
MAX_READ = 1 << 20          # at most 1 MiB per file per pass; the rest is read on the next pass

out = sys.stdout


def emit(s):
    out.write(s + "\n")


def parse(arg):
    """Split from the RIGHT: a path may itself hold a colon (a Windows test path does)."""
    if arg.endswith(":end"):
        return arg[:-4], None, None
    path, ino, off = arg.rsplit(":", 2)
    return path, int(ino), int(off)


def start_at_end(path):
    """Start at the end — but at a LINE boundary: a file whose last byte is not a newline has a
    line still being written, and starting mid-line would later emit its tail as a line."""
    try:
        st = os.stat(path)
    except FileNotFoundError:
        return None, 0
    size = st.st_size
    if size == 0:
        return st.st_ino, 0
    with open(path, "rb") as f:
        back = min(size, 65536)
        f.seek(size - back)
        chunk = f.read(back)
    if chunk.endswith(b"\n"):
        return st.st_ino, size
    nl = chunk.rfind(b"\n")
    return st.st_ino, (size - back + nl + 1) if nl >= 0 else size - back


def main(argv):
    srcs = []
    for a in argv:
        path, ino, off = parse(a)
        if ino is None:
            ino, off = start_at_end(path)
        srcs.append([path, ino, off])
        if ino is not None:
            emit(f"#@AT {path} {ino} {off}")
    last_path = None          # C7: None forces a header before the first content line of THIS run
    # ⛔ 0.0 IS DELIBERATE: the first keepalive goes out on the FIRST pass, so a watcher is marked
    # alive the moment it arms. Setting this to time.time() would leave every arm younger than 300 s
    # without an .alive file and turn it into a false DEAD - a phone ping for Kyle (Langston, Step 4).
    # ⚠️ REACH: .alive proves this pipeline STARTED, not that the filter can DELIVER - a filter that
    # crashes after the keepalive is re-armed every 30 s and re-touches .alive while the session is
    # deaf. Only the daily WATCHER-CONTROL line reaches the read path (#661 leg 3).
    last_keepalive = 0.0
    while True:
        new = False
        for s in srcs:
            path, ino, off = s
            try:
                st = os.stat(path)
            except FileNotFoundError:
                continue
            if ino is None or st.st_ino != ino or st.st_size < off:
                ino, off = st.st_ino, 0           # rotated or truncated: the new file from its start
                emit(f"#@AT {path} {ino} {off}")
            if st.st_size <= off:
                s[1], s[2] = ino, off
                continue
            with open(path, "rb") as f:
                f.seek(off)
                data = f.read(min(st.st_size - off, MAX_READ))
            end = data.rfind(b"\n")
            if end < 0 and len(data) == MAX_READ:
                # one line longer than MAX_READ: keep reading to its newline instead of stalling on
                # this source forever (live max row 15,519 B, so latent - Langston, Step 4 nit)
                with open(path, "rb") as f:
                    f.seek(off + len(data))
                    while end < 0:
                        more = f.read(MAX_READ)
                        if not more:
                            break
                        data += more
                        end = data.rfind(b"\n")
            if end < 0:                           # only a partial line so far: wait for its newline
                s[1], s[2] = ino, off
                continue
            for raw in data[:end + 1].split(b"\n")[:-1]:
                off += len(raw) + 1
                if last_path != path:
                    emit(f"==> {path} <==")
                    last_path = path
                text = raw.decode("utf-8", errors="replace").rstrip("\r")
                if text.lstrip().startswith(("#@", "==>")):
                    # content shaped like a control line or a header must not steer the filter
                    # (a forged #@POS would move the resume point); a zero-width prefix survives
                    # the filter's .strip(), so it reads as ordinary content
                    text = "​" + text
                emit(f"#@POS {path} {ino} {off}")
                emit(text)
            s[1], s[2] = ino, off
            new = True
        now = time.time()
        if now - last_keepalive >= KEEPALIVE_S:
            emit("#@KEEPALIVE " + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
            last_keepalive = now
        if not new:
            emit("#@CAUGHTUP")
        out.flush()
        if not new:
            time.sleep(POLL_S)


if __name__ == "__main__":
    try:
        main(sys.argv[1:])
    except (BrokenPipeError, KeyboardInterrupt, OSError):   # the reader went away (Windows: EINVAL)
        try:
            sys.stdout.close()
        except Exception:
            pass
        os._exit(0)
