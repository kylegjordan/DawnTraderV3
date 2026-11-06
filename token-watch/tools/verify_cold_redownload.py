"""
token-watch — B-TOKEN-WATCH-STORAGE Step 7 (ii): re-download three off-box objects BY FILE ID and prove them whole.

The scope's rule, stated before the run (scope OBJ-1 verify (ii)): the OLDEST, the LARGEST and the NEWEST manifest
entries are downloaded by fileId; the download decompresses to EOF (the `gunzip -t` test) and both its sha256 and its
uncompressed byte count match the manifest line.
  ⚠️ The scope named the time field `uploaded_at`; the manifest the job writes calls it `verified_at` (the moment
     the read-back matched, `cold_offbox.move_one`). This reads `verified_at`.
  - oldest  = the smallest `verified_at` (ties: the first in the file)
  - largest = the largest compressed `bytes`
  - newest  = the largest `verified_at` (ties: the last in the file)
  (one object can fill two roles; it is then checked once and reported under both)

READ-ONLY: it lists nothing, writes nothing to B2, and keeps the download only in a private temporary directory that
is removed at exit. It reads the key exactly as the off-box job does (systemd `LoadCredential=`), so run it as:
  ssh root@<staging> 'systemd-run --quiet --wait --pipe -p User=tokenwatch-cold -p PrivateTmp=yes \
      -p LoadCredential=b2-cold:/etc/token-watch/b2-cold.key -p Environment=PYTHONPATH=/opt/token-watch \
      -p Environment=TOKEN_WATCH_ROOT=/var/lib/token-watch /usr/bin/python3 -' < token-watch/tools/verify_cold_redownload.py
  (the script on stdin, so nothing is added to the installed tree)
Exit 0 = all three match; 1 = any mismatch or failure (named).
"""
import gzip
import hashlib
import json
import os
import sys
import tempfile
import urllib.parse
import urllib.request

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from ops import cold_offbox as co  # noqa: E402


def pick(rows):
    oldest = min(range(len(rows)), key=lambda i: (rows[i]["verified_at"], i))
    largest = max(range(len(rows)), key=lambda i: (rows[i]["bytes"], -i))
    newest = max(range(len(rows)), key=lambda i: (rows[i]["verified_at"], i))
    return {"oldest": oldest, "largest": largest, "newest": newest}


def check(s, row, tmpdir):
    url = s.download_url + co.API + "b2_download_file_by_id?fileId=" + urllib.parse.quote(row["file_id"])
    path = os.path.join(tmpdir, "obj.gz")
    h, n = hashlib.sha256(), 0
    req = urllib.request.Request(url, headers={"Authorization": s.token})
    with urllib.request.urlopen(req, timeout=co.TIMEOUT) as resp, open(path, "wb") as out:
        while True:
            block = resp.read(co.CHUNK)
            if not block:
                break
            h.update(block)
            out.write(block)
            n += len(block)
    unz = 0
    with gzip.open(path, "rb") as g:          # decompress to EOF: a truncated or corrupt body raises here
        while True:
            block = g.read(co.CHUNK)
            if not block:
                break
            unz += len(block)
    os.unlink(path)
    return {"name": row["name"], "file_id": row["file_id"][-24:], "bytes": n, "sha256_match": h.hexdigest() == row["sha256"],
            "bytes_match": n == row["bytes"], "gunzip_ok": True,
            "uncompressed_bytes": unz, "uncompressed_match": unz == row.get("uncompressed_bytes")}


def main():
    rows = [json.loads(l) for l in open(co.MANIFEST_PATH, encoding="utf-8") if l.strip()]
    roles = pick(rows)
    s = co.authorize(*co.read_key())
    results, bad = {}, 0
    with tempfile.TemporaryDirectory() as tmp:
        done = {}
        for role, i in roles.items():
            if i not in done:
                try:
                    done[i] = check(s, rows[i], tmp)
                except Exception as e:  # a failed download or a gunzip error is a FAIL, named
                    done[i] = {"name": rows[i]["name"], "error": "%s: %s" % (type(e).__name__, e)}
            results[role] = done[i]
    for role, r in results.items():
        good = "error" not in r and r["sha256_match"] and r["bytes_match"] and r["uncompressed_match"]
        bad += 0 if good else 1
        print(("PASS " if good else "FAIL ") + role + " " + json.dumps(r, sort_keys=True))
    print("manifest lines: %d" % len(rows))
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
