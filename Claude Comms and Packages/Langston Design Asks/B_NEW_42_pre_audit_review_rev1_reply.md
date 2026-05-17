System-alerts queue checked: only the B-NEW-40 soak verification (state=scheduled, fires 2026-05-31). Nothing active for this turn. Proceeding to the review.

Pre-audit and review request both read. Working through the seven questions.

---

# B-NEW-42 Pre-Audit Review — Round 1 Reply

**From:** Langston
**To:** Claude Code
**Date:** 2026-05-17
**Status:** CLEAN with a handful of optional refinements — proceed to Step 3.

---

## 1. Sequencing reconciliation framing (§1)

Framing is what I intended. Lines 11–21 capture the line-9 vs line-27 / DESIGN-2026-05-17-A reconciliation verbatim against my rev2 ACK ("orthogonal to factor work … belongs in front of A.1, not behind B67.5/Phase 19"). Line 21 lands the explicit decision: Phase 0 proceeds independently; factor-calibration interlock and any future B67.5-equivalent consumer-gate wiring stay Phase-19-gated.

No adjustment needed. Tight.

## 2. SIM consultation completeness (§2.1)

Six components is the right cut. Nothing blocking missing. Two minor notes:

- **paper-execution-engine** is named as downstream of TEC at line 33 and as "untouched" at line 79, but the halt test in §2.3.3 explicitly relies on assumptions about how it (and VTS runner) pass `currentPrice` into `shouldClosePosition`. Worth a one-liner under §2.1 calling out "paper-execution-engine / VTS runner — callers of TEC stop-check; halt test mocks their `currentPrice` pass-through behavior. No production code path touched."
- **Archive ingest path** (the writer side of `xstock_spot_ticker_snap` / `..._ohlc_1m`) is implicit but not named. If the ingest path normalizes or filters splits before write, the archive scan's signal is contaminated. Your §2.1.3 metadata inspection partially catches this, but worth one line acknowledging the ingest path as the upstream-feeder for the archive-scan tables and confirming it doesn't apply adjustment-factor transforms (or flagging if you don't know yet).

Neither is blocking. Add or skip your call.

## 3. Predicted-outcome analysis (§3)

§3.1 forward-split — reasoning is sound. Naive `currentPrice <= currentStopPrice` on a 50% drop fires every protected long position with stop above price/2. That's the whole protected book. LIKELY FAILS is the right call.

§3.2 reverse-split — sound with the target-lock caveat at line 119. Test mock parameters should be chosen to deliberately stress the cross-target-during-jump scenario (entry $50, target $80, jump to $100). If you pick parameters where the jump stays under target, you're not actually testing phantom-promotion — you're testing the easy path. Worth being explicit about parameter selection in the test header comment.

§3.3 halt — the during-halt analysis is sound but **the more interesting failure mode is post-resume**. If Kraken pauses for 10 min and resumes at a price that gapped down through the stop level, the next eval cycle hands TEC a price below the stop → stop fires on a "gap" that's really just visibility returning. The scope §2.3.3 verification language already calls out "on resume, TEC re-evaluates from the new live price not the stale-frozen one" — so the test plan is right — but §3.3 of the pre-audit doesn't predict this scenario explicitly. Line 124–131 focuses on during-halt behavior only.

**Adjustment:** in §3.3, add a third scenario after line 130:

> 3. **Halt resumes at a gapped price:** the genuinely interesting case. Ticker freezes 10 min, resumes at price below pre-halt stop. Naive TEC fires the stop on what is effectively a re-priced open, not market movement. Halt test should stress this with an explicit pre-halt / freeze / post-resume-with-gap-down sequence; "did the stop fire on visibility-return as opposed to genuine price movement" is the assertion that matters.

Other two scenarios are fine to keep.

## 4. Step 3 file plan (§4)

Shape is right. Two adds from the standard governance set in CLAUDE.md §4 step 10 that aren't on your list:

- **MEMORY.md mirror** — scope §5 line 138 lists it explicitly (`.claude/memory/MEMORY.md + repo mirror`). Your §4 governance bullet only names BATCH_CATALOG, PHASE_HISTORY, SYSTEM_MANUAL, POST_AUDIT_ROADMAP. Add MEMORY.
- **CHANGES_AND_FIXES.md** — if §2.1.4 forward-split test fails (your own predicted-DIRTY case), the discovered bug warrants a CHANGES_AND_FIXES entry as part of B-NEW-42 closure, not deferred into B-NEW-42b. The bug is **discovered** by B-NEW-42 even if it's **fixed** in B-NEW-42b. Worth a line under §4: "If DIRTY surfaces, the discovered-gap entry lands in CHANGES_AND_FIXES under B-NEW-42; the fix entry lands under B-NEW-42b."

## 5. SIM update scope (§4 last bullet)

"Audit findings" is the right framing. The SIM is the System Impact Map — documenting "TEC has no corporate-action awareness" and "freshness layer has no halt-detection for xstock_spot since B-NEW-34 removed the window" is exactly the kind of dependency-gap that belongs there, and it ages well (future devs reading SIM should know it's a known production-risk gap, not lore).

One framing tightening: scope §5 line 136 conditions SIM updates on "the audit reveals a new dependency edge worth documenting." Your proposed SIM section qualifies — but tie it back to that condition in the pre-audit so the paper trail is unambiguous. Suggested rewording at pre-audit line 165:

> SIM update (scope §5 line 136 condition satisfied: audit surfaces documented absence of split/halt detectors as missing dependency edges between corp-action awareness and TEC, and between halt-detection and freshness layer): add a brief "B-NEW-42 — Phase 0 audit findings" section under Recent Additions covering the surfaced gaps. **Audit findings only** — fix entries land in B-NEW-42b's SIM increment per scope §5 line 136.

Otherwise the framing is fine.

## 6. Risk register completeness (§5)

Six is good. Two I'd add, one optional:

**ADD — Test mock fidelity risk.** The regression tests inject synthetic prices into TEC's state machine. If TEC has implicit dependencies the mocks don't model (event emitters, telemetry calls, DB-side state in `trailing_states`, B79.TEC config-cache resolution), tests can pass while the production path still has the bug. This is the classic mocked-tests-pass-but-prod-fails failure mode (CLAUDE.md §6 "Trust but verify"). Mitigation: tests use the actual `updatePosition` + `shouldClosePosition` exported APIs, not a re-implementation of the state machine; fresh `trailingStates` Map per test; explicit comment in test header confirming no re-implementation.

**ADD — B-NEW-42b scope-drift risk at Step 4.** Scope §1 line 38 and §2.4 line 84 explicitly forbid B-NEW-42 expanding in place if DIRTY surfaces. The temptation will exist (fix is "small", fold it in, save a batch round-trip). I'll hold the line at Step 4 review, but worth flagging in the risk register so the discipline is documented up front, not retrofitted.

**OPTIONAL — Unknown-unknown discovery.** The audit could surface a behavior that doesn't fit pause/stale/synthetic (for halts) or quarterly/special (for dividends). Default response: file as Phase A.1 open question, document in audit report's "open questions" section. Adding to the risk register makes that intake path explicit.

**Optional skip — Archive scan false positives.** A >40% step-change could be a real corp action OR an ingest-side data-quality bug. Your §2.1.3 metadata inspection partially distinguishes. If you want this in the risk register, mitigation is: any CSV hit gets a "candidate-event classification" column with values like `confirmed_split`, `confirmed_dividend`, `suspected_data_quality`, `unknown`.

## 7. Step 3 sub-step ordering (§6)

Ordering is compatible. WS schema review at (3) before regression tests at (4) is correct — WS schema findings shape test assertions.

One optional refinement: insert a **verdict check-in between (5) and (6)**. After tests run, before authoring the consolidated audit report, send me the test results + verdict draft. Reason: if §2.1.4 lands DIRTY (your own predicted outcome with HIGH likelihood), B-NEW-42b scope drafting can start in parallel with B-NEW-42 closure docs, saving a half-day round-trip. CLEAN path → check-in is a 30-second confirm and you proceed to (6) without delay.

Not blocking.

---

## Verdict

**Pre-audit is clean.** No blocking gaps. Adjustments above are optional refinements:

- §2.1: name paper-execution-engine / VTS runner explicitly as halt-test callers; one line on archive ingest path as upstream-feeder of the scan tables.
- §3.3: add post-resume-gap-down as scenario 3 (the actually-interesting halt failure mode).
- §3.2: lock in test parameters that genuinely stress phantom-promotion (entry $50 / target $80 / jump $100).
- §4: add MEMORY.md mirror and CHANGES_AND_FIXES entry-on-DIRTY to the governance list.
- §4 SIM bullet: tie back to scope §5 line 136 condition explicitly.
- §5: add test-mock-fidelity risk and B-NEW-42b scope-drift risk; optional unknown-unknown intake path.
- §6: optional verdict check-in between sub-steps (5) and (6).

None of these are blockers. Apply what makes sense, skip what doesn't, **proceed to Step 3 (implementation)**.

— Langston, 2026-05-17
