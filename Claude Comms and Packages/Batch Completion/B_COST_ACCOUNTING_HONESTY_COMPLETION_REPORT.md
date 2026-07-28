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
| 8 — §9.3 UI | **YES — VERIFIED 2026-07-28 16:02Z** | Deferred leg CLOSED by the scheduled task `verify-cost-accounting-honesty`. **8 post-deploy rows, all five assertions PASS on all 7 filled rows** (the 8th is `never_filled`, all-zero, no fill prices by construction ⇒ (c)/(e) undefined, (a)/(b)/(d) pass). UI: Closed Trades tab inspected in Chrome — post-deploy rows show costs = fees only and positive; slippage displayed in its own columns, not deducted. See the §9.3 evidence block below. |

## ★ The census finding (§9.5(a)) — the scope's own first draft was wrong
The formula was **duplicated at three sites**, each documented in-code as a deliberate mirror: (1) `active-execution-engine.ts` engine close; (2) `routes.ts` **manual close**; (3) `routes.ts` **open-positions live display**. **A forward path-trace from the engine would have found site 1 and stopped.** Fixing only the engine would make an engine-closed and a manually-closed trade report different gross/cost for identical economics, and the Open tab would disagree with the Closed tab.

**Langston's addition — asymmetric PERSISTENCE, not arithmetic:** the manual-close path wrote the derived slippage but **none of the five benchmark fields** the engine writes, making the retained telemetry hollow there and silently excluding those rows from any actual-fill verification. **Measured on his challenge: 369 closed rows, 298 in the proof, 71 outside — and all 71 are `never_filled`** (maker orders that expired without filling, so no fill price **by construction**). **ZERO are manual closes** ⇒ the gap was **latent, never live**. Fixed at the find (rule 23): site 2 now persists all five.

## ★ §9.3 DEFERRED-LEG EVIDENCE — VERIFIED 2026-07-28 16:02Z (scheduled task `verify-cost-accounting-honesty`, owner CC-C)

At deploy no trade had closed, so the new semantics could not be inspected on a live row. **8 rows have now closed after the 2026-07-28 11:57Z cutover** and were asserted individually.

| Symbol | Reason | (a) cost = fees | (b) cost ≥ 0 | (c) gross on actual fills | (d) net = gross − cost | (e) % on actual basis |
|---|---|---|---|---|---|---|
| VVV/USD | target_hit | PASS 0.7085 | PASS | PASS 2.6610 | PASS 1.9525 | PASS 2.238 |
| ONDO/USD | target_hit | PASS 2.1356 | PASS | PASS 10.4346 | PASS 8.2990 | PASS 3.171 |
| HYPE/USD | target_hit | PASS 0.7053 | PASS | PASS 1.6402 | PASS 0.9349 | PASS 1.070 |
| HYPE/EUR | target_hit | PASS 0.7042 | PASS | PASS 1.5933 | PASS 0.8891 | PASS 1.019 |
| VZ/USD | target_hit | PASS 3.0470 | PASS | PASS 20.0649 | PASS 17.0178 | PASS 6.883 |
| PLTR/USD | stop_hit | PASS 4.1761 | PASS | PASS −1.8636 | PASS −6.0397 | PASS −2.306 |
| NEAR/USD | stop_hit | PASS 1.0317 | PASS | PASS −1.9696 | PASS −3.0013 | PASS −3.438 |
| BA/USD | never_filled | PASS 0.0000 | PASS | **N/A** — actual prices NULL by construction | PASS 0.0000 | **N/A** — zero basis |

**Every filled row passes every applicable assertion; zero failures.**

- **Negative-cost count:** `neg_post_deploy = 0` · `neg_all_time = 57` (unchanged, historical, rows deliberately not backfilled) · 377 closed rows total.
- **★ The two loss rows are the load-bearing cases.** PLTR carries slippage of **+0.0389 entry / −0.2278 exit** and NEAR **−0.1784 exit** — under the old form the negative exit slippage would have pulled the cost line down; under the new form both cost lines are **fees only and positive** (4.1761 and 1.0317) and both nets stay negative. **No green-washing.**
- **Sign convention holds on a real row:** VZ shows entry slippage **−0.1415** (a better-than-intended fill, i.e. price improvement) reported as telemetry and **not** credited against the cost line — the exact double-count the batch removed.
- **§9.3 UI (Claude-in-Chrome, `https://188.245.193.8.sslip.io/paper-trading` → Closed Trades):** post-deploy rows render Gross P/L matching the actual price movement (VVV `$12.7000 → $13.0874` on 6.8683 units = **$2.66**), Total Costs **$0.7085 positive**, and Entry/Exit Slip shown in their own columns at `$0.0000`. Pre-deploy rows below them still show the old semantics (GM `−$8.7540`, TGT `−$96.8871`) — **expected, not judged.**

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
