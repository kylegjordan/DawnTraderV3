# BATCH 78 — Modularization Phase (asset-class + exchange extraction)

**Status:** DRAFT (rev 4) — final naming-propagation fix (line 69 brace expansion) + footer rev/status correction per Langston rev 3 review
**Workflow:** 11-step canonical
**Branch:** `migration/aws-supabase`
**Stretch context:** First batch in the B78–B81 Multi-Asset VTS Expansion stretch (plan doc `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md`).
**Critical-path?** YES — B79/B80/B81 all depend on the module scaffolding landed here.
**Behavioral target:** ZERO behavioral change on `asset_class='crypto_spot'`. Pure file/import refactor + one aggregator-query scope filter.
**Window:** Day 1–3 of the 8-day stretch (target ship 2026-05-09 / 2026-05-10).

---

## §1. Trigger

Per plan-doc §1 + §5 + Kyle directive 2026-05-07: skip Phase 16 cleanup; use the 8-day observational period to ship Modularization + Multi-Asset VTS expansion (xstock_spot, crypto_perp, RTB ranking parity). B78 is the structural prerequisite — without it, B79/B80 would shoehorn new asset-class logic into crypto-shaped files; with it, B79/B80 become "implement the xstock_spot module" and "implement the crypto_perp module."

Modularization synthesis source of truth: `Claude Comms and Packages/Scope Files/MODULARIZATION_SYNTHESIS_FROM_B63_AUDITS.md` §V (sequencing) + Part II (8 canonical modules). Plan-doc §5 supplies the physical file layout target.

---

## §2. Objectives (numbered, each verifiable)

1. **`server/asset_classes/` directory created** with three children: `crypto_spot/`, `crypto_perp/` (placeholder), `xstock_spot/` (placeholder). Each child has `pattern-pool-filters.ts`, `regime-thresholds.ts`, `friction.ts`, `index.ts`. Placeholders for crypto_perp/xstock_spot export empty TS stubs that throw `NotImplementedError` if called — populated in B79/B80.
2. **`server/exchanges/kraken/` directory created.** `kraken.ts`, `kraken-pair-metadata-service.ts`, `kraken-data-documenter.ts` MOVED from `server/services/`. `kraken-futures-*` (B74) MOVED here. All call sites updated. **`kraken-websocket-adapter.ts` is DEFERRED out of B78** — see §6 Risk #6 (bidirectional cycle with `live-pricing-adapter.ts` confirmed by `madge --circular`; cycle break = its own dedicated batch where DI inversion is the explicit objective, not a side-effect of a directory move).
3. **Crypto_spot module populated** by extraction (no rewrites):
   - `server/config/pattern-filter-profile.ts` → `server/asset_classes/crypto_spot/pattern-pool-filters.ts` (filename more specific per Langston Q2 — leaves room for future `regime-filters.ts`, `liquidity-filters.ts`, `market-hours-filter.ts` in the synthesis Part II §3.3 first-class filter family). Re-exported from old path with `// DEPRECATED — remove in B81 (BATCH_81_SCOPE checklist item)` comment for one-batch grace.
   - Regime-classifier thresholds in `server/core/metrics/market-regime.ts` extracted into `server/asset_classes/crypto_spot/regime-thresholds.ts` as named exports. `market-regime.ts` imports them. **The math/branch logic stays in `market-regime.ts` — only the threshold constants move.** No-touch fence on regime classifier math holds. **Threshold-vs-formula trap (Langston §B.b):** the literals `0.012` (line 200), `0.015` (lines 205, 243, 246), and `0.45` (line 47) appear in BOTH branch CONDITIONS and confidence FORMULAS — only the branch-condition instances get replaced with the named export. Formula-anchor instances stay inline. Step-4 diff review enforces per-replace-site.
   - **Per-pair friction extraction DEFERRED to B79/B80** per Langston §A. `server/core/math/cost-model.ts` (correct path; rev 1 wrote `server/utils/cost-model.ts` which doesn't exist) imports cross-cutting defaults from `server/config/exchange-defaults.ts`. Both are exchange-keyed, not asset-class-keyed. Extracting now would invert the resolution hierarchy (`exchange` is more specific than `asset_class` per Synthesis §3.2). B79 and B80 will introduce per-asset-class friction modules when xstock_spot and crypto_perp friction shape becomes real. Plan doc §5 file path also corrected in same governance push.
4. **Aggregator query scoped to crypto_spot.** `server/services/drift-dashboard-aggregator.ts` `computeFactorCalibration` WHERE clause gets `AND asset_class = 'crypto_spot'`. Locks the calibration cohort to crypto_spot regardless of how much xstock_spot/crypto_perp data accumulates from B79+. One-line change.
5. **Module-constants resolution unchanged.** No DB migration. No new module_constants rows. Existing `(exchange, asset_class, strategy, regime)` resolution hierarchy is the modular boundary the file-system layout reflects — they were already orthogonal in the DB schema; B78 makes them orthogonal in source-tree shape too.
6. **CI all-green.** TypeScript Check + Test Suite + Build + Docker Build all pass. (Legacy TS-baseline failure tolerated per §5 of CLAUDE.md, but no NEW errors from B78 file moves; existing 992 tests stay passing.)
7. **No-touch fence holds.** Pre-flight + post-deploy SQL (§3 below) shows crypto_spot ablation cadence unchanged.
8. **Governance updates landed:** SYSTEM_IMPACT_MAP (file paths updated, module boundaries documented), SYSTEM_MANUAL (modularization appendix), BATCH_CATALOG, PHASE_HISTORY, CHANGES_AND_FIXES, RUNNING_ISSUES, plan doc §12 update-log row, both MEMORY copies + Langston MEMORY synced.

---

## §3. No-touch fence pre-flight (mandatory Step 0)

**Note:** plan-doc §3 wrote `captured_at` — actual column is **`evaluated_at`**. Plan doc updated in same B78 governance push (§9 below).

```sql
SELECT factor_name, COUNT(*) AS n_last_hour
FROM regime_factor_alternates
WHERE asset_class='crypto_spot'
  AND evaluated_at > NOW() - INTERVAL '1 hour'
GROUP BY factor_name
ORDER BY factor_name;
```

**Pre-flight result captured 2026-05-07 ~22:55 UTC (post-B77, pre-B78):** 10 factors × 9–10 rows/hr each. Healthy baseline. Run identical query immediately post-deploy in Step 7 verification — material drop = halt + revert.

---

## §4. Out of scope (explicit)

- Any change to regime-classifier branch math, factor-ablation-builders math, or chain-final framework (no-touch fence).
- xstock_spot or crypto_perp implementation logic — only directory scaffolding.
- Strategy-detector audits — that's B79 Step-2 work.
- RTB ranking primitive (`expectedNetReturnR`) — that's B81.
- Aggregator filter for B67.5 consumer wiring — separate cohort gate, untouched here.
- New module_constants seeds for new asset classes — B79/B80 own those.
- Filter-module-family registry as a first-class `module_name='filter:X'` concern (synthesis §3.3 / Part II) — deferred. B78 keeps filters at file-tree level only; first-class filter-as-module shape is a follow-up.

---

## §5. Files affected (preview)

**Created:**
- `server/asset_classes/{crypto_spot,crypto_perp,xstock_spot}/{pattern-pool-filters,regime-thresholds,friction,index}.ts`
- `server/exchanges/kraken/index.ts`

**Moved (with re-export shims at old paths for one-batch grace):**
- `server/services/kraken.ts`, `server/services/kraken-pair-metadata-service.ts`, `server/services/kraken-data-documenter.ts`, `server/services/kraken-futures-*` → `server/exchanges/kraken/` (NB: `kraken-websocket-adapter.ts` deferred per §6 Risk #6)
- `server/config/pattern-filter-profile.ts` → `server/asset_classes/crypto_spot/pattern-pool-filters.ts`

**Modified (import-only):**
- All call sites of moved files (estimate ~30–60 files, mostly one-line import-path updates).
- `server/core/metrics/market-regime.ts` — imports thresholds from new module.
- `server/services/drift-dashboard-aggregator.ts` — one-line WHERE clause addition.

**NOT modified in B78** (deferred per Langston rev 1 review §A and §B.a):
- `server/core/math/cost-model.ts` — friction extraction deferred to B79/B80 (real path noted; was incorrectly written as `server/utils/cost-model.ts` in rev 1).
- `server/services/kraken-websocket-adapter.ts` — bidirectional cycle with `live-pricing-adapter.ts`; cycle break gets its own dedicated batch.

**Created (governance):**
- `Claude Comms and Packages/Scope Files/BATCH_78_SCOPE.md` (this file).
- `Claude Comms and Packages/Scope Files/BATCH_78_PRE_AUDIT.md` (Step 2).
- `Claude Comms and Packages/Change Lists/BATCH_78_CHANGE_LIST.md` (Step 4).
- `Claude Comms and Packages/Batch Completion/BATCH_78_COMPLETION_REPORT.md` (Step 11).

**Estimated diff stat:** ~80–120 file touches; ~95% are mechanical import-path edits or re-export shims; ~5% are the substantive extractions (regime-thresholds + per-pair friction).

---

## §6. Risk register

| # | Risk | Likelihood | Mitigation |
|---|---|---|---|
| 1 | **Import cycles** between `core/metrics/market-regime.ts` ↔ `asset_classes/crypto_spot/regime-thresholds.ts` | **medium-high** (upgraded per Langston review — 47 existing cycles in `services/` confirmed by `madge --circular`; the move list must be careful) | Regime-thresholds module is leaf — exports constants only, imports nothing from `core/`. Explicit `// no-imports-allowed` comment at top of file enforces leaf invariant. `madge --circular` HARD GATE post-move (see §7 step 1). |
| 2 | **Production-build vs dev-build divergence** (cycle invisible under tsc, fatal under Vite tree-shake) | **medium-high** (upgraded — given the existing 47 cycles, any new cross-package cycle has high failure odds) | CI Build job (Vite production) gate AND `madge --circular` local pre-push. |
| 3 | **Re-export shim leak** — old paths kept silently across batches accumulating dead surface | low | One-batch grace policy: shim deleted in B81 governance push. Tracked as RUNNING_ISSUE row at B78 close with explicit `// DEPRECATED — remove in B81` comments at every shim site. |
| 4 | **Ablation cadence drop** post-deploy due to subtle service-startup timing change from import-graph reshape | low | Pre-flight + post-deploy SQL (§3). PM2 restart auto-rolls back via `pm2 reload` if HTTP 200 doesn't return in 30s. |
| 5 | **Grace-period code lives in stale path indefinitely** if B81 forgets to remove it | low | Explicit comment + RUNNING_ISSUE row + BATCH_81_SCOPE checklist item. |
| 6 | **Cross-package cycle introduction via kraken move** — `kraken-websocket-adapter.ts ↔ live-pricing-adapter.ts` is bidirectional today (verified: ws-adapter line 3 imports live-pricing; live-pricing line 6 imports ws-adapter; `madge --circular` confirms). Move would convert intra-package cycle into cross-package cycle, fatal under Vite. | HIGH (would be guaranteed if ws-adapter were moved) | **Mitigation: ws-adapter is DEFERRED out of B78 entirely** (Objective 2 amended). Cycle break gets its own follow-up batch where DI inversion is the explicit objective. The other kraken files (`kraken.ts`, `kraken-pair-metadata-service.ts`, `kraken-data-documenter.ts`, `kraken-futures-*`) verified clean by Langston probes; CC's post-move `madge --circular` is the authoritative final gate. |

---

## §7. Verification (Step 7 + 8)

1. **HARD GATE: `madge --circular --extensions ts server/` post-move.** Cycle count must NOT increase from baseline (47 cycles captured 2026-05-07 ~22:55 UTC, full list saved to `Claude Comms and Packages/Change Lists/BATCH_78_MADGE_BASELINE.txt`). New cycles = halt + revert. Equal-or-fewer cycles = green.
2. `npm run build` clean locally before push.
3. CI: TS Check + Test + Build + Docker all green.
4. Post-deploy:
   - HTTP 200 on staging.
   - PM2 logs clean (no `[B72][INIT_OK]` regression; no import-resolution errors).
   - **No-touch fence post-deploy SQL** matches pre-flight cadence (±20% tolerance per factor).
   - `GET /api/analytics/factor-calibration?window=rolling_7d` returns 10-row table with chain-final cohort intact (B76 marker still on every row).
   - Spot-check ablation row insert: confirm new rows still arrive on `regime_factor_alternates` and that `asset_class='crypto_spot'` filter on aggregator query returns same row count as pre-deploy aggregate.
5. Visual UI smoke (Claude-in-Chrome): VTS dashboard loads, filter-diagnostics endpoint healthy.
6. **Langston Step-8 second-pass on the diff** — verifies no behavioral change crept in alongside the moves AND threshold-vs-formula trap was respected per-replace-site.

---

## §8. Langston work delegation (NEW per Kyle directive 2026-05-07)

Langston now runs Claude Code Opus 4.7 with 1M context. Tasks suitable for parallel delegation (with verified-by-CC pass before merge):

| Task | When | Verification by CC |
|---|---|---|
| **Import-graph dep walk + cycle audit** on the proposed move list (§5) | Step 2, before I touch anything | I run `madge --circular` post-move; cross-check his findings. |
| **Review of the move map** (which files go where) | Step 1, alongside scope review | I draft, he flags any wrong-bucket calls. |
| **Step-8 diff review** (mandatory anyway) | Post-deploy | Standard. |
| **Threshold-extraction sanity check** — confirm I extracted ONLY constants, not branch logic, from `market-regime.ts` | Step 4 | I show him the diff scoped to `market-regime.ts` and `regime-thresholds.ts`. |

I take ownership of: implementation, post-move tsc check, post-deploy fence verification, governance writes.

---

## §9. Governance update list (Step 10)

Tier 1:
- `1-system-manual/BATCH_CATALOG.md` — B78 entry above B77.
- `1-system-manual/PHASE_HISTORY.md` — Phase 15c continuation row.
- `Claude Comms and Packages/Scope Files/BATCH_78_SCOPE.md` (this).
- `Claude Comms and Packages/Batch Completion/BATCH_78_COMPLETION_REPORT.md`.
- Both MEMORY.md copies (truth + repo persistence) + `/home/langston/MEMORY.md` per Step 10.b.

Tier 2 (mandatory for B78):
- `1-system-manual/MULTI_ASSET_VTS_EXPANSION_PLAN.md` — fix `captured_at` → `evaluated_at` typo in §3 SQL; add §12 update-log row recording B78 ship + threshold-table population status (still TBD on xstock/perp columns); pre-audit findings worth carrying forward.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — every moved file path updated; new module boundaries (`asset_classes/`, `exchanges/`) added.
- `1-system-manual/SYSTEM_MANUAL.md` — Modularization appendix: 8-module conceptual map vs file-tree layout, resolution hierarchy reminder, no-touch fence rationale.
- `1-system-manual/CHANGES_AND_FIXES.md` — OPS-2026-05-?? entry.
- `1-system-manual/RUNNING_ISSUES.md` — open-issue row for "B78 re-export shims to be removed in B81" (medium-severity hygiene).

---

## §10. Open questions — RESOLVED in Langston rev 1 review

1. **Move `kraken-data-documenter.ts`?** RESOLVED: yes, moves with kraken cohort. Cohesion with the data-feed primitive wins over its debugging-utility classification.
2. **`pattern-filter-profile.ts` rename.** RESOLVED: → `pattern-pool-filters.ts` (NOT generic `filters.ts`). Specificity preserves room for future `regime-filters.ts`, `liquidity-filters.ts`, `market-hours-filter.ts`.
3. **Re-export-shim grace period.** RESOLVED: 1 batch, removed in B81 atomically with RTB-ranking work which touches the same surface.
4. **Filter-as-first-class `module_name='filter:X'`** RESOLVED: defer past B81 (probably B82/B83). The schema decision deserves its own scope doc; don't bundle into B81's RTB primitive.

---

## §11. Pre-implementation madge baseline (Langston §D item 5 hard gate)

`npx madge --circular --extensions ts server/` run 2026-05-07 against current HEAD. 47 cycles found. Full list captured at `Claude Comms and Packages/Change Lists/BATCH_78_MADGE_BASELINE.txt`. The B78 acceptance criterion is "post-move cycle count ≤ 47, AND no new cross-package cycles introduced."

Specifically confirmed cycles relevant to B78 move list:
- **#10 (BLOCKER):** `services/kraken-websocket-adapter.ts ↔ services/live-pricing-adapter.ts` — DEFERRED out of B78 per Objective 2 amendment.
- **#12, #11, #34, #38, #41:** `storage.ts ↔ guardrail-policy ↔ paper-sim-service ↔ ...` — intra-services, no B78 file moves touch these. Out of scope.
- **#25–33:** `strategy-engine ↔ strategies/*` — intra-package, untouched by B78. Out of scope.
- **#46:** `services/market-indicators ↔ utils/market-events` — untouched. Out of scope.

No remaining cycles intersect the B78 move list after ws-adapter deferral.

---

*End of BATCH_78_SCOPE.md rev 4. Awaiting Langston APPROVED on naming-propagation + footer fix.*
