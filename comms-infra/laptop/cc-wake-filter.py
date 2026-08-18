#!/usr/bin/env python3
"""CC wake-channel filter — consumes a multi-file `tail -F` stream from Helsinki and
emits one compact line per wake-worthy event. Each emitted line wakes the CC session
(Monitor tool event). Sources:
  /var/log/cc-bridge-inbox.jsonl       -> Kyle direct messages + voice notes + Langston wake-tagged posts
  /var/log/langston-alert-invokes.log  -> Langston finished handling a system alert ("invoke DONE")
  /var/log/cc-wake.log                 -> dedicated wake channel: ANY appended line wakes CC
"""
import sys, json, re

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
}
ALIAS_NAME = {"CC-A": "OLD Claude", "CC-B": "NEW Claude", "CC-C": "ANALYST Claude"}  # display names (Kyle 2026-06-20; CC-C added 2026-07-19) + CC<->CC wake attribution
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
    r"^\s*(?:[\w\s/]*?—\s*)?review branch moved to\s+\S+\.?\s*"
    r"(?:pull before you push\.?)?\s*(?:\(if this is your own push,? ignore it\.?\))?\s*$",
    re.I)

def is_routine_push_notice(sender, text):
    """True ONLY for the sha-only notice. Unknown shapes -> False -> delivered."""
    if sender != "Push notice":
        return False
    return bool(_ROUTINE_PUSH.match((text or "").strip()))
MY_RE = re.compile(r"@?\b(" + "|".join(NAMES.get(ALIAS, [])) + r")\b", re.I)
OTHERS_RE = re.compile(
    r"@?\b(" + "|".join([p for k, v in NAMES.items() if k != ALIAS for p in v] + ["langston"]) + r")\b", re.I)
# B-ALERT-PROTOCOL (#340): a system-alert triage reply ends with an owner marker
# [[ALERT id=.. owner=<CC-A|CC-B|Kyle> action=".."]] — authoritative wake routing.
ALERT_OWNER_RE = re.compile(r"\[\[ALERT\b[^\]]*\bowner=(CC-A|CC-B|Kyle)\b", re.I)

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

cur = ""
for raw in sys.stdin:
    line = raw.rstrip("\n")
    if not line.strip():
        continue
    m = re.match(r"^==> (.+) <==$", line.strip())
    if m:
        cur = m.group(1)
        continue
    try:
        if "cc-wake.log" in cur:
            deliver, body = addressed_to_me(line)
            if deliver:
                print(f"WAKE[CHANNEL->{ALIAS}]: {body[:400]}", flush=True)
        elif "langston-alert-invokes" in cur:
            # B-ALERT-PROTOCOL (#340): alert wakes are now OWNER-ROUTED — only the named
            # owner wakes, via the [[ALERT .. owner=X ..]] marker in Langston's Discord triage
            # (handled in the langston_outbound branch below). The old broadcast "invoke DONE
            # -> BOTH CC sessions, every alert" wake is SUPERSEDED + was flooding both sessions
            # on a backlog clear (Kyle caught it 2026-06-24). Removed.
            pass
        elif "cc-bridge-inbox" in cur or "cc-discord-inbox" in cur:
            try:
                d = json.loads(line)
            except Exception:
                continue
            kind = d.get("kind") or ""
            # Defang once, at the single point every JSON-sourced print path draws from.
            text = _defang((d.get("text") or "")[:400])
            tp = "Discord" if d.get("transport") == "discord" else "Telegram"
            if kind == "":
                deliver, body = addressed_to_me(text)
                if deliver:
                    print(f"WAKE[KYLE via {tp}->{ALIAS}]: {body}{media_suffix(d)}", flush=True)
            elif kind == "voice_inbound":
                deliver, body = addressed_to_me(text)
                if deliver:
                    print(f"WAKE[KYLE-VOICE->{ALIAS}]: {body}{media_suffix(d)}", flush=True)
            elif kind == "langston_outbound":
                # B-ALERT-PROTOCOL (#340): an alert-triage reply ends with an owner marker
                # [[ALERT .. owner=<CC-A|CC-B|Kyle> ..]] — authoritative routing: owner==me
                # wakes me; the other CC's marker suppresses (theirs); owner=Kyle wakes no CC
                # (he sees it in-channel). The marker decides, so we stop here either way.
                mo = ALERT_OWNER_RE.search(text)
                if mo:
                    if mo.group(1).upper() == ALIAS:
                        print(f"WAKE[ALERT-OWNER->{ALIAS}]: {text}", flush=True)
                    continue
                # Wake when Langston (a) uses an explicit wake-tag (broadcast OK), or (b) names
                # me specifically. NOT on his plain replies to Kyle (no name/tag) — too noisy.
                if re.search(r"@?CC[- ]?WAKE|wake\s+(up\s+)?(cc|claude\s*code)", text, re.I):
                    deliver, body = addressed_to_me(text)
                    if deliver:
                        print(f"WAKE[LANGSTON->{ALIAS}]: {body}{media_suffix(d)}", flush=True)
                elif MY_RE.search(text):
                    print(f"WAKE[LANGSTON->{ALIAS}]: {text}{media_suffix(d)}", flush=True)
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
                # NOT suppressed: "Heartbeat" — it is the dead-man proof that this watcher
                # is alive, and a session cannot verify that from a channel it stopped
                # receiving. Its cost is commentary, not the wake; that is a rules fix.
                if is_routine_push_notice(sender, text):
                    continue
                if sender and sender != MY_NAME:
                    deliver, body = addressed_to_me(text)
                    if deliver:
                        print(f"WAKE[{sender} via {tp}->{ALIAS}]: {body}{media_suffix(d)}", flush=True)
    except Exception:
        # never die on a malformed line
        continue
