# Deployment Environment Considerations

**Created:** 2025-12-17  
**Status:** Reference Documentation  
**Category:** Infrastructure & Performance

## Overview

This document outlines the performance differences between development and production deployment environments, particularly relevant for the DawnTrader trading bot which requires reliable, low-latency connections for real-time market data.

## Development Environment Limitations

The development environment runs on shared infrastructure with the following constraints:

### Resource Quotas
- **CPU/RAM:** Shared resources with usage quotas based on plan tier
- **Network Bandwidth:** Limited based on subscription level
- **Storage:** Subject to plan-specific limits

### Performance Impacts
- **Throttling:** Environment may throttle during high resource usage
- **Pausing:** May pause during periods of inactivity
- **Resource Contention:** Latency spikes when other workloads compete for resources
- **Connection Drops:** WebSocket connections may be interrupted during resource management

### Impact on Trading Operations
| Component | Effect |
|-----------|--------|
| REST API Calls | Higher latency to Kraken/Binance endpoints |
| WebSocket Feeds | Connection drops during throttling |
| Price Cache | Updates may lag behind real market conditions |
| FX5 Scanner | Slower scan cycles during resource contention |
| RTB Refresh | Delayed signal re-qualification cycles |
| Trade Execution | Potential delays in order placement |

## Reserved VM Deployment (Production)

For reliable 24/7 trading operations, Reserved VM Deployment provides:

### Dedicated Resources
- **Guaranteed CPU/RAM:** Dedicated allocation, no sharing
- **Consistent Performance:** No throttling or pausing
- **99.9% Uptime SLA:** Guaranteed availability

### Benefits for Trading
- **Always-On WebSocket:** Persistent connections to exchange feeds
- **Low Latency:** Consistent response times for API calls
- **Reliable Execution:** No delays from resource contention
- **Continuous Operation:** No pausing during inactive periods

### Machine Sizing Options
Reserved VMs offer flexible sizing to match workload requirements:
- Smaller instances for development/testing
- Larger instances for production trading with multiple strategies

## Recommendations

### Development Phase
- Use the development environment for building and testing features
- Expect occasional latency variations during heavy operations
- Monitor for connection drops and implement reconnection logic

### Production Trading
- Deploy to Reserved VM for live trading sessions
- Select machine size based on:
  - Number of active strategies
  - Scan frequency (FX5, RTB cycles)
  - Number of concurrent WebSocket subscriptions
  - Expected trade volume

### Hybrid Approach
1. Develop and test in development environment
2. Deploy to Reserved VM for paper trading validation
3. Promote to production Reserved VM for live trading

## Technical Considerations

### Auto-Recovery Features
The trading bot should implement:
- WebSocket reconnection with exponential backoff
- REST API retry logic with circuit breaker
- Price cache staleness detection
- Engine state persistence for restart recovery

### Monitoring
Key metrics to track across environments:
- WebSocket tick frequency and gaps
- REST API response times
- Price cache hit rates
- Engine health status

## Related Documentation
- `bridge/decisions/` - Change requests and architectural decisions
- `bridge/directives/` - Operational directives and policies
- `bridge/phases/` - Implementation phase documentation
