# Running Issues — Updated 2026-04-03 (Late Session)

## VERIFIED COMPLETE (24 items)
1. Redundant global quant IMF stage — Batch 43
2. Pattern-to-strategy routing mismatch — Batch 44
3. Duplicate scanPatterns() (VTS only) — Batch 44
4. Canonical pattern name mismatch — Batch 44
5. FX5 scan diagnostics persistence — Batch 44
6. Pipeline Summary Total column — Batch 43
7. Pipeline Summary IMF row label — Batch 43
8. familyFilterMismatch denominator inflation — Batch 45
9. DHMA short branch — DISABLED Batch 45
10. inside_bar_reversal SELL path — DISABLED Batch 45
11. Telemetry aggregates persistence — Batch 46
12. Liquidity trap — DISABLED Batch 45
13. Pattern-path code review — CONFIRMED
14. PM2 memory limit — 1GB→2GB
15. Session timeout — 12h→7d
16. Pool vs Source Pool column separation — FIXED
17. DI regime override research — Intentional (Batch 19C)
18. DI regime overrides disabled — DB sole authority
19. Ranking score in trade tables — Added before Final/Hybrid
20. Signals Produced → Trades Opened label — Clarified
21. Pipeline Summary FX5/VTS section separator — Added
22. Sidebar z-index + backdrop — FIXED
23. Ecosystem.config.cjs env loading — FIXED
24. Memory pruning (recentCloses, lastSetupHash, vtsEvalHistory) — FIXED

## IMPLEMENTED — PENDING VERIFICATION
25. VE setup-hash suppression (entry+stop) — monitoring
26. sourcePool in closed trades — pending fresh trade UI check
27. Edge mapping (non-0.50 values) — pending fresh trade UI check
28. Governance persistence — pending non-empty data
29. fx5-24h-window persistence — pending non-empty data

## STILL OPEN (13 items)
30. pairTelemetry Z-score optimization — DEPLOYED (major memory savings)
31. DataAggregator buffer cap — DEPLOYED
32. Survivors vs pairs evaluated — RE-OPENED: Need deeper investigation and reconciliation. The current explanation of "labeled with source separator, not unified" and fan-out are not sufficient. User questions why 'evaluated' count is higher than 'survivors' if fan-out means more survivors. A clear explanation of the difference and its reconciliation in the pipeline is needed. *User also notes that there is no fan-out for the pattern path, yet a big difference persists.*
33. Conversion rate ~98% null — monitor, market structure dependent
34. Range trade calibration — high nulls, deeper than thresholds
35. Batch 41 example review
36. VTS evaluation inflation / denominator truth
37. Global vs family IMF terminology
38. Active pool vs VTS identity docs
39. ai-analyst.ts removal
40. CI failures
41. DB column errors
42. Memory purge system — audit DONE, critical fixes deployed, lower-priority caps pending

## NEW ISSUES / UPDATES FROM DISCUSSION (2026-04-03)

### CRITICAL / ACTIVE
1.  **Volatility Edge 0-second duration trades** — RE-OPENED for deeper investigation. User questions if this is a legitimate behavioral characteristic (repeatable winning condition) or a calculation/formula/functionality error. Verification of underlying behavior is needed. (Related to original item 2).
2.  **Source/Pool column ambiguity in trade tables** — FIX IN PROGRESS. The "Source" column in closed simulated trades still shows "unknown". The "Pool" column should show Ideal vs Rotational pool sources, and the "Source" column should show the source pool status. This needs to be fixed with better header names for clarity, applied to both Open and Closed Simulated Trades tables. (Related to original item 5).
3.  **Pattern signals generated but not in open trades** — NEW ISSUE. Pattern signals are showing as generated but none are appearing in the open trades. This might be related to the source/pool column issue.
4.  **Trend and Breakout DI killing pairs** — STATUS CLARIFIED. Thresholds for Trend and Breakout DI families are agreed upon as appropriate based on shared distribution. (Updates original item 8).
5.  **DI strictness check for pattern pairs** — PENDING FOLLOW-UP. The DI threshold for the pattern path still needs follow-up, as it appears to be killing a high percentage of pairs. *User emphasizes this point again with new screenshot.* (Updates original item 9).
6.  **Regime DI Overrides Removal** — ACTION REQUIRED. User proposes removing DI overrides, suggesting they are difficult to manually track and manage, and that automatic adjustments should await ML (Phase 11). Unless there are convincing reasons otherwise, these overrides should be removed. (Updates original items 17, 18, 32, 42).

### STORAGE / PERSISTENCE
7.  **Memory parity and persistence issues** — RE-OPENED for deeper investigation. Survivors and pairs evaluated are still not equal, indicating memory parity and persistence are not fully fixed. (Related to original item 7).

### STRATEGY / PIPELINE
8.  **Range Trade strategy nulls** — NEW ISSUE. The Range Trade strategy has a large number of nulls. Needs calibration check to determine effectiveness in producing good signals.
9.  **Signals Generated vs. Simulated Trades Opened clarification** — NEW ISSUE. Clarification needed on the relationship between "Signals Generated" and "Simulated Trades Opened." Pipeline summary and 24-hr VTS metrics should show the full journey from signals generated to trades opened.

### ARCHITECTURAL / PROCESS
10. **Analysis should use 24-hr data** — PROCESS DIRECTIVE. Future analysis should consistently look at 24-hour data to observe broader trends rather than single scans. *User re-emphasizes this directive, stating to stop using last scan data.* (Updates original item 33).
11. **Audit for intentionally added regime DI overrides** — CONTEXT UPDATE. Previously "NEW TASK", now linked to the "Regime DI Overrides Removal" discussion. The documentation for intentional additions of regime DI overrides should be reviewed as part of the decision to remove them. (Updates original item 32).

### OPERATIONS / MEMORY
12. **Staging site timeout** — NEW ISSUE. Does the staging site time users out after no activity? Prefer this not to happen.
13. **Unintentional system restarts (Memory GB restarts)** — NEW ISSUE. Need to find alternative solutions to address memory GB restarts, as the current system is disruptive and not viable for live/paper trading or multiple users.
14. **PM2 memory restart limit increase** — AGREED. Increase restart limit from 1GB to 2GB. (Updates original item 29).
15. **Memory purge/compaction system audit needed** — AUDIT REQUIRED. Must do an audit to best determine a purge system, plan it, and then implement it to periodically trim/purge unnecessary data from memory (capped structures, caches, histories, or buffers) so disruptive restarts are not needed for memory cleanup. (Updates original item 30).
16. **Memory management implementation plan required** — PLAN REQUIRED. After the audit, define and implement a proper purge/compaction strategy to reduce or eliminate restart dependence during live/paper trading. (Updates original item 31).
17. **DI system fallbacks and overrides** — RE-OPENED for clarification and decision. The DI system's use of fallbacks in case of DB failures needs clarification. Why are they there? What are these overrides? Are fallbacks industry standard, and are they used in other DB-served functions? The system shouldn't use fallbacks. (Updates original item 42).
