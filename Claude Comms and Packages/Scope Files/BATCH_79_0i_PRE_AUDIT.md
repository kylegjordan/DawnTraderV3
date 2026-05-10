# BATCH 79.0i — Pre-Implementation Audit

> **Status:** AWAITING LANGSTON REVIEW (Step 2 of canonical workflow)
> **Author:** Claude Code
> **Created:** 2026-05-10
> **Scope reference:** `BATCH_79_0i_SCOPE.md` (post-Langston-revision)
> **SIM consultation:** mandatory per CLAUDE.md §9 — completed below

---

## 1. Executive summary

**This batch is observability-only.** No regime/DBS/threshold/policy changes; no live-trading path changes. Surface area:

- 1 new tab in existing `client/src/pages/machine-learning.tsx` (split into a separate component file `client/src/components/machine-learning/xstocks-tab.tsx`)
- 3 NEW endpoints under `/api/xstocks/`: `filter-diagnostics`, `strategy-fire-rate`, `freshness`
- 3 EXISTING endpoints get OPTIONAL `?asset_class=` query param: `/analytics/exit-strategy-ablation`, `/analytics/factor-calibration`, `/analytics/ablation-comparison`
- 2 aggregator services parameterized: `drift-dashboard-aggregator.ts` (replace hardcoded `'crypto_spot'` at line 1055 with REQUIRED param) + `exit-strategy-ablation-aggregator.ts` (add nullable `assetClass` param)
- 1 freshness-map accessor added to in-memory ticker freshness service

**Crypto regression posture:** structural-equivalence + SQL-string equivalence when query param is omitted. Default-omitted code paths byte-identical. (See §5.)

**Phasing recommendation:** B79.0i.a tonight (Panels A scanner-only + E only) + B79.0i.b Tue/Wed (Panels B/C/D). Justification: pre-audit Finding #1 below.

---

## 2. SIM consultation — every component touched

### 2.1 New: `client/src/components/machine-learning/xstocks-tab.tsx`
- **Upstream:** consumes `/api/xstocks/*` and `/api/analytics/*?asset_class=xstock_spot` via `useQuery`/`apiFetch`.
- **Downstream:** rendered inside `machine-learning.tsx` `TabsContent value="xstocks"` block.
- **Shared state:** none (read-only React component).
- **Background execution:** none (queries are user-driven + react-query polling at safe intervals — 15s for diagnostics, 60s for ablation).
- **Blast radius:** LOW.
- **Tests:** smoke tests acceptable (component-renders-without-throwing). Full e2e is the G3 Claude-in-Chrome walkthrough.

### 2.2 Modified: `client/src/pages/machine-learning.tsx`
- **Change:** add `<TabsTrigger value="xstocks">` (LAST in tabs group) + `<TabsContent value="xstocks"><XstocksTab /></TabsContent>` block.
- **Upstream:** existing tabs unchanged.
- **Downstream:** none — leaf page.
- **Blast radius:** LOW (purely additive; existing tabs untouched).
- **Tests:** existing ML page tests must still pass.

### 2.3 New endpoint: `GET /api/xstocks/filter-diagnostics`
- **Source:** `xstockSpotScanner.getDiagnostics()` + count from `xstock_spot_ticker_snap` for last-N-cycles. NOTE per Finding #1: per-stage IMF/family/SQE/trade funnel counters do NOT exist for xstock_spot. This endpoint returns scanner-cycle level + freshness only for B79.0i.a; full funnel deferred to a future B79.x batch when the scanner is wired through.
- **Upstream:** `xstockSpotScanner` (in-memory diagnostics) + `xstock_spot_ticker_snap` partitioned table.
- **Downstream:** xStocks tab Panel A.
- **Shared state:** none.
- **Background execution:** none (synchronous read).
- **Blast radius:** LOW.

### 2.4 New endpoint: `GET /api/xstocks/strategy-fire-rate?window=rolling_7d`
- **Source:** `signal_eval_archive` table filtered on `asset_class='xstock_spot'`, grouped by `(strategy_name, regime)`, counting fires.
- **Upstream:** `signal_eval_archive` partitioned table (B70 + B79.0e renamed; has `asset_class` column populated).
- **Downstream:** xStocks tab Panel D.
- **Shared state:** none.
- **Background execution:** none.
- **Blast radius:** LOW.

### 2.5 New endpoint: `GET /api/xstocks/freshness`
- **Source:** in-memory ticker freshness map (already consumed inside `xstockSpotScanner.runCycle` via `isPairDataFresh`). Need to add an accessor that returns `{ symbol, lastTickAt, staleSeconds, state }` rows.
- **Upstream:** `server/utils/data-freshness.ts` (or wherever the freshness map lives).
- **Downstream:** xStocks tab Panel E.
- **Shared state:** in-memory state read; no mutation.
- **Background execution:** none.
- **Blast radius:** LOW.

### 2.6 Modified: `server/routes.ts` — `/analytics/exit-strategy-ablation`
- **Change:** add OPTIONAL `?asset_class=` query param. When present, pass to `computeExitStrategyAblation(window, regimeFilter, assetClass)`. When absent, pass `null` (preserves current behavior).
- **Inline contract comment** (Langston revision): "When `asset_class` is omitted, behavior MUST remain byte-identical to pre-B79.0i."
- **Upstream:** none (route handler).
- **Downstream:** `exit-strategy-ablation-aggregator.ts` (called function gets new arg).
- **Blast radius:** MEDIUM (touches existing endpoint, but additive parameter).

### 2.7 Modified: `server/routes.ts` — `/analytics/factor-calibration` + `/analytics/ablation-comparison`
- Same pattern as 2.6. Add optional `?asset_class=` param. Forward to aggregator. Default `null` preserves existing behavior.

### 2.8 Modified: `server/services/exit-strategy-ablation-aggregator.ts`
- **Change:** function signature gains `assetClass: string | null` arg. When null, no `WHERE asset_class = ...` filter (today's behavior). When set, filter rows by `asset_class = $X`.
- **Crypto regression invariant:** when `assetClass` is null, generated SQL string is **string-identical** to pre-change SQL. Asserted by unit test.
- **Upstream:** route handler passes the value through.
- **Downstream:** aggregator runs SQL on `exit_strategy_alternates` table.
- **Blast radius:** MEDIUM.

### 2.9 Modified: `server/services/drift-dashboard-aggregator.ts`
- **Change at line 1055:** replace hardcoded `AND asset_class = 'crypto_spot'` with parameterized `AND asset_class = ${assetClass}`. The aggregator function signature gains a **REQUIRED** `assetClass: string` param (per Langston revision: no internal default — default lives in route handler only). Default value `'crypto_spot'` is supplied by route handler when query param absent (preserves current behavior).
- **Crypto regression invariant:** when route handler defaults to `'crypto_spot'`, the aggregator runs the same SQL as today (just parameterized instead of literal).
- **Upstream:** route handlers pass the value through.
- **Downstream:** SQL on `regime_factor_alternates` table.
- **Blast radius:** MEDIUM.

### 2.10 Modified: `server/utils/data-freshness.ts` (or similar)
- **Change:** add accessor `getFreshnessMapByAssetClass(assetClass: string): Array<{symbol, lastTickAt, staleSeconds, state}>`.
- **Upstream:** none new.
- **Downstream:** Panel E endpoint.
- **Blast radius:** LOW (additive).

---

## 3. Pre-implementation findings

### Finding #1 (CRITICAL — narrows scope of Panel A) — Funnel counters do NOT exist for xstock_spot

`server/asset_classes/xstock_spot/scanner.ts` line 260 TODO confirms: "Day 1 = observability only; Layer-3 threshold calibration drives the downstream wiring decision." The scanner currently:

- Tracks: `cyclesCompleted`, `cyclesSkippedMarketClosed`, `pairsScannedLastCycle`, `pairsFreshLastCycle`, `pairsStaleLastCycle`, `lastUniverseSize`, `lastArcaOpen`, `lastCycleDurationMs`.
- Does NOT track: IMF gate pass/fail, family-routing distribution, SQE pass/fail, trade-emission counts.
- Does NOT route fresh pairs into `signal-orchestrator` / `strategy-engine` (line 260 TODO).

ORB strategy fires through a separate path (`server/strategies/orb.ts` invoked via the standard strategy-engine dispatch, gated on the asset-class triple-defense). Its fires DO land in `signal_eval_archive` with `asset_class='xstock_spot'` — that's why Panel D (strategy fire-rate) is feasible.

**Implication for scope:**

- **Panel A in B79.0i.a ships as a "scanner cycle metrics" panel only**, NOT a full funnel. Header strip with `cyclesCompleted`, `lastCycleDurationMs`, `lastUniverseSize`, `lastArcaOpen`. Body: `pairsScannedLastCycle`, `pairsFreshLastCycle`, `pairsStaleLastCycle`. Bar chart: rolling-24h cycles + fresh/stale ratios.
- **The full IMF→family→SQE→trade funnel** is deferred to a future B79.x batch where the scanner gets wired through orchestration. Out of scope here.
- This trims B79.0i.a's scope cleanly to scope-bounded work — no bloat by adding scanner instrumentation. Exactly Langston's Q2 guidance.

### Finding #2 — `signal_eval_archive` HAS `asset_class` column populated (B79.0e + B79.0f backfill)

`server/services/data-archive/signal-eval-archiver.ts:101` writes `asset_class: input.assetClass` per row. B79.0f backfilled 4862 collision rows. Schema confirmed.

Panel D (`strategy-fire-rate`) is feasible. Query: `SELECT strategy_name, regime, COUNT(*) FROM signal_eval_archive WHERE asset_class='xstock_spot' AND captured_at > NOW() - INTERVAL '7 days' GROUP BY 1, 2`.

### Finding #3 — `regime_factor_alternates` HAS `asset_class` column

`shared/schema.ts:530`. Already populated for crypto_spot. Will populate for xstock_spot as ORB/strategy fires accumulate. Until then, the asset-class-scoped query returns n=0 — Panel C must show empty-state per Langston revision.

### Finding #4 — `exit_strategy_alternates` table HAS `asset_class` column (verified 2026-05-10)

`psql \d exit_strategy_alternates` on staging confirms `asset_class | text | not null | default 'crypto_spot'::text`. Also has `exchange | text | not null | default 'kraken'::text`. No migration needed for B79.0i.b — purely additive WHERE filter.

### Finding #5 — fx5Scanner's `getRolling24hDiagnostics` shape is rich; xstockSpotScanner's is flat

The crypto Filter Diagnostics panel reads a complex shape including `quant.imf`, `pattern.imf`, `familyPaths`, etc. (`fx5-scanner.ts:367-470`). xstockSpotScanner's `getDiagnostics()` returns the simple `ScannerDiagnostics` interface (lines 59-74).

**Confirms scope:** new sibling endpoint `GET /api/xstocks/filter-diagnostics` returning the FLAT xstock shape. Do NOT shoehorn the xstock data into the crypto Filter Diagnostics endpoint — schemas diverge; bridging would risk crypto regression.

### Finding #6 — `MULTI_ASSET_VTS_EXPANSION_PLAN.md` and SIM updates

Per Phase 24 standing rule documented in POST_AUDIT_ROADMAP.md: "Each new asset class gets dedicated observation UI tab." This batch operationalizes that for xstock_spot. SYSTEM_IMPACT_MAP.md needs a new Layer-9 (UI/Frontend) entry for `xstocks-tab.tsx` and the 3 new endpoints. ASSET_CLASS_ONBOARDING_WORKFLOW.md gets a new Section M "Stand up the dedicated observation tab" with the procedural recipe (B80 implementer's blueprint).

### Finding #7 — Empty-state UX components (Langston revision 2026-05-10)

Need an empty-state pattern reusable across all 5 panels. Recommendation: simple internal `<EmptyPanelState message="..." />` component co-located in `xstocks-tab.tsx` showing icon + message + optional secondary text. Visually distinct from `<LoadingState />`.

### Finding #8 — Caveat banner component

Panel C requires the amber/yellow visually-unmissable banner per Langston revision. Recommendation: reuse shadcn `<Alert variant="warning">` (or equivalent) with the `Treat as system-health telemetry, not signal.` wording.

### Finding #9 (Langston observation O1) — React-query cache key isolation

When xStocks-tab calls `/api/analytics/exit-strategy-ablation?asset_class=xstock_spot` and the existing crypto Drift Dashboard panel calls the same endpoint without the param, the asset_class param **MUST be part of the react-query `queryKey` array** so the two responses don't collide in the cache. Implementation checklist item: every xStocks-tab `useQuery` call that targets a shared endpoint must include the asset_class param in the `queryKey` (e.g., `queryKey: ['/api/analytics/exit-strategy-ablation', { asset_class: 'xstock_spot', window: 'rolling_7d' }]`).

### Finding #10 (Langston observation O4) — Panel A cold-scanner empty state

If `cyclesCompleted=0` immediately post-deploy (scanner hasn't run yet), Panel A header strip would render all zeros — confusing for a reviewer. Implementation requirement: when `cyclesCompleted === 0`, render `<EmptyPanelState message="Scanner has not completed first cycle yet — refresh in ~30s" />` instead of the zero-valued header. This is a special-case empty state distinct from the loading state.

### Finding #11 (Langston observation O2) — CalibrationCaveatBanner shipping in .a

Audit §4 step 1 ships banner shells in .a even though banner is consumed by Panel C in .b. Acceptable per Langston — cheaper than revisiting layout. Constraint: the .a-shipped banner component **must render nothing visible when no data is bound to it** (no mounted banner without backing data) so Panel A reviewer isn't confused.

### Finding #12 — TypeScript / OpenAPI regen risk: NONE (Langston observation O3)

Adding optional query params is purely additive on the TypeScript backend. No client codegen / typed-client regen needed.

---

## 4. Implementation plan (Step 3 sequence)

### B79.0i.a (target: ship today before ARCA reopen 22:00 UTC if review timeline allows; otherwise first thing tomorrow)

1. Create `client/src/components/machine-learning/xstocks-tab.tsx` skeleton with Panel A (scanner cycle) + Panel E (freshness) + reusable `EmptyPanelState` + `CalibrationCaveatBanner` component shells (banner used in .b — cheap to ship now to avoid revisiting layout).
2. Add `<TabsTrigger>` + `<TabsContent>` block to `machine-learning.tsx`. Position LAST in tabs group.
3. Add new route handler `GET /api/xstocks/filter-diagnostics` returning xstockSpotScanner.getDiagnostics() + light DB-derived rolling 24h (cycles count from log table OR derived from `xstock_spot_ticker_snap` row count).
4. Add new route handler `GET /api/xstocks/freshness` calling new accessor on freshness map.
5. Add freshness-map accessor in `data-freshness.ts`.
6. Run TypeScript + tests locally; fix any.
7. Push branch; wait CI 4/4 GREEN.
8. Deploy to staging via SSH + pm2 restart; capture pre-deploy curl baseline of all 4 shared endpoints.
9. Run **5-gate verification** including G3 Claude-in-Chrome walkthrough.

### B79.0i.b (target: Tue/Wed 2026-05-12/13 once shadow-mode evidence accumulates)

1. Add `assetClass` parameterization to `drift-dashboard-aggregator.ts:1055` + `exit-strategy-ablation-aggregator.ts` (with crypto-regression unit test).
2. Add OPTIONAL `?asset_class=` to 3 shared route handlers + inline contract comments.
3. Add `GET /api/xstocks/strategy-fire-rate` route handler.
4. Implement Panels B (Exit Ablation), C (Calibration Ablation with caveat banner), D (Strategy Fire-Rate by Regime) in `xstocks-tab.tsx`.
5. Push CI deploy verify (5-gate including UI walkthrough on the new panels).

---

## 5. Crypto regression test plan (G5 from scope §4.1)

### 5.1 Pre-deploy baseline capture (G1 step)

For B79.0i.b deploy, BEFORE the `git push`:
```bash
ssh root@188.245.193.8 'TOKEN=$(curl ... login ...) && \
  curl -s -H "Authorization: Bearer $TOKEN" http://localhost:5000/api/vts/filter-diagnostics > /tmp/baseline_filter.json && \
  curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/analytics/exit-strategy-ablation?window=rolling_7d" > /tmp/baseline_exit.json && \
  curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/analytics/factor-calibration?window=rolling_7d" > /tmp/baseline_calib.json && \
  curl -s -H "Authorization: Bearer $TOKEN" "http://localhost:5000/api/analytics/ablation-comparison?window=rolling_24h" > /tmp/baseline_abl.json'
```

### 5.2 Post-deploy structural check (Langston revision C4 — recursive)

Same curl against the same 4 endpoints (NO `asset_class` param). Then:

1. **Recursive schema diff** via `jq` — every nested key path identical (catches the case where `summary.factor_lift` becomes `summary.factorLift` and the top-level key set is unchanged):
   ```bash
   diff \
     <(jq -r 'paths(scalars) | join(".")' /tmp/baseline_filter.json | sort -u) \
     <(jq -r 'paths(scalars) | join(".")' /tmp/post_filter.json | sort -u)
   # MUST be empty
   ```
2. **Type diff** at each path:
   ```bash
   diff \
     <(jq -r 'paths(scalars) as $p | "\($p | join(".")):\(getpath($p) | type)"' /tmp/baseline_filter.json | sort -u) \
     <(jq -r 'paths(scalars) as $p | "\($p | join(".")):\(getpath($p) | type)"' /tmp/post_filter.json | sort -u)
   # MUST be empty
   ```
3. **Live aggregate values may differ** (shadow-mode signals continued accumulating during deploy). NOT a regression.

### 5.3 SQL-string equivalence (unit test, Langston revision Q8 + C4)

Add Jest test `server/tests/unit/b79-0i-aggregator-default-sql.test.ts`:
- Stubs `db.execute` (or hooks the `pg` driver query event) to capture the rendered Drizzle `SQL` object.
- Uses Drizzle's `.toSQL()` / `.toQuery()` helper to extract `{ sql: string, params: any[] }`.
- Calls each of the 3 aggregator paths in default mode:
  1. `computeExitStrategyAblation(window, null, null)` — exit-strategy-ablation aggregator
  2. `computeAblationComparison(window, 'crypto_spot')` — ablation-comparison path in drift-dashboard-aggregator
  3. `computeFactorCalibration(window, 'crypto_spot')` — factor-calibration path in drift-dashboard-aggregator (covers line-1055 area)
- Asserts BOTH `sql` AND `params` (arity + types) match a **committed baseline fixture** stored in the test file with a comment naming the commit hash from which the fixture was captured: `// Baseline captured at commit <hash> on 2026-05-XX`. The fixture is version-controlled so future Drizzle upgrades trigger a deliberate fixture re-capture, not a silent drift.
- **Fallback if `.toSQL()` doesn't cleanly resolve:** use a `pg`-driver query-event hook in the test harness to capture the actual emitted SQL. **Reject the debug-log-and-grep approach** per Langston revision (log pollution + format-drift brittleness).

### 5.4 Visual smoke

After deploy, navigate to:
- `http://188.245.193.8/machine-learning` → "Filter Diagnostics" tab — must look identical
- `http://188.245.193.8/machine-learning` → "DBS Pair Tracking" tab — must look identical
- Drift Dashboard route — must look identical

If anything visually changed, G5 fails — fix forward.

---

## 6. Verification runbook (G3 Claude-in-Chrome — Kyle directive)

### 6.1 Pre-walkthrough setup
- Confirm latest commit deployed; `pm2 logs dawntrader --lines 30 --nostream` → no boot errors.
- Capture `[B79.0a][SCAN_CYCLE_DONE]` log timestamp baseline.
- Open browser DevTools, switch to Network + Console tabs.

### 6.2 Walkthrough

**All screenshots save to** `Claude Comms and Packages/Batch Completion/B79_0i_screenshots/` (Langston revision C2). Filename convention: `<panel>_<UTC-timestamp>_<deploy-commit-short>.png`.

**Pre-walkthrough env-flag check (Q6 / Langston rev):**
```bash
ssh root@188.245.193.8 'pm2 env dawntrader | grep -E "BACKPRESSURE_TEST_MODE|HOSTILE_SIM_OVERRIDE|NODE_ENV"'
```
Must show `BACKPRESSURE_TEST_MODE` UNSET (or absent). Document the env state in completion report so Panel A `lastUniverseSize` value is interpretable.

1. Navigate to `http://188.245.193.8`. Login as `testuser123 / SecurePass123!`.
2. Click **Machine Learning** in sidebar.
3. Click the **xStocks** tab (last tab in tabs group). Screenshot: `xstocks_tab_loaded_<timestamp>_<commit>.png` → save to `B79_0i_screenshots/`.
4. **Panel A (Scanner Cycle Metrics):** verify
   - Header strip shows non-zero `cyclesCompleted` and recent `lastCycleAt`. **If `cyclesCompleted=0` (cold scanner immediately post-deploy), expect explicit empty-state "Scanner has not completed first cycle yet — refresh in ~30s" rather than zeroes** (Langston observation O4).
   - `lastUniverseSize` matches expected. **Expected values defined by:** `XSTOCK_SPOT_SYMBOLS` cardinality (full set ~50) when ARCA open OR weekend; `XSTOCK_SPOT_24_7_SYMBOLS` cardinality (10) when ARCA closed AND not weekend. Source-of-truth: `shared/asset-classes.ts` definitions of those two sets — verifier MUST cross-check against that file, not trust the runbook number.
   - `pairsFreshLastCycle` + `pairsStaleLastCycle` values render.
   - Network: GET `/api/xstocks/filter-diagnostics` returns 200; no 4xx/5xx.
   - Console: no errors.
   - Screenshot: `xstocks_panel_a_<timestamp>_<commit>.png` → save to `B79_0i_screenshots/`.
5. **Panel E (Per-pair Freshness):** verify
   - List sorts stalest-first.
   - Each row shows `lastTickAt`, `staleSeconds`, state (fresh/stale/dead).
   - 10 Phase-1 24/7 names visually distinguished from 24/5 ARCA-aligned (icon, label, or color).
   - Network: GET `/api/xstocks/freshness` returns 200.
   - Console: no errors.
   - Screenshot: `xstocks_panel_e_<timestamp>_<commit>.png` → save to `B79_0i_screenshots/`.
6. **Data-integrity cross-check (Langston revision C3 — replaced fragile log-grep approach):** instead of the PM2-buffer log grep (which silently undercounts when cycles exceed buffer window), corroborate Panel A's `cyclesCompleted` against the actual scan-cadence via tick-rate logic:
   - Note start time T0 + Panel A `cyclesCompleted` = N0.
   - Wait 60 seconds.
   - Refresh Panel A → `cyclesCompleted` = N1.
   - Expected: `N1 - N0` should equal **2** (30s scan interval ⇒ 2 cycles/min). Tolerance ±1 (boundary timing). If `N1 - N0 != [1, 2, 3]`, the gate fails — scanner cadence is wrong.
   - Document N0, N1, T0 in completion report. This is a **rate sanity check**, not an absolute count match — explicitly so per Langston revision.
7. **Crypto regression visual smoke (G5):** click back to "Filter Diagnostics" tab. Verify identical to pre-deploy memory. Click "DBS Pair Tracking" tab. Same.
8. Capture full PM2 log dump during the walkthrough:
   ```bash
   ssh root@188.245.193.8 'pm2 logs dawntrader --lines 500 --nostream' > /tmp/b79_0i_a_postwalk_logs.txt
   ```
   Then **scp back to repo for durable evidence (Langston revision C3):**
   ```bash
   scp root@188.245.193.8:/tmp/b79_0i_a_postwalk_logs.txt "G:/My Drive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/Claude Comms and Packages/Batch Completion/B79_0i_screenshots/b79_0i_a_postwalk_logs.txt"
   ```
   Grep for `[ERROR]`, stack traces, 500s linked to new endpoints. Must be ZERO.

### 6.3 Failure mode handling
If any gate fails: screenshot the failure, capture relevant log lines, post to Telegram + start fix-forward in a new commit. Do NOT proceed to completion report or governance until G3 passes cleanly.

---

## 7. Open questions for Langston (Step 2 review)

Q1. **Finding #1 implication for Panel A:** confirm B79.0i.a Panel A ships as scanner-cycle-only (no IMF/family/SQE funnel). Full funnel deferred to a future B79.x where scanner is wired through orchestration. Acceptable?

Q2. **Finding #4 verification timing:** should the `exit_strategy_alternates.asset_class` column existence be verified BEFORE B79.0i.b implementation begins (to avoid mid-batch surprise), or is verifying-as-part-of-impl acceptable? CC's preference: verify at start of B79.0i.b to avoid mid-batch reshuffling.

Q3. **Empty-state component:** OK with co-locating `<EmptyPanelState />` inside `xstocks-tab.tsx` rather than promoting to `client/src/components/ui/empty-panel-state.tsx`? Promoting it would be cleaner for B80 reuse but adds a file to this batch's blast radius. CC leans co-locate now; promote when B80 needs it.

Q4. **Caveat banner reuse:** OK with `<CalibrationCaveatBanner n={...} />` co-located in `xstocks-tab.tsx`? Same trade-off as Q3.

Q5. **Pre-deploy baseline curl** (G5 §5.1) — is capturing `rolling_7d` window the right snapshot, or do you want all 4 windows (`rolling_24h` / `rolling_7d` / `rolling_30d` / `cohort_latest`) captured for completeness?

Q6. **Hostile-sim env flag interaction with G3:** the Panel A `lastUniverseSize` value depends on whether `BACKPRESSURE_TEST_MODE=1` is set on staging. Want me to verify the staging env (it should NOT have hostile sim active) before walkthrough? CC will do this.

Q7. **B79.0i.a vs .b ordering** — is shipping .a tonight (Panels A scanner-cycle + E only) the right call given (1) Phase-1 24/7 names trade through the weekend so freshness panel gives operator-value tonight; (2) Panels B/C/D need accumulated shadow-mode data anyway? Or do you prefer combined Tue ship?

Q8. **Aggregator parameterization unit test (G5 §5.3):** acceptable to assert SQL-string equivalence by stubbing `db.execute` with a captured-args mock? Drizzle's `sql` template helper makes string extraction non-trivial — alternative is debug-log-and-grep. CC can write either; preference?

---

## 8. Awaiting Langston review

Path: `Claude Comms and Packages/Scope Files/BATCH_79_0i_PRE_AUDIT.md`. CC will send a file-first pointer per §6.5.0 once this draft is committed.
