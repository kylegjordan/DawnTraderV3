# P19-B8.5l (B-ATR-SOURCE-FIX) — Scope

**change-class: architecture**
**Owner:** CC-B (NEW Claude) · **Phase:** 19 · **Drafted:** 2026-07-27
**Issue homes:** #581 (the shared-`sizingContext.atr` source defect — this batch's root cause) · unblocks #556 (the ATR carry to positions, reverted in B8.5k).

## 1. One-line intent
Fix the root cause behind #581: the pattern-detection path leaks a stale, cross-symbol `sizingContext.atr` onto every pattern signal. Then re-enable carrying the (now-correct) per-symbol ATR to open positions, behind a fence test that guarantees distinct ATR per symbol.

## 2. Root cause (code-confirmed; the B8.5k §9.3 check surfaced it, the discriminator located it)
`sizingContext` is a single shared object (created `signal-orchestrator.ts:1727`). It is stamped with the current symbol's ATR at **exactly one place**: `:2165` `sizingContext.atr = mceContext.indicators.atr`, inside `evaluateSymbol` (the main per-symbol quant dispatch, `:1745` loop).
- The **pattern-pool pass** (`:1846 for (const symbol of patternSymbols)` … `:1951 buildSizedSignalForStrategy`) is a **separate pass that runs AFTER** the `:1745` loop closes. It re-stamps `sizingContext.regime`/`pairDbsCategory`/`pairDbsScore` per pattern-symbol (`:1947-1949`) **but NOT `sizingContext.atr`.** The `:1943-1946` comment literally documents this "stale cross-symbol leak" class — regime/DBS were fixed, ATR was missed.
- So on entry to the pattern pass, `sizingContext.atr` = the **last quant symbol's** ATR, and every pattern signal reads that one stale value (matches the B8.5k data exactly: shared value per cycle = last-quant-symbol's absolute ATR, changing each cycle; atr/price 0.000004→0.0196 across symbols).
- **Census (§9.5a):** the ONLY stamp is `:2165`; the ONLY `buildSizedSignalForStrategy` caller lacking a preceding stamp is `:1951` (pattern pool). `:2179–:2531` (quant + pattern-strategy dispatch) all sit after `:2165` in the same iteration → correct. `:455` is 4-arg (gate reads `marketContext.atr`).
- **LIVE impact, independent of the reverted carry:** pattern signals are 3-arg `buildSizedSignalForStrategy` callers, so the reachability gate (`:1548 _b2Atr = marketContext?.atr ?? sizingContext.atr`) uses the stale ATR **today** — pattern-signal reachability is currently gated on the wrong (last-quant-symbol) ATR. `computeATR` is a pure per-symbol fn; the `:1745` loop is sequential-awaited (no race) — the pattern-pass missing re-stamp is the sole leak.

## 3. Objectives
- **OBJ-1 — FIX THE SOURCE.** In the pattern-pool path, re-stamp `sizingContext.atr = context.indicators?.atr` alongside the existing regime/DBS re-stamps (`:1947-1949`). **★ RE-STAMP THE RAW value, undefined-preserving — NOT the `:1905` local `atr` (Langston Step-1 catch):** that local is `context.indicators?.atr ?? (currentPrice * 0.02)`, carrying a SYNTHETIC 2%-of-price fallback; re-stamping the fallback would feed a fabricated ATR into the `:1548` `invalid_atr` LOUD gate, so pattern signals would silently PASS a gate the quant path loudly REJECTS (the quant stamp at `:2165` is raw `mceContext.indicators.atr`, no fallback, precisely so absent-ATR fires the wiring-bug error — gate parity). The synthetic fallback stays LOCAL for `patternToTradeSignal`'s geometry (a separate pre-existing question, out of scope). **Pre-audit confirms `context` is the pattern-symbol's own per-symbol MCE context (not shared).** Fixes the live reachability gate + makes `sizingContext.atr` per-symbol-correct for every consumer.
- **OBJ-2 — RE-ENABLE THE CARRY (unblocks #556).** Re-add `atr: sizingContext.atr` at the sized-signal metadata rebuild (the B8.5k line, reverted at `4dc65b8f2`) — now safe because the source is per-symbol-correct. Feeds the real per-symbol ATR to `atr_at_open` (display, RTB ranking, replay, VTS-parity). Exit-neutrality already proven (B8.5k T1/T2; trailing off) — retained.
- **OBJ-3 — THE FENCE TEST (Langston's re-carry gate; the test B8.5k lacked).** A test asserting **≥2 DISTINCT `atr` values across symbols in one cycle** — the exact assertion that would have caught this. Plus a source-guard that the pattern path re-stamps `sizingContext.atr`.
- **OBJ-4 — CLEANUP the B8.5k contamination in `closed_trades` (Langston condition).** The 7 open window-positions were quarantined at B8.5k close (`atr_at_open`→0). Positions opened during the B8.5k carry window (2026-07-24 00:00:40→~00:16Z) that have since CLOSED carry the wrong shared ATR in `closed_trades`. **ATTRIBUTE-BEFORE-ZERO (Langston caveat):** enumerate the window closed rows, confirm each carries the shared (per-symbol-wrong) value — not a legit owner's ATR — before restoring `atr_at_open`→0 (honest-absent, the pre-B8.5k baseline).

## 4. Out of scope
The exit-path/trailing behavior (unchanged; trailing stays off per Kyle). The MCE atr computation (verified correct — pure per-symbol). Any non-pattern call site (census: all correct).

## 5. Verification gates
tsc clean · full vitest A/B (fence test + source-guard added, no pre-existing loss) · CI 4/4 green · deploy · **§9.3 live-DATA check: rtb_signals.metadata.atr is now per-symbol DISTINCT in one cycle (the check that caught B8.5k, now passing)** + atr_at_open per-symbol on new positions · closed_trades window swept · Langston Step-4 (diff at ref) + Step-8.

## 6. Governance
Tier-1 (completion report, BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN, RUNNING_ISSUES #581 RESOLVED + #556 unblocked/closed, MEMORY) + pre-audit (with the full call-site census). SIM (the pattern-path atr re-stamp + the restored carry) + SYSTEM_MANUAL (the signal-pipeline atr feed) — applicable, will update. No migration (code-only).
