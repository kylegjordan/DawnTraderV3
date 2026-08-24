# B-OBSERVATION-EPOCH — PRE-IMPLEMENTATION AUDIT + IMPLEMENTATION PLAN

> **Owner:** Claude Analyst (CC-C) · **change-class: non_architecture**
> ⛔⛔ **WRITTEN AFTER IMPLEMENTATION, 2026-08-24. THIS IS NOT A PRE-AUDIT AND MUST NOT BE READ AS ONE.**

---

## 0. THE HONEST HEADER — WHY THIS DOCUMENT EXISTS AND WHAT IT IS NOT

**A pre-audit's entire function is to GATE implementation.** This one did not: the code shipped first
(`8088b49be`), and the governance checker raised `Missing required governance doc: pre_audit` — **correctly.**

⇒ **This document records the analysis that WAS genuinely performed, and states plainly which parts of it
happened before the code and which after.** It is a repair of the record, not a reconstruction of a gate.
**Backdating it would be worse than the original miss**, because the checker's alert is the only
independent signal that the step was skipped, and a plausible-looking document silences that signal.

| the analysis | before or after the code? |
|---|---|
| Finding that the epoch mechanism ALREADY EXISTED (`getLifetimeScoreboard`'s `module_constants` row) | **BEFORE** — and it changed the design: I had begun designing an epoch COLUMN |
| Kyle's decoupling ruling (balance reset and score reset are separate acts) read out of the existing comment | **BEFORE** |
| The straddler measurement (11 closes / 4 both-leg / 7 straddlers; $19.14 vs $8.47) | **BEFORE** — it is what made both-leg keying a decision rather than a fall-out |
| The consumer census — *which readers resolve an epoch?* | ⛔ **NEVER DONE. THIS IS THE MISS**, and it is exactly what §9.5(a) exists to force |
| The two anchor-record defects (3 stale docs; no v4 row in `portfolio_anchor_events`) | **BEFORE** |

## 1. ⛔ THE CENSUS THAT WAS NOT RUN — AND WHAT IT WOULD HAVE CAUGHT

§9.5(a) requires a **COMPONENT CENSUS AT EVERY HOP, not a path trace**: *who writes, who reads, who
mutates, who deletes, who schedules.* For this batch the census question was **"who READS an
observation epoch, or would need to?"**

**I traced forward from ONE reader** (`computeRollingEarnings`, the one whose defect I had found) **and
stopped at the first sufficient explanation** — the precise failure §9.5(a) describes.

**Had the census been run, it would have returned FOUR:**

| reader | keying it actually used | caught by the census? |
|---|---|---|
| `computeRollingEarnings` (`dashboard-metrics.ts`) | both-leg ✅ | the one I traced |
| `getLifetimeScoreboard` (`storage.ts`) | close-keyed ❌ | **would have been found** |
| `/active-engine/trades/analytics` window (`routes.ts`) | unscoped ❌ | **would have been found** |
| the same route's empty-window branch | unscoped, over the FULL set ❌ | **would have been found** |

⇒ **The entire `B-EPOCH-KEYING-PARITY` batch is the cost of this omission**, and it was found only because
Kyle redirected me to the right page at Step-7. **A grep for the epoch constant name would have taken a
minute and returned all four.**

## 2. SYSTEM IMPACT MAP + SYSTEM MANUAL

**SIM:** consulted. **No component added, removed or re-keyed** — the epoch is a `module_constants` row
read by existing services, so there is no new node for the map. **Judged NOT applicable, and the
judgement is stated rather than skipped by default.**

**SYSTEM MANUAL:** **NOT applicable.** Score-keeping window selection is not architecture, strategy logic,
regime detection, filter design, signal pipeline or quantitative math.

⚠️ **A GOVERNANCE GAP THE BATCH SURFACED AND DID NOT FIX** (§9 requires flagging it either way): three
governed docs (`RUNNING_ISSUES:1682`, `BATCH_CATALOG:428`, `SIM:131`) still assert paper **2250.00/v3**
against a live **v4/824.11**, and **`portfolio_anchor_events` has NO v4 row at all** — a UNIQUE
`(mode, anchor_version)` index means it is genuinely absent, so **the anchor audit trail has a hole at
its most recent change.**

## 3. BLAST RADIUS

**Display only.** No order path, no sizing, no gate. ⛔ **ONE EXCEPTION, and it is the one that matters:**
the epoch **resets the kill-switch numerator** — the drawdown memory starts empty, so the daily-loss
budget is fresh. **That moves risk, and it is Kyle's to ratify explicitly rather than inherit as a side
effect** (Langston). Surfaced to him in those words.

**Reversible:** delete the `module_constants` row ⇒ the implicit first-trade epoch returns. Nothing is
deleted or rewritten; the pre-fix history is retained in full and remains available for the
conditional-outcome analysis Kyle explicitly wants to keep.

## 4. THE LESSON, RECORDED WHERE THE NEXT PRE-AUDIT WILL FIND IT

**A batch that introduces a NEW SHARED VALUE must census its CONSUMERS before writing the first one.**
The rule I was applying — *trace the defect you found* — is sufficient for fixing a defect and
structurally insufficient for introducing a concept. **`B-EPOCH-KEYING-PARITY` (#900, #901) is the
remediation, and the parity fence it homes is the mechanism that makes the census unnecessary next time.**
