# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable governance in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines / ~24KB.

---

## SESSION-START PROTOCOL
1. Read `CLAUDE.md` (§1 plain-language + CANONICAL-TERMS; §5 NO-PATCHES + CALIBRATION-LENS; §6.5 Langston comms; §7.1 🔒storage; §9.3 UI-verify; §10.5 alerts).
   - 🔒 **§7.1 STORAGE:** GoogleDrive folder = SOURCE OF TRUTH; edit there → copy changed files to `C:\dev\DawnTraderV3` bench → `npx tsc --noEmit` / `npx vitest run` → when green, **commit+push to GitHub FROM GoogleDrive**. NEVER push from C:\dev, NEVER pull GitHub→GoogleDrive. Migrations `git add -f`. Sync gate: from GoogleDrive `git rev-list --count HEAD..origin = 0`.
2. Read this file.
3. **§10.5 alerts (EVERY turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Telegram poll: `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`.
5. Plain language EVERY Kyle msg (Telegram t21 + Desktop BOTH), two-para default, % WITH raw counts. **CANONICAL: "regime" not "market condition"; "xStock" not "stocks"; IMF/DBS/LQ/VN/DI/MCE as-is.**
6. Acknowledge readiness in one line.

---

## ★ CURRENT STATE (2026-06-05) — xStock calibration RESUME, awaiting Kyle's GO
HCE edge study + strategy session DONE + documented. **NO calibration code started — awaiting Kyle's go.**
- **★ ORIGINAL xStock-calibration PLAN = THE SPINE (unchanged; Kyle re-centered 2026-06-05):** Foundation (B.4 15m, DONE) → Pattern-detection (RESOLVED: candlestick shapes are coin-flip, NO shape re-tune worth doing; keep pattern path ON as negative-control — i.e. "skip") → **STRATEGY CALIBRATION = the next real work** = per-strategy 15m trade-construction re-fit (entry trigger, stop/target geometry, hold, indicator periods + re-enable deferred equity-suitable strategies + finish ORB), per `Scope Files/B_XSTOCK_STRATEGY_FIT_SCOPE.md`, measured by `b-xstock-calib-b31a-gate-audit-2.ts`. The HCE findings INFORM this step (selectivity = the EV-gate lever; buy-the-dip = a construction idea to test) but do NOT add steps. EV-gate/SQE = the ADMISSION layer (B3.2/#181, real calib needs outcomes = Phase 25). **AMR body / standalone-VTS firehose / alt-data layer / delta-neutral / buy-and-hold / cross-sectional / ML edge-scan = SEPARATE roadmap lanes, NOT the calibration spine** — don't pull them in.
- **Scope** `Claude Comms and Packages/Scope Files/XSTOCK_CALIB_RESUME_SCOPE.md` (Langston ACK'd, refinements folded). Steps: (1) close B.4 soak cond1, (2) LOCK pattern-path STAYS-ON for xStock (= free negative-control test of queue ranking), (3) per-strategy W2 using the 2 leads, (4) gate-placement architecture.
- **Kyle decisions 2026-06-05:** (a) **AMR body = pre-Phase-19, DECOUPLED from the xStock umbrella** (it predates xStocks; proceeds on its own schedule; roadmap item 19-19; shadow-gated first 5-7d of Phase 19; brain/M2 = Phase 25). (b) xStock steps needing paper outcomes (Step2 pattern-neg-control, Step3b buy-the-dip fwd-validation) → **Phase 25** (NOT Phase-19-acceptance). (c) Soak: close cond1 on the **4 undistorted regime buckets**, carry RANGE_BOUND as a named open (#201). (d) Pattern path STAYS ON.
- **#201:** RANGE_BOUND≈0% live = a PROPERTY of accepted forming-bar classification (Kyle locked 2026-06-03 no-classifier-change), NOT a defect; the EV-leakage fix (settle-before-classify / forming-bar-aware) = its own item ~Phase 19.
- **Gate-placement (Step4):** intrinsic-setup gates→signal generation; admission/ranking→SQE; ONE shared component BOTH VTS+active call (no drift); firehose-skip = `enforce=false` (still compute+log the would-be verdict) NOT a bypass.
- **PENDING FROM KYLE:** confirm soak-close-on-4-buckets + acknowledge the firehose-standalone infra now sits ahead of active-trading on the critical path → then GO on calibration. (Langston not yet re-briefed on Kyle's AMR-decouple override — committed docs carry it; brief at next sync.)

## ★ HCE STUDY — CLOSED 2026-06-05 (task #196; full detail in committed docs)
Mined 22,810 VTS trades (crypto 20,515 / xStock 2,295, never pooled, net-of-friction VERIFIED). Docs: `1-system-manual/STRATEGIC_DIRECTIONS_AND_AI_EDGE.md`, `Scope Files/HCE_STUDY_FINAL_SYNTHESIS.md` + `HCE_FINDINGS_ADMITTED_ARM_S2-S5.md`; engine `scripts/hce/hce_study.py` + `hce_ohlc_sim.py` + `hce_rawfeat.py`.
- **CORE:** no hidden context gate flips any strategy net-positive WITHIN admitted (SQE-survivor) trades (AUC DBS→win 0.50; winners/losers near-identical). The 22,810 are the VTS FIREHOSE (deliberately unselective); active = ONE BEST/cycle. So "avg trade loses" ≠ "can't profit."
- **★ SELECTIVITY (the profitability answer): xStock YES** — tighten EV gate to top10% → net-positive (+0.14%), top2% +1.17%/52%win, clean monotone = real skill, a profitable core EXISTS. **crypto NO/INVERTS** (top1% −4.42%; crypto expectedEdge mis-calibrated → Phase-25 fix). Path = selectivity + sizing (fat right tail +5..+17%) + exit-mgmt + discipline; proof pending Phase 19.
- **★ RAW-FEATURE lead — BUY-THE-DIP on xStock** (entry 2-5% below recent high = +0.16%/36%win vs at-high −0.91%; mean-reversion tilt the labels missed) → W2 trade-construction candidate (Step 3b, pre-register first).
- **Signal-path:** crypto HYBRID 39%win > PATTERN 37% > QUANT 31% (quant weakest + biggest N). Pattern edge was PRE-gate (raw detections), holds there, mostly sub-friction.
- **P2 OHLC-reconstruction = NO-GO (pooled):** logic valid (sign 96.8%) but crypto OHLC-sparse (31% no-hit); xStock GO (1%). P3 rejected-arm causal layer DEFERRED data-blocked → RUNNING_ISSUES **#205**. **#204** = xStock corrupt-stop ~45x crypto (Phase-A/19 integrity, bites live exec).
- **Strategic directions (research-backed, in roadmap 2026-06-05):** discipline/selectivity = THE edge (Barber-Odean: 95% lose, overtrading kills); adaptive-trend-following ↔ AMR-body; alt-data ranking (AI news xStock + on-chain crypto) → P25+; periodic ML edge-scan job (hce_* weekly/monthly); VTS standalone firehose RESEQUENCED post-launch → between Phase24 & 19 (ingest-once-fan-to-N, 0 extra API); POST-LAUNCH delta-neutral funding yield (needs perps), buy-and-hold sleeve, cross-sectional (short-gated, no Kraken short — Kyle open if avail).

## ★ B.4 15m FOUNDATION — CLOSED/LIVE
Soak cond2 (responsiveness) CLOSED by Langston; **cond1 (live-15m regime mix vs predicted TFS25/ST31/HVU21/IE17/RBS6.6) → close on the 4 undistorted buckets** (RBS distorted by #201 forming-bar — expected, not a fail); re-capture live mix from `pair_scan_archive_2026_06` (asset_class=xstock_spot, regime_label) after 2-3 sessions, send Langston. Global regime = majority-vote of per-pair; global DBS = volume-weighted avg (inherit per-pair recalib).
## SOAK ALERT b83b1e4b — CLEARED 2026-06-05; underlying TEC cache-staleness = Phase-19 watch.

## OPEN/DEFERRED
- B3.2 (#181) active-path selection/gates + crypto edge-scoring fix → Phase 25. Alerts: lq_min `559378c6` (06-09 gated), weekend-shutdown verify `7b746d55` (06-06).
- **Operational (don't relearn):** Langston dispatch = `ssh root@204.168.141.77 "sudo -u langston bash -c 'export CLAUDE_CODE_OAUTH_TOKEN=\$(cat /etc/langston/oauth.env|cut -d= -f2-) && export HOME=/home/langston && cd /home/langston && /usr/bin/claude -p --session-id <FRESH-uuid> --model claude-opus-4-8[1m] --permission-mode bypassPermissions \"<msg: NO apostrophe/backtick/dollar; embed facts; say no-gdrive use ssh staging>\"'" > /tmp/langston_reply.txt 2>&1` (background; reply file LOCAL → local cat NOT ssh cat). Relay Langston VERBATIM to Telegram (prefix `**LANGSTON SPEAKING:**`, python chunk ≤3500). Run analysis on staging: `ssh root@188.245.193.8 'python3 -' <<'PYEOF'` over logs `/home/deploy/dawntrader/logs/virtual_trades/*.json`; psql via `su - deploy -c 'bash -s'` + source .env. Sync Langston `/home/langston/MEMORY.md` (§10.b) at milestones.
- Kyle comms: summaries to Desktop + Telegram BOTH. CALIBRATION LENS (max VETTED opportunities). NO PATCHES (structural, design-before-build).

---

## POST-COMPACTION PROMPT FOR KYLE
> We finished the hidden-edge study and a strategy session, and folded everything into the roadmap (the strategic-directions doc + the xStock calibration-resume scope, both committed and Langston-reviewed). I'm waiting on your two go-aheads — confirm closing the 15-minute soak on the four undistorted regimes (tracking range-bound separately as its own item), and acknowledge that the standalone-VTS build now sits ahead of active trading — before I start the calibration-resume work (close soak → lock pattern-stays-on → per-strategy). Nothing is in flight; pick up from the CURRENT STATE section of memory.
