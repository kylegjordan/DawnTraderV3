#!/usr/bin/env python3
"""B-LANGSTON-MEMORY-WRITE-FENCE P6 - mutation proof for test_memory_fence.py (the pure suite), in the style of
token-watch/tests/mutate_due_storage.py.

Each mutation breaks ONE rule in a COPY of the four files, runs the suite from the copy, and counts as CAUGHT only if
the suite EXITS NON-ZERO **and** prints the named FAIL line. ⛔ Judged by exit code AND the named line, never by
grepping for "FAIL" alone: a mutant that crashes the suite prints no FAIL line and would read as caught. Every patch is
checked to have APPLIED (exactly one match) before its result is read.

    python3 mutate_memory_fence.py      (exit 0 = every mutation caught)
"""
import os, shutil, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FILES = ("langston-memory-write", "langston_memory_allowlist.py", "langston-memory-spoold", "test_memory_fence.py")
W, AL, SP = FILES[:3]

MUTATIONS = [
    ("allowlist bypass: --allow-growth admitted", [
        (AL, "        if flag not in FLAGS:\n", "        if flag not in FLAGS and flag != \"--allow-growth\":\n"),
        (AL, "        kind = FLAGS[flag]\n", "        kind = FLAGS.get(flag, \"text\")\n"),
        (AL, "if req <= present <= req | opt), None)", "if req <= present <= req | opt | {\"--allow-growth\"}), None)")],
     "FAIL ★ --allow-growth is refused"),
    ("allowlist: --part path check removed", [
        (AL, "        if not value or value != os.path.basename(value) or value.startswith(\".\") or \"/\" in value:\n",
         "        if not value:\n")],
     "FAIL ★ --part '../outside.md' is refused"),
    ("allowlist: --by taken from the request", [
        (AL, "        if flag == \"--by\":\n            continue\n", "        if False:\n            continue\n")],
     "FAIL ★ --by is never taken from the request"),
    ("allowlist: no size cap on the request", [
        (AL, "    if len(data) > MAX_REQUEST_BYTES:\n", "    if False:\n")],
     "FAIL ★ an oversize request is refused"),
    ("C-9: client branch moved down into open_lock()", [
        (W, "    if client_mode():\n        return run_as_client(argv, stdin_bytes)\n", ""),
        (W, "    try:\n        ensure_archive_dir()\n",
         "    if client_mode():\n        raise ClientResult(0, b\"\", b\"\")\n    try:\n        ensure_archive_dir()\n")],
     "FAIL ★ C-9: as the owner, the hand-off comes before ANY stat, lock or state read"),
    ("Step 7: the shrink gate disabled", [
        (W, "    if old_n < SHRINK_MIN_OLD or new_n >= SHRINK_FLOOR * old_n:\n", "    if True:\n")],
     "FAIL ★ 10,001 B -> 2 B refuses with exit 8"),
    ("C-7: owner_only restored (group bits cleared)", [
        (W, "    return fence_row(path)[\"mode\"]\n", "    return fence_row(path)[\"mode\"] & ~0o077\n")],
     "FAIL ★ C-7: owner_only() gives every written path its TABLE mode"),
    ("C-14: hand_to_owner back on the TARGET's owner", [
        (W, "    uid, gid = row_ids(fence_row(path))\n", "    uid, gid = row_ids(fence_row(TARGET))\n")],
     "FAIL ★ C-14: hand_to_owner() chowns each path to ITS row's owner"),
    ("C-2: the lock back in his home", [
        (W, "LOCK = os.path.join(ARCHIVE_DIR, \".memory-write.lock\")\n",
         "LOCK = os.path.join(LANGSTON_HOME, \".memory-write.lock\")\n")],
     "FAIL ★ C-2: the lock lives inside the root-owned .memory-archive/"),
    ("C-10: staging back in his home", [
        (W, "STAGE_DIR = ARCHIVE_DIR\n", "STAGE_DIR = LANGSTON_HOME\n")],
     "FAIL ★ C-10: every replace is staged in .memory-archive/"),
    ("client: the exit-7 text is not rewritten", [
        (W, "    if rc != 7:\n        return err\n", "    if True:\n        return err\n")],
     "FAIL ★ exit 7 through the client"),
    ("service: a spool entry opened through links", [
        (SP, "else os.O_RDONLY | NOFOLLOW | os.O_NONBLOCK | os.O_CLOEXEC\n", "else os.O_RDONLY | os.O_NONBLOCK | os.O_CLOEXEC\n")],
     "FAIL ★ ...with O_NOFOLLOW"),
    ("service: the entry unlinked before the read", [
        (SP, "    data, why, ident = take_entry(path, ctx[\"owner_uid\"], al.MAX_REQUEST_BYTES, osmod)\n"
             "    removed = remove_entry(path, ident, osmod)\n",
         "    removed = remove_entry(path, None, osmod)\n"
         "    data, why, ident = take_entry(path, ctx[\"owner_uid\"], al.MAX_REQUEST_BYTES, osmod)\n")],
     "FAIL ★ the name is unlinked only AFTER the read"),
    ("service: re-read by path before executing", [
        (SP, "        rc, out, err = ctx[\"execute\"](run_argv, stdin)\n",
         "        argv, stdin = al.parse_request(take_entry(path, ctx[\"owner_uid\"], al.MAX_REQUEST_BYTES, osmod)[0], rid)\n"
         "        shape, run_argv = al.validate(argv, stdin, os.path.join(ctx[\"home\"], \"memory-parts\"))\n"
         "        rc, out, err = ctx[\"execute\"](run_argv, stdin)\n")],
     "FAIL ★ what runs is the IN-MEMORY copy"),
]


def main():
    bad = 0
    for label, patches, expect in MUTATIONS:
        work = tempfile.mkdtemp(prefix="lmw-mutant-")
        try:
            for f in FILES:
                shutil.copy(os.path.join(HERE, f), os.path.join(work, f))
            applied = True
            for rel, old, new in patches:
                path = os.path.join(work, rel)
                src = open(path, encoding="utf-8").read().replace("\r\n", "\n")
                if src.count(old) != 1:
                    print("NOT APPLIED (%d matches): %s - %r" % (src.count(old), label, old[:60]))
                    applied = False
                    break
                open(path, "w", encoding="utf-8", newline="\n").write(src.replace(old, new))
            if not applied:
                bad += 1
                continue
            r = subprocess.run([sys.executable, os.path.join(work, "test_memory_fence.py")], capture_output=True,
                               text=True, encoding="utf-8", errors="replace", timeout=300)
            caught = r.returncode != 0 and expect in r.stdout
            print("%s  %s  (rc=%d, named line %s)" % ("CAUGHT  " if caught else "SURVIVED", label, r.returncode,
                                                      "present" if expect in r.stdout else "ABSENT"))
            bad += not caught
        finally:
            shutil.rmtree(work, ignore_errors=True)
    print("%d of %d mutations caught" % (len(MUTATIONS) - bad, len(MUTATIONS)))
    return 1 if bad else 0


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.exit(main())
