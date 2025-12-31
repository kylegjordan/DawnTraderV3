# ⚙️ Dawn Trader Phase 9 & 10 Directive Roadmap

This roadmap provides a structured sequence of directives for implementation across Phases 9 and 10 of the Dawn Trader Quantitative Trading System.  
Each directive defines an atomic, testable milestone that builds upon the existing infrastructure validated through Directive 8.9.5.

---

## 🧠 Phase 9 – Institutional Math Core
**Goal:** Strengthen Dawn Trader’s mathematical foundations with normalized liquidity metrics, enhanced volatility modeling, adaptive Kalman trend logic, covariance-based risk control, and a standardized signal evaluation framework.

| Directive | Title | Description |
|------------|--------|-------------|
| **Directive 9.0 – Infrastructure Stability & Volume Classifier** | Improve WebSocket and REST synchronization reliability, introduce volume classification (small, medium, large-cap tiers), and ensure consistent feed latency <100 ms. |
| **Directive 9.1 – Log-Liquidity Normalization Engine** | Implement `calculateLogLiquidity()` in `analysis-utils.ts`, integrate into FX5 Scanner and Filter Engine to produce stable 0–100 liquidity scores and prevent “infinite liquidity” spikes. |
| **Directive 9.2 – Volatility Noise & Stability Metrics** | Add `VolNoise` and `GSI` computations to `analysis-utils.ts`. Integrate them into the Filter Engine to filter out choppy or erratic pairs before the Strategy Orchestrator sees them. |
| **Directive 9.3 – Adaptive Kalman Filter (Efficiency Ratio Model)** | Replace the volatility-based R logic with the new ER-based model (`R = clip(1 + (1 - ER)*20, 1, 50)`). This corrects “Chop-Chasing” behavior and improves trend detection accuracy by ~60%. |
| **Directive 9.4 – Covariance Guard / Risk Concentration Control** | Implement `calculateCovariancePenalty()` and integrate with the Sizing Helper to dynamically adjust position sizing based on inter-asset correlation risk. |
| **Directive 9.5 – CWQI v4 Integration (Expected Value Model)** | Upgrade CWQI to v4 with Net Expected Value (Reward–Risk ratio) and link it to the Signal Quality Evaluator for universal signal ranking. |
| **Directive 9.6 – Directional Integrity (DI) Computation** | Implement DI metric to quantify trend persistence versus volatility, integrate into the Orchestrator and SQE for entry timing alignment. |
| **Directive 9.7 – Consolidation & Testing Suite (Phase 9 Validation)** | Combine all above modules into the Strategy Orchestrator → SQE → Sizing Helper chain, execute 1-hour VTS validation test for model stability, liquidity accuracy, and covariance safety. |

---

## 🧩 Phase 10 – Hybrid Alpha Pattern Engine
**Goal:** Add intelligent pattern recognition, hybrid quant-pattern confluence logic, and time-decay persistence modeling to enhance trade entry precision and behavioral alpha capture.

| Directive | Title | Description |
|------------|--------|-------------|
| **Directive 10.0 – Pattern Recognizer Service (Core Engine)** | Create `pattern-recognizer.ts` to detect the 5 defined candlestick formations (Pinbar, Engulfing, Inside Bar, Three Soldiers, Morning Star) and return a normalized `PatternSignal`. |
| **Directive 10.1 – Signal Type & Strategy Mapping (Database Upgrade)** | Add `signal_type` (QUANT / HYBRID / PATTERN) and `strategy` fields to the signals table. Ensure all signal objects and DB writers include this new schema. |
| **Directive 10.2 – Strategy Orchestrator Integration (Lane Logic)** | Merge Pattern and Quant signals in the Strategy Orchestrator. Implement the “Three-Lane” logic: HYBRID (confluence), QUANT (quant-only), PATTERN (pattern-only). |
| **Directive 10.3 – Pattern Persistence / Decay Engine** | Introduce exponential time-decay of pattern strength (`Strength_t = InitialStrength × (0.8)^(Δt / t_frame)`) to allow sustained but fading hybrid signals. |
| **Directive 10.4 – Hybrid Strategy Registry** | Register and parameterize all hybrid and pattern strategies (H1–H5, P1–P3) in the Strategy Library for modular expansion and backtest tracking. |
| **Directive 10.5 – VTS Pattern Calibration** | Train and tune decay thresholds, pattern confidence scaling, and hybrid weighting in the Virtual Trading Simulator using rolling paper-trade data. |
| **Directive 10.6 – Pattern Analytics Dashboard** | Add pattern performance analytics module to the monitoring UI. Display live hit rates, decayed strengths, and correlation between quant/pattern confluence and actual performance. |

---

# 🚀 Directive 9.0 – Infrastructure Stability & Volume Classifier

## Objective
Strengthen the foundational data pipeline before mathematical modules are added.

## Deliverables

### 1. Stabilize WebSocket Feeds
- Verify the Mini-Book system’s stability post–Directive 8.9.5.
- Add lightweight heartbeat metrics to detect silent disconnects.
- Automatically trigger soft resubscribe on timeout > 60 seconds.
- Log heartbeat events with `[9.0][HEARTBEAT]` tag.

### 2. Implement Volume Classifier Module
Create a new function in `analysis-utils.ts`:
```ts
export function classifyVolume(volumeUSD: number): 'SMALL' | 'MID' | 'LARGE' {
    if (volumeUSD < 1_000_000) return 'SMALL';
    if (volumeUSD < 10_000_000) return 'MID';
    return 'LARGE';
}
```
Integrate this into:
- **FX5 Scanner:** Add `volumeClass` property to the output dataset.
- **Filter Engine:** Use `volumeClass` to prioritize high-liquidity pairs during screening.
- **SQE Metrics:** Allow volume class to be a filter parameter for trade eligibility.

### 3. Latency Guard
- Measure tick latency per symbol (WebSocket → System update).
- Log `[9.0][LATENCY]` events when average tick latency > 100 ms.
- Add a visual alert flag in the dashboard’s status monitor for persistent latency breaches.

---

## Validation Criteria
| Metric | Threshold | Target |
|--------|------------|--------|
| Heartbeat continuity | No missed heartbeats in 60 minutes | ✅ |
| Tick latency | < 100 ms average | ✅ |
| REST fallback triggers | < 1/hour | ✅ |
| Volume classification accuracy | Matches Kraken 24h volume ranges | ✅ |

---

## Verification Test
Run a 60-minute passive trading session in paper mode with 10 tracked pairs.  
Confirm logs include consistent `[9.0][HEARTBEAT]` intervals and `[9.0][LATENCY]` only on expected network spikes.  
Ensure `FX5 Scanner` output correctly appends the `volumeClass` field to each symbol.

---

## Implementation Notes
- Place the heartbeat timer in `kraken-websocket-adapter.ts` (interval: 30s).
- Extend the `SystemHealthService` to track latency rolling averages per feed.
- Store latency stats in `/tmp/logs/metrics_latency_9.0.log`.
- Volume classification should integrate seamlessly without altering existing scanner output schemas.

---

## Completion Criteria
✅ System maintains continuous connectivity for 1 hour under production-like load.  
✅ Latency <100ms average per channel.  
✅ Volume Classifier integrated and functioning in all FX5 and Filter Engine outputs.  
✅ Replit verification log: `[9.0][VALIDATION COMPLETE] Infrastructure stable.`
