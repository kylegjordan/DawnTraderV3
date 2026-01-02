# 🧮 Dawn Trader – Phase 9 & 10 Mathematical Methodology and Directive Roadmap (Final Reference Edition)

*(Institutional Math Core + Hybrid Alpha Pattern Integration)*

---

## 📘 System Definition
Dawn Trader is an autonomous, quantitative trading engine that converts multi-asset market data (via Kraken API) into filtered, ranked, and risk-controlled trade executions.  

**Design Philosophy:** Mathematically rigorous · Probabilistically weighted · Computationally efficient · Operationally resilient.

---

## 1️⃣ System Context & Mathematical Architecture

| Stage | Function | Core Computation | Key Outputs |
|--------|-----------|-----------------|--------------|
| **FX5 Scanner** | Stream capture & pair screening | Price Δ, Volume, Spread, ATR, Liquidity (Log-Normalized) | Clean market feed |
| **Filter Engine** | Remove illiquid / volatile / anomalous pairs | \(LQ ≥ 40\), \(VolNoise ≤ 0.6\) | Active Filter Pool |
| **Dynamic Strategy Selector (DSS)** | Regime Detection & Routing | \(P_{score}\), \(DI\), \(Noise\), Regime Matching | Signal Type (Quant / Hybrid / Pattern) & Playbook |
| **Strategy Orchestrator** | Execute selected strategies only | Kalman Trend, Pattern Recognizer | Raw Signals |
| **Sizing Helper** | Compute position quantities & apply covariance risk | \(Qty = R_{max} · PV · Penalty\) | Signal + Quantity |
| **Signal Quality Evaluator (SQE)** | Validate and normalize signal scores (CWQI, GSI, DI) | Re-scoring and threshold testing | Ranked Signals |
| **Trade Criteria Limit (TCL)** | Slot manager / promotion control | Slot availability logic | Activated Orders |
| **VTS (Virtual Trading Simulator)** | Passive simulation & calibration | Mirror paper trades → learn \(P_{win}\) | Predictive Feedback |

---

## 2️⃣ Phase 9 Core Mathematical Upgrades

*(Unchanged sections omitted for brevity — focus below is the CWQI + Friction updates.)*

---

## 5️⃣ Analysis Utilities

### A. Log-Liquidity (LQ)
```ts
calculateLogLiquidity(V: number, C: number, S: number): number {
  const spread = Math.max(S, 1e-8);
  const count = Math.max(C, 1);
  const raw = 10 * (Math.log(V * count) - Math.log(spread / count) - 10);
  return Math.max(0, Math.min(100, raw));
}
```

### B. Covariance Penalty
```ts
calculateCovariancePenalty(correlations: number[]): number {
  if (!correlations.length) return 1.0;
  const N = correlations.length + 1;
  const sumRho = correlations.reduce((s, r) => s + Math.max(0, r), 0);
  const avgRho = sumRho / correlations.length;
  return 1 / Math.sqrt(1 + (N - 1) * avgRho);
}
```

### C. Friction (Standardized Phase 9.9)
```ts
calculateFriction(entry: number, exit: number, qty: number): number {
  const f = SYSTEM_GUARDS.BASE_FEE_SLIPPAGE; // e.g., 0.005 (0.5%)
  return qty * ((entry * f) + (exit * f));
}
```
**Definition:**  
\[
Friction = (EntryPrice + ExitPrice) × Qty × (\text{Fee + Slippage})
\]
This unified helper ensures consistent cost deductions for all expectancy and scoring computations.

### D. Pattern Decay (Persistence)
*(Unchanged from previous edition.)*

---

## 6️⃣ CWQI — Composite Weighted Quality Index (Phase 9.9 Final)

### 6.1 Mathematical Structure

CWQI v5 (Standardized Net Expectancy Model) replaces raw EV with **Net EV**, integrating friction (fees + slippage) into both gating and ranking logic.

1️⃣ **Raw Expected Value (EV):**
\[
EV_{raw} = (P_{win} × Dist_{Target}) − (P_{loss} × Dist_{Stop})
\]

2️⃣ **Friction:**
\[
Friction = (Entry + Exit) × Qty × (\text{Fee + Slippage})
\]
with \(\text{Fee + Slippage} = SYSTEM\_GUARDS.BASE\_FEE\_SLIPPAGE (0.005)\)

3️⃣ **Net Expectancy (Gate Variable):**
\[
EV_{net} = EV_{raw} − Friction
\]
Trade passes only if \(EV_{net} > 0\).

4️⃣ **CWQI Score (0–100 Scale):**
\[
Score = Normalize\left(\frac{EV_{net}}{Risk}\right) × DI × (1 − VolNoise) × (1 − \bar{ρ})
\]
If \(EV_{net} ≤ 0\), Score = 0.

### 6.2 Implementation Highlights

- **Gate Check:** Rejects trades where `netEV ≤ 0`  
- **Transparency:** Returns `{ rawEV, netEV, friction, score }`  
- **Normalization:** \((EV_{net}/Risk)\) mapped from [−1, +1] → [0, 100]  
- **Dependencies:** SYSTEM_GUARDS.BASE_FEE_SLIPPAGE ensures global consistency  

### 6.3 Validation Cases

| Case | Description | Raw EV | Friction | Net EV | Gate | Score |
|------|--------------|--------|-----------|--------|-------|--------|
| Micro-Scalp | Tiny gain, high friction | +0.05 | 0.10 | −0.05 | Reject | 0 |
| Normal | Moderate trend | +1.25 | 0.10 | +1.15 | Pass | ≈ 80 |
| Swing | High reward | +4.00 | 0.10 | +3.90 | Pass | ≈ 95 |

---

## 7️⃣ Implementation Timeline & Directive Roadmap  
*(As in prior edition, extended through Directive 9.9)*

| Directive | Title | Description |
|------------|--------|-------------|
| **9.8** | Phase 9 Validation & Legacy Purge | Unified Filter Gateway, Integrity Tests |
| **9.9** | CWQI Net Expectancy & Friction Standardization | Replace raw EV with Net EV and standardize friction logic. |
| **10.0 → 10.6** | Phase 10 – Hybrid Alpha Pattern Engine | (Unchanged) |

---

## ✅ Summary
All Phase 9 math now operates on **Net Expectancy (EV − Friction)** and is fully aligned across CWQI, VTS, and Analysis Utils.  
No trade with negative Net EV can pass the Gate or score above zero, ensuring mathematical integrity ahead of Phase 10 Goal Learning.

---

**End of File – DawnTrader_Phase9_10_Math_Methodology_and_Roadmap_FINAL (Net EV Edition)**
