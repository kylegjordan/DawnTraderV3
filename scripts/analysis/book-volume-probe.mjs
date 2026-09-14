/**
 * book-volume-probe.mjs — OUT-OF-BAND measurement for `B-BOOK-SUBSCRIPTION-REACH`
 * (`#1060`, PHASE_19_PLAN row `3n.m`).
 *
 * ═══ WHAT IT ANSWERS ═══
 * Langston made this a PRECONDITION of the 3n.m scope rather than a finding inside it:
 *   "subscribe N symbols to `book`, count frames/min against the ohlc+ticker rate on the
 *    same shard. Precondition of the scope, not a finding inside it."
 * The reason is at `crypto-spot-archiver.ts:269` — `shardCount = ceil(symbols/SHARD_SIZE)`
 * is a SYMBOL COUNT WITH NO THROUGHPUT TERM, and the binding constraint on a websocket
 * connection is FRAMES/SEC. So the shard arithmetic is structurally incapable of answering
 * "how many book subscriptions fit", and the frame rate has to be measured.
 *
 * ═══ WHY IT IS OUT-OF-BAND, DELIBERATELY ═══
 * ONE websocket of its own to Kraken. No app code, no app database, no app connection pool,
 * no deploy, no restart. It reads only PUBLIC Kraken REST + WS, so it can run from anywhere
 * with network access to Kraken and does not need the staging box at all.
 *
 * ═══ POPULATION — THE PART THAT MAKES THE NUMBER MEAN ANYTHING ═══
 * The extrapolation target is the archiver's own crypto universe (live: 2 shards / 406
 * symbols). So the sample is drawn FROM THAT UNIVERSE, reproduced here from the same public
 * inputs `universe-loader.ts` uses (AssetPairs -> quote in ADMITTED_QUOTES -> status online
 * -> 24h notional = c[0] * v[1] >= floor). It prints the reproduced universe SIZE so the
 * reproduction can be checked against the live shard totals before any rate is believed.
 *
 * A hand-picked "liquid vs mid" pair of triples is NOT a sample of that population, and the
 * first revision of this probe did exactly that. Book chatter is heavily right-skewed — one
 * symbol printed 54 frames/min while another printed 823 in the same minute — so the mean of
 * a convenience sample estimates nothing. Hence STRATIFIED RANDOM sampling by 24h notional,
 * equal allocation per stratum, strata reported separately so the liquid-skewed FX5-survivor
 * case and the whole-universe case get different estimates rather than one blended figure.
 *
 * WHAT IT STILL CANNOT TELL YOU: one window at one time of day. Book traffic is a function of
 * market activity. Re-run it in a different session before treating any figure as a planning
 * constant, and report the window alongside the rate.
 *
 * ═══ TWO POPULATIONS, AND THEY ANSWER DIFFERENT QUESTIONS ═══
 * `3n.m` has TWO cases and one number cannot serve both:
 *   - THE 406-SYMBOL CASE (subscribe the whole archiver universe): the estimator is the
 *     UNIVERSE MEAN, so the default stratified-random mode is the right instrument.
 *   - THE 40-SYMBOL CASE (subscribe the FX5 survivor pool): survivors skew heavily liquid,
 *     and the universe is steeply right-skewed — BTC/USD was $64.8M 24h notional while a
 *     random draw from the TOP THIRD topped out at $472k, two orders of magnitude below it.
 *     ⇒ the stratified mean STRUCTURALLY UNDER-COVERS the symbols the survivor pool contains,
 *     and using it for the 40-symbol case would understate the load. Set `TOP_N` for that arm:
 *     it samples at random from the top `TOP_N` of the universe by 24h notional instead.
 * ⛔ Report which mode produced any figure. They are not interchangeable.
 *
 * USAGE:  node book-volume-probe.mjs [seconds] [perStratum]
 *         defaults: 600 seconds, 8 symbols per stratum, 3 strata = 24 symbols.
 *         TOP_N=40       sample 24 at random from the top 40 by notional (survivor-pool proxy)
 *         WS_MODULE=/path/to/ws  if the `ws` package is not resolvable from the cwd.
 */

const SECONDS     = Number(process.argv[2] ?? 600);
const PER_STRATUM = Number(process.argv[3] ?? 8);
const STRATA      = 3;
const DEPTH       = 10;
const FLOOR_USD   = 10000;                             // crypto-universe-filter.json filter.minVolume24hUsd
const QUOTES      = new Set(['USD', 'USDT', 'USDC']);  // shared/admitted-quotes.ts ADMITTED_QUOTES

const wsPath = process.env.WS_MODULE ?? 'ws';
const { default: WebSocket } = await import(wsPath);

const plainQuote = q => (q.length === 4 && q.startsWith('Z')) ? q.slice(1) : q;

async function buildUniverse() {
  const pairsResp = await fetch('https://api.kraken.com/0/public/AssetPairs');
  const allPairs = (await pairsResp.json()).result ?? {};

  const cands = [];
  for (const [krakenId, info] of Object.entries(allPairs)) {
    if (info.status && info.status !== 'online') continue;
    if (!QUOTES.has(plainQuote(info.quote))) continue;
    if (!info.wsname) continue;
    // v2 WS uses BTC/... where the v1 wsname says XBT/...; everything else carries through.
    const parts = info.wsname.split('/');
    const base = parts[0] === 'XBT' ? 'BTC' : parts[0];
    cands.push({ krakenId, symbol: base + '/' + parts[1] });
  }

  const tick = new Map();
  for (let i = 0; i < cands.length; i += 100) {
    const batch = cands.slice(i, i + 100);
    try {
      const url = 'https://api.kraken.com/0/public/Ticker?pair=' + batch.map(c => c.krakenId).join(',');
      const r = await fetch(url);
      for (const [k, v] of Object.entries((await r.json()).result ?? {})) tick.set(k, v);
    } catch (e) { console.warn('ticker batch failed at ' + i + ': ' + e.message); }
  }

  const universe = [];
  for (const c of cands) {
    const t = tick.get(c.krakenId);
    if (!t || !t.c || !t.c[0] || !t.v || !t.v[1]) continue;
    const notional = parseFloat(t.c[0]) * parseFloat(t.v[1]);
    if (!isFinite(notional) || notional < FLOOR_USD) continue;
    universe.push({ symbol: c.symbol, notional });
  }
  universe.sort((a, b) => b.notional - a.notional);   // descending: index 0 = most traded
  return universe;
}

const TOP_N = process.env.TOP_N ? Number(process.env.TOP_N) : null;

/**
 * TOP_N mode — the survivor-pool proxy. Draws the whole sample at random from the top TOP_N
 * of the universe by 24h notional. Everything lands in one reported group (stratum 0) because
 * there is only one population here; the per-symbol table still shows the spread.
 */
function topNSample(universe) {
  const pool = universe.slice(0, Math.min(TOP_N, universe.length));
  const take = Math.min(PER_STRATUM * STRATA, pool.length);
  const idx = new Set();
  while (idx.size < take) idx.add(Math.floor(Math.random() * pool.length));
  return [...idx].map(i => ({ symbol: pool[i].symbol, notional: pool[i].notional, stratum: 0 }));
}

function stratifiedSample(universe) {
  const size = Math.floor(universe.length / STRATA);
  const picked = [];
  for (let s = 0; s < STRATA; s++) {
    const lo = s * size;
    const hi = (s === STRATA - 1) ? universe.length : (s + 1) * size;
    const pool = universe.slice(lo, hi);
    const take = Math.min(PER_STRATUM, pool.length);
    const idx = new Set();
    while (idx.size < take) idx.add(Math.floor(Math.random() * pool.length));
    for (const i of idx) picked.push({ symbol: pool[i].symbol, notional: pool[i].notional, stratum: s });
  }
  return picked;
}

const universe = await buildUniverse();
console.log('universe_reproduced_size=' + universe.length + '  floor_usd=' + FLOOR_USD + '  quotes=' + [...QUOTES].join(','));
console.log('  (cross-check against the LIVE archiver shard totals before believing any rate below)');
console.log('SAMPLE_MODE=' + (TOP_N ? ('TOP_N=' + TOP_N + ' — survivor-pool proxy, NOT a universe estimate')
                                    : 'STRATIFIED — universe estimate, UNDER-COVERS the liquid tail'));
if (universe.length) {
  console.log('universe_notional_usd_24h: max=' + Math.round(universe[0].notional).toLocaleString()
    + ' min=' + Math.round(universe[universe.length - 1].notional).toLocaleString());
}

const sample = TOP_N ? topNSample(universe) : stratifiedSample(universe);
const stat = {};
for (const s of sample) {
  stat[s.symbol] = { stratum: s.stratum, notional: s.notional, ticker: { n: 0, b: 0 }, book: { n: 0, b: 0 }, ackTicker: false, ackBook: false };
}
const SYMS = sample.map(s => s.symbol);

const STRATUM_LABEL = ['most traded third', 'middle third', 'least traded third'];
for (let s = 0; s < STRATA; s++) {
  const m = sample.filter(x => x.stratum === s);
  if (!m.length) continue;   // TOP_N mode fills stratum 0 only
  const lo = Math.round(Math.min(...m.map(x => x.notional)));
  const hi = Math.round(Math.max(...m.map(x => x.notional)));
  console.log('stratum ' + s + ' (' + STRATUM_LABEL[s] + '): n=' + m.length
    + ' notional_usd_24h range ' + lo.toLocaleString() + ' .. ' + hi.toLocaleString());
}

const ws = new WebSocket('wss://ws.kraken.com/v2');
let started = 0;

ws.on('open', () => {
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: SYMS } }));
  ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'book', symbol: SYMS, depth: DEPTH } }));
  started = Date.now();
  console.log('subscribed ticker + book(depth=' + DEPTH + ') for ' + SYMS.length + ' symbols; counting ' + SECONDS + 's');
});

ws.on('message', raw => {
  const bytes = raw.length;
  let m; try { m = JSON.parse(raw); } catch { return; }
  if (!m) return;

  // Subscribe ACKs. A symbol Kraken never acknowledged must not sit in the denominator
  // reading as "quiet" — that is the difference between a measured zero and an absent leg.
  if (m.method === 'subscribe' && m.result && m.result.symbol) {
    const e = stat[m.result.symbol];
    if (e) {
      if (m.result.channel === 'ticker') e.ackTicker = !!m.success;
      if (m.result.channel === 'book') e.ackBook = !!m.success;
    }
    if (!m.success) console.warn('  subscribe REFUSED ' + m.result.channel + ' ' + m.result.symbol + ': ' + (m.error ?? ''));
    return;
  }

  if (!Array.isArray(m.data)) return;
  const ch = m.channel;
  if (ch !== 'ticker' && ch !== 'book') return;
  for (const d of m.data) {
    const e = stat[d.symbol];
    if (!e) continue;
    e[ch].n += 1;
    e[ch].b += Math.round(bytes / m.data.length);
  }
});

setTimeout(() => {
  const mins = (Date.now() - started) / 60000;
  console.log('\nelapsed_min=' + mins.toFixed(3));

  const live = SYMS.filter(s => stat[s].ackTicker && stat[s].ackBook);
  const dropped = SYMS.filter(s => !(stat[s].ackTicker && stat[s].ackBook));
  console.log('symbols_acked_on_BOTH_channels=' + live.length + ' of ' + SYMS.length
    + (dropped.length ? '  EXCLUDED_from_means=' + dropped.join(',') : '  (none excluded)'));

  const row = (label, syms) => {
    if (!syms.length) { console.log('[' + label + '] n=0'); return; }
    const tk = syms.reduce((a, s) => a + stat[s].ticker.n, 0);
    const bk = syms.reduce((a, s) => a + stat[s].book.n, 0);
    const tb = syms.reduce((a, s) => a + stat[s].ticker.b, 0);
    const bb = syms.reduce((a, s) => a + stat[s].book.b, 0);
    const per = syms.map(s => stat[s].book.n / mins).sort((a, b) => a - b);
    const med = per[Math.floor(per.length / 2)];
    console.log('[' + label + '] n=' + syms.length
      + ' ticker_frames_per_sym_min=' + (tk / syms.length / mins).toFixed(1)
      + ' book_frames_per_sym_min=' + (bk / syms.length / mins).toFixed(1)
      + ' book_MEDIAN_per_sym_min=' + med.toFixed(1)
      + ' book_MIN=' + per[0].toFixed(1)
      + ' book_MAX=' + per[per.length - 1].toFixed(1)
      + ' ratio_book_over_ticker=' + (tk ? (bk / tk).toFixed(1) : 'n/a')
      + ' ticker_bytes_per_sym_min=' + Math.round(tb / syms.length / mins)
      + ' book_bytes_per_sym_min=' + Math.round(bb / syms.length / mins));
  };

  for (let s = 0; s < STRATA; s++) row('stratum' + s, live.filter(x => stat[x].stratum === s));
  row('ALL_STRATA_POOLED', live);

  console.log('\nper-symbol (frames over the whole window):');
  for (const s of SYMS) {
    console.log('  ' + s.padEnd(14) + ' stratum=' + stat[s].stratum
      + ' ticker=' + stat[s].ticker.n + ' book=' + stat[s].book.n
      + ' ack=' + stat[s].ackTicker + '/' + stat[s].ackBook);
  }

  ws.close(); process.exit(0);
}, SECONDS * 1000 + 1500);
