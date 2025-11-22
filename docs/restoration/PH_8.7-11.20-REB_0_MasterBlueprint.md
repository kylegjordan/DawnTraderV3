# PH.8.7–11.20–REB 0 — Master Restoration Audit Blueprint
## Full Narrative Edition (A2)
*(This document is the authoritative master plan for restoring DawnTrader to its pre‑rollback state and preparing the system for Phase 8.8+.)*

---

# SECTION 1 — PURPOSE & MISSION

The GitHub overwrite wiped out approximately 10–14 days of critical development across:
- Filter Insights (UI + backend mapping + breakdown logic)
- Screeners tab (UI + backend mapping + field semantics)
- FX5 scanner (core engine state + rotation + filtering outputs)
- Active Filter Pool (dedupe + expiration logic)
- Various backend services that supported the above

The purpose of REB 0 is to:
1. **Discover the real “truth state”** of DawnTrader as of **Nov 18–20, 2025**  
2. **Compare today’s system** against that truth  
3. **Identify every regression, rollback, missing file, broken flow, incorrect mapping, and legacy resurrection**  
4. Produce a **detailed restoration plan** restoring everything to Nov 18–20 levels  
5. Establish a **stable, clean foundation** for Stage 3 re-integration later in Phase 8.8+  
6. Provide a **repeatable audit framework** so this can never happen again  

This blueprint is narrative + technical. It explains the “why,” the “how,” and the exact work to be done.

---

# SECTION 2 — SOURCE OF TRUTH

This blueprint is anchored in **two master historical sources**:

## 2.1 PRIMARY TRUTH (100% authoritative)
These define exactly what DawnTrader *must* return to:

### **Source A — Filter Insights (Nov 18–20 state)**
- UI layout, categories, styles  
- 24h metrics behavior  
- Deduped Active Filter Pool behavior  
- Last Scan panel behavior  
- Filter Breakdown categories  
- No Stage 3 involvement  
- Powered entirely by FX5 outputs  
- Correct mapping of every data tile  

### **Source B — Screeners Tab (Goals → Screeners) (Nov 18–20 state)**
- Manual vs LATTi toggle working independently for each field  
- Correct dropdowns for: history, volatility, spread, quote currencies, etc.  
- Correct backend schema  
- All legacy garbage removed  
- All fields entered correctly applied to FX5 filters  

### **Source C — FX5 Scanner (Nov 18–20 state)**
- 60-pair batch rotation system  
- Top-N pool rotation + Tier B rotation  
- Deduped active pool feeding Strategy Engine  
- FX5 controlling everything (NO Stage 3 yet)  
- Correct 24hr stats behavior  
- Correct breakdown generation  
- Correct behavior in Passive Learning mode  

### **Source D — Active Filter Pool (Nov 18–20 state)**
- Correct dedupe behavior  
- Correct expiry logic  
- Correct mapping to strategies  
- Correct purge/recycle behavior  
- Empty during Passive Learning (as it should be)  

These four entities define the “real DawnTrader” prior to rollback.

---

## 2.2 SECONDARY TRUTH (conditional, *only* used after restoration)
These improvements are **NOT** allowed to influence truth-finding:

### Conditional sources (only applied AFTER restoration):
- Stage 3 fixes from 8.8.1–8.8.2  
- Breakdown truth constraint design  
- New WS schemas  
- Stage 3 cache  
- New event emitter logic  
- Replit’s recent Stage-3 helper functions  

These are only grafted on **after** the base system is proven correct.

---

# SECTION 3 — HIGH-LEVEL STRATEGY OF REB 0–REB X

The rebuild is done in **three axes**, running in parallel:

### Axis 1 — **Truth Extraction**
Extract exactly what the system DID and WAS on Nov 18–20.

### Axis 2 — **Deviation Mapping**
Compare every file in the current system against the truth spec.

### Axis 3 — **Restoration Planning**
Define the exact changes needed to migrate the current codebase → truth state.

**No actual code changes occur in REB 0.**  
This is a master audit and mapping stage.

---

# SECTION 4 — PHASE STRUCTURE OVERVIEW

The Restoration Effort (REB) has the following top-level structure:

```
PH.8.7–11.20–REB 0 — Master Restoration Audit Blueprint
PH.8.7–11.20–REB 1 — Truth State Extraction (From 11.18–11.20 Archives)
PH.8.7–11.20–REB 2 — Current State System Audit (Post-Rollback Reality)
PH.8.7–11.20–REB 3 — Truth vs Current: Diff Analysis
PH.8.7–11.20–REB 4 — Restoration Planning & Corrective Blueprint
PH.8.7–11.20–REB 5 — Restoration Implementation (Frontend+Backend)
PH.8.7–11.20–REB 6 — Verification, Reconciliation, and Test Harness Creation
PH.8.7–11.20–REB 7 — Re-stabilization Sync and Final Freeze Before Stage 3
```

Each phase contains dozens of sub-phases, tasks, validation steps, and criteria.

---

# SECTION 5 — DETAILED BLUEPRINT

Below is the **full multi-phase master plan**, written in narrative form.

---

# PH.8.7–11.20–REB 1  
# TRUTH STATE EXTRACTION (Nov 18–20)

**Objective:** Determine *exactly* how DawnTrader functioned during Nov 18–20, before rollback.

This includes:

### 1.1 Extract UI truth for Filter Insights
- Category list  
- Descriptions  
- Layout  
- Stats  
- Behavior when Passive Learning is ON  
- Behavior when Paper Engine is OFF  
- Behavior when Strategies apply  
- Correct mapping  

### 1.2 Extract UI truth for Screeners tab
- Every field  
- All dropdowns  
- All manual inputs  
- Manual/LATTi toggles  
- Field validation  

### 1.3 Extract FX5 Scanner truth
- 60-pair batches  
- Rotation logic  
- Tier B logic  
- Top-N logic  
- Breakdown logic  
- Deduped Active Filter Pool behavior  
- Expiry logic  
- Passive Learning mode behavior  

### 1.4 Extract Backend truth
- filter-breakdown.ts  
- filtered-pairs-service  
- fx5-scanner.ts  
- active-pool-service.ts  
- endpoints used by Insights & Screeners  

### 1.5 Extract "known refactored" state from archives
Using:
- 11.20 archive (primary source for last known working state)  
- 11.18 Filter Insights file  
- 8.6.x–8.7 audit bundles you uploaded  

This gives us the complete Pre-Rollback DawnTrader.

**Deliverable:**  
`TRUTH_STATE_11.20.json` + full narrative summary.

---

# PH.8.7–11.20–REB 2  
# CURRENT STATE SYSTEM AUDIT

Objective:  
Determine exactly what exists *right now* inside Replit’s filesystem.

### 2.1 Full filesystem scan
- UI folders  
- Backend services  
- All React components  
- All endpoints  
- All scanners  
- All breakdown logic  
- All Active Pool code  

### 2.2 Identify regressions
Look for:
- legacy files revived  
- components missing  
- broken imports  
- reappeared React pages  
- reappeared 10-minute scanner  
- Filtered Pairs resurrected  

### 2.3 Identify missing refactored code
Examples:
- Missing FX5 logic  
- Missing mapping changes  
- Missing filter breakdown categories  
- Missing Screeners dropdown changes  
- Missing updated endpoints  

### 2.4 Identify untracked changes introduced by 8.8 work
But we **do not assume these are good**.  
We simply log them.

**Deliverable:**  
`CURRENT_STATE_AUDIT_REPORT.md` + full file inventory.

---

# PH.8.7–11.20–REB 3  
# TRUTH VS CURRENT — DIFF ANALYSIS

Objective:  
Perform an exhaustive comparison of TRUTH (Nov 18–20) vs TODAY.

### 3.1 UI Diff (Filter Insights)
- missing tiles  
- wrong metrics  
- wrong mappings  
- wrong labels  
- wrong breakdown categories  
- wrong formatting  

### 3.2 UI Diff (Screeners tab)
- missing dropdowns  
- old broken toggles  
- old textboxes revived  
- missing backend connections  

### 3.3 Backend Diff (FX5)
- missing rotation logic  
- wrong batch sizes  
- missing dedupe  
- missing expiry  
- missing stats  
- missing endpoints  

### 3.4 Backend Diff (Active Pool)
- missing cleanup logic  
- missing dedupe  
- missing expiry  
- wrong table schema  

### 3.5 Backend Diff (Filter Breakdown)
- wrong category list  
- wrong filter keys  
- missing categories  
- resurrected legacy garbage  

**Deliverable:**  
`TRUTH_VS_CURRENT_DIFF_MAP.md` + red/yellow/green severity tagging.

---

# PH.8.7–11.20–REB 4  
# RESTORATION PLANNING & CORRECTIVE BLUEPRINT

Objective:  
Create the actionable rebuild plan.

### 4.1 Define required UI restoration tasks
- Filter Insights full rebuild  
- Screeners Tab full restoration  
- Remove Filtered Pairs fully  
- Reconnect FX5 to correct endpoints  

### 4.2 Define backend restoration tasks
- Rebuild correct FX5 logic  
- Restore breakdown logic  
- Restore dedupe logic  
- Restore expiry logic  
- Restore rotation pools  
- Restore Active Pool endpoints  

### 4.3 Define data mapping fixes
- Every UI tile → exact backend endpoint  
- Every Screener field → exact schema keys  

### 4.4 Remove all legacy garbage
Including:
- 10-minute scanner  
- deprecated endpoints  
- deprecated breakdown keys  
- deprecated services  

### 4.5 Validate what MAY be salvageable from 8.8
Only after restoration truth is restored.

**Deliverable:**  
`REB_PLANNING_BLUEPRINT.md`

---

# PH.8.7–11.20–REB 5  
# RESTORATION IMPLEMENTATION

This is where real coding begins.

### 5.1 Backend Restoration (FX5 + ActivePool)
Restore to truth state, including:
- 60-pair batch logic  
- rotation logic  
- dedupe  
- expiry  
- stats  
- breakdown  
- all endpoints  

### 5.2 UI Restoration (Filter Insights)
Rebuild:
- metric tiles  
- mapping  
- last scan  
- active pool  
- filter breakdown  
- formatting  
- styles  

### 5.3 UI Restoration (Screeners)
Rebuild:
- toggles  
- dropdowns  
- schema  
- backend integration  

### 5.4 Remove all legacy components

### 5.5 Restore all refactored behavior from Nov 18–20

**Deliverables:**  
Restored codebase.

---

# PH.8.7–11.20–REB 6  
# VERIFICATION & TEST HARNESS

### 6.1 Passive Mode verification
- insights behavior  
- stats  
- scan countdown  
- zeroed metrics  

### 6.2 Paper Mode verification
- active pool behavior  
- stable breakdown  
- stable rotation  
- stable mapping  

### 6.3 Screener → FX5 → Insights → Strategy → ReadyToBuy → Trade
Full pipeline walkthrough.

### 6.4 Build automated smoke test scripts

---

# PH.8.7–11.20–REB 7  
# RE-STABILIZATION & FREEZE BEFORE STAGE 3

This phase ensures that the base trading system is:
- stable  
- correct  
- debuggable  
- predictable  
- deterministic  

**Only after REB 7 do we re-enable Stage 3.**

---

# END OF DOCUMENT
