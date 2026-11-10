"""Read-only Step-7 population census, captured for Coltrane's Step-8 review."""
import json
import os
import sys

BIN = r"C:\Users\kyleg\.claude\transcript-archive-bin"
ROOT = r"C:\Users\kyleg\.claude\transcript-archive"
PROJECTS = r"C:\Users\kyleg\.claude\projects"
SCHEDULED_END = 1794274262.0  # 2026-11-10T01:31:02Z
sys.path.insert(0, BIN)

import dt_archive as archive


def fail_walk(error):
    raise error


gate = archive.Gate(ROOT, dry=True)
raw_rows = archive.raw_files(PROJECTS, gate=gate)
raw_paths = {archive.identity(row[2]) for row in raw_rows}
raw_at_end = {path for path in raw_paths if os.stat(path).st_ctime <= SCHEDULED_END}
raw_after_end = raw_paths - raw_at_end

state_paths = []
for directory, _dirs, names in os.walk(os.path.join(ROOT, ".state"), onerror=fail_walk):
    for name in names:
        if name.endswith(".json"):
            state_paths.append(os.path.join(directory, name))

state_raw = set()
state_archives = set()
short_archives = []
empty_lengths = []
for path in state_paths:
    with open(path, encoding="utf-8") as handle:
        state = json.load(handle)
    state_raw.add(archive.identity(state["raw"]))
    lengths = state.get("lengths") or {}
    if not lengths:
        empty_lengths.append(path)
    for relative, committed in lengths.items():
        absolute = os.path.join(ROOT, relative)
        state_archives.add(archive.identity(absolute))
        actual = os.path.getsize(absolute)
        if actual < committed:
            short_archives.append((relative, actual, committed))

actual_archives = set()
for alias in sorted(set(archive.SLUG_ALIAS.values()) | set(archive.GATED.values())):
    base = os.path.join(ROOT, alias)
    if not os.path.isdir(base):
        continue
    for directory, _dirs, names in os.walk(base, onerror=fail_walk):
        for name in names:
            if name.endswith(".md"):
                actual_archives.add(archive.identity(os.path.join(directory, name)))

empty_workflow_journals = 0
for path in empty_lengths:
    with open(path, encoding="utf-8") as handle:
        state = json.load(handle)
    raw = state.get("raw") or ""
    if "\\subagents\\workflows\\" in raw and raw.endswith("\\journal.jsonl") and not (state.get("ids") or []):
        empty_workflow_journals += 1

print("cutoff UTC: 2026-11-10T01:31:02Z")
print("raw rows now: %d" % len(raw_rows))
print("raw identities now: %d" % len(raw_paths))
print("raw identities created by cutoff: %d" % len(raw_at_end))
print("raw identities created after cutoff: %d" % len(raw_after_end))
print("state files: %d" % len(state_paths))
print("state raw identities: %d" % len(state_raw))
print("archive paths committed by state: %d" % len(state_archives))
print("archive markdown files on disk: %d" % len(actual_archives))
print("cutoff raw without state: %d" % len(raw_at_end - state_raw))
print("state without cutoff raw: %d" % len(state_raw - raw_at_end))
print("committed archive missing on disk: %d" % len(state_archives - actual_archives))
print("archive file with no state owner: %d" % len(actual_archives - state_archives))
print("states with no committed archive path: %d" % len(empty_lengths))
print("empty states that are workflow journals with zero archived ids: %d of %d" %
      (empty_workflow_journals, len(empty_lengths)))
print("archive files shorter than committed length: %d" % len(short_archives))
for raw in sorted(raw_after_end):
    stat = os.stat(raw)
    print("post-cutoff raw: %s | size=%d | ctime=%.6f | mtime=%.6f" %
          (raw, stat.st_size, stat.st_ctime, stat.st_mtime))

if raw_at_end != state_raw or state_archives != actual_archives or short_archives or \
        empty_workflow_journals != len(empty_lengths):
    raise SystemExit(1)
