#!/usr/bin/env python3
"""A stand-in for psql that understands ONLY the setter's two statements, against a JSON file.

The database file's path arrives as PGHOST (the test's pgpass line puts it there). It records its
own argv beside the file, so a suite can prove no hash ever rode argv. Knobs in the file:
  fail_writes_from: N  — the Nth write (1-based) and every later one fail like a lost connection
  sleep_on_write: S    — sleep S seconds before applying a write (to observe the lock)
It emulates the setter's CASE exactly: the transaction commits only if exactly one row matched
AND the RETURNING role equals the role the CASE names — so a write that sets only the password
returns the OLD role and rolls back, as Postgres would.
"""
import json
import os
import re
import sys
import time

db_path = os.environ["PGHOST"]
with open(db_path + ".argv", "a") as fh:
    fh.write(json.dumps(sys.argv) + "\n")
sql = sys.stdin.read()
with open(db_path) as fh:
    db = json.load(fh)


def save():
    tmp = db_path + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(db, fh)
    os.replace(tmp, db_path)


if sql.startswith("SELECT 'ORPHANS'"):
    print("ORPHANS|%d" % db.get("orphans", 0))
    sys.exit(0)

if sql.startswith("SELECT 'STATE'"):
    u = re.search(r"WHERE username = '([^']+)'", sql).group(1)
    row = db["users"].get(u)
    if row:
        print("STATE|1|%s|%s" % (row["role"], row["password"]))
    else:
        print("STATE|0||")
    sys.exit(0)

if "WITH u AS (UPDATE public.users SET" in sql:
    db["writes"] = db.get("writes", 0) + 1
    save()
    ff = db.get("fail_writes_from")
    if ff and db["writes"] >= ff:
        sys.stderr.write("server closed the connection unexpectedly\n")
        sys.exit(2)
    if db.get("sleep_on_write"):
        time.sleep(db["sleep_on_write"])
    h = re.search(r"SET password = '([^']*)'", sql).group(1)
    rm = re.search(r", role = '([^']*)'", sql)
    u = re.search(r"WHERE username = '([^']+)' RETURNING", sql).group(1)
    want = re.search(r"min\(role\) = '([^']*)' THEN", sql).group(1)
    row = db["users"].get(u)
    n = 1 if row else 0
    new_role = (rm.group(1) if rm else row["role"]) if row else ""
    if n == 1 and new_role == want:
        row["password"], row["role"] = h, new_role
        save()
        print("RESULT|committed|%d|%s" % (n, new_role))
    else:
        print("RESULT|rolledback|%d|%s" % (n, new_role))
    sys.exit(0)

sys.stderr.write("fakepsql: unrecognised statement\n")
sys.exit(3)
