# Langston — Project Memory (Volatile State)

> **How to read this file:** Stable workflow, governance, persona, invariants, canonical paths, three-way protocol, and infrastructure details live in `BOOTSTRAP.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `AGENTS.md`, `GOVERNANCE_RULES.md`, `TOOLS.md`. This file holds **volatile** state only: what phase we're on, what we just did, what's next, and recent decisions. Mirrors Claude Code's MEMORY.md volatile block so both sessions are in sync.

---

## Project Overview (one-line)

DawnTrader V3 is a cryptocurrency trading platform that scans ~300 Kraken pairs through a multi-stage signal quality pipeline (quant + pattern dual-path, MCE-centralized regime/indicators, VTS passive learning), currently paper-trading on Hetzner/Supabase, transitioning to live. Mission: generational wealth → commercialization.

## Known Invariants For This Phase (do not forget after reset)

- **Phase 15b is pre-live, structural, and BLOCKING** for go-live. Not optional, not deferrable.
- **B60 Smart Thermostat is PAUSED post-live** (renumbered Phase 17.5). Do not re-propose as pre-live.
- **Predictive learning full teardown is DEFERRED post-live.** Services are inert, not actively harming. Leaving dormant.
- **VTS always-on is DEFERRED** unless Kraken rate-limit research proves the effort is simple. Conditional, not committed.
- **Regime/DBS code is FROZEN** during the audit. Instrumentation-only exception. No threshold or formula edits.
- **Sub-Phase E is CONDITIONAL** on audit evidence. Implementation is not pre-committed. Phase 15b can close with audit deliverables alone if no pre-live changes are warranted.
- **Only one `Claude Comms and Packages/` folder exists** — inside `DawnTraderV3/`. No duplicates.

---

## Current State (2026-04-14)

- **Active branch:** `migration/aws-supabase`
- **Primary source of truth:** GitHub `kylegjordan/DawnTraderV3`
- **Staging:** Hetzner CPX22, 188.245.193.8 (Falkenstein)
- **Database:** Supabase PostgreSQL 17.6 (Frankfurt)
- **Your brain:** GPT-5.4 permanently, 272K tokens/topic (1M pending)
- **Your role:** Senior PM + code-level reviewer + independent design voice. Claude Code implements.
- **Active Telegram thread:** #21 (Batch Implementation) — ACTIVE. #28 (Design) — do not use.
- **Replit:** FROZEN since 2026-03-30.
- **Last closed phase:** Phase 15a (B59 — Predictive Learning UI Audit & Data Path Fixes). Deployed. Regime Archive verification pending next telemetry cycle.
- **Current phase:** **Phase 15b — Regime/DBS/Strategy/Filter Restructure. LOCKED 2026-04-14.** Sub-phases A–E, batches B61–B65.
- **Current batch:** **Next = B61 (Sub-Phase A, DBS Validation). Not yet started.** Starts in your fresh session after reset.
- **CI status:** 3/4 GREEN. TypeScript Check failing (pre-existing, Running Issue #39).
- **Code freeze in effect:** regime/DBS code frozen during Phase 15b. Instrumentation-only exception.

## Phase 15b Summary (why this phase exists)

A B59 investigation into `range_trade`'s 76% loss rate exposed three layered problems:

1. Regime classifier labels 54.5% of pairs `RANGE_BOUND_STABLE` by vol+ADX alone, no drift check. Only ~8% actually neutral. Other 47% are drift-contaminated false ranges bleeding `range_trade`.
2. DBS (Directional Bias Score) is fully implemented at `server/core/metrics/directional-bias.ts` — computed every MCE cycle but NEVER consumed by classifier, strategy gates, SQE, RTB, or TEC. Orphaned.
3. 7 of 17 strategies dormant. 4 starved by regime scarcity. 3 with overly strict detection.

DBS-based classifier simulation: `TREND_FRIENDLY_STABLE` 19.3% → 55.7%; `RANGE_BOUND_STABLE` 54.5% → 3.4%. Live DBS distribution: 55.7% of pairs UP_MODERATE or stronger, only 4.5% NEUTRAL.

**These are layered symptoms, not independent bugs.** Patching would cascade. Hence: structural audit, not patch.

## Phase 15b Sub-Phase Structure

| Batch | Sub-Phase | Your ownership | Blocking |
|---|---|---|---|
| **B61** | A — DBS Validation | **A.3 — Global DBS methodology + industry cross-reference** | YES |
| **B62** | B — Regime Taxonomy Redesign | **B.4 — Missing regimes evaluation** | YES |
| **B63** | C inventory + D core proof | **C conceptual review** + D review | Core proof YES |
| **B64** | E.1–E.3 — Classifier + canonical map deploy | Code review | YES if approved |
| **B65** | E.4 — Filter layer DBS integration | Code review | Selected items YES |

**Sub-Phase E is CONDITIONAL on audit findings.** Implementation not pre-committed. If the audit finds the current taxonomy is sound, E collapses to a no-op and the phase closes with audit deliverables alone.

**Your validation gates (you set these during roadmap review):**
- **Sub-Phase B:** new classifier must improve downstream trade-selection economics, not just classification accuracy. Philosophically accurate is not enough.
- **Sub-Phase C:** inventory only during audit. Not a parallel implementation agenda. Prevents "redesign-by-enthusiasm".

**Source docs (in `Claude Comms and Packages/Scope Files/`):**
- `REGIME_DBS_STRATEGY_AUDIT_SCOPE_2026-04-14.md`
- `STRATEGY_OPPORTUNITY_FLOW_AUDIT_2026-04-14.md`
- `CC_RANGE_TRADE_INVESTIGATION_2026-04-14.md`

Full Phase 15b body is in `1-system-manual/POST_AUDIT_ROADMAP.md`.

## What Just Happened (2026-04-14 session)

1. B59 deployed — 3 predictive learning data path fixes.
2. Strategy opportunity flow audit revealed 7 dormant strategies + `range_trade` bleeding.
3. Regime classifier investigation exposed drift-contamination.
4. DBS discovered as orphaned metric.
5. Kyle reframed: "structural audit, not patch." Three-way consensus reached.
6. Phase 15b locked with full sub-phase/batch structure. B60 Smart Thermostat deferred post-live (Phase 17.5).
7. `POST_AUDIT_ROADMAP.md` updated in place with new Phase 15b + Phase 17.5 sections.
8. Folder reorganization: 3 duplicate `Claude Comms and Packages/` folders consolidated to one canonical location inside `DawnTraderV3/`. Old `Reports/` renamed to `Archived Reports - Pre-Phase 12 Governance Implementation/`. `Batch Completion` and `Change Lists` promoted. `RUNNING_ISSUES.md` relocated to `1-system-manual/`.
9. Governance transition prepared: CC side created `DawnTraderV3/CLAUDE.md` (auto-loaded), trimmed CC MEMORY.md. Your BOOTSTRAP.md additions + this MEMORY.md rewrite are the Langston side of the transition.
10. Your web search fix confirmed working (`plugins.entries.google.config.webSearch.apiKey`).

## Next Step (after reset)

1. Acknowledge Kyle with a one-line "ready" when the fresh session spins up.
2. Verify voice note + web search config per BOOTSTRAP.md startup checks.
3. Pull the current state from MEMORY.md (this file).
4. Claude Code will draft `BATCH_61_SCOPE.md`. Review it.
5. Begin your A.3 work: global DBS methodology review + industry-standard cross-references (Crypto Fear & Greed, BTC dominance trend, aggregate altcoin momentum). Output goes into the B61 DBS Validation Report.

## Deferred Work Items (tracked)

**Pre-live (folded into existing phases):**
- Archive minimum-viable capture (DB schema + fields)
- Paper trading pipeline readiness (Phase 19)
- Live trading pipeline readiness (Phase 20 + 21)

**Post-live backlog:**
- Predictive learning full teardown
- UI redesign (Predictive Adjustments, Events tab as news feed)
- Modular filter/strategy architecture
- `liquidity_trap` redesign
- `THREE_SOLDIERS` legacy cleanup
- VTS always-on (CONDITIONAL on Kraken rate-limit research)
- X-stocks / perpetual futures (Phase 21.5)
- ML Adaptive Intelligence Layer (Phases 17, 18)
- Phase 17.5 Smart Thermostat (formerly B60)

## Recent Deferred Decisions

1. **Remaining volume hard gates** — `inside_bar_reversal`, `defensive_hedge`, `adaptive_flow`, `pivot_shift` still have hard volume gates. Monitor pattern-pool signal rate.
2. **VTS Destination vs Pair-Pool reconciliation** — decided NOT to implement manifest tracking. Accept FX5/VTS cycle rate mismatch.

## Open Issues

- **Running Issue #39:** CI TypeScript Check failing (pre-existing storage.ts errors). Non-blocking for Phase 15b audit work but must be fixed before B65 deploy.

---

*End of volatile state. For stable workflow, governance, rules, and protocols, see BOOTSTRAP.md and the Always Read list therein.*
