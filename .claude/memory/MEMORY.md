# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language; §6+§8 Langston comms; §10.5 per-turn alerts).
2. Read this file.
3. **§10.5 alerts check (mandatory every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"` — surface any unack'd active entries.
4. Kyle messages me in Claude Desktop. Telegram = Langston comms + outbound visibility. **No proactive DMs to Kyle.**
5. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; use jargon in Kyle-facing summaries; assume — verify.

---

## 🟢 JUST CLOSED (2026-05-17)

- **B-NEW-42** — xStock Calibration Phase 0 audit (corp-action + dividend + halt pre-flight). **DIRTY verdict; B-NEW-42b hotfix batch spawned (Langston rev2 ACK).** Commit `498e85aff`. 3 TEC structural gaps confirmed by regression test: (a) `shouldClosePosition` fires stop on synthetic 50% drop, (b) target-lock phantom-promotes on 2× jump, (c) TEC clamps exit to pre-halt stop on halt-resume gap-down. Empirical: 462 halt-resume-gap events in 7-day archive (avg 1.10%, max 4.6% on EDU/USD). Existing `isXstockMarketOpenUTC` weekend gate covers most corp-action exposure (splits overnight-effective); intra-RTH halt undefended. Dividend hypothesis INCONCLUSIVE without external calendar — interim posture (B-NEW-42b): curated 60-entry JSON for 15 div-paying symbols. **Phase A unblock: FALSE** — gated on B-NEW-42b ship. Completion report: `Claude Comms and Packages/Batch Completion/B_NEW_42_COMPLETION_REPORT.md`. Kyle ack pending.

- **B-NEW-40** + **B-NEW-41** — closed earlier 2026-05-17 (pg pool keepalive + TEC refresh timeout fence + voice transcription + Langston staging SSH).

## 🟡 AWAITING KYLE AUTHORIZATION

- **B-NEW-42b — price-discontinuity-detector module + TEC integration.** Single new module `server/services/price-discontinuity-detector.ts` covering 3 kinds (halt_resume_gap / corp_action / ex_dividend) consumed by TEC at one gate site. State machine for halt clearing (IDLE / DISCONTINUITY_ACTIVE / CLEARING with 5min hard-ceiling). Fail-safe-skip on missing prev-tick context (variant-a assertion). Curated 60-entry ex-dividend calendar. Plumbing through paper-execution-engine + VTS runner + tec-evaluator (prevPrice/prevTs propagation). Inverts B-NEW-42 regression-test assertions. Adds ADJUSTMENT_FRAMEWORK catalogue of new per-asset-class knobs. Scope rev2 at `Claude Comms and Packages/Scope Files/B_NEW_42B_SCOPE.md` — Langston ACK'd, awaiting Kyle Step 3 authorization. Phase A.2 unblock gated on this ship.

## 🟢 NEXT UP (post-B-NEW-42b)

- **Phase A — DBS for xStocks** (A.1 design call may run as parallel working document during B-NEW-42b window; A.2 implementation blocked on B-NEW-42b ship).
- **Open: RUNNING_ISSUES #113** — CI TypeScript Check red baseline since 2026-05-17 morning (B-NEW-40 hotfix sequence). Errors in client/src files (alert-banner, copy-to-live-modal, guardrails-tab, enhanced-system-monitoring, active-trades-v2, ready-to-buy-table, machine-learning). Not introduced by B-NEW-42. Dedicated 2-4hr cleanup batch recommended before B-NEW-42b implementation ships so hotfix deploys on green baseline.

---

## 🟡 SHELVED until Phase 19

- Confidence calibration vs VTS outcomes (Kyle strategic reset 2026-05-16) — VTS family fan-out + no SQE ≠ active trading outcomes.
- B-NEW-38 stratified re-run.
- B67.5 consumer-gate-from-VTS in current form.
- B-NEW-39 Phase 2 (forensic shape).
- TFS sustainability gate value-scope decision.

---

## OPERATIONAL FACTS

- PM2 #291 on staging since 2026-05-17 16:11Z. Pipeline healthy.
- `tec-pg-capture.timer` armed (with `ss -tnpi` snapshot for next TEC event).
- `system-alerts-dispatcher.timer` active every 15min. Scheduled alert `b83b1e4b` fires 2026-05-31T12:46:47Z (B-NEW-40 14-day soak verification).
- `cc-voice-archive-prune.timer` active daily 04:00 UTC.
- Whisper.cpp v1.8.4 at `/opt/whisper.cpp/build/bin/whisper-cli` on Helsinki (sha256 model `c6138d6d58e...`).
- Langston SSH alias `staging` → `deploy@188.245.193.8`. IP-restricted to `204.168.141.77`.
- DATABASE_URL: direct Postgres port 5432 (Supabase Frankfurt).
- **CI red baseline** since 2026-05-17 morning (RUNNING_ISSUES #113). TypeScript Check + Test Suite failing; Build + Docker green. Pre-existing rot, not introduced by B-NEW-42.

---

## VOICE COMMS QUICK REFERENCE (B-NEW-41)

- Kyle voice → `@CCDTCommsBot` DM → inbox `voice_inbound` (CC reads via `ssh root@188.245.193.8 'tail /var/log/cc-bridge-inbox.jsonl'`).
- Kyle voice → topic 21 → CC posts ACK + inbox entry; Langston transcribes silently and only posts if non-[SILENT] claude reply.
- Kyle voice → `@LangstonDTBot` DM → Langston transcribes + ACK preview + claude reply in DM.
- All transcriptions in same JSONL, `kind` discriminator. Schema: schema_version, text, transcription_source, transcription_duration_ms, audio_duration_s, audio_archive_path, file_id, file_size.

---

## LANGSTON COMMS PROTOCOL (CLAUDE.md §6.5)

- **File-first** for substantive asks (>1KB). Full content in `/home/langston/inbox/<batch>/<file>.md`; pointer prompt under 1KB.
- **SSH dispatch:** scp prompt file → `claude-cli < /dev/null` + `--permission-mode bypassPermissions` + fresh UUID per dispatch.
- **Read reply** from local `/tmp/<reply>.txt`.
- **Telegram visibility relay** (mandatory): after capturing Langston stdout, post verbatim to topic 21 via `curl sendMessage`.
- **Step 8 via SSH:** Langston does direct staging verification himself (no more CC-paste-evidence — B-NEW-41 closed that gap).

---

## RECENT RUNNING_ISSUES SUMMARY

- **#113 OPEN Tier 1** — CI TypeScript Check + Test Suite red baseline (pre-existing client/src rot from B-NEW-40 morning). Dedicated cleanup batch recommended before B-NEW-42b deploy.
- **#112 DEFERRED Phase D** — xStock dividend-credit empirical question (curated calendar interim posture in B-NEW-42b)
- **#111 DEFERRED Phase 19** — TFS sustainability gate value-scope decision
- **#110 OPEN Tier 2** — ForceCommand wrapper to restrict Langston pubkey to allowlisted read commands (~2hr follow-up)
- **#109 OPEN Tier 3** — TEC diagnostic endpoint: distinguish stale-no-consumer from stale-with-consumer
- **#99 + #99b FOLDED INTO xStock calibration phase** — ohlcBars typo + scanner SCAN_TIMEOUT

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `Claude Comms and Packages/Scope Files/B_NEW_42B_SCOPE.md` (active hotfix scope awaiting Kyle authorization)
4. Latest active scope/pre-audit if mid-batch
5. `Claude Comms and Packages/Langston Design Asks/XSTOCK_CALIBRATION_PLAN_v2_LANGSTON_REVIEW.md` (master plan reference)
