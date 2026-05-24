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

### B79.0n.PATTERN-DETECT — 🟡 IN STEP 2 (Step 1 ACK 2026-05-24)

- **Position:** umbrella sub-batch 6 of 18 (Phase 24, multi-asset VTS expansion).
- **Dependencies (all CLOSED):** STORAGE, MCE, STRATEGY, UNIVERSE-DISCOVERY, HYGIENE, REGISTRY.
- **Scope v1 committed:** `d050040` — `Claude Comms and Packages/Scope Files/B79_0n_PATTERN_DETECT_SCOPE.md` (279 lines).
- **Langston Step 1 ACK:** received 2026-05-24 ~06:56Z (4790-byte reply). Decisions: Q-A DEFER, Q-B Option (i) rename xstock rows to crypto nomenclature, Q-C Option (a) seed 15/85 RSI defaults, Q-D Option (b) preloader to Phase 16 register, Q-E/Q-F pre-audit confirm, Q-G DEFER, Q-H N/A. ONE extra Step 2 cross-check: grep-verify zero current consumers of legacy xstock row names ('final_score_floor' / 'max_position_pct').
- **In scope:** REQUIRED-`assetClass: AssetClass` plumbing on scanPatterns + 6 detect functions (PINBAR/ENGULFING/INSIDE_BAR/THREE_SOLDIERS/MORNING_STAR/ABCD) + patternToTradeSignal + PatternRecognizerService class methods. F-2 naming-drift fix on `module_constants.pattern_pool_gates.xstock_spot.*` (rename final_score_floor → pattern_final_score_min; max_position_pct → pattern_max_position_pct; seed pattern_rsi_min=15 + pattern_rsi_max=85). AssetClass type unification at `crypto_spot/pattern-pool-filters.ts:76`. 4 new unit tests. Crypto NONE-by-construction regression invariant.
- **Out of scope (deferred to Layer-3):** per-class numeric tuning of 11 detect-function thresholds; ATR multiplier per-class tuning; migration of detect-function literals to `module_constants`. Per umbrella v4 §1.5 "modest shrink" sizing.
- **Caller surface:** scanPatterns 5 production sites + 3 test sites + 1 diagnostic; patternToTradeSignal 1 (orphan suspected); preloader 1 production + 1 test; selectContextAwareStrategy 2 production + 1 diagnostic (pre-audit confirms alive/dead).
- **Telegram one-paragraph Step 1 close posted at msg_id 4161 + Langston verbatim relay at preceding msg.**

### Step 2 work-in-progress (Pre-audit deeper dive)

1. ✅ Langston Q-B grep cross-check: verify zero consumers of `'final_score_floor'` / `'max_position_pct'` paired with xstock_spot asset class anywhere in server/+shared/+scripts/.
2. ✅ Q-E disposition: confirm whether `selectContextAwareStrategy` (canonical-regime-strategy-map.ts:637) is still live in vts-runner.ts post-STRATEGY v3.0.0 byAssetClass.
3. ✅ Q-F disposition: confirm whether `PATTERN_POOL_STRATEGIES` const (crypto_spot/pattern-pool-filters.ts:53-64) is still consumed.
4. ✅ Per-component upstream/downstream/shared-state/background-execution/blast-radius for all 13 affected components.
5. ✅ Pre-audit file at `Claude Comms and Packages/Scope Files/B79_0n_PATTERN_DETECT_PRE_AUDIT.md`.
6. ✅ Dispatch pre-audit to Langston for Step 2 ACK.

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
