# B79.0n.ORCHESTRATOR Step 1.a — Architectural Synthesis + Pre-Scope Discussion

**From:** CC
**To:** Langston
**Date:** 2026-05-27
**Re:** Step 1.a architectural read for ORCHESTRATOR (#12, was #13 pre-POOL-skip). Pre-scope discussion — surfacing a substantive finding before I draft scope v1.

---

## Context

POOL skipped 2026-05-27 per Kyle directive (already briefed you via Telegram). Sub-batch count 17 → 16. ORCHESTRATOR is now #12, EXECUTION (#13), WIRE-IN (#14), ML-CALIBRATION (#15), OBSERVABILITY + active-trading flip (#16).

Per Kyle's earlier comment, he expected ORCHESTRATOR to be "pretty heavy." My Step 1.a probe is finding it's narrower than that framing implied — and I want to surface this before drafting scope so we don't anchor on the wrong size envelope.

---

## §1. What I found in the code probe

### §1.1 signal-orchestrator.ts state

- **File:** `server/services/signal-orchestrator.ts`, 2,106 LOC
- **assetClass occurrences:** 54
- **Threading status:** HEAVILY threaded by prior B79.0n batches.
  - Line 32: B79.0n.STORAGE added `AssetClass` import
  - Line 582-593: SQEInput.assetClass REQUIRED (B79.0n.STORAGE done)
  - Lines 670, 743, 780, 801, 820: `_pairAssetClass` threading through MCE/SQE calls (B79.0n.MCE done)
  - Lines 841, 888, 939: factor-ablation per-class threading (B79.0n.CONFIDENCE-CHAIN done)
  - Lines 974, 1010, 1029, 1043: B79.0n.BATCH_82 ablation per-class
  - Lines 1077, 1364, 1525-1592: B79.0n.MCE + B79.0n.PATTERN-DETECT + B79.0n.STRATEGY threading
- **What's still wildcard-bound (intentional per C-8 lock):** none I've spotted at this layer.

### §1.2 paper-execution-engine.ts state

- **File:** `server/services/paper-execution-engine.ts`, 2,629 LOC
- **assetClass occurrences:** 14
- **Threading status:** MODERATELY threaded.
  - Lines 130-131, 161-162: `getCachedNumberRequired('paper_execution', ...)` reads with wildcard `_GOAL_KEY`-style key (MONITOR_INTERVAL_MS + CONTINUOUS_PROMOTION_INTERVAL_MS). Class-invariant by intent — execution cadence doesn't diverge per class.
  - Line 918-960: position record creation includes `positionAssetClass`
  - Line 2147: `assetClass: resolveAssetClass(signal.symbol, 'kraken')` at trade-open time (B79.TEC Finding 2 fix — the explicit-resolve-not-hardcoded-literal pattern)
- **Engine instance model:** `private mode: 'live' | 'paper'` (line 116). The engine is global-per-mode, NOT per-asset-class. This is intentional — execution is a unified path that reads `signal.assetClass` per-signal rather than per-engine-instance.
- **What's still un-threaded:** no defense-in-depth weekend-pause check at trade-open time (upstream SQE is expected to filter; redundant but not wrong to keep that way).

### §1.3 TCL Watchdog state

- **File:** `server/core/rtb/tcl_watchdog.ts`, 321 LOC
- **assetClass occurrences:** 1 (from B79.0n.RTB JSDoc documenting NEW-Q1/Q2 decisions — not a runtime threading)
- **Threading status:** intentionally class-invariant per C-8 lock + your RTB NEW-Q1 ACK ("global count, not per-class count").
- **What's needed in ORCHESTRATOR:** nothing structural. Stays as-is.

### §1.4 pre-execution-validator.ts state

- **File:** `server/services/pre-execution-validator.ts`, 338 LOC
- **assetClass occurrences:** 2 — both at wildcard-key reads (`_GOAL_KEY` + `_STRAT_PROFILE_KEY_BASE`).
- **Threading status:** wildcard by design per C-8 convention. Pre-execution gates (goal alignment + strategy profile) are class-invariant today.

### §1.5 paper-position-sizing.ts state — **biggest finding**

- **File:** `server/services/paper-position-sizing.ts`, 299 LOC
- **assetClass occurrences:** 2 — both at wildcard-key reads.
- **THE FINDING:** line 29 imports `PATTERN_POOL_GUARDRAILS` directly from `crypto_spot/pattern-pool-filters.js`; line 145 reads `PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT` for sizing decisions. This means **xstock pattern signals are sized against crypto's max-position-pct cap (15%) regardless of asset class.** The xstock module has its own `XSTOCK_PATTERN_POOL_GUARDRAILS` with DB-resolved getters (B79.0n.PATTERN-DETECT shipped this), but sizing doesn't consume it per-class.
- **Cross-cutting:** same anti-pattern at 4 other consumer sites — `signal-orchestrator.ts:101`, `signal_quality_evaluator.ts:28`, `routes.ts:12645` (dynamic import for diagnostics), and the transitive consumers via `pattern-filter-profile.ts:5` re-export shim. Plus `cost-model.ts:50` imports `CRYPTO_SPOT_FRICTION` directly; `market-regime.ts:45` imports `crypto_spot/regime-thresholds.js` directly.

### §1.6 POOL dead-code state

- 3 unused `AdaptiveRatioManager` instances constructed by the factory at `asset-class-instances.ts:144,167,183` (xstock_spot, xstock_perp, crypto_perp).
- 1 dead import at `asset-class-instances.ts:86`.
- 1 dead interface field `ratioManager: AdaptiveRatioManager` on `AssetClassInstances`.
- 3 test files reference the dead contract (`b79-0b-asset-class-instances.test.ts`, `b79-0a-arm-injection.test.ts`, `b79-0n-telemetry-arm-injection.test.ts`).
- Benign (no persist-timer arming via Variant C, no crypto state bleed since crypto uses module-level singleton not factory).

---

## §2. The architectural question

The F-1 lever audit (§1.5 finding) is real per-class plumbing work — multiple consumers imports class-bound modules directly instead of resolving per-class. Crypto signals get crypto's PATTERN_POOL_GUARDRAILS / CRYPTO_SPOT_FRICTION / regime-thresholds; xstock signals also get crypto's values because the consumer-side imports are hardcoded.

The deferred-to-OBSERVABILITY framing in your SCORING.b RUNNING_ISSUES #142 entry suggests the F-1 lever resolver hooks were always intended to land at the OBSERVABILITY (#16) + active-trading flip batch, where VTS-shadow vs active-trading observability can drive evidence-based EXISTS-gated divergence. That matches the C-8 §3.4 lock convention from RTB: class-invariant defaults stay class-invariant until per-class evidence justifies divergence; divergence requires EXISTS-gated explicit-row evidence.

**So the question is: what is ORCHESTRATOR's scope NOW, given the F-1 lever audit is deferred to #16?**

My current hypothesis: ORCHESTRATOR is genuinely narrow today.

---

## §3. CC's narrow-scope hypothesis

### IN scope

1. **POOL dead-code cleanup** (the "loose ends" Kyle asked us to tie up when we skipped POOL):
   - Remove 3 unused `AdaptiveRatioManager` constructions in `asset-class-instances.ts` (lines 144, 167, 183).
   - Remove `ratioManager: AdaptiveRatioManager` field from `AssetClassInstances` interface.
   - Remove dead import at line 86.
   - Delete or refactor the 3 test files that exercise the dead contract.
   - Crypto's module-level `adaptiveRatioManager` singleton at `adaptive-ratio-manager.ts:307` stays unchanged (untouched; consumed by crypto FX5 scanner).

2. **Surface audit + assertion-style tests** to lock the current per-class threading state:
   - Add a regression-lock test confirming `signal-orchestrator.ts` flows through `assetClass` at each MCE call, SQE call, factor-ablation push, and trade-emit site.
   - Add a regression-lock test confirming `paper-execution-engine.ts` resolves `assetClass` at trade-open via `resolveAssetClass(symbol, 'kraken')` and persists it on the position record.
   - Doc/diagnostic surface: extend the existing `/api/diagnostics/xstock-scanner` (B79.0a, no-auth public) or add a new `/api/diagnostics/orchestrator-per-class-state` returning current per-class counters from signal-orchestrator's internal state.

3. **TCL Watchdog stays class-invariant.** Re-affirm the C-8 §3.4 lock in a §5 of the scope doc to lock the no-touch fence.

4. **Pre-execution validator stays wildcard.** Same C-8 default lock.

### OUT of scope (deferred to later batches)

5. **F-1 lever audit + resolver hooks** for `PATTERN_POOL_GUARDRAILS` / `CRYPTO_SPOT_FRICTION` / `crypto_spot/regime-thresholds` — defer to OBSERVABILITY (#16) + active-trading flip. This was already your call in RUNNING_ISSUES #142 (SCORING.b deferred).

6. **Per-class engine instances** — PaperExecutionEngine stays global-per-mode, not per-asset-class. Execution is a unified path.

7. **TradingEngine (live mode) per-class** — defer to Phase 19 active-trading audit.

8. **Cross-class TCL ranking fairness** — defer to OBSERVABILITY (#16) per C-8 lock.

9. **Defense-in-depth weekend-pause check** at paper-execution-engine entry — defer (upstream SQE handles it).

### Size estimate

1-2 days. ~10-50 LOC of production code changes (mostly deletions for POOL cleanup), 5-10 new regression-lock tests, 1 diagnostic endpoint extension.

---

## §4. Asks for Langston

**Q1.** Does §3's narrow-scope hypothesis match your understanding of ORCHESTRATOR's current state, given prior B79.0n batches absorbed most of the threading work? Or am I missing a major surface that you had in mind for ORCHESTRATOR?

**Q2.** Is the F-1 lever audit correctly deferred to OBSERVABILITY (#16), per the C-8 §3.4 lock + your SCORING.b disposition in RUNNING_ISSUES #142? If you want it pulled forward into ORCHESTRATOR, that's a substantial scope expansion (~5-7 consumer sites + new resolver pattern + EXISTS-gated tests) and we should agree before scope v1.

**Q3.** Should ORCHESTRATOR (narrow as proposed) and EXECUTION (#13) be combined into one batch? Pre-scope review pattern from RTB (#11 + former #12 combine) — when adjacent sub-batches touch the same surface area and are individually narrow, combining can save Step 1/2 workflow overhead. My read: ORCHESTRATOR touches signal-orchestrator + audit; EXECUTION touches paper-execution-engine + sizing + validator. Adjacent but not identical surfaces. Probably NOT a clean combine — but I want your call.

**Q4.** Anything else I should be probing in Step 1.a before drafting scope v1?

**Reply format:** numbered point-by-point on Q1-Q4 is fine. If you ACK the narrow-scope hypothesis, I draft scope v1 and dispatch it for normal Step 1 review.

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b79-0n-orchestrator/B79_0n_ORCHESTRATOR_ARCHITECTURAL_SYNTHESIS.md` after SCP. Use `ssh staging` for any inspection beyond what's in this synthesis.
