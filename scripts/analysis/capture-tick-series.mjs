/**
 * capture-tick-series.mjs — RECORD A REAL TICK SERIES SO THE KALMAN CLAIMS CAN BE TESTED, NOT ARGUED.
 *
 * ═══ WHY ═══
 * The three-way maker-fill debate now rests on two claims I made about the adaptive Kalman filter
 * at `signal-orchestrator.ts:2449`, and I labelled both as UNPROVEN:
 *   (i)  a smoother DISCARDS high-frequency precision by design ⇒ feeding it the book instead of a
 *        30-45 s old ticker buys little, because the extra precision is what it removes.
 *   (ii) a smoother PASSES A SYSTEMATIC OFFSET through undiminished ⇒ the midpoint/wrong-side error
 *        survives it intact.
 * Both are deterministic properties of a filter we have the source for, so they are testable against
 * a REAL series rather than assertable from how filters generally behave. This captures the series.
 *
 * ⛔ WHAT IS RECORDED, AND WHY EACH ONE: at every book update, the maintained top-of-book bid and
 * ask (what we COULD transact at), the midpoint (what the feed layer currently builds), and the most
 * recent trade print (what `levelReadKind` says our level path actually reads ~90% of the time).
 * ⇒ four series on ONE clock, so the filter experiment compares inputs that differ ONLY in which
 *   quantity they carry — not in when they were sampled.
 *
 * OUT-OF-BAND: own socket, public Kraken only. No app code, database, deploy or restart.
 * USAGE: node capture-tick-series.mjs [seconds] [outfile]   NSYM=6 TOP_N=40
 */

const SECONDS = Number(process.argv[2] ?? 600);
const OUT     = process.argv[3] ?? 'tick-series.json';
const TOP_N   = Number(process.env.TOP_N ?? 40);
const NSYM    = Number(process.env.NSYM ?? 6);
const FLOOR   = 10000;
const QUOTES  = new Set(['USD', 'USDT', 'USDC']);

const fs = await import('node:fs');
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
console.log('capturing ' + SYMS.length + ' symbols for ' + SECONDS + 's: ' + SYMS.join(', '));

const DEPTH_CAP = 10;   // MUST equal the subscribed `depth:` below.
function applyDelta(side, levels, isBid) {
  for (const l of levels ?? []) {
    const i = side.findIndex(x => x.price === l.price);
    if (l.qty === 0) { if (i >= 0) side.splice(i, 1); continue; }
    if (i >= 0) side[i].qty = l.qty; else side.push({ price: l.price, qty: l.qty });
  }
  side.sort((a, b) => isBid ? b.price - a.price : a.price - b.price);
  // ⛔⛔ TRUNCATE TO THE **SUBSCRIBED** DEPTH. This line read `> 50` and that was `#507` REINTRODUCED.
  // Kraken's contract (quoted in `kraken-websocket-adapter.ts:1055-1058`): *"After each update,
  // truncate your book to the subscribed depth — you will not receive `qty: 0` for levels that fall
  // out of scope."* At depth 10 a cap of 50 leaves **up to 40 orphan levels per side, by
  // construction, from the first delta** — dead levels that drift ever further from the live book.
  // ⚠️ MEASURED IN MY OWN CAPTURE: bid ABOVE ask on 98.5% of TAO/USD rows, 94% VVV, 83% CRV.
  // ⛔ AND THE INVERSION COUNT IS A DETECTOR OF LIMITED REACH (Langston): an orphan bid parked
  //    BETWEEN the true best bid and the live ask sits at `side[0]`, reports as the best bid, and
  //    NEVER CROSSES. So "zero inversions" is "no DETECTED inversion", not a clean ladder — which is
  //    why every ladder-derived figure from the pre-fix probes is WITHDRAWN on every symbol, not
  //    merely on the ones that visibly crossed.
  // ★ Production diagnosed and fixed this on 2026-08-22 (`truncateBook`, `:3641`); its docblock
  //   records ONDO/USD at bid 0.40349 vs ask 0.36411. I read that docblock, copied the shape, and
  //   left out the one line it exists to add.
  if (side.length > DEPTH_CAP) side.length = DEPTH_CAP;
}

const st = {};
for (const s of SYMS) st[s] = { bids: [], asks: [], seeded: false, lastTrade: null, rows: [] };

const ws = new WebSocket('wss://ws.kraken.com/v2');
let started = 0;
ws.on('open', () => {
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'book', symbol: SYMS, depth: 10 } }));
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'trade', symbol: SYMS } }));
  started = Date.now();
});
ws.on('message', raw => {
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m || !Array.isArray(m.data)) return;
  const now = Date.now();
  if (m.channel === 'trade') {
    for (const d of m.data) { const e = st[d.symbol]; if (e) e.lastTrade = d.price; }
    return;
  }
  if (m.channel !== 'book') return;
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
    const bb = e.bids[0], ba = e.asks[0];
    if (!bb || !ba || !(bb.price > 0) || !(ba.price > 0)) continue;
    // [t, bid, ask, mid, lastTrade] — four quantities on ONE clock.
    e.rows.push([now - started, bb.price, ba.price, (bb.price + ba.price) / 2, e.lastTrade]);
  }
});

setTimeout(() => {
  const out = { capturedAtMs: started, durationMs: Date.now() - started, symbols: {} };
  for (const s of SYMS) if (st[s].rows.length > 100) out.symbols[s] = st[s].rows;
  fs.writeFileSync(OUT, JSON.stringify(out));
  const n = Object.keys(out.symbols).length;
  console.log('wrote ' + OUT + ': ' + n + ' symbols, rows=' +
    Object.values(out.symbols).map(r => r.length).join(','));
  ws.close(); process.exit(0);
}, SECONDS * 1000 + 1500);
