# B-COST-MATH-CONSOLIDATION — SCOPE

change-class: architecture

**Owner:** Claude Analyst (CC-C) · **Kyle-directed 2026-07-29**: *"For the 3 copies of the cost arithmetic, scope them fully including looking into the history and historical intent."*
**★ First scope written under the new CLAUDE.md §2 MANDATORY 1.b (provenance read).** The provenance section below is not decoration — **it changed the batch's shape twice** and is the reason this is `architecture`, not a refactor.

---

## 1. PROVENANCE READ (§2 MANDATORY 1.b) — TIER 1, the arithmetic whose behaviour this batch changes

**Corpora searched, NAMED (evidence standard, amendment B):**
| Corpus | Result |
|---|---|
| `BATCH_CATALOG.md`, `RUNNING_ISSUES.md` (by symbol `Phase 8.8.3-C2`, by phrase "cost transparency"/"cost breakdown") | **EMPTY — no hits.** Recorded as a measured empty read, not inferred absence. The formula predates the governance ledger. |
| `git log -S`, **NOT path-limited** (amendment C — the `active-*` family was renamed at P19-B-RENAME 2026-07-03; path-limiting would have returned nothing) | **HIT — origin found.** |
| `bridge/canonical/` (pre-governance corpus — mandatory, this predates the 2026-01/02 governance change) | **HIT — the design invariants found.** |

### 1.1 Origin — quoted verbatim, not summarised (amendment B / #452)
**`a4b34acce` — 2025-12-11 19:26:31 +0000** (Replit-era, Agent-authored):
> "Improve trading profit and cost calculations for better accuracy
> Update the paper execution engine to correctly calculate and store gross P/L, total costs, net P/L, and associated percentages, **aligning with new data models and directive requirements**."

**`2807c2360` — 2025-12-12 09:24:53 +0000** (next day, SAME Replit session `4ce4eda7…`) — **this is the commit that created the second copy:**
> "Fix trade cost calculations and balance display for manual closes
> Corrects the `/paper-sim/close-trade/:id` endpoint to accurately calculate exit slippage, fees, and total cost…"

⇒ **The duplication was DELIBERATE SYNCHRONISATION, not accident.** The manual-close path was copied from the engine one day later specifically so the two would agree. **The intent — "these must produce identical numbers" — is still valid today. It is the IMPLEMENTATION (copy-paste) that fails that intent, because copies drift and demonstrably have.**

### 1.2 ★ THE CANONICAL INVARIANTS — and the contradiction that explains everything
`bridge/canonical/DawnTrader_System_Invariants_Design_Guarantees.md` §2, verbatim:
- **F1 (§2.1):** `grossPnl = (actualExitPrice - actualEntryPrice) × quantity` — *"actualEntryPrice includes entry slippage · actualExitPrice includes exit slippage · Gross P/L does NOT include fees"*
- **F2 (§2.2):** four components — Entry Slippage *"Added to entry price"*, Exit Slippage *"Subtracted from exit price"*, Entry Fee, Exit Fee.
- **F3 (§2.3):** `totalCost = entryFee + exitFee + entrySlippage + exitSlippage` ; `netPnl = grossPnl - totalCost`
- **F4 (§2.4):** *"Slippage MUST always work against the trader… **There is no 'positive slippage' in the simulation model**."*

**⚠️ F1 + F2 + F3 ARE INTERNALLY INCONSISTENT AND DOUBLE-COUNT SLIPPAGE.** F2 puts slippage INSIDE the actual prices; F1 computes gross FROM those actual prices; F3 then SUBTRACTS slippage AGAIN. **The original design document cannot be satisfied as written.**

**This is the single most valuable thing the provenance read produced, because it explains the drift instead of merely dating it.** Anyone implementing F1+F3 faithfully would produce a double-count, notice the numbers were wrong, and have to pick one to abandon. **The code picked F3 and silently abandoned F1** — computing gross against INTENDED prices, which makes the F3 slippage deduction arithmetically correct (it telescopes; verified 293/293 pre-change). That resolution was *locally* rational and *undocumented*, and it is precisely the state B-COST-ACCOUNTING-HONESTY found.

### 1.3 What this does to the two changes already shipped
- **★ Kyle's directive is CORROBORATED by F1 — it is NOT AUTHORISED by it (Langston Step-1 correction 2, ACCEPTED).** An earlier draft of this scope said the directive "restored the system's founding invariant." That claims too much. There were **two** self-consistent resolutions of the contradiction: gross-on-actual + fees-only (Kyle's), and gross-on-intended + fees+slippage (the old code's — which also yields a *correct net*, 293/293). The difference is not arithmetic; it is **which figure you want individually truthful.** ⇒ the honest statement is *"the design held two irreconcilable invariants; Kyle's directive picked the one that keeps gross and cost independently honest."* **A self-contradictory document cannot be a tiebreaker** — and writing it as one sets a precedent where the frozen canonical corpus gets cited to override a live decision. **The provenance read's value here is that it EXPLAINS THE DRIFT, not that it settles the choice.**
- **B-COST-ACCOUNTING-HONESTY's cost line (fees only) RESOLVES the F1/F3 contradiction** rather than departing from the design.
- **★ THE CASUALTY IS F2 ITSELF, NOT MERELY F2's RATES (Langston correction 1, ACCEPTED).** An earlier draft retired only the 0.15%/0.10% constants and left F2's *structure* reading as compatible. It is not: fees-only abandons **F2's four-component composition of `totalCost`**. Said plainly because the failure mode is concrete and repeatable — the next reader opens F2, counts four components, and re-adds slippage. **That is the exact loop this batch exists to close**, and it is the same hazard §3.5's own counter-argument names.
- **F4 is SUPERSEDED, not violated.** *"There is no positive slippage"* was true of the 2025 simulation model. The maker/limit-order model (P19-B7.2, 2026-07) makes price improvement real — 57 closed trades exhibited it. **Disposition (2): relevant, needs updating to today's intent.**
- **F2's rates (0.15% slippage / 0.10% fees, "constants, not configurable") are long superseded** by the DB-governed Kraken model (0.80% taker / 0.40% maker). Historical only.
- ⚠️ **`bridge/canonical/` is a FROZEN historical record and is NOT edited** (§9.5(b)). These findings are recorded HERE and in the System Manual; the corpus stays untouched.

### 1.4 Disposition (the five, §2 MANDATORY 1.b)
**(2) RELEVANT BUT NEEDS UPDATING.** The intent — one cost model, identical everywhere, gross on actual fills — is correct and current. What must change is the *form*: three hand-synchronised copies cannot hold an invariant. **Not (1)** (it has already drifted), **not (3)/(5)** (it is very much connected and live), **not (4)** (the arithmetic must not be removed, only relocated).

---

## 2. THE PROBLEM, MEASURED
Three copies, self-documented as mirrors, **already drifted at the comment level** — the citations in them pointed at line numbers that no longer contained the cost math, and two comments justified a `colSpan` by a "pattern" the sibling never implemented (fixed 2026-07-29). **The scope of B-COST-ACCOUNTING-HONESTY itself asserted ONE site and was wrong until the §9.5 census corrected it** — the duplication is not merely a maintenance cost, it has already produced a false claim in a governance document.

### ★★ 2.1 THE CENSUS WAS RE-SCOPED AT STEP-1 — AND IT FOUND TWO MORE SITES, ONE OF THEM BROKEN IN PRODUCTION

**Langston's root-cause of the miss, accepted verbatim: the census was scoped by PATTERN (the `gross − cost` shape), not by QUANTITY.** Re-running the same pattern at any ref finds the same three forever. The correct scope is **every site that computes OR ASSERTS A RELATIONSHIP AMONG gross / cost / net** — including reconciliation, diagnostics, tests, exports and metrics. Re-run under that definition, pinned at **`f3e1f9fc8`**:

| # | Site — `file:line` at `f3e1f9fc8` | Quantity | Status |
|---|---|---|---|
| 1 | `server/services/active-execution-engine.ts:1829` (gross) + `:1835` (cost) | **realized**, authoritative, persists to `closed_trades` | current |
| 2 | `server/routes.ts:12666` (gross) + `:12669` (cost) | **realized**, manual close, persists; born `2807c2360` | current |
| 3 | `server/routes.ts:12159` (gross) + `:12171` (est cost) | **unrealized estimate**, display-only, feeds the Open tab | current |
| **4** | **`server/services/c5-financial-diagnostics.ts:194`** | **asserts** `net = gross − fees − slippage` (F3 longhand) on **every engine close** (`active-execution-engine.ts:2266`) | **★ BROKEN — anchored to the retired invariant** |
| **5** | **`server/services/c5-financial-diagnostics.ts:87-91`** | **asserts** `starting + Σ realized = current balance` | **★ BROKEN — different root cause, see 2.3** |

**Site 4 (Langston's find), measured:** `isEnabled = true` at `:73` with no caller ever disabling it. **17 `[C5-PNL-RECON] MISMATCH DETECTED` lines** on the live error stream — including this scope's own §3.5 worked example, `DXCM/USD` diverging by **$28.58, exactly `exitSlippage`.** The double-count, in production. ⚠️ Successes are silent by design, so **17 is a count of logged mismatches, not a rate** — do not report it as one. **OBJ-3's fence would not have caught it:** it spells the arithmetic out under different variable names and never says `totalCost`.

### ★★ 2.3 SITE 5 — CC-C's find at Step-1: a self-check that reads a column which does not exist
**This is NOT a balance defect. It is a broken instrument, and the distinction is the whole point (rule 24, outcome 2/3).**
`logBalanceReconciliation` reads `portfolioState.startingBalance` **through an `as any` cast** (`:88`) and falls back to `displayedCurrentBalance` when it is absent (`:89-91`). **Presence-evidence: `portfolio_state` (`shared/schema.ts:1166-1185`) has exactly `id · globalContextId · mode · balance · anchorVersion · lastUpdate · createdAt`. There is NO `startingBalance` column** — the one at `:1907` belongs to `active_engine_sessions`, a different table. ⇒ **the fallback fires every single time**, `starting` is set equal to `displayed`, and the check degenerates to *"is realized P&L zero?"* — false whenever any trade has ever closed.
**Measured, and it matches by construction:** **339 `[C5-BALANCE-CHECK]` mismatches** since 2026-07-15 (326 `trade_close`, 13 `session_start`); **`displayed == starting` on 339/339**; mismatch magnitude **= |realized P&L|** exactly (sample: realized −34.99 → "mismatch" 34.99).
**⚠️ WHAT THIS DOES *NOT* ESTABLISH:** it says **nothing about whether the balance is correct** — the check is structurally incapable of testing that. Proving the balance needs its own measurement against the anchor-event ledger, and that is **NOT in this batch**; homed separately.
**★ Why it belongs here anyway:** same file, same class, same failure shape as site 4 — *an absence that reads as a valid value* (**#568**, my own named recurring error, now found in production). A missing field did not throw; it silently degraded into a plausible wrong number and then reported that number as someone else's defect. **356 total false alarms across the two checks is not noise — it is a live instrument that would mask a real defect** in exactly the subsystem this batch touches.

### 2.4 Undispositioned in that class — to be FENCED BY NAME, not assumed (Langston)
| Site | Reading | Required action |
|---|---|---|
| `server/services/dashboard-metrics.ts:63-64` | aggregates `t.grossPnl` for fee-as-%-of-gross; **consumes** gross, does not recompute it | disposition + name-fence |
| `server/services/vts-runner.ts:3600-3601` | **fractional** (`/entryPrice`) and uses `frictionCost` — a genuinely separate VTS quantity | disposition + name-fence |

**"Believed separate" is not a disposition** — the batch that fenced `computeTotalRoundTripCost` by name fences these by name too.
**Not a copy, but in the blast radius:** `client/src/lib/paper-trade-adapter.ts` (pure pass-through of `estTotalCost`) and its test fixture — CC-A's peer-check catch.
**⚠️ MUST NOT be folded in:** `computeTotalRoundTripCost` (`routes.ts` ~8812) is a **same-named but different quantity** — an *ex-ante* friction estimate feeding the EV gate, which legitimately includes slippage. It answers "what will this round trip cost me?", not "what did this trade cost?". Harris-consistent; leave alone; it is already fenced by name in `b-cost-accounting-honesty.test.ts`.

## 3. OBJECTIVES
1. **Extract ONE pure function** — proposed `core/math/trade-pnl.ts`, e.g. `computeRealizedPnl({actualEntry, actualExit, quantity, entryFee, exitFee})` → `{grossPnl, totalCost, netPnl, netPnlPercent}`, plus an open-position variant taking `currentPrice` + estimated exit fee. Pure, no I/O, unit-testable in isolation.
2. **Re-point sites 1-3** at it. No behavioural change — **net, gross, cost and % must be bit-identical before and after at every site.**
3. **Fence it structurally**: extend the existing source fence so a re-introduced inline copy fails the test, and assert the shared function is the ONLY producer of these four values. **The fence must be QUANTITY-scoped, not shape-scoped** — the shape fence is precisely what let site 4 hide.
4. **Record F1/F2/F3's inconsistency + F4's supersession in the System Manual** (canonical stays frozen), so the next reader inherits the resolution instead of rediscovering the contradiction. **Per correction 1, state explicitly that F2's four-component COMPOSITION is retired, not merely its rates.**
5. **★ OBJ-5 — REPAIR THE TWO SELF-CHECKS (Langston: moves WITH this batch, does NOT get its own later home — same formula, same fence).**
   - **Site 4:** re-anchor the P/L reconciliation to the current model (`net = gross − fees`, gross on actual fills). It is the system's own invariant assertion; leaving it anchored to a retired invariant makes a **real** defect indistinguishable from this noise.
   - **Site 5:** the fallback that silently substitutes `displayed` for a **nonexistent** `startingBalance` must **fail loudly or be removed** — a diagnostic that cannot obtain its input must say so, never invent one. This is the #568 fix applied to an instrument instead of an engine.
   - **Both:** their arithmetic comes from the shared function or is fenced against it. A self-check that can drift from the thing it checks is not a check.
6. **★ OBJ-6 — Disposition and NAME-FENCE the two undispositioned sites** (`dashboard-metrics.ts:63-64`, `vts-runner.ts:3600-3601`), exactly as `computeTotalRoundTripCost` is fenced today.

## 3.5 ✅ TOTAL FRICTION — **RULED BY KYLE 2026-07-30: RECORD IT, DO NOT DISPLAY IT**

> **Kyle, verbatim:** *"I still don't understand the column you wanna add, and I think it will just confuse me if it's in the interface. So go ahead and store it and record it. But let's not put it into the tables."*

**⇒ THE DISPOSITION, and it is narrower than the proposal below.** **NO column is added to the Open or Closed Trades tables — none.** The figure is **recorded** (its definition made canonical in the System Manual, and the value available to analysis) and is **never rendered in the trade tables.** This also disposes of the strongest argument against it — a 36th column on a crowded table that reads as negative on price improvement — by simply not putting it there.

**★ AND IT SATISFIES LANGSTON'S CORRECTION, which supersedes my own framing below: NAMING IS NECESSARY BUT IT IS *NOT* THE SAFETY PROPERTY. The safety property is STRUCTURAL — the figure must be INCAPABLE of reaching net.** A label is a convention the next reader can misread; **F2 is the proof — it was labelled "Total cost," had four components, and that is exactly how the double-count got in.** So the recorded figure must be: **(a)** derived, and never persisted in a **cost-shaped** column, nor an input to balance / EV / metrics; **(b)** covered by its own fence asserting **nothing subtracts it**; **(c)** explicit about sign convention. Kyle's "don't display it" and Langston's "sequence it behind the bit-identical claim" point the same way — **the reported-figure-in-a-live-table version is dead, and neither of them has to yield.**

<details><summary>Original proposal, retained for the record (SUPERSEDED by the ruling above)</summary>

### ⏳ OPTIONAL OBJECTIVE — A "TOTAL FRICTION" FIGURE (KYLE'S CALL, **NOT implemented pending his decision**)

**The gap it fills.** The realized-cost line is now **fees only**, which is correct accounting — but it means the number labelled "cost" no longer shows what execution actually took. The slippage components are still on the row in their own columns; nothing sums them.

**Worked example — DXCM/USD, closed 2026-07-29 (real row):** fees `$1.0560 + $2.1067`; slippage `$0.0000` entry, `−$28.5779` exit.
| | before B-COST-ACCOUNTING-HONESTY | now (live) | now + this option |
|---|---|---|---|
| Gross P/L | −$29.25 (vs intended prices) | **−$0.67** (vs actual fills) | −$0.67 |
| Total Costs | **−$25.42** ← negative "cost" | **$3.16** (fees) | $3.16 |
| *Total Friction* | — | — | **−$25.42** (reported, NOT deducted) |
| Net P/L | −$3.83 | −$3.83 | −$3.83 |

**Proposal:** `totalFriction = entryFee + exitFee + entrySlippage + exitSlippage` — **displayed as a REPORTED figure, never deducted, and labelled FRICTION not COST.** Net is untouched (it stays `gross − fees`). This restores the single all-in view the pre-change `total_cost` accidentally provided, without the double-count that made it negative.
**★ Naming is the whole safety property:** calling it "cost" is what invited the double-deduction in the first place, and it is the F2/F3 confusion in the canonical doc reappearing in the UI. It must read as *"what execution took"*, not *"money subtracted"*.
**Argument against, recorded honestly:** it is a 36th column on an already-crowded table; the components are already displayed; and it is **legitimately NEGATIVE on price improvement** (DXCM above) — the exact confusion just removed from the cost line, reintroduced under a different name.
**CC-C recommendation:** ADD IT, because the fee wall is the central open question and an all-in per-trade figure serves it directly — but **only** under the friction label, and **only** as a reported value. ⏳ **Awaiting Kyle. This scope is complete and reviewable without it; if he declines, delete this section and nothing else changes.**

*(Kyle ruled: record it, do not display it. Langston ruled: naming is not the safety property. Both are applied above.)*
</details>

## 4. VERIFICATION
- **Equivalence, not just green tests:** recompute all four outputs for every closed trade under old and new code paths and assert **zero divergences** (the 298/298 method that proved B-COST-ACCOUNTING-HONESTY safe).
- tsc delta ZERO, measured stash/count/pop — never inferred.
- §9.3: Closed + Open tabs render identical numbers pre/post. **Per the 2026-07-29 lesson, state each affected column's RENDERED POSITION and the table width — "it renders" is not "a human can see it".**
- CI 4-green; coordinated deploy window (engine restart).

## 5. RISKS
1. **A "pure refactor" that silently changes a number.** Mitigation: the equivalence sweep above is the gate, not the tests.
2. **Site 3 is not the same shape** (estimated exit costs, no actual exit) — it needs its own entry point, not a forced fit. Forcing one signature is how the next drift starts.
3. **Consolidation touches a live money path.** Display-identical ≠ engine-identical: the engine's values persist to `closed_trades` and feed the balance. Equivalence must be proven on the ENGINE path, not just the display.
4. **★ OBJ-5 changes what the system ASSERTS ABOUT ITSELF — the highest-consequence risk in the batch.** Re-anchoring a self-check is not like re-pointing a display: **get it wrong and we do not create a visible error, we SILENCE a real alarm.** A check that always passes is strictly worse than one that always fails, because only the second gets investigated. Mitigation: each repaired check must be shown to **still fire on a deliberately corrupted input** (mutation-prove it, as the source fence was mutation-proved in B-COST-ACCOUNTING-HONESTY) — a green check is not evidence until it has been made to go red on demand.
5. **Site 5's fallback is load-bearing in the wrong direction.** Removing it without a real `startingBalance` source turns 339 false alarms into a hard failure on every close. The check must degrade to an explicit *"input unavailable"*, not to an invented number **and not to a crash on the money path.**

## 6. GOVERNANCE
Tier-1 + **SYSTEM_MANUAL** (the cost model + the F1–F4 provenance resolution, incl. F2's retired composition) + **SIM** (the new shared component + its callers, **and the two C5 self-checks as consumers of the invariant**) + RUNNING_ISSUES. Langston Step-1 done — his challenge added OBJ-5/6 and two precision corrections; all accepted.

**§9.4 — the one thing deliberately NOT in this batch, with a named home:** **is the paper balance itself correct?** Site 5 proves only that the *instrument* is broken; it is structurally incapable of answering that. Proving it requires reconstructing the balance against the `portfolio_anchor_events` ledger (re-anchors legitimately reset the baseline, so a naive `starting + Σ realized` is wrong by design). **Homed as its own item, owner CC-C, sequenced after this batch** — not folded in, because a balance-correctness proof and a bit-identical-refactor claim must not share a Step-8.
