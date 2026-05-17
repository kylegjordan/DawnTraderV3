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

- **B-NEW-42b** — price-discontinuity detector + TEC integration (xStock Phase 0 hotfix). Commit `d8e0f5885`. PM2 #293. Closes 3 B-NEW-42-confirmed gaps: forward-split stop, reverse-split phantom-promote, halt-resume-gap unfillable fill. NEW module `server/services/price-discontinuity-detector.ts` (4 kinds: halt_resume_gap / corp_action / ex_dividend / cold_start fail-safe). Single hoisted consultation per logical tick in `tec-evaluator.ts` (Langston Step 4 BLOCKER 2 fix — pre-fix double-consult collapsed 2-tick deferral). State machine IDLE / DISCONTINUITY_ACTIVE / CLEARING with stateless 5min HARD_CEILING. Curated 60-entry ex-dividend calendar replaces Phase D auto-feed at handover. Langston Step 1+2+4 (round 1 + round 2 after blockers fixed) + Step 8 SSH-verified PASS. 76/76 tests green; crypto regression ZERO. **Phase A unblocked.** Completion report: `Claude Comms and Packages/Batch Completion/B_NEW_42B_COMPLETION_REPORT.md`. Kyle ack pending.

- **B-NEW-42** — Phase 0 audit (DIRTY verdict). Closed earlier 2026-05-17. Spawned B-NEW-42b which now ships the structural fix.

- **B-NEW-40 + B-NEW-41** — closed earlier 2026-05-17.

## 🟢 NEXT UP (post-B-NEW-42b)

- **Phase A — DBS for xStocks.** Unblocked by B-NEW-42b ship. A.1 design call may run as parallel working document; A.2 implementation now executable. Phase A design lives in xStock Calibration Plan v2 §A.
- **Optional Phase D follow-up: dividend-credit empirical answer + Yahoo Finance auto-calendar feed** when Phase D earnings handling lands. Curated calendar handover (consumer unchanged).

---

## 🟡 SHELVED until Phase 19

- Confidence calibration vs VTS outcomes (Kyle strategic reset 2026-05-16).
- B-NEW-38 stratified re-run.
- B67.5 consumer-gate-from-VTS in current form.
- B-NEW-39 Phase 2 (forensic shape).
- TFS sustainability gate value-scope decision.
- **Detector module_constants DB-resolution** (currently hardcoded; Phase E calibration batch wires it with B79.0a-style wildcard fallback).

---

## OPERATIONAL FACTS

- PM2 #293 on staging since 2026-05-17 20:10:00Z (B-NEW-42b deploy). Pipeline healthy.
- B-NEW-42b detector loaded at boot — confirmed via `[B-NEW-42b][DIVIDEND_CALENDAR_LOAD]` + cold-start fail-safe-skip emissions on live xStock symbols (OPEN/EWG/EWZ/RMD/KO/MPC/NVO/ORCL/SOFI per Langston Step 8 PM2 logs).
- 24 module_constants rows for `price_discontinuity_detector` seeded via idempotent migration (verified on staging DB).
- `tec-pg-capture.timer` armed.
- `system-alerts-dispatcher.timer` active every 15min. Scheduled alert `b83b1e4b` fires 2026-05-31T12:46:47Z (B-NEW-40 14-day soak).
- `cc-voice-archive-prune.timer` active daily 04:00 UTC.
- Whisper.cpp v1.8.4 at `/opt/whisper.cpp/build/bin/whisper-cli` on Helsinki.
- Langston SSH alias `staging` → `deploy@188.245.193.8`. IP-restricted to `204.168.141.77`.
- DATABASE_URL: direct Postgres port 5432 (Supabase Frankfurt).
- **CI red baseline ACCEPTED as pre-existing technical debt** (Kyle 2026-05-17 directive). RUNNING_ISSUES #113. TS Check non-blocking since 2026-03-30; Test Suite 13 failures from Directive 11.3/11.7F era code refactored without test updates; pre-dates 2026-05-08. B-NEW-42b push held the baseline (+1 passing file, 0 new failures).

---

## VOICE COMMS QUICK REFERENCE (B-NEW-41)

- Kyle voice → `@CCDTCommsBot` DM → inbox `voice_inbound` (CC reads via `ssh root@188.245.193.8 'tail /var/log/cc-bridge-inbox.jsonl'`).
- Kyle voice → topic 21 → CC posts ACK + inbox entry; Langston transcribes silently and only posts if non-[SILENT] claude reply.
- Kyle voice → `@LangstonDTBot` DM → Langston transcribes + ACK preview + claude reply in DM.

---

## LANGSTON COMMS PROTOCOL (CLAUDE.md §6.5)

- **File-first** for substantive asks (>1KB). Full content in `/home/langston/inbox/<batch>/<file>.md`; pointer prompt under 1KB.
- **NEW (B-NEW-42b lesson):** when dispatching Langston for code review, EMBED essential diff snippets inline in the inbox file AND explicitly forbid gdrive access. Langston's `cd /mnt/gdrive/...` + `git status` on the 10GB+ repo hung 30+ minutes twice. Use `ssh staging '...'` for repo inspection instead.
- **SSH dispatch:** scp prompt file → `claude-cli < /dev/null` + `--permission-mode bypassPermissions` + fresh UUID per dispatch.
- **Telegram visibility relay** (mandatory) — verbatim Langston reply posted to topic 21 via `curl sendMessage`.
- **Step 8 via SSH:** Langston now does direct staging verification himself (works correctly when prompt steers away from gdrive).

---

## RECENT RUNNING_ISSUES SUMMARY

- **#113 OPEN — accepted technical debt** — pre-existing CI red baseline (10+ days); future production-readiness batch (likely Phase 19 paper-trading prep) reckons with it.
- **#112 DEFERRED Phase D (INTERIM POSTURE DEPLOYED via B-NEW-42b)** — xStock dividend-credit empirical question; curated 60-entry calendar running until Phase D auto-feed.
- **#111 DEFERRED Phase 19** — TFS sustainability gate value-scope decision.
- **#110 OPEN Tier 2** — ForceCommand wrapper on Langston pubkey (~2hr follow-up).
- **#109 OPEN Tier 3** — TEC diagnostic endpoint: distinguish stale-no-consumer from stale-with-consumer.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. xStock Calibration Plan v2 (when Phase A starts)
4. Latest active scope/pre-audit if mid-batch
