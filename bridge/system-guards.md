# System Guards Configuration Reference

**Schema**: `metrics-calibration/v1.2`  
**Last Updated**: January 23, 2026  
**Source**: `/server/config/system-guards.ts`

---

## Overview

System Guards provide centralized threshold governance for all Phase 9+ quantitative computations. All modules must import from `system-guards.ts` to prevent configuration drift.

---

## Core Guards (SYSTEM_GUARDS)

| Parameter | Value | Description |
|-----------|-------|-------------|
| `VERSION` | `Phase10_DSS` | Current phase version |
| `MIN_LIQUIDITY_SCORE` | 40 | Minimum LQ for active trading |
| `MAX_VOL_NOISE` | 0.6 | Maximum VN for active trading |
| `BASE_FEE_SLIPPAGE` | 0.005 | Default fee+slippage assumption (0.5%) |
| `CORRELATION_THRESHOLD` | 0.75 | Maximum correlation for active trading |
| `MIN_VOLUME_THRESHOLD_USD` | 2,000,000 | Minimum 24h volume |
| `DI_TRENDING` | 65 | DI threshold for trending classification |
| `DI_CHOPPY` | 30 | DI threshold for choppy classification |

---

## IMF Thresholds (Directive 11.7H)

**Purpose**: Separate thresholds for passive learning mode to allow broader data collection while maintaining active trading discipline.

| Parameter | Value | Description |
|-----------|-------|-------------|
| `LQ_MIN` | 40 | Minimum log-liquidity for passive learning |
| `VN_MAX` | 0.80 | Maximum volatility noise for passive learning |
| `CORR_MAX` | 0.95 | Maximum correlation for passive learning |

**Rationale**: Passive learning uses relaxed thresholds (VN_MAX=0.8 vs 0.6) to capture more market scenarios for ML training, while active trading maintains stricter filters for execution quality.

---

## Hybrid Parameters (HYBRID_PARAMS)

| Parameter | Value | Description |
|-----------|-------|-------------|
| `MIN_SCORE` | 0.65 | Minimum ensemble score for execution |
| `MAX_CONFLUENCE_WINDOW` | 5 | Max candle gap for Quant/Pattern confluence |
| `WEIGHTS.QUANT` | 0.4 | Quantitative signal weight |
| `WEIGHTS.PATTERN` | 0.4 | Pattern recognition weight |
| `WEIGHTS.PREDICTIVE` | 0.2 | ML predictive confidence weight |
| `DECAY.LAMBDA` | 0.15 | Pattern decay rate per candle |
| `DECAY.FLOOR` | 0.3 | Minimum retained influence |

---

## Scanner Parameters (SCANNER_PARAMS)

| Parameter | Value | Description |
|-----------|-------|-------------|
| `ADAPTIVE_ENABLED` | true | Master flag for adaptive scanning |
| `DUAL_POOL.IDEAL_RATIO` | 0.6 | Ideal pool allocation (60%) |
| `DUAL_POOL.ROTATIONAL_RATIO` | 0.4 | Rotational pool allocation (40%) |
| `BATCH_SIZE` | 100 | Total pairs per scan batch |
| `TELEMETRY.HISTORY_WINDOW_MS` | 86400000 | 24-hour telemetry window |

---

## Usage

```typescript
import { SYSTEM_GUARDS, IMF_THRESHOLDS } from '../config/system-guards.js';

// Active trading threshold
const maxVN = SYSTEM_GUARDS.MAX_VOL_NOISE; // 0.6

// Passive learning threshold  
const passiveMaxVN = IMF_THRESHOLDS.VN_MAX; // 0.8
```

---

## Change Log

| Version | Date | Description |
|---------|------|-------------|
| v1.2 | 2026-01-23 | Directive 11.7H: Added IMF_THRESHOLDS export |
| v1.1 | 2026-01-15 | Added SCANNER_PARAMS |
| v1.0 | 2025-12-13 | Initial Phase 9.6 configuration lock |
