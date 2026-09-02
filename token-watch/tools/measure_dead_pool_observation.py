"""Size RUNNING_ISSUES #983 from the store. RUN ON THE HOST.

#983: the aggregator is asked for a token's pair and returns the one with the
   most 24-hour volume. On graduation the liquidity moves to a new pool while
   the day's volume still sits on the drained curve, so the pair we OBSERVE
   can be the dead one -- carrying its price, volume and buy/sell counts.

I TOLD LANGSTON THIS COULD NOT BE SIZED FROM THE STORE. That was an asserted
   absence and it was wrong (#453). The store keeps the WHOLE aggregator
   response, every pair included -- so the alternative pools are right there
   and the question was always answerable. He predicted it: "does the store
   lack the fields, or do you lack access? Those have different fixes and one
   of them is cheap."
"""
import json, collections
F = '/var/lib/token-watch/provenance/follow-up/2026-09-02.jsonl'
# #983: token_state picks ONE pair by 24h volume. For a freshly-graduated
# token the volume still sits on the drained curve, so the observed pair can
# be the dead one. I told Langston the store could not size this. The store
# keeps the WHOLE aggregator response, every pair included -- so it can.
chosen_dead = 0
tokens = 0
multi = 0
examples = []
seen = set()
for line in open(F, encoding='utf-8', errors='replace'):
    try: r = json.loads(line)
    except Exception: continue
    if r.get('source') != 'dexscreener_token_state': continue
    b = r.get('body') or r.get('raw') or r.get('response')
    if isinstance(b, str):
        try: b = json.loads(b)
        except Exception: continue
    pairs = (b or {}).get('pairs') or []
    if not pairs: continue
    mint = (pairs[0].get('baseToken') or {}).get('address')
    if not mint or mint in seen: continue
    seen.add(mint)
    tokens += 1
    if len(pairs) > 1:
        multi += 1
    # what token_state would choose
    chosen = max(pairs, key=lambda x: float((x.get('volume') or {}).get('h24') or 0))
    chosen_liq = ((chosen.get('liquidity') or {}).get('usd'))
    if chosen.get('dexId') != 'pumpfun':
        continue
    # is there another pair with a real liquidity figure the chosen one lacks?
    alts = [p for p in pairs if p is not chosen
            and ((p.get('liquidity') or {}).get('usd') or 0) > 0]
    if chosen_liq in (None, 0) and alts:
        chosen_dead += 1
        if len(examples) < 5:
            best = max(alts, key=lambda p: (p.get('liquidity') or {}).get('usd') or 0)
            examples.append((
                (chosen.get('baseToken') or {}).get('symbol'),
                chosen.get('dexId'), (chosen.get('volume') or {}).get('h24'),
                best.get('dexId'), (best.get('liquidity') or {}).get('usd')))

print('#983 SIZED FROM THE STORE -- it holds every pair, so this was measurable')
print('  distinct tokens with an aggregator response today : %d' % tokens)
print('  ...listing more than one pair                     : %d  (%.2f%%)'
      % (multi, 100.0 * multi / tokens if tokens else 0))
print('  OBSERVED THROUGH A DEAD POOL -- chosen pair is a')
print('  pumpfun curve with no liquidity while another pair')
print('  has some                                          : %d  (%.3f%%)'
      % (chosen_dead, 100.0 * chosen_dead / tokens if tokens else 0))
for e in examples:
    print('     %-12s chosen %-9s vol24=%-12s  live alt %-9s liq=$%s'
          % (e[0], e[1], e[2], e[3], e[4]))
