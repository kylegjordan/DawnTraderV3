#!/usr/bin/env python3
"""Status-only P2 proof using the server-held crew token; never prints the token."""

import http.client
import json

TOKEN_FILE = "/var/lib/dt-api/token.json"
EXPECTED_ID = "6c591801-3072-431d-b192-30aaf426f15e"
EXPECTED_USERNAME = "testuser123"


def get(path: str, token: str | None) -> tuple[int, object]:
    headers = {"Accept": "application/json"}
    if token is not None:
        headers["Authorization"] = f"Bearer {token}"
    connection = http.client.HTTPConnection("127.0.0.1", 5000, timeout=15)
    connection.request("GET", path, headers=headers)
    response = connection.getresponse()
    raw = response.read()
    status = response.status
    connection.close()
    try:
        body: object = json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        body = None
    return status, body


with open(TOKEN_FILE, "r", encoding="utf-8") as handle:
    token_record = json.load(handle)
token = token_record.get("accessToken")
if not isinstance(token, str) or not token:
    raise SystemExit("REFUSED: server-held crew token is absent")

verify_status, verify_body = get("/api/auth/verify", token)
verify_user = verify_body.get("user") if isinstance(verify_body, dict) else None
if (
    verify_status != 200
    or not isinstance(verify_body, dict)
    or verify_body.get("valid") is not True
    or not isinstance(verify_user, dict)
    or verify_user.get("id") != EXPECTED_ID
    or verify_user.get("username") != EXPECTED_USERNAME
    or verify_user.get("role") != "editor"
):
    raise SystemExit("FAILED: bearer identity is not the immutable crew account")

settings_status, _ = get("/api/settings", token)
if settings_status != 200:
    raise SystemExit(f"FAILED: crew settings status={settings_status}")

admin_status, admin_body = get("/api/admin/users", token)
expected_denial = {
    "error": "Access denied",
    "message": "Admin privileges required",
}
if admin_status != 403 or admin_body != expected_denial:
    raise SystemExit("FAILED: crew admin route did not return the exact admin denial")

no_token_status, _ = get("/api/settings", None)
if no_token_status != 401:
    raise SystemExit(f"FAILED: no-token settings control status={no_token_status}")

print(
    "P2 API PASS "
    f"id={EXPECTED_ID} username={EXPECTED_USERNAME} "
    f"verify={verify_status} settings={settings_status} "
    f"admin={admin_status} no_token={no_token_status}"
)
