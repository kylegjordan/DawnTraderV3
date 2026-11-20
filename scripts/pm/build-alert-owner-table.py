#!/usr/bin/env python3
"""B-TOKEN-ECONOMY amendment 1, P6 condition 1: seed the alert-key owner table.

Inputs (extracted by PM Claude, 2026-11-20):
  markers.tsv  alert_id <TAB> owner <TAB> ts <TAB> kind:author  -- every [[ALERT ... owner=]] marker
               in /var/log/cc-discord-inbox.jsonl, 2026-11-06..2026-11-20 (14 days)
  keys.tsv     alert_id <TAB> dedupe_key <TAB> category <TAB> title  -- from the staging alerts file
Only Langston's own markers (kind langston_outbound) seed the table.
Usage: build-alert-owner-table.py [--until ISO] <dir-with-tsvs> <out.json> [due-list]
--until seeds only from markers before ISO (a holdout test: the due list is checked against later rulings).
A due list (one alert id or 8-char prefix per line) prints the per-alert correctness check.
"""
import json, re, sys, collections

args = sys.argv[1:]
UNTIL = None
if args and args[0] == '--until':
    UNTIL, args = args[1], args[2:]
D, OUT = args[0], args[1]
DUE = args[2] if len(args) > 2 else None
keys = {}
for l in open(D + '/keys.tsv', encoding='utf-8'):
    p = l.rstrip('\n').split('\t')
    if len(p) >= 4:
        keys[p[0]] = p[1:]

# Owning batch and ledger reference per family: the PM reading of the ledger, for Langston to rule.
PREFIX = {
    'app-unplanned-restart:': ('B-DB-POOL-GUARD', 'server/db-pool-alerts.ts'),
    'b75-cold-audit-cold-reconcile-untracked-': ('B-DISK-FILE-TIERING', '#1233'),
    'cron_recovery:': ('B-CRON-MISSED-CATCHUP', 'RUNNING_ISSUES:4039'),
    'cron_stale:': ('B-CRON-MISSED-CATCHUP', 'RUNNING_ISSUES:4039'),
    'db-pool-wait:': ('B-DB-POOL-GUARD', '#1239'),
    'db-pool-acquire-timeout': ('B-DB-POOL-GUARD', '#1239'),
    'db-pool-idle-in-tx': ('B-DB-POOL-GUARD', '#1239'),
    'db-unencrypted-connection:': ('B-DB-APP-TLS', 'Langston 2026-11-20: CC-A until T-P3'),
    'deploy-drift-file-gate-undecidable': ('B-DEPLOY-DRIFT-LINE (closed)', 'RUNNING_ISSUES:8589'),
    'deploy-drift-measurement-failed': ('B-DEPLOY-DRIFT-LINE (closed)', 'RUNNING_ISSUES:8589'),
    'deploy-drift-rung-': ('B-DEPLOY-DRIFT-LINE (closed)', 'RUNNING_ISSUES:8589'),
    'disk-utilization-warning': (None, 'RUNNING_ISSUES:3823'),
    'langston-privacy-exposed': ('B-TOKEN-WATCH-FOLLOWUP-MEMORY', '#979'),
    'no-trigger-vts-': (None, 'RUNNING_ISSUES:11222, #679'),
    'ohlc-writer-permanent': ('B-OHLC-FRAME-GUARD', '#1028'),
    'ticker-writer-permanent': (None, None),
    'token-watch-store-warn': ('B-TOKEN-WATCH-STORAGE', '#1132'),
    'token-watch-unit-failed-': ('B-TOKEN-WATCH-STORAGE', '#1132'),
    'venue-quiet-paper-': (None, 'RUNNING_ISSUES:11224'),
    'vts-shadow-unpriced-': ('B-XSTOCK-BID-TRIGGER-RELAND', 'inc4a tests'),
    'vts-unpriced-close-': ('B-XSTOCK-BID-TRIGGER-RELAND', 'RUNNING_ISSUES:10913, #1144'),
    'xstock-bar-availability-': ('B-XSTOCK-BAR-AVAILABILITY', '#707'),
    'xstock-cold-tick-fill-block': ('B-PRICE-FEED-COVERAGE', 'cold_tick carrier'),
    'xstock-fill-safety-config-missing': (None, None),
    'xstock-stale-fill-block': (None, 'RUNNING_ISSUES:246, :3209'),
    'b-price-side-': ('B-PRICE-SIDE-BY-JOB', '#1250'),
    'b75-cold-audit-cold-meter-': ('B-TOKEN-WATCH-STORAGE', None),
    'b75-cold-rotator-': ('B-DISK-FILE-TIERING', None),
    'birthcap-divergence-': (None, None),
    'book-state-ring-snapshot-failing': (None, None),
    'cron_verifier_blind:': ('B-CRON-MISSED-CATCHUP', None),
    'deploy-notice-watcher-heartbeat': (None, None),
    'price-skip-paper-': (None, None),
    'row2-4b-': ('row 2 4b review', None),
    'vts-gc-retention-': (None, None),
    'vts-quiet-': (None, None),
    'watchdog-heartbeat-': (None, None),
}
TITLE = {
    'Balance re-anchored': ('B-BALANCE-SESSION-PAIRING', '#618'),
    'switch_on_shadow_evidence': ('B-SILENT-STRATEGY-CENSUS', None),
    '#677 config-lock watch': (None, '#677'),
    'Weekly dt-deploy observation': (None, None),
}
# Where Langston's LATEST ruling overrides his 14-day majority (he corrected himself).
OVERRIDE = {('prefix', 'venue-quiet-paper-'):
            ('CC-C', 'Langston corrected CC-B to CC-C on 2026-11-20; 3a1 closed 10-17')}


# The lane applies families in this order: gov key -> batch; key -> longest prefix;
# keyless -> title stem; nothing matched -> CC-INFRA (a genuinely new key).
# Generic rules, before the tables: an alert that names its owner or batch outright.
OWNER_TITLE = re.compile(r'^(CC-(?:A|B|C|INFRA)):')
BATCH_TITLE = re.compile(r'^(B-[A-Z0-9-]+)[: ]')


def family(k, c, t):
    m = OWNER_TITLE.match(t)
    if m:
        return ('owner', m.group(1))
    if k.startswith('deploy-window-stale:'):
        return ('batch', k.split(':', 1)[1])
    if not k and BATCH_TITLE.match(t):
        return ('batch', BATCH_TITLE.match(t).group(1))
    if not k:
        for stem in TITLE:
            if t.startswith(stem):
                return ('title', stem)
        return ('title', '?' + t[:40])
    if k.startswith('gov-'):
        return ('batch', k.split(':')[1])     # gov-<check>:<BATCH>[:<sub>]
    for pre in sorted(PREFIX, key=len, reverse=True):
        if k.startswith(pre):
            return ('prefix', pre)
    return ('prefix', '?' + k)


agg = collections.defaultdict(collections.Counter)
last, latest, unmapped = {}, {}, 0
for l in open(D + '/markers.tsv', encoding='utf-8'):
    i, o, ts, who = l.rstrip('\n').split('\t')
    if not who.startswith('langston_outbound'):
        continue
    if ts >= latest.get(i, ('', ''))[0]:
        latest[i] = (ts, o)      # the check compares against the LATEST ruling, holdout or not
    if UNTIL and ts >= UNTIL:
        continue
    if i not in keys:
        unmapped += 1
        continue
    f = family(*keys[i])
    agg[f][o] += 1
    if ts >= last.get(f, ('', ''))[0]:
        last[f] = (ts, o)

table = {'_about': {
    'batch': 'B-TOKEN-ECONOMY amendment 1, P6 condition 1 (Langston Step-2 ruling 2026-11-20)',
    'seed': 'Langston [[ALERT owner=]] markers 2026-11-06..2026-11-20 joined to staging alert keys',
    'order': 'gov key -> batches; key -> longest prefix; keyless -> titles; none -> fallback',
    'fallback': 'CC-INFRA, genuinely new keys only',
    'flag': 'agreement below 80% or a tied vote: for Langston to rule before the lane uses it',
    'markers_on_unmapped_ids': unmapped},
    'batches': {}, 'prefixes': {}, 'titles': {}, 'fallback': 'CC-INFRA'}
SECT = {'batch': 'batches', 'prefix': 'prefixes', 'title': 'titles'}
unfamilied = []
for f, c in sorted(agg.items()):
    if f[0] == 'owner':
        continue
    if f[1].startswith('?'):
        unfamilied.append((f, dict(c)))
        continue
    tot = sum(c.values())
    top, n = c.most_common(1)[0]
    if n * 2 == tot:          # a tie goes to Langston's latest ruling on the family
        top = last[f][1]
    owner, note = OVERRIDE.get(f, (top, None))
    row = {'owner': owner, 'votes': dict(c), 'latest': last[f][1], 'agree': round(n / tot, 2)}
    if f[0] == 'prefix':
        row['batch'], row['ledger'] = PREFIX[f[1]]
    elif f[0] == 'title':
        row['batch'], row['ledger'] = TITLE[f[1]]
    if note:
        row['override'] = note
    if n / tot < 0.8 or n * 2 == tot:
        row['flag'] = True
    table[SECT[f[0]]][f[1]] = row
with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(table, fh, indent=1, ensure_ascii=False)
    fh.write('\n')
for f, c in unfamilied:
    print('UNFAMILIED', f, c)


def route(i):
    f = family(*keys[i])
    if f[0] == 'owner':
        return (f[1], 'owner named in title')
    row = table[SECT[f[0]]].get(f[1])
    return (row['owner'], f[0] + ':' + f[1]) if row else ('CC-INFRA', 'fallback')


if DUE:
    ok = n = 0
    for l in open(DUE, encoding='utf-8'):
        p = l.strip()
        if not p:
            continue
        i = next((x for x in keys if x.startswith(p)), None)
        if not i:
            print(p, 'NOT IN keys.tsv')
            continue
        n += 1
        o, rule = route(i)
        lg = latest.get(i, ('', '-'))[1]
        ok += (o == lg)
        print(i[:8], o, lg, 'MATCH' if o == lg else 'DIFFER', rule, sep='\t')
    print('COUNT', ok, 'of', n, "match Langston's latest owner for that alert")
