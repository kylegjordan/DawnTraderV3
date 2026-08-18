#!/usr/bin/env python3
"""Memory restoration for crew-status: where Kyle left each session, what it was mid-way
through, and what has happened since.

THE REFRAME THIS MODULE EXISTS FOR (B-CREW-STATUS-2, Langston Step-1): the board was doing
STATUS REPORTING -- narrating whatever moved most recently. Kyle needs MEMORY RESTORATION:
"what was I doing and why", answered well enough that he does not spend 5-10 minutes per
session rebuilding it. Those are different questions over different evidence, which is what
makes the three layers below non-arbitrary rather than a decomposition of convenience.

  layer 1  TRAILHEAD        -- Kyle's words   (the last substantive thing he actually said)
  layer 2  MID-FLIGHT STATE -- the session's words (what it was in the middle of)
  layer 3  SINCE THEN       -- machine facts  (with timer-driven chores separated out)

TWO RULES THAT GOVERN EVERYTHING HERE, both bought with defects:

1. ATTRIBUTION COMES FROM RECORD STRUCTURE, NEVER FROM CONTENT THAT LOOKS LIKE AN INSTRUCTION.
   Transcripts quote other transcripts -- this session's transcript contains Kyle's verbatim
   instructions to two other sessions -- and at the content layer quotation is indistinguishable
   from origination. A quoted Kyle line inside an assistant turn IS an assistant turn.

2. ABSTAIN RATHER THAN GUESS, AND SAY SO IN A SENTENCE. Every wrong output this tool has
   produced was a confident wrong attribution. "3 commits, unattributed" costs Kyle nothing;
   one more wrong attribution costs the board its remaining trust. Never render an empty field:
   a blank reads as breakage, a stated reason reads as the tool working.
"""
import io, json, os, glob, re, subprocess
from datetime import datetime, timezone

NO_WINDOW = getattr(subprocess, "CREATE_NO_WINDOW", 0) if os.name == "nt" else 0
TRANSCRIPTS = os.path.expanduser("~/.claude/projects")

# Known harness wrappers. This is a DENYLIST and therefore decays: a new marker type ships and
# is silently read as Kyle. It is not the primary signal (origin.kind is) and it is paired with
# unknown_tags() so the complement is reported rather than assumed empty.
KNOWN_TAGS = {"task-notification", "scheduled-task", "system-reminder", "command-name",
              "command-message", "command-args", "local-command-stdout", "local-command-stderr",
              "bash-input", "bash-stdout", "bash-stderr", "user-prompt-submit-hook",
              "post-tool-use", "session-start", "function_results", "budget-notification"}
TAG_RE = re.compile(r"<\s*/?\s*([A-Za-z][\w:-]*)[^>]*>")
# A whole-tag block: opening tag, body, closing tag. Stripped so that a <system-reminder>
# APPENDED to a genuine Kyle turn does not disqualify the turn -- "contains a marker => harness"
# would drop real instructions, which is the failure this shape avoids.
BLOCK_RE = re.compile(r"<\s*([A-Za-z][\w:-]*)[^>]*>.*?<\s*/\s*\1\s*>", re.S)
SELF_CLOSING_RE = re.compile(r"<\s*[A-Za-z][\w:-]*[^>]*/\s*>")


def _now():
    return datetime.now(timezone.utc)


def parse_ts(ts):
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except Exception:
        return None


def ago(ts):
    t = parse_ts(ts)
    if not t:
        return "unknown age"
    s = (_now() - t).total_seconds()
    if s < 90:
        return "just now"
    if s < 3600:
        return f"{int(s//60)}m ago"
    if s < 86400:
        return f"{int(s//3600)}h ago"
    return f"{int(s//86400)}d ago"


# ── extraction ───────────────────────────────────────────────────────────────────────────────
def text_of(msg):
    c = msg.get("content")
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return " ".join(b.get("text", "") for b in c
                        if isinstance(b, dict) and b.get("type") == "text")
    return ""


def residual(text):
    """What remains after removing whole-tag blocks. If prose survives, a human wrote it.

    This is the positive-shape test that generalises past the denylist: harness injections are
    tag-WRAPPED whole messages, so the property to key on is structural, not the tag's name. A
    marker type that does not exist yet still gets caught."""
    t = BLOCK_RE.sub(" ", text or "")
    t = SELF_CLOSING_RE.sub(" ", t)
    t = TAG_RE.sub(" ", t)
    return t.strip()


def unknown_tags(text):
    """Tag names present that we do not know about -- the denylist's complement.

    Langston: "the denylist doesn't need to be complete; it needs a complement that NAMES what it
    didn't recognize. Denylist + unknown-reporter is a closed set." This catches a new marker
    type on its FIRST appearance rather than after it has corrupted a week of output."""
    return {m.group(1) for m in TAG_RE.finditer(text or "")} - KNOWN_TAGS


# ── layer 0: classification ──────────────────────────────────────────────────────────────────
KYLE, HARNESS = "kyle", "harness"


def classify(ev):
    """(KYLE|HARNESS, reason). Structural first, shape second. Never keyword matching on prose.

    Measured basis (crew-status-audit.py, sections C and D):
      * origin.kind == 'task-notification' on 5,349 records -- the harness DOES tag some machine
        submissions distinguishably, so this field is real signal;
      * BUT 13 of 13 <scheduled-task> submissions arrive tagged origin.kind == 'human', because
        the scheduler submits through the same path a typed prompt does. So origin alone would
        admit timer-driven work as Kyle -- which is the defect this batch exists to fix.
      * and 681 compaction summaries carry neither marker, opening with plain prose, so a
        text-shape rule alone admitted a machine-written recap as "the last thing Kyle said"
        (38.7% of everything the old predicate accepted).
    Neither signal is sufficient. The conjunction is."""
    msg = ev.get("message") or {}
    if msg.get("role") != "user":
        return HARNESS, "not-a-user-record"
    if ev.get("isSidechain"):
        return HARNESS, "sidechain"
    if ev.get("isCompactSummary"):
        return HARNESS, "compaction-summary"
    if ev.get("isMeta"):
        return HARNESS, "meta"
    raw = text_of(msg)
    if not raw.strip():
        return HARNESS, "empty"
    org = ev.get("origin")
    kind = org.get("kind") if isinstance(org, dict) else None
    if kind and kind != "human":
        return HARNESS, f"origin.kind={kind}"
    # kind == 'human' or absent (the fallback path -- 99.96% of a sibling corpus, so it is a
    # first-class path and not an exception branch). Shape decides from here.
    if not residual(raw):
        return HARNESS, "whole-tag-wrapper"
    return KYLE, ""


# ── record loading ───────────────────────────────────────────────────────────────────────────
def load_records(slug):
    """Every record across ALL transcript files for a session, ordered by timestamp.

    NOT newest-file-by-mtime, which is what shipped. Two reasons: mtime measures last WRITE, not
    last CONTENT, and a trailhead 9 days old very often lives in an older file. Reading one file
    would report "unrecoverable" for a record sitting on disk -- abstention failing in the honest
    direction and still being wrong, for exactly the dormant sessions this tool is for."""
    d = os.path.join(TRANSCRIPTS, slug)
    if not os.path.isdir(d):
        return [], f"no transcript directory for this session"
    recs, files = [], glob.glob(os.path.join(d, "*.jsonl"))
    if not files:
        return [], "no transcript files"
    for p in files:
        try:
            fh = io.open(p, encoding="utf-8", errors="replace")
        except Exception:
            continue
        with fh:
            for line in fh:
                try:
                    ev = json.loads(line)
                except Exception:
                    continue
                if not ev.get("timestamp"):
                    continue
                ev["_file"] = os.path.basename(p)
                recs.append(ev)
    recs.sort(key=lambda e: str(e.get("timestamp")))
    return recs, None


def index_by_uuid(recs):
    return {e["uuid"]: e for e in recs if e.get("uuid")}


def is_turn_root(ev):
    """A user record that actually STARTED a turn, as opposed to one carrying a tool result.

    ★ THE DISTINCTION THAT BROKE THE FIRST BUILD: tool results are written as `role: "user"`
    records too. A naive "walk up to the first user record" therefore stops at the tool result
    the current step is responding to -- which has no origin, no prose, and classifies as
    harness-with-reason-'empty'. Measured consequence: EVERY commit was attributed to a chore
    with an empty reason, and the layer-2 window collapsed to four records, because virtually
    everything rooted at a tool result instead of at the turn that caused it. The containment
    rule was right; the definition of the root was wrong."""
    msg = ev.get("message") or {}
    if msg.get("role") != "user":
        return False
    c = msg.get("content")
    if isinstance(c, str):
        return True
    if isinstance(c, list):
        return not any(isinstance(b, dict) and b.get("type") == "tool_result" for b in c)
    return False


def root_user_record(ev, by_uuid, depth=400):
    """Walk UP the parentUuid chain to the user turn that started this response chain.

    This is CONTAINMENT, not proximity -- "the commit was emitted while executing that turn",
    not "the commit happened near that turn". Different epistemic class, and the reason it
    matters is that every wrong attribution this tool has produced came from proximity."""
    cur, seen = ev, set()
    for _ in range(depth):
        if not cur or cur.get("uuid") in seen:
            return None
        seen.add(cur.get("uuid"))
        if is_turn_root(cur):
            return cur
        pid = cur.get("parentUuid")
        if not pid:
            return None
        cur = by_uuid.get(pid)
    return None


# ── layer 1: trailhead ───────────────────────────────────────────────────────────────────────
# A span is self-sufficient once it contains a Kyle turn carrying enough of its own context to
# mean something to a reader who lost the thread. NOTE what this threshold does and does not do:
# it governs how far to EXTEND, never whether to SKIP. Nothing is dropped. "Please continue." is
# retained and shown -- it is a state signal (Kyle was babysitting, not directing) -- it simply
# does not end the search. Failure mode is therefore "too much context", recoverable in seconds,
# rather than "wrong trailhead", which is the original defect.
SUFFICIENT_CHARS = 80
MAX_KYLE_TURNS = 8      # raised from 4: measured against the live corpus, this session's four
                        # most recent Kyle turns were ALL "please continue", so a cap of 4
                        # terminated the walk before it reached anything substantive and handed
                        # back a span that reminded him of nothing.
MAX_SPAN = 12


def trailhead(recs, by_uuid):
    """Returns dict: state, span (oldest->newest), anchor_ts, why (abstention sentence)."""
    kyle = [e for e in recs if classify(e)[0] == KYLE]
    if not kyle:
        oldest = parse_ts(recs[0]["timestamp"]) if recs else None
        return {"state": "none",
                "why": ("no message you typed appears anywhere in what this session still "
                        "keeps" + (f" (retained from {oldest:%b %d})" if oldest else "")),
                "span": [], "anchor_ts": None}

    span, kyle_turns, sufficient = [], 0, False
    for ev in reversed(kyle):
        span.insert(0, ev)
        kyle_turns += 1
        body = residual(text_of(ev.get("message") or {}))
        if len(body) >= SUFFICIENT_CHARS:
            sufficient = True
            break
        if kyle_turns >= MAX_KYLE_TURNS:
            break

    # Include the session's reply that the FIRST Kyle turn in the span was responding to, so an
    # anaphor ("ship it") lands next to whatever it refers to.
    first_ts = str(span[0].get("timestamp"))
    prior = [e for e in recs
             if str(e.get("timestamp")) < first_ts
             and (e.get("message") or {}).get("role") == "assistant"
             and len(text_of(e.get("message") or {}).strip()) > 120]
    if prior and len(span) < MAX_SPAN:
        span.insert(0, prior[-1])

    anchor = span[-1]
    for e in reversed(span):
        if classify(e)[0] == KYLE:
            anchor = e
            break

    state = "ok"
    why = ""
    # The walk ran out of turns without reaching anything that stands on its own. Say so rather
    # than present a wall of "please continue" as if it were the thread -- an honest sentence
    # beats a technically-correct span that reminds him of nothing.
    if not sufficient:
        state = "anaphoric-only"
        why = (f"your last {kyle_turns} messages here were short continuations, so the thread "
               f"itself is in what the session was already doing rather than in anything you said")
    compacted = [e for e in recs if e.get("isCompactSummary")]
    if compacted and parse_ts(anchor["timestamp"]) and parse_ts(compacted[-1]["timestamp"]) \
            and parse_ts(anchor["timestamp"]) < parse_ts(compacted[-1]["timestamp"]):
        state = "behind-compaction"
        why = ("the last message you typed here is older than the point this session's "
               "transcript was compacted, so what came before it is summarised, not kept")
    return {"state": state, "why": why, "span": span, "anchor_ts": anchor.get("timestamp")}


# ── layer 2 window ───────────────────────────────────────────────────────────────────────────
def directed_window(recs, by_uuid, anchor_ts):
    """[trailhead -> the last record whose turn-chain roots at a KYLE turn at-or-after it].

    Langston's C1 answer, adopted verbatim. The version this replaced said "the end of the
    directed work that followed", which is circular -- you cannot find that end without having
    already classified everything after it. This is mechanical, terminates, and is defined by
    CONTAINMENT rather than recency, so it inherits the same epistemic class as layer 3 instead
    of importing a weaker one.

    Degenerate case is first-class: if Kyle spoke last and nothing ran, the window is empty, and
    "you spoke last here; nothing has run since" is probably the most useful line on the board."""
    if not anchor_ts:
        return []
    out = []
    for e in recs:
        if str(e.get("timestamp")) < str(anchor_ts):
            continue
        root = root_user_record(e, by_uuid)
        if not root:
            continue
        if classify(root)[0] != KYLE:
            continue
        if str(root.get("timestamp")) < str(anchor_ts):
            continue
        out.append(e)
    return out


# ── layer 3: what ran since, chores separated ────────────────────────────────────────────────
SCHED_NAME_RE = re.compile(r'<scheduled-task\s+name="([^"]+)"')


def commit_attribution(recs, by_uuid, since_ts):
    """Map each commit SHA to DIRECTED or CHORE by containment.

    ★ THE SHA COMES FROM A STRUCTURED FIELD, NOT FROM TEXT. Records carry
    `toolUseResult.gitOperation.commit.sha` -- an exact, machine-written value. The first
    implementation here scraped `git commit` out of command text and then regex'd for hex, and
    it "found" eleven commits for a dormant session that were fragments of TRANSCRIPT FILENAMES
    (a uuid like 66dbb030-...-39344c645007 is full of 7+ hex runs). Same lesson as the rest of
    this batch, in miniature: read the structured field, not the prose that resembles it.

    Attribution itself is CONTAINMENT: a commit is emitted by a tool call inside some turn's
    response chain, so walk UP to that turn's root user record. Harness root => a timer kicked
    it off. Kyle root => he asked for it. Never proximity -- "the commit happened near a
    scheduled-task turn" is the reasoning that produced the defects this batch is fixing.

    Unlinkable commits are simply ABSENT from this map; the caller reports them with a count
    rather than guessing or quietly shortening the list."""
    out = {}
    for e in recs:
        if since_ts and str(e.get("timestamp")) < str(since_ts):
            continue
        tr = e.get("toolUseResult")
        if not isinstance(tr, dict):
            continue
        gop = tr.get("gitOperation")
        if not isinstance(gop, dict):
            continue
        commit = gop.get("commit")
        if not isinstance(commit, dict):
            continue
        sha = commit.get("sha")
        if not sha or commit.get("kind") not in (None, "committed", "amended"):
            continue

        root = root_user_record(e, by_uuid)
        if root is None:
            # No chain to a turn root: abstain rather than assume. Recorded so the caller can
            # say "N commits, unattributed" instead of silently dropping them.
            out[str(sha)] = {"kind": "unattributed",
                             "detail": "could not be traced to the turn that produced it"}
            continue
        if root.get("isCompactSummary"):
            # ★ COMPACTION SEVERS PROVENANCE, and this must ABSTAIN rather than guess.
            # When a conversation is compacted the chain re-roots at the summary record, so work
            # continuing a thread Kyle started is no longer traceable to him. Measured: this
            # accounts for all 45 of OLD Claude's post-trailhead commits, which the first build
            # labelled "chore -- automated", asserting a timer drove work that may well have
            # been Kyle's. Calling that a chore is a confident wrong attribution of exactly the
            # kind this batch exists to remove.
            # It is also the sharpest argument for persisting facts AT OBSERVATION TIME
            # (scope §4.7): the link exists before compaction and is gone after, so anything
            # not captured while it is visible is not recoverable later.
            out[str(sha)] = {"kind": "unattributed",
                             "detail": "the conversation was compacted between your instruction "
                                       "and this work, so the trail back to it is gone"}
        elif classify(root)[0] == KYLE:
            out[str(sha)] = {"kind": "directed",
                             "detail": residual(text_of(root.get("message") or {}))[:100]}
        else:
            raw = text_of(root.get("message") or {})
            m = SCHED_NAME_RE.search(raw)
            out[str(sha)] = {"kind": "chore",
                             "detail": (f"scheduled task '{m.group(1)}'" if m
                                        else f"automated ({classify(root)[1]})")}
    return out


# ── the single entry point the page uses ─────────────────────────────────────────────────────
def build(slug):
    """Everything the board needs for one session. Pure facts; no model, no rewriting.

    Returns a dict whose every field is either a value or an ABSTENTION SENTENCE -- never an
    empty string. A blank cell reads as breakage; a stated reason reads as the tool working."""
    recs, err = load_records(slug)
    if err:
        return {"ok": False, "why": err, "trailhead": None, "narration": [],
                "since": {"directed": [], "chore": {}, "unattributed": 0, "unattributed_why": ""}}
    by = index_by_uuid(recs)
    th = trailhead(recs, by)
    win = directed_window(recs, by, th["anchor_ts"])
    att = commit_attribution(recs, by, th["anchor_ts"])

    narration = [e for e in win
                 if (e.get("message") or {}).get("role") == "assistant"
                 and len(text_of(e.get("message") or {}).strip()) > 300]

    chore = {}
    unattributed, unattributed_why = 0, ""
    directed = []
    for sha, v in att.items():
        if v["kind"] == "directed":
            directed.append((sha, v["detail"]))
        elif v["kind"] == "chore":
            chore[v["detail"]] = chore.get(v["detail"], 0) + 1
        else:
            unattributed += 1
            unattributed_why = v["detail"]

    kyle_turns = [e for e in th["span"] if classify(e)[0] == KYLE]
    return {
        "ok": True, "why": "",
        "trailhead": {
            "state": th["state"], "why": th["why"], "anchor_ts": th["anchor_ts"],
            "quotes": [residual(text_of(e["message"])).strip() for e in kyle_turns],
        },
        "narration": [{"ts": e.get("timestamp"), "text": text_of(e["message"]).strip()}
                      for e in narration[-2:]],
        "since": {"directed": directed, "chore": chore,
                  "unattributed": unattributed, "unattributed_why": unattributed_why},
        "blocked_on_kyle": bool(kyle_turns) and not narration,
    }
