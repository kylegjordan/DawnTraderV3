# B-ATR-BAD-PRINT — Step-4 change list (Langston code review)

**Batch:** `B-ATR-BAD-PRINT` · `#1153` · sprint row 2a · owner CC-B · change-class `architecture` (scope header).
**Graded ref:** commit `ef4c7c8be4e5e2b9025dc6f8c4d99e51fb3c5882` on `origin/migration/aws-supabase` (one commit, 22 paths).
**CI:** run `37498280044` (result recorded in the dispatch post).
**Record:** scope `Scope Files/B_ATR_BAD_PRINT_SCOPE.md` (r2 + §6 conditions) · pre-audit `Scope Files/B_ATR_BAD_PRINT_PRE_AUDIT.md` (§0 pre-registration, §1d your E3 ruling, §2 A1-A12, §3 plan, §4 your Step-2 approval + C1-C3 + ruling (e)) · evidence `Scope Files/B_ATR_BAD_PRINT_evidence/`.
**Deploy:** NOT before 2026-10-07T15:53Z (`#1154` no-restart window after the paper reset).

## DISPATCH HEADER (workflow-04 three fields)
**(i) DECLARED CHANGE-CLASS:** `architecture` (verbatim from the scope header).
**(ii) THAT CLASS'S DOC SET, ROW BY ROW (state at this ref):**
| document | state |
|---|---|
| batch `SCOPE` | **present** — `Claude Comms and Packages/Scope Files/B_ATR_BAD_PRINT_SCOPE.md` |
| batch `PRE_AUDIT` | **present** — `Claude Comms and Packages/Scope Files/B_ATR_BAD_PRINT_PRE_AUDIT.md` |
| `SYSTEM_MANUAL.md` | **present, updated in this commit** — Chapter 1 §9 "ATR — the one shared estimator", TOC, MCE authority row |
| `SYSTEM_IMPACT_MAP.md` | **present, updated in this commit** — 5.2.5a NEW, 5.2.5, 5.1b, 2.6, 1.2a, the `patternToTradeSignal` row |
| `RUNNING_ISSUES.md` (T2) | **present, updated** — #1153, #371, #373 |
| `COMPLETION_REPORT` | **absent — Step 11** |
| `BATCH_CATALOG.md`, `PHASE_HISTORY.md` | **absent — Step 10** (after deploy + Step 7) |
| `DELETED_COMPONENTS_LOG.md` (the retired 0.10 row) | **absent — Step 10**, after the migration runs on staging |
| active plan / task list / shared + own MEMORY / your MEMORY | **Step 10** |
**(iii) STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_ATR_BAD_PRINT_PRE_AUDIT.md` — your approval is its §4 (ruling (e), C1-C3).

---

## 1. What the commit does, in one paragraph
Every live ATR now comes from one function, `server/core/calculations/true-range-atr.ts`, implementing E3 (your §1d ruling). The six former plain-mean copies switch to it in this one commit, so the `#371` identity can be stated as a property of one function rather than six. The three geometry fallbacks you ruled on in (e) are removed and fail closed; the pattern branch's drop is counted (C3). `getEffectiveATR`/`clampEffectiveATR` reject a non-finite ATR (C1). The one database row that only the removed fallback read is retired by migration under rule 18.

## 2. Plan item → change, each ← its audit finding

| plan item (pre-audit §3) | change | ← finding |
|---|---|---|
| 1. shared E3 function | NEW `server/core/calculations/true-range-atr.ts` (§3 below) | A8, §1d |
| 2. all copies switch in one commit | six adapters → `atrOrZero(...)` (§4) | A1, A2, A5 |
| 3. C1 clamp helpers | `strategy-helpers.ts` `getEffectiveATR` + `clampEffectiveATR` add `!Number.isFinite` (§5) | A4, C1 |
| 4. pattern branch, C3 + ruling (e) | `signal-orchestrator.ts` counted drop + dead `??` removed; `pattern-recognizer.ts` throws (§6) | A3, A6, A7, C3 |
| 5. daily-range fallback, ruling (e) | `strategy-engine.ts` two sites → null/false; migration + rollback; MANIFEST (§7) | A6, A7 |
| 6. labels + docs | `market-scanner.ts` comment, `LEVER_INVENTORY.md:168` (not Wilder); SIM 5.2.5a NEW, 5.2.5, 5.1b, 2.6, 1.2a, the `patternToTradeSignal` row; System Manual Ch.1 §9 NEW + TOC + MCE row; RUNNING_ISSUES #1153/#371/#373 | A9 |
| 7. tests | NEW `b-atr-bad-print.test.ts` (18); two existing tests adjusted (§8) | A5, A6 |

No plan item is `UNAUDITED`. One addition beyond the plan, flagged: `b79-0n-strategy-se-key-factory.test.ts` drops the retired key from its mock (cleanup, no behaviour).

## 3. NEW — the shared function (load-bearing body, verbatim)
```ts
export const WICK_CLIP_MULTIPLE = 3;

export function computeAtr(bars: readonly AtrBar[], period: number = 14): number {
  if (!Number.isInteger(period) || period < 1 || bars.length < period + 1) return NaN;
  const w = bars.slice(-(period + 1)).map(toNum);
  for (const b of w) {
    if (!Number.isFinite(b.open) || !Number.isFinite(b.high) || !Number.isFinite(b.low) || !Number.isFinite(b.close)) {
      return NaN;
    }
  }
  const raw: number[] = [];
  for (let i = 1; i < w.length; i++) raw.push(trueRange(w[i].high, w[i].low, w[i - 1].close));
  const m = median(raw);
  const span = WICK_CLIP_MULTIPLE * m;
  let sum = 0;
  for (let i = 1; i < w.length; i++) {
    const b = w[i];
    const top = Math.max(b.open, b.close);
    const bottom = Math.min(b.open, b.close);
    const high = Math.min(b.high, top + span);
    const low = Math.max(b.low, bottom - span);
    sum += trueRange(high, low, w[i - 1].close);
  }
  return sum / period;
}

export function atrOrZero(bars: readonly AtrBar[], period: number = 14): number {
  const a = computeAtr(bars, period);
  return Number.isFinite(a) && a > 0 ? a : 0;
}
```
**Design choice to rule on:** the shared function returns `NaN` for "no ATR"; every one of the six call sites goes through `atrOrZero`, so each still returns a number with 0 meaning "no usable ATR" — **no caller contract changes**, and every downstream consumer keeps the fail-closed path it already has (`invalid_atr`, `computeDirectionalBias`'s `atr <= 0` branch). The alternative (propagating `NaN`) would have needed every consumer re-audited for `NaN` comparisons — the exact hole C1 found in `getEffectiveATR`.
**Matches the pre-registered estimator:** `B_ATR_BAD_PRINT_evidence/est.py` `E3()` — median of the raw true ranges, clip each bar's high/low to its body ± 3m, previous close unclipped, plain mean. Same arithmetic.

## 4. The six adapters (each body now one line)
| site | before | after |
|---|---|---|
| `market-context-engine.ts` private `computeATR` | plain mean; **under `period` TRs averaged what it had; under 2 bars → 0** | `atrOrZero(ohlcData, period)` — under 15 bars → 0 (C2) |
| `strategy-engine.ts` `computeATR(priceHistory)` | plain mean, `parseFloat`; < period+1 → 0 | `atrOrZero(priceHistory, period)` (string decimals handled by `toNum`) |
| `strategy-helpers.ts` `calculateATR` | plain mean; < period+1 → 0 | `atrOrZero(candles, period)` |
| `fx5-scanner.ts` `computeATRFromOHLC` | plain mean; < period+1 → 0 | `atrOrZero(ohlcData, period)` |
| `market-scanner.ts` `computeATR14` | plain mean (comment said "Wilder"); < 15 → 0 | `atrOrZero(ohlcData, 14)`; comment corrected |
| `xstock_spot/scanner.ts` `computeATRFromOHLC` | plain mean; period 56 from DBS config | `atrOrZero(ohlcData, period)`, 56 kept |

**A12 short-history check (owed by the pre-audit, now done):** HEAD `market-scanner.ts:20` already returned 0 under 15 bars, and `computeDirectionalBias` treats `atr <= 0` as insufficient (`server/core/metrics/directional-bias.ts:64`) ⇒ no DBS change. The only behavioural change for short histories is the MCE (C2, deliberate).

## 5. C1 — the clamp helpers
```diff
-  // GUARD-2: Reject if ATR too small
-  if (atr < currentPrice * GLOBAL_CONSTANTS.ATR_MIN_RATIO) {
+  if (!(atr > 0) || !Number.isFinite(atr) || atr < currentPrice * GLOBAL_CONSTANTS.ATR_MIN_RATIO) {
     return null;
   }
   return Math.min(atr, currentPrice * GLOBAL_CONSTANTS.ATR_MAX_RATIO);
...
-  if (!(rawATR > 0) || rawATR < currentPrice * GLOBAL_CONSTANTS.ATR_MIN_RATIO) return null;
+  if (!(rawATR > 0) || !Number.isFinite(rawATR) || rawATR < currentPrice * GLOBAL_CONSTANTS.ATR_MIN_RATIO) return null;
```
`#371`: both helpers return `min(raw, 10 % of price)` or null below 0.1 % — never a lift — and raw now comes from the same function as the normalizer's `mceContext.atr` ⇒ `clamped ≤ raw` by construction. Residual (INFERRED, A2): the MCE's 60-second context cache may hold an older bar set than the strategy's array. Does **not** open `#373` (condition 1's magnitude capture is still unbuilt — recorded on #371/#373).

## 6. Pattern branch — C3 and ruling (e)
`signal-orchestrator.ts` (pattern pass):
```diff
+      let patternAtrDrops = 0;
...
-            const atr = context.indicators?.atr ?? (currentPrice * 0.02);
+            const atr = context.indicators?.atr;
+            if (!(typeof atr === 'number' && Number.isFinite(atr) && atr > 0)) {
+              patternAtrDrops++;
+              continue;
+            }
...
-              stopPrice: tradeSignal.stopPrice ?? currentPrice * 0.97,
-              targetPrice: tradeSignal.targetPrice ?? currentPrice * 1.03,
+              stopPrice: tradeSignal.stopPrice,
+              targetPrice: tradeSignal.targetPrice,
...
  Pattern pool complete: … | [P19-B6.5c][PATTERN_NOMATCH_DROPS] … | [B-ATR-BAD-PRINT][PATTERN_ATR_DROPS] ${patternAtrDrops}
```
`pattern-recognizer.ts` `patternToTradeSignal`:
```diff
-  const stopDistance = atr > 0 ? atr * 1.5 : currentPrice * 0.01;
-  const targetDistance = atr > 0 ? atr * 2.5 : currentPrice * 0.02;
+  if (!(Number.isFinite(atr) && atr > 0)) {
+    throw new RangeError(`[B-ATR-BAD-PRINT] patternToTradeSignal requires a positive finite ATR (got ${atr}) for ${pattern.symbol}`);
+  }
+  const stopDistance = atr * 1.5;
+  const targetDistance = atr * 2.5;
```
The throw is reachable only by a wiring defect: the sole production caller drops first. **Ask:** is a throw the right failure mode for that defect, versus returning null? I chose the throw because a null here would be a silent absence that reads as "no pattern fired" — the C3 failure, one level down.

## 7. Daily-range fallback — ruling (e), rule 18
`strategy-engine.ts`:
```diff
-      const atr = indicators.atr ?? (high24h - low24h) * c['atr_fallback_daily_range_frac']; // Fallback: 10% of daily range
+      const atr = indicators.atr;
+      if (!(typeof atr === 'number' && Number.isFinite(atr) && atr > 0)) {
+        setNullReason('invalid_atr');
+        return null;
+      }
...
-    const { currentPrice, vwap, low24h, high24h } = indicators;
-    const atr = indicators.atr ?? (high24h - low24h) * c['atr_fallback_daily_range_frac'];
-    if (atr <= 0 || vwap <= 0) return false;
+    const { currentPrice, vwap, low24h } = indicators;
+    const atr = indicators.atr;
+    if (!(typeof atr === 'number' && Number.isFinite(atr) && atr > 0) || vwap <= 0) return false;
```
**Reader census of the row (`git grep` at HEAD, whole repo, docs excluded):** `strategy-engine.ts` (the two sites above — positive control), `b79-0n-strategy-se-key-factory.test.ts` (mock value, removed), and two seed migrations (`2026-04-22b-initial-seed-data.sql`, `2026-05-06-b72-2-quant-lever-sweep.sql`). No boot assertion or required-key list reads it: `c` is a plain `getCachedNumbersForModule` map. ⇒ after this commit the row has no reader.
Migration `drizzle/migrations/2026-10-06-b-atr-bad-print-retire-daily-range-frac.sql`: `DELETE FROM module_constants WHERE module_name='strategy.vwap_pullback' AND constant_name='atr_fallback_daily_range_frac'` in a transaction with `lock_timeout 5s`; registered in `MANIFEST.txt`. Rollback `…-rollback.sql` (tracked, not registered) re-inserts the one live row read on staging 2026-10-06 (`'*','*','vwap_pullback','*'`, `0.10`) and deletes the ledger row; its header states revert the CODE first or together.
**Five diagnostic/validator callers** (A6) now get null for `vwap_pullback` without an ATR — no live lane (`#648` cleared at Step 2).

## 8. Tests
NEW `server/tests/unit/b-atr-bad-print.test.ts` — 18:
- E3 on the pre-registered fixtures: clean = plain mean; (a) an isolated returned wick ≤ 1.5× clean (control: plain mean > 2.5×); (b) three moving wide bars ≥ 80 % of the plain rise; (c) a gap-and-hold ≥ 80 %.
- A real window: GBP/USD Kraken 60-min bars 2026-09-23 06:00Z-20:00Z — plain mean > 10× the clean 13-TR mean; E3 ≤ 1.5×.
- Fail-closed edges: < period+1 bars ⇒ NaN / 0; a non-finite value ⇒ NaN / 0; string decimals read as numbers.
- C1: `getEffectiveATR` too few bars ⇒ null; normal ⇒ positive; `clampEffectiveATR` NaN / ∞ / 0 ⇒ null.
- `#371`: clamped ≤ raw on a clean, a spiked and a very volatile window.
- Pattern: throws on 0 / NaN / −1; valid ATR gives 1.5× / 2.5× geometry.
- Census fence over `server/` (tests excluded): the six sites call `atrOrZero`; no other file computes a true range inline except four named carve-outs (the shared file — positive control asserted; `#866` replay ATR; ADX in `market-regime.ts` and `calculateADXSeries` → row 2a1); the fallbacks are gone; the migration is registered and its rollback is not.
**Mutation check:** run against HEAD's `pattern-recognizer.ts`, `strategy-engine.ts` and `strategy-helpers.ts`, five of these tests fail.
Adjusted: `b79-0n-pattern-detect-required-assetclass.test.ts` — the omit-atr case now expects the `RangeError` (`@ts-expect-error` kept); `b79-0n-strategy-se-key-factory.test.ts` — retired key removed from the mock.
**Local:** tsc baseline 338 = 338. Unit suite 3,578 pass / 20 skipped. Four files fail to load locally, all untouched by this diff: two need a local Postgres (`b63-item12`, `b63-item16`), two hit a Windows-only `.mjs` import parse error (`b-staging-liveness-watch`, `b-tsc-baseline-fix`). CI is the gate.

## 9. What this does NOT do (honest residual)
- The fence regex catches the inline true-range SHAPE it was written for; a differently-written ATR elsewhere would pass it. It covers the census A1-A2 enumerated, not every possible spelling.
- ADX still sums raw true ranges (row 2a1, `B-ADX-TRUE-RANGE-SHARED`).
- E3 protects the ATR only; every other reader of the bars (regime inputs, strategy price reads) still sees a raw bad candle. Recorded in SIM 2.6.
- No live measurement yet: Step 7 reads the first post-deploy cycles (pattern-pool line shows `[PATTERN_ATR_DROPS]`; `atr_at_open` on new opens consistent with Kraken bars; no `invalid_atr` surge beyond new listings).
- Criterion 1 stays "a floor met on the complete determinate set (1/1)"; never quoted as a frequency (your §1d recording rule).

## 9b. Second-reader pass on the two absence claims, and what it turned up
`REVIEWER: claim-only · "what other states are consistent with: (1) every live ATR goes through true-range-atr.ts; (2) nothing reads atr_fallback_daily_range_frac" · 3 ATR substitutes + 1 side-effect found, no other true-range copy · re-derived y (by CC-B at ef4c7c8be)`
Its hits, each re-derived by me at `ef4c7c8be`:
1. **`server/core/utils/vts-real-score.ts:56`** — `safeATR = atr > 0 ? atr : currentPrice * 0.01` inside `computeRealHybridScore`. Callers: `vts-runner.ts:1941` and `xstock_spot/eval-cycle.ts:668`. **Reachable but discarded:** in `vts-runner` the `invalid_atr` DROP at `:1913` precedes the score; in the xStock eval cycle the score is computed at `:668` but the same signal is dropped at `:748` (`invalid_atr`) before it can simulate. ⇒ no outcome changes; it is the same fabricated-ATR class ruling (e) removed elsewhere, and after this batch it is reached more often (C2: MCE returns 0 under 15 bars). **DISPOSITION proposed: fold into this batch (1)** — return the function's existing neutral `0.50` (its own missing-data guard, `:52-54`) when `atr` is not a positive finite number, no fabricated ATR. Follow-up commit on this batch if you agree. (`safeRange`, the 2 % daily-range stand-in on `:58`, is a range, not the ATR — left alone unless you want it in the same commit.)
2. **`server/core/metrics/risk_index.ts:244`** — `atrRatio = stopDistancePercent / 2.0` when ATR is missing. **The whole module has zero importers** (`git grep -n risk_index ef4c7c8be -- '*.ts' '*.tsx' '*.mjs' '*.js'` returns only the file itself; that instrument found `true-range-atr` importers on the same ref). Orphaned legacy — includes a `correlationMatrix` singleton and four exported helpers. **DISPOSITION proposed: own rule-18 deletion, needs its own reader census — please place it** (I propose a small CC-B batch `B-RISK-INDEX-ORPHAN-REMOVAL` after row 2a1); not folded here because it is not an ATR change.
3. **`server/services/trade-safety.ts:554,557`** — `atr = entryPriceUSD * 0.02`, inside the LPCP block after the unconditional `return { ok: true }` at `:502`. That dormancy is a recorded decision (`Phase 8.8.3-AJ8: LPCP is DORMANT … guardrail values remain in DB for future phases`). **DISPOSITION: no work in this batch — withdrawn, citing AJ8**; if LPCP is ever re-enabled, this ATR stand-in must go with it (noted for whoever re-enables).
4. **Side-effect, not a break:** `decision-provenance.ts:55-57` hashes the whole module-constants set, so the row deletion produces a new `constants_hash` / `module_constants_version` entry. Expected; nothing alarms on it.
5. **`multi-timeframe-scanner.ts:193-199`** averages `high − low` over 3 bars as a pattern-clarity ratio — not an ATR, no stop/target/size depends on it. Out of scope.
Also confirmed by the reader: `b72-warmup.ts:193` only refuses boot on **zero** rows for `strategy.vwap_pullback`; the module keeps ~16 rows (counted from seed files, not the live DB — I will confirm on staging before the migration runs).

## 10. Asks
1. Rule on the `NaN`-inside / `0`-at-the-adapter design (§3).
2. Rule on throw-vs-null in `patternToTradeSignal` (§6).
3. Confirm the reader census for the retired row is sufficient for rule 18 (§7); `DELETED_COMPONENTS_LOG` row lands at Step 10 after deploy.
4. §9b: fold the `vts-real-score.ts` 1 % ATR into this batch (yes/no), and place the `risk_index.ts` orphan removal.

**CI:** run `37498280044` — TypeScript Check, Test Suite, Build, Docker Build all **success** on `ef4c7c8be`.
