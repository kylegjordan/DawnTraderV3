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
- **Kyle's 2026-07-29 directive ("gross off the actual entry price") RESTORED F1.** It was not a new preference — it is the system's own founding invariant, recovered. **Neither he nor I knew that when the change was made; the provenance read established it afterwards.** That is an argument for the rule, and it is recorded as such.
- **B-COST-ACCOUNTING-HONESTY's cost line (fees only) RESOLVES the F1/F3 contradiction** rather than departing from the design — it is the only assignment under which F1 and F3 can both hold.
- **F4 is SUPERSEDED, not violated.** *"There is no positive slippage"* was true of the 2025 simulation model. The maker/limit-order model (P19-B7.2, 2026-07) makes price improvement real — 57 closed trades exhibited it. **Disposition (2): relevant, needs updating to today's intent.**
- **F2's rates (0.15% slippage / 0.10% fees, "constants, not configurable") are long superseded** by the DB-governed Kraken model (0.80% taker / 0.40% maker). Historical only.
- ⚠️ **`bridge/canonical/` is a FROZEN historical record and is NOT edited** (§9.5(b)). These findings are recorded HERE and in the System Manual; the corpus stays untouched.

### 1.4 Disposition (the five, §2 MANDATORY 1.b)
**(2) RELEVANT BUT NEEDS UPDATING.** The intent — one cost model, identical everywhere, gross on actual fills — is correct and current. What must change is the *form*: three hand-synchronised copies cannot hold an invariant. **Not (1)** (it has already drifted), **not (3)/(5)** (it is very much connected and live), **not (4)** (the arithmetic must not be removed, only relocated).

---

## 2. THE PROBLEM, MEASURED
Three copies, self-documented as mirrors, **already drifted at the comment level** — the citations in them pointed at line numbers that no longer contained the cost math, and two comments justified a `colSpan` by a "pattern" the sibling never implemented (fixed 2026-07-29). **The scope of B-COST-ACCOUNTING-HONESTY itself asserted ONE site and was wrong until the §9.5 census corrected it** — the duplication is not merely a maintenance cost, it has already produced a false claim in a governance document.

| # | Site (pin at sha `6013bff55`) | Role |
|---|---|---|
| 1 | `server/services/active-execution-engine.ts` — engine close path | primary; stop/target/trailing/time exits |
| 2 | `server/routes.ts` — manual-close endpoint | operator "Close" button; born `2807c2360` |
| 3 | `server/routes.ts` — open-positions live display | estimated exit costs; feeds the Open tab |

**Not a fourth copy, but in the blast radius:** `client/src/lib/paper-trade-adapter.ts` (pure pass-through of `estTotalCost`) and its test fixture — CC-A's peer-check catch.
**⚠️ MUST NOT be folded in:** `computeTotalRoundTripCost` (`routes.ts` ~8812) is a **same-named but different quantity** — an *ex-ante* friction estimate feeding the EV gate, which legitimately includes slippage. It answers "what will this round trip cost me?", not "what did this trade cost?". Harris-consistent; leave alone; it is already fenced by name in `b-cost-accounting-honesty.test.ts`.

## 3. OBJECTIVES
1. **Extract ONE pure function** — proposed `core/math/trade-pnl.ts`, e.g. `computeRealizedPnl({actualEntry, actualExit, quantity, entryFee, exitFee})` → `{grossPnl, totalCost, netPnl, netPnlPercent}`, plus an open-position variant taking `currentPrice` + estimated exit fee. Pure, no I/O, unit-testable in isolation.
2. **Re-point all three sites** at it. No behavioural change — **net, gross, cost and % must be bit-identical before and after at every site.**
3. **Fence it structurally**: extend the existing source fence so a re-introduced inline copy fails the test, and assert the shared function is the ONLY producer of these four values.
4. **Record F1/F2/F3's inconsistency + F4's supersession in the System Manual** (canonical stays frozen), so the next reader inherits the resolution instead of rediscovering the contradiction.

## 3.5 ⏳ OPTIONAL OBJECTIVE — A "TOTAL FRICTION" FIGURE (KYLE'S CALL, **NOT implemented pending his decision**)

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

## 4. VERIFICATION
- **Equivalence, not just green tests:** recompute all four outputs for every closed trade under old and new code paths and assert **zero divergences** (the 298/298 method that proved B-COST-ACCOUNTING-HONESTY safe).
- tsc delta ZERO, measured stash/count/pop — never inferred.
- §9.3: Closed + Open tabs render identical numbers pre/post. **Per the 2026-07-29 lesson, state each affected column's RENDERED POSITION and the table width — "it renders" is not "a human can see it".**
- CI 4-green; coordinated deploy window (engine restart).

## 5. RISKS
1. **A "pure refactor" that silently changes a number.** Mitigation: the equivalence sweep above is the gate, not the tests.
2. **Site 3 is not the same shape** (estimated exit costs, no actual exit) — it needs its own entry point, not a forced fit. Forcing one signature is how the next drift starts.
3. **Consolidation touches a live money path.** Display-identical ≠ engine-identical: the engine's values persist to `closed_trades` and feed the balance. Equivalence must be proven on the ENGINE path, not just the display.

## 6. GOVERNANCE
Tier-1 + **SYSTEM_MANUAL** (the cost model + the F1–F4 provenance resolution) + **SIM** (the new shared component + its three callers) + RUNNING_ISSUES. Langston Step-1 before implementation — this scope's provenance section is the part most worth his challenge.
