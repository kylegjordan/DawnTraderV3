#!/usr/bin/env python3
"""B-TOKEN-WATCH-BIRTH-CAP C-2 snapshot producer tests."""

import datetime as dt
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import sys
import tempfile


PKG = Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location("export_birthcap_review", PKG / "tools" / "export_birthcap_review.py")
mod = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(mod)
ROOT = Path(tempfile.mkdtemp(prefix="tw-birthcap-review-"))
PROVE_USER = os.environ.get("TW_REVIEW_PROVE_USER")
if PROVE_USER:
    os.chmod(ROOT, 0o711)
PASS = FAIL = 0


def check(label, ok, detail=None):
    global PASS, FAIL
    if ok:
        PASS += 1
        print("PASS", label)
    else:
        FAIL += 1
        print("FAIL", label, detail)


def expect_refusal(label, fn):
    try:
        fn()
    except mod.SnapshotError:
        check(label, True)
    else:
        check(label, False, "verification accepted the mutation")


source = ROOT / "source"
review = ROOT / "review"
snapshot = review / "birthcap-obj2"
for rel in mod.BIRTH_RELS:
    path = source / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    day = path.stem
    path.write_text(json.dumps({"first_seen_at": day + "T12:00:00+00:00", "mint": day}) + "\n", encoding="utf-8")
switch = source / mod.SWITCH_REL
switch.parent.mkdir(parents=True, exist_ok=True)
switch_rows = [
    {"kind": "put", "ok": True, "requested": "on", "requested_at": "2026-11-16T23:00:00+00:00"},
    {"kind": "put", "ok": True, "requested": "off", "requested_at": "2026-11-17T01:00:00+00:00"},
    {"kind": "put", "ok": True, "requested": "on", "requested_at": "2026-11-23T23:00:00+00:00"},
]
switch.write_text("".join(json.dumps(row, sort_keys=True) + "\n" for row in switch_rows), encoding="utf-8")
captured = dt.datetime(2026, 11, 24, 0, 1, tzinfo=dt.timezone.utc)
repo_contract = {
    "ref": "1" * 40,
    "reference_artifact": mod.REFERENCE_REPO_PATH,
    "reference_sha256": "2" * 64,
    "analysis_code": mod.ANALYSIS_REPO_PATH + ":on_fraction",
    "analysis_sha256": "3" * 64,
    "snapshot_producer": mod.EXPORTER_REPO_PATH,
    "snapshot_producer_sha256": "4" * 64,
}
manifest, boundary = mod.build_snapshot(source, snapshot, repo_contract, captured_at=captured, prove_user=PROVE_USER)
check("C-2 snapshot population is seven closed birth files plus the unfiltered switch prefix",
      [e["copied"] for e in manifest["files"]] == [p.as_posix() for p in mod.EXPECTED_RELS], manifest["files"])
check("C-2 switch prefix starts before the window and every source row is captured",
      manifest["switch_prefix"]["rows"] == len(switch_rows)
      and manifest["switch_prefix"]["first_requested_at"] < mod._iso(mod.WINDOW_START), manifest["switch_prefix"])
check("C-2 every copied object has source path, copied path, bytes, SHA-256 and prefix binding",
      all(set(("source", "copied", "bytes", "sha256", "source_prefix_bytes", "source_prefix_sha256")) <= set(e)
          for e in manifest["files"]))
check("C-2 manifest pins the reference artifact and on-fraction analysis code to one repo ref",
      manifest["repo_contract"] == repo_contract, manifest["repo_contract"])
check("C-2 deploy boundary proof reads every object and refuses write, replace and delete",
      boundary is None if not PROVE_USER else boundary == "DEPLOY_BOUNDARY_PASS files=8", boundary)

birth_copy = snapshot / mod.BIRTH_RELS[0]
original_birth = birth_copy.read_bytes()
os.chmod(birth_copy, 0o644)
birth_copy.write_bytes(original_birth.replace(b"12:00", b"13:00", 1))
expect_refusal("C-2 one changed snapshot byte turns verification red",
               lambda: mod.verify_snapshot(source, snapshot, check_source=False))
birth_copy.write_bytes(original_birth)
os.chmod(birth_copy, 0o444)
mod.verify_snapshot(source, snapshot)

switch_copy = snapshot / mod.SWITCH_REL
original_switch = switch_copy.read_bytes()
manifest_path = snapshot / "MANIFEST.json"
original_manifest = manifest_path.read_bytes()
os.chmod(switch_copy, 0o644)
truncated_switch = b"".join(original_switch.splitlines(keepends=True)[:-1])
switch_copy.write_bytes(truncated_switch)
os.chmod(manifest_path, 0o644)
changed_manifest = json.loads(original_manifest)
changed_entry = changed_manifest["files"][-1]
changed_entry["bytes"] = len(truncated_switch)
changed_entry["sha256"] = hashlib.sha256(truncated_switch).hexdigest()
changed_entry["rows"] -= 1
changed_manifest["switch_prefix"]["bytes"] = len(truncated_switch)
changed_manifest["switch_prefix"]["rows"] -= 1
manifest_path.write_text(json.dumps(changed_manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8")
expect_refusal("C-2 one omitted switch row turns verification red",
               lambda: mod.verify_snapshot(source, snapshot))
switch_copy.write_bytes(original_switch)
os.chmod(switch_copy, 0o444)
manifest_path.write_bytes(original_manifest)
os.chmod(manifest_path, 0o444)
mod.verify_snapshot(source, snapshot)

external_manifest_sha = hashlib.sha256(original_manifest).hexdigest()
os.chmod(manifest_path, 0o644)
manifest_path.write_bytes(original_manifest + b" ")
mod.verify_snapshot(source, snapshot)
check("C-2 retained manifest receipt detects a self-consistent MANIFEST byte change",
      hashlib.sha256(manifest_path.read_bytes()).hexdigest() != external_manifest_sha)
expect_refusal("C-2 deletion refuses a MANIFEST changed after the external receipt",
               lambda: mod.delete_snapshot(snapshot, external_manifest_sha))
manifest_path.write_bytes(original_manifest)
os.chmod(manifest_path, 0o444)
mod.verify_snapshot(source, snapshot)

original_source_switch = switch.read_bytes()
switch.write_bytes(original_source_switch.replace(b'"kind": "put"', b'"kind": "get"', 1))
expect_refusal("C-2 one changed live-prefix byte turns verification red",
               lambda: mod.verify_snapshot(source, snapshot))
switch.write_bytes(original_source_switch)
mod.verify_snapshot(source, snapshot)

snapshot_hash = hashlib.sha256(switch_copy.read_bytes()).hexdigest()
with switch.open("a", encoding="utf-8") as fh:
    fh.write(json.dumps({"kind": "put", "ok": True, "requested": "off",
                         "requested_at": "2026-11-24T00:02:00+00:00"}) + "\n")
mod.verify_snapshot(source, snapshot)
check("C-2 a later live append does not change the fixed snapshot",
      hashlib.sha256(switch_copy.read_bytes()).hexdigest() == snapshot_hash
      and switch.stat().st_size > manifest["switch_prefix"]["bytes"])

manifest_sha = hashlib.sha256((snapshot / "MANIFEST.json").read_bytes()).hexdigest()
blocked_log = ROOT / "blocked-log"
blocked_log.mkdir()
try:
    mod.delete_snapshot(snapshot, manifest_sha, blocked_log)
except mod.SnapshotError:
    check("C-2 deletion evidence failure preserves snapshot",
          snapshot.exists() and (snapshot / "MANIFEST.json").exists())
else:
    check("C-2 deletion evidence failure preserves snapshot", False, "deletion unexpectedly succeeded")

delete_log = ROOT / "deletions.jsonl"
evidence = mod.delete_snapshot(snapshot, manifest_sha, delete_log)
delete_records = [json.loads(line) for line in delete_log.read_text(encoding="utf-8").splitlines()]
check("C-2 explicit deletion is bound to the manifest and proves absence",
      evidence["manifest_sha256"] == manifest_sha and not snapshot.exists() and evidence["postcondition_exists"] is False,
      evidence)
check("C-2 deletion has durable prepared and completed evidence",
      [row["phase"] for row in delete_records] == ["prepared", "deleted"]
      and delete_records[0]["postcondition_exists"] is True
      and delete_records[1]["postcondition_exists"] is False,
      delete_records)

shutil.rmtree(ROOT, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
