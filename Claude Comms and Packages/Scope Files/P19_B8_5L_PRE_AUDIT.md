# P19-B8.5l (B-ATR-SOURCE-FIX, #581) — Pre-Audit (Step-2)

**Owner:** CC-B · **Read at:** `origin/migration/aws-supabase` (272708e4f) · **change-class:** architecture.

## 1. SIM / System-Manual consult
- **SIM:** the signal-pipeline atr feed (`sizingContext.atr` → `buildSizedSignalForStrategy` → the reachability gate + the position `atr_at_open`). This batch adds one per-symbol re-stamp in the pattern pass + restores the carry; SIM gets a content note (the pattern-pass atr re-stamp; the restored carry).
- **System Manual:** the signal pipeline / atr-into-reachability-gate. Gets a note that the pattern pass now feeds a per-symbol atr to the `invalid_atr` gate (parity with the quant pass).

## 2. §9.5(a) census — `sizingContext.atr` writers & the un-stamped reader
- **Writers (stamps) of `sizingContext.atr`:** exactly ONE — `signal-orchestrator.ts:2165` `sizingContext.atr = mceContext.indicators.atr` (per quant-symbol, inside `evaluateSymbol`, called from the `:1745` `eligibleSymbols` loop). [After this batch: a SECOND writer at `:~1962` in the pattern pass — the fix.]
- **`buildSizedSignalForStrategy` callers (14 in-file):** `:1951` (pattern pool, 3-arg) is the ONLY one lacking a preceding `sizingContext.atr` stamp. `:2179–:2531` (quant + pattern-strategy dispatch) all sit AFTER `:2165` in the same `evaluateSymbol` iteration → correct. `:455` is 4-arg (the reachability gate reads `marketContext.atr`, not `sizingContext.atr`).
- **Structure:** the `:1846` `patternSymbols` pass is a SEPARATE pass that runs AFTER the `:1745` loop closes (same indentation level, `}` between them). So on entry `sizingContext.atr` = the last quant symbol's atr; the pattern pass never re-stamps it (regime/DBS ARE re-stamped at `:1947-1949`; the `:1943-1946` comment documents this exact "stale cross-symbol leak" class). ⇒ every pattern signal reads the shared stale value.

## 3. Root-cause proof + the gating condition (Langston Step-1)
- **`context` is per-symbol (Langston's gating condition — PROVEN):** the pattern pass computes `const context = mce.computeContext(symbol, ohlcForContext, currentPrice, volume24h, undefined, propagatedDbs, sizingContext.assetClass)` (`:1887`) — per pattern-symbol, from per-symbol `ohlcForContext`. So `context.indicators?.atr` is the pattern symbol's OWN raw atr. Re-stamping it is correct.
- **Gate-parity (Langston catch):** the `:1905` local is `context.indicators?.atr ?? (currentPrice * 0.02)` — a synthetic fallback. The fix re-stamps the RAW `context.indicators?.atr` (undefined-preserving), NOT that local, so the `:1548` `invalid_atr` LOUD gate keeps parity with the quant pass (which stamps raw `mceContext.indicators.atr`). The fallback stays local for `patternToTradeSignal` geometry (out of scope).
- **`computeATR`** is a pure per-symbol fn (no shared state); the `:1745` loop is sequential-awaited (no race). The pattern-pass missing re-stamp is the SOLE leak.

## 4. OBJ-4 cleanup — closed_trades window (verified clean)
Query at ref: closed_trades opened in the B8.5k carry window (2026-07-24 00:00:40→00:16Z) = **0 rows**. So there is no closed-trade contamination to sweep — the 7 open window-positions were quarantined at B8.5k close (`atr_at_open`→0) and none have closed. OBJ-4 is a verify-clean, not an action. (Attribute-before-zero would apply if any surfaced.)

## 5. Implementation (Step-3, done)
- OBJ-1: `sizingContext.atr = context.indicators?.atr;` added after the regime/DBS re-stamps in the pattern pass.
- OBJ-2: `atr: sizingContext.atr,` restored at the sized-signal metadata rebuild (the B8.5k line).
- OBJ-3: `p19-b8-5l-atr-source-fix.test.ts` (5 source-guards: re-stamp present + RAW-not-fallback + placed-before-build + carry-restored + quant-stamp-unchanged). The behavioural ≥2-distinct-atr fence is the §9.3 live-data check at deploy (repeatable via `rtb_signals.metadata.atr` distinctness in one cycle — the exact check that caught B8.5k). Updated the B8.5k test's now-superseded "carry reverted" assertion to "carry restored".

## 6. Verification done
- new suite 5/5; B8.5k suite 4/4 (post-update); tsc baseline gate exit 0 (no regressions); full vitest 2447 pass (2446 + the fixed B8.5k assertion), 10 env pg-pool file failures (baseline).

## 7. Blast radius
Edits: `signal-orchestrator.ts` (pattern-pass re-stamp + restored carry) + new test + B8.5k test assertion update. No migration. Consumers of the now-correct atr: reachability gate (fixed live), `atr_at_open` (display/RTB/replay/VTS-parity, via the carry). Board claim [37].
