# B-NEW-42b — Price-Discontinuity Detector (TEC split/halt/ex-dividend resilience)

**Batch ID:** B-NEW-42b
**Type:** Hotfix batch spawned by B-NEW-42 DIRTY verdict (per scope §2.4 fork). Adds new sentinel module + TEC integration; inverts B-NEW-42 regression-test assertions.
**Author:** Claude Code
**Date:** 2026-05-17
**Branch:** `migration/aws-supabase`
**Parent batch:** B-NEW-42 (Phase 0 audit) — DIRTY verdict, three gaps confirmed.
**Plan reference:** xStock Calibration Plan §0 Gate decision; precedes Phase A.

**Revision history:**
- **rev1** (initial draft) — 2026-05-17
- **rev2** (Langston round-1 review absorbed) — 2026-05-17. Four changes per `B_NEW_42B_scope_review_rev1_reply.md`:
  1. §2.2.3 — added silent-disable guardrail (variant a: detector-level asset-class assertion with fail-safe-skip on missing prevPrice).
  2. §2.1.1 — added state machine sketch (IDLE / DISCONTINUITY_ACTIVE / CLEARING) with 5min hard-ceiling timeout + edge-case resolutions.
  3. §4 risk register — reworded ex-dividend calendar refresh: first alert hand-scheduled at calendar-seed creation; each refresh schedules the next (no dependency on B-NEW-40 recurring-alert capability that doesn't exist yet).
  4. §5 — added `ADJUSTMENT_FRAMEWORK.md` to files-touched list for the new per-asset-class behavioral knobs.
  5. §5 — VTS runner now specifies `server/services/vts-runner.ts` (pre-audit Step 2 verifies HEAD location).
  6. §6 — added optional calendar-staleness sanity test (Langston minor nit).

---

## §1 Background

B-NEW-42 confirmed three structural TEC gaps via regression test:

1. **Forward-split price discontinuity** — TEC fires stop on synthetic 50% drop.
2. **Reverse-split price discontinuity** — TEC phantom-promotes to TRAILING_TAKE on synthetic 2× jump.
3. **Halt resume gap** — TEC clamps exit to pre-halt stop on post-halt visibility-return gap-down through stop, booking an unfillable PnL.

**Operational urgency split (Langston verdict-check-in 2):**

- **Halt-resume gap is undefended today.** Intra-RTH halts happen on individual names; the existing `isXstockMarketOpenUTC` weekend gate (B79.0L) provides NO defense during the open window. 462 candidate halt-with-resume-gap events observed in 7-day archive (avg 66/day, max 4.6% magnitude on EDU/USD). **This is the load-bearing fix.**
- **Corp-action exposure narrowed by weekend gate.** Splits are almost always overnight-effective; the weekend gate IS a real partial defense. Still required because the gate doesn't help on the rare intra-week effective-date case and doesn't address the structural correctness issue. **Secondary in same batch (Langston rev1 §2: don't split into B-NEW-42c).**
- **Ex-dividend posture undefined in interim.** Phase D is N weeks out. Defer-to-Phase-D leaves a real-money risk window on div-paying names. **Curated calendar option (i) — hand-maintained 60-entry JSON for the 15 known div payers until Phase D auto-calendar lands.**

Per Langston verdict-check-in 3: **single sentinel module** consumed by TEC via one gate site. Renamed from `corporate-action-detector.ts` to **`price-discontinuity-detector.ts`** so the concern-name reflects what it does (skip stop check on price discontinuity), not what causes the discontinuity. Extensible to ex-dividend later in same module.

---

## §2 Objectives

### 2.1 Build `server/services/price-discontinuity-detector.ts` (NEW)

Single sentinel module exporting:

```typescript
export type DiscontinuityKind = 'halt_resume_gap' | 'corp_action' | 'ex_dividend';

export interface DiscontinuityResult {
  active: boolean;
  kind?: DiscontinuityKind;
  details?: {
    prevPrice?: number;
    currentPrice?: number;
    prevTs?: Date;
    currentTs?: Date;
    gapSeconds?: number;
    priceChangePct?: number;
    knownExDate?: string;
  };
  clearedAt?: Date;  // for halt-resume: when the next confirming tick lands
}

export function isDiscontinuityActive(
  symbol: string,
  prevPrice: number | null,
  currentPrice: number,
  prevTs: Date | null,
  currentTs: Date,
): DiscontinuityResult;
```

#### 2.1.1 Halt-resume gap detection (PRIMARY — load-bearing fix)

**Trigger:** `gapSeconds > 300 AND |priceChangePct| >= 0.5%` (matches B-NEW-42 §2.3.1 audit threshold).

**State machine (Langston rev1 #2):** three explicit states with hard ceiling timeout.

```
        ┌─────────┐
        │  IDLE   │ ← initial state; isDiscontinuityActive returns {active: false}
        └────┬────┘
             │ tick arrives where gapSeconds > 300 AND |Δ%| >= 0.5%
             ▼
        ┌─────────────────────┐
        │ DISCONTINUITY_ACTIVE│ ← isDiscontinuityActive returns {active: true, kind: 'halt_resume_gap'}
        └────┬────────────────┘
             │ next tick within HARD_CEILING (300s/5min) AND |Δ%| < 0.5% from resume price
             ▼
        ┌─────────────────────┐
        │     CLEARING        │ ← isDiscontinuityActive returns {active: false, clearedAt: <now>}
        │ (1-tick confirming) │   stays in CLEARING for one more cycle, then auto-transitions to IDLE
        └─────────────────────┘

Hard ceiling: if HARD_CEILING (300s) elapses in DISCONTINUITY_ACTIVE without a confirming tick,
the detector auto-clears to IDLE (defensive timeout — if Kraken's WS drops entirely after the resume tick,
we don't want positions pinned forever in detector-active state).
```

**Edge case resolutions:**
- Next tick at t+35s (past 30s tolerance, before 5min ceiling): if |Δ%| < 0.5% → transitions CLEARING (the 30s default is a *preferred* confirming-tick window; the 5min ceiling is the hard limit).
- Next tick at t+5s with |Δ%| = 0.6%: stays DISCONTINUITY_ACTIVE. Each subsequent tick re-evaluates the |Δ%| against the resume price; only transitions to CLEARING when a tick lands within tolerance.
- WS drop entirely after resume tick: HARD_CEILING (5min) auto-clears to IDLE, preventing indefinite pin.

**Per-symbol state** persisted in `Map<symbol, DetectorState>` in-process. Cleared on `clearTrailingState(tradeId)` if the trade is the only one referencing the symbol (so detector state doesn't leak across closed trades).

**Justification for thresholds (Langston verdict-check-in 4d):** start at the same `>5min + ≥0.5%` audit threshold. False-positive-skip (briefly delaying a real stop on a legitimate price drop) is operationally acceptable; false-negative-unfillable-fill (firing stop on visibility-return) is not. Err tight. Per-asset-class config via `module_constants.price_discontinuity_detector.*` for future tuning (catalogued in `ADJUSTMENT_FRAMEWORK.md` per Langston rev1 #4).

#### 2.1.2 Corporate-action discontinuity detection (SECONDARY)

**Trigger:** `|priceChangePct| >= 40%` in a single bar (matches B-NEW-42 §2.1 threshold of ratio <0.6 OR >1.6).

**Behavior:** returns `{ active: true, kind: 'corp_action' }`. Persisted for 24 hours (configurable) — long enough that subsequent operating cycles still see the flag. Cleared automatically by TTL OR by an explicit `adjustment_factor` metadata key landing in a future Kraken WS feed surface (per audit §1.2 open-question for Phase A.1).

#### 2.1.3 Ex-dividend curated calendar (INTERIM POSTURE — replaces Phase D auto-calendar)

**Static seed:** `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` (NEW). Hand-curated entries for the 15 known div-paying symbols: KO, JNJ, PG, XOM, CVX, JPM, BAC, T, VZ, MCD, HD, WMT, MMM, IBM, MO. Each entry: `{ symbol, ex_dates: ['YYYY-MM-DD', ...] }`. ~4 quarterly dates × 15 symbols = ~60 entries to maintain manually until Phase D.

**Trigger:** within 1-2 hours of US market open (9:30 ET → 11:30 ET) on a known ex-date for the given symbol.

**Behavior:** returns `{ active: true, kind: 'ex_dividend', details: { knownExDate } }`. Cleared at 11:30 ET on the ex-date.

**Phase D handover:** when Phase D's auto-calendar feed source (Yahoo Finance) lands, the curated JSON loader is swapped for the feed adapter; consumer-side TEC code unchanged.

### 2.2 TEC integration (one gate site per concern)

#### 2.2.1 `shouldClosePosition` gate

```typescript
// In trailing-exit-controller.ts:1326
export function shouldClosePosition(tradeId: string, currentPrice: number, prevPrice?: number, prevTs?: Date, currentTs?: Date): boolean {
  const state = trailingStates.get(tradeId);
  if (!state) return false;

  // B-NEW-42b: short-circuit stop check during a price discontinuity.
  if (state.symbol) {
    const discontinuity = isDiscontinuityActive(state.symbol, prevPrice ?? null, currentPrice, prevTs ?? null, currentTs ?? new Date());
    if (discontinuity.active) {
      console.log(`[B-NEW-42b][TEC_DISCONTINUITY_SKIP_STOP] ${state.symbol} kind=${discontinuity.kind} — deferring stop check`);
      return false;
    }
  }

  return currentPrice <= state.currentStopPrice;
}
```

#### 2.2.2 Target-lock gate (within `updatePosition`)

Same pattern in the `isTargetLockTriggered` branch — short-circuit on `active: true` to prevent phantom-promotion to TRAILING_TAKE on reverse-split jumps.

#### 2.2.3 Caller-side `prevPrice` / `prevTs` propagation

The detector requires the previous tick (price + timestamp) to compute `gapSeconds` and `priceChangePct`. Callers (paper-execution-engine, VTS runner, tec-evaluator) need to pass these — they already have the data in their per-trade per-tick context. Plumbing scope: add optional params to `shouldClosePosition` and `updatePosition` for back-compat with crypto callers.

**Silent-disable guardrail (Langston rev1 #1, variant (a) selected — fail-safe-skip):**

The detector enforces an asset-class assertion: if `isXstockSymbol(symbol) === true AND prevPrice === undefined` then it **logs an error** (`[B-NEW-42b][DETECTOR_MISSING_PREV_TICK]`) and **returns `{ active: true, kind: 'caller_plumbing_gap' }`** — i.e. it conservatively treats the missing context as "unknown discontinuity status, fail safe by skipping the stop check."

This is the fail-safe-skip posture aligned with §2.1.1's "false-positive-skip acceptable, false-negative-unfillable-fill not." Cost: small log surface during cold-start when prev-tick context isn't yet populated (one log per symbol per cold start; capped via per-symbol logged-once mechanism).

**Why variant (a) over CI-grep gate (variant b):** the grep gate is cheaper to maintain but easier to bypass (a new caller site added in a future batch wouldn't trigger the gate without a discipline-dependent code-review catch). The asset-class assertion in the detector itself is enforced at runtime and cannot be silently bypassed.

**Crypto-path back-compat:** the assertion only fires when `isXstockSymbol(symbol) === true`. Crypto symbols pass through as `{ active: false }` regardless of whether `prevPrice` is provided — preserves crypto regression-test green-state.

### 2.3 Regression-test assertion inversion

For each of the 3 gap-documenting assertions in `b-new-42-tec-*-resilience.test.ts`:

- **Before:** `expect(postSplit.shouldExit).toBe(true);` (documents bug)
- **After:** `expect(postSplit.shouldExit).toBe(false);` (verifies fix)

Add new sanity assertions: discontinuity-cleared confirming tick → stop check resumes correctly.

### 2.4 SYSTEM_IMPACT_MAP increment

Add SIM entry for `price-discontinuity-detector` (NEW component):
- File, purpose, upstream (TEC, optionally B79.TEC config-cache for thresholds), downstream (TEC's `shouldClosePosition` + target-lock).
- Document upstream-feeder relationship from caller-side `prevPrice` / `prevTs` propagation.
- Update TEC SIM entry: cross-link to new dependency.

---

## §3 Sequencing within batch (per Langston verdict-check-in 2)

1. **Halt-detector first.** Build `price-discontinuity-detector.ts` with only the `halt_resume_gap` kind. Wire to TEC's `shouldClosePosition`. Invert the halt-resilience test assertion. Green-test. **Halt fix shipped as a working unit by end of day 1.**
2. **Corp-action discontinuity flag added.** Add the second `kind` flag in the same module. Invert split-resilience tests. **Both forward + reverse split fixes shipped.**
3. **Ex-dividend curated calendar.** Add the static-seed loader + `ex_dividend` flag. Seed the 60-entry initial JSON. No test assertion changes (no regression test exists for ex-div behavior; documented as a Phase D follow-up).
4. **TEC integration polish.** Caller-side `prevPrice` / `prevTs` plumbing through paper-execution-engine, VTS runner, tec-evaluator.

**Halt fix is not gated on corp-action or ex-div completion** — each step is independently shippable. Sequence within the same batch's commit history; do not split into multiple batches.

---

## §4 Risk register (per Langston verdict-check-in 4 items a-e)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **(4a) Pass B deferral conflation in audit** | Medium | Audit understates intra-bar discontinuity risk for mid-session corp-actions | This batch's sentinel triggers on `>=40%` single-bar regardless of when in the day; intra-bar coverage is structural, not archive-window-dependent. Restate in audit/completion-report as "accepted residual uncertainty, intra-bar discontinuities unscanned" — fix coverage doesn't depend on the archive completeness. |
| **(4b) No archived intra-RTH halt+gap event** | High (already true) | Structural fix designed against assumption that Kraken can resume with a gap during RTH, not archive-observed-during-RTH proof | One-line acknowledgement in scope §1: structural fix correct, empirical RTH-window grounding is absent — risk-acknowledged. The 462 archived non-RTH gaps demonstrate the BEHAVIOR is structural; the absence of intra-RTH events in 7 days doesn't refute the structural correctness of the fix. |
| **(4c) Dividend interim posture undefined** | Medium | Real-money risk window between B-NEW-42b ship and Phase D auto-calendar | Curated JSON option (i) adopted. ~60 entries × 15 symbols quarterly. Phase D handover swaps loader without consumer change. |
| **(4d) Sentinel threshold mis-calibration** | Low | False-negative (unfillable fill) — bad. False-positive (briefly delayed stop) — acceptable. | Start at audit threshold `>5min + ≥0.5%` (err tight). Per-asset-class config via `module_constants.price_discontinuity_detector.*` for future tuning. Tuning a Phase E concern, not B-NEW-42b. |
| **(4e) Test-mock silent rot on weekend CI** | Low | Mock removed in cleanup → tests silently no-op via market-hours gate | Multi-line comment at top of each test file explaining mock purpose + removal failure mode (already applied to b-new-42 tests post-verdict). B-NEW-42b assertion inversion preserves the comment block. |
| **Crypto-path regression from caller-side plumbing** | Low | `shouldClosePosition`/`updatePosition` signature change to add optional params could break crypto callers if defaults aren't right | New params are optional with `undefined` default → detector returns inactive → crypto behavior unchanged. Pre-existing crypto regression tests (b65-tec-parity, b80-tec-per-trade-keying) must remain green. CI gate. |
| **Ex-dividend curated-calendar drift** | Medium | Hand-maintained JSON could go stale; missed ex-date = real-money exposure | Initial 60 entries cover Q3 + Q4 2026 (6 months ahead). **Refresh-alert scheduling (Langston rev1 #3 reword):** first refresh alert hand-scheduled at calendar-seed creation (30 days before next quarter's first ex-date). Each subsequent refresh batch schedules the NEXT one in the same operation. Recurring-alert capability is "future batch" per CLAUDE.md §10.5; we don't depend on it. |

---

## §5 Files Touched

**NEW:**
- `server/services/price-discontinuity-detector.ts` — sentinel module.
- `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` — curated ex-date calendar (interim).
- `server/tests/unit/b-new-42b-price-discontinuity-detector.test.ts` — module-level tests (clearing logic, threshold edge cases, per-kind behavior).

**MODIFIED:**
- `server/services/trailing-exit-controller.ts` — integrate detector at `shouldClosePosition` + target-lock sites. Add optional `prevPrice` / `prevTs` / `currentTs` params.
- `server/services/tec-evaluator.ts` — propagate prev-tick context to TEC calls.
- `server/services/paper-execution-engine.ts` — pass prev-tick context.
- `server/services/vts-runner.ts` (or VTS runner at its current HEAD location — verify in pre-audit Step 2) — pass prev-tick context.
- `server/tests/unit/b-new-42-tec-split-resilience.test.ts` — invert 2 assertions (forward + reverse split fix verifications).
- `server/tests/unit/b-new-42-tec-halt-resilience.test.ts` — invert 1 assertion (post-resume-gap fix verification).
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — add price-discontinuity-detector entry + cross-link from TEC.
- `1-system-manual/ADJUSTMENT_FRAMEWORK.md` (Langston rev1 #4) — catalogue new per-asset-class behavioral knobs: `module_constants.price_discontinuity_detector.{halt_gap_seconds_threshold, halt_pct_threshold, halt_clearing_window_seconds, halt_hard_ceiling_seconds, corp_action_pct_threshold, corp_action_ttl_seconds}`. Defaults match starting values per scope §2.1; tunable as Phase E calibration concern.
- `1-system-manual/SYSTEM_MANUAL.md` — update Corporate Actions + Trading Halts subsections (move from "audit findings" to "fix shipped, here's how it works").
- `1-system-manual/CHANGES_AND_FIXES.md` — BUG-2026-05-17-X (the fix entry; gap-discovered entry already lands under B-NEW-42).
- `1-system-manual/POST_AUDIT_ROADMAP.md` — ex-dividend curated-calendar → Phase D auto-calendar handover note.
- `1-system-manual/BATCH_CATALOG.md` — B-NEW-42b row.
- `1-system-manual/PHASE_HISTORY.md` — xStock calibration Phase 0 entry update (DIRTY closed, fix shipped, Phase A unblocked).
- `.claude/memory/MEMORY.md` (truth + repo mirror).

---

## §6 Verification Criteria

| # | Objective | YES/NO/PARTIAL Verification |
|---|---|---|
| 2.1.1 | Halt-resume-gap detector triggers correctly | `b-new-42b-price-discontinuity-detector.test.ts` halt-detection test scenarios green (gap-trigger + clear-on-confirming-tick + threshold edge cases). |
| 2.1.2 | Corp-action discontinuity detector triggers correctly | Same test file, corp-action scenarios green (>40% trigger, 24h TTL). |
| 2.1.3 | Ex-dividend curated calendar loads + triggers | JSON-load test + simulated-current-date trigger test green. |
| 2.2.1 | `shouldClosePosition` consumes detector | b-new-42-tec-halt-resilience post-resume-gap test now asserts `shouldExit=false` (assertion inverted, post-fix green). |
| 2.2.2 | Target-lock consumes detector | b-new-42-tec-split-resilience reverse-split test now asserts `modeChanged=false` (assertion inverted, post-fix green). |
| 2.2.3 | Caller-side prev-tick propagation lands without crypto regression | b65-tec-parity + b80-tec-per-trade-keying tests remain green. CI 4 checks green. |
| 2.3 | All B-NEW-42 regression-test assertions inverted to verify fix | All 3 inversions green; pre-existing 3 passing tests (PAUSE / STALE-STREAM / SANITY) still green. |
| 2.4 | SIM increment for price-discontinuity-detector | New SIM entry exists with upstream/downstream/blast-radius. Cross-link in TEC entry. |
| 2.5 | Calendar-staleness sanity test (Langston rev1 minor nit, optional but adopted) | Add a unit test asserting `dividend-calendar-seed.json` contains ≥ 1 entry with `ex_date` in the next 60 days from runtime. Belt-and-suspenders against drift-without-alert-fire. |

---

## §7 Sequencing — gates B-NEW-42b → Phase A unblock

When B-NEW-42b closes successfully:
- B-NEW-42 audit-report verdict moves from DIRTY → resolved.
- xStock Calibration Plan Phase 0 closes.
- **Phase A.2 implementation unblocks** (Phase A.1 design call may have been running in parallel).
- POST_AUDIT_ROADMAP + PHASE_HISTORY reflect Phase 0 closure.

---

## §8 Estimated Effort

- Step 1 scope (this doc) + Langston review: 0.5 day (today)
- Step 2 pre-audit: 0.5 day
- Step 3 implementation: 2-3 days (detector module + TEC integration + caller-plumbing + curated calendar seed)
- Step 4 Langston code review: 0.5 day (code-level diff review)
- Steps 5-8 CI + deploy + verification: 0.5 day
- Steps 10-11 governance + completion report: 0.5 day

**Total nominal: 4-5 days.**

---

— Claude Code, 2026-05-17
