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

## CURRENT STATE (2026-05-25 — B79.0n.PATTERN-DETECT FULLY CLOSED 2026-05-24. Next: B79.0n.CONFIDENCE-CHAIN = umbrella sub-batch 7 of 18, parallel-eligible with SCORING + TEC.)

### B79.0n.PATTERN-DETECT — 🟢 FULLY CLOSED 2026-05-24

CI all-4-green at run `26373689049` / commit `c0479b2`. Staging deployed at `c0479b2` on 2026-05-24 ~21:51Z. All Langston ACKs (Step 1+2+4+8) FINAL.

**Highlights:**
- Per-class plumbing on pattern-recognition layer — TypeScript REQUIRED-`assetClass: AssetClass` discipline across `scanPatterns` + 6 internal detect functions + `patternToTradeSignal` + `PatternRecognizerService` class methods + `selectContextAwareStrategy`.
- DB naming-drift fix on `pattern_pool_gates.xstock_spot.*`: renamed `final_score_floor → pattern_final_score_min` + `max_position_pct → pattern_max_position_pct` (matches crypto convention); seeded 2 NEW xstock RSI bound rows (15/85 from crypto defaults).
- AssetClass type unification at `crypto_spot/pattern-pool-filters.ts:76` (replaced narrow literal with shared canonical re-export). `xstock_spot/pattern-pool-filters.ts` rewritten to getter-shape mirroring crypto.
- Step 9 iteration (post-Langston Step 8 H/USD throw flag): capture-and-reuse refactor at 2 vts-runner function/loop scopes. H/USD-style throws ELIMINATED at 6 sites; COLLISION_RESOLVE WARN amplification reduced ~33%.
- 4 NEW unit test files / 40 tests / all passing + 2 existing tests updated.
- F-1 lever audit: PATTERN_TO_CANONICAL + normalizePatternToCanonical class-invariant by construction.
- BUG-008 + ANOMALY-PROD-2026-05-24 marked RESOLVED.

**Anti-graveyard:** zero new `as any` / `@ts-expect-error` (outside dedicated type-lock test file with 12 documented directives) / `@ts-ignore` / `!`. Baseline at 494 unchanged.

**Full report:** `Claude Comms and Packages/Batch Completion/B79_0n_PATTERN_DETECT_COMPLETION_REPORT.md`. All governance updated (BATCH_CATALOG, PHASE_HISTORY, SIM additions deferred to system-mgmt rewrite, CHANGES_AND_FIXES CLOSURE-2026-05-24-B, RUNNING_ISSUES #136 (r/s/t/u) + #139 NEW).

### 🟢 NEXT BATCH: B79.0n.CONFIDENCE-CHAIN (umbrella sub-batch 7 of 18)

Per umbrella v4 row 7: "b67_1 through b67_4 + b68_1 through b68_5 modulator chain asset-class awareness. Pre-audit verifies whether modulators differ per asset class — could be no-op or could surface per-class parameter need." **Parallel-eligible with SCORING (#8) + TEC (#9).** Kyle chooses ordering when next session starts.

**Dependencies:** STORAGE (#3 closed 2026-05-21).

**Scope file `B79_0n_CONFIDENCE_CHAIN_SCOPE.md` DOES NOT EXIST YET.** Step 1 of next batch is to WRITE it.

### Workflow to start B79.0n.CONFIDENCE-CHAIN (per CLAUDE.md §2):

1. **Step 1.a (MANDATORY per CLAUDE.md §2 1.a):** BEFORE drafting the scope, read SIM + System Manual sections for every CONFIDENCE-CHAIN component — `server/core/modulators/b67_1_*.ts` through `b67_4_*.ts` + `b68_1_*.ts` through `b68_5_*.ts` chain, signal-quality-evaluator modulator integration points, multi-tf-agreement + regime-phase backfill (already partially threaded by B79.0n.MCE for assetClass), modulator call sites in ready-to-buy-service + signal-orchestrator. Architectural claims must come from reads, not grep estimates.
2. Step 1 Scope → dispatch to Langston for ACK.
3. Step 2 Pre-audit → DEEPER per-component analysis. Dispatch to Langston.
4. Steps 3-11 — implementation → Langston code review → CI green → staging deploy → verification → governance → completion report.

### Active alerts (§10.5)
- 0 active-unacked (confirmed 2026-05-24 turn-start, all scheduled/acked).
- `c82c256c` SCHEDULED 2026-05-27 — B-NEW-35 7-day dedup soak.
- `b83b1e4b` SCHEDULED 2026-05-31 — B-NEW-40 14-day soak.
- Implicit: 24h crypto regression soak for PATTERN-DETECT auto-fires 2026-05-25T21:51Z.

### Open follow-ups (not blocking next batch)
- **RUNNING_ISSUES #136 register entries (r)-(u) from B79.0n.PATTERN-DETECT** + (i)-(q) from STRATEGY — Phase 16 cleanup candidates.
- **RUNNING_ISSUES #139 NEW** — vts-runner 10+ pre-existing throwing `resolveAssetClass(...)` call sites. Phase 19 cleanup batch target.
- **RUNNING_ISSUES #138** — hybrid first-confluence label watch-item; verify post-Tuesday 2026-05-26 RTH window.
- **SYSTEM_MANUAL Chapter 2 rewrite** — flagged Phase 16 governance review.
- **Phase 19 follow-ups RUNNING_ISSUES #137** (b73 + b68-5 + b79-0d ORB + b-new-36 audit mock + schema-drift sites).
- **MCE soak verification 616dfcf3** — Tier-3 alert wording polish flag.
- **xstock pattern signal verification** — Tuesday 2026-05-26 ARCA RTH window first opportunity to observe xstock pattern path generating live signals from renamed pattern_pool_gates rows.

### Recent commits (origin HEAD post-PATTERN-DETECT closure)
- `c0479b2` — B79.0n.PATTERN-DETECT Step 9 iteration (safeResolveAssetClass + capture-and-reuse for H/USD throw fix; DEPLOY COMMIT — CI run 26373689049)
- `d870138` — Step 4 change list with embedded diff
- `2fc09f0` — Step 3 atomic (17 files, +831/−89)
- `74f420b` — Step 2 pre-audit
- `d050040` — Step 1 scope v1
- `1936c5f` — CLAUDE.md §2 Step 1.a codification
- `3614bd3` — B79.0n.STRATEGY final close

**Mirror workflow:** code edits on `C:/dev/DawnTraderV3` (inline `git -c user.name=kylegjordan -c user.email=kylegjordan@gmail.com` for commits). GDrive clone governance-docs + `git pull`-only for code per CLAUDE.md §7.1.

### Parked items
- Roadmap sequencing (2026-05-21): Phase 25 (Adaptive Market Response) + VTS partition + daily loss-budget.
- Phase 19 BEFORE Phase 16 (Kyle approved 2026-05-23).
- Ops pending: xstock_spot BE-stop flip true→false.

### Permissions reminder
`.claude/settings.local.json` `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. CLAUDE.md §5 #16 — load-bearing.

### Autonomous-run grant (Kyle directive 2026-05-24, STILL ACTIVE for B79.0n.CONFIDENCE-CHAIN)
Continue iterating autonomously through 11-step workflow. ONE-paragraph Telegram summaries each stage close. Poll group chat every 5 min when idle. Stop only for major decisions. Update MEMORY regularly for compaction safety.

---

## REQUIRED PRE-READS (next session if compacted)
1. `DawnTraderV3/CLAUDE.md` (§1 ONE-paragraph + §2 Step 1.a + §3.3 + §5 #15-19 + §6.5.0.a + §10.5 + §7.1 mirror)
2. This file
3. `Claude Comms and Packages/Batch Completion/B79_0n_PATTERN_DETECT_COMPLETION_REPORT.md` — closed-batch reference
4. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` — row 7 = CONFIDENCE-CHAIN scope summary
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` — pre-audit reference for modulator chain
6. `1-system-manual/RUNNING_ISSUES.md` — #136 (a-u) + #137 + #138 + #139 register state
