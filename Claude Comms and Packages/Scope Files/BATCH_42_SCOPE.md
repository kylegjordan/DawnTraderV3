# Batch 42 Scope: Filter Diagnostics UI Fixes + Guardrails Tab Repair

## Purpose
Fix data display issues on the Machine Learning Filter Diagnostics tab and repair empty tabs on the Guardrails & Filters page. These are UI/data-layer fixes that improve Kyle's ability to review, troubleshoot, and make decisions about the pipeline.

## Context
- Kyle identified multiple display issues during staging review on 2026-03-31
- Pipeline Summary shows last-scan only (should be 24h)
- Family IMF survivors displaying in wrong column
- IMF metrics and Family Path results show contradictory DI numbers
- Guardrails Diagnostics and Screeners tabs show empty/no data
- Total Survivors vs Pairs Evaluated use different storage methods

## Desired Outcomes (Numbered)

### 1. Pipeline Summary shows 24h aggregated data
- **Current**: Pipeline Summary header says "Last Scan" and only shows the most recent scan cycle
- **Change**: Use the 24h rolling aggregated data (already available from `rolling24h` in the filter diagnostics API response) for the Pipeline Summary table
- **Also**: Extend the Pipeline Summary rows down to include signals produced (currently stops at Final Survivors)
- **File**: `client/src/pages/machine-learning.tsx` (lines 1636-1733)
- **Verify**: Pipeline Summary shows "24h" with cumulative numbers matching the 24h Rolling section below it

### 2. Fix Family IMF Survivors column display
- **Current**: Family IMF survivors total shows in the Pattern column with "—" in the Quant column
- **Change**: Family IMF survivors are quant-path data (trend, reversal, breakout, oscillator are quant families). Move to Quant column. Pattern column should show "—" or pattern-specific data if available.
- **File**: `client/src/pages/machine-learning.tsx` (lines 1704-1714)
- **Verify**: Family IMF survivors number appears in Quant column

### 3. Clarify IMF metrics vs Family Path IMF results
- **Current**: IMF METRICS section shows "Failed DI: 0" but FAMILY PATH IMF RESULTS shows DI failures of 2,300+. This is because IMF METRICS shows the global quant IMF (which doesn't filter by DI — that's done at family level), while Family Path shows per-family DI filtering. Both are correct but the display is confusing.
- **Change**: Add a clarifying label to the IMF METRICS section: "(Global IMF — LQ + VN only, DI applied at family level below)" and rename "Failed DI" row in IMF METRICS to "Failed DI (global)" with a note that family-level DI is shown in the Family Path section.
- **File**: `client/src/pages/machine-learning.tsx` (lines 1770-1806)
- **Verify**: A user looking at both sections understands they measure different things

### 4. Fix empty Guardrails Diagnostics tab
- **Current**: Telemetry Snapshot shows "Unable to fetch telemetry data" and Filter Performance shows "data unavailable"
- **Root cause**: The API endpoint `/api/telemetry/summary` is likely failing due to missing DB columns from the migration
- **Change**: Investigate the API endpoint, fix the DB column issue or add graceful error handling
- **File**: `server/routes/` (telemetry endpoint) + potentially DB schema fixes
- **Verify**: Diagnostics tab shows data instead of error messages

### 5. Fix Screeners tab to show family-specific IMF thresholds
- **Current**: Screeners tab only shows the 4 base filter paths (active_quant, active_pattern, vts_quant, vts_pattern). The 8 family-specific paths (active_trend, active_reversal, etc.) are in the DB but not displayed.
- **Change**: Add a section showing the family-specific IMF thresholds below the existing 4-path display
- **File**: `client/src/components/goals/filters-with-override.tsx`
- **Verify**: All 12 paper-mode filter paths visible (4 base + 8 family), with their LQ, VN, DI, corr_max values

### 6. Verify DB has all required family IMF rows for quant path
- **Current**: We manually inserted 24 rows during migration. Need to verify all 4 families × 2 modes (active + passive) exist for the quant path with correct values.
- **Change**: Audit and fix any missing or incorrect rows
- **File**: Supabase screener_filters table
- **Verify**: Query returns exactly the expected rows with Batch 23 calibrated values

## Files Expected to Change

| File | Change |
|------|--------|
| `client/src/pages/machine-learning.tsx` | Objectives 1, 2, 3 — Pipeline Summary, column fix, labeling |
| `client/src/components/goals/filters-with-override.tsx` | Objective 5 — family IMF display |
| `client/src/components/goals/diagnostics-tab.tsx` | Objective 4 — error handling |
| Server routes/DB (if needed) | Objectives 4, 6 — API fixes, DB verification |

## Verification Criteria

| # | Objective | How to Verify |
|---|-----------|---------------|
| 1 | Pipeline Summary 24h | Refresh ML page, Pipeline Summary shows 24h cumulative data including signals produced |
| 2 | Family survivors in correct column | Quant column shows family survivor total, Pattern shows "—" |
| 3 | DI metrics clarified | Labels clearly distinguish global IMF from family-level DI |
| 4 | Guardrails Diagnostics populates | Telemetry Snapshot and Filter Performance show data |
| 5 | Screeners shows family IMF | All 12 filter paths visible with threshold values |
| 6 | DB rows verified | SQL query confirms all expected rows with correct values |

## Verification Surfaces
- **UI**: ML page Filter Diagnostics tab, Guardrails & Filters page (Screeners + Diagnostics tabs)
- **Logs**: pm2 logs for any API endpoint errors
- **DB**: psql query to verify screener_filters rows
- **CI**: Build must pass

## Risks
| Risk | Severity | Mitigation |
|------|----------|------------|
| Changing Pipeline Summary data source may show different numbers | LOW | Both data sources exist, just switching which one the summary uses |
| Guardrails tab fix may require DB schema changes | MEDIUM | Will investigate before changing, may need to add columns |
| Family IMF display adds complexity to Screeners UI | LOW | Additive display, doesn't change existing data |

## Branch
`migration/aws-supabase`
