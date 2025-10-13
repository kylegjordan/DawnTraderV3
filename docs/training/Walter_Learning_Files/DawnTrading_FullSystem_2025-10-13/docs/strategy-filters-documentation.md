# Strategy Filters Documentation

## Overview

This document describes the specialized filters used by the new trading strategies. These filters provide advanced pattern recognition capabilities beyond basic technical indicators.

---

## 1. Range Detection Filter

### Purpose
Identifies when price is trading within a bounded range (consolidation). Essential for Range Trading and Mean Reversion strategies.

### Function Signature
```typescript
function detectRange(
  priceHistory: PriceData[],
  minBars: number = 10,
  maxRangeWidthPct: number = 5.0,
  minTouches: number = 2
): RangeDetectionResult
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `priceHistory` | `PriceData[]` | required | Array of OHLCV candles |
| `minBars` | `number` | 10 | Minimum bars for valid range |
| `maxRangeWidthPct` | `number` | 5.0 | Maximum range width (%) |
| `minTouches` | `number` | 2 | Minimum touches per boundary |

### Return Value

```typescript
interface RangeDetectionResult {
  isRange: boolean;              // Whether valid range detected
  rangeHigh: number;             // Upper boundary price
  rangeLow: number;              // Lower boundary price
  rangeMidpoint: number;         // Midpoint price
  rangeWidth: number;            // Absolute range width
  rangeWidthPercent: number;     // Range width as % of midpoint
  durationBars: number;          // Number of bars analyzed
  volatility: number;            // Price volatility (std dev %)
  reason: string;                // Human-readable explanation
}
```

### Detection Logic

1. **Calculate Boundaries**
   - Range high = highest high in lookback period
   - Range low = lowest low in lookback period
   - Range width = high - low

2. **Validate Width**
   - Must be ≤ `maxRangeWidthPct` of midpoint
   - Prevents identifying trending moves as ranges

3. **Count Boundary Touches**
   - Touch defined as price within 0.3% of boundary
   - Both high and low must have ≥ `minTouches`
   - Confirms price respects boundaries

4. **Calculate Volatility**
   - Standard deviation of closes as % of midpoint
   - Lower volatility = more stable range

### Example Usage

```typescript
import { detectRange } from './strategy-filters';

// Detect range with custom parameters
const rangeResult = detectRange(
  priceHistory,
  15,    // 15 bars minimum
  4.0,   // 4% max width
  3      // 3 touches per boundary
);

if (rangeResult.isRange) {
  console.log(`Valid range detected: ${rangeResult.reason}`);
  console.log(`Range: $${rangeResult.rangeLow} - $${rangeResult.rangeHigh}`);
  console.log(`Width: ${rangeResult.rangeWidthPercent.toFixed(2)}%`);
  console.log(`Volatility: ${rangeResult.volatility.toFixed(2)}%`);
}
```

### Sample Output

**Valid Range (True)**
```json
{
  "isRange": true,
  "rangeHigh": 42500,
  "rangeLow": 41000,
  "rangeMidpoint": 41750,
  "rangeWidth": 1500,
  "rangeWidthPercent": 3.59,
  "durationBars": 15,
  "volatility": 1.24,
  "reason": "Valid range: 3.59% width, 4 high touches, 5 low touches, 1.24% volatility"
}
```

**Invalid Range - Too Wide**
```json
{
  "isRange": false,
  "rangeHigh": 43000,
  "rangeLow": 40000,
  "rangeMidpoint": 41500,
  "rangeWidth": 3000,
  "rangeWidthPercent": 7.23,
  "durationBars": 15,
  "volatility": 3.45,
  "reason": "Range too wide: 7.23% exceeds 5% threshold"
}
```

**Invalid Range - Insufficient Touches**
```json
{
  "isRange": false,
  "rangeHigh": 42000,
  "rangeLow": 41500,
  "rangeMidpoint": 41750,
  "rangeWidth": 500,
  "rangeWidthPercent": 1.20,
  "durationBars": 10,
  "volatility": 0.45,
  "reason": "Insufficient boundary touches: high=1, low=2 (need 3 each)"
}
```

### Visual Interpretation

```
Price Chart (Valid Range):

42500 ┤ ●────●───────────●─────●  ← Range High (4 touches)
      │  
42000 ┤    ○     ○
      │      ○ ○     ○
41500 ┤           ○       ○
      │                     ○
41000 ┤ ●─────●────●──────────●─ ← Range Low (5 touches)

Range Width: 3.59% ✓
Touches: High=4 ✓, Low=5 ✓
Result: VALID RANGE
```

---

## 2. Stop-Zone / Liquidity Cluster Detection

### Purpose
Identifies price levels where stop losses are likely clustered. Used by Liquidity Trap strategy and as confirmation for Breakout/Range strategies.

### Function Signature
```typescript
function detectStopZone(
  priceHistory: PriceData[],
  currentPrice: number,
  lookbackBars: number = 20,
  minTouches: number = 3
): StopZoneResult
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `priceHistory` | `PriceData[]` | required | Array of OHLCV candles |
| `currentPrice` | `number` | required | Current market price |
| `lookbackBars` | `number` | 20 | Bars to analyze |
| `minTouches` | `number` | 3 | Minimum level touches |

### Return Value

```typescript
interface StopZoneResult {
  hasStopZone: boolean;                        // Whether stop zone detected
  stopZonePrice: number;                       // Stop cluster price level
  stopZoneType: 'resistance' | 'support' | 'none'; // Zone type
  clusterStrength: 'weak' | 'medium' | 'strong';   // Cluster strength
  touchCount: number;                          // Number of touches
  volumeProfile: 'low' | 'medium' | 'high';    // Volume at level
  reason: string;                              // Human-readable explanation
}
```

### Detection Logic

1. **Find Swing Points**
   - Swing high: High > both neighbors
   - Swing low: Low < both neighbors
   - These are natural stop placement zones

2. **Identify Clusters**
   - Group swings within 2% of current price
   - Resistance clusters: swing highs above price
   - Support clusters: swing lows below price

3. **Validate Touches**
   - Cluster must have ≥ `minTouches` swings
   - More touches = stronger zone

4. **Analyze Volume**
   - Compare cluster volume to average
   - High volume = strong rejection/accumulation
   - Determines cluster strength

5. **Determine Strength**
   - **Strong**: ≥5 touches + volume ratio >1.5x
   - **Medium**: 3-4 touches + volume ratio >1.0x
   - **Weak**: <4 touches or volume ratio <1.0x

### Example Usage

```typescript
import { detectStopZone } from './strategy-filters';

// Detect stop zone near current price
const stopZone = detectStopZone(
  priceHistory,
  42000,  // Current price
  20,     // 20 bars lookback
  3       // 3 touches minimum
);

if (stopZone.hasStopZone) {
  console.log(`Stop zone detected: ${stopZone.reason}`);
  console.log(`Type: ${stopZone.stopZoneType}`);
  console.log(`Level: $${stopZone.stopZonePrice.toFixed(2)}`);
  console.log(`Strength: ${stopZone.clusterStrength}`);
  console.log(`Volume: ${stopZone.volumeProfile}`);
}
```

### Sample Output

**Strong Resistance Zone**
```json
{
  "hasStopZone": true,
  "stopZonePrice": 42450,
  "stopZoneType": "resistance",
  "clusterStrength": "strong",
  "touchCount": 5,
  "volumeProfile": "high",
  "reason": "resistance stop zone at $42450.00: 5 touches, strong cluster, high volume"
}
```

**Medium Support Zone**
```json
{
  "hasStopZone": true,
  "stopZonePrice": 41520,
  "stopZoneType": "support",
  "clusterStrength": "medium",
  "touchCount": 3,
  "volumeProfile": "medium",
  "reason": "support stop zone at $41520.00: 3 touches, medium cluster, medium volume"
}
```

**No Stop Zone**
```json
{
  "hasStopZone": false,
  "stopZonePrice": 42000,
  "stopZoneType": "none",
  "clusterStrength": "weak",
  "touchCount": 1,
  "volumeProfile": "low",
  "reason": "No significant stop zone: resistance touches=1, support touches=2 (need 3)"
}
```

### Visual Interpretation

```
Price Chart (Strong Resistance Zone):

42500 ┤ ●────●───────────●─────●──●  ← Stop Zone (5 touches)
      │                           ↑ High Volume Rejections
42250 ┤ Current Price: $42000
      │         
42000 ┤    ↑
      │    │
41750 ┤    Trading below resistance
      │    Stops clustered above at $42450

Detection: STRONG RESISTANCE STOP ZONE
Implication: Breakout above $42500 likely to trigger stops
```

---

## 3. Round Number Detection

### Purpose
Identifies proximity to psychologically significant round numbers where traders often place stops.

### Function Signature
```typescript
function isNearRoundNumber(
  price: number,
  threshold: number = 0.005
): {
  isNear: boolean;
  roundNumber: number;
  distance: number;
  reason: string;
}
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `price` | `number` | required | Current price |
| `threshold` | `number` | 0.005 | Distance threshold (0.5%) |

### Round Number Logic

Price determines round increment:
- **≥$10,000**: Round to $1,000 (e.g., $20K, $21K)
- **≥$1,000**: Round to $500 (e.g., $1000, $1500)
- **≥$100**: Round to $50 (e.g., $100, $150)
- **≥$10**: Round to $5 (e.g., $10, $15)
- **<$10**: Round to $1 (e.g., $1, $2)

### Example Usage

```typescript
import { isNearRoundNumber } from './strategy-filters';

const result = isNearRoundNumber(42175, 0.005);

if (result.isNear) {
  console.log(`Near round number: ${result.reason}`);
  console.log(`Round level: $${result.roundNumber}`);
  console.log(`Distance: ${(result.distance * 100).toFixed(2)}%`);
}
```

### Sample Output

```json
{
  "isNear": true,
  "roundNumber": 42000,
  "distance": 0.0042,
  "reason": "Price $42175.00 within 0.42% of round number $42000"
}
```

---

## 4. Consolidation Detection

### Purpose
Determines if market is ranging/consolidating vs trending. Used by Mean Reversion strategy.

### Function Signature
```typescript
function isConsolidating(
  priceHistory: PriceData[],
  sma?: number
): {
  isConsolidating: boolean;
  trendStrength: number;
  reason: string;
}
```

### Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `priceHistory` | `PriceData[]` | required | Array of price data |
| `sma` | `number` | optional | SMA value for balance check |

### Detection Logic

**With SMA (preferred)**:
1. Calculate price-SMA balance (closes above vs below)
2. Calculate trend strength (linear regression slope)
3. Consolidating if: balance <40% AND trend strength <1%

**Without SMA**:
1. Calculate trend strength only
2. Consolidating if: trend strength <1%

### Example Usage

```typescript
import { isConsolidating } from './strategy-filters';

const result = isConsolidating(priceHistory, 42000);

if (result.isConsolidating) {
  console.log(`Market consolidating: ${result.reason}`);
  console.log(`Trend strength: ${(result.trendStrength * 100).toFixed(2)}%`);
}
```

### Sample Output

```json
{
  "isConsolidating": true,
  "trendStrength": 0.0067,
  "reason": "Consolidating: balanced SMA interaction (30%), weak trend (0.67%)"
}
```

---

## Integration with Strategies

### Breakout Strategy
- **Range Detection** (required): Identifies consolidation to break out from
- **Stop-Zone Detection** (optional): Avoids breaking into obvious stop clusters

### Mean Reversion Strategy
- **Range Detection** (required): Confirms ranging market
- **Consolidation Detection**: Validates mean reversion environment

### Range Trading Strategy
- **Range Detection** (required): Identifies tradable range boundaries
- **Stop-Zone Detection** (optional): Validates boundary strength

### VWAP Bounce Strategy
- Uses existing trend detection (no specialized filters)

### Liquidity Trap Strategy
- **Stop-Zone Detection** (required): Identifies trap locations
- **Range Detection**: Confirms range/level structure
- **Round Number**: Identifies psychological trap levels

---

## Testing Checklist

For each filter, verify:

- ✅ **True Positives**: Correctly identifies patterns
- ✅ **True Negatives**: Correctly rejects non-patterns
- ✅ **Edge Cases**: Handles insufficient data gracefully
- ✅ **Reason Clarity**: Explanations are beginner-friendly
- ✅ **Parameter Tuning**: Defaults work well, ranges make sense
- ✅ **Performance**: Runs efficiently on 20-100 bar history

---

## Performance Considerations

### Computational Complexity

| Filter | Time Complexity | Notes |
|--------|----------------|-------|
| Range Detection | O(n) | Linear scan for touches |
| Stop Zone Detection | O(n²) | Swing point detection + clustering |
| Round Number | O(1) | Constant time calculation |
| Consolidation | O(n) | Linear regression |

**Optimization Tips**:
- Cache filter results per symbol (valid for N bars)
- Run filters only when needed (strategy-specific)
- Use larger bars for initial screening, smaller for entry

### Memory Usage
- Each filter operates on sliced arrays (no mutation)
- Typical memory per call: <1MB for 100 bars
- Safe for concurrent execution across multiple symbols

---

## Next Steps

1. **Task 3**: Add filter parameters to strategy settings UI
2. **Task 4**: Integrate filters into strategy detection methods
3. **Task 7**: Generate visual proof (charts with filter overlay)
4. **Task 9**: Test Walter's filter explanations

**Status**: Filters implemented and documented ✅
