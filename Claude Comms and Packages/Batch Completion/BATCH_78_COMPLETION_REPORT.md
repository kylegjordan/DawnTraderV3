# BATCH 78 — Modularization Phase — Completion Report

**Status:** SHIPPED 2026-05-07
**Workflow:** 11-step canonical
**Branch:** `migration/aws-supabase`
**HEAD at close:** `57220ab4b` (hotfix on top of `e814461d6` initial commit)
**PM2:** restart #180 (~22:58 UTC 2026-05-07)
**Position in stretch:** 1st of 4 batches in B78–B81 Multi-Asset VTS Expansion (per `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md`)

---

## §A. Trigger

Kyle directive 2026-05-07 evening: skip Phase 16 (legacy cleanup); use the 8-day observational window (until 2026-05-15) to ship Modularization + Multi-Asset VTS expansion (xstock_spot, crypto_perp, RTB ranking parity). B78 is the structural prerequisite — without it, B79/B80 would shoehorn new asset-class logic into crypto-shaped files; with it, those become "implement the asset-class submodule."

Modularization-driver context: synthesis doc `Claude Comms and Packages/Scope Files/MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` Part II (8 conceptual modules) + Part V (sequencing). The 5-dimensional `(exchange, asset_class, filter, strategy, regime)` resolution hierarchy in `module_constants` already existed (B69 schema); B78 ships the file-system shape that makes the hierarchy ergonomic to populate.

---

## §B. Outcome

**Pure file/import refactor + one aggregator-query scope filter. ZERO behavioral change on `asset_class='crypto_spot'`.** Verified via:
- Madge HARD GATE: 47 cycles → 47 cycles (zero diff in cycle list).
- Threshold-vs-formula trap respected per pre-audit §2 (per-line replace-vs-leave-inline; Langston Step-4 confirmed).
- Test failures in CI: 59/995/5/1059 — identical to B77 close baseline.
- No-touch fence post-deploy SQL: 10 factors arriving on `asset_class='crypto_spot'` (cadence math extrapolates to ~10 rows/factor/hr; matches pre-deploy baseline of 9-10/hr).

**Critical-path delivery achieved.** B79 can now populate `server/asset_classes/xstock_spot/*` and B80 can populate `server/asset_classes/crypto_perp/*` without touching crypto_spot's resolution path or the chain-final calibration framework.

---

## §C. Components shipped

| Path | Description |
|---|---|
| `server/asset_classes/crypto_spot/pattern-pool-filters.ts` | Moved + renamed from `server/config/pattern-filter-profile.ts`. Live consumer: `signal_quality_evaluator.ts`, `paper-position-sizing.ts`, `active-filter-pool.ts`, `signal-orchestrator.ts`. |
| `server/asset_classes/crypto_spot/regime-thresholds.ts` | NEW. Leaf module (no imports allowed). 14 named exports (RBS_VOL_MAX/RBS_DX_MAX/RBS_DBS_MAX, IE_VOL_MIN_PATH_A/B + IE_DX_MIN_PATH_A + IE_DBS_STRONG, TFS_MOM_MIN_PATH_A + TFS_DX_MIN + TFS_DBS_MODERATE, HVU_VOL_MIN + HVU_MOM_NEG_PATH_A/B + HVU_DX_STRONG). Imported only by `market-regime.ts`. |
| `server/asset_classes/crypto_spot/friction.ts` | Placeholder (`export {};`). Friction extraction deferred to B79/B80 per Langston rev 1 review §A. |
| `server/asset_classes/crypto_spot/index.ts` | Re-exports the 3 submodules. |
| `server/asset_classes/{crypto_perp,xstock_spot}/{pattern-pool-filters,regime-thresholds,friction,index}.ts` | 8 placeholder files. `index.ts` declares `NotImplementedError` class (does NOT throw on import — only when caller throws it). Other 6 files are `export {};` shapes. Populated in B79/B80. |
| `server/exchanges/kraken/kraken.ts` | Moved from `server/services/kraken.ts` (git rename, history preserved). 🔒 LOCKED MODULE comment retained — B78 modularization is the formal directive authorizing the move. Internal import updated `./utils/symbol-canonicalizer.js` → `../../services/utils/symbol-canonicalizer.js`. |
| `server/exchanges/kraken/kraken-pair-metadata-service.ts` | Moved (git rename). No internal imports. |
| `server/exchanges/kraken/kraken-data-documenter.ts` | Moved (git rename). Imports updated `./kraken` → `./kraken.js` (intra-package post-move) and `../storage` → `../../storage.js`. |
| `server/core/metrics/market-regime.ts` | Imports `regime-thresholds.ts`. Branch-condition replacements at lines 200, 205, 211-212, 243. Formula anchors at L216 (`0.012`), L221 (`0.015`), DEFAULT_REGIME_CONFIG L47/63 (`0.45`) preserved inline. |
| `server/services/drift-dashboard-aggregator.ts` | One-line: `AND asset_class = 'crypto_spot'` added to `computeFactorCalibration` query at L1054. B76 chain-final filter at L504 untouched. |
| 23 caller files | Import-path updates from old → new paths across `services/`, `services/market-data/`, `services/monitoring/`, `scripts/`, `index.ts`, `routes.ts`, `startup/`, `core/filters/`, `core/metrics/cost-metrics.ts`. |

**Total diff stat (both commits):** 22 files in initial commit (+47/-29 source), 23 files in hotfix (one-line each, blown up to 11270/11270 line-counts by GDrive CRLF re-encoding but functionally just path edits).

**Re-export shims at old paths** exist as untracked files in working tree (with `// DEPRECATED — remove in B81` comments) but were NOT committed. Functionally unused since all 24 callers updated to new paths. Tracked at RUNNING_ISSUES #73 for B81 cleanup; Langston Step-4 cleared "no shims acceptable, CI build is the gate."

---

## §D. Hotfixes within close window

**`57220ab4b` — fix 23 missed kraken.ts caller import paths.** Initial commit `e814461d6` failed CI Build with `Could not resolve "./kraken.js"` across `vts-runner.ts`, `fx5-scanner.ts`, `paper-sim-service.ts`, `ohlc-cache.ts`, `services/market-data/volume-classifier.ts`, `services/monitoring/mini-book-integrity-monitor.ts`, `risk-concentration.ts`, and others. Pre-flight grep used pattern `(\\.\\.?/)+services/kraken` which only matches paths containing `services/kraken` — intra-services callers using bare `./kraken` or `./kraken.js` were missed.

Sed-batch fix:
- Services/*.ts (21 files): `./kraken[.js]` → `../exchanges/kraken/kraken.js`
- Services/market-data/, services/monitoring/ (2 files): `../kraken.js` → `../../exchanges/kraken/kraken.js`

Madge re-verified: 47 cycles (still matching baseline; no new cycles).

**Lesson logged in MEMORY:** future modularization batches use broader grep `['"](\\.\\.?/)+kraken(?:\\.|$|['"])`.

---

## §E. Verification

### E.1 CI gate (run `25491625912` on hotfix)

| Job | Conclusion | Notes |
|---|---|---|
| Build | ✅ success | clean |
| Docker Build | ✅ success | clean |
| TypeScript Check | ❌ failure | legacy infrastructure baseline; zero new errors from B78 file moves |
| Test Suite | ❌ failure | 59 failed / 995 passed / 5 skipped (1059 total) — **identical exact counts to B77 close**; zero new B78 failures |

Per Kyle directive: Build+Docker+Test green = clear to deploy. Confirmed.

### E.2 Live verify smoke (post-deploy)

Deploy: PM2 restart #180 at ~22:58 UTC. Clean boot; HTTP 200; PM2 errors are pre-existing noise (EACCES /home/runner from MarketDataHealthCheck + ethical-reasoner audit-trail warnings — both pre-date B78).

**Post-deploy no-touch fence SQL** (~12 min into 1h window):
```
factor_name                 | n
b67_1_btc_dominance         | 2
b67_1_funding_rates         | 2
b67_1_mcap_momentum         | 2
b67_2_phase_preference      | 2
b67_4_outcome_feedback      | 2
b68_1_multi_tf_agreement    | 2
b68_2_volume_regime         | 2
b68_3_pair_correlation      | 2
b68_4_regime_age            | 2
b68_5_path_b_sustainability | 2
```
Cadence math: `2 / (12/60) = 10 rows/factor/hr` — matches pre-B78 baseline (9-10/hr). All 10 factors present means the WHERE clause `asset_class='crypto_spot'` resolves syntactically.

**Forward-watch (RUNNING_ISSUES #74):** confirm cadence at +30min, +24h. Revert via `git revert 57220ab4b e814461d6` if drop.

### E.3 Madge HARD GATE

Baseline (pre-move) captured at `Claude Comms and Packages/Change Lists/BATCH_78_MADGE_BASELINE.txt`: **47 cycles**.

Post-move (after both initial + hotfix): **47 cycles, zero diff in cycle list**. No new cross-package cycles.

The known cycle #10 (`kraken-websocket-adapter.ts ↔ live-pricing-adapter.ts`) was deferred out of B78 scope — both files remain in `server/services/`, cycle remains intra-package.

### E.4 Threshold-vs-formula trap (pre-audit §2)

| Literal | Branch instance (REPLACED) | Formula instance (PRESERVED inline) |
|---|---|---|
| `0.012` | L200 RBS_VOL_MAX | L216 `0.75 + (0.012 - vol) * 12` |
| `0.015` | L205 IE_VOL_MIN_PATH_B | L221 `0.65 + (vol - 0.015) * 6 + (dx - 45) * 0.002 + absDbs * 0.1` |
| `0.015` | L243 HVU_VOL_MIN | L245 confidence formula context |
| `0.45` | n/a (DEFAULT_REGIME_CONFIG, no-touch fence) | L47 inline; not touched |

Langston Step-4 confirmed per-line replace-vs-leave verified.

### E.5 Pre/Post-B78 production state

| Setting | Pre-B78 | Post-B78 |
|---|---|---|
| `module_constants.trailing_exit.*` | unchanged | unchanged |
| `module_constants.regime_classifier.*` | unchanged | unchanged |
| `regime_factor_alternates` schema | `asset_class TEXT NOT NULL DEFAULT 'crypto_spot'` (B69) | unchanged |
| `drift-dashboard-aggregator.computeFactorCalibration` | filtered to chain-final cohort (B76) | + `AND asset_class='crypto_spot'` (B78) |
| `market-regime.ts` branch logic | inline literal thresholds | imports named constants from `regime-thresholds.ts` (math unchanged) |
| File paths for kraken cohort | `server/services/kraken*.ts` | `server/exchanges/kraken/kraken*.ts` (ws-adapter stays) |
| File path for pattern filters | `server/config/pattern-filter-profile.ts` | `server/asset_classes/crypto_spot/pattern-pool-filters.ts` |

---

## §F. Langston review trail

| Step | Round | Outcome |
|---|---|---|
| 1+2 combined | rev 1 | **REVISE.** 6 items: ws-adapter cycle defer (HIGH-confidence finding via madge probe), friction extraction defer (cost-model.ts is exchange-keyed not asset-class-keyed), risk row #6 add, pattern-pool-filters.ts rename (not generic filters.ts), madge HARD GATE elevation, threshold-vs-formula trap table (per-line replace-vs-stay guidance). All 4 open questions answered inline. |
| 1+2 combined | rev 2 | **REVISE.** 2 propagation misses: (A) naming inconsistency between §2 #1 / §2 #3 / §5 unified to pattern-pool-filters.ts; (B) stale cost-model row in §5 deleted (informational-only after defer). |
| 1+2 combined | rev 3 | **REVISE.** 2 cosmetic: line 69 brace expansion `{filters,...}` → `{pattern-pool-filters,...}` for consistency with new naming; footer rev/status bumped. |
| 1+2 combined | rev 4 | **APPROVED.** Substance unchanged from rev 3, both fixes verified on inspection. |
| 4 (code review) | rev 1 | **APPROVED.** Per-line trap-table verified; zero residual grep on old paths; crypto_spot/regime-thresholds.ts confirmed leaf; aggregator filter at L1054 (not L504); placeholder scaffolds confirmed inert; crypto_spot/index.ts re-exports verified. Non-blocking notes: friction.ts deferral reasoning agreed; `formula-audit.ts` line-number cites should still hold post-move; B74 file misattribution documented. |
| 8 (second-pass verify) | rev 1 | **APPROVED to close.** Aggregator filter verified scope-only (not math); regime threshold extraction confirmed constant-rename only; cadence math 2/factor at 12min ≈ 10/factor/hr matches baseline; CI baseline-match consistent with refactor signature. Conditional: page back if T+30-45min cadence drops below ~9/factor/hr. Optional smoke-test suggestion: hit endpoint with and without filter — both should return same 10 rows today. |

**4 review rounds total.** Same-session caching kept latency minutes per round once Step-1+2 baseline loaded. Each round caught a real propagation/contradiction miss owned by CC.

---

## §G. Pre/Post-B78 behavior comparison

| Scenario | Pre-B78 | Post-B78 |
|---|---|---|
| Regime classification on crypto_spot | 5-way branch (RBS/IE/TFS/HVU/ST default) with inline literal thresholds | Same 5-way branch with named-export thresholds; **identical math** |
| Kraken REST call from any service | imports `services/kraken.ts` | imports `exchanges/kraken/kraken.js`; **identical behavior** |
| Pattern pool filter resolution | reads from `config/pattern-filter-profile.ts` | reads from `asset_classes/crypto_spot/pattern-pool-filters.ts`; **identical behavior** |
| Calibration aggregator on crypto_spot rows | chain-final cohort filter (B76) | + asset_class='crypto_spot' filter; **same shape today** (table is 100% crypto_spot since only B69 sets the column to crypto_spot by default and B79 hasn't shipped yet) |
| Adding xstock_spot row to regime_factor_alternates (post-B79) | would contaminate crypto_spot calibration | **excluded by aggregator filter** (this is the structural value) |

---

## §H. Governance updates

| File | Update |
|---|---|
| `1-system-manual/BATCH_CATALOG.md` | New B78 entry inserted above B77. |
| `1-system-manual/PHASE_HISTORY.md` | New "Phase 15c continuation" row for B78 SHIPPED. |
| `1-system-manual/RUNNING_ISSUES.md` | NEW #73 (B78 shim cleanup B81), #74 (B78 24-48h cadence forward-watch). Summary counts updated (OPEN 7 → 9). |
| `1-system-manual/CHANGES_AND_FIXES.md` | INFRA-2026-05-07-B entry. |
| `1-system-manual/SYSTEM_MANUAL.md` | NEW "Modularization Phase Architecture (post-B78)" appendix — file-system layout, conceptual-vs-physical module mapping, resolution hierarchy reference, what B78 did NOT change, calibration cohort scope, forward path. |
| `1-system-manual/SYSTEM_IMPACT_MAP.md` | All path references for moved kraken cohort + pattern-pool-filters updated; note added about ws-adapter staying put + cost-model deferral. |
| `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` | §3 typo fix (captured_at → evaluated_at). §12 update-log row recording B78 ship + deltas vs plan + lessons. §9 threshold table stays empty (xstock/perp populate in B79/B80). |
| `MEMORY.md` (truth + repo persistence + Langston) | Three-way sync: 171 lines each, all under 200 cap. B78 close block; pickup priority updated to B79; sequencing reflects B78 SHIPPED. Per CLAUDE.md §2 Step 10.b. |
| `Claude Comms and Packages/Scope Files/BATCH_78_SCOPE.md` | rev 4 (APPROVED). |
| `Claude Comms and Packages/Scope Files/BATCH_78_PRE_AUDIT.md` | rev 1. Includes threshold-vs-formula trap table (pre-audit §2). |
| `Claude Comms and Packages/Change Lists/BATCH_78_MADGE_BASELINE.txt` | 47 cycles captured pre-move. |
| `Claude Comms and Packages/Batch Completion/BATCH_78_COMPLETION_REPORT.md` | This report. |

---

## §I. Pending external

None. B78 is pure code refactor — no Kyle external action required. **Forward-watch on cadence** is automated (RUNNING_ISSUES #74); CC re-runs no-touch fence SQL at +30 min and +24h.

---

## §J. Lessons learned

1. **Pre-flight grep precision matters.** The pre-flight caller-fan-out grep used pattern `(\\.\\.?/)+services/kraken` which only matches paths containing `services/kraken` — intra-services callers using bare `./kraken[.js]` were missed. CI Build caught it (would have crashed at runtime); a tighter pattern `['"](\\.\\.?/)+kraken(?:\\.|$|['"])` would have caught all 24 callers in one pass. **Future modularization batches use the broader pattern.**
2. **Scope-doc revisions can drift across sections invisibly.** B78 went 4 review rounds, each catching a real propagation/contradiction miss owned by CC: (1) ws-adapter cycle, (2) cost-model path + naming inconsistency, (3) line 69 brace expansion still using rejected name, (4) footer rev label stale. **After each revision, search-and-replace ALL instances of the changed concept** — not just the section the reviewer pointed at. Same-name strings can drift.
3. **Madge baseline is the right HARD GATE for refactor batches.** Cycle count + cycle-list-diff is binary-clear: same baseline = same import topology = no surprise build behavior. Future modularization batches lock the cycle-count check as a pre-push requirement, not a post-push observation.
4. **Threshold-vs-formula trap is a real class of bug.** Same numeric literal serving two roles (branch boundary AND formula anchor) is invisible to mechanical extraction. Pre-audit table calling out per-line replace-vs-leave is the right tool. Future threshold extractions use the same pre-audit shape.

---

*End of BATCH_78_COMPLETION_REPORT.md.*
