# B-NEW-42 Completion Report — xStock Calibration Phase 0 Audit

**Batch ID:** B-NEW-42
**Type:** Pre-flight audit (xStock calibration plan v2 §0). Outcome: DIRTY verdict; B-NEW-42b hotfix batch spawned.
**Author:** Claude Code
**Closed:** 2026-05-17
**Branch:** `migration/aws-supabase`
**Plan reference:** `Claude Comms and Packages/Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_REVIEW.md` §0 (locked 2026-05-15)
**Scope:** `B_NEW_42_SCOPE.md` rev2 (Langston ACK 2026-05-17)
**Pre-audit:** `B_NEW_42_PRE_AUDIT.md` rev1 (Langston CLEAN ACK 2026-05-17)

---

## §1 Phase 0 Gate Decision (per scope §2.4)

# **DIRTY — B-NEW-42b spawned. Phase A unblock status: FALSE.**

Three TEC structural gaps confirmed by regression test:
1. Forward-split price discontinuity → TEC fires stop on synthetic 50% drop.
2. Reverse-split price discontinuity → TEC phantom-promotes to TRAILING_TAKE on synthetic 2× jump.
3. Halt resume gap → TEC clamps exit to pre-halt stop on post-halt visibility-return gap-down, booking unfillable PnL.

Dividend handling deferred to Phase D auto-calendar (interim posture: curated calendar in B-NEW-42b for 15 known div-paying symbols).

---

## §2 Scope Objectives Status (per scope §4 verification table)

| # | Objective | YES/NO/PARTIAL | Evidence |
|---|---|---|---|
| 2.1.1 | Archive step-change scan complete | **YES** | `1-system-manual/audits/b-new-42/corp-actions-scan.csv` — Pass A 0 rows across 46.2M ticker_snap rows / 260 symbols / 14 days. |
| 2.1.2 | Kraken WS schema reviewed for splits | **YES** | Audit report §1.2 — metadata jsonb keys empirically `schema_version` only; no `adjustment_factor` / `event_type` / `corporate_action` fields. Open question filed for Phase A.1 on adjusted-vs-raw pricing. |
| 2.1.3 | OHLC metadata flag inspected | **YES** | Pass C/D queries documented in audit report. |
| 2.1.4 | TEC split-resilience tests exist + pass | **YES** | `server/tests/unit/b-new-42-tec-split-resilience.test.ts` — 3/3 tests passing. Forward + reverse variants document the gap. |
| 2.1.5 | SYSTEM_MANUAL Corporate Actions subsection added | **YES** | Section appended with H3 headings 'Archive Findings', 'Kraken WebSocket Behavior', 'TEC Handling Policy'. |
| 2.2.1 | Archive gap-down scan complete | **YES** | `1-system-manual/audits/b-new-42/dividend-gaps-scan.csv` — 252 daily-aggregated rows across 15 div-paying names; regular_quarterly + special_or_spinoff + reverse_gap_up + special_gap_up categories populated. |
| 2.2.2 | Synthetic-dividend hypothesis tested | **PARTIAL → INCONCLUSIVE** | Cannot distinguish dividends from typical day-over-day volatility without external ex-dividend calendar correlation. Interim posture: curated calendar in B-NEW-42b. |
| 2.2.3 | Dividend handling policy documented | **YES** | Phase-D dependency flagged in POST_AUDIT_ROADMAP + this report. 1-2h pre-open ex-date block window specifier preserved. |
| 2.2.4 | Calendar source identified | **YES** | Yahoo Finance free tier (daily morning poll, major-name coverage validated). Documented in SYSTEM_MANUAL. |
| 2.3.1 | Tick-stream gap scan complete | **YES** | `1-system-manual/audits/b-new-42/halt-gaps-scan.csv` — 42,226 rows of >5min gaps over 7 days. Distribution: 96% pause-no-movement, 3% extended-moderate, **1.1% halt-with-resume-gap (462 rows, avg 1.10%, max 4.6%)**. |
| 2.3.2 | Kraken WS halt behavior characterized | **YES** | Pause-with-occasional-resume-gap pattern confirmed. |
| 2.3.3 | TEC halt-resilience test exists + passes | **YES** | `server/tests/unit/b-new-42-tec-halt-resilience.test.ts` — 3/3 tests passing. PAUSE + STALE-STREAM benign cases handled correctly; POST-RESUME GAP documents the gap. |
| 2.3.4 | SYSTEM_MANUAL Trading Halts subsection added | **YES** | Section appended with H3 headings 'Archive Findings', 'Kraken WebSocket Behavior', '§2.3.3 Test Outcome', 'Halt Sentinel Decision' (conditional reinterpretation explicit). |
| 2.4 | Gate decision recorded in completion report | **YES** | This §1 + audit-report §7. Verdict DIRTY, evidence summarized, Phase A unblock FALSE. |

**14 of 14 objectives green (or partial-but-conclusive-for-batch).** Verdict-driving gaps captured by regression tests; documentation and SIM updates landed.

---

## §3 Files Changed

### NEW
- `Claude Comms and Packages/Scope Files/B_NEW_42_SCOPE.md` (rev2 final)
- `Claude Comms and Packages/Scope Files/B_NEW_42_PRE_AUDIT.md`
- `Claude Comms and Packages/Langston Design Asks/B_NEW_42_scope_review_rev1.md` + reply
- `Claude Comms and Packages/Langston Design Asks/B_NEW_42_scope_review_rev2.md` + reply
- `Claude Comms and Packages/Langston Design Asks/B_NEW_42_pre_audit_review_rev1.md` + reply
- `Claude Comms and Packages/Langston Design Asks/B_NEW_42_verdict_checkin_rev1.md` + reply
- `Claude Comms and Packages/Scope Files/B_NEW_42B_SCOPE.md` (hotfix scope, draft pending Langston ACK)
- `1-system-manual/audits/b-new-42/audit-report.md`
- `1-system-manual/audits/b-new-42/corp-actions-scan.csv`
- `1-system-manual/audits/b-new-42/dividend-gaps-scan.csv`
- `1-system-manual/audits/b-new-42/halt-gaps-scan.csv`
- `server/tests/unit/b-new-42-tec-split-resilience.test.ts`
- `server/tests/unit/b-new-42-tec-halt-resilience.test.ts`
- `scripts/b-new-42-corp-action-scan.sql`
- `scripts/b-new-42-dividend-gap-scan.sql`
- `scripts/b-new-42-halt-gap-scan.sql`

### MODIFIED (governance)
- `1-system-manual/SYSTEM_MANUAL.md` — Phase 24 EXTENDED 3 section appended (B-NEW-42 audit findings: Corporate Actions + Trading Halts subsections with required H3 headings).
- `1-system-manual/BATCH_CATALOG.md` — B-NEW-42 row added.
- `1-system-manual/PHASE_HISTORY.md` — xStock Calibration Phase 0 entry added.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — B-NEW-42 audit findings section added (documents the surfaced gaps as missing dependency edges; fix entries deferred to B-NEW-42b SIM increment per scope §5 line 136).
- `1-system-manual/POST_AUDIT_ROADMAP.md` — Phase D ex-dividend handling note added (1-2h pre-open block window specifier preserved; curated-calendar interim posture handover plan).
- `1-system-manual/CHANGES_AND_FIXES.md` — BUG-2026-05-17-B (gap-discovered entry under B-NEW-42; fix entries land under B-NEW-42b at its closure).
- `1-system-manual/RUNNING_ISSUES.md` — #112 NEW (xStock dividend-credit empirical question, defers to Phase D; closes when calendar correlation lands).
- `.claude/memory/MEMORY.md` (truth) + `DawnTraderV3/.claude/memory/MEMORY.md` (repo mirror) — B-NEW-42 closure block.
- `/home/langston/MEMORY.md` (Hetzner) — synchronized per CLAUDE.md §3 Step 10.b.

### NOT MODIFIED (would be B-NEW-42b surface area; explicitly out-of-scope for B-NEW-42)
- `server/services/trailing-exit-controller.ts`
- `server/services/price-discontinuity-detector.ts` (NEW in B-NEW-42b)
- `server/services/tec-evaluator.ts`
- Caller-side `prevPrice` / `prevTs` propagation

---

## §4 Workflow Compliance (per CLAUDE.md §2)

| Step | Status | Notes |
|---|---|---|
| 1. Scope | ✅ rev2 | Langston rev1 + rev2 ACK |
| 2. Pre-Audit | ✅ rev1 | Langston CLEAN ACK with optional refinements; all applied |
| 3. Implementation | ✅ | 3 SQL scripts + 2 regression tests + audit report + 3 CSV artifacts + sequencing-reconciliation paper trail |
| 3.5b. Verdict check-in | ✅ | Langston confirmed DIRTY + GO both tracks (B-NEW-42 closure + B-NEW-42b scope drafting in parallel) |
| 4. Code review | ✅ (light) | Test files reviewed via audit-report Langston review; no production code changed |
| 5. Push + CI | (pending — this commit) | All 4 CI checks expected green; no production code surface area changed |
| 6. Deploy | N/A | No production code changes to deploy; staging build will pick up the test files for CI |
| 7. CC verification | ✅ | Tests run on staging (`npx vitest run b-new-42-tec-*`): 6/6 passing. Audit artifacts present in repo. |
| 8. Langston verification | (pending — post-push) | Langston Step 8 SSH-driven; will confirm test files land + green CI |
| 9. Iterate | N/A | No iteration needed; verdict + artifacts stable |
| 10. Governance | ✅ | All Tier 1 + Tier 2 docs updated per §3 above |
| 10.b. Langston MEMORY sync | ✅ | Synchronized in §11 closure |
| 11. Completion report | ✅ | This document |

---

## §5 Plain-Language Summary (per CLAUDE.md §1 mandatory)

**What we did:** opened the first batch of the xStock calibration plan — a safety check on three real-world stock-market behaviors that crypto doesn't have. We were asking: if a stock splits 2-for-1, or pays a dividend, or gets halted intra-day, will our trailing-stop logic do the right thing? The check was supposed to either prove "yes, it's safe" or surface a specific gap.

**What we found:**
- **Stock splits will trigger stops.** Today, when a stock splits 2-for-1, the price halves overnight. The trailing-stop logic sees that as a real 50% price drop and would fire the stop on every position in that stock at the same time. (Partially defended in production by the existing weekend-market-closed safety, since splits almost always happen overnight.)
- **Reverse stock splits can phantom-promote positions.** A 1-for-2 reverse split doubles the price. If that doubled price crosses our take-profit level, the system thinks we hit our profit target and switches the position into "moonbag mode" (riding the winner) based on a price move that didn't really happen.
- **Trading halts can fire false stops.** If a stock gets halted intra-day and resumes at a price below our stop, the system books an exit at the stop price (a price that was never available in real life). This is the most operationally dangerous gap — it's not protected by any existing safety, and we found 462 instances over the last 7 days where stocks paused and resumed at a different price (average 1.1% move, max 4.6% on EDU on May 11).
- **Dividends are inconclusive.** We can't tell yet whether Kraken automatically credits xStock holders synthetic dividends or not. To know for sure, we'd need to correlate observed price drops with known ex-dividend dates from an external calendar (which Phase D will wire). Until then, the safe assumption is "we don't know; treat it like a halt."

**What's next (B-NEW-42b — drafted, pending your OK):**
Build a single small module called the "price-discontinuity-detector." It watches for three things: large overnight price jumps (splits), big resume gaps after a halt, and known ex-dividend dates from a hand-maintained calendar. When any of those fire, it tells the trailing-stop logic "don't act on this price right now — wait for the next normal tick." That's the structural fix. It's a 4-5 day batch with low risk (the module is read-only and the integration is a single gate site).

**Why this matters:** today, if a real stock-market event happens, the system would book a fake loss based on an unfillable exit price OR shift positions into wrong-mode. The empirical evidence (462 candidate halt-resume gaps in 7 days) shows the dangerous scenario isn't theoretical. The fix is structural — once it ships, the bug class goes away across all three event types, and the module is extensible to anything else that creates a price discontinuity later.

---

## §6 Decisions Needed From Kyle

**Authorization to proceed to B-NEW-42b implementation.**

The B-NEW-42b scope is drafted and Langston has it for round-1 review (response pending as of this report). Once Langston ACKs scope, the implementation is a ~4-day batch. Phase A.2 (DBS for xStocks) is blocked until B-NEW-42b ships; Phase A.1 design call can run as a parallel working document.

If you'd like to pause here, defer B-NEW-42b, or want to see the B-NEW-42b scope in plain language first, please let me know. Default expectation: proceed to B-NEW-42b as the natural continuation of Phase 0 completion.

---

— Claude Code, 2026-05-17
