# Langston — Project Memory (Volatile State)

> **How to read this file:** Stable workflow, governance, persona, invariants, canonical paths, three-way protocol, and infrastructure details live in `BOOTSTRAP.md`, `SOUL.md`, `IDENTITY.md`, `USER.md`, `AGENTS.md`, `GOVERNANCE_RULES.md`, `TOOLS.md`. This file holds **volatile** state only: what phase we're on, what we just did, what's next, and recent decisions. Mirrors Claude Code's MEMORY.md volatile block so both sessions are in sync.

---

## Project Overview (one-line)

DawnTrader V3 is a cryptocurrency trading platform that scans ~300 Kraken pairs through a multi-stage signal quality pipeline (quant + pattern dual-path, MCE-centralized regime/indicators, VTS passive learning), currently paper-trading on Hetzner/Supabase, transitioning to live. Mission: generational wealth → commercialization.

## Known Invariants (do not forget after reset)

- **⚠ TASK COMPLETION HONESTY (PRIME INVARIANT)** — when asked for status you MUST reply with one of three options: (1) concrete artifacts produced since last status with specifics, (2) literal phrase "NO PROGRESS since last status" + specific reason + ask, or (3) "I cannot complete this task" + reason + alternative. Forbidden: "working on it", "almost done", "give me N more minutes", time estimates as substitutes for deliverables. If context is too long, say so immediately and ask for session reset. Full rule: BOOTSTRAP.md top + SOUL.md §Task Completion Honesty. This overrides every other instruction.
- **Phase 15b is COMPLETE.** Phase 15c is where we are now (post-audit implementation + monitoring).
- **Regime/DBS code freeze is LIFTED** (was active during Phase 15b audit). B62/B63 code landed.
- **B60 Smart Thermostat is PAUSED post-live** (renumbered Phase 17.5). Do not re-propose as pre-live.
- **Predictive learning full teardown is DEFERRED post-live.** Services are inert.
- **VTS always-on is DEFERRED** unless Kraken rate-limit research proves effort is simple.
- **Only one `Claude Comms and Packages/` folder exists** — inside `DawnTraderV3/`. No duplicates.
- **OpenClaw 272K cap for GPT-5.4 persists** (upstream openclaw/openclaw#42225 + PR #44475 still OPEN as of 2026-04-22). Reset when context fills.

---

## Current State (2026-04-22)

- **Active branch:** `migration/aws-supabase`
- **HEAD commit:** `cf7baef1` (B64a HF — regime strings through canonical SSOT)
- **Staging:** PM2 restart #84 at 2026-04-22 ~02:05 UTC. Drift Dashboard live. No re-deploy until open book resolves.
- **Last closed phase:** **Phase 15b** (Regime/DBS/Strategy/Filter restructure, B61–B63 audit + structural fixes).
- **Current phase:** **Phase 15c** (post-audit implementation + observation + governance catch-up).
- **Current batch:** **B63 CLOSED for implementation; audit-only items 13/15/18/19 in flight.** Observation window running 2026-04-21 → 2026-04-28.
- **Your role:** Senior PM + code-level reviewer + independent design voice. Also now leading **Item 18 (SQE audit)**. Claude Code implements; you audit.
- **Active Telegram thread:** #21 (Batch Implementation). #28 (Design) — do not use.
- **CI status:** All 4 checks GREEN (since B56).
- **Replit:** FROZEN since 2026-03-30.

---

## Recent Batch History (post-reset reference)

| Batch | Scope | Outcome | Commit |
|---|---|---|---|
| **B61** | Sub-Phase A — DBS validation + instrumentation | Closed. DBS validated, rolling-window measurement established as authority over snapshots. | (merged) |
| **B62** | Sub-Phase B — Regime taxonomy audit | Closed. 5 canonical regimes confirmed. Drift contamination measured at 72.59% rolling (vs 47% snapshot in B59 — snapshot was wrong). | (merged) |
| **B63** | Strong Bull Trend strategy + 19-item audit | Implementation complete across 3 stages (10A, 10B+10C, 16). Langston 2nd-pass approved each stage. | `b0b8e39e`, `c3fe0712`, `a4f5dbe0` |
| **B63 gov** | Tier 1+2 governance + B58a Authority Baseline audit | All intact, 3 intentional drifts, 0 silent drifts. | `f9cea72d`, `6873ae49` |
| **B64a** | Regime & Strategy Drift Dashboard (moved up from B71) | Live. Aggregator + endpoint + UI + 24h ring buffer + transitions + sparkline. | `eb790763`, `0be18c4f`, `cf7baef1` |

**Key B63 structural changes (for reference during Item 18):**
- **Item 10** — counter-trend LONG exclusion for morning_star / reverse_impulse / defensive_hedge / sma_trend_ride when `dbsScore <= -0.35`. Null-reason `b63b_counter_trend_long_exclusion`.
- **Item 11** — vwap_pullback LANE PROMOTION via `MULTI_FAMILY_ELIGIBILITY` map (strong_trend family added). Removed positive-DBS exclusion, added negative-DBS mirror guard.
- **Item 12** — geometry override for strong-trend lane: 4x ATR stop, 3R target (Variant E). Consumed in vts-runner via `strongTrendGeometryOverride` on signal when `sourcePool === 'quant-strong_trend'`.
- **Item 14** — mode-overlay lane bypass: when `sourcePool === 'quant-strong_trend'`, NORMAL/DEFENSIVE/SURVIVAL asymmetric multipliers are bypassed and native geometry is preserved. Mirrored in paper-execution-engine.
- **Item 16** — persistent DBS store (`directional-bias-store.ts`) with 5-row behavior spec (cold-start / below-floor-with-prior / below-floor-no-prior / invalid-compute / happy-path). End-of-cycle atomic snapshots. 96-entry ring buffer (24h x 15-min cadence). Last-50 category transitions.

---

## Current Observation Window (2026-04-22, in progress)

**Open-book surge flagged by Kyle this morning:** 126 to 131 open simulated trades — first time the book has exceeded 100 concurrent in 1+ month. Claude Code analyzed the CSV exports in detail.

**Verdict (CC + Kyle consensus):** NOT a bug. Two drivers compounded:
1. **B64a deploy at #84 activated the vwap_pullback MULTI_FAMILY_ELIGIBILITY promotion** — smoking gun: 50/51 recent closed vwap_pullback were QUANT-TREND lane; 16/18 newly opened are quant-strong_trend lane. Lane promotion is confirmed activating.
2. **Macro tape is broadly UP-biased** — 97% UP_MODERATE/UP_STRONG pairDirectionalBias, median pairDBS 0.40 (above 0.35 lane threshold), TFS regime share jumped from 44.6% (7d closed) to 86.5% (current open).

**121 of 126 opens came in a 5-hour window (02:00–07:00 UTC)** aligning to the minute with PM2 #84 deploy. First cycles after the promoted lane went live on an already-bullish tape fired a burst of signals that were blocked the day before. Book geometry (Variant E: 3R targets, 4x ATR stops) means targets are ~9% away vs stops ~3% — expect the book to take 3-8h to start resolving.

**Kyle's directive:** let the open book resolve over 3-6h before any new analysis. **Do NOT propose code changes during the observation window.**

**range_trade RR-geometry finding** (separate from the surge): 71.4% WR but -0.73% avg net. Root cause: win:loss magnitude ratio 0.38 (break-even needs >= 0.40). Systemic across 7d (n=84, same ratio). **Not urgent; pre-registered as an Item 15 audit target.** Do not treat as a B66 code item until Item 15 lands.

---

## Your Current Assignment — Item 18 (SQE Audit)

**Brief:** `Claude Comms and Packages/Scope Files/B63_ITEM18_SQE_AUDIT_BRIEF.md` (Claude Code is writing this now, ready by the time you're reset).

**Scope:** Signal Quality Evaluator (SQE) 3-part audit — (1) FinalScore threshold calibration, (2) RegimeWeight multiplier distribution + outliers, (3) rankingScore 3-outcome decomposition. Also structural evaluation of single-vs-multi-stage SQE design.

**Deliverable:** `Claude Comms and Packages/Scope Files/B63_ITEM18_SQE_AUDIT.md` — audit document with evidence, findings, and structural recommendations.

**In scope:** read-only analysis using `logs/virtual_trades/` + source files (`server/services/sqe-*.ts`). Statistical evaluation. Structural recommendations on single-vs-multi-stage SQE design.

**Out of scope:** code changes, threshold edits, anything that would trigger a deploy. This is pure audit.

**Honesty rule applies.** If the audit is too big for your current context at any point, use Option 2 or 3 from the prime invariant. Partial audits delivered are always better than fake progress.

---

## Phase 15c Queued Sequence (next batches)

| # | Batch | Scope | Status |
|---|---|---|---|
| 1 | **B64** | Canonical map sync + residual UI alignment | queued |
| 2 | **B65** | TEC wiring as shared service (VTS + paper) | queued |
| 3 | **B66** | Strategy refinement from Item 15/18/19 audit outputs | queued (scope sized by audits) |
| 4 | **B67** | External Data Context Phase 1 — multi-TF OHLC + BTC dominance + funding. ~2-3 weeks. | queued |
| 5 | **B68** | External Data Context Phase 2 — exchange flows + liquidations + DXY + SPX. ~2-3 weeks. | queued |
| 6 | **B69** | Asset class field + standardized schema | queued |
| 7 | **B70** | Data archiving update + retroactive B62 re-labeling | queued |

**B67/B68 added 2026-04-22.** Three naive-pattern backtests (LONG liquidity_trap / VSB / bullish engulfing at support) all converged to poor prospective S/N. **Pivot: new technical strategies add near-zero marginal value; external CONTEXT inputs are the lift.**

Full details: `1-system-manual/POST_AUDIT_ROADMAP.md`, `Claude Comms and Packages/Scope Files/POST_B62_PRE_LAUNCH_PLAN.md`, `Claude Comms and Packages/Scope Files/EXTERNAL_DATA_SOURCES_INVENTORY.md`.

---

## Next Step (after reset)

1. Acknowledge Kyle with a one-line "ready" when the fresh session spins up.
2. Read the Item 18 brief in `Claude Comms and Packages/Scope Files/B63_ITEM18_SQE_AUDIT_BRIEF.md`.
3. Acknowledge receipt AND confirm you understand: scope, deliverable location, in-scope vs out-of-scope, honesty rule.
4. Begin the audit. Use the three-option status protocol for any progress reports.

---

## Recent Deferred Decisions / Open Issues

- **Running Issue #39** — CI TypeScript Check was pre-existing failing in Phase 15a. Now GREEN (fixed during B63 stream).
- **liquidity_trap inversion** — backtested 2026-04-22, DEFERRED. AvgR +0.046 too marginal.
- **Item 13 decision gate** — vwap_pullback-in-lane KEEP/TUNE/BUILD_DEDICATED evaluated at 2026-04-28 (1 week post Stage 10B+10C). Criteria pre-registered. Claude Code has the evidence-accumulation script.
- **B66 scope** — cannot size until Items 15/18/19 audits land.

---

*End of volatile state. For stable workflow, governance, rules, and protocols, see BOOTSTRAP.md and the Always Read list therein.*
