"""Rebuild tests/fixtures/pumpfun_curves.json from the study's OWN records.

RUN ON STAGING, where the provenance store lives:
    scp this file to the host, then  python3 build_pumpfun_curves.py
It writes /tmp/pumpfun_curves.json; copy that over the fixture.

WHY THE FIXTURE IS BUILT FROM PROVENANCE RATHER THAN FRESH API CALLS.
   Langston, 2026-09-02: a validation that exists only as console output "is
   not re-executable and I hold it as reported fact". Fresh calls would make
   the fixture depend on an upstream that was, in fact, down for twenty
   minutes while this was being built. The provenance store already holds the
   raw getAccountInfo bodies production saw, each alongside the aggregator
   response from the same sweep -- so the fixture is the collector's own
   evidence, joined, and rebuilding it needs no API access at all.

THE SELECTION IS DELIBERATELY DIVERSE, NOT RANDOM: one record per distinct
   published price AND per distinct reserve level, plus graduated and
   actively-trading curves and both quote assets. It therefore supports "the
   decoder is right across a wide range of inputs" and NOT any claim about how
   the population is distributed. Population figures are printed by this
   script over the whole day and belong in the commit message, not the test.
"""
import json, base64, struct, collections, random
PUMPFUN = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
USDC_Q = bytes.fromhex('c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61')
F = '/var/lib/token-watch/provenance/follow-up/2026-09-02.jsonl'
by_pair = {}
pools = []
for line in open(F, encoding='utf-8', errors='replace'):
    try: r = json.loads(line)
    except Exception: continue
    src = r.get('source')
    body = r.get('body') or r.get('raw') or r.get('response')
    if isinstance(body, str):
        try: body = json.loads(body)
        except Exception: continue
    if src == 'dexscreener_token_state' and isinstance(body, dict):
        for p in (body.get('pairs') or []):
            pa = p.get('pairAddress')
            if not pa: continue
            m5 = (p.get('txns') or {}).get('m5') or {}
            by_pair[pa] = {'symbol': (p.get('baseToken') or {}).get('symbol'),
                           'mint': (p.get('baseToken') or {}).get('address'),
                           'dex_id': p.get('dexId'), 'price': p.get('priceNative'),
                           'm5': int(m5.get('buys') or 0) + int(m5.get('sells') or 0),
                           'at': r.get('recorded_at') or r.get('when')}
    elif src == 'helius_pool_account':
        pools.append(r)
print('dexscreener pairs indexed:', len(by_pair), ' raw pool reads:', len(pools))
out = []; seen = set(); skipped_owner = 0
for r in pools:
    key = r.get('mint') or r.get('key') or r.get('subject')
    meta = by_pair.get(key)
    if not meta or key in seen: continue
    body = r.get('body') or r.get('raw') or r.get('response')
    if isinstance(body, str):
        try: body = json.loads(body)
        except Exception: continue
    val = ((body or {}).get('result') or {}).get('value') or {}
    # THE DECODER BRANCHES ON THE OWNER PROGRAM, SO THE FIXTURE MUST TOO.
    # Without this the join decodes graduated-pool accounts as bonding curves
    # and yields ratios in the billions -- a wrong-object error inside the
    # instrument built to catch wrong objects.
    if val.get('owner') != PUMPFUN:
        skipped_owner += 1; continue
    data = (val.get('data') or [None])[0]
    if not data or not meta.get('price'): continue
    raw = base64.b64decode(data)
    if len(raw) < 49: continue
    vt, vs, rt, rs, sup = struct.unpack_from('<QQQQQ', raw, 8)
    complete = raw[48]
    kind = 'graduated' if complete == 1 else ('trading' if meta['m5'] else 'quiet')
    quote = 'USDC' if bytes(raw[83:115]) == USDC_Q else ('SOL' if bytes(raw[83:115]) == bytes(32) else 'other')
    seen.add(key)
    out.append({'symbol': meta['symbol'], 'mint': meta['mint'], 'pair_address': key,
                'provider_price_native': float(meta['price']), 'kind': kind,
                'quote': quote, 'real_sol': rs/1e9, 'txns_m5': meta['m5'],
                'captured_at': meta['at'], 'account_info': body})
print('not owned by the curve program (correctly excluded):', skipped_owner)
print('joined curves:', len(out), dict(collections.Counter(o['kind'] for o in out)))
q = [o for o in out if o['kind'] == 'quiet']
ps = sorted({o['provider_price_native'] for o in q})
print('quiet: %d, distinct prices %d, distinct reserves %d, span %.3g to %.3g' % (
    len(q), len(ps), len({round(o['real_sol'], 9) for o in q}), ps[0], ps[-1]))
bad = []
for o in q:
    raw = base64.b64decode(o['account_info']['result']['value']['data'][0])
    vt, vs, rt, rs, sup = struct.unpack_from('<QQQQQ', raw, 8)
    if vt: bad.append((o['symbol'], ((vs/1e9)/(vt/1e6))/o['provider_price_native']))
bad.sort(key=lambda x: abs(x[1]-1.0)); n = len(bad)
within = sum(1 for _, r in bad if abs(r-1.0) < 0.001)
print('QUIET CURVES DECODED: %d' % n)
print('  within 0.1%% of the published price: %d  (%.2f%%)' % (within, 100.0*within/n))
print('  median ratio %.6f' % bad[n//2][1])
print('  five worst: %s' % [(s_, round(r_, 5)) for s_, r_ in bad[-5:]])
random.seed(7)
qs = sorted(q, key=lambda o: o['provider_price_native'])
step = max(1, len(qs)//28)
# ONE CURVE PER DISTINCT PUBLISHED PRICE. The fixture's whole job is to VARY;
# a price-stepped sample still repeated values, and the spread control caught
# it -- 19 distinct across 30 records. Fixed in the SELECTION, not by lowering
# the threshold, which would have been fitting the fence to the sample.
def spread(rows, n):
    # Distinct on BOTH axes: a distinct price does not imply a distinct
    # reserve level, and the reserve control caught that on the next run.
    sp = set(); sr = set(); out = []
    for o in rows:
        p = o['provider_price_native']; r = round(o['real_sol'], 9)
        if p in sp or r in sr: continue
        sp.add(p); sr.add(r); out.append(o)
    step = max(1, len(out)//n)
    return out[::step][:n]
qsol = [o for o in qs if o['quote'] == 'SOL']
qusd = [o for o in qs if o['quote'] == 'USDC']
sel = (spread(qsol, 26) + spread(qusd, 6)
       + [o for o in out if o['kind'] == 'graduated'][:4]
       + [o for o in out if o['kind'] == 'trading'][:4])
print('selection: %d records, %d distinct prices, %d distinct reserves' % (
    len(sel), len({o['provider_price_native'] for o in sel}),
    len({round(o['real_sol'], 9) for o in sel})))
json.dump(sel, open('/tmp/pumpfun_curves.json', 'w', encoding='utf-8'), indent=1)
print('quote mix in the full quiet set: %s' % dict(collections.Counter(o['quote'] for o in q)))
print('wrote %d fixture records (kind %s, quote %s)' % (
    len(sel), dict(collections.Counter(o['kind'] for o in sel)),
    dict(collections.Counter(o['quote'] for o in sel))))
