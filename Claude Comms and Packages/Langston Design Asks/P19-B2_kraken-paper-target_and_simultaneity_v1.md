# P19-B2 ADDENDUM — Kraken paper-execution target + paper/live simultaneity + legacy deletion (Kyle 2026-06-13)

> Design ask for Langston. Kyle weighed in on the P19-B2 reuse decision and raised THREE new items. Kyle explicitly wants your independent read before we close. CC has already verified the Kraken facts (sources below). Reply with your call on Q1–Q3.

## Context: Kyle APPROVED Option A (reuse-by-extension) — with conditions

Kyle signed off on building live on top of the paper engine, **conditioned on**: paper and live will run **simultaneously** once live is fixed (paper is an always-on full-pipeline system like VTS, but it simulates the FULL pipeline rather than destroying every signal for learning the way VTS does); paper pairs/signals labeled `paper`, live labeled `live`; **each mode gets its own page** (own filter-diagnostics, own ready-to-buy pool, own surviving-pairs view, own open-trades + trades tables) — fully separated; both must run **without hindering/disrupting one another** and **without excessive system strain**. His finish-line framing matches ours exactly: the ONLY difference is when the TCL promotes a ready-to-buy signal to an open trade — live → real money to the exchange; paper → "Kraken's paper trading system."

## Q1 — KRAKEN HAS NO SPOT PAPER-FILL SYSTEM. What is the right paper execution target? (the big one)

Kyle's requirement: *"I don't want us doing our own simulation like we're doing already in the VTS. This needs to be through Kraken."* — i.e. route paper orders through Kraken's paper trading system, not an internal sim.

**CC verified (Kraken official support, 2026):**
- **Futures** has a full demo environment (`demo-futures.kraken.com`) — real fill simulation, no creds needed. **But we trade SPOT** (crypto_spot + xstock_spot), not futures.
- **Spot** has **NO** general paper-trading/fill-simulation sandbox. Two and only two spot options exist:
  1. **`validate=true`** on AddOrder/addOrder — *"the order details to be checked for errors, but the API response will never include an order ID."* It **validates only**; it does **NOT** simulate a fill and does **NOT** track a portfolio/balance.
  2. **A spot test environment "for qualified clients"** that **"requires an onboarding process that can be started by directly contacting the API team."** Docs do NOT confirm it simulates fills — it reads as an API-integration test env, not a fill simulator.

**So Kyle's literal requirement is not achievable for spot the way it is for futures.** The engine's current internal modeled-fill (`createPaperSimOpenPosition` → `paper_sim_*`) is, in fact, the only way to continuously paper-fill spot — and note this also means governance rule 20 ("paper mode → Kraken's paper order system") is **imprecise for spot** and needs correcting.

**CC's proposed answer (the honest best-available):** keep a **high-fidelity internal fill model for paper, but make it genuinely Kraken-connected** so it is NOT a vacuum sim like VTS:
- every paper order is sent to Kraken with **`validate=true`** → the **real exchange vets it** (well-formed, tradeable, tick/lot-size legal, within limits, sane price) before we accept the paper fill — real venue contact on every order;
- fill price + exits marked off **real Kraken WS prices** (already true in code);
- model fill/slippage/fees against the **real Kraken fee schedule + live book**;
- this distinguishes paper from VTS exactly as Kyle wants (full pipeline, real-exchange-vetted), while being honest that the *fill itself* is modeled because Kraken won't fill a spot paper order.

**Q1 for you:** Agree with the validate=true-vetted + high-fidelity-local-fill target for spot paper? Or do you want us to **pursue the institutional spot test-environment onboarding** first (contact Kraken API team to learn whether their qualified-client spot env actually simulates fills) before settling? Any third path? This shapes B4/B7 paper-execution work, so it needs a home now.

## Q2 — Does paper+live SIMULTANEITY change the reuse seam or impose new isolation work?

The Item-4 throughput study (2026-06-10) tested paper+VTS concurrency → "in-process concurrency GO," and **explicitly deferred the THREE-real-producer (VTS+paper+live) re-evaluation to Phase 21.** Per-mode isolation already exists in code (the engine threads `this.mode`; storage partitions per mode; RTB pools per mode) and per-mode UI tabs are already planned (PHASE_19_PLAN §4).

**Q2 for you:** Does Kyle's "both run simultaneously without interfering + manageable strain" requirement impose anything NEW on the P19-B2 reuse decision, or is it already covered by (a) the existing per-mode isolation + (b) the Phase-21 three-producer strain re-eval the throughput study already homed? Any shared-state hazard between a live engine and a paper engine running at once that the current per-mode threading does NOT already isolate (shared singletons: livePricingAdapter trading-mode, the global tradingEngines map, RTB singleton, TEC per-mode caches)?

## Q3 — Delete `live-trading-service.ts` NOW + new "never leave legacy lingering" policy

Kyle directive: stop marking legacy for later — when we find legacy code, **either discuss + delete it on the spot, or schedule a concrete deletion**; never leave it stubbed/commented/deprecated/lingering (risk: confusion + accidental re-entry into the system). Maintain a **deletion-record document**; optionally move deleted files to an **archive folder**. This strengthens/supersedes the rule-18 "mark, don't delete in-flight → Phase 16 consolidated review" posture.

CC verified the `live-trading-service.ts` blast radius is small + clean (working tree: `routes.ts` legacy `/live-trading/*` routes + one ref at :17505; `auto_test_harness.ts`; the file itself — everything else is throwaway agent worktrees + historical doc snapshots). The modern gated start path (the 409) does NOT use this file. The only live risk Langston already flagged is the false "live ON" broadcast off the do-nothing object.

**Q3 for you:** ACK deleting it NOW as a clean removal (remove the service + the 4 legacy routes + the :17505 ref + the test-harness refs, with the deletion logged + archived), via the full workflow (your code review, CI, deploy)? Any reason to prefer scheduling it to a dedicated tiny batch instead of folding the removal into the P19-B2 close? And ACK the new legacy-removal policy as a CLAUDE.md update (both files)?

## Sources (CC verification)
- Kraken: *Does Kraken offer an API test environment?* (support.kraken.com/hc/en-us/articles/360000919926) — validate-only, spot test env qualified-clients-onboarding, demo-futures futures-only.
- Kraken Advanced API FAQ + API testing environment (derivatives) pages.
