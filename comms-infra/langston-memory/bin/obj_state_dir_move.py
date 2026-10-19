#!/usr/bin/env python3
"""B-LANGSTON-RELIEF, one-time (Kyle approved 2026-10-19). Root, on Helsinki.

    python3 obj_state_dir_move.py            # DRY RUN: lists what would be copied
    python3 obj_state_dir_move.py --apply    # copy into state/, then set the originals aside

The root-run Langston tools (size watch, self-memory backup, privacy check, load canary, pattern promotion) now keep
their state and logs in /opt/langston-memory/state (root:root 0755, files root:root 0644) instead of usage/, which
langston owns. This copies the existing files across BEFORE the new tools are installed - the size watch with no
state file would seed a fresh ceiling from today's measured total, which is higher than the ratchet's ceiling.

Each source is opened without following a link and must be a regular file; each copy is created exclusively and
re-hashed against its source. The originals are RENAMED aside (`<name>.moved-to-state-<ts>`), never deleted. Files
langston writes himself (recall-usage.jsonl and its rotations) stay in usage/.
"""
import datetime, hashlib, os, re, stat, sys

USAGE = "/opt/langston-memory/usage"
STATE = "/opt/langston-memory/state"
NAMES = re.compile(r"^(ratchet-state\.json|privacy-check\.jsonl|privacy-check-state\.json|selfmemory-backup-manifest\.md"
                   r"|pattern-promotion\.jsonl|pattern-promotion-proposal-[0-9TZ]+\.md"
                   r"|(size-watch|selfmemory-backup|load-canary)\.jsonl(\.[0-9]+\.gz)?)$")


def die(msg):
    print("REFUSED: " + msg)
    sys.exit(2)


def state_dir(apply):
    try:
        st = os.lstat(STATE)
    except FileNotFoundError:
        if not apply:
            return "would create"
        os.mkdir(STATE, 0o755)
        os.chmod(STATE, 0o755)
        st = os.lstat(STATE)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != 0 or st.st_gid != 0 or st.st_mode & 0o022:
        die("%s is not a root:root directory writable only by root (mode %o, uid %d)" % (STATE, st.st_mode, st.st_uid))
    return "present, root:root %o" % stat.S_IMODE(st.st_mode)


def main():
    if os.geteuid() != 0:
        die("run as root")
    apply = "--apply" in sys.argv
    p = os.lstat(os.path.dirname(STATE))
    if p.st_uid != 0 or p.st_mode & 0o022:
        die("the parent of %s must be root-owned and not group/world-writable" % STATE)
    print("state dir: %s" % state_dir(apply))
    todo = sorted(n for n in os.listdir(USAGE) if NAMES.match(n))
    ts = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    moved = 0
    for n in todo:
        src, dst = os.path.join(USAGE, n), os.path.join(STATE, n)
        fd = os.open(src, os.O_RDONLY | os.O_NOFOLLOW)
        try:
            if not stat.S_ISREG(os.fstat(fd).st_mode):
                die("%s is not a regular file" % src)
            data = b""
            while True:
                chunk = os.read(fd, 1 << 20)
                if not chunk:
                    break
                data += chunk
        finally:
            os.close(fd)
        h = hashlib.sha256(data).hexdigest()
        if os.path.lexists(dst):
            die("%s already exists - nothing more copied (moved so far: %d)" % (dst, moved))
        print("%-48s %9d B  sha256 %s" % (n, len(data), h[:12]))
        if not apply:
            continue
        out = os.open(dst, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o644)
        try:
            os.write(out, data)
            os.fsync(out)
            os.fchmod(out, 0o644)
        finally:
            os.close(out)
        with open(dst, "rb") as fh:
            if hashlib.sha256(fh.read()).hexdigest() != h:
                die("the copy %s does not hash to its source - the source is left in place" % dst)
        os.rename(src, src + ".moved-to-state-" + ts)
        moved += 1
    print(("COPIED %d file(s); originals set aside with suffix .moved-to-state-%s" % (moved, ts)) if apply
          else "DRY RUN - %d file(s) would be copied; nothing written" % len(todo))
    return 0


if __name__ == "__main__":
    sys.exit(main())
