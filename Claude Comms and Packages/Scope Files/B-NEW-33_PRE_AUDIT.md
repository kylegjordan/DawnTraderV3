# B-NEW-33 — Pre-Audit

**Date:** 2026-05-15
**Branch:** `migration/aws-supabase`
**Scope:** `B-NEW-33_SCOPE.md` (sibling file)

---

## 1. Cron failure-mode investigation (the smoking gun)

PM2 log of nightly `npm run b67:replay-ablation` cron, last 3 attempts:

```
[B67.0][replay-ablation] Pending rows: active_signal=0 vts_trade=32673
[B67.0][replay-ablation] VTS index loaded: 2207 closed trades from last 14d, 677 (symbol|strategy) buckets
[B67.0][replay-ablation] VTS replay: matched=0 unmatched=5000 (unmatched = trade still open or file missing)
```

Three nightly attempts, three "matched=0/5000" results. The match logic loads 5000 pending ablation rows per pass, hits 0.

**Critical timeline correlation:**
- Replays worked May 1-7 (peak ~2000/day)
- May 8: dropped to 238/day
- May 9-10: dropped to 17-32/day
- May 11+: zero
- **B79.0g-tx shipped 2026-05-11** (atomic close-time soft-delete for `vts_open_trades`).

`vts_open_trades` table state per psql 2026-05-15: **657 closed trades, all with `closed_at ≥ 2026-05-11`**. Before B79.0g-tx, closed trades were DELETED from this table (`deleteOpenTrade` pattern). The soft-delete pattern is what now retains them.

**Hypothesis:** B79.0g-tx changed how VTS trade closure persists. The cron reads "VTS JSONL logs" for the closed-trade source. Either:
- (a) B79.0g-tx altered the JSONL write semantics (e.g. removed JSONL writes in favor of pure DB persistence), OR
- (b) JSONL files exist but the natural-key matcher logic in `replay-ablation.ts` is broken for the new shape

Pre-audit MUST verify which of (a) or (b) is the actual cause. Path forward = read closed trades from `vts_open_trades WHERE closed = true` instead of JSONL files. DB-backed source is canonical post-B79.0g-tx.

---

## 2. SIM consult: components affected

Reference: `1-system-manual/SYSTEM_IMPACT_MAP.md`

### Components touched by B-NEW-33

| Component | Pre-B-NEW-33 state | B-NEW-33 change |
|---|---|---|
| `server/scripts/replay-ablation.ts` | Cron-driven; loads 5000 pending rows; reads JSONL for closed trades; natural-key match (pairSymbol, evaluatedAt±60s, strategy); matches 0/5000 since 2026-05-11 | Either (a) refactor closed-trade source from JSONL → DB (`vts_open_trades WHERE closed=true`), bundled with the CLI tool; OR (b) leave cron untouched, write standalone CLI tool — TBD per Langston Q1 |
| `scripts/b-new-33-factor-backtest.ts` (NEW) | doesn't exist | one-shot CLI: reads pending ablation rows, runs replay logic, computes per-lever verdicts, writes Markdown report |
| `server/services/drift-dashboard-aggregator.ts::computeFactorCalibration` | Reads `regime_factor_alternates WHERE replay_completed_at IS NOT NULL`; computes per-factor tertile WR + lift; gated on `MIN_N_PER_BUCKET=150` | **NO CHANGE.** Existing UI panel continues unchanged. CLI is out-of-band. |
| `regime_factor_alternates` (DB table) | 40,642 rows; 7,593 replayed; 33,049 pending | rows get replayed → drain backlog; no schema change |
| `vts_open_trades` (DB table) | 732 rows, 657 closed since 2026-05-11 | read-only access; no schema change |
| `/api/analytics/factor-calibration` route | live; reads computeFactorCalibration | NO CHANGE |
| FactorCalibrationSection UI panel | live; renders aggregator response | NO CHANGE (just sees more rows once backlog drained) |

### UPSTREAM dependencies the CLI tool relies on

- `regime_factor_alternates` schema correctness (asset_class column populated correctly per BATCH_82 fix)
- `vts_open_trades.closed_at` populated correctly (B79.0g-tx + B83 hotfix `tradeId` fix)
- VTS close cascade order: `openVirtualTrades.delete(id)` THEN `persistRealPriceTrade` THEN `markOpenTradeClosed` (per B79.0g-tx R1 Langston catch)
- Crypto factor families emitting (10/10 verified continuous via factor-ablation-emitter; BATCH_82 fix ensures asset_class threading)

### DOWNSTREAM consumers

- B67.5 design (next batch) will read the verdict Markdown to decide which levers to wire into the 7 consumer sites.
- No live runtime consumer reads ablation data outside the existing UI panel.

### SHARED STATE / BLAST RADIUS

- **DB writes:** the tool will write `replay_outcome` + `replay_completed_at` to ~33K rows. This is the SAME write pattern the nightly cron does (just bulkier in one pass). Risk: long-running transaction blocks other DB activity. Mitigation: batch the UPDATE in chunks of 1000 rows.
- **PM2 process:** the CLI runs as `npx tsx` subprocess, NOT inside PM2's main dawntrader process. No effect on live scanner/VTS cycles.
- **API panel:** during the run, the panel will show progressively more rows. Optional cosmetic concern — partially-replayed dataset shown to anyone watching the UI during the run window. Mitigation: schedule run during low-traffic window; OR commit-chunk-and-immediately-visible is fine since each chunk is a complete-row update.

**Blast radius:** LOW (out-of-band CLI tool; reads existing DB tables; writes only to `regime_factor_alternates.replay_outcome` + `replay_completed_at` columns).

---

## 3. Natural-key matching verification

Before the implementation, run these diagnostic SQL queries against staging:

```sql
-- Q1: Sample pending ablation row vs sample closed vts_open_trade — do natural keys align?
SELECT
  r.pair_symbol AS r_symbol, r.strategy AS r_strategy, r.evaluated_at,
  v.symbol AS v_symbol, v.strategy AS v_strategy, v.opened_at, v.closed_at,
  EXTRACT(EPOCH FROM (v.opened_at - r.evaluated_at)) AS opened_minus_evaluated_seconds
FROM regime_factor_alternates r
LEFT JOIN vts_open_trades v
  ON v.symbol = r.pair_symbol
  AND v.strategy = r.strategy
  AND v.closed = true
  AND v.opened_at BETWEEN r.evaluated_at - INTERVAL '5 minutes' AND r.evaluated_at + INTERVAL '5 minutes'
WHERE r.replay_completed_at IS NULL
  AND r.evaluated_at > NOW() - INTERVAL '4 days'
LIMIT 20;
```

If Q1 returns matches with reasonable `opened_minus_evaluated_seconds` (e.g. 30-180s positive), the DB-backed source is the right path and ±5min window is correct.

```sql
-- Q2: What % of pending ablation rows have a matchable closed VTS trade?
SELECT
  COUNT(*) AS total_pending,
  COUNT(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM vts_open_trades v
    WHERE v.symbol = r.pair_symbol AND v.strategy = r.strategy AND v.closed = true
      AND v.opened_at BETWEEN r.evaluated_at - INTERVAL '5 minutes' AND r.evaluated_at + INTERVAL '5 minutes'
  )) AS matchable
FROM regime_factor_alternates r
WHERE r.replay_completed_at IS NULL AND r.asset_class = 'crypto_spot';
```

If Q2 shows ≥30% matchable, the approach is viable. If <10%, the matching key is wrong or VTS closed-trade retention is sparse.

These queries are part of the implementation step's first verification gate, not deliverables for the scope review. Including here so Langston sees the diagnostic plan.

---

## 4. Test plan

| Test | Type | Pass criterion |
|---|---|---|
| Cron failure replicated | repro | run `npm run b67:replay-ablation` on staging, observe matched=0 in log |
| DB-backed source coverage | data check | Q2 above returns ≥30% matchable |
| Replay logic correctness on small sample | unit | dry-run mode on 100 rows produces sensible `replay_outcome` shape; spot-check against known-closed trades |
| Bulk backfill safety | integration | UPDATE batched in 1000-row chunks; no transaction held >30s; psql `pg_stat_activity` shows no long-running queries |
| Verdict math correctness | unit | hand-crafted dataset → tertile splits hit expected boundaries; spread computation matches a manual calculation; p-value matches scipy reference for the same 2×2 contingency table |
| Decision-grade gate semantics | unit | factor with n=149/bucket fails; n=150 passes; spread=6.9pp fails; 7.0pp passes; p=0.051 fails; p=0.049 passes |
| Crypto factor families still emitting post-run | regression | psql before/after counts on `regime_factor_alternates` show continued growth from live emit (no write-side blocker introduced) |
| API panel renders correctly post-run | smoke | curl `/api/analytics/factor-calibration?window=rolling_30d` returns 10 factors with n_replayed numbers matching post-drain DB count |

---

## 5. Estimated work + sequencing

- Step 1 (scope) — ~1h, DONE
- Step 2 (this pre-audit) — ~1h, DONE
- Langston review — pending
- Step 3 (impl: CLI tool, natural-key fix, verdict math) — ~4-6h
- Step 4 (Langston code review) — pending
- Step 5 (CI green) — automatic
- Step 6 (run on staging) — ~5-15 min (drain ~30K rows in 1000-row chunks)
- Step 7-8 (verification + Langston Step 8) — ~1-2h
- Step 10-11 (governance + completion report) — ~1h

Total CC work ≈ 8-12h. One-day batch if Langston review turnaround is fast.

---

## 6. Standing rules verified

- Scope file written before implementation: YES
- Pre-audit consults SIM: YES (Section 2)
- Plain-language Kyle summary planned: YES (will be in completion report)
- NO PATCHES (long-term sustainable fix): YES — the natural-key matching fix is structural (DB-backed canonical source) not duct tape
- Per-asset-class default: this batch is crypto_spot only by design; xstock factor calibration is locked behind XSTOCK_CALIBRATION_PLAN Phase E
- Crypto regression check planned: YES (verification criterion 7)
- File-first protocol for the Langston ask (>3KB total): YES — scope + pre-audit total ~12KB; will scp to inbox

---

## 7. Open questions deferred to Langston review

Same Q1-Q5 listed at the end of `B-NEW-33_SCOPE.md` §8.

---

## 8. Langston review outcome — APPROVE with 4 conditions (2026-05-15)

**Verdict:** APPROVE — proceed to Step 3 once 4 implementation-step conditions are reflected in this pre-audit (amended below).

**Q1-Q5 answers from Langston:**
- Q1: Bundle the cron fix. Refactor shared logic into `factor-replay-core.ts`; both `replay-ablation.ts` (cron) and `scripts/b-new-33-factor-backtest.ts` (CLI) consume it.
- Q2: n≥150 / spread≥7pp / p<0.05 APPROVED. Binomial 95% CI half-width ≈ 8pp around WR=0.5 at n=150 supports the 7pp spread floor.
- Q3: Chi-square 2×2 (df=1) only. Skip Fisher's exact. Since n≥150 is the gate, n>100 always — Fisher only fires for sub-threshold buckets that are already INCONCLUSIVE.
- Q4: CLI Markdown to stdout + file. Don't conflate with live UI panel.
- Q5: ±5min APPROVED + closest-by-time tiebreak baked into matcher.

---

## 9. Implementation-step conditions (per Langston, AMENDED)

### Condition 1 — Canonical-source decision (resolved 2026-05-15)

**Coverage check ran 2026-05-15 15:40 UTC:**
- 3423 distinct pending (symbol, evaluated_at, strategy) signals in crypto_spot vts_trade backlog
- 532 (15.5%) matchable to `vts_open_trades WHERE closed = true` (post-B79.0g-tx canonical)
- 0 matchable to `paper_sim_trades` (active trading off; table empty for VTS-shadow data)
- JSONL files exist for May 1-15, but **closed trades are filed under their CLOSE-DATE filename, not OPEN-DATE filename** — empirically verified: SUI/USD reverse_impulse opened 2026-05-12, closed 2026-05-14 → exists ONLY in `2026-05-14.json`.

**Canonical-source decision (DUAL):**
- **Primary:** `vts_open_trades WHERE closed = true` for trades opened ≥ 2026-05-11 (B79.0g-tx soft-delete date)
- **Fallback:** JSONL files (`logs/virtual_trades/YYYY-MM-DD.json`) for trades opened < 2026-05-11. The cron's existing `buildVtsTradeIndex` reads these correctly; reuse the helper.
- **Match order:** DB first (faster, canonical), then JSONL fallback if no DB hit.
- **Unmatched after both sources tried** → mark `outcome = 'unreplayable_real_rejected'` with notes describing which sources were tried and the closest near-miss delta (for diagnostics). This is the bigger structural fix that the cron currently lacks (cron leaves unmatched rows pending forever — same 5000 rows re-queried every night, blocking progress).

### Condition 2 — Verification criterion 2 REFRAMED

**Old:** "Pending drops from 33,049 to <1000"
**New:** "≥85% of *matchable* rows drained, where matchable = closed trade exists in DB or JSONL within ±5min and same (symbol, strategy)."
**New criterion 2b:** Unmatched rows are MARKED `unreplayable_real_rejected` (not left in pending limbo) so subsequent cron passes skip them. After this batch, the cron's pending-row backlog stays bounded — only NEW rows from the live stream queue up between nightly runs.

### Condition 3 — Negative-control test ADDED

Test plan addition:
- Synthetic dataset where `alt_decision.confidence = real_decision.confidence + uniform_noise(-0.01, 0.01)` for all rows → tertile WR analysis should produce real_spread ≈ alt_spread → predictive_lift ≈ 0 → verdict INCONCLUSIVE for ALL factors.
- This catches verdict-math regressions where a degenerate lever accidentally gets a false KEEP from random spread noise.
- Implementation: a `--dry-run-synthetic` flag on the CLI that generates 1000 synthetic rows in memory and runs verdict math without touching the DB.

### Condition 4 — Closest-by-time tiebreak

If multiple closed trades match `(symbol, strategy)` within ±5min of `evaluated_at`, pick the one with `opened_at` closest to `evaluated_at`. Already implemented in the existing `findVtsTradeByNaturalKey` helper (line 165-171 of `replay-ablation.ts`). Extract to `factor-replay-core.ts` preserving the tiebreak.

---

## 10. Actual cron failure root cause (post-investigation, 2026-05-15)

Original assumption: B79.0g-tx broke JSONL writes or natural-key format. **Actual cause is subtler:**

1. `replay-ablation.ts` does `.limit(5000)` with **no ORDER BY**. Postgres returns the same 5000 rows on each pass (some deterministic but arbitrary order based on heap layout).
2. If those 5000 rows happen to be from "rejected signals" (signal emitted but trade not opened — `unreplayable_real_rejected` cases), match rate is 0.
3. The cron **does NOT mark unmatched rows as anything** — line 311 explicitly leaves them pending "in case the trade closes later".
4. Result: same 5000 unreplayable rows re-fetched every night, matched=0, no progress for matchable rows beneath the 5000 ceiling.

**Why it worked May 1-7 then dwindled:**
- Pre-May 7: backlog was small enough that the 5000 ceiling captured matchable rows.
- May 8+: backlog grew faster than nightly throughput; the unmatched-and-not-marked rejected rows accumulated at the top of the heap and consumed the 5000 slots.
- May 11 (B79.0g-tx): coincidence in timing, not the actual cause. B79.0g-tx changed the canonical source for closed-trade lookups (JSONL → vts_open_trades for trades opened post-cutoff), which made an already-broken cron worse.

**Structural fix in B-NEW-33:**
- Process all pending rows in a single CLI pass (no 5000 limit).
- Mark UNMATCHED rows with `unreplayable_real_rejected` so subsequent cron runs skip them.
- Cron's nightly delta-only workload becomes a few hundred rows max (rows emitted that day) instead of thousands of stale-unmatchable rows.
