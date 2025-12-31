# 🧮 Dawn Trader – Mathematical Methodology Plan
*(Phase 9 Institutional Math Core + Phase 10 Hybrid Alpha Pattern Engine)*

---

## 📘 System Definition
Dawn Trader is an autonomous quantitative trading engine that converts multi-asset market data (via the Kraken API) into filtered, ranked, and risk-controlled trade executions.

**Design Philosophy:**  
Mathematically rigorous · Probabilistically weighted · Computationally efficient · Operationally resilient.

---

## 1️⃣ System Context & Mathematical Architecture

| Stage | Function | Core Computation | Key Outputs |
|--------|-----------|-----------------|--------------|
| **FX5 Scanner** | Stream capture & pair screening | Price Δ, Volume, Spread, ATR, Liquidity (Log-Normalized) | Clean market feed |
| **Filter Engine** | Remove illiquid / volatile / anomalous pairs | \(LQ \ge 40\), \(VolNoise \le 0.6\) | Active Filter Pool |
| **Strategy Orchestrator** | Apply multi-strategy models (Quant + Pattern) and compute core metrics | Kalman Trend, Pattern Recognizer, CWQI, Directional Integrity | Raw Signals (Type: Quant / Hybrid / Pattern) |
| **Sizing Helper** | Compute position quantities & apply covariance risk | \(Qty = R_{max} · PV · Penalty\) | Signal + Quantity |
| **Signal Quality Evaluator (SQE)** | Validate and normalize signal scores (CWQI, GSI, DI) | Re-scoring and threshold testing | Ranked Signals |
| **Trade Criteria Limit (TCL)** | Slot manager / promotion control | Slot availability logic for Ready-to-Buy Queue | Trade Promotions (Activated Orders) |
| **VTS (Virtual Trading Simulator)** | Passive simulation & calibration | Mirror paper trades → learn \(P_{win}\) | Predictive Feedback |

---

## 2️⃣ Phase 9 Core Mathematical Upgrades (The “Brain”)

### C. Adaptive Kalman Filter (Final Revision – Efficiency Ratio Driven)

**Objective:** Prevent “Chop-Chasing” and dynamically adjust responsiveness to market regime.

**Step 1: Compute Efficiency Ratio (ER)**
\[
ER = rac{|Net Change|}{\sum|Δ Price_i|}
\]

**Step 2: Adaptive Parameters**
\[
R = clip(1 + (1 - ER)·20, 1, 50)
\]
\[
Q = VolatilityScore · 0.5
\]

**Step 3: Filter Update**
\[
K_t = rac{P_{t|t-1}}{P_{t|t-1}+R},\quad
x_t = x_{t|t-1}+K_t(y_t-x_{t|t-1})
\]

✅ **Effect:**  
- High ER (Strong Trend) → Low R → Fast adaptation  
- Low ER (Whipsaw) → High R → Noise rejection  

---

### 2️⃣.1 Implementation Details (AnalysisUtils)

#### A. Log-Liquidity (LQ)
```ts
calculateLogLiquidity(V: number, C: number, S: number): number {
    const spread = Math.max(S, 1e-8);
    const count  = Math.max(C, 1);
    const raw = 10 * (Math.log(V * count) - Math.log(spread / count) - 10);
    return Math.max(0, Math.min(100, raw));
}
```

#### B. Covariance Penalty
```ts
calculateCovariancePenalty(correlations: number[]): number {
    if (!correlations.length) return 1.0;
    const N = correlations.length + 1;
    const sumRho = correlations.reduce((s, r) => s + Math.max(0, r), 0);
    const avgRho = sumRho / correlations.length;
    return 1 / Math.sqrt(1 + (N - 1) * avgRho);
}
```

Both functions are to be placed in **`server/utils/analysis-utils.ts`** and referenced by the Filter Engine and Sizing Helper.

---

## 3️⃣ Phase 10 Hybrid Alpha Pattern Engine (The “Eyes”)

### 3.1 Architecture Overview
| Component | File | Description |
|------------|------|-------------|
| **Pattern Recognizer** | `server/services/analytics/pattern-recognizer.ts` | Detects five core candlestick patterns and outputs `PatternSignal` object with strength (0–1). |
| **Integration Point** | `server/engines/strategy-orchestrator.ts` | Executes PatternRecognizer each completed candle cycle, merges pattern signals with Quant signals, computes CWQI and DI. |
| **Database Extension** | `signals` table | Adds `signal_type` (`QUANT`, `HYBRID`, or `PATTERN`) and `strategy` fields. |
| **Signal Evaluation** | Strategy Orchestrator | Evaluates lane logic and assigns strategy ID and score. |
| **VTS Backtesting** | `server/engines/vts.ts` | Tracks pattern strategy performance for Phase 10.1 calibration. |

---

### 3.2 Pattern Detection Formulas
1. **Golden Pinbar (Rejection)**  
 LowerWick > 2.5 × Body AND UpperWick < 0.5 × Body AND Vol > 1.2 × AvgVol  
2. **Momentum Engulfing (Force)**  
 Close > PrevOpen AND Open < PrevClose AND Body > 1.5 × PrevBody AND LQ > 60  
3. **Inside Bar Breakout (Expansion)**  
 CurrentHigh > PrevHigh (trigger) where previous was an inside bar  
4. **Three White Soldiers (Trend Birth)**  
 3 green candles, each closing higher, opening within prior body  
5. **Morning Star (Transition)**  
 Big Red → Small Star → Big Green (> 50 % of Red)

Each pattern produces:
```ts
PatternSignal {
  patternName: string;
  strength: number; // 0–1 normalized
  direction: 'bullish' | 'bearish';
}
```

---

### 3.8 Pattern Persistence / Decay Logic

**Problem:** Pattern detections are momentary; their predictive influence fades over several candles.

**Solution:** Introduce exponential time-decay of pattern strength.

\[
Strength_t = InitialStrength × (0.8)^{Δt / t_{frame}}
\]

Where Δt = elapsed minutes since detection, and t_frame = candle duration.

**Implementation (TypeScript):**
```ts
// Called each candle close
updatePatternStrength(signal: PatternSignal, candlesElapsed: number) {
    const decayFactor = Math.pow(0.8, candlesElapsed / signal.timeframeMinutes);
    signal.strength *= decayFactor;
    if (signal.strength < 0.5) signal.expired = true;
}
```

**Lifecycle:**
| Minute | Strength | Lane |
|--------:|-----------|------|
| 0 | 1.00 | Hybrid Active |
| 1 | 0.80 | Hybrid Active |
| 2 | 0.64 | Fading |
| 3 | 0.51 | Expired → revert to Quant Lane |

---

## 5️⃣ Implementation Timeline (Revised)

| Phase | Focus | Outcome |
|--------|--------|----------|
| 9.0 | Infrastructure Stability | WebSocket, Volume Classifier |
| 9.1 | Math Core (Updated) | Log-Liquidity, Kalman ER Filter, Covariance Penalty |
| 10.0 | Pattern Engine | PatternRecognizer Service + Decay Logic |
| 10.1 | Calibration | VTS Pattern Persistence & Threshold Tuning |
| 10.2 | Analytics | Pattern Performance Dashboard + Strategy Reweighting |

---

## ✅ Summary of Alignment

| Gemini Proposal | My Position | Status |
|-----------------|-------------|---------|
| Kalman R = ER-based formula | ✅ Fully Adopt | Incorporated |
| TypeScript snippets for LQ & Covariance | ✅ Fully Adopt | Incorporated |
| Pattern Persistence Decay | ✅ Adopt with timeframe scaling | Incorporated (Scaled) |

---

## 🧭 Conclusion

All of Gemini’s recommendations are technically sound and materially improve both robustness and trade realism.  
The final plan above merges:
- Gemini’s mathematical refinements  
- Your architectural clarifications  
- My integration logic from the prior plan

✅ **Recommendation:**  
Adopt this as the *final Phase 9 + 10 Mathematical Methodology Plan* baseline.
