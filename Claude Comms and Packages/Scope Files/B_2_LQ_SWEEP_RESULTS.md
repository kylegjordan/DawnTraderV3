# B.2 — LQ depth sweep RESULTS (archive-replay artifact)

**Run:** 2026-06-02 on staging via `psql -f` (full reproducible SQL embedded at the bottom of this doc; `scripts/*.sql` is gitignored by repo convention so the artifact is self-contained here). **Window:** 2026-06-01 00:00 → 2026-06-02 10:20 UTC (the only depth hot; May cold-evicted). **485 symbols, 44,515 per-(symbol×20-min) observations** (9,211 "RTH-clock", 35,304 off-hours). **Read-only.** Interpreted through the **calibration lens** (ADJUSTMENT_FRAMEWORK §1.1 axiom 6: admit max VETTED solid opportunities; lq_min = the depth below which a book is too thin for a clean fill).

## Ask-depth-USD distribution (per symbol × 20-min median)
| segment | obs | symbols | p10 | p25 | p50 | p75 | p90 |
|---|---|---|---|---|---|---|---|
| off-hours | 35,304 | 485 | $3,052 | $8,221 | $17,096 | $33,127 | $68,890 |
| "RTH-clock" | 9,211 | 485 | $5,699 | $9,550 | $14,925 | $23,320 | $37,682 |

## LQ sweep — % names admitted a majority of their buckets (RTH-clock)
| cand lq_min | implied ask-depth | names admitted (of 485) | % admitted |
|---|---|---|---|
| 30 | $999 | 477 | 98.35% |
| 33 | $1,994 | 469 | 96.70% |
| 35 | $3,161 | 467 | 96.29% |
| 38 | $6,309 | 432 | 89.07% |
| 40 | $9,999 | 360 | 74.23% |
| **43 (current)** | **$19,952** | **149** | **30.72%** |
| 45 | $31,622 | 56 | 11.55% |

## Reading (through the lens)
- **lq_min=43 is false-rejecting the median tradeable name.** Median ask-depth is ~$15–17k; 43 requires ~$19,950, so the typical name fails. Only 30.7% of names clear it — this is the mis-scaled crypto-VOLUME carryover, not a chosen depth bar.
- **The solid-fill floor sits in the high-30s.** Real thinning starts below ~$3–6k (the p10–p25 zone). lq_min **35–40** rejects only the genuinely-thin books (admits 74–96% of names) — letting solidly-fillable names back in without opening the door to junk. **Proposed B.2 bounded range: lq_min 35–40** (provisional center ~38 ≈ $6.3k), down from 43.
- **The exact point inside 35–40 is set by the slippage/position-size anchor (Phase-25 sizing).** Smaller positions → ~35 ($3k depth ample); larger positions → ~38–40 ($6–10k). B.2 ships the range; the point-tighten settles it.

## Coordination with min_depth_usd (Langston Q1 derived-linkage invariant)
min_depth two-way = $2,000 (vts) / $5,000 (active). If lq_min lands ~38 (~$6,300 ask-implied), then min_depth ≈ 25% of that ≈ $1,575 — so the **current $2,000/$5,000 floors become coherent** as a ~25–80% thin-bid sub-threshold once lq_min comes down to the high-30s. Write the ratio as the invariant; the floors likely need only minor (if any) adjustment.

## Langston Q4 ordering-invariant — FIRES
strong_trend lanes are lq_min 30/35. If main lq_min lower bound = 35, strong_trend (30/35) is no longer reliably *looser* than the standard gate. **Action:** if the proposed range lower bound is 35, drop strong_trend to ~28–32 to preserve its deliberately-permissive ordering.

## Model-validation (Langston D, ±3pp) — APPROXIMATE, with caveat
At lq_min=43 the sweep rejects 66.70% (RTH-clock) / 56.50% (off-hours) of observations; live per-family LQ reject is ~60.44%. Directionally consistent (43 ≈ ~57–67% reject); NOT a strict ±3pp match because (a) denominators differ (per-observation here vs per-family-eval live) and (b) see the data caveat below.

## ⚠️ HONESTY CAVEAT — no true US-RTH session captured yet
The window ends 2026-06-02 10:20 UTC, **before Monday's true US RTH (13:30 UTC) begins**. So the "RTH-clock" segment is entirely **Sunday 06-01 13:30–20:00 UTC — US markets CLOSED** (xStocks trade 24/5, but that's not real RTH). **We have ZERO true-RTH depth sessions so far.** The distribution SHAPE and the "43 is too strict" conclusion are robust (visible in every segment), but the precise range and the RTH/off-hours split are provisional until real RTH sessions accumulate forward (per Q2: tighten on RTH-session count, ~from 2026-06-09). This is exactly why B.2 ships a RANGE, not a point.

## Langston range-read (2026-06-02) — ENDORSED 35–40 + 4 guardrails (ABSORBED)
Langston endorsed the range and ship-now-tighten-later. Four guardrails, all absorbed:
1. **Sizing-anchored lower bound.** Don't go below ~38 until the point is anchored to the actual Phase-25 position size — below ~38 (~$3–6k) a large fill could move the book. **Provisional center firms to 38–40** until sizing is known.
2. **Trigger the point-tighten on TRUE-RTH-session count (≥5 real RTH sessions), not a calendar date** — a holiday-thinned week gives fewer real sessions than 06-09 implies.
3. **Relational strong_trend, not hardcoded.** `strong_trend_lq = max(30, main_lower − 5)` — preserves the deliberately-permissive ordering if the main bound moves; the `max(30,…)` (~$1k) floor stops a strong-trend signal dragging into a genuinely-untradeable book.
4. **Pre-APPLY checks (gate the tighten, not the B.2 proposal):** (a) asset-class-key verify; (b) load check — admitted names jump 149→360–467 (**2.4–3.1×**) into signal-eval/VTS; check vs CPX22 + 1.3× load gate before APPLY; (c) grep xStock scoring for hardcoded `43`.

## Verification follow-ups (Langston guardrails 4a/4c + min_depth bid-side)
- **(4c) Hardcoded `43`: CLEAR.** grep of `server/asset_classes/xstock_spot` for `\b43\b` → only a code comment ("see import at line 43"); no threshold hardcode. lq_min is DB-resolved from `screener_filters` (config.lqMin).
- **(4a) Asset-class-keyed: CONFIRMED.** lq_min lives in `screener_filters` per `(mode, asset_class='xstock_spot', filter_path)`; crypto LQ is a SEPARATE volume-based formula (`imf-metrics.ts`), untouched. The B.2 proposal edits only xstock_spot rows → crypto's gate cannot leak.
- **min_depth bid-side check (Langston Q1 — books are NOT assumed symmetric, now measured):** per symbol×20-min median depth — ask p50 $16,472 / bid p50 $15,860 (**bid only ~4% thinner**); bid is the binding (thinner) side **63.90%** of the time; two-way-min p50 $12,601. Two-way reject at the current floors: **$2,000 → 9.40%**, **$5,000 → 21.24%**. **Reading:** books are near-symmetric, so the ask-derived ~25% linkage holds; the **$2,000 vts floor is a coherent thin-book catch** (rejects the genuinely-thin 9.4%, sits below the lq_min-38 ask-implied $6.3k). The **$5,000 active floor (21.24%) is the tighter one — flag "revisit at the active-trading flip (sub-batch 18 / Phase 19)," do NOT block B.2** (active dormant).

## Ledger-fill note (denominator — resolve in Step-4 with Langston)
The lq_min current_result is a per-family LQ-reject (34,285/56,725, 3-week eval window); the depth sweep yields per-(symbol×bucket) pass-rate / names-admitted over the 2-day depth window — a DIFFERENT denominator (Langston D / synthesis open-q). Since the target is a RANGE and the data is pre-true-RTH, **B.2 fills `planned_value`='35–40 (proposed; point at tighten)', `status`='proposed', `planned_sub_batch`='B.2', and leaves `planned_result` em-dash until the point-tighten produces a denominator-matched number** (after true-RTH data). Confirm this with Langston in the Step-4 migration review.

## Volume-gate disposition (Langston condition B — RESOLVED via prior verification, NOT re-derived)
**The 24h `volume` field = the UNDERLYING EQUITY's share volume, NOT the xStock token's — ALREADY VERIFIED** (Kyle 2026-06-02 pointer; multi-LLM + prior-CC-session research in `Claude Comms and Packages/X-Stocks Volume Feed Research - Multi LLM.md`). Decisive evidence on record: at ~$438/token, the ~13–44M `volume` implies **$6–20 billion/day**, which matches real TSLA SHARE volume — impossible for the token (cross-venue ~$10M, on-Kraken ~$926K/day). The ticker's `volume`/`vwap`/`high`/`low`/`prev_day_volume` fields are underlying-referenced; **only `bid`/`ask`/`bid_qty`/`ask_qty` are Kraken's real executable book** (so our depth metric ask×ask_qty reads REAL Kraken depth, not the underlying).

**There is NO "missing volume half" — DEPTH is the correct, permanent liquidity screen for xStocks.** Under Kraken's market-maker-quoted CLOB (MMs hedge into the deep underlying market), the binding execution constraint is **live order-book DEPTH** (bid_qty/ask_qty + the book ladder), not matched volume. The research's explicit conclusion: *"stop asking what's the 24h volume; ask what's the live book depth on the specific name."* This validates the B.1.5 switch to depth-based LQ + the B.2 lq_min recalibration as the correct lever.

**Disposition (resolves Langston B):**
- `min_volume` stays **retired/inert** for `xstock_spot` (wrong instrument); logged to the **Phase-16 legacy-component register (#136)** — mark-don't-delete (§5#18).
- The "successor" is **depth itself (LQ + min_depth)** — the documented-correct PERMANENT proxy, not a token-volume gate. Kyle's "liquidity AND volume" is satisfied because for THIS product volume is the wrong question; depth answers both.
- OPTIONAL future activity sanity-check (a confidence signal, NEVER a gate; Phase-25+ if ever): the per-bar `trades` count already carried in the OHLC feed, or an aggregated public-Trades-channel token volume — answers "is this name actually trading," not "can I fill my size."

---

## Reproducible SQL (run on staging via `psql -f`)
```sql
-- B.2 — xStock LQ (liquidity/depth) sensitivity sweep (archive-replay, read-only)
-- Reproduces the production LQ gate over historical order-book depth and tabulates
-- pass-rate at candidate lq_min thresholds, segmented RTH vs off-hours.
--
-- LENS (Kyle 2026-06-02 / ADJUSTMENT_FRAMEWORK §1.1 axiom 6): the target is the
-- depth below which a book is too thin for a clean fill (= not a solid opportunity),
-- NOT an admit-rate. Reject rate here is an OUTPUT, reported not chased.
--
-- Production gate (server/asset_classes/xstock_spot/imf-liquidity.ts:52-61):
--   LQ = clamp_0_100( log10(askDepthUsd + 1) * 10 ),  ASK-side only.
--   askDepthUsd = rolling-20-min MEDIAN of ask*ask_qty (scanner.ts:620-629, rule #13).
-- Gate: LQ >= lq_min  <=>  med_ask_depth >= 10^(lq_min/10) - 1.
--
-- Approximation vs production: production uses a trailing-20-min window ending at each
-- scan cycle's "now"; this sweep uses fixed 20-min epoch buckets per symbol. Faithful
-- for a distribution; denominator (per symbol×bucket) differs from the live per-family
-- LQ-reject denominator, so the cand=43 pass-rate is directionally — not exactly —
-- comparable to the live ~60.44% per-family reject (39.56% pass).
-- RTH = US equity regular hours 13:30–20:00 UTC (June = EDT). xStock trades 24/5 but
-- depth is thickest in RTH; off-hours depth collapses, so segments are reported apart.

\set ON_ERROR_STOP on
\timing off

-- Session scratch (read-only against real data; temp table is session-local)
DROP TABLE IF EXISTS b2_buckets;
CREATE TEMP TABLE b2_buckets AS
WITH snap AS (
  SELECT symbol,
         ask*ask_qty AS ask_depth,
         (timestamp 'epoch' + floor(extract(epoch from captured_at)/1200)*1200 * interval '1 second') AS bucket_start
  FROM xstock_spot_ticker_snap
  WHERE bid > 0 AND ask > 0 AND bid_qty > 0 AND ask_qty > 0
)
SELECT symbol,
       bucket_start,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY ask_depth) AS med_ask_depth,
       (bucket_start::time >= time '13:30' AND bucket_start::time < time '20:00') AS is_rth
FROM snap
GROUP BY symbol, bucket_start;

\echo ''
\echo '=== (1) Window + observation coverage ==='
SELECT min(bucket_start) AS earliest_bucket,
       max(bucket_start) AS latest_bucket,
       count(*) AS observations,
       count(DISTINCT symbol) AS symbols,
       count(*) FILTER (WHERE is_rth) AS rth_obs,
       count(*) FILTER (WHERE NOT is_rth) AS offhours_obs
FROM b2_buckets;

\echo ''
\echo '=== (2) Ask-depth-USD distribution (per symbol x 20-min median), by segment ==='
SELECT CASE WHEN is_rth THEN 'RTH' ELSE 'off-hours' END AS segment,
       count(*) AS obs,
       count(DISTINCT symbol) AS symbols,
       round(percentile_cont(0.10) WITHIN GROUP (ORDER BY med_ask_depth)) AS p10_usd,
       round(percentile_cont(0.25) WITHIN GROUP (ORDER BY med_ask_depth)) AS p25_usd,
       round(percentile_cont(0.50) WITHIN GROUP (ORDER BY med_ask_depth)) AS p50_usd,
       round(percentile_cont(0.75) WITHIN GROUP (ORDER BY med_ask_depth)) AS p75_usd,
       round(percentile_cont(0.90) WITHIN GROUP (ORDER BY med_ask_depth)) AS p90_usd
FROM b2_buckets
GROUP BY segment
ORDER BY segment;

\echo ''
\echo '=== (3) LQ sweep: pass-rate at each candidate lq_min, by segment ==='
\echo '    (pass = book deep enough to clear the gate; implied_usd = required ask-depth)'
WITH cands(lq) AS (VALUES (30::numeric),(33),(35),(38),(40),(43),(45))
SELECT c.lq AS cand_lq_min,
       round(power(10, c.lq/10) - 1) AS implied_ask_depth_usd,
       CASE WHEN b.is_rth THEN 'RTH' ELSE 'off-hours' END AS segment,
       count(*) AS observations,
       count(*) FILTER (WHERE b.med_ask_depth >= power(10, c.lq/10) - 1) AS pass,
       round(100.0 * count(*) FILTER (WHERE b.med_ask_depth >= power(10, c.lq/10) - 1) / count(*), 2) AS pass_pct,
       round(100.0 * count(*) FILTER (WHERE b.med_ask_depth <  power(10, c.lq/10) - 1) / count(*), 2) AS reject_pct
FROM b2_buckets b CROSS JOIN cands c
GROUP BY c.lq, segment
ORDER BY c.lq, segment;

\echo ''
\echo '=== (4) Distinct names admitted >=50% of their RTH buckets, at each candidate ==='
\echo '    (how many xStock names become reliably tradeable on liquidity, RTH)'
WITH cands(lq) AS (VALUES (30::numeric),(33),(35),(38),(40),(43),(45)),
per_sym AS (
  SELECT c.lq, b.symbol,
         avg( (b.med_ask_depth >= power(10, c.lq/10) - 1)::int ) AS pass_frac
  FROM b2_buckets b CROSS JOIN cands c
  WHERE b.is_rth
  GROUP BY c.lq, b.symbol
)
SELECT lq AS cand_lq_min,
       count(*) AS symbols_with_rth_data,
       count(*) FILTER (WHERE pass_frac >= 0.5) AS names_admitted_majority,
       round(100.0 * count(*) FILTER (WHERE pass_frac >= 0.5) / count(*), 2) AS pct_names_admitted
FROM per_sym
GROUP BY lq
ORDER BY lq;

DROP TABLE IF EXISTS b2_buckets;
```
