#!/usr/bin/env python3
"""Verify Langston and Coltrane's independent staging-review access.

Run on Helsinki as root. The verifier selects each reviewer's dedicated key explicitly,
connects as staging's deploy user, then executes this same source from stdin on staging.
It never prints a public-key body, private-key material, or DATABASE_URL.
"""

from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
import time
from typing import Callable

try:
    import pwd
except ImportError:  # The parser self-test also runs in the Windows owner clone.
    pwd = None


STAGING_HOST = "188.245.193.8"
HELSINKI_SOURCE = "204.168.141.77"
STAGING_PSQL = "/usr/local/bin/psql"   # the B-DB-READ-TOOL wrapper (comms-infra/staging/psql-wrapper)
STAGING_DT_SQL = "/usr/local/bin/dt-sql"   # the B-DB-READ-TOOL one-attempt reader; the database control runs through it
DT_SQL_BUSY_TRIES = 3
DT_SQL_BUSY_WAIT_S = 5   # a dt-sql call measured 0.30 s (B-DB-READ-TOOL log); 5 s spans many calls, and BUSY is rare
# The remote verifier makes DT_SQL_CALLS dt-sql calls. One call that ATTEMPTS a login is bounded by dt-sql's own
# psql timeout (CALL_TIMEOUT_S = 300, comms-infra/staging/dt-sql:69) plus, if that attempt locks it, the alert it raises
# (subprocess timeout 150, dt-sql:171). The client ssh timeout must exceed that whole remote worst case: killing dt-sql
# mid-attempt leaves its INTENT behind and LOCKS it `ambiguous` for every caller (dt-sql:34), which is far worse than
# this check failing.
DT_SQL_CALLS = 2                 # the read, then the read-only write probe (verify_remote)
DT_SQL_CALL_BOUND_S = 300 + 150  # dt-sql CALL_TIMEOUT_S + its alert subprocess timeout
REMOTE_OTHER_BOUND_S = 60        # ssh login, the sshd/log/path checks and the JSON reply around the two calls
REMOTE_BUDGET_S = DT_SQL_CALLS * ((DT_SQL_BUSY_TRIES - 1) * DT_SQL_BUSY_WAIT_S + DT_SQL_CALL_BOUND_S) + REMOTE_OTHER_BOUND_S
CLIENT_SSH_TIMEOUT_S = REMOTE_BUDGET_S + 30
# C-3 (Langston F-2): every other command this verifier starts has its own bound, so nothing can hang the unit.
LOCAL_TOOL_TIMEOUT_S = 10   # ssh-keygen, sudo test/cat, sshd -T: each is a sub-second local command
WRONG_KEY_TIMEOUT_S = 30    # the wrong-key ssh control: one refused login, no remote command
# The remote verifier starts dt-sql ONLY if everything before it took at most this long. Its pre-dt-sql work fans out
# (a file read per effective authorization file, a fingerprint per key line), so per-call bounds alone cannot cap it;
# this gate does. Refusing BEFORE dt-sql starts is always safe: no attempt, no INTENT, no lock.
REMOTE_PRE_DT_SQL_S = 30
REMOTE_LOGIN_REPLY_S = 30   # the ssh login before verify_remote starts and the JSON reply after it ends
# The systemd unit's TimeoutStartSec. systemd kills the whole unit cgroup at this limit, grandchildren included, so it
# is the backstop for anything a per-call timeout kills only at the direct child (a `sudo -u` wrapper).
UNIT_TIMEOUT_START_S = 2400
DT_SQL_EXIT = {
    1: "logged in, the query failed",
    2: "refused before connecting",
    3: "connection refused - possible address ban",
    4: "dt-sql is LOCKED - see dt-sql --status",
    5: "dt-sql BUSY on every try",
}
# A write the database must refuse inside a read-only session. If it ever succeeded it would create a temporary table
# that vanishes with the session, so the probe cannot leave anything behind. It names no setting, so dt-sql's guard
# against SQL naming the read-only switch does not refuse it before connecting.
DT_SQL_WRITE_PROBE = "create temp table reviewer_ro_probe(a int)"
READ_ONLY_REFUSAL = "cannot execute CREATE TABLE in a read-only transaction"
NL = chr(10)
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
# One actor, worst case: two key-fingerprint tools, the client ssh call, the wrong-key keygen, the wrong-key control.
PER_ACTOR_WORST_S = 3 * LOCAL_TOOL_TIMEOUT_S + CLIENT_SSH_TIMEOUT_S + WRONG_KEY_TIMEOUT_S
TIMEOUT_NAMES = ("LOCAL_TOOL_TIMEOUT_S", "CLIENT_SSH_TIMEOUT_S", "WRONG_KEY_TIMEOUT_S")   # the only allowed bounds
UNIT_WORST_CASE_S = len(ACTORS) * PER_ACTOR_WORST_S   # `verify --actor all` runs the actors one after another


class VerificationError(RuntimeError):
    pass


def bounded_run(argv: list[str], what: str, **kwargs) -> "subprocess.CompletedProcess[str]":
    """A local tool call with a hard time bound; a timeout is a REFUSED line, never a hang or a traceback."""
    try:
        return subprocess.run(argv, text=True, capture_output=True, check=False,
                              timeout=LOCAL_TOOL_TIMEOUT_S, **kwargs)
    except subprocess.TimeoutExpired as error:
        raise VerificationError("%s did not finish within %d s" % (what, LOCAL_TOOL_TIMEOUT_S)) from error


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
    result = bounded_run(["ssh-keygen", "-lf", "-"], "ssh-keygen fingerprinting a public key",
                         input=key_material + "\n")
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
    return validate_authorization_population(
        [("<inline>", text)], actor, fingerprint
    )


def validate_authorization_population(
    sources: list[tuple[str, str]],
    actor: str,
    fingerprint: Callable[[str], str] = fingerprint_public_key,
) -> dict[str, str]:
    expected = ACTORS[actor]
    matches: list[tuple[str, str, str]] = []
    for source, text in sources:
        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            options, key_material, comment = public_key_fields(line)
            option_keywords = [option.lower() for option in options.split(",")]
            if "cert-authority" in option_keywords:
                raise VerificationError(
                    "effective authorization files must not contain cert-authority entries"
                )
            if fingerprint(key_material) == expected["fingerprint"]:
                matches.append((source, options, comment))
    if len(matches) != 1:
        raise VerificationError(
            "%s fingerprint must occur exactly once across effective authorization "
            "files; found %d" % (actor, len(matches))
        )
    source, options, comment = matches[0]
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
    return {"source": source, "options": options, "comment": comment}


def parse_effective_authorization_sources(text: str) -> list[str]:
    values: dict[str, list[str]] = {}
    for raw in text.splitlines():
        fields = raw.strip().split(None, 1)
        if len(fields) == 2:
            values.setdefault(fields[0], []).append(fields[1])

    def one(name: str) -> str:
        found = values.get(name, [])
        if len(found) != 1:
            raise VerificationError(
                "effective sshd output must contain one %s value; found %d"
                % (name, len(found))
            )
        return found[0]

    for directive in (
        "authorizedkeyscommand",
        "trustedusercakeys",
        "authorizedprincipalsfile",
        "authorizedprincipalscommand",
    ):
        if one(directive) != "none":
            raise VerificationError(
                "effective sshd %s must be none so every public-key source is enumerable"
                % directive
            )
    files = one("authorizedkeysfile").split()
    if not files or files == ["none"] or "none" in files:
        raise VerificationError("effective sshd authorizedkeysfile has no enumerable files")
    return files


def resolve_authorized_key_paths(tokens: list[str]) -> list[str]:
    if pwd is None:
        raise VerificationError("authorization path resolution requires a Unix host")
    home = "/home/deploy"
    uid = str(pwd.getpwnam("deploy").pw_uid)
    paths = []
    for token in tokens:
        path = token.replace("%%", "\0")
        path = path.replace("%h", home).replace("%u", "deploy").replace("%U", uid)
        path = path.replace("\0", "%")
        if "%" in path:
            raise VerificationError(
                "effective sshd authorizedkeysfile contains an unsupported token: %s"
                % token
            )
        if not os.path.isabs(path):
            path = os.path.join(home, path)
        paths.append(os.path.normpath(path))
    if len(paths) != len(set(paths)):
        raise VerificationError("effective sshd authorizedkeysfile contains duplicate paths")
    return paths


def read_root_text_if_exists(path: str) -> str | None:
    exists = bounded_run(["sudo", "-n", "/usr/bin/test", "-e", path], "testing authorization file %s" % path)
    if exists.returncode == 1:
        return None
    if exists.returncode != 0:
        raise VerificationError("cannot test effective authorization file %s" % path)
    result = bounded_run(["sudo", "-n", "/usr/bin/cat", "--", path], "reading authorization file %s" % path)
    if result.returncode != 0:
        raise VerificationError("cannot read effective authorization file %s" % path)
    return result.stdout


def validate_wrong_key_refusal(returncode: int, stderr: str) -> None:
    if returncode != 255:
        raise VerificationError(
            "wrong-key control returned %d rather than SSH authentication refusal 255"
            % returncode
        )
    if "Server accepts key:" in stderr or "Authenticated to " in stderr:
        raise VerificationError("wrong-key control reached an accepted authentication state")
    required = (
        "Authentications that can continue: publickey",
        "No more authentication methods to try.",
        "Permission denied (publickey).",
    )
    if any(marker not in stderr for marker in required):
        raise VerificationError(
            "wrong-key control did not contain an explicit public-key denial trace"
        )


def validate_client_ssh_command(command: list[str]) -> None:
    options = [
        command[index + 1]
        for index, value in enumerate(command[:-1])
        if value == "-o"
    ]
    if options.count("CertificateFile=none") != 1:
        raise VerificationError(
            "SSH command must disable automatic sidecar certificates exactly once"
        )


def validate_no_sidecar_certificate(key_path: str) -> None:
    certificate = key_path + "-cert.pub"
    try:
        os.lstat(certificate)
    except FileNotFoundError:
        return
    raise VerificationError("reviewer key has a forbidden sidecar certificate: %s" % certificate)


def validate_accepted_key_trace(
    stderr: str, key_path: str, fingerprint: str
) -> None:
    accepted = [line for line in stderr.splitlines() if "Server accepts key:" in line]
    if len(accepted) != 1:
        raise VerificationError(
            "SSH trace must contain exactly one accepted-key line; found %d"
            % len(accepted)
        )
    line = accepted[0]
    fields = line.split()
    if (key_path not in fields or fingerprint not in fields or "ED25519" not in fields
            or any("CERT" in field.upper() for field in fields)):
        raise VerificationError(
            "SSH trace did not bind acceptance to the raw ED25519 reviewer key"
        )
    if ('Authenticated to %s' % STAGING_HOST not in stderr
            or 'using "publickey"' not in stderr):
        raise VerificationError("SSH trace did not prove public-key authentication")


def failure_text(stderr: str, stdout: str) -> str:
    """What a failed `ssh -v` run says, without its debug trace: the trace fills the first 500 characters, so the
    remote verifier's own refusal (its last stderr lines) was never shown — every failure since 2026-11-17 read as
    ssh debug output alone."""
    lines = [line for line in (stderr or "").splitlines()
             if line.strip() and not line.startswith(("debug1:", "debug2:", "debug3:", "OpenSSH_"))]
    text = NL.join(lines).strip() or (stdout or "").strip()
    return text[-500:]


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
    public = bounded_run(["sudo", "-u", owner, "ssh-keygen", "-yf", path], "deriving the %s public key" % owner)
    if public.returncode != 0:
        raise VerificationError("cannot derive %s public key" % owner)
    return fingerprint_public_key(public.stdout.strip())


def parse_dt_sql_bounds(text: str) -> dict[str, int]:
    """dt-sql's own two time bounds, read from its source WITHOUT running it: CALL_TIMEOUT_S (the psql call) and the
    alert subprocess timeout inside alert(). DT_SQL_CALL_BOUND_S is their sum copied by hand; staging reports these so
    the client refuses the day dt-sql's bounds rise past the copy (Langston F-2 round 3 C-2). Exactly one of each, or REFUSED."""
    lines = text.split(NL)
    call = [line for line in lines if line.startswith("CALL_TIMEOUT_S = ")]
    if len(call) != 1:
        raise VerificationError("dt-sql source: expected exactly one CALL_TIMEOUT_S line, found %d" % len(call))
    value = call[0][len("CALL_TIMEOUT_S = "):].strip()
    if not (value.isascii() and value.isdigit()):
        raise VerificationError("dt-sql source: CALL_TIMEOUT_S is not an integer literal: %r" % value)
    start = [i for i, line in enumerate(lines) if line.startswith("def alert(")]
    if len(start) != 1:
        raise VerificationError("dt-sql source: expected exactly one alert() function, found %d" % len(start))
    body = []
    for line in lines[start[0] + 1:]:
        if line and not line[0].isspace():
            break
        body.append(line)
    found = []
    for line in body:
        rest = line
        while "timeout=" in rest:
            rest = rest.split("timeout=", 1)[1]
            digits = ""
            for ch in rest:
                if not ch.isdigit():
                    break
                digits += ch
            if not digits:
                raise VerificationError("dt-sql source: alert() has a timeout= that is not an integer literal")
            found.append(int(digits))
    if len(found) != 1:
        raise VerificationError("dt-sql source: expected exactly one timeout= in alert(), found %d" % len(found))
    return {"call_timeout_s": int(value), "alert_timeout_s": found[0]}


def check_dt_sql_bounds(actor: str, payload: dict) -> None:
    """The client half of C-2: REFUSED unless staging reported dt-sql's bounds and their sum fits DT_SQL_CALL_BOUND_S."""
    bounds = payload.get("dt_sql_bounds")
    keys = ("call_timeout_s", "alert_timeout_s")
    if (not isinstance(bounds, dict) or sorted(bounds) != sorted(keys)
            or not all(type(bounds[k]) is int and bounds[k] > 0 for k in keys)):
        raise VerificationError("%s staging did not report dt-sql's call bounds" % actor)
    reported = bounds["call_timeout_s"] + bounds["alert_timeout_s"]
    if DT_SQL_CALL_BOUND_S < reported:
        raise VerificationError(
            "%s dt-sql on staging can now run %d s per call, above DT_SQL_CALL_BOUND_S %d s: raise the bound, or this "
            "check's ssh timeout can kill dt-sql mid-attempt and lock it" % (actor, reported, DT_SQL_CALL_BOUND_S))


def run_dt_sql(sql: str) -> "subprocess.CompletedProcess[str]":
    """One dt-sql call. Exit 5 (BUSY) means another dt-sql call held the lock and NO login was attempted, so it is
    retried; nothing else is — exit 3 (connection refused, a possible ban) and 4 (LOCKED) fail at once."""
    for attempt in range(DT_SQL_BUSY_TRIES):
        result = subprocess.run([STAGING_DT_SQL, "-c", sql], text=True, capture_output=True, check=False)
        if result.returncode != 5:
            break
        if attempt + 1 < DT_SQL_BUSY_TRIES:
            time.sleep(DT_SQL_BUSY_WAIT_S)
    return result


def verify_remote(actor: str) -> int:
    started = time.monotonic()
    if pwd is None:
        raise VerificationError("remote verification requires a Unix host")
    if os.geteuid() != pwd.getpwnam("deploy").pw_uid:
        raise VerificationError("remote verifier must run as deploy")
    require_path("/home/deploy/.ssh", "deploy", 0o700, directory=True)
    require_path("/home/deploy/.ssh/authorized_keys", "deploy", 0o600)
    effective = bounded_run(
        [
            "sudo", "-n", "/usr/sbin/sshd", "-T", "-C",
            "user=deploy,host=%s,addr=%s,laddr=%s,lport=22"
            % (HELSINKI_SOURCE, HELSINKI_SOURCE, STAGING_HOST),
        ],
        "resolving the effective sshd configuration",
    )
    if effective.returncode != 0:
        raise VerificationError("cannot resolve effective sshd authorization sources")
    configured_files = resolve_authorized_key_paths(
        parse_effective_authorization_sources(effective.stdout)
    )
    expected_file = "/home/deploy/.ssh/authorized_keys"
    if expected_file not in configured_files:
        raise VerificationError(
            "expected staging authorization file is not effective for deploy"
        )
    authorization_sources = []
    existing_files = []
    for path in configured_files:
        body = read_root_text_if_exists(path)
        if body is not None:
            existing_files.append(path)
            authorization_sources.append((path, body))
    authorization = validate_authorization_population(
        authorization_sources, actor
    )

    logs = {}
    for path in ("/var/log/dawntrader/error.log", "/var/log/dawntrader/out.log"):
        if not os.access(path, os.R_OK):
            raise VerificationError("reviewer cannot read %s" % path)
        with open(path, "rb") as handle:
            if not handle.read(1):
                raise VerificationError("reviewer read an empty current log: %s" % path)
        logs[path] = os.stat(path).st_size
    # B-DB-READ-TOOL (#1259) puts a root-owned wrapper at /usr/local/bin/psql in front of /usr/bin/psql: it refuses
    # while dt-sql is LOCKED or holds an unfinished attempt, and defaults sslmode to require so a wrong password is
    # sent once, not twice (Supabase bans an address after two). The reviewer's own `psql` resolves to it, so the
    # positive control below runs THROUGH it — the check proves what the reviewer will actually use, and this daily
    # login can no longer be the second wrong password the wrapper exists to stop. Its content is dt-install-drift's
    # to prove on staging; here: the path, a root-owned 0755 regular file deploy cannot rewrite.
    if shutil.which("psql") != STAGING_PSQL:
        raise VerificationError("psql does not resolve to %s" % STAGING_PSQL)
    require_path(STAGING_PSQL, "root", 0o755)

    # The database positive control goes THROUGH dt-sql (Langston F-2, 2026-11-20). dt-sql makes ONE login attempt per
    # call, writes an INTENT before it, and LOCKS on a refused login (credential arm, critical alert), so neither this
    # daily check nor any helper after it can send the second wrong password that gets the address banned. It also keeps
    # the connection string out of every argv and sets read-only through PGOPTIONS — the two things the hand-built probe here did.
    # The old probe also read current_setting('transaction_read_only') and required "on". dt-sql refuses any SQL that
    # names that setting (exit 2), so read-only is re-proved BY BEHAVIOUR instead: a second call attempts a write and
    # must be refused by the database as a read-only transaction (Langston, F-2 install confirmation 2026-11-20).
    require_path(STAGING_DT_SQL, "root", 0o755)
    dt_sql_bounds = parse_dt_sql_bounds(Path(STAGING_DT_SQL).read_text(encoding="utf-8"))
    # C-3 gate: the client's ssh timeout assumes the pre-dt-sql work fits REMOTE_PRE_DT_SQL_S. Past it, dt-sql could
    # still be mid-attempt when the client kills this session, which LOCKS dt-sql — so refuse now, before it starts.
    elapsed = time.monotonic() - started
    if elapsed > REMOTE_PRE_DT_SQL_S:
        raise VerificationError(
            "pre-database checks took %.1f s, above REMOTE_PRE_DT_SQL_S %d s: dt-sql was NOT started"
            % (elapsed, REMOTE_PRE_DT_SQL_S))
    query = "select current_user,current_database(),(select count(*) >= 0 from public.users)"
    database = run_dt_sql(query)
    rows = database.stdout.strip().splitlines()
    fields = rows[0].split("|") if len(rows) == 1 else []
    if database.returncode != 0 or len(fields) != 3 or fields[2] != "t":
        raise VerificationError(
            "read-only database positive control failed (dt-sql exit %d: %s): %s"
            % (database.returncode, DT_SQL_EXIT.get(database.returncode, "unexpected exit"),
               database.stderr.strip()[-300:] or "no stderr"))
    database_user, database_name = fields[:2]
    probe = run_dt_sql(DT_SQL_WRITE_PROBE)
    if probe.returncode != 1 or READ_ONLY_REFUSAL not in probe.stderr:
        raise VerificationError(
            "database session is not proven read-only: the write probe was not refused as a read-only transaction "
            "(dt-sql exit %d: %s): %s"
            % (probe.returncode, DT_SQL_EXIT.get(probe.returncode, "unexpected exit") if probe.returncode else
               "the write SUCCEEDED", probe.stderr.strip()[-300:] or "no stderr"))
    print(json.dumps({
        "actor": actor,
        "remote_identity": "deploy",
        "authorization": authorization,
        "effective_authorization_files": configured_files,
        "existing_authorization_files": existing_files,
        "readable_log_sizes": logs,
        "database_read": "ok",
        "database_write_refused": "ok",
        "dt_sql_bounds": dt_sql_bounds,
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
    validate_no_sidecar_certificate(config["key"])
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
        "-o", "CertificateFile=none",
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
    validate_client_ssh_command(command)
    try:
        result = subprocess.run(
            command, input=source, text=True, capture_output=True, check=False, timeout=CLIENT_SSH_TIMEOUT_S
        )
    except subprocess.TimeoutExpired as error:
        raise VerificationError(
            "%s live verification did not finish within %d s (remote budget %d s)"
            % (actor, CLIENT_SSH_TIMEOUT_S, REMOTE_BUDGET_S)
        ) from error
    if result.returncode != 0:
        raise VerificationError(
            "%s live verification failed: %s"
            % (actor, failure_text(result.stderr, result.stdout))
        )
    try:
        validate_accepted_key_trace(
            result.stderr, config["key"], config["fingerprint"]
        )
    except VerificationError as error:
        raise VerificationError("%s %s" % (actor, error)) from error
    payload = json.loads(result.stdout)
    payload["local_key_fingerprint"] = actual_fingerprint

    # A fresh wrong key must fail with every non-public-key method disabled. This proves the
    # positive connection did not silently fall through to another local authentication path.
    temp_dir = tempfile.mkdtemp(prefix="reviewer-staging-negative-")
    try:
        os.chown(temp_dir, pwd.getpwnam(actor).pw_uid, pwd.getpwnam(actor).pw_gid)
        os.chmod(temp_dir, 0o700)
        wrong_key = temp_dir + "/id_ed25519"
        generated = bounded_run(
            ["sudo", "-u", actor, "ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", wrong_key],
            "creating the %s wrong-key control" % actor,
        )
        if generated.returncode != 0:
            raise VerificationError("could not create %s wrong-key control" % actor)
        negative = command.copy()
        negative[negative.index(config["key"])] = wrong_key
        negative[-1] = "true"
        try:
            failed = subprocess.run(
                negative, input="", text=True, capture_output=True, check=False, timeout=WRONG_KEY_TIMEOUT_S
            )
        except subprocess.TimeoutExpired as error:
            raise VerificationError("%s wrong-key control did not finish within %d s"
                                    % (actor, WRONG_KEY_TIMEOUT_S)) from error
        try:
            validate_wrong_key_refusal(failed.returncode, failed.stderr)
        except VerificationError as error:
            raise VerificationError("%s %s" % (actor, error)) from error
    finally:
        shutil.rmtree(temp_dir, ignore_errors=True)
    payload["wrong_key_control"] = "explicit_publickey_denial"
    # (c): checked LAST, so a dt-sql bound rise still lets the access legs (accepted key, wrong-key refusal) run first
    check_dt_sql_bounds(actor, payload)
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

    try:
        validate_authorization_population(
            [
                ("/one", good),
                ("/two", 'ssh-ed25519 COLTRANE coltrane-dt-agent@204.168.141.77\n'),
            ],
            "coltrane",
            fake_fingerprint,
        )
    except VerificationError:
        checks += 1
    else:
        raise VerificationError("cross-file duplicate authorization mutation survived")

    effective = (
        "authorizedkeysfile .ssh/authorized_keys .ssh/authorized_keys2\n"
        "authorizedkeyscommand none\n"
        "trustedusercakeys none\n"
        "authorizedprincipalsfile none\n"
        "authorizedprincipalscommand none\n"
    )
    if parse_effective_authorization_sources(effective) != [
        ".ssh/authorized_keys", ".ssh/authorized_keys2"
    ]:
        raise VerificationError("effective authorization parser returned wrong files")
    checks += 1
    for mutated in (
        effective.replace("authorizedkeyscommand none", "authorizedkeyscommand /bin/true"),
        effective.replace("trustedusercakeys none", "trustedusercakeys /etc/ssh/ca.pub"),
    ):
        try:
            parse_effective_authorization_sources(mutated)
        except VerificationError:
            checks += 1
        else:
            raise VerificationError("alternate SSH authorization source mutation survived")

    refusal = (
        "debug1: Authentications that can continue: publickey\n"
        "debug1: No more authentication methods to try.\n"
        "deploy@188.245.193.8: Permission denied (publickey).\n"
    )
    validate_wrong_key_refusal(255, refusal); checks += 1
    wrong_key_mutations = [
        (1, 'Authenticated to 188.245.193.8 using "publickey".\n'),
        (255, "ssh: connect to host 188.245.193.8 port 22: Connection timed out\n"),
    ]
    for returncode, stderr in wrong_key_mutations:
        try:
            validate_wrong_key_refusal(returncode, stderr)
        except VerificationError:
            checks += 1
        else:
            raise VerificationError("wrong-key refusal mutation survived")

    client_command = ["ssh", "-o", "CertificateFile=none", "staging"]
    validate_client_ssh_command(client_command); checks += 1
    try:
        validate_client_ssh_command(["ssh", "staging"])
    except VerificationError:
        checks += 1
    else:
        raise VerificationError("missing CertificateFile=none mutation survived")

    raw_trace = (
        "debug1: Server accepts key: /reviewer/key ED25519 "
        + ACTORS["coltrane"]["fingerprint"] + " explicit\n"
        + 'Authenticated to 188.245.193.8 using "publickey".\n'
    )
    validate_accepted_key_trace(
        raw_trace, "/reviewer/key", ACTORS["coltrane"]["fingerprint"]
    ); checks += 1
    try:
        validate_accepted_key_trace(
            raw_trace.replace(" ED25519 ", " ED25519-CERT "),
            "/reviewer/key",
            ACTORS["coltrane"]["fingerprint"],
        )
    except VerificationError:
        checks += 1
    else:
        raise VerificationError("accepted certificate trace mutation survived")

    with tempfile.TemporaryDirectory(prefix="reviewer-certificate-mutation-") as temp:
        user_key = os.path.join(temp, "reviewer")
        ca_key = os.path.join(temp, "ca")
        for path in (user_key, ca_key):
            generated = subprocess.run(
                ["ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", path],
                capture_output=True,
                text=True,
                check=False,
            )
            if generated.returncode != 0:
                raise VerificationError("certificate mutation key generation failed")
        signed = subprocess.run(
            ["ssh-keygen", "-q", "-s", ca_key, "-I", "reviewer-mutation",
             "-n", "deploy", user_key + ".pub"],
            capture_output=True,
            text=True,
            check=False,
        )
        if signed.returncode != 0:
            raise VerificationError("certificate mutation signing failed")
        raw_public = Path(user_key + ".pub").read_text(encoding="utf-8").strip()
        cert_public = Path(user_key + "-cert.pub").read_text(encoding="utf-8").strip()
        if fingerprint_public_key(raw_public) != fingerprint_public_key(cert_public):
            raise VerificationError(
                "certificate mutation positive control did not preserve key fingerprint"
            )
        ca_public = Path(ca_key + ".pub").read_text(encoding="utf-8").strip()
        mutation = good + "cert-authority " + ca_public + " unrestricted-ca\n"
        rejected_authority = False
        rejected_sidecar = False
        try:
            validate_authorization_population(
                [("/effective", mutation)], "coltrane", fake_fingerprint
            )
        except VerificationError:
            rejected_authority = True
        try:
            validate_no_sidecar_certificate(user_key)
        except VerificationError:
            rejected_sidecar = True
        if not rejected_authority or not rejected_sidecar:
            raise VerificationError(
                "sidecar certificate plus cert-authority mutation survived"
            )
        checks += 1
    for option in ("CERT-AUTHORITY", "CeRt-AuThOrItY"):
        mutation = good + option + " ssh-ed25519 OTHER unrestricted-ca\n"
        try:
            validate_authorization_population(
                [("/effective", mutation)], "coltrane", fake_fingerprint
            )
        except VerificationError:
            checks += 1
        else:
            raise VerificationError(
                "case-insensitive cert-authority mutation survived: %s" % option
            )
    # the live failure text: ssh -v's trace must not hide the remote verifier's own refusal (11-17 .. 11-20)
    trace = "OpenSSH_9.6p1 Ubuntu" + NL + NL.join("debug1: line %d" % i for i in range(40))
    refusal = "VerificationError: psql does not resolve to /usr/local/bin/psql"
    shown = failure_text(trace + NL + refusal + NL + "debug1: Exit status 1", "")
    if refusal not in shown or "debug1:" in shown:
        raise VerificationError("failure text mutation survived: %r" % shown[:120])
    checks += 1
    if failure_text(trace, "only stdout") != "only stdout":
        raise VerificationError("failure text fallback to stdout mutation survived")
    checks += 1
    # the reviewer's own `psql` must still resolve to the B-DB-READ-TOOL wrapper, never /usr/bin/psql
    import inspect
    body = inspect.getsource(verify_remote)
    if '"/usr/bin/psql"' in body or "require_path(STAGING_PSQL" not in body:
        raise VerificationError("the psql wrapper check is gone from the verifier")
    checks += 1
    # the database control runs through dt-sql (F-2): no hand-built psql login, no DATABASE_URL handling of its own,
    # dt-sql's ownership checked first, and only BUSY (5, no attempt made) retried
    runner = inspect.getsource(run_dt_sql)
    if ("[STAGING_DT_SQL, \"-c\", sql]" not in runner or "run_dt_sql(query)" not in body
            or "require_path(STAGING_DT_SQL" not in body or "DATABASE_URL" in body or "-Atqc" in body):
        raise VerificationError("database probe does not go through dt-sql")
    checks += 1
    if "result.returncode != 5" not in runner or "range(DT_SQL_BUSY_TRIES)" not in runner:
        raise VerificationError("database probe retries something other than dt-sql BUSY, or does not retry it")
    checks += 1
    # read-only is re-proved in-session by a write the database must refuse: exit 1 AND the read-only refusal text,
    # so a write that SUCCEEDS (exit 0) or a login/lock failure (2-5) can never pass
    if ("run_dt_sql(DT_SQL_WRITE_PROBE)" not in body or "probe.returncode != 1" not in body
            or "READ_ONLY_REFUSAL not in probe.stderr" not in body or not DT_SQL_WRITE_PROBE.startswith("create temp ")
            or "read-only transaction" not in READ_ONLY_REFUSAL):
        raise VerificationError("the in-session read-only write probe is missing or can pass on a write")
    checks += 1
    # the client ssh timeout covers the remote worst case (every dt-sql call BUSY to its last try, then running to
    # dt-sql's own bound), so the client never kills dt-sql mid-attempt and locks it (F-2 round 3, Langston)
    if body.count("run_dt_sql(") != DT_SQL_CALLS:
        raise VerificationError("DT_SQL_CALLS is %d but the remote verifier makes %d dt-sql calls"
                                % (DT_SQL_CALLS, body.count("run_dt_sql(")))
    if DT_SQL_CALL_BOUND_S < 300 + 150:
        raise VerificationError("DT_SQL_CALL_BOUND_S %d s is below dt-sql's own call bound of 450 s" % DT_SQL_CALL_BOUND_S)
    worst = DT_SQL_CALLS * ((DT_SQL_BUSY_TRIES - 1) * DT_SQL_BUSY_WAIT_S + DT_SQL_CALL_BOUND_S)
    if CLIENT_SSH_TIMEOUT_S <= worst or REMOTE_BUDGET_S <= worst:
        raise VerificationError("client ssh timeout %d s does not cover the remote worst case %d s"
                                % (CLIENT_SSH_TIMEOUT_S, worst))
    # the stated invariant itself: the client outlasts the WHOLE remote budget, not only the dt-sql part of it
    # (Langston C-1: CLIENT = REMOTE_BUDGET_S - 30 passed every comparison above)
    if CLIENT_SSH_TIMEOUT_S <= REMOTE_BUDGET_S:
        raise VerificationError("client ssh timeout %d s does not exceed the remote budget %d s"
                                % (CLIENT_SSH_TIMEOUT_S, REMOTE_BUDGET_S))
    actor_body = inspect.getsource(verify_actor)
    if "timeout=CLIENT_SSH_TIMEOUT_S" not in actor_body or "timeout=60" in actor_body:
        raise VerificationError("the verifier's ssh call is not bounded by the derived client timeout")
    checks += 1
    # a timeout is a REFUSED line, never a traceback: every bounded call in verify_actor is caught
    if actor_body.count("except subprocess.TimeoutExpired") != actor_body.count("timeout="):
        raise VerificationError("a bounded call in the verifier lets TimeoutExpired escape as a traceback")
    checks += 1
    # C-2, staging half: dt-sql's two bounds are read from its source, exactly one of each, never by running it
    good = NL.join(["CALL_TIMEOUT_S = 300", "", "def alert(arm, detail):", "    x = 1",
                    "    r = subprocess.run(argv, timeout=150)", "", "def run_psql(argv):",
                    "    proc.communicate(timeout=CALL_TIMEOUT_S)"])
    if parse_dt_sql_bounds(good) != {"call_timeout_s": 300, "alert_timeout_s": 150}:
        raise VerificationError("dt-sql bounds parser misread a known source")
    # each refusal must also SAY the right thing (C-4: a non-integer value no longer reads as "found 1")
    for bad, why, says in (
        (good.replace("CALL_TIMEOUT_S = 300", "CALL_TIMEOUT_S = 3OO"), "a non-integer call timeout", "integer literal"),
        (good.replace("CALL_TIMEOUT_S = 300", "# none"), "a missing call timeout", "found 0"),
        (good + NL + "CALL_TIMEOUT_S = 900", "a second call timeout", "found 2"),
        (good.replace("timeout=150)", "timeout=150, x=timeout=9)"), "two alert timeouts", "alert"),
        (good.replace("timeout=150", "timeout=ALERT_S"), "a named alert timeout", "alert"),
        (good.replace("def alert(", "def alarm("), "a missing alert()", "alert"),
    ):
        try:
            parse_dt_sql_bounds(bad)
        except VerificationError as error:
            if says not in str(error):
                raise VerificationError("dt-sql bounds parser refused %s with the wrong reason: %s" % (why, error))
            continue
        raise VerificationError("dt-sql bounds parser accepted %s" % why)
    remote_body = inspect.getsource(verify_remote)
    if ("parse_dt_sql_bounds(Path(STAGING_DT_SQL).read_text(" not in remote_body
            or '"dt_sql_bounds": dt_sql_bounds' not in remote_body):
        raise VerificationError("the remote verifier does not report dt-sql's bounds")
    checks += 1
    # C-2, client half: refused unless the reported sum fits DT_SQL_CALL_BOUND_S
    if "check_dt_sql_bounds(actor, payload)" not in actor_body:
        raise VerificationError("the verifier does not check dt-sql's reported bounds")
    check_dt_sql_bounds("t", {"dt_sql_bounds": {"call_timeout_s": DT_SQL_CALL_BOUND_S - 150, "alert_timeout_s": 150}})
    for bounds, why in (
        ({"call_timeout_s": DT_SQL_CALL_BOUND_S - 149, "alert_timeout_s": 150}, "a sum above the bound"),
        (None, "no report"),
        ({"call_timeout_s": 300}, "a missing alert bound"),
        ({"call_timeout_s": True, "alert_timeout_s": 150}, "a boolean bound"),
        ({"call_timeout_s": 0, "alert_timeout_s": 0}, "zero bounds"),
    ):
        try:
            check_dt_sql_bounds("t", {"dt_sql_bounds": bounds} if bounds is not None else {})
        except VerificationError:
            continue
        raise VerificationError("dt-sql bounds check accepted %s" % why)
    checks += 1
    # (c): the bounds check runs LAST in verify_actor, after the wrong-key control, so both access legs still run
    if actor_body.index("check_dt_sql_bounds(actor, payload)") < actor_body.index('payload["wrong_key_control"]'):
        raise VerificationError("dt-sql bounds are checked before the wrong-key control runs")
    checks += 1
    # C-3: every subprocess call in this file is bounded, except run_dt_sql's (dt-sql bounds itself, and a client
    # timeout there would kill it mid-attempt). Read from the parsed source, so a new call cannot slip past by naming.
    import ast
    tree = ast.parse(Path(__file__).read_text(encoding="utf-8"))
    for func in [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef)]:
        if func.name == "self_test":
            continue
        for call in [n for n in ast.walk(func) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)]:
            owner = call.func.value.id if isinstance(call.func.value, ast.Name) else ""
            if owner == "os" and call.func.attr in ("system", "popen"):
                raise VerificationError("%s starts a command with os.%s" % (func.name, call.func.attr))
            if owner != "subprocess":
                continue
            if call.func.attr != "run":
                raise VerificationError("%s uses subprocess.%s; only bounded subprocess.run is allowed"
                                        % (func.name, call.func.attr))
            limits = [k.value for k in call.keywords if k.arg == "timeout"]
            if func.name == "run_dt_sql" and limits:
                raise VerificationError("run_dt_sql has a client timeout: it would kill dt-sql mid-attempt")
            if func.name != "run_dt_sql" and not limits:
                raise VerificationError("an unbounded subprocess.run in %s (line %d)" % (func.name, call.lineno))
            # a literal (timeout=3000) would escape UNIT_WORST_CASE_S; only the constants it is built from count
            if any(not (isinstance(v, ast.Name) and v.id in TIMEOUT_NAMES) for v in limits):
                raise VerificationError("%s line %d: a timeout that is not one of %s"
                                        % (func.name, call.lineno, ", ".join(TIMEOUT_NAMES)))
    checks += 1
    # C-3 gate: verify_remote starts its clock first, and refuses before its first dt-sql call when the pre-database
    # work has run long; that work plus the login and reply must fit what REMOTE_BUDGET_S leaves outside dt-sql
    gate = ("    elapsed = time.monotonic() - started\n    if elapsed > REMOTE_PRE_DT_SQL_S:\n"
            "        raise VerificationError(")
    if (remote_body.count("started = ") != 1
            or remote_body.index("    started = time.monotonic()\n") > remote_body.index("require_path(")
            or remote_body.count(gate) != 1 or remote_body.index(gate) > remote_body.index("run_dt_sql(")):
        raise VerificationError("the pre-dt-sql time gate is missing or sits after the first dt-sql call")
    if REMOTE_PRE_DT_SQL_S + REMOTE_LOGIN_REPLY_S > REMOTE_OTHER_BOUND_S:
        raise VerificationError("pre-dt-sql gate %d s + login/reply %d s exceed REMOTE_OTHER_BOUND_S %d s"
                                % (REMOTE_PRE_DT_SQL_S, REMOTE_LOGIN_REPLY_S, REMOTE_OTHER_BOUND_S))
    checks += 1
    # C-3 unit: systemd's TimeoutStartSec outlasts the whole `--actor all` worst case, and the unit file says so
    if UNIT_TIMEOUT_START_S <= UNIT_WORST_CASE_S:
        raise VerificationError("UNIT_TIMEOUT_START_S %d s does not exceed the --actor all worst case %d s"
                                % (UNIT_TIMEOUT_START_S, UNIT_WORST_CASE_S))
    checks += 1
    units = [Path(__file__).resolve().parents[2] / "systemd" / "reviewer-staging-access.service",
             Path("/etc/systemd/system/reviewer-staging-access.service")]
    unit = next((u for u in units if u.is_file()), None)
    if unit is None:
        print("note: no unit file here to compare (repo or /etc/systemd/system); TimeoutStartSec not checked")
    else:
        lines = [l.strip() for l in unit.read_text(encoding="utf-8").splitlines()]
        found = [l for l in lines if l.startswith("TimeoutStartSec=")]
        if found != ["TimeoutStartSec=%d" % UNIT_TIMEOUT_START_S]:
            raise VerificationError("%s: TimeoutStartSec is %r, expected exactly TimeoutStartSec=%d"
                                    % (unit, found, UNIT_TIMEOUT_START_S))
        checks += 1
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
