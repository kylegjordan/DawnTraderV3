# B79.0n.MCE — Pre-Audit (Step 2)

> **Sub-batch:** 4 of 18 in the B79.0n umbrella v4 arc.
> **Phase:** 15c continuation / Phase 24 (multi-asset onboarding).
> **Predecessor:** Step 1 scope rev2 closed 2026-05-21 with Langston FINAL ACK.
> **Status:** **v2 awaiting Langston re-ACK** after Kyle 2026-05-21 PM thoroughness push-back surfaced 3 material corrections via deeper SIM consultation + direct code reads. v1 received Langston Step 2 ACK + 5 dispositions but is now superseded by v2 corrections (§0 block below).
> **Standing rules applied:** CLAUDE.md §9 SIM consultation + §9.1 SIM scope check + §11 NO-SILENT-FALLBACK + §15 NO PATCHES + umbrella §2.1 standard-11-step + §2.5 green-light-to-fix obvious bugs.

---

## §0 — v2 CORRECTIONS BLOCK (TOP-OF-REPORT — supersedes v1)

**Pre-audit v1 had 3 material errors discovered via Kyle's thoroughness push-back. v2 corrects them.** v1 was Explore-agent-driven enumeration without sufficient SIM consultation + without direct code reads of the affected sites. v2 supersedes v1 findings where conflicting.

### v2 Correction 1 — `directional-bias-store.ts:59` is ALREADY per-class-resolved (B-PHASE-A2, 2026-05-17)

**v1 claim:** flagged this site for resolver-key tightening in scope rev2 §3.4.

**v2 direct code read** (`server/core/metrics/directional-bias-store.ts:57-60`):

```ts
function getGlobalDbsMinSampleCount(assetClass: 'crypto_spot' | 'xstock_spot'): number {
  return getCachedNumberRequired('dbs_calculation', 'min_sample_count',
    { exchange: '*', assetClass, strategy: '*', regime: '*' });
}
```

`assetClass` is a **passed parameter**, not a literal `'*'`. The file header at lines 40-46 explicitly documents this is from **B-PHASE-A2 (2026-05-17 — shipped 4 days ago)**: "per-asset-class resolution via constructor option."

**Impact:** No resolver-tightening code work at this site. The seed migration §3.5 is STILL needed because today's wildcard `(*,*,*,*)` row is what both per-class reads fall through to via the resolver's most-specific-wins hierarchy (`module-constants-service.ts:8-17,108-128`). Seed adds explicit `crypto_spot` + `xstock_spot` rows + retires wildcard so per-class reads land on per-class rows directly with no fall-through.

### v2 Correction 2 — `cost-metrics.ts` `getDefaultAvgReturn()` is dead code in production

**v1 claim:** flagged `cost-metrics.ts:35` for resolver-key tightening (analogous to dbs_calculation).

**v2 direct code read** (`server/core/metrics/cost-metrics.ts:33-36`):

```ts
function getDefaultAvgReturn(): number {
  return getCachedNumberRequired('cost_model', 'default_avg_return',
    { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
}
```

(v1 also got the file path wrong — said `server/services/cost-metrics.ts`; actual is `server/core/metrics/cost-metrics.ts`.)

Wildcard read is real BUT — `getDefaultAvgReturn` is consumed only by `updateCostData` (line 110-140). `updateCostData` is consumed ONLY by `server/tests/integration/dynamic_sizing.test.ts:283`. **Zero production callers in `server/` outside the test directory.** Verified via repo-wide grep ignoring `attached_assets/` chat archives. `getTransactionCostFactor` also exported but only test-consumed.

The `getDefaultAvgReturn → updateCostData → getTransactionCostFactor` chain is **dead code in production** — orphan from Directive 11.3A era (`CHANGES_AND_FIXES.md:1262` references it as a known-deferred TODO). B72 migrated the constant to `module_constants` but its consumer was already dead.

**Impact:** Resolver-tightening at this site has ZERO production runtime impact. The seed migration row-add for `cost_model.default_avg_return` would be hygiene-only.

**Decision question for Langston (v2 NEW Q-VI):** absorb the dead-code cleanup (delete `getTransactionCostFactor` + `updateCostData` + `getDefaultAvgReturn`) under umbrella §2.5 green-light, OR defer to a separate "Phase 24 cost-metrics dead-code removal" mini-batch, OR ignore code + ship the seed row anyway for hygiene?

### v2 Correction 3 — Caller-site enumeration over-counted by conflating MCE methods

**v1 claim:** ~27 production sites; 18 MCE singleton callers.

**v2 actual:** The 18 sites enumerated as `getMarketContextEngine()` callers in v1 §3.2 split:
- **8-10 actual `computeContext(symbol, ohlcData, ...)` callers** — `signal-orchestrator.ts:499, 700, 1309, 1461` (4) + `vts-runner.ts:914, 1472, 1474, 1481, 1580, 3202` (6) + `xstock_spot/eval-cycle.ts:335, 717` (2). These ARE subject to REQUIRED-AssetClass.
- **~8 NON-`computeContext` callers** — `getDominantRegime()` / `getCachedVolumes()` / `computeGlobalBias()` / `getCurrentOutcomeFeedbackConfig()` / `getCachedContext(symbol)`. These methods have their own arg shapes. Most are global aggregators with no per-symbol/per-class arg. Only `getCachedContext(symbol)` is subject to cache-key-extension (1 site at `paper-execution-engine.ts:2021`).

Net refined count: **~22 production sites need REQUIRED-AssetClass touch**, down from v1's 27 (5 sites moved to (n/a) classification as covered in scope rev3 §3.6).

### v2 NUMERIC DELTAS

| Item | v1 | v2 |
|---|---|---|
| Production caller sites needing REQUIRED-AssetClass | 27 | ~22 |
| Resolver-key tightening sites with REAL code change | 2 (directional-bias-store + cost-metrics) | 0 to 1 (depends on Langston Q-VI dead-code decision) |
| `module_constants` row delta | net +2 | net +2 (unchanged; both migrated constants stay in scope — dbs has real impact, cost_model is hygiene-only pending Q-VI) |
| Surface APIs needing REQUIRED-AssetClass at function signatures | 5 functions | 5 functions (calculatePairRegime + 3 cost-model + computeContext) — unchanged |
| New per-class indicator branches | 0 (Q-I bar-interval invariant) | 0 (unchanged) |

---

## §0.5 — v1 findings preserved (unchanged in v2)

- TFS desat NULL finding — UNCHANGED (still moot; live inline in DEFAULT_REGIME_CONFIG).
- Indicator bar-interval invariant — UNCHANGED (both classes 60-min; hardcoded lookbacks keep).
- VERIFY-IN-PRE-AUDIT decisions on `regime-age-factor.ts:150` + `adaptive-goals-weight.ts:27` — UNCHANGED (KEEP WILDCARD both — math constants).
- `getCachedCostMetrics` 9 production callers active footgun — UNCHANGED (real fix in this batch).
- Migration row-count math (net +2) — UNCHANGED.
- Ablation paths (regime-age-factor.ts:140 + multi-tf-agreement.ts:135) — UNCHANGED in intent; v2 reframes as compile-driven consequence of `calculatePairRegime` REQUIRED-AssetClass refactor, not a separate green-light fix.

---

## §0.6 — Original v1 disclaimers (preserved)

**🚨 SCOPE-IMPACT FLAG — 2 material findings vs scope rev2 prediction:**
- **Finding A (DELIVERABLE 4 ↘ shrink):** TFS desat fields are NOT in `module_constants` — they live inline in `market-regime.ts:69-82` `DEFAULT_REGIME_CONFIG`. Per umbrella §1.5 these were predicted to be wildcard B72 rows needing per-class analysis. They are not, so per-class-vs-wildcard analysis is moot. Scope §9(e) question is null-and-void.
- **Finding B (DELIVERABLE 5 ↗ surface):** 3 of the 7 enumerated indicators (`ATR`, `Momentum`, `ADX`) hardcode crypto-tuned lookback constants (`period=14`, `lookback=30`). VWAP / EMA / BB / RSI not located in the search. Per scope §9(f) gate, this requires Langston's decision before implementation: include indicator-lookback per-class constants in this batch, defer to a separate sub-batch, or accept the asymmetry contingent on bar-interval check.

**🚨 NUMERIC DELTAS (PREVIOUSLY-STATED-VS-NOW):**
- Caller-site count: scope §0 predicted **15-25 sites**; pre-audit found **~27 sites** (within range, no scope-creep).
- `constant_name` list for §3.5 migration: scope estimated **2-4 distinct constants**; pre-audit confirms **2 constants** (`dbs_calculation.min_sample_count` + `cost_model.default_avg_return`).
- `module_constants` row-count delta: scope §5.2 #7 predicted +4-8 net; pre-audit refines to **net +6** (2 constants × 1 wildcard retired + 2 explicit rows = -2 + 4 = net +2 per constant × 2 constants — but if multiple `(strategy, regime)` variants exist per constant the multiplier increases; verified single-variant for both targets, so exact net = +2 if 1 wildcard per constant). Pre-audit confirms exact pre-deploy DB-snapshot needed at Step 7 for unambiguous gate (per Langston Step 1 rev2 nit).

---

## §1 — SIM consultation per CLAUDE.md §9.1 (v2 — direct citations)

Consulted `1-system-manual/SYSTEM_IMPACT_MAP.md` directly for every MCE-adjacent component this batch touches. Citations below quote SIM entry headers + relevant facts; full SIM lines cited inline.

### §1.0 — SIM entries consulted (with line references)

| SIM § | Title | Blast Radius (SIM) | This batch touches? |
|---|---|---|---|
| §1.3 | Cost Model (`server/core/cost-model.ts`) — SIM line 57-67 | **HIGH** | YES — REQUIRED-AssetClass at 3 surface APIs + 9 caller updates |
| §1.4 | DI Calculation — SIM line 68-76 | **CRITICAL** | NO — DI computation untouched (consumes `closePrices` from OHLC, no MCE-side change required) |
| §2.6 | OHLC Cache — SIM line 155-164 | **MEDIUM** | NO — bar-interval invariant confirmed (Q-I); cache key generalizes |
| §5.1 | `calculatePairRegime()` — SIM line 264-272 | **HIGH** | YES — REQUIRED-AssetClass; xstock branch already-wired keeps firing |
| §5.1b | DBS calculation — SIM line 274-298 | "CURRENTLY ZERO applied" → potential HIGH | NO — DBS math itself untouched. `dbs_calculation.min_sample_count` knob seeded per-class. |
| §5.1c | Directional Bias Store — SIM line 299-324 | **HIGH** | INDIRECT — store reads are already per-class per B-PHASE-A2 (correction 1); seed migration adds rows the store consumes |
| §5.2.5 | Market Context Engine (MCE) — SIM line 334-346 | **HIGH** | YES — `computeContext` REQUIRED-AssetClass + per-symbol cache key extension |
| §5.5 | `getMarketIndicators()` — SIM line 360-365 | **MEDIUM** | INDIRECT — calls `mce.getDominantRegime()` (global aggregator, not subject to refactor; scope rev3 §3.6 (n/a) classification) |
| MCE 9-group config orchestrator (SIM 1547-1561) | n/a | n/a | **DISTINCT cache layer — NOT touched** (see §1.5 below) |
| B79 modified components (SIM 1861-1876) | n/a | n/a | Prior B79 work already set up the AssetClass dispatch infrastructure |
| B-PHASE-A2 components (SIM 2131-2168) | n/a | n/a | xStock DirectionalBiasStore instance — DO NOT DISRUPT (see §1.4 below) |

### §1.1 — Upstream feeders to changed surfaces

| Changed surface | Upstream feeders | Risk of break |
|---|---|---|
| `calculatePairRegime` | `signal-orchestrator.ts` (cycle), `vts-runner.ts` (per-symbol), `regime-phase.ts` (phase tracking), `multi-tf-agreement.ts` (higher-TF), `regime-age-factor.ts` (B68.5 ablation), 2 diagnostic scripts | LOW — feeders pass `OHLCData[]` + math params; the new REQUIRED `assetClass` param is added at signature end, so existing positional arguments don't shift. Each caller updated to pass either explicit `'crypto_spot' as const` (crypto-intentional) or cycle's `assetClass` (asset-class-aware). |
| `getMarketContextEngine().computeContext()` (MCE entry) | 18 sites across signal-orchestrator, vts-runner, paper-execution-engine, market-indicators, vts-service, xstock_spot/eval-cycle | LOW — same pattern as STORAGE: type-level REQUIRED-assetClass forces compile-time visibility. |
| `getCachedCostMetrics` | expectancy kernel (1), RTB cost check (1), signal-orchestrator (2), trailing-exit-controller (1), vts-runner (3), vts-service (1), xstock_spot/eval-cycle (1) | **MEDIUM — active footgun:** all 9 production sites today pass only `symbol`, silently routing to crypto. Each site needs explicit `assetClass` from cycle context. |
| `directional-bias-store.ts:59` resolver-key | global directional bias snapshot (read by MCE every cycle) | LOW — single-site change, byte-identical value resolution post-seed migration. |
| `cost-metrics.ts:35` resolver-key | EV-side cost reads (expectancy kernel) | LOW — single-site change, byte-identical value resolution post-seed migration. |

### §1.2 — Downstream consumers

- **FinalScore Kernel** (consumes regime + DI from MCE) — unaffected at math layer; receives byte-identical regime values for crypto cycles.
- **Net Expectancy Kernel** (consumes cost_model defaults via `cost-metrics.ts:35`) — unaffected for crypto cycles (wildcard value preserved in new `crypto_spot` row).
- **DBS Telemetry** (B-PHASE-A2; reads `directional-bias-store.ts:59` consumed value) — unaffected for crypto cycles.

### §1.3 — Shared state / background execution / blast radius

- **MCE 60-second cache** (per `module-constants-service.ts:38-39` TTL contract) — picks up new rows from migration within 60s of deploy. No restart strictly required, but PM2 restart guarantees synchrony with migration commit.
- **Background timers/intervals affected:** none — MCE compute cycle is reactive (called per-symbol by feeders), not scheduled.
- **Blast radius:** SCOPED TO MCE. Crypto-path execution is byte-identical post-deploy. xStock path stops silently inheriting via wildcard. No cascade risk to active-trading orchestrator (still gated by WIRE-IN #16 enabling flag).

### §1.4 — B-PHASE-A2 interaction (CRITICAL — recently-shipped code, do not disrupt)

**B-PHASE-A2 shipped 2026-05-17 (4 days ago at time of pre-audit v2).** Per SIM §B-PHASE-A2 entry (lines 2131-2168), the xStock-specific Directional Bias Store is a NEW singleton instance with `mode='xstock'` semantics (sector partition + dual floor). Currently active in production via the VTS shadow path.

**SIM line 2167 explicitly states the crypto-by-construction-zero guarantee:** "Crypto path: ZERO. directionalBiasStore singleton keeps 4-arg updatePair signature and identical publishSnapshot() behavior (mode='crypto' branch is the pre-B-PHASE-A2 behavior). All 5 crypto-side consumer sites (market-indicators, drift-dashboard-aggregator x3, MCE x2 + 1 publish) read the same singleton with the same call signature."

**B79.0n.MCE pre-audit v2 verification (passes):**
- The seed migration adds rows under `(module_name='dbs_calculation', asset_class='crypto_spot', constant_name='min_sample_count', value=20)` AND `('xstock_spot', ...)` — both store instances (crypto + xstock) read their respective rows via `getCachedNumberRequired` (already per-class-keyed from B-PHASE-A2).
- The wildcard `(*,*,*,*)` row gets retired. Today both classes silently fall through to the wildcard's 20; post-migration each class lands on its own explicit 20 row. **Crypto behavior byte-identical pre/post.** xStock behavior byte-identical pre/post. The change is structural (no more fall-through) not value-based.
- B-PHASE-A2's `sector_coverage_floor` knob (xstock-only, `directional-bias-store.ts:69-70`) is at explicit `asset_class='xstock_spot'` scope today + this batch does NOT touch it.
- B-PHASE-A2's xStock store sector-partition logic at `publishSnapshot()` (handled in same file's mode='xstock' branch) — UNTOUCHED in this batch.

**Risk surface:** if the seed migration accidentally deletes `dbs_calculation` rows beyond the `(*,*,*,*) min_sample_count` wildcard, B-PHASE-A2's `sector_coverage_floor` row could be at risk. Migration WHERE clause MUST scope to `constant_name = 'min_sample_count'` specifically — verified in scope rev3 §3.5 SQL template (the `constant_name IN (...)` filter scopes the wildcards retired by name).

### §1.5 — MCE 9-group config orchestrator (DISTINCT cache layer — NOT touched)

Per SIM lines 1547-1561, `server/services/market-context-engine.ts:refreshAllConfigs()` resolves 9 module groups in parallel every MCE refresh tick:

1. macro_modifier (B67.1)
2. regime_phase (B67.2)
3. regime_classifier (B67.3.5 + B67.5-prep — TFS desat scales + post-composition floor)
4. outcome_feedback (B67.4)
5. regime_age (B68.4)
6. path_b_sustainability (B68.5)
7. volume_regime (B68.2)
8. pair_correlation (B68.3)
9. multi_tf_agreement (B68.1)

**This is DIFFERENT from the per-call `getCachedNumberRequired` reads that B79.0n.MCE tightens.** The 9-group orchestrator pre-fetches whole modules at MCE refresh cadence using `Promise.all` (first refresh) / per-group try-catch (subsequent). Per-call reads happen at consumer cycle and consult the `module-constants-service` cache which is filled by either the orchestrator OR per-call `loadModule` warming.

**This batch's seed migration touches 2 constants** (`dbs_calculation.min_sample_count` + `cost_model.default_avg_return`). Neither module is in the 9-group orchestrator list. The orchestrator's `regime_classifier` + `regime_age` modules ARE consumed at MCE refresh tick but their wildcard rows are NOT touched by this batch (verified per pre-audit §4 + §5 — TFS desat is inline, regime_age `momentum_floor_path_a` stays wildcard as math primitive).

**Risk surface:** ZERO interference with the 9-group orchestrator. The orchestrator's first-refresh hard-fail + subsequent keep-prior-on-failure semantics (SIM line 1561) are unaffected by this batch.

**MCE singleton's per-symbol context cache** (separate from the 9-group orchestrator + separate from module-constants-cache) IS being extended this batch — scope rev3 §3.2 `${symbol}` → `${symbol}:${assetClass}` cache key change. This is a third distinct cache layer in the MCE singleton:

| Cache | Owner | TTL | Key shape | Touched? |
|---|---|---|---|---|
| Per-symbol MarketContext | `market-context-engine.ts` singleton | 60s | `${symbol}` (today) → `${symbol}:${assetClass}` (post-batch) | YES — extended |
| Module-constants rowset | `module-constants-service.ts` `cache: Map<string, CachedModule>` | 60s | `${moduleName}` | NO |
| 9-group config refresh | `refreshAllConfigs()` orchestrator | per-MCE-refresh tick | n/a (in-memory typed fields) | NO |

### §1.6 — SIM updates required at Step 10 governance close

- New row in SIM for: MCE singleton REQUIRED-assetClass; `cost-model` REQUIRED-assetClass exhaustive switch with perp fail-hard; per-symbol cache-key extension; seed-migration pattern with wildcard retirement.
- SYSTEM_MANUAL updates: Layer 2 `module_constants` per-class-vs-wildcard policy (new section building on STORAGE's Layer 1/Layer 2 distinction).
- Explicit note in SIM §5.2.5 MCE entry that the per-symbol context cache is now `(symbol, assetClass)`-keyed and that the 9-group orchestrator + module-constants-cache are separate concerns.

---

## §2 — DELIVERABLE 1: Exact `constant_name` list for §3.5 migration

**Confirmed list (replaces `/* TBD pre-audit */` in §3.5):**

| Module | Constant | Current wildcard row | Exchange scope | Source |
|---|---|---|---|---|
| `dbs_calculation` | `min_sample_count` | `'20'::jsonb` | `exchange='*'` | B72 migration line 45 |
| `cost_model` | `default_avg_return` | `'0.005'::jsonb` | `exchange='*'` | B72 migration line 60 |

**Per-Langston Step 1 rev2 nit (exchange-scope sanity):** both source wildcard rows carry `exchange='*'` — no `kraken`-scoped variants found. The migration's SELECT preserves `exchange='*'` into both new class-scoped rows; no exchange-axis ambiguity. Migration body will include a sanity log line: `-- Source wildcard rows scope: exchange='*' for both constants (verified in B79.0n.MCE pre-audit §2)`.

**Row-count math (per-constant):**
- Per constant: 1 wildcard row retired + 1 crypto_spot row added + 1 xstock_spot row added = net +1.
- 2 constants × (+1) = **net +2 rows in `module_constants`**.

**Step 7 verification query** (replacing the `+4-8 net` placeholder in §5.2 #7):
```sql
-- Pre-deploy snapshot:
SELECT COUNT(*) FROM module_constants
WHERE (module_name = 'dbs_calculation' AND constant_name = 'min_sample_count')
   OR (module_name = 'cost_model'      AND constant_name = 'default_avg_return');
-- Expected: 2

-- Post-deploy snapshot:
SELECT module_name, asset_class, constant_name, value FROM module_constants
WHERE (module_name = 'dbs_calculation' AND constant_name = 'min_sample_count')
   OR (module_name = 'cost_model'      AND constant_name = 'default_avg_return')
ORDER BY module_name, asset_class;
-- Expected: 4 rows total
--   dbs_calculation | crypto_spot | min_sample_count | 20
--   dbs_calculation | xstock_spot | min_sample_count | 20
--   cost_model      | crypto_spot | default_avg_return | 0.005
--   cost_model      | xstock_spot | default_avg_return | 0.005
-- AND: zero rows with asset_class = '*' for these constants
```

---

## §3 — DELIVERABLE 2: Caller-site enumeration for 5 §3.6 surface functions

**~27 production sites total** (within scope's 15-25 prediction; +2 expansion is from the 6 indirect/DEFAULT_REGIME_CONFIG sites I'd missed in the §3.6 grep).

### §3.1 — `calculatePairRegime` (6 production callers + 8 test sites)

| File:line | Category | Notes |
|---|---|---|
| `server/core/metrics/regime-phase.ts:259` | **(c)** asset-class-aware | reads from MCE context |
| `server/services/market-context-engine.ts:974` | **(c)** asset-class-aware | primary MCE emit hook |
| `server/core/metrics/regime-age-factor.ts:140` | **(d) INVESTIGATION** | B68.5 ablation re-runs classification with `DEFAULT_REGIME_CONFIG`; no assetClass param threaded today. **Recommended (c):** thread current cycle's `assetClass`. |
| `server/core/metrics/multi-tf-agreement.ts:135` | **(d) INVESTIGATION** | higher-TF regime agreement; no assetClass param. **Recommended (c):** thread cycle's `assetClass`. |
| `server/scripts/diagnostic-11.4G.ts:156` | **(a)** crypto-intentional | diagnostic audit; pass `'crypto_spot' as const` |
| `server/scripts/b70-b62-relabel-runner.ts:151` | **(a)** crypto-intentional | historical relabel migration; pass `'crypto_spot' as const` |

Test sites (8): `vts-modernization.test.ts`, `b67-3-5-tfs-desat.test.ts`, `b68-5-path-b-sustainability.test.ts`, `b67-5-prep-floor.test.ts`. Updated to pass `'crypto_spot' as const` (regression-lock fixture, not asset-class-routing).

### §3.2 — `getMarketContextEngine().computeContext()` (18 production sites)

| File:line(s) | Category | Notes |
|---|---|---|
| `signal-orchestrator.ts:499, 700, 1309, 1461` (×4) | **(c)** asset-class-aware | cycle context provides assetClass |
| `vts-runner.ts:914, 1472, 1474, 1481, 1580, 3202` (×6) | **(c)** asset-class-aware | per-symbol cycle |
| `xstock_spot/eval-cycle.ts:335, 717` (×2) | **(a)** xstock-intentional | explicit `'xstock_spot' as const` |
| `market-indicators.ts:260, 306` (×2) | **(d) INVESTIGATION** | config reads (asset-class-agnostic?); **likely (a) crypto_spot literal** |
| `paper-execution-engine.ts:1369, 2021` (×2) | **(d) INVESTIGATION** | config reads (non-signal paths); **likely (a) crypto_spot literal** |
| `vts-service.ts:921` | **(d) INVESTIGATION** | outcome feedback config; **likely (a) crypto_spot literal** |
| `market-context-engine.ts:internal getInstance()` | n/a | the singleton itself |

**Note on `calculateMarketContext` naming:** scope §3.2 referenced `calculateMarketContext` as the entry function. Pre-audit confirms no standalone function by that name; the actual surface is `MarketContextEngine.computeContext()` invoked via `getMarketContextEngine()`. Scope §3.2 wording updates to reflect the singleton + method shape at scope close (no design change).

### §3.3 — `getFrictionForAssetClass` (0 direct callers)

Internal-only — called from `getDefaultCostComponentsForAssetClass` (`cost-model.ts:86`). Type-level REQUIRED-AssetClass change cascades through the chain via TS compile.

### §3.4 — `getDefaultCostComponentsForAssetClass` (0 direct callers)

Internal-only — called from `getCachedCostMetrics` (`cost-model.ts:122`). Same cascade pattern.

### §3.5 — `getCachedCostMetrics` (9 production callers — ACTIVE FOOTGUN)

**CRITICAL FINDING:** all 9 sites today call `getCachedCostMetrics(symbol)` with NO `assetClass` argument, silently defaulting to `'crypto_spot'`. Per §11 NO-SILENT-FALLBACK doctrine, every site needs an explicit asset-class argument.

| File:line | Category | Notes |
|---|---|---|
| `server/core/calculations/expectancy.ts` (1 site) | **(c)** asset-class-aware | thread cycle's assetClass |
| `server/core/rtb/ready_to_buy_service.ts` (1 site) | **(c)** asset-class-aware (interim via `resolveAssetClass(symbol, 'kraken')` per STORAGE pattern, until RTB batch #11 closes schema gap) | matches STORAGE pattern |
| `server/services/signal-orchestrator.ts` (2 sites) | **(c)** asset-class-aware | cycle context |
| `server/services/trailing-exit-controller.ts` (1 site) | **(c)** asset-class-aware | trade context |
| `server/services/vts-runner.ts` (3 sites) | **(c)** asset-class-aware | per-symbol cycle |
| `server/services/vts-service.ts` (1 site) | **(c)** asset-class-aware | service cost read |
| `server/asset_classes/xstock_spot/eval-cycle.ts` (per-class) | **(a)** xstock-intentional | explicit `'xstock_spot' as const` |

Test sites (8): pass `'crypto_spot' as const` regression-lock fixtures.

---

## §4 — DELIVERABLE 3: VERIFY-IN-PRE-AUDIT decisions

### §4.1 — `regime-age-factor.ts:150` (`regime_age.momentum_floor_path_a`)

```ts
const pathAMomentumFloor = getCachedNumberRequired('regime_age', 'momentum_floor_path_a',
  { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
```

**Consumed at line 151:** `realMomentum > pathAMomentumFloor` — a pure comparison threshold.

**Heuristic application** (Langston §9(e)): pure-math threshold for `>` operator, NOT volatility-scaled.

**Decision: (b) KEEP WILDCARD.** Inline comment to add: `// B68.4 Path A momentum gate threshold is a pure math constant, not volatility-scaled; asset-class-agnostic per B72 + B79.0n.MCE pre-audit §4.1.`

Constant NOT added to migration list.

### §4.2 — `adaptive-goals-weight.ts:27` (`goals_weighting.ai_weight_cap`)

```ts
function getAIWeightCap(): number {
  return getCachedNumberRequired('goals_weighting', 'ai_weight_cap',
    { exchange: '*', assetClass: '*', strategy: '*', regime: '*' });
}
```

**Consumed at line 77:** clamping ML contribution to ML weight cap.

**Heuristic application:** governance cap (policy boundary), NOT volatility-scaled or regime-tuned. The cap applies uniformly to all signal-chain ML contributions regardless of asset class.

**Decision: (b) KEEP WILDCARD.** Inline comment to add: `// B72 AI weight cap is a governance boundary, not volatility-scaled; uniform across asset classes per design + B79.0n.MCE pre-audit §4.2.`

Constant NOT added to migration list.

---

## §5 — DELIVERABLE 4: TFS desat per-class analysis — NULL FINDING

**Material discovery vs scope expectation:**

Scope §9(e) anticipated 5 wildcard `regime_classifier` rows from B67.3.5 TFS desat era as candidates for per-class analysis. Pre-audit search of `2026-05-05-b72-lever-sweep.sql` + adjacent B72 migration files finds NO `regime_classifier`-prefixed module rows for TFS desat fields.

**Where TFS desat actually lives:**

`server/core/metrics/market-regime.ts:69-82` — inline in `DEFAULT_REGIME_CONFIG`:
- `tfsDesatMin: 0.50`
- `tfsDesatMax: 0.90`
- `tfsMomentumScale: 0.020`
- `tfsVolatilityScale: 0.025`
- `tfsDbsScale: 0.7`

These are **NOT module_constants rows** — they're code-level defaults consumed at `regime-thresholds.ts` import time.

**Implication:** the per-class TFS desat analysis question is null — there's nothing in `module_constants` to migrate. Code-level TFS desat values are already per-asset-class via B78's `regime-thresholds.ts` xstock branch (per umbrella §1.5).

**Scope adjustment:** no migration rows added for `regime_classifier`. The §9(e) question converts from "decide per-field whether to migrate" to "verify B78's xstock_spot TFS desat branch is reachable via the REQUIRED-assetClass refactor" — answered YES by §3.1 above (calculatePairRegime caller updates thread assetClass correctly).

---

## §6 — DELIVERABLE 5: Indicator-computation enumeration — MATERIAL FINDINGS

### §6.1 — Findings summary

| Indicator | Where computed | Parameters | Crypto-tuning? | Recommendation |
|-----------|---|---|---|---|
| ATR | `market-regime.ts:121` (inside `computeADX`) | `period = 14` (hardcoded Wilder default) | **YES** — 14 bars on 15-min crypto = 3.5h window | **SURFACE to Langston** |
| Momentum | `market-regime.ts:104` (`computeMomentum`) | `lookback = Math.min(30, ohlcData.length)` (hardcoded; code comment cites 15-min crypto intent) | **YES** — 30 bars on 15-min = 7.5h | **SURFACE to Langston** |
| ADX | `market-regime.ts:121` (`computeADX`) | `period = 14` (same as ATR) | **YES** (same as ATR) | **SURFACE to Langston** |
| VWAP | NOT located in MCE/metrics/math | n/a | n/a | Flag — pre-audit could not locate computation site |
| EMA | NOT located as standalone | n/a (referenced in DBS calculation but no standalone compute found) | unknown | Flag — verify within DBS module if needed |
| BB | NOT FOUND | n/a | n/a | Out of scope (not implemented) |
| RSI | NOT FOUND | n/a | n/a | Out of scope (not implemented) |

### §6.2 — Per-§9(f) gate — explicit surface to Langston

Per scope §9(f), this is the pre-audit gate: "If any indicator hardcodes a lookback or normalization tuned to crypto behavior, surface to Langston before implementation."

**3 indicators surface this gate** (ATR / Momentum / ADX). Critical question Langston must decide:

**Question for Langston: bar-interval check.** All 3 indicators with crypto-tuned lookbacks assume 15-minute bars per the inline code comments. The CRITICAL question is: **does xStock MCE receive 15-minute OHLC bars (same as crypto) or a different bar-interval (e.g., 1-minute from `xstock_dbs_backfill` + scanner-cycle-driven 30s aggregation)?**

- **If xStock MCE is fed 15-minute bars (same as crypto):** the time-window semantic is byte-identical across classes (14 bars = 3.5h on both). Hardcoded lookbacks are NOT a class-sensitive footgun. Recommendation: keep wildcard, add inline comment documenting the bar-interval invariant.

- **If xStock MCE is fed a different bar-interval (e.g., 1-minute as the B-PHASE-A2 scanner cycle data suggests):** the 14-bar ATR means very different things across classes. Recommendation: per-class lookback constants migrated to `module_constants.regime_classifier` (this batch) OR deferred to a dedicated indicator-window sub-batch.

**Pre-audit could not definitively answer the bar-interval question** without deeper investigation into xStock OHLC pipeline (xstock_spot/eval-cycle bar timeframe + how `scanner.ts` feeds MCE). Defer to Langston decision: (i) accept the bar-interval invariant claim (if he knows xStock is also 15-min), (ii) request CC investigate bar-interval before code change, or (iii) defer all 3 indicators to a separate sub-batch.

### §6.3 — VWAP / EMA / BB / RSI absence

- **VWAP:** mentioned in `canonical-regime-strategy-map.ts` strategy descriptions but no compute function found in MCE/metrics/math. Likely strategy-internal (e.g., inside specific strategy detectors). **Out of MCE scope.**
- **EMA:** referenced in DBS module + smoothing comments; no standalone compute function. If it exists embedded in directional-bias.ts, it's inside the DBS module — already lever-driven via `dbs_calculation`. **Out of MCE indicator-enumeration scope.**
- **BB, RSI:** not implemented anywhere in the codebase. **Out of scope (not part of DawnTrader's primitive set).**

---

## §7 — Pre-audit-driven scope refinements

If Langston ACKs this pre-audit as-is, scope §3.5 + §5.2 + §6.2 refine to the following at implementation:

1. **§3.5 migration:** constant_name list = `['min_sample_count' for dbs_calculation, 'default_avg_return' for cost_model]`. Net row delta: **+2** (not +4-8 as scope estimated).
2. **§3.6 caller-list:** 27 production sites (some clearly (a), some (c), 6 needing per-site decision based on context).
3. **§4 unit tests:** new test #6 — xstock_spot regime path uses xstock thresholds AFTER REQUIRED-assetClass refactor (validates B78's xstock branch stays wired).
4. **§9(e) NULL** — TFS desat field analysis is moot (lives inline in code, not in module_constants).
5. **§9(f) surfaced** — 3 indicators (ATR/Momentum/ADX) need Langston's bar-interval decision before code change.

---

## §8 — Obvious bugs found during audit (umbrella §2.5 green-light)

**(c) category — bugs that would otherwise hit us in Phase 19:**

1. **`getCachedCostMetrics` silent-crypto-default** — all 9 production callers pass only `symbol`, no assetClass. Today this is harmless because xStock active-trading doesn't enable until WIRE-IN. Post-WIRE-IN, every xStock signal would silently use crypto's friction/cost. **This batch fixes via REQUIRED-AssetClass.**

2. **`regime-age-factor.ts:140` + `multi-tf-agreement.ts:135` ablation paths** use `DEFAULT_REGIME_CONFIG` without threading the cycle's `assetClass`. This means xStock signals running through these paths would silently use the crypto-tuned DEFAULT_REGIME_CONFIG values. **Recommended (c): fix in this batch as part of caller-list update.** Small contained fix; reduces Phase 19 surprise surface.

**No (c)-category fixes proposed beyond the above** — both are within MCE scope and fix-forward at zero scope-creep.

---

## §9 — Open questions for Langston (Step 2 ACK gate)

(I) **Indicator bar-interval check (§6.2):** does xStock MCE receive 15-min OHLC bars or a different bar-interval? If you can answer from memory, that decides whether ATR/Momentum/ADX hardcoded lookbacks are class-sensitive. If not, CC investigates before Step 3 code change.

(II) **Ablation path fixes (§8 #2):** confirm `regime-age-factor.ts:140` + `multi-tf-agreement.ts:135` ablation paths get the cycle's `assetClass` threaded as a (c)-category fix within this batch. Small touch; large Phase 19 surprise reduction. Or defer to a separate sub-batch.

(III) **TFS desat NULL finding (§5):** the scope §9(e) question is moot — pre-audit confirms TFS desat lives inline in DEFAULT_REGIME_CONFIG, not module_constants. Concur this is null + no scope adjustment needed beyond noting it in the completion report?

(IV) **`market-indicators.ts` + `paper-execution-engine.ts` + `vts-service.ts` config reads (§3.2 (d) INVESTIGATION rows):** 5 MCE-callers reading non-signal-path config. Are these correctly categorized as (a) `'crypto_spot' as const` literal, or do they need (c) cycle-context threading? My read is (a) — these are MCE config introspections used by infrastructure surfaces, not per-signal routing. Concur?

(V) **Migration row-count math:** pre-audit confirms net +2 rows (not +4-8 as scope §5.2 #7 estimated). Step 7 verification query in §2 above is the unambiguous gate. Concur on the simpler math?

---

## §9.5 — v2 NEW question (added after Kyle thoroughness push-back)

(VI) **`cost-metrics.ts` dead-code disposition.** Per v2 Correction 2 (§0 above), the `getDefaultAvgReturn → updateCostData → getTransactionCostFactor` chain has ZERO production callers — only test code. The `cost_model.default_avg_return` wildcard read has no live runtime impact. Three options:

  (a) **Absorb the dead-code cleanup under umbrella §2.5 green-light** — delete `getTransactionCostFactor` + `updateCostData` + `getDefaultAvgReturn` + the orphan `cost-metrics.ts` file in this batch. Small touch + test file deletion. Reduces Phase 19 surprise surface (orphan dead code can be silently re-wired without governance).
  
  (b) **Defer to a separate dead-code cleanup mini-batch** — keeps B79.0n.MCE focused on the live production fixes. The orphan stays as-is until that mini-batch ships.
  
  (c) **Skip cleanup but ship the seed migration row anyway for `cost_model.default_avg_return`** — hygiene-only DB-side cleanup with no code change. Wildcard row gets retired; explicit per-class rows added. If the dead code is ever re-wired in the future, it'll consume the per-class rows instead of falling back to wildcard.

My recommendation: **(a) absorb dead-code cleanup** — small contained fix, removes orphan, reduces Phase 19 surprise. Default biased per umbrella §2.5 disposition framework (small + contained + reduces Phase 19 surprise = absorb in current batch).

Reply: **pre-audit v2 FINAL ACK** / **decisions on questions I-V + VI** / **specific concerns on v2 corrections in §0**.

---

INFRASTRUCTURE NOTE per CLAUDE.md §6.5.0.a + §6.5.0.b: this pre-audit file is staged in your inbox at `/home/langston/inbox/b79-0n/B79_0n_MCE_PRE_AUDIT.md`. **DO NOT `cd /mnt/gdrive` or `git -C` against the gdrive mount — it hangs on FUSE I/O.** For repo-side verification use `ssh deploy@188.245.193.8 'cd /home/deploy/dawntrader && git ...'`. Pre-audit findings are entirely self-contained in this document; no repo-side fetch needed.

— Claude Code, 2026-05-21 PM (B79.0n.MCE Step 2 pre-audit v1)
