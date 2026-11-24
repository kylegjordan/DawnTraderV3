#!/usr/bin/env python3
"""Build and later remove the fixed B-TOKEN-WATCH-BIRTH-CAP OBJ-2/OBJ-8 review snapshot.

Production use (root only):

    python3 /opt/token-watch/tools/export_birthcap_review.py
    python3 /opt/token-watch/tools/export_birthcap_review.py --delete <manifest-sha256>

The exporter never changes an ACL or mode under /var/lib/token-watch.  It copies the seven
closed census days and one complete byte prefix of the switch log into a root-owned,
deploy-readable but deploy-immutable directory.  The manifest binds every copied byte to
its source prefix.  A later append to the live switch log therefore does not change the
review object and does not invalidate the captured prefix.
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys


SOURCE_ROOT = Path("/var/lib/token-watch")
REVIEW_PARENT = Path("/srv/token-watch-review")
SNAPSHOT = REVIEW_PARENT / "birthcap-obj2-2026-11-17_2026-11-23"
DELETE_LOG = Path("/var/log/token-watch-review-deletions.jsonl")
INSTALLED_RECORD = Path("/opt/token-watch/INSTALLED")
REPO = Path("/home/deploy/dawntrader")
REFERENCE_REPO_PATH = "Claude Comms and Packages/Scope Files/B_TOKEN_WATCH_BIRTH_CAP_OBJ2_REFERENCE.json"
ANALYSIS_REPO_PATH = "token-watch/birthcap.py"
EXPORTER_REPO_PATH = "token-watch/tools/export_birthcap_review.py"
WINDOW_START = dt.datetime(2026, 11, 17, tzinfo=dt.timezone.utc)
WINDOW_END = dt.datetime(2026, 11, 24, tzinfo=dt.timezone.utc)
BIRTH_RELS = tuple(Path("births") / (WINDOW_START.date() + dt.timedelta(days=i)).isoformat() for i in range(7))
BIRTH_RELS = tuple(p.with_suffix(".jsonl") for p in BIRTH_RELS)
SWITCH_REL = Path("provenance/switches.jsonl")
EXPECTED_RELS = BIRTH_RELS + (SWITCH_REL,)


def _euid() -> int:
    return os.geteuid() if hasattr(os, "geteuid") else -1


class SnapshotError(RuntimeError):
    pass


def _sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _iso(value: dt.datetime) -> str:
    return value.astimezone(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def _read_jsonl(path: Path) -> tuple[bytes, list[dict]]:
    try:
        meta = path.lstat()
    except OSError as exc:
        raise SnapshotError("cannot stat %s: %s" % (path, exc)) from exc
    if not stat.S_ISREG(meta.st_mode) or path.is_symlink():
        raise SnapshotError("source is not a non-symlink regular file: %s" % path)
    data = path.read_bytes()
    if not data or not data.endswith(b"\n"):
        raise SnapshotError("JSONL is empty or lacks its final newline: %s" % path)
    rows = []
    for number, raw in enumerate(data.splitlines(), 1):
        if not raw:
            raise SnapshotError("blank JSONL row at %s:%d" % (path, number))
        try:
            row = json.loads(raw)
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise SnapshotError("invalid JSONL row at %s:%d: %s" % (path, number, exc)) from exc
        if not isinstance(row, dict):
            raise SnapshotError("JSONL row is not an object at %s:%d" % (path, number))
        rows.append(row)
    return data, rows


def _source_prefix(path: Path, size: int) -> bytes:
    with path.open("rb") as fh:
        data = fh.read(size)
    if len(data) != size:
        raise SnapshotError("source shrank below its captured prefix: %s" % path)
    return data


def _entry(source_root: Path, rel: Path, data: bytes, rows: list[dict], allow_growth: bool) -> dict:
    source = source_root / rel
    return {
        "source": str(source),
        "copied": rel.as_posix(),
        "bytes": len(data),
        "sha256": _sha(data),
        "rows": len(rows),
        "source_prefix_bytes": len(data),
        "source_prefix_sha256": _sha(data),
        "source_may_grow_after_capture": allow_growth,
    }


def _switch_times(rows: list[dict]) -> tuple[str, str]:
    times = []
    for number, row in enumerate(rows, 1):
        value = row.get("requested_at")
        if not isinstance(value, str):
            raise SnapshotError("switch row %d has no string requested_at" % number)
        try:
            parsed = dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError as exc:
            raise SnapshotError("switch row %d has invalid requested_at" % number) from exc
        if parsed.tzinfo is None:
            raise SnapshotError("switch row %d requested_at has no timezone" % number)
        times.append(parsed.astimezone(dt.timezone.utc))
    if times != sorted(times):
        raise SnapshotError("switch log requested_at values are not monotone")
    if not times or times[0] >= WINDOW_START:
        raise SnapshotError("switch prefix has no earlier row to establish the state at the first day boundary")
    return _iso(times[0]), _iso(times[-1])


def _repo_blob(ref: str, path: str) -> bytes:
    result = subprocess.run(
        ["runuser", "-u", "deploy", "--", "git", "-C", str(REPO), "cat-file", "blob", "%s:%s" % (ref, path)],
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise SnapshotError("cannot read repo-pinned %s at %s: %s" %
                            (path, ref, result.stderr.decode(errors="replace").splitlines()[:1]))
    return result.stdout


def live_repo_contract() -> dict:
    try:
        installed = json.loads(INSTALLED_RECORD.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SnapshotError("cannot read the reviewed install record: %s" % exc) from exc
    ref = installed.get("sha")
    if not isinstance(ref, str) or len(ref) != 40 or any(c not in "0123456789abcdef" for c in ref):
        raise SnapshotError("the reviewed install record has no full lowercase commit ref")
    files = installed.get("files") or {}
    blobs = {
        REFERENCE_REPO_PATH: _repo_blob(ref, REFERENCE_REPO_PATH),
        ANALYSIS_REPO_PATH: _repo_blob(ref, ANALYSIS_REPO_PATH),
        EXPORTER_REPO_PATH: _repo_blob(ref, EXPORTER_REPO_PATH),
    }
    for repo_path, live_path, record_key in (
        (ANALYSIS_REPO_PATH, Path("/opt/token-watch/birthcap.py"), "birthcap.py"),
        (EXPORTER_REPO_PATH, Path("/opt/token-watch/tools/export_birthcap_review.py"),
         "tools/export_birthcap_review.py"),
    ):
        live_hash = _sha(live_path.read_bytes())
        if live_hash != _sha(blobs[repo_path]) or files.get(record_key) != live_hash:
            raise SnapshotError("live %s is not the repo-pinned file recorded by INSTALLED" % live_path)
    return {
        "ref": ref,
        "reference_artifact": REFERENCE_REPO_PATH,
        "reference_sha256": _sha(blobs[REFERENCE_REPO_PATH]),
        "analysis_code": "%s:on_fraction" % ANALYSIS_REPO_PATH,
        "analysis_sha256": _sha(blobs[ANALYSIS_REPO_PATH]),
        "snapshot_producer": EXPORTER_REPO_PATH,
        "snapshot_producer_sha256": _sha(blobs[EXPORTER_REPO_PATH]),
    }


def verify_snapshot(source_root: Path, snapshot: Path, check_source: bool = True) -> dict:
    manifest_path = snapshot / "MANIFEST.json"
    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise SnapshotError("cannot read snapshot manifest: %s" % exc) from exc
    entries = manifest.get("files")
    if not isinstance(entries, list):
        raise SnapshotError("manifest files is not a list")
    contract = manifest.get("repo_contract") or {}
    ref = contract.get("ref")
    if (not isinstance(ref, str) or len(ref) != 40
            or any(c not in "0123456789abcdef" for c in ref)
            or contract.get("reference_artifact") != REFERENCE_REPO_PATH
            or contract.get("analysis_code") != "%s:on_fraction" % ANALYSIS_REPO_PATH):
        raise SnapshotError("manifest has no valid repo-pinned reference/analysis contract")
    for key in ("reference_sha256", "analysis_sha256", "snapshot_producer_sha256"):
        value = contract.get(key)
        if not isinstance(value, str) or len(value) != 64 or any(c not in "0123456789abcdef" for c in value):
            raise SnapshotError("manifest repo contract has invalid %s" % key)
    copied = [entry.get("copied") for entry in entries]
    expected = [rel.as_posix() for rel in EXPECTED_RELS]
    if copied != expected:
        raise SnapshotError("manifest population differs: got %r expected %r" % (copied, expected))
    actual_files = sorted(
        p.relative_to(snapshot).as_posix() for p in snapshot.rglob("*") if p.is_file()
    )
    if actual_files != sorted(expected + ["MANIFEST.json"]):
        raise SnapshotError("snapshot file population differs: %r" % actual_files)
    switch_meta = manifest.get("switch_prefix") or {}
    switch_entry = entries[-1]
    if (switch_meta.get("bytes"), switch_meta.get("rows")) != (switch_entry.get("bytes"), switch_entry.get("rows")):
        raise SnapshotError("switch prefix summary differs from its file entry")
    for entry in entries:
        rel = Path(entry["copied"])
        if rel.is_absolute() or ".." in rel.parts:
            raise SnapshotError("unsafe copied path in manifest: %s" % rel)
        copied_data, rows = _read_jsonl(snapshot / rel)
        if len(copied_data) != entry.get("bytes") or _sha(copied_data) != entry.get("sha256"):
            raise SnapshotError("copied bytes do not match manifest: %s" % rel)
        if len(rows) != entry.get("rows"):
            raise SnapshotError("copied row count does not match manifest: %s" % rel)
        if not check_source:
            continue
        source = source_root / rel
        prefix_size = entry.get("source_prefix_bytes")
        if not isinstance(prefix_size, int) or prefix_size < 1:
            raise SnapshotError("bad source prefix length for %s" % rel)
        source_prefix = _source_prefix(source, prefix_size)
        if _sha(source_prefix) != entry.get("source_prefix_sha256") or source_prefix != copied_data:
            raise SnapshotError("source prefix differs from copied bytes: %s" % rel)
        if not entry.get("source_may_grow_after_capture") and source.stat().st_size != prefix_size:
            raise SnapshotError("closed source changed size after capture: %s" % rel)
    return manifest


def _set_read_only(tree: Path) -> None:
    for path in tree.rglob("*"):
        if path.is_file():
            os.chmod(path, 0o444)
            if _euid() == 0:
                os.chown(path, 0, 0)
    for path in sorted((p for p in tree.rglob("*") if p.is_dir()), key=lambda p: len(p.parts), reverse=True):
        os.chmod(path, 0o555)
        if _euid() == 0:
            os.chown(path, 0, 0)
    os.chmod(tree, 0o555)
    if _euid() == 0:
        os.chown(tree, 0, 0)


_DEPLOY_PROOF = r"""
import json, os, pathlib, sys
root = pathlib.Path(sys.argv[1])
manifest = json.loads((root / "MANIFEST.json").read_text())
paths = [root / e["copied"] for e in manifest["files"]]
for path in paths + [root / "MANIFEST.json"]:
    with path.open("rb") as fh:
        fh.read(1)
    try:
        fd = os.open(path, os.O_WRONLY | os.O_APPEND)
    except PermissionError:
        pass
    else:
        os.close(fd)
        raise SystemExit("WRITABLE:" + str(path))
probe = root / ".deploy-replace-probe"
try:
    probe.write_bytes(b"x")
except PermissionError:
    pass
else:
    probe.unlink(missing_ok=True)
    raise SystemExit("REPLACE-PARENT-WRITABLE")
try:
    os.unlink(root / "MANIFEST.json")
except PermissionError:
    pass
else:
    raise SystemExit("DELETABLE:MANIFEST.json")
print("DEPLOY_BOUNDARY_PASS files=%d" % len(paths))
"""


def prove_deploy_boundary(snapshot: Path, user: str = "deploy") -> str:
    result = subprocess.run(
        ["runuser", "-u", user, "--", "python3", "-c", _DEPLOY_PROOF, str(snapshot)],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise SnapshotError("deploy boundary proof failed: %s" % ((result.stderr or result.stdout).strip()))
    return result.stdout.strip()


def _remove_tree(tree: Path) -> None:
    if not tree.exists():
        return
    for path in tree.rglob("*"):
        try:
            os.chmod(path, 0o700 if path.is_dir() else 0o600)
        except OSError:
            pass
    try:
        os.chmod(tree, 0o700)
    except OSError:
        pass
    shutil.rmtree(tree, ignore_errors=True)


def build_snapshot(source_root: Path, snapshot: Path, repo_contract: dict,
                   captured_at: dt.datetime | None = None,
                   prove_user: str | None = None) -> tuple[dict, str | None]:
    captured_at = captured_at or dt.datetime.now(dt.timezone.utc)
    if captured_at.tzinfo is None or captured_at.astimezone(dt.timezone.utc) < WINDOW_END:
        raise SnapshotError("capture time precedes the closed observation window")
    if snapshot.exists() or snapshot.is_symlink():
        raise SnapshotError("snapshot already exists: %s" % snapshot)
    parent = snapshot.parent
    parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    if _euid() == 0:
        pm = parent.stat()
        if pm.st_uid != 0 or pm.st_mode & 0o022:
            raise SnapshotError("review parent must be root-owned and not group/world-writable: %s" % parent)
    temp = parent / (".%s.tmp.%d" % (snapshot.name, os.getpid()))
    if temp.exists():
        raise SnapshotError("temporary snapshot path already exists: %s" % temp)
    temp.mkdir(mode=0o700)
    exposed = False
    try:
        entries = []
        switch_rows = []
        for rel in EXPECTED_RELS:
            data, rows = _read_jsonl(source_root / rel)
            if rel == SWITCH_REL:
                switch_rows = rows
            destination = temp / rel
            destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
            with destination.open("xb") as fh:
                fh.write(data)
                fh.flush()
                os.fsync(fh.fileno())
            entries.append(_entry(source_root, rel, data, rows, rel == SWITCH_REL))
        switch_first, switch_last = _switch_times(switch_rows)
        manifest = {
            "schema": "birthcap-review-snapshot-v1",
            "captured_at": _iso(captured_at),
            "observation_window": {"start": _iso(WINDOW_START), "end_exclusive": _iso(WINDOW_END)},
            "switch_prefix": {
                "bytes": entries[-1]["source_prefix_bytes"],
                "rows": entries[-1]["rows"],
                "first_requested_at": switch_first,
                "last_requested_at": switch_last,
                "rule": "complete source prefix; no switch row is hand-filtered",
            },
            "repo_contract": repo_contract,
            "files": entries,
        }
        manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode()
        with (temp / "MANIFEST.json").open("xb") as fh:
            fh.write(manifest_bytes)
            fh.flush()
            os.fsync(fh.fileno())
        verify_snapshot(source_root, temp)
        _set_read_only(temp)
        boundary = prove_deploy_boundary(temp, prove_user) if prove_user else None
        temp.replace(snapshot)
        exposed = True
        verify_snapshot(source_root, snapshot)
        if prove_user:
            boundary = prove_deploy_boundary(snapshot, prove_user)
        return manifest, boundary
    except Exception:
        _remove_tree(snapshot if exposed else temp)
        raise


def _append_delete_record(log_path: Path, record: dict) -> None:
    try:
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, sort_keys=True) + "\n")
            fh.flush()
            os.fsync(fh.fileno())
        os.chmod(log_path, 0o600)
        if os.name != "nt":
            flags = os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
            parent_fd = os.open(log_path.parent, flags)
            try:
                os.fsync(parent_fd)
            finally:
                os.close(parent_fd)
    except OSError as exc:
        raise SnapshotError("deletion evidence could not be made durable: %s" % exc) from exc


def delete_snapshot(snapshot: Path, expected_manifest_sha: str, log_path: Path | None = None) -> dict:
    if len(expected_manifest_sha) != 64 or any(c not in "0123456789abcdef" for c in expected_manifest_sha):
        raise SnapshotError("--delete requires the manifest's full lowercase SHA-256")
    if not snapshot.is_dir() or snapshot.is_symlink():
        raise SnapshotError("snapshot is missing or is not a real directory: %s" % snapshot)
    manifest_path = snapshot / "MANIFEST.json"
    actual = _sha(manifest_path.read_bytes())
    if actual != expected_manifest_sha:
        raise SnapshotError("manifest SHA-256 differs; refusing deletion")
    verify_snapshot(SOURCE_ROOT, snapshot, check_source=False)
    prepared = {
        "phase": "prepared",
        "prepared_at": _iso(dt.datetime.now(dt.timezone.utc)),
        "snapshot": str(snapshot),
        "manifest_sha256": actual,
        "postcondition_exists": True,
    }
    if log_path:
        _append_delete_record(log_path, prepared)
    for path in snapshot.rglob("*"):
        os.chmod(path, 0o700 if path.is_dir() else 0o600)
    os.chmod(snapshot, 0o700)
    shutil.rmtree(snapshot)
    if snapshot.exists():
        raise SnapshotError("snapshot still exists after deletion")
    evidence = {
        "phase": "deleted",
        "deleted_at": _iso(dt.datetime.now(dt.timezone.utc)),
        "snapshot": str(snapshot),
        "manifest_sha256": actual,
        "postcondition_exists": False,
    }
    if log_path:
        _append_delete_record(log_path, evidence)
    return evidence


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--delete", metavar="MANIFEST_SHA256")
    args = parser.parse_args(argv)
    if _euid() != 0:
        raise SnapshotError("run as root")
    if args.delete:
        print(json.dumps(delete_snapshot(SNAPSHOT, args.delete, DELETE_LOG), sort_keys=True))
        return 0
    manifest, boundary = build_snapshot(SOURCE_ROOT, SNAPSHOT, live_repo_contract(), prove_user="deploy")
    manifest_sha = _sha((SNAPSHOT / "MANIFEST.json").read_bytes())
    print(json.dumps({
        "snapshot": str(SNAPSHOT),
        "manifest_sha256": manifest_sha,
        "files": len(manifest["files"]),
        "switch_prefix_rows": manifest["switch_prefix"]["rows"],
        "deploy_boundary": boundary,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SnapshotError as exc:
        print("REFUSED: %s" % exc, file=sys.stderr)
        raise SystemExit(2)
