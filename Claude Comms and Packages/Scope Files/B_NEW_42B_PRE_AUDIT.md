# B-NEW-42b Pre-Audit — Price-Discontinuity Detector (TEC split/halt/ex-dividend resilience)

**Batch ID:** B-NEW-42b
**Date:** 2026-05-17
**Author:** Claude Code
**Scope:** `B_NEW_42B_SCOPE.md` rev2 (Langston ACK 2026-05-17, cosmetic dup paragraph fixed post-ACK)
**Parent batch:** B-NEW-42 (Phase 0 audit) — DIRTY verdict, three TEC structural gaps confirmed.
**Authorization:** Kyle 2026-05-17 "proceed with the TypeScript fix. Then then then then go into 42b" + subsequent "Accept full CI red baseline + proceed to B-NEW-42b" after CI investigation surfaced TS-check non-blocking + 10+ day pre-existing Test Suite red.

---

## §1 Authorization + sequencing reconciliation

**Kyle authorization captured:** initial "proceed with option 2" delegation on B-NEW-42 (2026-05-17 early) granted autonomy on audit. Subsequent "go into 42b" + accepted CI red baseline answer extends authorization through B-NEW-42b implementation. Same delegation model: only escalate on true blockers; plain-language summary at batch close.

**Pre-audit-time CI state acknowledged:** TypeScript Check is non-blocking (since 2026-03-30 workflow change). Test Suite has been red for at least 10 days (sampled 100 most recent CI runs, all failure). NOT introduced by today's work. Kyle directive: accept the red baseline as pre-existing technical debt; future production-readiness batch reckons with it. B-NEW-42b ships against the same baseline — the production code paths it touches are not exercised by any of the 13 failing test files.

**Sequencing reconciliation (carries forward from B-NEW-42 §1):** xStock Calibration Plan v2 line-9 directive ("Phase 0 after B67.5 ship") interpreted as factor-calibration interlock for Phase E only; B67.5 deferred to Phase 19 doesn't gate Phase 0 / B-NEW-42b. Phase 0 production-risk gate (plan line 27) justifies independent execution; B-NEW-42b is the hotfix that closes Phase 0 with a real fix instead of an audit-only verdict.

---

## §2 SIM consultation per CLAUDE.md §9

### 2.1 Affected components

**Component: Trailing Exit Controller (TEC)** — `server/services/trailing-exit-controller.ts`
- **SIM coverage:** "Recent Additions (B-NEW-40)" + "B79.TEC config-cache subsystem" — comprehensive. **B-NEW-42 audit findings section added 2026-05-17** documents the gaps; B-NEW-42b's fix entry will land in the same SIM section.
- **Upstream:** module_constants config-cache; pg pool (server/db.ts); per-class config snapshot via `resolveTECConfig`. **NEW upstream (B-NEW-42b):** `price-discontinuity-detector.ts`.
- **Downstream:** unchanged — `tec-evaluator.ts`, paper-execution-engine, VTS runner, `/api/diagnostics/tec-config` endpoint.
- **Shared state:** `trailingStates` Map (per-trade) — UNTOUCHED by B-NEW-42b plumbing. Detector maintains its own per-symbol cache (see §3 below).
- **Background execution:** none added. Detector cache cleared on `clearTrailingState(tradeId)` when the last trade referencing a symbol closes (so detector state lifetime ≤ aggregate trade lifetime per symbol).
- **Blast radius:** LOW (sentinel module is read-only from TEC's perspective; integration is a single gate site at stop-check + target-lock).

**Component: TEC Exit Evaluator (centralizer)** — `server/services/tec-evaluator.ts`
- **SIM coverage:** documented under B65.2 entry (centralizer for VTS + paper exit loops).
- **Role:** the canonical production entry point. ALL production calls to TEC stop-check go through `evaluateTECExit()`. `shouldClosePosition()` is exported but production callers don't use it directly (only used inside trailing-exit-controller and in test files).
- **Plumbing scope:** see §3 design refinement.

**Component: Paper Execution Engine** — `server/services/paper-execution-engine.ts:946`
- **Role:** sole production caller of `evaluateTECExit` for paper + live (mode-keyed) trades.
- **Pre-tick context already available:** `position` row has full state. `currentPrice` is fetched from price cache before the call.
- **Plumbing scope:** if detector requires caller-side prev-tick, this site adds it. **Design refinement (§3) makes this a no-op site.**

**Component: VTS Runner** — `server/services/vts-runner.ts:2145`
- **Role:** sole production caller of `evaluateTECExit` for VTS shadow-mode trades.
- **Pre-tick context already available:** `trade` record has full state. `currentPrice` fetched ahead of call.
- **Plumbing scope:** same as paper-execution-engine — no-op under §3 refinement.

**Component: data-freshness layer** — `server/utils/data-freshness.ts`
- **SIM coverage:** mentioned in B79.0a context.
- **Role:** xstock_spot freshness window removed by B-NEW-34 (`_NO_WINDOW = Infinity`). NOT the right home for the halt sentinel (rationale documented in B-NEW-42 audit-report §3.3). Detector module is a SIBLING module, not an addition to this layer. Confirms scope §2.3.4 reinterpretation.

**Component: module_constants config layer** — `server/services/module-constants-service.ts`
- **Role:** provides the `module_constants.price_discontinuity_detector.*` rows that catalogue the detector's tunable thresholds. New rows must be wildcard-seedable (per scope §6 column).
- **Plumbing scope:** seed migration adds the rows. Existing `getModuleConstants` API is sufficient.

**Component: B79.0L market-hours gate** — `server/asset_classes/xstock_spot/market-hours.ts`
- **Role:** existing partial defense against corp-action exposure (weekend gate). Detector is COMPLEMENTARY, not REPLACING. Gate continues to short-circuit TEC during Fri 8PM ET → Sun 8PM ET; detector handles in-window discontinuities.

### 2.2 Upstream / downstream / shared-state / background trace

**UPSTREAM dependencies (does anything upstream need to change for the detector to function?):**
- `module_constants` rows for `price_discontinuity_detector.*` thresholds. Seed migration adds them (one-time DDL + INSERT, idempotent).
- Caller-side currentTs propagation. Paper + VTS already have access via `Date.now()` at the call site; passing it through is a no-op since both already track `holdDurationMs`.

**DOWNSTREAM consumers (will anything downstream break?):**
- TEC's `shouldClosePosition` + target-lock gate sites consume the detector. By-construction additive (the detector returns `{active: false}` for crypto symbols and for all xStock symbols where no discontinuity is currently active). **Pre-existing test files** (b65-tec-parity, b79-tec-per-class-cache, b80-tec-per-trade-keying) test the standard call signatures and pass through with the optional new args as no-ops. CI status: those tests are currently green (part of the 74 passing test files).
- B-NEW-42 regression tests get their assertions inverted to verify the fix lands.

**SHARED STATE:**
- TEC `trailingStates` Map — UNTOUCHED.
- module_constants cache — additive read (3-5 new constant rows; no field rename or shape change).
- Detector's per-symbol cache — NEW. Map keyed by symbol with `{ state, lastTick, lastDiscontinuityKind, clearedAt }`. Lifetime tied to active trades referencing the symbol.

**BACKGROUND EXECUTION:**
- One new timer per ACTIVE discontinuity to enforce the 5min HARD_CEILING auto-clear (per scope §2.1.1 state machine). Cleared on transition to CLEARING or on `clearTrailingState`.
- Central Clock audit (B-NEW-40 doctrine): per-call one-shot setTimeout, NOT a recurring schedule. Aligned with the pattern B-NEW-40 used for the refresh-promise timeout fence.

**BLAST RADIUS:**
- Crypto path: NONE by-construction. Detector checks `isXstockSymbol(symbol)` and returns `{active: false}` immediately for non-xStock symbols. Production crypto stop-check behavior unchanged.
- xStock path: ADDITIVE (skip stop check when detector active). The bug being fixed is "stop fires on visibility-return"; the fix is "skip until confirming tick." No behavior change when detector is inactive (the common case).
- TEC core logic: ONE branch added in `shouldClosePosition` + ONE branch added in target-lock check site. Both guarded by `isDiscontinuityActive` return value.

---

## §3 Design refinement — detector-owned cache vs caller-side propagation

**Scope rev2 §2.2.3 specifies caller-side propagation:** "add optional `prevPrice` / `prevTs` params to `shouldClosePosition` and `updatePosition`; callers pass them; detector is stateless."

**Pre-audit reconsidered design — detector-owned cache:** the detector maintains its own `Map<symbol, DetectorSymbolState>` cache. Callers pass only `currentPrice` + `currentTs` (which they already have). Per-call:
1. Detector looks up `Map.get(symbol)` → previous-tick context if any.
2. Computes `gapSeconds` and `priceChangePct` against the cached prior tick.
3. Updates the state machine (IDLE / DISCONTINUITY_ACTIVE / CLEARING).
4. Updates the cache with the new `{lastPrice, lastTs}`.
5. Returns `{active, kind, ...}`.

**Why this is structurally equivalent to the scope's "caller-propagation" intent:** the goal Langston validated was "detector needs to know the gap." How the detector gets prior-tick context — pushed by caller or held internally — is an implementation detail. The outcome (detector flags discontinuities correctly) is identical.

**Why detector-owned cache is preferred:**
1. **Caller-side surface unchanged.** No signature changes on `evaluateTECExit`, `shouldClosePosition`, or `updatePosition`. The 2 production caller sites (paper-execution-engine, vts-runner) need ZERO plumbing changes. Only the detector module is new + TEC's 2 gate sites are added.
2. **Test mock simpler.** B-NEW-42 regression tests don't need to mock prev-tick context for the detector — the detector tracks it from successive calls within the test, exactly as it would in production.
3. **Cold start correctness preserved.** First call per symbol post-restart has no cached prior tick → detector returns `inactive` (no gap to evaluate). Same behavior as the "fail-safe-skip on missing prev-tick context" intent from Langston rev1 #1 — except cleaner because cold-start IS structurally "no information," and the fail-safe is correct to behave as if normal (the system has no signal that a discontinuity has occurred). Subsequent calls populate the cache and the detector becomes effective.
4. **Cache lifetime aligned with trade lifetime.** Cleared via existing `clearTrailingState` hook + ageing-out of stale entries (e.g. no calls in 24h evicts the entry). No per-call state cost beyond the existing trailingStates Map.

**Langston rev1 #1 fail-safe-skip guardrail re-interpretation:** the original concern was "caller forgets to pass prev-tick → silent disable." With detector-owned cache that failure mode doesn't exist — there's no caller-side opportunity to forget. The guardrail is now: detector asserts `isXstockSymbol(symbol)` AND state machine is IDLE on cold start → return `{active: false}` (correct, no discontinuity evidence). If a subsequent call shows `gapSeconds > 300 AND |priceChangePct| >= 0.5%`, transitions to DISCONTINUITY_ACTIVE per spec.

**Decision:** adopt detector-owned cache. Note explicitly in B-NEW-42b Step 4 code-review diff comment so Langston has visibility on the implementation choice. If Langston pushes back, revert to caller-propagation per original scope.

---

## §4 Files identified for implementation (Step 3)

**NEW:**
- `server/services/price-discontinuity-detector.ts` — sentinel module.
- `server/tests/unit/b-new-42b-price-discontinuity-detector.test.ts` — module-level tests (clearing logic, threshold edge cases, per-kind behavior, cold-start, hard ceiling).
- `1-system-manual/audits/b-new-42/dividend-calendar-seed.json` — curated 60-entry ex-dividend calendar (interim posture).
- `drizzle/migrations/2026-05-17-b-new-42b-price-discontinuity-detector-constants.sql` — seed migration for `module_constants.price_discontinuity_detector.*` rows.

**MODIFIED:**
- `server/services/trailing-exit-controller.ts` — integrate detector at `shouldClosePosition` + target-lock sites. Optional `currentTs` param (no breaking change; defaults to `Date.now()` if absent — already what callers effectively use).
- `server/tests/unit/b-new-42-tec-split-resilience.test.ts` — invert 2 assertions (forward + reverse split fix verifications).
- `server/tests/unit/b-new-42-tec-halt-resilience.test.ts` — invert 1 assertion (post-resume-gap fix verification).
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — add price-discontinuity-detector entry; update TEC entry's "B-NEW-42 — Phase 0 audit findings" section to add B-NEW-42b fix-shipped subsection.
- `1-system-manual/SYSTEM_MANUAL.md` — update Corporate Actions + Trading Halts subsections (move "audit findings" verdict to "fix shipped, here's how it works").
- `1-system-manual/CHANGES_AND_FIXES.md` — `BUG-2026-05-17-X` (fix entry).
- `1-system-manual/POST_AUDIT_ROADMAP.md` — ex-dividend handover plan from curated calendar to Phase D auto-feed.
- `1-system-manual/BATCH_CATALOG.md` — B-NEW-42b row.
- `1-system-manual/PHASE_HISTORY.md` — xStock Calibration Phase 0 entry: DIRTY → fix-shipped, Phase A unblocked.
- `1-system-manual/ADJUSTMENT_FRAMEWORK.md` — catalogue new per-asset-class knobs (per Langston rev1 #4).
- `1-system-manual/RUNNING_ISSUES.md` — #112 status update (curated-calendar interim posture deployed).
- `.claude/memory/MEMORY.md` (truth + repo mirror) + `/home/langston/MEMORY.md` (Hetzner) — closure block.

---

## §5 Risk register (carries forward from scope §4 + pre-audit-specific items)

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Detector-owned cache vs caller-propagation design refinement rejected at Step 4 review | Low | rev2 of detector module + caller-plumbing | Note refinement explicitly in Step 4 code-review request; if Langston pushes back, revert to caller-propagation (mechanical re-translation, ~2hr). |
| Test mock fidelity (carries from scope §4) — tests pass while production has the bug | Low | Hidden defect post-fix | Tests use the actual exported `evaluateTECExit` API. Detector cache populated by successive test calls (no mock substitution). Same pattern as B-NEW-42 split + halt tests. |
| Crypto-path regression from detector integration | Low | Crypto trades fire spurious stops or miss real stops | Detector `isDiscontinuityActive` returns `{active: false}` immediately for non-xStock symbols (first check). Crypto path untouched. Pre-existing b65-tec-parity + b80-tec-per-trade-keying tests remain green (verified post-implementation). |
| Curated dividend calendar drift | Medium | Missed ex-date → real-money exposure on dividend gap-down | Initial 60 entries cover Q3 + Q4 2026. RUNNING_ISSUES entry scheduled (one-time hand-scheduled alert, not B-NEW-40 recurring-alerts capability). Each quarterly refresh batch schedules the next. |
| 5min HARD_CEILING auto-clear timer leaks if process restarts mid-state | Low | Per-symbol detector state in DISCONTINUITY_ACTIVE at restart auto-resets to IDLE | Acceptable — restart re-hydrates trade state from DB but discards detector cache. Cold-start behavior covered in §3 (returns inactive on first call per symbol). |
| New `module_constants.price_discontinuity_detector.*` rows missing wildcard fallback | Medium | Detector reads `undefined` for threshold | Seed migration creates wildcard `(*, *, *, *)` rows alongside per-asset-class rows. `_NO_WINDOW = Infinity`-style sentinel pattern from B79.0a ensures missing-row degrades to "always-fresh" (i.e. detector inactive) rather than crash. |
| 13 pre-existing failing test files mask new B-NEW-42b breakage | Low | Difficult to verify B-NEW-42b CI status | B-NEW-42b test file scope is the new detector + assertion-inversions on b-new-42 tests. These files are NEW or recently-passing. Verify post-push that the COUNT of passing test files INCREASES (74 → 75+ from detector test) and the COUNT of failing test files stays at 13 (no NEW failures). |

---

## §6 Step 3 sub-step ordering (per scope §3 sequencing)

1. **Halt-detector first** (load-bearing, no existing defense intra-RTH):
   - Author `price-discontinuity-detector.ts` with state machine + halt_resume_gap kind.
   - Author `b-new-42b-price-discontinuity-detector.test.ts` halt scenarios.
   - Integrate at `shouldClosePosition` (single gate site).
   - Invert halt-resilience test assertion.
   - Verify all halt tests green.
2. **Corp-action discontinuity flag** (secondary):
   - Add `corp_action` kind to the same module.
   - Extend tests for corp-action scenarios.
   - Integrate at target-lock site (in addition to stop-check).
   - Invert split-resilience tests (forward + reverse).
   - Verify all split tests green.
3. **Ex-dividend curated calendar** (interim posture):
   - Add `ex_dividend` kind + JSON loader.
   - Seed `dividend-calendar-seed.json` with 60 entries (15 names × 4 quarterly ex-dates for Q3 + Q4 2026).
   - Add calendar-staleness sanity test (per scope §2.5).
4. **Module constants migration**:
   - SQL migration for `module_constants.price_discontinuity_detector.*` rows.
   - Run on staging DB.
5. **Crypto regression sweep**:
   - Run b65-tec-parity + b80-tec-per-trade-keying + b79-tec-per-class-cache locally.
   - Confirm all green.
6. **Step 4 dispatch to Langston** for code-level review of diff.

---

## §7 Step 2 → Step 3 transition

Pre-audit complete. SIM consultation done; affected components mapped; design refinement (detector-owned cache) flagged for Step 4 visibility; risk register populated; sub-step order set.

**Ready to proceed to Step 3** pending Langston pre-audit ACK.

— Claude Code, 2026-05-17
