# P19-B4b — Scope (paper fill FIDELITY + paper/live isolation + shared-singleton split-brain audit)

**Batch:** P19-B4b · **Date:** 2026-06-15 · **Author:** Claude New (CC-B) · **Step:** 1 (Planning + Scope)
**Status:** _DRAFT — pending Langston Step-1 review + Kyle scope-shaping confirmation._
**Predecessor:** P19-B4a CLOSED 2026-06-14 (xStock active-path wire-in + feed-safety, DORMANT until B7b).

---

## 🚨 SCAFFOLDING-VS-FUNCTIONAL DECLARATION (CLAUDE.md §9.1)

> **THIS BATCH DOES NOT TURN ACTIVE-PAPER TRADING ON.** The high-fidelity fill model is BUILT + unit-tested in B4b but stays INERT until P19-B7b flips the authoritative `system_context.isEngineActive`. B4b makes the fill *correct and live-swappable*; it does not make paper active trading functional. The split-brain isolation audit (Objective 3) is the gate that MUST pass before any Phase-21 live+paper co-run.

---

## 0. SCOPE-SHAPING DISCOVERIES (Step-1.a architectural read — surface report 2026-06-15)

These reshape the batch from "polish the paper fill" to "build the fidelity substrate." They are flagged for Kyle + Langston BEFORE the work, per NO-PATCHES / never-improvise:

1. **There is NO live L2 order-book depth feed for crypto.** The Kraken WebSocket adapter subscribes to **ticker only** (level-1); `OrderBookEntry`/`KrakenOrderBook` types exist but are never instantiated. So "slippage walked against real L2 book depth" and "partial-fill vs available depth" **presuppose a depth feed that must be built/subscribed first.** (Open question O1: does the B-1.5 xStock depth-liquidity store give us a usable depth surface for xStock, and is crypto the only gap? — pre-audit resolves.)
2. **Paper places NO Kraken orders today.** Paper fills are computed locally (flat-slippage + per-class fee), atomic, never touching Kraken's order endpoint. So `validate=true` real-venue vetting is a **net-new order-submission path**, not a flag flip. (And per rule-20/P19-B2: `validate=true` on Kraken spot validates-but-never-fills — its ONLY role here is param-vetting, after which we discard and do the internal fill.)
3. **Fees are DB-governed per asset class but NOT volume-tiered.** There is one static taker fee per class (`fee_model.spot_taker_fee`), no 30-day-volume tier ladder. At paper volumes we are far below tier breakpoints, so "tiered taker fee" most likely means *the correct Kraken taker tier for our volume band, DB-resolved* — NOT a dynamic tier engine. (Open question O2 for Langston.)
4. **The Kraken rate-limiter is keyed by `userId`, not mode** → paper validate-traffic and live orders would throttle each other on a 120s cooldown. Isolation is net-new.
5. **Three liveness readers can diverge** (DB `isEngineActive` flag, `getOrchestratorByMode` presence, `tradingStateSync` cache). Consolidation is part of Objective 3.

**Implication:** B4b is larger than the P19-B2 homes implied. Recommend it stays its own full batch (it already is), and that Objective 1's depth-feed substrate (D2 below) be sized honestly rather than assumed-present.

---

## 1. Objectives (numbered, verifiable)

**O-1 — Kraken-vetted HIGH-FIDELITY paper fill model.** Replace the flat-percent fill with an honest model so paper EV ≈ live EV (Langston's #1 invariant from P19-B2):
- (a) **Real L2 depth-walked slippage** — fill price walks the actual order-book levels for the requested size, not a flat 0.05%.
- (b) **Partial-fill realism** — when requested size exceeds available depth within a tolerance band, return a `partial` FillResult (using the existing-but-unused `partial` variant), not a phantom full fill.
- (c) **Real Kraken tiered taker fee** — the correct taker tier for our volume band, DB-resolved (per O2 resolution), charged on filled notional.
- (d) **`validate=true` real-venue vetting** — every paper order is first submitted to Kraken with `validate=true` (params vetted by the real venue; distinguishes paper from a VTS vacuum sim), then discarded; the internal depth-walked fill is what's recorded.
- (e) **Depth-feed-warmth assertion** — refuse to fill against a cold/stale/absent book (fail-closed, same discipline as B4a's freshness gate); a fill never forms on a book older than a DB-resolved threshold.

**O-2 — Paper gets its OWN credential/rate-limit lane.** Paper's `validate=true` vetting traffic MUST NOT consume or throttle the live order lane. Isolate via a mode-scoped rate-limit key (composite `(userId, mode)` or a dedicated paper client/limiter), so live throughput is never starved by paper vetting.

**O-3 — Shared-singleton SPLIT-BRAIN isolation audit + per-mode isolation design + liveness-reader consolidation.** A design+audit deliverable that MUST pass before any Phase-21 live+paper co-run:
- (a) **Audit** every shared singleton/global both modes touch; classify per-mode-safe vs split-brain-risk (inventory seeded by the surface report — see §3).
- (b) **Design + implement** per-mode isolation for the split-brain-risk items: the global portfolio manager (`global.globalPaperPortfolioManager`, single-keyed), the covariance engine (module singleton loading a union of both pools), and the userId-keyed rate-limiter.
- (c) **Consolidate the 3 liveness readers** to a single SSOT (DB `isEngineActive`), with manager-presence used only for startup reconciliation, plus an explicit divergence invariant-check.

---

## 2. Verification criteria (outcomes, not "it compiles")

- **O-1a/b:** unit tests — a size that fits L1 fills at ~L1 price; a size that walks 3 levels fills at the depth-weighted average; a size exceeding the warm book's depth returns `partial` with the filled portion + honest avg price. Flat-slippage path is gone.
- **O-1c:** test the taker fee equals the DB-resolved Kraken taker for the configured band, charged on filled notional only.
- **O-1d:** assert every paper open/close submits a `validate=true` Kraken call before recording the internal fill; a Kraken param-rejection (bad pair/size/price) blocks the fill (no phantom paper position from an order live Kraken would reject).
- **O-1e:** depth-warmth assert — a stale/absent book → no fill + a dedup'd alert; a warm book → fill proceeds. DB-resolved threshold (fail-closed if config missing, B4a pattern).
- **O-2:** a test/proof that saturating the paper validate lane does NOT raise the live lane's rate-limit lockout (independent keys).
- **O-3:** the audit doc enumerates every shared singleton with a per-mode-safe/risk verdict + evidence; the isolation for the 3 risk items is implemented + tested (paper and live state cannot cross-contaminate); the liveness consolidation has a test that a divergence is detected + corrected. **This objective's PASS is the explicit precondition for Phase-21 co-run.**
- Full suite green on the bench (tsc baseline gate + vitest); CI all-4-green; staging deploy HTTP 200; §9.3 — backend-evidence Step-7 (the fill path is DORMANT, no UI behavior change, same as B4a).

---

## 3. Shared-singleton inventory (seed for O-3a — from the 2026-06-15 surface report)

| Shared state | Location | Keying today | Verdict |
|---|---|---|---|
| Global portfolio manager | `paper-sim-service.ts` (`global.globalPaperPortfolioManager`) | single, no mode key | **SPLIT-BRAIN** — needs per-mode registry for B7 live co-run |
| Kraken rate-limiter | `kraken.ts` (`rateLimitStates: Map<userId,…>`) | userId, not mode | **SPLIT-BRAIN** — O-2 isolates |
| Covariance engine | module singleton, loaded at `engine.start()` | union of both pools | **SPLIT-BRAIN risk** — pool cross-contamination |
| RTB pool / signals | `ready_to_buy_service.ts` + `rtb_signals(mode)` | mode-keyed | per-mode safe |
| RTB metrics, paper-exec engine, TCL watchdog, TEC | various | mode/instance/position-id keyed | per-mode safe (confirm in audit) |

The 3 liveness readers: `system_context.isEngineActive` (DB, canonical) · `getOrchestratorByMode(mode)` presence · `tradingStateSync` cache — consolidate to the DB flag (O-3c).

---

## 4. Proposed sub-chunk sequence (Langston to ratify ordering)

- **D1 — split-brain audit (READ-ONLY) + liveness-reader consolidation design.** Produces the audit doc + the isolation design; gates D4. (Objective 3a + 3c design.)
- **D2 — L2 depth-feed substrate.** Subscribe/hold the real Kraken book (and resolve O1: reuse the xStock B-1.5 depth store where possible). The warmth signal lives here. (Enables O-1a/b/e.)
- **D3 — high-fidelity fill model.** Depth-walked slippage + partial-fill + tiered taker fee in `PaperOrderPlacer` (light up the `partial` FillResult variant). (Objective 1a/b/c.)
- **D4 — `validate=true` vetting path + depth-warmth assert + rate-limit lane isolation.** The net-new Kraken validate-submission, the fail-closed warmth gate, and the paper lane split. (Objective 1d/1e + Objective 2.)
- **D5 — per-mode isolation implementation + divergence invariant-check.** Implement the D1 design for the 3 split-brain items + the liveness consolidation. (Objective 3b/3c implementation.)

(D2 may be sized as its own follow-on if the depth feed proves large — Langston's call after the pre-audit.)

---

## 5. Open questions for Langston (Step-1)

- **O1 — depth surface:** does the B-1.5 xStock depth-liquidity store give a usable L2 surface we extend to crypto, or is the crypto book fully net-new (a `book`/`book.25` Kraken WS subscription)? This sizes D2.
- **O2 — fee tiering:** is "tiered taker fee" satisfied by the correct static Kraken taker tier for our volume band (DB-resolved), or do you want a real 30-day-volume tier ladder? (Paper volumes sit far below breakpoints; I recommend the former, with the tier value DB-adjustable.)
- **O3 — validate-vetting scope:** confirm `validate=true` is purely param-vetting (we discard Kraken's response and record the internal depth-walked fill) — i.e. it is a *correctness gate on order params*, not a fill source. (This is the rule-20/P19-B2 posture; confirming it's still the intent.)
- **O4 — sequencing:** D2 (depth substrate) is the long pole. Ratify whether it stays inside B4b or splits to B4b.1, and whether D1 (audit) ships first as a standalone reviewable artifact.
- **O5 — co-run gate wording:** confirm Objective 3's PASS is recorded as the hard precondition gate for Phase-21 (live+paper simultaneity), so it can't be skipped later.

---

## 6. Governance at close (Step 10)

Tier-1: BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5, MEMORY (truth + repo-mirror + Langston), P19_B4b_COMPLETION_REPORT. Tier-2: SIM (the depth feed + validate path + isolation registry + liveness SSOT), SYSTEM_MANUAL (high-fidelity fill math + the co-run isolation gate), CHANGES_AND_FIXES, RUNNING_ISSUES, ASSET_CLASS_ONBOARDING_WORKFLOW (depth-feed + validate-vetting learnings), MULTI_ASSET_VTS_EXPANSION_PLAN. Close gates: §7.1 sync both-directions-0, rule-19 CI all-4-green cited, push from Google-Drive.

---

## 7. Langston Step-1 outcome (2026-06-15) — APPROVE-WITH-CONDITIONS (all accepted, CC↔Langston consensus)

Full review: `Claude Comms and Packages/Langston Design Asks/P19_B4b_STEP1_LANGSTON_REVIEW.md`.

**★ DECOMPOSITION RATIFIED (O4).** Ship the Objective-3 co-run gate FIRST (zero depth-feed dependency, it IS the Phase-21 precondition), split the depth-fidelity work second:
- **B4b = D1 + D5** — split-brain audit (D1, read-only, own Step-4 review) + per-mode isolation implementation + the userId→mode rate-limiter fix + the 3-liveness-reader consolidation to the DB `isEngineActive` SSOT (D5). Highest value, unblocks Phase-21.
- **B4b.1 = D2 + D3 + D4** — depth-feed substrate + depth-walked fill model + `validate=true` vetting. All depth-feed-gated. The **B4b/B4b.1 boundary is finalized at Step-2 pre-audit** once O1 (depth surface) is resolved.

**Conditions (all accepted):**
- **C1** D1 ships first, standalone, its own Step-4 diff review.
- **C2** D2's home decided at pre-audit (default split to B4b.1); a depth-feed bug must never ship in the same diff as a fill-model bug.
- **C3** rate-limiter is a *scope-internal split-brain* — O-2 (lane) and O-3b (limiter) are the SAME work. Build ONCE in D5; D4 consumes it. (Scope §1 O-2 / §4 D4 corrected accordingly.)
- **C4** D3 depth-walks BOTH legs (entry AND exit slippage), not entry-only — entry-only leaves paper EV optimistic and defeats the #1 invariant.
- **C5** `validate=true` is fail-closed-with-alert on its own circuit-breaker on the isolated lane (2 new real Kraken calls in the paper hot path must not hang); covariance isolation = per-mode-KEYED state inside ONE engine, NOT a cloned singleton (no 2× compute — §8 #11 backpressure rule).
- **C6** the co-run gate is a NUMBERED hard-blocker item in PHASE_19_PLAN §5 + POST_AUDIT_ROADMAP Phase-21, with a verification owner — not prose in the completion report.
- **C7** name out-of-scope items with homes (RUNNING_ISSUES + revisit trigger): (i) maker/queue-position + latency fidelity (taker-only fills are the B4b.1 boundary), (ii) true 30-day-volume tier ladder.

**Open-question answers:**
- **O1** reuse the xStock depth-store **interface/abstraction**, build a **net-new crypto feed adapter** under it (one depth-store contract, two venue adapters). D1 returns the evidence-based verdict that fixes the B4b/B4b.1 boundary.
- **O2** static, DB-resolved fee — but resolve to **Kyle's account's actual current Kraken taker tier**, not the headline rate (else paper EV drifts from live). Volume-ladder revisit homed per C7.
- **O3** `validate=true` is param-correctness ONLY (pair/precision/min-size); it does **NOT** vet liquidity. D3 (depth-walk/partial) and D4 (validate) are orthogonal and both required — state this in the completion criteria so validate is never mistaken for fill realism.
- **O5** co-run gate wording (for PHASE_19_PLAN §5 + POST_AUDIT_ROADMAP Phase-21): *"Phase-21 (live+paper co-run) MUST NOT begin until P19-B4b Objective-3 is verified PASS: split-brain audit complete, per-mode isolation implemented for every singleton classified SPLIT-BRAIN-risk, and the 3 liveness readers consolidated to the DB `isEngineActive` SSOT with a divergence invariant-check. Any risk-classified singleton left un-isolated is a hard blocker."*

**NEXT:** Step-2 pre-audit (resolves O1 + finalizes the B4b/B4b.1 boundary) → D1 split-brain audit (read-only, own Step-4) → D5. "Send me D1 first" (Langston).

