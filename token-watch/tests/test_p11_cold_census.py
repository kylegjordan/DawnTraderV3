"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P11 (OBJ-6): the read-only B2 version census against a FAKE B2.

A local HTTP server plays B2's authorize (the v4 shape, as tests/test_cold_offbox.py documents it) and
b2_list_file_versions, paged two versions at a time so pagination is exercised. Each block states its expectation;
every finding block has a clean control.

Run:  python3 token-watch/tests/test_p11_cold_census.py   (exit 0 = all pass)
"""

import json
import os
import sys
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-p11-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PKG)
sys.path.insert(0, os.path.join(PKG, "ops"))
sys.path.insert(0, os.path.join(PKG, "tools"))

import census_cold_versions as cc  # noqa: E402

PASS = FAIL = 0
NL = chr(10)


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % (detail,)) if detail else ""))


class Fake:
    versions = []         # what b2_list_file_versions returns, in B2's order (name, then newest first)
    caps = ["listFiles", "readFiles", "writeFiles"]
    list_calls = 0


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_json(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        base = "http://127.0.0.1:%d" % self.server.server_port
        if self.path.endswith("b2_authorize_account"):
            allowed = {"buckets": [{"id": "b1", "name": "dt-archive-cold"}], "capabilities": Fake.caps,
                       "namePrefix": "token-watch/"}
            return self.send_json(200, {"accountId": "a", "authorizationToken": "t", "apiInfo": {"storageApi": {
                "absoluteMinimumPartSize": 5000000, "allowed": allowed, "apiUrl": base, "downloadUrl": base,
                "recommendedPartSize": 100000000, "s3ApiUrl": base}}})
        self.send_json(404, {"code": "not_found"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(n) or b"{}")
        if self.path.endswith("b2_list_file_versions"):
            Fake.list_calls += 1
            allv = [v for v in Fake.versions if v["fileName"].startswith(body.get("prefix", ""))]
            start = 0
            if "startFileName" in body:
                start = next(i for i, v in enumerate(allv)
                             if v["fileName"] == body["startFileName"] and v["fileId"] == body["startFileId"])
            page = allv[start:start + 2]                    # two per page, whatever maxFileCount asked
            nxt = allv[start + 2] if start + 2 < len(allv) else None
            return self.send_json(200, {"files": page, "nextFileName": nxt["fileName"] if nxt else None,
                                        "nextFileId": nxt["fileId"] if nxt else None})
        self.send_json(404, {"code": "not_found"})


srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
AUTH = "http://127.0.0.1:%d/b2api/v4/b2_authorize_account" % srv.server_port
KEY = ("kid", "kapp")


def up(name, fid, size, sha1, ts, action="upload"):
    return {"fileName": "token-watch/" + name, "fileId": fid, "contentLength": size, "contentSha1": sha1,
            "uploadTimestamp": ts, "action": action}


def row(name, fid, size, sha1):
    return {"name": name, "b2_name": "token-watch/cold/" + name, "file_id": fid, "bytes": size, "sha1": sha1}


def run(versions, rows):
    Fake.versions = versions
    mpath = os.path.join(ROOT, "manifest.jsonl")
    with open(mpath, "w", encoding="utf-8") as fh:
        for r in rows:
            fh.write((r if isinstance(r, str) else json.dumps(r)) + NL)
    out = os.path.join(ROOT, "report.json")
    if os.path.exists(out):
        os.remove(out)
    rc = cc.main(["--manifest", mpath, "--out", out], key=KEY, auth_url=AUTH)
    rep = json.load(open(out, encoding="utf-8")) if os.path.exists(out) else {}
    return rc, rep


A = up("cold/a.jsonl.gz", "fA", 10, "s1", 1_700_000_000_000)
B = up("cold/b.jsonl.gz", "fB", 20, "s2", 1_700_000_100_000)
MAN = up("manifest/cold-offbox-manifest.jsonl", "fM", 5, "sm", 1_700_000_200_000)
PROOF = up("proof/key-proof.txt", "fP", 3, "sp", 1_700_000_300_000)
ROWS = [row("a.jsonl.gz", "fA", 10, "s1"), row("b.jsonl.gz", "fB", 20, "s2")]

print(NL + "=== C1. CLEAN: every manifest row matches one upload; manifest/ and proof/ reported separately, not as orphans")
rc, rep = run([A, B, MAN, PROOF], ROWS)
check("C1 exit 0, clean", rc == 0 and rep.get("clean") is True, (rc, rep.get("clean")))
check("C1 all four versions listed across pages (the fake pages two at a time)", rep.get("versions_listed") == 4
      and Fake.list_calls >= 2, (rep.get("versions_listed"), Fake.list_calls))
check("C1 manifest/ and proof/ are reported under elsewhere, not orphans", not rep.get("orphans")
      and set(rep.get("elsewhere", {})) == {"manifest", "proof"}, rep.get("elsewhere"))

print(NL + "=== C2. A SEEDED ORPHAN (an upload with no manifest line) IS NAMED WITH ITS UPLOAD TIME")
ORPH = up("cold/c.jsonl.gz", "fC", 30, "s3", 1_700_000_400_000)
rc, rep = run([A, B, ORPH, MAN], ROWS)
check("C2 exit 1 with exactly that orphan, named with its upload time", rc == 1 and [o["file_id"] for o in rep["orphans"]]
      == ["fC"] and rep["orphans"][0]["uploaded"] == "2023-11-14T22:20:00Z", (rc, rep.get("orphans")))

print(NL + "=== C3. A MANIFEST ROW WITH NO MATCHING UPLOAD IS MISSING")
rc, rep = run([A, MAN], ROWS)
check("C3 exit 1, fB missing with 0 versions found", rc == 1 and rep["missing"] == [
    {"file_id": "fB", "b2_name": "token-watch/cold/b.jsonl.gz", "versions_found": 0}], rep.get("missing"))

print(NL + "=== C4. A HIDE MARKER IS LISTED, AND A MANIFEST FILE IT HIDES IS FLAGGED")
HIDE_B = up("cold/b.jsonl.gz", "fBh", 0, None, 1_700_000_500_000, action="hide")
rc, rep = run([A, HIDE_B, B, MAN], ROWS)
check("C4 exit 1; the hide marker listed; fB hidden under the manifest", rc == 1 and [h["file_id"] for h in
      rep["hide_markers"]] == ["fBh"] and [h["file_id"] for h in rep["hidden_under_manifest"]] == ["fB"], rep)
check("C4 the hidden upload is NOT also called an orphan or missing", not rep["orphans"] and not rep["missing"], rep)

print(NL + "=== C5. A SIZE OR SHA1 THAT DIFFERS FROM THE MANIFEST IS MISMATCHED")
rc, rep = run([A, up("cold/b.jsonl.gz", "fB", 21, "s2", 1_700_000_100_000), MAN], ROWS)
check("C5 exit 1, fB mismatched (bytes)", rc == 1 and [m["file_id"] for m in rep["mismatched"]] == ["fB"], rep)
rc, rep = run([up("cold/a.jsonl.gz", "fA", 10, "unverified:s1", 1_700_000_000_000), B, MAN], ROWS)
check("C5 POSITIVE CONTROL: B2's 'unverified:<sha1>' form is accepted, as cold_offbox accepts it", rc == 0, rep)

print(NL + "=== C6. A DUPLICATE MANIFEST ROW IS REPORTED; AN UNREADABLE MANIFEST LINE REFUSES THE RUN")
rc, rep = run([A, B, MAN], ROWS + [ROWS[0]])
check("C6 exit 1, the duplicate named", rc == 1 and rep["duplicate_manifest_rows"] == ["fA"], rep)
rc, rep = run([A, B, MAN], ROWS + ["{broken"])
check("C6 an unreadable manifest line refuses (exit 2, no report): a partial manifest would invent orphans",
      rc == 2 and rep == {}, (rc, rep))

print(NL + "=== C7. THE KEY IS HELD TO cold_offbox's CHECKS: a key that can delete is refused")
Fake.caps = ["listFiles", "readFiles", "writeFiles", "deleteFiles"]
rc, rep = run([A, B], ROWS)
Fake.caps = ["listFiles", "readFiles", "writeFiles"]
check("C7 exit 2 with no report", rc == 2 and rep == {}, (rc, rep))

print(NL + "=== C8. HIDDEN IS DECIDED BY uploadTimestamp, NEVER BY LIST ORDER (Langston, P11 Step 4 C-3)")
HIDE_LATE = up("cold/b.jsonl.gz", "fBh", 0, None, 1_700_000_500_000, action="hide")
rc, rep = run([A, B, HIDE_LATE, MAN], ROWS)            # the hide is listed AFTER the upload but is NEWER
check("C8 a newer hide listed after the upload still hides it", rc == 1 and [h["file_id"] for h in
      rep["hidden_under_manifest"]] == ["fB"], rep.get("hidden_under_manifest"))
REUP = up("cold/b.jsonl.gz", "fB", 20, "s2", 1_700_000_900_000)          # the manifest's upload, re-done later
OLD_HIDE = up("cold/b.jsonl.gz", "fBh", 0, None, 1_700_000_500_000, action="hide")
rc, rep = run([A, OLD_HIDE, REUP, MAN], ROWS)          # the hide is listed FIRST but is OLDER than the upload
check("C8 recovery: an upload newer than a hide marker is NOT hidden", rep.get("hidden_under_manifest") == [], rep)

print(NL + "=== C9. AN EMPTY MANIFEST BESIDE REAL COLD UPLOADS REFUSES (C-2): it would call every verified upload an orphan")
rc, rep = run([A, B, MAN], [])
check("C9 exit 2, no report", rc == 2 and rep == {}, (rc, rep))
rc, rep = run([MAN], [])
check("C9 POSITIVE CONTROL: an empty manifest with no cold uploads is clean", rc == 0 and rep.get("clean") is True, rep)

print(NL + "=== C10. unverified MATCHES ARE COUNTED; elsewhere IS SUMMARISED; AN UNEXPECTED SHAPE REFUSES (exit 2)")
rc, rep = run([up("cold/a.jsonl.gz", "fA", 10, "unverified:s1", 1_700_000_000_000), B, MAN], ROWS)
check("C10 the unverified match is clean AND named", rc == 0 and rep.get("matched_unverified_sha1") == ["fA"], rep)
many = [up("manifest/cold-offbox-manifest.jsonl", "fM%d" % i, 5, "sm", 1_700_000_000_000 + i * 1000) for i in range(40)]
rc, rep = run([A, B] + many, ROWS)
man = rep.get("elsewhere", {}).get("manifest", {})
check("C10 40 manifest versions summarise to one name with a count and its newest time", rc == 0 and man.get("count") == 40
      and list(man.get("names", {})) == ["token-watch/manifest/cold-offbox-manifest.jsonl"]
      and man["names"]["token-watch/manifest/cold-offbox-manifest.jsonl"]["versions"] == 40, man)
bad = dict(B, contentLength=None)
rc, rep = run([A, bad, MAN], ROWS)
check("C10 a version with no contentLength refuses (exit 2), never 'findings' (exit 1)", rc == 2, rc)

import summary  # noqa: E402
print(NL + "=== G1. THE SUMMARY'S OWN MEMORY GAUGE (Langston, P3 Step 4)")
check("G1 under 70% of the cap -> 0", summary.memory_exit_code(200 * 1048576, 384 * 1048576) == 0)
check("G1 past 70% of the cap -> 3 (the page)", summary.memory_exit_code(280 * 1048576, 384 * 1048576) == 3)
check("G1 no cap (memory.max 'max') -> 0", summary.memory_exit_code(280 * 1048576, None) == 0)
peak, cap = summary.memory_headroom()
if sys.platform.startswith("linux"):
    check("G1 memory_headroom reads a positive peak (Linux)", peak > 0, (peak, cap))
else:
    print("  skip G1 memory_headroom peak: no `resource` module off Linux (CI and the box are Linux)")

print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
