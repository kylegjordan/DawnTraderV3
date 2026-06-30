# P19-B6.8a — Completion Report

**Batch:** P19-B6.8a — guardrails tab → "Paper Guardrails" (pinned-to-paper) + big bold "Core Guardrails — Paper Mode" header
**change-class:** non_architecture (UI label + component-prop change; no server/endpoint/DB/migration)
**Owner:** Claude New (CC-B) · **Reviewer:** Langston (Step-4 APPROVED)
**Closed:** 2026-06-30 (pending Kyle ack)
**Head:** `240b7eec7` · **CI:** <pending-green> · **Deploy:** staging restart, HTTP 200, **no migration**

---

## What Kyle asked (directive 2026-06-30)
1. Replace the small "PAPER" badge on the guardrails tab with a **big bold header** reading "Core Guardrails — Paper Mode".
2. Rename the **tab button** "Guardrails" → "Paper Guardrails".
3. A separate **"Live Guardrails" tab** comes **later** (eventually).
4. Context Kyle gave: paper active-trading, live active-trading, and VTS now run as **separate concurrent systems** — so each mode needs its own dedicated guardrails tab, not one tab on a shared toggle.

## The one design decision (Langston Step-4 APPROVED — "the right call, not just acceptable")
**Pinned the tab to paper via a required `mode` prop**, instead of leaving it on the ambient global trading-mode toggle.
- **Why it's required, not cosmetic:** `trading-mode-context` defaults to `'live'` (`trading-mode-context.tsx:22`), and the tab fetched/saved by that ambient mode. A static "Paper" label on a toggle-following tab would render **live** `guardrails_v2` limits under a "Paper" header on a fresh load — showing someone live risk-limits and telling them they're paper. Pinning makes the label **provably truthful**.
- **`mode` is REQUIRED (not defaulted)** → tsc is the call-site enforcer (a clean bench proves every consumer passes an explicit mode). Langston: "good property to lean on."
- The future live tab is a genuine one-liner: `<CoreFourGuardrails mode="live" />` + a `TabsTrigger`.

## Implementation (2 files, UI only)
- `client/src/components/goals/core-four-guardrails.tsx`: signature → `CoreFourGuardrails({ mode }: { mode: 'paper' | 'live' })`; removed `useTradingMode` + `ModeIndicator` imports; header `CardTitle` now renders a big bold colored "{Paper|Live} Mode" span (purple paper / blue live, `text-xl sm:text-2xl font-extrabold uppercase`, `data-testid="guardrails-mode-header-{mode}"`) in place of the small `<ModeIndicator/>` badge. All downstream `mode` uses (fetch/save `?mode=`, queryKey, toast, RULE_011 coherency message) now read the prop — logic unchanged, just sourced from the prop.
- `client/src/pages/goals-engine.tsx`: tab button "Guardrails" → "Paper Guardrails"; `<CoreFourGuardrails />` → `<CoreFourGuardrails mode="paper" />`.
- `mode-indicator.tsx` RETAINED (7 other tabs consume it) — removing the 2 imports here is clean, no stub (§15 satisfied).

## Interim consideration (CC-B + Langston consensus — accepted)
Pinning to paper means **live-mode guardrails are UI-uneditable** until the Live Guardrails tab is added. Acceptable: live active trading is Phase 21 and dormant; the live `guardrails_v2` row persists untouched in the DB; the prop design makes the live tab trivial. **Do NOT add the Live tab now** (Langston: shipping an editable surface for a system that isn't running is scope with no consumer).

## §13 — named home for the deferred Live Guardrails tab (Langston pre-push condition)
- **RUNNING_ISSUES #401** — documents the deliberate interim gap, home = Phase 21.
- **POST_AUDIT_ROADMAP §21.3 item 21-3a** — "add the Live Guardrails tab" as a Phase-21 (Live Mode Activation) prerequisite, MUST land before live active trading turns on.

## Verification
- Bench: tsc baseline gate OK (no regressions; clean bench at HEAD `3b6a816`).
- Call-site eyeballed = literal `mode="paper"` (Langston condition #1).
- CI: <run-id> all-4-green — *to be filled at close*.
- §9.3 Claude-in-Chrome (staging /goals-engine): *to be filled* — confirm the "Paper Guardrails" tab button + the big bold "Core Guardrails — PAPER MODE" header render; the 8 guardrail controls (incl the 2 B6.8 warning tiers) still render.

## Governance files changed
RUNNING_ISSUES.md (#401), POST_AUDIT_ROADMAP.md (§21.3 21-3a), BATCH_CATALOG.md, PHASE_19_PLAN.md (§1 + §5), SYSTEM_IMPACT_MAP.md (guardrail-tab pin-to-paper note), SYSTEM_MANUAL.md (Ch4 §2 note), MEMORY (CC-B + Langston). No DELETED_COMPONENTS_LOG (no deletion). No migration.
