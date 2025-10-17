# Dawn Trader Gap Analysis
## Phases 8.7 → 8.9 Implementation Roadmap

**Analysis Date:** October 17, 2025  
**Analyst:** Replit Agent  
**Scope:** Technical feasibility, dependencies, and implementation gaps

---

## Executive Summary

Dawn Trader has completed **Phase 8.7.1 (State Awareness Layer)** and **Phase 8.7.2 (Intent Execution Framework)**, establishing a solid foundation for Walter's execution capabilities. The remaining roadmap (Phases 8.7.3 → 8.9) builds on existing infrastructure but introduces **7 new components** with varying complexity.

**Critical Finding:** ~60% of planned features have **foundational components already built** (WebSocket infrastructure, Bob modules, health monitoring, provenance tracking), reducing implementation risk. However, **3 high-risk gaps** require architectural decisions: (1) async task queue choice (Redis vs PG), (2) memory lifecycle management strategy, and (3) domain-specific Bob integration patterns.

**Timeline Impact:** With existing infrastructure, estimated total effort is **12-15 developer days** vs. 20-25 days from scratch. Highest risk lies in Phase 8.8.2 (Memory Refit) due to checksum validation complexity and startup sequence coordination.

---

## Technical Deep-Dive

### Phase 8.7.3 — Pre-Execution Validator ⚠️ PARTIAL GAP

**Status:** 70% Complete (foundational logic exists, needs formalization)

**What Exists:**
- ✅ `RiskManager.checkPreTradeRisk()` performs 7 pre-trade validation checks
- ✅ `ExchangeValidator` enforces Kraken constraints (tick size, min notional)
- ✅ Slippage tolerance validation in `TradingEngine.processSignal()`
- ✅ Goal alignment scoring already calculated (`calculateGoalAlignmentScore`)

**What's Missing:**
- ❌ **Mock trade simulation endpoint** (`/api/trading/validate`)
- ❌ **Structured validation response schema** with `canExecute`, `slippageEstimate`, `fees`
- ❌ **Integration with Intent Executor** (pre-validation before execution)

**Dependencies:**
- Requires `IntentExecutionService` integration (Phase 8.7.2 ✅)
- Needs formalized response contract for Walter AI consumption

**Risk Assessment:** 🟡 MEDIUM  
**Implementation Effort:** 2-3 days  
**Blockers:** None (all dependencies met)

**Recommendation:**
Create `PreExecutionValidator` service that wraps existing `RiskManager` logic and exposes unified `/api/trading/validate` endpoint. Reuse goal alignment scoring from `TradingEngine`.

---

### Phase 8.7.4 — Context Bridge + Auto Refresh ⚠️ PARTIAL GAP

**Status:** 80% Complete (infrastructure exists, needs optimization)

**What Exists:**
- ✅ WebSocket server (`wss`) with message handling
- ✅ `useWebSocket` React hook with auto-reconnect
- ✅ `ContextRefreshCoordinator` with event emission
- ✅ UI polling mechanisms (5s for paper sim, 10s for health)

**What's Missing:**
- ❌ **Unified state_summary WebSocket subscription** (currently using polling)
- ❌ **Shared prompt weights** between Panel Walter and Widget Walter
- ❌ **Automatic UI refresh on trade/config updates** (partial via polling)

**Dependencies:**
- Requires `StateAwarenessService` (Phase 8.7.1 ✅)
- WebSocket infrastructure ready

**Risk Assessment:** 🟢 LOW  
**Implementation Effort:** 2 days  
**Blockers:** None

**Recommendation:**
Replace polling with WebSocket push for `/api/state/summary` changes. Extend `ContextRefreshCoordinator` to emit `state_summary_updated` events. Both Walter instances (panel/widget) subscribe to same WebSocket channel.

---

### Phase 8.8.1 — Reasoning Orchestrator 🔴 MAJOR GAP

**Status:** 40% Complete (async infrastructure exists, domain Bobs missing)

**What Exists:**
- ✅ `SchedulerRegistry` for async task processing
- ✅ Existing Bob modules: MetricsBob, ConfigBob, DataBob, StrategyBob, InsightBob, UIBob
- ✅ Rate limiting and retry logic in `ResilienceManager`
- ❌ **Domain-specific Bobs:** DevOpsBob, FullStackBob, UXBob **DO NOT EXIST**

**What's Missing:**
- ❌ **DevOpsBob** for infrastructure insights
- ❌ **FullStackBob** for code analysis
- ❌ **UXBob** for frontend health monitoring
- ❌ **Asynchronous Task Queue** (Redis or PG-based job queue)
- ❌ **Structured UI Health Model** (frontend JSON summaries)

**Dependencies:**
- Requires decision: **Redis vs PostgreSQL for job queue**
- Frontend instrumentation for UI health reporting

**Risk Assessment:** 🔴 HIGH  
**Implementation Effort:** 5-6 days  
**Blockers:** 
1. **Architectural Decision Required:** Redis introduces new dependency (scaling benefit) vs PG-based queue (simpler, existing infra)
2. **Bob Module Pattern:** Need consistent interface for domain-specific Bobs

**Recommendation:**
1. **Short-term:** Use PG-based job queue (`pg-boss` or similar) to avoid Redis dependency
2. **Long-term:** Migrate to Redis if async workload exceeds 100 jobs/min
3. **Bob Interface:** Define `DomainBobInterface` extending existing `BobModule` pattern
4. **UI Health:** Instrument frontend with `window.performance` API, POST summaries to new `/api/ui/health` endpoint

**Race Condition Risk:**
- Multiple async Bobs writing to Cortex → ensure mutex locks on Cortex cache updates
- Solution: Extend `CortexCore.setWithTTL()` with optimistic locking using `metadata.version`

---

### Phase 8.8.2 — Memory Refit & Learning Integrity 🔴 CRITICAL GAP

**Status:** 30% Complete (storage exists, lifecycle missing)

**What Exists:**
- ✅ `walter_memory` table with importance-based pruning
- ✅ `learning_fragments` table with provenance tracking
- ✅ `CortexCore` memory management with TTL
- ✅ `ProvenanceLogger` with traceId enforcement
- ❌ **Startup validation/checksum** DOES NOT EXIST
- ❌ **Memory lifecycle manager** DOES NOT EXIST

**What's Missing:**
- ❌ **Memory Lifecycle Manager:**
  - Startup: clear stale entries
  - Rehydrate: load from DB to Cortex
  - Checksum: SHA-256 validation of memory integrity
  - Walter lock until checksum passes
- ❌ **Learning Feedback Job:** Nightly summarization of trading results → new embeddings
- ❌ **Orphaned fragment quarantine:** Enforce traceId lineage validation

**Dependencies:**
- Server startup sequence must run lifecycle manager **before** Walter initialization
- Requires OpenAI embeddings API for learning feedback job

**Risk Assessment:** 🔴 CRITICAL  
**Implementation Effort:** 4-5 days  
**Blockers:**
1. **Startup Sequence Coordination:** Must ensure lifecycle manager completes before WebSocket/API availability
2. **Checksum Strategy:** Define what to hash (all memories? last N? critical fragments only?)
3. **Failure Handling:** If checksum fails, what's the recovery path? (auto-repair vs manual intervention)

**State Desync Risk:**
- Cortex cache vs DB memory divergence during rehydration
- Solution: Implement 2-phase rehydration with rollback on checksum failure

**Recommendation:**
```typescript
// server/services/memory-lifecycle-manager.ts
class MemoryLifecycleManager {
  async initializeOnStartup(): Promise<void> {
    // Phase 1: Clear stale entries (TTL expired)
    await this.clearStaleMemories();
    
    // Phase 2: Rehydrate critical memories to Cortex
    const memories = await this.loadCriticalMemories(); // importance >= 4
    
    // Phase 3: Checksum validation
    const checksum = this.calculateChecksum(memories);
    const valid = await this.validateChecksum(checksum);
    
    if (!valid) {
      throw new Error('Memory checksum failed - manual intervention required');
    }
    
    // Phase 4: Populate Cortex
    await this.rehydrateCortex(memories);
    
    console.log('[MemoryLifecycle] ✅ Startup validation complete');
  }
  
  private calculateChecksum(memories: any[]): string {
    // Hash concatenation of: id + content + importance + timestamp
    const data = memories.map(m => `${m.id}:${m.content}:${m.importance}`).join('|');
    return crypto.createHash('sha256').update(data).digest('hex');
  }
}
```

**Startup Integration:**
```typescript
// server/index.ts (before app.listen)
const memoryLifecycle = new MemoryLifecycleManager();
await memoryLifecycle.initializeOnStartup();
// Only after this succeeds, start WebSocket and API routes
```

**Nightly Learning Job:**
- Leverage existing `SchedulerRegistry`
- Create `LearningFeedbackTask` that runs at 2 AM
- Analyze last 24h trades → generate insights → create embeddings → store in `learning_fragments`

---

### Phase 8.8.3 — Chain-of-Thought Trace ⚠️ PARTIAL GAP

**Status:** 70% Complete (provenance exists, needs domain context)

**What Exists:**
- ✅ `ProvenanceLogger` with traceId generation
- ✅ `data_lineage` and `bob_trace_log` tables
- ✅ End-to-end traceId propagation (Bob → Cortex → Walter → UI)

**What's Missing:**
- ❌ **Domain context annotation** in reasoning traces
- ❌ **Lineage visualization endpoint** for debugging

**Dependencies:**
- Requires domain Bob implementation (Phase 8.8.1)

**Risk Assessment:** 🟢 LOW  
**Implementation Effort:** 1-2 days  
**Blockers:** None

**Recommendation:**
Extend `ProvenanceLogger.logLineage()` to accept optional `domainContext` field. Add `/api/provenance/trace/:traceId` endpoint for lineage graph retrieval.

---

### Phase 8.8.4 — Cognitive Tuning & Testing ⚠️ PARTIAL GAP

**Status:** 50% Complete (validation exists, testing framework missing)

**What Exists:**
- ✅ `StrategyValidator` for historical backtesting
- ✅ `StageBValidator` for live market validation
- ✅ `CognitiveWeightAdjuster` for learning source tuning

**What's Missing:**
- ❌ **Cross-domain reasoning validation** (needs domain Bobs)
- ❌ **Memory integrity test suite**
- ❌ **Automated cognitive health checks**

**Dependencies:**
- Requires Memory Lifecycle Manager (Phase 8.8.2)
- Requires domain Bobs (Phase 8.8.1)

**Risk Assessment:** 🟡 MEDIUM  
**Implementation Effort:** 3 days  
**Blockers:** Depends on 8.8.1 and 8.8.2 completion

**Recommendation:**
Create `CognitiveHealthTask` scheduled task that validates:
1. Memory checksum integrity (daily)
2. Learning source weight distribution (weekly)
3. Cross-domain Bob response consistency (on-demand)

---

### Phase 8.9.1 — Anomaly Detection Service ⚠️ PARTIAL GAP

**Status:** 75% Complete (monitoring exists, needs formalization)

**What Exists:**
- ✅ `SystemHealthMonitor` tracking CPU, memory, latency
- ✅ Anomaly thresholds defined (CPU >75% warning, >90% critical)
- ✅ Cache hit ratio monitoring (BobCore stats)
- ✅ `ContextRefreshCoordinator` discrepancy detection

**What's Missing:**
- ❌ **Data freshness checks** (compare lastTickISO vs now) - **PARTIAL** (exists in MarketDataCoordinator)
- ❌ **BobCore hit ratio alerts** (< 0.6 → cache warning)
- ❌ **Reasoning trace p95 latency** (> 2.5s → performance alert)
- ❌ **Proactive CTO-level alerts** via Smart Notification system

**Dependencies:**
- Notification system already exists (`AlertsService`)
- Metrics collection exists, needs alert triggers

**Risk Assessment:** 🟢 LOW  
**Implementation Effort:** 2 days  
**Blockers:** None

**Recommendation:**
Extend `SystemHealthMonitor` with alert emission:
```typescript
// In analyzeHealth()
if (cacheHitRatio < 0.6) {
  await AlertsService.createAlert({
    userId: 'system',
    mode: 'live',
    alertType: 'system_performance',
    severity: 'warning',
    message: `BobCore cache hit ratio low: ${(cacheHitRatio * 100).toFixed(1)}%`,
  });
}
```

Add `reasoning_trace` performance table to track p95 latency. Emit alerts via WebSocket for Walter to surface.

---

### Phase 8.9.2 — Curiosity Scoring & Feedback Integration ⚠️ MAJOR GAP

**Status:** 20% Complete (conceptual gap)

**What's Missing:**
- ❌ **Curiosity trigger engine** (weighted by severity + learning trends)
- ❌ **Feedback loop integration** with learning fragments
- ❌ **Proactive question generation** for Walter

**Dependencies:**
- Requires learning fragments analysis (Phase 8.8.2)
- Requires anomaly detection alerts (Phase 8.9.1)

**Risk Assessment:** 🟡 MEDIUM  
**Implementation Effort:** 3-4 days  
**Blockers:** Depends on 8.8.2 and 8.9.1

**Recommendation:**
Define curiosity scoring algorithm:
```
curiosity_score = (anomaly_severity * 0.5) + (learning_gap_score * 0.3) + (recency_weight * 0.2)
```

When `curiosity_score > 0.7`, trigger Walter proactive question:
- Low learning coverage: "I notice we haven't tested {strategy} in volatile conditions. Should we explore this?"
- High anomaly frequency: "System showing unusual {metric} patterns. Would you like detailed analysis?"

---

## Gap Summary Table

| Component | Risk | Implementation Effort | Dependencies | Blocker Status | Recommendation |
|-----------|------|----------------------|--------------|----------------|----------------|
| **8.7.3 Pre-Execution Validator** | 🟡 Medium | 2-3 days | Phase 8.7.2 ✅ | ✅ No Blockers | Formalize existing RiskManager as unified endpoint |
| **8.7.4 Context Bridge** | 🟢 Low | 2 days | Phase 8.7.1 ✅ | ✅ No Blockers | Replace polling with WebSocket push |
| **8.8.1 Reasoning Orchestrator** | 🔴 High | 5-6 days | Redis/PG decision | 🔴 Architecture Decision | Use PG-based queue short-term, plan Redis migration |
| **8.8.2 Memory Lifecycle Manager** | 🔴 Critical | 4-5 days | Startup sequence | 🔴 Checksum Strategy | Implement 2-phase rehydration with rollback |
| **8.8.3 Chain-of-Thought Trace** | 🟢 Low | 1-2 days | Phase 8.8.1 | 🟡 Domain Bobs | Extend ProvenanceLogger with domain context |
| **8.8.4 Cognitive Tuning** | 🟡 Medium | 3 days | Phases 8.8.1, 8.8.2 | 🟡 Dependency Chain | Create CognitiveHealthTask scheduled job |
| **8.9.1 Anomaly Detection** | 🟢 Low | 2 days | Metrics exist | ✅ No Blockers | Add alert triggers to SystemHealthMonitor |
| **8.9.2 Curiosity Scoring** | 🟡 Medium | 3-4 days | Phases 8.8.2, 8.9.1 | 🟡 Dependency Chain | Define scoring algorithm, integrate with learning |

**Total Estimated Effort:** 22-27 developer days (with dependencies)  
**Parallel Workstreams:** Can execute 8.7.3, 8.7.4, 8.9.1 simultaneously (7 days saved)  
**Optimized Timeline:** ~15 developer days with parallel execution

---

## Top 3 Priority Actions

### 1. 🔴 **CRITICAL: Resolve Async Task Queue Architecture Decision**
**Why:** Blocks Phase 8.8.1 (Reasoning Orchestrator)  
**Decision Required:** Redis vs PostgreSQL for job queue  
**Recommendation:** 
- **Short-term (MVP):** Use `pg-boss` or `graphile-worker` (PG-based) to avoid new infrastructure
- **Long-term (Scale):** Migrate to Redis when async job volume > 100/min
- **Timeline:** Decision needed before starting 8.8.1 (blocks 5-6 day effort)

**Validation Steps:**
```bash
# Install pg-boss
npm install pg-boss

# Test async job processing
const queue = new PgBoss(process.env.DATABASE_URL);
await queue.start();
await queue.send('domain-bob-analysis', { domain: 'devops', data: {...} });
```

---

### 2. 🔴 **CRITICAL: Define Memory Lifecycle Checksum Strategy**
**Why:** Blocks Phase 8.8.2 (Memory Refit)  
**Decision Required:** What to checksum? How to handle failures?  
**Recommendation:**
- **Checksum Scope:** High-importance memories (importance >= 4) + all learning fragments from last 30 days
- **Failure Recovery:** 3-tier approach:
  1. **Tier 1:** Log warning, continue with degraded mode (skip stale memories)
  2. **Tier 2:** Auto-repair by re-fetching from authoritative sources
  3. **Tier 3:** Startup blocked, manual intervention required (critical memories corrupted)

**Validation Steps:**
1. Calculate baseline checksum on stable system
2. Introduce controlled memory corruption (modify DB record)
3. Verify startup detects and handles per tier strategy

---

### 3. 🟡 **HIGH: Implement Pre-Execution Validator (Quick Win)**
**Why:** Low-hanging fruit, high user value, no blockers  
**Impact:** Prevents invalid trades before execution, improves Walter reliability  
**Implementation Steps:**
1. Create `/api/trading/validate` endpoint (2 hours)
2. Wrap existing `RiskManager.checkPreTradeRisk()` (1 hour)
3. Add structured response schema (1 hour)
4. Integrate with `IntentExecutionService` (3 hours)
5. Test with mock trades (1 hour)

**Total Effort:** 1 day (8 hours)  
**ROI:** High (prevents production errors, minimal effort)

---

## Concurrency & State Desync Risks

### Race Condition Scenarios

**1. Multiple Domain Bobs → Cortex Cache Writes**
- **Risk:** Bob A and Bob B write to same Cortex key simultaneously → data corruption
- **Solution:** Implement optimistic locking in `CortexCore.setWithTTL()`:
```typescript
// Add version field to CortexMemory
setWithTTL(key: string, value: any, ttl: number): void {
  const existing = this.memory[key];
  const expectedVersion = existing?.version || 0;
  
  this.memory[key] = {
    value,
    ttl,
    expires_at: Date.now() + (ttl * 1000),
    version: expectedVersion + 1
  };
}
```

**2. Memory Lifecycle Rehydration vs Live Walter Queries**
- **Risk:** Walter queries memory during rehydration → partial/stale data
- **Solution:** Startup sequence enforcement:
```typescript
// server/index.ts
let walterReady = false;

async function startup() {
  await memoryLifecycle.initializeOnStartup(); // Blocks here
  walterReady = true; // Only set after checksum passes
  app.listen(PORT); // Now safe to accept requests
}

// In walter-response.ts
if (!walterReady) {
  return { error: 'System initializing, please retry in 10 seconds' };
}
```

**3. Async Job Queue vs DB Transaction Consistency**
- **Risk:** Job enqueued, DB rollback occurs → orphaned job
- **Solution:** Use PG-based queue within same transaction:
```typescript
await db.transaction(async (tx) => {
  // Update trade status
  await tx.update(trades).set({ status: 'closed' });
  
  // Enqueue learning job in same transaction
  await tx.insert(job_queue).values({
    name: 'learning-feedback',
    payload: { tradeId, outcome: 'profit' }
  });
});
```

---

## Performance & Observability Gaps

### Missing Metrics

**1. Reasoning Trace Latency (p95)**
- **Current:** No structured tracking of Walter response time breakdown
- **Needed:** 
  - Bob fetch time
  - Cortex query time
  - OpenAI API latency
  - Total response time
- **Implementation:** Add `reasoning_trace_metrics` table with percentile calculations

**2. Domain Bob Cache Hit Ratio**
- **Current:** Only global BobCore stats
- **Needed:** Per-domain Bob performance (DevOpsBob hit rate vs FullStackBob)
- **Implementation:** Extend `bob_trace_log` with `cache_hit_ratio` calculated per module

**3. Memory Integrity Score**
- **Current:** No runtime validation
- **Needed:** Continuous checksum validation (every 6 hours)
- **Implementation:** Add to `CognitiveHealthTask` scheduled job

---

## Security & RBAC Considerations

### Intent Execution Validation

**Current Implementation (Phase 8.7.2):**
- ✅ Role-based permissions (owner/editor/viewer)
- ✅ Pre-state snapshot validation
- ✅ Audit trail with traceId

**Additional Safeguards Needed:**
1. **Rate Limiting:** Max 10 intents/minute per user
2. **Sensitive Action Confirmation:** Live trading actions require 2FA or cooldown period
3. **Anomaly-Based Blocking:** If user executes >5 failed intents in 1 minute → temporary block

**Implementation:**
```typescript
// In IntentExecutionService
private async checkRateLimit(userId: string): Promise<boolean> {
  const recentIntents = await db
    .select()
    .from(intentAuditLog)
    .where(and(
      eq(intentAuditLog.userId, userId),
      gte(intentAuditLog.createdAt, new Date(Date.now() - 60000))
    ));
  
  return recentIntents.length < 10;
}
```

---

## Node.js + PostgreSQL Environment Constraints

### Blocking I/O Risks

**1. Long-Running Async Jobs**
- **Risk:** `SchedulerRegistry` tasks block event loop if synchronous logic used
- **Solution:** Ensure all Bob fetch functions are `async` and use `setImmediate()` for CPU-heavy work:
```typescript
async function heavyAnalysis(data: any): Promise<any> {
  return new Promise((resolve) => {
    setImmediate(() => {
      const result = /* expensive computation */;
      resolve(result);
    });
  });
}
```

**2. OpenAI Embeddings Generation**
- **Risk:** Nightly learning job generates 1000+ embeddings → API timeout
- **Solution:** Batch processing with concurrency limit:
```typescript
const fragments = await db.select().from(learning_fragments);
const batches = chunk(fragments, 50); // Process 50 at a time

for (const batch of batches) {
  await Promise.all(
    batch.map(f => generateEmbedding(f.content))
  );
  await sleep(100); // Rate limit: 10 requests/sec
}
```

**3. PostgreSQL Connection Pool Exhaustion**
- **Risk:** Parallel Bob fetches + async jobs exceed pool limit (default 10)
- **Solution:** Increase pool size in Drizzle config:
```typescript
// drizzle.config.ts
export default {
  poolSize: 20, // Increase from default 10
  idleTimeout: 30000,
};
```

### Database Query Optimization

**Potential Slow Queries:**
1. **Provenance lineage traversal:** Recursive query across `data_lineage` table
2. **Learning fragment similarity search:** Full-table scan without vector index

**Recommendations:**
1. Add index on `data_lineage.traceId` for faster lookups
2. Use `pgvector` extension for embedding similarity:
```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE INDEX ON learning_fragments USING ivfflat (embedding vector_cosine_ops);
```

---

## Simplification Opportunities

### 1. Consolidate Bob Modules

**Current:** 9 separate Bob modules (Metrics, Data, Config, Strategy, Trade, Insight, Learning, UI, + 3 planned domain Bobs)  
**Simplification:** Merge into 4 super-modules:
- **OperationsBob:** Metrics + Data + UI
- **TradingBob:** Strategy + Trade
- **IntelligenceBob:** Insight + Learning
- **DomainBob:** DevOps + FullStack + UX

**Benefit:** Reduces cache fragmentation, simpler maintenance  
**Tradeoff:** Less granular cache invalidation

### 2. Unified Provenance API

**Current:** Separate endpoints for lineage, traces, governance reports  
**Simplification:** Single `/api/provenance` GraphQL-style endpoint:
```typescript
// Instead of multiple REST endpoints:
GET /api/provenance/lineage/:traceId
GET /api/provenance/bob-trace/:traceId
GET /api/provenance/governance/report

// Use single flexible endpoint:
POST /api/provenance/query
{
  "traceId": "trace_abc123",
  "include": ["lineage", "bobTrace", "governanceReport"]
}
```

### 3. Memory Lifecycle Auto-Repair

**Current Plan:** Manual intervention on checksum failure  
**Simplification:** Implement auto-repair with fallback:
```typescript
if (!checksumValid) {
  console.warn('[MemoryLifecycle] Checksum failed, attempting auto-repair...');
  
  // Try to re-fetch critical memories from authoritative sources
  const repaired = await this.repairFromAuthoritativeSources();
  
  if (repaired) {
    console.log('[MemoryLifecycle] ✅ Auto-repair successful');
  } else {
    throw new Error('Auto-repair failed - manual intervention required');
  }
}
```

---

## Final Recommendations

### Immediate Actions (Week 1)
1. ✅ **Implement Pre-Execution Validator** (Phase 8.7.3) - Quick win, high value
2. ✅ **Replace polling with WebSocket push** (Phase 8.7.4) - Performance improvement
3. ✅ **Add BobCore hit ratio alerts** (Phase 8.9.1 partial) - Observability

### Architecture Decisions (Week 1-2)
4. 🔴 **Decide: Redis vs PG for async queue** - Unblocks Phase 8.8.1
5. 🔴 **Define checksum strategy** - Unblocks Phase 8.8.2
6. 🔴 **Design domain Bob interface pattern** - Enables modular expansion

### Core Implementation (Week 2-3)
7. 🔴 **Build Memory Lifecycle Manager** (Phase 8.8.2) - Critical path
8. 🔴 **Implement Reasoning Orchestrator** (Phase 8.8.1) - Enables domain Bobs
9. 🟡 **Create Cognitive Health Task** (Phase 8.8.4) - Validates memory integrity

### Enhancement Phase (Week 4)
10. 🟢 **Add Chain-of-Thought domain context** (Phase 8.8.3) - Debugging aid
11. 🟡 **Implement Curiosity Scoring** (Phase 8.9.2) - Proactive intelligence

---

## Success Metrics

**Phase Completion Validation:**
- 8.7.3: Mock trade validation returns accurate slippage/fee estimates (±5% error)
- 8.7.4: UI updates within 500ms of backend state change (WebSocket latency <100ms)
- 8.8.1: Domain Bobs process requests with p95 latency <200ms
- 8.8.2: Startup checksum validation completes in <10 seconds with 99.9% success rate
- 8.9.1: Anomaly alerts fire within 30 seconds of threshold breach

**Overall System Health:**
- Memory integrity: 100% checksum pass rate
- Provenance continuity: >99% trace coverage
- Async job success rate: >95%
- Walter response time: p95 <2.5s (with caching <500ms)

---

**Report Prepared By:** Replit Agent  
**Review Status:** Ready for Engineering Review  
**Next Steps:** Prioritize top 3 actions, schedule architecture decision meetings
