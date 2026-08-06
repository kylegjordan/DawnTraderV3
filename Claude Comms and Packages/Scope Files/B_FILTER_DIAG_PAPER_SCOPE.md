# B-FILTER-DIAG-PAPER — Scope r2

change-class: non_architecture
**Owner:** CC-B · **Date:** 2026-08-06 (r2 same day: Langston 5 review items folded + Kyle's expanded directive) · **Directives:** Kyle 2026-08-01: *"fix the filter diagnostics tabs in paper trading… the reasons why strategies are rejecting signals before the SQE"* (unblocks #648, analysis tabled until this lands) **+ Kyle 2026-08-06 (verbatim intent):** *"run a thorough audit — code level review, run-time logs; understand how the two filter diagnostics tabs (crypto and xstocks) work in the VTS page. It should be the same for paper trading except we need to add diagnostics for the gates in the SQE and the RTB refresh (for any that fall out of the refresh cycle). Navigate to and fix the staging website to make sure all of the tracked metrics are working properly."* Telemetry + display only; zero engine-behavior change; no migration.

## 1. Step-1 findings — r2 CORRECTED per Langston BLOCKER-1/2 (all measured live 2026-08-06)

**Population discipline (the r1 error, on the record):** r1 presented `strategy_internal 479,378` as the paper-active story. **Measured stage × source (24h, `signal_eval_archive`): the discriminator is `source`, never `mode`** (post-07-14 both pipelines stamp `mode=paper`):

| stage | source(s), measured | Which path |
|---|---|---|
| `pre_filter` | market-scanner 1,413,257 · fx5-scanner 157,384 | SHARED scan feed (mode-multiplexed scanner) |
| `strategy_internal` | vts-runner 690,110 — **ONLY** | **VTS-ONLY stage — no active-path writer exists** (B5a hook list; SYSTEM_MANUAL:11514) |
| `sqe` | vts-runner 16,891 · **signal-orchestrator 7,630** | both — active-path = `signal-orchestrator` |
| `admitted` | signal-orchestrator 481 (queued) · active-execution-engine 18 (opened) · vts-runner 74 | **NEVER sum without GROUP BY source** (B5a's own SIM rule — orchestrator=queued vs engine=opened are different events) |
| `tcl` | vts-runner 1,476 — active-path 0 in window | pre-audit item: confirm the active-path `tcl` hook's liveness + source string |

**⇒ The r1 headline is RESTATED:** on the ACTIVE path, pre-SQE strategy deaths live in the funnel tracker's `strategyAttrition` (per-strategy family-filter drops — e.g. liquidity_trap 939,465 cumulative) and NOT in a `strategy_internal` stage, which does not exist there. The #648 population is the active-path one; the VTS lane renders as ITS OWN labeled lane, never blended.

**The `uncategorized` occupant — hypothesis CONFIRMED BY MEASUREMENT (Langston BLOCKER-3):** `ACTIVE_PATH_FLOW.md:212` names NetEV as the bucket's occupant; measured: **7,648 of 7,649** active-path sqe-stage `gate_decision.reason` tokens (24h) are `NetEV` (`"NetEV -0.006420 <= 0 (chosen maker mode — non-positive net expectancy after friction)"`); the other 1 is RegimeWeight. `SQE_CANONICAL_GATES` (`active-funnel-tracker.ts:43-51`) has no NetEV member → 99.99% land in the discovery bucket. Consistent with #570.

**`preSqeRejects` = {} — disposition (1) STILL RELEVANT AND CORRECT (Langston CHANGES-NEEDED-4, his own B8.4b anchor-b ruling, cited `active-funnel-tracker.ts:53-60` + SIM S22):** family-filter drops are deliberately excluded so `preSqeRejects ⊆ signalsGenerated` holds; the three writer sites (`signal-orchestrator.ts:511/:545/:598`) are the whole-tree caller census and their conditions genuinely don't fire. Empty ≠ missing instrumentation. The tabs LABEL this and point at the attrition/stage tables. Any pre-audit evidence against (1) is a scope change and returns to Langston.

**The funnel plumbing is live** (`/api/active-engine/diagnostics/funnel?mode=paper` `status:"active"` both classes since 07-14; dormant-fallback wiring correct at `vts-filter-diagnostics-panel.tsx:254-283`). The batch is legibility + the two NEW diagnostic surfaces Kyle named.

## 2. Provenance (§2 1.b — corpora: BATCH_CATALOG, B8.3/B8.3b/B8.4b/B8.4c completion reports, RUNNING_ISSUES, SIM S22, SYSTEM_MANUAL:11499-11517, ACTIVE_PATH_FLOW.md, code comments; quotes cited in §1)

| Component | Original intent | Disposition |
|---|---|---|
| `active-funnel-tracker.ts` (T1) | B8.4b per-(mode,class) funnel counters; `uncategorized` = discovery bucket "for deliberate promotion" (`:37`) | **(2)** — perform the designed promotion: add `NetEV` to `SQE_CANONICAL_GATES`; residual tokens enumerated-or-ruled (see OBJ-2 exit). |
| `vts-filter-diagnostics-panel.tsx` active section (T1) | B8.4c dormant mirrors + B8.5 funnel wiring | **(2)** — mirror the VTS tabs' structure (Kyle: "should be the same") + the new SQE-gate + RTB-fallout diagnostics. |
| `DormantPipelineTables` (T2) | honest pre-activation placeholder | **(1)** — stays as the non-active fallback. |
| `signal-eval-archiver.ts` `reject_stage`/`gate_decision`/`source` (T2) | B5a per-decision taxonomy, source-disambiguated | **(1)** — read-only consumer added; no write change. |
| `preSqeRejects` writers (T2 — r2: no behavior change) | B8.4b named pre-SQE rejects, anchor-b denominator discipline | **(1)** — correct-by-design; tabs label the emptiness (OBJ-4). |
| `rtbRefresh` counters (T1) | B8.4b: cyclesRun/refreshedAttempted/reconfirmed/rejectedInRefresh/promoted/droppedError (+#419 error bucket) | **(2)** — Kyle: surface refresh-cycle FALLOUT (what falls out, why) on the tabs; extend reason detail only if the counters lack it (pre-audit determines; telemetry-only). |
| `gate-columns.ts` identity (T2) | B8.3 enforce `Rejected = Evals − Passed` | **(1)** — new tables must respect it; admitted split by source so the identity survives. |

## 3. Objectives

1. **VTS-parity structure (Kyle).** Pre-audit documents exactly how the two VTS-page FD tabs (crypto + xStock) work — code-level + runtime logs — and the Paper tabs adopt the SAME structure, populated from active-path sources, with the VTS lane clearly its own labeled thing.
2. **SQE gate diagnostics (Kyle + BLOCKER-3/CN-5).** Per-gate reject visibility: promote `NetEV` into `SQE_CANONICAL_GATES` (measured 99.99% of the bucket); render per-gate counts (NetEV / Confidence / RegimeWeight / …) on the Paper tabs with the NetEV explanation legible (the single sentence Kyle most needs). **Exit criterion (owned, not hoped):** top-N reason-tokens by archive count each PROMOTED or explicitly RULED non-gate, residual enumerated; `uncategorized` share <5% of new rejects is the INDICATOR. Homed: post-deploy self-rescheduling §10.5 alert (7-day soak, owner CC-B, `p19-b8-5l-atr-fence` pattern).
3. **RTB refresh-fallout diagnostics (Kyle).** The tabs show the refresh cycle's story: attempted / reconfirmed / rejected-in-refresh / dropped-error / promoted per class — anything that FALLS OUT of the refresh cycle is visible with its reason (existing counters first; extend reason granularity only as telemetry if pre-audit finds them too coarse).
4. **Per-strategy × per-stage table, source-disciplined (BLOCKER-1/2).** New read-only endpoint aggregating `signal_eval_archive` by (strategy, reject_stage, source) — active-path lane = the #648 instrument (strategyAttrition + sqe + admitted-by-source); VTS lane labeled separately; `admitted` never summed across sources. Verification: reconciles against direct psql GROUP BY; the six never-traded strategies' active-path death-point visible on the correct population.
5. **Structurally-empty buckets labeled honestly** (`preSqeRejects` says where deaths actually occur and points at the attrition table; no bare zeros, no empty sections).
6. **Staging metrics fix-pass (Kyle).** Navigate the staging site (§9.3, both classes × Paper, both branches, desktop + mobile): EVERY tracked metric on the FD tabs verified rendering + correct; every broken one fixed in this batch (enumerated at pre-audit, each with evidence). This surface's history (B8.3b third block) proves the walk is the only sufficient gate.

## 4. Non-goals
No engine/strategy/SQE/RTB behavior change (diagnostics read; telemetry writes only); no threshold moves; no schema migration; no VTS-side behavior change (display labeling only where shared components render both lanes); #648's analysis stays Kyle's next move.

## 5. Verification
CI 4/4 · Langston Steps 1/2/4/8 · `dt-deploy <sha> --by CC-B` · endpoint curls + psql reconciliation · the §9.3 walk with screenshots per tab per class · OBJ-2 soak alert registered before close · completion report + §4c board reconciliation.
