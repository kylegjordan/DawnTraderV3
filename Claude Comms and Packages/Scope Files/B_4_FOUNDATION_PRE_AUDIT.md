# B.4 — Bar-Frequency FOUNDATION Sub-Batch — PRE-AUDIT (Step 2)

> Step-2 pre-audit for the xStock 60-min → 15-min bar switch + paired recalibration. Built from: direct code reads (`B_4_FOUNDATION_CODE_SURFACE_MAP.md`), the SIM consultation (mandatory — §9), the IMF VN/DI bar-sensitivity investigation, and the dual-capacity load measurement. Decision basis: scope v2 (`B_4_FOUNDATION_SCOPE.md`, Langston Step-1 approved). Active trading OFF. CALIBRATION LENS axiom 6. NO PATCHES.

---

## §0 — PREVIOUSLY-STATED-VS-NOW (§9.2)

- **IMF VN/DI bar-sensitivity — PREVIOUSLY (scope v1): open question. NOW: BOTH confirmed BAR-SENSITIVE → recalibrate in this foundation sub-batch.** REASON: the IMF investigation found xStock VN and DI compute over the FULL bar array (not a fixed window), so a 4× bar-count change shifts both values; their `screener_filters` thresholds would mis-scale at 15m.
- **DBS history-snapshot cadence — surfaced NOW:** `directional-bias-store.ts` `SNAPSHOT_HISTORY_MAX=96` is documented "24h × 15-min cadence" — this is the MCE publish cadence (already 15-min), DISTINCT from the OHLC bar size. No change needed here; flagged to avoid conflating the two.
- No prior-stated numbers changed. The 15m bar-size decision (was 60m) was surfaced in the W1 report and scope v2 §0.

---

## §1 — SIM consultation (mandatory, §9) — upstream / downstream / shared-state / blast-radius

Per `SYSTEM_IMPACT_MAP.md`, the affected components and their documented couplings:

- **`market-regime.ts` (SIM:271-301) — blast radius HIGH (sole pair-level regime authority for VTS + active).** UPSTREAM: 60-min OHLC + **DBS score (from `directional-bias.ts` via MCE, B62)**. → **KEY COUPLING: regime CONSUMES DBS.** The DBS recompute (Obj 5) feeds regime; the regime-threshold recalibration (Obj 3) must be measured on a DBS that is already on the 15m substrate. This tightens the build-ordering: **DBS (Obj 5) → time-anchored lookbacks (Obj 2) → regime-threshold recalibration measurement (Obj 3) → parity labels (Obj 9).**
- **`directional-bias.ts` / `directional-bias-store.ts` (SIM:281-306, 1102) — blast radius HIGH (single source of truth for global DBS).** Downstream consumers: `market-context-engine.ts` (consumes propagated DBS post-B63), `market-indicators.ts` (globalDBS cache + isStale), drift-dashboard-aggregator, `vts-runner.ts` (trade-metadata passthrough), UI. The store's `PAIR_HARD_EXPIRY_MS=300000` (5 min) + `GLOBAL_DBS_MIN_SAMPLE_COUNT=20` are cadence/sample gates, not bar-count — leave. The DBS CONFIG (lookbackPeriod=48, EMA 12/26 in `directional-bias.types.ts`) is the bar-count surface.
- **`ohlc-aggregator.ts` (SIM:867, 883) — blast radius LOW (xstock-only).** Single-SQL rollup from `xstock_spot_ohlc_1m`, epoch-floor `floor(epoch/N)*N` (N=3600/14400 → add 900 for 15m). `lookbackHoursOverride` param (B-NEW-34b): scanner/cache MUST pass override; default 120h is the forensic-caller value (shrinking it silently corrupts forensic replays — a loud SCAN_TIMEOUT is the chosen failure mode). → the 15m branch must thread an explicit override too.
- **`xstock_spot_ohlc_60m_snapshot` + `xstock-ohlc-cache.ts` (SIM:880-882) — blast radius LOW.** Snapshot-first cold-read; fire-and-forget write-back of `WRITE_BACK_RECENT_BUCKETS=24` keeps table ≤5min stale; net per-cycle DB IO ~75-85% lower than the 120h live path. New 15m table mirrors this. Bounded rows: 265 syms × bars-cap.
- **`session-lifecycle-controller.ts` (SIM:1050, 1056) — blast radius MEDIUM.** node-cron Fri/Sun 8PM ET; prewarm via `runPrewarm({lookbackDays})`, per-call pg.Pool, runs ≤twice/week. Prewarm depth (lookbackDays) must cover the 15m warmup.
- **Crypto-parity scanner defenses (SIM:1066) — xStock scanner: 25s SCAN_TIMEOUT + Promise.race, 75-pair round-robin (70 rotated + 3 pinned SPY/QQQ/GLD), cycle-scoped config bundle (1638 lookups→7), cycle 10-17s.** → THE bar-size change does NOT change scan cadence or pairs-per-cycle; it changes the aggregation SQL granularity + snapshot write grid. This bounds the load delta (see §3).
- **IMF: `imf-evaluator.ts` + `imf-metrics.ts` (SIM:953, 1066) — already per-class; xStock IMF sites "already-correct" from B79.0m.b2.** VN/DI thresholds in `screener_filters` (per-class, per-family-path, per-mode).
- **SIM gap to fill in governance (Step 10):** SIM has no entry yet for a 15m interval / `xstock_spot_ohlc_15m_snapshot` / per-class time-anchored lookbacks. That's the documentation delta this batch must add.

---

## §2 — Per-objective findings (code-surface confirmed)

**Obj 1 (bar plumbing):** `ohlc-aggregator.ts:62` `XstockAggregationInterval = 60 | 240` → add `| 15`; `:194` bucketExpr 3600→900; `:169` interval dispatch; `:83-84` bar caps. **`MAX_BARS_15M` MUST be sized to the DEEPEST consumer — DBS at 192 bars (Obj 5) — NOT the regime ~120-bar depth (Langston Step-2 must-fix #1): set `MAX_BARS_15M` ≥ 192 + margin ≈ 224.** A 120 cap would silently truncate the DBS recompute to 30h instead of 48h and corrupt the substrate the regime recalibration (Obj 3) is measured against. `scanner.ts:533` literal `60`→15 (or parameterize). New `xstock_spot_ohlc_15m_snapshot` mirrors the 60m snapshot schema (migration `2026-05-18-b-new-34b...`). xStock-only.

**Obj 2 (time-anchored lookbacks — THE core per-class work):** SHARED literals to migrate per-class: `computeMomentum` 30-bar (`market-regime.ts:120`), `computeADX` 14-bar (`:132`), SMA-20 (`signal-orchestrator.ts:1226`, `vts-runner.ts:145`, `routes.ts:6865/6897`), ATR-14/RSI-14 (`strategy-helpers.ts:78`), VWAP `slice(-24)` (`signal-orchestrator.ts:1496`), high/low `slice(-24)` (`strategy-validator.ts:191`). The `market-regime.ts:108-119` invariant comment names the migration: per-class lookback constants → `module_constants`. **Mechanism: DB-resolved per-class config, NOT shared-literal rewrite.** Re-express each as the intended wall-clock window (30 bars×60m = 30h → 120 bars×15m; 14h → 56 bars; 24h → 96 bars; etc.) resolved per asset class so crypto keeps 60m semantics.

**Obj 3 (regime-threshold recalibration):** `xstock_spot/regime-thresholds.ts` — 14 xStock-specific constants (already per-class via `market-regime.ts:245-267` branch; crypto file untouched by construction). Re-derive against the 15m per-bar return distribution. Measured AFTER Obj 2 lands (time-anchored read) and on the 15m-recomputed DBS (regime consumes DBS).

**Obj 4 (MCE periods):** the indicator periods feeding the MCE/confidence chain that are bar-count → re-derive per-class to the intended wall-clock window. (Overlaps Obj 2's SMA/ATR/RSI literals.)

**Obj 5 (DBS):** `directional-bias.types.ts:83-101` `DEFAULT_DBS_CONFIG` lookbackPeriod=48, EMA fast=12/slow=26 — **SHARED/global, no per-class override.** Add per-class override for ALL THREE bar-count params (Langston Step-2 must-fix #2 — the EMAs are bar-count too): lookbackPeriod 48 bars×60m=48h → **192 bars** at 15m; EMA fast 12→**48 bars** (12h preserved); EMA slow 26→**104 bars** (26h preserved). ATR-normalized, so ATR re-derive follows. **Leaving EMA at 12/26 on the 15m substrate collapses smoothing to 3h/6.5h → a DIFFERENT signal, not a finer-grained one.** Crypto keeps 48/12/26 by per-class resolution. **DECISION (Langston): recompute + epoch-stamp + retain 60m `_archive`.** Recompute `xstock_dbs_backfill` (~30k rows) on 15m via the B-PHASE-A2 backfill script; stamp rows with a substrate/version tag; rename/retain the prior 60m table read-only as `_archive`. **Live table = 15m rows ONLY; archive = 60m read-only — no mixed-substrate coexistence (Langston #6 → Step-4 proof: no consumer of `xstock_dbs_backfill` reads mixed rows).** Off-peak window: supervised ONE-SHOT in the weekend-close window — NOT coupled to the `weekend_shutdown` cron (Langston #3: that cron has a flaky history — missed 2026-05-30, B-NEW-49/50/51 fixed arm/fire failures — don't hang a one-time migration off it, and don't risk re-fire on later weekends; confirm scanner actually paused first).

**Obj 6 (ORB):** CONFIRMED defect — `orb.ts:101-135 computeOpeningRange(PriceData[])` expects 1-min candles but is fed 60m bars via `signal-orchestrator.ts:1885-1890` (`ohlcAsAny` = `getOHLCData(symbol,60)` at `:1477`). RTH window `14:30-17:00 UTC` fixed (`:64-71`); 30-min opening window `:114`. → repoint to fine bars + re-derive window in 15m terms + enable-flip LAST. (B-NEW-36 already removed ORB's dead 24/7 bypass, SIM:1058 — clean surface.)

**Obj 7 (weekend warmup):** `session-lifecycle-controller.ts:123-146` prewarm via `runPrewarm({lookbackDays})`. 1m retention = `xstock_spot_ohlc_1m.hot_retention_days=365` (`module_constants`, migration `2026-05-06-b75`). **365 days >> the longest 15m lookback (DBS 192-bar≈48h, regime 120-bar≈30h) — so NO retention extension is needed; the archive depth is ample.** The fix is: prewarm `lookbackDays` must pull enough 1m history to rebuild the deepest 15m lookback at reopen (≈2-3 days to be safe). Verify the prewarm depth at a simulated Sunday reopen.

**Obj 10 (IMF VN/DI) — RESOLVED to recalibrate-in-foundation:**
- **VN** (`imf-metrics.ts:96-101` → `analysis-utils.ts:139-176`): log-returns + MAD/median over the ENTIRE OHLC array → 4× samples at 15m → different MAD/median → **BAR-SENSITIVE.**
- **DI** (`imf-evaluator.ts:71-82`): sums ALL close-to-close deltas over the entire array → netDelta/absDelta both shift at 4× bar count → **BAR-SENSITIVE.** (NB: xStock DI is a full-array variant that diverges from the canonical 48-bar-windowed `analysis-utils.ts` DI, and carries NO bar-interval invariant comment — a latent inconsistency to document.)
- Thresholds: `screener_filters` (per-class, per-family-path, per-mode), seeded `2026-05-11-b79-0m-a-xstock-family-imf-seeds.sql` (paper vn_max=0.95 / live 0.85; di_min/max per family) — "cloned from crypto baseline." **DECISION: fold VN/DI threshold re-derivation INTO Obj 3's recalibration study** (same 15m bar distributions, same study) — outcome (a) recalibrate-in-foundation, NOT hold-to-W2, because VN/DI gate signal admission and a mis-scaled screen would distort the very VTS population W2 measures (the same moving-target logic that put W0 ahead of W1). Correlation piece confirmed wired-but-unused (always 0.5) — leave; its removal stays deferred to Phase 25.

---

## §3 — Dual-capacity load gate (Langston binding condition 3) — sized UPFRONT

**Gate framework** (`MULTI_ASSET_VTS_EXPANSION_PLAN.md:418`, RUNNING_ISSUES #81): the 1.3× synthetic load test is a SIZING DECISION-GATE — **ship requires ≥30% headroom on every surface** (CPU / memory / DB connections / API rate / log throughput) at projected post-deploy load; a fail = upgrade tier, NEVER asset-class shedding.

**Current CPX22 baseline (measured 2026-06-03):** 2 vCPU; load avg 1.46 / 1.16 / 0.65 (1m/5m/15m) → ~58% CPU used over 5 min (~42% headroom), ~73% at the 1-min peak (~27% headroom); memory 3814 MB total, 2440 MB available (~64% free); disk 52 GB / 75 GB used (73%, 20 GB free, 27% free).

**Capacity (a) — steady-state 4× snapshot cadence:** the 4× is the snapshot WRITE grid + aggregation bucket count, NOT a 4× scan cadence — the scanner stays at 75 pairs/cycle, 10-17s, cadence unchanged (SIM:1066), and the snapshot architecture already cut per-cycle DB IO 75-85% (SIM:882). So the steady-state delta is the finer aggregation SQL (4× buckets per rollup query) + fire-and-forget write-back on a 15-min grid. **Judge on SUSTAINED utilization, not the 1m peak (Langston Step-2 #5): the 1m sample (1.46, ~73%) is spiky; the 15m load avg 0.65 = ~33% util = ~67% headroom says the peak is transient, not sustained. Memory ample (64% free). The surface to watch HARDEST is DB CONNECTIONS, not CPU — the finer aggregation is 4× bucket rows per rollup query, and both prewarm and the backfill use per-call `pg.Pool` (SIM).** → MUST run the 1.3× synthetic test pre-deploy and base ship/no-ship on SUSTAINED 5-15m utilization + DB-connection headroom ≥30%; if sustained headroom <30% → tier-upgrade before ship, never ship-anyway (§5 #15).

**Capacity (b) — one-time DBS backfill recompute (~30k rows on 15m):** transient batch (B-PHASE-A2 script, per-call pg.Pool). Does NOT count against steady-state budget but MUST run in a **scheduled off-peak window** (xStock weekend close, Fri 8PM ET → Sun, when the scanner is paused and there is no live VTS contention) so it doesn't contend with live cycles or the connection pool.

**Storage delta (folded in):** new `xstock_spot_ohlc_15m_snapshot` ≈ 265 syms × ~224 buckets (the DBS-192+margin cap, must-fix #1) ≈ 60k rows (still tiny vs the 73%-full disk); 1m retention UNCHANGED (already 365d, no extension). → storage delta negligible; disk's 73% baseline is a pre-existing watch item (the 1m archive bulk — B-NEW-47 cold-storage territory), not caused by this batch.

**Verdict:** memory + storage PASS upfront; CPU + DB-connections require the pre-deploy 1.3× synthetic load test as the hard gate before deploy. If CPU peak headroom <30% at projected load → vertical-scale the Hetzner tier before ship (§5 #15).

---

## §4 — Build-ordering (refined by the regime⟵DBS coupling)

1. **Obj 1** bar plumbing (interval typing + 15m snapshot table + aggregator 15m branch).
2. **Obj 5** DBS per-class config + 15m backfill recompute (off-peak) + epoch-stamp + 60m `_archive` — FIRST among the semantics, because regime consumes DBS.
3. **Obj 2** per-class time-anchored lookbacks (regime/indicator/MCE).
4. **Obj 3 + Obj 10** measurement: recalibrate xStock regime thresholds AND VN/DI thresholds against 15m distributions — measured on the time-anchored read (Obj 2) and the 15m DBS (Obj 5).
5. **Obj 4** MCE periods (folds with Obj 2).
6. **Obj 6** ORB candle-source + window; enable-flip LAST.
7. **Obj 7** weekend prewarm depth.
8. **Obj 8** load gate confirmed pre-deploy.
9. **Obj 9 EXIT GATE** parity report generated on the FULLY recalibrated config (post 2+3+4+5) → Langston sign-off → only then W2.

---

## §5 — Crypto-isolation Step-4 hard-fail gate (proofs to produce in the diff)

1. No SHARED bar-sensitive literal (momentum 30, ADX 14, SMA 20, ATR/RSI 14, slice(-24), DBS lookback 48 + EMA 12/26) touched without per-class branching — every one routed through per-class `module_constants` resolution, crypto resolving to its 60m values.
2. Crypto regime lookbacks / thresholds (`crypto_spot/regime-thresholds.ts`) / DBS config (incl. EMA) / MCE periods / VN-DI bit-identical before vs after (diff proof).
3. Crypto bar-cadence-unchanged isolation proof in logs (crypto scan cycle unaffected).
4. **Seed-parity proof (Langston Step-2 #4):** every crypto `module_constants` lookup for the migrated keys (momentum, ADX, SMA, ATR, RSI, VWAP slice, hi/lo slice, DBS lookback + EMA fast/slow, ORB window) resolves BIT-IDENTICAL to the current hardcoded literal — proven in the diff/migration — with NO silent-default path (ties to §8 #10 / Kyle's no-silent-fallback rule: a missing key must hard-fail, not fall through to a default).
5. **Mixed-substrate proof (Langston Step-2 #6):** no consumer of `xstock_dbs_backfill` reads mixed 60m+15m rows — live = 15m only, `_archive` = 60m read-only, clean separation.

---

## §5b — DEFERRED FOLLOW-UP (documented before implementation, §8 #11 — Langston DBS-fork ruling 2026-06-03)

**Crypto-DBS → module_constants migration (DEFERRED to its own follow-up batch; NOT in B.4).** This foundation batch makes the **xStock** DBS config per-class (resolved from `module_constants directional_bias`, hard-fail). **Crypto DBS keeps `DEFAULT_DBS_CONFIG` (48/12/26) UNCHANGED** — Langston's DBS-fork call (Option B): the crypto DBS callers (`fx5-scanner.ts:1110/1117/1220/1227`, `market-scanner.ts:679/685` — 6 sites) live in physically separate files from the xStock scanner, so there is NO same-function split-brain (the thing that made the regime if-branch dangerous is absent). Routing crypto's DBS through a resolver would touch the 300-pair crypto hot path for ZERO xStock value, with the parity assertion guarding only value-drift not path-blast-radius. **Structural-drift guard kept (free):** the xStock DBSConfig and crypto's `DEFAULT_DBS_CONFIG` share the ONE `DBSConfig` type (`directional-bias.types.ts`), so a future shape change fails tsc on the crypto side — compiler-enforced. **Follow-up to log in RUNNING_ISSUES at Step-10:** crypto-DBS → per-class module_constants resolver (target shape), 6 call sites, crypto parity assertion as acceptance guard, deferred to keep crypto blast radius out of the xStock foundation batch. The crypto `*` DBS seeds in migration `2026-06-03c` (48/12/26) pre-stage this follow-up (inert until crypto reads them).

## §6 — Open questions — RESOLVED (Langston Step-2, 2026-06-03)

1. **Regime⟵DBS ordering** → CONFIRMED yes (recalibrating thresholds against a 60m-substrate DBS that's about to change is a moving target). §4 ordering correct. ✅
2. **VN/DI fold-in** → CONFIRMED yes (same 15m bars; current thresholds are crypto-clones never derived for xStock, so deriving on real 15m distribution is strict improvement). Confirm enough post-backfill 15m history for stable distributions (365d 1m retention says yes). ✅
3. **DBS off-peak window** → window YES, cron-coupling NO. Supervised one-shot in the weekend-close window, scanner-paused confirmed; do NOT hang it off the flaky `weekend_shutdown` cron. ✅ (Obj 5 updated)
4. **Per-class lookback storage** → `module_constants` YES, PLUS a seed-parity proof in the §5 gate (crypto keys bit-identical to current literals, no silent default). ✅ (§5 proof 4)
5. **15m snapshot bar-cap** → NOT 120. Size to the deepest consumer (DBS 192) + margin ≈ **224** — a 120 cap would truncate the DBS recompute. ✅ (Obj 1 + §3 updated)

**Langston Step-2 verdict: APPROVE TO PROCEED.** Two must-fixes folded in (bar-cap 224, DBS EMA per-class 48/104); four refinements carried as build constraints / Step-4 proofs (#3 supervised one-shot, #4 seed-parity, #5 sustained-utilization + DB-conn-hardest, #6 mixed-substrate). Step-4 first checks: crypto-isolation proofs (§5) + bar-cap + EMA per-class numbers.

---

*Step-2 pre-audit. Inputs: `B_4_FOUNDATION_CODE_SURFACE_MAP.md`, SIM consultation, IMF VN/DI investigation, CPX22 load measurement. Scope: `B_4_FOUNDATION_SCOPE.md` v2. Active trading OFF. CALIBRATION LENS axiom 6. NO PATCHES.*
