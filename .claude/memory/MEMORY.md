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

## CURRENT STATE (2026-05-25 — B79.0n.CONFIDENCE-CHAIN Step 1 ACK LOCKED, Step 2 pre-audit drafting)

### 🟡 IN-FLIGHT: B79.0n.CONFIDENCE-CHAIN (umbrella sub-batch 7 of 18)

**Step 1 Scope LOCKED 2026-05-25** — commit `8293ed5d2` on origin. Scope at `Claude Comms and Packages/Scope Files/B79_0n_CONFIDENCE_CHAIN_SCOPE.md` (347 lines). Langston ACK with D-1..D-5 all ✅ AGREE + 7 nuances (A-G) to fold into Step 2 pre-audit OR scope v2.

**Architectural truth from Step 1.a read (2026-05-25):**
- Modulators live in `server/core/metrics/` (NOT `server/core/modulators/` as initial directive paraphrased)
- 9 modulators: b67_1 macro-modifier, b67_2 phase-preference, b67_3 TFS-desat, b67_4 outcome-feedback, b68_1 multi-tf-agreement, b68_2 volume-regime, b68_3 pair-correlation, b68_4 regime-age, b68_5 path-B
- F-1/F-2 lever audit: 4 F-2 (b67_1 / b67_2 / b67_4 / b68_3) + 5 F-1 (b67_3 / b68_1 / b68_2 / b68_4 / b68_5)
- 16 chain-composition push sites (8 in signal-orchestrator + 8 in vts-runner)
- 7 MCE accessors + 7 refresh methods need REQUIRED-assetClass refactor
- DB: 7 of 9 modulator modules have ZERO xstock_spot rows (only regime_classifier + path_b_sustainability have partial seeds from B79.0n.MCE)

**Langston's 5 D-decisions ✅ AGREE:**
- D-1: b67_1 macro xstock no-op (factor=1.0 + `asset_class_no_op_active` flag); equity macro feed deferred to Phase 24
- D-2: b68_3 SPY/USD reference + `compute_correlation_enabled = false` default for xstock until SPY OHLC pipeline verified
- D-3: b67_2 per-class JSONB row pattern (clone-from-crypto v1 + post-deploy calibrate)
- D-4: outcome-feedback legacy-as-crypto migration semantic (re-key existing entries under `crypto_spot` prefix)
- D-5: canonical ASSET_CLASSES enumeration source + fail-hard on missing-class

**Langston's 7 nuances (A-G) for Step 2:**
- A: Confirm canonical xstock SPY ticker (likely `SPYx/USD` Backed-Finance convention, not `SPY/USD`) — DB query needed
- B: D-3 strategy-key mismatch — seed xstock_spot blob with xstock strategy keys (neutral 1.0) + fail-hard on missing-key
- C: outcome-feedback `.backup` retention — move out of `/tmp/` (purged on staging restart) to persistent path
- D: atomicity boot sequence — verify migration completes BEFORE close-hooks accept updateEma calls
- E: SIM §B69 wording edit — "macro modifier (per-class — crypto inputs for crypto_spot; no-op for xstock_spot)"
- F: UI panel hardcoded crypto accessor paths check — document as Step 8 watch-item if any
- G: Chunk sequencing — Chunks B + D land together (single tsc state) before E threads chain-composition sites

**Next:** Step 2 pre-audit drafting (per-component upstream/downstream/blast-radius enumeration + the 7 nuances as explicit pre-audit findings).

### Workflow status (per CLAUDE.md §2):
1. ✅ Step 1.a Architectural read — DONE
2. ✅ Step 1 Scope + Langston ACK — DONE
3. 🟡 Step 2 Pre-audit — IN PROGRESS
4. Steps 3-11 — pending

### Open follow-ups (not blocking CONFIDENCE-CHAIN)

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
