# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + ONE-paragraph default per Kyle 2026-05-24; §3.3 Phase-24 learning-capture; §5 #15 NO PATCHES + #16 permission-prompt fix + #19 CI per-batch confirmation; §6.5.0.a embedded-diff + no-gdrive dispatch pattern; §10.5 alerts; §7.1 mirror).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. **Telegram poll (Kyle directive 2026-05-24 — every 5 min when idle):** `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`. Kyle may post directives in topic 21 group chat during the day.
5. Kyle in Claude Desktop OR Telegram group chat. Telegram = Langston verbatim relay + Kyle visibility. Summaries TO KYLE: **ONE-PARAGRAPH on Telegram** per stage (Kyle directive 2026-05-24).
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-24 — B79.0n.PATTERN-DETECT Step 1 ACK'd by Langston; in Step 2 pre-audit. Autonomous-run grant active.)

### B79.0n.PATTERN-DETECT — 🟡 IN STEP 5 (Steps 1+2+3+4 ACK'd by Langston 2026-05-24)

- **Position:** umbrella sub-batch 6 of 18 (Phase 24, multi-asset VTS expansion).
- **Dependencies (all CLOSED):** STORAGE, MCE, STRATEGY, UNIVERSE-DISCOVERY, HYGIENE, REGISTRY.
- **Scope v1 committed:** `d050040` — `Claude Comms and Packages/Scope Files/B79_0n_PATTERN_DETECT_SCOPE.md` (279 lines). Step 1 ACK.
- **Pre-audit v1 committed:** `74f420b` — Step 2 ACK with 7 R-decisions ALL Option (A).
- **Step 3 atomic commit:** `2fc09f0` — chunks A-G (17 files, +831/−89). Migration + recognizer signatures + caller threading + filter-file rewrites + selectContextAwareStrategy + 4 new tests + 3 existing test updates.
- **Step 4 change list committed:** `d870138` — Langston ACK clean. Approved to Step 6 on CI green.
- **CI run for d870138:** `26372084239` (in_progress as of post-commit). Run `26372040148` for 2fc09f0 was cancelled (superseded by next push).
- **Local gates:** tsc baseline 494 unchanged (zero regression); 96 tests pass (4 new + 2 existing pattern test files).
- **Telegram msg ids:** Step 1 close `4161`, Step 2 close (2-chunk verbatim), Step 3+4 close `4169`.

### Step 5+6 work-in-progress (CI watch + staging deploy)

1. ⏳ CI run 26372084239 — wait for all-4-green (TypeScript Check, Test Suite, Build, Docker Build)
2. ⏳ Step 6: ssh staging — git pull + db:migrate + npm run build + pm2 restart
3. ⏳ Step 7: CC first-pass — PM2 logs + psql verify xstock_spot pattern_pool_gates rows have converged names + UI Claude-in-Chrome
4. ⏳ Step 8: Langston second-pass UI verification
5. ⏳ Step 10+11: governance + completion report + MEMORY sync (3-way)

### Langston ACKs locked
- **R-1**: thread REQUIRED-assetClass on patternToTradeSignal — DONE
- **R-2**: plumbing-only on selectContextAwareStrategy — DONE
- **R-3**: parallel XSTOCK_PATTERN_POOL_GUARDRAILS const — DONE
- **R-4**: leave PATTERN_POOL_STRATEGIES + Phase 16 register — DONE
- **R-5**: single migration file BEGIN/COMMIT — DONE
- **R-6**: mirror R-1 in 2 tests — DONE
- **R-7**: YES thread assetClass into patternToTradeSignal — DONE

### Langston Step 4 mild notes (CC's call to address now or in completion-report)
- §6 dynamic `import('...').AssetClass` form: "acceptable" but `import type` would be more idiomatic if no actual circular-dep
- §8 xstock_spot deprecated shim: "soft concern not block" — could delete now since 0 importers vs keeping Phase 16 register

### Active alerts (§10.5)
- 0 active-unacked (confirmed 2026-05-24 turn-start, full queue all scheduled or acked).
- `c82c256c` SCHEDULED 2026-05-27 — B-NEW-35 7-day dedup soak.
- `b83b1e4b` SCHEDULED 2026-05-31 — B-NEW-40 14-day soak.

### Open follow-ups (carried)
- **RUNNING_ISSUES #136 entries (i)-(q)** from B79.0n.STRATEGY — Phase 16 cleanup candidates.
- **RUNNING_ISSUES #138** — hybrid first-confluence label watch-item; verify post-Tuesday 2026-05-26 RTH window.
- **SYSTEM_MANUAL Chapter 2 rewrite** — flagged Phase 16 governance review.
- **Phase 19 follow-ups RUNNING_ISSUES #137** (b73 + b68-5 + b79-0d ORB + b-new-36 audit mock + schema-drift sites).

### Recent commits (origin HEAD post-STRATEGY closure)
- `d050040` — B79.0n.PATTERN-DETECT scope v1 (current HEAD)
- `1936c5f` — CLAUDE.md §2 Step 1.a codification + MEMORY refresh
- `3614bd3` — B79.0n.STRATEGY final close commit
- `85ea78e` — B79.0n.STRATEGY Step 5 hotfix-2 (deploy commit)

**Mirror workflow:** code edits on `C:/dev/DawnTraderV3` (inline `git -c user.name=kylegjordan -c user.email=kylegjordan@gmail.com` for commits). GDrive clone governance-docs + `git pull`-only for code per CLAUDE.md §7.1.

### Parked items
- Roadmap sequencing (2026-05-21): Phase 25 (Adaptive Market Response) + VTS partition + daily loss-budget — in POST_AUDIT_ROADMAP.
- Phase 19 BEFORE Phase 16 (Kyle approved 2026-05-23).
- Ops pending: xstock_spot BE-stop flip true→false.

### Permissions reminder
`.claude/settings.local.json` `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. CLAUDE.md §5 #16 — load-bearing.

### Autonomous-run grant (Kyle directive 2026-05-24)
Continue iterating B79.0n.PATTERN-DETECT through 11-step workflow autonomously. ONE-paragraph Telegram summaries each stage close. Poll group chat every 5 min when idle. Stop only for major decisions. Update MEMORY regularly for compaction safety.

---

## REQUIRED PRE-READS (next session if compacted)
1. `DawnTraderV3/CLAUDE.md` (§1 ONE-paragraph + §2 Step 1.a + §3.3 + §5 #15-19 + §6.5.0.a + §10.5 + §7.1 mirror)
2. This file
3. `Claude Comms and Packages/Scope Files/B79_0n_PATTERN_DETECT_SCOPE.md` — Step 1 scope v1 (Langston ACK'd)
4. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` — Tier 1 row 6 PATTERN-DETECT
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` — pre-audit reference for pattern-recognizer + pattern strategies + module_constants pattern_pool_gates
6. Inbox file path Langston used: `/home/langston/inbox/b79-0n-pattern-detect/B79_0n_PATTERN_DETECT_SCOPE.md`
7. Langston Step 1 ACK reply at `/tmp/langston_step1_reply_pattern_detect.txt` on Helsinki (4790 bytes)
