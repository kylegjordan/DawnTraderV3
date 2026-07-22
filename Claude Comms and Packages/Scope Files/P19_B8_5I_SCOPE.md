# P19-B8.5i — TRAILING EXIT: GIVE THE DECISION A VISIBLE SWITCH

change-class: architecture

**Phase:** 19 · **Owner:** CC-B · **Ledger:** `#562` (corrected) · **Kyle directive 2026-07-22:** *"we've gotta separate this functionality and trailing exits needs its own on off switch"*
**Status:** **Step-1 APPROVED by Langston with TWO CONDITIONS (both accepted, folded in below).** No code written.

---

## 1. What this batch is, in one paragraph

**Nothing is broken.** Trailing exits are OFF because Kyle decided that on 2026-05-05 (ablation variant **K = `no_BE_no_trail`**), and they are correctly off today. The problem is that **the two halves of that one decision were implemented in two different shapes**: break-even got a per-class DB boolean an operator can flip (`breakEvenEnabled`, with a code comment that literally says *"Operator-flip via DB UPDATE when ready to re-enable"*), while trailing got an **empty eligibility list** (`moonbagQualifyingStrategies: []`). An empty allowlist reads as configuration DATA, not as an off switch. This batch gives trailing a control in the SAME shape as break-even's, **without changing behaviour**.

**★ THE COST OF THE CURRENT SHAPE IS DEMONSTRATED, NOT HYPOTHETICAL.** Investigating this, CC-B produced **three wrong statements in sequence** — "trailing has no off switch at all" → "the allowlist blocks everything" → "the allowlist blocks the ladder specifically" — and filed two of them in the ledger (`#562`, `#556`), where they had to be retracted. **Kyle could not reconcile it either** and had to direct the re-investigation. A control that two readers independently misread is a discoverability defect regardless of whether the behaviour is right.

## 2. Verified current mechanism (traced at `origin/migration/aws-supabase`, terminal-statement level)

| site | fact |
|---|---|
| `trailing-exit-controller.ts:135` | `moonbagQualifyingStrategies: []` // *"variant-K-aligned per Kyle 2026-05-05"* |
| `:466-474` | `isMoonbagQualifier` returns **false** when the strategy is not in the list |
| `:1155` | qualified ⇒ enter ladder (`TRAILING_TAKE`, rung 1, ratchet). **NOT qualified ⇒ `closeNow=true`, `closeReason='target_hit_no_trailing'`, log "moonbag denied: strategy-not-qualified"** |
| `tec-evaluator.ts:294` | `if (input.useTrailing && input.atr > 0)` — the **OUTER** gate |
| `tec-evaluator.ts:309` | `moonbagQualified` computed **INSIDE** and passed as an **input**, not an early return |
| `active-execution-engine.ts:1364` | `useTrailing: true` — a **hardcoded literal**, not config |

⇒ **With the list empty, every trade closes at its target and the ladder is unreachable.** ⇒ **Restoring `atr` does NOT enable trailing** — `#556`'s coupling claim is WITHDRAWN.

## 3. Objectives

- **OBJ-1 — a 12th DB-governed TEC key, `trailingEnabled`, per asset class**, seeded to **preserve today's behaviour exactly** (off), sitting beside `breakEvenEnabled` and honouring the same HARD-FAIL-on-missing-row discipline (`refreshTECConfigForClass`). **No runtime fallback** (§5 / the B79.0n.TEC TYPE-TEMPLATE-ONLY rule).
- **OBJ-2 — gate trailing on the FLAG at ALL THREE production sites; demote the data to a precondition.** `atr > 0` remains a *data* requirement (you cannot ratchet without volatility) but must stop being the de-facto switch. **★ LANGSTON CONDITION 1 — `useTrailing: true` is hardcoded in THREE runtime sites, not the one my scope named:** `server/services/active-execution-engine.ts:1364` (named), **`server/services/vts-runner.ts:2976` and `:3701` (MISSED)**. Wiring the flag to one literal and leaving two identical ones feeding the same input **is OBJ-4's defect one level down**: today it is behaviour-neutral (the empty allowlist blocks the ladder on every path, so OBJ-3 still passes), but **the moment an operator flips `trailingEnabled` expecting "trailing on", one path obeys and two do not.** ⇒ **the flag gates all three, OR the scope declares the VTS path out-of-scope with a stated reason AND a §13 scheduled home. Silent is not an option — that is this batch's entire thesis.** **★ HOW I MISSED IT, recorded because it is the second instance today of the same mechanism:** my grep returned **16 matching lines and I displayed 12** (`| head -12`). The two production sites were inside the four I truncated. **Not a reasoning failure — a display limit I set myself, which silently produced an incomplete census.** Same class as #559 (a `timeout` default manufacturing a false absence): **a tool default is an editorial decision about what evidence you look at, and it fails silently.** ⇒ **for any CENSUS grep, print the complete result or state the count you truncated.**
- **OBJ-3 — BEHAVIOUR-NEUTRALITY IS THE ACCEPTANCE TEST, not a hope.** A named test must prove that with the flag off and the allowlist empty, the exit decision is **byte-identical** to today for both the qualified and unqualified branches. **If behaviour changes, the batch has failed** — this batch is not authorised to alter when trades exit. **★ LANGSTON: the bar is the right KIND; widen the COVERAGE — three strengthenings, accepted:** (1) **assert on the emitted `closeReason` STRING** (`target_hit_no_trailing`), not merely the close boolean — **downstream analytics and ML training key on the reason**, so a correct close carrying a changed reason is still a corruption; (2) prove neutrality at the **CALL-SITE INTEGRATION for BOTH the active AND VTS paths**, not only the `tec-evaluator` unit — **VTS exit decisions are training data, and a silent shift there corrupts the corpus invisibly**; (3) drive the test through the **config-load/seed path**, so a wrong seed value is caught by the test rather than by production.
- **OBJ-4 — the allowlist's disposition, decided WITH Langston, not assumed.** Two controls for one decision is the smell that caused this. Options: (a) keep both, flag as master switch and the list as per-strategy selection *within* an enabled state (my lean — it preserves the variant-K record and the future per-strategy grain); (b) migrate the list's intent into the flag and retire it (§18 no-lingering). **Do NOT silently leave two overlapping controls — that recreates the defect one level up.** **★ LANGSTON CONDITION 2 — (a) is agreed, but ONLY if the overlap is made SELF-DOCUMENTING, or it literally recreates the defect it warns about:** the flag's semantics (**master; false ⇒ nothing trails regardless of the list; true ⇒ the list selects**) must be documented at **BOTH** control sites, and **`moonbagQualifyingStrategies`' comment must be rewritten** from *"variant-K-aligned"* to state its NEW **subordinate** role. (b)/§18-retire remains defensible but loses the future per-strategy grain for little gain.

> **★ KYLE STANDING DIRECTIVE (2026-07-22, relayed by ANALYST): _"right now I don't want the trailing exits function at all be turned on. We're not ready."_ This batch SATISFIES that by construction — the flag seeds OFF and OBJ-3 makes behaviour-neutrality the pass/fail condition. Turning trailing on remains a Kyle calibration decision, explicitly out of scope below.**

## 4. Out of scope
Turning trailing ON (a Kyle calibration decision, not an engineering one). Break-even's flag or its state. The ATR carry (`#549`/`#550`/`#561` family). Moonbag ladder mechanics, rung maths, concurrency caps.

## 5. Governance at Step-10
Tier 1: `BATCH_CATALOG`, `PHASE_HISTORY`, `PHASE_19_PLAN`, `RUNNING_ISSUES` (`#562`, and `#556` marked withdrawn), `MEMORY_CC_B`, completion report.
Tier 2: **`SYSTEM_MANUAL` APPLICABLE** (exit-path control surface). **`ADJUSTMENT_FRAMEWORK` APPLICABLE** (a new DB-governed per-class parameter). `SYSTEM_IMPACT_MAP` (TEC config contract). `CHANGES_AND_FIXES`.

## 6. Provenance (Kyle-directed read, recorded so it is not re-litigated)
`BATCH_CATALOG.md:221` — B73.3 names the ablation variants; **K = `no_BE_no_trail`**, triggered by Kyle's 2026-05-04 observation. `trailing-exit-controller.ts:100-124` carries the dated break-even chronology: seeded false 05-08 (B79.TEC) · xstock true 05-11 (B79.0m.b) · **reverted false by `kyle-directive-2026-05-21-disable-xstock-be` at 05-21 16:26 UTC** · re-synced 05-26 (B79.0n.TEC). **The decision is Kyle's and stands; this batch changes only how it is expressed.**
