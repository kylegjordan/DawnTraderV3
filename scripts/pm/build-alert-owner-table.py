#!/usr/bin/env python3
"""B-TOKEN-ECONOMY amendment 1, P6 condition 1: seed the alert-key owner table.

Inputs (extracted by PM Claude, 2026-11-20):
  markers.tsv  alert_id <TAB> owner <TAB> ts <TAB> kind:author  -- every [[ALERT ... owner=]] marker
               in /var/log/cc-discord-inbox.jsonl, 2026-11-06..2026-11-20 (14 days)
  queue.tsv    alert_id <TAB> dedupe_key <TAB> category <TAB> title <TAB> created_at <TAB> state
               -- the WHOLE staging alerts file, merged by id (3,503 rows on 2026-11-20)
  register     1-system-manual/pm/OPEN_BATCH_REGISTER.md (owner = the session section a batch sits in)
  plan         1-system-manual/SPRINT_TO_LIVE_PLAN.md (owner column; for batches the register lacks)
Only Langston's own markers (kind langston_outbound) seed the table.

Usage: build-alert-owner-table.py [--until ISO] <dir-with-tsvs> <register.md> <plan.md> <out.json> [due-list]
--until seeds only from markers before ISO (a holdout test: the due list is checked against later rulings).
A due list (one alert id or 8-char prefix per line) prints the per-alert correctness check.

Exit status (round 2, Langston 2026-11-20 12:38Z, R2-2 item 2 -- a build-time refusal, not a habit):
  2  a row's batch disagrees with that batch's register (or, absent there, plan) owner, or one batch carries two owners across
     the table's sections. The table is NOT written.
"""
import json, re, sys, collections
import os
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'comms-infra', 'discord'))
import alert_owner_route as aor  # noqa: E402

args = sys.argv[1:]
UNTIL = None
if args and args[0] == '--until':
    UNTIL, args = args[1], args[2:]
D, REG, PLAN, OUT = args[0], args[1], args[2], args[3]
DUE = args[4] if len(args) > 4 else None

# Step-4 rider C-1 (Langston 2026-11-20): split on LF only. Text-mode iteration also splits on a bare CR, and
# one live key ends in CR, which silently dropped a row. Every input line must parse, or the build refuses.
_lines = [l for l in open(D + '/queue.tsv', encoding='utf-8', newline='').read().split('\n') if l]
queue = {}
for l in _lines:
    p = l.split('\t')
    if len(p) == 6:
        queue[p[0]] = p[1:]          # key, category, title, created_at, state
if len(queue) != len(_lines):
    print('REFUSED: queue.tsv has %d lines but %d parsed rows (a CR, LF or TAB inside a value?); table not written'
          % (len(_lines), len(queue)))
    sys.exit(2)
keys = {i: v[:3] for i, v in queue.items()}

# Register and plan owners, family and routing: ONE home, shared with the alert lane (P6, Step 3), so the rule order
# this build checks is the rule order the lane applies.
register = aor.parse_register(open(REG, encoding='utf-8').read())
plan_owner, _multi = aor.parse_plan(open(PLAN, encoding='utf-8').read())
for b, o in sorted(_multi.items()):
    print('NOTE plan names two owners for %s: %s (left out of the cross-check)' % (b, o))
for b, o in sorted(plan_owner.items()):
    if b in register and register[b] != o:
        print('NOTE register says %s, plan says %s for %s (register wins)' % (register[b], o, b))
batch_owner = aor.batch_owners(register, plan_owner)

# Owning batch and ledger reference per family: the PM reading of the ledger, ruled by Langston round 2.
PREFIX = {
    'app-unplanned-restart:': ('B-DB-POOL-GUARD', 'server/db-pool-alerts.ts'),
    'b75-cold-audit-cold-reconcile-untracked-': ('B-DISK-FILE-TIERING', '#1233'),
    'cron_recovery:': ('B-CRON-MISSED-CATCHUP', 'RUNNING_ISSUES:4039, #691'),
    'cron_stale:': ('B-CRON-MISSED-CATCHUP', 'RUNNING_ISSUES:4039, #691'),
    'db-pool-wait:': ('B-DB-POOL-GUARD', '#1239'),
    'db-pool-acquire-timeout': ('B-DB-POOL-GUARD', '#1239'),
    'db-pool-idle-in-tx': ('B-DB-POOL-GUARD', '#1239'),
    'db-unencrypted-connection:': ('B-DB-APP-TLS', 'KD-100; Langston 2026-11-20: CC-A until T-P3'),
    'deploy-drift-file-gate-undecidable': ('B-DEPLOY-DRIFT-LINE (closed)', 'RUNNING_ISSUES:8589'),
    'deploy-drift-measurement-failed': ('B-DEPLOY-DRIFT-LINE (closed)', 'RUNNING_ISSUES:8589'),
    'deploy-drift-rung-': ('B-DEPLOY-DRIFT-LINE (closed)', 'RUNNING_ISSUES:8589'),
    'disk-utilization-': ('B-DB-SIZE-RELIEF', 'RUNNING_ISSUES:3823; database disk, 200 GB plan cap'),
    'server-disk-utilization-': (None, 'staging server disk, not the database'),
    'langston-privacy-exposed': ('B-TOKEN-WATCH-FOLLOWUP-MEMORY', '#979'),
    'no-trigger-vts-': (None, 'RUNNING_ISSUES:11222, #679'),
    'ohlc-writer-permanent': ('B-OHLC-FRAME-GUARD', '#1028, RUNNING_ISSUES:9033'),
    'ticker-writer-permanent': (None, '#705, RUNNING_ISSUES:3954, :3969'),
    'token-watch-store-warn': ('B-TOKEN-WATCH-STORAGE', '#1132'),
    'token-watch-unit-failed-': ('B-TOKEN-WATCH-STORAGE', '#1132'),
    'venue-quiet-paper-': (None, 'RUNNING_ISSUES:11224'),
    'price-skip-paper-': (None, 'RUNNING_ISSUES:11224 (same class as venue-quiet-paper-)'),
    'vts-shadow-unpriced-': ('B-XSTOCK-BID-TRIGGER-RELAND', 'inc4a tests'),
    'vts-unpriced-close-': ('B-XSTOCK-BID-TRIGGER-RELAND', 'RUNNING_ISSUES:10913, #1144'),
    'xstock-bar-availability-': ('B-XSTOCK-BAR-AVAILABILITY', '#707'),
    'crypto-spot-shard0-data-dead': (None, 'crypto spot shard 0 data-dead since 10-21; Langston Step-4 2026-11-20: CC-A'),
    'xstock-cold-tick-fill-block': ('B-PRICE-FEED-COVERAGE', 'cold_tick carrier'),
    'xstock-fill-safety-config-missing': (None, 'plan row 3b.f-c, config half of xstock-stale-fill-block'),
    'xstock-stale-fill-block': (None, 'RUNNING_ISSUES:246, :3209, plan row 3b.f-c'),
    'xstock-equity-feed-stall': (None, 'equity-spot-archiver.ts silent-stall watchdog; B-PRICE-STALENESS-BOUND (closed 10-20)'),
    'book-state-hollow-': ('B-XSTOCK-BID-TRIGGER-RELAND', 'active-execution-engine.ts book-state guard, OBJ-6'),
    'b-price-side-': ('B-PRICE-SIDE-BY-JOB', '#1250'),
    'b75-cold-audit-cold-meter-': ('B-TOKEN-WATCH-STORAGE', None),
    'b75-cold-rotator-': ('B-DISK-FILE-TIERING', None),
    'birthcap-': ('B-TOKEN-WATCH-BIRTH-CAP', '#1247'),
    'crypto-universe-add-flap': ('B-UNIVERSE-REFRESH-ACTS', '#1018'),
    'crypto-universe-refresh-rung-': ('B-UNIVERSE-REFRESH-ACTS', '#1018'),
    'book-state-ring-snapshot-failing': (None, None),
    'cron_verifier_blind:': ('B-CRON-MISSED-CATCHUP', 'clears manually only'),
    'deploy-notice-watcher-heartbeat': (None, None),
    'langston-size-watch-': ('B-SIZE-WATCH-BREACH-ALARM', '#1215 (closed 11-14)'),
    'coltrane-size-watch-': ('B-SIZE-WATCH-BREACH-ALARM', '#1215 (closed 11-14)'),
    'langston-index-guard-': (None, 'Langston reviewer infrastructure'),
    'transcript-archive-deadman-': ('B-TRANSCRIPT-ARCHIVE', 'plan row 4b (closed 11-10)'),
    'no-trigger-paper-': ('B-XSTOCK-BID-TRIGGER-RELAND', 'paper exit trigger; same chain as no-trigger-vts-'),
    'gov-fetch-failed': (None, '#449, #490: the governance checker cannot fetch origin'),
    'gov-code-drift': (None, '#490 F9: the governance checker box runs stale code'),
    'row2-4b-': ('row 2 4b review', None),
    'vts-gc-retention-': (None, None),
    'vts-quiet-': (None, None),
    'watchdog-heartbeat-': (None, None),
}
TITLE = {
    'Balance re-anchored': ('B-BALANCE-SESSION-PAIRING', '#618, register:63'),
    'switch_on_shadow_evidence': (None, '#592 (closed 09-29, CC-B): 90-day retention-exception expiry review on that table'),
    '#677 config-lock watch': (None, '#677'),
    'Weekly dt-deploy observation': (None, None),
}
R2 = 'Langston round-2 ruling 2026-11-20 12:38Z (Discord 1573316684633350144)'
# Where Langston's ruling overrides his 14-day majority. inferred=True: no ledger row; the owner confirms
# or bounces it on day 1.
OVERRIDE = {
    ('prefix', 'venue-quiet-paper-'): ('CC-C', 'Langston corrected CC-B to CC-C on 2026-11-20; 3a1 closed 10-17', False),
    ('prefix', 'price-skip-paper-'): ('CC-C', R2 + ': must match venue-quiet-paper-, the standing record of the class', False),
    ('prefix', 'ohlc-writer-permanent'): ('CC-C', R2 + ': register:66; resolve on the guard deploy, never ack', False),
    ('prefix', 'ticker-writer-permanent'): ('CC-A', R2 + ': #705 heading names the ticker writer; last amendment CC-A', False),
    ('prefix', 'db-pool-acquire-timeout'): ('CC-A', R2 + ': B-DB-POOL-GUARD is CC-A (register:29)', False),
    ('prefix', 'db-pool-idle-in-tx'): ('CC-A', R2 + ': B-DB-POOL-GUARD is CC-A (register:29)', False),
    ('prefix', 'xstock-fill-safety-config-missing'): ('CC-C', R2 + ': config half of the 3b.f-c gate', True),
    ('title', 'switch_on_shadow_evidence'): ('CC-B', R2 + ': the retention-expiry review, not the census switch-on', True),
    ('prefix', 'book-state-ring-snapshot-failing'): ('CC-B', R2, True),
    ('prefix', 'deploy-notice-watcher-heartbeat'): ('CC-INFRA', R2, True),
    ('batch', 'B-TRANSCRIPT-ARCHIVE'): ('CC-INFRA', 'PM: plan row 4b names Infra Claude; 1 marker said CC-A; caught by the plan cross-check', False),
}
# Families with no Langston marker at all, seeded on his round-2 instruction (R2-2 item 5) or because the
# router would otherwise crash or fall back on live rows. Every one is INFERRED.
SEED = {
    ('prefix', 'server-disk-utilization-'): ('CC-INFRA', R2 + ': its own row, the staging server disk'),
    ('prefix', 'xstock-equity-feed-stall'): ('CC-C', 'PM: the xStock feed watchdog; B-PRICE-STALENESS-BOUND closed by CC-C'),
    ('prefix', 'book-state-hollow-'): ('CC-C', 'PM: minted by the B-XSTOCK-BID-TRIGGER-RELAND book-state guard (register:62)'),
    ('prefix', 'langston-size-watch-'): ('CC-INFRA', 'PM: plan row 10, Infra Claude'),
    ('prefix', 'coltrane-size-watch-'): ('CC-INFRA', 'PM: plan row 10, Infra Claude'),
    ('prefix', 'langston-index-guard-'): ('CC-INFRA', 'PM: reviewer infrastructure is Infra Claude'),
    ('prefix', 'transcript-archive-deadman-'): ('CC-INFRA', 'PM: plan row 4b, Infra Claude'),
    ('prefix', 'no-trigger-paper-'): ('CC-C', 'PM: B-XSTOCK-BID-TRIGGER-RELAND (register:62)'),
    ('prefix', 'crypto-spot-shard0-data-dead'): ('CC-A', 'Langston Step-4 check 2026-11-20 (Discord 1573321813814157454); his marker is not in the seed extract'),
    ('prefix', 'crypto-universe-add-flap'): ('CC-A', 'B-UNIVERSE-REFRESH-ACTS Gate C: repeated incremental-add failure page; minted by crypto-universe-refresh.ts'),
    ('prefix', 'crypto-universe-refresh-rung-'): ('CC-A', 'B-UNIVERSE-REFRESH-ACTS pre-audit P7: the refresh owner; minted by crypto-universe-refresh.ts'),
    ('prefix', 'gov-fetch-failed'): ('CC-INFRA', 'PM: the governance checker box; colonless gov- key (R2-2 item 1)'),
    ('prefix', 'gov-code-drift'): ('CC-INFRA', 'PM: the governance checker box; colonless gov- key (R2-2 item 1)'),
}
ALIAS = {'Infra-Claude': 'CC-INFRA', 'Infra': 'CC-INFRA'}



def family(k, c, t):
    return aor.family(k, c, t, PREFIX, TITLE)


rows_per = collections.Counter(family(*v) for v in keys.values())
agg = collections.defaultdict(collections.Counter)
last, latest, unmapped = {}, {}, 0
SESSIONS = aor.SESSIONS
dropped = collections.Counter()
for l in open(D + '/markers.tsv', encoding='utf-8'):
    i, o, ts, who = l.rstrip('\n').split('\t')
    if not who.startswith('langston_outbound'):
        continue
    o = ALIAS.get(o, o)
    if ts >= latest.get(i, ('', ''))[0]:
        latest[i] = (ts, o)      # the check compares against the LATEST ruling, holdout or not
    if UNTIL and ts >= UNTIL:
        continue
    if o not in SESSIONS:        # Step-4 rider C-2: Kyle (or anyone else) is never seated as a family's owner
        dropped[o] += 1
        continue
    if i not in keys:
        unmapped += 1
        continue
    f = family(*keys[i])
    agg[f][o] += 1
    if ts >= last.get(f, ('', ''))[0]:
        last[f] = (ts, o)

table = {'_about': {
    'batch': 'B-TOKEN-ECONOMY amendment 1, P6 condition 1 (Langston Step-2 rulings 2026-11-20 12:04Z, 12:38Z)',
    'seed': 'Langston [[ALERT owner=]] markers 2026-11-06..2026-11-20 joined to the whole staging alert queue',
    'order': 'session owner named in title (opening alias or display name, or "owner CC-x" anywhere); '
             'deploy-window-stale/deploy-in-window key -> batch; keyless row whose title opens with a batch-id -> '
             'batch; keyless -> title stem; gov key with ":" -> batch; key -> longest prefix; keyed row whose title '
             'opens with a batch-id -> batch; batch with no table row -> register, then plan owner column; a '
             'register/plan batch named anywhere in the title; none -> fallback',
    'seed_votes_dropped': 'markers naming anyone but the four building sessions (Step-4 rider C-2)',
    'refusal_reach': 'the register/plan cross-check fires only for rows that carry a batch; rows with batch null '
                     '(their owner rests on the seed markers and PM overrides alone) are counted in refusal_reach_measured',
    'fallback': 'CC-INFRA, genuinely new keys only',
    'flag': 'agreement below 80%, a real tie (top two equal), n <= 3 markers, or fewer than 1 marker per 20 '
            'queue rows: for Langston to rule',
    'agree': 'share of markers, which count re-triages of resurfacing rows, not distinct decisions; read it '
             'with n and rows',
    'markers_on_unmapped_ids': unmapped, 'seed_votes_dropped_by_owner': dict(dropped)},
    'batches': {}, 'prefixes': {}, 'titles': {}, 'fallback': 'CC-INFRA'}
SECT = aor.SECT
unfamilied = []
fams = set(agg) | set(SEED)
for f in sorted(fams):
    if f[0] == 'owner':
        continue
    if f[1].startswith('?'):
        unfamilied.append((f, dict(agg[f]), rows_per[f]))
        continue
    c = agg.get(f, collections.Counter())
    tot = sum(c.values())
    rows = rows_per[f]
    if tot:
        ranked = c.most_common()
        top, n = ranked[0]
        tie = len(ranked) > 1 and ranked[1][1] == n
        if tie:                   # a real tie goes to Langston's latest ruling on the family
            top = last[f][1]
        owner, note, inferred = OVERRIDE.get(f, (top, None, False))
        row = {'owner': owner, 'votes': dict(c), 'n': tot, 'rows': rows, 'latest': last[f][1],
               'agree': round(n / tot, 2)}
        if tie:
            row['tie'] = True
        elif n * 2 <= tot:
            row['plurality'] = True
        flag = n / tot < 0.8 or tie or tot <= 3 or tot * 20 < rows
    else:
        owner, note = SEED[f]
        inferred, tie = True, False
        row = {'owner': owner, 'votes': {}, 'n': 0, 'rows': rows, 'latest': None, 'agree': None}
        flag = True
    if f[0] == 'prefix':
        row['batch'], row['ledger'] = PREFIX[f[1]]
    elif f[0] == 'title':
        row['batch'], row['ledger'] = TITLE[f[1]]
    if note:
        row['ruling'] = note
    if inferred:
        row['inferred'] = True
    if flag:
        row['flag'] = True
    table[SECT[f[0]]][f[1]] = row

# R2-2 item 2: refuse to write a table that contradicts the register or itself.
problems, by_batch = [], collections.defaultdict(set)
reach = {'checked': [0, 0], 'batch_unlisted': [0, 0], 'batchless': [0, 0]}     # [families, queue rows]
for s in ('batches', 'prefixes', 'titles'):
    for name, row in table[s].items():
        if row['owner'] not in SESSIONS:
            problems.append('OWNER %s:%s owner %s is not one of the four building sessions' % (s, name, row['owner']))
        b = name if s == 'batches' else row.get('batch')
        if not b or not b.startswith('B-'):
            reach['batchless'][0] += 1
            reach['batchless'][1] += row.get('rows', 0)
            continue
        b = b.split(' ')[0]
        k = 'checked' if b in batch_owner else 'batch_unlisted'
        reach[k][0] += 1
        reach[k][1] += row.get('rows', 0)
        by_batch[b].add((row['owner'], s + ':' + name))
        if b in batch_owner and batch_owner[b] != row['owner']:
            problems.append('REGISTER %s:%s owner %s, register/plan says %s for %s' % (s, name, row['owner'], batch_owner[b], b))
for b, owners in sorted(by_batch.items()):
    if len({o for o, _ in owners}) > 1:
        problems.append('TWO OWNERS %s: %s' % (b, sorted(owners)))
# Step-4 C-5 (Langston 2026-11-20): say how far the cross-check reaches, so exit 0 is not read as "every row
# register-verified", and say what the register/plan conflict NOTE was a zero over.
table['_about']['refusal_reach_measured'] = {k: {'families': v[0], 'queue_rows': v[1]} for k, v in reach.items()}
table['_about']['register_plan_overlap'] = {'shared': len(set(register) & set(plan_owner)), 'register': len(register),
                                            'plan_single_owner': len(plan_owner)}
print('REACH cross-checked %d families / %d rows; batch not in register or plan %d / %d; batchless %d / %d'
      % tuple(reach['checked'] + reach['batch_unlisted'] + reach['batchless']))
print('REGISTER/PLAN overlap: %d batches (register %d, plan %d) - the conflict NOTE is a zero over these'
      % (len(set(register) & set(plan_owner)), len(register), len(plan_owner)))
for p in problems:
    print(p)
if problems:
    print('REFUSED: %d contradiction(s); table not written' % len(problems))
    sys.exit(2)
with open(OUT, 'w', encoding='utf-8', newline='\n') as fh:
    json.dump(table, fh, indent=1, ensure_ascii=False)
    fh.write('\n')
for f, c, r in unfamilied:
    print('UNFAMILIED', f, c, 'rows', r)


def route(i):
    return aor.table_route(*keys[i], table, batch_owner)


# R2-5, the population named: rows NEWLY MINTED per UTC day (created_at) that reach the fallback.
mint = collections.defaultdict(collections.Counter)
for i, v in queue.items():
    day = v[3][:10]
    mint[day]['all'] += 1
    if route(i)[1] == 'fallback':
        mint[day]['fallback'] += 1
days = sorted(d for d in mint if d)[-14:]
print('NEWLY-MINTED fallback per day (last 14 UTC days):',
      ' '.join('%s:%d/%d' % (d[5:], mint[d]['fallback'], mint[d]['all']) for d in days))
print('  days over 2:', sum(mint[d]['fallback'] > 2 for d in days), 'of', len(days),
      ' mean %.1f' % (sum(mint[d]['fallback'] for d in days) / max(len(days), 1)))

if DUE:
    ok = n = fb = 0
    for l in open(DUE, encoding='utf-8'):
        p = l.strip()
        if not p:
            continue
        i = next((x for x in keys if x.startswith(p)), None)
        if not i:
            print(p, 'NOT IN queue.tsv')
            continue
        n += 1
        o, rule = route(i)
        fb += rule == 'fallback'
        lg = latest.get(i, ('', '-'))[1]
        ok += (o == lg)
        print(i[:8], o, lg, 'MATCH' if o == lg else 'DIFFER', rule, sep='\t')
    print('COUNT', ok, 'of', n, "match Langston's latest owner for that alert;", fb, 'fallback')
