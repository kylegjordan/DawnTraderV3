# New Session Prompt — Phase 13: MCE Installation

## Context

You are continuing work on the DawnTrader project. The previous session completed **Phase 12.3 Pipeline Unification** (Batch 13 code + Batch 13B governance). All repos are in sync at commit `589be749` on branch `dawntrader-v4`.

**Current state**: 17 of 18 Phase 12 directives are COMPLETE. Only 12.1.6 (LSP Error Triage, LOW priority) remains. The system now has:
- Canonical 5-regime model active (DSS rewired to `calculatePairRegime()`)
- Deterministic confidence formula replacing NGC
- 17 strategies (9 quant + 8 new: 3 pattern + 5 hybrid) wired into the signal orchestrator
- Test baseline: 791 pass / 90 fail (881 total)

## Your Task

**Phase 13: MCE (Market Context Engine) Installation** — this is the next major phase per the POST_AUDIT_ROADMAP.md. MCE is intended to become the centralized market context provider, replacing the fragmented regime/confidence/indicator computation currently spread across multiple services.

## How to Get Started

1. **Read the project instructions** to orient yourself:
   ```
   G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3\1-system-manual\CLAUDE_CODE_PROJECT_INSTRUCTIONS.md
   ```

2. **Read the snapshot log** to confirm current state:
   ```
   G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3\DT_Frozen_Snapshots\SNAPSHOT_LOG.md
   ```
   Verify HEAD is at `589be749` (Batch 13B).

3. **Read the post-audit roadmap** to understand Phase 13 scope:
   ```
   G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3\1-system-manual\POST_AUDIT_ROADMAP.md
   ```
   Look for the Phase 13 section — it defines what MCE is, what it replaces, and what its consumers are.

4. **Consult the System Impact Map** for blast radius analysis:
   ```
   G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3\1-system-manual\SYSTEM_IMPACT_MAP.md
   ```
   Key sections: Layer 4 (Signal Generation), Layer 5 (Regime Classification), Layer 11 (Legacy).

5. **Read the Changes and Fixes registry** for related bugs/risks:
   ```
   G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3\1-system-manual\CHANGES_AND_FIXES.md
   ```
   Key items: BUG-008 (Engine #4 MCP/ARE still pending), RISK-017 (bridge JSON staleness), RISK-018 (drift detector baselines), RISK-016/019/020 (MCP/ARE legacy cluster).

6. **Discuss scope with Kyle** before writing any code. Phase 13 is a large architectural phase — agree on what goes into the first batch before implementation begins. Consider:
   - Should MCE be a new service file or a refactor of existing infrastructure?
   - Which consumers get wired first?
   - Does MCP/ARE removal (Wave 6) happen in Phase 13 or as a separate phase?
   - What's the minimum viable MCE that produces real signals in paper mode?

## Key Architectural Context

The pipeline currently flows:
```
OHLC Data → calculatePairRegime() → DSS (canonical regime) → Signal Orchestrator
    → Strategy Engine (17 strategies) → quality_index.ts (deterministic confidence)
    → SQE (FinalScore gate) → RTB → TCL → Paper Execution
```

MCE's role (per roadmap) is to centralize market context computation — OHLC indicators, regime classification, volatility metrics, and potentially confidence — into a single service that all downstream consumers query, eliminating the duplicated computation currently spread across signal-orchestrator.ts, strategy-engine.ts, and various metric files.

## Batch Workflow Reminder

- Read from `DT_Clone_Repo/DawnTraderV3/` (READ ONLY)
- Write to `DT_Staged_Changes/BATCH_14/` (or whatever batch number Kyle agrees on)
- Package zip to `Claude Comms and Packages/Batch Zips/`
- Code batch first, governance batch second
- Always agree on scope with Kyle before writing code
