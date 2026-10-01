"""A stand-in for the staging app, for the dt-api and setter suites.

It reproduces ONLY what dt-api depends on, each piece cited to the code it imitates:
  * POST /api/auth/login — 404 unknown user (routes.ts:957), 401 wrong password (:961/:966),
    200 {accessToken, refreshToken, user{role}} (:976-990); the limiter: 5 per key per FIXED
    900 s window opening at the key's first hit, every attempt counted, draft-6 headers
    (express-rate-limit 8.1.0 dist/index.mjs:71,132,150,206-214), key = the socket address
    unless an X-Forwarded-For is present (trust proxy 2).
  * GET /api/auth/verify — signature and expiry only, no DB (:996-1012).
  * authenticateToken (:179-242) — 'No authentication credentials provided' (:184),
    'User account not found' (:219), 'Invalid or expired token' (:240, which a DB error also
    produces because it is thrown inside the same try).
Passwords are checked against `db.json` when one is given (the setter suite shares it with the
fake psql, and verifies with real bcrypt), else against an in-memory pair.
"""
import base64
import json
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def _b64(d):
    return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip("=")


class App:
    def __init__(self, user="testuser123", password="Crew_Pass1", role="owner", db_path=None):
        self.lock = threading.Lock()
        self.user, self.password, self.role = user, password, role
        self.db_path = db_path
        self.login_status = None          # force a status (e.g. 500) instead of normal handling
        self.force_role = None            # report this role on a login, whatever the row says
        self.login_status_times = None    # with login_status: force it only this many times
        self.login_status_skip = 0        # r3: with login_status: answer this many logins normally first
        self.db_ok = True
        self.user_missing = False
        self.route_401 = set()
        self.route_500 = set()            # r3: a route whose HANDLER fails after authenticateToken passed
        self.route_403 = set()            # Gate 1-1: a route's OWN authorization rule (the row has a role)
        self.no_role = False              # r3: the row has no role -> authenticateToken answers 403 (:222-224)
        self.login_body = None            # r3: replace a 200 login body (e.g. a JSON list)
        self.tokens = {}                  # token -> {"exp":, "revoked":}
        self.requests = []
        self.buckets = {}                 # key -> {"hits":, "reset":}
        self.limit, self.window = 5, 900
        self.token_life = 7 * 86400
        self.n = 0

    # ── helpers ──
    def _creds_ok(self, username, password):
        if self.db_path:
            import bcrypt
            with open(self.db_path) as fh:
                db = json.load(fh)
            row = db["users"].get(username)
            if row is None:
                return 404, None
            if not bcrypt.checkpw(password.encode(), row["password"].encode()):
                return 401, None
            return 200, row["role"]
        if username != self.user:
            return 404, None
        if password != self.password:
            return 401, None
        return 200, self.role

    def issue(self, role):
        self.n += 1
        now = int(time.time())
        payload = {"id": "u1", "username": self.user, "role": role, "iat": now,
                   "exp": now + self.token_life, "n": self.n}
        tok = "%s.%s.sig%d" % (_b64({"alg": "HS256", "typ": "JWT"}), _b64(payload), self.n)
        self.tokens[tok] = {"exp": payload["exp"], "revoked": False}
        return tok

    def revoke_all(self):
        for v in self.tokens.values():
            v["revoked"] = True

    def logins(self):
        return [r for r in self.requests if r[0] == "POST" and r[1] == "/api/auth/login"]


def make_handler(app):
    class H(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def _send(self, code, obj, extra=None):
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            for k, v in (extra or {}).items():
                self.send_header(k, v)
            self.end_headers()
            self.wfile.write(body)

        def _auth(self):
            h = self.headers.get("Authorization")
            if not h:
                return 401, {"error": "No authentication credentials provided"}
            tok = h.split(" ", 1)[1] if " " in h else ""
            t = app.tokens.get(tok)
            if not t or t["revoked"] or t["exp"] <= time.time():
                return 401, {"error": "Invalid or expired token"}
            if app.user_missing:
                return 401, {"error": "User account not found"}
            if not app.db_ok:
                return 401, {"error": "Invalid or expired token"}
            if app.no_role:
                return 403, {"error": "User account improperly configured - no role assigned"}
            return 200, None

        def _record(self, method):
            with app.lock:
                app.requests.append((method, self.path, dict(self.headers)))

        def do_POST(self):
            self._record("POST")
            n = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(n) if n else b""
            if self.path == "/api/auth/login":
                key = self.headers.get("X-Forwarded-For") or self.client_address[0]
                now = time.time()
                with app.lock:
                    b = app.buckets.get(key)
                    if not b or b["reset"] <= now:
                        b = app.buckets[key] = {"hits": 0, "reset": now + app.window}
                    b["hits"] += 1
                    rem = max(0, app.limit - b["hits"])
                    hdr = {"RateLimit-Policy": "%d;w=%d" % (app.limit, app.window),
                           "RateLimit-Limit": str(app.limit), "RateLimit-Remaining": str(rem),
                           "RateLimit-Reset": str(max(0, int(b["reset"] - now + 0.999)))}
                    if b["hits"] > app.limit:
                        return self._send(429, {"error": "Too many login attempts, please try again later."}, hdr)
                    if app.login_status and app.login_status_skip > 0:
                        app.login_status_skip -= 1
                    elif app.login_status and app.login_status_times != 0:
                        if app.login_status_times:
                            app.login_status_times -= 1
                        return self._send(app.login_status, {"error": "Login failed"}, hdr)
                    try:
                        j = json.loads(raw.decode())
                    except ValueError:
                        return self._send(400, {"error": "bad json"}, hdr)
                    st, role = app._creds_ok(j.get("username", ""), j.get("password", ""))
                    if st == 404:
                        return self._send(404, {"error": "User not found"}, hdr)
                    if st == 401:
                        return self._send(401, {"error": "Invalid credentials"}, hdr)
                    role = app.force_role or role
                    tok = app.issue(role)
                    if app.login_body is not None:
                        return self._send(200, app.login_body, hdr)
                    return self._send(200, {"accessToken": tok, "refreshToken": "r" + tok[-6:],
                                            "token": tok, "user": {"username": app.user,
                                                                   "role": role}}, hdr)
            st, err = self._auth()
            if st != 200:
                return self._send(st, err)
            return self._send(200, {"ok": True, "method": "POST", "path": self.path,
                                    "body_len": len(raw)})

        def do_PUT(self):
            self.do_POST()

        def do_GET(self):
            self._record("GET")
            if self.path == "/api/auth/verify":
                h = self.headers.get("Authorization") or ""
                tok = h.split(" ", 1)[1] if " " in h else ""
                t = app.tokens.get(tok)
                if not t or t["revoked"] or t["exp"] <= time.time():
                    return self._send(401, {"valid": False, "error": "Invalid or expired token"})
                return self._send(200, {"valid": True})
            st, err = self._auth()
            if st != 200:
                return self._send(st, err)
            if self.path.split("?")[0] in app.route_401:
                return self._send(401, {"error": "this route refuses"})
            if self.path.split("?")[0] in app.route_500:
                return self._send(500, {"error": "Failed to fetch settings"})
            if self.path.split("?")[0] in app.route_403:
                return self._send(403, {"error": "this route's own rule refuses"})
            return self._send(200, {"ok": True, "path": self.path,
                                    "mode": self.headers.get("x-app-mode")})

    return H


def serve(app):
    srv = ThreadingHTTPServer(("127.0.0.1", 0), make_handler(app))
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    return srv, srv.server_address[1]
