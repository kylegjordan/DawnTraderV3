"""B-TOKEN-ECONOMY amendment 1, P6: the ONE home of the alert-key owner routing.

The owner table (`alert_owner_table.json`) is built by `scripts/pm/build-alert-owner-table.py` and READ by the
alert lane in `discord-langston-bridge.py`. Both import this module, so the rule order the table was checked
against at build time is the rule order the lane applies at run time - there is no second copy to drift.

Pure functions over text; no file, network or process I/O here. The bridge does the reading and decides what a
failed read means (it escalates the whole batch - see `load_table` / `parse_register` / `parse_plan`, which RAISE
on an input that parses to nothing rather than return an empty map that would silently route everything to the
fallback).

Rule order (`_about.order` in the table, approved at Step 4 C-4):
  1. a session named in the title (an opening alias or display name, or "owner CC-x" anywhere)
  2. a deploy-window-stale / deploy-in-window key -> its batch
  3. a keyless row whose title opens with a batch-id -> that batch
  4. a keyless row -> its title stem
  5. a gov key with ":" -> its batch
  6. a key -> the longest prefix
  7. a keyed row whose title opens with a batch-id -> that batch
  8. a batch with no table row -> the register, then the plan owner column
  9. a register or plan batch named anywhere in the title
 10. nothing matched -> the table's fallback (CC-INFRA)
Rules 8 and 9 return (None, 'escalate:...') when the register or plan owner is not one of SESSIONS.
"""
import collections
import json
import re

SESSIONS = ('CC-A', 'CC-B', 'CC-C', 'CC-INFRA')
SECT = {'batch': 'batches', 'prefix': 'prefixes', 'title': 'titles'}

# --- the open-batch register: batch -> owner, from the session section the row sits in -----------------------
SECTION = {'OLD Claude': 'CC-A', 'NEW Claude': 'CC-B', 'ANALYST Claude': 'CC-C',
           'Infra Claude': 'CC-INFRA', 'PM Claude': 'CC-PM'}
_REG_ROW = re.compile(r'^\| (?:~~)?([BT]-[A-Z0-9.-]+)')


def _lines(text):
    # LF only, as the builder reads its files (universal newlines already applied by the caller's text read).
    return (text or '').split('\n')


def parse_register(text):
    """{batch: owner} from OPEN_BATCH_REGISTER.md. RAISES ValueError when nothing parses."""
    register, sect = {}, None
    for l in _lines(text):
        if l.startswith('## '):
            sect = next((v for k, v in SECTION.items() if l[3:].startswith(k)), None)
            continue
        m = _REG_ROW.match(l)
        if sect and m:
            register[m.group(1)] = sect
    if not register:
        raise ValueError('the open-batch register parsed to zero batches')
    return register


# --- the active plan's owner column, for batches the register does not list -----------------------------------
# The owner cell sits right after the batch cell in some tables and right BEFORE it in the session-section
# tables, so both neighbours are read, and a cell counts only when the WHOLE cell is an owner name (Step-4 C-5,
# Langston 2026-11-20: a search over prose read B-LANGSTON-CONTEXT's note cell as CC-B). A batch with two
# different plan owners is left out.
_OWNER_FULL = re.compile(r'(CC-A|CC-B|CC-C|CC-INFRA|CC-PM|Infra Claude|PM Claude)'
                         r'(?:\s*\((?:Old|New|Analyst|OLD|NEW|ANALYST) (?:Claude|Codex)\)|\s*/\s*OLD Codex)?')
_OWNER_NAME = {'Infra Claude': 'CC-INFRA', 'PM Claude': 'CC-PM'}
_PLAN_BATCH = re.compile(r'^(?:~~|\*\*)*([BT]-[A-Z0-9][A-Z0-9.-]*[A-Z0-9])')


def _owner_cell(c):
    m = _OWNER_FULL.fullmatch(c.strip().strip('*~').strip())
    if m:
        return _OWNER_NAME.get(m.group(1), m.group(1))


def parse_plan(text):
    """(plan_owner {batch: owner} for single-owner batches, multi {batch: sorted owners} for two-owner ones).
    RAISES ValueError when no batch has an owner."""
    found = collections.defaultdict(set)
    for l in _lines(text):
        if not l.startswith('|'):
            continue
        cells = [c.strip() for c in l.strip().strip('|').split('|')]
        for j, c in enumerate(cells):      # every cell, the last included (Langston Step-4 rider b)
            m = _PLAN_BATCH.match(c)
            if m:
                for k in (j - 1, j + 1):
                    o = _owner_cell(cells[k]) if 0 <= k < len(cells) else None
                    if o:
                        found[m.group(1)].add(o)
                break
    plan_owner = {b: next(iter(o)) for b, o in found.items() if len(o) == 1}
    multi = {b: sorted(o) for b, o in found.items() if len(o) > 1}
    if not plan_owner:
        raise ValueError('the active plan parsed to zero single-owner batches')
    return plan_owner, multi


def batch_owners(register, plan_owner):
    """The register wins over the plan."""
    return dict(plan_owner, **register)


# --- the family a row belongs to --------------------------------------------------------------------------------
OWNER_TITLE = re.compile(r'^(CC-(?:A|B|C|INFRA)|OLD Claude|NEW Claude|ANALYST Claude|Infra Claude)\s*[:—-]')
OWNER_SUFFIX = re.compile(r'\bowner (CC-(?:A|B|C|INFRA)|Infra)\b')
DISPLAY = {'OLD Claude': 'CC-A', 'NEW Claude': 'CC-B', 'ANALYST Claude': 'CC-C', 'Infra Claude': 'CC-INFRA',
           'Infra': 'CC-INFRA'}
BATCH_TITLE = re.compile(r'^(B-[A-Z0-9-]+)[: ]')
BATCH_KEY = ('deploy-window-stale:', 'deploy-in-window:')
BATCH_ANY = re.compile(r'\b(B-[A-Z0-9][A-Z0-9-]*[A-Z0-9])\b')


def family(k, c, t, prefixes, titles):
    """(kind, name): kind is owner | batch | prefix | title. An unmatched prefix or title carries a leading '?'.
    `prefixes` and `titles` are the key sets to match against; both are tried longest first."""
    k, t = k or '', t or ''
    m = OWNER_TITLE.match(t) or OWNER_SUFFIX.search(t)
    if m:
        return ('owner', DISPLAY.get(m.group(1), m.group(1)))
    for bk in BATCH_KEY:
        if k.startswith(bk):
            return ('batch', k.split(':')[1])          # <prefix>:<BATCH>[:sha:ts]
    if not k and BATCH_TITLE.match(t):
        return ('batch', BATCH_TITLE.match(t).group(1))
    if not k:
        for stem in sorted(titles, key=len, reverse=True):
            if t.startswith(stem):
                return ('title', stem)
        return ('title', '?' + t[:40])
    if k.startswith('gov-') and ':' in k:
        return ('batch', k.split(':')[1])             # gov-<check>:<BATCH>[:<sub>]
    for pre in sorted(prefixes, key=len, reverse=True):  # colonless gov- keys land here (R2-2 item 1)
        if k.startswith(pre):
            return ('prefix', pre)
    if BATCH_TITLE.match(t):                           # a keyed row whose title names its batch
        return ('batch', BATCH_TITLE.match(t).group(1))
    return ('prefix', '?' + k)


def table_route(k, c, t, table, batch_owner):
    """(owner, rule) for one alert row. `rule` names what set the owner; 'fallback' means nothing matched."""
    f = family(k, c, t, table['prefixes'], table['titles'])
    if f[0] == 'owner':
        return (f[1], 'owner named in title')
    row = table[SECT[f[0]]].get(f[1])
    if row:
        return (row['owner'], f[0] + ':' + f[1])
    if f[0] == 'batch' and f[1] in batch_owner:
        return _batch_route(f[1], batch_owner[f[1]], 'register/plan:' + f[1])
    for b in BATCH_ANY.findall(t or ''):               # a batch the register or plan knows, named anywhere in the title
        if b in batch_owner:
            return _batch_route(b, batch_owner[b], 'title names ' + b)
    return (table['fallback'], 'fallback')


ESCALATE = 'escalate:'


def _batch_route(batch, owner, rule):
    """Rules 8 and 9 read an owner out of the register or the plan, which can name an owner the alert lane must
    never route to - PM Claude's register section maps to CC-PM (Step-4 BLOCKER-1, Langston 2026-11-20). Such an
    owner is an ESCALATION to Langston: (None, 'escalate:<why>'). Never the fallback (that would be a guess) and
    never the owner verbatim (an alert routed to a non-building session is cleared without waking anyone)."""
    if owner in SESSIONS:
        return (owner, rule)
    return (None, ESCALATE + 'batch %s is owned by %s, not a building session' % (batch, owner))


def is_escalation(route):
    """True when a table_route result is an escalation rather than an owner."""
    return bool(route) and str(route[1]).startswith(ESCALATE)


def load_table(text):
    """The parsed table. RAISES ValueError on anything a router could not trust: unparseable JSON, a missing
    section, zero rows, an owner outside the four building sessions, or a fallback outside them."""
    if not (text or '').strip():
        raise ValueError('the owner table is empty')
    table = json.loads(text)
    if not isinstance(table, dict):
        raise ValueError('the owner table is not an object')
    n = 0
    for s in SECT.values():
        sec = table.get(s)
        if not isinstance(sec, dict):
            raise ValueError('the owner table has no %s section' % s)
        for name, row in sec.items():
            if not isinstance(row, dict) or row.get('owner') not in SESSIONS:
                raise ValueError('owner table row %s:%s has no building-session owner' % (s, name))
            n += 1
    if not n:
        raise ValueError('the owner table has zero rows')
    if table.get('fallback') not in SESSIONS:
        raise ValueError('the owner table fallback is not a building session')
    return table


def dedupe_key_of(row):
    """An alert row's key: the top-level field, else metadata.dedupe_key (the governance checker writes it there
    and leaves the top level null - measured 2026-11-20 on c9b493ad, gov-staleopen:B-CLOSE-WRITER-COSTS)."""
    k = (row or {}).get('dedupe_key')
    if not k:
        md = (row or {}).get('metadata')
        if isinstance(md, dict):
            k = md.get('dedupe_key')
    return k or ''
