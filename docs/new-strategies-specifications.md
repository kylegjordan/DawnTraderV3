# New Trading Strategies Specifications

This document provides detailed specifications for five new trading strategies to be added to the crypto day trading system.

---

## 1. Breakout Strategy

### Overview
Identifies and trades price breakouts from consolidation ranges or resistance levels with volume confirmation.

### Entry Criteria
1. **Consolidation Detection**
   - Price must trade within defined range for minimum period (configurable: 10-30 bars)
   - Range width must be ≤ threshold (configurable: 2-5% of current price)
   
2. **Breakout Confirmation**
   - Price closes above resistance (high of consolidation range) by buffer percentage (configurable: 0.5-2%)
   - Volume spike: Current volume ≥ average volume × multiplier (configurable: 1.5-3.0x)
   
3. **Momentum Confirmation**
   - Price must be above VWAP
   - Bullish candle pattern at breakout (close > open)
   
4. **Market Structure**
   - Must not be in overbought condition (RSI < 75 if used)
   - Prefer breakouts near session highs/lows

### Exit Logic
1. **Take Profit**
   - Fixed R-multiple target (configurable: 2-4R)
   - OR measured move: Range height projected from breakout point
   
2. **Stop Loss**
   - Initial: Below consolidation range low with buffer (0.5%)
   - Trailing: After 1R profit, trail stop to breakout level (0% loss)

3. **Time Exit**
   - Maximum holding period (configurable: 4-24 hours)

### Invalidation Conditions
- Price re-enters consolidation range (close below resistance)
- Volume dries up post-breakout (< 0.5x average)
- Opposing reversal pattern forms
- Daily loss limit reached

### Required Filters
1. **Range Detection** (new) - Identifies consolidation zones
2. **Minimum Volume** - ≥ threshold (default: $100K/24h)
3. **Minimum Daily Range** - ≥ 3% volatility
4. **Spread Check** - Bid-ask spread ≤ 0.3%

### Optional Filters
1. **Stop-Zone/Liquidity Cluster** (new) - Avoids breakouts into obvious stop clusters
2. **Time of Day** - Prefer high-liquidity sessions
3. **Trending Market** - Better in trending regimes

### Tunable Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `minConsolidationBars` | 10 | 5-30 | Minimum bars for valid range |
| `maxRangeWidth` | 3.0% | 1-5% | Max consolidation range width |
| `breakoutBuffer` | 1.0% | 0.5-2% | Buffer above resistance for entry |
| `volumeMultiplier` | 2.0x | 1.5-3x | Volume spike confirmation |
| `takeProfitR` | 2.5 | 1.5-4 | Take profit R-multiple |
| `trailingStopEnabled` | true | bool | Enable trailing stop |
| `maxHoldingHours` | 12 | 2-24 | Maximum position duration |
| `riskPerTrade` | 1.0% | 0.5-2% | Capital risk per trade |

---

## 2. Mean Reversion Strategy

### Overview
Identifies oversold/overbought conditions in ranging markets and trades the reversion to mean (VWAP, SMA, or range midpoint).

### Entry Criteria
1. **Range-Bound Market**
   - Price must be in identified range (use Range Detection filter)
   - No strong directional trend (ADX < 25 or flat SMA)
   
2. **Extreme Deviation**
   - Price deviates from mean by threshold (configurable: 2-4% or 2 standard deviations)
   - Mean reference: VWAP, 20-period SMA, or range midpoint (configurable)
   
3. **Reversal Signal**
   - Bullish reversal pattern at support (for long entries)
   - Bearish exhaustion at resistance (for short - if enabled)
   - Volume confirmation: Selling climax followed by volume decrease
   
4. **Market Structure**
   - Must be within identified range bounds
   - Support/resistance levels confirmed by prior touches (≥2)

### Exit Logic
1. **Take Profit**
   - Primary: Price reaches mean (VWAP/SMA/midpoint) ± small buffer (0.3%)
   - Secondary: Partial exit at 50% mean reversion, final at full reversion
   
2. **Stop Loss**
   - Initial: Beyond recent extreme (support low - 1%)
   - Adaptive: Tighten to breakeven after 50% profit

3. **Time Exit**
   - Maximum holding period (configurable: 2-12 hours)
   - Faster exits in choppy conditions

### Invalidation Conditions
- Range breakdown (price closes outside range limits)
- Mean shifts significantly (trend emergence)
- Volume surge indicating breakout (not reversion)
- Opposing setup forms

### Required Filters
1. **Range Detection** (new) - Confirms ranging market
2. **Minimum Volume** - Sufficient liquidity
3. **Volatility Check** - Adequate but not extreme movement

### Optional Filters
1. **Time of Day** - Avoid low-liquidity periods
2. **Stop-Zone Detection** - Confirm support/resistance validity
3. **Correlation Check** - Multiple assets reverting signals strength

### Tunable Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `meanType` | vwap | vwap/sma/midpoint | Mean reference point |
| `smaLength` | 20 | 10-50 | SMA period if using SMA mean |
| `deviationThreshold` | 2.5% | 1.5-4% | Deviation from mean for entry |
| `minRangeTouches` | 2 | 2-4 | Min support/resistance touches |
| `partialExitPercent` | 50% | 25-75% | Partial exit at 50% reversion |
| `stopLossBuffer` | 1.0% | 0.5-2% | Stop beyond extreme |
| `maxHoldingHours` | 6 | 1-12 | Maximum position duration |
| `riskPerTrade` | 1.0% | 0.5-2% | Capital risk per trade |

---

## 3. Range Trading Strategy

### Overview
Systematically trades within identified price ranges by buying support and selling resistance.

### Entry Criteria
1. **Range Identification**
   - Clear horizontal support and resistance (≥3 touches each)
   - Range active for minimum duration (configurable: 4-48 hours)
   - Range width adequate (configurable: 2-8% of midpoint)
   
2. **Entry Trigger**
   - **Long**: Price touches support zone with reversal signal
   - **Short** (if enabled): Price touches resistance with rejection pattern
   - Entry zone: Support/resistance ± small band (0.3-0.5%)
   
3. **Confirmation**
   - Volume spike at reversal point (1.2x+ average)
   - Candlestick reversal pattern (hammer, doji, engulfing)
   - Momentum oscillator confirmation (Stochastic < 30 for long, > 70 for short)

4. **Market Context**
   - Volatility stable (not expanding)
   - No breakout signals present
   - Range not compressing (width stable or expanding slightly)

### Exit Logic
1. **Take Profit**
   - Primary: Opposite range boundary (support → resistance, resistance → support)
   - Scale out: 50% at midpoint, 50% at opposite boundary
   - Buffer from boundary: 0.5% to ensure fills
   
2. **Stop Loss**
   - Initial: Beyond range boundary with buffer (1%)
   - Breakeven: Move to breakeven after 50% profit
   
3. **Time Exit**
   - Maximum holding period (configurable: 6-24 hours)
   - Exit if range breaks or becomes invalid

### Invalidation Conditions
- Range breakdown (close outside boundaries)
- Range compression (width narrows below threshold)
- Volume surge indicating potential breakout
- Volatility spike breaking range structure

### Required Filters
1. **Range Detection** (new) - Validates active range
2. **Minimum Range Width** - Adequate profit potential
3. **Minimum Volume** - Sufficient liquidity at boundaries

### Optional Filters
1. **Stop-Zone Detection** - Confirms boundary strength
2. **Time of Day** - Prefer active trading sessions
3. **Multiple Timeframe** - Range valid on higher timeframe

### Tunable Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `minRangeDurationHours` | 8 | 4-48 | Minimum range duration |
| `minRangeWidth` | 3.0% | 2-8% | Minimum range width |
| `minBoundaryTouches` | 3 | 2-5 | Min touches per boundary |
| `entryZoneWidth` | 0.4% | 0.2-0.8% | Zone around support/resistance |
| `partialExitPercent` | 50% | 25-75% | Partial exit at midpoint |
| `stopLossBeyond` | 1.0% | 0.5-2% | Stop beyond boundary |
| `maxHoldingHours` | 12 | 4-24 | Maximum position duration |
| `riskPerTrade` | 1.0% | 0.5-2% | Capital risk per trade |

---

## 4. VWAP Bounce Strategy

### Overview
Trades bounces from VWAP in trending markets, using VWAP as dynamic support/resistance.

### Entry Criteria
1. **Trend Confirmation**
   - Clear uptrend: Price making higher highs and higher lows
   - VWAP sloping upward (current VWAP > VWAP 10 bars ago)
   - Price above VWAP for majority of recent period (70%+ of last 20 bars)
   
2. **Pullback to VWAP**
   - Price pulls back to VWAP ± threshold (configurable: 0.3-1.0%)
   - Pullback not too deep (must stay above prior support)
   - Pullback duration reasonable (2-10 bars)
   
3. **Bounce Confirmation**
   - Bullish reversal pattern at VWAP
   - Volume increase on bounce (1.3x+ average)
   - Price reclaims above VWAP
   - Momentum indicator turns bullish (RSI rises, MACD crosses up)

4. **Market Context**
   - Broader trend intact
   - No major resistance overhead
   - Market structure healthy (no distribution patterns)

### Exit Logic
1. **Take Profit**
   - Target: Prior swing high or +2-3R
   - Measured move: Previous impulse move projected from entry
   - Partial exit: 50% at 1.5R, remainder at 2.5R
   
2. **Stop Loss**
   - Initial: Below VWAP with buffer (0.5-1%)
   - Trailing: After 1R profit, trail to VWAP
   - Tighten: Move to breakeven after 1.5R

3. **Trend Failure Exit**
   - VWAP turns flat or downward
   - Price breaks below VWAP decisively (close 1%+ below)
   - Trend structure breaks (lower low forms)

### Invalidation Conditions
- VWAP slope reverses
- Price breaks significantly below VWAP (>1.5%)
- Volume dries up (no follow-through)
- Resistance overhead breached to downside

### Required Filters
1. **Trend Detection** - Confirms uptrend
2. **Minimum Volume** - Adequate liquidity
3. **VWAP Calculation** - Accurate VWAP required

### Optional Filters
1. **Time of Day** - Prefer first 4 hours of session (VWAP most reliable)
2. **Volatility Check** - Moderate volatility optimal
3. **Market Regime** - Better in trending regimes

### Tunable Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `vwapProximity` | 0.5% | 0.2-1% | Max distance from VWAP for entry |
| `minVWAPSlope` | 0.3% | 0.1-1% | Min VWAP upward slope |
| `volumeMultiplier` | 1.5x | 1.2-2x | Volume confirmation |
| `takeProfitR` | 2.5 | 1.5-4 | Take profit R-multiple |
| `trailingToVWAP` | true | bool | Trail stop to VWAP after profit |
| `maxPullbackBars` | 6 | 2-10 | Max pullback duration |
| `partialExitR` | 1.5 | 1-2 | R-multiple for partial exit |
| `riskPerTrade` | 1.0% | 0.5-2% | Capital risk per trade |

---

## 5. Liquidity Trap Strategy (Advanced)

### Overview
Identifies and trades false breakouts (liquidity traps) where price briefly breaks a level to trigger stops, then reverses sharply.

### Entry Criteria
1. **Trap Identification**
   - Price breaks key level (support/resistance, range boundary)
   - Breakout is marginal (0.5-2% beyond level, configurable)
   - Volume spike present (stop-triggering activity)
   
2. **Reversal Signal**
   - Immediate rejection: Price returns to range within 1-3 bars
   - Volume shifts: Breakout volume high, return volume higher
   - Candlestick reversal: Long wick in breakout direction, close back in range
   
3. **Liquidity Evidence**
   - Prior stop accumulation visible (use Stop-Zone filter)
   - Clean level with multiple prior touches (≥3)
   - Round number or psychologically significant level
   
4. **Market Structure**
   - Range or consolidation pattern preceding trap
   - Not in strong trending market (trends less likely to trap)
   - Time of day favors trap potential (session opens/closes)

### Entry Trigger
- Enter counter-breakout direction when:
  - Price closes back inside range/level
  - Reversal candle completes
  - Stop losses above/below level have been triggered (evidenced by volume)

### Exit Logic
1. **Take Profit**
   - Target: Opposite range boundary or prior swing
   - Conservative: 2-3R (traps can reverse quickly)
   - Aggressive: Return to range midpoint then opposite boundary
   
2. **Stop Loss**
   - Initial: Beyond the trap level with buffer (1%)
   - Tight: Traps require discipline, stop beyond trap high/low
   - No second chances: If stop hit, do not re-enter
   
3. **Time Exit**
   - Fast exit: Traps move quickly, maximum 2-6 hours
   - Exit if consolidation reforms (trap failed to create momentum)

### Invalidation Conditions
- Breakout proves genuine (price continues beyond trap level)
- Volume confirms breakout (sustained high volume in breakout direction)
- Market structure shifts (trend emerges)
- Time passes without reversal (trap window closes)

### Required Filters
1. **Stop-Zone/Liquidity Cluster** (new) - Identifies trap locations
2. **Range Detection** - Confirms range/level structure
3. **Minimum Volume** - Trap needs volume

### Optional Filters
1. **Time of Day** - Traps common at session boundaries
2. **Round Number** - Psychological levels more prone to traps
3. **News Events** - Avoid during major releases (genuine moves)

### Tunable Parameters

| Parameter | Default | Range | Description |
|-----------|---------|-------|-------------|
| `maxTrapExtension` | 1.2% | 0.5-2% | Max breakout beyond level |
| `trapReturnBars` | 2 | 1-3 | Bars to return to range |
| `minStopZoneSize` | medium | small/medium/large | Liquidity cluster size |
| `minLevelTouches` | 3 | 2-5 | Prior touches of level |
| `volumeRatio` | 1.3x | 1.2-2x | Return volume vs breakout |
| `takeProfitR` | 2.5 | 1.5-4 | Conservative R-multiple |
| `maxHoldingHours` | 4 | 1-6 | Fast exit for traps |
| `riskPerTrade` | 0.8% | 0.5-1.5% | Lower risk (advanced strategy) |

---

## Implementation Notes

### Shared Components
All strategies share:
- **Base risk parameters**: `riskPerTrade`, `maxConcurrentPositions`, `stopLossR`, `takeProfitR`
- **Cooldown system**: Prevent over-trading same symbol
- **Mode awareness**: All strategies work in both Live and Paper modes
- **Goal alignment**: Integrate with existing goal scoring system

### Filter Dependencies
- **Range Detection** (new): Required by Mean Reversion, Range Trading, Liquidity Trap
- **Stop-Zone/Liquidity Cluster** (new): Required by Liquidity Trap, optional for Breakout and Range Trading

### Strategy Priority
When multiple strategies signal same asset:
1. Liquidity Trap (highest priority - advanced)
2. Breakout / Mean Reversion (equal priority)
3. Range Trading / VWAP Bounce (equal priority)
4. Existing strategies (VWAP Pullback, ABCD, SMA Trend Ride)

### Testing Order
1. **Stage 1**: Breakout + Mean Reversion (foundational patterns)
2. **Stage 2**: Range Trading + VWAP Bounce (refined setups)
3. **Stage 3**: Liquidity Trap (advanced pattern recognition)

---

## Success Criteria

Each strategy must demonstrate:
- ✅ Clear signal generation with logging
- ✅ Proper filter application
- ✅ Risk rules enforced (position sizing, SL/TP)
- ✅ Telemetry tracking (signals, trades, P/L)
- ✅ Paper trading validation (≥20 signals, ≥5 trades)
- ✅ Walter can explain strategy in plain English
- ✅ Guardrails respected (daily loss, max positions)
- ✅ No conflicts with existing strategies
- ✅ Performance ≥50% win rate OR positive avg R in paper mode

**Approval Gate**: All criteria must pass before production rollout.
