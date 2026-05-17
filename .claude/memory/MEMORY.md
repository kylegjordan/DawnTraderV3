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

## 🟢 JUST CLOSED (2026-05-17, Kyle acked)

- **B-NEW-40** — pg pool keepalive + TEC refresh timeout fence + alerts infrastructure. Fixed silent TCP path death + B79.TEC inFlight-Map amplifier. 14-day soak armed (alert id `b83b1e4b`, fires 2026-05-31T12:46:47Z). Completion report: `Claude Comms and Packages/Batch Completion/B_NEW_40_COMPLETION_REPORT.md`.

- **B-NEW-41** — Voice transcription (both bots) + Langston staging SSH access. Whisper.cpp v1.8.4 + ggml-small.en on Helsinki; ffmpeg Ogg→WAV preprocessor; both bridges restarted; Langston has `ssh deploy@188.245.193.8` (alias `ssh staging`) with `from=204.168.141.77` IP restriction. Three Step-7 hotfixes: ffmpeg conversion, per-bridge archive subdir + silent-in-group UX, session-UUID auto-rotate + bridge-error silent-in-group. V2 ✅ + V3 ✅ verified by Kyle voice tests. Langston Step 1+2+4+8 all APPROVED. Completion report: `Claude Comms and Packages/Batch Completion/B_NEW_41_COMPLETION_REPORT.md`.

## 🟡 JUST DECIDED (2026-05-17)

- **TFS sustainability gate — TABLED until Phase 19** (three-way Kyle/CC/Langston converged). Gate's value today is purely confidence-modification (regime/strategy/sizing don't consume sustainability). Original design intent broader (B67.5/B68.5 era was stage-aware regime nuance) but implementation contracted without explicit deferral tag. Step 1 baseline (3,992 ablation rows, 16-day window) CONFIRMED B-NEW-37 forensic at scale: gate is uniform confidence dampener, Δconf identical winners (0.4477) vs losers (0.4423), blocks path B 0.9% of trades. Phase 19 decision tree: (a) full stage-aware redesign, (b) narrow TEC exit-mode routing hook, (c) deprecate gate. All forks share classifier-validation prerequisite. **Methodology pivot for Phase 19:** success criterion is forward-trend-continuation accuracy, NOT trade-outcome win/loss. Governance: `RUNNING_ISSUES #111` + `POST_AUDIT_ROADMAP §19.0.3` + `CHANGES_AND_FIXES DESIGN-2026-05-17-A`. VTS continues persisting sustainability score on every trade — data accumulates during deferral.

- **xStock cleanup items #99 (ohlcBars typo) + #99b (scanner SCAN_TIMEOUT) FOLDED INTO xStock calibration phase.** No longer standalone — will ship as part of whichever calibration sub-batch first touches the relevant code.

## 🟢 NEXT UP (active work)

- **xStock filter / regime / drift calibration** — substantive remaining work from the post-B-NEW-41 backlog. Multi-phase calibration plan exists at `Claude Comms and Packages/Langston Design Asks/xstock-calibration-plan/XSTOCK_CALIBRATION_PLAN_v1_LANGSTON_REVIEW.md` (May 14 draft from Langston). Plan structure: Phases A-G covering DBS foundation, threshold calibration sub-batches, equity macro modifier, strategy set scope, factor identification, exit-ablation calibration, cross-asset ranking parity.

### 🔸 VERY NEXT STEP

**Re-engage the xStock calibration plan.** First action: re-read `XSTOCK_CALIBRATION_PLAN_v1` (Langston's plan with Phase A → DBS foundation as critical path). Confirm with Kyle whether to start Phase A scoping immediately OR review/refine the plan first since several weeks have passed since it was drafted. Phase A is critical path because DBS feeds everything downstream.

---

## 🟡 SHELVED until Phase 19

- Confidence calibration vs VTS outcomes (Kyle strategic reset 2026-05-16) — VTS family fan-out + no SQE ≠ active trading outcomes.
- B-NEW-38 stratified re-run.
- B67.5 consumer-gate-from-VTS in current form.
- B-NEW-39 Phase 2 (forensic shape).
- **TFS sustainability gate value-scope decision** (added 2026-05-17, see JUST DECIDED).

---

## OPERATIONAL FACTS

- PM2 #290 on staging since 2026-05-17 12:46:47Z (B-NEW-40 deploy). Pipeline healthy.
- `tec-pg-capture.timer` armed (with `ss -tnpi` snapshot for next TEC event).
- `system-alerts-dispatcher.timer` active every 15min.
- `cc-voice-archive-prune.timer` active daily 04:00 UTC.
- Whisper.cpp v1.8.4 at `/opt/whisper.cpp/build/bin/whisper-cli` on Helsinki (sha256 model `c6138d6d58e...`).
- Langston SSH alias `staging` → `deploy@188.245.193.8`. IP-restricted to `204.168.141.77`.
- DATABASE_URL: direct Postgres port 5432 (Supabase Frankfurt).

---

## VOICE COMMS QUICK REFERENCE (B-NEW-41)

- Kyle voice → `@CCDTCommsBot` DM → inbox `voice_inbound` (CC reads via `ssh root@188.245.193.8 'tail /var/log/cc-bridge-inbox.jsonl'`).
- Kyle voice → topic 21 → CC posts ACK + inbox entry; Langston transcribes silently and only posts if non-[SILENT] claude reply.
- Kyle voice → `@LangstonDTBot` DM → Langston transcribes + ACK preview + claude reply in DM.
- All transcriptions in same JSONL, `kind` discriminator. Schema: schema_version, text, transcription_source, transcription_duration_ms, audio_duration_s, audio_archive_path, file_id, file_size.

---

## LANGSTON COMMS PROTOCOL (CLAUDE.md §6.5)

- **File-first** for substantive asks (>1KB). Full content in `/home/langston/inbox/<batch>/<file>.md`; pointer prompt under 1KB.
- **SSH dispatch:** scp prompt file → remote run_*.sh script → `claude-cli < /dev/null` + `--permission-mode bypassPermissions` + fresh UUID per dispatch.
- **Read reply** from local `/tmp/<reply>.txt`.
- **Telegram visibility relay** (mandatory): after capturing Langston stdout, post verbatim to topic 21 via `curl sendMessage`.
- **Step 8 via SSH:** Langston now does direct staging verification himself (no more CC-paste-evidence — B-NEW-41 closed that gap).

---

## RECENT RUNNING_ISSUES SUMMARY

- **#108 RESOLVED** 2026-05-17 (B-NEW-41) — Langston staging SSH installed
- **#110 OPEN** Tier 2 — ForceCommand wrapper to restrict Langston pubkey to allowlisted read commands (~2hr follow-up batch when convenient)
- **#111 DEFERRED Phase 19** — TFS sustainability gate value-scope decision
- **#99 + #99b FOLDED INTO xStock calibration phase** — ohlcBars typo + scanner SCAN_TIMEOUT
- **#109 OPEN** Tier 3 — TEC diagnostic endpoint: distinguish stale-no-consumer from stale-with-consumer (post-B-NEW-40 observability polish)

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `Claude Comms and Packages/Langston Design Asks/xstock-calibration-plan/XSTOCK_CALIBRATION_PLAN_v1_LANGSTON_REVIEW.md` (when xStock work starts)
4. Latest active scope/pre-audit if mid-batch
