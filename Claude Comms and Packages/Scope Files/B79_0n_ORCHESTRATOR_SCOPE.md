# B79.0n.ORCHESTRATOR — Scope v1

**Sub-batch:** 12 of 16 in B79.0n umbrella v4 arc (renumbered from #14 after POOL skip 2026-05-27)
**Predecessor:** B79.0n.RTB (#11) CLOSED 2026-05-27 at deploy SHA `6fd6bcac6`
**Successor:** B79.0n.EXECUTION (#13) — paper-execution-engine + sizing + validator threading
**Author:** CC
**Reviewer:** Langston (Step 1.a synthesis + iteration round 2 — ACK GREEN 2026-05-27 12:33Z)
**Status:** v1 — DRAFT for Step 1 review

---

## PREVIOUSLY-STATED-VS-NOW (§9.2 numeric-deltas-must-be-surfaced)

**PREVIOUSLY STATED: ORCHESTRATOR is expected to be "pretty heavy."** Now: narrow scope, 2-3 days. **REASON: prior B79.0n batches (STORAGE/MCE/CONFIDENCE-CHAIN/BATCH_82/PATTERN-DETECT/STRATEGY/RTB/TEC) absorbed most signal-orchestrator + paper-execution-engine threading. Step 1.a probe confirmed via 54 assetClass occurrences in signal-orchestrator.ts already threaded correctly; 14 in paper-execution-engine.ts including the B79.TEC Finding 2 fix at trade-open.**

**PREVIOUSLY STATED: sub-batch count 17 remaining after RTB close.** Now: 5 remaining (ORCHESTRATOR + EXECUTION + WIRE-IN + ML-CALIBRATION + OBSERVABILITY). **REASON: POOL (was #12) SKIPPED 2026-05-27 per Kyle directive — Adaptive Ratio Manager solves a 1500-pairs / 300-slots selection problem that xStock (489 pairs, fast scanner cycle) doesn't have.**

**PREVIOUSLY STATED: F-1 lever audit surface = 5-6 consumer sites.** Now: 2 real swaps + 1 diagnostic + 1 dead-import cleanup. **REASON: Step 1.a refined probe — cost-model.ts:50 and market-regime.ts:45 are ALREADY proper dispatchers per B79.0n.MCE (not class-bound consumers); signal-orchestrator.ts:101 imports 3 symbols but only DEFAULT_ASSET_CLASS is used (other 2 are dead imports).**

---

## §1. Goal

Tie up the asset-class threading loose ends across signal-orchestrator + sizing + SQE so xStock signals stop being routed through hardcoded crypto-bound constants where per-class modules already exist. Clean up the dead Adaptive Ratio Manager instances left by the POOL-batch skip. Add the regression-lock test surface that proves the per-class threading from prior batches actually holds end-to-end. Add a per-class diagnostic endpoint that lets Step 8 second-pass verification confirm the dispatch works at runtime.

**Non-goals:** Building the full F-1 resolver pattern with EXISTS-gated divergence (defer to OBSERVABILITY #16 per Langston SCORING.b disposition); making PaperExecutionEngine per-class (execution is unified by design); active-trading wire-in (that's WIRE-IN #14); cross-class TCL ranking fairness (OBSERVABILITY #16); defense-in-depth weekend-pause at trade-open (upstream SQE handles).

---

## §2. Numbered objectives

| # | Objective | Verification |
|---|---|---|
| OBJ-1 | New dispatcher helper `getPatternPoolGuardrailsForAssetClass(assetClass: AssetClass): PatternPoolGuardrails` at `server/asset_classes/dispatch.ts` with exhaustive switch + `_exhaustive: never` + `[CLASS_NOT_WIRED]` throws for crypto_perp + xstock_perp + explicit return type | Unit test: type-lock with `@ts-expect-error` on missing-class arg; positive call for crypto_spot returns crypto guardrails; positive call for xstock_spot returns xstock guardrails (DB-resolved getters honored); perp classes throw with `[CLASS_NOT_WIRED]` in error message. |
| OBJ-2 | `paper-position-sizing.ts:145` swapped from direct `PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT` read to `getPatternPoolGuardrailsForAssetClass(assetClass).MAX_POSITION_PCT` — sizing function signature gains REQUIRED `assetClass: AssetClass` param threaded from caller | Integration test: xstock_spot pattern signal sized against XSTOCK_PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT (DB-resolved); crypto_spot pattern signal sized against PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT (literal 0.15). |
| OBJ-3 | `signal_quality_evaluator.ts:285` swapped from direct `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR` read to dispatcher call — uses existing `input.assetClass` already on SQE input | Integration test: xstock pattern signal evaluated against XSTOCK_PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR; crypto pattern signal against PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR. |
| OBJ-4 | `routes.ts:12645` dynamic-import diagnostic swapped to dispatcher helper call — returns per-class values when queried with `?assetClass=xstock_spot` query param | UI smoke test via Claude-in-Chrome: endpoint returns correct per-class JSON. |
| OBJ-5 | `signal-orchestrator.ts:101` import line cleaned — keep `DEFAULT_ASSET_CLASS` (still referenced at lines 670+1397), remove unused `PATTERN_POOL_GUARDRAILS` and `PATTERN_POOL_STRATEGIES` | tsc clean; baseline-check stays at 494=494. |
| OBJ-6 | POOL dead-code cleanup in `server/services/asset-class-instances.ts`: delete `ratioManager: AdaptiveRatioManager` field from `AssetClassInstances` interface; delete 3 ARM constructions at lines 144, 167, 183; delete `import { AdaptiveRatioManager }` at line 86 | tsc clean post-removal; 3 test file dispositions per OBJ-7 enforced; existing `b79-0b-asset-class-instances.test.ts` triad-construction tests still pass. |
| OBJ-7 | 3 POOL test file dispositions: (a) `b79-0n-telemetry-arm-injection.test.ts` DELETED; (b) `b79-0a-arm-injection.test.ts` REFACTORED — keep crypto-singleton-fallback test, remove xstock/perp injection tests; (c) `b79-0b-asset-class-instances.test.ts` REFACTORED — remove any `.ratioManager` references (if present) | Per-file diff confirms; vitest passes all preserved tests + new ones from OBJ-1/8. |
| OBJ-8 | Regression-lock unit tests (~10) cover the assetClass-presence contracts on signal-orchestrator + paper-position-sizing + SQE + dispatcher | All pass in vitest; `@ts-expect-error` type-locks compile correctly. |
| OBJ-9 | Regression-lock integration tests (~3) cover end-to-end signal flow with assetClass=xstock_spot — anchor test: AAPLx/USD → signal-orchestrator line 1529 → detectVWAPPullback line 1592 with assetClass=xstock_spot propagated correctly | All pass in vitest; semantic-correctness check confirms upstream assetClass sources don't drift across the cascade. |
| OBJ-10 | New diagnostic endpoint `GET /api/diagnostics/orchestrator-per-class-state` returns 200 + JSON shape per §6.4 — no-auth public (B79.0a pattern) | UI smoke test via Claude-in-Chrome: navigate + read response; perp classes show `CLASS_NOT_WIRED`. |
| OBJ-11 | Local tsc baseline 494 unchanged; baseline-comparison gate passes; all production touches have zero new (file,code) pairs above baseline | `node scripts/check-tsc-baseline.mjs` reports `OK — no regressions above baseline`. |

---

## §3. Locked decisions from Step 1.a iteration with Langston

**C-1 ACK (narrow-scope hypothesis):** ORCHESTRATOR is genuinely narrow today because prior B79.0n batches absorbed most threading. Captured.

**C-2 ACK (F-1 lever audit refined):** Q2(b) hardcoded-import swaps pulled INTO ORCHESTRATOR; Q2(a) full resolver pattern stays deferred to OBSERVABILITY (#16). 2 real swaps + 1 diagnostic + 1 dead-import cleanup. Shadow-data pollution rationale (Langston): OBSERVABILITY consumes shadow data; deferring (b) pollutes that input.

**C-3 ACK (keep ORCHESTRATOR and EXECUTION separate):** Different files, different concerns, cleaner Step 4 review. Only overlapping file is `paper-position-sizing.ts` — ORCHESTRATOR touches lines 29+145 (PATTERN_POOL swap, ~5 LOC); EXECUTION will touch the sizing-core logic (different concerns).

**C-4 ACK (TCL Watchdog stays class-invariant):** Per C-8 §3.4 lock from RTB Step 2. NEW-Q1 "global count, not per-class count" holds.

**C-5 ACK (pre-execution validator stays wildcard):** Per C-8 default-uniform lock. No change in this batch.

**C-6 ACK (dispatcher-helper discipline):** Exhaustive switch + `_exhaustive: never` + `[CLASS_NOT_WIRED]` throws for perp classes + explicit return type. Matches B79.0n.MCE getFrictionForAssetClass pattern.

**C-7 ACK (wrong-value-threaded-correctly probe):** Step 2 pre-audit will explicitly probe whether upstream sources of `assetClass` at different sites in signal-orchestrator drift; regression-lock integration tests must catch semantic-mismatch, not just missing-threading.

---

## §4. Regression-lock test granularity (Langston Q4.1 ACK)

**Unit assertions (~10 tests):**

1. `@ts-expect-error` type-lock that `getPatternPoolGuardrailsForAssetClass(undefined)` fails compile
2. Positive: `getPatternPoolGuardrailsForAssetClass('crypto_spot').FINAL_SCORE_FLOOR === 0.45`
3. Positive: `getPatternPoolGuardrailsForAssetClass('xstock_spot').FINAL_SCORE_FLOOR === <DB value>`
4. Throws: `getPatternPoolGuardrailsForAssetClass('crypto_perp')` matches `/CLASS_NOT_WIRED/`
5. Throws: `getPatternPoolGuardrailsForAssetClass('xstock_perp')` matches `/CLASS_NOT_WIRED/`
6. `paper-position-sizing` signature has `assetClass: AssetClass` REQUIRED (compile assertion)
7. `signal_quality_evaluator.evaluate` already takes `input.assetClass` REQUIRED (regression lock — B79.0n.STORAGE delivered this; preserve)
8. `signal-orchestrator.ts:101` import line excludes `PATTERN_POOL_GUARDRAILS` and `PATTERN_POOL_STRATEGIES` (grep-based assertion via test)
9. `AssetClassInstances` interface has no `ratioManager` field (compile assertion — `keyof AssetClassInstances` excludes 'ratioManager')
10. Diagnostic endpoint `/api/diagnostics/orchestrator-per-class-state` returns 200 + correct shape for all 4 active classes

**Integration assertions (~3 tests):**

1. **Anchor cascade test:** AAPLx/USD enters signal-orchestrator at line 1529 → `assetClass = resolveAssetClass('AAPLx/USD', 'kraken')` returns `'xstock_spot'` → mce.computeContext called with `assetClass='xstock_spot'` → detectVWAPPullback at line 1592 receives `assetClass='xstock_spot'` (semantic-correctness check end-to-end).
2. **Sizing per-class:** xstock pattern signal sized via `paper-position-sizing` → reads `XSTOCK_PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT` (DB value, not crypto's 0.15 literal); crypto pattern signal reads crypto's 0.15 literal.
3. **SQE per-class:** xstock pattern signal evaluated against `XSTOCK_PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR` (DB value, not crypto's 0.45 literal); crypto pattern signal reads crypto's 0.45 literal.

**Wrong-value-threaded-correctly catch:** Integration test 1 catches the upstream-drift case Langston flagged in Q1 refinement — if the assetClass captured at line 1529 differs from the assetClass passed to detectVWAPPullback at line 1592, the test fails even though "presence assertions" would pass.

---

## §5. Step 3 chunked implementation plan

| Chunk | What | Files | Est. LOC | Risk |
|---|---|---|---|---|
| A | New dispatcher helper at `server/asset_classes/dispatch.ts` | new file | ~50 | LOW |
| B | `paper-position-sizing.ts` swap — REQUIRED assetClass + dispatcher call | `server/services/paper-position-sizing.ts` | ~5 swap + ~5 signature | LOW |
| C | `signal_quality_evaluator.ts:285` swap — dispatcher call | `server/core/filters/signal_quality_evaluator.ts` | ~3 swap | LOW |
| D | `routes.ts:12645` diagnostic swap — per-class via dispatcher | `server/routes.ts` | ~10 | LOW |
| E | `signal-orchestrator.ts:101` dead-import cleanup | `server/services/signal-orchestrator.ts` | ~1 line edit | LOW |
| F | POOL ARM cleanup in `asset-class-instances.ts` — 3 construct + interface field + import | `server/services/asset-class-instances.ts` | ~20 net deletions | LOW |
| G | 3 POOL test file dispositions: delete + 2 refactors | `server/tests/unit/b79-0a-arm-injection.test.ts` + `b79-0b-asset-class-instances.test.ts` + DELETE `b79-0n-telemetry-arm-injection.test.ts` | ~30 net edits + 1 delete | LOW |
| H | 10 new unit tests | `server/tests/unit/b79-0n-orchestrator-*.test.ts` (4-5 new files) | ~150 | LOW |
| I | 3 new integration tests | `server/tests/integration/b79-0n-orchestrator-cascade.test.ts` (new) | ~100 | MEDIUM (mocking depth) |
| J | New diagnostic endpoint | `server/routes.ts` (separate addition from D) | ~40 | LOW |
| K | Local tsc + vitest verification | — | — | LOW |

**Total est:** 24-30 hr work over 2-3 days. Net production LOC change: small positive (~50 new dispatcher, ~30 swaps/signature, ~10 endpoint), large negative (~50 dead-code deletions in factory + tests). Test code adds ~250 LOC.

---

## §6. Dispatcher-helper discipline rules (Langston ACK §6)

`server/asset_classes/dispatch.ts` MUST follow these rules:

```typescript
import type { AssetClass } from '../../shared/asset-classes.js';
import { PATTERN_POOL_GUARDRAILS } from './crypto_spot/pattern-pool-filters.js';
import { XSTOCK_PATTERN_POOL_GUARDRAILS } from './xstock_spot/pattern-pool-filters.js';

export interface PatternPoolGuardrails {
  readonly FINAL_SCORE_FLOOR: number;
  readonly MAX_POSITION_PCT: number;
}

/**
 * B79.0n.ORCHESTRATOR: per-asset-class pattern-pool guardrails dispatcher.
 * Mirrors B79.0n.MCE getFrictionForAssetClass pattern.
 *
 * Crypto_spot returns literal constants; xstock_spot returns DB-resolved
 * getters (B79.0n.PATTERN-DETECT pattern). Perp classes throw [CLASS_NOT_WIRED]
 * — there is no pattern pool wired for perpetual futures in this batch arc.
 */
export function getPatternPoolGuardrailsForAssetClass(
  assetClass: AssetClass,
): PatternPoolGuardrails {
  switch (assetClass) {
    case 'crypto_spot':
      return PATTERN_POOL_GUARDRAILS;
    case 'xstock_spot':
      return XSTOCK_PATTERN_POOL_GUARDRAILS;
    case 'crypto_perp':
    case 'xstock_perp':
      throw new Error(
        `[B79.0n.ORCHESTRATOR][CLASS_NOT_WIRED] assetClass='${assetClass}' has no pattern-pool guardrails wired. ` +
        `Pattern-pool gates not configured for perpetual futures in current B79.0n umbrella arc. ` +
        `If activating, add server/asset_classes/${assetClass}/pattern-pool-filters.ts + a case here. ` +
        `See RUNNING_ISSUES for the activation pre-flight checklist.`,
      );
    default: {
      const _exhaustive: never = assetClass;
      throw new Error(`[B79.0n.ORCHESTRATOR][dispatch] unreachable assetClass=${String(_exhaustive)}`);
    }
  }
}
```

**Hard rules:**
1. Exhaustive switch — every AssetClass union member explicitly handled
2. `_exhaustive: never` in default branch — locks compile-time exhaustiveness
3. `[CLASS_NOT_WIRED]` throws for perp classes — explicit, not silent fallback
4. Return type explicitly `PatternPoolGuardrails` — locks shape contract (not inferred)
5. Error messages include batch tag + activation path — Phase 16 / perp-activation deferred work has clear breadcrumbs

---

## §7. Risks + mitigations

| R | Risk | Severity | Mitigation |
|---|---|---|---|
| R-1 | Cleaning dead `PATTERN_POOL_GUARDRAILS` import from signal-orchestrator.ts:101 accidentally strips `DEFAULT_ASSET_CLASS` which IS used at lines 670+1397 | LOW | Chunk E reads the import line carefully + keeps DEFAULT_ASSET_CLASS; unit test #8 asserts the import doesn't include the dead symbols but does include DEFAULT_ASSET_CLASS |
| R-2 | `paper-position-sizing` callers don't yet thread `assetClass` — adding REQUIRED parameter is a compile-error wave across callers | MEDIUM | Step 2 pre-audit enumerates all callers via TypeScript compile-driven probe (same pattern as B79.0n.STORAGE 32→38 caller surface surfacing); §5 Chunk B may grow if more than expected |
| R-3 | xstock pattern signals haven't been observed sizing-against in shadow data yet (per RUNNING_ISSUES #149 cadence-calibration deferred); DB-resolved `XSTOCK_PATTERN_POOL_GUARDRAILS` returns whatever's in module_constants but no calibration evidence | LOW | This batch wires the routing correctly; values can be tuned via DB-only UPDATE later. Note in scope §11 that initial xstock pattern values are placeholder-cloned per B79.0n.PATTERN-DETECT |
| R-4 | Integration test 1 (anchor cascade) requires mocking MCE + strategy detect calls — high mocking depth | MEDIUM | Use existing mock harness patterns from b79-0n-mce-xstock-regime-routing.test.ts; vitest mocks at the @shared/asset-classes resolver layer |
| R-5 | Removing 3 ARM constructions from factory may break order of initialization if any code reads via `Object.keys(triad)` and depends on `ratioManager` being present | LOW | grep-driven search across server/ for `\.ratioManager` confirms only test files reference it (already done in Step 1.a); production has zero reads |

---

## §8. SCAFFOLDING-VS-FUNCTIONAL declaration (§9.1)

🚨 **NO scaffolding-without-functional in this batch.** Every IN-scope objective is fully functional at deploy time:
- Dispatcher helper is called by paper-position-sizing + SQE + diagnostic — not new dead code
- Test surface is functional (vitest passes)
- Diagnostic endpoint returns real data when hit
- POOL cleanup is structural removal, not new scaffolding

The xstock pattern guardrails reading from DB will fire as functional code paths as soon as any xstock pattern signal emerges from scanner. Active-trading impact remains ZERO until WIRE-IN (#16) makes the scanner emit signals into the active path; per-class buckets stay empty until then. But the routing is FUNCTIONAL — exercised by integration test 2 via mocks.

---

## §9. Step 2 pre-audit probes queued (per Langston Q1 refinement)

To be addressed during Step 2:

1. Enumerate ALL callers of `paper-position-sizing` functions — compile-driven probe after Chunk B's REQUIRED-assetClass refactor (per R-2 mitigation)
2. Probe whether signal-orchestrator.ts upstream `assetClass` resolution paths drift between line 670, line 743, line 1397 (Langston Q1 wrong-value-threaded-correctly probe)
3. Confirm `XSTOCK_PATTERN_POOL_GUARDRAILS` DB resolver path is healthy on staging (post-RTB deploy state) — query `module_constants` for `pattern_pool_gates.xstock_spot.*` rows present
4. Probe whether any `from '../asset_classes/crypto_spot/'` import sites I missed in §1 grep have class-bound consumption — full re-grep
5. Confirm the diagnostic endpoint won't conflict with existing routes (search routes.ts for `/api/diagnostics/orchestrator*` and `orchestrator-per-class`)

---

## §10. Crypto regression: NONE BY CONSTRUCTION

Every swap preserves crypto behavior exactly:
- Crypto pattern signals still read literal `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR = 0.45` and `MAX_POSITION_PCT = 0.15` — values unchanged
- Crypto signal flow continues using module-level `adaptiveRatioManager` singleton at `adaptive-ratio-manager.ts:307` — untouched
- Dispatcher helper for crypto_spot returns the same constants the consumers were reading directly before
- POOL cleanup affects only the factory's xstock/perp slots; crypto's singleton path untouched

Only behavioral delta is for xStock signals routing through XSTOCK_PATTERN_POOL_GUARDRAILS (DB-resolved) instead of crypto literals. Active trading is OFF so the behavioral delta is currently observable only in VTS-shadow / scanner cycles.

---

## §11. Step 11 governance preview

When ORCHESTRATOR closes, completion report MUST:
- List all 8 Tier-1/2 docs ACTUALLY edited per Kyle PATTERN-DETECT directive
- Phase 24 "Asset-class onboarding workflow learnings" 4-section block (a/b/c/d) per CLAUDE.md §3.3
- Section earmarking for ASSET_CLASS_ONBOARDING_WORKFLOW.md §4.X — likely **new §4.22 "Per-class consumer-site swap pattern (with-existing-module-shape)"** captures the lesson that "consumer-site swap with existing per-class module" is distinct from "full F-1 resolver pattern with EXISTS-gated divergence" — both are valid F-1 patterns; the former is cheaper and applies when per-class modules already exist.
- POOL test disposition documented: delete `b79-0n-telemetry-arm-injection.test.ts`; refactor `b79-0a-arm-injection.test.ts` (keep crypto portion); refactor `b79-0b-asset-class-instances.test.ts` (remove .ratioManager references)
- Diagnostic endpoint `/api/diagnostics/orchestrator-per-class-state` added to OBSERVABILITY surface inventory
- All 11 OBJ entries verified YES with evidence per CLAUDE.md §2 Step 11

---

## §12. Asks for Langston Step 1 review

Reply with one of:
- **ACK clean** — proceed to Step 2 pre-audit
- **ACK with revisions** — specific scope changes; iterate
- **Push back** — specific objections; we discuss

Specific items I want your confirmation on:

1. **Are the 11 objectives (§2) correctly bounded?** Anything I should add to or remove from the IN scope?
2. **The Step 2 pre-audit probe list (§9.5)** — anything I should add?
3. **Risk severity ratings (§7)** — agree with LOW for most + MEDIUM for R-2 and R-4?
4. **§11 governance preview** — agree the new §4.22 onboarding-workflow section captures the right lesson?

If ACK clean, I proceed directly to Step 2 pre-audit.

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive. This scope file lives at `/home/langston/inbox/b79-0n-orchestrator/B79_0n_ORCHESTRATOR_SCOPE.md` after SCP.
