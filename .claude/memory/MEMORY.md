# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language; §6+§8 Langston comms; §10.5 mandatory per-turn alerts check).
2. Read this file.
3. **§10.5 alerts check (mandatory every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"` — surface any unacknowledged active entries.
4. Kyle messages me in Claude Desktop. Telegram = Kyle↔Langston + CC outbound visibility only. **No proactive DMs to Kyle** (he initiates).
5. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; use technical jargon in Kyle-facing summaries; make assumptions (verified evidence only).

---

## CURRENT STATE — 2026-05-17 (B-NEW-41 awaiting Kyle voice tests V2-V5)

**🟢 B-NEW-40 CLOSED (Kyle ack 2026-05-17).** 14-day soak armed (alert id b83b1e4b, triggers 2026-05-31T12:46:47Z).

**🟢 B-NEW-41 Steps 1-6 COMPLETE.** Voice transcription + Langston SSH access deployed to Hetzner Helsinki. Awaiting Kyle voice-test for Step 7 first-pass + Langston Step 8 second-pass.

### B-NEW-41 — what's live
- **Whisper.cpp v1.8.4** at `/opt/whisper.cpp/build/bin/whisper-cli` on Helsinki. Model ggml-small.en.bin (487MB). Smoke ✅ (jfk.wav 8.3s wallclock @ -t 3).
- **cc-comms-bridge** voice handling deployed, restarted, voice worker thread spawned.
- **langston-bridge.py** unified task_q (text+voice through single worker) deployed, restarted.
- **Langston SSH to staging** working as `deploy` user with `from="204.168.141.77"` IP restriction. Langston confirmed working in his Step 4 review (first live §10.5 SSH check passed).
- **Voice archive infra** — 30d logrotate + 5GB cron prune (cc-voice-archive-prune.timer active).
- **CLAUDE.md §10.5 dual-update** — both project-root + Langston-side now distinguish CC (root) vs Langston (deploy) SSH paths.
- **Langston review trail:** Step 1 APPROVED rev4 (after 4 rev rounds + Q5 reconsideration to deploy user); Step 2 APPROVED rev2 (after critical Rev 1 unified-queue fix); Step 4 APPROVED clean (verified single-claude-at-a-time invariant by tracing every path).

### Pending B-NEW-41
- **Step 7 (Kyle-in-the-loop):** Kyle records test voice notes (V2-V5) to verify end-to-end. Once Kyle confirms reception, V7 (Langston SSH-side) already passes per Step 4 live test.
- **Step 8:** Langston second-pass via SSH (now works directly without CC-paste-evidence).
- **Step 11:** Completion report after V2-V5 pass.

### What B-NEW-40 shipped
- **Pool hardening** (`server/db.ts`): keepAlive=true, 10s initial delay, 30s query_timeout, 30s idleTimeoutMillis, max=10, application_name=dawntrader_main. Boot log `[DB_POOL_INIT]` confirmed.
- **TEC refresh fence** (`server/services/trailing-exit-controller.ts`): 45s Promise.race; distinct `[TEC_REFRESH_TIMEOUT]` log; `.finally` ALWAYS releases inFlight Map. New `getTECDiagnostics()` export.
- **Diagnostic endpoint** (`/api/diagnostics/tec-config`): per-class state + Central Clock health.
- **Alerts infra**: `server/services/system-alerts.ts` (async, O_EXCL lock), CLI, `/api/system-alerts` + ack endpoint, `/system-alerts` UI tab with Bell sidebar nav, dispatcher cron (15min), logrotate.
- **Verification**: `scripts/b-new-40-soak-verify.ts` presence-not-count. Hostile test 5 assertions PASS on CI. 14-day soak alert inserted with actual deploy_ts.
- **§10.5 CLAUDE.md** mandatory per-turn alerts check.
- **Governance**: SIM, BATCH_CATALOG, CHANGES_AND_FIXES (INFRA-2026-05-17-A), PHASE_HISTORY (Phase 24 + 5 lessons), RUNNING_ISSUES #106 (stale-lock race), #107 (hardcoded chat ID), #108 (Langston-side §10.5 + SSH), #109 (TEC diagnostic stale-classification).

### Langston review trail (all APPROVED)
- Design rev1 + rev2 → Step 1 (5 corrections applied) → Step 2 (6 Q-Alerts applied) → Step 4 rev1 (1 concern + 5 obs) → Step 4 rev2 (verified async-ify) → Step 8 rev1 (no SSH access, pivoted) → Step 8 rev2 (evidence package) → **STEP 8 PASS, cleared for completion report.**

### Files: see `B_NEW_40_COMPLETION_REPORT.md` §2-§4 for full inventory + evidence

---

## IMMEDIATE FOLLOW-UPS (post-B-NEW-40)

1. **Kyle ack** on completion report → batch officially CLOSED.
2. **RUNNING_ISSUES #108** — give Langston SSH access to staging so future Step 8 verifications don't need CC-paste-evidence workaround. Configure keypair from Langston box → staging `authorized_keys`. Update §10.5 to add Langston-side SSH branch.
3. **RUNNING_ISSUES #109** — TEC observability polish: distinguish stale-no-consumer from stale-with-active-consumer in `/api/diagnostics/tec-config`. Optional next TEC batch.

---

## STILL ACTIVE (pre-B-NEW-40 backlog)

### Strategic reset (Kyle 2026-05-16 17:30 UTC)
**SHELVE until Phase 19:** confidence calibration based on VTS win/loss outcomes. VTS = family fan-out + no SQE; active trading = one signal per family + SQE applied. VTS wins/losses ≠ active-trading wins/losses.
**Shelved:** B-NEW-38 stratified re-run, B67.5 consumer-gate-from-VTS in current form.
**Still active:** xStock filter/regime/drift calibration (NOT confidence), TFS sustainability second-gate redesign (3 decisions queued — drop/replace/parallel), voice-note transcription wiring.

### B-NEW-39 state
- Phase 1 SQL applied 2026-05-15 23:07 UTC: floor `b67_5_post_composition_floor` 0.20 → 0.45 wildcard. Mechanical verified. Forensic shape deferred to Phase 19.
- Phase 2 ON HOLD pending sustainability gate redesign.

---

## OPERATIONAL FACTS

- PM2 #290 on staging (since 2026-05-17 12:46:47 UTC, post B-NEW-40 deploy). Pipeline healthy.
- `tec-pg-capture.timer` armed for next TEC stale event (with `ss -tnpi` snapshot).
- `system-alerts-dispatcher.timer` active, firing every 15min.
- DATABASE_URL: direct Postgres port 5432.
- 23 files import pg pool; all use Drizzle (no `pool.connect()` lease patterns).
- xstock scanner SCAN_TIMEOUT + B73 ohlcBars undefined errors persist — separate batch candidate.

---

## LANGSTON COMMS PROTOCOL (CLAUDE.md §6.5 + §6.5.0)

- **File-first** for any design ask/scope/review > short pointer. Full content in `/home/langston/inbox/<batch>/<file>.md`. Pointer prompt under 1KB.
- **SSH dispatch:** scp prompt file → remote run_*.sh script → `claude-cli < /dev/null` to bypass stdin wait, `--permission-mode bypassPermissions`, fresh UUID per dispatch.
- **Read reply** from local `/tmp/<reply>.txt`.
- **Telegram visibility relay** (CLAUDE.md §6.5 Step 3 MANDATORY): after capturing Langston stdout reply, post verbatim to topic 21 via `curl sendMessage` so Kyle sees it.
- **Step 8 special:** Langston has no SSH to staging. CC must paste evidence package to `/home/langston/inbox/<batch>/<file>.txt` for second-pass verification until #108 resolves.

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md` (incl. §10.5)
2. This file
3. `Claude Comms and Packages/Batch Completion/B_NEW_40_COMPLETION_REPORT.md` (if recently closed)
4. Latest active scope/pre-audit if mid-batch
