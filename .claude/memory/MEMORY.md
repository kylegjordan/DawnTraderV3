# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language strengthened 2026-05-28; §3.3 Phase-24; §5 #15 NO PATCHES + #19 CI per-batch; §6.5.0.a embedded-diff + no-gdrive; §7.1 mirror; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. **Telegram poll:** `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`.
5. Plain-language summaries to Kyle: EVERY message, not just final summaries. TWO paragraphs default. Topic 21 + Claude Desktop both. NO DMs to @CCDTCommsBot.
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-28 — AUTONOMOUS B.1 batch run authorized by Kyle 2026-05-28 evening)

Kyle going to bed; gave autonomous authorization to iterate to consensus + completion through full 11-step workflow on B.1 sub-batch. Update memory after every step for compaction resilience. Plain-language recap on completion.

### 🟢 PHASE 1 DONE — Filter-path/mode-column investigation (Kyle Q from 2026-05-28 evening)

**Plain-English answer for Kyle:**
The scanner runs against ONE mode at a time, paper OR live. Mode decided by: if live trading engine engaged → use `mode='live'` rows; else → `mode='paper'`. Applies whether trading is ACTIVE OR PASSIVE-LEARNING. So with trading stopped + paper-mode selected, scanner reads `mode='paper'` rows. Within a scan, both VTS thresholds AND active thresholds get evaluated against every pair — VTS-passers → VTS pool (feeds passive learning), active-passers → active pool (feeds trade-opening when trading on). VTS values are byte-identical between paper-mode and live-mode rows (and so are active values), so the `mode` column is effectively a write-twice artifact. Path split is real and lives in `filter_path` column (VTS_* vs active_*). Paper-vs-live duplication is holdover. **For B.2 xStock calibration: 14 distinct targets** (7 VTS-path + 7 active-path); mode-column duplicate rows carry same value.

Source: SIM §3.2 + §3.4; `fx5-scanner.ts` lines 600-624 (scanMode dispatch) + 689-693 (DB read).

### 🟢 PHASE 2 DONE — B79.0n.MCE halving provenance verified

Per Langston Q5.1 pre-A1 gate: tfsMomentumScale=0.010 + tfsVolatilityScale=0.0125 for xstock_spot are **intentional + reviewed** — originated in B79.0n.MCE batch (referenced as "partial seed" in B79.0n.CONFIDENCE-CHAIN commit `9537794`). Gate clears; "validate-the-halving" framing is correct.

### 🟢 PHASE 3 DONE — B.1 Step 3 archive replay complete
2,658 bars classified across 260 symbols. Output CSV at `Claude Comms and Packages/Cross-Session Briefs/b-xstock-calib-b1a-replay-output.csv`. **Distribution analysis written** at `Cross-Session Briefs/B_1A_DISTRIBUTION_ANALYSIS.md`. Headline: regime distribution within design envelope (TFS+IE=29.8%, ST=36.5%, RBS=8.8%, HVU=25.0%, TFS=18.2%). **A3 decision: NO threshold adjustments** — distribution healthy, sample size 2,658 too small for structural changes, Phase 25 with trade outcomes is proper calibration cycle. TFS confidence p95=0.70 (compressed near floor 0.50) confirms Kyle's concern about momentumFactor saturation but interpretation: this is multiplicative formula design intent ("all three weak inputs must align"), not a bug.

### 🟢 PHASE 4 DONE — B.1 Step 3 sibling-feature helpers + tests
- `server/asset_classes/xstock_spot/time-of-day.ts` — `getTimeOfDayClass()` NYSE-clock buckets (DST-aware via Intl).
- `server/asset_classes/xstock_spot/calendar.ts` — `isRebalanceDay()` Russell quarterly last-Friday (Jun/Sep/Dec/Mar). Fixed bug: noon UTC for last-day calc to avoid ET offset shifting to previous calendar day.
- `server/tests/unit/b-xstock-calib-b1-sibling-features.test.ts` — 19 tests, all pass.
- Local tsc baseline 494=494, vitest 19/19 GREEN.

### 🟡 PHASE 6 IN PROGRESS — B.1 Step 4 dispatched to Langston

Change list at `Claude Comms and Packages/Change Lists/B_1_STEP4_CHANGE_LIST.md` with embedded diffs of 4 new files. SCP'd to `/home/langston/inbox/b-xstock-calib/`. Dispatched via SSH+claude-cli (background task `bxs4nfla7`). Awaiting Langston Q1-Q5 review reply.

**Code summary for review:**
- 4 new files in C:\dev mirror (time-of-day.ts, calendar.ts, sibling-features.test.ts, replay harness)
- ZERO changes to regime-thresholds.ts, market-regime.ts, module_constants, screener_filters
- Validation/observation batch — no production behavior change

### KEY DOCS / COMMITS
- **B.1 pre-audit:** `Claude Comms and Packages/Scope Files/B_1_PRE_AUDIT.md` (Langston Step 2 ACK clean; revised: Read A confirmed don't pre-decide — run replay first per Kyle 2026-05-28; Option A keep TS-constants per Langston Q1 pushback)
- **Umbrella scope:** `Claude Comms and Packages/Scope Files/B_XSTOCK_CALIB_SCOPE.md` (v1; v1.1 PENDING B.2 14-targets correction + filter-path/mode-column findings)
- **B-NEW-45 closure committed locally** at `eb0576d23` + `1c434d747` (CLAUDE.md §1 strengthened); HELD PUSH per Kyle review-first preference
- **Halving commit:** `9537794` (B79.0n.CONFIDENCE-CHAIN Step 3 Chunk 1)
- **MCE close:** `aa0564107` (deploy `aa0564107` → PM2 #311 2026-05-22)

### 🟢 VERIFY-GATE WATCHLIST (autonomous run should process if any promote during sleep)
- `cbe84d5b` — B79.0n.SCORING + TEC +48h at 2026-05-28 02:47Z (PROBE GREEN — ACK on promote)
- `1f34cf84` — B79.0n.TELEMETRY +48h at 2026-05-28 18:01:48Z
- `b83b1e4b` — B-NEW-40 14-day soak at 2026-05-31 12:46Z

### OPEN B.2 SCOPE CORRECTION (deferred until after B.1 ships)
14 distinct targets per asset_class (7 vts_* + 7 active_*). xStock-side gap: missing `vts_strong_trend` in live + 2 blank-filter_path rows. Write same value to paper + live rows.

---

## AUTONOMOUS PHASE PLAN (B.1 close, ~12 hr realistic)
- ✅ Phase 1 — filter-path/mode investigation
- ✅ Phase 2 — halving commit-hash provenance
- 🟡 Phase 3 — Step 3 archive-replay harness (A1)
- ⏳ Phase 4 — Step 3 run replay + distribution analysis (A2, A3)
- ⏳ Phase 5 — Step 3 sibling features (S1-S3) + tests (A5) + local typecheck (A6)
- ⏳ Phase 6 — Step 4 dispatch to Langston (embedded-diff change list)
- ⏳ Phase 7 — Steps 5-6 push + CI + staging deploy
- ⏳ Phase 8 — Steps 7-8 verification (CC + Langston)
- ⏳ Phase 9 — Step 10 governance (all-8-docs)
- ⏳ Phase 10 — Step 11 completion report + 3-way MEMORY sync + final push

---

## OPERATIONAL INVARIANTS (DO NOT FORGET)
- **CLAUDE.md §1 strengthened 2026-05-28:** plain language on EVERY Kyle message — not just final summaries. No SSH/cron/systemd/process jargon. Substitute "phone call to Langston" / "AI helper on the other computer" / "scheduled alert" if unsure.
- **§5 #19 CI per-batch confirmation MANDATORY**.
- **§10.5 alerts every turn** — SURFACE actionable IN RESPONSE. Langston now auto-receives via SSH-invoke per B-NEW-45.
- **§6.5.0 file-first dispatch** — SCP to `/home/langston/inbox/<batch>/`.
- **§6.5.0.a embedded-diff** for Step 4 code reviews.
- **§7.1 code edits in `C:\dev` mirror ONLY** — governance in GDrive OK. Test gates: `cd /c/dev/DawnTraderV3 && npx tsc --noEmit` (494 baseline) + `node scripts/check-tsc-baseline.mjs`.
- **§3.1 MEMORY 2-file pattern** — edit truth file FIRST then copy to in-repo + commit/push same governance turn.
- **§3.2 MEMORY ≤200 lines**.
- **Active trading = paper OR live (sub-states).** VTS = passive learning when active trading is OFF, no paper concept. (Kyle terminology fix 2026-05-28.)
- **NEVER push without Kyle review** per autonomous-run trust pattern — commit locally, surface for review.

---

## ACTIVE TASKS (post-Phase 2 cursor)
1. **Phase 3 START:** read `regime-thresholds.ts` + `market-regime.ts` calculatePairRegime signature in C:\dev mirror → draft replay harness script.
2. Run harness against staging archive DB.
3. Emit CSV with per-branch confidence + regime distribution.

### .b follow-ups + open RUNNING_ISSUES (key only)
- #141 TEC.b strict 11-key HARD-FAIL — 7d SLA after 48h gate close
- #147 TELEMETRY.b per-class disk persistence — no SLA
- #153 xstock pattern_max_position_pct 0.50 placeholder
- #135 ✅ CLOSED 2026-05-28 via B-NEW-45
