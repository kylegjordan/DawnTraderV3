"""
token-watch — the off-box cold leg against a FAKE B2. (B-TOKEN-WATCH-STORAGE P8)

A local HTTP server plays B2: authorize, get-upload-url, upload (it checks the
X-Bz-Content-Sha1 the way B2 does), and download-by-id. Each block states what
it expects before it runs, and every negative block has a positive control.

Run:  python3 token-watch/tests/test_cold_offbox.py   (exit 0 = all pass)
"""

import gzip
import hashlib
import json
import os
import shutil
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-offbox-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ops"))
MODULE = os.environ.get("COLD_OFFBOX_MODULE")      # set by the mutation runner to a mutated copy
if MODULE:
    import importlib.util
    spec = importlib.util.spec_from_file_location("cold_offbox", MODULE)
    co = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(co)
else:
    import cold_offbox as co  # noqa: E402

PASS = FAIL = 0

# The refusal REASON is part of the contract (Langston, Step 4): a page that names the wrong cause sends people to
# rotate a key that was never the problem. So the abort lines are captured and each refusal block checks its reason.
import logging  # noqa: E402
ERRORS = []
DONE = []


class _Capture(logging.Handler):
    def emit(self, record):
        msg = record.getMessage()
        (DONE if msg.startswith("done:") else ERRORS).append(msg)


logging.getLogger("token-watch.cold-offbox").addHandler(_Capture())
logging.getLogger("token-watch.cold-offbox").setLevel(logging.INFO)   # the "done:" line is INFO


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("PASS " + label)
    else:
        FAIL += 1
        print("FAIL " + label + ("  " + detail if detail else ""))


class Fake:
    mode = set()          # 'corrupt', 'auth401', 'upload500', 'wide', 'delete', 'v3', 'nocaps', 'extracap',
                          # 'unrestricted' (buckets: None, as the account-wide key returns), 'twobuckets',
                          # 'wrongname' (one bucket, the WRONG one), 'noid', 'notdict',
                          # 'cap' (B2's measured download_cap_exceeded 403 on the read-back, after the first file),
                          # 'dl404' (the read-back refused with a plain 404)
    objects = {}          # fileId -> bytes
    names = {}            # fileId -> name
    calls = []


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
        u = urlparse(self.path)
        Fake.calls.append(u.path)
        base = "http://127.0.0.1:%d" % self.server.server_port
        if u.path.endswith("b2_authorize_account"):
            if "auth401" in Fake.mode:
                return self.send_json(401, {"code": "unauthorized"})
            # ⛔ PROVENANCE OF THIS FIXTURE'S SHAPE (Langston, Step 4: a fixture that reads a vendor response must cite
            #    the documented schema). Backblaze's v4 b2_authorize_account moved every key restriction into
            #    storageApi.allowed = {buckets: [{id, name}], capabilities, namePrefix}; v3 kept them flat and has no
            #    `allowed`. MEASURED on staging 2026-11-04 with the app's key, field names only:
            #      v3 storageApi: absoluteMinimumPartSize apiUrl bucketId bucketName capabilities downloadUrl infoType
            #                     namePrefix recommendedPartSize s3ApiUrl
            #      v4 storageApi: absoluteMinimumPartSize allowed apiUrl downloadUrl recommendedPartSize s3ApiUrl
            #      v4 allowed:    buckets capabilities namePrefix
            #    The r1 fixture returned BOTH shapes at once, which no B2 version does — that is how a parser reading
            #    v4 against a v3 URL passed 35 checks. This fixture returns ONE shape per request.
            caps = ["listFiles", "readFiles", "writeFiles"]
            if "delete" in Fake.mode:
                caps.append("deleteFiles")
            if "extracap" in Fake.mode:
                caps.append("writeKeys")
            if "v3" in Fake.mode:
                return self.send_json(200, {"accountId": "a", "authorizationToken": "t", "apiInfo": {"storageApi": {
                    "absoluteMinimumPartSize": 5000000, "apiUrl": base, "bucketId": "b1", "bucketName": "dt-archive-cold",
                    "capabilities": caps, "downloadUrl": base, "infoType": "apiInfo", "namePrefix": "token-watch/",
                    "recommendedPartSize": 100000000, "s3ApiUrl": base}}})
            allowed = {"buckets": [{"id": "b1", "name": "dt-archive-cold"}],
                       "capabilities": caps,
                       "namePrefix": None if "wide" in Fake.mode else "token-watch/"}
            if "nocaps" in Fake.mode:
                del allowed["capabilities"]
            if "unrestricted" in Fake.mode:
                allowed["buckets"] = None
            if "twobuckets" in Fake.mode:
                allowed["buckets"] = [{"id": "b1", "name": "dt-archive-cold"}, {"id": "b2", "name": "dt-archive"}]
            if "wrongname" in Fake.mode:      # the dangerous one: accepted, it would upload to dt-archive and unlink
                allowed["buckets"] = [{"id": "b2", "name": "dt-archive"}]
            if "noid" in Fake.mode:
                allowed["buckets"] = [{"name": "dt-archive-cold"}]
            if "notdict" in Fake.mode:
                allowed["buckets"] = ["dt-archive-cold"]
            return self.send_json(200, {"accountId": "a", "authorizationToken": "t", "apiInfo": {"storageApi": {
                "absoluteMinimumPartSize": 5000000, "allowed": allowed, "apiUrl": base, "downloadUrl": base,
                "recommendedPartSize": 100000000, "s3ApiUrl": base}}})
        if u.path.endswith("b2_download_file_by_id"):
            fid = parse_qs(u.query)["fileId"][0]
            if "dl404" in Fake.mode:
                return self.send_json(404, {"code": "not_found", "status": 404, "message": "file not present"})
            if "cap" in Fake.mode and sum(1 for c in Fake.calls if c.endswith("b2_download_file_by_id")) > 1:
                # the body B2 actually returned on staging, 2026-11-04 16:35Z
                return self.send_json(403, {"code": "download_cap_exceeded", "status": 403, "message":
                                            "Cannot download file, download bandwidth or transaction (Class B) cap "
                                            "exceeded. See the Caps & Alerts page to increase your cap."})
            data = Fake.objects[fid]
            if "corrupt" in Fake.mode:
                data = data[:-1] + bytes([data[-1] ^ 0xFF])
            self.send_response(200)
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
            return
        self.send_json(404, {})

    def do_POST(self):
        Fake.calls.append(self.path)
        n = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(n)
        base = "http://127.0.0.1:%d" % self.server.server_port
        if self.path.endswith("b2_get_upload_url"):
            return self.send_json(200, {"uploadUrl": base + "/upload", "authorizationToken": "u"})
        if self.path == "/upload":
            if "upload500" in Fake.mode:
                return self.send_json(500, {"code": "internal_error"})
            sha1 = hashlib.sha1(body).hexdigest()
            if sha1 != self.headers.get("X-Bz-Content-Sha1"):
                return self.send_json(400, {"code": "bad_request", "message": "sha1 did not match"})
            fid = "f%d" % len(Fake.objects)
            Fake.objects[fid] = body
            Fake.names[fid] = self.headers.get("X-Bz-File-Name")
            return self.send_json(200, {"fileId": fid, "contentSha1": sha1, "contentLength": len(body)})
        self.send_json(404, {})


srv = ThreadingHTTPServer(("127.0.0.1", 0), H)
threading.Thread(target=srv.serve_forever, daemon=True).start()
AUTH = "http://127.0.0.1:%d/b2api/v4/b2_authorize_account" % srv.server_port
check("fixture control: the module's own AUTH_URL is v4", "/b2api/v4/" in co.AUTH_URL, co.AUTH_URL)
KEY = ("kid", "secret")
COLD = os.path.join(ROOT, "cold")
MANIFEST = os.path.join(ROOT, "offbox", "cold-offbox-manifest.jsonl")
OLD = time.time() - 7200


def reset(files, *, mode=(), fresh=()):
    shutil.rmtree(COLD, ignore_errors=True)
    shutil.rmtree(os.path.dirname(MANIFEST), ignore_errors=True)
    os.makedirs(COLD)
    Fake.mode, Fake.objects, Fake.names, Fake.calls = set(mode), {}, {}, []
    out = {}
    for i, name in enumerate(files):
        p = os.path.join(COLD, name)
        with gzip.open(p, "wb") as fh:
            fh.write(("line %d\n" % i).encode() * 5000)
        os.utime(p, (OLD + i, OLD + i))
        out[name] = open(p, "rb").read()
    for name in fresh:
        p = os.path.join(COLD, name)
        with gzip.open(p, "wb") as fh:
            fh.write(b"fresh\n")
        out[name] = open(p, "rb").read()
    return out


def run(**kw):
    return co.run(cold_dir=COLD, manifest_path=MANIFEST, auth_url=AUTH, key=KEY, **kw)


def manifest():
    if not os.path.exists(MANIFEST):
        return []
    return [json.loads(l) for l in open(MANIFEST, encoding="utf-8")]


# ── T1: the happy path, with a fresh file the guard must leave alone ─────────
print("T1 expect: three old files move (exit 0), the fresh one stays, the manifest holds 3 lines whose sha256 equal the "
      "uploaded bytes, and the manifest itself is uploaded under token-watch/manifest/")
orig = reset(["provenance-raw-2026-10-01.jsonl.gz", "provenance-raw-2026-10-02.jsonl.gz",
              "provenance-follow-up-2026-09-30.jsonl.gz"], fresh=["provenance-raw-2026-11-04.jsonl.gz"])
rc = run()
left = sorted(os.listdir(COLD))
m = manifest()
check("T1 exit 0", rc == 0, "rc=%r" % rc)
check("T1 only the fresh file is left", left == ["provenance-raw-2026-11-04.jsonl.gz"], repr(left))
check("T1 manifest has 3 lines", len(m) == 3, repr(len(m)))
check("T1 every manifest sha256 is the original bytes'",
      all(r["sha256"] == hashlib.sha256(orig[r["name"]]).hexdigest() for r in m))
check("T1 every uploaded object equals the original bytes",
      all(Fake.objects[r["file_id"]] == orig[r["name"]] for r in m))
check("T1 uncompressed counts recorded", all(r["uncompressed_bytes"] > r["bytes"] for r in m))
check("T1 objects named under token-watch/cold/", all(Fake.names[r["file_id"]] == "token-watch/cold/" + r["name"]
                                                       for r in m))
check("T1 the manifest itself was uploaded", "token-watch/manifest/cold-offbox-manifest.jsonl" in Fake.names.values())
check("T1 oldest first", [r["name"] for r in m][0] == "provenance-raw-2026-10-01.jsonl.gz")
check("T1 every B2 call used the v4 API", all("/b2api/v4/" in c for c in Fake.calls if "b2api" in c), repr(Fake.calls))

# ── T7: a re-run with nothing to move ───────────────────────────────────────
print("T7 expect: a second run finds only the fresh file, exits 0, calls B2 not at all, and writes no manifest line")
before = list(manifest())
Fake.calls = []
rc = run()
check("T7 exit 0", rc == 0)
check("T7 no B2 call", Fake.calls == [], repr(Fake.calls))
check("T7 manifest unchanged", manifest() == before)

# ── T2: a corrupted read-back keeps the file ────────────────────────────────
print("T2 expect: with the read-back corrupted, exit 1, BOTH files kept, no manifest line (positive control: T1)")
reset(["a-2026-10-01.jsonl.gz", "b-2026-10-02.jsonl.gz"], mode={"corrupt"})
rc = run()
check("T2 exit 1", rc == 1, "rc=%r" % rc)
check("T2 both files kept", sorted(os.listdir(COLD)) == ["a-2026-10-01.jsonl.gz", "b-2026-10-02.jsonl.gz"])
check("T2 no manifest line", manifest() == [])
check("T2 both were attempted (integrity failure carries on)",
      sum(1 for c in Fake.calls if c == "/upload") == 2, repr(Fake.calls))

# ── T3: a truncated archive is refused before upload; the next file still goes ─
print("T3 expect: a truncated .gz is kept and never uploaded; the good file after it still moves; exit 1")
reset(["a-2026-10-01.jsonl.gz", "b-2026-10-02.jsonl.gz"])
p = os.path.join(COLD, "a-2026-10-01.jsonl.gz")
data = open(p, "rb").read()
open(p, "wb").write(data[: len(data) // 2])
os.utime(p, (OLD, OLD))
rc = run()
check("T3 exit 1", rc == 1, "rc=%r" % rc)
check("T3 the truncated file is kept", os.path.exists(p))
check("T3 the good file moved", not os.path.exists(os.path.join(COLD, "b-2026-10-02.jsonl.gz")))
check("T3 only one upload of a cold file", sum(1 for n in Fake.names.values() if "/cold/" in n) == 1)

# ── T4: a refused key touches nothing and decompresses nothing ───────────────
print("T4 expect: authorize returns 401 -> exit 1, no file touched, no upload URL taken, nothing decompressed")
reset(["a-2026-10-01.jsonl.gz", "b-2026-10-02.jsonl.gz"], mode={"auth401"})
seen = []
real = co.decompressed_size
co.decompressed_size = lambda path: seen.append(path) or real(path)
rc = run()
co.decompressed_size = real
check("T4 exit 1", rc == 1)
check("T4 nothing decompressed", seen == [], repr(seen))
check("T4 no upload URL taken", not any("get_upload_url" in c for c in Fake.calls))
check("T4 both files kept", len(os.listdir(COLD)) == 2)

# ── T5: a dead upload endpoint aborts after one file, not after all of them ──
print("T5 expect: uploads return 500 -> one retry, then ABORT: exit 1, all files kept, only the FIRST file decompressed")
reset(["a-2026-10-01.jsonl.gz", "b-2026-10-02.jsonl.gz", "c-2026-10-03.jsonl.gz"], mode={"upload500"})
seen = []
co.decompressed_size = lambda path: seen.append(os.path.basename(path)) or real(path)
rc = run()
co.decompressed_size = real
check("T5 exit 1", rc == 1)
check("T5 all files kept", len(os.listdir(COLD)) == 3)
check("T5 only the first file was decompressed", seen == ["a-2026-10-01.jsonl.gz"], repr(seen))
check("T5 exactly two upload attempts (one retry)", sum(1 for c in Fake.calls if c == "/upload") == 2,
      repr(Fake.calls))

# ── T18: the account's download cap mid-run — named as the cap, not the key; the orphan is named ─────────
DONE.clear()
print("T18 expect: the 2nd read-back hits B2's download cap -> file 1 moved, run stops: exit 1, files 2-3 kept, the "
      "abort names the CAP (not the key) and the orphaned file id of file 2")
reset(["a-2026-10-01.jsonl.gz", "b-2026-10-02.jsonl.gz", "c-2026-10-03.jsonl.gz"], mode={"cap"})
ERRORS.clear()
rc = run()
check("T18 exit 1", rc == 1)
check("T18 the first file moved", not os.path.exists(os.path.join(COLD, "a-2026-10-01.jsonl.gz")))
check("T18 the other two kept", sorted(os.listdir(COLD)) == ["b-2026-10-02.jsonl.gz", "c-2026-10-03.jsonl.gz"])
check("T18 the abort names the account cap", any("ABORT" in e and "cap is reached, not the key" in e for e in ERRORS),
      repr(ERRORS))
check("T18 it does NOT say the key is wrong", not any("the key is wrong" in e for e in ERRORS), repr(ERRORS))
check("T18 the orphan (file 2's uploaded version) is named by id",
      any("b-2026-10-02.jsonl.gz was uploaded (file id f1)" in e for e in ERRORS), repr(ERRORS))
check("T18 the manifest holds only the verified file", [r["name"] for r in manifest()] == ["a-2026-10-01.jsonl.gz"])
check("T18 the closing line counts the files still on the box (2), not the abort event (1)",
      any(e.startswith("done:") and "2 file(s) still on the box" in e and "b-2026-10-02.jsonl.gz" in e
          and "1 not attempted" in e for e in DONE), repr(DONE))

# ── T19: a read-back refused with a plain 404 also names the orphan ─────────
print("T19 expect: a 404 on the read-back keeps the file (integrity class, the run carries on) and names the orphan")
reset(["a-2026-10-01.jsonl.gz"], mode={"dl404"})
ERRORS.clear()
rc = run()
check("T19 exit 1, file kept", rc == 1 and os.listdir(COLD) == ["a-2026-10-01.jsonl.gz"])
check("T19 FILE KEPT names the orphan, the file and that the local copy is kept",
      any("FILE KEPT" in e and "a-2026-10-01.jsonl.gz was uploaded (file id f0)" in e and "ORPHAN" in e for e in ERRORS),
      repr(ERRORS))

# ── T6 / T8: a key that is too wide is refused before anything ──────────────
REASON = {"wide": "prefix", "delete": "capabilities are", "v3": "not the v4 shape",
          "nocaps": "capabilities is missing", "extracap": "capabilities are",
          "unrestricted": "bucket alone", "twobuckets": "bucket alone", "wrongname": "bucket alone",
          "noid": "bucket alone", "notdict": "bucket alone"}
for label, mode in (("T6 a key with no prefix restriction", "wide"), ("T8 a key that can delete", "delete"),
                    ("T10 a v3-shaped response (restrictions flat, no `allowed`)", "v3"),
                    ("T11 a response with no capabilities field (must not pass vacuously)", "nocaps"),
                    ("T12 a key with an extra capability (writeKeys)", "extracap"),
                    ("T13 a key not restricted to any bucket (buckets: None, the account-wide case)", "unrestricted"),
                    ("T14 a key restricted to two buckets", "twobuckets"),
                    ("T15 a key restricted to ONE WRONG bucket (dt-archive) with the right prefix", "wrongname"),
                    ("T16 a bucket entry with no id", "noid"),
                    ("T17 a bucket entry that is not an object", "notdict")):
    print("%s expect: refused at authorize, exit 1, nothing touched" % label)
    reset(["a-2026-10-01.jsonl.gz"], mode={mode})
    ERRORS.clear()
    rc = run()
    check(label + ": refused for the RIGHT reason (%r)" % REASON[mode],
          any("ABORT before any file" in e and REASON[mode] in e for e in ERRORS), repr(ERRORS))
    check(label + ": exit 1", rc == 1)
    check(label + ": file kept", os.listdir(COLD) == ["a-2026-10-01.jsonl.gz"])
    check(label + ": no upload URL taken", not any("get_upload_url" in c for c in Fake.calls))

# ── dry run ─────────────────────────────────────────────────────────────────
print("T9 expect: --dry-run touches nothing and calls nothing")
reset(["a-2026-10-01.jsonl.gz"])
rc = run(dry_run=True)
check("T9 exit 0, file kept, no call", rc == 0 and os.listdir(COLD) == ["a-2026-10-01.jsonl.gz"] and Fake.calls == [])

srv.shutdown()
shutil.rmtree(ROOT, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
