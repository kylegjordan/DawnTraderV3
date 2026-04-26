# BATCH 65.6 — Completion Report

**Status:** ✅ **CLOSED 2026-04-26 via SKIP per Kyle directive**
**Result:** Per-pair regime classifier audit completed Phase A across multiple analysis tracks. **No code change shipped.** vwap_pullback stays in the strong-trend lane unchanged. Path B (`|DBS| >= 0.30` alone) unchanged. Per-pair-classifier fix deferred to Phase 19.4.5 Observational Decision Gate (newly inserted in roadmap), where active-paper-trading data will provide cleaner evidence.
**Canonical findings reference:** `Claude Comms and Packages/Scope Files/B65_6_FINDINGS_PAPER.md`

---

## 1. Outcome summary

B65.6 set out to find a sustainability check that could be added to Path B of the per-pair regime classifier. After Phase A's exhaustive testing — telemetry-derived candidates, OHLC-derived candidates, historical hostile-day scan, clean-day falsification, global-metrics analysis, classifier replay validation, and a combined-rule sweep — the data did not support shipping a per-pair classifier change.

The most promising single-variable rule (`volume_trend > 0.587`) modestly improved hostile-day WR (+5pp) at minimal clean-day cost, but Kyle's directive was to NOT ship interim patches that Phase 19.5 AMR will likely replace. The findings paper preserves the full audit trail so future-CC at Phase 19.4.5 can pick up the work if active-paper-trading data justifies it.

The investigation also produced significant secondary findings that feed Phase 19.5 AMR design and B72 (lever-to-DB sweep). See §3 for what stays on the table.

---

## 2. Objectives checklist

| # | Objective | Status | Evidence |
|---|---|---:|---|
| 1 | Step-1 scope drafted with research-then-design framing | ✅ | `BATCH_65_6_SCOPE.md` |
| 2 | Step-1 scope reviewed + approved by Langston with refinements | ✅ | cc-inbox #822 with 5 refinements (ADX-floor hypothesis, clean-day-WR guard, MCE telemetry replay source, flicker module constant, all-5-regimes inversion check) |
| 3 | Phase A Track 1 — telemetry-derived candidate variables tested | ✅ | `b656_phase_a_track1.py` — DBS slope, delta, percentile rank, ATR ratio. Best telemetry candidate: DBS percentile rank. None sharp enough alone. |
| 4 | Q5 inversion check across all 5 regimes (Langston refinement) | ✅ | Confirmed hostile-day-specific (04-22 STR 83% WR vs TFS 14% WR — inverted; clean days mostly correct ordering) |
| 5 | Phase A Track 2 Step 1 — historical hostile-day scan | ✅ | 5 hostile days found across 3 months. Two distinct failure modes identified. |
| 6 | Phase A Track 2 Step 2 — OHLC-derived variable test on hostile days | ✅ | Binance pull, ~615 trades. Winners-have-momentum pattern across all hostile days. |
| 7 | Phase A Track 2 Step 3 — clean-day falsification | ✅ | 5 strong clean days, 277 trades. Confirmed winners-have-momentum pattern is HOSTILE-DAY-SPECIFIC. |
| 8 | Global-metrics analysis (cross-pair concentration etc.) | ✅ | TFS share strongest correlation with day WR (r = −0.40). Two hostile days have fundamentally different signatures. Concentration is trend-rider-protection signal only. |
| 9 | Post-B62 classifier replay validation (Kyle Q1 directive) | ✅ | Confirmed B62 deployed 2026-04-16 morning UTC. 04-18 is post-B62. Two-flavor finding holds apples-to-apples. |
| 10 | Option C combined-rule sweep (Kyle question) | ✅ | Decisively rejected by data — clean-day winner blocking 50-79% at every threshold tested. |
| 11 | Phase A findings paper written | ✅ | `B65_6_FINDINGS_PAPER.md` — comprehensive write-up of all observations, scenarios, and decision rationale |
| 12 | Phase 19.4.5 Observational Decision Gate inserted in roadmap | ✅ | New roadmap section between 19.4 and 19.5, references findings paper |
| 13 | Phase B / C / D | ❌ NOT EXECUTED | Skipped per Phase A findings + Kyle SKIP directive 2026-04-26 |
| 14 | Code change shipped | ❌ NOT SHIPPED | None. vwap_pullback stays in strong-trend lane. Path B unchanged. |

**Gates not invoked:** Phases B, C, D were NOT run because Phase A evidence + Kyle directive routed to SKIP. This is the correct workflow behavior.

---

## 3. What stays on the table after SKIP

### 3.1 Phase 19.4.5 Observational Decision Gate (NEW)

A new sub-phase inserted into Phase 19 between SQE recalibration (19.4) and AMR (19.5). The gate uses 1-2 weeks of clean active-paper-trading data to decide which currently-post-live items might need to move pre-launch. References this batch's findings paper as the canonical reference for the per-pair classifier work that was done pre-Phase-19 and intentionally NOT shipped. See `POST_AUDIT_ROADMAP.md` Phase 19.4.5 for full scope.

The 6 observation items the gate watches:

1. Hostile-window recurrence at active-trading scale → trigger to move Phase 19.5 AMR pre-launch
2. Daily signal volume → trigger to move Phase 21.5 XStocks + Perp Futures pre-launch
3. Per-pair classifier misclassification visible in active trading → reopen B65.6 candidate variables for shipping
4. Hardcoded constants causing operational pain → trigger to expand B72 lever migration scope
5. Modularization friction → trigger to pull Phase 21.4 modularization pre-launch
6. Machine learning data sufficiency → trigger to pull Phase 17 ML Design pre-launch

### 3.2 Cross-pair concentration → Phase 19.5 AMR detection layer

The strongest single signal in the data is cross-pair regime concentration (TFS+IE share). It catches the 04-22 trend-rider hostile-day flavor (83% concentration vs 41-54% normal) but is silent on the 04-18 reversal-strategy hostile-day flavor (41.9% concentration). This signal naturally belongs in Phase 19.5 AMR's multi-input detection layer — see `ADAPTIVE_MARKET_RESPONSE_CONCEPT.md` §6 + §10.

### 3.3 Candidate variables documented for future use

If Phase 19.4.5 observational data justifies reopening per-pair classifier work, the candidate variables and their cohort behavior are fully documented in `B65_6_FINDINGS_PAPER.md` §4. Future-CC starts from a ranked list, not from scratch:

1. Cross-pair TFS+IE concentration (rolling N cycles)
2. Volume trend (recent / earlier ratio)
3. RSI(14)
4. Price distance from MA(20)
5. DBS percentile rank vs rolling distribution

---

## 4. Files touched in this batch

**Created (analysis + governance):**
- `Claude Comms and Packages/Scope Files/BATCH_65_6_SCOPE.md`
- `Claude Comms and Packages/Scope Files/B65_6_PHASE_A_CLASSIFIER_INPUT_AUDIT.md`
- `Claude Comms and Packages/Scope Files/B65_6_FINDINGS_PAPER.md` (canonical write-up)
- `Claude Comms and Packages/Scope Files/REGIME_CLASSIFIER_INVESTIGATION_2026_04_26.md`
- `Claude Comms and Packages/Scope Files/b656_phase_a_track1.py` — telemetry-derived variables
- `Claude Comms and Packages/Scope Files/b656_track2_step1_hostile_days.py` — historical hostile-day scan
- `Claude Comms and Packages/Scope Files/b656_track2_step2_ohlc_pull.py` — OHLC variables on hostile days
- `Claude Comms and Packages/Scope Files/b656_track2_step3_clean_days.py` — clean-day falsification
- `Claude Comms and Packages/Scope Files/b656_global_metrics.py` — global signals analysis
- `Claude Comms and Packages/Scope Files/b656_classifier_replay_04_18.py` — classifier replay validation
- `Claude Comms and Packages/Scope Files/b656_option_c_test.py` — combined-rule sweep
- `Claude Comms and Packages/Batch Completion/BATCH_65_6_COMPLETION_REPORT.md` (this file)

**Modified in same governance commit as this report:**
- `1-system-manual/POST_AUDIT_ROADMAP.md` — new Phase 19.4.5 section
- `1-system-manual/BATCH_CATALOG.md` — B65.6 row marked CLOSED via SKIP
- `1-system-manual/PHASE_HISTORY.md` — Phase 15c continuation entry for B65.6 SKIP
- `MEMORY.md` — B65.6 closed; Phase 19.4.5 added; B65.6 findings paper noted

**No code files modified.** This batch ships zero TypeScript / SQL / migration changes. The deliverable is the audit + the findings paper + the Phase 19.4.5 gate.

---

## 5. Workflow notes

1. **SKIP routing is now a recognized workflow outcome.** B65.5 closed via SKIP last week (Phase A0 found the cohort was confounded). B65.6 closes via SKIP this week (Phase A found the data doesn't support a sharp single-variable fix and Kyle's directive prefers observation-stage decisions over pre-launch patches). Two SKIPs in a row is not a failure — it's the workflow correctly preventing premature commits to fixes that observation-stage evidence would invalidate.

2. **The findings paper format works.** When a research batch closes without code, the comprehensive write-up is the deliverable. It preserves institutional memory for future-CC and prevents the team from re-running the same investigations later. Phase 19.4.5 references this paper directly so that the future observational-decision team has the full record of what was tested pre-launch.

3. **Two-week-window observation gates are useful.** Phase 19.4.5 formalizes a pattern that was implicit in earlier batches (B65.4 ladder ship requested 24h observation; this batch defers to multi-week paper observation). Future research batches that produce ambiguous evidence should default to "ship findings paper, defer code decision to observation gate."

---

## 6. Governance documents touched

Per CLAUDE.md §3, this completion report lists every governance file modified by B65.6:

**Tier 1 (always):**
- `BATCH_CATALOG.md` — B65.6 row marked CLOSED via SKIP
- `PHASE_HISTORY.md` — Phase 15c continuation entry
- `MEMORY.md` — closure + Phase 19.4.5 + findings paper reference
- `BATCH_65_6_SCOPE.md` — scope (drafted in this batch)
- `BATCH_65_6_COMPLETION_REPORT.md` — this file

**Tier 2 (where applicable):**
- `POST_AUDIT_ROADMAP.md` — new Phase 19.4.5 Observational Decision Gate section
- `B65_6_FINDINGS_PAPER.md` — canonical write-up (Tier 2 reference document, not a system manual)

**Tier 2 NOT touched (and why):**
- `SYSTEM_IMPACT_MAP.md` — no component added/removed/modified
- `SYSTEM_MANUAL.md` — no architecture or math changes (the classifier code is unchanged)
- `CHANGES_AND_FIXES.md` — no bug/risk fix shipped
- `RUNNING_ISSUES.md` — the per-pair classifier issue isn't a new open issue (it's documented in the findings paper for Phase 19.4.5 review)

---

*B65.6 closed 2026-04-26 via SKIP. Findings paper is the artifact. Phase 19.4.5 inherits the work for observation-stage decision.*
