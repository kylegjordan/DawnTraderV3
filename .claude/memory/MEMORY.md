# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language strengthened 2026-05-28; §2 Step 1.a/§9 **audit = code-level deep read of SIM AND System Manual + trace consumers, NOT grep-and-cite**; §3.3 Phase-24; §5 #15 NO PATCHES + #19 CI per-batch; §6.5.0.a embedded-diff + no-gdrive; **§7.1 🔒SET-IN-STONE storage workflow**; §9.1 scaffolding; §9.3 UI-verify; §10.5 alerts).
   - **🔒 §7.1 STORAGE WORKFLOW (SET IN STONE, Kyle 2026-06-01):** Google Drive folder = SOURCE OF TRUTH; edit there → copy changed files to `C:\dev` test bench → `npx tsc --noEmit`/`npx vitest run` → when green, **commit + push to GitHub FROM the Google Drive folder** → GitHub → staging. **NEVER pull GitHub → Google Drive. NEVER push to GitHub from `C:\dev`.** Only allowed pull: GitHub → `C:\dev`. Batch-close gate: from Google Drive, `git rev-list --count HEAD..origin = 0`.
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. **Telegram poll:** `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`.
5. Plain-language summaries to Kyle: EVERY message. TWO paragraphs default. Topic 21 + Claude Desktop both. NO DMs to @CCDTCommsBot.
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-06-01 — F-NOW CLOSED; NEXT = B.2 depth/liquidity threshold calibration)

**TODAY CLOSED (verified + governed; GDrive↔GitHub↔staging in sync):**
- **B-XSTOCK-CALIB F-NOW** (calibration_state tag plumbing, VTS-only) — deploy `cdac422b9`, CI `26757161780` all-4-green. Tags `vts_open_trades` ONLY (NOT active-paper). Added `calibration_state` to `vts_open_trades` (NOT NULL DEFAULT `pre_calibration_xstock_2026_05`, back-stamped 1,793 xStock + 2,005 crypto) + `exit_strategy_alternates` (nullable, 17,184 xStock VTS rows backfilled in-migration); writer propagates via `resolveCalibrationState(ctx.vtsOpenTradeId)` keyed on `originalSignalId` = the OPEN id (NOT the exit-rebuilt `trade_id`, vts-service.ts:816). **AUDIT MISS + recovery:** v1 pre-audit (grep-and-cite, no System-Manual read) missed that the exit-ablation aggregator feeds the LIVE xStocks-tab panel → unconditional exclusion would have emptied it. Kyle pushback → proper SIM+Manual upstream/downstream read → exclusion reworked **OPT-IN** (`buildCalibrationClause(assetClass, excludePreCalibration)`, default-off, live panels byte-identical, **INERT until Phase-25 caller** — §9.1 scaffolding). Verified: xStock-VTS NULL=0; forward-path live writer confirmed on post-deploy close 13:27:25Z; rollback validated; live panel endpoint 1433 trades/ready=true. Langston Step1+2 ACK-w-rev → Step4 ACK → opt-in re-confirm ACK. (Step-8 independent psql cross-check HUNG on Helsinki ~26min + was killed per §6.5.0.b — infra, not F-NOW; CC-side fully verified incl. forward-path on a REAL post-deploy trade, so NOT a blocker. Optional re-run next session.)
- Earlier today: **B-NEW-47** (B75 storage sweep, RI #161 CLOSED), **B-NEW-50** (node-cron next-fire shim, #165 CLOSED), **Langston CLI 2.1.159 + `opus-4-8[1m]`** update, **🔒 GDrive↔GitHub resync + §7.1 SET IN STONE**.

**★ NEXT — B.2 IMF family threshold calibration (Phase 24, archive-replay, no outcomes):**
1. **B.2** = calibrate xStock **depth/liquidity (LQ) + VN + DI + Correlation** thresholds from archive-replay. B.1.5 made xStock LQ DEPTH-based + added NEW `min_depth_usd` gate (`global-filter.ts:130` + pattern-filter) with starters **2000** (vts/paper) / **5000** (active) needing real calibration; old `min_volume` gate inert (config=0). **KICK OFF with `scripts/b-1-5-universe-audit.ts`** reality-check on 2000/5000 vs weeks-of-collected depth.
2. **THEN remaining Phase-24 calibrations** (B.3 per-strategy gates, B.4+B.5 friction/spread coupled, B.6 TEC priors, B.7 sector, C macro VIX/DXY, D strategy audit, CRYPTO-FRICTION) — all archive-replay, BEFORE any closed-outcome evaluation (= Phase 25 posteriors).

**SEQUENCED-LATER / DEFERRED:**
- **Comms: STAY Telegram.** Kyle 2026-06-01: revisit **Discord** (true live 3-way; bot-to-bot works — unlike Telegram block + WhatsApp banning AI bots Jan-2026) AFTER all Phase 24 calibration. Ops/comms SKILLS ride with that decision.
- B-NEW-48 (per-class regime, RI #162, conditional on consumer-impact audit at scoping).
- **#173** (F-NOW, deferred): consider a RECURRING zero-NULL forward-path guard when Phase 25 actually gates a decision on the calibration_state dataset (fail-open today, one-time check is the net).
- **#166** (TEC stale-cache, alert `b83b1e4b`) — deferred per Kyle to AFTER all Phase 24 calibration.

**ACTIVE/UNACKED ALERT (intentional):** `b83b1e4b` — B-NEW-40 soak FAIL (#166), deferred by design (Langston re-flags it each turn; it is NOT rotting — leave unacked until post-calibration).

**Kyle comms: DESKTOP ONLY** unless 3-way Langston. Plain language every message (CLAUDE.md §1). Two-paragraph default. Active trading OFF (VTS passive learning only).

---

## POST-COMPACTION PROMPT FOR KYLE

> Resume Phase 24 xStock calibration at **B.2** (F-NOW closed 2026-06-01 — calibration_state tagging is live + governed). **B.2 = IMF family threshold calibration:** calibrate xStock depth/liquidity (LQ, now DEPTH-based per B.1.5 + the new `min_depth_usd` gate, starters 2000 vts / 5000 active) + VN/DI/Correlation thresholds from archive-replay, **kicking off with `scripts/b-1-5-universe-audit.ts`** to reality-check 2000/5000 against weeks of collected depth. Full 11-step workflow with Langston. Then the remaining Phase-24 threshold calibrations (B.3 per-strategy gates, B.4+B.5 friction/spread coupled, B.6 TEC priors, B.7 sector, C macro, D strategy audit, CRYPTO-FRICTION) — all archive-replay, BEFORE any closed-outcome (Phase 25) work. 🔒 STORAGE (CLAUDE.md §7.1, set in stone): edit in Google Drive → copy to C:\dev to test → push to GitHub FROM Google Drive → NEVER GitHub→GDrive; batch-close gate = GDrive 0 commits behind origin. **Audit discipline (F-NOW lesson):** Step 1.a/Step 2 = code-level deep read of SIM AND System Manual + enumerate EVERY consumer of any shared aggregator/endpoint before adding a scoped filter (default OPT-IN). Read CLAUDE.md + MEMORY.md + B_XSTOCK_CALIB_SCOPE.md first.
