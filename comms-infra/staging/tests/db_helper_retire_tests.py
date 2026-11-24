#!/usr/bin/env python3
"""B-DB-HELPER-RETIRE exact-path remover tests; production files are never read or changed."""

import grp
import hashlib
import json
import os
import pwd
import shutil
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "dt-db-helper-retire")
START = "# ── CONSTANTS (the test harness substitutes only this block) ──"
END = "# ── END CONSTANTS ──"
REVIEWED_REF = "3261801a157a66e1fdf36eae69b66b86893786a8"
checks = 0


def check(value, message):
    global checks
    checks += 1
    if not value:
        raise AssertionError(message)


def sha256(path):
    value = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def fixture():
    work = tempfile.mkdtemp(prefix="dt-db-helper-retire-test-")
    target = os.path.join(work, "target")
    state = os.path.join(work, "state")
    manifest_path = os.path.join(work, "manifest.json")
    os.mkdir(target)
    rows = []
    for index, content in enumerate((b"alpha\n", b"beta\n", b"gamma\n"), 1):
        path = os.path.join(target, "helper-%d.sh" % index)
        with open(path, "wb") as fh:
            fh.write(content)
        os.chmod(path, 0o640)
        found = os.stat(path)
        rows.append({
            "path": path,
            "archive_path": "archive/helper-%d.sh.removed" % index,
            "sha256": sha256(path),
            "bytes": found.st_size,
            "owner": pwd.getpwuid(found.st_uid).pw_name,
            "group": grp.getgrgid(found.st_gid).gr_name,
            "mode": "0640",
            "mtime_utc": "test",
            "mtime_ns": str(found.st_mtime_ns),
            "disposition": "RETIRE",
            "source_batch": "B-DB-HELPER-RETIRE",
        })
    manifest = {"schema_version": 1, "batch": "B-DB-HELPER-RETIRE", "reviewed_ref": REVIEWED_REF, "files": rows}
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh)

    source = open(SRC, encoding="utf-8").read()
    before, rest = source.split(START, 1)
    _, after = rest.split(END, 1)
    constants = "\n".join([
        START,
        "MANIFEST = %r" % manifest_path,
        "STATE_DIR = %r" % state,
        "TARGET_DIR = %r" % target,
        "EXPECTED_COUNT = 3",
        "REVIEWED_REF = %r" % REVIEWED_REF,
        "ALLOWED_ACTORS = (\"codex-infra\",)",
        "REQUIRE_ROOT = False",
        END,
    ])
    tool = os.path.join(work, "dt-db-helper-retire")
    with open(tool, "w", encoding="utf-8") as fh:
        fh.write(before + constants + after)
    os.chmod(tool, 0o755)
    return work, tool, manifest_path, manifest


def run(tool, *args):
    return subprocess.run([tool, *args], text=True, capture_output=True, timeout=10)


work, tool, _, manifest = fixture()
try:
    result = run(tool, "--verify")
    check(result.returncode == 0 and "VERIFIED 3" in result.stdout, (result.returncode, result.stdout, result.stderr))
finally:
    shutil.rmtree(work)

work, tool, _, manifest = fixture()
try:
    with open(manifest["files"][1]["path"], "ab") as fh:
        fh.write(b"drift")
    result = run(tool, "--remove", "--by", "codex-infra")
    check(result.returncode == 2 and "drifted" in result.stderr, result.stderr)
    check(all(os.path.exists(row["path"]) for row in manifest["files"]), "preflight drift removed a file")
finally:
    shutil.rmtree(work)

work, tool, manifest_path, manifest = fixture()
try:
    manifest["files"][1]["path"] = manifest["files"][0]["path"]
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh)
    result = run(tool, "--verify")
    check(result.returncode == 2 and "duplicated" in result.stderr, result.stderr)
finally:
    shutil.rmtree(work)

work, tool, manifest_path, manifest = fixture()
try:
    manifest["files"][0]["path"] = os.path.join(work, "outside.sh")
    with open(manifest_path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh)
    result = run(tool, "--verify")
    check(result.returncode == 2 and "outside" in result.stderr, result.stderr)
finally:
    shutil.rmtree(work)

work, tool, _, manifest = fixture()
try:
    first = manifest["files"][0]["path"]
    os.unlink(first)
    os.symlink(manifest["files"][1]["path"], first)
    result = run(tool, "--verify")
    check(result.returncode == 2 and "cannot be opened" in result.stderr, result.stderr)
finally:
    shutil.rmtree(work)

work, tool, _, manifest = fixture()
try:
    refused = run(tool, "--remove", "--by", "nobody")
    check(refused.returncode == 2 and "allowed actor" in refused.stderr, refused.stderr)
    result = run(tool, "--remove", "--by", "codex-infra")
    check(result.returncode == 0 and "REMOVED 3" in result.stdout, (result.stdout, result.stderr))
    check(not any(os.path.exists(row["path"]) for row in manifest["files"]), "reviewed files remain after removal")
    status = run(tool, "--status")
    receipt = json.loads(status.stdout)
    check(status.returncode == 0 and receipt["removed_count"] == 3 and receipt["actor"] == "codex-infra", status.stdout)
finally:
    shutil.rmtree(work)

print("dt-db-helper-retire: %d checks passed" % checks)
