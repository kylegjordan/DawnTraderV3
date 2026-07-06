# P19-B8.3b — Completion Report

**Batch:** P19-B8.3b — per-mode dashboard fast-follow (destinationCount retire + #417 FD display honesty + #415/#416 riders)
**Change-class:** non_architecture (re-declared from the pre-declared architecture after Langston Step-1 Option-A consensus — no new scanner computation; display + a dead-field retirement + 2 surgical fixes; no migration)
**Date closed:** 2026-07-07 (same-day scope → close)
**Heads:** `9e91245ab` (OBJ-1/2/3/4 + test) + `23047f291` (§9.3 visual-walk catch — the second VTS block). CI 4-green ×2 (`28828440976`, `28828795388`). Deployed staging restart #447-448, HTTP 200, NO migration.
**Reviews:** Langston Step-1 (Option A concur, mode-multiplex + destinationCount reader claims verified on staging) · Step-2 (hard gate: OBJ-3 netPnl-null trace PERFORMED = benign; 2 riders folded) · Step-4 APPROVED (per-objective, 2 non-blockers logged) · **Step-8 PASS** (independently re-verified the second-block fix against live staging + read its diff).

## Scope objectives

| OBJ | Outcome | Evidence |
|---|---|---|
| 1 — #417 FD display separation (Option A) | **YES (both blocks; §9.3-verified)** | The fx5-scanner is MODE-MULTIPLEXED (`isEngineActive` → vts_*/active_* filter swap → destination routing) — it becomes the active funnel at B8.4, so no dual-funnel build. All three VTS-runner downstream blocks gated to `gateDisposition === 'tag'`: Table-1 VTS Evaluation Metrics (already gated B8.3), Last-Scan "VTS Signal Funnel (Last Cycle)" (`9e91245ab`), and **Table-2 "VTS Evaluation (24h rolling)" — caught by the §9.3 walk, not the diff (`23047f291`)**. Enforce shows honest amber "Active-path … populates at B8.4" placeholders (`fd-active-funnel-dormant`, `fd-active-eval-dormant-24h`). The three "→ VTS Destination" rows relabel to "→ Survivors (post-benchmark; shared scan feed)" on enforce (COUNT kept — real shared-feed data). §9.3 Chrome walk: Paper enforce = zero VTS-runner counts + placeholders + relabels; VTS tag = all 3 blocks unchanged (find-confirmed 3 exact matches). |
| 2 — destinationCount fix-or-retire → RETIRE | **YES** | `scanDiag.destinationCount` + `totalDestinationCount` removed (scanner type/init/assign/aggregate + both getter shapes + `vts-shared.tsx:154` client mirror + 2 trace tokens). Blast-radius PROVEN (Langston C1): two qualified repo-wide greps `scanDiag\.destinationCount` + `\btotalDestinationCount\b` = ZERO code refs; tsc-baseline OK. The `routes.ts:7809/:7853` familyFanOut FD-response `destinationCount` survivor untouched (naming-collision carve-out). DELETED_COMPONENTS_LOG 2026-07-07. A RESPONSE-SHAPE narrowing (safe, no reader). |
| 3 — #415 headline/per-class basis | **YES** | Headline `netPnl` → `num(t.netPnl ?? t.pnl)`, identical to byAssetClass → Σ reconciles by construction. Hard-gate trace (Langston): BENIGN, not a friction gap — `net_pnl` DB `default('0')` (never null), all 3 writers compute it, 0 live rows. `p19-b8-3b-metrics.test.ts` pins Σ===headline + net≠gross (13.9 vs 18.0) + fallback + empty. Forward-condition → #418 (B8.4 gate). |
| 4 — #416 balance-curve carrier | **YES** | `startLevel` carrier seeded as a `kind:'carry'` chart left-edge point; null-safe (no carrier → prior behavior); `carry` excluded from anchor ReferenceDots; empty-state only when neither carrier nor points. |

## Langston Step-4 non-blockers (logged, not fixes)
1. `p19-b8-3b-metrics.test.ts` re-implements the routes.ts headline expression locally (routes.ts isn't unit-importable) — pins the identity, won't catch routes.ts drifting from the expression; comment flags it.
2. OBJ-4 derives `windowStartMs` client-side (`Date.now() − chartDays·day`) rather than from a server window-start ts — cosmetic (x-anchor of a flat line; `["dataMin","dataMax"]` domain makes it moot). Langston self-verified the alignment holds (`chartDays` drives both the query and the seed).

## The §9.3 visual-walk catch (honest process note)
The pre-audit §2 named the Last-Cycle funnel + the destination rows but UNDER-SCOPED the Table-2 24h-rolling VTS Evaluation block. Langston's Step-4 diff review APPROVED correctly — **an ungated block is not in a diff, so a diff review structurally cannot catch it.** The §9.3 Chrome walk (Kyle's hard requirement) showed the enforce tab still rendering "Trades Opened 55"; fixed in `23047f291` and re-verified. Lesson recorded in CHANGES_AND_FIXES FIX-2026-07-07-A: for any disposition/mode-conditional display change, the completion gate is the VISUAL walk of BOTH branches.

## Decisions / homes
- **#418 (NEW, → B8.4):** the switch-on active-path closer MUST populate `closed_trades.net_pnl` — the `default('0')` bridge would silently zero a real trade out of BOTH the headline and per-class while the #415 reconciliation test stays green (it understates identically). Named B8.4 gate in RUNNING_ISSUES + PHASE_19_PLAN §5.
- **#415 / #416 / #417 RESOLVED.**
- ON-state (active-trading-on) enforce funnel render → verification-homed to B8.4 §13 (can't be Chrome-walked until switch-on).
- **NEXT: B8.3c** — the Kyle-directed open/closed trade-count restore atop each tab (dropped in the B8.1 restructure; OLD-Claude-routed), a tiny standalone follow-up.

## Governance files changed
`BATCH_CATALOG.md` (B8.3b row) · `PHASE_HISTORY.md` (B8.3b paragraph) · `PHASE_19_PLAN.md` (§1 board B8 row + §5 log; B8.3c/B8.4/#418 sequenced) · `SYSTEM_IMPACT_MAP.md` (B8.3b banner — retire + mode-multiplex + FD disposition display) · `CHANGES_AND_FIXES.md` (FIX-2026-07-07-A — gross→net + the visual-walk lesson) · `DELETED_COMPONENTS_LOG.md` (2026-07-07 destinationCount retire) · `RUNNING_ISSUES.md` (#415/#416/#417 RESOLVED, #418 opened) · `MEMORY_CC_B.md` (+ repo mirror) · Langston `/home/langston/MEMORY.md` · this report. System Manual: NOT applicable (Langston's §16 call — no strategy/regime/pipeline/math change; the canonical net basis itself is unchanged, only the headline that wrongly summed gross).

**Status: batch complete pending Kyle acknowledgment.**
