"""
token-watch — the off-box cold leg. (B-TOKEN-WATCH-STORAGE OBJ-1, P1)

★ WHY. The approved B-TOKEN-WATCH scope §4 says the bulky raw stores go
  "daily .jsonl.gz -> warm -> cold" with "export -> upload -> download-verified
  checksum -> only then remove above". `tier.py` built the compress half and
  wrote the result to `cold/` ON THE SAME DISK; the upload half was never
  built, so by 2026-11-04 `cold/` held 6,084,884,329 B on the disk the live
  trading app writes to (#1132). This module is the missing half.

WHAT ONE RUN DOES, per `cold/*.gz` not modified in the last hour, oldest first:
  1. take an upload URL (before any local work, so a dead B2 costs one call);
  2. decompress the file to EOF — ⛔ `tier.py:178-180` only reads the first
     byte, so a truncated archive passes it, and by then the hot copy is gone.
     Uploading without this would faithfully archive the truncation. The EOF
     read IS the verification; the uncompressed byte count it produces is a
     forward record for the manifest, not a comparison (nothing upstream
     records the original size);
  3. upload with `X-Bz-Content-Sha1`, so B2 itself rejects a corrupted body;
  4. download it back BY FILE ID (on a keep-all-versions bucket a name can
     resolve to a different version than the one just written) and compare
     sha256;
  5. append a manifest line (fsynced) to `offbox/cold-offbox-manifest.jsonl`;
  6. only then unlink the local file.
  After the loop, if anything moved, the manifest itself is uploaded under
  `token-watch/manifest/`. Fallback census if the manifest is ever lost:
  `b2_list_file_names` (or `b2_list_file_versions`, see the README) under
  `token-watch/cold/`, with each object's sha1.

ERRORS ARE CLASSIFIED (Langston, Step 2 condition 4):
  • AUTH / TRANSPORT (401, 403, connection failures, timeouts, a 5xx or 429
    that survives one retry) → ABORT the whole run at once. A revoked key or a
    dead endpoint must not cost 86 full decompressions on the trading box.
  • PER-FILE INTEGRITY (a decompress that fails before EOF, a sha mismatch on
    the read-back, a 400 that rejects the body) → keep THAT file, log ERROR
    naming it, carry on with the next. Exit 1 at the end.

⛔ THE KEY MUST BE THE RESTRICTED ONE, AND THIS REFUSES ANY OTHER. It must be
   scoped to the `dt-archive-cold` bucket and the `token-watch/` prefix, and must
   NOT carry `deleteFiles`. The app's account-wide key fails all three checks,
   so it can never be used here by mistake.

⛔ NO LOCK WITH `tier.py`. Its `periodic_lock` lives in `state/`, which this
   job's user must not reach. The two are kept apart instead by the one-hour
   guard (`tier.STILL_WARM_SECONDS`; `tier.py` writes each `.gz` in place, so
   a file still being written is under an hour old) and the 05:30 schedule —
   and step 2 catches the one case the guard misses, a stalled write.
   ⚠️ CONSEQUENCE: `cold/` is never empty in steady state. The 05:30 run
   always finds that morning's file at about 55 minutes old and leaves it for
   the next day.

★ WHY THIS LIVES IN ops/ AND NOT BESIDE THE COLLECTOR. `tests/test_pipeline.py`
  holds the collector to "exactly ONE module makes outbound calls, and it is
  providers.py, where the budget gate and the pacer are". That rule protects the
  paid provider budget. This module calls only Backblaze B2, which is not a data
  provider and spends no provider credit, so it does not belong under that rule —
  and an allow-list inside the collector would weaken the rule for every future
  module. So the boundary is a directory: ops/ (this module, store_watch,
  unit_failed, alert_mint) may not import the provider or budget modules, and
  the collector may not import ops/ — both asserted in tests/test_ops_boundary.py.
"""

from __future__ import annotations

import os as _os
import sys as _sys
# The collector modules this reads (config, tier) live one directory up from ops/.
_sys.path.insert(0, _os.path.dirname(_os.path.dirname(_os.path.abspath(__file__))))

import argparse
import base64
import gzip
import hashlib
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

from config import COLD_DIR, ROOT
from tier import STILL_WARM_SECONDS

LOG = logging.getLogger("token-watch.cold-offbox")
UTC = timezone.utc

BUCKET_NAME = "dt-archive-cold"
KEY_PREFIX = "token-watch/"
COLD_PREFIX = KEY_PREFIX + "cold/"
MANIFEST_OBJECT = KEY_PREFIX + "manifest/cold-offbox-manifest.jsonl"
OFFBOX_DIR = os.path.join(ROOT, "offbox")
MANIFEST_PATH = os.path.join(OFFBOX_DIR, "cold-offbox-manifest.jsonl")
AUTH_URL = os.environ.get("TOKEN_WATCH_B2_AUTH_URL",
                          "https://api.backblazeb2.com/b2api/v3/b2_authorize_account")
CREDENTIAL_NAME = "b2-cold"
CHUNK = 1 << 20
TIMEOUT = 300


class Abort(Exception):
    """Auth or transport failure: stop the whole run now."""


class FileFailed(Exception):
    """This file's integrity check failed: keep it, carry on with the next."""


# ── the key ──────────────────────────────────────────────────────────────────

def read_key() -> tuple[str, str]:
    """`keyId:applicationKey` from the systemd credential. Never logged."""
    cdir = os.environ.get("CREDENTIALS_DIRECTORY")
    if not cdir:
        raise Abort("no CREDENTIALS_DIRECTORY: the unit must pass the key with LoadCredential=")
    with open(os.path.join(cdir, CREDENTIAL_NAME), encoding="utf-8") as fh:
        raw = fh.read().strip()
    key_id, sep, app_key = raw.partition(":")
    if not sep or not key_id or not app_key:
        raise Abort("the credential is not in keyId:applicationKey form")
    return key_id, app_key


# ── HTTP ─────────────────────────────────────────────────────────────────────

def _transient(exc: Exception) -> bool:
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code >= 500 or exc.code in (408, 429)
    return isinstance(exc, (urllib.error.URLError, TimeoutError, ConnectionError, OSError))


def _call(make_request, what: str):
    """Run `make_request()` (which opens and returns a response), retrying ONCE on a transient
    failure. 401/403 and any failure that survives the retry are Abort; other HTTP errors are raised."""
    for attempt in (1, 2):
        try:
            return make_request()
        except urllib.error.HTTPError as exc:
            if exc.code in (401, 403):
                raise Abort("%s refused (%s): the key is wrong, revoked or not allowed this" % (what, exc.code))
            if _transient(exc) and attempt == 1:
                LOG.warning("%s: HTTP %s, retrying once", what, exc.code)
                time.sleep(2)
                continue
            if _transient(exc):
                raise Abort("%s failed twice (HTTP %s)" % (what, exc.code))
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as exc:
            if attempt == 1:
                LOG.warning("%s: %s, retrying once", what, exc)
                time.sleep(2)
                continue
            raise Abort("%s failed twice: %s" % (what, exc))
    raise Abort("%s: unreachable" % what)      # pragma: no cover


def _json(url: str, *, token: str | None = None, body: dict | None = None, basic: str | None = None) -> dict:
    headers = {}
    if token:
        headers["Authorization"] = token
    if basic:
        headers["Authorization"] = "Basic " + basic
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    def go():
        req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            return json.loads(resp.read().decode("utf-8"))
    return _call(go, url.rsplit("/", 1)[-1])


class Session:
    def __init__(self, api_url: str, download_url: str, token: str, bucket_id: str):
        self.api_url, self.download_url, self.token, self.bucket_id = api_url, download_url, token, bucket_id


def authorize(key_id: str, app_key: str, auth_url: str = AUTH_URL) -> Session:
    basic = base64.b64encode(("%s:%s" % (key_id, app_key)).encode("utf-8")).decode("ascii")
    data = _json(auth_url, basic=basic)
    api = data["apiInfo"]["storageApi"]
    allowed = api.get("allowed") or {}
    caps = set(api.get("capabilities") or allowed.get("capabilities") or [])
    buckets = allowed.get("buckets") or []
    match = [b for b in buckets if b.get("name") == BUCKET_NAME]
    # ⛔ REFUSE ANY KEY THAT IS NOT THE RESTRICTED ONE (see the module header).
    if len(buckets) != 1 or not match:
        raise Abort("the key is not restricted to the %s bucket alone (allowed buckets: %r)"
                    % (BUCKET_NAME, [b.get("name") for b in buckets]))
    if allowed.get("namePrefix") != KEY_PREFIX:
        raise Abort("the key is not restricted to the %r prefix (it has %r)" % (KEY_PREFIX, allowed.get("namePrefix")))
    if "deleteFiles" in caps:
        raise Abort("the key carries deleteFiles; this job must run with a key that cannot delete")
    return Session(api["apiUrl"], api["downloadUrl"], data["authorizationToken"], match[0]["id"])


def get_upload_url(s: Session) -> tuple[str, str]:
    d = _json(s.api_url + "/b2api/v3/b2_get_upload_url", token=s.token, body={"bucketId": s.bucket_id})
    return d["uploadUrl"], d["authorizationToken"]


def upload(path: str, name: str, sha1: str, size: int, upload_url: str, upload_token: str) -> dict:
    headers = {
        "Authorization": upload_token,
        "X-Bz-File-Name": urllib.parse.quote(name, safe="/"),
        "Content-Type": "application/gzip" if name.endswith(".gz") else "application/x-ndjson",
        "Content-Length": str(size),
        "X-Bz-Content-Sha1": sha1,
    }

    def go():
        with open(path, "rb") as fh:
            req = urllib.request.Request(upload_url, data=fh, headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return json.loads(resp.read().decode("utf-8"))
    try:
        return _call(go, "b2_upload_file %s" % name)
    except urllib.error.HTTPError as exc:     # 4xx other than 401/403: the body was rejected
        raise FileFailed("upload of %s rejected: HTTP %s %s" % (name, exc.code, exc.read()[:300]))


def download_sha256(s: Session, file_id: str) -> tuple[str, int]:
    url = s.download_url + "/b2api/v3/b2_download_file_by_id?fileId=" + urllib.parse.quote(file_id)

    def go():
        req = urllib.request.Request(url, headers={"Authorization": s.token})
        h, n = hashlib.sha256(), 0
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            while True:
                block = resp.read(CHUNK)
                if not block:
                    break
                h.update(block)
                n += len(block)
        return h.hexdigest(), n
    try:
        return _call(go, "b2_download_file_by_id")
    except urllib.error.HTTPError as exc:
        raise FileFailed("read-back of file id %s failed: HTTP %s" % (file_id, exc.code))


# ── the local side ───────────────────────────────────────────────────────────

def decompressed_size(path: str) -> int:
    """Read the whole archive to EOF. A truncated or corrupt deflate stream raises here."""
    n = 0
    try:
        with gzip.open(path, "rb") as fh:
            while True:
                block = fh.read(CHUNK)
                if not block:
                    break
                n += len(block)
    except (EOFError, OSError, gzip.BadGzipFile, ValueError) as exc:
        raise FileFailed("%s does not decompress to EOF: %s" % (os.path.basename(path), exc))
    return n


def file_hashes(path: str) -> tuple[str, str, int]:
    h256, h1, n = hashlib.sha256(), hashlib.sha1(), 0
    with open(path, "rb") as fh:
        while True:
            block = fh.read(CHUNK)
            if not block:
                break
            h256.update(block)
            h1.update(block)
            n += len(block)
    return h256.hexdigest(), h1.hexdigest(), n


def candidates(cold_dir: str, now: float) -> list[str]:
    out = []
    for name in os.listdir(cold_dir):
        path = os.path.join(cold_dir, name)
        if not name.endswith(".gz") or not os.path.isfile(path):
            continue
        if now - os.path.getmtime(path) < STILL_WARM_SECONDS:
            LOG.info("skipping %s: modified under %ds ago (it may still be being written)", name, STILL_WARM_SECONDS)
            continue
        out.append(path)
    return sorted(out, key=os.path.getmtime)


def append_manifest(record: dict, manifest_path: str) -> None:
    os.makedirs(os.path.dirname(manifest_path), exist_ok=True)
    with open(manifest_path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, sort_keys=True) + "\n")
        fh.flush()
        os.fsync(fh.fileno())


def _fsync_dir(path: str) -> None:
    """Make the unlink durable. POSIX only: Windows (where the tests also run) cannot open a directory."""
    if os.name != "posix":
        return
    fd = os.open(path, os.O_RDONLY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def move_one(s: Session, path: str, manifest_path: str) -> dict:
    name = os.path.basename(path)
    b2_name = COLD_PREFIX + name
    upload_url, upload_token = get_upload_url(s)              # before any local work
    uncompressed = decompressed_size(path)                    # FileFailed on a truncated archive
    sha256, sha1, size = file_hashes(path)
    up = upload(path, b2_name, sha1, size, upload_url, upload_token)
    if up.get("contentSha1") not in (sha1, "unverified:" + sha1) or int(up.get("contentLength", -1)) != size:
        raise FileFailed("B2 recorded a different body for %s (sha1 %s, %s B)"
                         % (name, up.get("contentSha1"), up.get("contentLength")))
    back_sha, back_n = download_sha256(s, up["fileId"])
    if back_sha != sha256 or back_n != size:
        raise FileFailed("read-back of %s does not match (sha256 %s vs %s, %d vs %d B); the local copy is KEPT"
                         % (name, back_sha, sha256, back_n, size))
    record = {
        "name": name, "b2_name": b2_name, "file_id": up["fileId"], "sha256": sha256, "sha1": sha1,
        "bytes": size, "uncompressed_bytes": uncompressed,
        "verified_at": datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    append_manifest(record, manifest_path)
    os.unlink(path)
    _fsync_dir(os.path.dirname(path))
    LOG.info("moved %s (%d B, %d B uncompressed) -> %s, file id %s", name, size, uncompressed, b2_name, up["fileId"])
    return record


def upload_manifest(s: Session, manifest_path: str) -> None:
    sha256, sha1, size = file_hashes(manifest_path)
    url, tok = get_upload_url(s)
    up = upload(manifest_path, MANIFEST_OBJECT, sha1, size, url, tok)
    LOG.info("manifest uploaded (%d B, file id %s)", size, up["fileId"])


def run(*, cold_dir: str = COLD_DIR, manifest_path: str = MANIFEST_PATH, auth_url: str = AUTH_URL,
        key=None, now: float | None = None, dry_run: bool = False) -> int:
    now = time.time() if now is None else now
    todo = candidates(cold_dir, now)
    LOG.info("%d file(s) to move, %d B in all", len(todo), sum(os.path.getsize(p) for p in todo))
    if dry_run:
        for p in todo:
            LOG.info("would move %s (%d B)", os.path.basename(p), os.path.getsize(p))
        return 0
    if not todo:
        return 0
    try:
        key_id, app_key = key if key else read_key()
        s = authorize(key_id, app_key, auth_url)
    except Exception as exc:                  # noqa: BLE001 — Abort, or anything unexpected: nothing was touched
        LOG.error("ABORT before any file: %s", exc)
        return 1
    moved, failed = [], []
    for path in todo:
        try:
            moved.append(move_one(s, path, manifest_path))
        except FileFailed as exc:
            failed.append(os.path.basename(path))
            LOG.error("FILE KEPT: %s", exc)
        except Exception as exc:              # noqa: BLE001 — Abort, or anything unexpected: stop, keep every file left
            LOG.error("ABORT after %d moved: %s — %d file(s) not attempted", len(moved), exc,
                      len(todo) - len(moved) - len(failed))
            failed.append("(run aborted)")
            break
    if moved:
        try:
            upload_manifest(s, manifest_path)
        except (Abort, FileFailed) as exc:
            LOG.error("the manifest could not be uploaded: %s (the local manifest is intact)", exc)
            failed.append("(manifest upload)")
    LOG.info("done: moved %d file(s), %d B; kept %d: %s", len(moved), sum(r["bytes"] for r in moved),
             len(failed), ", ".join(failed) or "none")
    return 1 if failed else 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    ap.add_argument("--dry-run", action="store_true", help="list what would move; touch nothing, call nothing")
    sys.exit(run(dry_run=ap.parse_args().dry_run))
