#!/usr/bin/env python3
"""dt_handoff — B-TRANSCRIPT-ARCHIVE P8: the RESTART HANDOFF file and its GUARD (design §4-§5, scope OBJ-5).

    python3 -I dt_handoff.py write --alias CC-INFRA --repo <clone> --fields <fields.md> [--root <archive dir>]
    python3 -I dt_handoff.py guard --alias CC-INFRA --repo <clone> [--root <archive dir>]

WRITE — the session fills the PROSE fields in a markdown file with one `## <n>. <name>` section per field (1-14, design
§4); the tool READS the machine fields itself and stamps them (never a bare value - a pointer plus a reading): the ref
(`origin/<branch>` and `HEAD`, with the time), the dirty state (`git status --porcelain`), and the open dispatches from
the inbox log (the census). Fields 12-14 (withdrawn claims, owned triggers, the active pack) are REQUIRED: an explicit
`none` is allowed, a blank is refused. Written to `<root>/handoff/<alias>/<UTC>.md`, LF.

GUARD — run by the SessionStart hook before the session acts. It finds the latest handoff and re-derives each leg:
  ref       `git fetch` then `origin/<branch>` against the stamped one   -> `DRIFT ref: <old> -> <new>`
  head      `HEAD` against the stamped one
  dirty     `git status --porcelain` against the stamped state
  dispatch  the census, INDEPENDENTLY, since the handoff was written: a dispatch open now but NOT listed in the handoff
            -> `MISSING_OPEN_DISPATCH <id>` (STALE/BLOCKED); a listed one now answered -> `DRIFT dispatch: reply on <id>`;
            NOT RECEIVED posts are listed
  alerts    the due alerts now against the ids stamped in the handoff: a NEW one -> `DRIFT alert: <id>`
  validate  the pack path (field 14) exists and its ref resolves; the archive link (field 11) exists
The FIRST line is always exactly one banner: `HANDOFF GUARD: CLEAN` · `STALE (drift) — <legs>` · `AGED (backstop, no
drift found)` (older than 12 h, nothing drifted) · `GUARD FAILED — <leg> not checked` (a leg could not be read; the
handoff counts as STALE). STALE clears only by a NEW handoff with the field corrected, never by reading the banner.
What a CLEAN result means: "safe to resume and re-derive", never "every inherited claim is true" - judgements, dead ends
and promises cannot be re-derived and stay the earlier session's claim.
"""
import datetime
import glob
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_ROOT = os.path.join(os.path.expanduser("~"), ".claude", "transcript-archive")
BRANCH = "migration/aws-supabase"
AGE_S = 12 * 3600
FIELDS = ["position", "brief", "ref", "next gate", "dirty state", "open dispatches", "rulings", "evidence",
          "dead ends", "pending commitments", "archive link", "withdrawn claims", "owned triggers", "active pack"]
REQUIRED = (12, 13, 14)
SECTION = re.compile(r"^## (\d{1,2})\.\s*(.*)$")
MACHINE = re.compile(r"^```json handoff-machine\n(.*?)\n```$", re.S | re.M)
UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b")
HELSINKI = "root@204.168.141.77"
STAGING = "root@188.245.193.8"


class Refused(Exception):
    pass


def git(repo, *args, timeout=60):
    p = subprocess.run(["git", "-C", repo] + list(args), capture_output=True, timeout=timeout)
    if p.returncode != 0:
        raise RuntimeError("git %s failed (%d)" % (args[0], p.returncode))
    return p.stdout.decode("utf-8", "replace").strip()


def real_census(alias, since_ms):
    src = open(os.path.join(HERE, "dt_dispatch_census.py"), "rb").read()
    p = subprocess.run(["ssh", "-o", "ConnectTimeout=15", "-o", "BatchMode=yes", HELSINKI,
                        "python3 -I - --alias %s --since-ms %d" % (alias, since_ms)], input=src, capture_output=True,
                       timeout=120)
    return json.loads(p.stdout.decode("utf-8") or "{}")


def real_due_alerts():
    src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(HERE))), "scripts", "due-alerts.py"), "rb").read()
    p = subprocess.run(["ssh", "-o", "ConnectTimeout=15", "-o", "BatchMode=yes", STAGING, "python3 -"], input=src,
                       capture_output=True, timeout=120)
    out = p.stdout.decode("utf-8", "replace")
    if p.returncode != 0 or "COUNT" not in out:
        raise RuntimeError("the due-alert read did not complete")
    return sorted(set(UUID.findall(out)))


def now_utc():
    return datetime.datetime.now(datetime.timezone.utc)


def parse_fields(text):
    secs, cur = {}, None
    for line in text.split("\n"):
        m = SECTION.match(line)
        if m and 1 <= int(m.group(1)) <= 14:
            cur = int(m.group(1))
            secs[cur] = []
        elif cur is not None:
            secs[cur].append(line)
    return {k: "\n".join(v).strip() for k, v in secs.items()}


def write(alias, repo, fields_text, root, census=real_census, alerts=real_due_alerts, clock=now_utc, fetch=True):
    f = parse_fields(fields_text)
    for n in REQUIRED:
        if not f.get(n):
            raise Refused("field %d (%s) is REQUIRED - write `none` if there is none" % (n, FIELDS[n - 1]))
    t = clock()
    stamp = t.strftime("%Y-%m-%dT%H:%M:%SZ")
    since_ms = int(t.timestamp() * 1000) - 7 * 24 * 3600 * 1000
    c = census(alias, since_ms)
    if c.get("guard_failed"):
        raise Refused("the open-dispatch census could not be trusted: %s" % "; ".join(c["guard_failed"]))
    if fetch:   # stamp the CURRENT remote, or every guard after it starts STALE (measured: the first real run did)
        try:
            git(repo, "fetch", "-q", "origin", timeout=90)
        except Exception as e:     # noqa: BLE001
            raise Refused("git fetch failed, so the ref cannot be stamped as current (%s)" % e)
    machine = {"alias": alias, "written_at": stamp, "branch": BRANCH,
               "origin": git(repo, "rev-parse", "origin/" + BRANCH), "head": git(repo, "rev-parse", "HEAD"),
               "porcelain": git(repo, "status", "--porcelain"), "open_dispatches": [o["id"] for o in c.get("open", [])],
               "due_alerts": alerts()}
    listed = set(re.findall(r"\b\d{17,20}\b", f.get(6, "")))
    missing = [i for i in machine["open_dispatches"] if i not in listed]
    if missing:
        raise Refused("field 6 omits open dispatch(es) the log shows: %s" % ", ".join(missing))
    body = ["# Handoff — %s — %s" % (alias, stamp), "",
            "> Machine fields were READ by dt_handoff at %s; prose fields are the writing session's claims." % stamp, "",
            "```json handoff-machine", json.dumps(machine, indent=1), "```", ""]
    for n in range(1, 15):
        body += ["## %d. %s" % (n, FIELDS[n - 1]), f.get(n) or "(not given)", ""]
    d = os.path.join(root, "handoff", alias)
    os.makedirs(d, exist_ok=True)
    path = os.path.join(d, t.strftime("%Y%m%dT%H%M%SZ") + ".md")
    with open(path, "w", encoding="utf-8", newline="\n") as fh:
        fh.write("\n".join(body))
    return path


def latest(root, alias):
    files = sorted(glob.glob(os.path.join(root, "handoff", alias, "*.md")))
    return files[-1] if files else None


def guard(alias, repo, root, census=real_census, alerts=real_due_alerts, clock=now_utc, fetch=True):
    """Returns (banner, lines, handoff_text)."""
    path = latest(root, alias)
    if not path:
        return "HANDOFF GUARD: no handoff for %s" % alias, [], ""
    text = open(path, encoding="utf-8").read()
    m = MACHINE.search(text)
    if not m:
        return "GUARD FAILED — handoff machine block not checked (missing or unreadable in %s)" % os.path.basename(path), [], text
    try:
        mach = json.loads(m.group(1))
    except ValueError:
        return "GUARD FAILED — handoff machine block not checked (not JSON)", [], text
    fields = parse_fields(text)
    drift, failed, lines = [], [], []
    # ref
    try:
        if fetch:
            git(repo, "fetch", "-q", "origin", timeout=90)
        o = git(repo, "rev-parse", "origin/" + mach.get("branch", BRANCH))
        if o != mach.get("origin"):
            drift.append("ref")
            lines.append("DRIFT ref: origin/%s %s -> %s" % (mach.get("branch", BRANCH), mach.get("origin"), o))
    except Exception:      # noqa: BLE001
        failed.append("ref")
    # head + dirty
    try:
        h = git(repo, "rev-parse", "HEAD")
        if h != mach.get("head"):
            drift.append("head")
            lines.append("DRIFT head: %s -> %s" % (mach.get("head"), h))
        pc = git(repo, "status", "--porcelain")
        if pc != mach.get("porcelain", ""):
            drift.append("dirty")
            was, now = set(mach.get("porcelain", "").split("\n")) - {""}, set(pc.split("\n")) - {""}
            for x in sorted(now - was):
                lines.append("DRIFT dirty: new  %s" % x)
            for x in sorted(was - now):
                lines.append("DRIFT dirty: gone %s" % x)
    except Exception:      # noqa: BLE001
        failed.append("head/dirty")
    # dispatch (independent population, since the handoff was written minus a day for the ones it inherited)
    try:
        w = datetime.datetime.strptime(mach["written_at"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=datetime.timezone.utc)
        c = census(alias, int(w.timestamp() * 1000) - 7 * 24 * 3600 * 1000)
        if c.get("guard_failed"):
            failed.append("open-dispatch")
            lines += ["GUARD FAILED — open-dispatch leg: %s" % g for g in c["guard_failed"]]
        else:
            now_open = [o["id"] for o in c.get("open", [])]
            listed = set(re.findall(r"\b\d{17,20}\b", fields.get(6, ""))) | set(mach.get("open_dispatches", []))
            for i in now_open:
                if i not in listed:
                    drift.append("dispatch")
                    lines.append("MISSING_OPEN_DISPATCH %s" % i)
            for i in sorted(set(mach.get("open_dispatches", [])) - set(now_open)):
                drift.append("dispatch")
                lines.append("DRIFT dispatch: reply on %s since the handoff" % i)
            for i in c.get("not_received", []):
                lines.append("NOT RECEIVED — %s" % i)
            lines += c.get("not_checked", [])
    except Exception:      # noqa: BLE001
        failed.append("open-dispatch")
    # alerts
    try:
        now_a = alerts()
        for a in sorted(set(now_a) - set(mach.get("due_alerts", []))):
            drift.append("alert")
            lines.append("DRIFT alert: newly due %s" % a)
    except Exception:      # noqa: BLE001
        failed.append("alert")
    # validate the pack and the archive link
    pack = fields.get(14, "")
    if pack and pack.strip().lower() != "none":
        pm = re.search(r"`([^`]+\.md)`", pack)
        rm = re.search(r"\b([0-9a-f]{7,40})\b", pack)
        if not pm or not os.path.exists(os.path.join(repo, pm.group(1))):
            drift.append("pack")
            lines.append("DRIFT pack: path does not resolve (%s)" % (pm.group(1) if pm else "no `path.md` given"))
        if rm:
            try:
                git(repo, "cat-file", "-e", rm.group(1) + "^{commit}")
            except Exception:  # noqa: BLE001
                drift.append("pack")
                lines.append("DRIFT pack: ref %s does not resolve" % rm.group(1))
    link = fields.get(11, "")
    lm = re.search(r"`([^`]+\.md)`", link)
    if lm and not os.path.exists(os.path.join(root, lm.group(1))):
        drift.append("archive link")
        lines.append("DRIFT archive link: %s does not exist" % lm.group(1))
    age = (clock() - datetime.datetime.strptime(mach["written_at"], "%Y-%m-%dT%H:%M:%SZ")
           .replace(tzinfo=datetime.timezone.utc)).total_seconds()
    if failed:
        banner = "GUARD FAILED — %s not checked (the handoff counts as STALE)" % ", ".join(failed)
    elif drift:
        banner = "STALE (drift) — %s" % ", ".join(sorted(set(drift)))
        if "dispatch" in drift and any(l.startswith("MISSING_OPEN_DISPATCH") for l in lines):
            banner = "STALE/BLOCKED (drift) — %s" % ", ".join(sorted(set(drift)))
    elif age > AGE_S:
        banner = "AGED (backstop, no drift found)"
    else:
        banner = "HANDOFF GUARD: CLEAN — safe to resume and re-derive (not proof every inherited claim is true)"
    return banner, lines, text


def main(argv):
    try:
        sys.stdout.reconfigure(encoding="utf-8", newline="\n")
    except (AttributeError, ValueError):
        pass
    if len(argv) < 2 or argv[1] not in ("write", "guard"):
        sys.stderr.write(__doc__)
        return 2
    cmd, opts, it = argv[1], {}, iter(argv[2:])
    for a in it:
        if a in ("--alias", "--repo", "--fields", "--root"):
            opts[a] = next(it, None)
        else:
            sys.stderr.write("REFUSED: unknown argument at position %d\n" % argv.index(a))
            return 2
    root = opts.get("--root") or DEFAULT_ROOT
    if not opts.get("--alias") or not opts.get("--repo"):
        sys.stderr.write("REFUSED: --alias and --repo are required\n")
        return 2
    if cmd == "write":
        try:
            p = write(opts["--alias"], opts["--repo"], open(opts["--fields"], encoding="utf-8").read(), root)
        except (Refused, OSError, TypeError) as e:
            sys.stderr.write("REFUSED: %s\n" % e)
            return 4
        print(p)
        return 0
    banner, lines, text = guard(opts["--alias"], opts["--repo"], root)
    print(banner)
    for l in lines:
        print(l)
    if text:
        print("\n" + text)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
