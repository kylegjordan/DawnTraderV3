# Crypto Filter & System Threshold Recalibration — Consensus Analysis

**Date**: 2026-03-11
**Participants**: Claude (Anthropic), Gemini (Google), ChatGPT (OpenAI), Grok (xAI)
**Purpose**: Identify consensus on crypto-calibrating DawnTrader V3 IMF filter and system-level thresholds

---

## Universal Agreement (All 4 LLMs Agree)

Before diving into specifics, **all four LLMs agree on these foundational points**:

1. ✅ **The diagnosis is correct** — IMF filters are stock-calibrated and the VN ≤ 0.60 threshold is the critical blocker producing zero tradable pairs
2. ✅ **HF7 regime thresholds are appropriate** — DX 45/55/60, vol 0.012/0.020, momentum ±0.003, 30-candle lookback are all confirmed for crypto
3. ✅ **The VN formula itself is sound** — no modification needed; the threshold is the issue, not the math
4. ✅ **Standardize on LQ Formula B** (log10 per-candle) — Formula A (ln aggregate) saturates uselessly on crypto volumes
5. ✅ **FEE_PERCENT must be updated to 0.26%** — paper trading must simulate actual Kraken taker fees
6. ✅ **Asset-class parameter profiles should be built now** — simple config object, not over-engineered
7. ✅ **Correlation should eventually move to exposure-based limits** — hard filter is a blunt instrument for crypto
8. ✅ **All normalized/composite metrics are asset-class agnostic** — DBS, SQE, position sizing, MCE indicators need no changes
9. ✅ **Fee/slippage should be configurable per asset class** — for future stock/ETF expansion
10. ✅ **Post-recalibration monitoring must track win rate by VN tier** — the primary signal that filters are too loose

---

## Parameter-by-Parameter Analysis

### ✅ CONSENSUS REACHED (12 of 17 items)

These parameters have sufficient agreement to implement without further debate.

---

#### 1. VN Formula — Keep or Modify?
**CONSENSUS: Keep formula, adjust thresholds only**

| LLM | Recommendation |
|-----|---------------|
| Grok (xAI) | Formula is sound, no modification |
| ChatGPT | Formula is fine, calibration issue |
| Claude | Formula is sound, adjust threshold not formula |
| Gemini | Mathematically sound, output domain compressed for crypto |

All four agree the VN formula correctly measures price-change variability. Crypto genuinely is noisier than stocks, so VN correctly reports higher values. Modifying the formula would mask reality.

---

#### 2. LQ Formula Standardization
**CONSENSUS: Standardize on Formula B, deprecate Formula A**

| LLM | Recommendation |
|-----|---------------|
| Grok (xAI) | Standardize B, retire A except as emergency fallback |
| ChatGPT | Standardize B, retire A entirely |
| Claude | Standardize B, keep A as logged fallback |
| Gemini | Standardize B, deprecate A |

**Agreed approach**: Use Formula B (`log10(avgVolumeUSD + 1) × 10`) as the sole LQ computation. Keep Formula A only as a logged emergency fallback when OHLC data is unavailable — every invocation should log a warning so we can monitor fallback frequency.

---

#### 3. LQ Active Trading Threshold (with Formula B)
**CONSENSUS: LQ ≥ 35**

| LLM | Recommendation | Reasoning |
|-----|---------------|-----------|
| Grok (xAI) | 32 | $8K-$10K per candle sufficient |
| ChatGPT | 35 | Midcap floor, sweet spot |
| Claude | 35 | $3,162/candle sufficient for $40-$200 positions |
| Gemini | 40 (keep) | $10,000/candle, sufficient for $200 max position |

**Agreed value**: **≥ 35**
- Three of four at or below 35 ✅
- LQ 35 = avgVolumeUSD ≈ $3,162/candle ≈ $76K daily — ample for $40-$200 positions
- Gemini's 40 is conservative but not wrong; 35 opens the universe slightly wider
- VTS threshold stays at **25** (2 explicit votes, 1 implicit keep)

---

#### 4. FEE_PERCENT (Paper Execution Engine)
**CONSENSUS: 0.26%**

| LLM | Recommendation |
|-----|---------------|
| Grok (xAI) | 0.26% |
| ChatGPT | 0.26% |
| Claude | 0.26% |
| Gemini | 0.26% (notes Kraken base tier may be 0.40% — verify) |

**Agreed value**: **0.26%** (up from 0.10%)
- Unanimous ✅
- Gemini flags that Kraken's lowest volume tier spot taker fee is actually 0.40%, but we are likely on a tiered schedule. **Kyle should verify the actual fee tier being charged by Kraken** — if it's 0.40%, use that instead.

---

#### 5. SLIPPAGE_PERCENT
**CONSENSUS: 0.04%**

| LLM | Recommendation |
|-----|---------------|
| Grok (xAI) | 0.04% |
| ChatGPT | 0.04% |
| Claude | 0.03% |
| Gemini | 0.05% |

**Agreed value**: **0.04%** (down from 0.15%)
- Median and mode both 0.04% ✅
- Range of 0.03–0.05% shows tight convergence
- At $40–$200 position sizes, slippage is negligible

---

#### 6. DI Trending Threshold
**CONSENSUS: ≥ 55**

| LLM | Recommendation |
|-----|---------------|
| Grok (xAI) | 55 |
| ChatGPT | 58 |
| Claude | 55 |
| Gemini | 55 |

**Agreed value**: **55** (down from 65)
- Three of four at 55 ✅
- ChatGPT's 58 is close enough to not constitute disagreement
- Crypto trends are noisier; DI rarely exceeds 65 even in strong moves

---

#### 7. DI Choppy Threshold
**CONSENSUS: < 35**

| LLM | Recommendation |
|-----|---------------|
| Grok (xAI) | 38 |
| ChatGPT | 35 |
| Claude | 35 |
| Gemini | 35 |

**Agreed value**: **35** (up from 30)
- Three of four at 35 ✅
- xAI's 38 is the outlier but close

---

#### 8. MIN_VOLUME_THRESHOLD_USD
**CONSENSUS: $500K**

| LLM | Recommendation | Reasoning |
|-----|---------------|-----------|
| Grok (xAI) | $650K | Slippage < 0.03% at this level |
| ChatGPT | $750K | Manageable spreads, wider universe |
| Claude | $500K | $200 = 0.04% of daily volume |
| Gemini | $500K | $200 = 1% of hourly volume |

**Agreed value**: **$500K** (down from $2M)
- Modal value with 2 direct votes ✅
- At $200 max position and $500K daily volume, the order is 0.04% of daily flow
- xAI ($650K) and ChatGPT ($750K) are more conservative but all agree $2M is too high

---

#### 9. DBS (Directional Bias Score)
**CONSENSUS: Confirmed asset-class agnostic — no changes**

All four LLMs confirm DBS thresholds (±0.60/0.30/0.10), weights (0.40/0.35/0.25), and EMA 12/26 periods are properly normalized and require no crypto-specific adjustment.

---

#### 10. SQE (Signal Quality Evaluator)
**CONSENSUS: Confirmed asset-class agnostic — no changes**

All four confirm FinalScore ≥ 0.35 and RegimeWeight ≥ 0.30 are normalized composite metrics that work regardless of asset class. Claude notes to monitor FinalScore distribution shift after filter relaxation.

---

#### 11. Position Sizing
**CONSENSUS: Confirmed asset-class agnostic — no changes**

Percentage-based sizing adapts automatically. No changes needed.

---

#### 12. MCE Indicators
**CONSENSUS: Confirmed appropriate — no changes**

ATR(14), SMA(20), RSI(14), VWAP, ADX(14) are standard indicators with no asset-class-specific calibration needed for 60-min candles.

---

### ⚠️ NEAR-CONSENSUS — Minor Spread (3 of 17 items)

These parameters have strong majority agreement with one outlier. The majority position is adopted.

---

#### 13. VN Active Trading Threshold
**STATUS: Strong convergence band 0.92–0.95, with nuanced reasoning**

| LLM | Recommendation | Key Rationale |
|-----|---------------|---------------|
| Grok (xAI) | 0.94 | Matches VTS success without floodgates |
| ChatGPT | 0.93 | Filters worst 10-20% of noise |
| Claude | 0.92 | Quality buffer below VTS; rejects chaotic micro-caps |
| Gemini | 0.95 | Same as VTS; empirical ground truth |

**Agreed value**: **0.93**
- Mean: 0.935, Median: 0.935
- ChatGPT's 0.93 is the direct midpoint recommendation
- Maintains a meaningful 0.02-point gap below VTS (0.95) — Claude's and ChatGPT's reasoning about active trading needing higher quality than simulation is compelling
- Gemini's argument that VTS is empirical proof is valid, but VTS is for learning from marginal cases while active trading commits real capital
- At 0.93, benchmark pairs (VN 0.75–0.92) pass comfortably; most tradeable altcoins (VN 0.89–0.93) pass; truly chaotic pairs (VN 0.95+) are filtered

**Passive Learning**: **0.96** (median of 0.95, 0.96, 0.97, 0.98)

---

#### 14. VN Adaptive Thresholds?
**STATUS: 2-2 split, resolved by safety reasoning**

| LLM | Recommendation | Key Reasoning |
|-----|---------------|---------------|
| Grok (xAI) | YES | Rolling 7-day median + 1.5σ, with hard floor/ceiling |
| ChatGPT | NO | Feedback loops, ML contamination, filter drift |
| Claude | NO | Crisis feedback loop — relaxes during exactly the wrong conditions |
| Gemini | YES | Rolling mean + 1σ, auto-calibrates to market |

**Resolution: NO for initial implementation. Defer to Phase 2.**

The NO side has stronger reasoning for filter-level thresholds specifically:
- Claude: "During a crisis when all VN rises, the adaptive threshold rises too, continuing to admit pairs that are genuinely untradeable. The whole point of VN as a filter is to reject chaotic conditions — an adaptive threshold that relaxes during chaos defeats the purpose."
- ChatGPT: "Adaptive thresholds create regime feedback loops, hidden filter drift, and ML data contamination."

Both YES responses acknowledge the need for guardrails (xAI: "hard floor/ceiling," Gemini: "if you relax VN to 0.95 and notice trades in 0.90–0.95 band have 25% win rate, you've found the ceiling"). This validates the concern — adaptive thresholds need monitoring infrastructure that doesn't exist yet.

**Adopt fixed 0.93 now. Revisit adaptive after monitoring data accumulates.**

---

#### 15. Correlation Threshold
**STATUS: Convergence on 0.92 with broader range**

| LLM | Recommendation | Long-term Architecture |
|-----|---------------|----------------------|
| Grok (xAI) | 0.88 | Deprecate filter; cap portfolio beta at 30% to BTC |
| ChatGPT | 0.92 | Should be risk management constraint, not filter |
| Claude | 0.92 | Replace with exposure limits in Phase 2 |
| Gemini | 0.95 (or remove) | Manage downstream via sector exposure limits |

**Agreed value**: **0.92** (up from 0.75)
- Two direct votes at 0.92 (ChatGPT, Claude) ✅
- xAI's 0.88 is the most conservative; Gemini's 0.95 is the most permissive
- 0.92 is the median and the natural consensus point
- At 0.92, only extreme BTC proxies (wrapped BTC, heavily pegged tokens) are filtered
- All four unanimously agree the long-term fix is exposure-based limits rather than a hard filter — this is a Phase 2 architectural change

**Regime-conditional correlation?**
- xAI: Optional but recommended
- ChatGPT: Optional
- Claude: NO for IMF filter layer (pairs don't become untradeable when regime changes)
- Gemini: Yes if kept as filter

**Resolution: NO** — Claude's reasoning is strongest. The IMF filter defines "what is tradeable," which shouldn't change with regime shifts. Strategy-level activation (which already exists) handles regime-appropriate strategy selection.

---

### ⚠️ GENUINE DISAGREEMENTS — Need Resolution (2 of 17 items)

---

#### 16. BASE_FEE_SLIPPAGE (Round-Trip)
**STATUS: Insufficient data — only 2 of 4 commented**

| LLM | Recommendation |
|-----|---------------|
| Grok (xAI) | Keep 0.50% |
| ChatGPT | Not specified |
| Claude | 0.58% |
| Gemini | Not specified |

**Proposed resolution**: **0.60%**
- With updated FEE_PERCENT = 0.26% and SLIPPAGE = 0.04%, round-trip cost = 2 × (0.26% + 0.04%) = **0.60%**
- Claude's 0.58% is slightly below this arithmetic result
- xAI's 0.50% is based on old fee values and should be updated
- 0.60% is the mathematically correct value given the new fee/slippage consensus

---

#### 17. MIN_STOP_DISTANCE_BPS (Global Guard)
**STATUS: Genuine 2-2 split**

| LLM | Recommendation | Key Reasoning |
|-----|---------------|---------------|
| Grok (xAI) | Keep 20 (0.2%) | Appropriate for crypto; small size keeps risk low |
| ChatGPT | Raise to 40 (0.4%) | Crypto needs slightly more room |
| Claude | Keep 20 (0.2%) | Already reviewed in strategy consensus for Kraken friction |
| Gemini | Raise to 50-100 (0.5-1.0%) | **CRITICAL**: 0.2% stop < 0.52% round-trip fees = guaranteed loss |

**Analysis of the disagreement**:

Gemini's mathematical concern is compelling on the surface: if round-trip fees are ~0.60% and the minimum stop is 0.20%, then a stop-out costs 0.20% (price move) + 0.60% (fees) = 0.80%. But this concern conflates two things:
- The stop loss represents the **price movement loss** — it's added to fees, not compared against fees
- ALL stopped-out trades lose money (stop + fees). The question is whether 0.20% is too tight to avoid **noise triggering** on crypto

The real question is: **can crypto prices move 0.20% on noise within 60 minutes?** Absolutely yes — crypto routinely moves 1-3% per hour. A 0.20% stop would be triggered by normal bid-ask spread crossing.

However, in practice, **no strategy produces stops this tight**. The tightest stops from pattern/hybrid strategies are typically 0.3-1.0% from entry (after stop buffers). The MIN_STOP guard exists to catch edge cases, not to define typical behavior.

**Proposed resolution**: **Raise to 30 BPS (0.30%)**
- Compromise between keep (20) and raise (40-100)
- 0.30% > typical crypto bid-ask spread (0.05-0.20%)
- 0.30% is below any actual strategy stop distance, so no signals will be rejected that aren't already
- Addresses Gemini's architectural concern that the floor should at least exceed the bid-ask spread
- Low practical impact — this change affects almost zero signals in practice

---

## Architecture Consensus

### A. Asset-Class Profiles
| Decision | Status |
|----------|--------|
| Build profiles now | ✅ **All 4 agree** |
| Simple config object, not database | ✅ **All 4 agree** |

### B. Adaptive Thresholds
| Decision | Status |
|----------|--------|
| For filter-level thresholds (VN, LQ, corr) | ❌ **Not now** (2-2, resolved NO by safety reasoning) |
| For strategy-level parameters | Defer to Phase 2 |
| Best candidate if implemented later | VN (all 4 agree VN is the top candidate) |

### C. LQ Volume-Class Scaling
| Decision | Status |
|----------|--------|
| Scale LQ threshold by volume class | ❌ **No** (3:1 against) |
| log10 formula already handles the continuum | ✅ **3 agree** |

### D. Post-Recalibration Monitoring
All four LLMs converge on the same monitoring metrics:

1. **Win rate by VN tier** (0.75–0.85, 0.85–0.90, 0.90–0.93) — the primary quality signal
2. **P&L distribution by LQ tier** — watch for worse fills on low-LQ pairs
3. **Portfolio BTC beta** — should stay < 2.5 with correlation filter at 0.92
4. **Signal-to-trade conversion rate by strategy** — detect strategy-specific over-relaxation
5. **Tradable pairs count per scan cycle** — should be 80-150 (not 0, not 300)

---

## Final Consensus Values — Implementation Ready

| # | Parameter | Current | Consensus Value | Agreement | Priority |
|---|-----------|---------|-----------------|-----------|----------|
| 1 | **VN active trading** | 0.60 | **≤ 0.93** | Near-consensus (0.92–0.95 range) | **P0** |
| 2 | **VN passive learning** | 0.80 | **≤ 0.96** | Near-consensus (0.95–0.98 range) | P1 |
| 3 | **VN VTS** | 0.95 | **≤ 0.95 (keep)** | Unanimous | — |
| 4 | **VN formula** | Current | **Keep (no modification)** | Unanimous | — |
| 5 | **VN adaptive?** | N/A | **No (defer to Phase 2)** | 2-2, resolved NO | — |
| 6 | **LQ formula** | Dual (A/B) | **Standardize on Formula B** | Unanimous | **P1** |
| 7 | **LQ active trading** | ≥ 40 | **≥ 35** | Near-consensus (32–40 range) | P1 |
| 8 | **LQ VTS** | ≥ 25 | **≥ 25 (keep)** | Majority | — |
| 9 | **Correlation threshold** | 0.75 | **≤ 0.92** | Near-consensus (0.88–0.95 range) | **P1** |
| 10 | **DI trending** | 65 | **55** | Near-consensus (55–58) | P2 |
| 11 | **DI choppy** | 30 | **35** | Near-consensus (35–38) | P2 |
| 12 | **MIN_VOLUME_THRESHOLD_USD** | $2M | **$500K** | Majority (modal value) | P2 |
| 13 | **FEE_PERCENT** | 0.10% | **0.26%** | Unanimous | **P1** |
| 14 | **SLIPPAGE_PERCENT** | 0.15% | **0.04%** | Near-consensus (0.03–0.05%) | P2 |
| 15 | **BASE_FEE_SLIPPAGE** | 0.50% | **0.60%** | Calculated from #13+#14 | P2 |
| 16 | **MIN_STOP_DISTANCE_BPS** | 20 | **30** | 2-2 split, compromise | P3 |
| 17 | **Asset-class profiles** | None | **Build now (config object)** | Unanimous | P2 |

### Unchanged (Confirmed Agnostic)

| Component | Status |
|-----------|--------|
| HF7 regime thresholds (DX 45/55/60, vol, mom) | ✅ Confirmed appropriate |
| DBS thresholds & weights | ✅ No changes |
| SQE thresholds (FinalScore 0.35, RegimeWeight 0.30) | ✅ No changes |
| Position sizing (percentage-based) | ✅ No changes |
| MCE indicators (ATR14, SMA20, RSI14, ADX14) | ✅ No changes |
| Global Guards: MIN_RR_RATIO (1.5) | ✅ No changes |
| Global Guards: ATR_MIN_RATIO (0.001) | ✅ No changes |
| Global Guards: ATR_MAX_RATIO (0.10) | ✅ No changes |
| Global Guards: ENTRY_PREMIUM_BPS (10) | ✅ No changes |

---

## Implementation Scope

### Code Changes Required

**Files requiring edits:**

| File | Edits | Changes |
|------|-------|---------|
| `server/config/system-guards.ts` | 6 | VN (0.60→0.93), LQ (40→35), CORR (0.75→0.92), DI (65→55, 30→35), MIN_VOL ($2M→$500K) |
| `server/config/system-guards.ts` | 1 | IMF_THRESHOLDS.VN_MAX (0.80→0.96) |
| `server/config/system-guards.ts` | 1 | MIN_STOP_DISTANCE_BPS (20→30) in strategy-helpers.ts |
| `server/services/paper-execution-engine.ts` | 2 | FEE_PERCENT (0.10→0.26), SLIPPAGE_PERCENT (0.15→0.04) |
| `server/config/system-guards.ts` | 1 | BASE_FEE_SLIPPAGE (0.005→0.006) |
| `server/services/fx5-scanner.ts` | ~5 | Standardize on Formula B LQ, remove Formula A usage, log fallback |
| `server/utils/analysis-utils.ts` | 1 | Update CORE_METRIC_THRESHOLDS to reference new values |
| `server/strategies/strategy-helpers.ts` | 1 | MIN_STOP_DISTANCE_BPS (20→30) |

**Total: ~18 surgical edits across 4-5 files**

### What This Batch Does NOT Include

- Asset-class profile infrastructure (separate architectural batch)
- Adaptive VN thresholds (deferred to Phase 2)
- Exposure-based correlation limits (deferred to Phase 2)
- Regime-conditional filter adjustments (deferred)
- LQ volume-class scaling (rejected by consensus)

---

## Gemini Fee Tier Warning

Gemini raised an important flag: Kraken's base spot taker fee for the lowest volume tier ($0–$50K/month) is actually **0.40%**, not 0.26%. The 0.26% rate applies to a higher volume tier.

**Action required**: Kyle should verify the exact fee tier DawnTrader is on by checking Kraken account settings. If the actual taker fee is 0.40%, all fee-related constants should use 0.40% instead of 0.26%:
- FEE_PERCENT → 0.40%
- BASE_FEE_SLIPPAGE → 2 × (0.40% + 0.04%) = 0.88%

This matters because paper trading profit calculations would be off by ~0.14% per side (~0.28% round trip) — enough to make marginal trades appear profitable when they're actually losers.
