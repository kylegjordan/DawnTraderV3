# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + TWO-paragraph default; §3.3 Phase-24; §5 #15 NO PATCHES + #16 permission-prompt + #19 CI per-batch; §6.5.0.a embedded-diff + no-gdrive; §7.1 mirror; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. **Telegram poll:** `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`.
5. Plain-language summaries to Kyle: TWO paragraphs default, also post in Claude Desktop AND Telegram topic 21 (Kyle directive 2026-05-25).
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-27 — B79.0n.EXECUTION (#13) FULLY CLOSED; 13 of 16 umbrella sub-batches done; WIRE-IN (#14) is next)

### 🟢 B79.0n.EXECUTION (#13) — FULLY CLOSED 2026-05-27

**LAST per-class plumbing sub-batch before WIRE-IN (#14, Phase 19a).** Per Kyle directive 16:18Z (proceed autonomously with Langston while he was away).

**Closing commit:** `f283c2c` (PM2 #326 at 17:30:13Z; rebased on `aead11a` ORCHESTRATOR governance) — single-pass deploy, no hotfixes. CI run `26527276989` all-4-green at 2m17s.

**Step 8 Langston ACK GREEN** — all 5 independent probes passed (endpoint shape + HTTP 200 + PM2 stable + DB matches endpoint exactly 0/0/0 + code spot-check skipped per Step 4 embedded diffs).

**Completion report:** `Claude Comms and Packages/Batch Completion/B79_0n_EXECUTION_COMPLETION_REPORT.md`.

**What landed:** TradeClosedEvent additive `assetClass?: string` field (event-bus.ts mirroring PromotionEvent C-7 doctrine from RTB) + emit-site at paper-execution-engine.ts:1545 populates from position.assetClass canonical SSOT + canary log per Langston B2 mitigation. Position-record SSOT cleanup at paper-execution-engine.ts:1376 outcomeFeedback hook (belt-and-suspenders fallback per Langston B2 reframe — defensive NOT load-bearing, L922 NO_FALLBACK is the real guard). Diagnostic endpoint URL retained per Langston Q3 ACK (zero callers verified), payload v2 nested-by-layer with orchestrator + execution + _meta + 3-entry knownGaps registry inline. 12 new source-file regression-lock tests. 4 files / +253/-15 LOC net.

**Files:** 3 production (event-bus.ts +16 / paper-execution-engine.ts +30/-3 / routes.ts +84/-15) + 1 new test (b79-0n-execution-audit.test.ts 138 LOC). Local tsc baseline 494=494 unchanged. 12/12 + 19/19 ORCHESTRATOR regression pass.

**Real behavioral observability at WIRE-IN:** canary log + outcomeFeedback EMA store key + counter math all become observable when active trading flips on. Today endpoint shows 0/0 counters by design (paper_sim_trades empty).

**Active-trading impact today:** ZERO. Crypto regression: NONE by construction.

**Governance ALL 8 docs ACTUALLY edited:** BATCH_CATALOG row #13 / PHASE_HISTORY 15c continuation / SIM "Recent additions (B79.0n.EXECUTION)" / SYSTEM_MANUAL §19.7 NEW / MULTI_ASSET_VTS_EXPANSION_PLAN closure / CHANGES_AND_FIXES CLOSURE-2026-05-27 evening / RUNNING_ISSUES #157-#159 (3 new entries) / ASSET_CLASS_ONBOARDING_WORKFLOW §4.23 + §4.24 NEW (additive event-payload field pattern + deferred-gap registry closure rule).

### 🟢 VERIFY-GATE WATCHLIST

**3 active scheduled alerts:**
- `cbe84d5b-73a6-4ed7-9009-447b37ecec04` — B79.0n.SCORING + TEC +48h at 2026-05-28 02:47 UTC
- `1f34cf84-a37c-425c-a1c4-54924b053061` — B79.0n.TELEMETRY +48h at 2026-05-28 18:01:48Z
- `b83b1e4b-4870-43d9-9ba0-a45a7d3949be` — B-NEW-40 14-day soak at 2026-05-31 12:46Z

### .b follow-ups + new entries (RUNNING_ISSUES)

- #141 TEC.b strict 11-key HARD-FAIL — 7d SLA after 48h gate close
- #142 SCORING.b Kyle flagged for re-scoping into active-trading flip
- #147 TELEMETRY.b per-class disk persistence — no SLA
- #148 MarketDataHealthCheck EACCES — Tier-3 polish
- #149-#152 RTB .b follow-ups
- #153 xstock pattern_max_position_pct=0.50 (3.3× crypto) — HARD pre-condition gate for WIRE-IN (#14)
- #154 ARM constructor optional `telemetry` arg light dead code
- #155 perp `reason` field truncation in diagnostic endpoint (BOTH orchestrator + execution layers now — cosmetic)
- #156 Per-class consumer-site swap pattern Phase 16 audit candidate
- **#157 (NEW)** `_meta.knownGaps` line-number drift — Langston Step 4 C5 #1 follow-up
- **#158 (NEW)** `getPaperSimTrades` JS-filter 24h cutoff inefficient at WIRE-IN volume — Langston C5 #2
- **#159 (NEW)** `[B79.0n.EXECUTION][EMIT_TRADE_CLOSED]` canary log volume gating post-WIRE-IN 30d burn-in — Langston C5 #3

---

## REMAINING UMBRELLA V4 SUB-BATCHES (3 of 16 left)

| # | Name | Status | Dependencies |
|---|---|---|---|
| 14 | WIRE-IN (Phase 19a) | 🟡 NEXT | EXECUTION ✅ |
| 15 | ML-CALIBRATION T2 | pending | WIRE-IN |
| 16 | OBSERVABILITY T2 + active-trading flip | pending | all above |

**WIRE-IN (#14) per umbrella v4:** activate runtime witnesses for Langston C4 surfaces 1+2 (canary log on close + outcomeFeedback EMA store key after close). xstock active-trading flip with the per-class plumbing from all prior batches. Phase 19/25 split decision pending Kyle's return per his 16:18Z directive.

---

## CLOSED THIS SESSION (2026-05-27)

### B79.0n.RTB (#11) — CLOSED 2026-05-27 morning
Closing commit `6fd6bcac6`. Per-class queue partitioning + cadence seed.

### B79.0n.ORCHESTRATOR (#12) — CLOSED 2026-05-27 afternoon
Closing commit `5e08568`. Per-class consumer-site swap pattern + POOL skip cleanup.

### B79.0n.EXECUTION (#13) — CLOSED 2026-05-27 evening
Closing commit `f283c2c`. TradeClosedEvent additive assetClass + SSOT cleanup + diagnostic v2 nested-by-layer.

---

## OPERATIONAL INVARIANTS (DO NOT FORGET)

- **CLAUDE.md §5 #19 CI per-batch confirmation MANDATORY** — never close a batch with red CI.
- **§10.5 alerts every turn** — SURFACE actionable alerts IN RESPONSE.
- **§6.5.0 file-first dispatch** — SCP to `/home/langston/inbox/<batch>/`, NEVER /mnt/gdrive paths.
- **§6.5.0.a embedded-diff dispatches** for Step 4 code reviews.
- **§7.1 code edits in C:\dev mirror ONLY** — governance docs in GDrive OK.
- **§3.1 MEMORY 2-file pattern** — edit truth file FIRST, then copy to in-repo + commit/push same governance turn.
- **§3.2 MEMORY ≤200 lines** — `wc -l` after edit; prune before commit.
- **Plain-language summaries:** post to BOTH Telegram topic 21 AND Claude Desktop. TWO paragraphs default.
- **xStock 24/5 (NOT US RTH).** US market holidays pause cadence.
- **Langston canonical session UUID is bridge-locked.** Use fresh `uuidgen` for SSH-deliver. Always pass `--permission-mode bypassPermissions`.
- **Autonomy with Langston:** iterate to consensus per §6.7. Escalate to Kyle only on deadlock / architectural decisions / risk boundaries.
- **All-8-docs ACTUALLY edited at Step 10** per Kyle PATTERN-DETECT directive.
- **Phase 24 standing rule:** completion reports MUST include "Asset-class onboarding workflow learnings" 4-section block (a/b/c/d).
- **4-phase migration pattern** (§4.20): for ADD COLUMN on hot-written tables. `import 'dotenv/config'` mandatory on standalone CLI scripts.
- **LOCKED-module override pattern** (§4.21): umbrella-row-authorized + scope-bounded + Langston-Step4-confirmed-no-drift + governance-documents-what-stayed-untouched.
- **Per-class consumer-site swap pattern** (§4.22): when per-class modules already exist with compatible shapes, use cheap dispatcher swap.
- **Additive event-payload field pattern** (§4.23, NEW): when an event needs asset-class disambiguation, use `assetClass?: string` optional field — verify zero strict-shape consumers via grep first. Applied 2x: PromotionEvent C-7 (RTB) + TradeClosedEvent C-A (EXECUTION).
- **Deferred-gap registry closure rule** (§4.24, NEW): closing a `_meta.knownGaps` entry MUST remove from payload + bump lastReviewed. ANY per-class-state batch must bump lastReviewed even if knownGaps unchanged.
- **No-silent-fallback at REQUIRED-assetClass boundaries:** use `resolveAssetClass(symbol, 'kraken')` deterministically.

---

## ACTIVE TASKS

#136 B79.0n.EXECUTION (#13) FULLY CLOSED — completion report + governance done; final commit/push + 3-way MEMORY sync + Kyle DM close summary IN-FLIGHT.
