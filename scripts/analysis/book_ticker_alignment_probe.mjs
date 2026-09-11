// book_ticker_alignment_probe.mjs — READ-ONLY measurement for B-PRICE-SIDE-BY-JOB r5, decision D3.
// Question (Langston's Step-1 r5 condition 1): what does the disagreement between the ORDER BOOK's top and
// the TICKER's top look like, on healthy feeds, when the two observations are ALIGNED in time?
// The D3 alert threshold is derived from this distribution (object + population), and it only ARMS AN ALERT.
//
// ⛔ r2 (2026-09-11): r1 of this probe DID NOT TRUNCATE THE BOOK TO THE SUBSCRIBED DEPTH. Kraken's book
// channel sends levels that fall out of the subscribed depth, and the client must drop them; r1 kept them,
// so stale "ghost" levels sat inside the maintained top — the same shape as #741. Its numbers (crypto p50
// 8.1 bps, 25.7% exact) are an INSTRUMENT DEFECT, not a feed property, and are not used. r2 truncates after
// every update, excludes crossed books (counted), and reports per-symbol medians plus a BTC/USD control.
//
// Public endpoints only — no credentials, no orders. Book checksums are still NOT verified (limit, stated).
// ALIGNED pair = a ticker update compared against its symbol's book whose last update arrived within ALIGN_MS.
// Usage: node scripts/analysis/book_ticker_alignment_probe.mjs <minutes> [alignMs=250]
import WebSocket from 'ws';

const MINUTES = Number(process.argv[2] || 5);
const ALIGN_MS = Number(process.argv[3] || 250);
const DEPTH = 10;
const CRYPTO = ['BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'ADA/USD', 'DOGE/USD', 'LINK/USD', 'AVAX/USD',
  'DOT/USD', 'LTC/USD', 'ATOM/USD', 'NEAR/USD', 'FIL/USD', 'ALGO/USD', 'KSM/USD', 'MINA/USD'];
const XSTOCK = ['AAPL/USD', 'MSFT/USD', 'NVDA/USD', 'TSLA/USD', 'GLD/USD', 'MDB/USD', 'NEM/USD', 'BABA/USD'];

function pct(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return Number(sorted[i].toFixed(3));
}

function truncate(side, keepHighest) {
  if (side.size <= DEPTH) return;
  const keys = [...side.keys()].sort((a, b) => (keepHighest ? b - a : a - b));
  for (const k of keys.slice(DEPTH)) side.delete(k);
}

function runClass(name, url, symbols, tickerParams) {
  return new Promise((resolve) => {
    const books = new Map();
    const diffs = [];
    const perSymbol = new Map(); // symbol -> { n, exact, diffs[] }
    let aligned = 0, unaligned = 0, noBook = 0, crossed = 0, exact = 0;
    const acks = [], errors = [];
    const ws = new WebSocket(url);
    const done = () => {
      try { ws.close(); } catch { /* closing */ }
      diffs.sort((a, b) => a - b);
      const sym = {};
      for (const [s, v] of perSymbol) {
        v.diffs.sort((a, b) => a - b);
        sym[s] = { pairs: v.n, exactShare: v.n ? Number((v.exact / v.n).toFixed(3)) : null, p50: pct(v.diffs, 0.5), p99: pct(v.diffs, 0.99) };
      }
      resolve({
        probe: 'r2', class: name, minutes: MINUTES, alignMs: ALIGN_MS, depth: DEPTH, symbols: symbols.length,
        alignedPairs: aligned, exactBothSides: exact, exactShare: aligned ? Number((exact / aligned).toFixed(3)) : null,
        excludedCrossedBook: crossed, unalignedTickerUpdates: unaligned, tickerUpdatesWithNoBookYet: noBook,
        sideDiffsBps: { n: diffs.length, p50: pct(diffs, 0.5), p90: pct(diffs, 0.9), p99: pct(diffs, 0.99), p999: pct(diffs, 0.999), max: diffs.length ? Number(diffs[diffs.length - 1].toFixed(3)) : null },
        perSymbol: sym, acks: acks.slice(0, 6), errors: errors.slice(0, 5),
        limits: 'book checksum not verified; one connection per class; receipt-time alignment only',
      });
    };
    setTimeout(done, MINUTES * 60 * 1000);
    ws.on('open', () => {
      ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'ticker', symbol: symbols, snapshot: true, ...tickerParams }, req_id: 1 }));
      ws.send(JSON.stringify({ method: 'subscribe', params: { channel: 'book', symbol: symbols, depth: DEPTH, snapshot: true }, req_id: 2 }));
    });
    ws.on('message', (buf) => {
      const now = Date.now();
      let m;
      try { m = JSON.parse(buf.toString()); } catch { return; }
      if (m.method === 'subscribe') { if (acks.length < 40) acks.push({ req_id: m.req_id, success: m.success, error: m.error || null }); return; }
      if (m.channel === 'book' && Array.isArray(m.data)) {
        for (const d of m.data) {
          let b = books.get(d.symbol);
          if (!b || m.type === 'snapshot') { b = { bids: new Map(), asks: new Map(), lastAt: now }; books.set(d.symbol, b); }
          for (const lvl of d.bids || []) { if (Number(lvl.qty) === 0) b.bids.delete(Number(lvl.price)); else b.bids.set(Number(lvl.price), Number(lvl.qty)); }
          for (const lvl of d.asks || []) { if (Number(lvl.qty) === 0) b.asks.delete(Number(lvl.price)); else b.asks.set(Number(lvl.price), Number(lvl.qty)); }
          truncate(b.bids, true);
          truncate(b.asks, false);
          b.lastAt = now;
        }
        return;
      }
      if (m.channel === 'ticker' && Array.isArray(m.data)) {
        for (const d of m.data) {
          const b = books.get(d.symbol);
          if (!b || !b.bids.size || !b.asks.size) { noBook++; continue; }
          if (Math.abs(now - b.lastAt) > ALIGN_MS) { unaligned++; continue; }
          const bookBid = Math.max(...b.bids.keys());
          const bookAsk = Math.min(...b.asks.keys());
          if (!(bookBid < bookAsk)) { crossed++; continue; }
          const mid = (bookBid + bookAsk) / 2;
          if (!(mid > 0) || d.bid == null || d.ask == null) continue;
          aligned++;
          const db = Math.abs(Number(d.bid) - bookBid) / mid * 1e4;
          const da = Math.abs(Number(d.ask) - bookAsk) / mid * 1e4;
          diffs.push(db, da);
          const ps = perSymbol.get(d.symbol) || { n: 0, exact: 0, diffs: [] };
          ps.n++; ps.diffs.push(db, da);
          if (db === 0 && da === 0) { exact++; ps.exact++; }
          perSymbol.set(d.symbol, ps);
        }
      }
    });
    ws.on('error', (e) => { errors.push(String(e && e.message ? e.message : e)); });
  });
}

const results = await Promise.all([
  runClass('crypto', 'wss://ws.kraken.com/v2', CRYPTO, { event_trigger: 'bbo' }),
  runClass('xstock', 'wss://ws-equities.kraken.com', XSTOCK, {}),
]);
for (const r of results) console.log(JSON.stringify(r));
