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
}
ALIAS_NAME = {"CC-A": "Claude Old", "CC-B": "Claude New"}  # for CC<->CC wake attribution
MY_NAME = ALIAS_NAME.get(ALIAS, "")
MY_RE = re.compile(r"@?\b(" + "|".join(NAMES.get(ALIAS, [])) + r")\b", re.I)
OTHERS_RE = re.compile(
    r"@?\b(" + "|".join(p for k, v in NAMES.items() if k != ALIAS for p in v) + r")\b", re.I)

def addressed_to_me(text):
    """Return (deliver?, text)."""
    t = text or ""
    if MY_RE.search(t):
        return True, t              # named me (possibly among others)
    if OTHERS_RE.search(t):
        return False, t             # named only other session(s)
    return True, t                  # no names -> broadcast

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
            if "invoke DONE" in line:
                print(f"WAKE[ALERT-HANDLED-BY-LANGSTON]: {line[:300]} — read his response tail in /var/log/langston-alert-invokes.log + check if follow-through work is CC's", flush=True)
        elif "cc-bridge-inbox" in cur or "cc-discord-inbox" in cur:
            try:
                d = json.loads(line)
            except Exception:
                continue
            kind = d.get("kind") or ""
            text = (d.get("text") or "")[:400]
            tp = "Discord" if d.get("transport") == "discord" else "Telegram"
            if kind == "":
                deliver, body = addressed_to_me(text)
                if deliver:
                    print(f"WAKE[KYLE via {tp}->{ALIAS}]: {body}", flush=True)
            elif kind == "voice_inbound":
                deliver, body = addressed_to_me(text)
                if deliver:
                    print(f"WAKE[KYLE-VOICE->{ALIAS}]: {body}", flush=True)
            elif kind == "langston_outbound":
                # Wake when Langston (a) uses an explicit wake-tag (broadcast OK), or (b) names
                # me specifically. NOT on his plain replies to Kyle (no name/tag) — too noisy.
                if re.search(r"@?CC[- ]?WAKE|wake\s+(up\s+)?(cc|claude\s*code)", text, re.I):
                    deliver, body = addressed_to_me(text)
                    if deliver:
                        print(f"WAKE[LANGSTON->{ALIAS}]: {body}", flush=True)
                elif MY_RE.search(text):
                    print(f"WAKE[LANGSTON->{ALIAS}]: {text}", flush=True)
            elif kind == "cc_outbound":
                # CC<->CC waking: wake on the OTHER session's post if it names me. The `sender`
                # field (set on Discord --sender posts) attributes it; sender==MY_NAME is my own
                # post → never self-wake. No sender (e.g. Telegram) → not a CC<->CC trigger.
                sender = d.get("sender")
                if sender and sender != MY_NAME:
                    deliver, body = addressed_to_me(text)
                    if deliver:
                        print(f"WAKE[{sender} via {tp}->{ALIAS}]: {body}", flush=True)
    except Exception:
        # never die on a malformed line
        continue
