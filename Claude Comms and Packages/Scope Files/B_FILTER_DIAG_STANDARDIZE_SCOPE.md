# B-FILTER-DIAG-STANDARDIZE — Scope r1

change-class: architecture
> ⚠️ **RE-DECLARED from `non_architecture` on 2026-08-07 (Langston, judging the governance-checker's flag CORRECT against the tree — not merely relaying it).** The batch as SCOPED was a display change. **Kyle's mid-flight override** (*"this batch isn't complete until we have all the data we need feeding into these tracking metrics"*) brought in `server/core/observability/active-funnel-tracker.ts` **and instrumentation inside `signal-orchestrator.ts` — orchestrator hot-path work, which is EXACTLY the blast radius `#662` was split out to keep OUT of a non-architecture class.** I flagged the drift myself at the Step-4 resubmit and Langston initially allowed the class to stand on three narrow properties; the checker disagreed and he ruled the checker right. **Recording it here rather than in a completion report, because the class governs which doc-set the batch owes — and the honest record must not imply this diff stayed in the UI layer.** Consequence: SYSTEM_MANUAL + SIM content updates are owed BEFORE close.
**Owner:** CC-B · **Date:** 2026-08-07 · **Supersedes the OBJ-1 leg of B-FILTER-DIAG-PAPER, which I marked YES and had not done.**

## 0. What went wrong, stated first
Kyle's requirement, restated multiple times: **all SIX filter-diagnostics tabs (VTS / Paper / Live × crypto / xStock) are STANDARDIZED — the same fields and the same display. Paper and Live differ from VTS ONLY by ADDED SQE and RTB sections.** My pre-audit §11 captured the VTS structure correctly, the scope's OBJ-1 said "adopt the SAME structure", and I then built a different, smaller thing and marked OBJ-1 complete. **Root cause in the code:** `vts-filter-diagnostics-panel.tsx:653` — the `enforce` branch takes an **EARLY RETURN** (scanner card + my `ActivePipelineTables`) and never reaches the 11 shared tables below it. I extended the early-return view instead of removing the early return.

**Also withdrawn: the label "Pre-promotion + unrecognized tokens".** It is my invention and it is meaningless. It exists only because I read the in-memory cumulative counter (which has a gate-renaming migration problem) instead of the archive, then defended the bad label with a purity argument about not re-attributing history. **The archive answers cleanly** — see §2.

## 1. THE SPEC = the VTS tab, enumerated from the live page (2026-08-07, crypto tab, 11 tables)

| # | Table | Columns |
|---|---|---|
| 1 | Pipeline Summary (24h) | Stage · **Quant · Pattern · Total** · Counting Basis (16 rows) |
| 2 | Last Scan — Filter Breakdown | Filter · Quant Global · Pattern Global · Total (41 rows: 12 filters + Family IMF Metrics + per-family IMF breakdown) |
| 3 | 24-Hour Rolling Aggregates | same rows, 24h columns (35 rows) |
| 4 | Reward-vs-Risk / Reachability Gate | Strategy · Evals · Passed · Dropped · Tagged · RR Too Low · Target Unreachable · Bad Stop · No ATR Data · Mean RR · RR Suppression |
| 5 | Evaluation Detail | Metric · Quant Pool · Pattern Pool · Total |
| 6 | By Strategy | Strategy · Evaluated · True Nulls · Null % · Signals · Rejected · Trades |
| 7 | Setup Nulls | Category · Quant · Pattern · Total · % (A–F taxonomy, 20 rows) |
| 8 | Pre-Evaluation Skips | 7 rows |
| 9 | **Post-Signal Rejections → "Net EV Below Floor"** | ← **the row Kyle wants, which VTS ALREADY HAS and Paper does not** |
| 10-11 | Filter Metric Ranges (Quant / Pattern pools) | Metric · Lowest · 25th · Middle · 75th · Highest · Pairs |

**Current-scan vs 24-hour is structural in this spec** (tables 2 vs 3, and 10-11 are last-scan) — my build had NEITHER.

## 2. Feasibility per table — measured, so the plan is not another guess

**GROUP A — available NOW for Paper/Live; the data is already correct, the tables are simply not rendered** (the shared FX5 scanner is MODE-MULTIPLEXED, so with active trading ON these ARE the paper-mode numbers; the guard-eval tracker is per-(strategy,assetClass) and mode-invariant):
- Tables **2, 3, 10, 11** (scan-stage: Last Scan, 24h Rolling, both Metric Ranges) — fed by the same `/api/vts/filter-diagnostics` payload the Paper tab already fetches.
- Table **4** (Reward-vs-Risk / Reachability) — same shared tracker.
⇒ **Fix = delete the early return and render them; no new instrumentation.**

**GROUP B — active-path equivalents that must be SOURCED, not invented.** Measured active-path vocabulary (24h, `signal_eval_archive`, sources `signal-orchestrator` + `active-execution-engine`): **`sqe/NetEV` 8,479 · `sqe/RegimeWeight` 1 · `admitted` 397 — that is the whole vocabulary.**
- Table **9 (Post-Signal Rejections → Net EV Below Floor)**: **sourceable TODAY from the archive**, with the VTS row label verbatim. This is the answer Kyle has been asking for and it is one query away.
- Tables **1, 5, 6** (Pipeline Summary quant/pattern split, Evaluation Detail, By Strategy): ⚠ **MEASURED 2026-08-07, AND THE ANSWER MOVES THESE TABLES: the quant/pattern lane discriminator IS NOT RECORDED on active-path decisions.** `features->>'sourcePool'` over 24h of `source='signal-orchestrator'` rows: **NULL on 8,550 of 8,866 rows — 96.4% blank**; present only as `pattern` 269 · `xstock-trend` 45 · `xstock-strong_trend` 2 (3.6% coverage). ⇒ **the Quant/Pattern/Total columns CANNOT be honestly populated for the active path today.** Options, for the Step-2 ruling: (a) stamp `sourcePool` on every active-path archive write (small, additive, telemetry-only — my recommendation) and the columns fill going forward; (b) render the tables with a single Total column and the split columns explicitly marked not-instrumented; (c) defer to a named batch. **NOT acceptable: inferring the lane from the strategy name** — that is a lookalike mapping, not the recorded fact, and it is exactly the adjacent-object substitution this crew has paid for repeatedly. The row-level totals for tables 5/6 (Evaluated / Nulls / Rejected / Trades) ARE sourceable without the split.
- Tables **7, 8** (Setup Nulls A–F, Pre-Evaluation Skips): ⚠ **NO active-path source exists today.** The VTS versions come from the VTS runner's own null taxonomy; `strategy_internal` has **no active-path writer at all** (established in the prior batch). ⇒ these need **new active-path telemetry emitting the same taxonomy**, or they render as an explicit "not instrumented on this path yet" state. **NOT to be faked and NOT to be replaced with an invention.**

## 3. Objectives
1. **Delete the enforce early return; Paper/Live render the SAME 11 tables** as VTS from the shared component. Group A tables live immediately.
2. **Group B sourced from `signal_eval_archive`** using the **VTS row labels verbatim** — above all **"Net EV Below Floor"**, which must show the real NetEV count (8,479/24h at time of scoping), not a bucket.
3. **Tables 7/8 honest-state** where no active-path source exists, with the gap named on-screen; the instrumentation to fill them is scoped as its own objective or its own batch (decide with Langston at Step-2 — do not silently defer).
4. **ADD the two Paper/Live-only sections: SQE and RTB.** SQE = per-gate rejects with real names + pass/eval denominators. RTB = refresh cycle: attempted / reconfirmed / fell-out-with-reason / dropped-on-error / promoted, with the cycle identity.
5. **DELETE** `ActivePipelineTables`' invented tables and the "Pre-promotion + unrecognized tokens" label (rule 18 — remove, do not leave lingering). The per-strategy × per-stage attrition table survives ONLY if it maps onto a VTS-spec table; otherwise it moves under the SQE/RTB sections or goes.
6. **All six tabs verified on staging** — VTS crypto/xStock unchanged (regression check), Paper + Live crypto/xStock matching the spec table-for-table.

## 4. Non-goals
No engine/strategy/SQE/RTB behaviour change. No VTS-side behaviour change (VTS tabs are the reference and must come through visually identical — an explicit regression check, since the same component now serves all six).

## 5. Verification
Table-for-table diff of all six tabs against §1 (screenshot + DOM enumeration, not assertion) · the Net-EV row reconciled against a direct archive query · CI 4/4 · Langston Steps 1/2/4/8 · `dt-deploy --by CC-B` · §9.3 walk of all six.

## 6. Langston Step-1 verdict: APPROVED with FOUR RIDERS (2026-08-07) — folded here, binding

**What he re-derived himself rather than taking on report:** the failure mechanism at `vts-filter-diagnostics-panel.tsx:632-656` (the `enforce && modeTail` branch returns at `:653`; ★ **my own comment at `:629-631` says the inline enforce conditionals below are "now unreachable" — the file documented its own defect and I read past it**) · Group A at `fx5-scanner.ts:663 scanMode(mode)` + `:594` + route `vts.ts:1630-1634` (render job, not instrumentation — confirmed) · the Group B vocabulary **re-derived on staging: NetEV 8,529 · admitted 397 · RegimeWeight 1** (my 8,479 was the same structure hours earlier on a rolling window) · the tables-7/8 absence for BOTH classes.

**RIDER 1 — tables 7/8 are their OWN BATCH, ruled now.** Filed as **#662 `B-ACTIVE-NULL-TAXONOMY`, owner CC-B.** Reason: the emission is archive hot-path instrumentation inside the orchestrator's per-symbol loop — a different blast radius that would break this batch's `non_architecture` class. **This batch ships the honest not-instrumented state and NAMES #662 in its completion report.**

**RIDER 2 — label the POPULATION on the shared tables.** `getLastScanDiagnostics()` takes no mode argument: it holds the last scan of **whatever mode ran**, so with paper active the **LIVE tab's** shared tables will show PAPER's scan. `ScanDiagnostics` carries a `mode` field — **surface it in the section header so tab-mode is never silently implied to be scan-mode.** Also: the 24h rolling aggregate **straddles passive↔active transitions** (passive uses the `vts_quant` row, `fx5-scanner.ts:712-716`) — two filter populations in one aggregate; **annotate it**. (Same principle as his deploy-boundary ruling.)

**RIDER 3 — the Net-EV row classifier.** The sub-gate lives in free text (`gate_decision->>'reason'` = `"NetEV -0.011175 <= 0 (chosen maker mode…)"`). **Prefix-match is acceptable for display ONLY if pinned in a TESTED PURE FUNCTION**; the structured sub-gate token belongs on #662 so the UI stops parsing prose. **The query filters `asset_class` AND `mode` per tab.**

**RIDER 4 — tables 1/5/6 split:** cite the orchestrator's actual `archiveSignalEval` call sites at Step-2. **Already measured (§2 r2): `sourcePool` NULL on 8,550/8,866 active rows ⇒ those columns take the same honest-state treatment as 7/8, never an inference.**

**Process change on the reviewer's side, his words:** *a diff review cannot see a table that was never rendered* — for parity objectives his Step-4 now enumerates the spec's table list and **walks reachability per branch**, not diff coherence. The §5 DOM-enumeration acceptance test is what he will hold me to. **Board: B-FILTER-DIAG-PAPER's Review reset to SENT BACK TO OWNER** (his Approved did not survive Kyle's rejection and the board should not say it did); card moved off Complete by me.

## 7. ⛔ **r2 AMENDMENT RETRACTED — I READ AN ABSENCE AS MISSING DATA WHEN THE CODEBASE DEFINES IT AS A VALUE (2026-08-07, self-caught before building)**

**r2 claimed the quant/pattern lane discriminator "IS NOT RECORDED" because `features->>'sourcePool'` is NULL on 96.4% of active-path rows. THAT CONCLUSION IS WRONG.** The codebase's own helper defines the convention — `vts-runner.ts:271-272`:
```
function isQuantPool(sourcePool?: string): boolean {
  return !sourcePool || sourcePool === 'quant' || sourcePool.startsWith('quant-');
}
```
⇒ **ABSENCE *IS* THE QUANT MARKER.** Pattern-lane signals are explicitly stamped (`signal-orchestrator.ts:1994`, `:2028` set `sourcePool: 'pattern'`); xStock family lanes are stamped `xstock-<family>` (`eval-cycle.ts:423`); everything else is quant by definition. **The lane was recorded all along, in the way this system has always recorded it.**

**THE SPLIT, MEASURED WITH THE CODEBASE'S OWN CONVENTION APPLIED (24h, active-path sources):** `crypto_spot` **QUANT 8,658 · PATTERN 269** · `xstock_spot` **xstock-trend 45 · xstock-strong_trend 2 · QUANT 12**.

⇒ **CONSEQUENCES: (1) Tables 1/5/6's Quant/Pattern/Total columns are POPULATABLE TODAY — no instrumentation, no honest-state placeholder.** (2) **Langston's option-(a) approval is now UNNECESSARY WORK and is not being done** — stamping `sourcePool` on every active-path write would add a field whose absence is already meaningful; writing `'quant'` explicitly would ALSO be a silent semantic change to every existing `isQuantPool` reader. **Recommend: leave the write path alone entirely.** (3) The classification must go through **one shared tested pure function mirroring `isQuantPool`** (rider 3's requirement, now covering the lane as well as the NetEV token) so the UI and the engine cannot drift on what "quant" means.

★ **THE ERROR, NAMED: this is the absent-as-valid family (#546/#568) turned inside out — not "a missing input silently became a default", but "a meaningful default was read as a missing input." I filed a scope amendment, a reviewer ruled on it, and the ruling created work that the data never needed.** The check that would have caught it at measure time, and did catch it before any code: **before calling a field unrecorded, grep for a reader that interprets its absence.** A NULL with a documented reader is a value.

## 8. ★★ KYLE'S CORRECTIONS 2026-08-07 — BINDING, and they change the design in three places

### 8.1 "STANDARDIZED" — his definition, verbatim intent
*"The same displayed tracking metrics are on each tab for each trading type... I'm looking at the same information. The data may be feeding in from different tables and different scanners, and that's okay. I just still wanna see the same tracked metrics, organized in the same fashion."* ⇒ **the test is METRIC-FOR-METRIC and ORDER-FOR-ORDER, and the SOURCE is explicitly allowed to differ.** The one permitted structural difference: **VTS has no SQE, so the SQE section exists only on Paper/Live.**

### 8.2 ⛔ NET-EV LIVES IN A DIFFERENT PLACE ON EACH PATH — DO NOT MOVE THE VTS ONE
*"The VTS does its net EV check differently in a different part of the pipeline. The VTS does not have an SQE. So that's not where the net EV gate is... Leave the net EV scoring in the VTS filter diagnostics tabs where it is. But for the paper trading and live trading filter diagnostics tables, this has to go in the SQE section."*
**VERIFIED AT THE CODE, both sites:** VTS rejects at `vts-runner.ts:4917-4919` — `detailReason === 'net_ev_rejected'` → `vtsEvalCounters.rejectedReasons.netEvBelowFloor++`, a **post-signal rejection inside the VTS evaluation loop, with no SQE anywhere in it**. The ACTIVE path rejects **inside the SQE** (`gate_decision.reason = "NetEV … <= 0"`, `rejectStage:'sqe'`).
⇒ **VTS tab: Net-EV STAYS in Post-Signal Rejections. Paper/Live tabs: Net-EV appears in the SQE SECTION.** Same metric, same label, **different section per tab** — and that is not a standardisation violation, it is the pipeline's real shape. ⚠️ **My earlier plan to put the Net-EV row in the same place on all six tabs was WRONG and is withdrawn.**

### 8.3 ★ THE QUANT/PATTERN STAMP EXISTS AND SURVIVES — FOUND, as Kyle said it would be
*"That designation starts after pairs survive the filters… that stamp survives with those pairs even once signals are generated… you can see it in the open trades table, and in the closed trades table. So it's there. You're just not able to find it."* **He was right; I had only queried `signal_eval_archive.features` and concluded from that one table.** Found in three places, measured:
| Stage | Carrier | Measured |
|---|---|---|
| Scan / filter survival | the **shared scanner's own quant/pattern split** (`lastScan.quant` / `.pattern`) | already in the FD payload for every mode |
| Signal generation (VTS) | `pair.sourcePool` — **the VTS runner already splits its own counters by it** (`vts-runner.ts:4915`) | live |
| Open positions | `active_open_positions.source_pool` | **9/9 = 100%**: `xstock-trend` 7, `pattern` 2 |
| Closed trades | `closed_trades.source_pool` | 7 d: `xstock-trend` 59, `pattern` 11, `xstock-strong_trend` 1, null 16 |
**SIM confirms the design** (`SYSTEM_IMPACT_MAP.md:456-458`): the orchestrator is **dual-path** (quant pool / pattern pool) and *"Passes `sourcePool`, `signalType`, `assetClass` to SQE and RTB"*.
⇒ **THE ONLY REAL GAP is narrow and precise: the SQE-reject ARCHIVE WRITE does not copy the stamp** — `signal-orchestrator.ts:965` writes `features: { predictiveConfidence }` only, while `rawSignal.metadata?.sourcePool` is in scope right there (used at `:581`). **That one-field add is the whole fix for splitting the 8,529 NetEV rejects by lane.** ⚠️ Note `vts_open_trades.pool` = `rotational`/`ideal` is a **DIFFERENT axis** (the exploration lane), NOT quant/pattern — do not conflate.

### 8.4 THE SCANNERS ARE SHARED ACROSS MODES — so scan-stage metrics need no per-mode work
*"The scanner for crypto is the same across the VTS, across paper mode, across live mode. And the scanner for xStock is the same… So if we have it for the VTS, then we have it for the other trading modes as well."* Consistent with the mode-multiplex finding. ⇒ **every scan-stage table (Last Scan Filter Breakdown, 24h Rolling, Filter Metric Ranges, family IMF) renders on all six tabs from the same source.** R2's population header still applies — it says WHICH mode's scan, it does not imply a different scanner.

### 8.5 ANSWERING KYLE'S QUESTION — "which two, and is it being fixed?"
The payload keys carrying **VTS-runner-specific** numbers are **three**, and every one is addressed:
1. **`vtsEvaluation`** → By Strategy gets an active-path equivalent from `signal_eval_archive`; the **Setup Nulls / Pre-Eval Skips** sub-parts have **no active writer** → honest state + **#662**.
2. **`lastCycleVtsEval`** → no active per-cycle snapshot → honest state + **#662** (not synthesised from poll deltas).
3. **`signalRejections`** → the Net-EV carrier; on Paper/Live it is sourced from the archive and rendered **in the SQE section** per §8.2.
**Everything else in the payload is shared-scanner or mode-invariant and renders unchanged on all six tabs.**

