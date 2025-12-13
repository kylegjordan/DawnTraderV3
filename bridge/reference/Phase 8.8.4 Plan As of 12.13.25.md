Where We Are Coming From (8.8.3 Closure Summary)

By the end of 8.8.3, the system has achieved:

✅ Financial Integrity (Locked)

Gross vs Net P/L fully separated and correct

Fees + slippage modeled explicitly and transparently

Balance → guardrails → sizing loop verified

No phantom P/L or balance drift

Manual closes behave correctly and persist

✅ Execution Safety

No duplicate open trades

Clean trade lifecycle (open → update → close)

Reset behavior understood and controlled

Ghost trades clearly defined and filtered correctly

✅ Observability (Temporary)

Heavy diagnostics added (C5/C6)

Verified math, scope, analytics, guardrails

Diagnostics explicitly not permanent

✅ UI Truthfulness

Active Trades = live net reality

Trade History = closed truth

Analytics scopes mostly correct (except “current simulation” definition)

At this point:

The engine is financially correct and operationally safe.

What it is not yet is selective, opinionated, or quality-driven.

That is exactly what 8.8.4 is for.

Phase 8.8.4 – Core Objective

Turn DawnTrader from “correctly executing signals” into “intelligently selecting which signals deserve capital.”

This phase does not change:

P/L math

Execution mechanics

Guardrails

Risk enforcement

It changes:

Which signals reach execution

In what order

Under what confidence and volume conditions

Phase 8.8.4 – Scope Breakdown
8.8.4-A — Signal Ranking Engine (Foundational)

Goal:
Introduce a deterministic, explainable ranking system for Ready-To-Buy (RTB) signals.

What gets added

A SignalScore object per RTB signal

Score composed of weighted components:

Volume quality

Confidence

Strategy class weight

Market conditions (optional, phase-gated)

Ranking performed before slot assignment

Explicit rules

Ranking does NOT open trades

Ranking does NOT bypass guardrails

Ranking only decides priority

Output

Sorted RTB queue

Clear reason why signal A beats signal B

8.8.4-B — Volume Quality Integration (Deferred from 8.8.3)

You explicitly postponed this — correctly.

Goal:
Make volume a quality filter, not a raw threshold.

Additions

Normalize volume per symbol / timeframe

Volume percentile or z-score

Reject “technically valid but illiquid” signals

Non-goals

No new WebSocket subscriptions yet

No microstructure modeling yet

This feeds directly into SignalScore.

8.8.4-C — Confidence Standardization (LATTI-Compatible)

Goal:
Ensure confidence is:

Comparable across strategies

Predictable for LATTI later

Safe for ranking

Actions

Normalize confidence to a strict range (e.g. 0–100)

Document how confidence is computed per strategy

Prevent confidence inflation

This prepares the ground for Phase 11 (LATTI re-integration).

8.8.4-D — Ready-To-Buy Pool Governance

Goal:
Stop RTB from being a dumping ground.

Rules to add

Max RTB size

Signal expiration logic (time-based + relevance-based)

Replacement rules (better signal displaces worse)

This prevents:

Stale signals

Overcrowding

Execution randomness

8.8.4-E — Execution Selection Logic

Goal:
Define exactly how trades are chosen when slots are available.

Logic

Guardrails pass?

Slots available?

Take highest-ranked RTB signal

Re-validate price & liquidity

Execute or discard

This logic must be:

Deterministic

Logged

Testable

8.8.4-F — Analytics Scope Fix (Deferred Bug)

You explicitly called this out.

Fix definition

“Current Simulation” = trades since engine start

Engine start timestamp stored explicitly

Analytics queries reference that timestamp

No new analytics features — just correctness.

8.8.4-G — Diagnostics Reduction (Phase D Lite)

You already flagged this.

Actions

Remove or downgrade C5/C6 verbose logs

Keep:

Balance reconciliation checks (summary only)

Guardrail input verification (summary only)

No logic removal, only noise reduction

Explicit Non-Goals of 8.8.4 (Important)

This phase does NOT:

Add LATTI decision authority

Add live microstructure signals

Add ML optimization

Change trade math

Add new exchanges

Introduce portfolio-level optimization

Those are future phases and must stay isolated.

Exit Criteria for 8.8.4

You should be able to say:

“I know why a trade was selected”

“Better signals consistently displace worse ones”

“Low-quality volume trades don’t sneak through”

“The system behaves predictably under load”

“We are ready to let LATTI optimize, not guess”

If any of those are not true, 8.8.4 is not done.

Strategic Importance (No Sugarcoating)

If 8.8.3 made the system correct,
8.8.4 makes it dangerous in a good way.

This is where:

Trade count becomes intentional

Capital is allocated with purpose

The foundation for AI optimization is laid

Rushing past this phase would guarantee future pain.

Doing it properly means:

8.9+ becomes leverage, not repair work

LATTI has something worth optimizing

Walter 2.0 (if revived) plugs into a sane system