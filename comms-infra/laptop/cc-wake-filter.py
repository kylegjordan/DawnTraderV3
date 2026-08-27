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
MY_RE = re.compile(r"@?\b(" + "|".join(NAMES.get(ALIAS, [])) + r")\b", re.I)
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
            # ⛔ `text` IS TRUNCATED (400 chars) AND IS FOR PRINTING. The OWNER-MARKER match below
            # uses `body_raw` instead: the marker is the LAST line of a triage whose median length
            # is ~2,300 chars, so [:400] discarded 99.5% of them before the regex ever ran.
            # ⚠️ SCOPE OF THAT CLAIM, NARROWED DELIBERATELY (Langston rider 1, 2026-08-24): this comment
            # once asserted "anything that MATCHES must use raw" — a GLOBAL invariant this file does
            # NOT hold. The other match sites in this branch still read truncated `text`, and that is
            # a KNOWN, HOMED gap, not an oversight: ~118 of 2,820 of his non-marker replies name a CC
            # only past byte 400 and wake nobody (~4%, his measurement, order-of-magnitude). It fails
            # toward SILENCE, not noise. Sweep homed to `B-CREW-BOARD-REMOVAL`, owner CC-A, due
            # 2026-09-05. DO NOT re-broaden this comment without doing that sweep.
            # ★ `body_raw`, not `raw`: `raw` is the stdin loop variable ~30 lines up (Langston rider 2)
            # — safe today because the loop rebinds each iteration, but a live trap for the next edit.
            body_raw = d.get("text") or ""
            text = _defang(body_raw[:400])
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
