# BOOTSTRAP.md — Additions (2026-04-14)

> **Purpose:** Add these new sections to Langston's existing `/root/.openclaw/workspace/BOOTSTRAP.md`. The existing content (Always Read list, Read on Demand list, Skills, Code/Math context, Role, Memory Discipline, Voice Note verification, Web Search verification) stays intact. The sections below are APPENDED — they capture the stable workflow/governance/rules/paths content that must be in Langston's instant context every session, not just in skills or referenced files he has to remember to read.

> **Why this is necessary:** Kyle's human memory is not reliable for buried details (the orphaned DBS discovery is the canonical example). Both Langston and Claude Code must have the critical workflow, governance, invariants, canonical paths, and current-phase context in their *instant* context — not relying on "please read this file" patterns that historically fail. Everything below mirrors the equivalent sections in Claude Code's `DawnTraderV3/CLAUDE.md`.

---

## Canonical File Locations (post-reorganization, 2026-04-14)

There is now **exactly one** `Claude Comms and Packages/` folder. It lives **inside the repo** at:
`/mnt/gdrive/Dawn Trader/DT_Clone_Repo/DawnTraderV3/Claude Comms and Packages/`

The three previous duplicates are deleted:
- `G:/My Drive/Dawn Trader/Claude Comms and Packages/` — DELETED
- `G:/My Drive/Dawn Trader/DT_Clone_Repo/Claude Comms and Packages/` — DELETED
- `.../DawnTraderV3/Claude Comms and Packages/Reports/` — consolidated

**Governance files (all in `1-system-manual/`):**
CCPI, BATCH_CATALOG, PHASE_HISTORY, SYSTEM_MANUAL, SYSTEM_IMPACT_MAP, CHANGES_AND_FIXES, POST_AUDIT_ROADMAP, ADJUSTMENT_FRAMEWORK, AUTHORITY_BASELINE, RUNNING_ISSUES.

**Claude Comms and Packages subfolders (post-reorg):**
- `Scope Files/` — `BATCH_N_SCOPE.md`, pre-audits, audit discussion docs
- `Batch Completion/` — `BATCH_N_COMPLETION_REPORT.md` (canonical, promoted from `Reports/Batch Completion/`)
- `Change Lists/` — per-batch change lists for your code review
- `Batch Zips/`, `Governance Zips/` — legacy pre-clone-repo era
- `Langston/` — your setup reference, skills
- `CCDT Relay/` — Telegram-relayed images
- `Telegram Discussion Archives/` — historical content

**Renamed:** `DawnTraderV3/Reports/` → `Archived Reports - Pre-Phase 12 Governance Implementation/`. Old pre-governance-system reports live there; they are historical, not active. `RUNNING_ISSUES.md` moved to `1-system-manual/`.

**Rule:** Do not create duplicate `Claude Comms and Packages/` folders. There is one, and it is inside the repo.

---

## Critical Rules (Non-Negotiable Invariants) — mirrors CC CLAUDE.md §5

1. Clone repo is the working copy. Edit directly on the migration branch. No DT_Staged_Changes or zip packages.
2. Replit is FROZEN (since 2026-03-30). No updates, no syncing.
3. Never skip the workflow. Every phase, every batch, no exceptions.
4. Never improvise architecture under pressure. If blocked, tell Kyle.
5. Communicate deviations before acting.
6. Never confabulate when context is degraded. Flag uncertainty.
7. Single source of truth per domain. Each governance doc owns its domain.
8. Batch completion reports are mandatory. Every batch, in `Claude Comms and Packages/Batch Completion/`, with governance-files-changed list.
9. Code-level reviews from you are mandatory. Scope → pre-audit → code diff (before push) → completion report. Not high-level glosses.
10. All governance lives in the repo. One canonical copy per file.
11. **Regime/DBS code is FROZEN during Phase 15b audit.** Exception: instrumentation for evidence collection. No threshold or formula changes until the audit completes.
12. **Always review SIM in pre-audit. Always update SIM and System Manual in governance.** Buried details are the enemy.

---

## Governance Tiers (what updates after every batch)

**Tier 1 — EVERY batch:**
- CCPI (current state section)
- BATCH_CATALOG.md (new entry)
- PHASE_HISTORY.md (phase status update)
- Scope file (`BATCH_N_SCOPE.md`, written in Phase 1)
- Completion report (`BATCH_N_COMPLETION_REPORT.md`, written in Phase 11)

**Tier 2 — When applicable:**
- SYSTEM_MANUAL.md (architecture + math changes)
- SYSTEM_IMPACT_MAP.md (any component add/remove/modify)
- CHANGES_AND_FIXES.md (bug/risk registry)
- POST_AUDIT_ROADMAP.md (phase-level roadmap changes)
- ADJUSTMENT_FRAMEWORK.md, AUTHORITY_BASELINE.md (constitutional changes)
- RUNNING_ISSUES.md (issue tracker)
- MEMORY.md (volatile state update after every batch)

Completion reports must list which governance files were changed. If SIM or System Manual were applicable but not updated, the batch is NOT complete.

---

## System Impact Map & System Manual Discipline

**The framing rule — buried implemented logic is a governance failure, not just a documentation miss.** DBS existed, was wired, was computing every MCE cycle, and was doing nothing — because no governance doc surfaced it and no review caught that it had been orphaned. That is not a docs problem. That is the governance system failing to do its job. Treat every instance of burial this way.

**Your responsibilities in every batch:**

1. **Pre-Scope / Pre-Implementation review.** Before approving scope or implementation reasoning:
   - Check `SYSTEM_IMPACT_MAP.md` for dependency blast radius of every component the batch touches. Upstream dependencies, downstream consumers, shared state, background execution, blast radius rating.
   - Check `SYSTEM_MANUAL.md` for the architectural and mathematical truth of what's being changed. If the scope contradicts System Manual, one of them is wrong and you must flag it before code is written.
   - If either file is silent on something the batch touches, that itself is a governance gap — flag it.

2. **Governance review (Phase 10).** After implementation, before the batch is closed:
   - Any batch that changes architecture, formulas, routing, thresholds, or canonical meaning is **incomplete** until SIM and System Manual are updated where applicable.
   - A completion report that lists code changes but not SIM / System Manual updates (when either applies) is rejected, not approved.
   - "We'll update it later" is not acceptable. Deferred governance becomes forgotten governance.

3. **Proactive surfacing.** When you spot buried items during any review — orphaned code, unused metrics, dead endpoints, undocumented dependencies, fields that are written but never read, parameters that are declared but never referenced — flag them immediately as governance-failure candidates. Don't assume someone else will catch it.

**System Manual scope:** architecture, strategy logic, regime detection, filter design, signal pipeline, quantitative math, canonical meaning of regime/strategy/filter terms. Anything in those domains that changes = System Manual update.

**SIM scope:** every component that has upstream feeders, downstream consumers, or cross-cutting state. Every batch that adds, removes, or modifies such a component = SIM update.

---

## Three-Way Communication — your side

- **Thread 21 (Batch Implementation)** is the ACTIVE thread. Use it for all operational exchanges with Claude Code and Kyle.
- **Thread 28 (Design)** — Kyle has told Claude Code to stop posting here. You are not actively reading it. Operational traffic goes on Thread 21.
- **Always acknowledge Kyle's messages immediately** (per GOVERNANCE_RULES.md). This is #1.
- **Task completion honesty** (per SOUL.md) — if you're stuck, say so immediately. No rolling "in progress" status while actually blocked.
- **Always copy your messages to cc-inbox** so Claude Code's polling picks them up.

---

## Phase 15b Transition Summary — Regime / DBS / Strategy / Filter Restructure

**Where the project is as of 2026-04-14:**

- **Phase 15a (B59)** — CLOSED. Predictive learning UI audit + data path fixes deployed. Three fixes: telemetry aggregator orphan scheduler, hardcoded ml-calibration weight defaults, VTS `getRecentTrades` dropping Phase-10 metrics. Regime Archive verification pending next telemetry cycle.
- **Phase 15b (OLD, B60 Smart Thermostat)** — **DEFERRED to post-live.** Renumbered as Phase 17.5. Reason: we cannot tune adaptive policy on top of a misclassified state model.
- **Phase 15b (NEW, B61–B65)** — **LOCKED 2026-04-14.** Regime / DBS / Strategy / Filter Restructure. Five sub-phases (A–E).

**Why the restructure exists:**

A B59 investigation into `range_trade`'s 76% loss rate exposed three layered problems:
1. Regime classifier labels 54.5% of pairs as `RANGE_BOUND_STABLE` on vol+ADX alone with no directional drift check. Only ~8% of pairs are actually neutral. The other 47% are drift-contaminated false ranges — bleeding `range_trade`.
2. DBS (Directional Bias Score) is fully implemented at `server/core/metrics/directional-bias.ts`, computed every MCE cycle, but **never consumed** — not by the classifier, strategy gates, SQE, RTB, or TEC. `biasConfidenceModifier` defined but never imported. Orphan metric.
3. 7 of 17 strategies are dormant. 4 starved by regime scarcity (`IMPULSE_EXPANSION` 2.4%). 3 with overly strict detection.

DBS-based classifier simulation: `TREND_FRIENDLY_STABLE` 19.3% → 55.7%; `RANGE_BOUND_STABLE` 54.5% → 3.4%.

**Three-way consensus decisions:**
1. B60 Smart Thermostat deferred post-live (renumbered Phase 17.5).
2. DBS + regime + strategy + filter consolidated into ONE pre-live phase (this Phase 15b). Not split.
3. Filters explicitly in scope (entry gates, Net_EV thresholds, RTB rankingScore, TEC exits).
4. **CODE FREEZE on regime/DBS during the audit.** No threshold edits, no formula edits, no weight changes, no classifier changes, no DBS component changes to `server/core/metrics/market-regime.ts` or `server/core/metrics/directional-bias.ts` until the audit completes. **The only permitted modifications are instrumentation needed to collect evidence** (logging, telemetry counters, evidence capture). If the target moves while we measure it, we end up explaining ghosts. Any genuine emergency fix requires three-way approval and explicit Adjustment Framework tier classification.
5. Sub-Phase E is CONDITIONAL on audit findings. Implementation not pre-committed.
6. Sub-Phase D core proof is BLOCKING for go-live. Full per-strategy/per-bucket matrix is non-blocking.
7. Both sessions reset BEFORE B61 begins.

**Batch structure:**

| Batch | Sub-Phase | Your ownership | Blocking |
|---|---|---|---|
| B61 | A — DBS Validation | **A.3 — Global DBS methodology + industry cross-reference** (Crypto Fear & Greed, BTC dominance, altcoin momentum) | YES |
| B62 | B — Regime Taxonomy Redesign | **B.4 — Missing regimes evaluation** (LOW_VOL_UPTREND, LOW_VOL_DOWNTREND, CHOPPY_NO_BIAS, TRUE_RANGE — high burden for additions) | YES |
| B63 | C — DBS Integration Inventory + D — Strategy Re-Audit | **C conceptual review** (inventory only, not implementation) + D review | Core proof YES |
| B64 | E.1–E.3 — Classifier + canonical map deploy | Code review | YES if approved |
| B65 | E.4 — Filter layer DBS integration | Code review | Selected items YES if approved |

**Your validation gate for Sub-Phase B:** the new classifier must improve not just classification accuracy but **downstream trade-selection economics**. Philosophically accurate is not enough — that was your specific recommendation and it's in the roadmap.

**Your validation gate for Sub-Phase C:** inventory only during the audit — do NOT treat this as a parallel implementation agenda. Prevents "redesign-by-enthusiasm" sprawl. This was also your call and it's locked.

**Source docs:**
- `Claude Comms and Packages/Scope Files/REGIME_DBS_STRATEGY_AUDIT_SCOPE_2026-04-14.md` — the audit scope
- `Claude Comms and Packages/Scope Files/STRATEGY_OPPORTUNITY_FLOW_AUDIT_2026-04-14.md` — the 17-strategy analysis
- `Claude Comms and Packages/Scope Files/CC_RANGE_TRADE_INVESTIGATION_2026-04-14.md` — the range_trade deep dive
- `1-system-manual/POST_AUDIT_ROADMAP.md` — Phase 15a (closed), Phase 15b body (new), Phase 17.5 (post-live Smart Thermostat)

---

## Web Search — Fixed and Verified (2026-04-14)

Your web search capability was broken because `plugins.entries.google.config.webSearch.apiKey` was empty in `/root/.openclaw/openclaw.json`. Fixed 2026-04-14 by setting that credential. The `VERIFY EVERY SESSION` section earlier in this file still applies — check it's working at session start — but do not re-investigate as if it's a new problem. The fix is known and persistent.

---

## Pre-Audit Lock-In Checklist (before B61 kickoff)

These tasks happen before both sessions reset and B61 begins:

**Governance updates (current session, before reset):**
1. Three-way written approval of the Phase 15b roadmap (Langston: approved with revisions applied; Kyle: approval of applied revisions pending at time of reset)
2. POST_AUDIT_ROADMAP.md updated with Phase 15b structure — DONE
3. CCPI updated with Phase 15b context, freeze policy, B61–B65 sequence — PENDING
4. BATCH_CATALOG updated with B60 deferral + B61–B65 placeholders — PENDING
5. PHASE_HISTORY updated with 15a closure + 15b open — PENDING
6. MEMORY.md (both sides) rewritten — PENDING
7. BOOTSTRAP.md (this file) updated with these additions — PENDING
8. Regime/DBS code freeze enacted in writing — DONE (referenced here)

**Prerequisite evidence check (before B61, not part of audit):**
9. Historical data availability — count of days of VTS trades with `pairDirectionalBias` field, count of days of regime archive entries. Feasibility check for B61–B63. If insufficient, adjust scope before kickoff.

**Reset & kickoff:**
10. Both sessions reset — Langston transcript archived with `.reset.2026-04-14` suffix, new CC session spun up fresh
11. B61 scope doc drafted in the fresh CC session as the first audit deliverable

---

*End of BOOTSTRAP.md additions. The existing BOOTSTRAP.md content above these additions is unchanged.*
