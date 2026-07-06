# B-NEW-53 proof-of-capture parity re-run — findings (2026-07-06, alert 7362f63f)

**Run:** `scripts/b5-w20c-provenance-replay.ts` (provenance-fed successor to the W2.0b reconstruction harness), executed on staging against the live DB, read-only. 8 iterations (v1–v8); harness-fidelity defects fixed in-run are listed in §3 — they are exactly the class of error the RI-a checksum was designed to catch, and it caught them.

## 1. Verdict against the alert's three steps

| Alert step | Result |
|---|---|
| 1 — `xstock_spot_ohlc_1m` retention ≥ 90d | **PASS** — 365d. |
| 2a — provenance COVERAGE (C1, reported separately) | **PASS, emphatic — 100.00%** (1,648,040 of 1,648,098 base vwap_pullback decisions since 2026-06-08 carry a provenance row; base-driven LEFT JOIN). The independent-drop-oldest-buffers desync risk did not materialize. |
| 2b — Tier-1 fired/no-fire parity ≥ 99% on captured rows | **FAIL — 70.73% overall** (2,122/3,000 stratified sample; fired half + systematic no-fire stride). Tier-2 (reason-within-no-fire) **PASSES at 97.67%** (target 95%). Zero look-ahead violations, zero drops. By week: 59.3% → 63.8% → **83.9%** → 77.9% → 81.6% (improving era-trend, plateaus mid-80s). |
| 3 — resume the Phase-25 entry-trigger sweep (25-12) | **NOT RESUMED** — gate not cleared. Stays data-blocked with a NEW defined exit (§4). |

## 2. Root cause of the residual gap — the settled-bar REFERENCE, not the forming bar

The B-NEW-53 lean design persisted the forming bar BY VALUE but the settled bars **by reference** (`settled_bucket_ts` + `settled_bar_count` against `xstock_spot_ohlc_15m_snapshot`), on the premise "settled bars are already persisted → referenced, not duplicated."

The RI-a checksum (harness stop/target vs the PERSISTED decision-time levels, on rows where both live and replay fired) measures that premise directly: **33% byte-exact, 64% within 0.1%, the rest drifted.** Since the replay feeds the referenced bars through the same deterministic code (same constants — ONE hash across the whole era; MCE cache bypassed; era-correct disposition; live-recipe DBS), identical arrays would produce identical outputs. They don't — therefore **the snapshot table's bars do not always byte-match the in-memory series the engine actually evaluated.** Mechanism candidates (not further discriminated tonight): post-restart cache rebuilds from 1m data vs originally tick-aggregated bars (restart#446-era churn; deploys near-daily), bar corrections/rewrites, aggregation-seam differences. Misses concentrate as `price_position` (VWAP-band flips — cumulative VWAP over 240 bars is highly sensitive to small series differences) and `guard_fail` (reachability flips off ATR/vwap deltas near the boundary).

**What the re-run PROVED about the capture (the good news):** the old W2.0b conclusion — "the irreducible ~20% is the un-persisted forming bar" — is now closed: the forming bar by value works (misses do NOT cluster on forming-bar effects; the checksum-exact rows include full forming-bar reproduction). Coverage is total. And the checksum column earns its keep as a per-row verifiability oracle. Additionally, the OLD harness's 80% ceiling is now known to have included two replay-side artifacts we found here (MCE 60s cache serving frozen indicators under time-compressed replay; NEUTRAL-DBS geometry-lane mislabeling).

## 3. Harness-fidelity defects fixed during the run (each moved Tier-1 materially)

1. **Era-correct gate disposition** — the xStock VTS lane hard-dropped quality guard fails (`'enforce'`) until reorg-B3.3x deployed 2026-06-24T21:50Z, then tags (`'tag'`). Replaying single-disposition mislabels every guard-tagged fire. (45% → ~66%.)
2. **`captured_at` is the archive batch-writer FLUSH time** (minutes after the decision) — never anchor look-ahead or era checks on it; anchor on the provenance pair itself (settled < forming; NOT contiguity — xStock 24/5 weekend gaps are legitimate).
3. **MCE's 60s per-symbol context cache is FATAL under replay** — days compressed into seconds meant every call after a symbol's first served the first decision's frozen indicators (measured: ATR frozen across an hour; checksum 0-exact-of-521). Cleared per decision. (66% → 71%, Tier-2 93% → 98%.)
4. **The live eval receives a real scanner-computed `propagatedDbs`** (which selects vwap_pullback's geometry LANE) — reconstructed per decision from the captured bars via the scanner's verbatim recipe. (Neutral-DBS replay is wrong-in-principle even though the net Tier-1 effect here was small.)

## 4. Forward fix + homes (§9.4 — concrete, named)

- **B-NEW-53.3 (named micro-batch, same instrumentation family; sequence AFTER B8.4 — must not delay the switch-on):** extend the provenance row with a **settled-window integrity leg** — either (a) a `settled_window_hash` (one hash of the exact settled array at decision time; replay verifies byte-parity per row and filters to verified rows), or preferably (b) persist the five decision-time INDICATOR VALUES the geometry consumes (vwap, atr, sma, high24h, low24h — five numerics, cheaper than the hash to consume and directly replayable even when bars drifted). Decision (a)-vs-(b) at that batch's Step-1 with Langston. After deploy, a post-accrual §10.5 alert re-runs this harness (~3 weeks accrual) — the same defined-exit discipline as this alert.
- **RUNNING_ISSUES #206** carries this dated update; roadmap **25-12 stays data-blocked** with B-NEW-53.3 + re-accrual as the new exit.
- The harness (`b5-w20c-provenance-replay.ts`) is committed with this report — the next re-run starts from a correct tool.

## 5. Alert disposition
`7362f63f` resolved by cc-session-2026-07-06 with this report (coverage PASS / parity FAIL-with-diagnosis / study NOT resumed / forward fix named). Reported to Kyle (plain language, Discord + Desktop) and Langston (this file).
