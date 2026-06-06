# B.5 W2.0b — Entry-trigger / admission sweep — PRE-AUDIT (Step-2 gate for Langston)

**Date:** 2026-06-06. **For Langston's Step-2 pre-audit GATE — read + ACK before I build the harness.** Read-only diagnostic batch (no production code/seed changes; nothing deployed). Active trading OFF. **INFRASTRUCTURE NOTE: do NOT cd to /mnt/gdrive or run find/git on the gdrive mount — it hangs. This file is staged on your LOCAL inbox; read it there. Use `ssh staging` for any live inspection.**

---

## 0. Where this sits

W2.0a (geometry sweep) is CLOSED: re-tuning post-entry stop/target geometry yields ≈no generalizing edge (only vwap_bounce a thin pre-register candidate). That confirmed the HCE thesis at the geometry level — **the lever is selectivity / admission, not post-entry placement.** So W2.0b is the reweighted priority: **does each strategy pull the entry trigger at the right MOMENT, and would different entry-trigger thresholds admit a materially better-EV set of trades?** This is where the real EV is.

## 1. The core problem the harness must solve

The b31a engine (`scripts/b-xstock-calib-b31a-gate-audit-2.ts`) reads the PRE-COMPUTED `signal_eval_archive` and does NOT invoke detection — so it can score the signals the system ACTUALLY produced, but it CANNOT answer "what signals WOULD the strategy have produced at a different entry-trigger threshold?" That counterfactual requires **re-invoking the real detect functions** over historical bars with patched `module_constants`. That's W2.0b's new harness.

**The danger:** if the harness re-implements or approximates the detection logic, any "edge" it finds is an artifact of the approximation, not the real system. So the harness MUST call the **actual production detect functions**, and MUST prove it reproduces the real system's decisions at baseline before any swept result is trusted. That proof is the hard parity gate.

## 2. Detection surface (Step-1.a architectural read — confirmed)

- **Dispatcher:** `callStrategyDetect(strategy, indicators, ohlcData, patternInput, symbol, assetClass)` — `vts-runner.ts:834-920`. assetClass REQUIRED (B79.0n.STRATEGY). Wraps `callStrategyDetectRaw` + `stampMaxHoldingMs`. Returns `StrategySignal | null` + a terminal null-reason.
- **Detect fns (the 9 enabled xStock strategies):** `strategy-engine.ts` — `detectVWAPPullback` (156-303), `detectSMATrendRide` (429-548), `detectBreakout` (550-646), `detectMeanReversion` (649-735), `detectRangeTrading` (738-832), `detectVWAPBounce` (834-942); separate files `server/strategies/inside-bar-reversal.ts:65-226`, `pivot-shift.ts`, morning_star (pattern-driven). All LONG-ONLY (`sell_disabled_long_only` gate).
- **Settings resolver:** `getCachedNumbersForModule('strategy.<name>', _SE_KEY(name, assetClass))` — `module-constants-service.ts:333-360` (60s TTL; throws if not prefetched). `_SE_KEY` `strategy-engine.ts:31-33` → `{exchange:'*', assetClass, strategy, regime:'*'}`; most-specific-wins via `scoreRowForKey` (108-128). **Seeding `xstock_spot` rows overrides ONLY xStock; crypto reads `*`.**
- **Parity source:** `signal_eval_archive` (schema `2026-05-05-b70-data-archive-tables.sql:84-112`; writer `signal-eval-archiver.ts:76-113`). Cols: `captured_at` (1-min precision), `symbol`, `strategy`, `reject_stage` (`admitted|strategy_internal|pre_filter|sqe|rtb|tcl`), `features` JSONB, `gate_decision` JSONB (`reason`), `asset_class`, `mode`, `source`.
- **15m bars:** `xstock_spot_ohlc_15m_snapshot` (the REAL engine input) + aggregator `ohlc-aggregator.ts:170+` `aggregateXstockOHLC(symbols,15,…)` MAX_BARS_15M=240. Bar-close only; partial/forming bar is the in-progress bucket (must NOT feed a look-ahead-completed bar to a decision at minute T).

## 3. The harness design (what I propose to build)

A new read-only script `scripts/b5-w20b-entry-replay.ts` that, per strategy:

**Step A — Reconstruct the decision stream at BASELINE thresholds.**
For each `(symbol, captured_at)` decision row in `signal_eval_archive` (xstock_spot, the strategy, the study window), rebuild the exact `indicators` + `ohlcData` + `patternInput` the engine saw at that minute from the 15m snapshot (bar-close as of `captured_at`, no look-ahead), resolve baseline `module_constants` via the real resolver, and call the REAL `callStrategyDetect(...)`. Record the harness's `reject_stage` + terminal reason.

**Step B — HARD PARITY GATE (the gate you'll hold me to).**
Compare the harness's baseline decision to the archived `reject_stage` + `gate_decision.reason` for the same `(symbol, captured_at, strategy)`. **Pass = ≥95% exact match on (reject_stage, terminal-reason) across the strategy's decision rows.** If a strategy fails parity, I do NOT sweep it — I report the mismatch class (which input couldn't be faithfully reconstructed) and either fix the reconstruction or declare that strategy INCONCLUSIVE-by-data (same discipline as W2.0a Mode-A → the gate did its job). **No swept number is trusted for a strategy that hasn't passed parity at baseline.**

**Step C — The entry-trigger sweep (only on parity-passing strategies).**
Grid-sweep that strategy's ENTRY-TRIGGER knobs (NOT stop/target geometry — that's W2.0a/keep-baseline) by patching the resolved `module_constants` value in-memory and re-invoking detect. For each grid point, the swept admission set → score with the b31a machinery (forward EXCESS-return via `fwdReturn` + `hitOrder` L2 walk on 15m/1m bars, AUC, per-day consistency, train/test 70/30 split). A knob change is a CANDIDATE only if it lifts test-set excess-R with a broad (not razor-edge) plateau and ≥ the min-sample floor (N≥40 like W2.0a). Candidate-only; adoption gated Phase 19/25.

**Per-strategy entry-trigger knobs to sweep** (from the resolver reads):
- vwap_pullback: `pullback_threshold_pct_default`, `volume_multiplier_default` (vol-confirm off for xStock → likely inert), `counter_trend_long_dbs_floor`
- sma_trend_ride: `entry_condition_default` ('above' vs 'break'), `sma_period_default`
- breakout: `min_consolidation_bars`, `breakout_buffer_pct` (vol gate disabled for xStock)
- mean_reversion: `mean_type_default`, `midpoint_range_min_bars`, `midpoint_range_max_pct`
- range_trade: `min_boundary_touches`, `range_detection_min_bars`, `range_detection_max_pct`
- vwap_bounce: `bounce_threshold_pct`, `range_detection_min_bars`
- pivot_shift: indicator gate band (RSI 35-65 + ADX — B3.1a found this gate provably CORRECT; sweep is confirmatory only)
- morning_star / inside_bar_reversal: pattern-driven (see RI-b below)

**Step D — RI-b fold-in: breakout + inside_bar_reversal zero-fire diagnosis.**
These two NEVER fire on xStock (0 admits). Instrument the terminal-reason DISTRIBUTION at baseline to separate **placeholder-param-gating** (a crypto-tuned threshold is mechanically rejecting everything → a real W2.0b candidate to retune) from **true-no-setup** (the setup genuinely doesn't occur on 15m xStock bars → not a tuning problem, surface to ASSET_CLASS_ONBOARDING_WORKFLOW). Architectural read predicts: breakout → likely `range_not_found` (no tight consolidations); inside_bar → likely `no_pattern` (15m too coarse for the inside-bar shape, ~228k no_pattern rejects in the b31a window). The harness CONFIRMS which, with counts.

**Step E — post-W2.0b geometry re-validation.**
After the entry-set is chosen, a cheap re-run of the W2.0a walker against the NEW entry-set to confirm the W2.0a "keep-baseline geometry" conclusion still holds on the re-admitted trades (geometry and entry interact).

## 4. SIM / System Manual consultation (Step-2)

- SIM has no dedicated "detect-replay" component (this is a read-only diagnostic script, not a production component) — consistent with how b31a + W2.0a harnesses are recorded (script-level, not SIM components). I will NOT add a SIM component for the harness, but WILL record the W2.0b findings + any candidate knobs in the calibration governance (MULTI_ASSET_VTS_EXPANSION_PLAN working-list + calibration_ledger) at close.
- The detection surface I'm calling IS documented (strategy-engine per-class threading from B79.0n.STRATEGY; resolver in SIM). No contradiction found. If the harness reveals a detect function reading a constant the docs don't list, that's a governance-gap to flag.

## 5. Questions for you (the gate)

1. **Parity gate definition:** is ≥95% exact match on `(reject_stage, terminal-reason)` the right bar, or do you want a stricter/looser threshold or a different match key (e.g. match on `admitted` vs `not-admitted` binary first, then reason within admitted)? W2.0a used 95% for geometry — I propose symmetry.
2. **Reconstruction fidelity risk:** the biggest risk is that `signal_eval_archive.features` doesn't carry every input the detect function needs (e.g. the exact `vwap`/`high24h`/`atr` the engine used), forcing me to recompute them from 15m bars — which could itself drift. Do you want me to FIRST do a "features-completeness" probe (enumerate what each detect fn reads vs what the archive stores) and report it before building, so we know upfront which strategies are reconstructable to parity?
3. **Window:** which study window — the same live-15m forming-bar window as B3.1a/W2.0a (so results are comparable), or a longer accrual now that 15m has been live since B.4? My lean: same window for comparability, note the N.
4. **breakout/inside_bar:** if RI-b shows true-no-setup (not placeholder-gating), do we just document it (onboarding workflow) and NOT sweep them — or do you want a sensitivity check that loosens the setup-detection threshold to see if ANY threshold makes them fire usefully?
5. **Scope check:** anything in this harness that risks touching crypto or the live system? (My read: zero — read-only, in-memory constant patching, no writes, no deploy. Confirm you agree before I build.)

**On your ACK I build `scripts/b5-w20b-entry-replay.ts`, run the parity gate first, and report parity results BEFORE any sweep numbers (so we catch a reconstruction problem the way W2.0a's Mode-A gate caught the geometry one).**
