# Crypto Strategy Recalibration — Round 2: Resolving Disagreements

## Context

Four LLMs (Claude/Anthropic, Gemini/Google, ChatGPT/OpenAI, Copilot/Microsoft) reviewed proposed crypto strategy recalibration for DawnTrader V3 (Kraken, ~300 crypto pairs, 60-minute candles, long-only).

**Round 1 achieved consensus on 9 of 14 parameters** plus all architectural questions. Five parameters have meaningful disagreements that need resolution.

### Consensus Already Achieved (no further discussion needed):
- Mean Reversion: `max(3.0%, 1.5 × ATR(14) / price)` ✅
- Breakout Volume: 1.5× ✅
- VWAP Pullback: 3.0% ✅
- Pivot Shift RSI: 35-65 ✅
- Volatility Edge Percentile: ≥ 70th ✅
- Adaptive Flow Percentile: ≥ 60th ✅
- ADX Anti-Trend: < 30 ✅
- Pattern Strength: Selective relaxation (Morning Star 0.55, Support Bounce 0.50, Pivot Shift 0.50, Reverse Impulse 0.58, Defensive Hedge 0.50, Adaptive Flow 0.50, Inside Bar compression ≤ 0.80) ✅
- Boundary Touches: 2 + ATR/4 tolerance zone ✅
- Architecture: ATR-based dynamic thresholds, asset-class profiles, DHMA deprioritized, VWAP liquidity-gated ✅

---

## 5 Parameters Needing Resolution

For each, I'll present the Round 1 positions and a proposed compromise. **Please vote ACCEPT on the compromise, or provide your counter-proposal with specific reasoning.**

---

### 1. Breakout — Consolidation Range Width (ATR multiplier specifics)

**Round 1 positions:**
| LLM | Floor | Ceiling | ATR Multiplier |
|-----|-------|---------|----------------|
| Gemini | — | 6% hard | Scale by asset (no specific ATR mult) |
| ChatGPT | 4% | 5% fallback | 2.0-2.5× ATR |
| Claude | 5% | 6% | 3.0× floor / 5.0× ceiling |
| Copilot | 4% | 7% | 1.5-2.5× ATR |

**Proposed compromise**:
```
Floor: max(4%, 2.5 × ATR(14) / price)
Ceiling: max(7%, 5.0 × ATR(14) / price)
```
- 4% floor = ChatGPT/Copilot midpoint (conservative enough for BTC)
- 7% ceiling = Copilot's max (wide enough for volatile alts)
- 2.5× ATR floor = ChatGPT/Copilot convergence
- 5.0× ATR ceiling = Claude's well-reasoned "wider than 5× ATR is a trend, not consolidation"

**Do you accept this compromise? If not, what specific values would you change and why?**

---

### 2. VWAP Bounce — Proximity Threshold

**Round 1 positions:**
| LLM | Value | Key Argument |
|-----|-------|-------------|
| Gemini | 1.5% | Realistic buffer for crypto wicks |
| ChatGPT | 0.8-1.5% tiered | 2.0% too loose; tier by liquidity |
| Claude | 1.0% | At 2.0%, "bouncing off VWAP" loses meaning |
| Copilot | 1.5-2.5% | Crypto needs wider proximity |

**Proposed compromise**: **1.5%**
- Gemini's exact recommendation
- Upper bound of ChatGPT's range
- Only 0.5% above Claude's recommendation (who argued for tightness)
- Lower bound of Copilot's range
- This is the natural convergence point where all four ranges overlap

**Do you accept 1.5%? If not, what value and why?**

---

### 3. Range Trading — Duration

**Round 1 positions:**
| LLM | Value | Key Argument |
|-----|-------|-------------|
| Gemini | 12 hours (keep current) | 8 candles is a pause, not a structural range |
| ChatGPT | 8-12 hours | Range of acceptable |
| Claude | 8 hours | Crypto ranges form and break faster |
| Copilot | 8-12 hours | Range of acceptable |

**Proposed compromise**: **10 hours (10 candles on 60-min chart)**
- Midpoint between Gemini (12) and Claude (8)
- Within ChatGPT and Copilot's acceptable range
- 10 candles provides enough structure to confirm a genuine range while acknowledging crypto's faster tempo

**Do you accept 10 hours? If not, what value and why?**

---

### 4. Reverse Impulse — RSI Oversold Gate

**Round 1 positions:**
| LLM | Value | Key Argument |
|-----|-------|-------------|
| Gemini | Keep 35 (or tighten to 30) | RSI 38 in crypto is often just a downtrend, not exhaustion |
| ChatGPT | 38 (40 only with exhaustion filter) | Sweet spot; 35 too deep for crypto's faster RSI cycles |
| Claude | 38 | Below neutral, requires genuine selling pressure |
| Copilot | 38-40 + confluence | 40 OK if paired with price/ATR condition |

**Proposed compromise**: **RSI < 38**
- 3:1 majority
- Counter-argument to Gemini: The existing quant conditions already provide strong confluence:
  - Momentum < -1% over 5 bars (confirms genuine selloff, not just RSI drift)
  - Volume ≥ 1.5× average (confirms participation, not thin-market RSI noise)
  - Pinbar pattern strength ≥ 0.58 (confirms reversal structure)
  - These three conditions together prevent the "RSI 38 in a strong downtrend" scenario Gemini warns about
- If Gemini remains concerned: would RSI < 37 (splitting the difference) be acceptable?

**Do you accept RSI < 38? If not, what value and why?**

---

### 5. Defensive Hedge — BTC Correlation Maximum

**Round 1 positions (widest disagreement):**
| LLM | Threshold | Window | Notes |
|-----|-----------|--------|-------|
| Gemini | 0.50 | 30 bars | True decorrelation under 0.30 restricted to stablecoins/dead projects |
| ChatGPT | 0.40-0.45 | 12-20 bars | Beta-adjusted preferred; shorter window for transient decorrelation |
| Claude | 0.40 | 30 bars | 0.50 = genuine positive relationship, not a hedge |
| Copilot | 0.50-0.55 | 30 bars | Regime-conditional up to 0.60 |

**Proposed compromise**: **|r| < 0.45, 30-bar window**
- Geometric midpoint between 0.40 camp (ChatGPT/Claude) and 0.50 camp (Gemini/Copilot)
- At 0.45, the asset is in the bottom ~30% of crypto correlations during normal markets
- 30-bar window stays: Spearman correlation needs 20+ data points for statistical reliability (Claude's mathematical argument), so ChatGPT's 12-bar suggestion is too short
- Regime-conditional expansion (Copilot's idea) deferred to Phase 2 — all agreed regime-conditioning comes after baseline crypto calibration

**Key question**: Is 0.45 a genuine hedge? At 0.45 Spearman correlation, the asset moves with BTC less than half the time. In a BTC drawdown scenario, a 0.45-correlated asset would be expected to retain ~55% of its independent price action. That's not a perfect hedge, but it IS meaningfully different from the typical 0.70-0.90 altcoin.

**Do you accept |r| < 0.45, 30-bar window? If not, what threshold and why?**

---

## Additional Question: Implementation Sequencing

Claude recommended implementing static crypto thresholds first, then adding regime-conditional parameters after observing baseline performance. The rationale: "tuning two dimensions simultaneously makes it hard to diagnose problems."

Gemini, ChatGPT, and Copilot all recommended regime-conditional parameters, some implying they should be part of this implementation.

**Question**: Do you agree with the phased approach (static crypto thresholds now → observe → regime-conditional later), or should regime-conditioning be included in this initial recalibration batch?

---

## Response Format

For each of the 5 parameters, please respond:
1. **ACCEPT** the proposed compromise, OR
2. **COUNTER** with a specific value and reasoning

For the implementation sequencing question, state your preference and reasoning.
