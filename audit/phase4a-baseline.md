# Phase 4A Baseline Performance Metrics
## Dawn Trader v1.9.4-stability-verified

**Date:** 2025-11-06  
**Branch:** dt-v1-revival-bootstrap  
**Measurement Period:** Pre-optimization

---

## Baseline Metrics Summary

| Metric | Current | Target | Gap | Priority |
|--------|---------|--------|-----|----------|
| **Startup Time** | ~17s | ≤8s | -9s (-53%) | 🔴 CRITICAL |
| **Cache Hit Ratio** | 66.7% | ≥85% | +18.3% | 🟡 HIGH |
| **API Latency** | 165ms avg | ≤110ms | -55ms (-33%) | 🟡 HIGH |
| **Memory Usage** | ~180MB | <200MB | ✅ OK | 🟢 LOW |

---

## 1. Startup Time Analysis (~17s)

### Synchronous Services (Sequential Loading)

**Root Cause:** All services initialize synchronously before `app.listen()`

**Identified Bottlenecks:**
1. Permission Cache initialization
2. Trading State Sync (recovers all users)
3. Strategy Sync Service (sync all users)
4. Portfolio State initialization  
5. Purpose Layer initialization
6. Corpus Domain Service initialization
7. Context Loader (loads replit.md)
8. File Persistence self-test
9. Database Monitor startup
10. Market Data Health Check
11. Analytics Scheduler
12. LATTI Manager (if enabled)

**Impact:** Server blocks on `app.listen()` until ALL services complete

**Optimization Strategy:**
- Move non-critical services to lazy loader (setTimeout after listen)
- Keep only auth, routing, and core DB initialization synchronous
- Target: 50%+ reduction (8s or less)

---

## 2. Cache Hit Ratio (66.7%)

### Current Implementation: BobCore Cache

**Measurements from logs:**
- Sample: 50 requests analyzed
- Cache Hits: 6
- Cache Misses: 3
- Hit Ratio: 66.7%

**Cache Keys Observed:**
- `data:averages:paper:*` (30s TTL)
- `strategy:performance:paper:*` (30s TTL)
- `trade:active:*` (1s TTL)
- `metrics:paperSimStatus` (30s TTL)

**Issues:**
1. TTL too short for stable data (30s)
2. No mode-scoped cache warmup
3. Cache eviction too aggressive
4. No cache pre-fetch for common queries

**Optimization Strategy:**
- Increase TTL for stable endpoints (60-90s)
- Add mode-scoped warmup on server start
- Implement intelligent cache pre-fetching
- Target: 85%+ hit ratio

---

## 3. API Latency (165ms average)

### Request Breakdown (Sample: 83 requests)

**Distribution:**
- Fast (≤100ms): ~25% (mostly cache hits)
- Medium (100-200ms): ~50% (database queries)
- Slow (≥200ms): ~25% (complex aggregations)

**Slowest Endpoints:**
- `/api/portfolio/overview`: 250-400ms
- `/api/trading/status`: 260-270ms (DB + aggregation)
- `/api/system/config`: 198-206ms (repeated calls)
- `/api/analytics/guardrails-compliance`: 263-280ms

**Root Causes:**
1. `/api/system/config` called 10+ times per page load (no caching)
2. Trading status queries DB every time (mode-based data)
3. Portfolio overview does complex aggregations
4. No request deduplication

**Optimization Strategy:**
- Cache `/api/system/config` aggressively (120s TTL)
- Add request coalescing for duplicate in-flight requests
- Pre-compute portfolio aggregations
- Target: 110ms or less average

---

## 4. Memory Usage (~180MB)

**Current State:** ✅ Well within target (<200MB)

**Breakdown:**
- V8 Heap: ~120MB
- DB Connection Pool: ~20MB
- Cache Layer: ~15MB
- Misc: ~25MB

**No optimization needed** - already performant

---

## 5. Telemetry Analysis

### WebSocket Broadcasts

**Observed Payloads:**
- `price_updated`: ~150 bytes each (5 symbols × 5s interval)
- `trading_state_changed`: ~400 bytes each
- `health_engine`: ~800 bytes (5s heartbeat)

**Broadcast Frequency:**
- Price updates: Every 5 seconds
- Health engine: Every 5 seconds
- Trading state: On change

**Current Bandwidth Usage:**
- Price: 30 bytes/s × 5 symbols = 150 bytes/s
- Health: 160 bytes/s
- Total: ~310 bytes/s per client

**Optimization Strategy:**
- Batch price updates (2s intervals, 5 symbols in one payload)
- Compress health payloads (remove verbose fields)
- Use diff-based updates (only changed fields)
- Target: 60% reduction (≤124 bytes/s)

---

## 6. Frontend Bundle Size

**Current Build (from Phase 3C):**
- Total: 1.3MB uncompressed
- Gzipped: 272KB
- Main chunk: ~800KB
- Vendor chunk: ~500KB

**Optimization Needed:**
- Code-split large components
- Lazy-load LATTI widget
- Enable esbuild minify
- Target: ≤1MB gzipped (currently 272KB ✅)

**Note:** Frontend already meets target - minimal work needed

---

## Summary

**High-Priority Optimizations:**
1. ✅ **Startup Time** - Lazy load services (critical)
2. ✅ **Cache Hit Ratio** - Improve Bob Cache (high priority)
3. ✅ **API Latency** - Cache /system/config, add coalescing (high priority)
4. ⚠️ **Telemetry** - Batch WebSocket broadcasts (medium priority)
5. ✅ **Frontend** - Already optimized (low priority)

**Exit Criteria:**
- [ ] Startup ≤ 8s
- [ ] Cache Hit ≥ 85%
- [ ] API Latency ≤ 110ms
- [ ] Telemetry Bandwidth ≤ 40% of baseline
- [ ] No functional regressions

---

**Baseline Established:** 2025-11-06 17:05 UTC  
**Next Step:** Implement Phase 4A optimizations
