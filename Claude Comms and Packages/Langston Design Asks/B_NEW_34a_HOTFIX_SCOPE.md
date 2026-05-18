# B-NEW-34a — xStock aggregator lookback hotfix (Mon-morning regression)

> **From:** Claude Code
> **To:** Langston
> **Date:** 2026-05-18 evening
> **Type:** Hotfix scope (single-knob change, Step 1 + Step 4 compressed via embed-diff-inline)
> **Kyle directive 2026-05-18:** proceed with hotfix, check SIM, run by Langston, mind the Supabase Disk IO Budget warning.

---

## §1 — Problem (verified empirically tonight)

**Symptom:** xStock scanner running on staging, universe=265, but **`insufficient_history=75`** (all 75 in rotation batch) every cycle since ARCA reopened Mon 2026-05-18 at 13:30 UTC. UI confirms `Last Scan — 0 pairs scanned` at 19:52 UTC. Zero xStock VTS trades opened since the prior session close Fri 2026-05-15. No new signals reaching `signal_eval_archive` or `vts_open_trades` for asset_class='xstock_spot' for ~3 days.

**Root cause:** `ohlc-aggregator.ts:107-108`:

```ts
const maxBars = intervalMinutes === 60 ? MAX_BARS_60M : MAX_BARS_240M;  // 60M=60
const lookbackHours = (intervalMinutes * maxBars) / 60;                  // 60h
```

The 60h wall-clock lookback was designed for crypto's continuous 24/7 trading where 60 wall-clock hours = 60 hourly bars. For xStocks the Fri 20:00 ET → Sun 20:00 ET unified weekend close eats 48 wall-clock hours from the lookback window. **Empirical bucket counts for AAPL/USD at staging 19:30 UTC Mon 2026-05-18:**

| Lookback window | 60m buckets returned |
|---|---:|
| 60 hours (current) | 20 |
| 120 hours | 73 |
| 200 hours | 140 |

Floor required: **24 buckets** (`module_constants.xstock_spot.min_ohlc_history_bars` — SMA(20) + 4-bar validation headroom per Langston R3 floor rec from B-NEW-34).

Mon morning 13:30 UTC right after ARCA open: 24/7 names have ~13 buckets (Mon 01:00 UTC onward), non-24/7 names have 0 buckets. By 19:30 UTC (current empirical): 24/7 names ~19-20 buckets, non-24/7 names ~6 buckets. **Even by midnight UTC tonight, non-24/7 names won't hit the 24-bar floor.** Scanner doesn't self-heal until ~Tue 13:30 UTC for non-24/7 pairs.

**Regression introduced by B-NEW-34** (2026-05-15) when scanner switched from ticker-snap-based scanning (no historical bar requirement) to OHLC-bar aggregation (24-bar floor). B-NEW-34 deployed Friday afternoon while market was open and bars were continuously accumulating → window was full → issue invisible. First full weekend after deploy (this one) surfaces the structural mismatch.

---

## §2 — The Supabase IO Budget complication

Kyle received Supabase Disk IO Budget depletion warning today (2026-05-18 14:40 ET). Project `vqqyisaudwenrdhnmjwt` is consuming more Disk IO than the compute add-on's baseline budget. Email language indicates depleting-but-not-exhausted state.

**The hotfix shape directly affects IO:**
- Current per-cycle aggregator query: 60-hour DISTINCT ON dedup scan across 75 pairs × every 30s
- Lookback bumped to 120h: ~2× scan cost (still 12 RTH days fit in window via weekend gap)
- Lookback bumped to 240h (needed to make non-24/7 names work Mon morning): **~4× scan cost**
- The DISTINCT ON dedup is required because of `xstock_spot_ohlc_1m` 18-56× duplicate row writes (B74 archive write pattern, source-side dedup queued as B-NEW-35).

**Net: any aggregator-lookback fix temporarily worsens an already-strained IO budget. The structurally correct long-term fix is B-NEW-35 source-side dedup, which would cut both write AND read IO substantially. That's a separate batch (multi-day).**

---

## §3 — Hotfix proposal (recommended path)

**Single-knob change: bump `MAX_BARS_60M` from 60 to 60, and decouple the lookback hours constant to be xStock-aware.**

Concretely, two edits in `server/asset_classes/xstock_spot/ohlc-aggregator.ts`:

### Edit 1 — separate the lookback-hours constant from the cap

Currently:
```ts
const MAX_BARS_60M = 60;
const MAX_BARS_240M = 30;
// later:
const maxBars = intervalMinutes === 60 ? MAX_BARS_60M : MAX_BARS_240M;
const lookbackHours = (intervalMinutes * maxBars) / 60;
```

Change to:
```ts
const MAX_BARS_60M = 60;
const MAX_BARS_240M = 30;
// B-NEW-34a (2026-05-18): lookback wall-clock hours are session-shape-aware.
// xStocks have a 48-hour weekend close + ~17 non-RTH hours per weekday, so
// the wall-clock window required to find N bars is much larger than for
// crypto's continuous trading. 240h = 10 days = spans weekend + 4 prior RTH
// sessions, which yields ~30 buckets for non-24/7 names by Mon market open.
const LOOKBACK_HOURS_60M = 240;
const LOOKBACK_HOURS_240M = 30 * 24; // unchanged — 240-min warm fetch is disabled today
// later:
const maxBars = intervalMinutes === 60 ? MAX_BARS_60M : MAX_BARS_240M;
const lookbackHours = intervalMinutes === 60 ? LOOKBACK_HOURS_60M : LOOKBACK_HOURS_240M;
```

`maxBars` continues to cap the returned array length to 60 (same downstream cost; no change to consumers). The wider lookback only affects the DB query window — which then gets aggregated to ~30-50 buckets per pair right after Mon open, satisfying the 24-bar floor for non-24/7 names too.

### Edit 2 — comment block documenting the IO trade-off

Add a paragraph noting that this hotfix increases per-cycle DB scan cost ~4× until B-NEW-35 (source-side dedup in `xstock_spot_ohlc_1m`) lands. B-NEW-35 will reduce both the duplicate row count AND make the DISTINCT ON dedup unnecessary, cutting IO by an order of magnitude. Hotfix is therefore a temporary worsening of IO budget posture; permanent posture improves once B-NEW-35 ships.

### Why not other options I considered

- **Lower `min_ohlc_history_bars` from 24 to 18:** breaks SMA(20) which has a hard 20-bar minimum (computed in `global-filter.ts` SMA stage). Rejected.
- **Lower to 20 (exact SMA min):** removes 4-bar validation headroom that Langston R3 explicitly required. Rejected per NO PATCHES doctrine.
- **Two-stage adaptive query (60h first, 240h fallback if undersized):** more complex; ships two queries per cycle in the cold case; harder to reason about IO cost. Rejected for hotfix scope.
- **Pre-aggregate to 60-min table on write:** structurally correct (separate `xstock_spot_ohlc_60m` table written by B74 archiver, scanner reads directly without DISTINCT ON dedup); cuts IO by ~95%. But it's a multi-day batch + archiver refactor, not a hotfix. Filed for B-NEW-35 design call.

---

## §4 — Sister recommendation (next batch, not in this hotfix)

**Promote B-NEW-35 (source-side `xstock_spot_ohlc_1m` dedup) to top priority for the next batch slot.** The 18-56× duplicate row writes from B74 archiver are the root cause of both:
- The Supabase IO Budget depletion (write-side amplification)
- The DISTINCT ON dedup scan cost (read-side amplification)

B-NEW-35 was already in the queue per `ohlc-aggregator.ts:142-160` comment block ("B-NEW-34 hotfix 3 (2026-05-15): source-quality bug tracked as B-NEW-35"). Pre-2026-05-18 it was a "nice to have"; the Supabase warning makes it operational priority.

The hotfix posture: this temporary 4× IO increase is acceptable BECAUSE B-NEW-35 will not just reverse it but bring IO well below the pre-hotfix state. The Supabase warning is in soft-warning territory (depleting, not exhausted); we have headroom for ~days, not minutes.

---

## §5 — SIM impact

Affected entry in `SYSTEM_IMPACT_MAP.md`:
- §"Recent Additions (B-NEW-34 — xstock 60-min bar parity, 2026-05-15)" — add a "Known regression: Mon-morning insufficient_history due to weekend-gap-vs-lookback mismatch; B-NEW-34a hotfix raises lookback to 240h with IO trade-off documented."

Affected entry in `RUNNING_ISSUES.md`:
- New entry #118 — B-NEW-34a hotfix tracking + Supabase IO budget operational concern + B-NEW-35 priority promotion.

No CHANGES_AND_FIXES entry needed yet (hotfix governance closes via Step 11 completion report).

---

## §6 — Verification plan

1. **Pre-hotfix baseline (already captured):** every scanner cycle shows `pairs_scanned=0 insufficient_history=75` on staging. Last xStock VTS trade timestamp = 2026-05-15.

2. **Post-hotfix staging deploy:** scanner cycle should within 30s show `pairs_scanned > 0` and `insufficient_history < 75`. Specifically expect ~60-70 of the 75 rotation members to pass (some still below floor if their symbol is genuinely new to the archive).

3. **DB IO check 1 hour post-hotfix:** confirm staging hasn't been throttled. Supabase dashboard via Kyle.

4. **New xStock VTS trade within 2-3 cycles** post-hotfix (assuming any strategy fires on the new data).

---

## §7 — Ask

Two specific Langston ACK items:

1. **Confirm the lookback decoupling shape (§3 Edit 1) is the right surgical move.** Specifically that bumping LOOKBACK_HOURS_60M to 240 won't break anything I haven't traced — most importantly the `xstockOhlcCache.getOHLCDataBatch` consumers (scanner pre-cycle DBS compute from B-PHASE-A2; eval-cycle indirect via scanner cache).

2. **Confirm B-NEW-35 promotion to next-batch top priority is appropriate.** Specifically: is there any reason to delay B-NEW-35 in favor of the Phase A.3 verification gate, B79.0n active-trading wire-in, or other queued work? My read is the Supabase warning bumps B-NEW-35 ahead of everything else; want your sanity check.

**INFRASTRUCTURE NOTE (CLAUDE.md §6.5.0.a):** code snippets embedded inline above. Do not `cd /mnt/gdrive`. Use `ssh staging` for any deeper inspection.

Reply with: (a) Step-4-folded-into-Step-1 CLEAN ACK to ship the hotfix, OR (b) specific revisions, OR (c) substantive disagreement.

— Claude Code, 2026-05-18
