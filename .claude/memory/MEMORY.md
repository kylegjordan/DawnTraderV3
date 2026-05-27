# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + TWO-paragraph default; §3.3 Phase-24; §5 #15 NO PATCHES + #19 CI per-batch; §6.5.0.a embedded-diff + no-gdrive; §7.1 mirror; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. **Telegram poll:** `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`.
5. Plain-language summaries to Kyle: TWO paragraphs default. Telegram topic 21 + Claude Desktop both. NO DMs to @CCDTCommsBot (Kyle 2026-05-27 evening).
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-28 — B-XSTOCK-CALIB umbrella IN PROGRESS at sub-batch 1 / B.1 Step 2 pre-audit)

### 🟢 B79.0n.EXECUTION (#13) CLOSED 2026-05-27 evening
Closing commit `f283c2c` + governance close `6d6fc4c7a`. Last per-class plumbing sub-batch in B79.0n umbrella v4 (13 of 16 done). TradeClosedEvent additive assetClass + position-record SSOT cleanup + diagnostic v2 nested-by-layer payload.

### 🟢 Phase 19 / Phase 25 SPLIT LOCKED (commit `7ab09cac3`)
Phase 19 = functional from scan to closed trade + calibrations without trade outcomes (18 items). Phase 25 = calibration with trade outcomes (10 items). Batch ordering within each phase decided at phase start. Two new Phase 19 batches added: 19-17 Active Trading Simulations (VTS-like layer for all RTB signals + SQE-rejected tagged) + 19-18 Live-mode build approach. **Phase 25 number repurposed** — B80 crypto_perp deferred to post-launch already.

### 🟢 AMR CONSENSUS body-now/brain-later (commit `e78e2ecf7` 2026-05-28)
CC + Langston converged. **Phase 19 entry 19-19** = AMR body pre-Phase-19 batch (weather aggregator + dials + Aggressive mode + per-asset-class module_constants with hand-set conservative thresholds) + **shadow-mode boot gate** first 5-7 days of Phase 19 (logs all but dials pinned Normal — no brakes). **Phase 25 entry 25-6 corrected** to "AMR posture-model M2 calibration (post-launch Phase 17/18 via body socket)" per ML_DESIGN_PRELIMINARY §6.2 + §7. Langston verified socket claim directly.

### 🟡 B-XSTOCK-CALIB umbrella IN PROGRESS — sub-batch 1 (B.1) Step 2 pre-audit NEXT
Per Kyle directive 2026-05-27 evening "next batch = all calibration work for xStocks that doesn't require trades closing." Sits before Phase 19. Closing commit pending: **A.3 verification gate CLOSED 2026-05-28 via memo** (Read B confirmed + 2 B.7 carry-forwards: sector-under-coverage-floor handling + per-sector top-N measurement) — commit `7f06d47b8`. Langston Step 1 ACK clean on umbrella scope v1 with 5 refinements absorbed.

**Umbrella shape (10 sub-batches + A.3 pre-kickoff DONE):**
1. **B.1 regime threshold + TFS confidence-formula** — internal split: B.1a regime threshold uncontested + B.1b TFS confidence-formula **Kyle-ACK-gated at Step 2 pre-audit** (Kyle's 15:59Z voice 2026-05-27 said "regime classifiers, without the confidence" — Langston correctly flagged interpretation-vs-transcription belongs with Kyle; surface formula-vs-modifier distinction with archive-replay numbers attached so Kyle decides with empirical evidence in hand).
2. B.2 IMF family threshold calibration (parallel-capable).
3. B.3 per-strategy gate calibration (parallel-capable).
4. B.4+B.5 friction + spread (coupled SEQUENCING INVARIANT).
5. B.6 TEC archive-replay priors.
6. **B.7 sector concentration gate + roadmap 19-16 folded** — with 2 B.7 carry-forwards from A.3 memo (sector-under-coverage-floor as discrete aggregation-suppression state for XLB single-symbol case; per-sector top-N volume concentration as the real measurement not global pool — XLK probably violates within-sector even though global is fine).
7. C.1+C.2 equity macro modifier (parallel-capable).
8. D.1 strategy + regime audit (+ #97 earnings-calendar slice folded).
9. CRYPTO-FRICTION review (sibling parallel; BATCH_CATALOG cross-link satisfies BOTH xStock B.4/B.5 retune AND B81 admission checklist item 2).
10. F-NOW asset-class-tag plumbing (**dispatched FIRST into parallel slots** — calibration_state column needed before any xStock trade opens during umbrella).

**Model C hybrid sequencing** with **2-sub-batch Langston review queue cap.** Critical path A.3 (done) → B.1 → B.4+B.5 → B.6. Estimated 12-17 days total.

### 🟢 VERIFY-GATE WATCHLIST
- `cbe84d5b-73a6-4ed7-9009-447b37ecec04` — B79.0n.SCORING + TEC +48h at 2026-05-28 02:47Z (fires today)
- `1f34cf84-a37c-425c-a1c4-54924b053061` — B79.0n.TELEMETRY +48h at 2026-05-28 18:01:48Z (fires today)
- `b83b1e4b-4870-43d9-9ba0-a45a7d3949be` — B-NEW-40 14-day soak at 2026-05-31 12:46Z

### KEY DOCS / COMMITS
- **Umbrella scope:** `Claude Comms and Packages/Scope Files/B_XSTOCK_CALIB_SCOPE.md`
- **Step 1.a synthesis:** `Claude Comms and Packages/Langston Design Asks/B_XSTOCK_CALIB_ARCHITECTURAL_SYNTHESIS.md`
- **A.3 closure memo:** `1-system-manual/_audit/A3_DBS_VERIFICATION_GATE_MEMO.md`
- **Calibration plan SSOT:** `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` (Phases B/C/D/F-NOW in scope; E + F-LATER + G OUT)
- **Roadmap (Phase 19/25 split + AMR placement):** `1-system-manual/POST_AUDIT_ROADMAP.md` (table near top "2026-05-27 update" + 2026-05-28 AMR consensus)
- **AMR body source docs:** `Claude Comms and Packages/Cross-Session Briefs/AMR_PRE_PHASE_19_PEER_DISCUSSION_2026-05-25.md` + `Cross-Session Briefs/ML_DESIGN_PRELIMINARY_2026-05-21.md` + `1-system-manual/ADAPTIVE_MARKET_RESPONSE_CONCEPT.md`
- **Langston inbox staging:** `/home/langston/inbox/b-xstock-calib/` (synthesis + scope v1 + A.3 memo + AMR brief + ML preliminary all local-FS)
- **Recent commits:** `f283c2c` (EXECUTION Step 3) → `6d6fc4c7a` (EXECUTION close) → `7ab09cac3` (Phase 19/25 split) → `7f06d47b8` (B-XSTOCK-CALIB pre-kickoff) → `e78e2ecf7` (AMR consensus)

### .b follow-ups + open RUNNING_ISSUES (key only)
- #141 TEC.b strict 11-key HARD-FAIL — 7d SLA after 48h gate close
- #147 TELEMETRY.b per-class disk persistence — no SLA
- #153 xstock pattern_max_position_pct 0.50 placeholder — HARD pre-condition for WIRE-IN
- #155 perp `reason` field truncation in diagnostic endpoint (cosmetic, both layers)
- #157-#159 Langston EXECUTION Step 4 C5 follow-ups (knownGaps line-drift / JS-filter scale / canary log volume gating)

---

## REMAINING UMBRELLA V4 SUB-BATCHES (3 of 16 left, gated on Kyle Phase 19/25 sequencing)
- #14 WIRE-IN (Phase 19a) — gated on active-trading flip authorization
- #15 ML-CALIBRATION T2 — Phase 25
- #16 OBSERVABILITY T2 + active-trading flip — Phase 19

---

## OPERATIONAL INVARIANTS (DO NOT FORGET)
- **§5 #19 CI per-batch confirmation MANDATORY** — never close a batch with red CI.
- **§10.5 alerts every turn** — SURFACE actionable IN RESPONSE.
- **§6.5.0 file-first dispatch** — SCP to `/home/langston/inbox/<batch>/`, NEVER /mnt/gdrive paths in Langston prompts.
- **§6.5.0.a embedded-diff** for Step 4 code reviews.
- **§7.1 code edits in `C:\dev` mirror ONLY** — governance docs in GDrive OK. Test gates: `cd /c/dev/DawnTraderV3 && npx tsc --noEmit` (494 baseline) + `node scripts/check-tsc-baseline.mjs`.
- **§3.1 MEMORY 2-file pattern** — edit truth file FIRST then copy to in-repo + commit/push same governance turn.
- **§3.2 MEMORY ≤200 lines** — `wc -l` after edit; prune before commit.
- **Plain-language summaries:** TWO paragraphs default; post Telegram topic 21 + Claude Desktop. NO @CCDTCommsBot DMs (Kyle 2026-05-27 evening).
- **xStock 24/5** (NOT US RTH). US market holidays pause cadence.
- **Langston:** canonical session UUID bridge-locked. Use fresh `uuidgen` for SSH-deliver. Always pass `--permission-mode bypassPermissions`.
- **§6.5.0.b hung-instance check** — kill Langston find/claude PIDs if stuck on FUSE-mount paths >5 min; re-dispatch with all docs SCP'd to local inbox.
- **Autonomy with Langston:** iterate to consensus per §6.7. Escalate to Kyle only on deadlock / architectural decisions / risk boundaries.
- **Phase 24 standing rule:** completion reports MUST include "Asset-class onboarding workflow learnings" 4-section block (a/b/c/d).
- **All-8-docs ACTUALLY edited at Step 10** per Kyle PATTERN-DETECT directive: BATCH_CATALOG + PHASE_HISTORY + SIM + SYSTEM_MANUAL + MULTI_ASSET + CHANGES_AND_FIXES + RUNNING_ISSUES + ASSET_CLASS_ONBOARDING_WORKFLOW.

---

## ACTIVE TASKS
**Sub-batch 1 (B.1) Step 2 pre-audit** — NEXT IMMEDIATE WORK. Draft per the umbrella scope §1 + Langston Step 1 ACK refinements; surface B.1b Kyle-ACK gate with archive-replay numbers (regime threshold values + TFS confidence-formula scales) attached so Kyle decides B.1b inclusion with empirical evidence not abstraction. Files to read first: B_XSTOCK_CALIB_SCOPE.md §1 sub-batch 1 row + XSTOCK_CALIBRATION_PLAN.md §B.1.
