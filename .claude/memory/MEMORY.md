# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Hard cap 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language; §6+§8 Langston comms; §10.5 NEW mandatory per-turn alerts check).
2. Read this file.
3. **§10.5 alerts check (NEW 2026-05-17, every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"` — surface any unacknowledged active entries.
4. Kyle messages me in Claude Desktop. Telegram = Kyle↔Langston + CC outbound visibility only. **No proactive DMs to Kyle** (he'll initiate).
5. Acknowledge readiness in one line.

**Do NOT:** confabulate; skip SIM in pre-audit; use technical jargon in Kyle-facing summaries; make assumptions (verified evidence only).

---

## CURRENT STATE — 2026-05-17 (B-NEW-40 Step 3 IMPLEMENTATION COMPLETE; Step 4 NEXT)

**🚨 ACTIVE BATCH: B-NEW-40 — pg pool keepalive + TEC refresh timeout (silent-TCP-death root-cause fix).** Step 1 scope APPROVED + Step 2 pre-audit APPROVED by Langston. All Step 3 implementation done in working tree. Step 4 code-diff review with Langston is NEXT.

### Implementation COMPLETE in working tree (not yet committed/pushed):

**Code files modified:**
- `server/db.ts` — pool config: `keepAlive: true`, `keepAliveInitialDelayMillis: 10_000`, `query_timeout: 30_000`, `idleTimeoutMillis: 30_000`, `max: 10`, `application_name: 'dawntrader_main'` + boot-time `[DB_POOL_INIT]` log line
- `server/services/trailing-exit-controller.ts` — `Promise.race([refreshTECConfigForClass, timeoutAfter45s])` at L235 + `[TEC_REFRESH_TIMEOUT]` distinct log + `getTECDiagnostics()` accessor (new export)
- `server/routes.ts` — NEW `GET /api/diagnostics/tec-config` (Central Clock health enriched) + NEW `GET /api/system-alerts` + NEW `POST /api/system-alerts/:id/acknowledge`
- `package.json` — added scripts: `system-alerts`, `b-new-40:soak-verify`
- `client/src/App.tsx` — lazy import + route for SystemAlertsPage
- `client/src/components/layout/sidebar.tsx` — added "System Alerts" nav entry with Bell icon
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — new "Recent Additions (B-NEW-40)" section + updated `server/db.ts` SIM entry bidirectionally linked
- `1-system-manual/BATCH_CATALOG.md` — B-NEW-40 row inserted above B-NEW-37
- `1-system-manual/CHANGES_AND_FIXES.md` — `INFRA-2026-05-17-A` entry at top
- `1-system-manual/PHASE_HISTORY.md` — "Phase 24 INFRASTRUCTURE HARDENING" subsection added with full cause-trail + 5 captured lessons
- `CLAUDE.md` — §10.5 mandatory per-turn alerts check installed

**Code files NEW:**
- `server/services/system-alerts.ts` — alerts library (O_EXCL file lock, atomic rewrite, parse-skip-on-error)
- `scripts/system-alerts.ts` — CLI: `add | fire-due | list | ack | resolve`
- `scripts/b-new-40-soak-verify.ts` — verify script (presence-not-count criterion)
- `server/tests/unit/b-new-40-tec-refresh-hang.test.ts` — hostile test (5 assertions a-e)
- `client/src/pages/system-alerts.tsx` — UI tab (30s polling, color-coded chips, ack button)
- `Claude Comms and Packages/Scope Files/B_NEW_40_PRE_AUDIT.md`
- `Claude Comms and Packages/Scope Files/B_NEW_40_SCOPE.md`
- `Claude Comms and Packages/Langston Design Asks/TEC_STALE_INVESTIGATION_2026-05-16_rev1.md`
- `Claude Comms and Packages/Langston Design Asks/TEC_STALE_INVESTIGATION_2026-05-17_rev2.md`

**Staging-side deploys (already done, not in repo):**
- `tec-pg-capture` systemd unit updated with `ss -tnpi state established '( dport = 5432 )'` capture
- `system-alerts-dispatcher.service` + `.timer` installed and enabled (active, firing every 15min)
- `/etc/logrotate.d/dawntrader-system-alerts` — rotates dispatcher log; **explicitly excludes** `system-alerts.jsonl` (the queue, not a log)
- Langston `/home/langston/CLAUDE.md` updated with §10.5 (330 lines)
- Langston `/home/langston/MEMORY.md` updated 2026-05-17 (96 lines)

### IMMEDIATE NEXT STEP — Step 4 (Langston code-diff review)

```
1. Generate `Claude Comms and Packages/Change Lists/B_NEW_40_CHANGE_LIST.md`
   — list every file changed/created with a one-liner each
2. scp change list + scope + pre-audit to /home/langston/inbox/tec_investigation/
3. SSH dispatch with SHORT pointer prompt (under 1KB, per CLAUDE.md §6.5.0)
4. Wait for reply, apply any code-review feedback
5. Then Step 5: git commit + push to GitHub, verify all 4 CI checks green
6. Step 6: SSH staging: git pull + npm run build + pm2 restart dawntrader
7. Insert 14-day soak alert into queue using actual deploy timestamp:
   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
     npm run system-alerts -- add \
       --triggers-at <deploy_ts+14d> \
       --category soak_verification \
       --severity warning \
       --title \"B-NEW-40 14-day soak verification due\" \
       --body \"Run scripts/b-new-40-soak-verify.ts.\" \
       --metadata <json>'"
8. Step 7 first-pass verify (CC): check [DB_POOL_INIT] log, curl /api/diagnostics/tec-config,
   curl /api/system-alerts, visit /system-alerts UI tab via Claude-in-Chrome
9. Step 8 second-pass verify (Langston) — dispatch
10. Step 10-11 governance closure + completion report + MEMORY sync (3 files)
```

### Langston review history on B-NEW-40 (so post-compact knows what was decided):
- **rev1 review (2026-05-16):** confirmed H1 hung-promise mechanism; recommended pool config + timeouts
- **rev2 review (2026-05-17):** sharpened to "TWO contributors — network cause + B79.TEC code amplifier"; agreed keepalive + 45s Promise.race + pool hardening
- **Step 1 + Step 2 sign-off (2026-05-17):** APPROVED with 5 corrections (all applied: idleTimeoutMillis framing, keepAlive failure-mode line, hostile-test 5 assertions a-e, application_name in SIM, plain-language paragraph) + 6 Q-Alerts refinements applied (O_EXCL lock primitive named, first-deploy bootstrap, logrotate exclusion done, parse-skip-on-error, dispatcher idempotency, soak-verify presence-not-count)

### Implementation refinements Langston wants surfaced in Step 4 diff:
1. ✅ File-locking primitive — used Node `fs.openSync` + `O_EXCL` (no new npm dep per Kyle's directive)
2. ✅ First-deploy bootstrap — `ensureFileExists()` creates empty file before first write
3. ✅ Soak-verify uses presence-not-count — ANY `TEC_STALE_FAIL_CLOSED` post-deploy = FAIL
4. ✅ Logrotate excludes `system-alerts.jsonl` (rotates only dispatcher log)

### Key file paths (frequently needed):
- Pre-audit: `Claude Comms and Packages/Scope Files/B_NEW_40_PRE_AUDIT.md`
- Scope: `Claude Comms and Packages/Scope Files/B_NEW_40_SCOPE.md`
- Langston inbox dir: `/home/langston/inbox/tec_investigation/` (Hetzner 204.168.141.77)
- Alerts queue: `/var/log/dawntrader/system-alerts.jsonl` (staging 188.245.193.8)
- Dispatcher unit on staging: `/etc/systemd/system/system-alerts-dispatcher.{service,timer}`

### Critical Kyle directives active this batch:
- **NO PATCHES** — every fix structural, not symptom-mitigation
- **No assumptions, verified evidence only** (Kyle 2026-05-16)
- **No proactive DMs** to Kyle on @CCDTCommsBot (Kyle 2026-05-16)
- **Plain-language summaries** to Kyle every time (B-NEW-14/21/KYLE-MORNING bar)
- **Central Clock alignment audit** mandatory for any new scheduled work (Kyle 2026-05-17) — done in pre-audit §2.6: zero violations
- **Per-turn alerts check** for every Claude session (Kyle 2026-05-17) — installed in CLAUDE.md §10.5

---

## STRATEGIC RESET (Kyle 2026-05-16 17:30 UTC) — STILL ACTIVE

**SHELVE until Phase 19:** confidence calibration based on VTS win/loss outcomes. VTS produces signals for ALL strategies in a family + no SQE gating; active trading produces ONE signal per family + applies SQE. VTS wins/losses ≠ active-trading wins/losses.

**Shelved:** B-NEW-38 stratified re-run, B67.5 consumer-gate-from-VTS in current form.

**Still active:** xStock filter/regime/drift calibration (NOT confidence), TFS sustainability second-gate redesign (3 decisions queued — drop/replace/parallel), voice-note transcription wiring, B-NEW-40 (current).

---

## B-NEW-39 STATE (Phase 1 in production, Phase 2 HOLD)

- Phase 1 SQL APPLIED 2026-05-15 23:07 UTC: floor `b67_5_post_composition_floor` 0.20 → 0.45 wildcard row
- Mechanical verification COMPLETE (0% pinned at 0.20, 50% at 0.45)
- Forensic shape verification DEFERRED to Phase 19 per strategic reset
- Phase 2 ON HOLD pending sustainability gate redesign decision

---

## OPERATIONAL FACTS (preserve across compact)

- PM2 #289 on staging (since 2026-05-16 17:46 UTC). Pipeline healthy.
- `tec-pg-capture.timer` armed for next TEC stale event (with ss snapshot added 2026-05-17)
- `system-alerts-dispatcher.timer` active, firing every 15 min
- xstock scanner SCAN_TIMEOUT + B73 ohlcBars undefined errors persist — separate batch candidate
- DATABASE_URL: direct Postgres at port 5432 (not pgbouncer 6543)
- 23 files import the pg pool (audited in pre-audit §2.2 — no `pool.connect()` lease patterns; all use Drizzle which manages connection lifecycle)

---

## LANGSTON COMMS protocol reminder (CLAUDE.md §6.5)

- **File-first** for any design ask/scope/review > short pointer. Full content in `/home/langston/inbox/<batch>/<file>.md`. Pointer prompt under 1KB.
- **SSH dispatch:** scp prompt file → remote run_*.sh script invokes claude-cli with `< /dev/null` to bypass stdin wait, `--permission-mode bypassPermissions`, fresh UUID per dispatch
- **Read reply** from local `/tmp/langston_reply.txt`

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md` (incl. NEW §10.5)
2. This file
3. `Claude Comms and Packages/Scope Files/B_NEW_40_SCOPE.md` (active batch scope)
4. `Claude Comms and Packages/Scope Files/B_NEW_40_PRE_AUDIT.md` (active batch pre-audit)
