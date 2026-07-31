# B-GOV-DEADLINE-WINDOW-SYMMETRY — Completion Report (#605)

**Owner:** CC-B · **change-class:** `non_architecture` · **Date:** 2026-07-31
**Scope:** `Scope Files/B_GOV_DEADLINE_WINDOW_SYMMETRY_SCOPE.md` · **Pre-audit:** `Scope Files/B_GOV_DEADLINE_WINDOW_SYMMETRY_PRE_AUDIT.md`
**Code:** `d756e5fc5` (fix) → `6b2a6e2ef` (review fixes ①②) → `79694e34d` (review fix ③)
**CI:** run `30544854328` at `79694e34d` — **4/4 green**, confirmed job-by-job (Build · Test Suite · TypeScript Check · Docker Build).
**Suite:** 92 passed / 0 failed, with **three mutation proofs**.

---

## 0. 🚨 VERIFICATION STATUS — READ THIS BEFORE CITING THIS REPORT

> ✅ **VERIFIED ON A LIVE ALERT 2026-07-30 — see RESULT below. The CLEAR-PATH is proven end-to-end; the PIN ITSELF rests on mutation-proved unit fences plus a dated follow-up, and that distinction is deliberate.**
> The self-clearing falsifier is **this batch's own deadline alert** (`f7eeb547-7028-41f5-9b55-fad88fd723a2`, currently `acknowledged`). **Filing this report is the trigger:** it should make the checker resolve that alert **by itself on the next tick, with nobody touching it.**
> ✅✅ **RESULT — 2026-07-30T23:39:19Z, tick `ExecMainStatus=0`: THE SUBJECT RESOLVED UNAIDED AND THE CONTROL HELD.**
> **SUBJECT** `B-GOV-DEADLINE-WINDOW-SYMMETRY` → **`resolved`** — the checker cleared its own alert once the docs landed at `GOV_REF`, with **no human action**.
> **CONTROL** `B-REGIME-INPUTS-LIVE` (genuinely unclosed, no completion report on disk) → **`acknowledged`, NOT resolved** ⇒ **no cry-silence; the fix did not over-reach.**
> **INSTRUMENT + POPULATION, stated per rule 29(a):** the **whole** alert store, **467 rows parsed, not a tail** — ⚠️ **the first attempt at this check used an 80-row tail and its control was ABSENT from the window, i.e. unevaluable. The population is the fix.**
>
> ⚠️ **AND WHAT THAT PROVES — held to exactly what was written BEFORE the result:** it proves the **clear-path is live end-to-end on a checker-minted alert**. It does **NOT** prove the *pin* fired — **this batch was IN the 300-commit window, so it would have cleared via the ordinary window write regardless of the fix.** **Proving the pin needs a closed batch whose governance has AGED OUT, which cannot be manufactured on demand** (~days at current push rate). ⇒ **the pin's own behaviour rests on the three MUTATION-PROVED unit fences (§2), not on this live pass. Recorded as a dated follow-up rather than claimed.**

## 1. Objectives vs outcome

| # | objective | outcome |
|---|---|---|
| OBJ-1 | Census every `hasGovernance` reader **before** changing how it is set | **YES.** Exactly one production consumer (the deadline gate) + the propagation guard; everything else is test fixtures, zero under `server/`. The code asserts it itself. **Downgraded from a gate to a paragraph by Langston once he re-derived it.** |
| OBJ-2 | Anchor the clear-condition, mirroring the existing pin | **YES.** `hasGovernance` pinned under the existing `closed && !reopened` guard in `anchorClosedBatches`. |
| OBJ-2b | ★ Langston-required: re-propagate child→parent **after** the pin | **YES**, and placed **inside** `anchorClosedBatches` so a future second caller cannot forget it. |
| OBJ-3 | Fences that fail before they pass | **YES — three, all mutation-proved** (see §2). |
| — | Cry-silence: `B-REGIME-INPUTS-LIVE` still alerts | **YES** (fenced; never-closed ⇒ never pinned). |
| — | Live verification on a real alert | **NO — OUTSTANDING.** See §0. |

## 2. Mutation proofs (a fence that passes with the fix reverted asserts nothing)

| mutation | result |
|---|---|
| Revert the pin | **3 FAIL** — the defect fence + both parent fences |
| Keep the pin, remove **only** the re-propagation | **2 FAIL** — exactly the two parent-satisfaction fences ⇒ **Langston's required addition independently demonstrated load-bearing** |
| Drop the `!reopened` guard | **3 FAIL** — both new re-open assertions + the pre-existing OBJ-3 assertion |
| Restored | **92 passed / 0 failed** |

## 3. What this batch got wrong, recorded because the corrections cost more than the fix

1. **Skipped Step 2.** No pre-audit before implementation — **and the audit's blast-radius section is exactly where the #508 near-miss would have been caught.** Langston caught it at Step-4 instead. Declared at the top of the pre-audit rather than backfilled silently.
2. **Fused two defects.** #605 (in-window re-mint) and the orphan-sweep gap were asserted as one mechanism in one paragraph — **they are mutually exclusive** (a stranded orphan *cannot* re-mint; its key never leaves the cache). Split to **#625**.
3. **A falsifier aimed at an unreachable case.** Targeted a batch with **zero commits in the 300-commit window**, where the alert cannot clear pin-or-no-pin. **Read as a refutation, it would have withdrawn a correct fix.** ⇒ recorded on **#625** as a test-design trap, next to the code that causes it.
4. **Position-citation, four times:** a stale head sha in a dispatch; pre-image line numbers in the new `poller.mjs` comment; **eight more in `poller.test.mjs` — while writing "don't re-add line numbers" into the other file of the same commit**; and standing down from this batch entirely on a window-grep that matched *"filed by CC-A"* instead of the `OWNER:` field. ⇒ **content-sha over head · symbol + greppable quote over line · read the field, not a grep near it.**
5. **An unevaluable control.** The first falsifier's control batch was absent from the 80-row window sampled — **a control checked with an instrument that could not see it.**

## 4. Governance files changed
`RUNNING_ISSUES.md` (#605 · #625 filed · #621 leg added, owner CC-A named) · `BATCH_CATALOG.md` · `PHASE_HISTORY.md` · this report · the scope · the pre-audit · `poller.mjs` · `poller.test.mjs`.
**SIM:** applicable — checker state derivation; updated at close. **System Manual:** not applicable (no trading architecture/strategy/regime/pipeline/math change).

## 5. Related, deliberately NOT folded in
**#625** — deadline keys are never orphan-swept, so an **out-of-window** closed batch's alert sticks forever. Different mechanism, different signature, survives this fix untouched. **#621** — the checker self-pulls review-branch HEAD unreviewed every 30 min (owner CC-A). **#594** — next in sequence.
