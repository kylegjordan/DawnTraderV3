# B63 Item 15 — Adaptive Framework Audit Brief

**Owner:** Langston (Opus 4.6)
**Author:** Claude Code (this brief), Kyle as authorizing stakeholder
**Date issued:** 2026-04-22
**Deliverable target:** `Claude Comms and Packages/Scope Files/B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md`
**Honesty rule:** BOOTSTRAP.md §PRIME INVARIANT + SOUL.md §Task Completion Honesty apply throughout.

## Operating-Mode Context

**Active trading is OFF. Paper trading is OFF. Only VTS (passive learning) is running.** All findings must be framed as "VTS-mode observations, preparation for Phase 19 paper mode." Do NOT recommend immediate code changes — the observation window runs through 2026-04-28 and the open book is resolving.

## 1. Purpose

DawnTrader has ~150 tunable levers spread across strategies, filters, scoring, regime classification, and execution geometry. Many levers adapt — either continuously (per-scan), periodically (per-batch), or on manual override (Adjustment Framework). The question Item 15 answers: **does this adaptive framework work as a coherent system, or is it a collection of individually-sensible levers that collectively drift out of calibration?**

This audit produces a map of every adaptive lever, documents what inputs it consumes, what it outputs, at what cadence, and whether its empirical behavior matches its design intent. It is a **read-only audit**. No code changes.

## 2. Three-level scope

### Level 1 — Framework enumeration

Produce a complete inventory of every adaptive lever in the system. For each lever, capture:
- **Name** and file path
- **Design intent** (what should it do?) — from source comments, config docs, or SYSTEM_MANUAL
- **Inputs** consumed (which upstream data feeds this lever?)
- **Outputs** emitted (what does this lever change?)
- **Update cadence** (per-scan / per-batch / per-MCE-cycle / manual-only / DB-poll)
- **Authority source** (hard-coded / config file / DB / runtime-computed)
- **Downstream consumers** (which components use the output?)

Target lever count: expect 40–60 distinct levers. Do not try to enumerate every constant — focus on things that CHANGE over time or can be overridden. Examples of what qualifies:
- Mode-overlay multipliers (NORMAL / DEFENSIVE / SURVIVAL)
- DBS thresholds (0.35, ±0.35)
- Strategy-specific thresholds (e.g. `IB_MAX_COMPRESSION`, `VE_VWAP_TOLERANCE`)
- Regime classifier weights and clamps
- SQE thresholds (`MIN_FINAL_SCORE`, `MIN_REGIME_WEIGHT`)
- ROI gate, friction floor, confidence floor
- Adjustment Registry entries
- TEC trailing-exit parameters
- Kelly fractions, position sizing constants
- Rate-limit back-offs, retry budgets

### Level 2 — Input coherence analysis

For each lever, identify its inputs and evaluate:
- **Input freshness** — does the lever consume rolling-window data (B61 doctrine) or a snapshot? Snapshots in a distribution-shaped lever are a governance violation per CLAUDE.md §5 rule #13.
- **Input overlap** — do multiple levers consume the SAME upstream input? If so, they're coupled whether they know it or not. A change in the shared input fans out.
- **Input dependency graph** — build a DAG showing which levers feed which. Flag cycles. Flag levers that consume their own downstream effects (hidden feedback loops).

### Level 3 — Calibration check

For a representative sample of levers (not all 40–60 — pick 8–12 with high downstream impact), evaluate empirically:
- **Designed behavior vs observed behavior** — what does the lever output SHOULD look like per its spec, and what does it actually output on 7d of VTS data?
- **Sensitivity** — a small change in the lever's input produces how much change in its output? Overly-sensitive levers produce whipsaw; overly-insensitive levers produce lag.
- **Archetype segmentation** — does the lever's behavior differ across the 5 regimes? Across the 4 source pools (quant-strong_trend, quant-trend, quant-reversal, pattern)? Across bull vs bear DBS conditions? A lever that is well-calibrated in one archetype and badly-calibrated in another is a candidate for regime-aware parametrization.

The calibration check on Item 18's SQE findings is exactly the pattern to repeat across the other high-impact levers. Item 18 already showed RegimeWeight's backfill formula is mathematically backwards; Item 15's job is to find out how many OTHER levers are similarly mis-wired.

## 3. Data sources

- **Source code:** `server/**/*.ts`, `server/config/**/*.ts`, `server/core/**/*.ts`
- **Governance docs:** `1-system-manual/SYSTEM_MANUAL.md`, `ADJUSTMENT_FRAMEWORK.md`, `AUTHORITY_BASELINE.md`, `SYSTEM_IMPACT_MAP.md`
- **DB config:** `screener_filters` table + any DB-governed parameters (query via `ssh deploy@188.245.193.8 "psql ..."`)
- **Runtime logs:** `/home/deploy/dawntrader/logs/virtual_trades/` (calibration data), `/home/deploy/dawntrader/logs/phase15b_dbs_telemetry/` (MCE samples)

You have SSH access to staging as `deploy@188.245.193.8` — pull logs / run queries directly.

## 4. Deliverable structure

File: `Claude Comms and Packages/Scope Files/B63_ITEM15_ADAPTIVE_FRAMEWORK_AUDIT.md`

Suggested skeleton:
```
# B63 Item 15 — Adaptive Framework Audit

## Operating-Mode Context
(same block as Item 18)

## Executive Summary (written last)

## Level 1 — Framework Enumeration
  - Lever inventory table (40-60 rows)
  - Authority source breakdown
  - Cadence breakdown

## Level 2 — Input Coherence
  - Input DAG
  - Shared-input clusters
  - Snapshot-vs-rolling audit results
  - Hidden feedback loops

## Level 3 — Calibration Check (8-12 high-impact levers)
  - Per-lever: designed vs observed, sensitivity, archetype segmentation

## Part E — Modularization Lens
  - Which levers cluster naturally into modules?
  - Which are independent?
  - Cadence-based module boundaries
  - Hard-coded-to-DB promotion list
  - Recommendation

## Appendix — Data sources, queries, code paths referenced
```

## 5. Interaction protocol

- Status updates: three-option protocol. Concrete artifacts, "NO PROGRESS + reason + ask," or "CANNOT COMPLETE + alternative."
- Short text breadcrumbs between tool-use runs — same pattern you used successfully on Item 18.
- Partial deliveries welcome. Level 1 inventory can ship as a standalone update before Level 2 and 3 are done.
- Out of scope: any recommendation that implies code changes in the current observation window. All recommendations frame as "B66 scope candidate" or "pre-Phase-19 preparation."

## 6. Timeline

Start immediately after Item 18 Part E is complete. Target: first partial (Level 1 inventory) within 1-2 exchange rounds. Full audit by 2026-04-27 to inform B66 scoping alongside Item 18 + Item 19 findings.

## 7. What Claude Code is doing in parallel

- Item 19 brief (classifier cadence/latency audit) — issued to you after this one
- Observation window monitoring continues
- Post-audit modularization synthesis doc — will consolidate Part E sections from Items 15/18/19

---

*End of Item 15 brief. Begin when Item 18 Part E is closed.*
