# B-COST-ACCOUNTING-HONESTY — COMPLETION REPORT

**Owner:** Claude Analyst (CC-C) · **Kyle-directed 2026-07-28** · change-class: **non_architecture**
**Head:** `c4b9abfb5` (in branch head at deploy) · CI 4-green (run `30356720024`) · No migration · **Deployed staging 2026-07-28 ~11:57Z, pm2 restart #537, HTTP 200, engine cycling clean.**
**Scope:** `Scope Files/B_COST_ACCOUNTING_HONESTY_SCOPE.md` · **Pre-audit:** `..._PRE_AUDIT.md`
**Review:** Langston Step-4 **APPROVED WITH CHANGES** → all changes landed → **clear to deploy** (he re-verified the canonical-corpus ruling himself). CC-A independent peer check (2 refinements, both folded).

## 🚨 PREVIOUSLY-STATED-VS-NOW (§9.2)
- **`net_pnl_percent` / `pnl_percent` BASIS CHANGED.** PREVIOUSLY: divided by *intended* entry value. NOW: divided by **actual** entry value. REASON: consistency with the actual-fill gross Kyle directed. Worked example (ONDO 2026-07-27 05:45): **PREVIOUSLY +6.98%. NOW +7.66%.** Same dollars ($18.3643), different denominator.
- **⚠️ AGGREGATE WARNING (Langston):** any average of `pnl_percent` spanning the cutover mixes two denominators. **CUTOVER TIMESTAMP: 2026-07-28 ~11:57Z (pm2 restart #537).** Split aggregates on it. Rows are NOT backfilled (honest-absent).
- Scope's own first draft said the formula lived at **ONE** site. NOW: **THREE**. REASON: the §9.5 census. See below.

## Objective + the rule-24 finding that preceded it
Reported as a bug: *"negative slippage makes total cost negative and flips losses to green (ONDO stop-loss showing +6.98%)."* **The premise was false and was reported as such BEFORE any code was written.** Measured: `net_pnl` equals true economics — `(actual_exit − actual_entry)×qty − fees` — on **293/293** closed trades with fills, **including all 57 with negative `total_cost`**, zero divergences. The ONDO gain is real (profit-locking stop; entry filled 8.8% better than the signal price). ⇒ **rule-24 outcome 2/3: presentation, not money.** Options were put to Kyle rather than a unilateral "fix"; he directed gross-off-actual-entry.

**⚠️ THE TRAP:** old gross was measured vs INTENDED prices and old cost DEDUCTED slippage; the two distortions **cancel exactly** (the expression telescopes to `(E_act−B_act)q − fees`). **The obvious fix — clamp `total_cost ≥ 0` — would have BROKEN a currently-correct net on 57 rows.** This is precisely Kyle's named rule-24 fear.

## Objectives checklist
| # | Verdict | Evidence |
|---|---|---|
| 1 — gross from ACTUAL fills | **YES** | `grossPnl = (actualExit − actualEntry) × qty` at all three sites. |
| 2 — cost line = EXPLICIT costs only | **YES** | `totalCost = entryFee + exitFee`. Slippage leaves the cost line (it is already inside the actual fills; deducting it too double-counts — Harris/Zipline). |
| 3 — **NET PROVABLY UNCHANGED** | **YES — live-verified** | Algebra telescopes; **live: the new formula reproduces the recorded net on 298/298 closed trades, 0 divergences.** New cost line negative on **0** rows (vs 57 under the old form). |
| 4 — slippage retained as telemetry | **YES** | Columns unchanged and still persisted; signed, **positive = cost**, stated explicitly in-code because **no industry standard exists**. |
| 5 — % denominator → actual | **YES** | See PREVIOUSLY/NOW above. |
| 6 — no backfill | **YES** | Historical rows keep old semantics; cutover timestamp recorded. |
| 7 — **all THREE sites in lockstep** | **YES** | §9.5 census finding — see below. |
| 8 — §9.3 UI | **⏳ PENDING (dated home)** | Closed Trades tab renders correctly post-deploy (verified via Chrome). **No trade had closed since the deploy**, so a new-semantics row could not be inspected. **HOME: one-time scheduled task `verify-cost-accounting-honesty`, fires 2026-07-28 18:00 local, owner CC-C** — asserts all five properties on post-deploy rows + the UI check, and **re-schedules itself rather than declaring success on an empty result.** |

## ★ The census finding (§9.5(a)) — the scope's own first draft was wrong
The formula was **duplicated at three sites**, each documented in-code as a deliberate mirror: (1) `active-execution-engine.ts` engine close; (2) `routes.ts` **manual close**; (3) `routes.ts` **open-positions live display**. **A forward path-trace from the engine would have found site 1 and stopped.** Fixing only the engine would make an engine-closed and a manually-closed trade report different gross/cost for identical economics, and the Open tab would disagree with the Closed tab.

**Langston's addition — asymmetric PERSISTENCE, not arithmetic:** the manual-close path wrote the derived slippage but **none of the five benchmark fields** the engine writes, making the retained telemetry hollow there and silently excluding those rows from any actual-fill verification. **Measured on his challenge: 369 closed rows, 298 in the proof, 71 outside — and all 71 are `never_filled`** (maker orders that expired without filling, so no fill price **by construction**). **ZERO are manual closes** ⇒ the gap was **latent, never live**. Fixed at the find (rule 23): site 2 now persists all five.

## Industry basis (Kyle asked explicitly; full citations in the pre-audit)
Perold (1988) **implementation shortfall** — the canonical decomposition (delay / trading / opportunity cost + fees). **Harris Ch.21** — explicit costs are accounting entries; implicit costs are estimates against a benchmark, not bookable. **Zipline** — slippage baked into the fill price, commissions a separate model, **never both**. **GIPS 2020** trade-date accounting. **PRIIPs (2023)** floored transaction costs at zero after funds reported negative ones — we take the middle path (signed diagnostic, explicit-only cost line). **SEC Rule 605** reports price improvement as its own metric. **No industry standard on sign convention** (three mutually contradictory conventions in live use) ⇒ ours is stated in-code. Honest limits recorded: the double-counting prohibition is a supported **inference**, not a citable rule; **MiFID II RTS 27/28 no longer exist**; Perold's original is paywalled.

**★ Two different `totalCost`s now coexist and must not be conflated (Langston Q1):** the realized cost accounting changed here, and `computeTotalRoundTripCost` (`routes.ts` ~8812, `(fee×2)+(slippage×2)+spread`) which **legitimately includes slippage** — it is an **ex-ante friction ESTIMATE feeding the EV gate**, not accounting for a completed trade. Harris-consistent, correct, and deliberately left alone. It is fenced by name in the tests.

## Verification
- **tsc delta ZERO** — measured stash/count/pop: 153 clean-origin in the two files, 153 with changes; zero errors naming any new symbol.
- **26 tests green** (11 batch + 15 adapter), incl. old-net ≡ new-net ≡ true-economics on the **real ONDO numbers**, a losing-trade sign check (no green-washing), and a **three-site source fence**.
- **★ The broad guard caught me being wrong.** I added a shape-independent "no `*Cost` assignment may mention slippage" fence with a comment asserting `computeTotalRoundTripCost` wouldn't match "because it is a function call, not a `const …Cost =` assignment." It went **RED immediately** — it is exactly such an assignment. My reasoning was disproved by my own new test within a minute; it is now carved out **by name**, with the disproof preserved in the comment.
- Deploy: engine online, HTTP 200, **zero errors** naming any changed symbol.

## Governance files changed
BATCH_CATALOG · PHASE_HISTORY · PHASE_19_PLAN §5 · **SYSTEM_MANUAL** (cost-accounting model + industry basis) · **SIM** (closed-trade cost field semantics) · RUNNING_ISSUES (the out-of-scope item homed) · this report · scope · pre-audit · MEMORY_CC_C.
**⚠️ `bridge/canonical/DawnTrader_System_Invariants_Design_Guarantees.md:114` states the superseded formula as an INVARIANT and is deliberately NOT edited** — CLAUDE.md §9.5(b) makes the canonical corpus a frozen historical record. Langston independently verified the rule text and concurred. Recorded here so a future reader consulting it is not misled.

## Out of scope, homed (§9.4)
**The Perold delay-vs-trading-cost split** needs an **arrival price** (best ask at placement) we do not persist → own batch **`B-IMPLEMENTATION-SHORTFALL`**, owner CC-C. Measured motivation: mean |intended−actual| entry gap **0.278%** (plausible execution slippage), but **24 trades exceed 1%** and max is **8.771%** — that magnitude is **signal staleness, not execution cost**, and today they are indistinguishable.
