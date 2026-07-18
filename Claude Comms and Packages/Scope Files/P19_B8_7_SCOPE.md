# P19-B8.7 — TRADE-TABLE PARITY: Paper/Live open+closed tables mirror the VTS reference set

change-class: architecture
<!-- AMENDED 2026-07-18 (B-GOV-2 amendable-class rule; checker alert 62f4f835 was RIGHT in form):
     declared non_architecture at Step-1 for the original display-parity half (correct then);
     Step-9 GREW into architecture — paper UI re-keyed onto the shared VTS components, the
     pattern-pool DBS transit contract restored (#530, a signal-lane revival), VTS friction-
     component capture + the xstock spread-source change. The architecture doc set WAS
     delivered with Step-9 (SIM ★ banner + SysManual Ch5 note + the new pattern-lane section,
     commit 754b0f563) and Langston's closing pass verified the content at the ref — this
     header amendment closes the declaration/delivery gap the checker correctly flagged. -->

Owner: CC-B · Date: 2026-07-16 · Kyle directive (verbatim intent): "the columns that we
have in the VTS open trades and in the VTS closed trades should be mirrored by the paper
mode tabs for open and closed trades. And same for live mode... VTS is the most
complete. Let me know if there are any columns in Paper mode that are not in the VTS and
we can consider adding those in."

## Objectives

1. **OBJ-1 — Blank CLASS column (Paper/Live Open Trades), immediate defect.** The DB row
   carries the class; the active-trades API response omits it (`routes.ts` ~:12227 row
   assembly has no `assetClass` field; the client renders `(trade as any).assetClass` →
   blank badge). Fix at the API (include the stamped class), never re-derive from symbol.

2. **OBJ-2 — Blank Strategy column (Paper/Live Closed Trades), immediate defect.** The
   tab reads `trade.strategyName` (`trade-history-tab.tsx:778`); Kyle's screenshot shows
   it empty on every row. Root-cause the field mapping at the closed-trades API in
   Step-2 (name mismatch or omission) and fix at the source.

3. **OBJ-3 — Slots split-brain unification.** The Open Trades header computes "max
   slots" as `floor(maxTotalExposurePct / maxPositionPercentPct)` (`dynamic-slots.ts`,
   today floor(100/20)=5 → Kyle's OVER LIMIT banner at 11 open), while
   `guardrails_v2.max_open_positions` = 15 governs the engine. ONE authoritative slot
   count, DB-governed; the OVER LIMIT banner must key off the same number the engine
   enforces. Also retire `dynamic-slots.ts` hardcoded fallbacks (8/40/12 — a
   no-hardcoded-fallbacks-for-DB-governed-settings violation, CLAUDE.md §11): fail loud.
   Coordinate with OLD Claude's tune-3 (6.67% floors the ratio to 14, not 15).

4. **OBJ-4 — VTS-mirror columns on Paper + Live, open + closed.** VTS is the reference
   standard (Kyle). Columns VTS has that Paper/Live lack (from the code inventory):
   B/S · Signal/Pattern · Source Pool · TEC State · Volume/Order Book (entry-liquidity
   capture) · Target/Stop (closed) · Dist T/S (closed) · Rank · Final/Hybrid (closed) ·
   Edge · Regime Wt · Glbl Regime · Pair vs Glbl Friction split · Pair DBS · Glbl DBS ·
   Result badge (closed) · Entry Time (open). Add each where the underlying datum
   exists on active-path rows; where the datum is genuinely NOT captured on the active
   path (e.g. VTS-only telemetry), render an honest em-dash with a header tooltip
   saying why — never fabricate. Step-2 produces the per-column data-availability map
   (which are display-only wiring vs which need capture work; capture gaps get NAMED
   HOMES per §9.4, not silent inclusion).

5. **OBJ-5 — Paper-only columns proposed INTO VTS (Kyle ruling requested).** Paper is
   richer than VTS on: the FRICTION DECOMPOSITION (Entry Fee / Entry Slip / Exit Fee /
   Exit Slip / Total Cost as separate sortable columns — VTS lumps one "Costs" cell),
   Slot, Conf, close Reason, and the NEW B8.6 exit-side stamps (exit fee mode / rest
   outcome / rested-at price / rest duration — currently columns NOWHERE). Deliverable:
   the six-table comparison matrix to Kyle with a recommendation per column; VTS
   additions ship on his ruling (this scope pre-approves only the display work).

6. **OBJ-6 — "Current Simulation Performance Analytics" (Paper Closed Trades header
   section): fix-or-delete.** Kyle: not populating + likely redundant with the paper
   Dashboard tab. Step-2 confirms what feeds it (`AnalyticsPanel`,
   `trade-history-tab.tsx:209`) and produces the redundancy map vs the B8.3 dashboard;
   if redundant → DELETE outright (rule 18: full removal through the workflow,
   DELETED_COMPONENTS_LOG entry), else fix its feed. Recommendation lands with Kyle
   before the cut.

## Non-goals
No engine/sizing/gate changes (OBJ-3 touches only where the DISPLAY reads its number;
the guardrail values themselves are OLD Claude's tune-3). No FD-tab work (the stale
dormancy banners + per-scan/24h funnel views are the next batch). No new capture
machinery in this batch — capture gaps found at OBJ-4 get named homes.

## Verification (outcomes-based, §9.3 MANDATORY per Kyle 2026-07-16; reworded per
## Langston scope pin-down 3)
Every objective verified by NAVIGATING the staging UI and reading the rendered tables —
not by API curls. **Paper** open + closed = the REAL-ROW check (class/strategy/slots
cells showing real values on real rows, cross-checked against the VTS reference
tables). **Live** open + closed = a STRUCTURAL render check only (column headers
present + honest empty-state; live mode has no rows while the system is in
paper-active — a real-row bar cannot be met there and is not claimed). Langston
Step-8 independent.
