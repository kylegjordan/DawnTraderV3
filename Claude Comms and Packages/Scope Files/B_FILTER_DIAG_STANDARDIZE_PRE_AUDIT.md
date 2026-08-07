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

## 5. OPEN legs before Step-3
1. Per-cycle (last-scan) granularity on the ACTIVE path — does an equivalent of the VTS last-cycle funnel exist, or is `:1137` honest-state? **Measure, do not assume.**
2. Confirm the `admitted`-by-source split does not disturb the VTS tabs' own row semantics when the shared component renders both lanes.
3. Enumerate the exact prop/data shape each un-hidden block needs, so the enforce branch feeds it rather than the block reaching for VTS-only fields.
