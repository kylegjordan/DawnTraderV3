#!/usr/bin/env python3
"""dt_dispatch_census — B-TRANSCRIPT-ARCHIVE P8: the OPEN-DISPATCH POPULATION for one session, derived from the inbox
log ALONE (scope OBJ-5, Langston C-4: never from the handoff it grades). Runs on Helsinki, stdlib + the address rule:

    ssh root@204.168.141.77 'python3 -I - --alias CC-B --since-ms <ms>' < dt_dispatch_census.py

Prints ONE JSON object: {"open": [{"id", "at_ms", "note"}], "ended": n, "not_handled": [ids], "queued": [{"id", "at_ms"}],
"failed_notified": [ids], "guard_failed": [...], "not_checked": [...], "counts": {...}}. Any guard_failed entry means the leg could not be trusted: the guard prints
`GUARD FAILED — open-dispatch leg: <reason>` and never a green. The rules (pre-audit P8, each a drill case):
  * DISPATCH RAIL: `langston_inbound` rows in the window whose `sender_username` maps to this alias (exact strings).
    Deduplicated on message_id; the window is cut on the Discord SNOWFLAKE's own time, never on `ts`.
  * A dispatch is ENDED only by a `langston_outbound`/`langston_outbound_media` row with reply_to == its id AND a
    non-null message_id of its own (a reply with no message id is a post that FAILED), or by a `langston_silent` row whose
    reason is EXACTLY one of the four DECLINE strings. `bridge_error_suppressed`, `circuit_breaker`, `post_failed`
    leave it OPEN, with the reason. Any other silent reason in the window -> GUARD FAILED.
  * A `langston_outbound` carrying `failure_notice: true` (B-AGENT-INVOKE-FAILURE-NOTICE P1) does NOT end a dispatch: the
    request was not reviewed and this session holds the re-send. It stays OPEN, noted `failed, notified (<outcome>)`, and
    is listed in `failed_notified`.
  * Every kind in the window is one of the TWELVE named; any other -> GUARD FAILED. Unmapped senders -> GUARD FAILED.
  * CROSS-CHECK (C-8): every `cc_outbound` row of this alias whose OPENING LIST names Langston must have an inbound
    row (same id, or each piece matched on whitespace-normalised text); else, if a `langston_enqueued` row matches it the same way (P10), QUEUED - accepted, no worker has started it; else
    NOT HANDLED (the bridge has no record of accepting it). Coltrane's posts carry no
    message id and are NOT CHECKED - said every run.
  * The address rule and the piece matcher are each controlled before a row is read; a failed control -> GUARD FAILED.
Ids are compared as STRINGS (the log holds both int and str eras).
"""
import json
import os
import re
import sys

EPOCH_MS = 1420070400000
# ⛔ A CLOSED SET, AND AN UNKNOWN KIND IS A HARD GUARD FAILURE ON PURPOSE (B-AGENT-INVOKE-FAILURE-NOTICE C-8): an unknown
#    kind is a dispatch state this census cannot classify, and reading it silently as open or ended is the false-absence
#    class the guard exists to refuse. A new kind lands HERE first, before any writer emits it.
KINDS = {"langston_inbound", "cc_outbound", "langston_outbound", "langston_outbound_media", "langston_silent",
         "langston_alert_inbound", "", "voice_inbound", "langston_inbound_voice", "langston_inbound_voice_failed",
         "voice_inbound_failed",
         # B-AGENT-INVOKE-FAILURE-NOTICE P10: the bridge accepted a person's request (written at enqueue, BEFORE a worker
         # takes it). A Langston-addressed post with this row and no `langston_inbound` is QUEUED, not NOT HANDLED.
         "langston_enqueued"}
DECLINE = {"voice not addressed to Langston",
           "[SILENT] addressed to Claude New (CC-B), not me",
           "[SILENT] addressed to Claude Old (CC-A), not me",
           "[SILENT] not named — only Langston-rule and Claude New apply; I'm not the addressee."}
OPEN_REASONS = {"bridge_error_suppressed", "circuit_breaker", "post_failed"}
# `langston_inbound.sender_username` -> alias, EXACT strings (A6b; the discriminator is part of the value)
SENDER_USERNAME = {"OLD Claude#0000": "CC-A", "Claude Old#0000": "CC-A", "NEW Claude#0000": "CC-B", "Claude New#0000": "CC-B",
                   "ANALYST Claude#0000": "CC-C", "Claude Analyst#0000": "CC-C", "Infra Claude#0000": "CC-INFRA",
                   "PM Claude#0000": "CC-PM"}
SENDER_USERNAME_EXCLUDED = {"self-advance", "kylegjordan"}
# `cc_outbound.sender` -> alias, its OWN table on its OWN field (no discriminator; a Codex stand-in is its Claude's alias)
CC_SENDER = {"OLD Claude": "CC-A", "Claude Old": "CC-A", "OLD Codex": "CC-A", "NEW Claude": "CC-B", "Claude New": "CC-B",
             "NEW Codex": "CC-B", "ANALYST Claude": "CC-C", "Claude Analyst": "CC-C", "ANALYST Codex": "CC-C",
             "Infra Claude": "CC-INFRA", "INFRA Codex": "CC-INFRA", "PM Claude": "CC-PM"}
CC_SENDER_MACHINE = {"Push notice", "Heartbeat", "Backup gate", "Crew switch", "Freshness report", "Monday-Jam-Check"}
CC_SENDER_NOT_CHECKED = "Coltrane"
NOT_CHECKED_LINE = "NOT CHECKED — Coltrane's posts (no message id; this leg cannot witness their absence)"
CHUNK_WINDOW_MS = 10 * 60 * 1000
WS = re.compile(r"\s+")


def snowflake_ms(i):
    try:
        return (int(i) >> 22) + EPOCH_MS
    except (TypeError, ValueError):
        return None


def ts_ms(ts):
    import datetime
    try:
        t = datetime.datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
        if t.tzinfo is None:
            t = t.replace(tzinfo=datetime.timezone.utc)
        return int(t.timestamp() * 1000)
    except (TypeError, ValueError):
        return None


def norm(s):
    return WS.sub(" ", str(s or "")).strip()


def load_address(path):
    import importlib.util
    spec = importlib.util.spec_from_file_location("address_list", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def piece_received(text, inbound, at_ms):
    """A piece is received when its whitespace-normalised text is contained in a langston_inbound row's normalised text
    within the chunk window (the bridge rejoins pieces with "\\n", so a byte test finds nothing - CHANGES-2)."""
    t = norm(text)
    if not t:
        return False
    for ms, body in inbound:
        if at_ms is not None and ms is not None and not (at_ms - 60000 <= ms <= at_ms + CHUNK_WINDOW_MS):
            continue
        if t in body:
            return True
    return False


def census(rows, alias, since_ms, until_ms, addr, registry):
    out = {"open": [], "ended": 0, "not_handled": [], "queued": [], "failed_notified": [], "guard_failed": [],
           "not_checked": [], "counts": {}}
    gf = out["guard_failed"]
    # CONTROLS FIRST (CHANGES-3, CHANGES-2): the address rule and the piece matcher must each find a known positive
    if "LANGSTON" not in registry:
        gf.append("the address registry has no LANGSTON (the rule would read every post as not addressed to him)")
    else:
        try:
            if "LANGSTON" not in addr.opening_addressees("Langston — control post for the census", registry):
                gf.append("the address rule does not find Langston in a known Langston-addressed post")
        except Exception as e:     # noqa: BLE001 - any failure of the rule is a guard failure, never a silent zero
            gf.append("the address rule failed on its control (%s)" % type(e).__name__)
    ctl_in = [(1000, norm("Langston — piece one of the control\npiece two of the control"))]
    if not (piece_received("Langston — piece one of the control", ctl_in, 1000)
            and piece_received("piece two of the control", ctl_in, 1000)):
        gf.append("the piece matcher does not match a known two-piece dispatch")
    if gf:
        return out

    def in_window(ms):
        return ms is not None and ms >= since_ms and (until_ms is None or ms < until_ms)

    dispatches, inbound_text, replies, silents, cc = {}, [], {}, [], []
    enqueued_ids, enqueued_text, failed = set(), [], {}
    seen_cc = set()
    for d in rows:
        kind = d.get("kind", "")
        mid = d.get("message_id")
        ms = snowflake_ms(mid) if mid is not None else snowflake_ms(d.get("reply_to"))
        if ms is None:             # no id at all (a Coltrane row, a Kyle row): its own ts places it, for the kind check
            ms = ts_ms(d.get("ts"))
        if kind not in KINDS:
            if in_window(ms):
                gf.append("unknown kind %r" % kind)
            continue
        if kind == "langston_inbound":
            inbound_text.append((ms, norm(d.get("text"))))
            if not in_window(ms):
                continue
            su = d.get("sender_username")
            if su in SENDER_USERNAME_EXCLUDED:
                continue
            if su not in SENDER_USERNAME:
                gf.append("unmapped sender %r" % (su,))
                continue
            if SENDER_USERNAME[su] == alias:
                dispatches.setdefault(str(mid), ms)          # deduplicated on message_id (C-2)
        elif kind in ("langston_outbound", "langston_outbound_media"):
            if d.get("reply_to") is not None and d.get("message_id") is not None:
                if d.get("failure_notice") is True:
                    # P1: a delivered FAILURE NOTICE ends nothing - the request was not reviewed; the requester holds the
                    # re-send. Reported as failed-notified, never counted as answered.
                    failed.setdefault(str(d["reply_to"]), str(d.get("outcome") or "failed"))
                else:
                    replies.setdefault(str(d["reply_to"]), True)
        elif kind == "langston_enqueued":
            if d.get("message_id") is not None:
                enqueued_ids.add(str(d["message_id"]))
            enqueued_text.append((ms, norm(d.get("text"))))
        elif kind == "langston_silent":
            r = d.get("reason")
            if r in DECLINE:
                replies.setdefault(str(d.get("reply_to")), True)
            elif r in OPEN_REASONS:
                silents.append((str(d.get("reply_to")), r))
            elif in_window(ms):
                gf.append("unknown silent reason %r" % (r,))
        elif kind == "cc_outbound":
            s = d.get("sender")
            if s == CC_SENDER_NOT_CHECKED:
                if NOT_CHECKED_LINE not in out["not_checked"]:
                    out["not_checked"].append(NOT_CHECKED_LINE)
                continue
            if not in_window(ms):
                continue
            if s in CC_SENDER_MACHINE:
                continue
            if s not in CC_SENDER:
                gf.append("unmapped cc_outbound sender %r" % (s,))
                continue
            if CC_SENDER[s] == alias and (str(mid), norm(d.get("text"))) not in seen_cc:
                seen_cc.add((str(mid), norm(d.get("text"))))
                cc.append((str(mid), ms, d.get("text") or ""))
    if gf:
        return out
    if NOT_CHECKED_LINE not in out["not_checked"]:
        out["not_checked"].append(NOT_CHECKED_LINE)      # said every run, whether or not a Coltrane row fell in it
    notes = {}
    for rid, reason in silents:
        notes.setdefault(rid, reason)
    for i, ms in sorted(dispatches.items(), key=lambda kv: kv[1]):
        if replies.get(i):
            out["ended"] += 1
        elif i in failed:
            # still OPEN work for this session (it must re-send), and named as what it is
            out["open"].append({"id": i, "at_ms": ms, "note": "failed, notified (%s) - re-send" % failed[i]})
            out["failed_notified"].append(i)
        else:
            out["open"].append({"id": i, "at_ms": ms, "note": notes.get(i, "no reply yet")})
    inbound_ids = set()
    for d in rows:
        if d.get("kind") == "langston_inbound" and d.get("message_id") is not None:
            inbound_ids.add(str(d["message_id"]))
    for i, ms, text in cc:
        try:
            names_langston = "LANGSTON" in addr.opening_addressees(text, registry)
        except Exception:      # noqa: BLE001
            gf.append("the address rule failed on post %s" % i)
            continue
        if not names_langston:
            continue
        if i in inbound_ids or piece_received(text, inbound_text, ms):
            continue
        if i in enqueued_ids or piece_received(text, enqueued_text, ms):
            # accepted by the bridge, no worker has started it yet. WITH its age (Langston 4A): over a 7-day handoff window
            # a request queued 40 s ago behind two busy workers and one lost in a restart days back must read differently.
            out["queued"].append({"id": i, "at_ms": ms})
            continue
        out["not_handled"].append(i)
    out["counts"] = {"dispatches": len(dispatches), "cc_posts_checked": len(cc), "queued": len(out["queued"]),
                     "failed_notified": len(out["failed_notified"])}
    return out


def main(argv):
    opts, it = {}, iter(argv[1:])
    for a in it:
        if a in ("--alias", "--since-ms", "--until-ms", "--log", "--address-list"):
            opts[a] = next(it, None)
        else:
            print(json.dumps({"guard_failed": ["unknown argument at position %d" % argv.index(a)]}))
            return 2
    log = opts.get("--log") or "/var/log/cc-discord-inbox.jsonl"
    addr_path = opts.get("--address-list") or "/opt/discord-bridges/address_list.py"
    try:
        alias, since = opts["--alias"], int(opts["--since-ms"])
        until = int(opts["--until-ms"]) if opts.get("--until-ms") else None
        addr = load_address(addr_path)
        rows = []
        with open(log, encoding="utf-8", errors="replace") as fh:
            for line in fh:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    continue
    except Exception as e:     # noqa: BLE001 - the guard must SAY it could not look, never print a green
        print(json.dumps({"guard_failed": ["census could not run (%s: %s)" % (type(e).__name__, e)]}))
        return 3
    print(json.dumps(census(rows, alias, since, until, addr, getattr(addr, "REGISTRY", {}))))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
