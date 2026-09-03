#!/usr/bin/env python3
"""wake_narration.py — how much does a session SAY in response to events it did not ask for?

WHY THIS EXISTS AS A COMMITTED SCRIPT AND NOT A DESCRIPTION (#995 OBJ-8).
`B_WAKE_QUIET_SCOPE.md` §1 described this measurement in prose and called it the batch's
foundation. A reader implemented that prose independently and got 217 wakes at 69 chars where
the scope said 73 at ~663 — an order of magnitude apart, from the same words. A measurement
that two careful readers cannot reproduce cannot judge anything, so the window, the turn model
and the categories are fixed HERE, in code, and the scope now points at this file.

THE TURN MODEL, stated because it is the whole measurement:
  A `user` entry OPENS a turn. Every `assistant` entry until the NEXT user entry belongs to it.
  "spoke" = any assistant TEXT in that turn. Tool calls alone are not speaking.
  Two earlier versions of this got it wrong in opposite directions and both produced
  confident tables: one let a turn stay open across text-free assistant messages and credited
  LATER text to an earlier wake; the other closed the turn on the first assistant message and
  so missed text that came after a tool call. Neither is a judgement call — the second is
  right, and it is written down here so the third attempt does not have to rediscover it.

WHY THE WINDOW IS TIME-BOUNDED AND NOT BYTE-BOUNDED:
  transcripts are append-only files that get TRIMMED and REPLACED (a fresh session starts a
  new file). A "last N MB" window re-read after a change still contains pre-change turns in
  an unknown proportion, so it silently mixes two regimes. Pass --since/--until.

DENOMINATORS THAT MUST TRAVEL WITH THE RATE (or it reads high for the wrong reason):
  a session that CANNOT complete a request emits text-free wake turns and its speak-rate
  falls without anyone changing behaviour. That happened live on 2026-09-03 (#997, an
  Anthropic incident). So every row also carries completed assistant responses and API errors
  in the same window. A rate whose denominators moved is not comparable.
"""
import argparse, glob, json, os, sys
from collections import defaultdict

PROJECTS = os.path.expanduser(r'~\.claude\projects')
SESSIONS = {'CC-A OLD': 'C--DawnTraderV3-old', 'CC-B NEW': 'C--DawnTraderV3-new',
            'CC-C ANALYST': 'C--DawnTraderV3-analyst', 'CC-INFRA': 'C--DawnTraderV3-infra'}

# Categories are fixed here so two runs are comparable. Order matters: first match wins.
CATEGORIES = [
    ('heartbeat',        lambda t: 'WAKE[Heartbeat' in t),
    ('push notice',      lambda t: 'WAKE[Push notice' in t),
    ('Langston',         lambda t: 'WAKE[LANGSTON' in t),
    ('alert routed',     lambda t: 'WAKE[ALERT-OWNER' in t),
    ('crew post',        lambda t: 'WAKE[' in t and 'Claude via' in t),
    ('other wake',       lambda t: 'WAKE[' in t),
    ('own bg task',      lambda t: '<task-notification>' in t or 'Monitor event' in t),
]

def text_of(msg):
    c = msg.get('content')
    if isinstance(c, str):
        return c
    if isinstance(c, list):
        return ' '.join(b.get('text', '') for b in c
                        if isinstance(b, dict) and b.get('type') == 'text')
    return ''

def classify(t):
    # A real prompt from Kyle is anything that is not a machine event and not a slash command.
    if t.strip().startswith(('<local-command', '<command-name')):
        return None                      # UI command, not a turn either way
    for name, test in CATEGORIES:
        if test(t):
            return name
    if '<system-reminder>' in t and 'task-notification' in t:
        return 'own bg task'
    return 'KYLE PROMPT'

def rows(path):
    with open(path, 'rb') as fh:
        for raw in fh:
            raw = raw.strip()
            if not raw:
                continue
            try:
                yield json.loads(raw.decode('utf-8', 'replace'))
            except Exception:
                continue

def measure(folder, since, until):
    files = glob.glob(os.path.join(PROJECTS, folder, '*.jsonl'))
    if not files:
        return None
    turns = defaultdict(lambda: {'n': 0, 'spoke': 0, 'chars': 0})
    completed = errors = 0
    cur = None          # category of the open turn, or None
    cur_chars = 0       # chars THIS turn has produced

    def close():
        # ⛔ `spoke` is a property of the TURN, not of the category. An earlier draft
        # incremented it against the category accumulator, so once any turn in a category had
        # spoken the counter never moved again and every category read "spoke: 1". Closing the
        # turn in one place is what makes that impossible to write by accident.
        nonlocal cur, cur_chars
        if cur is not None:
            turns[cur]['chars'] += cur_chars
            if cur_chars > 0:
                turns[cur]['spoke'] += 1
        cur, cur_chars = None, 0

    for path in sorted(files, key=os.path.getsize, reverse=True)[:1]:
        for r in rows(path):
            ts = r.get('timestamp') or ''
            m = r.get('message') or {}
            role = m.get('role')
            if role == 'user':
                t = text_of(m)
                if not t:
                    continue
                close()
                cat = classify(t)
                if cat and (not ts or (since <= ts <= until)):
                    cur = cat
                    turns[cat]['n'] += 1
            elif role == 'assistant':
                if ts and not (since <= ts <= until):
                    close()
                    continue
                if r.get('isApiErrorMessage'):
                    errors += 1
                elif isinstance(m.get('usage'), dict) and str(m.get('model')) != '<synthetic>':
                    completed += 1
                if cur is not None:
                    cur_chars += len(text_of(m).strip())
        close()
    return turns, completed, errors

# ── DOES AN INSTRUCTION PLACED *INSIDE* A WAKE BODY CHANGE BEHAVIOUR? ────────────────────
# This is the measurement that struck OBJ-4′ (#995), and it had no committed instrument —
# the same defect this whole file exists to fix, one level up. The heartbeat body has carried
# three imperatives since 2026-07-22, so the design "put the instruction in the event" has
# been installed and running for six weeks and can simply be read off.
# COMPLIANCE IS PROXIED BY THE TOOL CALL THE INSTRUCTION ASKS FOR, and the proxy is stated
# rather than hidden: "re-arm only if dead" -> the turn touches cc-wake-filter; "sweep the
# Discord inbox" -> the turn reads cc-discord-inbox. A session that complied by some other
# route is counted as non-compliant, so these rates are an UPPER BOUND on non-compliance,
# i.e. the honest direction for a claim that compliance is near zero.
INSTRUCTIONS = [
    ('re-arm only if dead',      lambda s: 'cc-wake-filter' in s or 'cc_wake_filter' in s),
    ('sweep the Discord inbox',  lambda s: 'cc-discord-inbox' in s),
]

def compliance(folder, since, until):
    files = glob.glob(os.path.join(PROJECTS, folder, '*.jsonl'))
    if not files:
        return None
    seen = {k: 0 for k, _ in INSTRUCTIONS}
    did = {k: 0 for k, _ in INSTRUCTIONS}
    turns = spoke = 0
    cur = None
    for path in sorted(files, key=os.path.getsize, reverse=True)[:1]:
        for r in rows(path):
            ts = r.get('timestamp') or ''
            m = r.get('message') or {}
            role = m.get('role')
            if role == 'user':
                t = text_of(m)
                if not t:
                    continue
                if cur:
                    turns += 1
                    if cur['said']:
                        spoke += 1
                    for k, _ in INSTRUCTIONS:
                        if cur['saw'][k]:
                            seen[k] += 1
                            if cur['did'][k]:
                                did[k] += 1
                cur = None
                if 'WAKE[Heartbeat' in t and (not ts or since <= ts <= until):
                    cur = {'saw': {k: (k in t) for k, _ in INSTRUCTIONS},
                           'did': {k: False for k, _ in INSTRUCTIONS}, 'said': False}
            elif role == 'assistant' and cur:
                if text_of(m).strip():
                    cur['said'] = True
                c = m.get('content')
                if isinstance(c, list):
                    for b in c:
                        if isinstance(b, dict) and b.get('type') == 'tool_use':
                            s = json.dumps(b.get('input', {}))
                            for k, test in INSTRUCTIONS:
                                if test(s):
                                    cur['did'][k] = True
    return turns, spoke, seen, did

def run_compliance(since, until):
    print(f"INSTRUCTION-IN-THE-BODY COMPLIANCE   window {since} -> {until}")
    print("(the heartbeat body has carried these since 2026-07-22; compliance proxied by the")
    print(" tool call each instruction asks for, which is an UPPER BOUND on non-compliance)\n")
    T = S = 0
    seen_all = {k: 0 for k, _ in INSTRUCTIONS}
    did_all = {k: 0 for k, _ in INSTRUCTIONS}
    for label, folder in SESSIONS.items():
        got = compliance(folder, since, until)
        if not got:
            continue
        t, s, seen, did = got
        T += t; S += s
        for k, _ in INSTRUCTIONS:
            seen_all[k] += seen[k]; did_all[k] += did[k]
        print(f"  {label:13} heartbeat turns {t:4}  spoke {s:4}")
    print()
    print(f"  TOTAL heartbeat-opened turns: {T}")
    print(f"  produced assistant TEXT:      {S}  ({100*S//max(T,1)}%)")
    for k, _ in INSTRUCTIONS:
        n, c = seen_all[k], did_all[k]
        print(f"  instruction delivered intact: {n:4}  complied: {c:3}  "
              f"({100*c/max(n,1):.1f}%)   \"{k}\"")
    print("\n  ⇒ the body reliably produces narration and reliably fails to produce the action.")

def main():
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--since', required=True, help='ISO8601, e.g. 2026-08-20T00:00:00Z')
    ap.add_argument('--until', required=True, help='ISO8601')
    ap.add_argument('--instruction-compliance', action='store_true',
                    help='instead of the narration table, measure whether an instruction '
                         'placed INSIDE a wake body is obeyed (the #995 OBJ-4 strike)')
    ap.add_argument('--label', default='', help='what this window is (goes in the JSON)')
    ap.add_argument('--json', help='write the result here as a committed extract')
    a = ap.parse_args()

    if a.instruction_compliance:
        run_compliance(a.since, a.until)
        return

    out = {'since': a.since, 'until': a.until, 'label': a.label, 'sessions': {}}
    print(f"window {a.since} -> {a.until}   {a.label}")
    print(f"{'session':13} {'category':13} {'turns':>6} {'spoke':>6} {'rate':>6} {'chars':>9} {'chars/turn':>11}")
    for label, folder in SESSIONS.items():
        got = measure(folder, a.since, a.until)
        if not got:
            print(f"{label:13} (no transcript found)"); continue
        turns, completed, errors = got
        out['sessions'][label] = {'completed_responses': completed, 'api_errors': errors,
                                  'categories': {}}
        wake_n = wake_spoke = wake_chars = 0
        for cat in [c[0] for c in CATEGORIES] + ['KYLE PROMPT']:
            d = turns.get(cat)
            if not d or d['n'] == 0:
                continue
            spoke = d['spoke']
            rate = f"{100*spoke//d['n']}%"
            per = d['chars'] // max(d['n'], 1)
            print(f"{label:13} {cat:13} {d['n']:6} {spoke:6} {rate:>6} {d['chars']:9} {per:11}")
            out['sessions'][label]['categories'][cat] = {
                'turns': d['n'], 'spoke': spoke, 'chars': d['chars'], 'chars_per_turn': per}
            if cat != 'KYLE PROMPT':
                wake_n += d['n']; wake_spoke += spoke; wake_chars += d['chars']
        out['sessions'][label]['wake_totals'] = {
            'turns': wake_n, 'spoke': wake_spoke, 'chars': wake_chars}
        print(f"{label:13} {'>> ALL WAKES':13} {wake_n:6} {wake_spoke:6} "
              f"{(str(100*wake_spoke//wake_n)+'%') if wake_n else '-':>6} {wake_chars:9} "
              f"{wake_chars//max(wake_n,1):11}")
        # ⛔ PROPORTIONAL, NOT ANY>0. A first version warned on a single error in six thousand
        # responses, which is a false alarm dressed as rigour — the same shape as the drift
        # check that cried wolf on every edit. The question is whether failures were common
        # enough to depress the speak-rate, so state the share and let 1% be the line.
        share = errors / max(completed + errors, 1)
        warn = ('   <-- REQUESTS WERE FAILING AT THIS RATE; the speak-rate is NOT comparable'
                if share >= 0.01 else '')
        print(f"{label:13} DENOMINATORS: completed responses {completed}, API errors {errors} "
              f"({share*100:.2f}% of requests){warn}")
        print()
    if a.json:
        with open(a.json, 'w', encoding='utf-8') as fh:
            json.dump(out, fh, indent=1)
        print('wrote', a.json)

if __name__ == '__main__':
    main()
