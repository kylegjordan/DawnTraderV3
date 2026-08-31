# -*- coding: utf-8 -*-
"""OBJ-6b, INSTRUMENT 1: attribute each wrong-object instance from its COMMIT BODY.

The gate question is NOT "was the word Bash written down". It is: WOULD A PostToolUse
HOOK ON `Bash` HAVE SEEN THE READING THAT WENT WRONG? So rows are classified by whether
the named instrument executes THROUGH the Bash tool.

Langston's r2 correction is the design constraint here: attribution in MISTAKE_PATTERNS.md
appears INCIDENTALLY, in prose, for some instances and not others -- there is no tool
column. The same is true of commit bodies. ⇒ this instrument MUST report an UNATTRIBUTED
bucket rather than forcing every row into a class; a matcher that always finds something
is the failure this batch is about.
"""
import json, io, re, os

SP = r'C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-old\66dbb030-b3cb-4448-8086-39344c645007\scratchpad'
pop = json.load(io.open(os.path.join(SP, 'obj6b_population.json'), encoding='utf-8'))
rows = pop['commits']

# Instruments that execute THROUGH the Bash tool in this project. Each pattern is a thing a
# commit body actually says when it names how the reading was taken.
BASH_SIGNS = [
    (r'\bgit (log|show|grep|rev-list|diff|ls-tree|cat-file|status|stash|rev-parse|checkout)\b', 'git via Bash'),
    (r'\bgrep\b|\brg\b|\bripgrep\b',                                                            'grep via Bash'),
    (r'\bmd5sum\b|\bwc -c\b|\bwc -l\b|\bstat\b|\bls -',                                         'file stat via Bash'),
    (r'\bpsql\b|\bSELECT\b|\bsupabase\b|\bquery\b.{0,24}\b(table|column|row)',                   'DB query via Bash'),
    (r'\bcurl\b|\bapi/|\bHTTP \d{3}\b|\b404\b',                                                  'HTTP via Bash'),
    (r'\bssh\b|\bpm2\b|\btail\b|\bjournalctl\b',                                                 'remote/log via Bash'),
    (r'\bpython3?\b|\bnode\b|\bnpm\b|\btsc\b',                                                   'script via Bash'),
]
# Instruments that DO NOT go through the Bash tool.
NONBASH_SIGNS = [
    (r'\bRead tool\b|\bthe Read tool\b',                'Read tool'),
    (r'\bGrep tool\b|\bGlob tool\b',                    'Grep/Glob tool'),
    (r'\bWebFetch\b|\bWebSearch\b',                     'Web tool'),
    (r'\bfrom memory\b|\bwithout (opening|reading|checking)\b|\brecall(ed|ing)?\b|\bassert(ed)? without\b',
                                                       'NO INSTRUMENT - recalled/asserted'),
    (r'\bthe (docs?|documentation) (say|said|states?)\b|\breported by\b|\btook .{0,12}on report\b',
                                                       'reported fact / doc'),
]

def classify(body):
    hits_b = [lab for pat, lab in BASH_SIGNS if re.search(pat, body, re.I)]
    hits_n = [lab for pat, lab in NONBASH_SIGNS if re.search(pat, body, re.I)]
    return hits_b, hits_n

bash_only, nonbash_only, both, unattributed = [], [], [], []
labels = {}
for r in rows:
    b, n = classify(r['body'])
    for lab in b + n:
        labels[lab] = labels.get(lab, 0) + 1
    if b and not n:   bash_only.append(r)
    elif n and not b: nonbash_only.append(r)
    elif b and n:     both.append(r)
    else:             unattributed.append(r)

N = len(rows)
print('=== OBJ-6b INSTRUMENT 1 - commit-body attribution ===')
print('POPULATION: %d wrong-object commits at %s' % (N, pop['ref'][:9]))
print()
print('  %-42s %4s  %s' % ('bucket', 'n', 'share'))
for name, lst in (('BASH-only signals', bash_only), ('NON-BASH-only signals', nonbash_only),
                  ('BOTH (ambiguous)', both), ('UNATTRIBUTED (no signal at all)', unattributed)):
    print('  %-42s %4d  %5.1f%%' % (name, len(lst), 100.0 * len(lst) / N))
print()
print('  --- which signals fired, and how often ---')
for lab, n in sorted(labels.items(), key=lambda kv: -kv[1]):
    print('    %-38s %4d' % (lab, n))

# The gate arithmetic, stated two ways because the ambiguous bucket is real.
reach_lo = len(bash_only)
reach_hi = len(bash_only) + len(both)
print()
print('=== THE GATE ===')
print('  Would a PostToolUse/Bash hook have SEEN the reading?')
print('    LOWER BOUND (bash-only)              : %d / %d = %.1f%%' % (reach_lo, N, 100.0*reach_lo/N))
print('    UPPER BOUND (bash-only + ambiguous)  : %d / %d = %.1f%%' % (reach_hi, N, 100.0*reach_hi/N))
print('    DEMONSTRABLY OUT OF REACH (non-bash) : %d / %d = %.1f%%' % (len(nonbash_only), N, 100.0*len(nonbash_only)/N))
print('    UNATTRIBUTED - instrument is SILENT  : %d / %d = %.1f%%' % (len(unattributed), N, 100.0*len(unattributed)/N))

io.open(os.path.join(SP, 'obj6b_attr1.json'), 'w', encoding='utf-8').write(json.dumps({
    'ref': pop['ref'], 'n': N,
    'bash_only': [r['sha'] for r in bash_only],
    'nonbash_only': [{'sha': r['sha'], 'subj': r['subj']} for r in nonbash_only],
    'both': [r['sha'] for r in both],
    'unattributed': [{'sha': r['sha'], 'subj': r['subj']} for r in unattributed],
}, indent=1))
print()
print('  --- NON-BASH rows, listed in full because they are the ones that would kill the matcher ---')
for r in nonbash_only:
    print('    %s %s' % (r['sha'][:9], r['subj'][:88]))
