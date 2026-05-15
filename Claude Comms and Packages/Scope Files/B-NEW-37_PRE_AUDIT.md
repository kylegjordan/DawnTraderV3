# B-NEW-37 — Pre-Audit

**Date:** 2026-05-16
**Branch:** `migration/aws-supabase`
**Scope:** `B-NEW-37_SCOPE.md` (sibling file)

---

## 1. Code-map verification (Explore agent + manual confirmation)

### 1.1 Calibration framework tag

```typescript
// server/services/factor-ablation-emitter.ts:71
export const CALIBRATION_FRAMEWORK_VERSION = 'b76_chain_final' as const;
```
Stamped into every ablation row's `real_decision.metadata.calibrationFrameworkVersion` via `emitAblationRecord`.

### 1.2 Chain composition (multiplication order)

`server/services/signal-orchestrator.ts:679-951` — two-pass architecture:

```
modulatedConfChain = extendedMetrics.confidence                  // PRE-modulation (predictiveConfidenceRaw)
modulatedConfChain *= phasePreference                            // b67_2 — L734-736
modulatedConfChain *= freshness.factor                           // b68_4 — L759
modulatedConfChain *= outcome.factor                             // b67_4 — L776
modulatedConfChain *= volume.factor                              // b68_2 — L800
modulatedConfChain *= pair_corr.factor                           // b68_3 — L846
modulatedConfChain *= multi_tf.factor                            // b68_1 — L894
// b68_5: label counterfactual at L921-928 — NOT multiplied
modulatedConfChain = max(0.4, min(1.0, modulatedConfChain))      // L943-944 final clamp (orchFloor=0.4 default)
```

### 1.3 Pre vs post modulation field origin

```typescript
// server/services/signal-orchestrator.ts:969-977
emitAblationRecord(..., {
  confidence: chainFinalConfidence,           // POST-modulation (line 951)
  metadata: {
    finalScore: extendedMetrics.finalScore,
    regimeWeight: extendedMetrics.regimeWeight,
    sourcePool: rawSignal.metadata?.sourcePool,
    predictiveConfidenceRaw: extendedMetrics.confidence ?? 0.5,  // PRE-modulation
  },
});
```

**Critical:** `real_decision.confidence` (post) vs `real_decision.metadata.predictiveConfidenceRaw` (pre) are both available on every ablation row. Phase 1 of the forensic uses these two fields directly — no re-simulation needed.

### 1.4 Modulator return-value sign conventions

| Modulator | Source | Factor range | Direction (intended) |
|---|---|---|---|
| b67_2 phase preference | `applyPhasePreference()` | 0.4-1.4 | Higher when phase aligns with strategy → boost |
| b67_4 outcome feedback | `OutcomeFeedbackResult.factor` | 0.8-1.2 | Higher when recent outcomes were wins → boost |
| b68_1 multi-TF agreement | `MultiTfAgreementResult.factor` | 0.95-1.05 | Higher when 60m and 240m DBS agree → boost |
| b68_2 volume regime | `VolumeRegimeResult.factor` | 0.90-1.10 | Higher when volume aligns with trade direction → boost |
| b68_3 pair correlation | `PairCorrelationResult.factor` | 0.95-1.05 | Higher when pair correlation supports the trade → boost |
| b68_4 regime age | `FreshnessFactor.factor` | 0.92-1.05 | Higher when regime is younger/fresher → boost |
| b68_5 Path-B sustainability | label-counterfactual | N/A | Gate ON = remove signals that would fail Path-B sustainability test |

**Suspect direction findings (from B-NEW-36 inversion):**
- If `won_mean_factor < lost_mean_factor` for any modulator → that lever is SIGN-FLIPPED in its return value
- b68_5 already shown by B-NEW-36 to have predictive lift = -6.1pp (negative). Phase 3 will confirm whether the gate ON consistently elevates confidence on losers more than winners.

### 1.5 B76 cutover sanity

```markdown
# 1-system-manual/BATCH_CATALOG.md:202 (B76 entry)
Date: 2026-05-06 | Commit: 235237ffd
What shipped: Two-pass stash-then-build + version marker + drift-dashboard-aggregator filter swap
NO FORMULA/WEIGHT/THRESHOLD CHANGE — pure plumbing refactor for calibration accuracy
```

**This confirms the inversion is pre-existing in the chain math, NOT introduced at B76.** B76 just made it analytically visible via the version-tagged rows.

---

## 2. SIM consult: components affected

Reference: `1-system-manual/SYSTEM_IMPACT_MAP.md`

### Components touched by B-NEW-37

| Component | Pre-B-NEW-37 | B-NEW-37 change |
|---|---|---|
| `scripts/b-new-37-inversion-forensics.ts` (NEW) | doesn't exist | One-shot CLI — reads regime_factor_alternates, runs 6-phase forensic analysis, Markdown output |
| `package.json` | b-new-33/b-new-36 entries present | Add `b-new-37:inversion-forensics` script entry |
| `scripts/b-new-36-cohort-diagnostic.ts` | classifyShape() lacks monotonic-down branch | Add monotonic-down detection (Langston Step 8 bonus fix) |
| `regime_factor_alternates` table | read-only | NO WRITES |
| Modulator source files (`signal-orchestrator.ts`, modulator service files) | live | NO CHANGE in this batch (forensics + proposal only; live fix as follow-up if scope allows OR new sub-batch) |
| All consumers of modulated confidence | read decorative chain (pre-B67.5) | NO CHANGE |

### UPSTREAM dependencies

- `regime_factor_alternates` data must be post-B-NEW-33-drain with `predictiveConfidenceRaw` field present. Already verified.
- Modulator services emit `confidence_with_factor` / `confidence_without_factor` in alternate_decision.metadata. Verified from row sample 2026-05-15.

### DOWNSTREAM consumers of forensic findings

- B-NEW-38: stratified B-NEW-33 re-run (will run AFTER the fix lands)
- B67.5 consumer-gate design (blocked through both)

### BLAST RADIUS

**MINIMAL.** Out-of-band CLI; reads existing data; writes nothing to DB. No PM2 restart. NO live code changes in this batch (unless single-line sign flip with Langston blessing).

---

## 3. Sample-data inspection (sanity check before implementation)

Pre-survey one ablation row to verify `predictiveConfidenceRaw` is populated and within expected range:

```sql
SELECT
  factor_name,
  real_decision->>'confidence' AS post_modulation,
  real_decision->'metadata'->>'predictiveConfidenceRaw' AS pre_modulation,
  alternate_decision->'metadata'->>'confidence_with_factor' AS alt_with,
  alternate_decision->'metadata'->>'confidence_without_factor' AS alt_without
FROM regime_factor_alternates
WHERE asset_class='crypto_spot'
  AND replay_outcome IS NOT NULL
  AND replay_outcome->>'outcome' = 'admitted_won'
  AND real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final'
LIMIT 3;
```

To run during pre-audit before final scope ACK.

---

## 4. Test plan

| Test | Type | Pass criterion |
|---|---|---|
| Forensic CLI runs without error | smoke | Exit 0, report written |
| Phase 1 produces pre vs post decile comparison | output | Two side-by-side decile tables; clear shape labels |
| Phase 2 per-modulator factor × outcome | output | 7 sub-tables (b67_2, b67_4, b68_1-4); each shows won/lost mean factor + ratio |
| Phase 3 b68_5 special-case | output | Per-row gate-on vs gate-off delta × outcome cross-tab |
| Phase 4 floor analysis identifies 0.20 floor source | output + code grep | Either trace to a code location OR document "0.20 floor source unknown — requires deeper investigation" |
| Phase 5 legacy vs b76 comparison | output | Side-by-side decile shape per framework, with "same bug different magnitude" verdict |
| Phase 6 per-lever DISABLE test | output | For each lever, "disabling lever X produces decile shape Y" |
| Phase 7 fix proposal | concrete | Single-paragraph proposal with code reference + expected effect on decile curve |
| Bonus: classifyShape() monotonic-down branch | code | `scripts/b-new-36-cohort-diagnostic.ts` diff adds the branch; re-running B-NEW-36 would label b76 cohort correctly |

---

## 5. Estimated work + sequencing

- Step 1 (scope) — DONE
- Step 2 (this pre-audit) — DONE
- Langston review — pending (file-first via inbox)
- Step 3 (impl: CLI + classifyShape fix) — ~3-4h
- Step 4 (Langston code review) — optional, ~10-20 min for the forensic CLI
- Step 5 (CI green) — automatic
- Step 6 (deploy + run) — ~2 min
- Step 7-8 (verification + Langston Step 8 review of findings) — HIGH VALUE step
- Step 10-11 (governance + completion report) — ~1h
- **IF root cause is a single-line sign flip in one modulator: ship the fix in this batch.** Additional ~1-2h for the targeted fix + on-staging verification.

Total CC work ≈ 5-7h forensic + 1-2h potential fix.

---

## 6. Standing rules verified

- Scope file written before implementation: YES
- Pre-audit consults SIM: YES (Section 2)
- Plain-language Kyle summary planned: YES (completion report)
- NO PATCHES doctrine: YES — forensics is structural; fix will be the root-cause fix not a workaround
- Per-asset-class default: crypto_spot only
- Crypto regression check planned: YES (out-of-band CLI; no live impact)
- File-first protocol for Langston ask (>3KB): YES — scope + pre-audit ≈ 14KB total; will scp to inbox

---

## 7. Open questions deferred to Langston review

Same Q1-Q5 listed at the end of `B-NEW-37_SCOPE.md` §8.
