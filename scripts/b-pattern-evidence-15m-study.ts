#!/usr/bin/env tsx
/**
 * PATTERN-EVIDENCE-15m — does each candlestick pattern earn its place at 15-min? (READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────────
 * Question (Kyle 2026-06-04, post 60→15-min switch): the 6 production patterns
 * (PINBAR, ENGULFING, INSIDE_BAR, THREE_SOLDIERS, MORNING_STAR, ABCD) use shape
 * tolerances hand-tuned for crypto on 60-min bars. Now that xStock evaluates on
 * 15-min bars, measure — from evidence — for EACH pattern, per asset class:
 *   (1) FIRE RATE  — how often the shape appears (detections / evaluated bars).
 *   (2) DIRECTIONAL EDGE — when it fires with a BUY (bullish) call does forward
 *       EXCESS return (de-meaned vs the cross-sectional universe over a CLOCK-
 *       anchored 2h horizon) beat the no-fire baseline; for a SELL call does it
 *       under-perform. Reported as directional hit-rate, mean SIGNED excess (bps,
 *       positive = correct-direction edge), and a Mann-Whitney AUC (>0.55 = the
 *       pattern's directional call discriminates).
 *   (3) TOLERANCE SENSITIVITY — sweep each pattern's primary geometry tolerance to
 *       distinguish a genuinely-useless pattern from a merely-MIS-FIT one (does any
 *       reasonable setting surface edge at 15-min?).
 *
 * Detectors are FAITHFUL replicas of server/services/pattern-recognizer.ts
 * (PINBAR:114, ENGULFING:172, INSIDE_BAR:238, THREE_SOLDIERS:278, MORNING_STAR:321,
 * ABCD:377). Volume only affects strength/bonus in production, never the boolean
 * detection, so OHLC alone reproduces detection exactly.
 *
 * Forward-return uses 1-min bars (consistent across F); excess vs the universe base
 * rate over the same [entry, entry+H] window; session-clipped (both 1m endpoints
 * must exist). This mirrors b4-bar-frequency-study.ts.
 *
 * DISPOSITION: offline diagnostic, READ-ONLY. No deploy, no writes. Run on staging:
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     set -a && source .env && set +a && \
 *     STUDY_TABLE=xstock_spot_ohlc_1m STUDY_LABEL=xstock WINDOW_DAYS=14 \
 *     npx tsx scripts/b-pattern-evidence-15m-study.ts'"
 *   (crypto: STUDY_TABLE=<crypto 1m table> STUDY_LABEL=crypto)
 * ─────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
const { Client } = pg;

const WINDOW_DAYS = Number(process.env.WINDOW_DAYS ?? 14);
const STUDY_TABLE = process.env.STUDY_TABLE ?? 'xstock_spot_ohlc_1m';
const STUDY_LABEL = process.env.STUDY_LABEL ?? 'xstock';
const FREQS_MIN = [5, 15, 30, 60];   // 15 is live; others for context
const PRIMARY_F = 15;
const FWD_HORIZON_MIN = 120;          // clock-anchored 2h forward window
const MIN = 60_000;
const MIN_BUCKET_N = 30;              // min N per bucket to trust an AUC

// 1m bars: symbol → Map<minuteEpoch, [o,h,l,c]>
type Bar = [number, number, number, number];
const bars1m = new Map<string, Map<number, Bar>>();
function bar1mAt(symbol: string, minuteMs: number): Bar | undefined { return bars1m.get(symbol)?.get(minuteMs); }

interface FBar { ts: number; o: number; h: number; l: number; c: number; }

// memoize F-bar series per (symbol,F) — sweeps re-run F=15 ~20× over all symbols.
const fbarCache = new Map<string, FBar[]>();
function buildFBars(symbol: string, F: number): FBar[] {
  const ck = `${symbol}:${F}`;
  const hit = fbarCache.get(ck); if (hit) return hit;
  const built = buildFBarsRaw(symbol, F);
  fbarCache.set(ck, built);
  return built;
}
function buildFBarsRaw(symbol: string, F: number): FBar[] {
  const m = bars1m.get(symbol); if (!m) return [];
  const bucketMs = F * MIN;
  const byBucket = new Map<number, number[]>();
  for (const minMs of m.keys()) {
    const b = Math.floor(minMs / bucketMs) * bucketMs;
    let e = byBucket.get(b); if (!e) { e = []; byBucket.set(b, e); }
    e.push(minMs);
  }
  const out: FBar[] = [];
  for (const [b, mins] of byBucket) {
    mins.sort((x, y) => x - y);
    let o = NaN, h = -Infinity, l = Infinity, c = NaN;
    for (const mn of mins) {
      const bar = m.get(mn)!;
      if (Number.isNaN(o)) o = bar[0];
      if (bar[1] > h) h = bar[1];
      if (bar[2] < l) l = bar[2];
      c = bar[3];
    }
    if (Number.isFinite(o) && Number.isFinite(c)) out.push({ ts: b, o, h, l, c });
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}

// forward EXCESS return from a decision MINUTE: entry=open(min+1), exit=close(min+1+H)
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

// ── helpers mirroring pattern-recognizer.ts ──────────────────────────────────
const isBull = (b: FBar) => b.c > b.o;
const isBear = (b: FBar) => b.c < b.o;
const bodyS = (b: FBar) => Math.abs(b.c - b.o);
const rangeS = (b: FBar) => b.h - b.l;
const upW = (b: FBar) => b.h - Math.max(b.o, b.c);
const lowW = (b: FBar) => Math.min(b.o, b.c) - b.l;

type Dir = 'BUY' | 'SELL';
interface Det { dir: Dir | null; }
const NONE: Det = { dir: null };

// PINBAR (recognizer:114). wickMult default 1.5 (B54).
function detPinbar(a: FBar[], i: number, wickMult = 1.5): Det {
  if (i < 1) return NONE;
  const cur = a[i]; const body = bodyS(cur), range = rangeS(cur);
  if (body === 0 || range === 0) return NONE;
  const uw = upW(cur), lw = lowW(cur);
  if (lw > wickMult * body && lw > uw * 2) return { dir: 'BUY' };
  if (uw > wickMult * body && uw > lw * 2) return { dir: 'SELL' };
  return NONE;
}
// ENGULFING (recognizer:172). minRatio default 1.0 (production requires only currentBody>prevBody).
function detEngulfing(a: FBar[], i: number, minRatio = 1.0): Det {
  if (i < 1) return NONE;
  const cur = a[i], prev = a[i - 1];
  const cb = bodyS(cur), pb = bodyS(prev);
  if (pb === 0) return NONE;
  if (isBear(prev) && isBull(cur)) {
    if (cur.o <= prev.c && cur.c >= prev.o && cb > pb && cb / pb >= minRatio) return { dir: 'BUY' };
  }
  if (isBull(prev) && isBear(cur)) {
    if (cur.o >= prev.c && cur.c <= prev.o && cb > pb && cb / pb >= minRatio) return { dir: 'SELL' };
  }
  return NONE;
}
// INSIDE_BAR (recognizer:238). tol default 0.001 (B54). direction = parent direction.
function detInsideBar(a: FBar[], i: number, tol = 0.001): Det {
  if (i < 1) return NONE;
  const cur = a[i], prev = a[i - 1];
  if (cur.h < prev.h * (1 + tol) && cur.l > prev.l * (1 - tol)) return { dir: isBull(prev) ? 'BUY' : 'SELL' };
  return NONE;
}
// THREE_SOLDIERS (recognizer:278). tolPct default 0.0025 (B54). BUY only.
function detThreeSoldiers(a: FBar[], i: number, tolPct = 0.0025): Det {
  if (i < 2) return NONE;
  const c1 = a[i - 2], c2 = a[i - 1], c3 = a[i];
  if (!isBull(c1) || !isBull(c2) || !isBull(c3)) return NONE;
  if (c2.c <= c1.c || c3.c <= c2.c) return NONE;
  const t1 = bodyS(c1) * tolPct, t2 = bodyS(c2) * tolPct;
  const o1 = c2.o >= (c1.o - t1) && c2.o <= (c1.c + t1);
  const o2 = c3.o >= (c2.o - t2) && c3.o <= (c2.c + t2);
  return (o1 && o2) ? { dir: 'BUY' } : NONE;
}
// MORNING_STAR (recognizer:321). c1Min default 0.3 (B54), c2Max 0.3. BUY only.
function detMorningStar(a: FBar[], i: number, c1Min = 0.3, c2Max = 0.3): Det {
  if (i < 2) return NONE;
  const c1 = a[i - 2], c2 = a[i - 1], c3 = a[i];
  if (!isBear(c1)) return NONE;
  const c1b = bodyS(c1), c1r = rangeS(c1);
  if (c1r === 0 || c1b / c1r < c1Min) return NONE;
  const c2b = bodyS(c2), c2r = rangeS(c2);
  if (c2r > 0 && c2b / c2r > c2Max) return NONE;
  if (!isBull(c3)) return NONE;
  const mid = (c1.o + c1.c) / 2;
  return (c3.c > mid) ? { dir: 'BUY' } : NONE;
}
// ABCD (recognizer:377). fib zone default [0.350, 0.820] (B53). 50-bar lookback. BUY only.
function detABCD(a: FBar[], i: number, fibLo = 0.350, fibHi = 0.820): Det {
  if (i < 11) return NONE;
  const start = Math.max(0, i - 49);
  const window = a.slice(start, i + 1);
  if (window.length < 12) return NONE;
  const swingLows: { index: number; price: number }[] = [];
  const swingHighs: { index: number; price: number }[] = [];
  for (let k = 2; k < window.length - 2; k++) {
    const p2 = window[k - 2], p1 = window[k - 1], cu = window[k], n1 = window[k + 1], n2 = window[k + 2];
    if (cu.l < p1.l && cu.l < p2.l && cu.l < n1.l && cu.l < n2.l) swingLows.push({ index: k, price: cu.l });
    if (cu.h > p1.h && cu.h > p2.h && cu.h > n1.h && cu.h > n2.h) swingHighs.push({ index: k, price: cu.h });
  }
  if (swingLows.length < 2 || swingHighs.length < 1) return NONE;
  for (let ci = swingLows.length - 1; ci >= 1; ci--) {
    const cPoint = swingLows[ci];
    const bCandidates = swingHighs.filter(h => h.index < cPoint.index && h.index > cPoint.index - 20);
    if (bCandidates.length === 0) continue;
    const bPoint = bCandidates[bCandidates.length - 1];
    const aCandidates = swingLows.filter(l => l.index < bPoint.index && l.index > bPoint.index - 25 && l.price < cPoint.price);
    if (aCandidates.length === 0) continue;
    const aPoint = aCandidates[aCandidates.length - 1];
    if (bPoint.price <= aPoint.price) continue;
    if (cPoint.price <= aPoint.price || cPoint.price >= bPoint.price) continue;
    const abLeg = bPoint.price - aPoint.price;
    const bcRetrace = (bPoint.price - cPoint.price) / abLeg;
    if (bcRetrace < fibLo || bcRetrace > fibHi) continue;
    const cHigh = window[cPoint.index].h;
    let dFound = false;
    for (let d = cPoint.index + 1; d < window.length; d++) { if (window[d].h > cHigh) { dFound = true; break; } }
    if (!dFound) continue;
    return { dir: 'BUY' };
  }
  return NONE;
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
const pct = (cond: number, total: number) => (total ? (100 * cond / total) : NaN);

// One pattern's accumulator over a pass.
interface Acc { evalBars: number; bullEx: number[]; bearEx: number[]; noneEx: number[]; }
function newAcc(): Acc { return { evalBars: 0, bullEx: [], bearEx: [], noneEx: [] }; }

type DetFn = (a: FBar[], i: number) => Det;
const PATTERNS: { key: string; minIdx: number; fn: DetFn }[] = [
  { key: 'PINBAR', minIdx: 1, fn: (a, i) => detPinbar(a, i) },
  { key: 'ENGULFING', minIdx: 1, fn: (a, i) => detEngulfing(a, i) },
  { key: 'INSIDE_BAR', minIdx: 1, fn: (a, i) => detInsideBar(a, i) },
  { key: 'THREE_SOLDIERS', minIdx: 2, fn: (a, i) => detThreeSoldiers(a, i) },
  { key: 'MORNING_STAR', minIdx: 2, fn: (a, i) => detMorningStar(a, i) },
  { key: 'ABCD', minIdx: 11, fn: (a, i) => detABCD(a, i) },
];

// Run all production-config detectors over all symbols at frequency F → per-pattern Acc.
function runPass(F: number, fns: { key: string; minIdx: number; fn: DetFn }[]): Map<string, Acc> {
  const accs = new Map<string, Acc>();
  for (const p of fns) accs.set(p.key, newAcc());
  for (const s of allSymbols) {
    const fb = buildFBars(s, F);
    if (fb.length < 16) continue;
    for (let i = 1; i < fb.length; i++) {
      const closeMin = fb[i].ts + F * MIN;
      const raw = fwdReturn(s, closeMin, FWD_HORIZON_MIN);
      if (raw === null) continue;
      const base = universeBaseRate(closeMin, FWD_HORIZON_MIN);
      if (base === null) continue;
      const ex = raw - base;
      for (const p of fns) {
        if (i < p.minIdx) continue;
        const acc = accs.get(p.key)!;
        acc.evalBars++;
        const d = p.fn(fb, i);
        if (d.dir === 'BUY') acc.bullEx.push(ex);
        else if (d.dir === 'SELL') acc.bearEx.push(ex);
        else acc.noneEx.push(ex);
      }
    }
  }
  return accs;
}

// Pooled directional signed-excess for a pattern: bull as-is, bear negated.
function signedEx(acc: Acc): number[] { return acc.bullEx.concat(acc.bearEx.map((x) => -x)); }
function aucStr(p: number[], r: number[]): string {
  return (p.length >= MIN_BUCKET_N && r.length >= MIN_BUCKET_N) ? aucMW(p, r).toFixed(3) : 'low-N';
}

function reportPattern(key: string, acc: Acc): void {
  const fires = acc.bullEx.length + acc.bearEx.length;
  const fireRate = pct(fires, acc.evalBars);
  const sgn = signedEx(acc);
  const meanSigned = mean(sgn) * 1e4; // bps
  // directional hit rate: bull correct = ex>0, bear correct = ex<0
  const bullHits = acc.bullEx.filter((x) => x > 0).length;
  const bearHits = acc.bearEx.filter((x) => x < 0).length;
  const hitRate = pct(bullHits + bearHits, fires);
  // directional AUC: pooled signed-excess of fires vs no-fire baseline (none, treated dir-agnostic 0-centered)
  // For a fair pooled test, compare signed-fire-excess against the no-fire excess pooled with its sign neutral.
  const dirAuc = aucStr(sgn, acc.noneEx);
  // separate BUY / SELL discrimination
  const buyAuc = aucStr(acc.bullEx, acc.noneEx);                       // >0.55 = BUY predicts up
  const sellAuc = acc.bearEx.length ? aucStr(acc.noneEx, acc.bearEx) : 'n/a'; // >0.55 = SELL predicts down
  console.log(
    `${key.padEnd(15)} | fire ${fireRate.toFixed(3).padStart(7)}% | n ${String(fires).padStart(6)} ` +
    `(B${acc.bullEx.length}/S${acc.bearEx.length}) | hit ${hitRate.toFixed(1).padStart(5)}% | ` +
    `signedEdge ${meanSigned.toFixed(1).padStart(7)}bps | dirAUC ${dirAuc.padStart(6)} | ` +
    `BUY-AUC ${buyAuc.padStart(6)} | SELL-AUC ${String(sellAuc).padStart(6)}`,
  );
}

// ── tolerance sweep (PRIMARY_F only) ─────────────────────────────────────────
interface Sweep { key: string; label: string; variants: { tag: string; fn: DetFn }[] }
const SWEEPS: Sweep[] = [
  { key: 'PINBAR', label: 'wickMult', variants: [1.2, 1.5, 2.0, 2.5].map((v) => ({ tag: String(v), fn: (a, i) => detPinbar(a, i, v) })) },
  { key: 'ENGULFING', label: 'minEngulfRatio', variants: [1.0, 1.3, 1.6].map((v) => ({ tag: String(v), fn: (a, i) => detEngulfing(a, i, v) })) },
  { key: 'INSIDE_BAR', label: 'tol', variants: [0.0, 0.001, 0.002].map((v) => ({ tag: String(v), fn: (a, i) => detInsideBar(a, i, v) })) },
  { key: 'THREE_SOLDIERS', label: 'opensTol', variants: [0.0, 0.0025, 0.01].map((v) => ({ tag: String(v), fn: (a, i) => detThreeSoldiers(a, i, v) })) },
  { key: 'MORNING_STAR', label: 'c1Body/range_min', variants: [0.2, 0.3, 0.4].map((v) => ({ tag: String(v), fn: (a, i) => detMorningStar(a, i, v) })) },
  { key: 'ABCD', label: 'fibZone', variants: [[0.382, 0.786], [0.350, 0.820], [0.30, 0.90]].map((z) => ({ tag: `${z[0]}-${z[1]}`, fn: (a, i) => detABCD(a, i, z[0], z[1]) })) },
];

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const maxRes = await client.query<{ max: string }>(`SELECT max(interval_begin) AS max FROM ${STUDY_TABLE}`);
  const maxMs = new Date(maxRes.rows[0].max).getTime();
  const startMs = maxMs - WINDOW_DAYS * 86_400_000;
  console.log(`\n===== PATTERN-EVIDENCE-15m  [${STUDY_LABEL}]  table=${STUDY_TABLE} =====`);
  console.log(`[PATEV] window ${new Date(startMs).toISOString()} → ${new Date(maxMs).toISOString()} (${WINDOW_DAYS}d)  fwd-horizon=${FWD_HORIZON_MIN}min  primary-F=${PRIMARY_F}`);

  console.log('[PATEV] loading 1m bars…');
  const r = await client.query<{ symbol: string; interval_begin: string; open: string; high: string; low: string; close: string }>(
    `SELECT symbol, interval_begin, open, high, low, close FROM ${STUDY_TABLE} WHERE interval_begin >= $1 AND interval_begin <= $2`,
    [new Date(startMs).toISOString(), new Date(maxMs).toISOString()]);
  for (const row of r.rows) {
    const mm = Math.floor(new Date(row.interval_begin).getTime() / MIN) * MIN;
    let bm = bars1m.get(row.symbol); if (!bm) { bm = new Map(); bars1m.set(row.symbol, bm); }
    bm.set(mm, [Number(row.open), Number(row.high), Number(row.low), Number(row.close)]);
  }
  allSymbols = [...bars1m.keys()];
  console.log(`[PATEV] ${r.rows.length.toLocaleString()} 1m bars, ${allSymbols.length} symbols\n`);

  // ── (1)+(2) per-pattern fire-rate + directional edge at PRIMARY_F ───────────
  console.log(`── PRIMARY: per-pattern fire-rate + directional edge @ ${PRIMARY_F}-min (production tolerances) ──`);
  console.log('pattern         | fireRate  | n det (Buy/Sell)    | hit   | signedEdge | dirAUC | BUY-AUC | SELL-AUC');
  console.log('----------------+-----------+---------------------+-------+------------+--------+---------+---------');
  const primary = runPass(PRIMARY_F, PATTERNS);
  for (const p of PATTERNS) reportPattern(p.key, primary.get(p.key)!);
  console.log('\nRead: dirAUC/BUY-AUC/SELL-AUC > 0.55 = the pattern\'s directional call discriminates; signedEdge > 0 (bps) = correct-direction excess; "low-N" = too few detections to trust. fireRate is detections / evaluated bars.');

  // ── F-context: fire-rate + pooled directional AUC across bar sizes ──────────
  console.log(`\n── CONTEXT: fire-rate + pooled directional AUC across bar sizes (signedEdge bps) ──`);
  console.log('pattern         |   F=5            |   F=15           |   F=30           |   F=60');
  const ctx = new Map<number, Map<string, Acc>>();
  for (const F of FREQS_MIN) ctx.set(F, runPass(F, PATTERNS));
  for (const p of PATTERNS) {
    const cell = (F: number) => {
      const acc = ctx.get(F)!.get(p.key)!;
      const fires = acc.bullEx.length + acc.bearEx.length;
      const fr = pct(fires, acc.evalBars);
      const sg = signedEx(acc);
      const a = aucStr(sg, acc.noneEx);
      return `${fr.toFixed(2)}% A${a} ${(mean(sg) * 1e4).toFixed(0)}bp`;
    };
    console.log(`${p.key.padEnd(15)} | ${cell(5).padEnd(15)} | ${cell(15).padEnd(15)} | ${cell(30).padEnd(15)} | ${cell(60)}`);
  }

  // ── (3) tolerance sensitivity @ PRIMARY_F ───────────────────────────────────
  console.log(`\n── TOLERANCE SENSITIVITY @ ${PRIMARY_F}-min (does any setting surface edge? mis-fit vs useless) ──`);
  for (const sw of SWEEPS) {
    console.log(`\n  ${sw.key}  [${sw.label}]`);
    for (const v of sw.variants) {
      const accs = runPass(PRIMARY_F, [{ key: sw.key, minIdx: PATTERNS.find((p) => p.key === sw.key)!.minIdx, fn: v.fn }]);
      const acc = accs.get(sw.key)!;
      const fires = acc.bullEx.length + acc.bearEx.length;
      const sg = signedEx(acc);
      console.log(
        `    ${sw.label}=${v.tag.padEnd(11)} fire ${pct(fires, acc.evalBars).toFixed(3).padStart(7)}% | n ${String(fires).padStart(6)} | ` +
        `signedEdge ${(mean(sg) * 1e4).toFixed(1).padStart(7)}bps | dirAUC ${aucStr(sg, acc.noneEx).padStart(6)}`,
      );
    }
  }

  await client.end();
  console.log(`\n[PATEV] complete [${STUDY_LABEL}]. Keep-or-park read: a pattern earns its place if at 15-min it fires often enough to matter AND its directional call shows real edge (dirAUC > ~0.55 with meaningful N and positive signedEdge) at SOME tolerance in the sweep. If edge is absent across the whole sweep, the pattern is genuinely uninformative at 15-min — park it; if edge appears only at a non-production setting, it is mis-fit — recalibrate to that setting.`);
}

main().catch((err) => { console.error('[PATEV] Fatal:', err); process.exit(1); });
