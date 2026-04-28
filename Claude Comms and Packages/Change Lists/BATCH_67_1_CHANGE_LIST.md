# Batch 67.1 — Change List

**Batch:** B67.1 — Macro Confidence Modifier (sub-deliverable 3 of 6 in B67)
**Status:** Step-3 implementation complete; Step-4 Langston-approved cc-inbox #845 with one bug fixed (mcap momentum field separation per option (a)); ready for Step-5 push
**Approved by Langston:** Step-1 + Step-2 in cc-inbox #844 (2026-04-28)
**Scope + pre-audit:** `BATCH_67_1_SCOPE.md` + `BATCH_67_1_PRE_AUDIT.md`
**Mode at deploy:** SHADOW (`b67_1_enabled=false`). Activation via `module_constants` flip, no code redeploy.

---

## Code changes (10 files: 5 new + 5 modified)

### New files (5)

| File | Purpose | Lines |
|---|---|---:|
| `drizzle/migrations/2026-04-28-b67-1-macro-modifier.sql` | 11 module_constants seeds in new `macro_modifier` module + rollback companion | ~60 |
| `drizzle/migrations/2026-04-28-b67-1-rollback.sql` | Symmetric rollback (deletes the 11 seeds) | ~25 |
| `server/core/metrics/macro-modifier.ts` | Pure `computeMacroModifier()` function + `buildB67_1Alternate()` ablation helper. Z-score normalization with min-48-sample floor + stale-data fallback (per Langston cc-inbox #844 §6.2). | ~250 |
| `server/services/external-macro-feed.ts` | Singleton service polling CoinGecko (BTC dominance, total mcap) + Binance public futures (BTC + ETH 8h funding rates). 60s cache, 720-sample rolling window, partial-feed graceful fallback, loud `[B67.1][feed]` PM2 logging. | ~310 |
| `server/tests/unit/b67-1-macro-modifier.test.ts` | Unit tests: clamp behavior, weight-math sign convention, cold-start floor (3 baseline-source tests), stale-data fallback, missing-input fallback, `buildB67_1Alternate` JSONB shape + reverse-derivation correctness. | ~270 |

### Modified files (5)

| File | Change |
|---|---|
| `server/types/market-context.ts` | + `MacroContext` interface (snapshot + nullable modifier). + optional `macro?` field on `MarketContext`. |
| `server/core/metrics/market-regime.ts` | `calculatePairRegime()` accepts optional 3rd `macroModifier: number = 1.0` parameter. Applied **pre-clamp**. Clamp upper bound raised 0.95 → 1.0 (verified zero existing callers assert on the prior 0.95 ceiling — pre-audit §1.1). |
| `server/services/market-context-engine.ts` | + `macroRefreshTimer` started in `start()` (interval = `cacheTTLMs`, default 60s). + `refreshMacroContext()` async method reads `module_constants.macro_modifier.*`, fetches snapshot + baseline from feed singleton, calls `computeMacroModifier()`, caches result on instance. + sync accessor `getCurrentMacroContext()` for ablation hooks. + `computeContext()` reads cached macro context, threads modifier value into `calculatePairRegime` 3rd arg, attaches macro context to returned `MarketContext.macro`. |
| `server/services/signal-orchestrator.ts` | + import `buildB67_1Alternate` + `FactorAlternate` type. At the existing B67.0 ablation hook (line ~638), build B67.1 alternate row from MCE's current macro context (when modifier is non-null) and push it onto the alternates array passed to `emitAblationRecord`. |
| `server/services/vts-runner.ts` | Same ablation hook wire-up as orchestrator on the VTS mirror path (line ~1374). Reuses existing `getMarketContextEngine` import. |
| `server/services/market-snapshot.ts` | **Reconciled per pre-audit §3.5** — pre-existing stub had hardcoded values (`btcDominance: 54.2`, etc.) and was never wired. Now thin wrapper around `external-macro-feed.ts` getLatestMacroSnapshot. + `fundingRate?: number` field on `MarketSnapshot` type. Single existing caller (`ai-market-analyzer.ts`) inherits real values transparently. |
| `server/services/autonomy-scheduler.ts` | + `initExternalMacroFeed()` call at boot, alongside the existing `initMarketContextEngine()`. Fire-and-forget; errors logged. |

---

## Module constants seeded (11 rows in `macro_modifier` module)

| Constant | Default | Purpose |
|---|---:|---|
| `b67_1_enabled` | `false` | SHADOW at deploy |
| `b67_1_btc_dominance_weight` | `0.40` | Theory-prior seed; recalibrate after 14d |
| `b67_1_funding_weight` | `0.35` | Theory-prior seed |
| `b67_1_mcap_momentum_weight` | `0.25` | Theory-prior seed |
| `b67_1_modifier_min` | `0.85` | Conservative band |
| `b67_1_modifier_max` | `1.05` | Conservative band |
| `b67_1_external_feed_cache_seconds` | `60` | MCE cycle aligned |
| `b67_1_external_feed_stale_seconds` | `300` | Stale fallback threshold |
| `b67_1_btc_dominance_zscore_lookback_days` | `30` | Conceptual lookback |
| `b67_1_funding_zscore_lookback_days` | `30` | Conceptual lookback |
| `b67_1_zscore_min_sample_count` | `48` | Cold-start floor (Langston cc-inbox #844 §6.2) |

Activation: `UPDATE module_constants SET value='true'::jsonb WHERE module_name='macro_modifier' AND constant_name='b67_1_enabled';` (no redeploy).

---

## Behavior

**Shadow mode (current state at deploy, `b67_1_enabled=false`):**
- Feed polls every 60s; PM2 logs `[B67.1][feed] btc_dom=X.XX% mcap_mom=X.XXXXX funding=X.XXXXXX windows=(...)` per cycle.
- MCE refreshes macro context every 60s. Modifier value is `null` → `calculatePairRegime` receives default `macroModifier=1.0` (no-op).
- Confidence number is **unchanged** from pre-B67.1 behavior.
- Ablation hooks NOT populated for B67.1 in shadow because MCE's `getCurrentMacroContext()` returns a context whose `modifier` is `null`. So the alternate isn't built — by design, we want shadow to be observable through the feed-polling logs but not pollute the `regime_factor_alternates` table with no-op rows.

**Active mode (post-flip, `b67_1_enabled=true`):**
- MCE computes the modifier each refresh cycle. Modifier value in [0.85, 1.05] when both `(snapshot fresh)` AND `(all 3 baselines have ≥48 samples)`. Otherwise modifier=1.0 + `fallbackActive=true` OR `staleDataFlag=true`.
- `calculatePairRegime` applies modifier pre-clamp: `confidence × modifier → clamp(0.4, 1.0)`. Label preserved.
- Every signal evaluation emits a B67.1 alternate row to `regime_factor_alternates` with `factor_name='b67_1_macro_modifier'` and the agreed JSONB shape (cc-inbox #842 + #844).

---

## Architecture (recap)

```
real_confidence = clamp(0.4, 1.0, base_classifier_confidence × macro_modifier)

macro_modifier = clamp(0.85, 1.05,
  1.0
  + btc_dominance_weight × (-btc_dom_zscore)      // rising dominance penalizes
  + funding_weight       × (-funding_zscore)      // crowded funding penalizes
  + mcap_momentum_weight × ( mcap_momentum_zscore) // rising mcap reinforces
)
```

Cold-start safety: `min_sample_count=48` floor on each baseline → modifier=1.0 + `fallbackActive=true` until the rolling window has ≥48 samples. At 60s polling that's ~48 minutes from cold start.

Stale-data safety: snapshot age > 300s → modifier=1.0 + `staleDataFlag=true`.

---

## Sign convention (verified against canonical 04-22)

- BTC dominance rising sharply → penalizes (alt confidence drops on a "BTC season" day)
- Funding rates positive extreme → penalizes (crowded long, mean-revert risk)
- Mcap momentum rising → reinforces (broad-market breadth confirms directional confidence)

---

## Coexistence (per pre-audit §3)

- **B62 DBS:** B67.1 is downstream of DBS. DBS drives label; macro modifier scales confidence. No conflict.
- **B63 mode-overlay-bypass:** TEC is a B67.5 #5 concern, not B67.1. B67.1 only changes the confidence VALUE; consumers handle their own gating. No sourcePool gate inside B67.1.
- **Pattern Pool guardrails:** B67.1 does NOT touch FinalScore or rankingScore. Pattern Pool floors unaffected.
- **defensive-hedge BTC correlation:** orthogonal signal at different decision point (per-pair Spearman vs macro dominance). No double-count. Documented pre-audit §3.4.
- **Pre-existing `market-snapshot.ts` stub:** reconciled inline per §3.5. Single caller transparently upgrades.
- **B65.1 module_constants:** existing infrastructure; 11 rows added under new `macro_modifier` module.
- **B67.0 ablation framework:** wire-up only; no emitter API change. JSONB shape opaque to emitter.

---

## Verification log (Step-3 local)

| Check | Result |
|---|---|
| TypeScript | `npx tsc --noEmit` zero B67.1-specific errors (only pre-existing `Cannot find type definition file for 'node'` / `vite/client` env issues) |
| Migration files exist | `drizzle/migrations/2026-04-28-b67-1-macro-modifier.sql` (~2.7KB) + `2026-04-28-b67-1-rollback.sql` (~700B) |
| Diff stat | 7 modified files +309/-33; 5 new files |
| Unit tests written | `b67-1-macro-modifier.test.ts` covers clamp / weight math / cold-start floor / stale fallback / `buildB67_1Alternate` shape (~270 lines, 18 cases) |
| Boot wire-up | `initExternalMacroFeed()` added in `autonomy-scheduler.ts` next to existing `initMarketContextEngine()` |

---

## Workflow gates

| Step | Status |
|---|---|
| 1 — Scope | ✅ Approved (cc-inbox #844) |
| 2 — Pre-audit | ✅ Approved (cc-inbox #844, all 4 Q&A resolved) |
| 3 — Implementation | ✅ Complete |
| 4 — Code review | ✅ Langston-approved (cc-inbox #845) with one bug fix applied — `mcapMomentum` field added to `MacroSnapshot` separate from raw `totalMarketCapUsd`; tests + feed updated. Funding-weight inline doc added per non-blocking observation #2. |
| 5 — GitHub push + CI | Pending — clear to proceed |
| 6 — Staging deploy | Pending CI green |
| 7 — First-pass verification (CC) | Pending deploy |
| 8 — Second-pass verification (Langston) | Pending Step-7 |
| 9 — Iterate | If needed |
| 10 — Governance | BATCH_CATALOG, PHASE_HISTORY, SIM (§5.1 + §5.2.5 deltas), SYSTEM_MANUAL (formula change), CHANGES_AND_FIXES, MEMORY |
| 11 — Completion ack | Kyle |

---

## Out of scope (deferred)

- **Feed-fallback dedicated test file** (`b67-1-feed-fallback.test.ts`) — fallback semantics covered via the modifier's stale + cold-start tests. The HTTP-fetching feed itself is hard to unit-test without `vi.mock(fetch)` infrastructure; deferred unless Step-4 requires.
- **`fundingRate` field added to `MarketSnapshot` type** — field added on the type in `market-snapshot.ts`. Existing callers don't read it.
- **DB persistence of rolling baseline** — in-memory only for v1 per scope §6.2. Promotes to `macro_feed_history` table in B67.4 only if calibration check requires restart-surviving baselines.
- **B67.5 post-composition floor** — pre-registered per Langston cc-inbox #844; lands in B67.5 scope.

---

*Sub-deliverable B67.1 of B67. Sister sub-deliverable B67.2 (`BATCH_67_2_SCOPE.md` + `_PRE_AUDIT.md`) implemented after B67.1 24h shadow soak per Option A serial.*
