# P19-B8.5f — THE METADATA-REBUILD DROP: one root, three symptoms

change-class: architecture

**Phase:** 19 · **Owner:** CC-B · **Ledger:** `#549` + `#550` (+ the ATR-zero finding, `#548` dispatch) · **Sub-batch of:** the B8.5 switch-on arc
**Status:** Step-1 draft → Langston. No code written.

> **Supersedes the planned split.** `#549` (Open-Trades field population) and `#550` (max-hold never reaches positions) were scoped as two batches, B8.5f and B8.5g. They are **one defect with three symptoms** and share **one fix site**. Splitting them would be artificial. Combined here; B8.5g is retired into this batch.

---

## 1. The root, verified at the ref (not the dirty tree)

`server/services/signal-orchestrator.ts:1059-1077` builds the sized signal's `metadata` as a **fresh object from an explicit field list**:

```
metadata: {
  strategyWeight, exposureBias,
  admissionBasis, netEvAtAdmit, ...(exploration fields),
  assetClass,
  ..._displayContext,          // ← the ONLY spread
}
```

**It never spreads `rawSignal.metadata`.** So every field the strategy builder and the central stamps put on the raw signal is dropped at this line.

### Why this explains all three symptoms — including the one that looked inconsistent

| symptom | field | path | live result |
|---|---|---|---|
| `#550` max-hold never enforced | `maxHoldingMs`, stamped `:531` | on `rawSignal.metadata` ⇒ **dropped** | **0/15** |
| ATR-zero (see `#548` dispatch) | `atr`, set `:611` | on `rawSignal.metadata` ⇒ **dropped**; engine reads `?? 0` | **`'0'` on 15/15** |
| `#549` partial field population | `regime` etc. | rides `_displayContext` ⇒ **spread, survives** | **13/15** |

★ **The 13/15-vs-0/15 asymmetry was the tell.** Two different transit paths, not one flaky one. `_displayContext` is spread and survives; everything on `rawSignal.metadata` does not. The residual 2/15 missing `regime` is a *separate, smaller* cause — the conditional writes into `_dc` (`if (fx5Data?.pool) _dc.pool = …`), where an absent source leaves the key absent by design.

## 2. Bug taxonomy (rule 24) — these are NOT all the same outcome

**`maxHoldingMs` ⇒ outcome (1), a real defect.** `:526-531` states an explicit guarantee: the stamp *"Guarantees every active-path signal carries an unambiguous `metadata.maxHoldingMs` (milliseconds) **before it reaches the paper-execution enforcer**."* The rebuild silently breaks that guarantee. The comment also says *"Forward-prep only — active trading is OFF; this changes no live behavior today"* — written 2026-06-06. **Active trading is ON now.** The guarantee has become load-bearing and is not delivered.

**`atr` ⇒ outcome (2), a scope call — NOT fixed unilaterally.** P19-B6.5b (F5 / audit H14, `tec-evaluator.ts:251-268`) already built a deliberate, unit-tested hard-stop/target FLOOR for missing ATR. That is governed and working. Restoring `atr` would **re-activate the ATR trailing/break-even machinery that has never run on the active path** — a behavioural change to how trades exit, which is Kyle's decision, not mine. This batch **surfaces** it and does not switch it on.

**The 2/15 conditional-write gap ⇒ outcome (2)/(3).** Absent source data legitimately yields an absent field ("no fabrication" is the stated genesis-capture design). What is unaddressed is whether the *source* should have been present.

## 3. Objectives

- **OBJ-1 — Close the max-hold drop.** Make the documented `:526-531` guarantee true end-to-end: the stamped value reaches the position and the enforcer acts on it. **Verification: a named test that FAILS on the current rebuild**, plus live evidence that new positions carry a non-null value (today: 0/15).
- **OBJ-2 — Fix the carry mechanism, not the one field.** The defect is *"a curated rebuild silently drops its input."* Patching one field forward leaves the trap armed for the next one (this is the third instance of the class: `#530` DBS, `#549`, `#550`). Decide with Langston between an explicit carry-list with a **fail-loud assertion on known-required keys**, versus spreading `rawSignal.metadata` beneath the curated fields. ⚠️ The curation looks **deliberate** (the `_displayContext` comment reasons carefully about what transits), so a blind spread may defeat an intended fence — this is the batch's real design question, not a mechanical fix.
- **OBJ-3 — Surface the ATR consequence to Kyle as a decision.** Do not enable ATR trailing as a side effect. Written up, not shipped.
- **OBJ-4 — The residual 2/15 `regime` gap.** Determine whether the absent source is itself a defect or correct behaviour on thin data.

## 4. Out of scope
Enabling ATR-based trailing/break-even on the active path (OBJ-3 surfaces it; Kyle decides). The B6.5b floor — governed, untouched. B8.5e's staleness ceiling (blocked separately on the σ source).

## 5. Governance at Step-10
Tier 1: `BATCH_CATALOG`, `PHASE_HISTORY`, `PHASE_19_PLAN` (§1 + §5), `RUNNING_ISSUES` (`#549`, `#550` — and B8.5g retired into this batch), `MEMORY_CC_B`, completion report.
Tier 2: **`SYSTEM_MANUAL` APPLICABLE** (exit-path behaviour — a time-based exit begins actually firing). **`SYSTEM_IMPACT_MAP` APPLICABLE** (the orchestrator→position metadata transit contract). `CHANGES_AND_FIXES`.
