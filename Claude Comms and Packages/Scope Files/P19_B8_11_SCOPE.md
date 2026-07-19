# P19-B8.11 — Dashboard rolling earnings + Pool (I/R) off the paper tabs

change-class: non_architecture

Owner: CC-B · 2026-07-19 · Kyle directive (Desktop, dashboard review): "it would be
better for tracking in the earnings section: today's earnings, the past seven days,
the past thirty days" + Pool (I/R) "is still showing blanks — nothing's contributing
there" (second raise; the column is the VTS-only ideal/rotational axis with no
active-path equivalent, permanently blank on paper rows).

## Objectives
1. **Earnings card → ROLLING windows.** `computeCalendarEarnings` (since-midnight /
   since-Sunday / since-the-1st) → `computeRollingEarnings` (last 24h / 7d / 30d
   from now); renamed per rule 18, honest field names (`last24h/last7d/last30d`);
   3 routes call sites (real path + zero-state, `/api/active-engine/trades/analytics`);
   client labels "Today (24h)" / "Past 7 Days" / "Past 30 Days", card note
   "(rolling, net)". Matches CLAUDE.md §5.13 (rolling over calendar snapshots).
   Sole consumer verified: mode-dashboard-tab (the goals `earnings-widget` reads a
   DIFFERENT endpoint, untouched).
2. **Pool (I/R) hidden on the paper mounts.** `hidePoolColumn` prop (default OFF —
   VTS mounts byte-identical) on both shared tables: header + cell conditional +
   colSpan−1; paper open + closed mounts pass it. The column returns if the active
   path ever gains the axis.

## Tests
Dashboard-metrics suite rewritten for rolling semantics (+ an exact-24h-boundary
case). No engine/behavior change — display + a pure-function rename only.

## Verification (§9.3)
Staging Dashboard tab: three rolling rows labeled correctly with plausible values
(Past 7 Days ≥ Today magnitude-wise given the week's closes); paper Open + Closed
tabs: no Pool (I/R) column; VTS tabs: column still present.
