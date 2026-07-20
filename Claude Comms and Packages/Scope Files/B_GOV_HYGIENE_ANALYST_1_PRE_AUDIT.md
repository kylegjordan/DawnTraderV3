# B-GOV-HYGIENE-ANALYST-1 — PRE-AUDIT (Step 2)

**Batch:** `B-GOV-HYGIENE-ANALYST-1` · Phase 19 · owner CC-B · change-class `non_architecture`
**Ledger:** `#547` (`4b75323cf`) · **Scope:** `B_GOV_HYGIENE_ANALYST_1_SCOPE.md` (`aa274b3d1`, Q1 resolution `3051d2a33`, census `f15e83e25`)
**Step-1 status:** APPROVED by Langston — *"No blockers. Scope approved to proceed to Step-2 with the three guardrails."*

---

## 🚨 HEADLINE FINDING — OBJ-3 AS SCOPED WOULD CRASH THE SERVER AT BOOT

**The scope said:** the floor-LIFT consumer was deleted at reorg-B2.1; **the DB row survives** and still reads like a live 4% rule ⇒ delete the row (rule 18, document-then-delete).

**Three claims. Two are TRUE. The disposition built on them is UNSAFE.**

| Claim | Verdict | Evidence |
|---|---|---|
| The floor-LIFT is removed | ✅ **TRUE** | `signal-target-normalizer.ts:87-94` — `const lifted = false; const targetPrice = nativeTarget;` with the reorg-B2.1 OBJ-1 rationale in comment |
| `floorPct` is unused in the computation | ✅ **TRUE** | comment states *"`floorPct` is now unused — retained on the input type only until OBJ-5 retires this helper"*; no arithmetic use anywhere in the file |
| It is an **orphaned DB row** | ❌ **FALSE** | it is a **live, REQUIRED, boot-asserted read threaded through 5 code sites** |

### The chain the scope did not know about (census, §9.5(a) form, tests excluded)

```
module_constants (DB row, seeded 2026-06-20-reorg-b2-per-class-roi-target.sql)
  └─ expectancy.ts:208   getCachedNumberRequired('expectancy_gates','target_floor_pct')   ← REQUIRED: THROWS if absent
       └─ getPerClassTargetGate() returns { floorPct, minRR, reachAtrMax }   (expectancy.ts:204)
            ├─ signal-orchestrator.ts:1448        floorPct: _b2Gate.floorPct     → normalizer
            ├─ vts-runner.ts:1536                 floorPct: _b2Gate.floorPct     → normalizer
            └─ xstock_spot/eval-cycle.ts:682      floorPct: _b3xGate.floorPct    → normalizer
                 └─ signal-target-normalizer.ts:40   floorPct: number   (input type — ACCEPTED, then DISCARDED)
  └─ b72-warmup.ts:278   BOOT ASSERTION over ['…','target_floor_pct','min_rr','reach_atr_max']
```

### ⛔ Why "just delete the row" is a production-down change

`b72-warmup.ts:274-287` iterates `crypto_spot` **and** `xstock_spot` and **throws** on a missing constant:

> `[reorg-B2][warmup] expectancy_gates.target_floor_pct for asset_class='<class>' missing — migration … has not been applied. Apply migration before starting server.`

**Deleting the DB row without first removing the boot assertion halts server startup** — and the error message actively misdirects the next reader, telling them to apply a migration that *has* been applied. This is rule 18's "certainty before cutting" earning its keep: the blast-radius trace changed the disposition, not just its paperwork.

### ✅ REVISED OBJ-3 — an ORDERED five-site removal, DB row LAST

1. `signal-target-normalizer.ts` — drop `floorPct` from the input type (`:40`) + the two doc lines (`:13`, `:18`) + the now-stale retention note (`:91-92`)
2. the three call sites — `signal-orchestrator.ts:1448`, `vts-runner.ts:1536`, `xstock_spot/eval-cycle.ts:682`
3. `expectancy.ts` — drop `floorPct` from the return type (`:204`) and the required read (`:208`)
4. `b72-warmup.ts:278` — drop `'target_floor_pct'` from the boot-assert list ← **must precede step 5**
5. **only now** the DB row: forward migration + rollback + `MANIFEST.txt` register

**Order is load-bearing.** Any sequence putting the row-delete before step 4 fails at boot.

### ⚠️ OPEN QUESTION FOR LANGSTON — the successor-intent thread

The retention comment names its own successor: *"retained on the input type only until **OBJ-5 retires this helper into the shared guard**."* **I have NOT established whether that OBJ-5 landed, is pending, or was superseded.** If the helper is scheduled for retirement anyway, removing `floorPct` piecemeal now may be work that the retirement deletes wholesale. **Not asserting either way — flagging that the disposition may belong inside that retirement rather than beside it.**

### What Analyst got right, precisely

The **misleading-appearance** claim is fully vindicated and is the real defect: a seeded `0.040` row, a boot assertion protecting it, and three call sites forwarding it **all read as a live 4% rule**, and it is not one. That it cost review time once — misleading Analyst into filing a false defect — is exactly the argument for removal over annotation. **Only the mechanism was wrong, and the mechanism is what determines whether the fix is safe.**

---

## OBJ-2 — Langston guardrail (a): does an actual-fill gross EXIST?

**Status: PARTIALLY ESTABLISHED — proceed with caution.**

The trade record carries the needed field names — `intendedEntryPrice`, `actualEntryPrice`, `targetExitPrice`, `actualExitPrice`, `entryFee`, `exitFee`, `totalFee`, `grossPnl`, `entrySlippage`, `exitSlippage` — so an actual-basis gross is **conceptually** computable.

⚠️ **But on a live OPEN row sampled 2026-07-20, `intendedEntryPrice`, `actualEntryPrice` and `targetExitPrice` were all `null` while `entryFeeRate` was populated (`0.008`).** Null on an open row may be entirely correct (nothing filled yet). **I have NOT yet verified population on CLOSED rows, which is the population the ratio actually consumes.** Langston's guardrail (a) is therefore **NOT yet discharged** — the fix depends on the denominator being *available*, not merely well-defined. **Next action: measure non-null rates for the actual-price fields across closed rows before any code.**

Guardrail (b) — the intended-price gross must keep living as its own measure — is accepted and carried into Step-3 as a named constraint.

## OBJ-1 — Langston guardrail: confirm the surface ANALYST actually loads

Ruling: land in `CLAUDE.md`, **separately and sooner**, not folded into `#545`/`#339` unless those land in the same window. Step-3 must confirm the target is the `CLAUDE.md` the analyst session **actually loads** (repo root — the sole canonical copy per §4), not the nearest one. Structural form (`admissionBasis` split surfaced **by default**) attempted first; note is the fallback, and Step-3 states which and why.

## OBJ-4 — Langston guardrail: a LOCKED decision, not a deferral

Decide-and-document confirmed correct. **The output must be an actual decision — build / stop-gap / don't — and if "build", a named + dated home AT THAT MOMENT.** Explicitly to be weighed at Step-3: whether a **minimal append-only capture halts the bleed** short of a full `STORAGE_POLICY.md` review — but that is itself a schema call and belongs **inside** the OBJ-4 decision, not smuggled beside it. Guard against decide-and-document decaying into document-that-we-will-decide.

## OBJ-1-CENSUS — failed query vs empty result

Carried from scope (`f15e83e25`); **not yet run.** Enumerate every tab rendering a count or collection; per tab, state whether a FAILED query is visually distinguishable from a GENUINELY EMPTY one. Prior work: the shared client fetch **throws** on non-200 (`client/src/lib/api.ts:103-107`, catch re-throws at `:111-113`) — so Langston's original coercion hypothesis is disproven at that layer; the residual is per-component swallowing. 31 error-handling occurrences across 12 components. **Unproven in both directions — a grep count is not a census.**

---

## Governance applicability (judged, not defaulted)

`SYSTEM_MANUAL.md` — **NOT applicable** (no architecture / strategy / regime / filter / signal-pipeline / math change). Stated rather than skipped, per §9 anti-pattern; **re-confirmed after the OBJ-3 finding**, since the removal touches the signal path: it removes a value that is provably *never used in any computation*, so no documented behaviour changes.
`SYSTEM_IMPACT_MAP.md` — **APPLICABLE** (OBJ-3 removes a component surface across 5 sites). `DELETED_COMPONENTS_LOG.md` — **required** for OBJ-3. `STORAGE_POLICY.md` — only if OBJ-4 lands a retention decision.

---

## ⚠️ COORDINATE CORRECTION 2026-07-20 — I MEASURED THIS PRE-AUDIT AGAINST A DIRTY SHARED WORKING TREE

**Caught by Langston at Step-2 review.** Every `path:line` in the original revision was read from my local working tree, which carried **another session's uncommitted edits** (OLD Claude's in-flight `B-REGIME-INPUTS-LIVE` work on `signal-orchestrator.ts`). Proof:

```
$ git status --porcelain -- server/services/signal-orchestrator.ts
 M server/services/signal-orchestrator.ts          <- +60 lines of someone else's uncommitted work
$ git show origin/migration/aws-supabase:...       ->  1448:  floorPct: _b2Gate.floorPct,   <- THE REF
$ grep -n ... server/services/signal-orchestrator.ts ->  1508:  floorPct: _b2Gate.floorPct,   <- MY TREE
```

**REF-VERIFIED COORDINATES** (`origin/migration/aws-supabase`, read with stderr NOT suppressed):

| site | ref line |
|---|---|
| `server/services/signal-orchestrator.ts` | **1448** ← was wrongly cited as 1508 |
| `server/services/vts-runner.ts` | 1536 ✓ |
| `server/asset_classes/xstock_spot/eval-cycle.ts` | 682 ✓ |
| `server/core/calculations/expectancy.ts` | 204, 208 ✓ |
| `server/startup/b72-warmup.ts` | 278 ✓ |
| `server/core/calculations/signal-target-normalizer.ts` | 13, 18, 40 ✓ |

**★ THE HONEST READING — five of six were right BY LUCK, NOT BY METHOD.** They happened to sit in files no one had dirtied. **The method was wrong for all six**; only one file being dirty is what limited the damage. A method that is correct only when nobody else is working in a shared tree is not a method.

**★ THIS IS `#545` RULE 2 VERBATIM — "VERIFY AT A COMMITTED REF, NOT THE WORKING TREE — a shared tree has no version identity" — which I helped land into governance THE SAME MORNING, cited approvingly, and then broke in the very next document I wrote.** Recorded here rather than silently corrected, because the failure is the useful part: it is the second time in one day I applied a discipline once and did not carry it to the next instrument. **The control you just ran does not immunise the next check.**

**Also relevant:** while re-measuring, the `.claude/hooks/guard-governed-read.mjs` PreToolUse guard **BLOCKED** my re-measurement command for suppressing stderr on a `git show` (rule 22's mechanical enforcement). It was right to. That is the type-level-over-prose argument working on its own author, twice in one session.
