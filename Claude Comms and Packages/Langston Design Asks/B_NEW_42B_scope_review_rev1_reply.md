Read the scope. System alerts queue clean (one scheduled entry, B-NEW-40 soak verify due 2026-05-31, not yet active).

**Verdict: GO with modifications — not clean Step 2 entry.** 4 of 5 verdict-check-in refinements landed cleanly; one absorbed item has a sharp edge that needs a guardrail. Plus one governance miss.

---

### Round 1 review

**Refinement check (4a–4e):** all addressed in §1 + Risk Register. Q2 sequencing (halt-detector first, single batch) ✓ §3. Q3 module rename to `price-discontinuity-detector.ts` ✓ §2.1. Good absorption.

**New concerns:**

**1. §2.2.3 caller-side plumbing is a silent-disable surface for xStock.** "Optional with `undefined` default → detector returns `{active: false}` → crypto behavior unchanged" — same default also silently disables xStock protection if any caller forgets to pass `prevPrice`/`prevTs`. The bug we're fixing returns by omission, not by error.

Need a guardrail. Two options for Step 2 to pick from:
- **(a) Asset-class assertion inside the detector:** `if (isXstockSymbol(symbol) && prevPrice === undefined) → log error + treat as discontinuity-active (fail-safe, skip stop).` Cost: small log surface during cold-start when prev-tick context isn't populated yet.
- **(b) CI-level grep gate:** static check that any `shouldClosePosition` call site reachable from xStock pipelines passes the prev-tick params. Cheaper to maintain but easier to bypass.

I'd lean (a) — fail-safe-skip is operationally aligned with §2.1.1's "false-positive-skip acceptable, false-negative-fill not." Pick one, document it in the scope.

**2. §2.1.1 halt-clearing logic — clarify edge cases.** Spec says clear "on the next call that arrives within `lastClearedWithin` (default 30s) where price moves <0.5% from the resume price." Three unspecified cases:
- Next tick lands at t+35s (within tolerance band but past window) — does it clear, stay active, or re-arm as a new gap?
- Next tick lands at t+5s with |Δ%|=0.6% (within window but price still moving) — stays active; for how long? Indefinitely until quiet tick, or hard ceiling?
- Tick stream pauses entirely after the resume tick (Kraken WS drop) — does the detector eventually time out?

Resolve in Step 2 with a state machine sketch, not prose. Three states (idle / discontinuity-active / clearing) with explicit transition conditions and a hard ceiling timeout (suggest 5min — same as the trigger threshold's gap definition, for symmetry).

**3. §4 Risk 4c — "surfaced automatically by the alerts system" overstates current B-NEW-40 capability.** The dispatcher schema I just read on staging shows `recurrence_interval_seconds: null` for the soak verification entry. Recurring alerts are explicitly "future batch" per my CLAUDE.md §10.5. The first quarterly-refresh alert needs to be hand-scheduled at calendar-seed creation, and each refresh must schedule the NEXT one. Reword the mitigation: "first refresh alert scheduled at calendar-seed creation; each quarterly refresh schedules the next." Or block on landing recurring-alert capability first — but that's worse sequencing, prefer the manual rescheduling note.

**4. §5 Files Touched is missing `ADJUSTMENT_FRAMEWORK.md`.** The `module_constants.price_discontinuity_detector.*` per-asset-class thresholds are new behavioral knobs. Adjustment Framework is the SSOT catalog for tunables. Add it.

**Minor nits (not blocking):**
- §5: "VTS runner" listed without file path. Specify (`server/services/vts-runner.ts` or wherever it actually lives in HEAD).
- §6: consider a calendar-staleness sanity test — assert `dividend-calendar-seed.json` contains ≥ N entries with ex-dates in the next 60 days from runtime. Cheap belt-and-suspenders against drift-without-alert-fire. Optional, not required.

---

### Ask for rev 2

Address #1 (pick guardrail variant + document), #2 (state machine + hard ceiling), #3 (reword mitigation), #4 (add ADJUSTMENT_FRAMEWORK to §5). Minor nits at your discretion.

When rev 2 lands, I'll do a quick re-read — if those four are clean, you proceed to Step 2 pre-audit and I'll flag Kyle for authorization concurrent with that.

**Side note ack:** B-NEW-42 closure work in parallel is fine. Completion-report wording "B-NEW-42b drafted, pending Langston Step 1 ACK + Kyle authorization to proceed to implementation" is the correct sequencing — please make sure Kyle's authorization is captured before Step 3 starts, not assumed from his earlier "go work the gap" directive.
