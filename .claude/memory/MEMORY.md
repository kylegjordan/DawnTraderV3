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

## CURRENT STATE (2026-05-27 — B79.0n.ORCHESTRATOR (#12) FULLY CLOSED; 10 of 16 umbrella sub-batches done; EXECUTION (#13) is next)

### 🟢 B79.0n.ORCHESTRATOR (#12) — FULLY CLOSED 2026-05-27

**Renumbered from #13 after POOL (#12) SKIPPED 2026-05-27.** Sub-batch count 17→16.

**Closing commit:** `5e08568` (PM2 #325 at 13:17:34Z) — single-pass deploy, no hotfixes. CI run `26513242197` all-4-green.

**Step 8 Langston ACK GREEN** — all 5 independent probes passed (endpoint shape + HTTP 200 + PM2 stable + DB rows reconcile + code spot-check exhaustive switch).

**Completion report:** `Claude Comms and Packages/Batch Completion/B79_0n_ORCHESTRATOR_COMPLETION_REPORT.md`.

**What landed:** Per-class consumer-site swap pattern + POOL skip cleanup. New `server/asset_classes/pattern-pool-dispatch.ts` domain-specific dispatcher (mirrors B79.0n.MCE getFrictionForAssetClass pattern). 3 production consumer swaps (paper-position-sizing.ts:145 + signal_quality_evaluator.ts:285 + routes.ts:12645 diagnostic) + 1 dead-import cleanup (signal-orchestrator.ts:101). POOL cleanup: 3 dead ARM constructions + interface field + import deleted; crypto module-level singleton untouched. 3 POOL test file dispositions (1 delete + 3 minor refactors). New `/api/diagnostics/orchestrator-per-class-state` endpoint. 27 new tests (11 unit dispatcher + 7 unit consumer-swaps + 8 integration cascade with key-aware DB mock). 11 scope objectives all YES.

**Files:** 14 changed = 8 prod + 6 test. +677/-131 LOC net. Local tsc baseline 494=494 unchanged. 342/342 tests pass.

**Real behavioral correction observable:** xstock_spot pattern signals now route to 0.50 MAX_POSITION_PCT (DB-resolved) instead of crypto-bound 0.15 — visible via `GET /api/diagnostics/orchestrator-per-class-state`. Takes effect at WIRE-IN (#14) when active trading flips. Phase 19 calibration validates xstock's 0.50 placeholder per RUNNING_ISSUES #153 HARD pre-condition gate.

**Active-trading impact today:** ZERO. Crypto regression NONE by construction.

**Governance ALL 8 docs ACTUALLY edited:** BATCH_CATALOG row #12 / PHASE_HISTORY 15c continuation / SIM "Recent additions (B79.0n.ORCHESTRATOR)" / SYSTEM_MANUAL §19.5 NEW / MULTI_ASSET_VTS_EXPANSION_PLAN closure / CHANGES_AND_FIXES CLOSURE-2026-05-27-pm / RUNNING_ISSUES #153-#156 (4 new entries) / ASSET_CLASS_ONBOARDING_WORKFLOW §4.22 NEW (per-class consumer-site swap pattern).

### 🟢 VERIFY-GATE WATCHLIST

**2 active scheduled alerts (Thursday):**
- `cbe84d5b-73a6-4ed7-9009-447b37ecec04` — B79.0n.SCORING + TEC +48h at 2026-05-28 02:47 UTC
- `1f34cf84-a37c-425c-a1c4-54924b053061` — B79.0n.TELEMETRY +48h at 2026-05-28 18:01:48Z

### .b follow-ups + new entries (RUNNING_ISSUES)

- #141 TEC.b strict 11-key HARD-FAIL — 7d SLA after 48h gate close
- #142 SCORING.b Kyle flagged for re-scoping into active-trading flip
- #147 TELEMETRY.b per-class disk persistence — no SLA
- #148 MarketDataHealthCheck EACCES — Tier-3 polish
- #149-#152 RTB .b follow-ups
- **#153 (NEW)** xstock pattern_max_position_pct=0.50 (3.3× crypto) — HARD pre-condition gate for WIRE-IN (#14) active-trading flip; Phase 19 calibration validates placeholder
- **#154 (NEW)** ARM constructor optional `telemetry` arg light dead code — flag for next ARM-touching batch
- **#155 (NEW)** perp `reason` field truncation in orchestrator diagnostic endpoint — cosmetic
- **#156 (NEW)** Per-class consumer-site swap pattern audit candidate — Phase 16 grep of remaining `crypto_spot/` imports

---

## REMAINING UMBRELLA V4 SUB-BATCHES (4 of 16 left)

| # | Name | Status | Dependencies |
|---|---|---|---|
| 13 | EXECUTION (was #15) | 🟡 NEXT | ORCHESTRATOR ✅ |
| 14 | WIRE-IN (was #16) | pending | EXECUTION |
| 15 | ML-CALIBRATION T2 (was #17) | pending | WIRE-IN |
| 16 | OBSERVABILITY T2 + active-trading flip (was #18) | pending | all above |

**EXECUTION (#13) per umbrella v4:** paper-execution-engine entry-side hooks + dynamic sizing core + pre-execution validator per-class. Different file surfaces from ORCHESTRATOR (paper-position-sizing.ts shared only at the sizing-core logic which ORCHESTRATOR didn't touch). Langston Step 1 §12 ACK confirmed keep separate from ORCHESTRATOR.

---

## CLOSED THIS SESSION (2026-05-27)

### B79.0n.RTB (#11) — CLOSED 2026-05-27 morning

Closing commit `6fd6bcac6`. Per-class queue partitioning + cadence seed.

### B79.0n.ORCHESTRATOR (#12) — CLOSED 2026-05-27 afternoon

Closing commit `5e08568`. Per-class consumer-site swap pattern + POOL skip cleanup.

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
- **Per-step MEMORY truth-file update discipline** — update MEMORY after every workflow step.
- **4-phase migration pattern** (§4.20): for ADD COLUMN on hot-written tables. `import 'dotenv/config'` mandatory on standalone CLI scripts.
- **LOCKED-module override pattern** (§4.21): umbrella-row-authorized + scope-bounded + Langston-Step4-confirmed-no-drift + governance-documents-what-stayed-untouched.
- **Per-class consumer-site swap pattern** (§4.22): when per-class modules already exist with compatible shapes, use cheap dispatcher swap. Decision tree distinguishes from §4.20 (DB migration) + full F-1 resolver-with-EXISTS-gate (deferred to OBSERVABILITY #16).
- **No-silent-fallback at REQUIRED-assetClass boundaries:** use `resolveAssetClass(symbol, 'kraken')` deterministically, NOT metadata-fallback-to-crypto_spot. Throws on B69-unregistered = correct fail-fast.

---

## ACTIVE TASKS

#135 ORCHESTRATOR Steps 5-11 — in_progress (governance + completion + 3-way sync pending commit/push).
