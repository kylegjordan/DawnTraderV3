# P19-B6.8a — Scope

change-class: non_architecture

> **Retroactive note:** B6.8a was a small Kyle-directed UI sub-batch (2026-06-30) scoped conversationally and reviewed by Langston at Step-4/Step-8; this scope file + the companion pre-audit were authored at close to complete the governance doc-set (the governance-checker grades a closed batch's doc-set against its declared change-class). The work is fully recorded in `Batch Completion/P19_B6_8a_COMPLETION_REPORT.md`.

## Purpose
Relabel the guardrails tab as paper-specific and pin it to paper mode, per Kyle's 2026-06-30 directive (paper active-trading, live active-trading, and VTS now run as separate concurrent systems → each mode needs its own dedicated guardrails tab).

## Objectives
1. **Rename the tab button** "Guardrails" → "Paper Guardrails" (`goals-engine.tsx`).
2. **Replace the small `<ModeIndicator/>` badge** in the guardrails card header with a **big bold "Core Guardrails — {Paper|Live} Mode" header** (`core-four-guardrails.tsx`), color-coded (purple paper / blue live), derived from the mode.
3. **Pin the tab to paper** via a **required `mode: 'paper' | 'live'` prop** on `CoreFourGuardrails`, replacing the ambient `useTradingMode` toggle. Rationale: the trading-mode context defaults to `'live'`, so a static "Paper" label on a toggle-following tab would render LIVE risk-limits under a Paper header (mislabel-of-risk). Required (not defaulted) → tsc enforces every call site declares a mode.
4. **Defer the "Live Guardrails" tab** ("eventually" per Kyle) — a one-liner (`<CoreFourGuardrails mode="live" />`) given the prop design; give it a §13 named home.

## Non-goals / boundaries
UI-only. No server/endpoint/DB/migration change (the per-mode `/api/guardrails-v2?mode=` wiring is unchanged). `mode-indicator.tsx` retained (consumed by 7 other tabs).

## Verification criteria
Bench tsc-baseline GREEN; CI 4-green; deploy HTTP 200; §9.3 Claude-in-Chrome confirms the renamed tab + big bold "Core Guardrails — PAPER MODE" header + all 8 controls render. §13 home for the deferred Live tab exists.
