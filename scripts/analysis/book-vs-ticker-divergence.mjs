/**
 * book-vs-ticker-divergence.mjs — HOW MUCH BETTER IS THE ORDER BOOK THAN THE TICKER?
 *
 * ═══ THE QUESTION, KYLE'S, 2026-09-13 ═══
 * "How much closer to reality does the order book get us than just using the ticker? If it is not
 *  a significant difference, the answer is we stay with the ticker."
 * `#1060`'s volume measurement priced the COST of subscribing books. Nothing had priced the BENEFIT.
 * Scoping a subscription change without that number is choosing before knowing.
 *
 * ═══ WHY THIS COMPARISON CANNOT BE MADE INSIDE THE APP ═══
 * ⛔ The in-process instrument (`tickerVsBookAgreement`) CANNOT answer it. Its "ticker" leg reads
 * the shared price cache, and `kraken-websocket-adapter.ts:1151-1153` writes the BOOK'S OWN TOP
 * into those very fields under producer `kraken_ws_book_mid`. So on a book-carrying symbol the two
 * legs can be the same object one write apart, and the cache carries no per-side producer to tell
 * them apart (F2, 2026-09-13). ⇒ **a genuine cross-feed comparison does not exist in the app.**
 * ✅ Here both legs come STRAIGHT OFF ONE SOCKET with no cache in between, so the comparison is
 * real by construction. Out-of-band: no app code, no app database, no deploy, no restart.
 *
 * ═══ THE MECHANISM BEING MEASURED, NOT JUST THE GAP ═══
 * The ticker and the book both publish a best bid and ask, so at the instant a ticker frame lands
 * they should AGREE — the interesting quantity is not "are they different" but **how far the true
 * top-of-book has moved since the last ticker frame arrived.** Measured 2026-09-13: the top-40
 * symbols carry 8.4 ticker frames/min against 1,321.5 book frames/min, so a cached ticker quote is
 * typically SECONDS old while the book is current. ⇒ divergence is reported BUCKETED BY THE AGE OF
 * THE TICKER QUOTE, which separates genuine disagreement (age ~0) from staleness (age growing).
 * ★ That is the honest shape of the question: if the two agree at age 0, the book's only advantage
 *   is FRESHNESS and DEPTH, and freshness can also be bought by polling the ticker harder.
 *
 * ═══ AND DEPTH, BECAUSE IT IS THE BOOK'S OTHER CLAIM ═══
 * A ticker gives one price per side. A book gives the SIZE behind it. If our order size is small
 * relative to top-of-book notional, the extra levels buy nothing; if it is large, the ticker's best
 * price is a price we could not actually get filled at. So the top-of-book notional distribution is
 * recorded alongside, and compared against a stated order size.
 *
 * USAGE:  node book-vs-ticker-divergence.mjs [seconds] [orderNotionalUsd]
 *         TOP_N=40 (default) — sample from the top N of the reproduced universe by 24h notional.
 *         WS_MODULE=/path/to/ws if `ws` is not resolvable from the cwd.
 */

const SECONDS   = Number(process.argv[2] ?? 600);
const ORDER_USD = Number(process.argv[3] ?? 100);
const TOP_N     = Number(process.env.TOP_N ?? 40);
const NSYM      = Number(process.env.NSYM ?? 24);
const DEPTH     = 10;
const FLOOR_USD = 10000;
const QUOTES    = new Set(['USD', 'USDT', 'USDC']);

const { default: WebSocket } = await import(process.env.WS_MODULE ?? 'ws');
const plainQuote = q => (q.length === 4 && q.startsWith('Z')) ? q.slice(1) : q;

async function buildUniverse() {
  const allPairs = (await (await fetch('https://api.kraken.com/0/public/AssetPairs')).json()).result ?? {};
  const cands = [];
  for (const [krakenId, info] of Object.entries(allPairs)) {
    if (info.status && info.status !== 'online') continue;
    if (!QUOTES.has(plainQuote(info.quote))) continue;
    if (!info.wsname) continue;
    const parts = info.wsname.split('/');
    cands.push({ krakenId, symbol: (parts[0] === 'XBT' ? 'BTC' : parts[0]) + '/' + parts[1] });
  }
  const tick = new Map();
  for (let i = 0; i < cands.length; i += 100) {
    const batch = cands.slice(i, i + 100);
    try {
      const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=' + batch.map(c => c.krakenId).join(','));
      for (const [k, v] of Object.entries((await r.json()).result ?? {})) tick.set(k, v);
    } catch (e) { console.warn('ticker batch failed at ' + i + ': ' + e.message); }
  }
  const u = [];
  for (const c of cands) {
    const t = tick.get(c.krakenId);
    if (!t || !t.c || !t.c[0] || !t.v || !t.v[1]) continue;
    const n = parseFloat(t.c[0]) * parseFloat(t.v[1]);
    if (isFinite(n) && n >= FLOOR_USD) u.push({ symbol: c.symbol, notional: n });
  }
  u.sort((a, b) => b.notional - a.notional);
  return u;
}

// Age buckets in ms for the ticker quote at the moment of comparison.
const AGE_EDGES = [250, 500, 1000, 2000, 5000, 10000, 30000];
const ageLabel = i => i === 0 ? '<250ms'
  : i === AGE_EDGES.length ? `${AGE_EDGES[AGE_EDGES.length - 1]}ms+`
  : `${AGE_EDGES[i - 1]}-${AGE_EDGES[i]}ms`;
const ageIdx = ms => { const i = AGE_EDGES.findIndex(e => ms < e); return i < 0 ? AGE_EDGES.length : i; };

const universe = await buildUniverse();
const pool = universe.slice(0, Math.min(TOP_N, universe.length));
const idx = new Set();
while (idx.size < Math.min(NSYM, pool.length)) idx.add(Math.floor(Math.random() * pool.length));
const SYMS = [...idx].map(i => pool[i].symbol);

console.log('universe_reproduced_size=' + universe.length + '  sampling TOP_N=' + TOP_N + '  n=' + SYMS.length);
console.log('order_notional_usd=' + ORDER_USD + '  depth=' + DEPTH + '  window_s=' + SECONDS);

/**
 * ⛔⛔ THE BOOK MUST BE MAINTAINED, NOT READ OFF THE FRAME. MEASURED THE HARD WAY 2026-09-13.
 * Kraken v2 sends `type:"snapshot"` once, then `type:"update"` deltas carrying ONLY THE CHANGED
 * LEVELS. The first revision of this probe read `d.bids[0]` on every frame and called it the best
 * bid — so it was measuring **the size of whichever level just changed**, which is usually a small
 * order being placed or cancelled (`qty: 0` is a removal).
 * ⇒ it reported a median top-of-book of **$7**, and an independent REST `Depth` check put BTC/USD's
 *   real top at **$6,858–$11,174**. Three orders of magnitude, from code that ran cleanly and
 *   produced a plausible-looking distribution. **The number was never about the thing claimed.**
 * ⇒ SO: apply snapshot + deltas into a real ladder and read the true top from it.
 */
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
for (const s of SYMS) st[s] = { tBid: null, tAsk: null, tAt: 0, ackT: false, ackB: false, bookN: 0, tickN: 0, bids: [], asks: [], seeded: false };

// Divergence samples, per age bucket: bid bps, ask bps.
const bidByAge = AGE_EDGES.map(() => []).concat([[]]);
const askByAge = AGE_EDGES.map(() => []).concat([[]]);
let crossed = 0, compared = 0, noTickerYet = 0;
// Top-of-book notional at best bid/ask, and whether ORDER_USD fits inside level 1.
const topNotional = [];
let fitsL1 = 0, needsWalk = 0;
const walkBps = [];
let walkExhausted = 0;

const ws = new WebSocket('wss://ws.kraken.com/v2');
let started = 0;

ws.on('open', () => {
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: SYMS } }));
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'book', symbol: SYMS, depth: DEPTH } }));
  started = Date.now();
  console.log('subscribed; counting ' + SECONDS + 's');
});

ws.on('message', raw => {
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m) return;
  if (m.method === 'subscribe' && m.result && m.result.symbol) {
    const e = st[m.result.symbol];
    if (e) { if (m.result.channel === 'ticker') e.ackT = !!m.success; if (m.result.channel === 'book') e.ackB = !!m.success; }
    return;
  }
  if (!Array.isArray(m.data)) return;
  const now = Date.now();

  if (m.channel === 'ticker') {
    for (const d of m.data) {
      const e = st[d.symbol]; if (!e) continue;
      if (Number.isFinite(d.bid) && Number.isFinite(d.ask) && d.bid > 0 && d.ask > 0) {
        e.tBid = d.bid; e.tAsk = d.ask; e.tAt = now; e.tickN++;
      }
    }
    return;
  }

  if (m.channel !== 'book') return;
  for (const d of m.data) {
    const e = st[d.symbol]; if (!e) continue;
    e.bookN++;

    // A snapshot REPLACES the ladder; an update patches it. Reading the frame's own arrays as if
    // they were the book is the error this probe was rebuilt to fix.
    if (m.type === 'snapshot') {
      e.bids = (d.bids ?? []).map(l => ({ price: l.price, qty: l.qty })).sort((a, b) => b.price - a.price);
      e.asks = (d.asks ?? []).map(l => ({ price: l.price, qty: l.qty })).sort((a, b) => a.price - b.price);
      e.seeded = true;
      continue; // a snapshot is not a market event to measure against
    }
    if (!e.seeded) continue;   // never measure a ladder we have not seeded
    applyDelta(e.bids, d.bids, true);
    applyDelta(e.asks, d.asks, false);

    const bb = e.bids.length ? e.bids[0] : null;
    const ba = e.asks.length ? e.asks[0] : null;
    if (!bb || !ba || !(bb.price > 0) || !(ba.price > 0)) continue;

    // Depth: what the best level alone can absorb, in USD.
    const bidUsd = bb.price * bb.qty, askUsd = ba.price * ba.qty;
    const thinner = Math.min(bidUsd, askUsd);
    topNotional.push(thinner);
    if (thinner >= ORDER_USD) fitsL1++; else needsWalk++;

    // ⭐ THE FIDELITY COST ITSELF: buy ORDER_USD by walking the asks, and compare the average price
    // actually paid against the BEST ask — which is all a ticker-only simulation would ever know.
    // That gap IS the bias a ticker-only fill would bake into every simulated trade.
    let need = ORDER_USD, spent = 0, got = 0, exhausted = false;
    for (const l of e.asks) {
      const lvlUsd = l.price * l.qty;
      const take = Math.min(need, lvlUsd);
      spent += take; got += take / l.price; need -= take;
      if (need <= 0) break;
    }
    if (need > 0) exhausted = true;
    if (got > 0) {
      const avg = spent / got;
      walkBps.push((avg - ba.price) / ba.price * 10_000);
      if (exhausted) walkExhausted++;
    }

    // Divergence against the most recent ticker quote, bucketed by that quote's AGE.
    if (e.tBid === null) { noTickerYet++; continue; }
    compared++;
    const age = now - e.tAt;
    const i = ageIdx(age);
    bidByAge[i].push(Math.abs(e.tBid - bb.price) / bb.price * 10_000);
    askByAge[i].push(Math.abs(e.tAsk - ba.price) / ba.price * 10_000);
    // The qualitative failure: the cached ticker says you can buy where the book says you can sell.
    if (e.tBid >= ba.price || e.tAsk <= bb.price) crossed++;
  }
});

const q = (arr, p) => { if (!arr.length) return null; const a = [...arr].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * a.length))]; };

setTimeout(() => {
  const mins = (Date.now() - started) / 60000;
  const live = SYMS.filter(s => st[s].ackT && st[s].ackB);
  console.log('\nelapsed_min=' + mins.toFixed(3) + '  acked_both=' + live.length + ' of ' + SYMS.length);
  console.log('book_updates_compared=' + compared + '  book_updates_before_any_ticker=' + noTickerYet);
  console.log('CROSSED (cached ticker bid >= book ask, or ticker ask <= book bid): ' + crossed
    + '  = ' + (compared ? (100 * crossed / compared).toFixed(2) : 'n/a') + '% of comparisons');

  console.log('\n⭐ DIVERGENCE OF THE CACHED TICKER QUOTE FROM THE LIVE BOOK TOP, BY TICKER-QUOTE AGE');
  console.log('   (bps; 1 bp = 0.01%. age 0 isolates genuine disagreement, growing age is staleness)');
  console.log('   age_bucket        n     bid_p50  bid_p90  bid_p99   ask_p50  ask_p90  ask_p99');
  for (let i = 0; i <= AGE_EDGES.length; i++) {
    const nb = bidByAge[i].length;
    if (!nb) continue;
    const f = v => v === null ? '   -  ' : v.toFixed(2).padStart(6);
    console.log('   ' + ageLabel(i).padEnd(14) + String(nb).padStart(6) + '   '
      + f(q(bidByAge[i], 0.5)) + '  ' + f(q(bidByAge[i], 0.9)) + '  ' + f(q(bidByAge[i], 0.99)) + '   '
      + f(q(askByAge[i], 0.5)) + '  ' + f(q(askByAge[i], 0.9)) + '  ' + f(q(askByAge[i], 0.99)));
  }

  const allBid = bidByAge.flat(), allAsk = askByAge.flat();
  console.log('\n   POOLED (all ages): n=' + allBid.length
    + '  bid p50=' + (q(allBid, 0.5) ?? 0).toFixed(2) + ' p90=' + (q(allBid, 0.9) ?? 0).toFixed(2) + ' p99=' + (q(allBid, 0.99) ?? 0).toFixed(2)
    + '  ask p50=' + (q(allAsk, 0.5) ?? 0).toFixed(2) + ' p90=' + (q(allAsk, 0.9) ?? 0).toFixed(2) + ' p99=' + (q(allAsk, 0.99) ?? 0).toFixed(2) + ' bps');

  console.log('\n⭐ TOP-OF-BOOK DEPTH — the thinner side, in USD, and whether a $' + ORDER_USD + ' order fits in level 1');
  console.log('   n=' + topNotional.length
    + '  p10=' + (q(topNotional, 0.1) ?? 0).toFixed(0)
    + '  p50=' + (q(topNotional, 0.5) ?? 0).toFixed(0)
    + '  p90=' + (q(topNotional, 0.9) ?? 0).toFixed(0));
  console.log('   fits_in_level1=' + fitsL1 + '  would_walk_the_book=' + needsWalk
    + '  => ' + (topNotional.length ? (100 * fitsL1 / topNotional.length).toFixed(2) : 'n/a') + '% of observations absorb the order at the best price alone');

  console.log('\n⭐⭐ THE FIDELITY COST — average price paid walking the asks for $' + ORDER_USD
    + ', vs the BEST ask (all a ticker-only fill would know)');
  console.log('   n=' + walkBps.length
    + '  p50=' + (q(walkBps, 0.5) ?? 0).toFixed(2)
    + '  p90=' + (q(walkBps, 0.9) ?? 0).toFixed(2)
    + '  p99=' + (q(walkBps, 0.99) ?? 0).toFixed(2) + ' bps worse than the best ask'
    + '   book_exhausted_before_filling=' + walkExhausted);

  ws.close(); process.exit(0);
}, SECONDS * 1000 + 1500);
