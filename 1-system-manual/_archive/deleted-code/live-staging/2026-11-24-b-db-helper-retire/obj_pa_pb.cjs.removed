#!/usr/bin/env node
// B-XSTOCK-FEED-SANITY Step 2 pre-conditions. Runs on staging as deploy from /home/deploy/dawntrader (pg from node_modules).
// P-A : held-name hollow-STATE exposure join, per xStock position-day, all ET sessions, since 2026-08-03.
// P-B : absent/zero-bid census by day x ET zone (bounded statements).
// FEAS: for each xStock close since 08-03, the nearest archive snap at the close instant + the predicate on it.
const fs = require('fs');
const { Client } = require('pg');
const OUT = '/home/deploy/obj_pa_pb';
fs.mkdirSync(OUT, { recursive: true });
const HOLLOW_SPREAD = 0.20; // scope §16.1 post-hoc predicate (pre-registered there); the GUARD's thresholds stay UNFIXED until this read lands
const HOLLOW_BID_K = 0.90;
const ET_OFFSET_H = -4; // EDT for Aug-Sep 2026

function zoneET(d) {
  const et = new Date(d.getTime() + ET_OFFSET_H * 3600e3);
  const m = et.getUTCHours() * 60 + et.getUTCMinutes();
  if (m >= 570 && m < 960) return 'rth';
  if (m >= 960 && m < 1200) return 'after_hours';
  if (m >= 1200 || m < 240) return 'overnight';
  return 'pre_market';
}
const median = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
const csv = v => v === null || v === undefined ? '' : (typeof v === 'string' && /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : String(v));
const row = arr => arr.map(csv).join(',') + '\n';

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('set statement_timeout = 600000');
  const { rows: positions } = await c.query(`
    select id::text, symbol, opened_at, closed_at, close_reason from closed_trades
     where asset_class='xstock_spot' and closed_at is not null and closed_at >= '2026-08-03' and opened_at is not null
    union all
    select id::text, symbol, opened_at, now() as closed_at, 'OPEN' from active_open_positions where asset_class='xstock_spot'`);
  console.log('positions', positions.length);
  const pa = fs.createWriteStream(`${OUT}/pa_position_days.csv`);
  pa.write(row(['position_id', 'symbol', 'close_reason', 'day', 'zone', 'snaps', 'two_sided', 'hollow', 'zero_or_null_bid', 'episodes', 'max_episode_s', 'median_episode_s', 'worst_bid_step_pct']));
  const ep = fs.createWriteStream(`${OUT}/pa_episodes.csv`);
  ep.write(row(['position_id', 'symbol', 'zone', 'start_utc', 'end_utc', 'duration_s', 'snaps', 'min_bid_over_prior_mid', 'max_spread', 'note']));
  const fe = fs.createWriteStream(`${OUT}/recut_feasibility.csv`);
  fe.write(row(['position_id', 'symbol', 'close_reason', 'closed_at', 'nearest_snap_age_s', 'snap_bid', 'snap_ask', 'snap_last', 'prior_two_sided_mid', 'hollow_at_close']));

  for (const p of positions) {
    const { rows } = await c.query(`
      select captured_at, bid::float8 bid, ask::float8 ask, last::float8 last
        from xstock_spot_ticker_snap
       where symbol=$1 and captured_at between $2::timestamptz - interval '30 minutes' and $3::timestamptz
       order by captured_at`, [p.symbol, p.opened_at, p.closed_at]);
    let priorMid = null, priorLast = null, cur = null;
    const acc = new Map();
    const openedAt = new Date(p.opened_at).getTime();
    for (const r of rows) {
      const ts = new Date(r.captured_at); const bid = r.bid, ask = r.ask, last = r.last;
      const two = (bid || 0) > 0 && (ask || 0) > 0;
      const mid = two ? (bid + ask) / 2 : null;
      const spread = two && mid > 0 ? (ask - bid) / mid : null;
      let hollow = false, zero = false;
      if (!((bid || 0) > 0)) { zero = true; hollow = true; }
      else if (two && priorMid && spread !== null) hollow = spread > HOLLOW_SPREAD && bid <= HOLLOW_BID_K * priorMid && last !== null && priorLast !== null && last === priorLast;
      if (ts.getTime() >= openedAt) {
        const key = ts.toISOString().slice(0, 10) + '|' + zoneET(ts);
        let a = acc.get(key); if (!a) { a = { snaps: 0, two: 0, hollow: 0, zero: 0, eps: [], worst: 0 }; acc.set(key, a); }
        a.snaps++; if (two) a.two++; if (hollow) a.hollow++; if (zero) a.zero++;
        if (priorMid && (bid || 0) > 0) { const step = (priorMid - bid) / priorMid * 100; if (step > a.worst) a.worst = step; }
        if (hollow) {
          if (!cur) cur = { start: ts, end: ts, n: 0, minr: Infinity, maxs: 0, zone: key.split('|')[1], key };
          cur.end = ts; cur.n++;
          if (priorMid && (bid || 0) > 0) cur.minr = Math.min(cur.minr, bid / priorMid);
          if (spread !== null) cur.maxs = Math.max(cur.maxs, spread);
        } else if (cur) {
          const d = (cur.end - cur.start) / 1000; acc.get(cur.key).eps.push(d);
          ep.write(row([p.id, p.symbol, cur.zone, cur.start.toISOString(), cur.end.toISOString(), d.toFixed(1), cur.n, cur.minr === Infinity ? null : cur.minr.toFixed(4), cur.maxs.toFixed(4), '']));
          cur = null;
        }
      }
      if (two && !hollow) priorMid = mid; // the comparator advances ONLY on two-sided, non-hollow snaps
      if (last !== null) priorLast = last;
    }
    if (cur) {
      const d = (cur.end - cur.start) / 1000; acc.get(cur.key).eps.push(d);
      ep.write(row([p.id, p.symbol, cur.zone, cur.start.toISOString(), cur.end.toISOString(), d.toFixed(1), cur.n, cur.minr === Infinity ? null : cur.minr.toFixed(4), cur.maxs.toFixed(4), 'OPEN_AT_END']));
    }
    for (const [key, a] of [...acc.entries()].sort()) {
      const [day, zone] = key.split('|');
      pa.write(row([p.id, p.symbol, p.close_reason, day, zone, a.snaps, a.two, a.hollow, a.zero, a.eps.length, a.eps.length ? Math.max(...a.eps).toFixed(1) : 0, median(a.eps).toFixed(1), a.worst.toFixed(2)]));
    }
    if (p.close_reason !== 'OPEN') {
      const { rows: s } = await c.query(`select captured_at, bid::float8 bid, ask::float8 ask, last::float8 last from xstock_spot_ticker_snap where symbol=$1 and captured_at <= $2::timestamptz order by captured_at desc limit 1`, [p.symbol, p.closed_at]);
      if (s[0]) {
        const age = (new Date(p.closed_at) - new Date(s[0].captured_at)) / 1000;
        const { rows: pmr } = await c.query(`select ((bid+ask)/2)::float8 m from xstock_spot_ticker_snap where symbol=$1 and captured_at < $2::timestamptz and bid>0 and ask>0 order by captured_at desc limit 1`, [p.symbol, s[0].captured_at]);
        const pm = pmr[0] ? pmr[0].m : null;
        const two = (s[0].bid || 0) > 0 && (s[0].ask || 0) > 0;
        const sp = two ? (s[0].ask - s[0].bid) / ((s[0].bid + s[0].ask) / 2) : null;
        const hol = !((s[0].bid || 0) > 0) || !!(two && pm && sp > HOLLOW_SPREAD && s[0].bid <= HOLLOW_BID_K * pm);
        fe.write(row([p.id, p.symbol, p.close_reason, new Date(p.closed_at).toISOString(), age.toFixed(1), s[0].bid, s[0].ask, s[0].last, pm, hol]));
      } else fe.write(row([p.id, p.symbol, p.close_reason, new Date(p.closed_at).toISOString(), null, null, null, null, null, 'NO_SNAP']));
    }
  }
  pa.end(); ep.end(); fe.end();
  console.log('P-A + feasibility done');

  const pb = fs.createWriteStream(`${OUT}/pb_zero_bid.csv`);
  pb.write(row(['day', 'zone', 'symbols_with_zero', 'zero_snaps', 'total_snaps']));
  const ZONES = { overnight_a: [0, 4], pre_market: [4, 9.5], rth: [9.5, 16], after_hours: [16, 20], overnight_b: [20, 24] };
  for (let day = new Date('2026-08-03T00:00:00Z'); day < new Date('2026-09-03T00:00:00Z'); day = new Date(day.getTime() + 86400e3)) {
    for (const [zone, [lo, hi]] of Object.entries(ZONES)) {
      const loU = new Date(day.getTime() + (lo + 4) * 3600e3), hiU = new Date(day.getTime() + (hi + 4) * 3600e3);
      try {
        const { rows: r } = await c.query(`select count(distinct symbol) filter (where bid is null or bid<=0) s, count(*) filter (where bid is null or bid<=0) z, count(*) t from xstock_spot_ticker_snap where captured_at >= $1 and captured_at < $2`, [loU, hiU]);
        pb.write(row([day.toISOString().slice(0, 10), zone, r[0].s, r[0].z, r[0].t]));
      } catch (e) { pb.write(row([day.toISOString().slice(0, 10), zone, 'ERR', String(e.message).slice(0, 60), ''])); }
    }
  }
  pb.end(); console.log('P-B done');
  await c.end();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
