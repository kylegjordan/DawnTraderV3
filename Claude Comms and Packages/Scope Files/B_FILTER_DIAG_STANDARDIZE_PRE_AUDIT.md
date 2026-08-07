# B-FILTER-DIAG-STANDARDIZE — Pre-Audit (Step 2)

**Owner:** CC-B · Scope r4 `a3510b9e3` (Langston Step-1 APPROVED + 4 riders; r2 retracted and his re-verification of the retraction received).

## 1. PROVENANCE — why the early return exists, and why it is now legacy (§2 1.b, rule 24 outcome 3)

**The code documents its own history** (`vts-filter-diagnostics-panel.tsx:625-631`): the enforce early-return was introduced by **B8.4c** as a deliberate replacement for B8.3b's inline `enforce` conditionals, on the premise that *"everything downstream … is WIRED but DORMANT until paper-active turns on (B8.5), rendered as an explicit 'awaiting activation' state — NEVER 0 (dormant != zero, MUST-2)"*, and it explicitly says the inline conditionals below *"are now unreachable on Paper/Live and **get swept when Part 2 wires the funnel counters**"*.

**DISPOSITION — (3) legacy that no longer fits current intent, adapt it.** The intent was CORRECT for its era: with the active path dormant, letting the Paper tab fall through to the shared tables would have rendered **VTS-runner numbers under a Paper heading** — worse than a placeholder. **The premise expired at the B8.5 switch-on** (active-paper live since 2026-07-14) and **the promised sweep never happened**. This is not a mistake someone made; it is a correct guard whose condition ended, left standing. ⚠️ **It is NOT disposition (1)** — keeping it means Kyle's six-tab standardisation cannot exist.

**Consequence for the design, from the same comment:** the early return was built *"fully independent of the VTS `data`/`isLoading` props"*. Removing it makes the enforce path **depend on `data`** — verified available: `vts-tabs.tsx:163-177` (`CryptoFilterDiagnosticsTab`) and `xstocks-tab.tsx:249-250` both issue their fetch **unconditionally** and pass `data` down whatever the disposition. **No new plumbing required.**

## 2. THE IMPLEMENTATION MAP — what deleting the early return actually exposes

Removing it un-hides four `gateDisposition === 'tag'` blocks that have been **unreachable dead conditionals** (`:889`, `:1137`, `:1424`, `:1604`). They were written to hide VTS-runner data from Paper — correct then, and now the precise decision points:

| Block (tag-gated today) | VTS source | Enforce treatment |
|---|---|---|
| `:889` VTS Evaluation Metrics | vts-runner counters | **active-path equivalent** from the funnel tracker + archive |
| `:1137` Last-cycle VTS funnel | vts-runner per-cycle | **active-path equivalent**; if per-cycle granularity is absent → honest-state |
| `:1424` VTS Evaluation 24h (By Strategy) | vts-runner | **active-path from `signal_eval_archive`** (per-strategy, class+mode filtered) |
| `:1604` Setup Nulls / Pre-Eval Skips | vts-runner null taxonomy | ⛔ **no active writer → honest not-instrumented state; #662 fills it** |

**Untouched and simply RENDERED for enforce (Group A, no gate today, currently unreachable only because of the early return):** Last Scan Filter Breakdown · 24h Rolling Aggregates · Reward-vs-Risk / Reachability Gate · Filter Metric Ranges ×2.

## 3. Rider obligations carried into implementation
- **R2 population labelling:** `getLastScanDiagnostics()` takes no mode arg ⇒ with paper active the **Live tab's shared tables show PAPER's scan**. Surface `ScanDiagnostics.mode` in the header of every shared table. Annotate the 24h aggregate as straddling passive↔active (passive used the `vts_quant` row, `fx5-scanner.ts:712-716`).
- **R3 one shared tested pure function** owning BOTH the NetEV free-text classification AND the lane classification (mirroring `isQuantPool`, `vts-runner.ts:271-272`) so UI and engine cannot drift. Queries filter `asset_class` AND `mode`.
- **R1/#662:** tables 7/8 ship the honest state; #662 named in the completion report.
- **Lane split is LIVE data, not a placeholder** (r4 retraction, Langston-verified): crypto QUANT 8,658 / PATTERN 269; xStock `xstock-trend` 45 / `xstock-strong_trend` 2 / QUANT 12.

## 4. Blast radius
Client panel + the read-only endpoints already fetched + one shared classifier module + tests. **Zero engine/trade-path surface. No migration.** ⚠️ **REGRESSION RISK, the one that matters:** the same component now serves all six tabs, so **the two VTS tabs must render byte-identically** — an explicit verification objective, checked by DOM enumeration against the §1 spec table list, not by assertion.

## 5. Legs before Step-3 — ALL SETTLED
1. ~~Per-cycle granularity on the ACTIVE path~~ — **MEASURED AND SETTLED 2026-08-07.** The two stages differ and the tabs must say so:
   - **SCAN stage: per-scan granularity EXISTS and is already mode-correct.** `fx5-scanner.ts:336 getLastScanDiagnostics()` returns the last scan, and the scanner is mode-multiplexed ⇒ **Last Scan Filter Breakdown and Filter Metric Ranges render for enforce with no new work** (Group A confirmed a second way).
   - ⛔ **FUNNEL stage: the S22 funnel tracker has NO per-cycle snapshot** — `active-funnel-tracker.ts` is **cumulative-since-`_startedAt` ONLY** (SIM S22 design, Langston re-confirmed).
   ⚠️ **CORRECTION — MY ORIGINAL EVIDENCE LINE WAS A FALSE MEASUREMENT (Langston, rule 29(b); #593 recurrence).** I cited a whole-tree grep for `lastCycle|perCycle|cycleSnapshot|resetCycle` returning nothing. That grep was **BRE — the unescaped `|` is a LITERAL**, so it searched for the quoted string itself and *could not* have matched. **Re-run correctly by me, four separate greps: `lastCycle` 7 files · `perCycle` 3 · `cycleSnapshot` 1 · `resetCycle` 0 — and the broken original still returns 0, which is the positive control proving it was the artifact.** A correct conclusion resting on an instrument that fails its own control does not stand in a governed doc.
   ★ **WHAT THE WORKING INSTRUMENT FOUND — and its disposition:** a REAL per-cycle mechanism DOES exist on the active path — `aj18-rtb-diagnostic.ts` `cycleSnapshots` (500-deep), session-started at `active-execution-engine.ts:518`. **It is nevertheless NOT usable here, for a reason I verified myself rather than taking on report: `aj18-rtb-diagnostic.ts:406` computes `strategiesEvaluated: this.currentCycleStats.symbolsEvaluated * 9` — a HARDCODED 9 against the 19-strategy SSOT.** Its taxonomy is also not the S22 funnel's. ⇒ **honest-state + #662 stands, now on true evidence.** ⇒ **`:1137` (Last-Cycle Funnel) takes the HONEST NOT-INSTRUMENTED state on Paper/Live**, alongside tables 7/8, and the per-cycle emission joins **#662**'s scope rather than being faked from a cumulative delta.
   ★ **Why not synthesise it from successive polls:** two reads of a cumulative counter give a POLL-WINDOW delta, not a SCAN CYCLE — they coincide only if the poll and the scan are phase-locked, which nothing guarantees. Labelling a poll delta "Last Cycle" would be a lookalike, the same substitution class as the lane inference already rejected in scope r4.
2-3. ~~Data-shape enumeration~~ — **DONE. THE COMPLETE PAYLOAD MAP, measured against the live endpoint** (`/api/vts/filter-diagnostics`, 11 top-level keys). **THREE keys carry vts-runner data** (`vtsEvaluation`, `lastCycleVtsEval`, **and `signalRejections`** — Langston's count-vs-set catch: my earlier sentence said TWO while my own table listed three), **plus `tradesOpened24h` needs an active source**; everything else is shared or mode-invariant. **Implement from the table, not from any summary sentence:**

| Payload key | Feeds | Source | Enforce treatment |
|---|---|---|---|
| `lastScan` | Last Scan Filter Breakdown, Metric Ranges | shared scanner, **mode-multiplexed** | **render as-is** (label the scan's own `mode`, R2) |
| `rolling24h` | 24-Hour Rolling Aggregates | shared scanner | **render as-is** + straddle annotation (R2) |
| `guardDrops` | Reward-vs-Risk / Reachability Gate | guard-eval tracker, **mode-invariant** | **render as-is** |
| `signalRejections` | **Post-Signal Rejections → the Net-EV row** | vts-runner (`{"total":4,"byReason":{"Net_EV_Negative":4}}`) | ★ **active equivalent = the archive: NetEV 8,529/24h.** Same display label **"Net EV Below Floor"** verbatim. **This is Kyle's answer.** |
| `tradesOpened24h` | Trades Opened rows | DB-backed, already `{total, quant, pattern}` | active equivalent from the active-path opens |
| `vtsEvaluation.byStrategy` | By Strategy table | vts-runner | active equivalent from `signal_eval_archive` (class+mode filtered) |
| `vtsEvaluation.nullReasons` / `nullReasonDetail` / `patternNullReasonDetail` | Setup Nulls A–F, Pre-Eval Skips | vts-runner taxonomy | ⛔ **honest not-instrumented → #662** |
| `lastCycleVtsEval` | Last-Cycle Funnel | vts-runner per-cycle | ⛔ **honest not-instrumented → #662** (leg 1) |

⇒ **The enforce branch supplies an ACTIVE-LANE object of the same shape rather than letting a block reach for a VTS-only field** — so the shared blocks stay source-agnostic and the VTS tabs are untouched by construction (the regression risk in §4 is contained by this, not merely watched).
**Note on the VTS label vocabulary:** VTS keys the reason `Net_EV_Negative` and DISPLAYS "Net EV Below Floor". The active row uses the **display label verbatim**; only the underlying count differs. Kyle's standardisation is satisfied at the label, not just the layout.

## 6. Step-2 verdict: APPROVED TO PROCEED (Langston, 2026-08-07) — conditions binding on Step-3/4

- **(a) same-shape object APPROVED with three conditions.** (i) **The shape is pinned by a SHARED TYPESCRIPT TYPE/ENVELOPE consumed by both branches** (the `active-funnel-envelope` pattern) — *"untouched by construction is only structural if the compiler enforces it"*, and it retires his reliance on my endpoint-key enumeration, which he could not re-derive live (auth-gated) and would otherwise have marked RULED ON REPORTED FACT. (ii) ⛔ **Absent instrumentation travels as null/absent SENTINELS that render the honest state — NEVER `?? 0`.** A same-shape object is precisely the structure that invites zero-filling, and an absent value wearing a plausible number's clothes is the #546 class. (iii) the count-vs-set fix above.
- **(b) label-verbatim RATIFIED as the reading of "standardized"** — *"Kyle compares tabs by what he reads; same fields, same display is satisfied at the label or not at all."* Two riders: the shared label comes from the **R3 classifier** so UI and engine cannot drift; and because the same label will sit over populations **three orders of magnitude apart (4 vs 8,529)**, the **R2 mode/population header is LOAD-BEARING, not cosmetic** — it is what stops this standardisation from itself becoming a lookalike.
- **(c)** nothing further to measure. **Step-4 gate:** the shared-type pinning + sentinel discipline are verified at review, not asserted.

