# B-SIZING-DEC-RESTORE — Scope (Step 1)

change-class: architecture

**Batch:** B-SIZING-DEC-RESTORE — restore the December sizing intent: fixed-notional per-trade sizing from `maxPositionPercentPct`, slots derived not configured, with `portfolioRiskPerTradePct` and `maxOpenPositions` REMOVED AND DELETED loudly and re-entry-proof. **Owner: CC-C (Claude Analyst). Kyle-directed 2026-08-05.** Board card: "Restore live-comparable position sizes (~$150/trade)" — this scope replaces that card's earlier description; ordered after the dashboard fix (#618 build) per Kyle.

---

## 0. Kyle's ruling (the batch's constitution — near-verbatim, recorded on #618)

> *"Where we last ran successfully in paper mode in Nov or December is where our intent lies. The October intent was old and was replaced. The intent when we stopped testing paper mode in Dec: position sizes and trading slots are controlled by the portfolio balance, the exposure percentage of that balance, and the percentage of the balance allocated to any one trade. $800 balance × 100% exposure × 25% per trade = 4 slots at $200 each. The old additional fields have been re-added and need to be removed and deleted."*

Plus 2026-08-05 follow-up directives: (a) `maxPositionPercentPct` must be wired as THE per-trade percentage **everywhere** it is used, **live mode included**; (b) the DEFENSIVE posture is the AMR — read its history and preserve its intent; (c) deep audit on `maxOpenPositions` before removal; (d) deletions loud, obvious, and impossible to quietly re-add.

## 1. Numbered objectives

1. **Sizing formula becomes fixed-notional:** `perTradeNotional = portfolioValue × maxPositionPercentPct/100` (December's cap formula, `risk-manager.ts@eb5b7368d:770-778`, promoted from cap to size). `quantity = perTradeNotional / entryPrice`. The `riskAmount/stopDistance` computation is deleted with its field.
2. **`maxTotalExposurePct` bounds the TOTAL** (enforced at execution as today); **slot count is DERIVED** ≈ `floor(maxTotalExposurePct / maxPositionPercentPct)` — never configured.
3. **`portfolioRiskPerTradePct` REMOVED AND DELETED** (schema column, UI control, sizer input, kill-switch-adjacent reads enumerated in §3).
4. **`maxOpenPositions` REMOVED AND DELETED** after the §3 census — every reader re-pointed at the derived slot count (or the AMR slot cap where posture governs, per objective 5).
5. **AMR intent preserved EXPLICITLY:** posture no longer multiplies notional by a hidden 0.6. Per its own batch record (B-5 AMR, BATCH_CATALOG:351), the AMR's mode dials already define **per-class SLOT CAPS** (crypto A/N/D/S = 10/12/6/3; xstock 8/10/5/2). Proposed mapping — posture modulates the DERIVED SLOT COUNT (fewer slots when defensive), notional per trade stays fixed. ⚠️ Design decision for Langston/Kyle: slots-only, or also a visible per-trade% dial. The hidden multiplier dies either way.
6. **Live mode wired identically:** the sizer is per-mode via the guardrails row; verify the live row's values and every live-path consumer (Dec live path used the same risk-manager). No live behaviour activates (live is Phase 21); the wiring must simply be correct and tested.
7. **Loud, re-entry-proof deletion mechanics (rule 18 + Kyle's directive):** DELETED_COMPONENTS_LOG entries; `.removed` archives; tombstone comments at each site citing this scope; **fence tests that FAIL CI if either field reappears** in `shared/schema.ts`, the guardrails UI, or the sizer (source-fence pattern per `b-promotion-race-fix.test.ts:68`); migration drops the columns (rollback file stays out of the manifest per policy).
8. **§9.3 verification:** guardrails tab shows the reduced set (both modes); a new trade opens at the expected notional; the derived slot count is visible where maxOpenPositions was.

## 2. Provenance (§2 1.b — corpora searched: git history, BATCH_CATALOG, canonical corpus, RUNNING_ISSUES)

- **`guardrails_v2` born 2025-10-29 `aede2b491`** as "Core Four — Single Source of Truth" (risk/trade, cooldown, maxOpenPositions, kill switch). **Superseded by Kyle's ruling: October is NOT the intent.**
- **`maxPositionPercentPct` re-added `1b2d8b0fe` 2025-12-01** (default 30%): *"modifies GuardrailPolicyService and RiskManager to use this new configurable guardrail."* December formula, quoted from `eb5b7368d:risk-manager.ts:772-773`: `const maxPositionValue = (portfolioValue * maxPositionPercent) / 100` — **portfolio × position% DIRECTLY.** ⚠️ Today's sizer computes `exposureBudget × positionPct` (exposure% × position% — a different, smaller cap). Objective 1 restores the December arithmetic.
- **`maxTotalExposurePct` added `321a4fd45` 2025-12-04** (born 25%): separate total-exposure check. KEEP.
- **December sizing was risk-then-clamp** (`positionSize = riskAmount/stopDistance` at `eb5b7368d:432,529`, then `checkPositionSizeCap`); in practice the clamp bound ⇒ observed behaviour = fixed slots at cap size. **Kyle's ruling promotes the observed/intended effect to the explicit mechanism** — this scope is a restoration of intent, not a byte-copy of December. Disposition of the risk-based path: **(4) connected but REMOVED.**
- **AMR (B-5, 2026-06-12):** per-class weather → posture dials **including slot caps** (see objective 5); the ×0.6 `positionSizeMultiplier` is one dial among several. Intent = risk posture responds to market weather. Preserved via slots, not hidden multiplication. Disposition: **(2) relevant, needs update to today's intent.** Cross-ref #616 (AMR stuck / not opening — CC-B's arc; this batch does NOT adjudicate that).
- **`maxOpenPositions`:** founding Core-Four member (invariant T6 in canonical corpus); Kyle rules it derived. Disposition: **(4) connected but REMOVED.** Census (tests excluded), 14 server/client files: `criteria-limiter, index, routes, active-execution-engine, actuation-policy, adaptive-guardrails, config-update-service, guardrail-policy, guardrail-settings, signal-orchestrator, state-awareness, trade-safety, vts-runner, storage` + `core-four-guardrails.tsx` + schema. Pre-audit (Step 2) does the per-site read + §9.5(a-ii) state-write census before any cut.

## 3. Blast radius / verification criteria

Pre-audit enumerates per-file: reader vs writer, replacement (derived slots / AMR cap / delete), and the §9.5(a-ii) census on both deleted fields (who reads state they wrote). tsc baseline delta 0; full suite; fence tests red-on-revert proven by mutation (revert the sizer call → fence fails); CI 4-green; deploy via `dt-deploy` when available (consensus with CC-B recorded on their pre-audit); §9.3 both guardrails tabs + a live-opened trade at expected notional.

## 4. Explicitly OUT

The dashboard/reader build (#618, precedes this); the AMR stuck-DEFENSIVE adjudication (#616, CC-B); fee-ladder geometry (separate card); any live-mode activation.
