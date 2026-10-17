#!/usr/bin/env python3
"""B-LANGSTON-RELIEF OBJ-3, one-time (Langston's ruling 2026-10-17, option A). Root, on Helsinki.

    python3 obj3_automem_hooks.py            # DRY RUN: proposed file + unified diff to a root-only dir
    python3 obj3_automem_hooks.py --apply    # archive the old file, then write the new one

His harness auto-memory index (/home/langston/.claude/projects/-home-langston/memory/MEMORY.md) was 25,478 B against
the harness's ~24.4 KB load limit, so the harness cut its last line on every invoke. Option A drops the hook text after
each `- [title](file.md)` link and keeps the title and link only - a dropped hook fails honestly ("open the file"),
where a truncated one can still read as a complete rule (Langston). The facts live in the linked files, each of which
carries its own `description:` frontmatter.

Refuses unless: every index line keeps its link and title byte-for-byte, the links stay in the same order and the same
set, every link target exists, and every non-index line is unchanged. The old file is archived, content-addressed,
under /home/langston/.memory-archive/ (owner-only) BEFORE the new one replaces it; the new one keeps the old owner and
mode. Not a langston-memory-write target (it is the harness's file), so nothing is appended to that tool's index.
"""
import difflib, hashlib, os, re, sys, tempfile

INDEX = "/home/langston/.claude/projects/-home-langston/memory/MEMORY.md"
ARCH = "/home/langston/.memory-archive"
# the title may itself hold brackets ("[[QUEUE id=... status=done]]"), so it ends at the FIRST "](" - a `[^\]]+`
# title skipped those lines and left their hooks (found on the dry run: 9,430 B vs Langston's 9,353 B)
LINK_RE = re.compile(r"^(- \[.*?\]\(([^)]+\.md)\))(.*)$")


def die(msg):
    print("REFUSED: " + msg)
    sys.exit(2)


def plan(text):
    lines = text.split("\n")
    out, links_old, links_new = [], [], []
    for l in lines:
        m = LINK_RE.match(l)
        if m:
            out.append(m.group(1))
            links_old.append(m.group(2))
        else:
            out.append(l)
    for l in out:
        m = LINK_RE.match(l)
        if m:
            links_new.append(m.group(2))
            if m.group(3):
                die("a rewritten line still carries text after its link: %r" % l[:80])
    if links_old != links_new:
        die("the link list changed")
    if [l for l in lines if not LINK_RE.match(l)] != [l for l in out if not LINK_RE.match(l)]:
        die("a non-index line changed")
    d = os.path.dirname(INDEX)
    missing = [t for t in links_old if not os.path.isfile(os.path.join(d, t))]
    if missing:
        die("%d link target(s) do not exist, first %r" % (len(missing), missing[0]))
    return "\n".join(out), links_old


def main():
    if os.geteuid() != 0:
        die("run as root")
    old_b = open(INDEX, "rb").read()
    new_text, links = plan(old_b.decode("utf-8"))
    new_b = new_text.encode("utf-8")
    old_sha = hashlib.sha256(old_b).hexdigest()
    print("%s: %d B -> %d B (%+d); %d index lines keep title + link, hooks dropped; %d targets exist"
          % (INDEX, len(old_b), len(new_b), len(new_b) - len(old_b), len(links), len(links)))
    d = tempfile.mkdtemp(prefix="obj3-automem-", dir="/root")
    open(os.path.join(d, "MEMORY.proposed.md"), "wb").write(new_b)
    open(os.path.join(d, "MEMORY.diff"), "w", encoding="utf-8").write("".join(difflib.unified_diff(
        old_b.decode("utf-8").splitlines(True), new_text.splitlines(True), "auto-memory MEMORY.md (live)",
        "auto-memory MEMORY.md (proposed)")))
    print("proposed file and diff: %s (root-only); old sha256 %s" % (d, old_sha))
    if "--apply" not in sys.argv:
        print("DRY RUN - nothing written")
        return 0
    st = os.stat(INDEX)
    arch = os.path.join(ARCH, old_sha + ".md")
    if not os.path.exists(arch):
        fd = os.open(arch, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "wb") as fh:
            fh.write(old_b)
            fh.flush()
            os.fsync(fh.fileno())
        os.chown(arch, st.st_uid, st.st_gid)
    if hashlib.sha256(open(arch, "rb").read()).hexdigest() != old_sha:
        die("the archive copy %s does not hash to the old file - nothing replaced" % arch)
    if hashlib.sha256(open(INDEX, "rb").read()).hexdigest() != old_sha:
        die("the index changed while this ran - nothing replaced")
    fd, tmp = tempfile.mkstemp(prefix=".MEMORY.md.automem-", dir=os.path.dirname(INDEX))
    with os.fdopen(fd, "wb") as fh:
        fh.write(new_b)
        fh.flush()
        os.fsync(fh.fileno())
    os.chown(tmp, st.st_uid, st.st_gid)
    os.chmod(tmp, st.st_mode & 0o7777)
    os.replace(tmp, INDEX)
    back = open(INDEX, "rb").read()
    print("WRITTEN: %s now %d B, sha256 %s; old file archived at %s" % (INDEX, len(back), hashlib.sha256(back).hexdigest(), arch))
    return 0 if back == new_b else 6


if __name__ == "__main__":
    sys.exit(main())
