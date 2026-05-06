# BATCH 76 — Calibration Aggregator Framework Refactor

**Status:** SCOPE rev 1 (drafted 2026-05-06 by CC, awaiting Langston approval)
**Target ship:** by 2026-05-14 (must land before B67.5 wiring window opens 2026-05-15)
**Branch:** `migration/aws-supabase`
**Predecessor:** B75 (data lifecycle / tiered storage) closed 2026-05-06
**Successor (queued):** B77 — `isBreakEvenTriggered` no-op fix (RUNNING_ISSUES #71)

> Per Langston discipline confirmed in B75 close (§K.3): **B76 is single-purpose. Do NOT bundle anything else into it.** All other open follow-ups (B75.x deferrals, partition work, knob migrations) wait for separate batches.

---

## §1. Trigger

RUNNING_ISSUES **#54**: "Calibration aggregator 'shift' metric is structurally not measuring per-factor effect." `real_decision.confidence` stores raw classifier value, not chain-final, so `shift = real - alt` mixes raw-vs-mid-chain rather than capturing factor-specific contribution.

**Concrete symptom (canary):** `b67_2_phase_preference` shows **+0.0pp predictive lift** today purely by construction — it's the FIRST factor in the chain so `alternate_disabled` equals `baseConf` which equals `real.confidence` (raw). The aggregator can't see any signal even when the factor is genuinely working. `b67_1_macro_modifier` is in the same boat (also pre-modulated).

**Concrete symptom (downstream factors):** B68.x factors show non-zero shifts because compounding produces non-zero deltas, but the magnitude is **not** a clean per-factor measurement. Each `buildXAlternate` is called with `_modulatedConfChain` AT THE TIME the factor fires (mid-chain), then divides out its own factor — that captures "remove this factor up to here, then never apply later factors", **not** "as-if-this-factor-absent-but-all-others-still-applied".

**Why now:** B67.5 consumer wiring window opens **2026-05-15**. Without trustworthy per-factor predictive lift, the B67.5 decision (which factors graduate from observational to active) is being made on data we know is structurally biased. Fixing the framework first means B67.5 can rely on the next calibration window's lift table.

**Authority for B76 scope:** Langston Step-1 consensus on B75 §H.4 Item 3. Resolution: "A — schedule as B76. Calibration aggregator framework refactor (~1-2 day focused batch). Must land BEFORE B67.5 wiring (~2026-05-15) for trustworthy lift measurement. Don't bundle anything else."

---

## §2. The framework bug, in one diagram

```
Current (buggy) emit-at-point-of-fire pattern, signal-orchestrator.ts + vts-runner.ts:

baseConf (raw)
  │
  ▼
× macroFactor   ──►  buildB67_1Alternates(modulatedConfChain_so_far_1, …)
  │                     # 3 alternates compute confidence/factor at this point
  ▼
× phaseFactor   ──►  inline b67_2 alternate uses baseConf as alternate (FIRST in chain bug)
  │
  ▼
× outcomeFactor ──►  buildB67_4Alternate(modulatedConfChain_so_far_3, …)
  │                     # divides factor out at this point
  ▼
× volumeFactor  ──►  buildB68_2Alternate(modulatedConfChain_so_far_4, …)
  │                     # ditto
  ▼
× corrFactor    ──►  buildB68_3Alternate(modulatedConfChain_so_far_5, …)
  │
  ▼
× multiTfFactor ──►  buildB68_1Alternate(modulatedConfChain_so_far_6, …)
  │
  ▼
× ageFactor     ──►  buildB68_4Alternate(modulatedConfChain_so_far_7, …)
  │
  ▼
[B68.5 special — label counterfactual, not a numeric divide-out]
  │
  ▼
clamp [floor, 1.0]  →  modulatedConfChain_FINAL
  │
  ▼
emitAblationRecord(real.confidence = predictiveConfidence /* RAW, not chain-final */, alternates[])
```

**Two bugs compounded:**
1. `realDecision.confidence` written to DB is `predictiveConfidence` (raw classifier output), not `_modulatedConfChain` (chain-final).
2. Each alternate's `confidence` is "real partial chain at time-of-fire / this factor", not "chain-final / this factor".

→ Aggregator's `shift = real.confidence - alt.confidence` blends raw vs partial-chain values across factors. Predictive-lift column (REAL spread - ALT spread) **is** trustworthy because it cancels first-order bias inside each factor's own bucket distribution — but absolute "shift" is not a clean per-factor effect.

---

## §3. The fix, in one diagram

```
Refactored chain-final emit pattern:

[same chain math runs unchanged, computing modulatedConfChain step by step]

At each factor's fire point, instead of building the alternate in-line:
  buildB67_4Alternate(modulatedConfChain_so_far_3, …)

…stash the inputs needed to build the alternate later:
  alternateInputs.push({ factorName: 'b67_4_outcome_feedback',
                          factor: result.factor,
                          buildMetadata: () => { … } });

After the final clamp (modulatedConfChain → modulatedConfChain_FINAL):

  const realConfidenceFinal = modulatedConfChain;  // chain-final, post-clamp
  const alternates = alternateInputs.map(input =>
    buildAlternateFromFinal({
      factorName: input.factorName,
      realConfidenceFinal,
      factor: input.factor,
      metadata: input.buildMetadata(),
    })
  );

  emitAblationRecord(
    source, pair,
    {
      regimeLabel,
      confidence: realConfidenceFinal,  // chain-final, NOT raw
      admissionPossible: true,
      metadata: { …, predictiveConfidenceRaw: predictiveConfidence /* preserve for back-compat */ },
    },
    alternates,
    strategy,
  );
```

**Properties of the refactor:**
- Each alternate's `confidence = realConfidenceFinal / factor` (or for label-counterfactual cases like B68.5, the same special-case logic but evaluated against chain-final reference).
- `shift = real.confidence - alt.confidence` becomes a clean per-factor measurement: "what fraction of chain-final confidence does this factor contribute multiplicatively?"
- Predictive-lift remains trustworthy (it always was) and now the component "shift" metric becomes trustworthy too.
- Edge case: factor=0 → alternate confidence = realConfidenceFinal (no division). Same handling as today.
- Edge case: realConfidenceFinal hit the post-composition floor (`b67_5_post_composition_floor`) → divide-out gives a value > 1.0 for some factors. Acceptable; aggregator already handles >1.0 as informational.

---

## §4. Numbered objectives (Step-11 verification grid)

1. **`emitAblationRecord` signature unchanged at the public surface** — still takes `realDecision: RegimeDecision`. Internal contract: callers MUST pass chain-final `realDecision.confidence`. Documented in JSDoc + enforced by unit test.
2. **All call sites updated** — `signal-orchestrator.ts` line ~980, `vts-runner.ts` line ~1744. Both pass `_modulatedConfChain` (post-floor-clamp) as `realDecision.confidence`. Raw `predictiveConfidence` preserved in `realDecision.metadata.predictiveConfidenceRaw` for back-compat with any downstream that reads it.
3. **All 9 build helpers refactored** to a single uniform shape: `buildXAlternate({ realConfidenceFinal, factor, … })` returning `FactorAlternate` with `alternateDecision.confidence = realConfidenceFinal / factor` (or label-counterfactual equivalent for B68.5):
   - `buildB67_1Alternates` (returns 3 alternates: btc_dominance, funding_rates, mcap_momentum) — each computes its own counterfactual modifier, then `alt.conf = realConfidenceFinal × (counterfactual_modifier / actual_modifier)`
   - **NEW** `buildB67_2Alternate` (extract the inline block from signal-orchestrator + vts-runner into `server/core/metrics/regime-phase.ts`)
   - `buildB67_4Alternate` (outcome feedback)
   - `buildB68_1Alternate` (multi-tf)
   - `buildB68_2Alternate` (volume regime)
   - `buildB68_3Alternate` (pair correlation)
   - `buildB68_4Alternate` (regime age)
   - `buildB68_5Alternate` (label counterfactual — special: it's a regime-label flip, not a confidence divide-out. The chain-final value is still attached for completeness; `confidence` stays = chain-final, with the gate-flipped indicator in metadata as today.)
4. **Two-pass orchestrator pattern** — both `signal-orchestrator.ts` and `vts-runner.ts` switch from "build alternate at point of fire" to "stash inputs at point of fire → build alternates after final clamp → emit". This is the architectural change that makes chain-final values available.
5. **Drift dashboard aggregator unchanged at the SQL level**, but the two `factor_name NOT IN (...)` filters at `drift-dashboard-aggregator.ts:510` and `:1055` can now be REMOVED — `b67_1_macro_modifier` and `b67_2_phase_dimension` produce trustworthy shifts after the refactor. Filter removal happens in the same batch. Dashboard UI unchanged; the previously-frozen factor rows reappear with non-zero shifts.
6. **Backward compat for in-flight ablation rows** — rows written before B76 deploy stay in DB with their old (mid-chain) shape. Aggregator queries do NOT need to differentiate because `predictive lift` already cancels first-order bias across rows; only the `shift` column changes interpretation post-deploy. Mark cutover by writing `realDecision.metadata.calibrationFrameworkVersion = 'b76_chain_final'` on every new row. Aggregator can optionally split pre-B76 vs post-B76 rows for A/B comparison if desired (NOT required for B76 close — informational only).
7. **Unit tests** in `server/tests/unit/`:
   - `b76-chain-final-emit.test.ts` — covers all 9 build helpers. Asserts: (a) given known `realConfidenceFinal` + `factor`, `alt.confidence = realConfidenceFinal / factor`; (b) factor=0 fall-through; (c) factor=1.0 produces alternate==real.
   - Existing `b68-1` / `b68-2` / `b68-3` test suites updated to call new build signatures (no semantic test changes — just argument shape).
8. **TypeScript clean** — `tsc --noEmit` zero-error on touched files (CLAUDE.md §11 discipline). No new TS errors anywhere in the changed graph.
9. **Live verify post-deploy** — within 24h of deploy, query `regime_factor_alternates` filtered to `realDecision.metadata.calibrationFrameworkVersion = 'b76_chain_final'`. Confirm:
   - `b67_2_phase_preference`: post-B76 shift NON-zero on signals where phase factor != 1.0.
   - `b67_1_*`: post-B76 shifts non-zero where macro modifier != 1.0.
   - All B68.x factors: post-B76 shifts have monotonic-with-factor relationship (shift ∝ -ln(factor) approximately).
   - **Predictive-lift column unchanged in sign + roughly unchanged in magnitude** for factors that already had it (B68.1 +5.7, B68.2 +4.1, B68.3 +4.1, B67.4 +3.0). If lift sign flips for a factor, fix isn't right.
10. **Drift dashboard** Claude-in-Chrome screenshot: previously-frozen `b67_1_macro_modifier` + `b67_2_phase_dimension` rows now visible in factor calibration table with non-zero data after the filter removal.
11. **Governance updates** — Tier 1: `BATCH_CATALOG`, `PHASE_HISTORY`, `MEMORY` (truth + repo). Tier 2 applicable: `SYSTEM_MANUAL` (calibration framework architecture section), `SYSTEM_IMPACT_MAP` (factor-ablation-emitter + 9 build helpers component table refresh + chain-final emit pattern documented), `CHANGES_AND_FIXES` (#54 resolution entry), `RUNNING_ISSUES` (close #54).

---

## §5. Out of scope for B76 (explicit fence)

- Any change to factor formulas / weights / thresholds. **Pure plumbing refactor.**
- B68.5 path-B momentum gate threshold tweaks (still observational; the 0.001 lower bound landed in B75 close).
- B67.5 consumer wiring (this is the batch B76 enables; happens AFTER B76 close once next calibration window resolves).
- B67.3 admission-gating ablation (separate universe-split mechanism, not affected).
- Aggregator SQL beyond removing the two `NOT IN (...)` filters (no schema migration, no new aggregations).
- Dashboard UI re-design.
- Any other RUNNING_ISSUES item.
- B77 (isBreakEvenTriggered no-op).

---

## §6. Files touched (anticipated)

| Path | Scope |
|---|---|
| `server/services/factor-ablation-emitter.ts` | JSDoc clarifying chain-final contract; signature unchanged. |
| `server/services/signal-orchestrator.ts` | Switch from build-at-point-of-fire → stash-inputs → build-after-final-clamp; chain-final passed to emit. |
| `server/services/vts-runner.ts` | Same restructure. |
| `server/core/metrics/macro-modifier.ts` | `buildB67_1Alternates` accepts `realConfidenceFinal` + 3 counterfactual modifiers; alt.conf via `realConfidenceFinal × (cf/actual)`. |
| `server/core/metrics/regime-phase.ts` | NEW `buildB67_2Alternate` extraction (currently inline in 2 callers). |
| `server/core/metrics/outcome-feedback-store.ts` | `buildB67_4Alternate` accepts `realConfidenceFinal`. |
| `server/core/metrics/multi-tf-agreement.ts` | `buildB68_1Alternate` accepts `realConfidenceFinal`. |
| `server/core/metrics/volume-regime.ts` | `buildB68_2Alternate` accepts `realConfidenceFinal`. |
| `server/core/metrics/pair-correlation.ts` | `buildB68_3Alternate` accepts `realConfidenceFinal`. |
| `server/core/metrics/regime-age-factor.ts` | `buildB68_4Alternate` accepts `realConfidenceFinal`; `buildB68_5Alternate` keeps label-counterfactual semantics but receives chain-final reference. |
| `server/services/drift-dashboard-aggregator.ts` | Remove the two `factor_name NOT IN (...)` filters at L510 + L1055. |
| `server/tests/unit/b76-chain-final-emit.test.ts` | NEW unit suite. |
| `server/tests/unit/b68-1-multi-tf-agreement.test.ts` + `b68-2-volume-regime.test.ts` + `b68-3-pair-correlation.test.ts` | Update build helper invocations to new signature. |
| Tier 1 + Tier 2 governance per §4.11 | Per CLAUDE.md §3. |

**No DB migration. No schema change. No new module_constants rows.**

---

## §7. Risk + blast radius

- **Blast radius:** factor-ablation-emitter is consumed by exactly two upstream paths (signal-orchestrator + vts-runner) and persisted to one table (`regime_factor_alternates`) read by exactly two downstream paths (drift-dashboard-aggregator + replay-ablation.ts). All within the calibration framework. **No trading-path consumers.** Live trading is OFF; calibration data feeds B67.5 wiring decision only. Risk to running trades = 0.
- **Risk of breaking pre-B76 ablation rows:** none — they keep their existing semantics; new rows tagged `calibrationFrameworkVersion = 'b76_chain_final'` for distinguishability.
- **Risk of TS errors cascading from build helper signature change:** every caller site touched in same commit; `tsc --noEmit` on touched files is the gate (per Kyle directive).
- **Risk of behavioral change to classifier output:** zero. The chain math (`baseConf × macroFactor × phaseFactor × ...`) is unchanged. We only restructure WHEN the alternate object is built, not WHAT confidence the classifier returns.
- **Reversibility:** pure code revert. No schema change. If B76 produces unexpected aggregator behavior, revert commit + re-deploy gets back to pre-B76 state in < 5 minutes.

---

## §8. Workflow plan (11 steps)

| Step | Owner | ETA |
|---|---|---|
| 1 | CC drafts scope (this doc) → Langston review | today |
| 2 | CC pre-audit incl. SIM consultation for factor-ablation-emitter + 9 build helpers + dashboard aggregator + replay-ablation | day 1 |
| 3 | CC implementation (single focused PR) | day 1-2 |
| 4 | Langston code-level diff review (pre-push) | day 2 |
| 5 | CC push → CI gate | day 2 |
| 6 | CC SSH staging deploy | day 2 |
| 7 | CC first-pass verify (live ablation row inspection + drift dashboard screenshot) | day 2 |
| 8 | Langston second-pass verify | day 2-3 |
| 9 | Iterate any blockers | day 3 |
| 10 | CC governance updates (Tier 1 mandatory + Tier 2 applicable) | day 3 |
| 11 | CC completion report → Kyle ack → CLOSED | day 3 |

**Hard deadline:** must close before 2026-05-15 so B67.5 has at least one full calibration window (~7d) of trustworthy chain-final data before consumer wiring.

---

## §9. Success criteria (binary)

B76 is CLOSED only when ALL of the following are green in production:

- [ ] All 11 numbered objectives in §4 verified by both CC and Langston.
- [ ] CI all 4 checks green on the merge commit.
- [ ] Live `regime_factor_alternates` rows show `calibrationFrameworkVersion = 'b76_chain_final'` for every new row post-deploy.
- [ ] Drift dashboard factor calibration table shows non-zero shift for `b67_1_macro_modifier` + `b67_2_phase_dimension` post-deploy.
- [ ] Predictive-lift column for previously-measured factors (B68.1/.2/.3 + B67.4) preserves sign and stays within ±1pp of pre-B76 values (sanity check that the refactor didn't change what the framework was already measuring correctly).
- [ ] Governance updated per §4.11; completion report lists every governance file touched.

---

*End of BATCH_76_SCOPE.md rev 1.*
