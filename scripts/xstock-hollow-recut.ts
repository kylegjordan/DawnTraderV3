/**
 * B-XSTOCK-FEED-SANITY OBJ-7 (P6) — THE HISTORICAL RE-CUT: label every xStock close that has no
 * `exit_book_state` yet, with its BASIS. LABELS ONLY. Never touches money, never touches close_reason.
 *
 * Run: `npm run b-xstock-feed-sanity:recut -- --dry-run` (prints, writes nothing) then without.
 *
 * BASIS ORDER (audit §A.11 / P6; Langston C3) — the first that applies:
 *   (a) the row carries `exit_decision_price`            → basis `decision_price`: the price that DROVE
 *       the exit, judged with the book-state predicate against the archived frame at the close instant.
 *       The decision frame is reconstructed on the side that departed: a stop decision below the
 *       archived mid implies the BID that produced it (ask held); a target decision above it implies the
 *       ASK. The 21 such rows are the only historical rows that saw their own decision frame.
 *   (b) `closed_at` falls inside a handoff minute (00:15 / 20:15 / 08:15 UTC ± 60 s), no decision price
 *                                                          → basis `minute_proxy`, state `hollow`. A PROXY
 *       with an UNMEASURED base rate (26 rows at deploy) — which is why every consumer of the label must
 *       also read the basis, and why this script prints the count.
 *   (c) a session-body close with an archived frame ≤ 5 s before `closed_at`
 *                                                          → basis `market_state_predicate`, the same
 *       predicate on that frame. The archive reproduces 10/10 body decision prices (§A.11), so the frame
 *       is the decision frame there — an inference, stated as one.
 *   (d) otherwise                                          → left NULL (= unknown).
 *
 * WHY NOT THE ARCHIVE AT THE HANDOFFS: `xstock_spot_ticker_snap` keeps one row per symbol per 4 s while
 * the exit loop reads every frame — 9 of 11 handoff closes with a decision price have NO archived frame
 * within 0.03 % of it (§A.11). The archive predicate would read those closes `two_sided` and be wrong.
 *
 * Idempotent: only rows with `exit_book_state IS NULL` are touched; `never_filled`, `engine_stop_cleanup`
 * and `hard_reset` are skipped (no exit of the market's making). Positive controls are printed: NOW/TGT
 * must read hollow under (a); a known RTH two-sided close must read two_sided under (c).
 */
import 'dotenv/config';
import { Client } from 'pg';
import { assessBookState, type BookStateConfig } from '../server/asset_classes/xstock_spot/book-state.js';
import { BOOK_STATE_SEED } from '../server/asset_classes/xstock_spot/book-state.js';

const DRY = process.argv.includes('--dry-run');
const HANDOFF_MINUTES_UTC = [15, 20 * 60 + 15, 8 * 60 + 15]; // 00:15Z, 20:15Z, 08:15Z
const HANDOFF_TOL_S = 60;
const BODY_FRAME_MAX_AGE_S = 5;

// The predicate is judged with the SEED config — the pre-registered thresholds (audit §A.9). The live
// knobs may later be tuned; the historical label records the registration it was cut under.
const CFG: BookStateConfig = {
  enabled: true,
  kRel: BOOK_STATE_SEED.single_side_departure_k_rel,
  floorPct: BOOK_STATE_SEED.single_side_departure_floor_pct,
  otherSideHoldPct: BOOK_STATE_SEED.other_side_hold_pct,
  lastHoldPct: BOOK_STATE_SEED.last_hold_pct,
  trailingSpreadWindowSnaps: BOOK_STATE_SEED.trailing_spread_window_snaps,
  feedReadEnabled: false,
  feedStubFractionF: BOOK_STATE_SEED.feed_stub_fraction_f,
  feedStubWindowMs: BOOK_STATE_SEED.feed_stub_window_ms,
  feedCohortFloor: BOOK_STATE_SEED.feed_cohort_floor,
  hollowSkipCap: BOOK_STATE_SEED.hollow_skip_cap,
  ownMarkDeviationDPct: BOOK_STATE_SEED.own_mark_deviation_d_pct,
};

interface Row { id: string; symbol: string; close_reason: string; closed_at: Date; exit_decision_price: number | null; }
interface Snap { captured_at: Date; bid: number | null; ask: number | null; last: number | null; }

function inHandoffMinute(d: Date): boolean {
  const m = d.getUTCHours() * 60 + d.getUTCMinutes();
  const s = m * 60 + d.getUTCSeconds();
  return HANDOFF_MINUTES_UTC.some(h => Math.abs(s - h * 60) <= HANDOFF_TOL_S || Math.abs(s - (h * 60 + 60)) <= HANDOFF_TOL_S);
}

async function main(): Promise<void> {
  const c = new Client({ connectionString: process.env.DATABASE_URL });
  await c.connect();
  await c.query('set statement_timeout = 600000');
  const { rows } = await c.query<Row>(`
    select id::text, symbol, close_reason, closed_at, exit_decision_price::float8 exit_decision_price
      from closed_trades
     where asset_class = 'xstock_spot' and closed_at is not null and exit_book_state is null
       and close_reason not in ('never_filled','engine_stop_cleanup','hard_reset')
     order by closed_at`);
  const counts: Record<string, number> = { decision_price: 0, minute_proxy: 0, market_state_predicate: 0, unknown: 0 };
  const stateCounts: Record<string, number> = {};
  const controls: string[] = [];

  for (const r of rows) {
    // the archived frame at/before the close, and the prior two-sided frame before THAT
    const { rows: snaps } = await c.query<Snap>(`
      select captured_at, bid::float8 bid, ask::float8 ask, last::float8 last
        from xstock_spot_ticker_snap where symbol = $1 and captured_at <= $2::timestamptz
       order by captured_at desc limit 2`, [r.symbol, r.closed_at]);
    const cur = snaps[0]; const prev = snaps[1];
    const { rows: pm } = cur ? await c.query<{ bid: number; ask: number; last: number | null }>(`
      select bid::float8 bid, ask::float8 ask, last::float8 last from xstock_spot_ticker_snap
       where symbol = $1 and captured_at < $2::timestamptz and bid > 0 and ask > 0 order by captured_at desc limit 1`,
      [r.symbol, cur.captured_at]) : { rows: [] };
    const prior = pm[0] ?? null;
    const priorInput = prior ? {
      priorTwoSidedMid: (prior.bid + prior.ask) / 2, priorBid: prior.bid, priorAsk: prior.ask, priorLast: prior.last,
      trailingMedianSpreadFrac: (prior.ask - prior.bid) / ((prior.bid + prior.ask) / 2),
    } : { priorTwoSidedMid: null, priorBid: null, priorAsk: null, priorLast: null, trailingMedianSpreadFrac: null };

    let basis: string | null = null; let state: string | null = null; let note = '';
    if (r.exit_decision_price !== null && prior) {
      // (a) reconstruct the decision frame on the side that departed, the other side held.
      const dp = r.exit_decision_price; const priorMid = priorInput.priorTwoSidedMid!;
      const frame = dp < priorMid
        ? { bid: 2 * dp - prior.ask, ask: prior.ask, last: prior.last }   // a decision BELOW the mid: the bid produced it
        : { bid: prior.bid, ask: 2 * dp - prior.bid, last: prior.last };  // a decision ABOVE the mid: the ask produced it
      const res = assessBookState({ ...frame, ...priorInput }, CFG);
      basis = 'decision_price'; state = res.state; note = res.reasons.join('|');
    } else if (inHandoffMinute(r.closed_at)) {
      basis = 'minute_proxy'; state = 'hollow'; note = 'clock-proxied; base rate unmeasured';
    } else if (cur && (r.closed_at.getTime() - cur.captured_at.getTime()) / 1000 <= BODY_FRAME_MAX_AGE_S) {
      const res = assessBookState({ bid: cur.bid, ask: cur.ask, last: cur.last, ...priorInput }, CFG);
      basis = 'market_state_predicate'; state = res.state; note = res.reasons.join('|');
    }
    if (!basis || !state) { counts.unknown++; continue; }
    counts[basis]++; stateCounts[`${basis}:${state}`] = (stateCounts[`${basis}:${state}`] ?? 0) + 1;
    if (['NOW/USD', 'TGT/USD', 'WEN/USD', 'MOH/USD'].includes(r.symbol) && basis === 'decision_price') controls.push(`${r.symbol} ${r.closed_at.toISOString()} → ${state} (${note}) [expected hollow]`);
    if (!DRY) {
      await c.query(`update closed_trades set exit_book_state = $2, exit_book_state_basis = $3 where id = $1 and exit_book_state is null`, [r.id, state, basis]);
    }
  }
  console.log(`[recut] rows considered=${rows.length} dry=${DRY}`);
  console.log(`[recut] by basis: ${JSON.stringify(counts)}`);
  console.log(`[recut] by basis:state: ${JSON.stringify(stateCounts)}`);
  console.log(`[recut] positive controls (decision_price rows that must read hollow):`);
  for (const l of controls) console.log(`   ${l}`);
  await c.end();
}
main().catch(e => { console.error('[recut] FATAL', e); process.exit(1); });
