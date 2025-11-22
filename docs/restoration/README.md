# DawnTrader Restoration Program Registry
**Created**: November 22, 2025  
**Status**: Blueprint Installed - Awaiting Rollback Check

---

## Master Blueprint Reference

**Primary Authority Document:**
- **File**: `PH_8.7-11.20-REB_0_MasterBlueprint.md`
- **Path**: `/docs/restoration/PH_8.7-11.20-REB_0_MasterBlueprint.md`
- **Status**: Read-Only (permissions: r--r--r--)
- **SHA-256**: `972dbd06c404ea371d39d2ef8d626cfef8588a8690b8c044f90c5696d11e53ed`
- **Size**: 10,209 bytes (387 lines)
- **Purpose**: Authoritative master plan for restoring DawnTrader to pre-rollback state (Nov 18-20, 2025)

---

## Blueprint Scope

This blueprint defines the complete restoration strategy across:

### Core Systems Affected by Rollback:
1. **Filter Insights** (UI + backend mapping + breakdown logic)
2. **Screeners Tab** (UI + backend mapping + field semantics)
3. **FX5 Scanner** (core engine state + rotation + filtering outputs)
4. **Active Filter Pool** (dedupe + expiration logic)
5. **Backend Services** (supporting all above systems)

### Restoration Program Structure:
```
PH.8.7–11.20–REB 0 — Master Restoration Audit Blueprint ✅ INSTALLED
PH.8.7–11.20–REB 1 — Truth State Extraction (Nov 18-20 Archives)
PH.8.7–11.20–REB 2 — Current State System Audit (Post-Rollback)
PH.8.7–11.20–REB 3 — Truth vs Current: Diff Analysis
PH.8.7–11.20–REB 4 — Restoration Planning & Corrective Blueprint
PH.8.7–11.20–REB 5 — Restoration Implementation (Frontend+Backend)
PH.8.7–11.20–REB 6 — Verification, Reconciliation, Test Harness
PH.8.7–11.20–REB 7 — Re-stabilization & Freeze Before Stage 3
```

---

## Important Rules

### Read-Only Protection
- ✅ The master blueprint is set to read-only (chmod 444)
- ⚠️ **NEVER modify** `PH_8.7-11.20-REB_0_MasterBlueprint.md`
- ✅ Create addendum files for updates:
  - `PH_8.7-11.20-REB_0A_Addendum.md`
  - `PH_8.7-11.20-REB_0B_Clarifications.md`

### Source of Truth Hierarchy

**PRIMARY TRUTH (100% authoritative):**
- Source A: Filter Insights (Nov 18-20 state)
- Source B: Screeners Tab (Nov 18-20 state)
- Source C: FX5 Scanner (Nov 18-20 state)
- Source D: Active Filter Pool (Nov 18-20 state)

**SECONDARY TRUTH (conditional, applied AFTER restoration):**
- Stage 3 fixes from 8.8.1-8.8.2
- Breakdown truth constraint design
- New WebSocket schemas
- Stage 3 cache improvements

---

## Current Project Status (Nov 22, 2025)

**Branch**: `dt-v1-revival-bootstrap`  
**HEAD**: `a567c855` - "Update system performance metrics and cache settings"

**Recent Completed Work:**
- ✅ Phase 8.8.2-MAP-FINAL (WebSocket migration)
- ✅ Filter Insights fully functional (11 breakdown categories)
- ✅ Architect approved
- ✅ E2E tests passing

**Awaiting:**
- Rollback snapshot availability check (November 20, 2025)
- User confirmation to proceed with restoration program

---

## Next Steps

**IMMEDIATE (Before Code Changes):**
1. ⏳ User checks Replit rollback/snapshot system for Nov 20, 2025 snapshots
2. ⏳ User decides: restore from snapshot OR proceed with REB 1-7 program
3. ⏳ User provides confirmation to begin restoration work

**IF PROCEEDING WITH RESTORATION:**
- Begin PH.8.7-11.20-REB 1 (Truth State Extraction)
- Follow master blueprint exactly
- Create detailed audit reports at each phase
- No code changes until REB 5 (Implementation Phase)

---

## Reference Documentation

**Related Reports:**
- `/docs/PHASE_8.8.2_MAP_FINAL_IMPLEMENTATION_REPORT.md` - Latest completed work
- `/reports/phase-8.7/8.7-restore-check-report.md` - Git history analysis

**Blueprint Location:**
```bash
# Read the master blueprint:
cat /home/runner/workspace/docs/restoration/PH_8.7-11.20-REB_0_MasterBlueprint.md

# Verify checksum:
sha256sum /home/runner/workspace/docs/restoration/PH_8.7-11.20-REB_0_MasterBlueprint.md
# Expected: 972dbd06c404ea371d39d2ef8d626cfef8588a8690b8c044f90c5696d11e53ed
```

---

**Document Status**: Active Reference  
**Last Updated**: November 22, 2025  
**Maintained By**: Replit Agent (per directive)
