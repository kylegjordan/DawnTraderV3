#!/usr/bin/env python3
"""A fake Postgres server that REJECTS every password, counting connection attempts.

Usage: fakepg.py <port> <certfile> <keyfile> <countfile>
Speaks just enough of the protocol: answers an SSLRequest with 'S' and wraps TLS, reads the StartupMessage,
asks for a cleartext password, then sends FATAL 28P01 "password authentication failed". Each accepted TCP
connection appends one line to <countfile> ("ssl" or "plain"). Local only (127.0.0.1)."""
import socket, ssl, struct, sys, threading

port, cert, key, countfile = int(sys.argv[1]), sys.argv[2], sys.argv[3], sys.argv[4]
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(cert, key)


def recv_exact(s, n):
    b = b""
    while len(b) < n:
        c = s.recv(n - len(b))
        if not c:
            raise ConnectionError("closed")
        b += c
    return b


def error(s):
    fields = b"SFATAL\x00VFATAL\x00C28P01\x00Mpassword authentication failed for user \"postgres\"\x00\x00"
    s.sendall(b"E" + struct.pack("!I", len(fields) + 4) + fields)


def handle(conn):
    kind = "plain"
    try:
        n = struct.unpack("!I", recv_exact(conn, 4))[0]
        body = recv_exact(conn, n - 4)
        code = struct.unpack("!I", body[:4])[0]
        if code == 80877103:                       # SSLRequest
            conn.sendall(b"S")
            conn = ctx.wrap_socket(conn, server_side=True)
            kind = "ssl"
            n = struct.unpack("!I", recv_exact(conn, 4))[0]
            body = recv_exact(conn, n - 4)
        elif code == 80877104:                     # GSSENCRequest: decline
            conn.sendall(b"N")
            n = struct.unpack("!I", recv_exact(conn, 4))[0]
            body = recv_exact(conn, n - 4)
            if struct.unpack("!I", body[:4])[0] == 80877103:
                conn.sendall(b"S")
                conn = ctx.wrap_socket(conn, server_side=True)
                kind = "ssl"
                n = struct.unpack("!I", recv_exact(conn, 4))[0]
                body = recv_exact(conn, n - 4)
        with open(countfile, "a") as fh:
            fh.write(kind + "\n")
        conn.sendall(b"R" + struct.pack("!II", 8, 3))     # AuthenticationCleartextPassword
        t = recv_exact(conn, 1)
        n = struct.unpack("!I", recv_exact(conn, 4))[0]
        recv_exact(conn, n - 4)
        error(conn)
    except Exception:
        pass
    finally:
        try:
            conn.close()
        except Exception:
            pass


srv = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
srv.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
srv.bind(("127.0.0.1", port))
srv.listen(8)
while True:
    c, _ = srv.accept()
    threading.Thread(target=handle, args=(c,), daemon=True).start()
