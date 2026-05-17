Read the check-in, the full audit report, and noted the staging alert (`b83b1e4b` scheduled for 2026-05-31, not active yet — surfacing per §10.5).

Numbered responses below.

---

**1. Verdict confirmation: DIRTY agrees.**

The evidence justifies DIRTY cleanly. Two regression-test-confirmed structural gaps (split + halt-resume) plus 462 empirically-observed resume-gap candidates in 7 days is well past the "structural-but-theoretical" bar. The dividend INCONCLUSIVE branch doesn't pull the verdict toward CLEAN — it parks the question at Phase D where the calendar infra lands. Note your nuance about the B79.0L weekend gate is exactly right and worth carrying into B-NEW-42b's risk-register: the gate changes the *operational urgency* of the corp-action exposure but NOT the structural verdict. A fix is still required; we're choosing how soon to ship it.

**2. Priority ordering: halt-detector first, but in the same batch.**

Halt-detector is the load-bearing piece — intra-RTH undefended, 462 observed candidates, empirical max 4.6% (EDU/USD). Corp-action exposure is structurally real but operationally narrowed by the weekend gate. So halt is primary.

But don't split into B-NEW-42b (halts) + B-NEW-42c (corp-actions). That adds round-trip cost for a low-blast-radius parallelizable addition. Single B-NEW-42b batch: halt-detector built and green first, corp-action-detector added as the second flag-type in the same module before ship. Sequence the implementation in scope §3 explicitly so the halt fix isn't gated on the corp-action design.

**3. Sentinel architecture: single module, but rename it.**

I agree with the single-module lean on TEC-integration grounds (one consumer call, one gate site, easier to reason about). My push-back is on the name. `corporate-action-detector.ts` covering halts is misleading — a halt is not a corporate action, and the next person reading TEC's stop-check site will be confused about why a halt routes through corp-action code.

Propose: `price-discontinuity-detector.ts` (or `tec-discontinuity-sentinel.ts`) exposing something like `isDiscontinuityActive(symbol, prevPrice, currentPrice, prevTs, currentTs) → { active: boolean, kind: 'corp_action' | 'halt_resume_gap' | 'ex_dividend' | ..., cleared_at?: Date }`. TEC consumes the boolean; the `kind` field exists for logging/telemetry. Phase D's ex-dividend block plugs in as a third detector class inside the same module without forcing a TEC re-integration. The naming reflects the *concern* (price discontinuity → skip stop check) rather than the *cause*, which makes it extensible.

**4. Audit-report gaps — five items, mostly for B-NEW-42b scope §risk to address rather than re-audit:**

a) **Pass B deferral conflation.** Audit §1.1 says "Pass A's null finding at EOD-snapshot level is conclusive." That's true for overnight-effective corp-actions but NOT for intra-session events (mid-session special dividends, spin-offs, exchange actions). The deferral is defensible on critical-path grounds — but state it as "accepted residual uncertainty, intra-bar discontinuities unscanned" in B-NEW-42b §risk, not as "we know there are zero events in window."

b) **No archived intra-RTH halt+gap event.** The max-gap candidate (EDU/USD 4.6% at 2026-05-11 01:30:51 UTC) is overnight (~9:30PM ET), not RTH. The audit acknowledges "true intraday halts in the archive window appear to be rare-to-zero." B-NEW-42b is being designed against a structural-behavior assumption (Kraken can resume with a gap and we believe it can during RTH too), not against an archive-observed-during-RTH proof. Worth one-line in B-NEW-42b §risk so we don't claim more empirical grounding than we have. The structural fix is still correct; the assumption just needs to be visible.

c) **Dividends interim posture undefined.** Defer-to-Phase-D is fine, but if Phase D is N weeks out we have no posture in the interim. Two reasonable options: (i) curated-calendar 1-2h pre-open ex-date block for the 15 named dividend payers (publicly known dates, low effort), or (ii) explicit "risk-acknowledged-unfixed-until-Phase-D" entry in POST_AUDIT_ROADMAP. B-NEW-42b scope should pick one. My lean is (i) — 15 symbols, four quarterly dates per year per symbol = ~60 dates to maintain manually until Phase D, which is trivial. Real money risk on dividend-gap-down through a stop is worth 60 lines of curated JSON.

d) **Sentinel threshold calibration not yet specified.** The audit's `candidate_halt_with_resume_gap` rule is `>5min gap + ≥0.5% price change`. The 96% no-movement cases get safely ignored either way; but the 3% bucket (0.1-0.5%) is borderline. B-NEW-42b scope §sentinel-design needs to nail down the production threshold and justify it (false-positive-skip is acceptable, false-negative-unfillable-fill is not — so err tight). Suggest starting at the same `>5min + ≥0.5%` audit threshold and tuning per per-asset-class config if needed.

e) **Test-mock comment.** The B79.0L market-hours mock in the audit tests is a fidelity-flag worth a multi-line comment at the top of each test file explaining why it's mocked, when CI runs the same path (CI on Sunday), and what the mock-removal failure mode looks like (tests silently no-op via the gate). Prevents a future cleanup pass from "obviously this mock is unused" → silent test rot.

---

**Go decision: proceed both tracks in parallel.**

(a) Draft B-NEW-42 completion report — DIRTY verdict, three branches summarized as above, governance-files-changed list mandatory per §10 #10.

(b) Draft B-NEW-42b scope — halt-detector primary, corp-action-detector secondary, single `price-discontinuity-detector.ts` module (rename per Q3), risk-register including items (a)–(e) above, dividend-interim-posture decision called out for my round-1 review.

Send the B-NEW-42b scope when ready — I'll prioritize the round-1 read inside 30 min of receipt.
