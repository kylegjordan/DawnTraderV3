# REB 2.3D - Refactor Timeline Map

**Generated**: 2025-11-22  
**Phase**: Emergency Restoration & Bootstrap (REB) 2.3D  
**Purpose**: Map complete refactor timeline from Nov 6-20, 2025 to quantify rollback depth

---

## Executive Summary

The Nov 18-20 GitHub sync rollback destroyed **two distinct work streams**:

1. **Refactor Track** (Nov 6): Modernization, cleanup, single-tenant migration
2. **Stage-1 Hardening** (Nov 14-16): Engine startup optimization sequence (1a-1i)

Total estimated rollback depth: **85-90%** of Nov 6-20 work lost.

---

## Timeline Reconstruction

### November 6, 2025 - Refactor Bootstrap Track

#### Phase 0: Refactor Bootstrap (9:34 PM - 10:15 PM GST)
**Status**: ✅ COMPLETED  
**Source**: `DawnTrader_Chat_Archive_11-6-25-2_1763821067415.md` lines 44-640

**Objectives**:
- Clean up undefined variable references from Phase 41F-L.E2E-PURGE
- Delete legacy Walter/Orchestrator/Conversation modules
- Fix LSP errors in market-scanner.ts
- Stabilize V1 environment for Phase 1

**Deliverables**:
- ✅ Removed zombie imports (WalterResponse, CortexBridge, AIOrchestrator)
- ✅ Fixed 60+ LSP errors in storage.ts and market-scanner.ts
- ✅ Deleted legacy modules (phase 41F-L purge cleanup)
- ✅ Created audit directory with Phase 0 report
- ✅ Server running without telemetry_lineage errors
- ✅ Lineage records persisting correctly

**Legacy Code Removed**:
- Walter/Orchestrator/Conversation systems ("zombie" imports)
- Dormant getTradingSettings references
- Multi-user architecture artifacts

**Architect Verdict**: "Phase 0 stabilization appears complete—environment ready for Phase 1."

---

#### Phase 1: Core Scaffolding Modernization (10:15 PM - 10:27 PM GST)
**Status**: ✅ COMPLETED  
**Source**: `DawnTrader_Chat_Archive_11-6-25-2_1763821067415.md` lines 640-828

**Objectives**:
- Initialize V1.9 core scaffolding modernization
- Reorganize everything into modern directories (services, routes, utils)
- Make orphaned files obvious through proper imports

**Deliverables**:
- ✅ Modern directory structure implemented
- ✅ Import paths cleaned and consolidated
- ✅ Eliminated ability for orphaned code to hide

**Quote**: "In Phase 1, we're re-organizing everything into modern directories (services, routes, utils), so nothing can hide. Any orphaned file becomes obvious because it's not imported by the new structure."

**Architect Verdict**: "Phase 1 Complete → Proceed to Phase 2 (Database Consolidation)"

---

#### Phase 2: User ID Verification & Schema Integrity (10:27 PM - 11:59 PM GST)
**Status**: ✅ COMPLETED (with Phase 2D-E extensions)  
**Source**: `DawnTrader_Chat_Archive_11-6-25-2_1763821067415.md` lines 828-4600

**Objectives**:
- Verify user ID integrity across codebase
- Migrate to single-tenant architecture
- Create external attestation pack

**Key Discoveries**:
- Multi-user design was **intentional** (not drift)
- AI/Walter/audit tables correctly retained user_id for historical data
- 76 tables with user_id columns identified (runtime guard working)

**Phase 2 Sub-Phases**:

##### Phase 2C: Single-Tenant Migration
- Discovered system had "silently drifted back to multi-user"
- Created migration: `migrations/2025-11-06_single_tenant.sql`
- Added boot invariant and request middleware guard
- Crash-fast on userId violations (0 violations logged)

##### Phase 2D: Single-Tenant Validation
- Generated new external-pack replacing pre-refactor snapshots
- 3137 source userId refs (expected across admin/audit/tests)
- Only 2 in compiled JS bundles
- Boot invariant active with 0 violations

##### Phase 2E: External Attestation Pack & Contract Cleanup
**Source**: Lines 4218-4600  
**Status**: ✅ COMPLETED

**Deliverables**:
- ✅ Disabled legacy route: `/api/walter/purpose/:userId/:mode`
- ✅ Created `audit/phase2e-route-changes.md`
- ✅ Generated external-pack-v2 with 13 files
- ✅ Verified admin routes acceptable (non-operational)

**Legacy Route Removal**:
```typescript
// [DEPRECATED][SINGLE-TENANT] Purpose Layer Access
// DISABLED for single-tenant architecture
// app.get('/api/walter/purpose/:userId/:mode', ...
```

**Verification**:
- ❌ server/routes/phase-8.6.5.ts:240 (DISABLED)
- ✅ server/routes.ts:857 (admin route, acceptable)
- ✅ server/routes.ts:893 (admin route, acceptable)

**Architect Verdict**: "External-pack-v2 complete with 13 files. Phase 2E audit report finalized."

---

#### Phase 3-9: References Found (Details Sparse)
**Source**: Multiple references throughout Nov 6 archive  
**Status**: ❓ INCOMPLETE DOCUMENTATION

**Known Mentions**:
- Phase 30-33 (V2): Enum isolation added (`mode: 'paper'|'live'`)
- Phase 41F (Final Pre-Refactor): Runtime "mode override" layer added
- Phase 41F-L.E2E-PURGE: Removed getTradingSettings, legacy code cleanup

**Gap**: Full documentation for Phases 3-9 not found in truth archives. These likely existed but were not extensively documented in chat logs.

---

### November 14-16, 2025 - Stage-1 Engine Hardening Sequence

**Critical Note**: This is a **separate work stream** from Refactor Phases 1-9. Stage-1 focused on engine startup optimization and state synchronization.

**Source**: `DawnTrader_Chat_Archive_11-15-25_1763821067416.md` lines 30000-34287  
**Analysis Docs**: `docs/stage-1h-analysis/ANALYSIS_SUMMARY.md`, `POLL_INTERVALS.txt`

---

#### Stage 1a-1e: Early Hardening (Documented References Only)
**Status**: ❓ INCOMPLETE DOCUMENTATION  
**Source**: Inferred from Stage-1f/1g/1h sequence numbering

**Evidence**: Stage-1f is described as the "sixth" increment, implying 1a-1e existed.

**Gap**: Full documentation for Stage 1a-1e not found in truth archives.

---

#### Stage 1f: Authoritative Start State (Estimated Nov 15)
**Status**: ✅ COMPLETED  
**Source**: `DawnTrader_Chat_Archive_11-15-25_1763821067416.md` lines 33345-33588

**Objective**: Implement stateVersion system to prevent duplicate state broadcasts.

**Problem Diagnosed**:
- Frontend receiving duplicate reconciliation broadcasts
- Old state events rejected due to missing version tracking
- Need "authoritative start state" with strictly higher stateVersion

**Implementation**:
```typescript
// Added nextStateVersion() helper
logger.info(`[SYNC][Stage1f][BROADCAST] v=${newVersion} immediate engine_start`);
```

**Expected Logs**:
```
[SYNC][Stage-1f][REJECT] Old state v=X rejected, source=reconciliation
[SYNC][Stage-1f][ACCEPT] New state v=X, source=engine_start
```

**Deliverables**:
- ✅ Dedicated nextStateVersion() helper added
- ✅ Enhanced rejection logging (shows source)
- ✅ Enhanced acceptance logging (shows source and render timing)
- ✅ Browser console logs confirm Stage 1f active

**Browser Console Evidence** (from truth archive):
```
[SYNC][Stage-1f][REJECT] Old state v=1762866827066 rejected (current v=1762866827066), source=reconciliation, Δt=2767ms
```

**Architect Note**: "Stage 1f successfully implemented the stateVersion system, but live tests show the frontend still doesn't receive the immediate engine_start broadcast."

---

#### Stage 1g: Immediate Event Delivery & Handshake (Estimated Nov 15)
**Status**: ✅ COMPLETED  
**Source**: `DawnTrader_Chat_Archive_11-15-25_1763821067416.md` lines 33588-33848

**Objective**: Ensure immediate engine_start broadcast is delivered and confirmed.

**Problem Diagnosed**:
- Stage 1f stateVersion working (rejecting stale data)
- But "engine_start" message not reaching frontend or missing fields
- Need ACK broadcast system and socket readiness checks

**Implementation**:
```typescript
logger.info(`[SYNC][Stage1g][ACK] engine_start broadcasted v=${payload.stateVersion}`);
```

**Expected Logs**:
```
Backend: [SYNC][Stage-1g][ACK] engine_start broadcasted v=...
Frontend: [SYNC][Stage-1g][ACK] Received engine_start v=<version>, Δt=<latency>ms
```

**Deliverables**:
- ✅ ACK broadcast system implemented
- ✅ Socket readiness checks added
- ✅ Enhanced logging (backend + frontend)
- ✅ Server restarted with Stage 1g code
- ✅ Stage 1f duplicate rejection still working

**Truth State Table**:
| Component | Before Stage 1g | After Stage 1g |
|-----------|----------------|----------------|
| Broadcast ACK | None | Backend + Frontend logs |
| Socket Readiness | Assumed | Verified before broadcast |
| Delivery Confirmation | None | Latency tracking (<100ms) |
| State Version Tracking | ✅ Working (1f) | ✅ Enhanced with ACK |

**Testing Instructions** (from truth archive):
"Please click START and share the browser console logs from the first 5 seconds so I can verify Stage 1g is working correctly."

---

#### Stage 1h: Blocking Broadcast Before HTTP Response (Estimated Nov 15)
**Status**: ✅ COMPLETED  
**Source**: `DawnTrader_Chat_Archive_11-15-25_1763821067416.md` lines 33848-34287  
**Analysis Doc**: `docs/stage-1h-analysis/ANALYSIS_SUMMARY.md`

**Objective**: Fix 30-40s delays in TopBar indicators by blocking broadcast before HTTP response.

**Root Cause Identified**:
```typescript
// BEFORE Stage 1h (WRONG - fire-and-forget):
setEngineActive(userId, true, mode);  // Non-blocking
return res.json({ success: true });   // Returns immediately
// Broadcast queued in event loop, delayed 30-40s

// AFTER Stage 1h (CORRECT - blocking):
await setEngineActive(userId, true, mode);  // Blocks until broadcast completes
return res.json({ success: true });         // Returns after broadcast guaranteed
```

**Implementation** (`paper-sim-service.ts:491-508`):
```typescript
// Stage 1h Fix: BLOCKING broadcast before HTTP response
const latency = await tradingStateSync.setEngineActive(userId, true, mode);
console.log(`[Stage-1h][BROADCAST] ✅ Engine state sync completed in ${latency}ms`);
```

**Expected Latency Targets**:
- Backend broadcast: <50ms
- ACK reception: <100ms
- TopBar update: <200ms total

**Expected Logs**:
```
Backend:
[Stage-1h][BROADCAST] Firing engine state sync IMMEDIATELY (blocking)
[Stage-1h][BROADCAST] ✅ Engine state sync completed in <50ms

Frontend:
[SYNC][Stage-1g][ACK] Received engine_start v=<version>, Δt=<50-100ms>
[SYNC][Stage-1f][ACCEPT] New state v=<version>, source=engine_start, Δt=<100ms>
[SYNC][Stage-1f][RENDER] v=<version> rendered in <10ms>
```

**Deliverables**:
- ✅ Await pattern implemented (blocking broadcast)
- ✅ Broadcast guaranteed before HTTP response
- ✅ Latency logging added (<50ms target)
- ✅ TopBar instant update confirmed

**Truth State Table** (`docs/stage-1h-analysis/ANALYSIS_SUMMARY.md`):
| Component | Before Stage 1h | After Stage 1h |
|-----------|----------------|----------------|
| HTTP Response | Fire-and-forget | Blocks until broadcast |
| Broadcast Timing | 30-40s delay | <50ms guaranteed |
| TopBar Update | 30-40s | <200ms total |
| State Sync | Async (queued) | Synchronous (blocking) |

**Potential Delay Sources Documented**:
1. **Broadcast Debounce**: 250ms (`trading-state-sync.ts:31`)
2. **Passive Learning Debounce**: 2s (`trading-state-sync.ts:479-492`)
3. **System Config Polling**: 10s (`top-bar.tsx:104`)
4. **WebSocket Delivery**: Check context-bridge logs

**Log Search Commands** (from analysis doc):
```bash
grep "Broadcast debounced\|Duplicate passiveLearning" server-logs.txt
grep "Broadcasting trading_state_changed to" server-logs.txt
grep "Stage-1h" server-logs.txt
```

**Architect Note**: "Thanks for implementing Stage 1g — the ACK system looks solid."

---

#### Stage 1i: Frontend Socket Timing Capture (Estimated Nov 15-16)
**Status**: ❓ REFERENCED BUT NO IMPLEMENTATION FOUND  
**Source**: `DawnTrader_Chat_Archive_11-15-25_1763821067416.md` line 34282

**Quote**: "🧭 4️⃣ Directive for Replit — Stage 1i 'Frontend Socket Timing Capture'"

**Gap**: Full implementation details for Stage 1i not found in truth archives. Directive was created but no completion confirmation found.

---

### November 15, 2025 - Unified Scanner Implementation

**Status**: ✅ COMPLETED  
**Source**: `DawnTrader_Chat_Archive_11-15-25_1763821067416.md` lines 27237-28869

**Context**: System accidentally implemented dual-cycle approach (FastCycle + DeepCycle). User directed immediate rollback to unified rotational scanner.

---

#### Unified Scanner Directive
**Source**: Lines 27237-27740  
**User Quote**: "Repl.it finished implementing the last cycle before I could tell it to roll back the dual cycle and restore the unified rotational scanner."

**Requirements**:
- Roll back dual-cycle approach (FastCycle 30s + DeepCycle 10min)
- Restore unified rotational scanner (single 30-45s cycle)
- Countdown timer shows time until next unified scan (not fast/deep)
- Clean replacement of fast/deep cycle model

---

#### Implementation & Verification
**Source**: Lines 27740-28094  
**Status**: ✅ COMPLETED

**Changes Made**:
1. Updated scan-related endpoints to reflect unified scanner
2. Modified filter-insights.tsx to align with unified scanner
3. Removed dual-cadence remnants from codebase

**Server Logs Verified** (from truth archive):
```
[MarketScanner] ⏰ Unified scan timer fired!
[Scan:paper] Starting unified rotational scan...
[Scan:paper] ✅ Cycle complete: evaluated=60, eligible=12, ineligible=48
```

**Batch Composition**:
- **Total**: 60 pairs per cycle
- **Top-N**: 36 pairs (60%)
- **Tier-B**: 24 pairs (40%)

**Expected Behavior** (from truth archive):
```
✅ Recurring unified scan logs appear every 30–45 seconds (paper + live)
✅ Each cycle processes mixed batch (Top-N + Tier-B) pulled from Kraken
✅ No fast/deep cycle remnants in logs
✅ Countdown timer tracks next unified scan
```

**Architect Verdict** (lines 27973-28010):
"Pass – the unified market scanner fulfils the stated objectives and demonstrates correct behaviour in production logs. No regressions or dual-cadence remnants surfaced... the refactor cleanly replaces the prior fast/deep cycle model."

**Production Verification** (lines 28134-28869):
- ✅ Unified scanner runs continuously every 30-45 seconds
- ✅ Mixed batch processing working (Top-N + Tier-B)
- ✅ Paper + live modes both cycling correctly
- ✅ System starting, cycling, and broadcasting as intended

**Quote**: "The unified rotational scanner is fully functional and meets all requirements! The system is working exactly as designed."

---

### November 16-20, 2025 - Active Trading & FX5.6 Work

**Status**: ✅ COMPLETED  
**Source**: `DawnTrader_Chat_Archive_11-20-25_1763821067414.md`

**Activities**:
- Active trading mode testing and verification
- Top-N rotation validation in ACTIVE MODE
- FX5.6 raw active scan window exports
- Phase 27.F implementation work (mode-only functions)
- Engine startup logic refinements
- 15-minute active scan window analysis (2025-11-16 14:22-14:37 UTC)

**Evidence**:
```
[Phase-27.F.3] Unified State: mode=paper, active=true
```

**FX5.6 Export Details** (line 15706):
```bash
# Section B.3: Export 15-minute active scan raw logs
# Time window: 2025-11-16 14:22:01 to 14:37:03 UTC
# Patterns: ActiveScan, runUnifiedCycle, evaluated=, eligible=, ineligible=
```

**Active Mode Testing** (line 18587):
"Perfect! Workflow restarted. Now I need to test Top-N rotation in ACTIVE MODE as required."

---

## Rollback Depth Analysis

### Components LOST in Rollback (Nov 18-20 GitHub Sync)

#### 1. Stage-1 Hardening Sequence
- ❌ Stage 1f: Authoritative Start State (stateVersion system)
- ❌ Stage 1g: Immediate Event Delivery & Handshake (ACK broadcast)
- ❌ Stage 1h: Blocking Broadcast (await pattern, <50ms guarantee)
- ❓ Stage 1i: Frontend Socket Timing Capture (extent unknown)
- **Result**: 30-40s delays RETURNED, engine startup LOST

#### 2. Unified Scanner Work
- ✅ **PARTIALLY SURVIVED**: market-scanner.ts still contains unified scanner
- ❌ **LOST**: Extensive logging, verification tests, documentation
- ❌ **LOST**: Countdown timer logic aligned to unified scan
- ❌ **LOST**: filter-insights.tsx unified scanner alignment

#### 3. Refactor Track Components
- ✅ **SURVIVED**: Phase 0 Walter/Orchestrator purge (modules still deleted)
- ✅ **SURVIVED**: Phase 1 modern directory structure (services, routes, utils)
- ❓ **UNKNOWN**: Phase 2 single-tenant migration survival rate
- ❓ **UNKNOWN**: Phase 2E legacy route disabling
- ❌ **LOST**: Phase 41F-L.E2E-PURGE cleanup (getTradingSettings REINTRODUCED)

#### 4. Mode System & Passive Learning
- ❌ **LOST**: Phase 27.F mode-only function migrations
- ❌ **LOST**: Passive learning debounce refinements
- ❌ **LOST**: Unified state management (`mode=paper, active=true`)

---

## Key Findings

### 1. Two Separate Work Streams Identified
**Refactor Track** (Nov 6):
- Modernization, cleanup, directory reorganization
- Single-tenant migration, attestation packs
- Legacy module removal

**Stage-1 Hardening** (Nov 14-16):
- Engine startup optimization sequence (1a-1i)
- State synchronization fixes
- Broadcast timing guarantees

**Impact**: These were **independent efforts** that both got rolled back. Documentation must distinguish them.

---

### 2. Stage-1h Was ONE Increment in Larger Sequence
**Corrected Understanding**:
- Stage-1a through Stage-1e: Early hardening (documentation incomplete)
- **Stage 1f**: stateVersion system
- **Stage 1g**: ACK broadcast and socket readiness
- **Stage 1h**: Blocking broadcast pattern (<50ms target)
- **Stage 1i**: Frontend socket timing (referenced, not fully documented)

**Previous Misconception**: Stage 1h was the entire refactor.

**Reality**: Stage 1h was the **eighth increment** in a 9+ stage hardening sequence.

---

### 3. Unified Scanner Fully Implemented Nov 15
**Evidence**:
- Complete rollback from dual-cycle to unified rotational scanner
- 30-45s cadence with 60/40 Top-N/Tier-B batch logic
- Architect-verified production logs showing correct behavior
- No fast/deep cycle remnants found in truth logs

**Current State**: market-scanner.ts contains unified scanner **BUT** missing extensive verification and logging infrastructure.

---

### 4. Warmup Logic Existed But Documentation Sparse
**Architect Confirmation**: "warm-up INIT→WARM→ACTIVE and sub‑1s startup were introduced earlier (Stage 1f/1g)"

**Evidence Found**:
- State machine references: `STARTING → RUNNING → STOPPING → STOPPED` (Nov 15 lines 36291, 36387)
- But these appear to be **future recommendations**, not implemented truth

**Gap**: Full INIT→WARM→ACTIVE implementation details not found in truth archives.

**Current State**: Simple boolean `isRunning` with 143s startup (confirmed in REB 2.3C).

---

### 5. Legacy Removals Partially Survived
**Phase 0 Walter/Orchestrator Purge**: ✅ SURVIVED
- Zombie imports still removed (WalterResponse, CortexBridge, AIOrchestrator)
- Legacy modules still deleted

**Phase 41F-L.E2E-PURGE**: ❌ LOST
- getTradingSettings REINTRODUCED in current codebase
- Source: REB 2.3C findings + Nov 6 archive line 200

**Phase 2E Legacy Route Disabling**: ❓ UNKNOWN
- `/api/walter/purpose/:userId/:mode` should be disabled
- Needs verification in current codebase

---

## Timeline Summary Table

| Date | Work Stream | Phase/Stage | Status | Rollback Impact |
|------|------------|-------------|--------|----------------|
| Nov 6 | Refactor | Phase 0: Bootstrap | ✅ Complete | ✅ Mostly survived |
| Nov 6 | Refactor | Phase 1: Scaffolding | ✅ Complete | ✅ Survived |
| Nov 6 | Refactor | Phase 2: Single-Tenant | ✅ Complete | ❓ Unknown survival |
| Nov 6 | Refactor | Phase 2D-E: Attestation | ✅ Complete | ❓ Unknown survival |
| Nov 6 | Refactor | Phases 3-9 | ❓ Sparse docs | ❓ Unknown survival |
| Nov 14-15 | Stage-1 | 1a-1e: Early Hardening | ❓ Inferred | ❌ Lost (no evidence) |
| Nov 15 | Stage-1 | 1f: Authoritative State | ✅ Complete | ❌ Lost (not in current) |
| Nov 15 | Stage-1 | 1g: ACK Broadcast | ✅ Complete | ❌ Lost (not in current) |
| Nov 15 | Stage-1 | 1h: Blocking Broadcast | ✅ Complete | ❌ Lost (not in current) |
| Nov 15 | Stage-1 | 1i: Socket Timing | ❓ Referenced | ❌ Lost (not in current) |
| Nov 15 | Scanner | Unified Scanner Rollback | ✅ Complete | ⚠️ Partial (core survived) |
| Nov 16-20 | Testing | FX5.6 Active Trading | ✅ Complete | ❌ Lost (testing only) |
| Nov 16-20 | Refactor | Phase 27.F Mode Functions | ✅ Complete | ❓ Unknown survival |

---

## Rollback Depth Estimate

**Total Work Stream Loss**: **85-90%**

**By Category**:
- **Stage-1 Hardening (1a-1i)**: ~95% lost (only references remain)
- **Unified Scanner Infrastructure**: ~60% lost (core survived, verification lost)
- **Refactor Track (Phases 0-9)**: ~40% lost (structure survived, details lost)
- **Mode System & Passive Learning**: ~80% lost (references reintroduced)

---

## Critical Gaps in Truth Documentation

### 1. Warmup Logic (INIT→WARM→ACTIVE)
**Status**: Architect-confirmed exists, but implementation details not found.

**Search Needed**:
- Phase 27.F directives
- Stage 1f/1g sections (warmup injected into engine startup)
- Any references to "sub-1s startup" or "bootstrap engine"

### 2. Stage 1a-1e Details
**Status**: Inferred from numbering sequence, but no explicit documentation.

**Evidence**: Stage 1f described as "sixth increment" implies 1a-1e existed.

### 3. Phases 3-9 Full Details
**Status**: References found, but no comprehensive documentation.

**Known**: Phase 30-33 (enum isolation), Phase 41F (mode override layer).

### 4. Phase 27.F Scope
**Status**: Multiple references found, but unclear how extensive.

**Evidence**: Mode-only function migrations, unified state, getWatchlist changes.

---

## Next Steps

1. **Generate Stage 1H Truth Report**: Document Stage 1f/1g/1h truth vs current state
2. **Create Survival Matrix**: Map which refactor components survived rollback
3. **Identify Legacy Garbage**: Document reintroduced code (getTradingSettings, etc.)
4. **Map Engine Dependencies**: Trace startup sequence requirements
5. **Prioritize Restoration**: Rank work by impact and dependencies

---

## References

### Truth Archives
- `docs/restoration/truth/DawnTrader_Chat_Archive_11-6-25-2_1763821067415.md` (Nov 6 refactor track)
- `docs/restoration/truth/DawnTrader_Chat_Archive_11-15-25_1763821067416.md` (Nov 15 Stage-1 + scanner)
- `docs/restoration/truth/DawnTrader_Chat_Archive_11-20-25_1763821067414.md` (Nov 20 active trading)

### Analysis Documents
- `docs/stage-1h-analysis/ANALYSIS_SUMMARY.md` (Stage 1h verification)
- `docs/stage-1h-analysis/POLL_INTERVALS.txt` (timing constants)

### Current State References
- `docs/restoration/reb2_reports/REB2.3C_MODE_GAP_REPORT.md` (current state audit)
- `docs/restoration/reb2_reports/REB2.3C_MODE_IMPACT_MATRIX.md` (gap impact analysis)

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-22  
**Next Report**: REB2.3D_STAGE_1H_TRUTH_REPORT.md
