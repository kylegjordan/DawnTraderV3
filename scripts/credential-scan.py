#!/usr/bin/env python3
"""Find two retired credential literals in a committed DawnTrader tree."""

import argparse
import hashlib
import io
import json
import lzma
import re
import subprocess
import sys
import tarfile
import zipfile
import zlib


PATTERN_SOURCES = (
    (
        "81e4b8094859f54de1899cb293bcf63ab3f8b0e8:CLAUDE.md",
        rb"testuser123 / ([^`\s]+)`",
        14,
    ),
    (
        "686a84b14f41d87125df35b00a07991513b74d5b:server/startup/test-user-seeder.ts",
        rb'TEST_USER_PASSWORD\s*\|\|\s*"([^"]+)"',
        12,
    ),
)
EXCLUSION_FILE = "scripts/credential-scan-excludes.txt"
ARCHIVE_SUFFIXES = (b".zip", b".tar", b".tar.gz", b".tgz")


class ScanError(Exception):
    pass


def git(*args, data=None, cwd=None, accepted=(0,)):
    result = subprocess.run(["git", *args], cwd=cwd, input=data, capture_output=True)
    if result.returncode not in accepted or result.stderr:
        detail = result.stderr.decode("utf-8", errors="replace").strip()
        raise ScanError(f"git {args[0]} exited {result.returncode}: {detail}")
    return result.stdout


def read_patterns(root, patterns):
    for object_name, expression, length in PATTERN_SOURCES:
        content = git("cat-file", "blob", object_name, cwd=root)
        matches = set(re.findall(expression, content))
        if len(matches) != 1 or any(
            len(value) != length or re.fullmatch(rb"[!-~]+", value) is None
            for value in matches
        ):
            raise ScanError(f"{object_name} did not yield one valid credential pattern")
        patterns.extend(matches)
    if len(set(patterns)) != len(patterns):
        raise ScanError("Credential sources yielded the same pattern")


def read_tree(root, commit):
    result = {}
    for entry in git("ls-tree", "-r", "-z", "--full-tree", commit, cwd=root).split(b"\0")[:-1]:
        header, path = entry.split(b"\t", 1)
        mode, object_type, object_id = header.split()
        if object_type != b"blob":
            raise ScanError(f"unsupported tracked entry: {path.decode('utf-8', errors='replace')}")
        result[path] = (mode, object_id, entry)
    return result


def read_exclusions(root, commit, tree):
    content = git("cat-file", "blob", f"{commit}:{EXCLUSION_FILE}", cwd=root)
    excluded = set()
    for line in content.splitlines():
        if not line or line.startswith(b"#"):
            continue
        if line.startswith(b"@attached-assets "):
            pin = re.fullmatch(rb"@attached-assets ([1-9][0-9]*) ([0-9a-f]{64})", line)
            if pin is None:
                raise ScanError("invalid attached_assets manifest pin")
            paths = [path for path in tree if path.startswith(b"attached_assets/")]
            payload = b"".join(tree[path][2] + b"\0" for path in paths)
            if len(paths) != int(pin[1]) or hashlib.sha256(payload).hexdigest().encode() != pin[2]:
                raise ScanError("attached_assets count or manifest hash changed")
            excluded.update(paths)
        elif line in tree:
            excluded.add(line)
        else:
            raise ScanError(f"exclusion must name a tracked file: {line.decode('utf-8', errors='replace')}")
    return excluded


def tree_hits(root, commit, tree, patterns, excluded):
    # Pass patterns on stdin. Git returns just the committed paths, delimited by NUL.
    matches = git(
        "grep", "-a", "-l", "-z", "-F", "-f", "-", commit, "--",
        data=b"\n".join(patterns) + b"\n", cwd=root, accepted=(0, 1),
    )
    prefix = commit.encode("ascii") + b":"
    for item in matches.split(b"\0")[:-1]:
        path = item.removeprefix(prefix)
        if item == path or path not in tree:
            raise ScanError("git grep returned an unexpected path")
        if path not in excluded:
            yield path

    # Git grep ignores symbolic links. Scan their stored targets as bytes.
    for path, (mode, object_id, _) in tree.items():
        if mode == b"120000" and path not in excluded:
            target = git("cat-file", "blob", object_id.decode("ascii"), cwd=root)
            if any(pattern in target for pattern in patterns):
                yield path


def contains_pattern(stream, patterns):
    carry = b""
    overlap = max(map(len, patterns)) - 1
    while chunk := stream.read(64 * 1024):
        window = carry + chunk
        if any(pattern in window for pattern in patterns):
            return True
        carry = window[-overlap:]
    return False


def archive_hits(data, path, patterns):
    source = io.BytesIO(data)
    if path.lower().endswith(b".zip"):
        with zipfile.ZipFile(source) as archive:
            for member in archive.infolist():
                if not member.is_dir():
                    with archive.open(member) as stream:
                        if contains_pattern(stream, patterns):
                            yield member.filename
    else:
        with tarfile.open(fileobj=source, mode="r|*") as archive:
            for member in archive:
                if member.isfile():
                    with archive.extractfile(member) as stream:
                        if contains_pattern(stream, patterns):
                            yield member.name


def scan(root, commit, patterns, tree_only):
    tree = read_tree(root, commit)
    excluded = read_exclusions(root, commit, tree)
    file_hits = set(tree_hits(root, commit, tree, patterns, excluded))
    member_hits = []
    if not tree_only:
        for path, (mode, object_id, _) in tree.items():
            if mode == b"120000" or path in excluded or not path.lower().endswith(ARCHIVE_SUFFIXES):
                continue
            try:
                data = git("cat-file", "blob", object_id.decode("ascii"), cwd=root)
                member_hits.extend((path, name) for name in archive_hits(data, path, patterns))
            except (
                EOFError, OSError, RuntimeError, tarfile.TarError, zipfile.BadZipFile,
                lzma.LZMAError, zlib.error,
            ) as exc:
                name = path.decode("utf-8", errors="replace")
                raise ScanError(f"{name}: unable to scan archive ({type(exc).__name__})") from exc
    return file_hits, member_hits


def redact(text, patterns):
    for pattern in patterns:
        text = text.replace(pattern.decode("ascii"), "[redacted]")
    return text


def display_path(path, patterns):
    return json.dumps(redact(path, patterns), ensure_ascii=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("ref", nargs="?", default="HEAD", help="commit or branch to scan (default HEAD)")
    parser.add_argument("--tree-only", action="store_true", help="skip archive members")
    args = parser.parse_args()
    patterns = []
    try:
        root = git("rev-parse", "--show-toplevel").decode("utf-8").rstrip("\r\n")
        commit = git("rev-parse", "--verify", "--end-of-options", f"{args.ref}^{{commit}}", cwd=root)
        commit = commit.decode("ascii").strip()
        read_patterns(root, patterns)
        files, members = scan(root, commit, patterns, args.tree_only)
    except (ScanError, OSError) as exc:
        print(f"Credential scan refused: {redact(str(exc), patterns)}", file=sys.stderr)
        return 2

    for path in sorted(files):
        print(display_path(path.decode("utf-8", errors="surrogateescape"), patterns))
    for path, member in sorted(members):
        print(f"{display_path(path.decode('utf-8', errors='surrogateescape'), patterns)} "
              f"member {display_path(member, patterns)}")
    scope = "tracked files only" if args.tree_only else "tracked files and archive members"
    print(f"{scope}: {len(files)} matching files, {len(members)} matching archive members")
    return int(bool(files or members))


if __name__ == "__main__":
    sys.exit(main())
