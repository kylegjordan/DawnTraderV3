# BATCH 78 — Pre-Implementation Audit

**Status:** rev 1
**Companion to:** `BATCH_78_SCOPE.md` (rev 2)
**Workflow step:** 2 (mandatory SIM consultation)

---

## §1. SIM consultation — components affected

Files moved or extracted in B78:

| Component (current path) | New path | SIM section | Upstream | Downstream | Blast radius |
|---|---|---|---|---|---|
| `server/services/kraken.ts` | `server/exchanges/kraken/kraken.ts` | §5 (Kraken integration), §10 (Live data adapters) | `utils/symbol-canonicalizer` | `kraken-data-documenter`, callers across services | LOW (clean leaf except symbol-canonicalizer) |
| `server/services/kraken-pair-metadata-service.ts` | `server/exchanges/kraken/...` | §5 | type-only | `kraken-websocket-adapter` (NOT moved) + scanner | LOW (clean leaf) |
| `server/services/kraken-data-documenter.ts` | `server/exchanges/kraken/...` | §5 | `./kraken`, `../storage` | dev tooling only | LOW |
| `server/services/kraken-futures-*` (B74) | `server/exchanges/kraken/...` | §10 (B74 entry) | own modules | scanner cohort | LOW |
| `server/config/pattern-filter-profile.ts` | `server/asset_classes/crypto_spot/pattern-pool-filters.ts` | §6 (Pattern Pool Filters config) | `module-constants-service` | scanner / SQE / orchestrator | MEDIUM (large consumer fan-out — ~30–60 mechanical import-path edits) |
| Threshold constants extracted from `server/core/metrics/market-regime.ts` | `server/asset_classes/crypto_spot/regime-thresholds.ts` | §5.1 (Regime Classifier) | NONE (leaf) | `market-regime.ts` only | LOW (leaf invariant; no behavioral change — only literal moves) |
| One-line WHERE addition in `server/services/drift-dashboard-aggregator.ts:1055` | same file | §10 (calibration aggregator) | `regime_factor_alternates` | calibration UI | LOW (additive filter; widens specificity, drops nothing) |

**Blast-radius summary:** all moves are LOW-MEDIUM. Highest is `pattern-pool-filters.ts` due to consumer fan-out, but every consumer touch is a one-line import-path edit verifiable with grep. No service-startup ordering changes. No new module_constants rows. No DB migration.

**NOT moving in B78 (per Langston review):**
- `server/services/kraken-websocket-adapter.ts` — bidirectional cycle with `live-pricing-adapter.ts` (madge cycle #10). Deferred.
- `server/core/math/cost-model.ts` — exchange-keyed not asset-class-keyed; extraction direction would invert resolution hierarchy. Deferred to B79/B80 when multi-asset friction shape becomes real.

## §2. Threshold-vs-formula trap (Langston §B.b)

`market-regime.ts` re-uses the same numeric literal as both a branch condition AND a formula anchor. Only the BRANCH-CONDITION instance gets replaced with the named export from `regime-thresholds.ts`. The FORMULA-ANCHOR instance stays inline.

| Literal | Branch condition usage (REPLACE with named export) | Formula anchor usage (LEAVE inline) |
|---|---|---|
| `0.012` | line 200: `if (vol < 0.012 && dx < 45 && absDbs < 0.10)` → `if (vol < RBS_VOL_MAX && dx < RBS_DX_MAX && absDbs < RBS_DBS_MAX)` | line 201/2 confidence formula: `0.75 + (0.012 - vol) * 12` — STAYS as `0.012` (formula anchor, not boundary) |
| `0.015` | line 205: `if (vol > 0.015 && absDbs >= 0.50)` → branch | line 207 confidence formula: `0.65 + (vol - 0.015) * 6 + (dx - 45) * 0.002 + absDbs * 0.1` — STAYS |
| `0.015` | line 243: `if (vol > 0.015 && mom < -0.003)` → branch | line 245 confidence formula `0.50 + Math.min(vol * 5, 0.10) + ...` — STAYS (different formula context) |
| `0.45` | line 47 DEFAULT_REGIME_CONFIG `b67_5PostCompositionFloor: 0.45` | runtime DB-resolved tunable — DO NOT touch (no-touch fence) |

**Step-4 diff review checklist:** for every replaced literal, confirm the SOURCE LINE was a branch condition. Any formula-anchor replacement is a regression and must be reverted.

## §3. No-touch fence pre-flight (Step 0)

```
factor_name                 | n_last_hour
b67_1_btc_dominance         | 10
b67_1_funding_rates         | 10
b67_1_mcap_momentum         | 10
b67_2_phase_preference      |  9
b67_4_outcome_feedback      | 10
b68_1_multi_tf_agreement    | 10
b68_2_volume_regime         | 10
b68_3_pair_correlation      | 10
b68_4_regime_age            | 10
b68_5_path_b_sustainability |  9
```
**Verdict:** healthy baseline. Repeat post-deploy in Step 7.

## §4. Madge baseline

`npx madge --circular --extensions ts server/` → 47 cycles. Full list at `Claude Comms and Packages/Change Lists/BATCH_78_MADGE_BASELINE.txt`. Acceptance criterion: post-move cycle count ≤ 47, with NO new cross-package cycles. The relevant cycle (#10) has been removed from B78 scope by deferring `kraken-websocket-adapter.ts`.

## §5. Open before-implementation items

- None. Langston rev 1 review answered all 4 open questions; rev 2 scope reflects answers.

---

*End of BATCH_78_PRE_AUDIT.md rev 1.*
