"""Re-derive the quote-asset figures from the store. RUN ON THE HOST.

WHY IT IS CHECKED IN. Langston, 2026-09-02: the population figures are
   "RULED ON REPORTED FACT -- root-only store, I cannot reach it... that is
   disqualifying for a PROCEED on the leg they cover. Give me a re-derivable
   form (a checked-in script reading the store)." This is that form.

WHAT IT ANSWERS, AND THE DENOMINATOR IS THE POINT. He caught me quoting
   "71 USDC reads" as though reads were tokens -- the same unit error I had
   just corrected one level down, where eight curve observations turned out
   to be three facts. Every figure here is printed as READS *and* as DISTINCT
   MINTS.

THE REFUSAL-BRANCH RATE TAKES NO EXCLUSIONS. "Is the quote mint the right
   discriminator" is not answered by price agreement on quiet rows -- that
   leg has a contemporaneity dependence and a chosen exclusion. It is
   answered by how often the guard refuses across EVERY curve-owned read,
   which has neither.
"""
import json, base64, struct, collections
PUMPFUN = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
USDC = bytes.fromhex('c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61')
ZERO = bytes(32)
F = '/var/lib/token-watch/provenance/follow-up/2026-09-02.jsonl'

pair_meta = {}
pools = []
for line in open(F, encoding='utf-8', errors='replace'):
    try: r = json.loads(line)
    except Exception: continue
    b = r.get('body') or r.get('raw') or r.get('response')
    if isinstance(b, str):
        try: b = json.loads(b)
        except Exception: continue
    if r.get('source') == 'dexscreener_token_state' and isinstance(b, dict):
        for p in (b.get('pairs') or []):
            if p.get('pairAddress'):
                pair_meta[p['pairAddress']] = {
                    'mint': (p.get('baseToken') or {}).get('address'),
                    'quote_label': (p.get('quoteToken') or {}).get('symbol')}
    elif r.get('source') == 'helius_pool_account':
        pools.append(r)

reads = 0
by_quote_reads = collections.Counter()
by_quote_mints = collections.defaultdict(set)
refusal = collections.Counter()
label_cross = collections.Counter()
distinct_pools = set()
for r in pools:
    key = r.get('mint') or r.get('key') or r.get('subject')
    b = r.get('body') or r.get('raw') or r.get('response')
    if isinstance(b, str):
        try: b = json.loads(b)
        except Exception: continue
    v = ((b or {}).get('result') or {}).get('value') or {}
    if v.get('owner') != PUMPFUN:
        continue
    reads += 1
    distinct_pools.add(key)
    raw = base64.b64decode((v.get('data') or [''])[0])
    meta = pair_meta.get(key) or {}
    mint = meta.get('mint') or key
    # THE REFUSAL BRANCHES -- no contemporaneity dependence, so this needs NO
    # exclusion at all. Denominator is every curve-owned read.
    if len(raw) < 115:
        refusal['too short to name its quote asset'] += 1
        q = 'REFUSED-short'
    else:
        qraw = bytes(raw[83:115])
        if qraw == ZERO: q = 'SOL'
        elif qraw == USDC: q = 'USDC'
        else:
            q = 'REFUSED-unknown'
            refusal['unrecognised quote mint'] += 1
    by_quote_reads[q] += 1
    by_quote_mints[q].add(mint)
    if meta.get('quote_label'):
        label_cross[(q, meta['quote_label'])] += 1

print('CURVE-OWNED POOL READS (the population, no exclusions):', reads)
print('  distinct pool addresses:', len(distinct_pools))
print()
print('%-16s %8s %10s' % ('quote asset', 'READS', 'DISTINCT MINTS'))
for q in sorted(by_quote_reads, key=lambda x: -by_quote_reads[x]):
    print('%-16s %8d %10d' % (q, by_quote_reads[q], len(by_quote_mints[q])))
print()
print('REFUSAL-BRANCH RATE over the whole population (no exclusions):')
tot = sum(refusal.values())
print('  refused: %d of %d = %.3f%%' % (tot, reads, 100.0*tot/reads if reads else 0))
for k, v in refusal.most_common(): print('    %-34s %d' % (k, v))
print()
print('ACCOUNT vs AGGREGATOR LABEL (must be 1:1):')
for k, v in label_cross.most_common(): print('    account %-16s <-> label %-8s %6d' % (k[0], k[1], v))
