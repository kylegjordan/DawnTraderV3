# Batch 67 — Progress Report (OPEN)

**Author:** Claude Code
**Opened:** 2026-04-28
**Status:** OPEN — B67.0, B67.3, B67.1, B67.2 sub-deliverables closed (all LIVE); B67.4, B67.5 + calibration check remaining
**Closes as:** `BATCH_67_COMPLETION_REPORT.md` once all 6 sub-deliverables are closed.

This report stays open across multiple commits and accumulates the closure of each sub-deliverable as it ships. It becomes the completion report when the final sub-deliverable closes.

---

## Sub-deliverable status

| # | Sub-deliverable | Status | Commit | Closed |
|---|---|---|---|---|
| B67.0 | Telemetry & ablation framework | ✅ CLOSED | `105d2b53` | 2026-04-28 |
| B67.3 | Per-underlying position limits | ✅ CLOSED (shadow mode at deploy) | `ca0e2c2d` | 2026-04-28 |
| B67.1 | Macro confidence modifier (BTC dominance + funding + mcap) | ✅ CLOSED (shadow mode at deploy) | `828f6d92` | 2026-04-28 |
| B67.2 | Phase dimension (EARLY/PRIME/LATE) | ✅ CLOSED (LIVE) | `9f82f401` | 2026-04-29 |
| — | Calibration check (gating event) | ⏳ Pending | — | — |
| B67.5 | Wire regime confidence into 7 consumers | ⏳ Pending (gated on calibration pass) | — | — |
| B67.4 | Realized-outcome feedback | ⏳ Pending | — | — |

Sequence per scope §3:

```
B67.0 ✅
  ↓
B67.3 (safety net first, no confidence dependency)
  ↓
B67.1 + B67.2 (recompute confidence value)
  ↓
~14-day observation window
  ↓
Calibration check (tertile-monotonic ≥7pp HIGH−LOW gap, n≥150/bucket, χ² p<0.05)
  ↓ (only if pass)
B67.5 (wire confidence into 7 consumers, with sourcePool gate on Consumer #5)
  ↓
B67.4 (realized-outcome feedback closes the loop)
```

---

## B67.0 closure — 2026-04-28

### What shipped

**Backend infrastructure** for the replay-ablation framework that future regime-overhaul work will use to prove its value.

- New table `regime_factor_alternates` with XOR-discriminated source (active_signal vs vts_trade), 4 indexes for time/factor/signal/pair queries, DB CHECK constraint enforcing exactly-one-of-signalId/vtsTradeId
- 3 module_constants seed rows (`b67_0_ablation_emit_enabled`, `b67_0_alternates_retention_days`, `b67_0_paper_replay_capital_threshold_pct`)
- New service `factor-ablation-emitter.ts` with fire-and-forget `emitAblationRecord()` API and discriminated `AblationSource` union
- Wire-in to `signal-orchestrator.ts` (active path, after RTB queue) and `vts-runner.ts` (VTS mirror, before trade-record return)
- Nightly replay job `replay-ablation.ts` (skeleton + retention sweep functional; outcome-lookup logic ships with B67.1+ producers)
- npm script `b67:replay-ablation`
- Drift Dashboard aggregator extension `computeAblationComparison()` with per-factor four-quadrant taxonomy
- API endpoint `GET /api/analytics/ablation-comparison`
- New UI component `AblationComparisonSection` in existing Drift Dashboard tab with empty-state explainer until B67.1+ producers ship

**Governance**

- `BATCH_67_SCOPE.md` — Step-1 scope, Langston-approved
- `BATCH_67_PRE_AUDIT.md` — Step-2 V2 with proper SIM consultation + code-level inspection, Langston-approved (V1 preserved at `BATCH_67_PRE_AUDIT_V1_LIGHT.md`)
- `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0 + §0.10 — master planning doc with all 12 §11 decisions resolved + 7 V2 audit refinements
- `POST_AUDIT_ROADMAP.md` Phase 19.4.5 item 9 — daily-loss-budget service + kill-switch auto-trip wiring, marked **BLOCKING for live activation**

### Workflow gates

| Step | Owner | Status |
|---|---|---|
| 1 — Scope | CC + Langston | ✅ Approved |
| 2 — Pre-audit (V2) | CC + Langston | ✅ Approved |
| 3 — Implementation | CC | ✅ Complete (3a–3g) |
| 4 — Code review | Langston | ✅ Approved across 3 chunks (#835 foundational, #836 backend, #839 UI + bug fix) |
| 5 — GitHub push + CI | CC | ✅ Commit `105d2b53`; CI run `25065236992` GREEN (2m38s, all 4 checks) |
| 6 — Staging deploy | CC | ✅ PM2 #101, HTTP 200, migration applied cleanly |
| 7 — First-pass verification | CC | ✅ See "Verification evidence" below |
| 8 — Second-pass verification | Langston | ⏳ Pending Kyle UI review + Langston ack |
| 9 — Iterate | — | None needed |
| 10 — Governance updates | CC | ✅ This report + BATCH_CATALOG, PHASE_HISTORY, SYSTEM_MANUAL, SIM, CHANGES_AND_FIXES, MEMORY, change list |
| 11 — Completion ack | Kyle | ⏳ Pending |

### Verification evidence (Step-7 first-pass)

**HTTP health:** `curl http://localhost:5000/api/health` → `HTTP 200`

**Database schema** — `regime_factor_alternates` table created with 12 columns:
- `id integer`, `source_type text`, `signal_id integer`, `vts_trade_id text`, `pair_symbol text`, `evaluated_at timestamp with time zone`, `factor_name text`, `factor_state text`, `real_decision jsonb`, `alternate_decision jsonb`, `replay_outcome jsonb`, `replay_completed_at timestamp with time zone`

**Module constants seeded** — 3 rows in `ablation_framework` module:
- `b67_0_ablation_emit_enabled = true`
- `b67_0_alternates_retention_days = 90`
- `b67_0_paper_replay_capital_threshold_pct = 0.8`

**Row count** — `SELECT COUNT(*) FROM regime_factor_alternates` → 0 (expected at B67.0 ship time, no factor producers yet)

**API endpoint** — `GET /api/analytics/ablation-comparison?window=rolling_24h` returns:
```json
{ "ok": true, "data": { "window": "rolling_24h", "windowStart": "...", "windowEnd": "...", "factors": [], "totalRows": 0, "hasReplayedRows": false } }
```

**PM2 logs** — first 60 lines post-restart show no `[B67` errors. Pre-existing WS Sub Error and Lazy SystemHealthMonitor warnings unchanged from prior batch (B65).

**TypeScript** — `npx tsc --noEmit` clean across all B67.0 files.

**CI** — all 4 checks green on commit `105d2b53` (TypeScript Check, Test Suite, Build, Docker Build).

### What Kyle can verify on the UI

Navigate to staging Analytics → Drift Dashboard tab. Below the existing "Regime & Strategy Drift Dashboard" panel, new panel **"Factor Ablation Comparison (B67.0)"** with the same 4 window-toggle buttons. Empty-state message:

> *"No ablation rows in this window yet. The replay-ablation framework (B67.0) is wired and listening, but no factor producers have shipped yet. Once they begin emitting alternates, this panel will populate automatically with per-factor counterfactual statistics."*

If the panel renders with that explainer, B67.0 UI is verified.

### Files in commit `105d2b53`

16 files: 7 new (2 migrations, 1 service, 1 script, 3 governance docs), 9 modified (1 schema, 5 services/routes/UI, 1 package.json, 1 roadmap, 1 planning doc).

See `Claude Comms and Packages/Change Lists/BATCH_67_0_CHANGE_LIST.md` for granular file-by-file change list.

### Out of scope (deferred to subsequent sub-deliverables)

- **Active-path replay outcome lookup** — wires when B67.5 produces first ablation rows joinable to paper_sim_trades
- **VTS JSONL outcome reader** — wires when first B67.1+ factor producer needs it
- **Factor producers** — each of B67.1, B67.2, B67.4 builds its own emit call site; B68.x continue the pattern
- **Daily loss budget service + kill-switch auto-trip** — deferred to Phase 19.4.5 item 9 (BLOCKING for live), independent safety gap

---

## B67.3 closure — 2026-04-28

### What shipped

**Per-underlying position cap admission gate (shadow mode at deploy).** Caps simultaneous open trades per underlying base currency across VTS + active-trading paths. Sub-deliverable 2 of 6 in B67. Deploys FIRST among B67's confidence-modifying deliverables because it has zero confidence dependency — pure safety net during the rollout.

- New service `per-underlying-cap.ts` with `checkPerUnderlyingCap()` API. Cohort assignment via FNV-1a 32-bit hash on symbol (cohort 0 = treatment, cohort 1 = control). Decision considers enabled flag, split-active flag, current open count vs cap, cohort. Shadow-mode at ship logs would-reject without actually rejecting. Format helper for PM2-readable output.
- New rejection reason `'PER_UNDERLYING_CAP'` in `signal_lifecycle_audit.ts` taxonomy.
- Schema: `paper_sim_trades.pair_id_hash` integer column for cohort persistence. NULL on rows opened pre-B67.3.
- 3 module_constants seeds: `b67_3_enabled=false` (shadow), `b67_3_max_concurrent_per_underlying=2`, `b67_3_universe_split_active=true`.
- Wire-in: `signal-orchestrator.ts` (active path, gates BEFORE RTB queue) and `vts-runner.ts` (VTS-mirror, after MAX_OPEN_TRADES check). paper-execution-engine intentionally NOT gated — signals filter at signal-orchestrator before reaching RTB; avoids consistency risk between two paper-side gates.

### Workflow gates

| Step | Owner | Status |
|---|---|---|
| 1 — Scope | CC + Langston | ✅ Approved (rolled into B67 master scope §5) |
| 2 — Pre-audit | CC + Langston | ✅ Approved (B67 V2 pre-audit covers all sub-deliverables) |
| 3 — Implementation | CC | ✅ Complete |
| 4 — Code review | Langston | ✅ Approved (cc-inbox #841). One non-blocking comment fix applied: migration header now states FNV-1a explicitly with portability rationale (scope §5.3 specified CRC32 conceptually). |
| 5 — GitHub push + CI | CC | ✅ Commit `ca0e2c2d`; CI run `25072886601` GREEN (2m24s, all 4 checks) |
| 6 — Staging deploy | CC | ✅ PM2 #102, HTTP 200, migration applied cleanly |
| 7 — First-pass verification | CC | ✅ See verification evidence below |
| 8 — Second-pass verification | Langston | Skipped per Kyle workflow — Step-4 review by Langston covered code-level evidence |
| 9 — Iterate | — | None needed |
| 10 — Governance updates | CC | ✅ This progress report block + BATCH_CATALOG sub-row + PHASE_HISTORY entry + change list + MEMORY |
| 11 — Completion ack | Kyle | ⏳ Pending |

### Verification evidence (Step-7 first-pass)

**HTTP health:** `curl http://localhost:5000/api/health` → `HTTP 200`

**Database schema** — `paper_sim_trades.pair_id_hash` column confirmed PRESENT via psql

**Module constants seeded** — 3 rows in `per_underlying_cap` module:
- `b67_3_enabled = false`
- `b67_3_max_concurrent_per_underlying = 2`
- `b67_3_universe_split_active = true`

**TypeScript** — `npx tsc --noEmit` clean

**CI** — all 4 checks green on commit `ca0e2c2d` (TypeScript Check, Test Suite, Build, Docker Build)

**PM2 logs** — no `[B67.3]` errors. Live signal-evaluation logging not yet visible because VTS reports "No pairs available for simulation cycle" during this verification window — gate will exercise live when signal flow resumes (active trading is currently STOPPED per UI).

### Activation plan post-ship

1. ✅ Ship in shadow mode (`b67_3_enabled=false`)
2. Verify shadow-mode logs are coherent once signal flow resumes
3. Add the `pair_id_hash` trade-open wire-in (small follow-up commit; persists cohort to row at trade open so the end-of-observation cohort comparison can compute "cohort 0 WR vs cohort 1 WR")
4. Flip `b67_3_enabled=true` via module_constants UPDATE — no code change
5. Begin 14-day observation period
6. End-of-observation cohort comparison: WR / net expectancy / max-loss-per-day in cohort 0 vs cohort 1
7. If cohort 0 (limited) ≥ cohort 1 (unlimited) on net expectancy → keep cap, flip `b67_3_universe_split_active=false` so all pairs get the limit
8. If cohort 0 < cohort 1 → escalate to Kyle; deactivate `b67_3_enabled`

### What Kyle can verify on staging

- (UI) No new visible UI panel for B67.3 — this is a backend admission gate, not a dashboard feature
- (Logs) Once signal flow resumes (active trading turned ON or VTS gets pairs), PM2 logs will show `[B67.3]` decisions like `[B67.3] AVAX/USD base=AVAX cohort=0 open=2/2 → SHADOW would-reject (cap_disabled)` (shadow mode) or `→ allowed` for non-rejected signals

### Files in commit `ca0e2c2d`

7 files: 3 new (2 migrations + 1 service), 4 modified (rejection-reason taxonomy, schema, signal-orchestrator wire-in, vts-runner wire-in).

See `Claude Comms and Packages/Change Lists/BATCH_67_3_CHANGE_LIST.md` for granular file-by-file change list.

### Out of scope (deferred)

- **`pair_id_hash` trade-open persistence** — column exists post-migration; gate computes cohort on every signal evaluation. End-of-observation cohort comparison requires the cohort persisted on the trade record at trade open. Lands as a small follow-up commit before `b67_3_enabled` is flipped to true.
- **paper-execution-engine third gate** — intentionally NOT wired. Signals filter at signal-orchestrator before reaching RTB; redundant gate at paper-execution would risk consistency drift.
- **B68.3 cross-quote correlation** — ETH/BTC counts toward BASE only in B67.3; pair correlation for cross-quote concentration handled in B68.3.

---

*Superseded by the B67.1 cleanup + B67.2 closure block below.*

---

## B67.1 closure — 2026-04-28 (shadow mode at deploy)

**Sub-deliverable 3 of 6.** Macro confidence modifier on per-pair regime classifier output. Confidence-modifier architecture (Langston's Option C from master planning doc §3) — label preserved; only confidence is modulated by a multiplier in [0.85, 1.05]. Inputs: BTC dominance + funding rates + total-mcap momentum.

**Commit:** `828f6d92` (2026-04-28)
**Deploy:** PM2 restart #103 at 2026-04-28 ~21:54 UTC. HTTP 200.
**CI:** run `25079501950` overall conclusion **SUCCESS** (Build/Test/Docker green; TS Check legacy-failing per established baseline).
**Mode at deploy:** SHADOW (`b67_1_enabled=false`). Activation via `module_constants` flip after 24h soak.

### Code shipped

- New `server/core/metrics/macro-modifier.ts` — pure `computeMacroModifier()` (z-score normalized, min-48-sample floor + stale-data fallback) + `buildB67_1Alternate()` ablation row helper with reverse-derivation `confidence_without = modulated / modifier.value`
- New `server/services/external-macro-feed.ts` — singleton polling CoinGecko `/global` (BTC dom + total mcap) + Binance `/fapi/v1/premiumIndex` (BTC + ETH 8h funding, OI-weighted 0.6/0.4). 60s cache, 720-sample rolling window for z-score baselines, partial-feed graceful, loud `[B67.1][feed]` PM2 logging.
- Modified `server/core/metrics/market-regime.ts` — `calculatePairRegime()` accepts optional `macroModifier: number = 1.0` 3rd parameter. Applied PRE-clamp. Clamp upper bound raised 0.95 → 1.0.
- Modified `server/services/market-context-engine.ts` — periodic `refreshMacroContext()` timer started in `start()`. Reads module_constants + feed snapshot/baseline + computes modifier on cadence. Sync `getCurrentMacroContext()` accessor for ablation hooks. `computeContext()` threads modifier into classifier + attaches macro context to returned MarketContext.
- Modified `server/services/signal-orchestrator.ts` (line ~638) + `server/services/vts-runner.ts` (line ~1374) — push `buildB67_1Alternate()` row onto `emitAblationRecord` alternates when MCE has non-null modifier. In shadow mode (b67_1_enabled=false), MCE returns null modifier and the hook does NOT emit a B67.1 alternate.
- Modified `server/services/market-snapshot.ts` — pre-existing stub reconciled per V2 pre-audit §3.5. Single caller `ai-market-analyzer.ts` transparently inherits real values. New `fundingRate?` field on type.
- Modified `server/services/autonomy-scheduler.ts` — `initExternalMacroFeed()` boot wire-up.
- Modified `server/types/market-context.ts` — `MacroContext` interface + optional `macro?` field on `MarketContext`.
- New unit tests `server/tests/unit/b67-1-macro-modifier.test.ts` — 18 cases.

### Module constants seeded (11 rows in `macro_modifier` module)

`b67_1_enabled=false` (shadow), weights 0.40/0.35/0.25 (BTC dom/funding/mcap), band 0.85-1.05, cache 60s, stale 300s, lookbacks 30d, **`b67_1_zscore_min_sample_count=48`** (cold-start floor per Langston cc-inbox #844 §6.2). Migration `2026-04-28-b67-1-macro-modifier.sql` ran cleanly.

### Workflow gates

| Step | Status |
|---|---|
| 1 — Scope | ✅ `BATCH_67_1_SCOPE.md` Langston-approved (cc-inbox #844) |
| 2 — Pre-audit | ✅ `BATCH_67_1_PRE_AUDIT.md` Langston-approved (cc-inbox #844) — full SIM walk + code-level inspection + §11 decision 12 BTC-correlation grep |
| 3 — Implementation | ✅ Complete — TS clean on B67.1 files |
| 4 — Code review | ✅ Langston-approved (cc-inbox #845) with one bug fixed (`mcapMomentum` field separated from raw `totalMarketCapUsd` per "no naming lie" rule); funding-weight inline doc added per non-blocking observation |
| 5 — GitHub push + CI | ✅ commit `828f6d92`, run `25079501950` overall SUCCESS |
| 6 — Staging deploy | ✅ PM2 #103, HTTP 200 within 12s |
| 7 — First-pass verification (CC) | ✅ Feed alive, 11 seeds present, shadow mode confirmed |
| 8 — Second-pass verification (Langston) | ✅ Acknowledged cc-inbox #847 (Langston cannot SSH; verification based on CC's Step-7 evidence which checks out) |
| 9 — Iterate | None needed |
| 10 — Governance | ✅ This block + `BATCH_67_1_CHANGE_LIST.md` + `BATCH_CATALOG.md` + `PHASE_HISTORY.md` + `SYSTEM_IMPACT_MAP.md` (B67.1 cross-cutting impact section) + `CHANGES_AND_FIXES.md` (B67.1 entry + governance-pattern entry) + MEMORY |
| 11 — Completion ack | ⏳ Pending Kyle |

### Verification log

| Check | Result |
|---|---|
| TypeScript | `npx tsc --noEmit` zero new B67.1 errors |
| CI | run `25079501950` conclusion SUCCESS (Build/Test/Docker green; TS Check same legacy pattern as prior runs) |
| Migration | `npm run db:migrate` applied 1 pending migration cleanly |
| HTTP health | `GET /api/health` → 200 within 12s of PM2 restart |
| Module constants | 11 rows in `macro_modifier` module verified via psql (`b67_1_enabled=false` confirmed shadow) |
| Feed alive | `[B67.1][feed] btc_dom=57.98% mcap_mom=0.00000 funding=0.000029 windows=(btc:2,fund:2,mcap:1)` per 60s |
| Modifier in shadow | No `[B67.1][modifier]` lines yet (b67_1_enabled=false → MCE refresh sets modifier=null → classifier sees default 1.0 no-op) |
| PM2 errors | Zero `[B67.1]` errors |

### Activation plan post-shadow-soak

1. ✅ Ship in shadow mode (current state)
2. 24h soak so rolling baselines reach ≥48 samples (cold-start floor; happens at ~T+48 minutes from deploy)
3. Flip `b67_1_enabled=true` via `UPDATE module_constants SET value='true'::jsonb WHERE module_name='macro_modifier' AND constant_name='b67_1_enabled';` (no code redeploy)
4. Verify `[B67.1][modifier] value=X.XXXX btcZ=... fundZ=... mcapZ=... fallback=false stale=false` line appears
5. Verify at least one `regime_factor_alternates` row with `factor_name='b67_1_macro_modifier'` and the agreed JSONB shape
6. Begin 14-day observation period
7. Calibration check at end of observation: tertile-monotonic WR(HIGH) − WR(LOW) ≥ 7pp at p<0.05, n≥150 per bucket. If pass, B67.5 ships. If fail, B67.4 (realized-outcome feedback) ships first to recalibrate.

### Files in commit `828f6d92`

10 code files (5 new + 5 modified) + 4 governance files (B67.1 + B67.2 scope + pre-audit) + B67.1 change list + B67.2 weight-table seed doc. See `Claude Comms and Packages/Change Lists/BATCH_67_1_CHANGE_LIST.md` for granular file-by-file change list.

### Out of scope (deferred)

- **DB persistence of rolling baseline** — in-memory only for v1. Promotes to `macro_feed_history` table in B67.4 only if calibration check requires restart-surviving baselines.
- **B67.5 post-composition floor** — when both B67.1 + B67.2 enabled, effective admission-confidence range is `[0.32, 1.10]` (= `[0.4×0.80, 1.0×1.10]`). Below pre-B67 0.4 floor. Decorative today (no consumer reads confidence as a gate). B67.5 scope must define a post-composition floor for Kelly/EV consumers (per Langston cc-inbox #844). Pre-registered note in `BATCH_67_2_SCOPE.md` §9.
- **Feed-fallback dedicated test file** — fallback semantics covered via the modifier's stale + cold-start tests. The HTTP-fetching feed itself is hard to unit-test cleanly without `vi.mock(fetch)` infrastructure; deferred unless Step-4 had required.

---

## Pre-calibration-window foundation work — 2026-04-29 (PM2 #105 → #113)

After B67.1 + B67.2 shipped 2026-04-28, mid-batch Kyle review surfaced multiple issues. This section documents the remediation. **All pre-window fixes 1-6 complete. Only B67.4 cheap-tier bundle (step 7) remains before calibration window starts.**

### Per-input ablation split — `ed9a1a08`

Single `b67_1_macro_modifier` row replaced with three per-input rows: `b67_1_btc_dominance`, `b67_1_funding_rates`, `b67_1_mcap_momentum`. Each alternate recomputes the modifier formula with one term removed. `b67_2_phase_dimension` renamed `b67_2_phase_preference`. New `MarketContextEngine.getCurrentMacroConfig()` accessor.

### Final fallback removal — `cab55804`

Per Kyle "all fallbacks deleted": 7 `??` config-read fallbacks → throw. `readConst` → `readConstStrict`. `pollIntervalSec` default removed. `calculatePairRegime(macroModifier=1.0)` default arg removed. `?? 1.0` at MCE consumer → throws. `b67_1_enabled` shadow flag removed entirely. BTC/ETH 0.6/0.4 funding weighting promoted to `module_constants`. `?? 0` z-score result → NaN. Cold-start warmup fallback STAYS — legitimate runtime state.

### B67.3 ACTIVATION — `c1b314ad` + DB UPDATE

`pair_id_hash` trade-open persistence wired (active path + VTS path). `b67_3_enabled=true` flipped via SQL UPDATE. 14-day cohort A/B observation began.

### B67.2.1 — Trade record observability — `141ec3c3` + `41abd541` + `575dbca4`

Pulled forward from B67.5 per master plan §0.11.D. Three phases:

**Phase 1**: schema migration + active-path capture. 6 nullable columns on `paper_sim_trades` (regime_confidence_raw, macro_modifier_value, phase, phase_age_seconds, strategy_phase_weight, regime_confidence_modulated) + CHECK constraint. Active-path `createPaperSimTrade` populates from MCE state.

**Phase 2**: VTS-path capture. `OpenVirtualTrade` extended; captured at trade-open from MCE; propagated through `persistRealPriceTrade` to JSONL.

**Phase 3**: UI + CSV. Open + closed trade tables render regime label + confidence + phase badge in SAME column per Kyle directive; tooltip shows multiplication chain. CSV exports auto-include all new fields.

### Replay logic + cron — `3d1a1e7f` + `5e1031a6` + `33df2380`

Wired actual outcome lookup. **Real bug found mid-implementation:** ablation rows store `vts_trade_id = signal.id` but JSONL had different format. Fixed by threading `originalSignalId` through `persistRealPriceTrade`. VTS JSONL outcome reader builds 14d in-memory index. Active path implemented for forward-compat. Per-pass bound 5000 rows. **Cron at 04:00 UTC nightly.**

### Persistence + dashboard cleanup — `8f417ca5`

Investigation found phase=EARLY and modifier=1.0 universally on today's 16 closed trades. Cause: 8 PM2 restarts in a few hours wiped both in-memory stores.

**Fix:** persist both stores to disk. `regime-phase.ts` reads `/tmp/regime-phase-store.json` on construction (24h hard-expiry); saves on regime transitions + ~2% of stable ticks. `external-macro-feed.ts` `restoreFeedState` on init; `persistFeedState` after every poll.

**Dashboard cleanup:** aggregator filters out legacy factor names — only the 4 active per-input rows + `b67_2_phase_preference` show in UI. Pre-split rows preserved in DB for forensics.

### Confidence saturation finding — RESOLVED in B67.3.5 (see below)

Pre-existing B62 design issue: TFS branch saturated at 0.95 INPUT for any pair with positive momentum + |DBS| ≥ 0.30. After B67.1's clamp ceiling raise to 1.0: `0.95 × 1.05 × 1.10 = 1.097` → clamped to 1.0 for almost every TFS classification. Mid-batch distribution: 12 trades at 1.0, 3 at 0.9, 1 at 0.8.

Resolved 2026-04-29 in B67.3.5 — see "B67.3.5 closure" section below. Other 4 regime branches (HVU/RBS/IE/ST) still on original step-function (deferred per `RUNNING_ISSUES.md` #40).

### Workflow gates (foundation work batch)

| Step | Status |
|---|---|
| 3 — Implementation | ✅ Commits through `8f417ca5` |
| 5 — Push + CI | ✅ |
| 6 — Staging deploy | ✅ PM2 #106 → #113 |
| 7 — First-pass verification | ✅ |
| 10 — Governance | ✅ This block + BATCH_CATALOG + PHASE_HISTORY + SIM + CHANGES_AND_FIXES + MEMORY |
| 11 — Completion ack | ⏳ Pending Kyle |

---

## B67.3.5 closure — 2026-04-29 (PRE-WINDOW HARDENING — phase backfill + TFS desaturation)

Sub-batch resolving the two open discussion items from master plan §0.12.B that surfaced 2026-04-29 evening: phase backfill from OHLC history (cold pairs read EARLY when actually deep in PRIME/LATE) and TFS branch confidence saturation (12/16 closed VTS trades at conf=1.0). Both fixes coordinated as one batch through full 11-step workflow; Langston reviewed at Steps 1, 2, 4, 8 (cc-inbox #851/#852/#853/#854).

### What shipped

**Phase backfill from OHLC history** (`server/core/metrics/regime-phase.ts:backfillFromHistory`): walks 12 backward 60-min OHLC windows running `calculatePairRegime` to find the actual regime entry boundary. First-observation only (regime transitions handled by normal `tick()` flow). Uses CURRENT DBS as approximation per Langston cc-inbox #850 — vol/momentum/ADX carry most of the classification signal so the regime LABEL is robust. Insufficient-history (<30 candles) → structured warning + `enteredAt = now`. Walk-cap (no different regime within 12h window) → pair lands in LATE. Persists via existing `/tmp/regime-phase-store.json` layer. New optional `BackfillContext` interface on `tick()` is backwards-compatible.

**TFS branch desaturation** (`server/core/metrics/market-regime.ts:177-184`): step-function replaced with continuous mapping `confidence = min + (max - min) × (momentum_factor × dbs_strength × vol_inverse)`. Multiplicative — any weak input collapses score (semantic match for "trend-friendly STABLE" = all three should align). Output range [0.50, 0.90] via 5 module_constants in `regime_classifier` module: `b67_3_5_tfs_desat_min/max/momentum_scale/volatility_scale/dbs_scale`. Recalibrate via DB UPDATE post-deploy; no code redeploy. Other 4 regime branches NOT touched, queued in `RUNNING_ISSUES.md` #40.

**New `RegimeConfig` type** (`server/types/market-regime.types.ts`): contract carries the 5 desaturation tunables. Required 4th parameter on `calculatePairRegime`. `DEFAULT_REGIME_CONFIG` exported for advisory paths (3 callers updated).

**MCE wiring** (`server/services/market-context-engine.ts`): 5 new constants resolved alongside macro/phase boundaries with hard-fail on missing keys. New `getCurrentRegimeConfig()` accessor. Threaded as 4th param into classifier AND as `BackfillContext` into phase-store tick. Cleared on `MCE.stop()`.

### Workflow gates (B67.3.5 sub-batch)

| Step | Status | Evidence |
|---|---|---|
| 1 — Scope | ✅ | `BATCH_67_3_5_SCOPE.md` `3da1b179`. Langston approved cc-inbox #851. |
| 2 — Pre-audit + impl plan | ✅ | `BATCH_67_3_5_PRE_AUDIT.md` `4f41605c`. Full SIM consultation per CLAUDE.md §9. Langston approved cc-inbox #852. |
| 3 — Implementation | ✅ | 10 files, +574/-17. Migration + 5 module_constants. New types + methods. 11 unit-test cases. |
| 4 — Code review | ✅ | 807-line diff to Langston. Approved cc-inbox #853 with no bugs found. Boundary semantics confirmed. |
| 5 — Push + CI | ✅ (with one fix-up cycle) | First push `49209eb4` had 4 test failures (test fixtures + hardcoded regime string). Fixed `d97d47d7`. CI Test Suite/Build/Docker green. |
| 6 — Migration + Deploy | ✅ | Migration applied 5 INSERTs. PM2 #114 online. |
| 7 — First-pass verification | ✅ | First diversified macro modifier 0.85 with real z-scores. Macro feed rolling windows survived restart. |
| 8 — Second-pass (Langston) | ✅ | cc-inbox #854. Modifier min-clamp confirmed expected for elevated funding (z=+1.90). |
| 9 — Iterate | ✅ | One iteration on Step 5 CI fix. All scope objectives green. |
| 10 — Governance | ✅ | BATCH_CATALOG + PHASE_HISTORY + SIM + CHANGES_AND_FIXES + RUNNING_ISSUES + master plan §0.12 + MEMORY. |
| 11 — Completion ack | ⏳ Pending Kyle (this section is the sub-batch report — no separate file per Kyle directive 2026-04-29: while parent batch B67 is open, sub-batch closures fold here, not into separate completion reports) |

### Verification evidence (B67.3.5 Step-7 first-pass)

```
14:04:40 [B67.1][modifier] value=0.8500 btcZ=-0.792 fundZ=1.897 mcapZ=0.076 fallback=false stale=false
14:04:41 [B67.1][feed] btc_dom=58.09% mcap_mom=0.00000 funding=0.000020 windows=(btc:78,fund:96,mcap:77)
```

Proves: all 5 new module_constants resolved (refreshMacroContext would throw with explicit "missing module_constants in regime_classifier" otherwise); TFS desat formula in use (classifier ran without throwing); macro feed rolling windows survived restart (windows: btc:78, fund:96, mcap:77 — pre-restart accumulation preserved); macro modifier first-ever non-1.0 value diversifying.

**Live verification on staging 19:22 UTC** (CSV pulled by Kyle):
- Open trades n=28: confidence raw P10=0.572, P50=0.815, P90=0.845, **max=0.849** — no values at 1.0, real spread across full [0.50, 0.85] band
- Macro modifier range [0.85, 1.05], median 1.047
- Persistence file `/tmp/regime-phase-store.json` (file birth 12:30 UTC): 121 entries, max age 4.96h → 85 PRIME, 36 EARLY, 0 LATE — phase mix matches UI observation
- Phase distribution diversity confirmed; LATE absence is expected (persistence file too young — by tomorrow morning 6 UTC, ~17.5h since persistence layer started, should see LATE pairs)

### Out of scope (B67.3.5 deferred)

- HVU / RBS / IE / ST regime branch desaturation — `RUNNING_ISSUES.md` #40, post-window classifier-formula tuning batch
- DBS historical backfill — current DBS used as approximation (Langston-approved)
- Periodic re-validation of backfilled enteredAt — first-observation only
- Changing regime LABEL boundaries
- B67.4 cheap-tier bundle — follows B67.3.5 closure
- B67.5 consumer wiring — follows calibration window

### Files in commits `49209eb4` + `d97d47d7`

10 code files (+574/-17): migration SQL + rollback, `RegimeConfig` type, classifier desat + DEFAULT_REGIME_CONFIG, regime-phase backfillFromHistory + augmented tick, MCE wiring + accessor, 3 caller updates, 6 desat tests + 5 backfill tests.

### Lessons logged (B67.3.5 — also in CHANGES_AND_FIXES.md)

1. **`computeMomentum` lookback semantics in test fixtures**: synthetic OHLC test fixtures with end-to-end target momentum X give the LAST-30 (the lookback window) only ~X/2 momentum because the trend stretches over the full series. Use `count: 30` to align lookback with full series, OR scale endPrice up.
2. **Regime string integrity**: `regime_mapping_integrity` test catches hardcoded regime strings — even DB resolution keys need to import from canonical config, not literal strings.
3. **Test OHLC timestamps must respect the test's clock**: generate them as `nowMs - (count - 1 - i) × spacing` so the latest candle is at `now`, going backward.
4. **Multiplicative continuous mapping > weighted-sum** for confidence formulas: produces wider distribution spread (central limit theorem effect on weighted-sum compresses to center).

---

*This report is OPEN. Next update when B67.4 cheap-tier bundle ships (unblocks calibration window start).*

---

# B67.4 cheap-tier bundle — CLOSURE 2026-05-01

**Status:** SHIPPED. PM2 #126. **Calibration window started — Day 0 of 14.**

## Commits

- `24c88702` — B67.4 v1: 18 files, +1569/-171
- `173d1d59` — Hotfix #1: replace hardcoded TFS strings with `REGIMES.TREND_FRIENDLY_STABLE`
- `f5fe7e71` — Hotfix #2: wrap MCE first-refresh in try/catch (CI unhandled rejection in no-PG test env)
- `18165430` — Hotfix #3: fix B68.5 OHLC plumbing in vts-runner per Langston OBS-1

## Three levers shipped in one commit

**B67.4 — Realized-outcome feedback.** New `outcome-feedback-store.ts` singleton tracks per-(regime, strategy) tuple EMA of net P&L. Persisted `/tmp/b67-4-outcome-feedback.json` 7d expiry per §D.1. First-sample-as-EMA per §D.3. Modulates confidence via `1 + ema_pnl_pct × sensitivity / 100` clamped [0.85, 1.05]. Cold-start floor at 5 samples emits factor=1.0. EMA updated on every trade close (vts-service:persistRealPriceTrade + paper-execution-engine.closePosition).

**B68.4 — Regime-age first-class metric.** New `regime-age-factor.ts` with `computeFreshnessFactor` formula `1 + (target − actual) × sensitivity / target` clamped [0.92, 1.05]. Promotes regimePhaseStore age to standalone confidence modulator. New `peekAgeMs(symbol, now)` accessor on regimePhaseStore.

**B68.5 — Path B sustainability gate.** `calculatePairRegime` 3rd parameter `dbsSlope` (per-pair). `RegimeConfig.b68_5DbsSlopeMin` field. TFS Path B (`|DBS| ≥ 0.30`) requires `dbsSlope ≥ b68_5DbsSlopeMin`. Path A (mom + ADX) unchanged. Catches 04-22 hostile-day failure mode. Ablation row uses numeric 0/1 per §D.2.

## §D refinements (Langston cc-inbox #857) — all folded in

§D.1 7d expiry; §D.2 numeric 0/1 ablation; §D.3 first-sample-as-EMA; §D.4 6-method refresh split; §D.5 11 module_constants total.

## MCE refresh refactor per §D.4

`refreshAllConfigs` orchestrator + 6 sub-methods (refreshMacroConfig / refreshPhaseConfig / refreshRegimeConfig / refreshOutcomeFeedbackConfig / refreshRegimeAgeConfig / refreshPathBConfig). First refresh: Promise.all in try/catch (logs+retries on failure; firstRefreshPending stays true until success). Subsequent refreshes: per-group try/catch + keep-prior cached config. assembleRegimeConfig merges TFS desat scales + Path B slope. 3 new public accessors. dbsSlope threaded via `propagatedDbs.slope ?? 0`.

## Modulation chain

`raw × macro × phase_weight × freshness × outcome_feedback → clamp [0.4, 1.0]` per Langston cc-inbox #876. vts-runner emit hook updates `openTrade.regimeConfidenceModulated`. Active-path orchestrator computes chain for B67.4 ablation metadata only (active trading off; persist deferred to B67.5 per Langston cc-inbox #879 Q2).

## Module constants seeded (11 across 3 modules)

| Module | Constant | Seed |
|---|---|---|
| outcome_feedback | b67_4_alpha | 0.10 |
| outcome_feedback | b67_4_sensitivity | 4.0 |
| outcome_feedback | b67_4_min_samples | 5 |
| outcome_feedback | b67_4_factor_min | 0.85 |
| outcome_feedback | b67_4_factor_max | 1.05 |
| outcome_feedback | b67_4_expiry_hours | 168 |
| regime_age | b68_4_target_age_hours | 6.0 |
| regime_age | b68_4_sensitivity | 0.10 |
| regime_age | b68_4_min | 0.92 |
| regime_age | b68_4_max | 1.05 |
| path_b_sustainability (regime=TFS) | b68_5_dbs_slope_min | 0.0 |

## Verification (Step 8)

- `[Phase14][MCE] First refresh complete — all 6 config groups loaded` ✓
- 11 module_constants confirmed in DB via psql ✓
- All 7 factor types emitting in `regime_factor_alternates` (15-min window): b67_1_btc_dominance / funding_rates / mcap_momentum / b67_2_phase_preference / **b67_4_outcome_feedback (NEW)** / **b68_4_regime_age (NEW)** / **b68_5_path_b_sustainability (NEW)** ✓
- Factor Calibration UI returns `factors:[]` at Day 0 (n<150 per bucket; expected)
- Two non-blocking observations from Langston Step-4 review #879 — both addressed:
  - **OBS-1 (B68.5 OHLC any-cast)**: confirmed real-world; resolved by hotfix #3. Active-path orchestrator hook still uses any-cast — deferred to B67.5.
  - **OBS-2 (divide-out approximation)**: known limitation across all factor ablation rows; documented; non-blocking.

## Heartbeat infrastructure fix (incidental but required during this batch)

During Step-4 delivery, Langston's topic-21 session was discovered stuck on `gpt-4.1-mini` at 130% capacity. Root cause: `agents.defaults.heartbeat.model = "openai/gpt-4.1-mini"` stamped mini onto the session record on every async-exec-result NO_REPLY ack run. Fix per Kyle directive: deleted heartbeat + subagents blocks from `/root/.openclaw/openclaw.json`; restarted gateway. Purged stale topic-21 entry from `sessions.json`. Updated Langston's MEMORY.md with B67.4 state + reset notice. Verified post-restart: `agent:main:telegram:topic:21 → claude-opus-4-6 34k/200k`.

## Workflow log

- Step 1 (scope): Langston-approved cc-inbox #856 (2026-04-29)
- Step 2 (pre-audit): Langston-approved cc-inbox #857 with 4 §D refinements (2026-04-29)
- Step 3 (implementation): 2026-05-01
- Step 4 (code review): Langston-approved cc-inbox #879 with 2 non-blocking observations (2026-05-01)
- Step 5 (push): `24c88702` + 3 hotfixes
- Step 6 (CI): 3 of 4 green throughout (TS Check legacy baseline)
- Step 7 (deploy): PM2 #125 → #126; migration applied
- Step 8 (CC verify): 7 factor types emitting confirmed
- Step 9 (Langston verify): Telegram #3392 sent; response pending
- Step 10 (governance): BATCH_CATALOG + MEMORY truth+repo + master plan §0.11.B all updated; SIM + CHANGES_AND_FIXES + PHASE_HISTORY pending in follow-up commit
- Step 11 (closure): this section

## What's next

- **Calibration window Day 0–14** (ends 2026-05-15). Watch ablation rows accumulate to n ≥ 150 per (factor, tertile) bucket. Calibration check at end.
- **B67.5** gated on calibration check. Includes deferred items: post-composition floor definition, active-path persist hook, active-path B68.5 OHLC fix.
- B68.2 → B68.3 → B68.1 sequentially after B67.5.

---

*B67.4 closure section complete 2026-05-01.*

---

# B67 IMPLEMENTATION TRACK — CLOSE-OUT 2026-05-03

**Status:** B67 IMPLEMENTATION TRACK CLOSED. All foundational sub-deliverables LIVE on PM2 #130. Only remaining piece is **B67.5 consumer wiring**, which is gated on the calibration check at the end of the B67.4 14-day window (~2026-05-15) and requires the calibration to pass before consumers can be wired.

## Sub-deliverables shipped (chronological)

| Sub-deliverable | Date | Commit anchor | Status |
|---|---|---|---|
| **B67.0** Telemetry & ablation framework | 2026-04-28 | `105d2b53` | ✅ LIVE |
| **B67.3** Per-underlying position cap (shadow) | 2026-04-28 | `ca0e2c2d` | ✅ LIVE shadow |
| **B67.1** Macro confidence modifier | 2026-04-28 → fully cleaned 2026-04-29 | `828f6d92` + cleanup `6177013e` `82e542ff` `cab55804` `ed9a1a08` | ✅ LIVE no-shadow |
| **B67.2** Phase dimension (EARLY/PRIME/LATE) | 2026-04-29 | `9f82f401` | ✅ LIVE |
| **B67.2.1** Trade-record persistence + UI | 2026-04-29 | `141ec3c3` `41abd541` `575dbca4` | ✅ LIVE |
| Replay-ablation logic + cron | 2026-04-29 | `3d1a1e7f` `5e1031a6` `33df2380` | ✅ LIVE |
| **B67.3.5** Pre-window hardening (TFS desat + phase backfill) | 2026-04-29 | `49209eb4` `d97d47d7` | ✅ LIVE |
| **B67.0.1** Replay-ablation join fix (natural key) | 2026-04-30 | `3afd8ed2` + `f6a0bb87` `67cf66d9` | ✅ LIVE |
| **B67.4** Cheap-tier bundle (outcome feedback + regime-age + Path B sustainability) | 2026-05-01 | `24c88702` + 3 hotfixes (`173d1d59` `f5fe7e71` `18165430`) | ✅ LIVE |
| Calibration WR threshold + passive archive timeout fix | 2026-05-01 | `545094dc` | ✅ LIVE |
| **B67.5-prep** Post-composition floor 0.40 → 0.45 module_constant | 2026-05-03 | `1d25cb7c` | ✅ LIVE |

## Sub-deliverables remaining

| Sub-deliverable | Status | Gate |
|---|---|---|
| **B67.5 consumer wiring** (7 consumers + RegimeWeight deletion) | PENDING | Calibration check at 2026-05-15 (B67.4 14-day window end) — must pass tertile-monotonic WR + ≥7pp HIGH-LOW gap + p<0.05 + n≥150/bucket per Langston cc-inbox #856. |
| Active-path B68.5 OHLC plumbing fix | DEFERRED to B67.5 | Carries with B67.5 consumer wiring batch. RUNNING_ISSUES #44. |
| Active-path persisted-modulated-confidence hook | DEFERRED to B67.5 | Same as above. RUNNING_ISSUES #45. |

## Foundation architecture delivered by B67 (summary for future reference)

1. **Confidence modulation chain** went from 1 modulator (pre-B67) to 6 modulators post-B68.3:
   ```
   raw × macro × phase × freshness × outcome × volume_regime × pair_correlation
     → clamp [b67_5_post_composition_floor (0.45), 1.0]
   ```
   Note: B68.2 (volume regime) and B68.3 (pair correlation) shipped in the B68 program but slot into the same B67-architected chain.

2. **Per-factor ablation framework** (B67.0): `regime_factor_alternates` table with discriminated source (active_signal vs vts_trade) + replay-ablation nightly cron + drift dashboard aggregator. 9 factor types currently emitting.

3. **MCE 8-group config orchestrator** (built incrementally B67.1 → B67.4 §D.4 split → B68.2 → B68.3): `refreshAllConfigs` orchestrator + per-group try/catch fault tolerance + first-refresh hard-fail wrapper. Resolves all factor-related module_constants in a single 60s refresh cadence.

4. **Calibration window infrastructure**: per-factor 14-day mini-windows attribute independently. Three currently running in parallel (B67.4 / B68.2 / B68.3, all ending ~2026-05-15-16).

5. **Trade record persistence + UI** (B67.2.1): `regime_confidence_modulated` column reflects full chain composite; UI tables render confidence + phase badges in same column as regime label.

6. **Factor Calibration UI panel** (B73.2 follow-up): tertile WR + predictive lift = REAL spread − ALT spread per factor. Decision-grade gate at n≥150 per bucket. Auto-extends to new factor types.

7. **Hard-fail discipline on module_constants**: every threshold/weight/multiplier is DB-tunable. No hardcoded constants from B67 forward (Kyle §0.9 directive). Cold-start warmup paths are legitimate runtime states with telemetry, not silent fallbacks.

## What B67.5 consumer wiring will entail (when calibration passes)

- Replace `regimeWeight` reads with `regime_confidence_modulated` reads in 7 consumers (signal-orchestrator finalScore, RTB queue ranking, paper-execution sizing, etc. — full list in B67 master scope §6 Consumer Map)
- Delete `regimeWeight` constant entirely (no fallback, no shadow)
- Wire active-path emit hook OHLC fix (RUNNING_ISSUES #44)
- Wire active-path persisted-modulated-confidence hook (RUNNING_ISSUES #45)
- New batch when calibration check passes — own scope, pre-audit, implementation, governance.

## Final close of B67 (separate event)

This progress report stays OPEN until B67.5 consumer wiring ships. At that point the report gets a final closure section and B67 entry in BATCH_CATALOG flips from "implementation track closed" to fully CLOSED.

## Workflow stats

- Sub-deliverables: 11 ship events (incl. hotfixes + cleanup commits)
- Langston review gates: cc-inbox #835, #836, #844, #846, #850, #852, #856, #857, #864, #866, #872, #876, #879, #880, #881, #882, #883, #884, #885, #886 (Steps 1/2/4/8 across all sub-deliverables)
- Total commits to B67 umbrella: ~30+
- CI hotfixes: 3 (B67.4 hardcoded TFS strings, B67.4 unhandled rejection, B67.4 OHLC plumbing) + 1 (B68.3 anti-correlation test fix)
- Calibration windows opened: 3 (B67.4, B68.2, B68.3) all running in parallel through 2026-05-15-16

---

*B67 implementation track close-out complete 2026-05-03. Report stays OPEN until B67.5 consumer wiring ships post-calibration.*
