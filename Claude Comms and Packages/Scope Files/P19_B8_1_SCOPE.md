# P19-B8.1 SCOPE — Three mode pages: the trading-UI reorganization

change-class: architecture

**Batch:** P19-B8.1 (first sub-batch of the P19-B8 arc) · **CC-B** · Step-1 draft 2026-07-03
**Basis (all committed):** `P19_B8_DESIGN_INTENTIONS_v1.md` + its CONSENSUS ADDENDUM (Kyle decisions A/A/A locked; §4 formally locked incl. the field-research trigger refinement) + the Step-1 architectural read (agent report, 2026-07-03; SIM/SysManual + caller-site probed, per §2.1a).
**Parallel track:** B8.2 (balance policy) scope comes AFTER this batch's Step-1/2 — it is NOT in here. This batch is pure UI/telemetry/deletion — **zero engine-behavior change**.

---

## Objectives

### OBJ-1 — ModeTradingPage shell + three mode pages
One parameterized `<ModeTradingPage mode>` shell driven by per-mode TAB MANIFESTS (config objects declaring which shared tab components render, their order, their DATA-SOURCE endpoints, and controls-present). NOT three page trees (Langston Q2 ruling — parity rot guard). New routes + sidebar entries, nav order: **Live Trading** (top) → **Paper Trading** → **Virtual Simulations**. `/active-trades` route removed (redirect decision at implementation — no dead link from bookmarks). Sidebar "Trading" entry replaced by the three.
**Mode-scoped data-source contract (day-one):** every shared tab component takes its endpoints from the manifest — active path reads the `/api/active-engine/*` family + `closed_trades`/`active_open_positions`-backed endpoints; VTS reads the `/api/vts/ml/*` family (`vts_open_trades` + JSON). No tab may assume the active-path tables (post-B-RENAME the sources genuinely differ).
**Verify:** all three pages render on staging via Claude-in-Chrome (§9.3); VTS page shows the live VTS data (~350 open / ~700 closed-7d); Live + Paper pages show honest dormant/empty states (no crashes, no `--` renders); no residual `/active-trades` nav path.

### OBJ-2 — Tab manifests per the locked design table
| # | Live Trading | Paper Trading | Virtual Simulations |
|---|---|---|---|
| 1 | Crypto Filter Diagnostics | Crypto Filter Diagnostics | Crypto Filter Diagnostics |
| 2 | xStock Filter Diagnostics | xStock Filter Diagnostics | xStock Filter Diagnostics |
| 3 | Ready to Buy | Ready to Buy | Open Trades |
| 4 | Open Trades | Open Trades | Closed Trades |
| 5 | Closed Trades | Closed Trades | — |
| 6 | Shadows (last) | Shadows (last) | — |

The six Filter Diagnostics panels are the SHARED `FilterDiagnosticsPanel`/xStocks panel parameterized by (mode × assetClass); the existing two VTS panels MOVE from the Machine Learning page (OBJ-5). The old Trading-page **Filter Insights tab is RETIRED** (replaced by per-mode FD). Live/Paper FD panels may show scoped-to-mode dormant states pre-switch-on — honest, labeled.
**Verify:** per-tab §9.3 walk; the B7.2b fee-mode columns + B7.2c pending states still render on the VTS Open Trades tab after the move.

### OBJ-3 — Controls: per-page start/stop; global toggle removed
The top-bar trading toggle + its confirm flow move INTO the Paper Trading page (paper start/stop; the ConfirmBalanceModal start flow carries over UNCHANGED in this batch — the Kraken-mirror redesign is B8.2). The Live Trading page gets the control SURFACE but hard-disabled/gated (live mode = Phase 21; labeled honestly). The VTS page gets NO start/stop (always-on). The top-bar keeps mode-neutral display (clock, alerts). **Portfolio metrics strip — BOUNDARY PINNED (Langston Step-1 clarification, adopted): the strip is LEFT UNTOUCHED in B8.1** — only the TOGGLE moves this batch; the strip relocates atomically WITH the three-distinct-balances labeling in B8.3 (one atomic home; moving it now would pull balance-labeling work into a pure UI/telemetry batch).
**Server-authoritative sync retained:** the pages keep the `trading_state_changed` WS listeners so two open tabs can't fight (architectural-read risk flag).
**Verify:** toggle absent from top bar on every page; paper start/stop works from its page (start NOT exercised beyond the existing dormant behavior — switch-on is B8.4); state change reflects across open pages.

### OBJ-4 — Deletions (rule 18, full-wipe discipline)
1. **Pattern Scanning tab** — `client/src/components/trading/pattern-scanning.tsx` + the `/api/pattern-pool` route (routes.ts:~13028) + `server/asset_classes/pattern-pool-dispatch.ts` IF the implementation-time consumer re-trace confirms the read's single-consumer finding (the per-class `pattern-pool-filters.ts` guardrail modules STAY — they feed the pattern path itself, only the display dispatcher/route/tab go). Kills the whole-page `.toFixed` crash as a side effect.
2. **Standalone `/insights` route + FilterInsightsPage** — same retirement as the Filter Insights tab (disposition decided at the cut; architectural read surfaced it as a separate route).
3. **ML-page duplicate VTS views** — the VTS Open/Closed trade views + both FD panels move to the VTS page and are DELETED from the Machine Learning page at source (no pointer stubs).
All: DELETED_COMPONENTS_LOG entries + `_archive/deleted-code/*.removed` copies + tsc-zero-dangling proof.
**Verify:** grep-clean for the deleted routes/components; tsc baseline green; DELETED_COMPONENTS_LOG updated.

### OBJ-5 — Machine Learning page becomes the Learning/Calibration home
Keeps: Predictive Adjustments, Regime Archive, DBS Pair Tracking (+ the analytics sections it hosts). Loses: the four moved VTS views (OBJ-4.3). Page title/nav rename decision ("Machine Learning" vs "Learning & Calibration") made at implementation with Langston. Every moved/kept tab is an enumerated disposition line in the change list (Langston §13 condition — no "presumably").
**Verify:** ML page renders its surviving tabs; no duplicate homes anywhere (§9.3 walk).

### OBJ-6 — The four diagnostics defects, fixed at source
Suspected shared root treated ONCE, **verified THRICE** (Langston condition — three distinct Step-8 proof cases):
- **(a) Crypto FD "Trades Opened (24h)" = 0** — root cause (architectural read): in-memory counter resets on restart, no DB fallback. Fix: DB-backed 24h rolling read from `vts_open_trades` (mirror the xStock pattern), at the endpoint source.
- **(b) xStock FD "Family-Qualified (Unique Pairs)" = 0** + **(c) xStock rolling-24h "Pairs Scanned" = 0** — root cause: the eval-cycle lifetime accumulator fields (`familyQualifiedUnique`, `pairsEntered`) never wired. Fix in `xstock_spot/eval-cycle.ts` accumulator once.
- **(d) `dbs_calculation` not-warm red banner** — root-cause at implementation: the b72 warmup list vs the failing sync-read path (the read shows the module IS listed in current source yet staging still errors — determine whether the deployed list predates the entry, the read happens pre-warmup, or a different module key is read). Fix at the boot seam; NO fallback-to-default.
**Verify (three distinct proofs + one):** (a) crypto Trades Opened matches a direct DB count on staging; (b) Family-Qualified > 0 and consistent with the funnel; (c) Pairs Scanned ≈ cycles × universe; (d) banner gone across a restart.

### OBJ-7 — Full workflow close
Bench (tsc baseline + vitest) → Langston Step-4 diff → CI 4-green → staging deploy → **§9.3 FULL VISUAL AUDIT (Kyle directive 2026-07-03, hard requirement): navigate EVERY page and EVERY tab created/changed/deleted via Claude-in-Chrome — each tab opened, each panel/section/row read and confirmed rendering real values (no undefined/`--`/crash), deleted surfaces confirmed GONE from nav and routes; a quick it-loads glance does NOT satisfy this criterion** → Langston Step-8 → governance (BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5, RUNNING_ISSUES, SIM CONTENT update — the read found the SIM silent on the ML-page tab structure + FilterDiagnosticsPanel + shadow tab: this batch CLOSES that gap by documenting the new three-page architecture; SysManual applicability judged at close (UI-structural → likely SIM-scope only) — DELETED_COMPONENTS_LOG, completion report).

## Out of scope (named, so nothing is silently assumed)
Balance policy / start-flow redesign / ghost-default deletion (B8.2 — atomic there); per-mode dashboards + three-balances labeling (B8.3); switch-on + AC1/AC2 (B8.4, gated on AC1 both legs); the #406 Q5 decision + closed_trades growth gate (B8.4); Live-mode functional wiring (Phase 21).

## Blast radius (from the architectural read)
Client: App.tsx routes, sidebar, top-bar (toggle extraction), active-trades page (dissolved), machine-learning page (slimmed), 8+ shared tab components (manifest-parameterized). Server: `/api/pattern-pool` route + dispatcher (delete), `vts.ts` filter-diagnostics endpoint (defect a), `routes.ts` xstock filter-diagnostics block (defects b/c — fix is in eval-cycle accumulators), b72-warmup/boot seam (defect d). No engine/pipeline/strategy/gate logic touched. Governance gap being closed: SIM silent on ML-page tabs / FilterDiagnosticsPanel / shadow tab (flagged per §9.1 of the read).

## Riders / notes for Step-2 pre-audit
- Re-trace `/api/pattern-pool` consumers at implementation (certainty-before-cutting).
- The architectural read used some PRE-RENAME endpoint names in its inventory; the pre-audit pins the ACTUAL current endpoints per tab (post `/api/active-engine/*` rename) into the manifests.
- Confirm the `?mode=paper` hardcode in pattern-scanning dies with the deletion (no other `mode=paper` literals stranded).
- Check `#404` adjacency: none expected (heartbeat untouched here) — stated for the record.
