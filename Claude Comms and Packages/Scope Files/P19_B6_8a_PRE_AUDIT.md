# P19-B6.8a — Pre-Audit

change-class: non_architecture

> **Retroactive note:** authored at close to complete the doc-set for this UI sub-batch (see scope file's retroactive note). The pre-audit below is the code investigation actually performed before implementing.

## Verified code reads (2026-06-30)
- **Live render site:** `client/src/pages/goals-engine.tsx:71` renders `<CoreFourGuardrails />` as the sole guardrails-tab body. The OLD `GuardrailsTab` was already §15-removed in B6.8. So `CoreFourGuardrails` is the only guardrails UI to change.
- **Mode source (the load-bearing finding):** `core-four-guardrails.tsx:157` read `const { mode } = useTradingMode()`. `trading-mode-context.tsx:22` initializes mode to **`'live'`** when nothing is stored (`(stored === 'live' || stored === 'paper') ? stored : 'live'`) and the toggle is globally switchable. So a static "Paper" label on a tab that follows the ambient mode would mislabel **live** `guardrails_v2` limits as paper on a fresh load — a risk-screen mislabel, not cosmetic. → pin to paper via a required prop.
- **`mode` usages in the component** (all now sourced from the prop, logic unchanged): fetch + save `/api/guardrails-v2?mode=${mode}` (:186/:200), queryKey (:184/:218), success toast (:223), RULE_011 per-mode coherency message (:254).
- **Call-site count:** only `goals-engine.tsx` renders `CoreFourGuardrails` (grep-confirmed) → one site to pass `mode="paper"`; required prop makes tsc enforce it.
- **`mode-indicator.tsx`:** consumed by 7 other tabs (coherency-rules, filters-with-override, goals-summary-widget, low-priced-protection-card, performance-tracking-metrics, strategies-tab, target-daily-goals) → retained; only the 2 imports in `core-four-guardrails.tsx` are removed (no stub, §15 clean).

## Blast radius
UI-only. No server/endpoint/DB/migration. The per-mode v2 backend (`guardrail-policy.checkGuardrailRisk`, `daily-loss-budget.ts`) is untouched. Interim consequence: live-mode guardrails become UI-uneditable until the deferred Live tab is built (live dormant until Phase-21; live `guardrails_v2` row persists) → §13 home RUNNING_ISSUES #401 + roadmap §21.3 (21-3a).

## Langston Step-4 conditions (met)
(1) call-site passes literal `mode="paper"` (eyeballed + Langston grep-confirmed on staging); (2) §13 home named for the Live tab; (3) two mode-leaks to fix when building the Live tab captured at 21-3a (hardcoded `/api/paper-sim/portfolio-summary` balance fetch + keep copy prop-derived).
