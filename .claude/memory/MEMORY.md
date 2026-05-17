# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language; §6.5.0.a embed-diff-inline; §6.5.0.b hung-instance checking; §6+§8 Langston comms; §10.5 per-turn alerts).
2. Read this file.
3. **§10.5 alerts check (mandatory every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"` — surface any unack'd active entries.
4. Kyle messages me in Claude Desktop. Telegram = Langston comms + outbound visibility. **No proactive DMs to Kyle.**
5. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; use jargon in Kyle-facing summaries; assume — verify.

**For Langston dispatches:** embed diff snippets inline + explicit "DO NOT cd to gdrive" (per §6.5.0.a). Check status at 5-10 min, kill+re-dispatch by 12 min max (per §6.5.0.b). Never let polling loops run unbounded.

---

## 🟢 JUST CLOSED (2026-05-17)

- **B-NEW-42b** — price-discontinuity detector + TEC integration. Commit `d8e0f5885` → governance closeout `c5f805401`. PM2 #293. Closes all 3 B-NEW-42-confirmed exit-side gaps (forward-split stop, reverse-split phantom-promote, halt-resume-gap unfillable fill). 4 kinds: halt_resume_gap / corp_action / ex_dividend / cold_start fail-safe. Single hoisted detector consultation per logical tick in `tec-evaluator.ts`. Curated 60-entry ex-dividend calendar (15 names × Q3+Q4 2026 dates). State machine IDLE / DISCONTINUITY_ACTIVE / CLEARING with stateless 5min HARD_CEILING + lazy 24h eviction gated on IDLE. Langston Step 1+2+4(round 1+2 after BLOCKER fixes)+8 ACK'd. 76/76 tests green; crypto regression ZERO. **All three trading modes (VTS, paper, live) protected on EXIT side.** Completion report: `Claude Comms and Packages/Batch Completion/B_NEW_42B_COMPLETION_REPORT.md`.

- **B-NEW-42** — Phase 0 audit (DIRTY verdict). Spawned B-NEW-42b.

- **B-NEW-40 + B-NEW-41** — closed earlier 2026-05-17.

## 🟡 OPEN GAP (accepted via Option A — Kyle directive 2026-05-17 evening)

- **Entry-side discontinuity gating NOT BUILT.** The detector covers EXIT decisions only (stop-check + target-lock-promote in TEC). The SCANNER does NOT consult the detector when deciding whether to open new positions. **Consequence:** during a halt-resume gap or split-effected price, the scanner could still open a fresh position at the discontinuity-effected level. **Accepted per Option A** because (a) xStock live trading isn't imminent, (b) VTS + paper bad entries become learning signal not money loss, (c) intra-RTH halts were rare-to-zero in 7-day archive. **Phase 19 live-trading prep MUST add the entry-side counterpart** (mirror-image scanner consult before allowing fresh position on a flagged tick).

## 🟢 NEXT UP — Phase A (xStock DBS Foundation)

**Plan reference:** `Claude Comms and Packages/Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_REVIEW.md` §A (locked 2026-05-15; Langston ACK'd; Kyle authorized to proceed via "go into 42b" → 42b shipped → Phase A unblocked).

### Phase A.1 — DBS design call (FIRST ACTION when Kyle says "go")

**What:** sector-classification + SPY fallback architecture for xStock directional-bias scoring. Eleven SPDR sector ETFs (XLK/XLE/XLV/XLF/XLI/XLP/XLY/XLU/XLB/XLRE/XLC). Index-self handling (SPY/QQQ/IWM xStocks can't benchmark against themselves → force sector-blind regime mode). ADR caveat (beta-to-SPY may understate non-US macro coupling; flag for Phase E). DBS component weights stay byte-identical to crypto (NO pre-emptive equity-tune). Per-sector floor 3-5 pairs, global floor ~30. Sector mapping co-located on `XSTOCK_SPOT_REGISTRY` (extend shape to `{name, is24_7?, sector}`).

**Sector ETF data availability check (procedure):** query `XSTOCK_SPOT_SYMBOLS` for presence of XLK, XLE, XLV, XLF, XLI, XLP, XLY, XLU, XLB, XLRE, XLC AS xStocks. If >3 missing → offline-feed integration becomes A.1 sub-batch with its own Langston design call before A.2 starts.

**A.1 dispatch shape:** I draft the design ask + post to `Claude Comms and Packages/Langston Design Asks/B_PHASE_A1_DBS_design_ask_rev1.md` → file-first protocol to Langston → standard scope-review round-trip.

### Phase A.2 — DBS implementation + backfill (after A.1 design ACK'd)

Build `xstock-directional-bias-store.ts` analogous to crypto's. Wire into `xstockSpotScanner.runCycle` ahead of eval-cycle dispatch. Eval-cycle passes real DBS to MCE (replaces `undefined` at `server/asset_classes/xstock_spot/eval-cycle.ts:353`). **Pre-commit check (Langston v2 ACK clarification c):** verify actual xStock archive start date. **<7 days available → A.2 WAITS for archive maturation** (calibration on ~3 days of history is plumbing-validation, not signal). 7-14 days → proceed but document thinness explicitly. 14+ days → no caveat needed. Backfill 2-3 weeks of historical DBS from archived OHLC. MCE `propagatedDbs` branch lifts when value provided.

### Phase A.3 — DBS verification gate

Compare DBS distributions across xStocks against crypto's known distributions. Confirm values are moving (not stuck at zero or floor/ceiling). Blocks Phase B if anomalies surface.

---

## 🟡 SHELVED until Phase 19

- Confidence calibration vs VTS outcomes.
- B-NEW-38 stratified re-run.
- B67.5 consumer-gate-from-VTS in current form.
- B-NEW-39 Phase 2 (forensic shape).
- TFS sustainability gate value-scope decision (RUNNING_ISSUES #111).
- Detector module_constants DB-resolution (Phase E calibration batch).
- **Entry-side discontinuity gating** (mirror-image scanner consult; Phase 19 live-trading prep).

---

## OPERATIONAL FACTS

- PM2 #293 on staging since 2026-05-17 20:10:00Z (B-NEW-42b). Pipeline healthy.
- B-NEW-42b detector loaded; ex-dividend calendar loaded; cold-start emissions confirmed.
- 24 module_constants rows for `price_discontinuity_detector` (idempotent migration applied).
- Scheduled alert `b83b1e4b` fires 2026-05-31T12:46:47Z (B-NEW-40 14-day soak verify).
- Langston SSH alias `staging` → `deploy@188.245.193.8`. IP-restricted to `204.168.141.77`.
- DATABASE_URL: direct Postgres port 5432 (Supabase Frankfurt).
- **CI red baseline ACCEPTED as pre-existing technical debt** (RUNNING_ISSUES #113). TS Check non-blocking since 2026-03-30; Test Suite 13 failures from Directive 11.3/11.7F era; pre-dates 2026-05-08. B-NEW-42b held the baseline (+1 passing, 0 new failures).

---

## RECENT RUNNING_ISSUES SUMMARY

- **#113 OPEN accepted-baseline** — pre-existing CI red (10+ days); Phase 19 paper-trading prep reckons with it.
- **#112 DEFERRED Phase D (INTERIM POSTURE DEPLOYED via B-NEW-42b)** — xStock dividend-credit question; curated calendar live.
- **#111 DEFERRED Phase 19** — TFS sustainability gate value-scope.
- **#110 OPEN Tier 2** — ForceCommand wrapper on Langston pubkey.
- **#109 OPEN Tier 3** — TEC diagnostic endpoint stale-no-consumer disambiguation.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md` — esp. §6.5.0.a (embed-diff-inline) + §6.5.0.b (hung-instance checking)
2. This file
3. `Claude Comms and Packages/Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_REVIEW.md` — Phase A architecture spec (lines 87-108 = A.1, lines 96-103 = A.2, lines 104-108 = A.3)
4. `1-system-manual/XSTOCK_CALIBRATION_PLAN.md` — living plan doc (mirror of v2 + future progress)
5. Latest active scope/pre-audit if mid-batch
