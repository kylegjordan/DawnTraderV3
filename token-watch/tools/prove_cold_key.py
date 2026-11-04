"""
token-watch — prove what the restricted key can and cannot do. (B-TOKEN-WATCH-STORAGE OBJ-2, P2)

Run as root on staging after mint_cold_key.py:  python3 prove_cold_key.py
★ "Capability metadata is what the API says; a refusal is what it does"
  (Langston, Step 1). So each claim is tested by a call, with the expected
  outcome printed BEFORE the call and judged by the HTTP status.

  1. authorize: report capabilities, bucket and prefix          (expect 3 caps, 1 bucket, token-watch/)
  2. write a small proof object under token-watch/proof/       (expect ALLOWED)
  3. delete that object's version                               (expect REFUSED, 401)
  4. read a name OUTSIDE token-watch/                           (expect REFUSED, 401)
  5. hide that proof object                                     (UNKNOWN — Langston's hypothesis; the
     result decides the README's fallback census: if hide is allowed, a hidden file drops out of
     b2_list_file_names, so the census must use b2_list_file_versions)

The proof object stays in the bucket: this key cannot delete it, which is the
point, and nothing else is used to. It is a few bytes under token-watch/proof/.
Exit 1 if step 3 or step 4 is NOT refused, or step 1 or 2 does not hold.
"""

import base64
import hashlib
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

KEY_FILE = "/etc/token-watch/b2-cold.key"
AUTH_URL = "https://api.backblazeb2.com/b2api/v4/b2_authorize_account"   # v4: restrictions live in storageApi.allowed
fails = 0


def call(req):
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read()


def post(url, token, body):
    return call(urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                       headers={"Authorization": token, "Content-Type": "application/json"}))


def expect(label, got, want):
    global fails
    ok = got == want
    fails += not ok
    print(("PASS " if ok else "FAIL ") + label + ("" if ok else "  (expected %r, got %r)" % (want, got)))


def main():
    key_id, secret = open(KEY_FILE).read().strip().split(":", 1)
    basic = base64.b64encode(("%s:%s" % (key_id, secret)).encode()).decode()
    print("1. expect: authorize OK; capabilities exactly listFiles, readFiles, writeFiles; "
          "one bucket dt-archive-cold; prefix token-watch/")
    st, body = call(urllib.request.Request(AUTH_URL, headers={"Authorization": "Basic " + basic}))
    expect("1 authorize", st, 200)
    auth = json.loads(body)
    api = auth["apiInfo"]["storageApi"]
    allowed = api.get("allowed") or {}
    caps = sorted(allowed.get("capabilities") or [])
    expect("1 capabilities", caps, ["listFiles", "readFiles", "writeFiles"])
    expect("1 bucket", [b.get("name") for b in allowed.get("buckets") or []], ["dt-archive-cold"])
    expect("1 prefix", allowed.get("namePrefix"), "token-watch/")
    token, api_url, dl_url = auth["authorizationToken"], api["apiUrl"], api["downloadUrl"]
    bucket_id = allowed["buckets"][0]["id"]

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    name = "token-watch/proof/prove_cold_key-%s.txt" % stamp
    data = ("proof object written by prove_cold_key.py at %s\n" % stamp).encode()
    print("2. expect: writing %s is ALLOWED (200)" % name)
    st, body = post(api_url + "/b2api/v4/b2_get_upload_url", token, {"bucketId": bucket_id})
    up = json.loads(body)
    st, body = call(urllib.request.Request(up["uploadUrl"], data=data, method="POST", headers={
        "Authorization": up["authorizationToken"], "X-Bz-File-Name": urllib.parse.quote(name, safe="/"),
        "Content-Type": "text/plain", "Content-Length": str(len(data)),
        "X-Bz-Content-Sha1": hashlib.sha1(data).hexdigest()}))
    expect("2 write under token-watch/", st, 200)
    file_id = json.loads(body).get("fileId")

    print("3. expect: deleting that version is REFUSED (401)")
    st, body = post(api_url + "/b2api/v4/b2_delete_file_version", token, {"fileName": name, "fileId": file_id})
    expect("3 delete-version refused", st, 401)
    print("   B2 said: %s" % body[:200].decode(errors="replace"))

    outside = "outside-token-watch/prove_cold_key-probe.txt"
    print("4. expect: reading %s (outside the prefix) is REFUSED (401, not 404)" % outside)
    st, body = call(urllib.request.Request(dl_url + "/file/dt-archive-cold/" + urllib.parse.quote(outside),
                                           headers={"Authorization": token}))
    expect("4 read outside the prefix refused", st, 401)
    print("   B2 said: %s" % body[:200].decode(errors="replace"))

    print("5. UNKNOWN by design (Langston's hypothesis): can this key HIDE a file?")
    st, body = post(api_url + "/b2api/v4/b2_hide_file", token, {"bucketId": bucket_id, "fileName": name})
    hide = "ALLOWED" if st == 200 else "REFUSED" if st == 401 else "HTTP %s" % st
    print("RESULT 5 hide-file: %s  (%s)" % (hide, body[:200].decode(errors="replace")))
    print("   => fallback census must use %s" % ("b2_list_file_versions" if hide == "ALLOWED" else
                                                  "b2_list_file_names (hide is refused)"))
    print(json.dumps({"key_id": key_id, "proof_object": name, "proof_file_id": file_id, "hide": hide}))
    print("ALL PASS" if not fails else "%d FAIL" % fails)
    sys.exit(1 if fails else 0)


if __name__ == "__main__":
    main()
