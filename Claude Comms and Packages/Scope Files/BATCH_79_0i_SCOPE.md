# BATCH 79.0i — xStocks Observation Tab (inside Machine Learning)

> **Status:** AWAITING LANGSTON REVIEW (Step 1 of canonical workflow)
> **Author:** Claude Code
> **Created:** 2026-05-10
> **Phase:** 24 follow-up (Phase 24 closed; this is the dedicated-UI obligation flowing from Phase 24 standing rule #10 — "Each new asset class gets dedicated observation UI tab")
> **Predecessor batches:** B79 + B79.TEC + B79.0a-0h (xstock_spot fully onboarded; calibration + exit ablation captured but currently aggregated cross-asset-class)
> **Time pressure:** ARCA reopens 2026-05-10 22:00 UTC. Full UI tab ship before reopen unrealistic; partial visibility (Phase 1 below) feasible if scope+impl reviewed/approved fast. Hard-deadline-free if Phase 1 lands by 2026-05-11 14:30 UTC ORB window open.

---

## 1. Why this batch exists

After Phase 24 closure, xstock_spot is live in shadow-mode but has NO dedicated visualization. All telemetry currently surfaces only through:
- `/api/vts/filter-diagnostics` — crypto_spot only (hardcoded to `fx5Scanner`).
- `/api/diagnostics/xstock-scanner` — narrow JSON scanner-cycle metrics, no UI panel.
- `/api/analytics/exit-strategy-ablation` + `/api/analytics/ablation-comparison` + `/api/analytics/factor-calibration` — currently cross-asset aggregates with no asset_class scoping (B73) or hardcoded `crypto_spot` filter (B67.0 in `drift-dashboard-aggregator.ts:1055`).

**Kyle directive 2026-05-10 (revised):** Stand up a single **xStocks** tab inside the existing Machine Learning page (sibling to "Filter Diagnostics" + "DBS Pair Tracking"). All xstock-scoped panels live on that one tab. NOT a separate top-level page. NOT a sub-route. Just one more tab in the existing `Tabs` group on `client/src/pages/machine-learning.tsx`.

Keep crypto_spot's existing tabs untouched — no shared-panel refactor that could ripple into the no-touch fence on crypto_spot through 2026-05-15.

---

## 2. Numbered objectives

### Confirmed-in-scope (ship in this batch)

1. **New tab `xStocks`** added to `client/src/pages/machine-learning.tsx`'s Tabs group, positioned after "DBS Pair Tracking". Single `TabsContent value="xstocks"` containing all panels stacked vertically.

2. **Panel A: Filter Diagnostics (xStock-scoped)** — mirror crypto_spot's `FilterDiagnosticsPanel` structure but driven by an asset-class-scoped data source. Funnel: scanner cycle → IMF gate → family routing → SQE → trade. 24h rolling + last-scan snapshot.
   - **Scanner cycle metrics fold INTO this panel as a header strip** (not separate): `lastUniverseSize`, `lastArcaOpen`, `cyclesCompleted`, `lastCycleAt`, freshness staleness — sourced from existing `/api/diagnostics/xstock-scanner`.
   - Endpoint: new sibling `GET /api/xstocks/filter-diagnostics` (preferred — xstock scanner's diagnostics shape will differ from `fx5Scanner`'s) OR query-param on existing. Decision in pre-impl audit.

3. **Panel B: Exit Strategy Ablation (B73, xStock-scoped)** — mirror existing exit-strategy-ablation panel logic. 12 variants per closed trade, paired-diff Sharpe-like score vs Variant A baseline.
   - Add OPTIONAL `?asset_class=` query param to `/api/analytics/exit-strategy-ablation` (currently unscoped). When omitted, **byte-identical** to today (no-touch fence on crypto). When present, additional `WHERE asset_class = $1` is appended.
   - n likely small at launch — display "n=X (decision-grade at n≥150 per regime × variant)" caveat banner.

4. **Panel C: Factor Calibration Ablation (B67.0, xStock-scoped)** — mirror existing factor-calibration panel. Per-factor confidence-shift distribution + tertile WR + predictive lift.
   - Add OPTIONAL `?asset_class=` query param to `/api/analytics/factor-calibration` and `/api/analytics/ablation-comparison`. Replace hardcoded `'crypto_spot'` literal at `drift-dashboard-aggregator.ts:1055` with parameter (default behavior = same crypto_spot value when param absent).
   - **Caveat banner (mandatory, Langston revision 2026-05-10 — wording + visual):** "Current n=X. Decision-grade evidence requires n≥150 per regime × factor-tertile bucket. Given xstock_spot's ~50% lower signal volume vs crypto_spot and TFS-regime concentration, expected timeline 3–6 months. Treat as system-health telemetry, not signal." Banner must be visually unmissable: amber/yellow background block (NOT italic body text) sitting above the panel. The live `n` count is rendered into the banner so progress toward decision-grade is visible at a glance.

5. **Panel D: Strategy Fire-Rate by Regime** — for xstock_spot only. Counts fires per (strategy × regime) bucket over rolling 7d. Drives Section G "strategy-gap monitoring trigger #1" from ASSET_CLASS_ONBOARDING_WORKFLOW.
   - Source: `signal_eval_archive` filtered by asset_class. New endpoint `GET /api/xstocks/strategy-fire-rate?window=rolling_7d`.

6. **Panel E: Per-Pair Fresh-Tick Latency** — given RUNNING_ISSUES #89 (Kraken WS-equities weekend silence). For each xstock_spot symbol show `lastTickAt`, `staleSeconds`, `staleness state` (fresh/stale/dead). Sort by stalest. Distinguishes 10 Kraken Phase-1 24/7 names from 24/5 ARCA-aligned.
   - Source: existing in-memory ticker freshness map. New endpoint `GET /api/xstocks/freshness`.

### Empty-state UX requirement (Langston revision 2026-05-10)

Every panel must render an explicit empty state when shadow-mode data hasn't accumulated. Examples: "n=0, awaiting first ORB fire", "No closed trades yet — Panel populates after first trade closes", "Calibration n=0 across all factor-tertile buckets — first calibration cycle pending". Blank panels read as broken. The empty-state component must be visually distinct from a loading state.

### Caveated-in-scope (only if Langston confirms feasible without breaking no-touch fence)

7. **Panel A funnel-stage breakdown by sub-asset (24/7 Kraken Phase-1 names vs ARCA-aligned)** — split survivor counts at each pipeline stage to show whether 24/7 names dominate during ARCA-closed hours. Soft scope: useful but droppable if it complicates the asset-class-scoped funnel.

### Explicitly out-of-scope (Kyle pushback during pre-compaction discussion)

- **Mode distribution (NORMAL/DEFENSIVE/SURVIVAL)** — DROPPED. Tied to the unwired Adaptive Response System (Phase 19+). Don't surface mode distribution until that system exists and is producing meaningful signal.
- **DBS distribution panel** — DROPPED. Premature for xstock_spot at this signal volume.
- **Win-rate distribution panel** — DROPPED. Premature with low n.
- **Cross-tab links to filter ML trades by xstock_spot** — DROPPED. Out-of-scope; can add later as polish.
- **CSV exports of any panels** — DROPPED. Add later if Kyle asks.
- **Separate top-level `/xstocks` page route** — DROPPED per Kyle revision 2026-05-10. Single tab inside Machine Learning is the chosen architecture.

---

## 3. Non-objectives + invariants

- **No-touch fence on crypto_spot through 2026-05-15.** Any crypto_spot regime-thresholds, factor-chains, or classifier math is OFF-LIMITS. The shared endpoints (B73, B67.0) get an OPTIONAL `?asset_class=` query param. The contract is **structural equivalence + SQL-string equivalence when param omitted** — when omitted, the generated SQL string MUST be identical to pre-B79.0i, and the JSON response MUST have identical top-level keys, identical types, and identical array shapes. (Live aggregate values may drift between pre-deploy and post-deploy snapshots due to ongoing shadow-mode signal accumulation — that is expected and not a regression.) When `asset_class` is present, an additional `WHERE asset_class = $1` filter is appended. Every parameterized handler gets an inline contract comment: "When `asset_class` is omitted, behavior MUST remain byte-identical to pre-B79.0i."
- **No regime/DBS/threshold/policy changes.** Read-only on the math side: only adds query-param scoping + new tab + new endpoints.
- **HARD-FAIL boot preserved.** No DB-resolved settings introduced; this batch is pure read-side.
- **No new strategy gates.** ORB stays as B79.0d shipped it.
- **Shadow-mode telemetry only.** No live-trading enablement. (That's Phase 19.)

---

## 4. Verification criteria (Step 7 + 8 outcomes) — UI VERIFICATION MANDATORY

### 4.1 First-pass verification (CC) — **all five gates required, none waivable**

| Gate | What CC must do | Pass criterion |
|---|---|---|
| **G1. Build + Deploy** | Push to GitHub, wait for CI 4/4 GREEN, SSH-deploy to Hetzner staging, `pm2 logs dawntrader --lines 100 --nostream` post-restart | All 4 CI checks green; PM2 boot completes without errors; no `[BOOT_FAIL]` lines in startup log |
| **G2. Endpoint smoke** | `curl` each new + modified endpoint with auth token, both with and without `?asset_class=xstock_spot` | HTTP 200 on all; JSON shape matches schema; crypto-default responses (no asset_class param) byte-identical to pre-deploy snapshot for `/api/vts/filter-diagnostics`, `/api/analytics/exit-strategy-ablation`, `/api/analytics/factor-calibration`, `/api/analytics/ablation-comparison` |
| **G3. Live UI navigation via Claude-in-Chrome (NON-NEGOTIABLE)** | Navigate to `http://188.245.193.8`, log in as `testuser123 / SecurePass123!`, navigate to Machine Learning page, **click the new "xStocks" tab**, screenshot and inspect each of Panels A through E in turn | Tab is visible and clickable; each panel renders without console errors; numbers populated where expected (or "n=0" + caveat banner shown where data is genuinely empty); scanner-cycle header strip shows non-zero `cyclesCompleted` and recent `lastCycleAt`; the freshness panel sorts by stalest first; the calibration caveat banner is visible above the panel |
| **G4. Backend runtime log inspection** | `pm2 logs dawntrader --lines 200 --nostream` after exercising each panel via the UI; also `tail -F` during the click-through | NO error stack traces, NO `[ERROR]` lines tied to the new code paths, NO 500 responses logged for the new endpoints; expected `[B79.0i]` info-level lines visible per call |
| **G5. Crypto regression check (structural-equivalence, NOT byte-diff — Langston revision 2026-05-10)** | (a) Schema-diff the shared-endpoint JSON responses pre- vs post-deploy with `asset_class` param OMITTED — top-level keys, types, and array shapes must be identical. (b) Unit test or `[B79.0i][SQL_TRACE]` debug-log the generated SQL with `assetClass: null` and assert string-identical to pre-change SQL. (c) Visual smoke on existing crypto Filter Diagnostics + DBS Pair Tracking + Drift Dashboard pages — must render identically. **Note:** byte-diff on aggregate values is NOT the invariant — values drift over time as shadow-mode signals accumulate. Structural + SQL-string equivalence IS the invariant. | (a) JSON shape identical. (b) SQL string identical when `assetClass` is null. (c) Crypto pages render visually identically. |

**G3 is the explicit "navigate to staging and look at every panel" gate Kyle directed.** It is NOT optional. If any panel fails to render or shows console errors during navigation, G3 fails — fix forward, redeploy, re-verify.

**G3 additions per Langston review 2026-05-10:**
- **Browser DevTools Network-tab inspection** — verify NO 4xx/5xx on the asset-class-scoped XHR calls. Console-only check misses backend errors that the UI swallows.
- **Data-integrity cross-check on at least one panel** — pick one number (e.g., signals fired count on Panel A) and corroborate against a direct `psql` query on `signal_eval_archive` for `asset_class='xstock_spot'`. Catches the "panel renders, numbers are wrong" failure mode.
- **Screenshot filename convention** — `<panel>_<UTC-timestamp>_<deploy-commit-short>.png`, saved to `Claude Comms and Packages/Batch Completion/B79_0i_screenshots/`. Proves which deploy was inspected.

### 4.2 Second-pass verification (Langston, Step 8)

Langston independently:
1. Reviews the change list before push (Step 4)
2. After deploy, performs his own G2 endpoint-smoke + G5 regression-curl (he doesn't need browser; the UI portion is CC's gate)
3. Reads the runtime logs himself to corroborate G4
4. Confirms or kicks back

### 4.3 CI invariant

All 4 GitHub Actions checks (TypeScript Check, Test Suite, Build, Docker Build) GREEN on the push that lands this batch. Per CLAUDE.md §5 #8.

---

## 5. Phasing recommendation (incremental ship)

If Langston agrees with the scope, recommend shipping in 2 sub-batches to reduce risk and respect time pressure:

- **B79.0i.a (target: TODAY before ARCA reopen 22:00 UTC, or first-thing tomorrow):** New `xStocks` tab + Panel A (Filter Diagnostics with scanner-metrics header) + Panel E (per-pair freshness). These are the highest-value-during-trading panels.
- **B79.0i.b (Tuesday/Wednesday 2026-05-12/13):** Panels B (Exit Ablation), C (Calibration Ablation), D (Strategy Fire-Rate). These need shadow-mode evidence which won't accumulate meaningfully until ORB has fired several times across multiple sessions.

Alternatively ship as one batch if Langston believes it's safe + reviewable in time. Defer to his call.

---

## 6. Pre-implementation audit areas (Step 2) — **MUST include UI-verification plan**

To populate `BATCH_79_0i_PRE_AUDIT.md` (CC must complete before Step 3 implementation):

1. **SIM consultation (mandatory per CLAUDE.md §9):** components touched =
   - `client/src/pages/machine-learning.tsx` — add `TabsTrigger value="xstocks"` + `TabsContent value="xstocks"` block, plus 5 new panel components (or imported from a new file `client/src/pages/machine-learning-xstocks-tab.tsx` to keep the parent file readable).
   - `server/routes.ts` — add OPTIONAL `?asset_class=` to `/analytics/exit-strategy-ablation`, `/analytics/factor-calibration`, `/analytics/ablation-comparison`. Add new routes `/api/xstocks/filter-diagnostics`, `/api/xstocks/strategy-fire-rate`, `/api/xstocks/freshness`.
   - `server/services/drift-dashboard-aggregator.ts` — replace hardcoded `'crypto_spot'` literal at line 1055 with **REQUIRED** `assetClass: string` parameter. The inner aggregator function MUST require an explicit `assetClass` arg (no internal default). The default value `'crypto_spot'` lives **only in the route handler** when query param is absent. **Do not let `'crypto_spot'` propagate down through the call stack — that turns a fence into a hidden fallback** (per Kyle directive §11 "no silent fallbacks for DB-governed settings"; Langston revision 2026-05-10).
   - `server/services/exit-strategy-ablation-aggregator.ts` — add `assetClass: string | null` parameter; when null, no WHERE filter (preserves today); when set, append `AND asset_class = $X` to existing query.
   - `server/asset_classes/xstock_spot/scanner.ts` — surface per-stage funnel counters analogous to `fx5Scanner.getRolling24hDiagnostics()` IF NOT ALREADY PRESENT (resolve in audit).
   - In-memory ticker freshness map — add accessor for route handler.
2. **Upstream:** scanner emits funnel counters, B73 alternates table, B67.0 alternates table, signal_eval_archive.
3. **Downstream:** new tab is a leaf consumer; no downstream impact. Crypto-default behavior on shared endpoints is preserved by-construction.
4. **Shared state:** none modified. All read-side.
5. **Background execution:** none added.
6. **Blast radius:** SMALL on xstock_spot side (new code path, unscoped consumers unaffected). NEAR-ZERO on crypto_spot side (only optional query param, default behavior unchanged).
7. **Funnel-counter availability check (CRITICAL pre-impl-blocker):** does `xstockSpotScanner` already track per-stage counters (IMF/family/SQE/trade) the way `fx5Scanner` does? If NOT, this batch grows by however much plumbing is needed; document in audit and possibly defer the funnel breakdown to B79.0i.b.
8. **UI-verification plan (Kyle directive 2026-05-10 — MANDATORY):** the audit doc must include the explicit Claude-in-Chrome navigation runbook CC will execute after deploy:
   - Navigate to staging URL
   - Login flow
   - Path to the xStocks tab
   - Each panel that must be screenshotted + inspected
   - The PM2 log commands to run before/during/after the UI walkthrough
   - The curl commands for the regression baseline (G5) and the post-deploy diff
   - Where screenshots get saved for the completion report

---

## 7. Open questions for Langston

Q1. **Endpoint shape preference:** add `?asset_class=` to existing endpoints (DRY, but slight risk of regression) vs sibling `/api/xstocks/*` endpoints (clean separation). CC's preference: `?asset_class=` query-param on B67.0/B73 existing endpoints (their schema is asset-class-agnostic), NEW siblings for xstock-specific (filter-diagnostics, fire-rate, freshness) since scanner-diagnostics shape will differ.

Q2. **Funnel counter availability** — does `xstockSpotScanner` currently emit IMF/family/SQE per-stage counters? If not, scope-here or punt to B79.0i.b?

Q3. **Phase 1 only vs full batch in one shot** — given time pressure to ARCA reopen tonight, is a tighter Phase 1 (Panels A+E only) acceptable for ship-tonight, with the ablation/calibration/fire-rate panels as a B79.0i.b follow-up Tuesday/Wednesday? Or do you prefer one combined ship Tuesday once everything is reviewed-as-a-unit?

Q4. **Crypto regression test method:** is curl-diff against pre-deploy snapshot acceptable as the regression-verification path (G5)? Alternative: snapshot tests in jest. CC's preference is curl-diff (faster, real-staging-data).

Q5. **Freshness panel data source:** does the in-memory freshness map currently expose a getter usable from a route handler, or does this batch add the accessor? Cheapest path preferred.

Q6. **Caveat banner wording for Panel C calibration tab** — Kyle wants this surfaced for FRAMEWORK HEALTH visibility despite the 3-6 month decision-grade timeline. Is the banner wording in §2 obj 4 sufficient, or stronger language preferred?

Q7. **Tab placement order** — sibling to Filter Diagnostics + DBS Pair Tracking, positioned LAST in the tabs group. Acceptable, or do you prefer it positioned somewhere else (e.g., right after "diagnostics")?

Q8. **Code-organization preference** — keep all 5 panels inline in `machine-learning.tsx` OR split into a new file `client/src/components/machine-learning/xstocks-tab.tsx`? CC leans split-file (parent already huge — 3400+ lines).

---

## 8. Governance impact (Step 10 commitment)

This batch will update:
- BATCH_CATALOG.md — new B79.0i row (or B79.0i.a + B79.0i.b if phased)
- PHASE_HISTORY.md — Phase 24 follow-up entry
- SYSTEM_IMPACT_MAP.md — new tab in `machine-learning.tsx`; `?asset_class=` query param surfaced on 3 endpoints; 3 new endpoints under `/api/xstocks/`; aggregator parameterization
- SYSTEM_MANUAL.md — likely no architectural-truth update needed (this is observability, not new system architecture). Confirm in audit.
- ASSET_CLASS_ONBOARDING_WORKFLOW.md — add Section M "Stand up the dedicated observation tab" with the procedural recipe that B80 (crypto_perp) implementer will follow.
- POST_AUDIT_ROADMAP.md — Phase 24 standing rule #10 obligation closed (or noted closed-for-xstock_spot).
- Completion report at `Claude Comms and Packages/Batch Completion/BATCH_79_0i_COMPLETION_REPORT.md` — must include G3 screenshot evidence per Kyle directive.
- MEMORY.md (CC + Langston, both per CLAUDE.md §2 Step 10.b) — drop next-step pointer once shipped.

---

## 9. Workflow autonomy (Kyle directive 2026-05-10)

Kyle has authorized CC + Langston to iterate autonomously to completion on this batch (per CLAUDE.md §6.7 default behavior; reaffirmed for B79.0i specifically). Escalation back to Kyle only on:
- True deadlock with Langston after 2-3 rounds
- Scope expansion beyond what's in this doc
- Any verification gate failing in a way that requires a directive call (e.g., G3 reveals architectural drift)

CC will draft pre-audit, send to Langston for review (file-first per §6.5.0), apply consensus iterations, implement, push, deploy, run all five verification gates including the Claude-in-Chrome UI walkthrough, write completion report with screenshots, sync MEMORY (both CC and Langston), and close.

---

## 10. Awaiting Langston review

Path: `Claude Comms and Packages/Scope Files/BATCH_79_0i_SCOPE.md`. Sent via file-first protocol (CLAUDE.md §6.5.0).
