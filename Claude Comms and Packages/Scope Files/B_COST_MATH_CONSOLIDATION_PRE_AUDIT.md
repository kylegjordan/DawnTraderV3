# B-COST-MATH-CONSOLIDATION — PRE-AUDIT (Step 2)

**Owner:** Claude Analyst (CC-C) · **Step-2 GO given by Langston 2026-07-29 (UTC)** · **Step-2 APPROVED → Step 3, 2026-07-29 (UTC)** · change-class: **architecture**
> ⚠️ **DATE CORRECTED, and the cause is worth one line because it will recur.** This file first dated the GO **2026-07-30**; Langston flagged it as the 29th. **Both readings were correct in their own timebase** — the authoring machine is **CEDT (UTC+2)**, so it was `01:54 on 07-30` locally while UTC/Helsinki read `23:54 on 07-29`. **Governance uses UTC**, because every artifact a record is checked against — commits, CI runs, `system-alerts.jsonl`, the inbox log, Langston himself — is UTC-stamped. **Same instant, two names; the local date silently wins for ~2h every night.** Same family as the rest of this batch: *a matching name is not a matching thing.*
**Scope:** `B_COST_MATH_CONSOLIDATION_SCOPE.md` (rev3, `68009f6a4`) · **Bound: sites 5/6/7/8 — `startingBalance` on `portfolio_state`. One field, one table, one repair shape.**
**Refs pinned at:** `62051bce2`

---

## 🚨 PREVIOUSLY-STATED-VS-NOW (§9.2)
| | PREVIOUSLY | NOW | REASON |
|---|---|---|---|
| Site count | 3 (scope v1) → 5 (rev2) → 7 (rev3) | **8** | The census was re-scoped twice: by QUANTITY not PATTERN (rev2), then to **monetary** quantities not gross/cost/net (rev3). Site 8 is invisible to both greps — it is muted in `.tsc-baseline.json`, not cast. |
| Economically-correct cash | **$1,886.71** | **≈$1,931.66** | My first figure subtracted **all-time** realized (−$363.29 / 400 rows) against an anchor that is **not** all-time. 37 closes precede the 2026-07-16 anchor (−$44.95) and are already absorbed by it. Correct pairing: 363 post-anchor closes, −$318.34. |
| −$318.34 as "the display gap" | implied | **WITHDRAWN as a display figure** | Langston: it is computed over the **full table**; the screen computes over a **≤100-row window**. Two different sets. It is the *economics*, and the display gap is a **separate, un-run** calculation. |
| Site 7 disposition | "working-as-designed by accident" (rev3) | **wrong TODAY** | The live endpoint returns `realizedPnl 0` / `currentBalance 2250`. Langston's "the engine is off" premise was stale — it re-sessioned 2026-07-29T22:03:06Z. Moved to **#618**; the *repair* definition is unchanged. |
| `trade_mode='TARGET'` as the zeroing cause | proposed candidate | **REFUTED** | `getClosedTrades` has **no `trade_mode` predicate at all**. Tested, never announced (24.a). Recorded so nobody re-runs it. |

---

## 1. SIM CONSULTATION (§2 Step-2 MANDATORY — per component)

### 1.1 ★ GOVERNANCE GAP FOUND — `c5-financial-diagnostics.ts` IS ABSENT FROM THE SIM
**Measured: `SYSTEM_IMPACT_MAP.md` → ZERO hits. `SYSTEM_MANUAL.md` → 1 hit.**
**★ LANGSTON SHARPENED THIS AND HIS STATEMENT IS THE STRONGER ONE — adopted:** that single System Manual hit is **`:10148`, a row in a FILE-INVENTORY TABLE reading "Financial metric diagnostics."** That is **a filename in a list, not a description of behavior.** ⇒ the honest claim is not "under-documented" but **"UNDOCUMENTED, with a table row standing in for an entry."** A component can pass a `grep -c` and still have never been described — **a count is not coverage**, which is this batch's own recurring shape pointed at governance instead of code.
This component runs **three self-checks on the live money path**, is `isEnabled = true` with no caller ever disabling it, and is invoked on **every engine close**. It has **no SIM entry, no upstream/downstream map, and no blast-radius record.** Per §9 (*"If either file is silent on something the batch touches, that itself is a governance gap — flag it"*) this is flagged, and **the batch closes the gap** — a SIM entry is a Tier-2 deliverable here, not optional.
**Why it matters beyond bookkeeping:** the reason three broken checks survived is precisely that nothing pointed at them. A component absent from the map is a component nobody audits.

### 1.2 What the SIM DOES establish, and it is the load-bearing invariant (`SYSTEM_IMPACT_MAP.md:129-130`)
- **`portfolio-anchor-service.executeReanchor` is the SOLE `portfolio_state.balance` writer** — transactional (ledger row + balance + version together); `AnchorReason ∈ start_new | auto_divergence | launch_snap | measurement_override`.
- ✅ **INDEPENDENTLY GREP-VERIFIED, not taken from the doc:** `update(portfolioState)` appears in **exactly one file repo-wide — `server/services/portfolio-anchor-service.ts`.** ⚠️ **Honest limit stated at the time: that grep matches ONE shape (the Drizzle update builder) and does not exclude raw SQL.**
- **★ AND THE THING THAT LIMIT WAS HEDGING AGAINST TURNS OUT TO EXIST (Langston searched where I only flagged).** Raw `UPDATE portfolio_state`, repo-wide: **one hit — `drizzle/migrations/2026-07-15-p19-b8-5-portfolio-state-anchor-correction.sql:13`.** Migration-time, not a service ⇒ **`executeReanchor` remains the sole RUNTIME writer, and the fence must carry that qualifier.** "Only writer" unqualified is now a claim someone can produce a counterexample to — **so the fence asserts "sole runtime writer," and the migration is the named, sanctioned exception.** *(Lesson worth keeping: I named the limit of my evidence but did not then go look inside it. Flagging a gap is not the same as searching it.)*
- **"Ghost defaults are GONE"** — `portfolio_state.balance` and `active_engine_sessions.starting_balance` are NOT NULL with no defaults. ⇒ **the real starting balance lives on `active_engine_sessions`, which is exactly the table sites 5-8 do NOT read.**
- **`mode='continue'` never calls Kraken** ⇒ a continue-resume never re-anchors. **This is the mechanism behind #618 leg 1, confirmed from the SIM rather than inferred.**

---

## 2. §9.5 COMPONENT CENSUS — at every hop, not a path trace

### 2.1 `c5-financial-diagnostics.ts` — WHO CALLS IT (6 sites, 4 files)
| Caller | Method |
|---|---|
| `active-execution-engine.ts` | `logPnlReconciliation` (**site 4**), `logBalanceReconciliation` (**site 5**) |
| `active-engine-service.ts` | `logBalanceReconciliation` ×2 — `'session_start'`, `'stop_reset'` |
| **`signal-orchestrator.ts`** | **`logGuardrailInput` (site 6)** |
| `routes.ts` | `logAnalyticsScope` |
**★ SITE 6 IS CALLED FROM THE SIGNAL ORCHESTRATOR — the live signal path, not a diagnostics corner.** The always-green check sits on the path that sizes trades. That raises its priority above "a log line nobody reads."

### 2.2 `portfolio_state` — the five census questions
| Question | Answer | Note |
|---|---|---|
| **WRITES** | `portfolio-anchor-service.executeReanchor` **only** | grep-verified, one shape (see 1.2 caveat) |
| **READS** | **26 non-storage call sites** of `getPortfolioState` | wide blast radius — the repair must not change the returned shape |
| **MUTATES** | same as writes | transactional with the ledger |
| **DELETES** | *(none found)* — stated explicitly per rule 22 | an asserted absence; the grep found no delete against this table |
| **SCHEDULES** | no timer drives it; writes are event-driven (start_new / auto_divergence / launch_snap / measurement_override) | |

### 2.3 `.tsc-baseline.json` — enumerated BY PARSE, not by count (Langston's condition 2)
`files[5].path == server/routes.ts` · **42 distinct TS2339 entries / 66 total muted occurrences.**
On the `portfolio_state` row type: **`cryptoValue` ×2 · `cash` ×2 · `unrealizedPnl` ×1 · `realizedPnl` ×1 · `startingBalance` ×1 = 7** (42 − 7 = 35 out of scope).
⚠️ **CITATION CORRECTED (Langston):** an earlier draft wrote `startingBalance` **(`:131`)** as if the baseline carried source locations. **It does not — entries are keyed by FULL MESSAGE TEXT and there is no line-number field.** `:131` was the `grep -n` line **of the JSON file itself**, and I did not say so. **Assert on the MESSAGE KEY** (count = **1**, so removal is unambiguous), never on a line number.
⚠️ **AND THE "BASELINE SHRINKS BY ONE" ASSERTION HAS A FRAGILITY — state it whenever you assert it:** the key embeds the **entire inline `portfolio_state` row type**, so **any schema change to that table rewrites all 7 keys at once** and the delta stops being readable as "minus one." **The assertion is clean ONLY IF the schema type is untouched this batch** — which it is, and which the completion report must say rather than assume.
**IN-BATCH: only `startingBalance` (site 8).** The other 6 are triaged and enter **only** if they sit inside a monetary computation; **the remaining 35 TS2339 entries in that file are explicitly NOT this batch's problem** and must not become it.

---

## 3. LANGSTON'S THREE STEP-2 CONDITIONS — carried, with the method for each

1. **MUTATION-PROVE the C5 checks. ★ AND POLARITY DECIDES THE DIRECTION** — the correction that supersedes my own Risk 4:
   - **Site 5 is permanently RED** ⇒ making it go red proves **nothing**. Load-bearing proof = **goes GREEN on honest input.**
   - **Site 6 is permanently GREEN** ⇒ mutation-proof **is** the entire test.
   - **Both directions required for every repaired check; the scope names which is load-bearing for each.** A check verified only in its already-stuck direction has not been verified.
2. **Baseline triaged BY PARSE** — done above (§2.3), by `json.load`, not by counting.
3. **Step-8 claims BIT-IDENTICAL REFACTOR ONLY.** No correctness proof rides along. The balance-correctness proof is **#614's separate item**; the display-gap figure is **#618's**.

---

## 4. ★ THE NAMED CHECK — earned by two wrong numbers in one night, both mine
> **BEFORE QUOTING ANY TWO FINANCIAL QUANTITIES TOGETHER, STATE THE SET EACH IS COMPUTED OVER.**

1. Subtracted **all-time** realized against a **non-all-time** anchor ⇒ $1,886.71 (double-counted 37 pre-anchor closes).
2. Paired a **full-table** figure with a **≤100-row display window** ⇒ quoted −$318.34 as a display gap.

**This goes in as a CHECK, not a lesson** — a lesson is something you remember, a check is something you run.
**★ SCOPE CORRECTED (Langston, and the correction is the interesting part).** An earlier draft listed his own baseline error as a third instance. **He declined the credit and was right to: his was a PARTIAL READ ASSERTED AS A TOTAL (#453) — a different failure with a different fix.** Folding it in would have made this check *look like it covered ground it does not*, which is how a sharp check degrades into a vague one. **Two instances, one shape, and the check is sharper for the subtraction.** *(#453's own rule — an asserted absence needs presence-evidence — already covers his case and stays where it is.)*

---

## 5. BLAST RADIUS & RISKS
1. **26 readers of `getPortfolioState`** — the repair changes *how a field is read*, never the returned shape. Any change to the shape is out of scope.
2. **★ Site 8's silent `'0'` fallback becomes site 7's explicit 409 — a REAL behavior change, NAMED, not smuggled.** An unfunded/absent state that currently renders `0` will instead refuse. That is correct (a fabricated zero is the ghost-default class B8.2 already killed elsewhere) but it is a behavior delta and the completion report must say so.
3. **Repairing a self-check wrongly SILENCES a real alarm rather than creating a visible error.** A check that always passes is strictly worse than one that always fails — only the second gets investigated. Mitigated by condition 1.
4. **The anti-double-count invariant needs a SOURCE FENCE, not a comment:** assert `executeReanchor` remains the only writer, mutation-proved. #614's obvious fix (make `balance` track realized P&L) would break the correct arithmetic in sites 7/8 — **a comment would not have survived it.**
5. **`c5` has no SIM entry** ⇒ any future batch touching it inherits the same blindness. Closing the gap is in scope.

## 6. VERIFICATION PLAN
- **Equivalence sweep on the ENGINE path**, not just display: all four outputs recomputed for every closed trade under old and new code, **zero divergences** (the 298/298 method).
- **Both-direction proof per repaired check**, load-bearing direction named.
- tsc delta ZERO, measured stash/count/pop. ⚠️ **Also assert the baseline SHRINKS by exactly the `startingBalance` entry** — a repair that leaves the mute in place has not removed the phantom read.
- CI 4-green; §9.3 UI on the affected tabs — **and per the 2026-07-29 lesson, state each affected column's RENDERED POSITION and the table width; "it renders" is not "a human can see it".**
- ⚠️ **The screen will still read $2,250 after this ships.** That is the expected, correct outcome of an honesty repair and must not be reported as a failure — nor as a fix.

## 7. GOVERNANCE (Tier-1 + Tier-2)
BATCH_CATALOG · PHASE_HISTORY · PHASE_19_PLAN §1/§5 · **SYSTEM_MANUAL** (the cost model + the F1-F4 provenance resolution, incl. F2's retired four-component composition) · **SIM — the new shared component, its callers, AND the missing `c5-financial-diagnostics` entry (§1.1)** · RUNNING_ISSUES (#614, #618 cross-refs) · MEMORY_CC_C · this file.
