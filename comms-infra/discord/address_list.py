r"""address_list.py - who a post is addressed to: the names in its OPENING LIST (B-WAKE-OPENING-LIST, #1241).

Kyle, KD-20/KD-21 (2026-11-04): a post opening "Langston, Coltrane, OLD Claude, NEW Claude - ..." wakes every one of
them; a passing mention later in the post wakes nobody. ONE rule, read by every site that decides a session post's
wake: Langston's bridge, the sender (discord_common), Coltrane's bot, and each session's wake filter.

Stdlib only. This file is LOADED BY PATH AND PINNED BY SHA-256 in every consumer (each checks the copy it actually
runs - #1004's class), so any edit here must be followed by updating those constants; address_list_test.py computes
the value and fails until they agree. Never hand-type it.

THE ALGORITHM (scope OBJ-1, Langston B-2). It never tokenises: the registry entries are regexes that carry their own
separator class (`old[\s_-]*claude`) and lookbehinds (CC-PM's clock-time guard), so splitting the text first would
cut through them.
  1. Skip leading MARKUP.
  2. Try every registry alternative ANCHORED at that position, against the FULL string (`pattern.match(text, pos)`,
     so a lookbehind still sees the left context). The LONGEST match wins.
  3. Consume one SEPARATOR. Bare whitespace is NOT one ("Langston Coltrane x" names Langston only).
  4. Continue only if another registry name starts there; stop at the first position where none does.
"""
import re

# ONE markup class, used before the first name AND around every separator, so a second "@" or "**" is consumed
# exactly as the first (r4a, Langston A-1). The members are ADDRESS_START_RE's, plus "@" (r4, Langston C-3).
# "<" is deliberately NOT in it: a real Discord mention arrives as "<@id>" and is not a name.
MARKUP = r'[@\s*_~`>#:".\-]*'
# "," (optionally followed by "and"), "&", "/", "+" or the word "and" - each with optional markup around it.
SEPARATOR = MARKUP + r'(?:,(?:' + MARKUP + r'and\b)?|[&/+]|and\b)' + MARKUP

_MARKUP_RE = re.compile(MARKUP)
_SEPARATOR_RE = re.compile(SEPARATOR, re.I)

# THE CREW REGISTRY for the Helsinki consumers (the two bridges, the sender, Coltrane's bot).
# ⛔ SESSION_NAMES IS A PINNED COPY, NOT A SECOND SOURCE: the authority is `NAMES` in
#    comms-infra/laptop/cc-wake-filter.py, which must keep its own list so it can still wake when this file is missing.
#    address_list_test.py fails unless the two are equal - change the filter first, then this, then the sha pins.
SESSION_NAMES = {
    "CC-A": [r"claude[\s_-]*old", r"old[\s_-]*claude", r"cc[\s_-]*a"],
    "CC-B": [r"claude[\s_-]*new", r"new[\s_-]*claude", r"cc[\s_-]*b"],
    "CC-C": [r"claude[\s_-]*analyst", r"analyst[\s_-]*claude", r"cc[\s_-]*c"],
    "CC-INFRA": [r"infra[\s_-]*claude", r"claude[\s_-]*infra", r"cc[\s_-]*infra"],
    "CC-PM": [r"(?<![0-9])(?<![0-9][\s])(?-i:PM)[\s_-]*claude", r"cc[\s_-]*pm"],
}
REVIEWER_NAMES = {
    "LANGSTON": [r"langston"],
    "COLTRANE": [r"coltrane", r"codex"],
}
REGISTRY = {**SESSION_NAMES, **REVIEWER_NAMES}

_COMPILED = {}


def _compiled(registry):
    r"""[(key, compiled alternative)], cached per registry. Each alternative must END at a word boundary (as
    ADDRESS_START_RE's `langston\b` and MY_RE's trailing `\b` did), so "Langstonish" is not "Langston"."""
    sig = tuple((k, tuple(v)) for k, v in registry.items())
    out = _COMPILED.get(sig)
    if out is None:
        out = [(k, re.compile(r"(?:" + alt + r")\b", re.I)) for k, alts in registry.items() for alt in alts]
        _COMPILED[sig] = out
    return out


def opening_list(text, registry):
    """(names, end): the registry keys named in `text`'s opening list, in order of appearance, and the offset just
    past the LAST name of that list (0 when it is empty). A sender places a mention at `end`, never at the start:
    "<" is not markup, so a mention placed first would empty the list for every reader."""
    text = text or ""
    alternatives = _compiled(registry)
    pos = _MARKUP_RE.match(text).end()
    names, end = [], 0
    while True:
        best = None
        for key, rx in alternatives:
            m = rx.match(text, pos)
            if m and m.end() > pos and (best is None or m.end() > best[1]):
                best = (key, m.end())
        if best is None:
            break
        if best[0] not in names:
            names.append(best[0])
        end = best[1]
        sep = _SEPARATOR_RE.match(text, end)
        if not sep:
            break
        pos = sep.end()
    return names, end


def opening_addressees(text, registry):
    """The set of registry keys in `text`'s opening list (scope OBJ-1's signature)."""
    return set(opening_list(text, registry)[0])
