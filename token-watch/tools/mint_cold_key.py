"""
token-watch — mint the restricted B2 key for the off-box cold leg, ONCE. (B-TOKEN-WATCH-STORAGE OBJ-2, P2)

Run as root on staging:  python3 mint_cold_key.py
It uses the app's account-wide key (already on this box for the B75 rotator) to
create a key that can ONLY list, read and write under `token-watch/` in the
`dt-archive-cold` bucket — no `deleteFiles` — and writes it to
`/etc/token-watch/b2-cold.key` (0600 root:root), where systemd's
`LoadCredential=` hands it to the upload unit.

⛔ The new secret is returned by B2 exactly once. It is written inside this
   process under umask 077 and is NEVER printed, logged, put on a command line
   or sent anywhere else. Only the two key IDs are printed, for the governance
   record (so either key can be revoked).
⛔ No `validDurationInSeconds`: an expiring key would die quietly and be found
   only as an upload failure.
⛔ It refuses to run if the key file already exists — a second key is minted
   only after the first is deliberately revoked and its file removed.
"""

import base64
import json
import os
import sys
import urllib.request

APP_ENV = "/home/deploy/dawntrader/.env"
KEY_FILE = "/etc/token-watch/b2-cold.key"
BUCKET_NAME = "dt-archive-cold"
PREFIX = "token-watch/"
CAPABILITIES = ["listFiles", "readFiles", "writeFiles"]
KEY_NAME = "token-watch-cold-offbox"
AUTH_URL = "https://api.backblazeb2.com/b2api/v3/b2_authorize_account"
# v3 deliberately: only apiUrl, accountId and the token are read from it, and v3 b2_create_key takes a single
# bucketId. A single-bucket key created at v3 authorizes at v4 with that bucket in storageApi.allowed.buckets,
# which is what ops/cold_offbox.py and prove_cold_key.py read.


def app_key():
    env = {}
    with open(APP_ENV, encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line.startswith("B2_") and "=" in line:
                k, v = line.split("=", 1)
                env[k] = v.strip().strip('"').strip("'")
    return env["B2_KEY_ID"], env["B2_APPLICATION_KEY"]


def post(url, token, body):
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST",
                                 headers={"Authorization": token, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def main():
    if os.geteuid() != 0:
        sys.exit("run as root")
    if os.path.exists(KEY_FILE):
        sys.exit("%s already exists: revoke the old key and remove the file first" % KEY_FILE)
    master_id, master_secret = app_key()
    basic = base64.b64encode(("%s:%s" % (master_id, master_secret)).encode()).decode()
    with urllib.request.urlopen(urllib.request.Request(AUTH_URL, headers={"Authorization": "Basic " + basic}),
                                timeout=60) as r:
        auth = json.loads(r.read())
    api = auth["apiInfo"]["storageApi"]["apiUrl"]
    token = auth["authorizationToken"]
    buckets = post(api + "/b2api/v3/b2_list_buckets", token,
                   {"accountId": auth["accountId"], "bucketName": BUCKET_NAME})["buckets"]
    if len(buckets) != 1:
        sys.exit("bucket %s not found exactly once" % BUCKET_NAME)
    created = post(api + "/b2api/v3/b2_create_key", token, {
        "accountId": auth["accountId"], "keyName": KEY_NAME, "capabilities": CAPABILITIES,
        "bucketId": buckets[0]["bucketId"], "namePrefix": PREFIX,
    })
    os.makedirs(os.path.dirname(KEY_FILE), exist_ok=True)
    old = os.umask(0o077)
    try:
        fd = os.open(KEY_FILE, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as fh:
            fh.write("%s:%s\n" % (created["applicationKeyId"], created["applicationKey"]))
    finally:
        os.umask(old)
    os.chown(KEY_FILE, 0, 0)
    print(json.dumps({
        "new_key_id": created["applicationKeyId"], "account_wide_key_id": master_id,
        "capabilities": created.get("capabilities"), "namePrefix": created.get("namePrefix"),
        "bucket": BUCKET_NAME, "key_file": KEY_FILE, "expires": created.get("expirationTimestamp"),
    }, indent=2))


if __name__ == "__main__":
    main()
