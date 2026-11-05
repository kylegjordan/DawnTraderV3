#!/usr/bin/env python3
"""Compare every live target of one deploy.sh group to its blob at a named sha.

Usage (on Helsinki, as root): python3 - <sha> <group> < live_vs_sha.py
Reads the manifest from comms-infra/discord/deploy.sh AT THAT SHA in the mirror, expands
$BRIDGE_DIR / $UNITS from the same file, hashes each live target and each blob, prints one
line per row, exits 0 only if every row is EQUAL; 1 if any differs or is missing; 2 on a
setup failure (unknown sha, no rows). A row count of zero is a failure, never a pass.
"""
import hashlib
import re
import subprocess
import sys

MIRROR = "/srv/dawntrader-backup.git"


def git(*a):
    return subprocess.run(["git", "-C", MIRROR, *a], check=True, capture_output=True).stdout


def main():
    sha, group = sys.argv[1], sys.argv[2]
    try:
        git("merge-base", "--is-ancestor", sha, "migration/aws-supabase")
        deploy = git("show", f"{sha}:comms-infra/discord/deploy.sh").decode()
    except subprocess.CalledProcessError as e:
        print(f"SETUP-FAIL: {e.stderr.decode().strip() or 'sha not on the branch in the mirror'}")
        return 2
    var = dict(re.findall(r'^(BRIDGE_DIR|UNITS)=(\S+)$', deploy, re.M))
    block = re.search(r'^MANIFEST="\n(.*?)^"', deploy, re.M | re.S)
    if not block or set(var) != {"BRIDGE_DIR", "UNITS"}:
        print(f"SETUP-FAIL: manifest or variables not found (vars={var})")
        return 2
    rows = [l.split("|") for l in block.group(1).splitlines() if l.startswith(group + "|")]
    if not rows:
        print(f"SETUP-FAIL: no {group} rows at {sha}")
        return 2
    bad = 0
    for _, src, dst, _mode in rows:
        for k, v in var.items():
            dst = dst.replace("$" + k, v)
        blob = hashlib.sha256(git("show", f"{sha}:{src}")).hexdigest()[:8]
        try:
            live = hashlib.sha256(open(dst, "rb").read()).hexdigest()[:8]
        except OSError as e:
            live = f"MISSING({e.strerror})"
        ok = blob == live
        bad += not ok
        print(f"{'EQUAL  ' if ok else 'DIFFERS'} blob={blob} live={live} {dst}")
    print(f"ROWS={len(rows)} DIFFER={bad} sha={sha} group={group}")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
