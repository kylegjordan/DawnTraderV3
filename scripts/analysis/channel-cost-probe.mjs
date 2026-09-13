/**
 * channel-cost-probe.mjs — WHAT DOES EACH KRAKEN CHANNEL ACTUALLY COST US, PER SYMBOL?
 *
 * ═══ THE QUESTION (Kyle, 2026-09-13) ═══
 * "Is there a world where we can refresh our RTB pool pricing and our open trades pricing fast
 *  enough that we are making use of all of the order book pricing we're receiving? Say 150 signals
 *  in the RTB pool and ten to twenty open trades."
 * And CC-B's point, which is correct and changes the shape of the answer: simulating a MAKER fill
 * needs TRADE PRINTS, not the book. The book says what is RESTING; only a trade says what actually
 * EXECUTED, and at what size. A resting order fills when the market trades THROUGH its price.
 *
 * ⇒ so the real decision needs three per-symbol costs side by side, not one:
 *     `ticker` — fresh best bid/ask, pushed. Fixes quote STALENESS. No depth, no prints.
 *     `book`   — best bid/ask PLUS the resting ladder. Adds depth-walked fills.
 *     `trade`  — actual executions with size. The only thing that can decide a MAKER fill.
 * ⛔ ALL THREE ON ONE SOCKET, SAME SYMBOLS, SAME WINDOW — so the comparison is not three
 *    measurements taken at three different times on three different populations.
 *
 * ═══ WHY THIS IS THE DECIDING NUMBER ═══
 * `#1060` amendment 4 established the staleness is NOT throughput: we apply 634.5 book updates/min
 * with 100% checksum match, while the signal-birth path reads a 60 s REST cache (age p50 30-45 s,
 * 0 of 2,726 pushed). So the fix is about WHICH FEED the read path uses — and that makes the per
 * channel cost the whole question. If `ticker` is cheap, freshness is cheap and needs no book.
 *
 * OUT-OF-BAND: its own socket, public Kraken only. No app code, database, deploy or restart.
 *
 * USAGE: node channel-cost-probe.mjs [seconds] [rtbPoolSize]
 *        TOP_N=40 NSYM=24 WS_MODULE=/path/to/ws
 */

const SECONDS  = Number(process.argv[2] ?? 300);
const POOL     = Number(process.argv[3] ?? 150);
const TOP_N    = Number(process.env.TOP_N ?? 40);
const NSYM     = Number(process.env.NSYM ?? 24);
const FLOOR    = 10000;
const QUOTES   = new Set(['USD', 'USDT', 'USDC']);
const CHANNELS = ['ticker', 'book', 'trade'];

const { default: WebSocket } = await import(process.env.WS_MODULE ?? 'ws');
const plainQuote = q => (q.length === 4 && q.startsWith('Z')) ? q.slice(1) : q;

const allPairs = (await (await fetch('https://api.kraken.com/0/public/AssetPairs')).json()).result ?? {};
const cands = [];
for (const [krakenId, info] of Object.entries(allPairs)) {
  if (info.status && info.status !== 'online') continue;
  if (!QUOTES.has(plainQuote(info.quote)) || !info.wsname) continue;
  const p = info.wsname.split('/');
  cands.push({ krakenId, symbol: (p[0] === 'XBT' ? 'BTC' : p[0]) + '/' + p[1] });
}
const tick = new Map();
for (let i = 0; i < cands.length; i += 100) {
  const b = cands.slice(i, i + 100);
  try {
    const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=' + b.map(c => c.krakenId).join(','));
    for (const [k, v] of Object.entries((await r.json()).result ?? {})) tick.set(k, v);
  } catch (e) { console.warn('ticker batch ' + i + ': ' + e.message); }
}
const uni = [];
for (const c of cands) {
  const t = tick.get(c.krakenId);
  if (!t?.c?.[0] || !t?.v?.[1]) continue;
  const n = parseFloat(t.c[0]) * parseFloat(t.v[1]);
  if (isFinite(n) && n >= FLOOR) uni.push({ symbol: c.symbol, notional: n });
}
uni.sort((a, b) => b.notional - a.notional);

const pool = uni.slice(0, Math.min(TOP_N, uni.length));
const idx = new Set();
while (idx.size < Math.min(NSYM, pool.length)) idx.add(Math.floor(Math.random() * pool.length));
const SYMS = [...idx].map(i => pool[i].symbol);

console.log('universe=' + uni.length + '  sampled TOP_N=' + TOP_N + '  n=' + SYMS.length
  + '  window=' + SECONDS + 's  extrapolating to a pool of ' + POOL);

/**
 * ⛔⛔ TWO TICKER VARIANTS, AND MEASURING ONLY ONE WOULD HAVE PRICED THE WRONG THING.
 * Kraken's DEFAULT ticker trigger fires "on every trade". Our production subscribe sets
 * `event_trigger: 'bbo'` (`kraken-websocket-adapter.ts:1548`, landed 2026-09-11 as P-7a/#1017)
 * so it fires "on a change in the best-bid-offer" instead — which on a liquid pair is far more
 * often than a trade. ⇒ the default-trigger rate is NOT the rate our system actually pays, and
 * `ticker_bbo` is precisely the cheap-freshness option this decision turns on.
 * ⛔ The same channel cannot be subscribed twice with different triggers on ONE socket, so the
 *    bbo variant gets its own connection — SAME SYMBOLS, SAME WINDOW, so the costs are comparable.
 */
const cnt = {}; const byt = {}; const acked = {};
const ALL = [...CHANNELS, 'ticker_bbo'];
for (const ch of ALL) { cnt[ch] = 0; byt[ch] = 0; acked[ch] = new Set(); }

const ws = new WebSocket('wss://ws.kraken.com/v2');
const ws2 = new WebSocket('wss://ws.kraken.com/v2');
let started = 0;
ws.on('open', () => {
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: SYMS } }));
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'book', symbol: SYMS, depth: 10 } }));
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'trade', symbol: SYMS } }));
  started = Date.now();
  console.log('socket 1: ticker(default trigger) + book(10) + trade; counting ' + SECONDS + 's');
});
ws2.on('open', () => {
  ws2.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: SYMS, event_trigger: 'bbo' } }));
  console.log('socket 2: ticker with event_trigger=bbo — the variant production actually uses');
});
ws2.on('message', raw => {
  const bytes = raw.length;
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m) return;
  if (m.method === 'subscribe' && m.result?.symbol) {
    if (m.success) acked.ticker_bbo.add(m.result.symbol);
    else console.warn('  REFUSED ticker_bbo ' + m.result.symbol + ': ' + (m.error ?? ''));
    return;
  }
  if (!Array.isArray(m.data) || m.channel !== 'ticker') return;
  cnt.ticker_bbo += m.data.length;
  byt.ticker_bbo += bytes;
});
ws.on('message', raw => {
  const bytes = raw.length;
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m) return;
  if (m.method === 'subscribe' && m.result?.symbol) {
    if (m.success && acked[m.result.channel]) acked[m.result.channel].add(m.result.symbol);
    else if (!m.success) console.warn('  REFUSED ' + m.result.channel + ' ' + m.result.symbol);
    return;
  }
  if (!Array.isArray(m.data) || !CHANNELS.includes(m.channel)) return;
  cnt[m.channel] += m.data.length;
  byt[m.channel] += bytes;
});

setTimeout(() => {
  const mins = (Date.now() - started) / 60000;
  console.log('\nelapsed_min=' + mins.toFixed(3));
  console.log('channel   acked  msgs/sym/min   bytes/sym/min   | POOL OF ' + POOL + ': msgs/min   msgs/sec   MB/day');
  for (const ch of ALL) {
    const n = acked[ch].size || SYMS.length;
    const perSymMin = cnt[ch] / n / mins;
    const perSymByt = byt[ch] / n / mins;
    const poolMin = perSymMin * POOL;
    console.log('  ' + ch.padEnd(8) + String(n).padStart(4) + '   '
      + perSymMin.toFixed(1).padStart(10) + '   ' + Math.round(perSymByt).toString().padStart(13)
      + '   | ' + Math.round(poolMin).toString().padStart(9)
      + '   ' + (poolMin / 60).toFixed(1).padStart(8)
      + '   ' + (perSymByt * POOL * 1440 / 1e6).toFixed(0).padStart(6));
  }
  console.log('\n⇒ read this as: what does it cost to keep a pool of ' + POOL + ' symbols CURRENT on each channel.');
  console.log('  `ticker` alone fixes quote staleness. `book` adds depth. `trade` is the only one that can decide a maker fill.');
  ws.close(); ws2.close(); process.exit(0);
}, SECONDS * 1000 + 1500);
