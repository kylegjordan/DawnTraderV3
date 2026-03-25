# Phase 14 New Session Prompt

Paste this into a new Claude Code session to continue the DawnTrader Phase 14 work.

---

## Prompt

You are continuing work on the DawnTrader project. Phase 13 is complete. You are starting Phase 14: VTS Real Calculations, Directional Bias, and Regime Rename.

### Step 0: Read Project Context

Before doing anything else, read these files in order:

1. `G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3\1-system-manual\CLAUDE_CODE_PROJECT_INSTRUCTIONS.md` — your identity, workflow rules, batch process, and current state
2. `G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3\1-system-manual\POST_AUDIT_ROADMAP.md` — Phase 14 definition and dependencies
3. `G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3\1-system-manual\SYSTEM_MANUAL.md` — what the system IS today (focus on MCE, signal orchestrator, VTS, regime model, predictive learning sections)
4. `G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3\1-system-manual\SYSTEM_IMPACT_MAP.md` — component dependency map (focus on MCE, VTS, telemetry, regime classification)

Then read Kyle's source documents (extract text from .docx using Python zipfile + xml parsing with UTF-8 encoding):

5. `G:\My Drive\Dawn Trader\DT Directional Bias - Shorting - Signals for All VTS Pairs - 2.6.26.docx` — Kyle's directional bias design, regime rename proposals, VTS signal expansion plan
6. `G:\My Drive\Dawn Trader\DT Predictive Learning Calibration Archiving and Drift Explanations - 2.2.26.docx` — three-layer learning stack (Predictive Adjustments, Calibration, Archive), drift detection

Then read the existing scope document written by a prior session:

7. `G:\My Drive\Dawn Trader\DT_Clone_Repo\Claude Comms and Packages\Scope Files\BATCH_15_SCOPE.md` — existing scope. Review it, but apply the corrections listed below in the "Scope Corrections" section.

### Step 1: Verify & Correct Scope

A prior session wrote BATCH_15_SCOPE.md after performing a pre-implementation audit. The audit answered these 5 questions:

1. **Data capture gaps**: Only pair-level regime is persisted today. No global regime, no friction (pair or global), no directional bias in the database. The `frictionCost` field exists in-memory on VTS trade records but is never written to telemetry_history. 5 of 6 needed dimensions are missing from persistence.
2. **Strategy module independence**: All 17 strategies are callable in passive mode. 9 original strategies (in strategy-engine.ts) are pure functions. 8 pattern strategies (in server/strategies/) each have stateless detect*() functions. One caveat: defensive_hedge needs BTC OHLC data for correlation.
3. **Math validation**: Regime classification (volatility + momentum + ADX) is sound. Friction (spread + slippage + fee, normalized 0-100) is correct. Proposed DBS formula is solid first pass. ADX excluded from DBS to avoid duplication with regime classification.
4. **Predictive learning health**: All three layers operational but observational-only. Predictive Adjustments running, Calibration every 8 hours, Archive weekly, Drift Detector every 15 min. None capture directional bias or global regime/friction.
5. **Analytics page regime map**: Fully hardcoded static table in analytics.tsx. Does NOT fetch from CANONICAL_REGIME_STRATEGY_MAP.

**However, the scope needs these corrections based on Kyle's review:**

#### Correction 1: Global Regime & Friction Already Exist — Don't Rebuild
Global regime and global friction are ALREADY being computed server-side and displayed on the Analytics & Diagnostics Overview tab:

- **Global Regime**: `server/services/telemetry-aggregator.ts` → `getDominantRegime()` — counts pair regimes from recent telemetry, returns the mode (most common regime) with percentage and score.
- **Global Friction**: `server/services/market-indicators.ts` → `computeGlobalFrictionWithDetails()` — averages per-pair friction scores from the **active filter pool** (`activeFilterPool.getActivePool('paper')`), sampling up to 100 pairs.

Neither value is persisted — they're computed on-demand for display. Phase 14 needs to:
- **Tap into** these existing computations (don't rebuild them)
- **Snapshot** their values at trade open time and persist to each VTS trade record
- **Validate** whether these calculations are correct/optimal (are they the best approach?)
- **Add global DBS** as a new section on the Analytics Overview tab alongside global regime and global friction

#### Correction 2: market-indicators.ts Has Stale Parallel Regime Data — Must Fix
`server/services/market-indicators.ts` has its own hardcoded `regimeDescriptions` object and a `mapToBaseRegime()` function that maps canonical regime names to an older 6-value `MarketRegime` type (e.g., `HIGH_VOL_IMPULSE` → `BULL_VOLATILE`, `TRANSITION` → `LOW_VOL_CHOP`). This mapping is **lossy** — the UI is currently showing OLD regime names, not the canonical ones. This file does NOT read from `canonical-regime-strategy-map.ts`.

Simply renaming the canonical map won't fix the UI because `market-indicators.ts` doesn't reference the canonical map. The new session must:
- Remove `mapToBaseRegime()` — it's a legacy adapter that shouldn't exist
- Remove the hardcoded `regimeDescriptions` object
- Wire `market-indicators.ts` to read regime names, descriptions, and favored strategies from `canonical-regime-strategy-map.ts` (single source of truth)
- Verify there are no other files with parallel hardcoded regime data

#### Correction 3: Capture Context at Trade OPEN — Single Snapshot
All 6 context dimensions (regime/friction/bias × global/pair) should be captured at trade **open** time, not close. The trading decision happens at open — that's the context to correlate with outcomes. Capturing both open and close is overkill for VTS trades. Single snapshot per trade.

#### Correction 4: VTS Data Clear — No Backfill Engine
The old VTS data has real market observations (pair, timestamp, price, regime) but fake outcomes (random strategy selection, simulated scores, simulated entry/exit). The outcomes are noise — false correlations are worse than no data. Plan:
- Flag old VTS trade records as `source: 'legacy_simulation'` — do NOT feed into predictive learning, do NOT delete from database
- Roll back all predictive learning based on simulated data (reset calibration weights, clear regime archive, reset drift baselines)
- Start fresh with real calculations from the moment Phase 14 goes live
- Do NOT build a backtesting/backfill engine in Phase 14

#### Correction 5: DB Schema Changes Need Migration
After the Batch 14-hotfix lesson (strategy_type enum expansion), all DB schema changes must include:
- SQL migration file (e.g., `migrations/0003_batch15_signal_metadata_expansion.sql`)
- Drizzle schema update in `shared/schema.ts`
- INSTRUCTIONS.md must specify: migration runs FIRST, then schema file placement
- pairRegime enum expansion: add 5 new canonical names, keep old names for backward compatibility

#### Correction 6: Global Friction Uses Active Filter Pool
`computeGlobalFrictionWithDetails()` samples from `activeFilterPool.getActivePool('paper')` — the filtered, active trading universe (pairs that passed FX5 scanning), NOT the ideal pool. This is the current behavior. Verify during scope review whether this is the right pool to use for global friction.

### Step 2: Update & Finalize Scope

Update BATCH_15_SCOPE.md with the corrections above. The 7 workstreams remain the same but must reflect these corrections. Present the updated scope to Kyle for approval. Do NOT write code until approved.

### Step 3: Kyle Approval

Present the scope to Kyle for review and approval. Do NOT write code until approved.

### Step 4: Code Batch (Batch 15)

After approval, implement all changes. Write modified files to `G:\My Drive\Dawn Trader\DT_Staged_Changes\BATCH_15\` with INSTRUCTIONS.md and README.md. Create zip at `G:\My Drive\Dawn Trader\DT_Clone_Repo\Claude Comms and Packages\Batch Zips\`.

INSTRUCTIONS.md must include:
- Replit Autonomy Constraints block at the top
- PART A: File placements (which files go where)
- PART B: Surgical edits (for large files that are too large to include wholesale)
- PART C: SQL migration execution (BEFORE file placement)
- PART D: Validation commands
- PART E: Commit message using `REPLIT_PUSH_SCRIPT.sh`

### Step 5: Governance Batch (Batch 15B)

After code batch is verified by Replit, prepare governance updates (CHANGES_AND_FIXES.md, SYSTEM_MANUAL.md, SYSTEM_IMPACT_MAP.md, DIRECTIVE_INDEX.md, directive write-up, CLAUDE_CODE_PROJECT_INSTRUCTIONS.md). Use surgical edits in INSTRUCTIONS.md for large files. Create zip at `G:\My Drive\Dawn Trader\DT_Clone_Repo\Claude Comms and Packages\Governance Zips\`.

### Key Decisions Already Made

- **Short trading is DEFERRED** — Kraken requires $10M ECP certification for US margin trading. Kyle's portfolio is $834. Do not include short trading in Phase 14.
- **One mega-batch** — All of Phase 14 in a single code batch (Batch 15) + governance batch (Batch 15B).
- **Directional Bias is SOFT ACTIVE, not purely observational** — It acts as a confidence modifier in regime-strategy mapping. Signals still generate for learning, but confidence is dampened/amplified based on directional alignment.
- **Regime rename is approved** — Use the 5 new names: TREND_FRIENDLY_STABLE, RANGE_BOUND_STABLE, HIGH_VOLATILITY_UNSTABLE, IMPULSE_EXPANSION, STRUCTURAL_TRANSITION.
- **Clone repo is READ ONLY** — All edits go to DT_Staged_Changes/BATCH_15/.
- **Capture context at trade OPEN** — single snapshot per trade, not open+close.
- **VTS data clear, no backfill** — flag old records as legacy_simulation, roll back predictive learning, start fresh.
- **Global regime/friction already exist** — tap into getDominantRegime() and computeGlobalFrictionWithDetails(), don't rebuild.
- **market-indicators.ts must be rewired** — remove hardcoded regimeDescriptions and mapToBaseRegime(), wire to canonical map.

### Known Issues to Investigate

1. **market-indicators.ts parallel regime data**: This file has its own hardcoded regime descriptions and a lossy mapToBaseRegime() function that doesn't reference the canonical map. The regime rename WILL NOT fix the UI unless this file is rewired to read from canonical-regime-strategy-map.ts. Find ALL files with parallel hardcoded regime data and fix them.
2. **Global friction pool source**: Currently uses `activeFilterPool.getActivePool('paper')`. Verify whether this is the right pool for global friction or whether the ideal pool would give a better market-wide picture.
3. **analytics.tsx static regime table**: The regime/strategy matrix on the Overview tab is fully hardcoded. Must be replaced with dynamic rendering from a new API endpoint exposing CANONICAL_REGIME_STRATEGY_MAP data.

### Current State

- **Branch**: dawntrader-v4
- **Last commit**: `fe6aa73f` (Governance Update: mega-batch approach, workflow clarity rules)
- **Test baseline**: 791 pass / 90 fail (881 total)
- **Phase 13**: COMPLETE (MCE installed, L12-L20 removed, 18/18 directives done)
