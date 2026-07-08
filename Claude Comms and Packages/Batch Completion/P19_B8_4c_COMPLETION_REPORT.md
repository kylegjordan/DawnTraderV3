# P19-B8.4c — Filter Diagnostics tab standardization — COMPLETION REPORT

**Batch:** P19-B8.4c (REV-3) · **Owner:** CC-B (Claude New) · **Reviewer:** Langston · **change-class:** non_architecture
**Origin:** Kyle UI feedback 2026-07-08 (screenshots + REV-3 refinement round after the §9.3 walk).
**Head commit:** `623064821` · **CI:** run `28954002287` all-4-green · **Deploy:** staging restart #465, HTTP 200.

---

## What this batch is

A pure display / read-only-telemetry pass standardizing the six Filter-Diagnostics tabs ({VTS, Paper, Live} × {crypto, xStock}). No engine, strategy, regime, filter-logic, threshold, signal-pipeline, or math change. It evolved through three revisions as Kyle clarified the model; REV-3 (this close) added the scanner-field correction + the layout/mobile rework on top of the REV-1/REV-2 scanner-card standardization that shipped earlier at `f53ffb54c`.

## Objectives (REV-3) — checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-6 | "Scanner Capacity" mislabel split into **Per-Cycle Target** (crypto 300 / xStock 75) + **Total Universe** (live). Server surfaces the fields read-only. | ✅ YES | Server: `fx5-scanner.ts` ScanDiagnostics `scanTargetPerCycle`+`krakenUniverseSize` (rides `routes/vts.ts:1717` whole-object `lastScan`); `xstock_spot/scanner.ts` `cycleBatchSize` (interface+init) + `routes.ts:8156` xstockScanner block. Client `ScannerCard` 6 fields; all 4 call sites migrated. Runtime curl: xStock `cycleBatchSize=75` ✓; crypto fields populate after first FX5 cycle (see Step-8). |
| OBJ-7 | One consistent table width across all six tabs. | ✅ YES | `SHARED_DIAG_WIDTH` on the crypto panel, the enforce panel, and the xStock scanner + section wrappers (xStock was full-bleed). |
| OBJ-8 | Paper/Live MIRROR the VTS three-table structure, dormant. | ✅ YES | `DormantPipelineTables` (Pipeline Summary → Last Scan → 24h Rolling), "awaiting activation" never bare-0 (OBJ-5 honesty). Replaced + **deleted** the superseded `ActiveDownstreamFunnel`+`ActivePipelineTail`. |
| OBJ-9 | Per-table distinct border color + filled bold header. | ✅ YES | `DIAG_TABLE_THEMES` blue/purple/teal; applied to the 3 live VTS tables + the 3 dormant tables. |
| OBJ-10 | Mobile: per-table horizontal scroll + frozen first column. | ✅ YES (pending §9.3 mobile-viewport walk) | Per-table `overflow-x-auto` container + `FROZEN_FIRST_COL_TABLE` (Tailwind arbitrary-variant sticky first column). |

## RUNNING_ISSUES

- **#421 — crypto scanner Total Universe not in the VTS feed → RESOLVED (home B8.4c).** `krakenUniverseSize` now surfaced onto ScanDiagnostics and carried whole through the vts route to `data.lastScan`.
- **#422 — the `/api/active-engine/diagnostics/scan-24h` endpoint is orphaned (not consumed) → homed to B8.5** (the switch-on wires the mode's live per-stage counts).

## Deletions (rule #18 / §15)

`ActiveDownstreamFunnel` + `ActivePipelineTail` (client display components) + the already-unreachable enforce-guard + the now-unused `ActiveFunnelEnvelope` import. Superseded by `DormantPipelineTables` (B8.5 wires the new tables, not these). Archived to `1-system-manual/_archive/deleted-code/P19-B8.4c_ActivePipelineTail_ActiveDownstreamFunnel.removed.tsx`; logged in `DELETED_COMPONENTS_LOG.md`. **The B8.4b active-funnel writers persist server-side; `/api/active-engine/diagnostics/funnel` + `/pipeline-tail` are client-unconsumed until B8.5** — deliberate, named home B8.5.

## Langston review (Step-4)

APPROVED to push. Notable: Langston's initial 🔴 BLOCKER ("crypto OBJ-6 surfacing is a no-op") was **retracted after independent verification** — he had grepped `server/routes.ts` (a different endpoint at :7767); the crypto feed is `server/routes/vts.ts:1633`, a whole-object passthrough of `getLastScanDiagnostics()`, which carries the new fields. Langston verified line-by-line and CLEARED it. Also required + landed: delete the two superseded components; add the two optional fields to `FilterDiagnosticsData.lastScan` and drop the `as any` casts.

## Step-7/8 verification (§9.3)

**Runtime field population (Langston's carried-forward check) — CONFIRMED end-to-end.** Post-deploy curl (after first FX5 cycle): crypto vts feed `scanTargetPerCycle=300`, `krakenUniverseSize=1509`, `totalPairsScanned=362`; xStock `cycleBatchSize=75`. #421 genuinely resolved (universe is live in the VTS feed, not just wired).

**§9.3 Claude-in-Chrome DOM walk (staging, restart #465):**
- **Crypto VTS tab** — scanner card renders all 6 fields LIVE: Pairs Scanned (last) **351** · Per-Cycle Target **300** · Total Universe **1,509** · Pairs Scanned (24h) 3,166 · Next Scan In (live countdown) · Cadence every 30s. The three live tables (Pipeline Summary / Last Scan / 24h Rolling) render with real VTS data — no regression — and the Pipeline Summary carries the blue themed header (OBJ-9).
- **Crypto Paper tab** — scanner card 6 fields with Per-Cycle Target **300** + Total Universe **1,509** live (confirms the crypto surfacing reaches Paper/Live too, refuting the retracted blocker). The **three dormant tables mirror the VTS structure** (Pipeline Summary → Last Scan → 24h Rolling), each headed "Paper — awaiting activation (B8.5)" with the real column skeleton + an "awaiting activation" body — **never a bare 0** (OBJ-5/OBJ-8). Per-table theming visible: Pipeline Summary blue filled header, Last Scan purple filled header, bold titles, distinct border colors, frozen first column tinted (Stage/Filter) — OBJ-9 + OBJ-10 frozen-column styling. Consistent width across scanner + all tables (OBJ-7).
- **Mobile (OBJ-10):** the per-table `overflow-x-auto` container + `sticky left-0` frozen first column are implemented (standard responsive Tailwind, tsc-clean) and the frozen-column tinting is visible in the desktop render; the Claude-in-Chrome automation window captured at a fixed 958px so a true narrow-viewport screenshot wasn't obtainable — recommend a quick phone eyeball, low-risk.

Screenshots (desktop Paper FD — dormant 3-table mirror + themed headers) saved during the walk.

## Governance files changed

- `1-system-manual/DELETED_COMPONENTS_LOG.md` (deletion record)
- `1-system-manual/RUNNING_ISSUES.md` (#421 resolved, #422 → B8.5)
- `1-system-manual/GOVERNANCE_EXCEPTIONS.md` (class-override non_architecture + SIM/SysManual N/A row naming the 3 new read-only fields)
- `1-system-manual/BATCH_CATALOG.md`, `1-system-manual/PHASE_HISTORY.md`, `1-system-manual/PHASE_19_PLAN.md` (§1 board + §5 decision log)
- `Claude Comms and Packages/Scope Files/P19_B8_4c_SCOPE.md` (change-class header)
- MEMORY (CC-B + Langston mirror)

**SIM / System Manual — N/A (explicit decision, not a skip):** this batch surfaces three EXISTING config/metric values (`scanTargetPerCycle`, `krakenUniverseSize`, `cycleBatchSize`) as read-only fields on EXISTING diagnostics feeds, plus a client display rework. No new/re-keyed component, no cross-cutting state, no architecture/strategy/regime/filter/signal-pipeline/math change → neither SIM nor System Manual is in scope (Langston concur). Recorded in GOVERNANCE_EXCEPTIONS.
