# P19-B8.8 — SIZING-FALLBACK FAIL-LOUD SWEEP: Step-1 scope + design (rev1)

change-class: non_architecture
Owner: CC-B · 2026-07-16 · Home: #516 (Langston home-not-fold ruling at B8.7 Step-4),
PULLED FORWARD per Kyle's fix-on-find directive. Design-before-code per Langston:
"the sizing fallback's failure mode is silent-wrong-number, not loud-error."

## The complete fallback family (traced; every cite verified at the working tree)

**THE HEART — `active-position-sizing.ts:151-162` (the live sizing path):**
- `riskPerTradePct = parseFloat(guardrails?.portfolioRiskPerTradePct || '1.50')` PLUS a
  second `safeRiskPct = finite && >0 ? x : 1.50` re-fallback.
- `maxPositionPct = parseFloat(guardrails?.maxPositionPercentPct || '10.00')` PLUS
  `safeMaxPositionPct : 10.00`.
- `maxTotalExposurePct = raw != null ? parse : 100` PLUS `safeMaxTotalExposurePct : 100`
  — **the LOOSENING direction: a failed read silently sets the exposure cap to 100%.**
Every sized trade flows through these three. A guardrails-row read glitch today would
size positions on fabricated risk/cap/exposure numbers with zero log evidence.

**Siblings (same class, per-site disposition below):**
- `guardrail-settings.ts:179-181` `maxTotalExposurePct : '25.00'` (+ `maxPositionPercent`
  `'30.00'/'10.00'`, `lpcpMinNotionalUsd 25.00` in the same function).
- `goal-feasibility.ts:57` `parseFloat(guardrails.maxTotalExposurePct || '100.00')` —
  loosening-direction again, feeding a BLOCKING feasibility check.
- `routes.ts:1346` `maxTotalExposurePct: '25.00'` literal (config-route write default —
  classify at Step-2: a write-path default is a different animal from a read fallback).
- `m5e-validation-service.ts:114-123` private getDynamicSlots copy (`||40`/`||12`/`||8`).
- `ethical-reasoning-engine.ts:66` `maxPositionPercent: 10.0` — that subsystem's OWN
  constraint constant, not a DB-read fallback; classify (likely out of family).

## The fail-loud DESIGN (the Step-1 question Langston set)

A sizer cannot skip-a-tick, and a NaN size is worse than a fabricated cap. The design:
**reject-the-signal-loudly.** `calculatePositionSize` already has an `invalidResult`
(zero-size) contract, and the engine already refuses quantity<=0 as `SIZING_INVALID` —
the loop survives, the signal dies visibly. So: on ANY missing/unparseable/non-positive
DB-governed sizing input, the sizer logs a distinct
`[P19-B8.8][SIZING_GUARDRAIL_READ_FAIL]` error naming the field + returns
`invalidResult`. No substitution, no NaN downstream, no loop damage — the same
safe-degrade shape as the B8.7 admissions guard, adapted to the sizer's contract:
admissions halt a tick; sizing refuses a signal. Both loud, both fabrication-free.
A bounded counter (existing `rtbMetricsService` instance, no new singleton) makes the
refusal rate observable; N consecutive refusals can ride the existing §10.5 escalation
pattern if Langston wants a rail (his call at review).

**Per-sibling dispositions:** goal-feasibility → same treatment (refuse the feasibility
PASS loudly; never assume 100%). guardrail-settings trio → raw pass-through (NaN flows;
every consumer is the loud guard — the B8.7 pattern). m5e private copy → same
fail-loud; also folds the #515 rider. routes:1346 + ethical-engine → classified at
Step-2 with evidence; not assumed into the family.

## Verification
Unit tests per field (missing/unparseable/zero/negative → invalidResult + the log);
the whole-row-absent case already throws upstream (verified at B8.7 — narrower trigger
here: field-level). §9.3 is N/A-visual (no UI surface) — evidence = tests + a staged
missing-field probe on the bench, NOT live staging (never break live sizing to prove
a guard). SIM content note at close (sizing degrade behavior).
