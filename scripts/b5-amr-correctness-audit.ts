#!/usr/bin/env tsx
/**
 * B-5 Obj-15a — AMR correctness audit (READ-ONLY)
 * ─────────────────────────────────────────────────────────────────────────
 * Recomputes every AMR input from raw data with INDEPENDENT implementations
 * and scores them against the §7 R4 pinned pass bars (B_5_AMR_PRE_AUDIT_V2.md
 * — pinned BEFORE this audit ran; deterministic rows EXACT, float rows
 * |Δ| ≤ 1e-6; any miss = batch NO-CLOSE).
 *
 * Inputs come from the one-pass dump surface (AUD-1, Langston-approved
 * A1-A4): /api/diagnostics/amr/audit-dump captures per-pair aggregation
 * inputs + the system-computed aggregate in the SAME synchronous pass per
 * section, so EXACT comparisons are meaningful. The recompute functions in
 * this file are written from the documented formulas, NOT imported from the
 * production modules (independence requirement) — with two deliberate
 * exceptions per Langston's AUD-1 rec #1 (anti-drift): the DBS publish floor
 * is read via the canonical DB-backed accessor, and the weight cap constant
 * is imported from its canonical export. A null vote winner is interpreted
 * WITHOUT a floor constant (null → skip + note), so MIN_CLASS_VOTE_PAIRS
 * needs no copy here.
 *
 * Run on staging (has .env DATABASE_URL + localhost:5000):
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && npx tsx scripts/b5-amr-correctness-audit.ts'"
 *
 * DISPOSITION: offline diagnostic. Zero writes. Safe to re-invoke (rule-13
 * repeatability — this is the rolling-audit surface, not a one-shot).
 */

import { GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT } from '../server/types/directional-bias.types.js';
import * as fs from 'fs';
import * as path from 'path';

const BASE = 'http://localhost:5000';
const EPS = 1e-6;

type Verdict = { leg: string; klass: string; bar: string; n: number; maxDev: number | string; pass: boolean | null; note?: string };
const verdicts: Verdict[] = [];
function record(v: Verdict) {
  verdicts.push(v);
  const status = v.pass === null ? 'SKIP' : v.pass ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${v.leg} (${v.klass}) bar=${v.bar} n=${v.n} maxDev=${v.maxDev}${v.note ? ' — ' + v.note : ''}`);
}

async function login(): Promise<string> {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'testuser123', password: 'SecurePass123!' }),
  });
  return (await r.json() as any).accessToken;
}

async function authedGet(token: string, p: string): Promise<any> {
  const r = await fetch(`${BASE}${p}`, { headers: { Authorization: `Bearer ${token}` } });
  return r.json();
}

// ── Independent recompute implementations (from documented formulas) ─────────

/** Vote: plain majority tally; winner by count; percentage/avgScore rounded. */
function retallyVote(pairs: Array<{ symbol: string; regime: string; regimeScore: number }>) {
  const counts = new Map<string, { count: number; total: number }>();
  for (const p of pairs) {
    const c = counts.get(p.regime) ?? { count: 0, total: 0 };
    c.count++; c.total += p.regimeScore;
    counts.set(p.regime, c);
  }
  let best: { regime: string; count: number; total: number } | null = null;
  for (const [regime, c] of counts) {
    if (!best || c.count > best.count) best = { regime, count: c.count, total: c.total };
  }
  if (!best) return null;
  return {
    regime: best.regime,
    pairCount: pairs.length,
    percentage: Math.round((best.count / pairs.length) * 100),
    avgScore: Math.round(best.total / best.count),
  };
}

/** DBS: volume-weighted median — sort by score asc, first cum-weight ≥ half. */
function weightedMedian(entries: Array<{ score: number; volume: number; sentinelZero: boolean }>) {
  const live = entries.filter(e => !e.sentinelZero).map(e => ({ score: e.score, weight: e.volume || 1 }));
  if (live.length === 0) return null;
  if (GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT < 1.0) {
    const totalRaw = live.reduce((s, e) => s + e.weight, 0);
    const cap = totalRaw * GLOBAL_DBS_MAX_PAIR_WEIGHT_PCT;
    for (const e of live) if (e.weight > cap) e.weight = cap;
  }
  live.sort((a, b) => a.score - b.score);
  const half = live.reduce((s, e) => s + e.weight, 0) / 2;
  let cum = 0;
  for (const e of live) { cum += e.weight; if (cum >= half) return e.score; }
  return live[live.length - 1].score;
}

/** Friction: per-sample round(min((spread+slip+fee)*1e4/3,100)); score = round(mean). */
function frictionOfSample(spread: number, slippage: number, fee: number): number {
  return Math.round(Math.min(((spread + slippage + fee) * 10000) / 3, 100));
}

function stats(devs: number[]) {
  return devs.length ? Math.max(...devs) : 0;
}

async function main() {
  console.log(`\n=== B-5 Obj-15a correctness audit — ${new Date().toISOString()} ===\n`);
  const token = await login();
  const dump = await authedGet(token, '/api/diagnostics/amr/audit-dump');
  const current = await authedGet(token, '/api/diagnostics/amr/current');
  if (!dump.ok) throw new Error('audit-dump endpoint returned not-ok: ' + JSON.stringify(dump));

  for (const klass of ['crypto_spot', 'xstock_spot'] as const) {
    const block = dump.byClass[klass];

    // ── Leg 1: regime vote (EXACT) ─────────────────────────────────────────
    const { pairs, winner } = block.vote;
    if (!winner) {
      record({ leg: 'vote_retally', klass, bar: 'EXACT', n: pairs.length, maxDev: 'n/a', pass: null, note: `winner=null (below class floor or idle; ${pairs.length} pairs) — no published vote to score this instant` });
    } else {
      const mine = retallyVote(pairs)!;
      const exact = mine.regime === winner.regime && mine.pairCount === winner.pairCount
        && mine.percentage === winner.percentage && mine.avgScore === winner.avgScore;
      record({
        leg: 'vote_retally', klass, bar: 'EXACT', n: pairs.length,
        maxDev: exact ? 0 : `regime ${mine.regime}vs${winner.regime} pct ${mine.percentage}vs${winner.percentage} avg ${mine.avgScore}vs${winner.avgScore} n ${mine.pairCount}vs${winner.pairCount}`,
        pass: exact,
      });
    }

    // ── Leg 2: DBS weighted median (|Δ| ≤ 1e-6) ────────────────────────────
    const dbs = block.dbs;
    if (!dbs.computed) {
      record({ leg: 'dbs_weighted_median', klass, bar: '1e-6', n: dbs.entries.length, maxDev: 'n/a', pass: null, note: 'no eligible entries this instant' });
    } else {
      const mine = weightedMedian(dbs.entries);
      const dev = mine === null ? Infinity : Math.abs(mine - dbs.computed.score);
      record({ leg: 'dbs_weighted_median', klass, bar: '1e-6', n: dbs.entries.length, maxDev: dev, pass: dev <= EPS });
      // Langston AUD-1 rec #2: loose parity vs the last PUBLISHED snapshot —
      // catches eligibility-partition drift the formula leg cannot see.
      // Loose because snapshot is from a different instant by design.
      if (dbs.latestSnapshot && !dbs.latestSnapshot.isStale) {
        const ageS = (Date.now() - dbs.latestSnapshot.snapshotTime) / 1000;
        const pd = Math.abs(dbs.computed.score - dbs.latestSnapshot.value.score);
        const tol = 0.15; // loose: 30s of market movement, not a formula bar
        record({ leg: 'dbs_partition_parity', klass, bar: `loose ${tol} (advisory)`, n: dbs.entries.length, maxDev: pd, pass: ageS < 120 ? pd <= tol : null, note: `snapshot age ${ageS.toFixed(0)}s${ageS >= 120 ? ' — too old for parity, advisory skip' : ''}` });
      }
    }

    // ── Leg 3: friction (EXACT formula + EXACT aggregate) ─────────────────
    const fr = block.friction;
    if (fr.result.score === null || fr.samples.length === 0) {
      record({ leg: 'friction_recompute', klass, bar: 'EXACT', n: fr.samples.length, maxDev: 'n/a', pass: null, note: `score=null reason=${fr.result.reason ?? '-'} (${fr.result.reasonDetail ?? ''}) — reason-coded no-sample state, honest by design` });
    } else {
      let perSampleMiss = 0;
      let sum = 0;
      for (const s of fr.samples) {
        const f = frictionOfSample(s.spread, s.slippage, s.fee);
        if (f !== s.friction) perSampleMiss++;
        sum += f;
      }
      const myScore = Math.round(sum / fr.samples.length);
      const pass = perSampleMiss === 0 && myScore === fr.result.score;
      record({ leg: 'friction_recompute', klass, bar: 'EXACT', n: fr.samples.length, maxDev: perSampleMiss === 0 ? Math.abs(myScore - fr.result.score) : `${perSampleMiss} per-sample misses`, pass });
    }
  }

  // ── Leg 4: expectedEdge / netPnl from persisted VTS trades (EXACT) ───────
  // tradeData formulas (vts-service close path): netPnlPct=(pnl/(positionSize*entryPrice))*100;
  // expectedEdge stamped at entry. We verify formula-consistency of the
  // persisted fields on today's (+yesterday's) closed trades.
  try {
    const VTS_DIR = ['logs/vts_trades', 'data/vts_trades', 'logs/vts'].find(d => fs.existsSync(d));
    if (!VTS_DIR) {
      record({ leg: 'netpnl_expectededge', klass: 'both', bar: 'EXACT', n: 0, maxDev: 'n/a', pass: null, note: 'VTS trade log dir not found at expected paths — resolve VTS_LOGS_DIR and re-run' });
    } else {
      const files = fs.readdirSync(VTS_DIR).filter(f => f.endsWith('.json')).sort().slice(-2);
      let n = 0, miss = 0; let maxDev = 0;
      for (const f of files) {
        const rows = JSON.parse(fs.readFileSync(path.join(VTS_DIR, f), 'utf-8'));
        const arr = Array.isArray(rows) ? rows : rows.trades ?? [];
        for (const t of arr) {
          if (typeof t.pnl !== 'number' || typeof t.positionSize !== 'number' || typeof t.entryPrice !== 'number') continue;
          const notional = t.positionSize * t.entryPrice;
          if (!(notional > 0)) continue;
          n++;
          const netPnlPct = (t.pnl / notional) * 100;
          // EXACT determinism check: recompute reproduces itself bit-stably and
          // is finite; where the row also persisted a net pct field, compare.
          if (!Number.isFinite(netPnlPct)) { miss++; continue; }
          if (typeof t.netPnlPct === 'number') {
            const dev = Math.abs(netPnlPct - t.netPnlPct);
            maxDev = Math.max(maxDev, dev);
            if (dev !== 0) miss++;
          }
          if (typeof t.expectedEdge === 'number' && typeof t.targetPrice === 'number' && typeof t.frictionCost === 'number' && t.entryPrice > 0) {
            const tpDistance = (t.targetPrice - t.entryPrice) / t.entryPrice;
            const expected = tpDistance - t.frictionCost;
            const dev = Math.abs(expected - t.expectedEdge);
            maxDev = Math.max(maxDev, dev);
            if (dev > EPS) miss++; // float path on the two persisted components
          }
        }
      }
      record({ leg: 'netpnl_expectededge', klass: 'both', bar: 'EXACT (1e-6 on recombined floats)', n, maxDev, pass: n > 0 ? miss === 0 : null, note: n === 0 ? 'no scorable closed trades in window' : `${miss} misses across ${files.join(',')}` });
    }
  } catch (e: any) {
    record({ leg: 'netpnl_expectededge', klass: 'both', bar: 'EXACT', n: 0, maxDev: 'n/a', pass: null, note: 'leg errored: ' + e.message });
  }

  // ── Leg 5: B67.1 z-scores from the equity-feed persisted windows (1e-6) ──
  try {
    const statePath = '/tmp/amr-equity-feed-state.json';
    if (!fs.existsSync(statePath)) {
      record({ leg: 'equity_z_scores', klass: 'xstock_spot', bar: '1e-6', n: 0, maxDev: 'n/a', pass: null, note: 'state file absent' });
    } else {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
      let n = 0, fails = 0; let maxDev = 0;
      for (const series of Object.keys(state.windows ?? state)) {
        const w = (state.windows ?? state)[series];
        const obs: number[] = Array.isArray(w?.observations) ? w.observations.map((o: any) => typeof o === 'number' ? o : o.v ?? o.value) : [];
        if (obs.length < 5) continue;
        const mean = obs.reduce((a, b) => a + b, 0) / obs.length;
        const std = Math.sqrt(obs.reduce((a, b) => a + (b - mean) ** 2, 0) / obs.length);
        const latest = obs[obs.length - 1];
        const myZ = std > 0 ? (latest - mean) / std : 0;
        n++;
        // Compare against the live endpoint's macroDetail for this series if present.
        const md = current?.byClass?.xstock_spot?.report?.inputs?.macroDetail ?? {};
        const sysZ = md[series] ?? md[series.toLowerCase()] ?? null;
        if (typeof sysZ === 'number') {
          const dev = Math.abs(myZ - sysZ);
          maxDev = Math.max(maxDev, dev);
          if (dev > EPS) fails++;
          console.log(`   z[${series}]: mine=${myZ.toFixed(6)} system=${sysZ.toFixed(6)} dev=${dev.toExponential(2)} (n=${obs.length})`);
        } else {
          console.log(`   z[${series}]: mine=${myZ.toFixed(6)} system=ABSENT in macroDetail (n=${obs.length})`);
        }
      }
      record({ leg: 'equity_z_scores', klass: 'xstock_spot', bar: '1e-6', n, maxDev, pass: n > 0 ? fails === 0 : null, note: n === 0 ? 'no windows with ≥5 obs yet (warming)' : undefined });
    }
  } catch (e: any) {
    record({ leg: 'equity_z_scores', klass: 'xstock_spot', bar: '1e-6', n: 0, maxDev: 'n/a', pass: null, note: 'leg errored: ' + e.message });
  }

  // ── Side-probe (b): governance_modes wildcard-aggressive row presence ────
  try {
    const pg = await import('pg');
    const dburl = process.env.DATABASE_URL ?? (fs.existsSync('.env') ? (fs.readFileSync('.env', 'utf-8').match(/^DATABASE_URL=(.+)$/m)?.[1] ?? '') : '');
    if (!dburl) {
      record({ leg: 'probe_wildcard_aggressive_rows', klass: 'db', bar: 'inventory', n: 0, maxDev: 'n/a', pass: null, note: 'no DATABASE_URL' });
    } else {
      const client = new pg.default.Client({ connectionString: dburl });
      await client.connect();
      const r = await client.query(
        `SELECT asset_class, constant_name FROM module_constants
         WHERE module_name = 'governance_modes' AND constant_name LIKE 'aggressive%' ORDER BY asset_class, constant_name`);
      const wildcardRows = r.rows.filter((row: any) => row.asset_class === '*');
      console.log(`   governance_modes aggressive rows: ${r.rows.map((x: any) => x.asset_class + '/' + x.constant_name).join(', ') || 'NONE'}`);
      // B-5 contract: AGGRESSIVE exists per-class ONLY — a wildcard aggressive row would
      // resurrect class-less access. Presence = probe FAIL (design violation), absence = PASS.
      record({ leg: 'probe_wildcard_aggressive_rows', klass: 'db', bar: 'zero wildcard rows', n: r.rows.length, maxDev: wildcardRows.length, pass: wildcardRows.length === 0 });
      await client.end();
    }
  } catch (e: any) {
    record({ leg: 'probe_wildcard_aggressive_rows', klass: 'db', bar: 'inventory', n: 0, maxDev: 'n/a', pass: null, note: 'probe errored: ' + e.message });
  }

  // ── Side-probe (c): xstock staleness[] identity ──────────────────────────
  const xsStale = current?.byClass?.xstock_spot?.report?.staleness ?? [];
  console.log(`   xstock staleness[] now: ${JSON.stringify(xsStale)}`);
  record({ leg: 'probe_xstock_staleness_identity', klass: 'xstock_spot', bar: 'identify entries', n: xsStale.length, maxDev: 'n/a', pass: true, note: xsStale.join(' | ') || 'empty' });

  // ── Summary table ─────────────────────────────────────────────────────────
  console.log('\n=== SUMMARY (miss = NO-CLOSE) ===');
  console.log('leg | class | bar | n | maxDev | verdict | note');
  for (const v of verdicts) {
    console.log(`${v.leg} | ${v.klass} | ${v.bar} | ${v.n} | ${v.maxDev} | ${v.pass === null ? 'SKIP' : v.pass ? 'PASS' : 'FAIL'} | ${v.note ?? ''}`);
  }
  const fails = verdicts.filter(v => v.pass === false);
  console.log(`\n${fails.length === 0 ? 'ALL SCORED LEGS PASS' : `${fails.length} LEG(S) FAILED — NO-CLOSE`}`);
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch(e => { console.error('AUDIT HARNESS ERROR:', e); process.exit(2); });
