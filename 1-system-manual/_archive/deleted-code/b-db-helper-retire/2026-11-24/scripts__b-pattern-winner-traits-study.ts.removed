#!/usr/bin/env tsx
/**
 * PATTERN-WINNER-TRAITS — conditional-edge hunt: what do WINNING pattern firings share? (READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * Context (Kyle 2026-06-04): the 6 patterns show ~0.50 directional skill ON AVERAGE
 * at 15-min (both classes, every tolerance) — but an average coin-flip can hide a
 * profitable SUBSET whose winners share an identifiable condition. If we can find
 * that condition, signals can be gated/approved on it even at low frequency.
 *
 * Method: replay 1-min archive → 15-min bars (same engine as b-pattern-evidence-15m).
 * For EVERY detection of each production pattern, tag it with the MARKET CONTEXT it
 * fired in + the pattern's own traits, and the SIGNED forward outcome (raw + de-meaned
 * excess over the clock-anchored 2h horizon, signed by the pattern's BUY/SELL call so
 * >0 = the call was right). Then:
 *   (A) per-trait conditional edge (pooled + per-pattern): N, hit-rate, mean signed
 *       EXCESS (skill) and mean signed RAW (tradeable move, vs friction).
 *   (B) regime-quadrant (volatility × trend-strength terciles) — the "by regime" cut.
 *   (C) winner-vs-loser PROFILE — top vs bottom signed-excess quintiles, contrast their
 *       average context to see what separates winners.
 *   (D) BEST-GATE HUNT — rank single + 2-way AND conditions by mean signed edge with a
 *       sample floor; flag which clear round-trip friction (~50 bps xstock / ~32 maker).
 *
 * Context features per detection (all computable from OHLC, no DBS pipeline needed):
 *   vol      = ATR% (14→56-bar ATR / close)                — calm vs volatile axis
 *   trendDir = sign(EMA48 − EMA104)                         — directional-bias proxy dir
 *   trendStr = |EMA48 − EMA104| / ATR                       — ranging vs trending axis
 *   dbsAlign = pattern dir agrees with trendDir             — continuation vs reversal (DBS proxy)
 *   align80  = pattern dir agrees with sign(close − SMA80)  — continuation vs reversal (price-trend)
 *   momAlign = pattern dir agrees with sign(8-bar return)   — momentum agreement
 *   strength = production detector strength (0..1)
 *   geom     = pattern-specific geometry stat (wick-ratio / engulf-ratio / compression / gain / recovery / retrace)
 *   hour     = UTC hour of the bar (session-phase proxy)
 *
 * DISPOSITION: offline diagnostic, READ-ONLY. Run on staging:
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && set -a && source .env && set +a && \
 *     STUDY_TABLE=xstock_spot_ohlc_1m STUDY_LABEL=xstock WINDOW_DAYS=10 \
 *     npx tsx scripts/b-pattern-winner-traits-study.ts'"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
const { Client } = pg;

const WINDOW_DAYS = Number(process.env.WINDOW_DAYS ?? 10);
const STUDY_TABLE = process.env.STUDY_TABLE ?? 'xstock_spot_ohlc_1m';
const STUDY_LABEL = process.env.STUDY_LABEL ?? 'xstock';
const F = 15;                          // live bar size
const FWD_HORIZON_MIN = 120;           // clock-anchored 2h
const MIN = 60_000;
const FRICTION_BPS = Number(process.env.FRICTION_BPS ?? 50); // xstock round-trip cap ~50bps
const GATE_MIN_N = Number(process.env.GATE_MIN_N ?? 200);

type Bar = [number, number, number, number];
const bars1m = new Map<string, Map<number, Bar>>();
function bar1mAt(symbol: string, minuteMs: number): Bar | undefined { return bars1m.get(symbol)?.get(minuteMs); }
interface FBar { ts: number; o: number; h: number; l: number; c: number; }

function buildFBars(symbol: string, freq: number): FBar[] {
  const m = bars1m.get(symbol); if (!m) return [];
  const bucketMs = freq * MIN;
  const byBucket = new Map<number, number[]>();
  for (const minMs of m.keys()) { const b = Math.floor(minMs / bucketMs) * bucketMs; let e = byBucket.get(b); if (!e) { e = []; byBucket.set(b, e); } e.push(minMs); }
  const out: FBar[] = [];
  for (const [b, mins] of byBucket) {
    mins.sort((x, y) => x - y);
    let o = NaN, h = -Infinity, l = Infinity, c = NaN;
    for (const mn of mins) { const bar = m.get(mn)!; if (Number.isNaN(o)) o = bar[0]; if (bar[1] > h) h = bar[1]; if (bar[2] < l) l = bar[2]; c = bar[3]; }
    if (Number.isFinite(o) && Number.isFinite(c)) out.push({ ts: b, o, h, l, c });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}
function fwdReturn(symbol: string, decisionMinMs: number, horizonMin: number): number | null {
  const entry = bar1mAt(symbol, decisionMinMs + MIN);
  const exit = bar1mAt(symbol, decisionMinMs + MIN + horizonMin * MIN);
  if (!entry || !exit || entry[0] <= 0) return null;
  return (exit[3] - entry[0]) / entry[0];
}
const uCache = new Map<string, number | null>();
let allSymbols: string[] = [];
function universeBaseRate(decisionMinMs: number, horizonMin: number): number | null {
  const key = `${decisionMinMs}:${horizonMin}`;
  const cv = uCache.get(key); if (cv !== undefined) return cv;
  let sum = 0, n = 0;
  for (const s of allSymbols) { const r = fwdReturn(s, decisionMinMs, horizonMin); if (r !== null && Number.isFinite(r)) { sum += r; n++; } }
  const base = n >= 5 ? sum / n : null; uCache.set(key, base); return base;
}

// ── helpers ──────────────────────────────────────────────────────────────────
const isBull = (b: FBar) => b.c > b.o;
const isBear = (b: FBar) => b.c < b.o;
const bodyS = (b: FBar) => Math.abs(b.c - b.o);
const rangeS = (b: FBar) => b.h - b.l;
const upW = (b: FBar) => b.h - Math.max(b.o, b.c);
const lowW = (b: FBar) => Math.min(b.o, b.c) - b.l;
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
const stdev = (a: number[]) => { if (a.length < 2) return NaN; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / (a.length - 1)); };

type Dir = 'BUY' | 'SELL';
interface Det { dir: Dir | null; strength: number; geom: number; }
const NONE: Det = { dir: null, strength: 0, geom: 0 };

function detPinbar(a: FBar[], i: number): Det {
  if (i < 1) return NONE; const cur = a[i]; const body = bodyS(cur), range = rangeS(cur); if (body === 0 || range === 0) return NONE;
  const uw = upW(cur), lw = lowW(cur);
  if (lw > 1.5 * body && lw > uw * 2) return { dir: 'BUY', strength: Math.min(1, 0.6 + Math.min(1, (lw / body) / 4) * 0.4), geom: lw / body };
  if (uw > 1.5 * body && uw > lw * 2) return { dir: 'SELL', strength: Math.min(1, 0.6 + Math.min(1, (uw / body) / 4) * 0.4), geom: uw / body };
  return NONE;
}
function detEngulfing(a: FBar[], i: number): Det {
  if (i < 1) return NONE; const cur = a[i], prev = a[i - 1]; const cb = bodyS(cur), pb = bodyS(prev); if (pb === 0) return NONE;
  if (isBear(prev) && isBull(cur) && cur.o <= prev.c && cur.c >= prev.o && cb > pb) { const r = cb / pb; return { dir: 'BUY', strength: Math.min(1, 0.65 + Math.min(0.2, (r - 1) * 0.1)), geom: r }; }
  if (isBull(prev) && isBear(cur) && cur.o >= prev.c && cur.c <= prev.o && cb > pb) { const r = cb / pb; return { dir: 'SELL', strength: Math.min(1, 0.65 + Math.min(0.2, (r - 1) * 0.1)), geom: r }; }
  return NONE;
}
function detInsideBar(a: FBar[], i: number): Det {
  if (i < 1) return NONE; const cur = a[i], prev = a[i - 1];
  if (cur.h < prev.h * 1.001 && cur.l > prev.l * 0.999) { const pr = rangeS(prev); const comp = pr > 0 ? rangeS(cur) / pr : 0; return { dir: isBull(prev) ? 'BUY' : 'SELL', strength: Math.min(1, 0.6 + (1 - comp) * 0.3), geom: comp }; }
  return NONE;
}
function detThreeSoldiers(a: FBar[], i: number): Det {
  if (i < 2) return NONE; const c1 = a[i - 2], c2 = a[i - 1], c3 = a[i];
  if (!isBull(c1) || !isBull(c2) || !isBull(c3)) return NONE; if (c2.c <= c1.c || c3.c <= c2.c) return NONE;
  const t1 = bodyS(c1) * 0.0025, t2 = bodyS(c2) * 0.0025;
  if (c2.o >= c1.o - t1 && c2.o <= c1.c + t1 && c3.o >= c2.o - t2 && c3.o <= c2.c + t2) { const g = (c3.c - c1.o) / c1.o; return { dir: 'BUY', strength: Math.min(1, 0.75 + g * 2), geom: g }; }
  return NONE;
}
function detMorningStar(a: FBar[], i: number): Det {
  if (i < 2) return NONE; const c1 = a[i - 2], c2 = a[i - 1], c3 = a[i];
  if (!isBear(c1)) return NONE; const c1b = bodyS(c1), c1r = rangeS(c1); if (c1r === 0 || c1b / c1r < 0.3) return NONE;
  const c2b = bodyS(c2), c2r = rangeS(c2); if (c2r > 0 && c2b / c2r > 0.3) return NONE;
  if (!isBull(c3)) return NONE; const mid = (c1.o + c1.c) / 2; if (c3.c <= mid) return NONE;
  const rec = c1b > 0 ? bodyS(c3) / c1b : 0; return { dir: 'BUY', strength: Math.min(1, 0.7 + Math.min(0.2, rec * 0.1) + (c2.h < c1.c ? 0.1 : 0)), geom: rec };
}
function detABCD(a: FBar[], i: number): Det {
  if (i < 11) return NONE; const start = Math.max(0, i - 49); const window = a.slice(start, i + 1); if (window.length < 12) return NONE;
  const sl: { index: number; price: number }[] = [], sh: { index: number; price: number }[] = [];
  for (let k = 2; k < window.length - 2; k++) { const p2 = window[k - 2], p1 = window[k - 1], cu = window[k], n1 = window[k + 1], n2 = window[k + 2]; if (cu.l < p1.l && cu.l < p2.l && cu.l < n1.l && cu.l < n2.l) sl.push({ index: k, price: cu.l }); if (cu.h > p1.h && cu.h > p2.h && cu.h > n1.h && cu.h > n2.h) sh.push({ index: k, price: cu.h }); }
  if (sl.length < 2 || sh.length < 1) return NONE;
  for (let ci = sl.length - 1; ci >= 1; ci--) {
    const c = sl[ci]; const bc = sh.filter(h => h.index < c.index && h.index > c.index - 20); if (!bc.length) continue; const b = bc[bc.length - 1];
    const ac = sl.filter(l => l.index < b.index && l.index > b.index - 25 && l.price < c.price); if (!ac.length) continue; const ap = ac[ac.length - 1];
    if (b.price <= ap.price) continue; if (c.price <= ap.price || c.price >= b.price) continue;
    const retr = (b.price - c.price) / (b.price - ap.price); if (retr < 0.35 || retr > 0.82) continue;
    const cHigh = window[c.index].h; let d = false; for (let k = c.index + 1; k < window.length; k++) if (window[k].h > cHigh) { d = true; break; } if (!d) continue;
    const rq = 1 - Math.abs(retr - 0.618) / 0.236; return { dir: 'BUY', strength: Math.min(1, 0.6 + Math.max(0, rq) * 0.35), geom: retr };
  }
  return NONE;
}
const PATTERNS: { key: string; minIdx: number; fn: (a: FBar[], i: number) => Det }[] = [
  { key: 'PINBAR', minIdx: 1, fn: detPinbar }, { key: 'ENGULFING', minIdx: 1, fn: detEngulfing },
  { key: 'INSIDE_BAR', minIdx: 1, fn: detInsideBar }, { key: 'THREE_SOLDIERS', minIdx: 2, fn: detThreeSoldiers },
  { key: 'MORNING_STAR', minIdx: 2, fn: detMorningStar }, { key: 'ABCD', minIdx: 11, fn: detABCD },
];

// detection record with context
interface Rec { pat: string; dir: Dir; sEx: number; sRaw: number; vol: number; trendStr: number; dbsAlign: boolean; align80: boolean; momAlign: boolean; strength: number; geom: number; hour: number; }

// ── EMA / SMA / ATR precompute per symbol (aligned to fb index) ──────────────
function emaSeries(fb: FBar[], period: number): number[] {
  const k = 2 / (period + 1); const out = new Array(fb.length); let e = fb[0]?.c ?? NaN;
  for (let i = 0; i < fb.length; i++) { e = i === 0 ? fb[0].c : fb[i].c * k + e * (1 - k); out[i] = e; } return out;
}
function smaSeries(fb: FBar[], period: number): number[] {
  const out = new Array(fb.length).fill(NaN); let s = 0;
  for (let i = 0; i < fb.length; i++) { s += fb[i].c; if (i >= period) s -= fb[i - period].c; if (i >= period - 1) out[i] = s / period; } return out;
}
function atrSeries(fb: FBar[], period: number): number[] {
  const out = new Array(fb.length).fill(NaN); let tr = 0;
  for (let i = 1; i < fb.length; i++) { const t = Math.max(fb[i].h - fb[i].l, Math.abs(fb[i].h - fb[i - 1].c), Math.abs(fb[i].l - fb[i - 1].c)); tr += t; if (i > period) { const j = i - period; tr -= Math.max(fb[j].h - fb[j].l, Math.abs(fb[j].h - fb[j - 1].c), Math.abs(fb[j].l - fb[j - 1].c)); } if (i >= period) out[i] = tr / period; } return out;
}

// ── tercile + bucket reporting ───────────────────────────────────────────────
function terciles(vals: number[]): [number, number] { const s = vals.slice().sort((a, b) => a - b); const n = s.length; return [s[Math.floor(n / 3)], s[Math.floor(2 * n / 3)]]; }
function bucketStat(recs: Rec[]): string {
  const n = recs.length; if (!n) return 'N=0';
  const sEx = recs.map(r => r.sEx), sRaw = recs.map(r => r.sRaw);
  const hit = 100 * recs.filter(r => r.sEx > 0).length / n;
  const mEx = mean(sEx) * 1e4, mRaw = mean(sRaw) * 1e4;
  const se = (stdev(sEx) * 1e4) / Math.sqrt(n);           // SE of mean excess (bps)
  const t = mEx / (se || NaN);                             // t-stat vs 0
  const net = mRaw - FRICTION_BPS;
  return `N=${String(n).padStart(6)} hit=${hit.toFixed(1)}% exEdge=${mEx.toFixed(1).padStart(6)}bp (t=${t.toFixed(1)}) rawEdge=${mRaw.toFixed(1).padStart(6)}bp net=${net.toFixed(1).padStart(6)}bp`;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const maxRes = await client.query<{ max: string }>(`SELECT max(interval_begin) AS max FROM ${STUDY_TABLE}`);
  const maxMs = new Date(maxRes.rows[0].max).getTime();
  const startMs = maxMs - WINDOW_DAYS * 86_400_000;
  console.log(`\n===== PATTERN-WINNER-TRAITS  [${STUDY_LABEL}]  F=${F}m  window ${WINDOW_DAYS}d  fwd=${FWD_HORIZON_MIN}m  friction=${FRICTION_BPS}bp =====`);
  console.log('[PWT] loading 1m bars…');
  const r = await client.query<{ symbol: string; interval_begin: string; open: string; high: string; low: string; close: string }>(
    `SELECT symbol, interval_begin, open, high, low, close FROM ${STUDY_TABLE} WHERE interval_begin >= $1 AND interval_begin <= $2`,
    [new Date(startMs).toISOString(), new Date(maxMs).toISOString()]);
  for (const row of r.rows) { const mm = Math.floor(new Date(row.interval_begin).getTime() / MIN) * MIN; let bm = bars1m.get(row.symbol); if (!bm) { bm = new Map(); bars1m.set(row.symbol, bm); } bm.set(mm, [Number(row.open), Number(row.high), Number(row.low), Number(row.close)]); }
  allSymbols = [...bars1m.keys()];
  console.log(`[PWT] ${r.rows.length.toLocaleString()} 1m bars, ${allSymbols.length} symbols\n`);

  // ── collect detection records ───────────────────────────────────────────────
  const recs: Rec[] = [];
  for (const s of allSymbols) {
    const fb = buildFBars(s, F); if (fb.length < 110) continue;
    const ema48 = emaSeries(fb, 48), ema104 = emaSeries(fb, 104), sma80 = smaSeries(fb, 80), atr = atrSeries(fb, 56);
    for (let i = 11; i < fb.length; i++) {
      const atrv = atr[i]; if (!(atrv > 0)) continue;
      const closeMin = fb[i].ts + F * MIN;
      const raw = fwdReturn(s, closeMin, FWD_HORIZON_MIN); if (raw === null) continue;
      const base = universeBaseRate(closeMin, FWD_HORIZON_MIN); if (base === null) continue;
      const ex = raw - base;
      const vol = atrv / fb[i].c;
      const trendDir = Math.sign(ema48[i] - ema104[i]);
      const trendStr = Math.abs(ema48[i] - ema104[i]) / atrv;
      const priceTrend = Number.isNaN(sma80[i]) ? 0 : Math.sign(fb[i].c - sma80[i]);
      const mom8 = i >= 8 ? (fb[i].c - fb[i - 8].c) / fb[i - 8].c : 0;
      const hour = new Date(fb[i].ts).getUTCHours();
      for (const p of PATTERNS) {
        if (i < p.minIdx) continue;
        const d = p.fn(fb, i); if (!d.dir) continue;
        const s1 = d.dir === 'BUY' ? 1 : -1;
        recs.push({
          pat: p.key, dir: d.dir, sEx: ex * s1, sRaw: raw * s1, vol, trendStr,
          dbsAlign: Math.sign(s1) === trendDir, align80: Math.sign(s1) === priceTrend,
          momAlign: Math.sign(s1) === Math.sign(mom8), strength: d.strength, geom: d.geom, hour,
        });
      }
    }
  }
  console.log(`[PWT] ${recs.length.toLocaleString()} detections tagged with context.\n`);

  // global tercile boundaries
  const [volLo, volHi] = terciles(recs.map(r => r.vol));
  const [tsLo, tsHi] = terciles(recs.map(r => r.trendStr));
  const [stLo, stHi] = terciles(recs.map(r => r.strength));
  console.log(`[PWT] tercile cuts — vol:[${volLo.toExponential(2)},${volHi.toExponential(2)}] trendStr:[${tsLo.toFixed(2)},${tsHi.toFixed(2)}] strength:[${stLo.toFixed(2)},${stHi.toFixed(2)}]`);
  console.log(`Read all rows: exEdge=mean signed de-meaned excess (skill, bps); t=t-stat vs 0 (|t|>2 = real); rawEdge=mean signed raw move (bps); net=rawEdge−friction (tradeable if >0).\n`);

  const byPat = (k: string) => recs.filter(r => r.pat === k);

  // ── (A) per-trait conditional edge, POOLED ─────────────────────────────────
  console.log('══ (A) POOLED conditional edge by trait (all patterns) ══');
  console.log(`  ALL                        ${bucketStat(recs)}`);
  console.log(`  dbsAlign=continuation      ${bucketStat(recs.filter(r => r.dbsAlign))}`);
  console.log(`  dbsAlign=reversal          ${bucketStat(recs.filter(r => !r.dbsAlign))}`);
  console.log(`  priceTrend=continuation    ${bucketStat(recs.filter(r => r.align80))}`);
  console.log(`  priceTrend=reversal        ${bucketStat(recs.filter(r => !r.align80))}`);
  console.log(`  momentum=agree             ${bucketStat(recs.filter(r => r.momAlign))}`);
  console.log(`  momentum=disagree          ${bucketStat(recs.filter(r => !r.momAlign))}`);
  console.log(`  vol=low                    ${bucketStat(recs.filter(r => r.vol <= volLo))}`);
  console.log(`  vol=mid                    ${bucketStat(recs.filter(r => r.vol > volLo && r.vol <= volHi))}`);
  console.log(`  vol=high                   ${bucketStat(recs.filter(r => r.vol > volHi))}`);
  console.log(`  trendStr=ranging(low)      ${bucketStat(recs.filter(r => r.trendStr <= tsLo))}`);
  console.log(`  trendStr=mid               ${bucketStat(recs.filter(r => r.trendStr > tsLo && r.trendStr <= tsHi))}`);
  console.log(`  trendStr=trending(high)    ${bucketStat(recs.filter(r => r.trendStr > tsHi))}`);
  console.log(`  strength=high(top tercile) ${bucketStat(recs.filter(r => r.strength > stHi))}`);
  console.log(`  strength=low(bot tercile)  ${bucketStat(recs.filter(r => r.strength <= stLo))}`);

  // ── (B) regime-quadrant: vol × trendStr ────────────────────────────────────
  console.log('\n══ (B) "by regime" — volatility × trend-strength quadrant (pooled) ══');
  for (const [vlab, vf] of [['calm', (r: Rec) => r.vol <= volLo], ['volatile', (r: Rec) => r.vol > volHi]] as const)
    for (const [tlab, tf] of [['ranging', (r: Rec) => r.trendStr <= tsLo], ['trending', (r: Rec) => r.trendStr > tsHi]] as const)
      console.log(`  ${(vlab + '/' + tlab).padEnd(20)} ${bucketStat(recs.filter(r => vf(r) && tf(r)))}`);

  // ── per-pattern × best trait (dbsAlign) ────────────────────────────────────
  console.log('\n══ per-pattern × directional-bias alignment (continuation vs reversal) ══');
  for (const p of PATTERNS) {
    const rp = byPat(p.key);
    console.log(`  ${p.key.padEnd(15)} continuation ${bucketStat(rp.filter(r => r.dbsAlign))}`);
    console.log(`  ${''.padEnd(15)} reversal     ${bucketStat(rp.filter(r => !r.dbsAlign))}`);
  }

  // ── (C) winner-vs-loser profile ────────────────────────────────────────────
  console.log('\n══ (C) winner-vs-loser profile (top vs bottom signed-excess quintile, pooled) ══');
  const sorted = recs.slice().sort((a, b) => a.sEx - b.sEx); const q = Math.floor(sorted.length / 5);
  const losers = sorted.slice(0, q), winners = sorted.slice(sorted.length - q);
  const prof = (rs: Rec[]) => `dbsAlign=${(100 * rs.filter(r => r.dbsAlign).length / rs.length).toFixed(0)}% priceCont=${(100 * rs.filter(r => r.align80).length / rs.length).toFixed(0)}% momAgree=${(100 * rs.filter(r => r.momAlign).length / rs.length).toFixed(0)}% vol=${(mean(rs.map(r => r.vol)) * 100).toFixed(3)}% trendStr=${mean(rs.map(r => r.trendStr)).toFixed(2)} strength=${mean(rs.map(r => r.strength)).toFixed(3)} buy%=${(100 * rs.filter(r => r.dir === 'BUY').length / rs.length).toFixed(0)}`;
  console.log(`  WINNERS (top 20%): ${prof(winners)}`);
  console.log(`  LOSERS  (bot 20%): ${prof(losers)}`);

  // ── (D) best-gate hunt ─────────────────────────────────────────────────────
  console.log(`\n══ (D) BEST-GATE HUNT — single + 2-way conditions, ranked by exEdge, N>=${GATE_MIN_N} ══`);
  const conds: { name: string; f: (r: Rec) => boolean }[] = [
    { name: 'dbsAlign', f: r => r.dbsAlign }, { name: 'reversal', f: r => !r.dbsAlign },
    { name: 'priceCont', f: r => r.align80 }, { name: 'priceRev', f: r => !r.align80 },
    { name: 'momAgree', f: r => r.momAlign }, { name: 'volLow', f: r => r.vol <= volLo }, { name: 'volHigh', f: r => r.vol > volHi },
    { name: 'ranging', f: r => r.trendStr <= tsLo }, { name: 'trending', f: r => r.trendStr > tsHi },
    { name: 'strHigh', f: r => r.strength > stHi },
  ];
  const patConds = PATTERNS.map(p => ({ name: p.key, f: (r: Rec) => r.pat === p.key }));
  const gates: { name: string; recs: Rec[] }[] = [];
  for (const c of conds) gates.push({ name: c.name, recs: recs.filter(c.f) });
  for (let i = 0; i < conds.length; i++) for (let j = i + 1; j < conds.length; j++) gates.push({ name: `${conds[i].name}+${conds[j].name}`, recs: recs.filter(r => conds[i].f(r) && conds[j].f(r)) });
  for (const pc of patConds) for (const c of conds) gates.push({ name: `${pc.name}+${c.name}`, recs: recs.filter(r => pc.f(r) && c.f(r)) });
  const ranked = gates.filter(g => g.recs.length >= GATE_MIN_N).map(g => { const ex = g.recs.map(r => r.sEx); const m = mean(ex) * 1e4; const se = stdev(ex) * 1e4 / Math.sqrt(g.recs.length); return { name: g.name, n: g.recs.length, exEdge: m, t: m / (se || NaN), rawEdge: mean(g.recs.map(r => r.sRaw)) * 1e4, hit: 100 * g.recs.filter(r => r.sEx > 0).length / g.recs.length }; }).sort((a, b) => b.exEdge - a.exEdge);
  console.log('  TOP 15 by skill edge:');
  for (const g of ranked.slice(0, 15)) console.log(`    ${g.name.padEnd(26)} N=${String(g.n).padStart(6)} hit=${g.hit.toFixed(1)}% exEdge=${g.exEdge.toFixed(1).padStart(6)}bp (t=${g.t.toFixed(1)}) rawEdge=${g.rawEdge.toFixed(1).padStart(6)}bp net=${(g.rawEdge - FRICTION_BPS).toFixed(1).padStart(6)}bp`);
  console.log('  BOTTOM 5 (worst, for contrast):');
  for (const g of ranked.slice(-5)) console.log(`    ${g.name.padEnd(26)} N=${String(g.n).padStart(6)} hit=${g.hit.toFixed(1)}% exEdge=${g.exEdge.toFixed(1).padStart(6)}bp (t=${g.t.toFixed(1)})`);

  await client.end();
  console.log(`\n[PWT] complete [${STUDY_LABEL}]. A tradeable gate needs: |t|>~2 (edge real, not noise) AND net>0 (raw move beats friction) AND N large enough to trust. exEdge is skill vs the universe; rawEdge−friction is what actually lands in the book.`);
}
main().catch((err) => { console.error('[PWT] Fatal:', err); process.exit(1); });
