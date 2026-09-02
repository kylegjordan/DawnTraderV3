"""Publish the price-agreement leg BOTH WAYS. RUN ON THE HOST.

LANGSTON'S RULING, 2026-09-02, applying his own F-G-2 A3 form: the quiet/
   trading split is accepted as PRIMARY -- the split variable is the
   aggregator's own 5-minute trade count, independent of the decode under
   test, fixed before looking at agreement, with a measured mechanism (the
   published price sat frozen across five samples over a minute while the
   curve moved 7%). "But it is still a rule you chose that excludes rows, so
   it publishes as PRIMARY + SENSITIVITY, both with counts and the delta."

AND THE RESIDUAL HE NAMED, WHICH THIS ANSWERS RATHER THAN RESTATES:
   "excluding every trading curve means the validation says nothing about the
   decode on active tokens -- which is exactly where a rug pull happens."
   The sensitivity arm now says something about them, and the trading rows
   are reported separately so their agreement rate is visible rather than
   buried in a pooled figure.

MEASURED 2026-09-02 (the population grows with every hourly sweep, so re-run
   rather than quoting a stored figure): PRIMARY 99.39% of 3,103 quiet rows
   within 0.1%; trading rows 88.37% of 43; ALL rows 99.24% of 3,146. Delta
   +0.15 percentage points, exclusion cost 1.37% of the population.

GRADUATED CURVES ARE OUT OF THIS LEG BY CONSTRUCTION, not by choice -- a
   drained curve publishes no price to check a decode against.
"""
import json, base64, struct, collections
PUMPFUN = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'
USDC = bytes.fromhex('c6fa7af3bedbad3a3d65f36aabc97431b1bbe4c2d2f6e0e47ca60203452f5d61')
ZERO = bytes(32)
F = '/var/lib/token-watch/provenance/follow-up/2026-09-02.jsonl'

meta = {}
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
            pa = p.get('pairAddress')
            if not pa or not p.get('priceNative'): continue
            m5 = (p.get('txns') or {}).get('m5') or {}
            meta[pa] = {'price': float(p['priceNative']),
                        'm5': int(m5.get('buys') or 0) + int(m5.get('sells') or 0),
                        'mint': (p.get('baseToken') or {}).get('address')}
    elif r.get('source') == 'helius_pool_account':
        pools.append(r)

rows = []
for r in pools:
    key = r.get('mint') or r.get('key') or r.get('subject')
    m = meta.get(key)
    if not m: continue
    b = r.get('body') or r.get('raw') or r.get('response')
    if isinstance(b, str):
        try: b = json.loads(b)
        except Exception: continue
    v = ((b or {}).get('result') or {}).get('value') or {}
    if v.get('owner') != PUMPFUN: continue
    raw = base64.b64decode((v.get('data') or [''])[0])
    if len(raw) < 115 or raw[48] == 1: continue      # graduated has no price to check
    vt, vs, rt, rs, sup = struct.unpack_from('<QQQQQ', raw, 8)
    if not vt: continue
    q = bytes(raw[83:115])
    dec = 6 if q == USDC else (9 if q == ZERO else None)
    if dec is None: continue
    ratio = ((vs / 10 ** dec) / (vt / 1e6)) / m['price']
    rows.append({'ratio': ratio, 'm5': m['m5'], 'mint': m['mint']})

def report(name, sel):
    if not sel:
        print('%-38s n=0' % name); return None
    within = sum(1 for r in sel if abs(r['ratio'] - 1.0) < 0.001)
    mints = len({r['mint'] for r in sel})
    rs = sorted(r['ratio'] for r in sel)
    print('%-38s n=%-6d mints=%-6d within 0.1%%: %-6d (%6.2f%%)  median %.6f'
          % (name, len(sel), mints, within, 100.0 * within / len(sel), rs[len(rs) // 2]))
    return 100.0 * within / len(sel)

print('PRICE-AGREEMENT LEG -- PRIMARY vs SENSITIVITY (Langston, 2026-09-02)')
print('The split variable is the aggregator OWN 5-minute trade count, fixed')
print('before looking at agreement. Published both ways with the delta, per his')
print('F-G-2 A3 ruling: a rule I chose that excludes rows must show what it cost.')
print()
quiet = [r for r in rows if r['m5'] == 0]
trading = [r for r in rows if r['m5'] > 0]
p = report('PRIMARY   (quiet, no trade in 5 min)', quiet)
t = report('          (trading, excluded)', trading)
a = report('SENSITIVITY (ALL rows, no exclusion)', rows)
print()
if p is not None and a is not None:
    print('DELTA primary - sensitivity: %+.2f percentage points' % (p - a))
if trading:
    print('EXCLUSION COST: %d of %d rows removed = %.2f%% of the population'
          % (len(trading), len(rows), 100.0 * len(trading) / len(rows)))
