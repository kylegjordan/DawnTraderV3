# P19-B8.1 Completion Report — Three mode pages: the trading-UI reorganization

**Batch:** P19-B8.1 · change-class: **architecture** · **CC-B, 2026-07-04** (design 07-03 → deployed+verified 07-04)
**Basis:** `P19_B8_DESIGN_INTENTIONS_v1.md` + CONSENSUS ADDENDUM (Kyle A/A/A) · `P19_B8_1_SCOPE.md` · `P19_B8_1_PRE_AUDIT.md`
**Langston gates:** Step-1 APPROVED ×2 · Step-2 APPROVED (2 hard gates discharged) · Step-4 APPROVED-to-push (line-by-line on module-constants; his `getCachedNumbersForModule` gate folded pre-push) · **Step-8 PASS, independently reproduced** (HEAD/pm2/DB-count/log-scan verified on the box, not from my report).
**Deploy:** staging restart#441, head `111b9d349`, CI `28699571373` all-4-green.

## Objectives — ALL YES (with one dated evidence-deferral)

**OBJ-1 ModeTradingPage shell + three pages: YES.** One parameterized shell (`pages/mode-trading.tsx`) + per-mode tab manifests; routes `/live-trading` `/paper-trading` `/virtual-simulations`; sidebar order Live→Paper→VTS (Kyle locked); `/active-trades` → redirect to Paper. Mode-scoped data-source contract in the manifests (active `/api/active-engine/*` vs VTS `/api/vts/*`), per the pre-audit §2 pinned table.

**OBJ-2 Tab manifests: YES.** Live/Paper: CryptoFD, xStockFD, Ready to Buy (+ExecutionMetrics), Open, Closed, Shadows(last). VTS: CryptoFD, xStockFD, Open, Closed — the VTS trade tables + both FD panels MOVED from the ML page with refresh+CSV-export carried (`components/vts/vts-tabs.tsx` wrappers over the C1-extracted components). §9.3 FULL VISUAL AUDIT (Kyle hard requirement) walked every page/tab; VTS tables live (fee-modes+twins render), Paper all-6, Live all tabs + DORMANT-Phase-21 badge.

**OBJ-3 Controls: YES.** Toggle + SimulationStartup/ConfirmBalance modals + verbatim handler ports → `PaperTradingControls` on the Paper page; top-bar stripped to mode-neutral display; **metrics strip UNTOUCHED (pinned boundary — moves with B8.3 labeling)**; LIVE/PAPER selector retired (mode = page); live confirm modals unmounted with named Phase-21 home; `trading_state_changed` WS listeners retained (two-tab race guard). Start NOT clicked (switch-on = B8.4; modal-fire proof deferred there per Langston Step-8).

**OBJ-4 Deletions (rule 18): YES.** Deleted: active-trades page, Pattern Scanning tab + `/api/pattern-pool` route, Filter Insights tab+standalone page+component + 2 tracked patch strays — 6 `.removed` archives + DELETED_COMPONENTS_LOG entry + tsc-zero-dangling. **★ SCOPE CORRECTION (the conditioned re-trace caught it):** `pattern-pool-dispatch.ts` + both `pattern-pool-filters.ts` KEPT — hot-path consumers (SQE `signal_quality_evaluator.ts:35`, `active-position-sizing.ts:33`, types, per-class diagnostic). The original delete-the-dispatcher plan would have cut the trading path.

**OBJ-5 ML page = learning/calibration home: YES.** Keeps Predictive Adjustments / Regime Archive / DBS Pair Tracking (all render; DBS panel's diagnostics fetch retained). Rename decision: kept "Machine Learning" this batch (nav familiarity; revisit at B8.3 if desired).

**OBJ-6 Four defects fixed at TRUE sources: YES (one visual leg dated-deferred).**
- (a) Crypto "Trades Opened": server NEVER emitted the field → new DB-backed `tradesOpened24h` (v1.6, shadow-excluded) + panel rows read it. **Step-8 independently reproduced: `{150,145,3}` byte-for-byte.**
- (b)+(c) xStock counters: **pre-audit §5 CORRECTED** — NOT unwired accumulators (live endpoint had 136,231/201,616); real causes = client top-level-vs-nested shape read (b — dual-shape read shipped; asymmetry retirement homed **#410**) + hardcoded `rolling24hTickRows=0` emission (c — now `lt.pairsEntered`). **Evidence deferral: nonzero xStock VISUAL proof waits for the 2026-07-06 market session** (Jul-4 US holiday: scanner correctly idle per rule 17 + restart reset the in-memory accumulator) — **dated home: staging system-alert, triggers 2026-07-06T15:00Z, owner CC-B** (Langston Step-8 condition).
- (d) not-warm race: root cause = **delete-then-refetch race in the 60s background refresher** (NONE of the pre-audit's 3 hypotheses; found via live evidence incl. the second failing module `amr_friction_sample`). Fix: swap-on-success + SWR with bounded+logged staleness (`maybeWarnStaleServe`, ALL THREE sync readers per Langston's gate), expire-not-delete invalidate, admin-write re-warm; scanner `lastError` lifecycle (lastErrorAt/errorCount/clear-on-success) + panel history line. **Step-8: whole-log clean on not-warm (both app+ml logs); two-module positive soak proof accrues.**

**OBJ-7 Workflow close: YES** — bench tsc-baseline green + vitest 2004 (parity; 3 file-fails = pre-existing DB-gated suites, verified identical on clean HEAD); CI 4-green; deploy; full visual audit; Step-8 PASS.

## Honest process notes (B-NEW-43 / §9.2 disclosures)
1. **tsc-baseline path relocation (C1):** 23 pre-existing TS18046 moved with the extracted panel (`machine-learning.tsx` → `vts-filter-diagnostics-panel.tsx`), counts untouched, empirically pinned to identical lines — sanctioned same-commit relocation, zero NEW baseline additions this batch.
2. **EOL-flip incident:** the Edit tooling silently flipped `module-constants-service.ts` (and once `top-bar.tsx` mid-edit) to LF; caught by byte-checks, repaired to full CRLF pre-commit — committed diffs verified hunk-scoped (Langston confirmed: not a full-file rewrite).
3. **Pre-audit §5 root-cause correction** disclosed at Step-4 (see OBJ-6 b/c) — verify-don't-trust caught my own wrong determination before it shipped a wrong fix.
4. `fetchModuleRows` DRY nit: **declined this batch** deliberately — an unreviewed refactor after the line-by-line review would invalidate it; future-touch nicety.
5. CC-A's feature-watch ledger commit `25061875b` rode the shared working-copy push (not B8.1 content).

## §13 homes
#410 (FD route/response-shape harmonization — retires the dual-shape shim) · #409 (dead default pm2 logs; real logs `/var/log/dawntrader/`) · 07-06 system-alert (xStock visual proof, owner CC-B) · C4 modal-fire proof → B8.4 · Phase-21 live-controls re-home (modals) · B8.3: metrics-strip move + three-balances labeling.

## Governance files changed (this batch)
`SYSTEM_IMPACT_MAP.md` (Cross-Cutting registry: module-constants swap-on-success/SWR cache semantics + stale-warn; new "Three mode pages" client architecture section; ML-page disposition) · `SYSTEM_MANUAL.md` (module-constants sync-read/SWR semantics note in the B72 section — the shared-service behavior change; UI page structure = SIM-scope) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` §1 board + §5 log · `RUNNING_ISSUES.md` (#408-#410 landed at design/pre-audit; B8.1 rows updated) · `DELETED_COMPONENTS_LOG.md` · `Scope Files/P19_B8_1_SCOPE.md` + `P19_B8_1_PRE_AUDIT.md` · this report · `MEMORY_CC_B` + mirror · Langston `/home/langston/MEMORY.md` (sync at close).
