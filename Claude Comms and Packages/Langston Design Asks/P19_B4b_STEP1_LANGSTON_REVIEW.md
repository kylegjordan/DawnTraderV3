Anchored to the inbox file. Verification quote from scope sec 0, finding 1: *"There is NO live L2 order-book depth feed for crypto... `OrderBookEntry`/`KrakenOrderBook` types exist but are never instantiated."* Reviewing against that, not MEMORY.

## Step-1 call: APPROVE-WITH-CONDITIONS

The 3 objectives are right and the scope-shaping read is exactly the never-improvise discipline I want to see — you surfaced the depth-feed gap *before* sizing the fill model on top of a substrate that doesn't exist. That's the difference between this and the B72.1 filesystem-only miss. Good. Conditions below, then O1–O5.

### Conditions (7)

**C1 — D1 ships first, standalone.** The split-brain audit is read-only, low-risk, and gates everything. It gets its own Step-4 diff review as a reviewable artifact before D2+ start. Ratified.

**C2 — D2's home decided at pre-audit, default = split to B4b.1.** I can't size the crypto book from here, but a live L2 book-maintenance layer (snapshot + incremental, checksum validation, gap-resync, reconnect) is a meaty independently-riskable piece. If O1 resolves "crypto is net-new `book.25` WS," D2 splits to B4b.1. If the xStock B-1.5 store generalizes, it stays. Don't pre-commit the boundary; do pre-commit that a depth-feed bug must not be allowed to mask a fill-model bug by shipping in the same diff.

**C3 — fix the rate-limiter double-home (scope-internal split-brain).** O-2's lane isolation and O-3b's limiter isolation are the *same work* — the userId-keyed limiter is one of your three split-brain singletons. Implement it ONCE, in D5 (Objective-3 isolation), and have D4 consume it. As written, D4 and D5 both own the limiter split. O-2 is satisfied by D5; don't build it twice.

**C4 — D3 walks the book on BOTH legs.** Friction = entry slippage + exit slippage + entry fee + exit fee. Scope O-1d says validate fires on every open/close, but O-1a/D3 must depth-walk open AND close. Entry-only slippage leaves paper EV optimistic, which defeats the #1 invariant.

**C5 — failure-mode discipline on the net-new external dependency.** validate=true now puts 2 real Kraken calls in the paper hot path that weren't there. A validate timeout / venue-down must be fail-closed-with-alert (not a hang), on its own circuit-breaker, on the isolated lane. And the covariance isolation must be per-mode-keyed state inside ONE engine, not a cloned singleton — cloning is the asset-class-shedding-equivalent the §8 #11 backpressure rule rejects; the answer is smarter keying, not 2× compute.

**C6 — co-run gate gets a real home (O5/§13).** Objective-3 PASS as Phase-21 precondition must be written into PHASE_19_PLAN §5 decision log AND POST_AUDIT_ROADMAP Phase-21 as a named, numbered hard-blocker item — not prose in the completion report. See O5 wording below.

**C7 — name the out-of-scope items with homes (§13).** Two things this batch deliberately doesn't cover and must not read as covered: (i) maker/queue-position + latency fidelity (taker-only fills are a fine B4b boundary), (ii) true 30-day-volume tier ladder. Both get RUNNING_ISSUES entries with a revisit trigger so a later grep doesn't read silence as completeness.

### Open questions

**O1 — depth surface.** Pre-audit resolves the data, but my architectural expectation: reuse the xStock depth-store *interface/abstraction*, build a *net-new crypto feed adapter* under it. xStock and crypto are different venues — the B-1.5 store almost certainly gives you the pattern, not the crypto data. One depth-store contract, two feed adapters. Have D1 explicitly return the verdict so C2's boundary call is evidence-based.

**O2 — fee tiering.** Agree with your recommendation — static, DB-resolved, NOT a dynamic ladder (that's manufactured complexity; we have no live volume history to drive it). One correction: resolve to **Kyle's account's actual current taker tier**, not Kraken's headline rate. If his account sits at a different tier, paper EV drifts systematically from live. DB-adjustable, with the volume-ladder revisit homed per C7.

**O3 — validate scope.** Confirmed: validate=true is a param-correctness gate (pair/precision/min-size), we discard Kraken's response, the internal depth-walked fill is recorded. Rule-20/P19-B2 posture intact. Critical non-conflation: **validate does NOT vet liquidity** — it checks params, not whether the book can fill the size. So D4 (validate) and D3 (depth-walk/partial-fill) are orthogonal and both required; state that explicitly in the completion criteria so nobody later thinks validate covers fill realism.

**O4 — sequencing.** D1 first, standalone (C1). Dependency chain is D1→D2→D3→D4, with D5 keyed off D1's design. So the natural decomposition if D2 splits: **B4b = D1 + D5** (the full Objective-3 co-run gate + limiter/liveness isolation — highest value, zero feed dependency, it's the actual Phase-21 precondition) and **B4b.1 = D2 + D3 + D4** (fill-fidelity substrate + model + validate, all depth-feed-gated). That ordering ships the gate that unblocks Phase-21 first and de-risks the long pole second. Ratify D1-standalone now; ratify the B4b/B4b.1 line at pre-audit per O1.

**O5 — co-run gate wording.** Yes, hard precondition. Proposed text for PHASE_19_PLAN §5 + POST_AUDIT_ROADMAP Phase-21: *"Phase-21 (live+paper co-run) MUST NOT begin until P19-B4b Objective-3 is verified PASS: split-brain audit complete, per-mode isolation implemented for every singleton classified SPLIT-BRAIN-risk, and the 3 liveness readers consolidated to the DB `isEngineActive` SSOT with a divergence invariant-check. Any risk-classified singleton left un-isolated is a hard blocker."* Make it a numbered gate item with an explicit verification owner, not a soft note.

Net: greenlight the shape, fix the limiter double-home and the both-legs slippage at Step-1, let the pre-audit decide D2's boundary and O1. Send me D1 first.
