#!/usr/bin/env tsx
/**
 * B.4-bar-frequency — xStock bar-frequency study (W1, READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * Question (Kyle 2026-06-03): xStocks are evaluated on 60-min bars; a few-hours
 * hold spans only 2–4 of them. Does a finer bar size (5/15/30 min) fit the intended
 * few-hours-hold style better — more setups, better-predicting setups — without
 * making the market read too jumpy? Decide a SINGLE shared bar size for the
 * strategy-fit effort (Langston: measure all, default to one).
 *
 * For each candidate frequency F ∈ {5,15,30,60} min, rebuild bars from
 * `xstock_spot_ohlc_1m` (the 1-min archive) and measure:
 *   (1) PATTERN AVAILABILITY — MORNING_STAR + INSIDE_BAR base rates (production
 *       recognizer replicas) on F-min bars. Finer F should surface more shapes.
 *   (2) FORWARD-RETURN EDGE — does a pattern at frequency F predict subsequent
 *       EXCESS return (de-meaned vs the cross-sectional universe) over a
 *       CLOCK-ANCHORED horizon (2h; Langston: hold anchored to clock, not bar
 *       count)? AUC(pattern-present > pattern-absent). Higher/consistent AUC ⇒
 *       that F surfaces setups that actually carry edge.
 *   (3) REGIME-READ STABILITY — a lightweight directional-bias proxy classified
 *       3-way; flip-rate between consecutive F-bars. Finer F is expected to flip
 *       more (Langston gap-2: jumpier regime read changes which strategies fire).
 *   (4) STRUCTURE — bars per 2h hold (= 120/F) and total F-bars produced.
 *
 * Entry/exit for the forward-return measurement use the 1-min bars (consistent
 * across all F); excess vs the universe base rate over the same [entry, entry+H]
 * window. Session-clipped (both 1m endpoints must exist).
 *
 * DISPOSITION: offline diagnostic, READ-ONLY. No deploy. Run on staging:
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     set -a && source .env && set +a && npx tsx scripts/b4-bar-frequency-study.ts'"
 * ─────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
const { Client } = pg;

const WINDOW_DAYS = 7;
const FREQS_MIN = [5, 15, 30, 60];
const FWD_HORIZON_MIN = 120; // clock-anchored 2h forward window for the edge test
const MIN = 60_000;
const MIN_BUCKET_N = 30;

// 1m bars: symbol → Map<minuteEpoch, [o,h,l,c]>
type Bar = [number, number, number, number];
const bars1m = new Map<string, Map<number, Bar>>();
function bar1mAt(symbol: string, minuteMs: number): Bar | undefined { return bars1m.get(symbol)?.get(minuteMs); }

interface FBar { ts: number; o: number; h: number; l: number; c: number; n: number; }

// Aggregate a symbol's 1m bars into F-min bars (o=first,h=max,l=min,c=last). Sorted by ts.
function buildFBars(symbol: string, F: number): FBar[] {
  const m = bars1m.get(symbol); if (!m) return [];
  const bucketMs = F * MIN;
  const byBucket = new Map<number, { mins: number[] }>();
  for (const minMs of m.keys()) {
    const b = Math.floor(minMs / bucketMs) * bucketMs;
    let e = byBucket.get(b); if (!e) { e = { mins: [] }; byBucket.set(b, e); }
    e.mins.push(minMs);
  }
  const out: FBar[] = [];
  for (const [b, e] of byBucket) {
    e.mins.sort((x, y) => x - y);
    let o = NaN, h = -Infinity, l = Infinity, c = NaN;
    for (const mn of e.mins) {
      const bar = m.get(mn)!;
      if (Number.isNaN(o)) o = bar[0];
      if (bar[1] > h) h = bar[1];
      if (bar[2] < l) l = bar[2];
      c = bar[3];
    }
    if (Number.isFinite(o) && Number.isFinite(c)) out.push({ ts: b, o, h, l, c, n: e.mins.length });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

// forward EXCESS return from a decision MINUTE (the F-bar close minute): entry=open(min+1), exit=close(min+1+H)
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

// ── pattern replicas (production pattern-recognizer.ts) on F-bars ────────────
function isMorningStar(c1: FBar, c2: FBar, c3: FBar): boolean {
  const c1Bear = c1.c < c1.o, c1Body = Math.abs(c1.c - c1.o), c1Range = c1.h - c1.l;
  if (!c1Bear || c1Range <= 0 || c1Body / c1Range < 0.3) return false;
  const c2Body = Math.abs(c2.c - c2.o), c2Range = c2.h - c2.l;
  if (c2Range > 0 && c2Body / c2Range > 0.3) return false;
  if (!(c3.c > c3.o)) return false;
  const c1Mid = (c1.o + c1.c) / 2;
  return c3.c > c1Mid;
}
function isInsideBar(prev: FBar, cur: FBar): boolean {
  const tol = 0.001;
  return cur.h < prev.h * (1 + tol) && cur.l > prev.l * (1 - tol);
}

// ── stats ────────────────────────────────────────────────────────────────────
function aucMW(passed: number[], rejected: number[]): number {
  const n1 = passed.length, n2 = rejected.length; if (!n1 || !n2) return NaN;
  const tagged = passed.map((v) => ({ v, g: 1 })).concat(rejected.map((v) => ({ v, g: 0 })));
  tagged.sort((a, b) => a.v - b.v);
  const ranks = new Array(tagged.length); let i = 0;
  while (i < tagged.length) { let j = i; while (j + 1 < tagged.length && tagged[j + 1].v === tagged[i].v) j++; const avg = (i + j) / 2 + 1; for (let k = i; k <= j; k++) ranks[k] = avg; i = j + 1; }
  let R1 = 0; for (let k = 0; k < tagged.length; k++) if (tagged[k].g === 1) R1 += ranks[k];
  return (R1 - (n1 * (n1 + 1)) / 2) / (n1 * n2);
}
const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);

// ATR% from F-bars ending at index i (14-period simple TR avg), as fraction of close.
function atrPctAt(arr: FBar[], i: number): number | null {
  if (i < 14) return null;
  let tr = 0;
  for (let k = i - 13; k <= i; k++) { const cur = arr[k], prev = arr[k - 1]; tr += Math.max(cur.h - cur.l, Math.abs(cur.h - prev.c), Math.abs(cur.l - prev.c)); }
  const atr = tr / 14; return arr[i].c > 0 ? atr / arr[i].c : null;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const maxRes = await client.query<{ max: string }>(`SELECT max(interval_begin) AS max FROM xstock_spot_ohlc_1m`);
  const maxMs = new Date(maxRes.rows[0].max).getTime();
  const startMs = maxMs - WINDOW_DAYS * 86_400_000;
  console.log(`[B4-FREQ] window ${new Date(startMs).toISOString()} → ${new Date(maxMs).toISOString()} (${WINDOW_DAYS}d)  fwd-horizon=${FWD_HORIZON_MIN}min`);

  console.log('[B4-FREQ] loading 1m bars…');
  const r = await client.query<{ symbol: string; interval_begin: string; open: string; high: string; low: string; close: string }>(
    `SELECT symbol, interval_begin, open, high, low, close FROM xstock_spot_ohlc_1m WHERE interval_begin >= $1 AND interval_begin <= $2`,
    [new Date(startMs).toISOString(), new Date(maxMs).toISOString()]);
  for (const row of r.rows) {
    const mm = Math.floor(new Date(row.interval_begin).getTime() / MIN) * MIN;
    let bm = bars1m.get(row.symbol); if (!bm) { bm = new Map(); bars1m.set(row.symbol, bm); }
    bm.set(mm, [Number(row.open), Number(row.high), Number(row.low), Number(row.close)]);
  }
  allSymbols = [...bars1m.keys()];
  console.log(`[B4-FREQ] ${r.rows.length.toLocaleString()} 1m bars, ${allSymbols.length} symbols\n`);

  console.log('F(min) | Fbars   | MS-rate | MS-AUC(2h) [nP/nR] | IB-rate | IB-AUC(2h) [nP/nR] | regime-flip% | bars/2h-hold');
  console.log('-------+---------+---------+--------------------+---------+--------------------+--------------+-------------');

  for (const F of FREQS_MIN) {
    let fbarCount = 0;
    let msTriples = 0, msShapes = 0, ibPairs = 0, ibShapes = 0;
    const msEx: number[] = [], msNoEx: number[] = [];   // MS present vs absent forward-excess
    const ibEx: number[] = [], ibNoEx: number[] = [];
    let regimeBars = 0, regimeFlips = 0;

    for (const s of allSymbols) {
      const fb = buildFBars(s, F);
      if (fb.length < 16) continue;
      fbarCount += fb.length;

      // regime proxy + flips: momentum-sign over last 3 F-bars, 3-class by ATR-scaled return
      let prevClass: number | null = null;
      for (let i = 3; i < fb.length; i++) {
        const atrp = atrPctAt(fb, i); if (atrp === null || atrp <= 0) continue;
        const ret3 = (fb[i].c - fb[i - 3].c) / fb[i - 3].c;
        const z = ret3 / (atrp * Math.sqrt(3));         // ATR-normalized 3-bar return
        const cls = z > 0.5 ? 1 : z < -0.5 ? -1 : 0;    // bullish / bearish / neutral
        regimeBars++;
        if (prevClass !== null && cls !== prevClass) regimeFlips++;
        prevClass = cls;
      }

      // pattern availability + forward edge (decision minute = F-bar close)
      for (let i = 1; i < fb.length; i++) {
        const closeMin = fb[i].ts + F * MIN; // the minute the F-bar closes
        // INSIDE_BAR on (i-1, i)
        ibPairs++;
        const ib = isInsideBar(fb[i - 1], fb[i]);
        if (ib) ibShapes++;
        const raw = fwdReturn(s, closeMin, FWD_HORIZON_MIN);
        const base = raw !== null ? universeBaseRate(closeMin, FWD_HORIZON_MIN) : null;
        const ex = raw !== null && base !== null ? raw - base : null;
        if (ex !== null) (ib ? ibEx : ibNoEx).push(ex);
        // MORNING_STAR on (i-2,i-1,i)
        if (i >= 2) {
          msTriples++;
          const ms = isMorningStar(fb[i - 2], fb[i - 1], fb[i]);
          if (ms) msShapes++;
          if (ex !== null) (ms ? msEx : msNoEx).push(ex);
        }
      }
    }

    const msRate = (100 * msShapes / Math.max(1, msTriples));
    const ibRate = (100 * ibShapes / Math.max(1, ibPairs));
    const msAuc = aucMW(msEx, msNoEx);
    const ibAuc = aucMW(ibEx, ibNoEx);
    const flipPct = (100 * regimeFlips / Math.max(1, regimeBars));
    const msAucStr = (msEx.length >= MIN_BUCKET_N && msNoEx.length >= MIN_BUCKET_N) ? msAuc.toFixed(3) : 'low-N';
    const ibAucStr = (ibEx.length >= MIN_BUCKET_N && ibNoEx.length >= MIN_BUCKET_N) ? ibAuc.toFixed(3) : 'low-N';

    console.log(
      `${String(F).padStart(6)} | ${String(fbarCount).padStart(7)} | ${msRate.toFixed(3).padStart(6)}% | ` +
      `${msAucStr.padStart(6)} [${msEx.length}/${msNoEx.length}]`.padEnd(20) + ` | ` +
      `${ibRate.toFixed(2).padStart(6)}% | ${ibAucStr.padStart(6)} [${ibEx.length}/${ibNoEx.length}]`.padEnd(20) + ` | ` +
      `${flipPct.toFixed(2).padStart(11)}% | ${(120 / F).toFixed(1).padStart(11)}`,
    );
    // extra detail line: mean excess present vs absent (sign tells direction of edge)
    console.log(
      `       | detail: MS excess present=${(mean(msEx) * 100).toFixed(3)}% absent=${(mean(msNoEx) * 100).toFixed(3)}%  |  ` +
      `IB excess present=${(mean(ibEx) * 100).toFixed(3)}% absent=${(mean(ibNoEx) * 100).toFixed(3)}%`,
    );
  }

  await client.end();
  console.log('\n[B4-FREQ] complete. Read: higher MS/IB rate = more setups at that bar size; AUC>0.55 = the pattern predicts forward excess return there; lower regime-flip% = steadier market read; bars/2h-hold ≥ ~8 gives the strategies room to time entries/exits. Pick the single F that maximizes setup availability + edge while keeping the regime read acceptably stable.');
}

main().catch((err) => { console.error('[B4-FREQ] Fatal:', err); process.exit(1); });
