# P19-B8.5l (B-ATR-SOURCE-FIX) — Completion Report

**Owner:** CC-B (NEW Claude) · **Phase:** 19 · **Closed:** 2026-07-27 · **change-class:** architecture
**Head:** `adf1002b1` · **CI:** 4/4 green (Test Suite, TypeScript Check, Build, Docker Build) · **Deploy:** staging (HTTP 200).

## Outcome
Fixed the #581 root cause — the pattern-detection path leaked a stale, cross-symbol `sizingContext.atr` onto every pattern signal — and re-enabled carrying the (now per-symbol-correct) ATR to open positions. This is the fix behind the shared-volatility bug the B8.5k §9.3 check surfaced.

## Objectives
- **OBJ-1 — fix the source: YES.** `signal-orchestrator.ts:~1962` — the pattern pass now re-stamps `sizingContext.atr = context.indicators?.atr` per pattern-symbol (RAW, undefined-preserving — NOT the `:1905` fallback local, so the `:1548` `invalid_atr` LOUD gate keeps quant/pattern parity — Langston catch). Fixes the live reachability gate (pattern signals were gated on the last-quant-symbol's stale atr) + makes `sizingContext.atr` per-symbol-correct for every consumer.
- **OBJ-2 — re-enable the carry (unblocks #556): YES (restored, live proof PENDING-VERIFY).** `atr: sizingContext.atr` restored at the sized-signal metadata rebuild — safe now the source is correct.
- **OBJ-3 — fence: source-guards YES; behavioural fence DEFERRED with a named home.** 5 source-guards pass (re-stamp present + RAW-not-fallback + placed-before-build + carry-restored + quant-stamp-unchanged). The behavioural ≥2-distinct-atr assertion (the query that caught B8.5k) **could not run: `rtb_signals` has been empty for 2+ days** (every signal EV-rejected on negative net-expectancy after Kraken fees — #570, working-as-designed, PRE-DATES this deploy; Langston independently verified the empty pool). Langston ruled: close on code+test, do NOT hold the gate hostage to a signal-flow condition CC-B doesn't control. Homed → the scheduled alert `p19-b8-5l-atr-fence` (owner CC-B, self-reschedules while dry; PASS→#556 verified, SHARED→reopen #581).
- **OBJ-4 — closed_trades cleanup: verify-clean.** 0 rows opened in the B8.5k window; the 7 open window-positions were quarantined at B8.5k close.

## Verification
- Code: TWO independent stamp-before-read reads (CC-B + Langston at `adf1002b1`); census — only `:2165` stamps `sizingContext.atr`, only `:1951` read it un-stamped (all `:2179-2531` post-stamp). `context` proven per-symbol (`computeContext(symbol,…)` `:1887`).
- Tests: new suite 5/5; B8.5k suite 4/4 (superseded assertion updated); tsc baseline gate exit 0 (0 new); full vitest 2447 pass, 10 env pg-pool file-failures (baseline).
- Live: deployed, HTTP 200, pipeline scanning (evaluated=351, eligible=57). Distinct-atr fence deferred (empty pool) — see the named alert.

## Step-8 interpretation anchor (Langston — record it)
A small future RISE in pattern `INVALID_ATR` drops is the gate-parity fix WORKING, not a regression: pre-fix a pattern with genuinely-absent atr silently borrowed the last quant symbol's nonzero atr and PASSED the gate; now it gets `undefined` → `INVALID_ATR` LOUD → drops.

## Governance files changed
RUNNING_ISSUES (#581 RESOLVED; #556 re-carry restored+PENDING-VERIFY with the fence home named), BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN, SYSTEM_IMPACT_MAP (pattern-pass atr re-stamp + restored carry), SYSTEM_MANUAL (signal-pipeline atr feed / gate parity), scope + pre-audit, this report, MEMORY_CC_B + Langston MEMORY.

## Lessons
1. **A shared mutable "scratch-pad" object mutated per-symbol across TWO passes is a stale-leak trap** — the pattern pass re-stamped regime/DBS but missed atr; the fix is per-consumer re-stamp discipline. The comment at `:1943` had already flagged the class for its siblings.
2. **Gate parity matters:** re-stamp the RAW value, not a fallback-carrying local, or you silently pass a gate the sibling path loudly rejects (Langston).
3. **A deferred verification blocked by an external condition gets a self-perpetuating named home, not a vague "re-run opportunistically" (§13).**
