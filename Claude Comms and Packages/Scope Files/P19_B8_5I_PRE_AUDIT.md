# P19-B8.5i — PRE-AUDIT (Step-2)
## The trailing master switch: TWO flags (VTS + active)

**Batch:** P19-B8.5i · **Issue:** #562 · **change-class:** architecture (per scope header)
**Owner:** CC-B · **Scope:** `P19_B8_5I_SCOPE.md` (Langston Step-1 APPROVED, 2 conditions)

---

## ⚠️ HONESTY NOTE — WHY THIS FILE IS DATED AT CLOSE, AND WHY THAT MATTERS

**This pre-audit was written at batch close (2026-07-23), not before implementation. That is a process
miss, and it is not cosmetic — it is causally connected to the batch's one real failure.**

The batch ran as: Step-1 scope (approved, with two pre-audit findings recorded *inside the scope doc*) →
implementation → Langston Step-4 → **red CI** → revert → re-apply → close. There was never a standalone
Step-2 pre-audit artifact, so **the test blast-radius census below was never performed before code was
written.** Had §9.5(a-ii) been applied at Step-2 — *enumerate every consumer of the thing you are changing*
— the "a new `requireKey` is consumed by every DB-mocking TEC test" fact would have surfaced as a
prediction rather than as a CI failure. The first attempt seeded **1 of 8** required test rowsets.

**The completion report also declared `non_architecture` while this scope header declares `architecture`.
The scope header governs (it is what Langston reviewed and what the governance checker grades); the
completion report has been corrected.** Declaring a *lower* class at close, unreviewed, is backwards.

Everything recorded below is real work that was performed — most of it during the re-apply trace — but it
is written down after the fact, and it is labelled as such rather than presented as foresight.

---

## 1. COMPONENT CENSUS AT THE CHANGE SITE (§9.5(a))

**The change site:** `isMoonbagQualifier` (`server/services/trailing-exit-controller.ts:499`).

| Census question | Answer (repo-wide grep, tests excluded) |
|---|---|
| Who **calls** it? | **Exactly one** live consumer: `tec-evaluator.ts:309`. The reference at `trailing-exit-controller.ts:834` is a *passed-in parameter* ("the caller's upstream check"), not an internal call. Stated explicitly per rule 22 — an asserted single-caller needs presence-evidence. |
| Who **writes** the governing state? | The DB row set, via `refreshTECConfigForClass` → `requireKey` (`:465-466`). No runtime default. |
| Who **reads** the governing state? | `resolveTECConfig(assetClass)` consumers — the exit path only. |
| Who **schedules** work against it? | `primeTECConfig()` at boot (hard-fail) + the 60s lazy TTL refresh. No other scheduler. |
| Who **deletes**? | Nothing. Additive batch. |

**Mutual exclusion:** not applicable — one chokepoint, one caller, one config cache.

## 2. THE ENTRY-POINT ENUMERATION THAT MATTERED (and was done late)

`useTrailing: true` is hardcoded at **three** sites, not two:
`active-execution-engine.ts` (ACTIVE) · `vts-runner.ts:2976` (VTS real) · `vts-runner.ts:3701` (**VTS shadow**).

The shadow pass **must** resolve the same VTS flag as the real pass: its own comment at `:3694` marks
`maxHoldMs` as *the only* exit-math parameter permitted to differ. A second divergence would make every
shadow comparison silently invalid **while still looking healthy**. This is why Kyle's two-flag ruling put
the VTS sites *in scope* rather than declaring them out (which was Langston's Step-1 Condition-1 option A).

**Decision: the three hardcodes stay UNCHANGED.** Gating at the chokepoint achieves the same control with
one edit instead of three, and cannot drift between the sites.

## 3. THE STATE-WRITE / READER CENSUS (§9.5(a-ii)) — THE ONE THAT WAS MISSED

Adding a `requireKey` does not just add a key; it **adds a precondition to `primeTECConfig`, which every
DB-mocking TEC test invokes.** The consumer set is therefore *all TEC test fixtures*, not just the one
being edited:

`b65-tec-parity` · `trailing-exit` · `b79-tec-per-class-cache` (**3 separate seed blocks**) ·
`b80-tec-per-trade-keying` · `b-new-40-tec-refresh-hang` · `b-new-42-tec-split-resilience` ·
`b-new-42-tec-halt-resilience` · `b79-0n-tec-b-strict-hardfail`

**⚠️ `b79-0n-tec-b-strict-hardfail` is special and must not be blanket-seeded:** its whole purpose is
asserting per-key hard-fail. Seed **only** `FULL_ROWS` (the valid-config fixture) and leave the
`control.omitKey` mechanism untouched, or cases (b)/(c) are neutered.

**Seed value is load-bearing, not cosmetic:** pre-flag, qualification was allowlist-only, so `true` is the
*behaviour-preserving* value wherever a fixture models an enabled config. `b-new-42-tec-split-resilience`
imports `evaluateTECExit` and asserts a `TRAILING_TAKE` outcome — seeding `false` there would have failed
it. `false` is correct only in the two pure-boot fixtures that never exercise qualification.

## 4. `ALL_TEC_KEYS` — REGISTRY, NOT RUNTIME DRIVER

`ALL_TEC_KEYS` (`:400`) has **exactly one consumer**: the `(e)` tripwire in `b79-0n-tec-b-strict-hardfail`,
asserting the valid-config fixture covers it *exactly*. `requireKey` never consults it.

⇒ **Any new TEC key must be registered there or CI fails both ways** — seed the fixture and `(e)` fails on
the extra keys; don't seed and `(a)` fails on the missing ones. The Langston-approved `21db08228` had
`requireKey`d both keys *without* registering them, which is exactly the contradiction the tripwire exists
to catch. **TEC governed keys 11 → 13.**

## 5. BEHAVIOUR-NEUTRALITY SURFACE (OBJ-3)

The persisted close label chain, traced end to end:
`trailing-exit-controller.ts:1225` sets `closeReason='target_hit_no_trailing'` →
`tec-evaluator.ts:373-375` **converts** it to `exitReason:'target_hit'` →
`active-execution-engine.ts:1581-1587` → writer `:1801` persists `closeReason: 'target_hit'`.

⇒ `target_hit_no_trailing` is a **purely internal discriminator** and never reaches storage or analytics.
Today (empty allowlist) and after (flag seeded false) converge on the *same* `:1225` branch, the same
persisted label, and identical denial log text. **Zero observable delta** — which is the acceptance test.

## 6. THE LIVE CONTROL IS NOT IN THE CODE

`trailing-exit-controller.ts:135` (`TEC_DEFAULTS`) is explicitly *"test fixture seeding + type inference
only"* — **not** the live control, despite being repeatedly cited as such (including by me, to both Kyle and
Langston). The governing value is the DB row (`requireKey('moonbag_qualifying_strategies')`, ~`:444`),
measured live as `[]` on all four asset classes with `break_even_enabled=false` on all four.

## 7. SIM / SYSTEM MANUAL IMPACT

- **SIM:** the TEC governed-key set changes (11 → 13) ⇒ a content update is required. *(Landed.)*
- **System Manual:** the exit-control surface gains a second mechanism ⇒ the two-mechanism structure and its
  precedence must be documented, or the overlap is undiscoverable — which is Langston's Step-1 Condition-2.
  *(Landed at close; it was missed in the first governance pass and the checker caught it.)*

## 8. BLAST RADIUS

**LOW for behaviour** (additive, seeded off, one chokepoint, no exit-math change).
**MODERATE for CI** (a new `requireKey` touches every DB-mocking TEC fixture) — the one that bit.
**Deploy ordering is the real risk:** `requireKey` hard-fails boot if the rows are absent ⇒ the migration
**must** be applied and verified *before* any restart. (This is the B8.5e outage lesson; it was followed.)
