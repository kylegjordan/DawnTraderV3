# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + two-paragraph default; §3.3 Phase-24 learning-capture; §5 #15 NO PATCHES + #16 permission-prompt fix + #19 CI per-batch confirmation; §6.5.0.a embedded-diff + no-gdrive dispatch pattern; §10.5 alerts; §7.1 mirror).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Kyle in Claude Desktop. Telegram = Langston verbatim relay + visibility. Summaries TO KYLE go in THIS session; Langston-verbatim relays to Telegram STILL mandatory per §6.5 step 3.
5. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-24 — B79.0n.STRATEGY FULLY CLOSED. Next: B79.0n.PATTERN-DETECT = umbrella sub-batch 6 of 18.)

### B79.0n.STRATEGY — 🟢 FULLY CLOSED 2026-05-24

CI all-4-green at run 26347883994 / commit `85ea78e`. Staging deployed at `85ea78e` on 2026-05-24 ~00:55Z. All Langston ACKs (Step 1+2+4+8) FINAL.

**Highlights:**
- Per-asset-class strategy plumbing — TypeScript REQUIRED-`assetClass` discipline across 19 detect methods + 10 file-based detect functions + `_SE_KEY` factory + `callStrategyDetect` dispatcher + `strategy-mapper.ts` per-class signatures.
- Caller surface threaded: 7 files / 66 sites (compile-driven enumeration).
- Canonical regime-strategy JSON migrated v2.0.0 (flat) → v3.0.0 (nested byAssetClass). Crypto byte-identical; xStock = crypto minus defensive_hedge + add orb to TFS+IE.
- Schema migration: strategy_settings + strategy_settings_audit add asset_class column; UNIQUE swapped; 18 NEW xstock_spot strategy_gates rows seeded (9 enabled=true + 10 enabled=false; ORB stays disabled per B-NEW-34).
- CORE_STRATEGIES 17→19 (added strong_bull_trend + orb) — RISK-014 closure.
- hybrid-integration.ts BUG-007 closure (legacy H1/H2/H3/H4 → canonical hybrid keys).
- STRATEGIES const completion. strategyTypeEnum extended with 'orb'.
- inside-bar-reversal.ts SELL dead-code cleanup.
- 4 NEW unit test files / 16 tests / all passing; 2 existing tests updated (mapping_drift_integrity + hybrid-integration).
- F-1 lever audit: 222 wildcard `strategy.*` rows all class-invariant; zero per-class seed rows added. Q-F gate cleared without escalation.
- Per-class mapper log line confirmed in production: `[11.4H.6G][Mapper] AssetClass=crypto_spot Regime=TREND_FRIENDLY_STABLE | Strategies=vwap_pullback, morning_star, pivot_shift`.

**Anti-graveyard:** zero new `as any` / `@ts-expect-error` (outside dedicated type-lock test file with 31 documented directives) / `@ts-ignore` / `!`. Baseline regenerated 488→494 with full delta-breakdown justification.

**Anomalies (documented, not blockers):**
- ORB on xstock_spot strategy_gates = enabled=false (B-NEW-34 disabled pre-batch; ON CONFLICT preserved). Scope predicted 10/9; actual 9/10.
- strategy_settings net +44 not +42 (range_trade canonical added 2 unexpected crypto rows).
- Hybrid first-confluence label end-to-end verification deferred to first post-Tuesday RTH confluence — watch-item #138.

**Full report:** `Claude Comms and Packages/Batch Completion/B79_0n_STRATEGY_COMPLETION_REPORT.md`. BATCH_CATALOG + PHASE_HISTORY + SIM + CLAUDE.md persona §3 + CHANGES_AND_FIXES (CLOSURE-2026-05-24-A) + RUNNING_ISSUES (#136-i to #136-q + #138) all updated.

### 🟢 NEXT BATCH: B79.0n.PATTERN-DETECT (umbrella sub-batch 6 of 18)

**Phase 24 (multi-asset VTS expansion).** Umbrella scope row 6 — pattern recognition modules (candlestick detectors, chart-pattern recognizers, pattern strength scoring). Per umbrella rev 4 §1.5 row PATTERN-DETECT: "modest shrink — B72 wired pattern_pool_gates (1 lever at crypto_spot scope); B72 Slice 3b touched the 6 pattern strategy files. Remaining: pattern recognition modules themselves — audit whether already asset-class-aware via xStock VTS usage; close gaps. Per-class seed for pattern_pool_gates.xstock_spot.* rows."

**Dependencies:** STORAGE (#3 closed 2026-05-21).

**Scope file `B79_0n_PATTERN_DETECT_SCOPE.md` DOES NOT EXIST YET.** Step 1 of next batch is to WRITE it (per CLAUDE.md §2 standard 11-step workflow).

### Workflow to start B79.0n.PATTERN-DETECT (per CLAUDE.md §2):

1. **Step 1.a (MANDATORY per CLAUDE.md §2 1.a, codified 2026-05-24 from B79.0n.STRATEGY learning):** BEFORE drafting the scope, read `1-system-manual/SYSTEM_IMPACT_MAP.md` AND `1-system-manual/SYSTEM_MANUAL.md` sections for every PATTERN-DETECT component — `pattern-recognizer.ts` (6 pattern types: PINBAR / ENGULFING / INSIDE_BAR / THREE_SOLDIERS / MORNING_STAR / ABCD), `pattern-pool-filters.ts` (per-class config), `module_constants.pattern_pool_gates`, the 3 pattern strategies + 5 hybrid strategies consuming pattern signals, scanPatterns call sites, normalizePatternToCanonical (B57 single-source-of-truth), pattern recognition preloader. Scope's architectural claims (caller-site counts, dependencies, blast-radius) MUST come from these reads — not from grep or memory.
2. **Step 1 Scope** — draft `Claude Comms and Packages/Scope Files/B79_0n_PATTERN_DETECT_SCOPE.md` covering pattern recognition primitives + per-class pattern_pool_gates seeding + B72 prior-arc context section per umbrella v4 §1.5 standing rule. Dispatch to Langston for ACK.
3. **Step 2 Pre-audit** — DEEPER pass through SIM + System Manual (per-component upstream/downstream/shared-state/background-execution/blast-radius). Document in `B79_0n_PATTERN_DETECT_PRE_AUDIT.md`. Dispatch to Langston.
4. **Steps 3-11** — implementation → Langston code review → push → CI green (per §5 #19) → staging deploy → first-pass verify → Langston second-pass verify → iterate → governance updates → completion report.

### Active alerts (§10.5)
- 0 active-unacked (confirmed via `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"` at 2026-05-23 turn-start).
- `c82c256c` SCHEDULED 2026-05-27 — B-NEW-35 7-day dedup soak. No action until trigger.
- `b83b1e4b` SCHEDULED 2026-05-31 — B-NEW-40 14-day soak. No action until trigger.

### Open follow-ups (not blocking next batch start)
- **RUNNING_ISSUES #136 register entries (i)-(q)** filed for B79.0n.STRATEGY — routes.ts admin endpoints + 4 validation harnesses + range_trading legacy alias + IB_SELL_RSI_MIN orphan + verifyUserStrategies unused method. Phase 16 cleanup candidates.
- **RUNNING_ISSUES #138** filed — hybrid first-confluence label watch-item per Langston Step 8. Verify post-Tuesday 2026-05-26 RTH window.
- **SYSTEM_MANUAL Chapter 2 rewrite** — flagged for next Phase 16 governance review (stale 17-strategy count + old regime names + deleted DSS references); too large for any in-flight batch.
- **MCE alert-body wording polish (Tier-3):** the next soak-verification alert template should replace "keeps appearing on refresh cycles" with "fires once per process restart; expect N entries for N restarts in window."
- **Phase 19 follow-ups registered to RUNNING_ISSUES #137** (b73 4 variant rewrites, b68-5 momentum-gate tests, b79-0d ORB rewrites, b-new-36 audit-row mock, schema-drift sites, etc.).

### Recent commits (origin HEAD around `85ea78e` post-B79.0n.STRATEGY)
- `85ea78e` — Step 5 hotfix-2: tests updated for v3.0.0 byAssetClass + canonical hybrid taxonomy (DEPLOY COMMIT — CI all-4-green at run 26347883994)
- `1bfda3f` — Step 5 hotfix: migration column rename (set_by→updated_by) + tsc baseline regen 488→494 + Langston nit 1
- `b0a4292` — Step 4 change list
- `af99bd5` — Step 3 atomic commit (36 files, +1264/−352)
- `cc36b03f2` — MEMORY refresh (pre-Step-3)
- `17b3ca81a` — Pre-audit v1
- `8fda3666d` — Scope v2.1
- `288ba6ce1` — Scope v2

**Mirror workflow:** code on `C:/dev/DawnTraderV3` (inline `git -c user.name=kylegjordan -c user.email=kylegjordan@gmail.com` for commits). GDrive clone is governance-docs + `git pull`-only for code per CLAUDE.md §7.1.

### Parked items
- Roadmap sequencing changes (2026-05-21): Phase 25 (Adaptive Market Response, moved from §18.9 by Kyle 2026-05-23) + VTS partition + daily loss-budget — in POST_AUDIT_ROADMAP.
- Phase 19 runs BEFORE Phase 16 (Kyle approved 2026-05-23) — in POST_AUDIT_ROADMAP.
- Ops pending: xstock_spot BE-stop flip true→false.

### Permissions reminder
`.claude/settings.local.json` `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. CLAUDE.md §5 #16 — load-bearing; do NOT delete.

---

## REQUIRED PRE-READS (next session)
1. `DawnTraderV3/CLAUDE.md` (§1 + §3.3 + §5 #15-19 + §6.5.0.a + §10.5 + §7.1 mirror)
2. This file
3. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` — Tier 1 table row 6 = PATTERN-DETECT scope summary
4. `Claude Comms and Packages/Batch Completion/B79_0n_STRATEGY_COMPLETION_REPORT.md` — reference for closed batch
5. `1-system-manual/SYSTEM_IMPACT_MAP.md` — pre-audit reference for pattern-recognizer + pattern strategies + module_constants pattern_pool_gates
