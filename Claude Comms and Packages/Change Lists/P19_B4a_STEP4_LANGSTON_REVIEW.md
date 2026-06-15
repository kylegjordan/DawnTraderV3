System-alerts queue checked — no active/unacknowledged/due entries. Proceeding to the review.

---

Read the B4a change list in full, anchored to it per §12. Here's my Step-4.

**APPROVE-WITH-CONDITIONS.** The implementation is sound, the blast-radius work on C5 is exactly the kind of fragile-coupling removal §15 wants, and all three decisions are correctly reasoned. Conditions are forward-looking (activation-time safety), not defects in what you've built. Ratifications below, then the conditions.

## Ratifications

**(1) C5 default-open — RATIFIED, with a homed precondition for activation.**

Agreed on the mechanics: explicit-allowlist would black out all crypto until a `crypto_spot` seed migration, the active path is dormant (C2 gated off), and the resolver throwing on cold cache *is* the fail-hard that satisfies the no-silent-fallback concern. So default-open is the right call for B4a.

But default-open has a real edge at activation: a freshly-onboarded asset class with **zero** `strategy_gates` rows runs *every* strategy by default. For xStock — thinner books, less-tested path — that's uncontrolled exposure if seeding is forgotten. So I'm ratifying default-open on one condition: the `strategy_gates` seed migration (crypto_spot + xstock_spot, establishing the intended per-class enablement) gets a **named home now**, not "a follow-up if you want it." Per §13 a surfaced item can't sit as a vague deferral. My call: home it to **B7b activation pre-flight**, and the pre-flight must assert `strategy_gates` is non-empty for any asset class being switched on — so default-open can never silently green-light the full strategy set on a thin class. Put it in RUNNING_ISSUES with that home and reference it in PHASE_19_PLAN §5 (§14 upkeep).

**(2) C7 SET NOT NULL deferral (#237) — RATIFIED.**

Consistent with decision-6. You can't soak a constraint flip against a table nothing writes; a zero-null window on zero writes is vacuous and the scope itself says a vacuous soak must not gate the flip. The substantive A4 deliverable — the resolver-backed write (C1) — shipped. Flip waits for real writes post-activation. This is the NO-PATCHES-correct move: you flip on observed-clean evidence, not on faith. Confirmed homed to B7b/#237.

**(3) C8 0.50 → 0.15 cap — RATIFIED.**

Straightforward and correct. A less-liquid asset class cannot carry a *higher* single-position concentration cap than crypto — 0.50 pointed the wrong direction at 3.3× the validated crypto value. Lowering to crypto-aligned 0.15 is risk-reducing, DB-adjustable, and the final per-class evidence-calibrated value stays open as #153 (Phase-25/B7b pre-flight). Good honest finding on the cap being non-binding today — don't let that honesty get lost; the manifest should note it's an interim risk-floor, not a calibrated value.

## Conditions (none block push; all are confirm-or-home)

1. **C5 seed migration homed** as above — RUNNING_ISSUES + PHASE_19_PLAN, B7b pre-flight, with the non-empty assertion. This is the one I actually care about.
2. **C5 ID key-space sweep.** You normalize `range_trading` → `range_trade` at the gate. Confirm that's the *only* divergence between the orchestrator `strategyId` space and the `strategy_gates` resolver key space across all 18 canonical strategies — i.e. the other 17 match the DB keys verbatim. A silent miss there means a strategy slips the gate (default-open → it runs) or gets wrongly blocked. One-line confirmation is enough.
3. **C5 reb-2-12F semantic shift.** Re-pointing `strategy-health` from the deleted Set to `Object.keys(STRATEGY_DISPLAY_NAMES)` changes what it reports — old Set was the **9 enabled**, the map is **all 18**. Post-C5 there's no static enabled list to point at, so the map is the only sane static target — but confirm nothing downstream of that diagnostic keys off "enabled count = 9." (Pointed relevance: BUG-2026-05-06-A shipped on a wrong "9 active strategies" read; let's not have a diagnostic now assert 18-as-enabled to a consumer expecting 9.)
4. **C6 string parity.** Confirm `'pre_calibration_xstock_2026_05'` matches the VTS-side F-NOW tag **character-for-character** — a typo silently splits the calibration cohort. And note in CHANGES_AND_FIXES that the column is inert until a write-path batch transitions rows (currently default tags everything).

Conditions 2–4 are confirmations you can answer inline; condition 1 needs the home written before B4a closes. Land those and you're clear to push. Nice work on the Set disposal and the source-text-coupling catch — that diagnostic regex was a landmine.
