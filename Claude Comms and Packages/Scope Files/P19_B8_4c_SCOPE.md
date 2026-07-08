# P19-B8.4c — Filter Diagnostics tab standardization (SCOPE — REV 2)

change-class: non_architecture

**Owner:** CC-B (Claude New) · **Reviewer:** Langston · **Origin:** Kyle UI feedback 2026-07-08 (screenshots + two clarifications). **★ REV 2 supersedes REV 1** — the model changed materially after Kyle's clarification (see "Corrected model" below); re-review from scratch.

**Pure display / presentation.** No engine, strategy, regime, filter-logic, threshold, signal-pipeline, or math change. No new data computed server-side (may consume EXISTING read-only scan endpoints); no trade-state; no order path. Client-only. SIM/SysManual N/A by expectation (display-consistency pass over an observability surface).

---

## Corrected model (Kyle, 2026-07-08 — the load-bearing truth)

- **Both scanners (crypto FX5 + xStock) are ALWAYS running, in every mode** → scanner data is real and live on all six tabs.
- **VTS is always running the FULL pipeline** → filtering (global + IMF) and signal generation genuinely happen there → the two VTS tabs are the ONLY tabs with live filter/pipeline data.
- **Paper + Live run the scan but do NOT apply any filters** (global or IMF) — active trading is off → those four tabs show **scanner data only**, with all filter/pipeline sections **DORMANT** ("awaiting activation — fills at switch-on B8.5"), never a bare 0.
- Net: **all 6 tabs = live lean scanner card at top; only the 2 VTS tabs = live filter/pipeline sections; the 4 Paper/Live tabs = dormant filter/pipeline sections.** (This CORRECTS REV 1, which wrongly treated the crypto Paper/Live global-filter breakdown as live — it must be dormant there too, symmetric with xStock.)

## The scanner card (lean, scan-only — same fields all six tabs, per-class numbers)

Everything about eligible / survived / filtered-out is REMOVED from the scanner and lives only in the pipeline sections. The scanner card shows ONLY:
1. **Pairs scanned — last scan.**
2. **Pairs scanned — last 24 h** (running total).
3. **Scanner capacity** — the max pairs the scanner can cover per scan (crypto = its full Kraken universe; xStock = its full list), shown alongside the last-scan count so a short scan is visible at a glance.
4. **Next scan in** — a live countdown timer (ticks each second; from the existing `scan-latest` `nextScanInMs` for crypto; compute from cadence for xStock if it has no direct field — decide at pre-audit).
5. **Scan cadence** — frequency (every Ns) / cycles-per-hour.

(Fields pulled from the OLD deleted Filter Insights "Cycle Info" section — `scan-latest`: `krakenUniverseSize`, `cyclesPerHour`, `cycleFrequencyMs`, `nextScanInMs`, `cycleEndTimestamp`. Its "Last Scan Result" = evaluated/eligible/ineligible is filter data → NOT in the scanner card.)

## The three pipeline/filter sections (unchanged content; per-mode dormant-vs-live)

The panel already has three: **Pipeline Summary (24h)**, **Last Scan — Filter Breakdown**, **24-Hour Rolling Aggregates** (+ the B8.4b downstream funnel + pipeline tail). This batch does NOT change their content — it only ensures: **VTS = live; Paper/Live = dormant "awaiting activation"** (mirroring the B8.4b downstream-funnel dormant styling), consistently for both asset classes.

## Objectives

1. **OBJ-1 — Lean scanner card, standardized across all six tabs.** One consistent card at the TOP of each tab showing only the 5 scan fields above (per-class numbers). Crypto: rework `ActiveScannerStage` down to the lean scan fields (pull in next-scan countdown + cadence + capacity from `scan-latest`); REMOVE the eligible/ineligible split + the global-filter breakdown from it. xStock: rework `ScannerCycleHeader` to the same lean field set + card style.

2. **OBJ-2 — Crypto Paper/Live filter sections → DORMANT.** The crypto global-filter breakdown + eligible/ineligible that today render live on the crypto Paper/Live tabs move OUT of the scanner and render as dormant "awaiting activation" (filters not applied in paper/live). Live filter data for crypto shows only on the crypto VTS tab.

3. **OBJ-3 — xStock Paper/Live filter sections → DORMANT** (same as crypto; symmetric). xStock VTS keeps its live filter/pipeline sections.

4. **OBJ-4 — VTS tabs (both) unchanged in content, aligned in structure.** Keep the live, richer breakdown (real simulation data — do NOT dumb down). Ensure the lean scanner card sits at the top consistently. **Pre-audit open item:** the crypto VTS tab currently SKIPS the scanner card — confirm the VTS-runner scan counts it can honestly show (pairs scanned last + 24h + capacity) and whether adding the card there is display-only or needs a data source; narrow to structure-only + home the data piece if the latter.

5. **OBJ-5 — dormant≠zero + error honesty (carryover).** Every dormant section shows an explicit "awaiting activation" state, never a bare 0. Fetch failures show an error state, never a silent blank. The live scanner card + the VTS live sections keep their real numbers.

## Explicit NON-goals

- NOT building an xStock active-path scanner/screener (dormant filter cards instead).
- NOT changing any filter LOGIC, thresholds, scan cadence, or the scanners themselves.
- NOT touching the B8.4b downstream funnel logic, the pipeline tail, or the trade tables (only their dormant-vs-live gating consistency).
- NOT un-gating the VTS filter tables onto the enforce (Paper/Live) tabs.

## Verification (§9.3 — all six tabs, Claude-in-Chrome DOM; Radix tabs via focus()+Enter)

1. All six: lean scanner card at top (pairs scanned last + 24h + capacity + live countdown + cadence); no eligible/survived rows in it; countdown visibly ticks.
2. Crypto Paper + Live AND xStock Paper + Live: scanner card live + ALL filter/pipeline sections dormant "awaiting activation" (no bare 0).
3. Crypto VTS + xStock VTS: scanner card live + the filter/pipeline sections LIVE with real sim data (no regression).
4. Consistent card style/position across all six; no render errors; no crypto/xStock bleed.
5. Bench green (tsc baseline + vitest); CI 4-green; deploy restart; Langston Step-4 (diff) + Step-8 (independent).

## Files (expected)

`client/src/components/vts/vts-filter-diagnostics-panel.tsx` (`ActiveScannerStage` → lean scanner; dormant-gate the filter sections on Paper/Live for BOTH classes), `client/src/components/machine-learning/xstocks-tab.tsx` (`ScannerCycleHeader` → lean scanner + dormant filter sections), possibly `client/src/components/vts/vts-tabs.tsx` (crypto VTS scanner card). Read-only endpoints (`scan-latest`, `scan-24h`, `xstocks/filter-diagnostics`) consumed as-is unless OBJ-4 surfaces a needed VTS-scan count (decide at pre-audit).

---

## ★ REV 3 — Kyle refinement round (2026-07-08, after the §9.3 walk)

**change-class: non_architecture** (now touches SERVER read-only telemetry surfacing + a client layout rework; still no logic/threshold/strategy/regime/math change).

Kyle reviewed the deployed B8.4c and directed a refinement round. New objectives:

- **OBJ-6 — Scanner "Capacity" was mislabeled; split into two honest fields.** Current "Scanner Capacity" showed the total universe (~1,509 / 481). Correct model (Kyle): **Capacity = the per-cycle scan LIMIT** — crypto `SCANNER_PARAMS.BATCH_SIZE = 300` (`server/config/system-guards.ts:179`), xStock `CYCLE_BATCH_SIZE = 75` (`server/asset_classes/xstock_spot/scanner.ts:179`) — AND a SEPARATE **Total Universe** field = the live count (crypto `krakenUniverseSize` ~1,500 pulled from Kraken every cycle; xStock `lastUniverseSize` ~481, discovery-cron-refreshed). **Server surfacing (read-only, no logic change):** expose the two per-cycle limits + the crypto `krakenUniverseSize` into the diagnostics feeds (they're real config/metrics — NOT drift-prone client constants; this also RESOLVES #421 — crypto universe now in the VTS feed). Scanner card fields (all 6 tabs): Pairs Scanned (last) · Capacity (per-cycle) · Total Universe (live) · Pairs Scanned (24h) · Next Scan In · Cadence. (Verify at build: crypto "pairs scanned last" ~324 vs cap 300 — confirm the true per-cycle number so scanned-vs-capacity reads sensibly.)
- **OBJ-7 — One consistent table width, all six tabs.** The scanner card + the three pipeline tables share ONE width, bounded by the xStock scanner's "Next Scan In" column extent; columns justified to it. (Today: crypto = constrained max-w rectangle, xStock = full-screen — inconsistent.)
- **OBJ-8 — Paper/Live MIRROR the VTS three-table structure, dormant.** Replace the two generic placeholders (`DormantFilterBreakdown` + downstream-funnel) with the actual VTS three-table skeleton rendered dormant/"awaiting activation": (1) Pipeline Summary (24h) → (2) Last Scan (full pipeline) → (3) 24h Rolling Aggregates. Same order + structure as VTS.
- **OBJ-9 — Per-table styling + separators.** Bigger/bolder table title headers; a DISTINCT border color per table with the header bar filled in that same color; clear visual separation between the three pipeline tables.
- **OBJ-10 — Mobile responsive.** Each table scrolls horizontally within its OWN bounded container (the page never scrolls sideways); on the three pipeline tables, freeze the first column (the stage/filter-name) so labels stay visible while swiping the numbers.

**Verification (§9.3, all six tabs, desktop + a mobile-viewport pass):** scanner shows the 6 fields with real capacity (300/75) + live universe (~1,500/481); all tables one consistent width; Paper/Live show the 3 dormant pipeline tables mirroring VTS; per-table colored headers/borders; mobile per-table horizontal scroll + frozen first column, no page-level horizontal scroll. Bench + CI-4-green + Langston Step-4/8.

**Files (expected):** server — `fx5-scanner.ts` / `market-scanner.ts` (surface `krakenUniverseSize` + capacity into ScanDiagnostics) + `server/routes/vts.ts` + `server/routes.ts` (xStock cap) ; client — `vts-filter-diagnostics-panel.tsx` (scanner card fields + the 3 dormant tables + width + styling + mobile) + `xstocks-tab.tsx` (width wrap) + shared width/table helper.
