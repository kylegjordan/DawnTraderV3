# Crypto Strategy Recalibration — Consensus Analysis

**Date**: 2026-03-10
**Participants**: Claude (Anthropic), Gemini (Google), ChatGPT (OpenAI), Copilot (Microsoft)
**Purpose**: Identify consensus, disagreements, and next steps for crypto-calibrating DawnTrader V3 strategy thresholds

---

## Universal Agreement (All 4 LLMs Agree)

Before diving into specifics, **all four LLMs agree on these foundational points**:

1. ✅ **The diagnosis is correct** — current thresholds are stock-calibrated and too restrictive for crypto
2. ✅ **ATR-based dynamic thresholds are preferred** over simply widening fixed percentages
3. ✅ **Regime-conditional parameters should be implemented** (though timing differs — see disagreements)
4. ✅ **Asset-class abstraction should be built now**, not retrofitted later
5. ✅ **DHMA microstructure strategy should be deprioritized** without Level 2 order book data
6. ✅ **VWAP strategies should be disabled or down-weighted** for low-liquidity altcoins
7. ✅ **Tolerance zones for boundary touches** are more important than reducing the count
8. ✅ **Over-relaxation of confirmation gates** (pattern strength, percentile ranks) is more dangerous than over-relaxation of price/distance thresholds
9. ✅ **Counter-trend strategies** (reverse_impulse, defensive_hedge) should maintain stricter thresholds than trend-following strategies

---

## Parameter-by-Parameter Consensus Status

### ✅ CONSENSUS REACHED (9 of 14 parameters)

These parameters have sufficient agreement to implement without further debate.

---

#### 1. Mean Reversion — Deviation Threshold
**CONSENSUS: Switch to ATR-based dynamic threshold**

| LLM | Recommendation |
|-----|---------------|
| Gemini | Replace fixed % with `Price < VWAP - (2.0 × ATR(14))` |
| ChatGPT | `max(3.0%, 1.25-1.5 × ATR%)`, hard cap ~4.0% |
| Claude | `max(3.5%, 1.5 × ATR(14) / price)` |
| Copilot | ATR-based, floor 3.0%, max 5.0% |

**Agreed value**: `max(3.0%, 1.5 × ATR(14) / price)`
- All four recommend ATR-based over fixed percentage ✅
- Floor ranges from 3.0% (ChatGPT, Copilot) to 3.5% (Claude) — use **3.0%** as floor (conservative)
- ATR multiplier converges on **1.5×** (Claude, ChatGPT both explicit; Gemini at 2.0× is outlier)
- Cap at **5.0%** to prevent extreme alt deviation from dominating

---

#### 3. Breakout — Volume Multiplier
**CONSENSUS: 1.5×**

| LLM | Recommendation |
|-----|---------------|
| Gemini | 1.5× (1.3× too loose) |
| ChatGPT | 1.4-1.6× (tiered by liquidity) |
| Claude | 1.5× |
| Copilot | 1.4-1.6× + percentile filter |

**Agreed value**: **1.5×** baseline
- Universal rejection of 2.0× as too strict ✅
- Universal rejection of 1.3× as too loose ✅
- All converge on 1.5× (±0.1) as the sweet spot
- ChatGPT/Copilot suggest volume percentile as supplementary — good idea for Phase 2

---

#### 5. VWAP Pullback — Proximity Threshold
**CONSENSUS: 3.0%**

| LLM | Recommendation |
|-----|---------------|
| Gemini | 3.0% |
| ChatGPT | 1.5-2.5% (fallback 2.0%, prefer ATR-scaled) |
| Claude | 3.0% |
| Copilot | 3-4% |

**Agreed value**: **3.0%**
- Gemini and Claude converge exactly at 3.0% ✅
- ChatGPT is more conservative (2.0-2.5%), Copilot slightly wider (3-4%)
- 3.0% is the natural midpoint and has two direct votes

---

#### 8. Pivot Shift — RSI Neutral Zone
**CONSENSUS: Widen to 35-65**

| LLM | Recommendation |
|-----|---------------|
| Gemini | 35-65 ✅ |
| ChatGPT | 38-62 baseline, 35-65 permissive |
| Claude | 35-65 ✅ |
| Copilot | 38-62 or 37-63 |

**Agreed value**: **35-65**
- All agree the current 40-60 is too narrow ✅
- Gemini and Claude both recommend 35-65 directly
- ChatGPT and Copilot prefer 38-62 as baseline but acknowledge 35-65 is acceptable
- **Split decision**: Go with **35-65** (two direct votes, two soft endorsements). The downstream Morning Star pattern + ADX slope + volume gate provide quality control

---

#### 10. Volatility Edge — Volatility Percentile Gate
**CONSENSUS: 70th percentile**

| LLM | Recommendation |
|-----|---------------|
| Gemini | Keep 80th (reject relaxation) |
| ChatGPT | 70th (65th too loose, aggressive 65th for liquid pairs only) |
| Claude | 70th |
| Copilot | 70th |

**Agreed value**: **70th percentile**
- Three of four recommend 70th ✅
- Gemini's 80th argument (self-relative percentile is already pair-adaptive) has merit but is overruled by 3:1 majority
- All agree 65th is too loose

---

#### 11. Adaptive Flow — Volatility Percentile Gate
**CONSENSUS: 60th percentile**

| LLM | Recommendation |
|-----|---------------|
| Gemini | Keep 70th (reject relaxation) |
| ChatGPT | 60-65th |
| Claude | 60th |
| Copilot | 55-60th, anchor 60th |

**Agreed value**: **60th percentile**
- Three of four converge on 60th ✅
- Gemini again argues against relaxation (overruled 3:1)
- All agree 55th is too close to median

---

#### 12. Adaptive Flow — ADX Anti-Trend Gate
**CONSENSUS: ADX < 30**

| LLM | Recommendation |
|-----|---------------|
| Gemini | 30 (35 bleeds into trend territory) |
| ChatGPT | 28-30 baseline |
| Claude | 30 |
| Copilot | 30 default |

**Agreed value**: **ADX < 30**
- Universal convergence on 30 ✅
- All reject 35 as too loose
- ChatGPT's 28 is close enough to round up

---

#### 13. Pattern Strength Minimums
**CONSENSUS: Selective relaxation, NOT uniform -0.10**

All four LLMs reject a blanket -0.10 reduction. All agree counter-trend strategies should maintain higher bars. The specific values have minor variance but converge:

| Strategy | Current | Gemini | ChatGPT | Claude | Copilot | **Consensus** |
|----------|---------|--------|---------|--------|---------|---------------|
| Morning Star | 0.60 | Keep 0.60 | 0.55 | 0.50 | 0.55 | **0.55** |
| Inside Bar (compression) | ≤ 0.75 | Keep | 0.80 OK | 0.80 OK | 0.80 OK | **≤ 0.80** |
| Support Bounce | 0.55 | Keep | 0.48-0.50 | 0.50 | 0.50 | **0.50** |
| Pivot Shift | 0.55 | Keep | 0.50 | 0.45 | 0.50 | **0.50** |
| Reverse Impulse | 0.65 | Keep | 0.58-0.60 | 0.55 | 0.60 | **0.58** |
| Defensive Hedge | 0.55 | Keep | 0.50 | 0.50 | 0.50 | **0.50** |
| Adaptive Flow | 0.55 | Keep | 0.50 | 0.45 | 0.50 | **0.50** |

Note: Gemini consistently argues against any relaxation. The other three converge on the values shown.

---

#### 14. Boundary Touch Counts
**CONSENSUS: 2 touches + ATR/4 tolerance zone**

| LLM | Count | Tolerance |
|-----|-------|-----------|
| Gemini | Keep 3 | Add ATR-based tolerance |
| ChatGPT | 2 + tolerance | 0.25-0.5 ATR or 0.5-0.75% |
| Claude | 2 + ATR/4 tolerance | ATR/4 specifically |
| Copilot | 2 + tolerance | touch within band |

**Agreed value**: **2 touches with ATR/4 tolerance zone**
- 3:1 in favor of reducing to 2 touches (Gemini wants to keep 3 but add tolerance)
- Universal agreement on adding a tolerance zone ✅
- Claude's ATR/4 is the most specific and well-reasoned calibration

---

### ⚠️ DISAGREEMENTS — NEED RESOLUTION (5 of 14 parameters)

These parameters have meaningful splits that need one more round of discussion.

---

#### 2. Breakout — Consolidation Range Width
**STATUS: Agree on ATR-based, disagree on fixed fallback**

| LLM | Fixed Range | ATR-based |
|-----|-------------|-----------|
| Gemini | 6% ceiling, scale by asset | Not specified |
| ChatGPT | 4-6%, max 5% fallback | Width ≤ 2.0-2.5 × ATR |
| Claude | 5% floor, 6% ceiling | `max(5%, 3.0 × ATR / price)` floor, `max(6%, 5.0 × ATR / price)` ceiling |
| Copilot | 4-7% | 1.5-2.5 × ATR/price |

**Points of agreement**:
- All reject current 3% as too tight ✅
- All prefer ATR-based scaling ✅
- All cap somewhere in the 5-8% range ✅

**Points of disagreement**:
- **Floor**: Ranges from 4% (ChatGPT, Copilot) to 5% (Claude). Gemini doesn't specify a floor.
- **ATR multiplier**: ChatGPT says 2.0-2.5×, Claude says 3.0× floor / 5.0× ceiling, Copilot says 1.5-2.5×
- **Whether to use a floor+ceiling or just a ceiling**: Claude uses dual bounds, others use single bound

**Proposed resolution**: `max(4%, 2.5 × ATR(14) / price)` as floor, `max(7%, 5.0 × ATR(14) / price)` as ceiling. This takes the middle ground: 4% floor (ChatGPT/Copilot), 7% ceiling (Copilot), 2.5× ATR floor multiplier (ChatGPT/Copilot midpoint), 5.0× ATR ceiling (Claude).

---

#### 4. VWAP Bounce — Proximity Threshold
**STATUS: Significant spread**

| LLM | Recommendation |
|-----|---------------|
| Gemini | 1.5% |
| ChatGPT | 0.8-1.5% (tiered by liquidity) |
| Claude | 1.0% |
| Copilot | 1.5-2.5% |

**Points of agreement**:
- All reject current 0.5% as too tight ✅
- All agree VWAP bounce should be tighter than VWAP pullback ✅

**Points of disagreement**:
- Range spans from 0.8% (ChatGPT low end) to 2.5% (Copilot high end) — a 3:1 ratio
- Claude argues 2.0% is too loose (dilutes "bounce" meaning)
- Copilot argues 1.5-2.5% is needed for crypto wicks

**Proposed resolution**: **1.5%** (Gemini's recommendation, ChatGPT's upper bound, Copilot's lower bound, and only 0.5% above Claude's vote). This is the natural convergence point.

---

#### 6. Range Trading — Duration & Touches
**STATUS: Mixed agreement**

| LLM | Width | Duration | Touches |
|-----|-------|----------|---------|
| Gemini | 4-6% | Keep 12h | Keep 3 + tolerance |
| ChatGPT | 4-7% | 8-12h | 2 + tolerance |
| Claude | 3-6% ATR-scaled | 8h | 2 + ATR/4 tolerance |
| Copilot | 4-7% | 8-12h | 2 + tolerance |

Width: Already covered in item 2 (ATR-scaled consensus).

**Duration disagreement**:
- Gemini: Keep 12h (8h is "a pause, not a structural range")
- Claude: 8h
- ChatGPT/Copilot: 8-12h range

**Touch count disagreement**:
- Gemini: Keep 3 (two is coincidence, three is confirmed)
- ChatGPT/Claude/Copilot: 2 + tolerance

**Proposed resolution**: **Duration: 10 hours** (compromise between Gemini's 12h and Claude's 8h). **Touches: 2 + ATR/4 tolerance** (3:1 vote). Gemini's concern about "two being a coincidence" is addressed by the tolerance zone — two touches within an ATR/4 zone are more meaningful than three exact-price touches.

---

#### 7. Reverse Impulse — RSI Oversold Gate
**STATUS: Genuine split**

| LLM | Recommendation | Rationale |
|-----|---------------|-----------|
| Gemini | Keep 35 (or tighten to 30) | RSI 38 in crypto is often just a downtrend |
| ChatGPT | 38 baseline (40 only with exhaustion filter) | Sweet spot between deep oversold and knife-catching |
| Claude | 38 | Below neutral, requires genuine selling pressure |
| Copilot | 38-40 + confluence filter | 40 OK if paired with ATR/Bollinger confluence |

**Points of agreement**:
- All reject RSI < 40 as a standalone gate (too loose) ✅
- All agree 35 is at least somewhat restrictive for crypto ✅

**Points of disagreement**:
- Gemini strongly argues to keep 35 or go lower (30) — "RSI 38 is just a strong downtrend"
- Others converge on 38 as a practical compromise
- Copilot wants confluence (RSI + price/ATR condition), not just RSI alone

**Proposed resolution**: **RSI < 38**. Gemini is the outlier at 3:1 against. However, Gemini's concern about falling knives is valid. The existing quant conditions (momentum threshold < -1%, volume ≥ 1.5×, pattern strength ≥ 0.55/0.58) already provide the confluence that Copilot recommends. RSI 38 with four other confirming conditions is not knife-catching.

---

#### 9. Defensive Hedge — BTC Correlation Maximum
**STATUS: Widest disagreement of all parameters**

| LLM | Threshold | Window |
|-----|-----------|--------|
| Gemini | 0.50 | Keep 30 bars |
| ChatGPT | 0.40-0.45, shorter window (12-20 bars) |
| Claude | 0.40 | Keep 30 bars |
| Copilot | 0.50-0.55, regime-conditional up to 0.60 |

**Points of agreement**:
- All reject current 0.30 as unrealistic for crypto ✅
- All agree some relaxation is needed ✅

**Points of disagreement**:
- Threshold: 0.40 (ChatGPT/Claude) vs 0.50 (Gemini/Copilot) — a significant gap
- Window: Keep 30 (Gemini/Claude) vs shorten to 12-20 (ChatGPT)
- Copilot wants regime-conditional relaxation up to 0.60

**Proposed resolution**: **0.45, 30-bar window**. This is the geometric midpoint between the two camps. At 0.45, the asset is in the bottom third of crypto correlations — genuinely more independent than typical. The 30-bar window stays (Claude's point about Spearman needing 20-25+ data points is mathematically correct). Regime-conditional expansion is a Phase 2 optimization.

---

## Architecture Consensus

### A. Strategy Viability
| Decision | Status |
|----------|--------|
| DHMA: Deprioritize without L2 data | ✅ **All 4 agree** |
| VWAP: Gate on minimum liquidity threshold | ✅ **All 4 agree** ($500K daily volume minimum) |
| Range Trading: Keep but lower regime weight in trend/impulse | ✅ **All 4 agree** |
| No strategy is fundamentally broken for crypto | ✅ **3 of 4 agree** (Gemini less explicit) |

### B. Regime-Conditional Parameters
| Decision | Status |
|----------|--------|
| Should be implemented | ✅ **All 4 agree** |
| When to implement | ⚠️ **Split**: Claude says Phase 2 (get baseline first). Others say now. |

**Proposed resolution**: Implement **static crypto thresholds first** (this batch), then add regime-conditioning in a subsequent batch after observing baseline signal frequency. Claude's argument about "tuning two dimensions simultaneously" is pragmatically sound.

### C. Asset-Class Abstraction
| Decision | Status |
|----------|--------|
| Build profiles now | ✅ **All 4 agree** |
| Implementation approach | Config object / profile layer (not database-backed) |

### D. Risk of Over-Relaxation
| Decision | Status |
|----------|--------|
| Relax price/distance thresholds freely | ✅ **All 4 agree** (low risk) |
| Relax volume/percentile gates carefully | ✅ **All 4 agree** (moderate risk) |
| Relax RSI oversold + BTC correlation minimally | ✅ **All 4 agree** (high risk) |
| Gemini's key insight | "Relax the price distance thresholds while maintaining strict confirmation thresholds" |

---

## Summary: Final Proposed Values

| # | Parameter | Current | Consensus Value | Status |
|---|-----------|---------|-----------------|--------|
| 1 | Mean Reversion Deviation | 2.5% fixed | `max(3.0%, 1.5 × ATR(14) / price)` | ✅ Consensus |
| 2 | Breakout Range Width | Max 3% | `max(4%, 2.5 × ATR / price)` floor, `max(7%, 5.0 × ATR / price)` ceiling | ⚠️ Proposed |
| 3 | Breakout Volume Multiplier | 2.0× | **1.5×** | ✅ Consensus |
| 4 | VWAP Bounce Proximity | 0.5% | **1.5%** | ⚠️ Proposed |
| 5 | VWAP Pullback Proximity | 2.0% | **3.0%** | ✅ Consensus |
| 6a | Range Trading Width | 3% min | ATR-scaled (same as #2) | ✅ Consensus |
| 6b | Range Trading Duration | 12 hours | **10 hours** | ⚠️ Proposed |
| 6c | Range Trading Touches | 3 exact | **2 + ATR/4 tolerance** | ✅ Consensus (3:1) |
| 7 | Reverse Impulse RSI | < 35 | **< 38** | ✅ Consensus (3:1) |
| 8 | Pivot Shift RSI Zone | 40-60 | **35-65** | ✅ Consensus |
| 9 | Defensive Hedge BTC Corr | < 0.30 | **< 0.45** | ⚠️ Proposed |
| 10 | Volatility Edge Percentile | ≥ 80th | **≥ 70th** | ✅ Consensus |
| 11 | Adaptive Flow Percentile | ≥ 70th | **≥ 60th** | ✅ Consensus |
| 12 | ADX Anti-Trend Gate | < 25 | **< 30** | ✅ Consensus |
| 13 | Pattern Strength Mins | 0.55-0.65 | Selective relaxation (see table above) | ✅ Consensus approach |
| 14 | Boundary Touches | 3 exact | **2 + ATR/4 tolerance** | ✅ Consensus (3:1) |

---

## Resolution Round 2: Follow-Up Prompt

The following prompt should be sent to all participating LLMs to resolve the 5 remaining disagreements.
