"""
token-watch — READ-ONLY census of every B2 file version under `token-watch/`, reconciled against the off-box manifest.
(B-TOKEN-WATCH-FOLLOWUP-MEMORY P11, OBJ-6; #1132 rider, Langston Step 9 item 3.)

WHY: the cold key can WRITE and can HIDE, and an upload whose read-back failed is left in B2 as a version with no
manifest line (`ops/cold_offbox.py` says so in its own refusal messages: "that version is an ORPHAN"). Nothing listed
them. `b2_list_file_versions` (not `b2_list_file_names`) is used because a hide marker makes a file vanish from the
name listing while every version stays billable.

WHAT IT REPORTS, never deletes (removing an orphan is a separate, recorded step):
  * every manifest row must match EXACTLY ONE `upload` version by file id, with the row's name, size and sha1 —
    otherwise MISSING, MISMATCHED or DUPLICATE;
  * a manifest row whose name's NEWEST version is a hide marker is HIDDEN-UNDER-MANIFEST;
  * every other `upload` version under `token-watch/cold/` is an ORPHAN, named with its upload time;
  * every hide marker is listed;
  * versions under `token-watch/manifest/` and `token-watch/proof/` (and anything else) are reported separately,
    NOT as orphans.
It authorizes through `cold_offbox.authorize`, so the key is held to the same checks (exactly listFiles, readFiles,
writeFiles; the one bucket; the `token-watch/` prefix). Listing does not touch the download cap.

Run as a unit (the key never enters an environment variable, an argv or a log):
  systemd-run --wait --pipe -p User=tokenwatch-cold -p LoadCredential=b2-cold:/etc/token-watch/b2-cold.key \\
      /usr/bin/python3 /opt/token-watch/tools/census_cold_versions.py [--out <report.json>]
Exit: 0 clean · 1 findings (the report says which) · 2 refused (auth, transport, unreadable manifest).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PKG)
sys.path.insert(0, os.path.join(PKG, "ops"))

import cold_offbox as co  # noqa: E402

UTC = timezone.utc
PAGE = 1000                       # B2's maxFileCount ceiling per list call


def list_versions(s, prefix: str = co.KEY_PREFIX, page: int = PAGE) -> list:
    """Every version under `prefix`, following nextFileName / nextFileId to the end."""
    out, start_name, start_id = [], None, None
    while True:
        body = {"bucketId": s.bucket_id, "prefix": prefix, "maxFileCount": page}
        if start_name is not None:
            body["startFileName"] = start_name
        if start_id is not None:
            body["startFileId"] = start_id
        r = co._json(s.api_url + co.API + "b2_list_file_versions", token=s.token, body=body)
        out.extend(r.get("files") or [])
        start_name, start_id = r.get("nextFileName"), r.get("nextFileId")
        if not start_name:
            return out


def read_manifest(path: str) -> tuple:
    """(rows, unreadable line count). A missing manifest raises: absent is never read as empty."""
    rows, bad = [], 0
    with open(path, encoding="utf-8") as fh:
        for raw in fh:
            if not raw.strip():
                continue
            try:
                r = json.loads(raw)
            except ValueError:
                bad += 1
                continue
            if isinstance(r, dict):
                rows.append(r)
            else:
                bad += 1
    return rows, bad


def _iso(ms) -> str | None:
    try:
        return datetime.fromtimestamp(int(ms) / 1000.0, UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (TypeError, ValueError):
        return None


def reconcile(versions: list, rows: list) -> dict:
    cold = [v for v in versions if str(v.get("fileName", "")).startswith(co.COLD_PREFIX)]
    elsewhere = {}
    for v in versions:
        name = str(v.get("fileName", ""))
        if name.startswith(co.COLD_PREFIX):
            continue
        area = name[len(co.KEY_PREFIX):].split("/", 1)[0] if name.startswith(co.KEY_PREFIX) else "(outside prefix)"
        elsewhere.setdefault(area, []).append({"name": name, "file_id": v.get("fileId"), "action": v.get("action"),
                                               "uploaded": _iso(v.get("uploadTimestamp"))})
    newest = {}                                   # name -> the newest version of that name (any action)
    for v in cold:
        n = v.get("fileName")
        if n not in newest or int(v.get("uploadTimestamp") or 0) > int(newest[n].get("uploadTimestamp") or 0):
            newest[n] = v
    uploads_by_id = {}
    for v in cold:
        if v.get("action") == "upload":
            uploads_by_id.setdefault(v.get("fileId"), []).append(v)
    seen_ids, missing, mismatched, duplicate, hidden_under = set(), [], [], [], []
    for row in rows:
        fid = row.get("file_id")
        if fid in seen_ids:
            duplicate.append(fid)
            continue
        seen_ids.add(fid)
        matches = uploads_by_id.get(fid, [])
        if len(matches) != 1:
            missing.append({"file_id": fid, "b2_name": row.get("b2_name"), "versions_found": len(matches)})
            continue
        v = matches[0]
        sha_ok = v.get("contentSha1") in (row.get("sha1"), "unverified:%s" % row.get("sha1"))
        if v.get("fileName") != row.get("b2_name") or int(v.get("contentLength", -1)) != row.get("bytes") or not sha_ok:
            mismatched.append({"file_id": fid, "b2_name": row.get("b2_name"), "b2_file_name": v.get("fileName"),
                               "b2_bytes": v.get("contentLength"), "manifest_bytes": row.get("bytes"),
                               "sha1_matches": sha_ok})
            continue
        top = newest.get(v.get("fileName"))
        if top is not None and top.get("action") == "hide":
            hidden_under.append({"file_id": fid, "b2_name": row.get("b2_name"), "hidden_at": _iso(top.get(
                "uploadTimestamp"))})
    orphans = [{"file_id": v.get("fileId"), "name": v.get("fileName"), "bytes": v.get("contentLength"),
                "uploaded": _iso(v.get("uploadTimestamp"))}
               for v in cold if v.get("action") == "upload" and v.get("fileId") not in seen_ids]
    hides = [{"name": v.get("fileName"), "file_id": v.get("fileId"), "at": _iso(v.get("uploadTimestamp"))}
             for v in cold if v.get("action") == "hide"]
    report = {
        "versions_listed": len(versions), "cold_versions": len(cold), "manifest_rows": len(rows),
        "missing": missing, "mismatched": mismatched, "duplicate_manifest_rows": duplicate,
        "hidden_under_manifest": hidden_under, "orphans": orphans, "hide_markers": hides,
        "elsewhere": {k: {"count": len(v), "versions": v} for k, v in sorted(elsewhere.items())},
    }
    report["clean"] = not (missing or mismatched or duplicate or hidden_under or orphans or hides)
    return report


def main(argv: list[str], key=None, auth_url: str | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--manifest", default=co.MANIFEST_PATH)
    ap.add_argument("--out")
    a = ap.parse_args(argv)
    try:
        rows, bad = read_manifest(a.manifest)
    except OSError as exc:
        print("REFUSED: the manifest could not be read (%s)" % exc, file=sys.stderr)
        return 2
    if bad:
        print("REFUSED: the manifest has %d unreadable line(s); a reconciliation against a partial manifest would "
              "name real uploads as orphans" % bad, file=sys.stderr)
        return 2
    try:
        key_id, app_key = key or co.read_key()
        s = co.authorize(key_id, app_key, auth_url or co.AUTH_URL)
        versions = list_versions(s)
    except co.Abort as exc:
        print("REFUSED: %s" % exc, file=sys.stderr)
        return 2
    report = reconcile(versions, rows)
    report["generated_at"] = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
    text = json.dumps(report, indent=2, sort_keys=True)
    if a.out:
        with open(a.out, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
    print(text)
    print("census: %d version(s), %d cold, %d manifest row(s); orphans %d, missing %d, mismatched %d, hidden %d, "
          "hide markers %d -> %s" % (report["versions_listed"], report["cold_versions"], report["manifest_rows"],
                                     len(report["orphans"]), len(report["missing"]), len(report["mismatched"]),
                                     len(report["hidden_under_manifest"]), len(report["hide_markers"]),
                                     "CLEAN" if report["clean"] else "FINDINGS"), file=sys.stderr)
    return 0 if report["clean"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
