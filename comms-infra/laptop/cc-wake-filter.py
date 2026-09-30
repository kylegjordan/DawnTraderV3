#!/usr/bin/env python3
"""CC wake-channel filter — consumes a header-framed stream from Helsinki and emits one compact
line per wake-worthy event. Sources:
  /var/log/cc-discord-inbox.jsonl      -> Kyle (text + voice), Langston, the other sessions, alerts
  /var/log/cc-wake.log                 -> dedicated wake channel: an appended line naming you wakes you

TWO MODES (B-TOKEN-BURN-CUT, #1127):
  cc-wake-filter.py <ALIAS>                  streaming: every wake line is printed and the process
                                             runs on (the old Monitor form; the behavioural test
                                             drives this mode).
  cc-wake-filter.py <ALIAS> --once           event-only: reads `cc-wake-follow.py` output, prints the
                                             wake line(s) of ONE burst, saves where it stopped and
                                             EXITS 0 — so a background task ends, and its one
                                             completion notification is the wake. EOF (ssh dropped)
                                             saves and exits 3; the arm loop reconnects.
  cc-wake-filter.py <ALIAS> --positions      prints the follower's resume arguments from the state.
  --state PATH                               default C:/Users/kyleg/.claude/cc-wake-state/<ALIAS>.json
                                             (keyed per session and never in /tmp, which all four
                                             sessions share — #979).
The `langston-alert-invokes.log` source is GONE: it has had no writer since the 2026-07-02 Discord
cutover (0 bytes, mtime 2026-06-28); `DELETED_COMPONENTS_LOG.md`, B-TOKEN-BURN-CUT.
"""
import sys, json, re, os, time
from datetime import datetime, timezone

# Windows: pipe stdout defaults to cp1252 which cannot encode arrows/emoji in
# message text -> print raises UnicodeEncodeError -> event silently lost.
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# Session addressing: argv[1] = this session's alias ("CC-A" or "CC-B").
# Friendly-name registry (Kyle 2026-06-12): names may appear ANYWHERE in the
# message, not just as a leading tag. Rules:
#   - message mentions MY name (or my CC-x alias)            -> deliver
#   - message mentions only OTHER sessions' names            -> suppress
#   - message mentions no session name at all                -> broadcast (deliver)
#   - message mentions several names incl. mine              -> deliver (multi-recipient)
ALIAS = (sys.argv[1] if len(sys.argv) > 1 else "CC-A").upper()
NAMES = {
    "CC-A": [r"claude[\s_-]*old", r"old[\s_-]*claude", r"cc[\s_-]*a"],
    "CC-B": [r"claude[\s_-]*new", r"new[\s_-]*claude", r"cc[\s_-]*b"],
    "CC-C": [r"claude[\s_-]*analyst", r"analyst[\s_-]*claude", r"cc[\s_-]*c"],  # Kyle named 2026-07-19 (revived "Previous CN")
    # CC-INFRA onboarded 2026-08-26 (Kyle, lifting his own deferral). Until today Infra
    # Claude could be NAMED in the channel and never woken — the alert-owner tuple below
    # carried him for suppression only. Adding him here also means a message naming ONLY
    # him now suppresses for CC-A/B/C rather than broadcasting to them, which is the
    # behaviour the suppression entry was pre-placed to make correct.
    "CC-INFRA": [r"infra[\s_-]*claude", r"claude[\s_-]*infra", r"cc[\s_-]*infra"],
}
ALIAS_NAME = {"CC-A": "OLD Claude", "CC-B": "NEW Claude", "CC-C": "ANALYST Claude",
              "CC-INFRA": "Infra Claude"}  # display names (Kyle 2026-06-20; CC-C 2026-07-19; CC-INFRA 2026-08-26)
# ⚠️ THE DISPLAY NAME IS ALSO THE `--sender` VALUE AND MUST MATCH THE CHANNEL EXACTLY, or
# the session wakes on its own posts. "Infra Claude" is the form measured on the live
# channel (31 posts as of the 2026-08-23 census), not "Claude Infra".
MY_NAME = ALIAS_NAME.get(ALIAS, "")
# 2026-08-18 #694 / Langston BLOCKER-1: suppression is CONTENT-keyed and FAIL-SAFE,
# never sender-keyed. `dt-push-notice.sh` emits TWO variants under the SAME
# `--sender "Push notice"`: the routine sha-only line, and an ESCALATED one carrying
# "THE RULES CHANGED IN THIS PUSH -- PULL AND RELOAD NOW, even if you are mid-task"
# plus the changed paths. MEASURED in the last 400 notices: 262 routine / 138 escalated
# (35%). A sender-keyed drop killed the escalated variant too -- and the §7.1 fetch gate
# does NOT cover it, because that gate fires at a session's NEXT PUSH (possibly hours
# out) while the whole point of the escalated line is to reach a session MID-TASK.
# FAILS SAFE BY CONSTRUCTION: we suppress ONLY a body that reduces to the known routine
# sentence. Anything with content beyond it -- including a reworded future escalation --
# is DELIVERED. An unrecognised variant wakes you; it is never silently dropped.
_ROUTINE_PUSH = re.compile(
    r"^\s*(?:.{0,80}?\s[—–-]\s*)?review branch moved to\s+\S+\.?\s*"
    r"(?:pull before you push\.?)?\s*(?:\(if this is your own push,? ignore it\.?\))?\s*$",
    re.I)

def is_routine_push_notice(sender, text):
    """True ONLY for the sha-only notice. Unknown shapes -> False -> delivered."""
    if sender != "Push notice":
        return False
    return bool(_ROUTINE_PUSH.match((text or "").strip()))


# 2026-09-03 #995 (B-WAKE-QUIET OBJ-10, KYLE-DIRECTED: "Yes, cut both") — THE ALL-CLEAR
# HOURLY HEARTBEAT NO LONGER WAKES ANYONE.
# This OVERTURNS #694's explicit refusal ("the dead-man proof that the watcher is alive...
# its cost is COMMENTARY, not the wake"). Both halves of that refusal are now measured false:
#   (a) IT CANNOT PROVE WHAT IT CLAIMS. The heartbeat is delivered as a Discord post that
#       each session's watcher TAILS -- so a dead watcher receives no heartbeat. It cannot
#       detect the failure it exists for; its only absence-signal is regularity.
#   (b) THE BODY PRODUCES NARRATION AND NOT THE ACTION IT ASKS FOR.
#       ⛔ DO NOT RESTATE THE FIGURES HERE. This comment used to carry them and they went
#       stale inside one day: it said "734 turns / 636 spoke (86%)", from a turn model the
#       instrument's own docstring records as WRONG, while the corrected run says 99%. A
#       load-bearing number restated in a comment is the shape this file forbids elsewhere
#       — derive, never restate (Langston FINDING-2, #995).
#       DERIVE IT: scripts/analysis/wake_narration.py --instruction-compliance
#       ⚠️ And read the CONDITIONAL/UNCONDITIONAL split there before quoting anything: the
#       "re-arm only if dead" row scores the consequent of a conditional and is NOT a
#       compliance measure. The claim rests on the unconditional "sweep" row and on the
#       near-total speak rate.
# CONTENT-KEYED AND FAIL-SAFE, exactly like the push notice above (Langston BLOCKER-1):
# we suppress ONLY the ALL-CLEAR shape. A heartbeat reporting a DEAD BRIDGE or a STALE
# inbox log is the one case where it carries information, and it is still DELIVERED.
# An unrecognised or reworded variant wakes you; it is never silently dropped.
_HEARTBEAT_OK = re.compile(r"hourly heartbeat:.*bridges active:\s*y(?:es)?\b", re.I | re.S)
# ⛔ KEYED ON THE HEALTH FIELDS ONLY. An earlier version included \bdead\b and \bDOWN\b and
# matched the heartbeat's OWN standing instruction ("re-arm only if dead"), so it classed
# every all-clear as a problem and suppressed nothing. Caught by the behavioural test, not
# by re-reading the line: a word that always appears in the routine body can never
# discriminate a problem from an all-clear.
_HEARTBEAT_BAD = re.compile(
    r"bridges active:\s*(?:n(?:o)?\b|partial|inactive)"   # the bridge health field itself
    # ⛔ NOT a bare \bSTALE\b. Langston measured all 768 live Heartbeat rows against this regex:
    # 755 suppressed, 13 delivered — and ALL 13 came through this arm, SIX of them on bodies
    # saying "quiet but not stale" or "borderline stale". It was matching the WORD INSIDE A
    # NEGATION, which is not reading health at all. The token must be a verdict, not a mention.
    r"|inbox-log[^|]*(?<!not )(?<!borderline )\bSTALE\b"    # the log-age field reporting stale
    r"|\bbridge[s]?\b[^|]{0,40}\b(?:down|dead|failed|inactive)\b"
    # B-TOKEN-BURN-CUT: a heartbeat reporting a DEAD watcher or an unanswered control is a problem
    # and must still be delivered; "not armed" and "all alive" are not verdicts of failure.
    r"|\bwatchers:\s*[^|]*\bDEAD\b|\bcontrol:\s*NOT answered\b",
    re.I)

def is_allclear_heartbeat(sender, text):
    """True ONLY for an all-clear hourly heartbeat. Anything reporting a problem -> False
    -> delivered. Alert COUNTS in the body do not make it wake-worthy: every session is
    already shown the full due-alert list at the top of EVERY turn by inject-due-alerts."""
    if sender != "Heartbeat":
        return False
    t = text or ""
    if _HEARTBEAT_BAD.search(t):
        return False
    return bool(_HEARTBEAT_OK.search(t))
MY_RE = re.compile(r"@?\b(" + "|".join(NAMES.get(ALIAS, [])) + r")\b", re.I)
# ★ EXPLICIT ALL-HANDS, for a session post that genuinely concerns every session (a shared-file
# change, a protocol switch). Required BECAUSE the crew-post default became name-or-nothing
# below: without this, a real announcement could be silently swallowed, and silence that looks
# like agreement is the failure mode this file fears most.
CREW_ALL_RE = re.compile(r"@crew\b|\bALL SESSIONS\b", re.I)
OTHERS_RE = re.compile(
    r"@?\b(" + "|".join([p for k, v in NAMES.items() if k != ALIAS for p in v] + ["langston"]) + r")\b", re.I)
# B-ALERT-PROTOCOL (#340): a system-alert triage reply ends with an owner marker
# [[ALERT id=.. owner=<CC-A|CC-B|CC-C|CC-INFRA|Kyle> action=".."]] — authoritative wake routing.
# ⛔ CC-C AND CC-INFRA ADDED 2026-08-23 (Kyle-directed). The pattern listed only CC-A/CC-B/Kyle.
# ⚠️ AND THE CAUSAL CLAIM THAT ORIGINALLY STOOD HERE WAS WRONG — STRUCK, NOT SOFTENED (Langston,
# Step-4, measured on this box). It said the cross-session wake was caused by the missing CC-C
# alternative. IT WAS NOT: the marker never reached the alternation AT ALL, because the search ran
# on a 400-char truncation while the marker is the LAST line of a body whose median is 2,289 chars.
# MEASURED, all history, both tailed files: 3,836 langston_outbound records · 1,025 carry [[ALERT
# · 1,021 of those have it past byte 400 ⇒ 99.6% discarded BEFORE the regex. Positive control: 4
# bodies do land inside 400, so the probe can return positive. On 2026-08-23 alone, 16 marker-bearing
# triages, offsets 1,825-5,558, ALL LOST.
# ★ RIGHT OBSERVATION, ADJACENT OBJECT. The enumeration fix below is still correct and still needed
# — it just was not the cause of what I attributed to it.
# ★ CC-INFRA WAS included here for SUPPRESSION ONLY while his onboarding was deferred. ⛔ THAT
# DEFERRAL ENDED 2026-08-26 (Kyle) — he now HAS an entry in NAMES above, so this tuple and that
# registry agree and an alert owned by him both wakes him and stays out of the other three.
# The pre-placement did its job: onboarding him required no change here at all.
# ⛔ ONE LIST, BUILT ONCE. Langston, Step-4 2026-08-23: the first fix updated the regex and left
# THREE other copies of the same enumeration drifting — the stale comment at the call site below,
# ALERT_HANDLING_PROTOCOL.md:19 (which governs the EMITTER, so the filter accepted values the spec
# forbade him to write), and his own CLAUDE.md §10.5. Fixing a drift bug while leaving three copies
# drifting is the #641 shape aimed at itself. The tuple is now the single source: derive, never restate.
ALERT_OWNERS = ("CC-A", "CC-B", "CC-C", "CC-INFRA", "Kyle")
ALERT_OWNER_RE = re.compile(
    r"\[\[ALERT\b[^\]]*\bowner=(" + "|".join(re.escape(o) for o in ALERT_OWNERS) + r")\b", re.I)

# #995 OBJ-11: used to remove routing markers before a PROSE name check — the marker carries
# an alias in `owner=`, which is routing metadata and must not read as being addressed.
ALERT_MARKER_STRIP = re.compile(r"\[\[ALERT\b[^\]]*\]\]", re.I)

# B-WAKE-LEAD-NAME (#1040): does the reply OPEN with this session's name? His bridge prepends the
# triggering author's display name to every NON-alert reply by construction
# (discord-langston-bridge.py:530-535), so the opening name is the addressee. Built from NAMES - one
# registry, never restated. Tested on the marker-STRIPPED full body.
# ⚠️ NO SEPARATOR IS REQUIRED AFTER THE NAME, DELIBERATELY (Langston Step-2 condition 5). So a reply
# that merely MENTIONS this session first - "OLD Claude's r2 is fine, but NEW Claude - ..." - also
# matches. That direction is a spurious WAKE, never a missed one, and it was accepted as the trade.
# Do NOT "fix" it by requiring a dash or comma: a separator rule turns any change in the bridge's
# prefix punctuation into silently dropped wakes. A test case pins this.
_OPEN_NAMES = NAMES.get(ALIAS, [])
OPEN_RE = (re.compile(r"^[\s*_~`>#:\".\-]*(?:" + "|".join(_OPEN_NAMES) + r")\b", re.I)
           if _OPEN_NAMES else re.compile(r"(?!)"))  # unregistered alias: an empty alternation would match every body
# Condition 4: the owner printed in a routing tag comes from ALERT_OWNERS, never from the body's own
# spelling (a body writing `owner=cc-b` must still print CC-B). The one list, looked up - not re-cased.
OWNER_CANON = {o.upper(): o for o in ALERT_OWNERS}

def addressed_to_me(text):
    """Return (deliver?, text)."""
    t = text or ""
    if MY_RE.search(t):
        return True, t              # named me (possibly among others)
    if OTHERS_RE.search(t):
        return False, t             # named only other session(s)
    return True, t                  # no names -> broadcast


# ── B-COMMS-IMAGES-2: make images VISIBLE to the desktop sessions ───────────────
# B-COMMS-IMAGES (#657) taught the bridges to SAVE inbound images and record their
# paths, and Langston reads them natively because he lives on that box. The desktop
# sessions were left half-served: this filter only ever forwarded `text`, so a session
# woke on Kyle's message with no idea an image came with it — a capability that exists
# in the record and reaches nobody, which is the failure class this whole programme
# keeps meeting. The suffix below rides events that ALREADY wake (it adds no new
# routing), and FAILS OPEN: any error here returns "" so a wake line is never lost to
# a media bug.
MEDIA_HELPER = "bash ~/.claude/dt-media-get"


def _defang(s):
    """Neutralize the wake-line FRAME token inside CONTENT, so content can never be shaped
    like an event. Applied to message bodies WITHOUT flattening them — Langston's rider #1
    asked whether a crafted body could forge a line the same way a crafted filename could.
    MEASURED before answering (11,799 logged bodies): 62% contain a newline inside the 400
    chars the filter prints, so multi-line bodies are everyday crew traffic and flattening
    them would change what all three sessions see; and ZERO have ever contained a WAKE[
    token, so this defang is a provable no-op on the entire history while still closing the
    class. Flatten media (one record must be one line); defang bodies (multi-line is real)."""
    return str(s).replace("WAKE[", "WAKE․[")


def _flat(s):
    """One record must never become two wake events. Any newline inside media content
    would do exactly that — and since the failure text carries an ATTACKER-CONTROLLED
    filename, an unflattened newline lets a crafted upload FORGE a wake line (Langston's
    hostile fixture proved it: a filename containing a newline plus a fake WAKE[...] line
    injected a fetch instruction for an arbitrary path). Flatten everything, always.

    Flattening alone leaves the forged text INSIDE the line, where it still reads like an
    instruction and the only defence is the reader being careful — too thin. So the frame
    token is defanged as well: after this, media content cannot contain anything shaped
    like a wake line, and 'is this a wake event?' stays a question about the frame rather
    than about the reader's judgement."""
    return _defang(str(s).replace("\n", " ").replace("\r", " "))


def _shape(v):
    """Accept EXACTLY the two shapes the bridges write: a list of paths, or a single path
    string. Anything else (dict, number, nested) is malformed and is COUNTED, never mined
    for path-shaped members — a dict KEY that looks like a path is not a path the log
    asserted, and rendering it as fetchable would show a session something the record
    never claimed. Returns (items, malformed_container?)."""
    if v is None:
        return [], False
    if isinstance(v, str):
        return [v], False
    if isinstance(v, list):
        return v, False
    return [], True


def _cap(items, n):
    """Truncate LOUDLY. A silent cap reads as 'that is all there is' — the same
    silent-truncation failure the recall tool is forbidden to commit."""
    shown = [_flat(x) for x in items[:n]]
    more = len(items) - len(shown)
    return " · ".join(shown) + (f"  (+{more} more not shown)" if more > 0 else "")


def media_suffix(d):
    try:
        items, bad_container = _shape(d.get("media_paths"))
        # Only absolute paths are offered as fetchable: every real path is absolute (the
        # bridges build them from an absolute media dir; Langston's are realpath'd), so a
        # relative entry is malformed, and sending a session to fetch it wastes its turn.
        paths = [p for p in items if isinstance(p, str) and p.startswith("/")]
        unusable = (len(items) - len(paths)) + (1 if bad_container else 0)

        fitems, fbad = _shape(d.get("media_failed"))
        failed = [f for f in fitems if isinstance(f, (str, int, float))]
        unusable += (len(fitems) - len(failed)) + (1 if fbad else 0)

        if not paths and not failed and not unusable:
            return ""
        bits = []
        if paths:
            bits.append("IMAGE(S) saved on Helsinki: " + _cap(paths, 4))
            bits.append(f"view: {MEDIA_HELPER} <path>  (copies it here, prints a local path to Read)")
        if failed:
            # An attachment that failed to save must never look like "no attachment" (#453).
            bits.append("ATTACHMENT PRESENT BUT SAVE FAILED (instrument failure, NOT an empty set): "
                        + _cap(failed, 3))
        if unusable:
            # Dropped silently, this would be an absence manufactured by the messenger.
            bits.append(f"{unusable} malformed media entr{'y' if unusable == 1 else 'ies'} in the "
                        f"record (not fetchable — the log is wrong, not empty)")
        return "  [" + " | ".join(bits) + "]"
    except Exception:
        return ""

# ── STDIN IS UTF-8. SAY SO, OR WINDOWS GUESSES cp1252 AND EVERY NON-ASCII CHAR ARRIVES MANGLED.
# (2026-08-20, found while proving the push-notice suppression. The OUTPUT side of exactly this
# bug was fixed 2026-06-11 -- see CLAUDE.md 6.9, "Windows cp1252 pipe encoding silently killed
# non-ASCII events". The INPUT side was never fixed, and nothing announced it: the bridges write
# UTF-8, Python decoded it as cp1252, so an em-dash reached this filter as three characters.
# MEASURED at the moment of the fix: sys.stdin.encoding == 'cp1252'; the live push notice arrived
# holding mojibake, not U+2014, so is_routine_push_notice() returned False on every real notice
# while returning True in every hand-fed test -- the suppression had NEVER fired in production.
# It is a whole CLASS, not one regex: every accented character, quote and dash in every Discord
# message these sessions have been woken with was mangled on the way in.
try:
    sys.stdin.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass  # fail-open: a filter that cannot set its encoding must still deliver wakes

# ── B-TOKEN-BURN-CUT (#1127): the event-only mode ─────────────────────────────────────────────
# The app now ends every Monitor within 30 minutes (CC 2.1.271) and each ending woke the session
# with nothing to say. In --once mode this filter is the tail of a BACKGROUND TASK that ends on its
# first wake: one completion notification per burst, none while idle. Routing below is unchanged.
SOURCES = tuple(os.environ.get("CC_WAKE_SOURCES", "/var/log/cc-discord-inbox.jsonl /var/log/cc-wake.log").split())  # env: tests only
STALE_S = 12 * 3600      # a state older than this is discarded rather than replaying days of chatter
_flags = sys.argv[2:]
ONCE = "--once" in _flags
POSITIONS = "--positions" in _flags
STATE = (_flags[_flags.index("--state") + 1] if "--state" in _flags
         else os.path.join(os.path.expanduser("~"), ".claude", "cc-wake-state", f"{ALIAS}.json"))


def _utc(ts=None):
    return datetime.fromtimestamp(ts if ts is not None else time.time(), timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def load_state():
    try:
        with open(STATE, encoding="utf-8") as f:
            return json.load(f)
    except (FileNotFoundError, ValueError):
        return {}


def save_state(st):
    """Atomic: a reader never sees half a file, and a kill mid-write leaves the old state."""
    os.makedirs(os.path.dirname(STATE), exist_ok=True)
    st["alias"] = ALIAS
    st["saved_at"] = _utc()
    tmp = STATE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(st, f)
    os.replace(tmp, STATE)


if POSITIONS:
    st = load_state()
    pos = st.get("pos") or {}
    saved = st.get("saved_epoch")
    if pos and saved is not None and time.time() - saved > STALE_S:
        # (c)/C10: say so ONCE, with the UTC of the position being thrown away — the lower bound a
        # session needs to sweep the inbox by hand. The --once run prints it and ends.
        st["stale_from"] = st.get("saved_at") or _utc(saved)
        st["pos"] = {}
        save_state(st)
        pos = {}
    print(" ".join(f"{p}:{pos[p][0]}:{pos[p][1]}" if p in pos else f"{p}:end" for p in SOURCES))
    sys.exit(0)


class _Tap:
    """Counts the wake lines this run prints, and tags each with where it came from (C10) so a
    duplicate delivered after a kill is recognisable. print() writes the whole string in one call,
    so a multi-line body is tagged once, at its end."""
    def __init__(self, real):
        self.real, self.delivered, self.tag = real, 0, ""

    def write(self, x):
        if x.startswith("WAKE["):
            x = x + self.tag
            self.delivered += 1
        return self.real.write(x)

    def flush(self):
        return self.real.flush()


if ONCE:
    TAP = _Tap(sys.stdout)
    sys.stdout = TAP
    STATE_NOW = load_state()
    POS_NOW = dict(STATE_NOW.get("pos") or {})

    def _checkpoint():
        STATE_NOW["pos"] = POS_NOW
        STATE_NOW["saved_epoch"] = time.time()
        save_state(STATE_NOW)

    _stale = STATE_NOW.pop("stale_from", None)
    if _stale:
        TAP.tag = ""
        print(f"WAKE[WATCHER->{ALIAS}]: the watcher resumed after more than {STALE_S // 3600} h away; "
              f"anything posted since {_stale} was NOT delivered. Sweep the Discord inbox from that "
              f"time.", flush=True)
        _checkpoint()


def _commit(pending):
    if pending:
        POS_NOW[pending[0]] = [pending[1], pending[2]]


cur = ""
pending = None     # (path, inode, end-offset) of the line about to arrive; committed once processed
for raw in sys.stdin:
    line = raw.rstrip("\n")
    if not line.strip():
        continue
    if ONCE and line.startswith("#@"):
        _commit(pending)
        pending = None
        parts = line.split()
        if parts[0] == "#@POS" and len(parts) >= 4:
            _p, _i, _o = line.split(" ", 1)[1].rsplit(" ", 2)     # a path may hold a space
            pending = (_p, int(_i), int(_o))
            TAP.tag = ""
        elif parts[0] == "#@AT" and len(parts) >= 4:
            _p, _i, _o = line.split(" ", 1)[1].rsplit(" ", 2)
            POS_NOW[_p] = [int(_i), int(_o)]        # a start point needs no line to be processed first
        elif parts[0] == "#@KEEPALIVE":
            _checkpoint()
            try:
                with open(STATE + ".alive", "w", encoding="utf-8") as f:
                    f.write(_utc() + "\n")
            except OSError:
                pass
        elif parts[0] == "#@CAUGHTUP" and TAP.delivered:
            _checkpoint()          # print-then-save (judgement call (a)): a kill between the two
            sys.exit(0)            # re-delivers — a duplicate wake, never a lost one
        continue
    m = re.match(r"^==> (.+) <==$", line.strip())
    if m:
        cur = m.group(1)
        continue
    if ONCE and pending:
        TAP.tag = f"  [src={os.path.basename(pending[0])}@{pending[2]}"
        if "cc-discord-inbox" in cur:
            try:
                _mid = json.loads(line).get("message_id")
                if _mid:
                    TAP.tag += f" id={_mid}"
            except Exception:
                pass
        TAP.tag += "]"
    try:
        if "cc-wake.log" in cur:
            if line.strip().startswith("WATCHER-CONTROL"):
                # The daily liveness control (P4): answered by a FILE, never by a wake, so proving
                # the watcher is alive costs no turn. Another session's control line is ignored.
                cparts = line.split()
                if ONCE and len(cparts) >= 3 and cparts[1].upper() == ALIAS:
                    with open(STATE + ".control", "w", encoding="utf-8") as f:
                        f.write(f"{cparts[2]} {_utc()}\n")
                continue
            deliver, body = addressed_to_me(line)
            if deliver:
                print(f"WAKE[CHANNEL->{ALIAS}]: {body[:400]}", flush=True)
        elif "cc-bridge-inbox" in cur or "cc-discord-inbox" in cur:
            try:
                d = json.loads(line)
            except Exception:
                continue
            kind = d.get("kind") or ""
            # Defang once, at the single point every JSON-sourced print path draws from.
            # ⛔ `text` IS TRUNCATED (400 chars) AND IS FOR PRINTING. The OWNER-MARKER match below
            # uses `body_raw` instead: the marker is the LAST line of a triage whose median length
            # is ~2,300 chars, so [:400] discarded 99.5% of them before the regex ever ran.
            # ✅ THE GAP THIS COMMENT DESCRIBED IS CLOSED — 2026-09-04, #995 FINDING-1.
            # It read: "the other match sites in this branch still read truncated `text`, and that
            # is a KNOWN, HOMED gap… ~118 of 2,820 of his non-marker replies name a CC only past
            # byte 400 and wake nobody (~4%). Sweep homed to `B-CREW-BOARD-REMOVAL`, owner CC-A,
            # due 2026-09-05."
            # ⛔ EVERY DELIVERY DECISION NOW READS `full` (below). The sweep's premise is
            # discharged and it is removed from `B-CREW-BOARD-REMOVAL` in the ledger.
            # ★ THE BODY IS EDITED, NOT STACKED ON. Langston BLOCKER-3: a correction appended
            # under superseded text leaves the file ASSERTING AN OPEN GAP IT HAS FIXED, and
            # completion reports are written FROM the body, so the stale half propagates.
            # ⚠️ The struck text also carried "due 2026-09-05" — the calendar-date-on-a-batch
            # form Kyle struck (§9.4). It goes with the rest of it.
            # ★ `body_raw`, not `raw`: `raw` is the stdin loop variable ~30 lines up (Langston rider 2)
            # — safe today because the loop rebinds each iteration, but a live trap for the next edit.
            body_raw = d.get("text") or ""
            text = _defang(body_raw[:400])
            # ⛔ `full` IS FOR DECIDING; `text` IS FOR PRINTING. Added 2026-09-04 (#995, Langston
            # Step-4 FINDING-1) and it CLOSES A KNOWN GAP rather than working around it.
            # The gap: every name/tag match in this file read the TRUNCATED `text`, so a message
            # naming a session only past byte 400 woke NOBODY — ~118 of 2,820 of Langston's
            # non-marker replies (~4%), homed and still open. The heartbeat's "sweep the Discord
            # inbox for anything missed" was the COMPENSATING CONTROL for exactly that class, and
            # this batch suppresses the heartbeat — so removing the compensator while leaving the
            # gap open was the real cost of the cut, and it was unpriced until he named it.
            # Deciding on the full body removes the need for the compensator instead of pricing it.
            # The 400-char cut stays on the PRINTED body: it exists so one wake line cannot flood
            # the session, which is a display concern and was never a routing one.
            full = _defang(body_raw)
            tp = "Discord" if d.get("transport") == "discord" else "Telegram"
            if kind == "":
                deliver, _ = addressed_to_me(full)
                body = text
                if deliver:
                    print(f"WAKE[KYLE via {tp}->{ALIAS}]: {body}{media_suffix(d)}", flush=True)
            elif kind == "voice_inbound":
                deliver, _ = addressed_to_me(full)
                body = text
                if deliver:
                    print(f"WAKE[KYLE-VOICE->{ALIAS}]: {body}{media_suffix(d)}", flush=True)
            elif kind == "langston_outbound":
                # B-ALERT-PROTOCOL (#340): an alert-triage reply ends with an owner marker
                # [[ALERT .. owner=<one of ALERT_OWNERS, defined above> ..]] — authoritative routing: owner==me
                # wakes me; the other CC's marker suppresses (theirs); owner=Kyle wakes no CC
                # (he sees it in-channel). The marker decides, so we stop here either way.
                # ⛔ SEARCH `raw`, NOT `text`, AND TAKE THE **LAST** MATCH.
                # LAST, not first, for two reasons Langston measured: 980 of 1,017 well-formed
                # markers sit on the final non-empty line, and 42 bodies carry MORE THAN ONE
                # match — so a first-match would route off a marker being QUOTED or discussed
                # earlier in the body rather than the one being ISSUED at the end.
                mo = None
                for mo in ALERT_OWNER_RE.finditer(body_raw):
                    pass
                # ── B-WAKE-LEAD-NAME (#1040): THE ORDER IS THE FIX ───────────────────────────────
                # The defect: the owner check ran BEFORE anything asked who the reply was addressed
                # to, so "Infra Claude - ..." ending in another session's alert note was dropped as
                # theirs. MEASURED: 104 of 104 such replies since 2026-09-03 joined MATCH to the
                # author of the message they answered (pre-audit F-3, both controls run).
                # (1) owner = the LAST marker in the raw body (above, unchanged).
                # (2) STRIP EVERY MARKER, UNCONDITIONALLY, BEFORE ANY DECISION. The marker carries an
                # alias in `owner=`, which is routing metadata and must never read as prose.
                # ⚠️ THIS CHANGES THE `mo is None` PATH (Langston Step-2 condition 3). A marker whose
                # owner is OUTSIDE ALERT_OWNERS - `owner=OLD-Claude`, a display name where an alias
                # belongs - was never stripped, so it woke that session through MY_RE. It is now
                # stripped. An improvement; a test case pins it.
                # (Stripping only inside `if mo:` is what let the marker's own `owner=CC-A` satisfy
                # MY_RE twice before - caught both times by the behavioural test. Unconditional
                # stripping removes that trap rather than guarding it.)
                text = ALERT_MARKER_STRIP.sub(" ", text)
                full = ALERT_MARKER_STRIP.sub(" ", full)
                # ⛔ THE ROUTING TAG IS ONE INVARIANT, ON BOTH PATHS (Langston Step-8 FINDING-A, then FINDING-D):
                # build the distinct OTHER owners, in body order, unconditionally; tag the wake whenever there is
                # any. The strip above deletes every marker from what the session reads, so without the tag a
                # note for someone else vanishes silently - on EITHER side of the owner test below.
                # SELF IS EXCLUDED on both paths ("routed to" means the others). FINDING-A's first version tagged
                # only the other-owner path and included self there: two paths disagreeing about self is how
                # FINDING-D started. Display only - suppression still keys on the LAST marker.
                # Window for the figures behind this: 80 bodies with >=2 distinct owners is ALL history; since
                # 2026-09-03 it is 38 rows, 8 of which woke a session with no tag before this fix (Langston).
                others = []
                for m in ALERT_OWNER_RE.finditer(body_raw):
                    o = OWNER_CANON[m.group(1).upper()]
                    if o.upper() != ALIAS and o not in others:
                        others.append(o)
                routed = f" [alert routed to {', '.join(others)}]" if others else ""
                if mo:
                    owner = OWNER_CANON[mo.group(1).upper()]
                    if owner.upper() != ALIAS:
                        # (3)+(4) Another owner's marker still SUPPRESSES (the #995 cut, untouched) -
                        # UNLESS the reply OPENS with my name: then it was addressed to me and the
                        # marker is a note for someone else riding along. The wake line says so.
                        if not OPEN_RE.match(full):
                            continue
                    # The owner == ME case falls through; the #995 note below is about it.
                    # 2026-09-03 #995 (B-WAKE-QUIET OBJ-11, KYLE-DIRECTED) — THE MARKER IS NOW
                    # A SUPPRESSOR ONLY, NEVER A WAKER.
                    # WHY: the dedicated ALERT-OWNER wake is a DUPLICATE. `inject-due-alerts`
                    # puts the FULL due-alert list, with full ids, at the top of EVERY prompt in
                    # every session -- so a session cannot miss a due alert by not being woken
                    # for it. This branch told it a second time, out of band.
                    # WHAT IS KEPT: a marker naming ANOTHER session still suppresses (that is
                    # the routing this branch was built for, #340).
                    # WHAT CHANGED: a marker naming ME no longer emits its own wake and no
                    # longer short-circuits -- it FALLS THROUGH to the ordinary Langston rules
                    # below, so his triage still wakes me when he ADDRESSES me by name, which
                    # his bridge does by construction (it auto-leads with the addressee).
                    # HONEST LOSS, stated: a marker that names me inside a message that never
                    # names me in prose now waits for the next turn's alert list instead of
                    # waking me between turns.
                # (5) Wake when Langston (a) uses an explicit wake-tag (broadcast OK), or (b) names
                # me specifically. NOT on his plain replies to Kyle (no name/tag) - too noisy.
                # The routing tag sits right after the label (Langston's Step-2 recommendation): the
                # line still starts `WAKE[LANGSTON`, which is all wake_narration.py keys on (F-6).
                if re.search(r"@?CC[- ]?WAKE|wake\s+(up\s+)?(cc|claude\s*code)", full, re.I):
                    deliver, _ = addressed_to_me(full)
                    body = text
                    if deliver:
                        print(f"WAKE[LANGSTON->{ALIAS}]{routed}: {body}{media_suffix(d)}", flush=True)
                elif MY_RE.search(full):
                    print(f"WAKE[LANGSTON->{ALIAS}]{routed}: {text}{media_suffix(d)}", flush=True)
            elif kind == "langston_outbound_media":
                # Langston uploaded a file with his reply. That upload is mirrored as its OWN
                # entry whose text is "[uploaded <path>]" and which carries no addressee, so it
                # cannot be name-routed — it broadcasts. Deliberate and cheap: his image posts
                # are rare, and an image he ships is evidence. Coupled to the mirror's text
                # format (discord-langston-bridge.py, same batch); if that format changes this
                # branch degrades to silence, never to a wrong path.
                mm = re.match(r"\[uploaded (.+)\]\s*$", text)
                if mm:
                    p = _flat(mm.group(1))   # rider 2: uniform, though the anchored regex
                                             # already degrades to silence on a newline
                    print(f"WAKE[LANGSTON-IMAGE->{ALIAS}]: he posted an image: {p}  "
                          f"[view: {MEDIA_HELPER} {p}]", flush=True)
            elif kind == "cc_outbound":
                # CC<->CC waking: wake on the OTHER session's post if it names me. The `sender`
                # field (set on Discord --sender posts) attributes it; sender==MY_NAME is my own
                # post → never self-wake. No sender (e.g. Telegram) → not a CC<->CC trigger.
                sender = d.get("sender")
                # 2026-08-18 (Kyle-directed, noise reduction): automated notices that name
                # ALL THREE sessions wake ALL THREE by name, so every push by anyone cost
                # three session-turns. MEASURED over the whole log (13,357 rows since
                # 2026-06-19): 771 "Push notice" rows = ~2,313 session-wakes, against 55
                # messages from Kyle himself — automated notices outnumbered him ~14:1.
                # ZERO information loss: the §7.1 batch-close sync gate REQUIRES a
                # `git fetch` before any push, so a session already learns the branch moved
                # at the only moment the fact can change what it does.
                # ⛔ THIS COMMENT IS INVERTED AS OF 2026-09-03 AND IS KEPT ONLY AS A POINTER.
                # It read: "NOT suppressed: Heartbeat — it is the dead-man proof that this
                # watcher is alive... its cost is commentary, not the wake; that is a rules fix."
                # THE ALL-CLEAR HEARTBEAT IS NOW SUPPRESSED, two lines below, and the dead-man
                # claim is false: the heartbeat travels through the very watcher it checks, so a
                # dead watcher receives nothing (#995 OBJ-10, Kyle-directed, Langston concurred
                # at Step 4 that his own #694 refusal was wrong). A stale comment sitting at the
                # call site of its own inversion is `fix-follows-pointer` — he caught it here.
                if is_routine_push_notice(sender, text):
                    continue
                if is_allclear_heartbeat(sender, text):
                    continue  # #995 OBJ-10 — all-clear heartbeat; a problem-reporting one still wakes
                if sender and sender != MY_NAME:
                    # ⛔ NAME-OR-NOTHING (Kyle 2026-08-26). This used addressed_to_me(), whose
                    # no-name-mentioned case BROADCASTS — so a session narrating its own batch, or
                    # talking to the reviewer, woke every other session. MEASURED over 4,000 rows:
                    # 466 of 2,234 crew posts (21%) named nobody, each waking three sessions —
                    # ~1,400 avoidable interruptions. Kyle: "I don't want you guys being notified
                    # of each other's work unless you are deliberately called into that work."
                    # ★ THE REVIEWER'S BRANCH ABOVE ALREADY WORKS THIS WAY — it wakes only on an
                    # explicit tag or on your name, never on a plain reply. This makes the crew
                    # branch consistent with it rather than inventing a new policy.
                    # ⚠️ KYLE'S OWN POSTS ARE UNCHANGED (the kind=="" branch): an unaddressed
                    # message from him still reaches everyone, because he means it.
                    deliver = bool(MY_RE.search(full) or CREW_ALL_RE.search(full))
                    body = text
                    if deliver:
                        print(f"WAKE[{sender} via {tp}->{ALIAS}]: {body}{media_suffix(d)}", flush=True)
        else:
            # ── THE HARNESS THAT IMPERSONATED A CLEAN PASS (Langston rider, 2026-08-20) ──
            # `cur` is set ONLY by tail's "==> file <==" header. A line arriving without one
            # matches none of the branches above and, before this `else`, was dropped in TOTAL
            # SILENCE. That is not a hypothetical: it is what made THREE hand-fed tests of the
            # push-notice suppression read as PASS — including one reported to Kyle as proof —
            # when in truth nothing had been processed at all. Silence from a filter is
            # indistinguishable from silence from a suppressor, and only a POSITIVE CONTROL
            # (a line known to wake, fed through the same harness, also emitting nothing)
            # separated them.
            # A procedure caught it; a procedure is exactly what gets skipped under time
            # pressure, which is #623 leg 2 — convert the control into a MECHANISM. So the
            # harness now announces itself instead of impersonating a clean result.
            # STDERR, deliberately: the Monitor treats stdout as the event stream, so a stdout
            # line here would forge a wake. stderr lands in the task's output file — visible to
            # anyone testing, invisible to the wake channel.
            print(f"[cc-wake-filter] UNROUTED LINE (cur={cur!r}) — no '==> file <==' header seen, "
                  f"so this line matched no branch and was DROPPED. If you are testing by piping "
                  f"lines in, prepend: ==> /var/log/cc-discord-inbox.jsonl <==  — otherwise a "
                  f"silent run is NOT evidence of suppression.", file=sys.stderr, flush=True)
    except Exception:
        # never die on a malformed line
        continue

if ONCE:
    # EOF: the ssh leg dropped (or a harness closed stdin). Save what was processed; exit 0 only
    # if this run delivered, so the arm loop ends — otherwise 3, and the arm loop reconnects.
    _commit(pending)
    _checkpoint()
    sys.exit(0 if TAP.delivered else 3)
