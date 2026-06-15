Step-2 review against the D1 deliverable. Verification anchor quote (per §12) — from §6: *"the reusable contract is the `{askDepthUsd,bidDepthUsd}` top-of-book interface; the depth-WALK is deeper than either class exposes today."* No active/unack alerts due on the staging queue.

---

**VERDICT: PROCEED on D1→D5 — WITH CONDITIONS.** Three of your four asks confirmed outright; one item in the table (S2) needs a feed-source check before you key it, and I have two missed-singleton classes to fold in. None are blockers to starting D5, but C1 changes what D5 actually writes for S2.

**(1) Liveness SSOT — CONFIRMED, two hardening conditions.**
- DB `system_context.isEngineActive` per mode as SSOT + kill the `setTimeout(…,0)` deferral is correct. But "synchronous-before-broadcast" must be **ordered on commit, not on call**: broadcast fires only *after* the write resolves, and **if the write throws, the broadcast must not fire at all**. A synchronous-but-unawaited write reintroduces the same race with a smaller window. Make the broadcast a `.then()` of the committed write.
- The 30s invariant-check (DB == engine-presence == orchestrator-presence == vtsAudit) will **false-positive on legitimate in-flight transitions** that straddle a tick. Add a settling guard — a transition-in-progress flag or "no flip within last N s" suppressor — before it increments `LIVENESS_SPLIT`. Otherwise you ship a noisy counter and Phase-21's co-run gate becomes untrustworthy on its first real start/stop.

**(2) The 6-item table — 5 confirmed, S2 flagged (C1).**
- S1 (portfolio mgr/heat) `Map<mode,Manager>`, S4 (risk-concentration, position-weight-derived → genuinely mode-specific), S3 (`${userId}:${mode}` shared limiter), S6 (conditional on signalId uniqueness), S13/S8 (per-mode derive): all correct.
- **C1 — S2 covarianceEngine may be MISCLASSIFIED.** If `returnHistory: Map<symbol,number[]>` is fed **market returns** (price-derived), the series and the pairwise covariance matrix are **mode-invariant** — same as S5/S14 which you correctly left SAFE-shared. Keying it `Map<mode,Map<symbol,…>>` then duplicates return history + pairwise compute for every overlapping symbol = exactly the 2× engine-dup the §8-#11 anti-backpressure rule (and your own §2 method) forbids. The mode-specific part is only the *portfolio-weighted* query, which already lives per-manager in S1. **Before D5 keys S2, confirm what populates returnHistory:** market returns → S2 downgrades to SAFE-shared, no keying (the S2-note "union-of-pools leak" dissolves because both modes mark off identical market returns); portfolio/fill/realized-P&L returns → your keying stands. Don't key it on assumption.

**(3) Delete dead `global.tradingEngines` in D5 — CONFIRMED.** Zero non-test writers is sufficient under rule-18. Standard certainty-before-cutting: `tsc` clean for no dangling refs, clean the test-only readers in the same pass (don't leave tests pointing at a deleted global), DELETED_COMPONENTS_LOG + `_archive/deleted-code/` `.removed`. Good home.

**(4) B4b/B4b.1 boundary — CONFIRMED.** D1+D5 zero feed dependency = the Phase-21 precondition, ships as B4b; D2/D3/D4 depth-walk → B4b.1 is right. The crypto `orderBooks` ladder existing-but-unwired plus xStock being top-of-book-scalar-only makes the walk net-new, not interface reuse. Agreed.

**Missed-singleton flags (fold into the §2 inventory at D5):**
- **M1 — daily-loss / kill-switch counter.** §2 lists MAX_DRAWDOWN *inside* the S1 manager, but the **max-daily-loss accumulator and kill-switch latch** are the canonical lockout state §5 warns about ("one mode's lockouts corrupting the other"). Confirm they live inside the per-mode manager (covered by S1's keying) or enumerate them separately — a module-level daily-loss counter would let live losses trip the paper kill-switch. This is the highest-consequence omission if it's not actually under S1.
- **M2 — trade-identity / dedup / position-clustering registry.** The CLAUDE.md risk taxonomy (trade identity tracking, exposure-stacking prevention, symbol clustering) implies an in-memory "recently-traded / open-position" registry somewhere in the orchestrator or signal path. If any of it is a global map outside S1, it's a split-brain item. Confirm it's S1-resident or add it.

**S3 scope note:** confirm O-2 = **one** shared limiter consumed by both lanes, and that D5 scope explicitly includes consolidating the 30+ ad-hoc `new KrakenService()` sites onto it — that's a real blast-radius, not a free rename. If the call-site consolidation is bigger than D5 should carry, home it as its own §9.4-tracked item now rather than discovering it mid-D5.

Net: start D5. Resolve C1 (S2 feed source) and M1 (daily-loss counter location) at the *top* of D5 — both can flip a table classification — then implement.
