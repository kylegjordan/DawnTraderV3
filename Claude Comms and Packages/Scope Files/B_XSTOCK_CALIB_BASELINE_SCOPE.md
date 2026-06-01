# B-XSTOCK-CALIB · B.0 PRE-CALIBRATION BASELINE — SCOPE v1

**Status:** v4 — GO. Langston Step 1 ACK absorbed (§8) + Kyle decisions absorbed (§9: numbers-first report, comparison tab is a SEPARATE follow-on batch, percentage/rate methodology, raw counts shown alongside every rate, depth approach CONFIRMED). Capture in progress 2026-06-01.
**From:** CC
**To:** Kyle (decider) + Langston (Step 1 reviewer)
**Date:** 2026-06-01
**Position:** NEW sub-batch inserted into the B-XSTOCK-CALIB umbrella as **B.0**, the FIRST capture step, executing BEFORE B.2 (IMF family threshold calibration) and before every other remaining calibration sub-batch. Kyle directive 2026-06-01: "establish a baseline / averages for everything we're about to change, identify what's definitely off now, and overlay the operational events so we don't read distorted windows blindly." xStocks ONLY — crypto explicitly out of scope. **No win/loss / P&L** — volume, rates, distributions, classifications, and filter behavior only.

**Read-only declaration:** B.0 changes NO system behavior. It adds NO gate, NO threshold change, NO migration that alters runtime. It MAY add a forward-capture telemetry sink (see §3.D) — that is additive logging, default-off until Langston ACKs. Everything else is archive query + archive-replay reconstruction. There is no UI change and no decision-path change.

---

## §0. Why baseline-before-calibrate (methodology)

Calibrating without a recorded "before" is the failure mode where we tighten knobs that were already fine and leave the genuinely-broken ones untouched. B.0 produces four things:

1. **Decision-grade averages** for every quantity B.2–D will change, computed as **rolling multi-day windows, never single-moment snapshots** (CLAUDE.md hard rule #13 — a snapshot can be off 10+ pts from the underlying rolling window; decisions get made from rolling windows or repeated measurements).
2. **A "definitely off NOW" list** — settings whose current value is provably mis-calibrated (a gate rejecting ~everything or ~nothing; a regime that is ~always or ~never; a strategy that never fires; a uniform global default that was never tuned).
3. **An event-timeline overlay** so every quiet or wild window is explained by an operational cause (weekend close, no-tick-history restart, the ~30h outage, the depth-filter go-live) BEFORE it is allowed to count toward an average.
4. **A regression-guard reference** so any later calibration that unexpectedly halves or doubles throughput is caught against the baseline.

**Anti-blind-spot rule:** an extreme window (near-zero flow OR unusually high flow) is NEVER averaged in until cross-referenced against `BATCH_CATALOG.md` / `RUNNING_ISSUES.md` / `CHANGES_AND_FIXES.md` for a deploy/fix/breakage that explains it. The cause may be entirely outside the scanned data.

---

## §1. Data-availability findings (investigated 2026-06-01 — code reads + live DB probe)

The corrected retrievability map. **CLEAN** = archived with timestamps, queryable over the target window. **REPLAY** = not stored, but reconstructable by re-running the production formula over archived raw inputs. **FORWARD-ONLY** = not retained historically; must accumulate going forward. **STALE** = stored but the writer stopped; only a fixed past window exists.

| Quantity | Source | Verdict | Note |
|---|---|---|---|
| **Regime classification distribution** | `signal_eval_archive.regime_label` (asset_class='xstock_spot') | **CLEAN** | 6,006,902 xStock rows, 2026-05-11 → live. Full 5-regime share computable. |
| **Downstream eval funnel** (strategy-eval → tcl → sqe → admitted) | `signal_eval_archive.reject_stage` | **CLEAN** | Live. Probe: strategy_internal 97.6%, tcl 2.3%, admitted 0.03% (1,800), sqe 121. |
| **Upstream scan funnel** (scanned → global filter [depth/spread] → IMF family LQ/VN/DI/Corr) | in-memory `evalCountersLifetime` only; `/api/xstocks/filter-diagnostics` | **REPLAY** (+ optional FORWARD) | NOT persisted; resets on restart; no per-cycle archive. Upstream rejects never write `signal_eval_archive` rows (it begins at strategy-eval). Reconstruct by replaying global-filter + IMF over archived OHLC + depth; OR stand up a forward sink (§3.D). |
| **Filter metric VALUES** (LQ, VN, DI, Correlation per pair per bar) | computed transiently, never stored | **REPLAY** | Re-run `calculateXstockDepthLQ` / `calculateVolNoise` / DI / `calculateCorrelation` over archived OHLC + depth. Same archive-replay the calibration itself uses. |
| **Filter THRESHOLDS** (current config) | `screener_filters` (xstock_spot) | **CLEAN** | Captured — see §5 for the current values + anomalies. |
| **Order-book depth + spread raw readings** | `xstock_spot_ticker_snap` (bid/ask/bidQty/askQty, capturedAt) | **FORWARD-ONLY (~1 day hot retention)** | ⚠️ Probe: hot table holds only 2026-06-01 00:07 → 15:06 (~15h, 2.6M rows). NOT weeks. Depth-filter went live 2026-05-31, so there is ~1 day of post-go-live depth in the hot store. Recovery options: (a) accumulate forward on a fixed cadence; (b) check whether B-NEW-47 storage-sweep offloaded older `ticker_snap` partitions to object storage and rehydrate. |
| **Throughput — signals admitted** | `signal_eval_archive` (admitted) | **CLEAN** | admitted ≈ 1,800 over window, matches VTS opens. |
| **Throughput — VTS trades opened** | `vts_open_trades` (asset_class='xstock_spot', opened_at, strategy) | **CLEAN** | 1,815 rows, 2026-05-12 → live. (`paper_sim_trades` xStock = 0 — active-paper never ran for xStock; throughput lives in `vts_open_trades`.) |
| **Strategy-selection distribution** | `vts_open_trades.strategy` + `signal_eval_archive` | **CLEAN** | Per-strategy share computable; never-fire / always-fire detectable. |
| **Strategy GATE config** | `module_constants` (strategy_gates, xstock_spot) | **CLEAN** | Enabled/disabled per strategy, queryable. |
| **Governance eligibility decisions** (regime-dependency blocks) | skipped-signals JSON log files | **INFERRED (file-based)** | Not SQL-queryable; parse `/logs/vts_skipped_signals/*.json` if needed. Secondary. |
| **DBS component values** (slope / return / EMA / finalScore) | `xstock_dbs_backfill` | **STALE** | Probe: one-shot fill, bars 2026-05-05 → 2026-05-15, last write 2026-05-17. NOT continuous. Component-level baseline limited to that 11-day window unless reconstructed by replay (directional-bias over archived OHLC). |
| **DBS drift** | derived from component values over time | **REPLAY / proxy** | No rate-of-change column. Proxy = component std-dev over rolling windows + sentinel-zero rate. A.3 memo already health-checked the 05-05→15 window (healthy: 38% up / 42% down / 20% neutral, no floor/ceiling pinning). Replicate forward for the live period. |
| **Volatility / ATR** | computed from `xstock_spot_ohlc_1m` | **REPLAY** | 14-period ATR reconstructable; not regime-segregated yet (feeds B.6). |
| **Sector mapping** | `xstock_spot_universe.sector` + `XSTOCK_SPOT_REGISTRY` | **CLEAN** | 489 active symbols; breakdown in §5. |
| **Macro modifier** | `module_constants` macro_modifier xstock_spot | **CLEAN — confirmed flat 1.0 no-op** | `b67_1_asset_class_no_op_active=true`, min=max=1.0. Baseline = identity. |

**OHLC archive** (`xstock_spot_ohlc_1m`, partitioned monthly) is the workhorse input for all REPLAY items — confirm its retained window covers the target period in capture step.

---

## §2. Measurement areas (the eight quantities to baseline)

For each: WHAT we report, METHOD (direct query vs replay vs forward), per-area WINDOW.

1. **Scan funnel.** Per-stage survivor + reject counts and reject reasons, scanned → global filter (depth/spread) → IMF family (LQ/VN/DI/Corr) → strategy eval → tcl → sqe → admitted → VTS-opened. Downstream half DIRECT from `signal_eval_archive`; upstream half by REPLAY over archived OHLC+depth (and/or a short forward live-capture cross-check). Report as daily series + window average.
2. **Per-filter behavior + metric shape.** For each filter B.2 touches (depth/LQ, VN, DI, Correlation): rejection rate AND the distribution (p10/p50/p90) of the underlying metric, so we see whether the threshold cuts in a sensible place or out in the tail. METHOD: REPLAY metric values over OHLC+depth, then apply current thresholds.
3. **Regime mix.** Share of each of the 5 regimes over the window + unknown/fallback rate + stability (how often a pair flips regime). DIRECT from `signal_eval_archive.regime_label`.
4. **Strategy mix.** Per-strategy selection share among admitted signals / VTS opens; flag never-fire and always-fire. DIRECT from `vts_open_trades.strategy` + `signal_eval_archive`.
5. **Throughput.** Signals-admitted/day and VTS-trades-opened/day for xStocks (volume only). DIRECT.
6. **Friction inputs.** Spread distribution per xStock (REPLAY from ticker_snap bid/ask, ~1 day + forward), depth distribution (FORWARD + cold-storage if recoverable), ATR per pair (REPLAY from OHLC). Feeds B.4/B.5/B.6.
7. **Sector makeup.** Active tradable universe broken down by sector. DIRECT.
8. **Macro dial.** Record the confirmed flat-1.0 no-op as the baseline (before VIX/DXY logic in C).

---

## §3. Context & anomaly pillars (the five overlays)

- **A. Event timeline.** Dated list of operational events distorting xStock flow over the window, laid under the numbers: 2026-05-25 Memorial Day (zero flow, holiday — not a bug); B79.0n umbrella plumbing deploys 05-21→05-27 (active-trading OFF throughout); **B.1.5 depth-filter go-live — crashed first attempt ~05-30 (rolled back 23:09Z), redeployed 2026-05-31 ~06:38Z** (depth-based filtering only valid AFTER this; before it the old/broken 24h-volume metric was in force — pre-05-31 filter behavior is NOT comparable); **~30h no-trade outage Fri 2026-05-29 20:00 ET → caught up Sat 05-31 05:06 UTC** (node-cron silent miss; scanner stayed running / trades stayed open while market closed; boot-reconciliation recovered ~30h late); B-NEW-36 poll-reconcile 05-31 06:38Z; B-NEW-49 cron observability 05-31 21:57Z; B-NEW-50 next-fire fix 06-01 00:07Z. Tables/logs for exact stamps: `scheduled_tasks_audit`, `discovery_runs`, `vts_open_trades.state`, `/var/log/dawntrader/system-alerts.jsonl`.
- **B. Extremes-first.** Deliberately locate the near-zero-flow and unusually-high-flow windows and make them the primary investigation; do not let the average hide them.
- **C. Batch-catalog causation cross-ref.** For every extreme window, find the deploy/fix/breakage that explains it; classify each as REAL data signal vs OPERATIONAL artifact. Artifacts are excluded from decision-grade averages (reported separately).
- **D. Depth-filter reconstruction + forward capture.** Because depth raw readings are ~1 day hot retention and the filter only went live 05-31, the depth baseline = (1) replay current candidate thresholds (2000/5000) against the ~1 day of retained `ticker_snap` via an extended `scripts/b-1-5-universe-audit.ts` (widen its 20-min window to the full retained span + daily slices); (2) OPTIONAL additive forward sink that periodically records the depth-funnel + filter-diagnostics so the baseline thickens going forward; (3) check B-NEW-47 cold storage for older `ticker_snap` partitions. The forward sink is the only candidate code change — additive, default-off until Langston ACKs.
- **E. DBS drift.** Component-level drift over the stale backfill window (05-05→15) from `xstock_dbs_backfill` (std-dev + sentinel-zero proxy, per A.3 method); plus regime-outcome drift over the live 6-week `signal_eval_archive` as the ongoing proxy. State explicitly where it's the proxy, not the raw component series.

---

## §4. Capture window

- **Primary window:** the full live `signal_eval_archive` span (2026-05-11 → capture date), reported as **daily series + rolling 7-day average** (rule #13), with the §3.A artifact windows masked out of the decision-grade average and shown separately.
- **Depth/spread:** the ~1 day retained `ticker_snap` span + forward accumulation; labelled "short-retention, thickening forward" — NOT presented as a multi-week average until enough forward data exists.
- **DBS components:** the 05-05→15 backfill window, labelled STALE; live proxy via regime outcomes.
- Every reported number carries its window + sample size + whether artifact windows were masked.

---

## §5. Early "definitely off NOW" candidates (visible before full capture)

From the §1 probe alone, flagged for confirmation in capture (NOT yet conclusions):

1. **Regime mix looks skewed.** `signal_eval_archive` 6-wk: STRUCTURAL_TRANSITION ~45.8%, TREND_FRIENDLY_STABLE ~38.2%, HIGH_VOLATILITY_UNSTABLE ~11.9%, IMPULSE_EXPANSION ~3.9%, **RANGE_BOUND_STABLE ~0.3%**. Range-bound almost never firing + structural-transition dominating ≈ likely mis-set _XSTOCK regime thresholds (B.1 territory — confirm whether already addressed by B.1, else flag for revisit).
2. **`corr_max` = 0.9200 on EVERY path, both modes** — perfectly uniform → an uncalibrated global default, never tuned per family. Prime B.2 candidate.
3. **`max_bid_ask_spread` far too loose to bite.** Gate is 1.0% (most), 3.0% (quant/pattern), vs observed spreads NVDA ~0.026% / SPY ~0.007% / TSLA ~0.078%. A 1–3% gate essentially never rejects — confirm rejection rate ≈ 0 (B.4/B.5).
4. **`min_depth_usd` only on quant + pattern paths** (vts=2000 / active=5000); NULL on every per-family IMF path (trend/reversal/breakout/oscillator/strong_trend). So the new depth gate does not apply on family entry paths — confirm this is intended (B.2).
5. **`min_volume` = 0 everywhere** — old volume gate inert (known; depth replaced it).
6. **`lq_min` uniform 43** on most paths (35/30 on strong_trend) — looks like an untuned carryover starter.
7. **Universe vs coverage gap:** 489 active discovered symbols (sectors: XLK 78, XLV 62, XLF 54, UNCATEGORIZED 50, XLY 50, …, INDEX_PROXY 2) but DBS backfill covered only ~260 — confirm how many are actually scanned/tradable, and the 50 UNCATEGORIZED (~11%) handling.
8. **Two blank-`filter_path` rows per mode** in `screener_filters` — possible legacy/null rows; log to Phase-16 legacy register if confirmed orphan.

---

## §6. Deliverable

B.0 deliverable = a single **written numbers report** `B_XSTOCK_CALIB_BASELINE_REPORT.md` (committed under `Claude Comms and Packages/`) — NO UI, NO DB table, NO forward sink (those move to the separate Calibration-Scoreboard batch per §9). Structured: (1) executive "definitely off" list with evidence; (2) the eight measurement areas, **every result expressed as a percentage / rate** (per §9.2) with daily-series + rolling-average tables; (3) the event timeline overlay with each extreme window classified real-vs-artifact; (4) the regime/strategy distribution tables (as % shares); (5) the friction + DBS-drift sections with explicit retention/proxy caveats; (6) a per-quantity "is this already correct / needs calibration / can't tell yet" verdict that feeds directly into B.2–D scoping. Plain-language executive summary for Kyle on top.

---

## §7. Langston Step 1 review asks

- **L1.** Insert as **B.0** before B.2 (vs fold into B.2 Step 2 pre-audit)? CC recommends standalone B.0 — it spans all sub-batches, not just B.2.
- **L2.** Depth retention: accept "reconstruct ~1 day + accumulate forward + check B-NEW-47 cold storage," or do you want a dedicated longer-retention depth archive stood up FIRST (would delay B.2)? CC recommends the former — don't block calibration on a storage build.
- **L3.** Upstream scan funnel: REPLAY-reconstruct only, or also stand up the §3.D additive forward sink? CC recommends REPLAY for the baseline + a minimal forward sink (default-off) so the picture thickens — but happy to drop the sink if you'd rather zero code change.
- **L4.** DBS drift: accept the stale-backfill component view + live regime-outcome proxy, or is component-level drift over the LIVE period a hard requirement (forces a fresh replay-backfill)?
- **L5.** Anything in §5 you'd re-prioritize, or any measurement area in §2 to add/drop before capture?

---

## §8. Langston Step 1 review — ACK with refinements (v2, 2026-06-01)

Langston green-lit B.0 as standalone. CC accepts all refinements (peer consensus, no Kyle escalation needed). Absorbed:

- **L1 — standalone B.0.** Confirmed; executed first, time-boxed (read-only nature is the delay mitigation).
- **L2 — depth: replay + accumulate-forward + cold-storage check (NO retention build first).** GUARDRAIL ADDED: the ~15h retained `xstock_spot_ticker_snap` window is mostly PRE-RTH (2026-06-01 is a Monday; ARCA opens ~13:30 UTC → only ~1.5h of true regular-hours depth). Therefore (a) §2.6 depth/spread distributions MUST be **session-segmented (RTH vs pre/post)** — an unsegmented average baselines off-hours liquidity and would misfire a gate; (b) the 2000/5000 depth numbers are NOT moved off ~1 day of mostly-off-hours data — any depth-threshold change stays **PROVISIONAL until ≥5 RTH sessions of forward depth exist** (rule #13). Baseline now; calibrate the depth number later.
- **L3 — REPLAY backbone + default-off forward sink ACK'd.** Sink's primary purpose REFRAMED: a live-captured overlapping window to **diff against the replay** = the cheapest validation that replayed LQ/VN/DI/Corr reproduce production (the entire calibration rests on replay fidelity; an unvalidated replay is a single point of failure for B.2–D). ACK conditions: (1) purely additive observation tap, zero scan/filter behavior change, default-off — verify in Step 4 diff; (2) its own SIM note documented BEFORE implementation (NO-PATCHES); (3) B.0 report NOT gated on sink data — REPLAY delivers the numbers, the sink validates them + serves the forward regression-guard.
- **L4 — DBS proxy accepted; NOT a hard full-replay requirement.** ESCALATION TRIGGER: tie to §5.1 — if the live regime-outcome proxy correlates with the regime skew in a way that looks like components PINNING (vs genuinely lopsided market structure), THAT triggers a fresh component replay before any DBS-dependent calibration. MIDDLE PATH for Kyle: a thin sampled replay (one clean RTH day per week of the live window) to spot-check gross component drift vs the 05-05→15 baseline.
- **L5 — re-prioritization:**
  - **NEW #1 capture priority — "liquidity-gate coverage on the family entry paths"** (groups old §5 #3+#4+#5). If `min_depth_usd` is NULL on every per-family path AND the 1–3% spread gate never bites AND `min_volume`=0, the family entry paths have NO effective liquidity gate and the headline B.1.5 depth filter is mostly inert exactly where most flow enters — potentially reframes B.2's premise. Confirming "is this intended" is now the single highest-value capture item (promoted above corr_max).
  - **Denominator prerequisite (promoted from #7):** confirm the real scanned/tradable universe count (489 discovered vs ~260 DBS-covered) + the 50 UNCATEGORIZED (~11%) wildcard handling EARLY — every per-pair distribution is uninterpretable without the true denominator.
  - **§2 measurement ADD:** record **scanner restart/reset frequency per day** (from `scheduled_tasks_audit` / PM2) as a measured quantity — the upstream funnel lives in a counter that resets on restart, so restart count bounds how much in-memory upstream data ever existed and contextualizes every replay gap.
  - corr_max (#2) + regime skew (#1) stay high; blank `filter_path` rows stay low (Phase-16 legacy register if orphan). Nothing dropped from §2.

**Standing alert note:** Langston re-flagged `b83b1e4b` (B-NEW-40 14-day soak) as overdue. Per Kyle directive it is intentionally deferred until after Phase-24 calibration (RUNNING_ISSUES #166); left unacked by design — not part of B.0.

---

## §9. Kyle decisions — 2026-06-01 (comparison tab + percentage methodology)

1. **Numbers-first, tab-later.** B.0 ships the baseline as a written numbers report ONLY — it stays read-only (query + replay), NO UI, NO DB table, NO forward-sink build. The side-by-side comparison **TAB is a SEPARATE follow-on batch ("Calibration Scoreboard")**, scoped AFTER the numbers land, with its own full 11-step workflow + Langston Step 1 review; location per Kyle steer = the analytics/diagnostics page (exact tab confirmed by live-UI inspection at scope time, §9.3). **This overrides §8-L3:** the forward sink does NOT ship in B.0. Replay fidelity is instead spot-checked inside the numbers report by comparing the replay against the live in-memory filter snapshot over a recent overlapping window — no persistent sink needed. A persistent sink, if ever wanted, is decided in the Scoreboard batch.
2. **Percentage / rate-based comparability (NEW methodology principle).** Every "result of current setting" and "result of new setting" is expressed as a **PERCENTAGE / RATE, not an absolute count** — because the calibrated settings will NOT accumulate the same sample size quickly, so raw counts are not comparable. Examples: % of pairs a gate rejects (not the count), % pass-rate per family, % of time in each regime, % of signals per strategy, throughput as a per-day rate. Extends rule #13 (normalize for comparability). **Raw counts shown ALONGSIDE every rate (Kyle 2026-06-01):** every percentage MUST carry its underlying numerator/denominator — e.g. `31% (1,240 of 4,000)` — so the reader can tell whether a rate is from a meaningful sample or a tiny one (31% of <10 ≠ 31% of 4,000). The rate is the comparison value; the raw counts are the trust check; both always present.
3. **Keep it simple (explicit Kyle directive).** Deliberately minimal so the calibration arc does NOT spawn sub-batches + hotfixes debugging why the before/after data does not line up. The future Scoreboard's columns are exactly: the setting/gate being calibrated · its current value · its current result (%) · the planned new value · the resulting effect (%). No win/loss columns now (P&L is Phase-25). No speculative extra structure.
4. **Depth approach CONFIRMED (Kyle 2026-06-01):** reconstruct depth from the ~1 day retained + accumulate forward (session-segmented per §8-L2); NO longer-retention build first.

---

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file is staged to `/home/langston/inbox/b-xstock-calib-baseline/` via SCP for direct local-FS Read. Use `ssh staging` for any repo-side inspection.
