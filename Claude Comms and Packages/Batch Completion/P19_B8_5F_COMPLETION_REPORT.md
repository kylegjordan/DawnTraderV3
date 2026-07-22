# P19-B8.5f — COMPLETION REPORT

**Batch:** `P19-B8.5f` (the metadata-rebuild drop) · **Ledger:** `#549` + `#550` · **Owner:** CC-B
**Code:** `58d8f8f94` · **Governance:** `33e304763`, `8c58428f1` · **CI:** run `29914908229`, **all 4 GREEN**
**Deployed:** staging 2026-07-22 11:16Z, HTTP 200 · **Langston:** Step-1 ✅ Step-2 ✅ **Step-4 APPROVED at ref** ✅

> ## 🚨 THIS BATCH IS **SHIPPED, NOT CLOSED.**
> **OBJ-1's carry is UNIT-proven and deployed, but NOT yet proven in production.** At deploy time all 15 open positions **predated the deploy**, so `maxHoldingMs` was absent on 0/15 **by expectation, not by failure** — the fix only affects positions opened after 11:16Z. A verification alert is armed (fires 18:00Z) carrying the exact query and an explicit **REOPEN B8.5f** instruction if a post-deploy position still lacks the value. **Do not mark this batch closed until that fires green.**

---

## 1. Scope objectives — status

| OBJ | Status | Evidence |
|---|---|---|
| **1 — close the max-hold drop** | ✅ shipped, ⏳ live-unproven | `maxHoldingMs` carried at the rebuild; `:3143` spreads it onto the position. Fence test fails pre-fix. |
| **2 — fix the carry MECHANISM, not the field** | ✅ | `SQESignalInput.metadata` narrowed from `Record<string, unknown>` to `SQESignalMetadata` with `maxHoldingMs` **required** ⇒ omission is a **compile error**. |
| **3 — surface the ATR consequence, ship nothing** | ✅ | `atr` deliberately NOT required and NOT restored. Written up below as a Kyle decision. |
| **4 — the residual 2/15 `regime` gap** | ⏳ carried | Separate, smaller cause (conditional `_dc` writes where an absent source legitimately yields an absent key). Not addressed here; stays on `#549`. |
| **5 — close-reason label (NEW, from the pre-audit)** | ✅ | `max_holding_period` → `MAX_HOLD`; RISK-035 re-rated RESOLVED. |

## 2. What the batch actually established

**One root, three symptoms.** `signal-orchestrator.ts` builds the sized-signal metadata as a **fresh object from an explicit field list** and never spreads `rawSignal.metadata`. So `maxHoldingMs` and `atr` died there while `regime` survived — it rides `_displayContext`, which *is* spread. **The 0/15-vs-13/15 asymmetry was two transit paths, not inconsistent data quality**, which is how I had been reading it. `#549` and `#550` therefore shared one fix site; `B8.5g` was retired into this batch rather than split artificially.

**The time-exit had never once fired.** 0 of 15 positions carried a limit and there are **0 `max_holding_period` closes in the entire `closed_trades` history**. The stamp's own comment promised the value would reach the enforcer, and also said *"active trading is OFF — changes no live behavior today"* (2026-06-06). **It is ON now: a dormant forward-prep guarantee had quietly become load-bearing and nobody re-checked it.**

## 3. ★ The pre-audit's catch — invisible from the diff, and it would have shipped

System Manual rated **RISK-035 "LOW"**: the time-exit maps its close reason to `'UNKNOWN'`. **That rating was only ever true because the exit never fired.** OBJ-1 makes it fire ⇒ the first visible effect of this batch would have been a wave of trades closing as **"UNKNOWN"** in the trade tables — a fresh truthfulness regression in the exact surface B8.10 existed to fix. Paired fix shipped as OBJ-5.

**Transferable lesson, recorded in the System Manual:** *a risk rated LOW **because a code path is dormant** is a live risk the moment that path is repaired.* Re-read dormancy-justified ratings whenever the dormancy ends.

## 4. ★ Kyle decision owed — ATR trailing (OBJ-3, NOT shipped)

`atr` is dropped by the same rebuild, so `atr_at_open` is **`'0'` on 15/15 positions**. **This is NOT a defect to fix silently.** P19-B6.5b already governs it with a deliberate, unit-tested hard-stop/target **FLOOR** for the missing-ATR case. Restoring `atr` would **re-activate ATR trailing/break-even machinery that has never run on the active path** — a behavioural change to how trades exit.

⚠️ **New fact for that decision:** B6.5b's comment frames missing ATR as an edge case (*"e.g. a position opened without a stamped `atr_at_open`"*). Live it is **100%** — the floor is carrying every position permanently, not catching a rare case.

## 5. Verification — the fence property was PROVEN, not asserted

- **5 new tests pass on the fix and ALL 5 FAIL** when the pre-fix sources are checked out from origin into the bench and re-run. *A test that passes either way proves nothing about a silent drop.*
- **tsc baseline gate:** no regressions above baseline.
- **Full suite:** pre-fix baseline **10 failed files / 219 passed / 2350 tests** → with the change **10 / 220 / 2355**. The 10 are pre-existing bench DB-connection failures — **established by running the suite against pre-fix sources, not by assuming they looked unrelated.**
- **Blast radius enumerated:** exactly ONE production construction site of `SQESignalInput`.
- **Post-deploy:** HTTP 200; **zero `MAXHOLD_STAMP_MISSING`** on live traffic (the backstop firing would mean the central stamp is being bypassed).

**⏳ Outstanding:** live-carry confirmation (§ banner) and the §9.3 UI check, which cannot show a `MAX_HOLD` row until a time-exit actually fires.

## 6. Langston's review points (recorded at the artifact, not left in chat)

- **`MAX_HOLD` over `TIME_EXIT`** — ruled correct, and it is **§16 canonical-terms governance**, not preference: the system's own `max_holding_period`/`maxHoldingMs` vocabulary beats the industry paraphrase.
- **The throw is not too aggressive** — he traced whether it could refuse a *legitimate* signal and proved it cannot: `stampMaxHoldingMs` always assigns a positive finite value earlier in the same function, and the VTS never enters this build path. It fires only on an `as any`/JSON bypass.
- **Known divergence, flagged not blocking:** the stamp accepts an `isFinite` value that is `≤ 0`, while the throw requires `> 0`. A strategy explicitly stamping `0`/negative would trip it — but that value is genuinely invalid and fail-loud is defensible.
- **Process:** push-then-review was resolved as correct here — a frozen ref is *why* his line citations are trustworthy; an uncommitted diff on the shared tree would have measured against a moving tip. **The deploy gate stayed behind his sign-off, which is the part that matters.**

## 7. Governance files changed
`1-system-manual/SYSTEM_MANUAL.md` (RISK-035 RESOLVED + the priority-4 exit row true-in-fact + the close-reason map) · `1-system-manual/BATCH_CATALOG.md` · `1-system-manual/PHASE_19_PLAN.md` · `1-system-manual/RUNNING_ISSUES.md` (`#549`/`#550` addenda; B8.5g retired) · `.claude/memory/MEMORY_CC_B.md` · this report.

## 8. Credit where the design changed
**CC-A (OLD Claude)** supplied the correction that reshaped OBJ-2: an assertion list is *itself* a hand-maintained allow-list — the same kind of object that failed here — so the first design moved the problem up a level instead of solving it. The typed-contract answer came from that push, using the B4a precedent already in the file.
