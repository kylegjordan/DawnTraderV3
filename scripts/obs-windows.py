#!/usr/bin/env python3
"""dt-obs-windows — read the register of open observation windows (B-DEPLOY-WINDOW-GUARD, #1249).

Installed as /usr/local/bin/dt-obs-windows on staging (0755 root). ONE parser, used by two callers:
  * dt-deploy, before every deploy:   git show "$BRANCH":1-system-manual/DEPLOY_WINDOWS.jsonl | dt-obs-windows check ...
  * dt-install-drift, once a day:     the same blob | dt-obs-windows census
⚠️ THE NAME MUST NOT CONTAIN "dt-deploy". server/db-pool-alerts.ts:378 treats a process whose command line contains
   that substring as a live deploy (consumed at :146 when a lock has no readable pid). Pre-audit A-4 / C-8.

THE REGISTER (pre-audit P1). Line 1 is the header {"schema":"deploy-windows/1"} - so an EMPTY or TRUNCATED file is
refused, never read as "no windows". Then one JSON object per line, APPEND-ONLY (a window is closed by an entry,
never by deleting its row):
  open    {type, batch, owner, opened_at, end | (until_event + expected_by), review_by, disturbs, detail}
  amend   {type, batch, at, field, value, reason}     field: end | until_event | expected_by | review_by | disturbs | detail
  close   {type, batch, at, reason, note}             reason: completed | replaced | abandoned | superseded
  hold    {type, hold, row, opened_at, pending: [{batch, landing_sha}, ...]}
  release {type, hold, at}
Blank lines are allowed. Anything else is REFUSED BY NAME, line number first.

A window is STALE when now is past its review_by, or past its end, or past its expected_by. A stale window does not
block a deploy (scope J3); it is still reported, and dt-deploy still notifies its owner.

EXIT: 0 = read, and (check) the deploy may proceed · 4 = the register is unusable · 5 = (check) the deploy must not
proceed: an open window is not named, or a name is not an open window · 2 = this tool was called wrongly.
OUTPUT (stdout, one fact per line, values never contain spaces except after the last field):
  WINDOW <batch> <owner> <open|stale> <until-text>
  HOLD <hold> <row> <batch> <landing_sha>          (one line per pending batch of an unreleased hold)
  IN_WINDOW <batch/owner/state,...|none>           (check only: every window the deploy lands in, open or stale)
  STALE <batch> <owner> <reason>                   (census only)
Refusals go to stderr. A value the CALLER typed (an --in-window name) is never echoed, only its length (#987).
"""
import json
import re
import sys
from datetime import datetime, timezone

SCHEMA = "deploy-windows/1"
# The canonical deploy set: ALERT_ACTORS minus machine and advisory. server/tests/unit/dt-deploy-actor-parity.test.ts
# fails unless this tuple equals that derivation AND dt-deploy.sh's DEPLOY_ACTOR_LIST.
OWNERS = ("cc-a", "cc-b", "cc-c", "cc-infra", "codex-a", "codex-b", "codex-c", "codex-infra", "kyle", "langston", "coltrane")
CLOSE_REASONS = ("completed", "replaced", "abandoned", "superseded")
AMEND_FIELDS = ("end", "until_event", "expected_by", "review_by", "disturbs", "detail")
ISO = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
BATCH = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$")
SHA = re.compile(r"^[0-9a-f]{40}$")
FIELDS = {
    "open": ({"type", "batch", "owner", "opened_at", "review_by", "disturbs", "detail"},
             {"end", "until_event", "expected_by"}),
    "amend": ({"type", "batch", "at", "field", "value", "reason"}, set()),
    "close": ({"type", "batch", "at", "reason", "note"}, set()),
    "hold": ({"type", "hold", "row", "opened_at", "pending"}, set()),
    "release": ({"type", "hold", "at"}, set()),
}


class Refused(Exception):
    pass


def ts(value, where, name):
    if not isinstance(value, str) or not ISO.match(value):
        raise Refused("%s: %s is not a UTC time of the form YYYY-MM-DDTHH:MM:SSZ" % (where, name))
    try:
        return datetime.strptime(value, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    except ValueError:
        raise Refused("%s: %s is not a real date" % (where, name))


def text(value, where, name):
    if not isinstance(value, str) or not value.strip():
        raise Refused("%s: %s must be a non-empty string" % (where, name))
    if "\n" in value or "\r" in value:
        raise Refused("%s: %s must be one line" % (where, name))
    return value


def batch_id(value, where, name="batch"):
    if not isinstance(value, str) or not BATCH.match(value):
        raise Refused("%s: %s is not a batch id (letters, digits, . _ -, 2-64 chars)" % (where, name))
    return value


def parse(src):
    """The register as {batch: window} for every window still open, plus the unreleased holds. Raises Refused."""
    lines = src.split("\n")
    if not lines or lines[0].strip() == "":
        raise Refused("line 1: the header {\"schema\":\"%s\"} is missing - an empty or truncated register is refused" % SCHEMA)
    try:
        head = json.loads(lines[0])
    except ValueError:
        raise Refused("line 1: the header is not JSON")
    if head != {"schema": SCHEMA}:
        raise Refused("line 1: the header must be exactly {\"schema\":\"%s\"}" % SCHEMA)
    windows, holds = {}, {}
    for n, raw in enumerate(lines[1:], start=2):
        if raw.strip() == "":
            continue
        where = "line %d" % n
        try:
            rec = json.loads(raw)
        except ValueError:
            raise Refused("%s: not JSON" % where)
        if not isinstance(rec, dict):
            raise Refused("%s: not a JSON object" % where)
        kind = rec.get("type")
        if kind not in FIELDS:
            raise Refused("%s: unknown type (open, amend, close, hold, release)" % where)
        need, optional = FIELDS[kind]
        missing = sorted(need - set(rec))
        if missing:
            raise Refused("%s: %s is missing %s" % (where, kind, ", ".join(missing)))
        extra = sorted(set(rec) - need - optional)
        if extra:
            raise Refused("%s: %s has unknown field %s" % (where, kind, ", ".join(extra)))
        if kind == "open":
            b = batch_id(rec["batch"], where)
            if b in windows:
                raise Refused("%s: %s already has an open window - amend it, or close it first" % (where, b))
            if rec["owner"] not in OWNERS:
                raise Refused("%s: owner is not a canonical actor (%s)" % (where, " | ".join(OWNERS)))
            w = {"batch": b, "owner": rec["owner"], "opened_at": ts(rec["opened_at"], where, "opened_at"),
                 "review_by": ts(rec["review_by"], where, "review_by"),
                 "disturbs": text(rec["disturbs"], where, "disturbs"), "detail": text(rec["detail"], where, "detail"),
                 "end": None, "until_event": None, "expected_by": None}
            has_end, has_event = "end" in rec, ("until_event" in rec or "expected_by" in rec)
            if has_end == has_event:
                raise Refused("%s: an open window has EITHER end OR until_event + expected_by" % where)
            if has_end:
                w["end"] = ts(rec["end"], where, "end")
            else:
                if "until_event" not in rec or "expected_by" not in rec:
                    raise Refused("%s: an event window needs both until_event and expected_by" % where)
                w["until_event"] = text(rec["until_event"], where, "until_event")
                w["expected_by"] = ts(rec["expected_by"], where, "expected_by")
            windows[b] = w
        elif kind == "amend":
            b = batch_id(rec["batch"], where)
            ts(rec["at"], where, "at")
            text(rec["reason"], where, "reason")
            if b not in windows:
                raise Refused("%s: amend names %s, which has no open window" % (where, b))
            f = rec["field"]
            if f not in AMEND_FIELDS:
                raise Refused("%s: amend field must be one of %s" % (where, ", ".join(AMEND_FIELDS)))
            w = windows[b]
            if f in ("end", "review_by", "expected_by"):
                v = ts(rec["value"], where, "value")
            else:
                v = text(rec["value"], where, "value")
            if f == "end" and w["until_event"] is not None:
                raise Refused("%s: %s is an event window - amend until_event or expected_by, not end" % (where, b))
            if f in ("until_event", "expected_by") and w["end"] is not None:
                raise Refused("%s: %s is a timed window - amend end, not %s" % (where, b, f))
            w[f] = v
        elif kind == "close":
            b = batch_id(rec["batch"], where)
            ts(rec["at"], where, "at")
            if rec["reason"] not in CLOSE_REASONS:
                raise Refused("%s: close reason must be one of %s" % (where, ", ".join(CLOSE_REASONS)))
            if not isinstance(rec["note"], str) or "\n" in rec["note"]:
                raise Refused("%s: note must be a one-line string" % where)
            if b not in windows:
                raise Refused("%s: close names %s, which has no open window" % (where, b))
            del windows[b]
        elif kind == "hold":
            h = batch_id(rec["hold"], where, "hold")
            if h in holds:
                raise Refused("%s: hold %s is already open" % (where, h))
            text(rec["row"], where, "row")
            ts(rec["opened_at"], where, "opened_at")
            if not isinstance(rec["pending"], list):
                raise Refused("%s: pending must be a list" % where)
            pend = []
            for i, item in enumerate(rec["pending"]):
                if not isinstance(item, dict) or set(item) != {"batch", "landing_sha"}:
                    raise Refused("%s: pending[%d] must be exactly {batch, landing_sha}" % (where, i))
                pb = batch_id(item["batch"], where, "pending[%d].batch" % i)
                if not isinstance(item["landing_sha"], str) or not SHA.match(item["landing_sha"]):
                    raise Refused("%s: pending[%d].landing_sha is not a full 40-char sha" % (where, i))
                pend.append((pb, item["landing_sha"]))
            holds[h] = {"hold": h, "row": rec["row"], "pending": pend}
        elif kind == "release":
            h = batch_id(rec["hold"], where, "hold")
            ts(rec["at"], where, "at")
            if h not in holds:
                raise Refused("%s: release names %s, which is not an open hold" % (where, h))
            del holds[h]
    return windows, holds


def state(w, now):
    """('open'|'stale', reason) - stale is non-blocking (J3)."""
    if now > w["review_by"]:
        return "stale", "past its review_by %s" % w["review_by"].strftime("%Y-%m-%dT%H:%M:%SZ")
    if w["end"] is not None and now > w["end"]:
        return "stale", "past its end %s with no close entry" % w["end"].strftime("%Y-%m-%dT%H:%M:%SZ")
    if w["expected_by"] is not None and now > w["expected_by"]:
        return "stale", "past its expected_by %s with no close entry" % w["expected_by"].strftime("%Y-%m-%dT%H:%M:%SZ")
    return "open", ""


def until_text(w):
    if w["end"] is not None:
        return "until " + w["end"].strftime("%Y-%m-%dT%H:%M:%SZ")
    return "until %s (expected by %s)" % (w["until_event"], w["expected_by"].strftime("%Y-%m-%dT%H:%M:%SZ"))


def main(argv, stdin, out, err):
    if not argv or argv[0] not in ("check", "census"):
        err.write("usage: dt-obs-windows check|census [--now <UTC>] [--in-window <batch,...>] < register\n")
        return 2
    mode, rest = argv[0], argv[1:]
    now, names, seen = datetime.now(timezone.utc), None, set()
    while rest:
        flag = rest[0]
        if flag not in ("--now", "--in-window") or len(rest) < 2 or flag in seen:
            err.write("dt-obs-windows: REFUSED - bad or repeated argument (%d chars, not echoed)\n" % len(flag))
            return 2
        seen.add(flag)
        if flag == "--now":
            try:
                now = ts(rest[1], "--now", "value")
            except Refused as e:
                err.write("dt-obs-windows: REFUSED - %s\n" % e)
                return 2
        else:
            if mode != "check":
                err.write("dt-obs-windows: REFUSED - --in-window belongs to check only\n")
                return 2
            names = [x for x in rest[1].split(",")]
        rest = rest[2:]
    try:
        windows, holds = parse(stdin.read())
    except Refused as e:
        err.write("REGISTER REFUSED: %s\n" % e)
        return 4
    states = {b: state(w, now) for b, w in windows.items()}
    for b in sorted(windows):
        w = windows[b]
        out.write("WINDOW %s %s %s %s\n" % (b, w["owner"], states[b][0], until_text(w)))
    for h in sorted(holds):
        for pb, sha in holds[h]["pending"]:
            out.write("HOLD %s %s %s %s\n" % (h, holds[h]["row"].replace(" ", "_"), pb, sha))
    if mode == "census":
        for b in sorted(windows):
            if states[b][0] == "stale":
                out.write("STALE %s %s %s\n" % (b, windows[b]["owner"], states[b][1]))
        return 0
    named = set()
    if names is not None:
        for nm in names:
            if nm not in windows:
                err.write("WINDOWS REFUSED: --in-window names something that is not an open window "
                          "(%d chars, not echoed). Open now: %s\n" % (len(nm), ", ".join(sorted(windows)) or "none"))
                return 5
            if nm in named:
                err.write("WINDOWS REFUSED: --in-window names the same window twice\n")
                return 5
            named.add(nm)
    unnamed = [b for b in sorted(windows) if states[b][0] == "open" and b not in named]
    if unnamed:
        for b in unnamed:
            w = windows[b]
            err.write("WINDOWS REFUSED: %s is in an open observation window (owner %s, %s; disturbs: %s; detail: %s)\n"
                      % (b, w["owner"], until_text(w), w["disturbs"], w["detail"]))
        err.write("WINDOWS REFUSED: a deploy now lands inside %d open window(s). Talk to the owner(s); if the deploy "
                  "must go ahead, name EVERY open window: --in-window %s\n" % (len(unnamed), ",".join(unnamed)))
        return 5
    landed = ["%s/%s/%s" % (b, windows[b]["owner"], states[b][0]) for b in sorted(windows)]
    out.write("IN_WINDOW %s\n" % (",".join(landed) if landed else "none"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:], sys.stdin, sys.stdout, sys.stderr))
