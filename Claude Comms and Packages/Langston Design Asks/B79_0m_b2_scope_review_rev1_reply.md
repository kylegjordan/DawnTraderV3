# Langston review — B79.0m.b2 scope + pre-audit rev1

**Headline:** scope is sound, the architectural commitment is correct, and I'm clearing it to proceed with five amendments to pre-audit before code is written. The hidden-crypto-assumption I want surfaced is the **`min_history_days=21` bar-count interpretation** in the cloned pattern row — that one will quietly reject every xstock pair if not handled.

---

## (a) Architectural commitment + 5 objectives

**Confirmed.** Mirror crypto's `fx5-scanner.ts` + `vts-runner.ts` shape; differences live in DB rows. This is what Kyle directed yesterday, it's what closes the gap between PM2 #221's "pipeline runs, no trades" state and functional parity, and it's the right call.

All five objectives approved as scoped:

1. **Pattern path** — clone two `screener_filters` rows + new `pattern-filter.ts` + parallel pipe in `eval-cycle.ts`. Sound.
2. **Family fan-out** — multi-iteration per qualifying family. Sound.
3. **ORB LONG-only + family-map entry** — good catch bundling these. The pre/post-deploy crypto no-touch SQL covers the regression risk.
4. **B73 replay asset-class branch** — closes the silent-failure path. Sound.
5. **Schema-file drift** — close it now while the diff is open. Sound.

The scaffolding-vs-functional declaration is honest: this batch makes the pattern path **functional**, not calibrated. Layer-3 thresholds are downstream.

---

## (b) Q-L1, Q-L2, Q-L3

### Q-L1 — pattern + fan-out joint semantics

**Confirmed.** A pair passing pattern IMF AND N family IMFs produces `1 + N` separate `signal_eval_archive` entries — one per lane, each evaluating its own eligible strategy set. These aren't duplicates of the same evaluation; they are distinct evaluations sharing the pair. This matches crypto's `taggedVtsSurvivors` shape and is the right semantic.

**One precondition for me to clear G7:** the `signal_eval_archive.source_pool` column must already exist and be writable. G7 reads `source_pool='pattern'`. Verify schema before code; if absent, fold the column add into the same migration so the gate isn't blocked by a missing column at verify time.

### Q-L2 — ORB family choice

**Confirmed: `orb: 'breakout'`.** Three reasons:

1. ORB's `signalType='QUANT'`. The `pattern` family is the lane for `scanPatterns()`-detected chart formations (Morning Star, Inside Bar, Pivot Shift). ORB does not surface via `scanPatterns()`.
2. The signal trigger geometry — range-from-opening-bars then directional break — is a breakout setup by construction. It belongs alongside `breakout` and `vwap_bounce` in the breakout lane.
3. Routing it to `pattern` would conflate "intraday formation" with "geometric chart pattern," which weakens the family taxonomy across the system, not just for ORB.

Pre-audit §0.3 already covers the crypto regression vector (ORB has zero admitted crypto rows in 7d archive) and the hotfix-revert path is clean. Approved.

### Q-L3 — B73 replay scale

**Approved with two add-ons to pre-audit before code:**

The per-trade cost arithmetic is right (1-10 closes/day Layer 1, 50-100/day at maturity, async fire-and-forget, off the close-latency path). But the §0.5 claim "covers ~1-2 partitions" deserves verification, not a footnote.

Add to pre-audit before code:

1. **EXPLAIN ANALYZE precheck.** Run once on staging against `xstock_spot_ohlc_1m` for a `(symbol = ?, interval_begin BETWEEN NOW() - INTERVAL '7 days' AND NOW())` predicate. Paste result in completion report. Two specific things to confirm:
   - Partition pruning is actual (`Subplans Removed: N` in plan, not all 13 scanned).
   - The `(symbol, interval_begin DESC)` index is propagated to all 13 partitions (`\d xstock_spot_ohlc_1m` should show child indexes).
2. **Error surfacing for the async path.** Fire-and-forget means failures are silent by default. Add a tagged error counter or log line (`[B73-REPLAY][XSTOCK] err=...`) so a schema drift or partition mishap doesn't accumulate undetected — that's the B72.1 failure mode (wrong audit conclusion because the silent surface looked clean). Surface it in PM2 logs and ideally in a counter that bubbles up.

These are pre-audit additions, not scope changes. ~30 minutes of work, prevents a 3-week silent regression.

---

## (c) Hidden crypto assumptions in §0 SIM audit

CC covered Q1–Q5 across six components well. Three items I'd surface before code:

### C-1 (highest priority) — `min_history_days=21` bar-count semantics in pattern-filter

The cloned crypto row carries `min_history_days=21`. On crypto, 21 days × 1440 min = **30,240 1-min bars** of available history. On xstock at RTH (6.5h/day × 60 min × ~5 days/week × 21 calendar days ≈ **4,100 bars**, or × 21 trading days ≈ **8,190 bars**).

If `pattern-filter.ts` interprets `min_history_days` as bar-count parity (i.e., expects ≥ N bars where N is calibrated against crypto's 24/7 cadence), every xstock pair gets rejected at the proxy check. **Result: pattern path admits zero pairs, indistinguishable from "code works but conditions are tight."** This is the most likely hidden-crypto-assumption failure in this batch.

Fix options (CC choose, I'm fine with either):
- **(A)** Interpret `min_history_days` as calendar days in pattern-filter.ts and translate to required bars per asset class internally (`crypto: days × 1440`, `xstock: days × 390`).
- **(B)** Reset xstock's cloned pattern row to `min_history_days = 7` and `min_history` (bar threshold) sized to the xstock cadence directly. Document the divergence in the row's `last_updated_by` tag.

Either way, **do not ship with a bar-count comparison reading the crypto-tuned threshold against xstock OHLC depth.** This needs to be in §0.2 of pre-audit explicitly.

### C-2 (medium) — pattern strategy params via wildcard vs asset-class-scoped `module_constants`

Pre-audit defers per-strategy threshold authoring for the 9 non-ORB xstock strategies. Fine. But the three **pattern** strategies (`morning_star`, `inside_bar_reversal`, `pivot_shift`) read `module_constants.strategy.<name>.*` — do those rows exist asset-class-scoped for `xstock_spot`, or only wildcard?

If wildcard-only, pattern lane fires but with crypto-tuned threshold semantics under it. Two failure modes:
- Thresholds too tight for xstock cadence → pattern lane admits 0 even though pattern-filter passes pairs.
- Thresholds too loose → pattern lane floods the archive with low-quality signals.

Action: add to pre-audit §0.1 Q1 a one-shot query `SELECT name, asset_class, value FROM module_constants WHERE constant_path LIKE 'strategy.morning_star.%' OR 'strategy.inside_bar_reversal.%' OR 'strategy.pivot_shift.%'` and document the result. If wildcards-only, that's an acknowledged Layer-3 calibration target (don't fix now), but the completion report must call it out so it doesn't become invisible-debt.

### C-3 (low) — `scanPatterns()` internal scaling

CC asserts `scanPatterns()` is "asset-class-agnostic by design (pure geometric pattern matching)." Trust but verify: if it uses ATR or volatility-normalized lookback windows internally (any `volatility * k` term tuned to crypto's 24/7 vol regime), it isn't purely geometric. A 30-second grep for `ATR`, `vol`, `stddev` inside `scanPatterns()` resolves this. If clean, note in completion report and we move on.

---

## (d) Scope / pre-audit changes before code

1. **Pre-audit §0.2** — add the `min_history_days=21` semantics resolution (C-1 above). This is the most material change.
2. **Pre-audit §0.5** — add EXPLAIN ANALYZE precheck + async error surfacing (Q-L3 add-ons).
3. **Pre-audit §0.1** — add the pattern-strategy module_constants query result (C-2). Doesn't block; documents the calibration debt.
4. **Pre-audit §3** — add the SQL `SELECT column_name FROM information_schema.columns WHERE table_name='signal_eval_archive' AND column_name='source_pool'` to confirm the column exists. If missing, fold into the migration.
5. **Implementation order step 7** — add a unit test that pattern strategy detect functions resolve `module_constants` with `assetClass='xstock_spot'` and not silently via wildcard fallback. Belt-and-suspenders for C-2.
6. **New verification gate G12** — pattern strategies invoked during first RTH used either xstock-scoped or wildcard params (documented either way). Two-line addition, no new code.
7. **Counter accounting (§2.3)** — add `patternRejectByMinHistory` to `XstockEvalCycleCounters`. If C-1 isn't handled correctly, this counter will spike to ~all pairs immediately and we'll know within one cycle instead of debugging four hours later.
8. **§0.3 ORB resolution paragraph** — add an explicit rollback trigger: if any crypto ORB row appears in `signal_eval_archive` at +1h post-deploy where the family-gate rejection materially shifts the rejection stage from pre-deploy baseline, single-line revert of the family-map entry and ship the rest. The current text says "will monitor" — make the trigger crisp.

None of these are architectural changes. They're hardening of the verification surface so a silent-failure mode doesn't masquerade as success.

---

## Summary

- **Architectural commitment: confirmed.** Crypto-mirror shape, DB-resolved differences.
- **All 5 objectives: confirmed as scoped.**
- **Q-L1: confirmed** (with the `source_pool` column precondition).
- **Q-L2: confirmed** — `orb: 'breakout'`.
- **Q-L3: approved with EXPLAIN ANALYZE precheck + async error surfacing added to pre-audit.**
- **Hidden crypto assumptions:** C-1 (`min_history_days` bar-count semantics) is the one most likely to silently kill the pattern path. C-2 (pattern strategy module_constants scoping) is calibration-debt to acknowledge. C-3 (`scanPatterns()` internals) is a 30-second grep.
- **Pre-audit edits before code:** eight specific additions above, ordered roughly by priority.

Once those edits land in the pre-audit and CC has run the EXPLAIN ANALYZE + the `source_pool` column check + the `min_history_days` resolution, my Step 2 gate is clear. Step 4 (code diff review) is the next gate from me.

One observation worth flagging to Kyle for the record: PM2 #221 shipped a pipeline that ran cleanly for 24h and opened zero trades. That's exactly the failure mode the asset-class onboarding workflow's "hidden-crypto-assumptions audit" was supposed to catch. The fact that it didn't — and that we're discovering the pattern-path gap *after* ship — suggests the Step 4 audit template needs a "for each new asset-class file, enumerate what would have to be true for zero output to look identical to working output" pre-flight. Worth a small workflow tweak in a future governance batch.

— Langston
