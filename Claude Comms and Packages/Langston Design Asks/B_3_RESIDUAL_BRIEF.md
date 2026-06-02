# B.3 — Regime audit residual: the RANGE_BOUND gap puzzle (Langston brief)

> **INFRASTRUCTURE NOTE:** do NOT `cd /mnt/gdrive` or `git grep` the gdrive mount — it hangs. Read THIS file directly (local inbox). For repo inspection use `ssh staging` → `cd /home/deploy/dawntrader`. Facts embedded below.

## The result (audit ran on staging, 478 live-universe symbols, 60-bar parity recompute)

My faithful recompute (production `calculatePairRegime` + `computeDirectionalBias`, 60-bar window matching `getOHLCDataBatch(...,60)`, ATR verbatim from scanner.ts:56) over the recent window produces **RANGE_BOUND ≈ 6.4%**. Live (pair-cycle weighted) is **0.099%**. ~65× gap.

## What's RESOLVED
1. **Weighting:** the original live "0.02%" was raw `signal_eval_archive` rows (1 row per strategy×pair×cycle). Avg strategy-rows/pair-cycle: TFS 6.27, ST 4.26, HVU 3.75, IE 3.00, **RBS 1.00**. Re-weighting to pair-cycle aligns 4/5 regimes within ~5pp (TFS 27, ST 37.5, HVU 25, IE 10.5) — **classifier is NOT funneling**; Kyle's worry is unsupported. Only RBS stays anomalous.
2. **DX hypothesis REFUTED:** only 3.9% of non-RBS bars miss RBS *only* on dx (pass vol+|dbs|, fail dx<35); 54% of all bars already have dx<35. The dominant RBS near-miss is the **|dbs|<0.10 gate (23.2%)**. So raw-DX spikiness is NOT the RANGE_BOUND killer; crypto-fence-escalation candidate weakened.
3. **Intra-bar/real-time sampling REFUTED:** distinct regimes per (symbol, hour) in live archive = **87.07% have exactly 1**, 11.95% have 2, <1% have 3+. The live regime is STABLE within the hour — it is NOT flickering on a forming bar. So the gap is NOT a sampling-frequency artifact.

## The remaining puzzle
Recompute RBS bars are **borderline at the |dbs| gate**: |dbs| p50 0.050, **p95 0.096** (gate is 0.10). vol all <0.006, dx all <35. So these are fragile — a small upward shift in live effective |dbs| (or vol) flips ~all of them out of RBS into ST/TFS, which is exactly what live shows.

**Leading hypothesis now (was intra-bar; corrected):** the live path classifies on **live-aggregated OHLC** — `xstock-ohlc-cache.ts getOHLCDataBatch` reads the snapshot then merges a **NARROW 24h live overlay** ("live wins on bucket_ts collisions"), caps to 60 bars, and write-backs recent buckets. My recompute replayed on the **archived `xstock_spot_ohlc_60m_snapshot`** only. If the live-aggregated OHLC is slightly noisier / more-directional than the archived snapshot (which may be smoother / late-1m-settled), the live DBS sits a hair higher → calm borderline bars fail |dbs|<0.10 live but pass in the snapshot recompute → recompute overstates RBS, live ~0.1% is closer to truth.

## Questions for you (you traced the live chain at Step 4)
1. Do you agree the residual is **snapshot-vs-live-overlay OHLC fidelity**, not a classifier bug? Any other mechanism that would make live DBS systematically higher than a snapshot recompute for calm stocks (e.g. ATR source diff, propagated-DBS slope, a post-classify step)?
2. Is the live OHLC the scanner classifies on materially different from `xstock_spot_ohlc_60m_snapshot` for historical (non-tail) buckets — i.e. is the write-back faithful, or does the live aggregator produce values the snapshot never captures?
3. **Decision-relevant:** given (a) classifier not funneling, (b) dx fine, (c) RBS bars borderline & live-vs-snapshot is a known data-fidelity tail — is your call to **accept "RANGE_BOUND genuinely rare for live xStocks" and proceed to the strategy-gate calibration (B3.1)**, or do you want the snapshot-vs-live OHLC delta quantified first (compare recompute DBS vs a live-captured DBS for the same bars)?

Reply concise + code-level. Active trading OFF; this is all read-only analysis.
