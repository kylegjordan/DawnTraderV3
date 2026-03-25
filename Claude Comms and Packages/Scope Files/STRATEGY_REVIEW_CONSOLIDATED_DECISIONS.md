# Strategy Specification — Consolidated Review & Decisions

> **Date**: 2026-02-28
> **Reviewers**: xAI (Grok), Google Gemini, ChatGPT (OpenAI), Claude (Anthropic)
> **Document Reviewed**: STRATEGY_SPECIFICATION_12.3.2.md (2026-02-27 Draft)
> **Purpose**: Consolidated findings organized by consensus level. Kyle decides on each item.

---

## Overall Verdict

All four reviewers confirmed the specification is **architecturally sound** — formulas are dimensionally consistent, confidence scoring uses independent factors, risk management is regime-aware, and the documentation quality is strong. No reviewer identified a fundamentally flawed strategy concept.

Issues found fall into four categories: **bugs** (formulas that can produce wrong results), **missing safeguards** (edge cases not handled), **calibration** (constants that should be adjusted), and **enhancements** (optional improvements).

---

## SECTION A: BUGS — Must Fix Before Implementation

These are formula errors where the math can produce incorrect results.

---

### BUG-1: `pivot_shift` — Stop Selection Uses Wrong Function

**Flagged by**: ChatGPT, Claude (partial)
**Severity**: HIGH — can produce a wider stop than intended

**Problem**: The spec says "use the tighter of two stops" but the formula uses `min()`:
```
stopPrice = min(morningStarLow, currentPrice - PS_STOP_ATR_MULT × ATR)
```

For a BUY signal, both candidates are below entry. The "tighter" stop (closer to entry) is the HIGHER value. `min()` selects the LOWER value — the wider stop. The formula does the opposite of the stated intent.

**Additionally** (ChatGPT): The formula mixes `currentPrice` and `entryPrice`. Stops should use `entryPrice` consistently.

**Fix**:
```
const atrStop = entryPrice - PS_STOP_ATR_MULT × ATR(14)
const structureStop = morningStarLow
stopPrice = max(structureStop, atrStop)   ← selects tighter (higher) stop for BUY
```

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Accept fix (use max, use entryPrice consistently) ☐ Keep min() intentionally (wider stop = more room) |

---

### BUG-2: `support_bounce` — Proximity Score Can Go Negative

**Flagged by**: Claude
**Severity**: LOW — caught by final clamp, but undermines scoring intent

**Problem**: If price drifts slightly beyond the proximity boundary between condition check and confidence calculation:
```
proximityScore = (1 - (currentPrice - supportLevel) / (supportLevel × SB_PROXIMITY)) × SB_PROXIMITY_WEIGHT
```
At 1.6% above support (boundary is 1.5%), the inner term becomes negative, creating a penalty instead of zero.

**Fix**: Add floor:
```
proximityScore = max(0, (1 - (currentPrice - supportLevel) / (supportLevel × SB_PROXIMITY))) × SB_PROXIMITY_WEIGHT
```

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Accept fix (add max(0, ...)) |

---

### BUG-3: `reverse_impulse` — Confidence Uses Wrong Momentum Value

**Flagged by**: Claude
**Severity**: MEDIUM — can produce misleading confidence scores

**Problem**: Entry condition #3 checks `minMomentum(RI_LOOKBACK) <= threshold` — it finds the minimum momentum across the last 5 candles. But the confidence formula uses the CURRENT candle's `momentum`, not the min that triggered entry.

Example: A candle 3 bars ago had momentum -0.02 (extreme, passes entry). Current candle recovered to -0.003. Entry fires (the min was below threshold), but confidence scores the weak current value instead of the strong spike.

**Fix**: Use `minMomentum(RI_LOOKBACK)` in confidence scoring, not `momentum`:
```
momentumScore = min(RI_MAX_MOMENTUM_BONUS,
                    |minMomentum(RI_LOOKBACK) - RI_MOMENTUM_THRESHOLD| × RI_MOMENTUM_RATE)
```

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Accept fix (use minMomentum in confidence) |

---

### BUG-4: `volatility_edge` — fibQuality Can Go Negative

**Flagged by**: Claude
**Severity**: LOW — caught by final clamp, but creates penalty instead of zero

**Problem**: If `bcRetrace` falls outside the valid Fibonacci range (e.g., 0.1 from a degenerate pattern):
```
fibQuality = 1.0 - |0.1 - 0.618| / 0.382 = 1.0 - 1.356 = -0.356
```
Negative fibQuality creates a confidence penalty.

**Fix**: Add floor:
```
fibQuality = max(0, 1.0 - |bcRetrace - 0.618| / 0.382)
```

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Accept fix (add max(0, ...)) |

---

### BUG-5: `pivot_shift` — ADX Slope Score Can Go Negative

**Flagged by**: ChatGPT
**Severity**: LOW — entry condition already requires positive slope, but defense-in-depth

**Problem**: The adxSlopeScore formula `min(cap, adxSlope × rate)` can produce negative values if adxSlope is negative. Entry condition #4 requires positive slope, but a guard prevents edge cases.

**Fix**: Add floor:
```
adxSlopeScore = max(0, min(PS_MAX_ADX_BONUS, adxSlope × PS_ADX_SCORE_RATE))
```

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Accept fix (add max(0, ...)) |

---

### BUG-6: `volatility_edge` — Measured Move Target Base May Be Wrong

**Flagged by**: Claude
**Severity**: MEDIUM — depends on design intent

**Problem**: Classic ABCD measured move theory measures C→D from the C TROUGH (cPointLow), not the C HIGH (cPointHigh). The current formula:
```
targetPrice = cPointHigh + (bPointHigh - aPointLow) × 0.90
```
Underestimates the target by the width of the C consolidation range (cPointHigh - cPointLow). Using cPointLow as the base would match textbook harmonic pattern theory. Using cPointHigh is more conservative.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Use cPointLow (textbook, wider target) ☐ Keep cPointHigh (conservative, current spec) |

---

## SECTION B: MISSING SAFEGUARDS — All Reviewers Agree These Are Needed

These are edge cases that all or most reviewers independently flagged.

---

### GUARD-1: Minimum Stop Distance

**Flagged by**: ChatGPT, Claude, xAI (3/4 reviewers)
**Consensus**: STRONG

**Problem**: If ATR is extremely small or the formation low is very close to entry, the stop can be within a single tick. This produces absurdly high R:R, stops hit by the spread alone, and essentially random trades.

**Proposed fix** (ChatGPT's version, endorsed by Claude):
```
MIN_STOP_DISTANCE_BPS = 20  (0.2% minimum)

After calculating stopPrice:
  if |entryPrice - stopPrice| / entryPrice < MIN_STOP_DISTANCE_BPS / 10000:
    reject signal (return null)
```

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Accept (MIN_STOP_DISTANCE_BPS = 20, 0.2%) ☐ Different value: _____ |

---

### GUARD-2: ATR Floor and Ceiling

**Flagged by**: ChatGPT, Claude, xAI (3/4 reviewers)
**Consensus**: STRONG

**Problem**:
- Extremely small ATR (stablecoins, price stalls): stops/targets too tight, meaningless trades
- Extremely large ATR (flash crash): stops/targets absurdly wide, impractical risk

**Proposed fix** (Claude's version):
```
ATR_MIN_RATIO = 0.001   (0.1% of price — below this, asset is too flat to trade)
ATR_MAX_RATIO = 0.10    (10% of price — above this, cap ATR for calculations)

effectiveATR = clamp(ATR(14), currentPrice × ATR_MIN_RATIO, currentPrice × ATR_MAX_RATIO)
```

xAI additionally suggests: `if ATR < 0.001 × currentPrice, reject signal entirely`

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Accept (clamp ATR to 0.1%-10% of price) ☐ Reject below floor, clamp at ceiling ☐ Different values: _____ |

---

### GUARD-3: Zero-Risk Division Protection

**Flagged by**: ChatGPT, xAI (2/4 reviewers)
**Consensus**: MODERATE (overlaps with GUARD-1)

**Problem**: R:R formula divides by `risk = entryPrice - stopPrice`. If risk = 0, division by zero.

**Proposed fix**: Already covered by GUARD-1 (minimum stop distance). If GUARD-1 is accepted, this is automatically resolved.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Covered by GUARD-1 (no additional action) |

---

### GUARD-4: Fee-Adjusted R:R Check

**Flagged by**: xAI, ChatGPT (2/4 reviewers)
**Consensus**: MODERATE

**Problem**: R:R uses raw prices but doesn't account for trading fees (~0.1% on Kraken) and slippage. A signal with R:R of 1.5 raw might be R:R 1.3 after costs.

**xAI proposal**: Increase MIN_RR_RATIO to 1.6 to implicitly cover fees.

**ChatGPT proposal**: Adjust R:R formula to account for costs explicitly:
```
reward = (target - entry) - costs
risk   = (entry - stop) + costs
```

**Note**: DawnTrader already has a canonical cost model (fixed in Directive 12.1.2, Batch 2). The Signal Quality Evaluator and VTS runner both use `isSignalProfitable()` which accounts for entry+exit fees and slippage. The R:R check in these strategies is a PRE-filter before the canonical cost model runs. Adjusting the pre-filter to 1.6 adds a safety margin; adjusting the formula to include costs would duplicate logic already downstream.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Raise MIN_RR_RATIO to 1.6 (simple, accounts for costs) ☐ Keep at 1.5 (canonical cost model handles it downstream) ☐ Explicit cost adjustment in formula |

---

## SECTION C: CALIBRATION — Constants That Should Be Adjusted

Items where reviewers identified specific values that need tuning. Organized by consensus strength.

---

### CAL-1: `support_bounce` Cluster Tolerance — Too Tight for Crypto

**Flagged by**: xAI, ChatGPT, Claude (3/4)
**Consensus**: STRONG — all three agree 0.5% is too tight for BTC

**Current**: `SB_CLUSTER_TOLERANCE = 0.005` (0.5%)

**Problem**: For BTC at $90K, 0.5% = $450. Bounces at $87,200 and $87,800 (clearly the same support zone) would NOT cluster because they're 0.69% apart.

**Proposals**:
- xAI: Make dynamic: `0.005 × (1 + volatility/0.01)`
- ChatGPT: `max(0.5%, 0.5 × ATR/price)`
- Claude: `max(SB_CLUSTER_TOLERANCE, ATR(14) / currentPrice × 0.5)`

All three converge on the same idea: scale tolerance with the asset's volatility.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ ATR-scaled: `max(0.005, ATR/price × 0.5)` — adapts per asset ☐ Fixed increase to 0.01 (1%) — simpler, works for BTC ☐ Keep 0.005 |

---

### CAL-2: `support_bounce` Minimum Touches — 2 Too Permissive

**Flagged by**: xAI, ChatGPT (2/4)
**Consensus**: MODERATE

**Current**: `SB_MIN_TOUCHES = 2`

**Problem**: A support level with only 2 touches is statistically weak. In crypto's volatile environment, two touches could be coincidence.

**Proposal**: Increase to 3.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Increase to 3 ☐ Keep at 2 |

---

### CAL-3: `adaptive_flow` — Needs Trend Suppression Condition

**Flagged by**: xAI, ChatGPT, Claude (3/4)
**Consensus**: STRONG

**Problem**: 3 momentum inversions in 20 candles can occur in a trending market with minor pullbacks. If the regime classifier has any latency in detecting a transition from CHOP to TREND, adaptive_flow could fire on a new trend's early pullbacks.

**Proposals**:
- Claude: Add `ADX(14) < 25` (standard "no trend" threshold)
- ChatGPT: Add `|netReturn(20)| < X` or `ADX < 20-25`
- xAI: Add `|momentum| < 0.002 average` (small swings only)

All converge on: add an explicit anti-trend condition. ADX < 25 is the cleanest.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Add `ADX(14) < 25` as entry condition #6 ☐ Add `|avgMomentum(20)| < 0.002` instead ☐ Both (belt and suspenders) ☐ Rely on regime classifier only |

---

### CAL-4: `defensive_hedge` Correlation Window — 30 Candles Marginal

**Flagged by**: xAI, ChatGPT, Claude (3/4) — but with CONFLICTING recommendations

**Current**: `DH_CORR_WINDOW = 30`

**Problem**: Statistical significance of Pearson correlation at n=30 is borderline.

**Proposals**:
- xAI: Increase to 50
- ChatGPT: Make timeframe-scaled, or default to 60
- Claude: 30 is actually BETTER for crypto (longer windows blend multiple regimes), but consider Spearman rank correlation instead of Pearson (more robust to outliers/flash crashes)

**Key tension**: xAI/ChatGPT want MORE data for statistical robustness. Claude argues that in fast-moving crypto, more data = staler correlation estimates that blend multiple regimes.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Increase to 50 (more statistically robust) ☐ Keep at 30 (more regime-relevant for crypto) ☐ Keep at 30 but switch to Spearman rank correlation (Claude's hybrid recommendation) |

---

### CAL-5: `pivot_shift` ADX Slope Minimum — 0.5 Too Permissive

**Flagged by**: Claude (1/4)
**Consensus**: WEAK (single reviewer)

**Current**: `PS_ADX_SLOPE_MIN = 0.5`

**Problem**: ADX can fluctuate ±1-2 points on noise alone in crypto. A 0.5-point slope could be random jitter, not genuine trend formation.

**Proposal**: Raise to 1.0, or require slope > 0.5 for two consecutive candles.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Raise to 1.0 ☐ Require 2 consecutive positive slopes ☐ Keep at 0.5 |

---

### CAL-6: `morning_star` Volume Multiplier — 1.2 Too Low

**Flagged by**: xAI (1/4)
**Consensus**: WEAK (single reviewer)

**Current**: `MS_VOL_MULT = 1.2`

**Problem**: xAI argues crypto reversals need more volume conviction. 1.2× might let through marginal signals on quiet pairs.

**Proposal**: Increase to 1.5.

**Counter**: The original spec rationale says reversals don't need as much volume as breakouts (which use 1.5-2.0×). Morning stars are about price structure, not volume explosion.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Increase to 1.5 ☐ Keep at 1.2 |

---

### CAL-7: `volatility_edge` Target ATR Multiplier — 2.5 vs 3.0

**Flagged by**: xAI (1/4)
**Consensus**: WEAK (single reviewer)

**Current**: `VE_TARGET_ATR_MULT = 2.5`

**Problem**: xAI argues HIGH_VOL_IMPULSE regime has bigger swings, so 3.0× would capture more profit.

**Counter**: The measured move target is the primary exit; ATR target is the fallback (use the smaller of the two). Increasing the ATR fallback has limited impact since the measured move usually governs.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Increase to 3.0 ☐ Keep at 2.5 |

---

### CAL-8: Counter-Trend R:R Minimum — 1.5 vs 2.0

**Flagged by**: xAI (1/4)
**Consensus**: WEAK (Claude explicitly recommends keeping 1.5 for now)

**Current**: `MIN_RR_RATIO = 1.5` for all strategies

**Problem**: Counter-trend strategies (reverse_impulse, defensive_hedge) have lower expected win rates. A higher R:R minimum would compensate.

**xAI proposal**: 2.0 for counter-trend strategies.
**Claude counter**: With already-tight targets and strict entry requirements, raising R:R to 2.0 might filter out too many signals. Revisit after backtesting.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ 2.0 for counter-trend (reverse_impulse, defensive_hedge) ☐ Keep 1.5 for all, revisit after backtesting |

---

### CAL-9: `defensive_hedge` Confidence Scoring — Too Low for Marginal Signals

**Flagged by**: Claude (1/4)
**Consensus**: WEAK (single reviewer, but with detailed math showing the problem)

**Current weights**: DH_PATTERN_WEIGHT = 0.35, DH_DECORR_WEIGHT = 0.30

**Problem**: Claude calculated that a marginal defensive_hedge signal (strength 0.58, correlation 0.25, volOffset 0.12) scores only 0.27 — well below the 0.50-0.60 target range. The decorrelation score has a cliff-like dropoff near the correlation threshold.

**Proposal**: Raise DH_PATTERN_WEIGHT to 0.45, lower DH_DECORR_WEIGHT to 0.25.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Accept rebalance (0.45 pattern / 0.25 decorrelation) ☐ Keep current (0.35 / 0.30) — low scores are acceptable, means higher bar |

---

### CAL-10: `adaptive_flow` Stop — Not Structure-Based

**Flagged by**: Claude (1/4)
**Consensus**: WEAK (single reviewer)

**Current**: Stop is purely ATR-based (no structural anchor).

**Problem**: Every other strategy anchors its stop to market structure (pattern low, support level, formation low). Adaptive_flow uses only `currentPrice - 1.5 × ATR`, which isn't tied to any identifiable price level.

**Proposal**: Use the lower of the three soldiers formation low and the ATR stop:
```
stopPrice = min(threeSoldiersLow × (1 - AF_STOP_BUFFER), currentPrice - AF_STOP_ATR_MULT × ATR(14))
```

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Accept (add structure-based stop using pattern low) ☐ Keep ATR-only |

---

### CAL-11: `defensive_hedge` Correlation Threshold — 0.30 Might Be Too Strict

**Flagged by**: Claude (1/4)
**Consensus**: WEAK

**Current**: `DH_MAX_CORRELATION = 0.30`

**Problem**: Most crypto altcoins correlate 0.5-0.9 with BTC. A 0.30 threshold is very strict — few assets will qualify, meaning very few signals.

**Claude proposal**: Keep 0.30 if asset universe is large. If < 20 pairs, raise to 0.45.

**Context**: DawnTrader currently scans ~40-60 Kraken pairs. Not all are liquid.

| Decision | Options |
|----------|---------|
| **KYLE** | ☐ Keep at 0.30 (strict, fewer but higher quality signals) ☐ Raise to 0.40 (moderate, more signals) ☐ Raise to 0.45 (loose, most signals) |

---

## SECTION D: ENHANCEMENTS — Nice to Have, Non-Blocking

These are improvements that add robustness but aren't required for a correct implementation.

---

### ENH-1: Explicit Regime Check in Entry Conditions

**Flagged by**: Claude
**Issue**: Regime assignments are described in the spec but not listed as entry conditions. Should be explicit.
**Action**: Add note to spec that regime filtering occurs at Signal Orchestrator level before strategy evaluation.

| Decision | ☐ Add note ☐ Add as explicit condition in each strategy |

---

### ENH-2: `morning_star` Distance-from-SMA Filter

**Flagged by**: Claude
**Issue**: A morning star forming 5%+ below SMA could be a falling knife, not a reversal.
**Proposal**: Reject if `(SMA - currentPrice) / SMA > 0.05`.

| Decision | ☐ Add filter ☐ Defer to backtesting |

---

### ENH-3: `inside_bar_reversal` SELL RSI Filter Tightening

**Flagged by**: Claude
**Issue**: RSI > 35 for SELL allows selling near oversold territory (RSI 36).
**Proposal**: Tighten to RSI > 45 for SELL signals.

| Decision | ☐ Tighten to 45 ☐ Keep at 35 |

---

### ENH-4: Regime Stability Filter for Hybrids

**Flagged by**: xAI
**Issue**: A regime transition < 3 candles old might be unstable.
**Proposal**: No hybrid signal if regime changed within last 3 candles.

| Decision | ☐ Add filter ☐ Defer |

---

### ENH-5: `defensive_hedge` BTC Self-Correlation Short-Circuit

**Flagged by**: Claude
**Issue**: If target asset is BTC/USD, correlation with itself is 1.0 (always fails threshold). Wastes computation.
**Proposal**: `if symbol === 'BTC/USD': return null` short-circuit.

| Decision | ☐ Add ☐ Skip (threshold catches it anyway) |

---

### ENH-6: `volatility_edge` Dynamic Measured Move Multiplier

**Flagged by**: xAI
**Issue**: Fixed 90% of measured move could be dynamic.
**Proposal**: 0.95 if volPercentile > 90 (more conviction = closer to full target).

| Decision | ☐ Add dynamic scaling ☐ Keep fixed at 0.90 |

---

### ENH-7: `defensive_hedge` Use Spearman Rank Instead of Pearson

**Flagged by**: Claude
**Issue**: Pearson is sensitive to outliers (flash crashes can distort correlation).
**Proposal**: Spearman rank correlation is more robust to extreme values.

| Decision | ☐ Switch to Spearman ☐ Keep Pearson ☐ Defer to backtesting |

---

### ENH-8: Document Max Pre-Clamp Confidence Sums

**Flagged by**: xAI, Claude (provided the table)
**Issue**: Helpful for implementation verification.
**Action**: Add Claude's confidence bounds table to the spec.

| Strategy | Max Pre-Clamp |
|----------|--------------|
| morning_star | 1.00 |
| inside_bar_reversal | 1.00 |
| support_bounce | 0.93 |
| pivot_shift | 0.93 |
| reverse_impulse | 0.95 |
| defensive_hedge | 0.88 |
| adaptive_flow | 0.88 |
| volatility_edge | 0.95 |

| Decision | ☐ Add table to spec |

---

### ENH-9: Direction Completeness Note

**Flagged by**: ChatGPT
**Issue**: Most strategies are BUY-only. Only inside_bar_reversal has explicit SELL logic.
**Proposal**: Add explicit note to spec that all other strategies are BUY-only by design (crypto systems typically favor long positions due to market structure).

| Decision | ☐ Add note ☐ Defer |

---

### ENH-10: `reverse_impulse` Momentum Threshold Stricter

**Flagged by**: xAI
**Issue**: RSI < 35 and momentum < -0.005 are partially correlated (~60% overlap). Making momentum threshold stricter would better differentiate the two conditions.
**Proposal**: Change `RI_MOMENTUM_THRESHOLD` from -0.005 to -0.01.

| Decision | ☐ Change to -0.01 ☐ Keep at -0.005 |

---

## SECTION E: ITEMS WITH NO ACTION NEEDED

These were flagged by reviewers but don't require changes:

1. **Dimensional consistency** — All four reviewers confirm formulas are dimensionally correct.
2. **Confidence bounds** — All strategies stay within [0, 1] after clamping. No action needed beyond the BUG fixes for intermediate negatives.
3. **Stop price positioning** — All BUY stops are below entry, all SELL stops above. Verified by all four.
4. **Target prices** — All BUY targets above entry. Verified by all four.
5. **R:R check logic** — Works correctly in all cases. Verified by all four.
6. **Counter-trend entry strictness** — All reviewers confirm reverse_impulse and defensive_hedge have appropriately strict entry requirements.
7. **Volume confirmation** — Present in all 8 strategies. Verified by all four.
8. **ATR-based sizing approach** — Unanimously endorsed as correct for crypto.

---

## Decision Summary Template

For Kyle's convenience — mark each decision and return this document:

| Item | Decision |
|------|----------|
| BUG-1: pivot_shift stop min→max | |
| BUG-2: support_bounce proximity floor | |
| BUG-3: reverse_impulse momentum value | |
| BUG-4: volatility_edge fibQuality floor | |
| BUG-5: pivot_shift ADX score floor | |
| BUG-6: volatility_edge target base | |
| GUARD-1: Min stop distance | |
| GUARD-2: ATR floor/ceiling | |
| GUARD-4: Fee-adjusted R:R | |
| CAL-1: Cluster tolerance scaling | |
| CAL-2: Min touches 2→3 | |
| CAL-3: Adaptive flow trend suppression | |
| CAL-4: Correlation window | |
| CAL-5: ADX slope minimum | |
| CAL-6: Morning star vol mult | |
| CAL-7: VE target ATR mult | |
| CAL-8: Counter-trend R:R | |
| CAL-9: DH confidence rebalance | |
| CAL-10: AF structure-based stop | |
| CAL-11: DH correlation threshold | |
| ENH-1 through ENH-10 | |

---

*Awaiting Kyle's decisions before updating the specification.*
