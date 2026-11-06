#!/usr/bin/env python3
"""dt_reread_evidence — B-TRANSCRIPT-ARCHIVE P5 r8: the two evidence legs for the one-time legacy re-read (2026-11-06
22:37Z), as a command a NON-AUTHOR can run on the laptop (Langston, msg 1568401336800641127). READ-ONLY.

    python3 -I dt_reread_evidence.py [--archive DIR] [--backup DIR]

LEG 1 - cross-state uniqueness: every archived id across ALL states; ids held by more than one state, attributed to the
        groups of raw files that share them (every group, not a sample), and compared with the same count in the
        BACKUP's .state - so "the re-read created none" is a before/after difference, not an assertion.
LEG 2 - no history rewritten: for every archive .md file in the BACKUP (the population is the backup side, so a file
        present then and absent now is counted as `missing today`, never skipped), is it an exact byte prefix of
        today's file? INDEX.md is rebuilt by every run and is reported apart.

STATED LIMITS: (1) both legs use the SAME backup snapshot (Drive, `Claude Code Backup Folders\\Transcript Archive`), so
they are independent of the archive writer's own report but NOT of that snapshot's provenance - if the snapshot was
wrong, both legs are. Its provenance is the backup task's run before the re-read (`backup-claude-sessions.log`; the
archive's RUNS.log shows no run between it and the re-read). (2) Leg 2 proves earlier bytes were not rewritten; it does
not, by itself, prove the APPENDED bytes hold no duplicate - leg 1 covers ids, not rendered text."""
import collections
import json
import os
import sys

HOME = os.path.expanduser("~")
ARCHIVE = os.path.join(HOME, ".claude", "transcript-archive")
BACKUP = "G:/My Drive/Claude Code Backup Folders/Transcript Archive"


def owners(base):
    own = collections.defaultdict(set)
    total = 0
    for dp, _d, fs in os.walk(os.path.join(base, ".state")):
        for f in fs:
            if f.endswith(".json"):
                st = json.load(open(os.path.join(dp, f), encoding="utf-8"))
                total += len(st["ids"])
                for i in st["ids"]:
                    own[i].add(os.path.basename(st["raw"]))
    return own, total


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    except (AttributeError, ValueError):
        pass
    arch = argv[argv.index("--archive") + 1] if "--archive" in argv else ARCHIVE
    bak = argv[argv.index("--backup") + 1] if "--backup" in argv else BACKUP
    now, total = owners(arch)
    pre, _t = owners(bak)
    m_now = {k for k, v in now.items() if len(v) > 1}
    m_pre = {k for k, v in pre.items() if len(v) > 1}
    print("LEG 1  archived ids across all states: %d | distinct: %d | in more than one state: %d (queue: ids among them: %d)"
          % (total, len(now), len(m_now), sum(1 for k in m_now if str(k).startswith("queue:"))))
    print("       same count in the backup's .state: %d | new since the backup: %d | gone since: %d"
          % (len(m_pre), len(m_now - m_pre), len(m_pre - m_now)))
    groups = collections.Counter(tuple(sorted(now[k])) for k in m_now)
    print("       attributed, every group (%d groups, %d ids):" % (len(groups), sum(groups.values())))
    for g, n in groups.most_common():
        print("        %5d  %s" % (n, " + ".join(x[:8] for x in g)))
    n = prefix = grew = missing = 0
    other = []
    for dp, _d, fs in os.walk(bak):
        if ".state" in dp:
            continue
        for f in fs:
            if not f.endswith(".md"):
                continue
            rel = os.path.relpath(os.path.join(dp, f), bak)
            n += 1
            cur_p = os.path.join(arch, rel)
            if not os.path.exists(cur_p):
                missing += 1
                other.append(("missing today", rel))
                continue
            old, cur = open(os.path.join(dp, f), "rb").read(), open(cur_p, "rb").read()
            if cur.startswith(old):
                prefix += 1
                grew += len(cur) > len(old)
            else:
                other.append(("rebuilt by design" if rel == "INDEX.md" else "NOT A PREFIX", rel))
    print("LEG 2  backed-up .md files (population = the BACKUP side): %d | exact byte prefix of today's: %d (grew %d) | "
          "rebuilt by design (INDEX.md): %d | missing today: %d | NOT a prefix: %d"
          % (n, prefix, grew, sum(1 for k, _r in other if k == "rebuilt by design"), missing,
             sum(1 for k, _r in other if k == "NOT A PREFIX")))
    for kind, rel in other:
        print("        %s: %s" % (kind, rel))
    bad = missing + sum(1 for k, _r in other if k == "NOT A PREFIX") + len(m_now - m_pre)
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
