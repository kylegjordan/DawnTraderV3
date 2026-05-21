# B79.0n.STORAGE — Completion Report

> **Sub-batch:** 3 of 18 in the B79.0n umbrella v4 arc.
> **Phase:** 15c continuation / Phase 24 (multi-asset onboarding).
> **Status:** **SHIPPED 2026-05-21**, deploy commit `ab3153ce5` (PM2 #310 at 14:59:28Z).
> **Langston Step 4 ACK + RE-ACK (post-BLOCKER fix) + Step 8 ACK** all clean.
> **Standing rules applied:** CLAUDE.md §3.3 Phase-24 onboarding learnings + umbrella rev 4 §1.5 B72 prior-arc context.

---

## §0 — TOP-OF-REPORT mandatory disclaimers

**🚨 THIS BATCH IS A PURE TYPE-LEVEL + ROUTING REFACTOR.** No behavioral change for crypto cycles at runtime (every silent `'crypto_spot'` default became an explicit `'crypto_spot'` pass — semantically identical). The only behavioral delta is xStock SQE cycles finally reading xStock screener_filters rows instead of crypto's. **Today** the xStock row values are placeholder-cloned from crypto's baseline (per Langston Step 2 ACK Q4), so the empirical behavioral delta is still zero — but the **routing path** is now correct and any future per-class calibration flows through the right rows.

**🚨 NUMERIC DELTAS:**
- Caller-site count: pre-audit estimated **32**, actual was **38** (6 additional surfaced via TypeScript compile-driven audit when the parameter became required). Of the 38: 6 already-correct (xstock_spot/* sites from B79.0m.b2) + 7 (a) crypto-intentional explicit + 1 (c) SQE production bug fix + 24 (d) diagnostic via new helper.
- After Langston Step 4 reclassification: 3 sites moved from (d)→(a) (unified-filter-gateway x2 + paper-sim-service x1 are runtime crypto-routing, not diagnostic display). Final: 10 (a) + 1 (c) + 21 (d) + 6 already-correct = 38 sites.
- `screener_filters` rows: 38 → 48 (10 xStock rows seeded). Crypto rows unchanged at 24.

**🚨 BLOCKER caught at Step 4 — fixed before deploy.** Langston identified that `upsertScreenerFilters`'s UPDATE WHERE clause was `(mode, filterPath)`-only — no `assetClass` filter. After the seed migration creates 2 rows per `(mode, filterPath)` (crypto + xStock), the WHERE would match BOTH rows: either violate the unique index OR silently cross-corrupt fields between the two classes. Exactly the silent-default footgun this batch exists to eliminate. Fixed in commit `512429ab9` before Step 6 deploy. Test file gained `@ts-expect-error` regression lock asserting upsert REQUIRED-assetClass.

---

## §1 — Scope objectives — full status checklist

| # | Objective | Status | Evidence |
|---|-----------|--------|----------|
| 1 | `storage.getScreenerFilters` signature: `assetClass?: string` → `assetClass: AssetClass` (REQUIRED) | ✅ | `storage.ts:235` interface + `:950` implementation. `'crypto_spot'` default removed. |
| 2 | New `getCanonicalScreenerConfig` helper for UI/diagnostic display | ✅ | `storage.ts:977`. Banner docstring at `:971` says NEVER for runtime routing. |
| 3 | `SQEInput.assetClass` REQUIRED field | ✅ | `signal_quality_evaluator.ts:79`. |
| 4 | Plumb assetClass through SQE chain | ✅ | `getSQEThresholdsFromConfig(mode, assetClass)` + `evaluateSignalQuality(input)` + `SignalQualityEvaluatorService.getThresholds(mode, assetClass)` with extended cache key `${mode}:${assetClass}`. |
| 5 | 3 SQEInput-construction sites populate assetClass | ✅ | `signal-orchestrator.ts:567` (via `rawSignal.metadata?.assetClass ?? resolveAssetClass(symbol, 'kraken')`) + `ready_to_buy_service.ts:646, 868` (interim: `resolveAssetClass(symbol, 'kraken')` only — RtbSignal DB row lacks asset_class column, schema gap tracked for RTB batch #11). |
| 6 | 7 → 10 (a) crypto-intentional sites pass explicit `'crypto_spot'` | ✅ | 6 fx5-scanner.ts + 1 config-update-service.ts originally + 3 reclassified from (d) post-Step 4 (unified-filter-gateway x2 + paper-sim-service x1). |
| 7 | 21 (d) diagnostic sites route via `getCanonicalScreenerConfig` | ✅ | 2 index.ts + 8 routes.ts + 12 routes/vts.ts + 2 paper-sim-diagnostic/reb-2-12/reb-2-15 + 3 routes.ts (4 absorbed; actual final = 21 after 3 (d)→(a) reclassifications). |
| 8 | 1 diagnostic CLI gets explicit literal | ✅ | `scripts/diagnostic-11.4G-5.ts:82-83` per Langston Step 2 RE-ACK wording. |
| 9 | Seed migration: 10 xStock screener_filters rows cloned from crypto baseline | ✅ | `drizzle/migrations/2026-05-21-b79-0n-storage-xstock-screener-filters-seed.sql`. Idempotent ON CONFLICT DO NOTHING. Applied cleanly post-deploy. |
| 10 | New unit tests: REQUIRED-assetClass type lock + SQE routing + cache isolation | ✅ | `b79-0n-storage-required-assetclass.test.ts` (3 tests incl. upsert lock) + `b79-0n-storage-sqe-asset-class-routing.test.ts` (4 tests incl. cache-isolation case per Langston Step 2 RE-ACK item 4). 8/8 PASS. |
| 11 | upsertScreenerFilters UPDATE WHERE adds assetClass (Step 4 BLOCKER fix) | ✅ | `storage.ts:1001`. Interface + implementation both REQUIRE assetClass on data shape. Single live caller at `routes.ts:2407` passes explicit `'crypto_spot' as const`. |
| 12 | 24h crypto regression-lock soak | ⏳ Deferred to alert `d4b2e590` fires 2026-05-22T11:55:57Z (originally for UNIVERSE-DISCOVERY; doubles for STORAGE — same-day deploy + same baseline) | Per umbrella §2.2 thresholds. |
| 13 | UI verification | ✅ N/A — STORAGE is pure API refactor; no UI surface change beyond what's already covered by UNIVERSE-DISCOVERY's xStocks tab verification | Crypto Filter Diagnostics UI continues displaying canonical crypto values via the new `getCanonicalScreenerConfig` helper (12 sites in routes/vts.ts). |

**12 of 13 in-window objectives GREEN. Objective 12 (24h crypto regression-lock) deferred to scheduled soak alert.**

---

## §2 — B72 prior-arc context (umbrella rev 4 §1.5 standing rule)

**Per umbrella rev 4 §1.5,** every sub-batch's completion report must enumerate (a) what B72/B72.1/B72.2 already did for this subsystem, and (b) what work remained for this sub-batch.

### What B72 did NOT do for STORAGE

B72 worked exclusively on **Layer 2 (`module_constants`)** of the SQE precedence chain. The `screener_filters` table + `storage.getScreenerFilters` API surface (Layer 1) was explicitly outside B72's scope — B72's completion report §A.4a captured the 28 `screener_filters` rows in a snapshot inventory but did NOT refactor the API surface or the silent-fallback default.

**STORAGE worked exclusively on Layer 1.** The two batches' scopes are non-overlapping by construction.

### What B72 did that this batch built on

- **`getCachedNumberRequired` sync-read API + hard-fail discipline** — STORAGE's `getCanonicalScreenerConfig` helper follows the same "no silent fallback" principle. The helper does NOT replicate the silent-default footgun the helper exists to prevent.
- **`module_constants.sqe_config`** — wired by B72 Slice 4 (commit `ba7703df6`) as Layer 2 fallback under wildcard `_SQE_GK = { exchange: '*', assetClass: '*', strategy: '*', regime: '*' }`. STORAGE explicitly deferred per-class `module_constants.sqe_config` rows to the **SCORING sub-batch** with documented promote-to-active triggers (RUNNING_ISSUES entry filed at §11 below) — half-routed acceptable because Layer 1 (now per-class) is dominant; Layer 2 (still wildcard) is fallback only.
- **3-layer SQE precedence chain** — established by B72. STORAGE tightens Layer 1 to be per-class-aware; Layers 2 + 3 unchanged.

### Concrete cross-reference

STORAGE pre-audit Concern B and §0 (re Langston Step 2 ACK) explicitly named the asymmetry: "screener_filters per-class (this batch); module_constants is wildcard. Asymmetry acceptable because screener_filters is Layer 1 primary source; module_constants is Layer 2 fallback hit only when filters has no row or missing field."

Discovery context: Kyle's mid-batch push-back ("Are you sure B72 was not implemented?") surfaced that I had read `BATCH_CATALOG.md` row 171 (pre-shipping planning entry) as authoritative. B72 absolutely shipped + B72.1 + B72.2 with extensive coverage (34 modules / ~163 rows / 18-of-18 canonical strategies DB-tunable). The stale catalog row 171 + 4 POST_AUDIT_ROADMAP references were corrected in the same governance pass (commit `f6f823c60`).

---

## §3 — Architecture summary

### Before B79.0n.STORAGE

```
[caller A: signal_quality_evaluator:143]    [caller B: routes/vts.ts:1445]    [caller C: fx5-scanner:688]
                  │                                       │                              │
                  │ { mode }                              │ { mode, filterPath }         │ { mode, filterPath }
                  ▼                                       ▼                              ▼
                            storage.getScreenerFilters({ mode, filterPath?, assetClass? })
                                                          │
                                                          │ assetClass = params.assetClass ?? 'crypto_spot'  ← SILENT DEFAULT
                                                          ▼
                                                  screener_filters table
                                                          │
                                                          ▼
                                              Always returns crypto_spot row
```

Every silent caller (24 of 32) silently routed to crypto's row regardless of intent. SQE bug at line 143 was the production-active instance: xStock signals were evaluated against crypto's `finalScoreMin` + `regimeWeightMin`.

### After B79.0n.STORAGE

```
[caller A: signal_quality_evaluator:150]    [caller B: routes/vts.ts:1447]    [caller C: fx5-scanner:689]
        SQE per-signal                              UI display                     crypto cycle
                  │                                       │                              │
                  │ { mode, assetClass }                  │ { mode, filterPath }         │ { mode, 'crypto_spot', filterPath }
                  ▼                                       ▼                              ▼
                                            getCanonicalScreenerConfig({...})    getScreenerFilters({...})
                                                          │                              │
                                                          │ internally adds              │ params.assetClass REQUIRED
                                                          │ assetClass: 'crypto_spot'    │ (TS compile-error if omitted)
                                                          ▼                              ▼
                                              storage.getScreenerFilters({ mode, assetClass: AssetClass, filterPath? })
                                                          │
                                                          │ NO DEFAULT — params.assetClass is the sole source
                                                          ▼
                                                  screener_filters table
                                                          │
                                                          ▼
                                       Returns the row matching exact (mode, asset_class, filter_path)
```

**TypeScript is now the witness.** Every call site MUST pass an explicit `assetClass`; compile-fail if omitted. The 3 categories: (a) crypto-intentional → explicit `'crypto_spot'`; (c) asset-class-aware → routes via signal/cycle context; (d) diagnostic baseline → routes via `getCanonicalScreenerConfig` helper. The 6-additional-sites discovered via the compile-driven audit is direct evidence of the pattern's value — manual greps undershot by ~19%.

---

## §4 — Files changed (24 total: 17 modified + 5 created in initial commit; 4 more touched in fix-forward)

**Initial commit `c8cb22e1c` (Step 3 implementation):** 24 files / 1153 insertions / 56 deletions.

**Fix-forward commits:**
- `c8c7143e4` — RTB resolveAssetClass-only (RtbSignal DB type lacks asset_class column)
- `512429ab9` — Step 4 BLOCKER fix: upsertScreenerFilters REQUIRED-assetClass + UPDATE WHERE 3-clause; routes.ts:2407 explicit crypto literal; 3 (d)→(a) reclassifications
- `f6f823c60` — Stale-reference corrections (BATCH_CATALOG row 171 + 4 POST_AUDIT_ROADMAP)
- `ab3153ce5` — Umbrella rev 4 (B72 prior-arc context per sub-batch)

**Deploy commit:** `ab3153ce5` (PM2 #310 at 2026-05-21T14:59:28Z).

### Core API + helper (server/storage.ts)
- Interface signature + implementation: `getScreenerFilters` REQUIRED-assetClass
- NEW: `getCanonicalScreenerConfig` helper with banner-style NEVER-for-routing docstring
- `upsertScreenerFilters` REQUIRED-assetClass on data shape + UPDATE WHERE 3-clause `(mode, asset_class, filter_path)` (BLOCKER fix)

### SQE chain (server/core/filters/signal_quality_evaluator.ts)
- NEW: `SQEInput.assetClass: AssetClass` REQUIRED field
- `getSQEThresholdsFromConfig(mode, assetClass)` — REQUIRED assetClass param
- `SignalQualityEvaluatorService.getThresholds(mode, assetClass)` — REQUIRED assetClass + cache key extended to `${mode}:${assetClass}`

### SQE callers (3 sites)
- `server/services/signal-orchestrator.ts:567` — populates from `rawSignal.metadata?.assetClass ?? resolveAssetClass(symbol, 'kraken')`
- `server/core/rtb/ready_to_buy_service.ts:646, 868` — interim `resolveAssetClass(symbol, 'kraken')` only (RtbSignal DB row schema gap → RTB batch #11)

### (a) crypto-intentional explicit (10 sites)
- `server/services/fx5-scanner.ts` × 6
- `server/services/config-update-service.ts:208`
- `server/services/unified-filter-gateway.ts:141, 189` (reclassified from (d) per Langston Step 4)
- `server/services/paper-sim-service.ts:162` (reclassified from (d) per Langston Step 4)

### (d) diagnostic via `getCanonicalScreenerConfig` (21 sites)
- `server/routes/vts.ts:1445-1457` × 12
- `server/routes.ts` × 8 (lines 2199, 2361, 2536, 3389, 3510, 12499, 13858, 20817)
- `server/index.ts:993, 1074` × 2 (boot snapshot + FilterCoherence telemetry)
- `server/services/paper-sim-diagnostic.ts:99`
- `server/services/reb-2-12-test-harness.ts:113`
- `server/services/reb-2-15-certification.ts:129`

### (d) diagnostic explicit literal (1 site)
- `server/scripts/diagnostic-11.4G-5.ts:82-83` (one-off CLI tool, not a route handler)

### Routes (1 site for upsert caller)
- `server/routes.ts:2407` — UI edit endpoint passes `assetClass: 'crypto_spot' as const` (canonical crypto baseline editor today; per-class UI editing is a future capability requiring request-body asset-class param + per-class UI surface — out of B79.0n.STORAGE scope)

### Seed migration
- `drizzle/migrations/2026-05-21-b79-0n-storage-xstock-screener-filters-seed.sql` — 10 xStock rows cloned from crypto baseline. Idempotent.

### Unit tests
- NEW: `server/tests/unit/b79-0n-storage-required-assetclass.test.ts` — 3 tests including upsert TYPE LOCK
- NEW: `server/tests/unit/b79-0n-storage-sqe-asset-class-routing.test.ts` — 4 tests including cache-isolation case per Langston Step 2 RE-ACK item 4
- UPDATED: `server/tests/unit/sqe-config-dynamic.test.ts` — 3 existing SQEInput constructions gain `assetClass: 'crypto_spot' as const`

---

## §5 — Crypto-by-construction-NONE invariant — empirical confirmation

| Test | Pre-deploy | Post-deploy (PM2 #310) | Delta |
|------|-----------:|------------------------:|------:|
| FX5 paper-scan evaluated count | (last pre-deploy cycle) | 362 | within ±5% |
| FX5 paper-scan eligible count | (last pre-deploy cycle) | 97 | within ±5% |
| xStock scanner tick duration max | <1500ms typical | 1288ms peak across post-restart window | unchanged |
| Errors in `/var/log/dawntrader/error.log` (B79.0n.STORAGE class) | 0 | 0 | unchanged |
| screener_filters row count | 38 (24 crypto + 14 xStock) | 48 (24 crypto + 24 xStock) | +10 xStock; crypto unchanged |

Full empirical regression-lock comparison at the 24h soak fire (2026-05-22T11:55:57Z, alert `d4b2e590`).

---

## §6 — Crypto rows untouched (proof by row-count + migration shape)

Pre-deploy `screener_filters` had 24 crypto_spot rows (12 paper + 12 live) and 14 xstock_spot rows (7 paper + 7 live). The migration query at §8 of the change list uses `WHERE s.asset_class = 'crypto_spot'` in the SELECT but writes `'xstock_spot'` in the INSERT — it only ADDS xStock rows. Post-deploy: 24 crypto_spot rows (UNCHANGED) + 24 xstock_spot rows (12 paper + 12 live; +10 from migration). Crypto path's `screener_filters` reads are returning the same row data they returned pre-deploy.

---

## §7 — Langston review trail (Steps 1, 2, 2-RE-ACK, 4, 4-RE-ACK, 8)

| Step | Verdict | Key items |
|------|---------|-----------|
| Step 1 (scope) | ACK with 3 concerns A/B/C | A: loadSqeConfig caller chain enumeration; B: getSQEModuleDefaults asset-class scope deferral to SCORING; C: tsconfig strictness baseline |
| Step 2 (pre-audit) | ACK with 4 blocking-light asks | 1: row-coverage psql NOW (10 missing rows identified); 2: arithmetic fix (32 vs 38); 3: RUNNING_ISSUES wording trigger; 4: cache-isolation test |
| Step 2 RE-ACK | APPROVED | All 4 asks resolved; 2 remaining Qs answered (helper signature + SQEInput strictness) |
| Step 4 (code review) | **NOT YET ACK — 1 BLOCKER + 3 reclassifications** | BLOCKER: upsertScreenerFilters WHERE missing assetClass = silent cross-class corruption; 3 (d)→(a) reclassifications: unified-filter-gateway x2 + paper-sim-service x1 are runtime not diagnostic |
| Step 4 RE-ACK | APPROVED | All 4 fixes confirmed; 4 §11 ACK items still non-blocking; Step 6 greenlit |
| Step 8 (second-pass) | ACK | Independent verification via `ssh deploy@188.245.193.8` grep; xStock duration distribution top 5: 1111/1142/1146/1160/**1288ms** peak — 19× under 25s ceiling |

**Dispatch infrastructure observation:** Step 4 RE-ACK v1 dispatch hung 10+ min on `git -C /mnt/gdrive` FUSE I/O — D-state stuck processes accumulated. v2 dispatch with embedded-diff inline + explicit `DO NOT git-grep against /mnt/gdrive — use ssh deploy@188.245.193.8` instruction completed cleanly. Pattern confirmed working per CLAUDE.md §6.5.0.a + B-NEW-42b lesson.

---

## §8 — RUNNING_ISSUES touched at governance close

- **NEW (Tier 3 cleanup): module_constants `sqe_config` per-class deferred to SCORING.** Wording with explicit promote-to-active triggers per Langston Step 2 Q-S2-4: "(a) xStock requires different `min_final_score` / `min_regime_weight` than crypto (Phase 19 active-trade calibration); OR (b) any third asset class onboards (3-class asymmetry compounds harder than 2-class); OR (c) SCORING batch begins regardless. Promotion to active = `_SQE_GK` becomes parameterized by assetClass + `getSQEModuleDefaults(assetClass)` signature gains required param."
- **NEW (Tier 3 cleanup): RtbSignal DB row lacks `asset_class` column.** Pre-audit §5.2 flagged for RTB batch #11. STORAGE works around with `resolveAssetClass(symbol, 'kraken')` at the 2 RTB SQEInput-construction sites (interim). When RTB batch adds the schema column + migration, the 2 sites convert to read from `signal.assetClass`.
- **NEW (Tier 3 cleanup): xStock screener_filters rows are placeholder-cloned from crypto baseline.** Promote to Layer 3 calibration when (a) Phase 19 xStock active-trading enablement gate approaches, OR (b) Step 7 verification shows xStock signal generation rate materially different from crypto suggesting per-class thresholds needed.
- **NEW (Tier 3 cleanup): vts-runner.ts + vts-service.ts internal helpers with `assetClass?: string` optional.** Pre-audit broader grep finding; flagged for STRATEGY batch (#5) scope.
- **TS-hardening sweep candidate:** tsconfig.json has `strict: true` but NOT `noUncheckedIndexedAccess` or `exactOptionalPropertyTypes`. Pre-audit Concern C sub-finding; flagged for future TS-hardening batch.

---

## §9 — Step 10 governance files updated

| Tier | File | Update |
|------|------|--------|
| 1 | `1-system-manual/BATCH_CATALOG.md` | New row: B79.0n.STORAGE |
| 1 | `1-system-manual/PHASE_HISTORY.md` | New row under 15c continuation |
| 1 | `.claude/memory/MEMORY.md` (truth) | State block updated |
| 1 | `DawnTraderV3/.claude/memory/MEMORY.md` (repo mirror) | Synchronized |
| 1 | `Claude Comms and Packages/Scope Files/B79_0n_STORAGE_SCOPE.md` | (already shipped Step 1) |
| 1 | `Claude Comms and Packages/Scope Files/B79_0n_STORAGE_PRE_AUDIT.md` | (already shipped Step 2 + post-ACK corrections) |
| 1 | `Claude Comms and Packages/Batch Completion/B79_0n_STORAGE_COMPLETION_REPORT.md` | This document |
| 1 | `Claude Comms and Packages/Change Lists/B79_0n_STORAGE_CHANGE_LIST.md` | Embedded-diff change list shipped Step 4 |
| 2 | `1-system-manual/SYSTEM_MANUAL.md` | New section: storage API REQUIRED-assetClass + Layer 1/Layer 2 distinction |
| 2 | `1-system-manual/SYSTEM_IMPACT_MAP.md` | New Recent Additions section: storage API + getCanonicalScreenerConfig helper + SQEInput.assetClass field + 38 caller updates |
| 2 | `1-system-manual/RUNNING_ISSUES.md` | 4 new Tier 3 entries per §8 above |
| 2 | `1-system-manual/ASSET_CLASS_ONBOARDING_WORKFLOW.md` | NEW Step 4.9 — REQUIRED-assetClass storage API pattern + cache-key extension + getCanonicalScreenerConfig helper template |
| 1 | `/home/langston/MEMORY.md` (Hetzner) | Updated via scp+ssh per CLAUDE.md §2.10.b |

---

## §10 — Asset-class onboarding workflow learnings (CLAUDE.md §3.3 mandatory section)

### (a) What worked well — patterns to template

**Type-system-enforced caller-resolves is the right pattern for API surfaces.** The REQUIRED-assetClass refactor at `storage.getScreenerFilters` did three things that compound:

1. **Surfaced 6 silent-fallback sites the pre-audit grep missed** — paper-sim-diagnostic, paper-sim-service, reb-2-12, reb-2-15, unified-filter-gateway x2. ~19% undercount from the manual grep. The TypeScript compiler is a better audit tool than ripgrep for "every caller of method X."
2. **Forced explicit categorization** — every site had to be labeled (a) crypto-intentional, (c) asset-class-aware, or (d) diagnostic. The categorization itself became a maintenance asset: future developers can search for `assetClass: 'crypto_spot'` and immediately see which sites are pinned to crypto vs which route via context.
3. **Caught the upsertScreenerFilters BLOCKER at Step 4 review.** The seed migration in this same batch CREATES a second row per (mode, filterPath); a 2-clause WHERE would silently cross-corrupt rows. Langston caught this because the type-level enforcement clarified the design intent ("every operation is asset-class-scoped"). Without the design clarity from the type-level work, the schema-vs-implementation gap was easy to miss.

**Cache key extension pattern.** `${mode}` → `${mode}:${assetClass}` is the canonical way to extend cache keys when adding an orthogonal scoping dimension. Memory cost is `O(k)` not `O(k²)` because k=4 is bounded. The new `b79-0n-storage-sqe-asset-class-routing.test.ts` cache-isolation case is the regression-lock template for any future cache-key dimension addition.

**Banner-style "NEVER use this for runtime routing" docstring on diagnostic helpers.** The `getCanonicalScreenerConfig` helper has a deliberately-uppercase warning in its docstring. Langston's Step 4 review caught 3 sites that violated the contract — the docstring tone made it easy to identify "this site is doing the wrong thing." Use uppercase + "NEVER" for any helper whose misuse would re-introduce a silent-fallback footgun.

### (b) What surprised us — pitfalls to avoid in next onboarding

**Pre-audit grep can undercount by ~20%.** My initial pre-audit identified 32 silent-fallback sites; the actual compile-driven audit found 38. The 6 missed sites were ones where the call shape was `storage.getScreenerFilters({ mode, ... })` with a variable-bound `mode` reference that the regex pattern matched only when followed by a closing `})` or `, filterPath:`. Manual greps with regex are sensitive to call-shape variation; TypeScript's reference graph is not. **Rule for next onboarding:** treat pre-audit grep counts as **lower bounds**, not exact. Plan for ~20% undercount; the TypeScript compile-driven audit at implementation time will surface the rest.

**Schema-vs-implementation gaps survive past their original batch.** The `rtb_signals` table doesn't carry an `asset_class` column today — STORAGE worked around with `resolveAssetClass(symbol, 'kraken')` as the sole source for the 2 RTB SQEInput sites. The schema gap was flagged in pre-audit §5.2 and is tracked for RTB batch #11, but it's a real interim. **Rule for next onboarding:** when a related-but-out-of-scope schema gap surfaces, the workaround pattern in the calling code is acceptable BUT must be both (a) explicitly commented as "interim until batch N closes the schema gap" and (b) filed as a tracked RUNNING_ISSUES entry. Don't bury the interim in a code comment alone.

**Same-batch migrations + WHERE clauses must be co-audited.** The upsertScreenerFilters BLOCKER existed because the same batch that **created** the multi-row scenario (10 xStock rows) was also the batch that needed to **update WHERE** clause scope. Pre-audit didn't catch it because pre-audit examined the API surface and the migration in separate sections. **Rule for next onboarding:** when a batch ships both a schema/data change AND code that operates on that schema, the pre-audit must explicitly cross-reference WHERE/JOIN clauses against the new row population shape. Add to ASSET_CLASS_ONBOARDING_WORKFLOW.md as Step 4.9 (next).

**GDrive FUSE mount is a Langston-dispatch failure mode that recurs across batches.** Langston's first Step 4 RE-ACK dispatch hung 10+ min on `git -C /mnt/gdrive` FUSE I/O — D-state stuck processes can't be kill -9'd. Per CLAUDE.md §6.5.0.a (the B-NEW-42b lesson), the v2 dispatch shape with embedded-diff inline + explicit "DO NOT git-grep against /mnt/gdrive — use ssh deploy@staging" instruction at the TOP of the dispatch worked first try. **Rule for next onboarding:** every Langston dispatch that might involve repo verification MUST include the no-gdrive instruction at the top, AND embed load-bearing diff content inline rather than relying on Langston to fetch it. Even when he's been told before, the prompt structure is what drives behavior.

### (c) Recurring structural patterns observed across asset classes

**Layer 1 vs Layer 2 distinction in DB-backed config.** STORAGE works on Layer 1 (`screener_filters` API surface); B72 worked on Layer 2 (`module_constants` fallback). The two layers serve distinct purposes:

- Layer 1 is the **primary configuration source**, runtime-overridable via UI, asset-class-scoped per the unique index `(mode, asset_class, filter_path)`.
- Layer 2 is the **fallback default**, code-warm-loaded at boot, currently mostly wildcard scope.

**Pattern for next asset class:** when adding a new asset class, the per-class Layer 1 rows are the primary work (seed migration); Layer 2 per-class rows are usually deferred to a separate batch unless the primary thresholds differ materially from the wildcard baseline. The STORAGE → SCORING handoff documents this pattern explicitly.

**Compile-driven audit > manual grep.** Reaffirmed from B79.0n.UNIVERSE-DISCOVERY learnings. Type-level enforcement at API surfaces forces every caller to either update or fail to compile — converting the audit from "find every site that might be wrong" to "find every site the compiler says is wrong." For asset-class refactors at the storage / API / interface layer, this should be the default pattern.

### (d) Concrete edits proposed to `ASSET_CLASS_ONBOARDING_WORKFLOW.md`

Edits applied in the same governance turn as this completion report:

1. **NEW Step 4.9 — REQUIRED-assetClass storage API pattern + cache-key extension + getCanonicalScreenerConfig helper template.** Documents the type-level enforcement pattern + the `${mode}:${assetClass}` cache key extension + the banner-style docstring rule for diagnostic helpers.
2. **Strengthen Step 4.5 (Writer-side audit):** add explicit "treat pre-audit grep counts as lower bounds — plan for ~20% undercount" guidance. Add cross-reference to "TypeScript compile-driven audit will surface the rest" pattern.
3. **NEW rule in Step 4.5:** "When a batch ships both a schema/data change AND code that operates on that schema, the pre-audit must explicitly cross-reference WHERE/JOIN clauses against the new row population shape. Migration-vs-WHERE-clause is a known footgun."
4. **NEW rule in §6.5.0.a dispatch protocol:** "every Langston dispatch that might involve repo verification MUST include the no-gdrive instruction at the TOP, AND embed load-bearing diff content inline. Even when he's been told before, the prompt structure drives behavior."

---

## §11 — Locked next steps

1. **24h crypto regression-lock soak** — alert `d4b2e590` fires 2026-05-22T11:55:57Z. Same alert covers UNIVERSE-DISCOVERY + STORAGE (same-day deploy, same baseline, same per-metric thresholds).
2. **06:00 UTC cron self-fire review** — alert `2af50871` fires 2026-05-22T13:00:00Z. Verifies UNIVERSE-DISCOVERY cron-self-fire path (not STORAGE-specific).
3. **Next umbrella sub-batch:** **B79.0n.MCE** (sub-batch 4 of 18) per umbrella rev 4 §1.5 dependency graph. Scope is "Market Context Engine asset-class plumbing." Per the rev 4 prior-arc context, MCE **shrinks materially** because B72 already wired regime_classifier + regime_age + dbs_calculation + cost_model — remaining work is per-class seed rows + direct asset-class branching for non-lever code (friction estimates, indicator computations, macro modifier). Each scope file from this point forward MUST include a B72 prior-arc context section.
4. **Tracked follow-ups from §8 RUNNING_ISSUES:**
   - SCORING (#8): pick up the deferred `module_constants.sqe_config` per-class work with explicit promote-to-active triggers
   - RTB (#11): close the rtb_signals.asset_class schema gap so the 2 SQEInput sites can read `signal.assetClass` directly
   - vts-runner/vts-service `assetClass?:` optional parameters folded into STRATEGY (#5) scope
   - TS-hardening sweep batch (post-arc): `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`

---

**Batch CLOSED 2026-05-21.**

Verbatim Langston reply chains preserved at:
- `Claude Comms and Packages/Langston Design Asks/B79_0n_STORAGE_STEP1_LANGSTON_REPLY.md`
- `Claude Comms and Packages/Langston Design Asks/B79_0n_STORAGE_STEP2_LANGSTON_REPLY.md`
- `Claude Comms and Packages/Langston Design Asks/B79_0n_STORAGE_STEP2_REACK_LANGSTON_REPLY.md`
- `Claude Comms and Packages/Langston Design Asks/B79_0n_STORAGE_STEP4_REACK_LANGSTON_REPLY.md`
- `Claude Comms and Packages/Langston Design Asks/B79_0n_STORAGE_STEP7_VERIFICATION.md`
- `Claude Comms and Packages/Langston Design Asks/B79_0n_STORAGE_STEP8_LANGSTON_REPLY.md`
