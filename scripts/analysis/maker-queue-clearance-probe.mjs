/**
 * maker-queue-clearance-probe.mjs — DO CC-B's TWO MAKER-FILL RULES ACTUALLY DISAGREE?
 *
 * ═══ THE DISAGREEMENT THIS SETTLES (CC-B → CC-C, 2026-09-13) ═══
 * CC-B is right and it corrects my recommendation. I priced the book as a CONTINUOUS subscription
 * (98× the trade feed) and concluded "skip it". That holds for choosing a fill PRICE. It does NOT
 * answer QUEUE POSITION, which only the book carries:
 *   "When we post a resting buy at P, what decides whether we fill is how much was ALREADY resting
 *    at P when we arrived. That number exists only in the book, and only at the instant of
 *    placement. The prints then tell us how much of that line genuinely cleared."
 * ★ AND THE HALF THAT DISSOLVES MY COST OBJECTION: his rule (b) needs ONE BOOK READ AT PLACEMENT,
 *   not a continuous subscription. A few thousand one-shot reads a day is not 2,404 msgs/sec, and
 *   Kraken's REST `Depth` endpoint serves it without any subscription at all.
 *
 * ⇒ THE OPEN QUESTION IS NOT book-vs-prints. IT IS WHETHER QUEUE POSITION CHANGES THE ANSWER:
 *     (a) PRINTS ONLY      — fill when a trade prints strictly THROUGH our limit. Ignores the line
 *                            ahead of us, so it OVER-REPORTS fills wherever our price level is busy.
 *     (b) PRINTS + BOOK-AT-ARRIVAL — record resting size at our price on placement, advance only on
 *                            printed volume. The standard conservative model. One book read.
 *
 * ═══ THE DISCRIMINATOR ═══
 * For a resting BUY at the best bid B, the queue ahead is the resting size at B, and what advances
 * us is SELL-AGGRESSOR volume printing at price ≤ B. So the deciding ratio is:
 *     CLEARANCE = (sell-aggressor USD printed at ≤ B over the window) / (typical resting USD at B)
 *   CLEARANCE ≫ 1  ⇒ the line ahead clears many times over ⇒ (a) and (b) agree ⇒ take the cheap rule.
 *   CLEARANCE ≪ 1  ⇒ the line rarely clears ⇒ (a) reports fills that would not have happened ⇒ (b).
 * ⛔ REPORTED PER SYMBOL, NEVER POOLED: a liquid name and a thin one have opposite answers and a
 *    pooled mean would describe neither — which is the same population error `#1060` already cost us.
 *
 * OUT-OF-BAND: own socket, public Kraken only. No app code, database, deploy or restart.
 * USAGE: node maker-queue-clearance-probe.mjs [seconds] [orderUsd]   TOP_N=40 NSYM=24
 */

const SECONDS   = Number(process.argv[2] ?? 300);
const ORDER_USD = Number(process.argv[3] ?? 150);
const TOP_N     = Number(process.env.TOP_N ?? 40);
const NSYM      = Number(process.env.NSYM ?? 24);
const FLOOR     = 10000;
const QUOTES    = new Set(['USD', 'USDT', 'USDC']);

const { default: WebSocket } = await import(process.env.WS_MODULE ?? 'ws');
const pq = q => (q.length === 4 && q.startsWith('Z')) ? q.slice(1) : q;

const allPairs = (await (await fetch('https://api.kraken.com/0/public/AssetPairs')).json()).result ?? {};
const cands = [];
for (const [id, info] of Object.entries(allPairs)) {
  if (info.status && info.status !== 'online') continue;
  if (!QUOTES.has(pq(info.quote)) || !info.wsname) continue;
  const p = info.wsname.split('/');
  cands.push({ id, symbol: (p[0] === 'XBT' ? 'BTC' : p[0]) + '/' + p[1] });
}
const tk = new Map();
for (let i = 0; i < cands.length; i += 100) {
  const b = cands.slice(i, i + 100);
  try {
    const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=' + b.map(c => c.id).join(','));
    for (const [k, v] of Object.entries((await r.json()).result ?? {})) tk.set(k, v);
  } catch {}
}
const uni = [];
for (const c of cands) {
  const t = tk.get(c.id);
  if (!t?.c?.[0] || !t?.v?.[1]) continue;
  const n = parseFloat(t.c[0]) * parseFloat(t.v[1]);
  if (isFinite(n) && n >= FLOOR) uni.push({ symbol: c.symbol, notional: n });
}
uni.sort((a, b) => b.notional - a.notional);
const poolArr = uni.slice(0, Math.min(TOP_N, uni.length));
const idx = new Set();
while (idx.size < Math.min(NSYM, poolArr.length)) idx.add(Math.floor(Math.random() * poolArr.length));
const SYMS = [...idx].map(i => poolArr[i].symbol);

console.log('universe=' + uni.length + '  TOP_N=' + TOP_N + '  n=' + SYMS.length
  + '  order=$' + ORDER_USD + '  window=' + SECONDS + 's');

function applyDelta(side, levels, isBid) {
  for (const l of levels ?? []) {
    const i = side.findIndex(x => x.price === l.price);
    if (l.qty === 0) { if (i >= 0) side.splice(i, 1); continue; }
    if (i >= 0) side[i].qty = l.qty; else side.push({ price: l.price, qty: l.qty });
  }
  side.sort((a, b) => isBid ? b.price - a.price : a.price - b.price);
  if (side.length > 50) side.length = 50;
}

const st = {};
for (const s of SYMS) st[s] = {
  bids: [], asks: [], seeded: false,
  restUsd: [],        // samples of resting USD at the best bid
  sellAtOrBelowUsd: 0, // sell-aggressor USD printed at <= the best bid at print time
  throughUsd: 0,       // sell-aggressor USD printed STRICTLY BELOW the best bid (rule (a) trigger)
  prints: 0, throughPrints: 0,
};

const ws = new WebSocket('wss://ws.kraken.com/v2');
let started = 0;
ws.on('open', () => {
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'book', symbol: SYMS, depth: 10 } }));
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'trade', symbol: SYMS } }));
  started = Date.now();
  console.log('subscribed book(10) + trade; counting ' + SECONDS + 's');
});

ws.on('message', raw => {
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m || !Array.isArray(m.data)) return;

  if (m.channel === 'book') {
    for (const d of m.data) {
      const e = st[d.symbol]; if (!e) continue;
      if (m.type === 'snapshot') {
        e.bids = (d.bids ?? []).map(l => ({ ...l })).sort((a, b) => b.price - a.price);
        e.asks = (d.asks ?? []).map(l => ({ ...l })).sort((a, b) => a.price - b.price);
        e.seeded = true; continue;
      }
      if (!e.seeded) continue;
      applyDelta(e.bids, d.bids, true);
      applyDelta(e.asks, d.asks, false);
      const bb = e.bids[0];
      if (bb && bb.price > 0) e.restUsd.push(bb.price * bb.qty);
    }
    return;
  }

  if (m.channel !== 'trade') return;
  for (const d of m.data) {
    const e = st[d.symbol]; if (!e || !e.seeded) continue;
    const bb = e.bids[0];
    if (!bb || !(bb.price > 0)) continue;
    // A resting BUY at the bid is advanced by SELL-side aggressors printing at or below it.
    if (d.side !== 'sell') continue;
    const usd = d.price * d.qty;
    e.prints++;
    if (d.price <= bb.price) e.sellAtOrBelowUsd += usd;
    if (d.price < bb.price) { e.throughUsd += usd; e.throughPrints++; }
  }
});

const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

setTimeout(() => {
  const mins = (Date.now() - started) / 60000;
  console.log('\nelapsed_min=' + mins.toFixed(3) + '   ORDER=$' + ORDER_USD);
  console.log('symbol          restingUSD@bid(p50)   sellVol@<=bid   CLEARANCE   through-prints   rule(a) fires?');
  const clears = [];
  let aFires = 0, bFires = 0, live = 0;
  for (const s of SYMS) {
    const e = st[s];
    const r = med(e.restUsd);
    if (r === null || !e.seeded) continue;
    live++;
    // (b): our $ORDER sits behind the resting line; it needs queue + our size to print.
    const needB = r + ORDER_USD;
    const clearance = r > 0 ? e.sellAtOrBelowUsd / needB : null;
    const bFill = e.sellAtOrBelowUsd >= needB;
    const aFill = e.throughPrints > 0;
    if (aFill) aFires++;
    if (bFill) bFires++;
    if (clearance !== null) clears.push(clearance);
    console.log('  ' + s.padEnd(14)
      + (r).toFixed(0).padStart(14)
      + (e.sellAtOrBelowUsd).toFixed(0).padStart(16)
      + (clearance === null ? '   n/a' : clearance.toFixed(2).padStart(12))
      + String(e.throughPrints).padStart(16)
      + '   ' + (aFill ? 'YES' : 'no') + (aFill !== bFill ? '   <-- RULES DISAGREE' : ''));
  }
  const c = [...clears].sort((a, b) => a - b);
  console.log('\nCLEARANCE (sell volume at<=bid divided by [resting line + our order]) over ' + mins.toFixed(1) + ' min:');
  console.log('  n=' + c.length + '  p10=' + (c[Math.floor(c.length * 0.1)] ?? 0).toFixed(2)
    + '  p50=' + (c[Math.floor(c.length * 0.5)] ?? 0).toFixed(2)
    + '  p90=' + (c[Math.floor(c.length * 0.9)] ?? 0).toFixed(2));
  console.log('  symbols where rule (a) would report a fill: ' + aFires + ' of ' + live);
  console.log('  symbols where rule (b) would report a fill: ' + bFires + ' of ' + live);
  console.log('  ⇒ (a) over-reports on ' + (aFires - bFires) + ' of ' + live + ' symbols in this window.');
  ws.close(); process.exit(0);
}, SECONDS * 1000 + 1500);
