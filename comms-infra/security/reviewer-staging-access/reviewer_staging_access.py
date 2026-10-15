#!/usr/bin/env python3
"""Verify Langston and Coltrane's independent staging-review access.

Run on Helsinki as root. The verifier selects each reviewer's dedicated key explicitly,
connects as staging's deploy user, then executes this same source from stdin on staging.
It never prints a public-key body, private-key material, or DATABASE_URL.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
from typing import Callable

try:
    import pwd
except ImportError:  # The parser self-test also runs in the Windows owner clone.
    pwd = None


STAGING_HOST = "188.245.193.8"
HELSINKI_SOURCE = "204.168.141.77"
ACTORS = {
    "langston": {
        "home": "/home/langston",
        "key": "/home/langston/.ssh/id_ed25519",
        "known_hosts": "/home/langston/.ssh/known_hosts",
        "fingerprint": "SHA256:gvtY9j7vBwXruVXaGNLhot/lWac/zVt3omObdSTHIQs",
        "comment": "langston@helsinki",
    },
    "coltrane": {
        "home": "/home/coltrane",
        "key": "/home/coltrane/.ssh/id_ed25519_staging",
        "known_hosts": "/home/coltrane/.ssh/known_hosts",
        "fingerprint": "SHA256:jbHGXwI7aVjXF/l/cizDWWmmdElO0Roy5ngQYPxUD1c",
        "comment": "coltrane-dt-agent@204.168.141.77",
    },
}


class VerificationError(RuntimeError):
    pass


def public_key_fields(line: str) -> tuple[str, str, str]:
    """Return (options, key material, comment) without accepting malformed lines."""
    words = line.split()
    index = next(
        (i for i, word in enumerate(words)
         if word.startswith(("ssh-", "ecdsa-", "sk-"))),
        None,
    )
    if index is None or index + 1 >= len(words):
        raise VerificationError("authorized_keys line has no complete public key")
    options = " ".join(words[:index])
    key_material = "%s %s" % (words[index], words[index + 1])
    comment = " ".join(words[index + 2:])
    return options, key_material, comment


def fingerprint_public_key(key_material: str) -> str:
    result = subprocess.run(
        ["ssh-keygen", "-lf", "-"],
        input=key_material + "\n",
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise VerificationError("ssh-keygen could not fingerprint a public key")
    fields = result.stdout.split()
    if len(fields) < 2 or not fields[1].startswith("SHA256:"):
        raise VerificationError("ssh-keygen returned an unrecognized fingerprint")
    return fields[1]


def validate_authorization(
    text: str,
    actor: str,
    fingerprint: Callable[[str], str] = fingerprint_public_key,
) -> dict[str, str]:
    expected = ACTORS[actor]
    matches: list[tuple[str, str]] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        options, key_material, comment = public_key_fields(line)
        if fingerprint(key_material) == expected["fingerprint"]:
            matches.append((options, comment))
    if len(matches) != 1:
        raise VerificationError(
            "%s fingerprint must occur exactly once; found %d" % (actor, len(matches))
        )
    options, comment = matches[0]
    required_option = 'from="%s"' % HELSINKI_SOURCE
    if options != required_option:
        raise VerificationError(
            "%s authorization options are %r, expected %r"
            % (actor, options or "<none>", required_option)
        )
    if comment != expected["comment"]:
        raise VerificationError(
            "%s authorization comment is %r, expected %r"
            % (actor, comment or "<none>", expected["comment"])
        )
    return {"options": options, "comment": comment}


def require_path(path: str, owner: str, mode: int, *, directory: bool = False) -> None:
    if pwd is None:
        raise VerificationError("live verification requires a Unix host")
    info = os.lstat(path)
    if stat.S_ISLNK(info.st_mode):
        raise VerificationError("%s must not be a symbolic link" % path)
    expected_kind = stat.S_ISDIR if directory else stat.S_ISREG
    if not expected_kind(info.st_mode):
        raise VerificationError("%s has the wrong filesystem type" % path)
    if not directory and info.st_nlink != 1:
        raise VerificationError("%s must have exactly one hard link" % path)
    actual_owner = pwd.getpwuid(info.st_uid).pw_name
    actual_mode = stat.S_IMODE(info.st_mode)
    if actual_owner != owner or actual_mode != mode:
        raise VerificationError(
            "%s is %s %04o, expected %s %04o"
            % (path, actual_owner, actual_mode, owner, mode)
        )


def private_key_fingerprint(path: str, owner: str) -> str:
    public = subprocess.run(
        ["sudo", "-u", owner, "ssh-keygen", "-yf", path],
        text=True,
        capture_output=True,
        check=False,
    )
    if public.returncode != 0:
        raise VerificationError("cannot derive %s public key" % owner)
    return fingerprint_public_key(public.stdout.strip())


def verify_remote(actor: str) -> int:
    if pwd is None:
        raise VerificationError("remote verification requires a Unix host")
    if os.geteuid() != pwd.getpwnam("deploy").pw_uid:
        raise VerificationError("remote verifier must run as deploy")
    require_path("/home/deploy/.ssh", "deploy", 0o700, directory=True)
    require_path("/home/deploy/.ssh/authorized_keys", "deploy", 0o600)
    authorization = validate_authorization(
        Path("/home/deploy/.ssh/authorized_keys").read_text(encoding="utf-8"), actor
    )

    logs = {}
    for path in ("/var/log/dawntrader/error.log", "/var/log/dawntrader/out.log"):
        if not os.access(path, os.R_OK):
            raise VerificationError("reviewer cannot read %s" % path)
        with open(path, "rb") as handle:
            if not handle.read(1):
                raise VerificationError("reviewer read an empty current log: %s" % path)
        logs[path] = os.stat(path).st_size
    if shutil.which("psql") != "/usr/bin/psql":
        raise VerificationError("psql does not resolve to /usr/bin/psql")

    # The connection URI must not appear in psql's argv: every local account can read argv.
    # Source it into a short-lived Python process, translate it to libpq environment fields,
    # remove DATABASE_URL, then exec psql with only the fixed query in argv.
    database_probe = r'''
import os
import subprocess
import sys
from urllib.parse import parse_qs, unquote, urlsplit

uri = urlsplit(os.environ["DATABASE_URL"])
if uri.scheme not in ("postgres", "postgresql") or not uri.hostname:
    raise SystemExit(2)
env = os.environ.copy()
env.pop("DATABASE_URL", None)
env.update({
    "PGHOST": uri.hostname,
    "PGPORT": str(uri.port or 5432),
    "PGUSER": unquote(uri.username or ""),
    "PGPASSWORD": unquote(uri.password or ""),
    "PGDATABASE": unquote(uri.path.lstrip("/")),
})
query = parse_qs(uri.query, keep_blank_values=True)
for source, target in {
    "sslmode": "PGSSLMODE",
    "sslrootcert": "PGSSLROOTCERT",
    "options": "PGOPTIONS",
}.items():
    if source in query and len(query[source]) == 1:
        env[target] = query[source][0]
env["PGOPTIONS"] = (env.get("PGOPTIONS", "") +
                    " -c default_transaction_read_only=on").strip()
result = subprocess.run(
    ["/usr/bin/psql", "-Atqc",
     "select current_user,current_database(),"
     "(select count(*) >= 0 from public.users),"
     "current_setting('transaction_read_only')"],
    text=True,
    capture_output=True,
    env=env,
    check=False,
)
sys.stdout.write(result.stdout)
sys.stderr.write(result.stderr)
raise SystemExit(result.returncode)
'''
    encoded_probe = base64.b64encode(database_probe.encode("utf-8")).decode("ascii")
    database = subprocess.run(
        [
            "bash", "--noprofile", "--norc", "-c",
            "cd /home/deploy/dawntrader && set -a && . ./.env && "
            "exec python3 -c 'import base64; exec(base64.b64decode(\"%s\"))'"
            % encoded_probe,
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    rows = database.stdout.strip().splitlines()
    fields = rows[0].split("|") if len(rows) == 1 else []
    if (database.returncode != 0 or len(fields) != 4
            or fields[2:] != ["t", "on"]):
        raise VerificationError("read-only database positive control failed")
    database_user, database_name = fields[:2]
    print(json.dumps({
        "actor": actor,
        "remote_identity": "deploy",
        "authorization": authorization,
        "readable_log_sizes": logs,
        "database_read": "ok",
        "database_user": database_user,
        "database_name": database_name,
    }, sort_keys=True))
    return 0


def verify_actor(actor: str) -> int:
    if pwd is None:
        raise VerificationError("live verification requires the Helsinki Unix host")
    if os.geteuid() != 0:
        raise VerificationError("Helsinki verifier must run as root")
    config = ACTORS[actor]
    require_path(config["home"] + "/.ssh", actor, 0o700, directory=True)
    require_path(config["key"], actor, 0o600)
    require_path(config["known_hosts"], actor, 0o600)
    actual_fingerprint = private_key_fingerprint(config["key"], actor)
    if actual_fingerprint != config["fingerprint"]:
        raise VerificationError(
            "%s key fingerprint is %s, expected %s"
            % (actor, actual_fingerprint, config["fingerprint"])
        )

    source = Path(__file__).read_text(encoding="utf-8")
    command = [
        "sudo", "-u", actor, "env", "HOME=" + config["home"],
        "ssh", "-F", "/dev/null", "-i", config["key"],
        "-o", "IdentitiesOnly=yes", "-o", "BatchMode=yes",
        "-o", "PreferredAuthentications=publickey",
        "-o", "PasswordAuthentication=no",
        "-o", "KbdInteractiveAuthentication=no",
        "-o", "GSSAPIAuthentication=no",
        "-o", "HostbasedAuthentication=no",
        "-o", "StrictHostKeyChecking=yes",
        "-o", "UserKnownHostsFile=" + config["known_hosts"],
        "-v",
        "deploy@" + STAGING_HOST,
        "python3 - verify-remote --actor " + actor,
    ]
    result = subprocess.run(
        command, input=source, text=True, capture_output=True, check=False, timeout=60
    )
    if result.returncode != 0:
        raise VerificationError(
            "%s live verification failed: %s"
            % (actor, (result.stderr or result.stdout).strip()[:500])
        )
    if ("Server accepts key:" not in result.stderr
            or config["fingerprint"] not in result.stderr
            or 'Authenticated to %s' % STAGING_HOST not in result.stderr
            or 'using "publickey"' not in result.stderr):
        raise VerificationError("%s SSH trace did not bind the accepted fingerprint" % actor)
    payload = json.loads(result.stdout)
    payload["local_key_fingerprint"] = actual_fingerprint

    # A fresh wrong key must fail with every non-public-key method disabled. This proves the
    # positive connection did not silently fall through to another local authentication path.
    temp_dir = tempfile.mkdtemp(prefix="reviewer-staging-negative-")
    try:
        os.chown(temp_dir, pwd.getpwnam(actor).pw_uid, pwd.getpwnam(actor).pw_gid)
        os.chmod(temp_dir, 0o700)
        wrong_key = temp_dir + "/id_ed25519"
        generated = subprocess.run(
            ["sudo", "-u", actor, "ssh-keygen", "-q", "-t", "ed25519",
             "-N", "", "-f", wrong_key],
            capture_output=True, text=True, check=False,
        )
        if generated.returncode != 0:
            raise VerificationError("could not create %s wrong-key control" % actor)
        negative = command.copy()
        negative[negative.index(config["key"])] = wrong_key
        negative[-1] = "true"
        failed = subprocess.run(
            negative, input="", text=True, capture_output=True, check=False, timeout=30
        )
        if failed.returncode == 0:
            raise VerificationError("%s wrong-key control authenticated" % actor)
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
    payload["wrong_key_control"] = "refused"
    print(json.dumps(payload, sort_keys=True))
    return 0


def self_test() -> int:
    fingerprints = {
        "LANGSTON": ACTORS["langston"]["fingerprint"],
        "COLTRANE": ACTORS["coltrane"]["fingerprint"],
        "OTHER": "SHA256:other",
    }

    def fake_fingerprint(material: str) -> str:
        return fingerprints[material.split()[1]]

    good = (
        'from="204.168.141.77" ssh-ed25519 LANGSTON langston@helsinki\n'
        'from="204.168.141.77" ssh-ed25519 COLTRANE '
        'coltrane-dt-agent@204.168.141.77\n'
    )
    checks = 0
    validate_authorization(good, "langston", fake_fingerprint); checks += 1
    validate_authorization(good, "coltrane", fake_fingerprint); checks += 1

    mutations = [
        (good.replace('from="204.168.141.77" ssh-ed25519 COLTRANE',
                      'ssh-ed25519 COLTRANE'), "coltrane"),
        (good + 'from="204.168.141.77" ssh-ed25519 COLTRANE '
                'coltrane-dt-agent@204.168.141.77\n', "coltrane"),
        (good.replace("coltrane-dt-agent@204.168.141.77", "wrong-comment"), "coltrane"),
        (good.replace("COLTRANE", "OTHER"), "coltrane"),
    ]
    for text, actor in mutations:
        try:
            validate_authorization(text, actor, fake_fingerprint)
        except VerificationError:
            checks += 1
        else:
            raise VerificationError("self-test mutation survived for %s" % actor)
    print("self-test passed: %d checks" % checks)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    verify = sub.add_parser("verify", help="run live verification from Helsinki")
    verify.add_argument("--actor", choices=["all", *ACTORS], default="all")
    remote = sub.add_parser("verify-remote", help=argparse.SUPPRESS)
    remote.add_argument("--actor", choices=ACTORS, required=True)
    sub.add_parser("self-test", help="run parser mutation checks")
    args = parser.parse_args()
    if args.command == "self-test":
        return self_test()
    if args.command == "verify-remote":
        return verify_remote(args.actor)
    actors = ACTORS if args.actor == "all" else [args.actor]
    for actor in actors:
        verify_actor(actor)
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except VerificationError as error:
        print("REFUSED: %s" % error, file=sys.stderr)
        raise SystemExit(2)
