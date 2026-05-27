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

## CURRENT STATE (2026-05-27 — B79.0n.RTB (#11) FULLY CLOSED; 9 of 17 umbrella sub-batches done; POOL (#12) is next)

### 🟢 B79.0n.RTB (#11) — FULLY CLOSED 2026-05-27

**Combines former #11 RTB + former #12 RTB-REFRESH** per Kyle directive 2026-05-27. Sub-batch count 18→17 for remaining roadmap; subsequent sub-batches renumber (former #13 POOL now #12, etc.).

**Closing commits:** `6fd6bcac6` (deploy, PM2 #324 at 11:10:31Z) preceded by `a4ac36c` (Step 4 R1 fix-up + N1/N2) + `7650879eafb` (Step 4 change list) + `298cb2e76` (MANIFEST.txt drift hotfix) + `8dd10c7b6` (Step 3 impl Chunks A-N) + `97572094e` (Step 2 pre-audit) + `239723058` (scope v2.2) + `42f242615` (Step 1.a architectural synthesis after Kyle pushback on hasty v1).

**CI:** run `26507336347` all-4-green on `a4ac36c`; post-hotfix `6fd6bca` also green.

**Step 8 Langston ACK GREEN** at ~11:18Z (Telegram msg_id 4269) — 8 independent probes triangulated.

**Completion report:** `Claude Comms and Packages/Batch Completion/B79_0n_RTB_COMPLETION_REPORT.md`.

**What landed:** per-class queue partitioning + cadence seed batch. Schema: `rtb_signals.asset_class VARCHAR(32)` first-class column via 4-phase production-safe migration (Phase 1 nullable + 4 module_constants cadence seed → Phase 2 backfill dual-path → Phase 3 CHECK + composite index → Phase 4 SET NOT NULL deferred). Code: LOCKED-module override on `rtb-refresh-service.ts` → `signalBuckets: Map<AssetClass, Map<number, Set<string>>>` nested per-class (Langston C-1 Option A); shared global ACT pool preserved (C-2); `_RTB_GK` wildcard preserved at 8 FSM-threshold sites (C-8). `rtb_queue_refresher.ts` RETIRED (zero callers). Boot pre-warm enumerates 4 active classes with HARD-FAIL `process.exit(1)`. 11 scope objectives all YES.

**Files:** 24 files changed = 13 production + 11 new test. +2083/-210 net LOC. 53 new unit tests pass in 3.33s locally.

**3 hotfixes during deploy chain:** `298cb2e` MANIFEST.txt drift + `a4ac36c` R1 package.json script + N1/N2 inline warns + `6fd6bca` backfill-script dotenv import.

**Active-trading impact today:** ZERO. paper_sim_trades + trades both empty. Per-class buckets stay empty until WIRE-IN (#16) threads scanner → SQE → RTB signals carrying assetClass.

**Governance ALL 8 docs ACTUALLY edited:** BATCH_CATALOG / PHASE_HISTORY / SIM (new "Recent additions (B79.0n.RTB)" section) / SYSTEM_MANUAL §19.4 NEW / MULTI_ASSET_VTS_EXPANSION_PLAN closure / CHANGES_AND_FIXES CLOSURE-2026-05-27 / RUNNING_ISSUES #149-#152 (4 new entries) / ASSET_CLASS_ONBOARDING_WORKFLOW §4.20 + §4.21 NEW (4-phase migration pattern + LOCKED-module override pattern).

### 🟢 VERIFY-GATE WATCHLIST

**3 active scheduled alerts:**
- `27da1fa0-11e5-4dda-af08-305b1969adde` — B79.0n.SCORING + TEC +24h ACKED 2026-05-27 08:09:12Z
- `cbe84d5b-73a6-4ed7-9009-447b37ecec04` — B79.0n.SCORING + TEC +48h at 2026-05-28 02:47 UTC (final gate; greenlight TEC.b; SCORING.b may re-scope to sub-batch 17)
- `1f34cf84-a37c-425c-a1c4-54924b053061` — B79.0n.TELEMETRY +48h at 2026-05-28 18:01:48Z (perp recordCount=0 invariant)

**§10.5 protocol:** every turn `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`. When state=active AND acknowledged_at=null AND triggers_at <= NOW(): surface IN RESPONSE to Kyle. ACK via `npm run system-alerts -- ack <id> --by cc-session-2026-05-27` after probe.

### .b follow-ups queued (RUNNING_ISSUES)

- **#141 B79.0n.TEC.b:** strict 11-key HARD-FAIL restoration via `requireKey<T>` — 7d SLA after 48h gate close
- **#142 B79.0n.SCORING.b:** EXISTS-gated wildcard retirement + F-1 resolver hooks — Kyle flagged for re-scoping into sub-batch 17 active-trading flip (weak observability in VTS-shadow)
- **#147 B79.0n.TELEMETRY.b:** per-class disk persistence for non-crypto_spot instances — no SLA today (no perp class persists yet)
- **#148 (Tier-3 polish):** MarketDataHealthCheck EACCES on `/home/runner` path — unrelated finding
- **#149 B79.0n.RTB.b:** per-class cadence calibration NO SLA (gates on xstock active-trading evidence window)
- **#150 B79.0n.RTB Phase 4:** SET NOT NULL contingent on 48h zero-null gate post-WIRE-IN (#16)
- **#151:** per-class cadence promotion EXISTS-gate pattern Phase 16 register entry
- **#152:** LOCKED-module override scope boundary documentation reference

---

## REMAINING UMBRELLA V4 SUB-BATCHES (8 of 17 left)

| # | Name | Status | Dependencies |
|---|---|---|---|
| 12 | POOL (was #13) | 🟡 NEXT — unblocked by RTB | TELEMETRY ✅ + RTB ✅ |
| 13 | ORCHESTRATOR (was #14) | pending | POOL |
| 14 | EXECUTION (was #15) | pending | ORCHESTRATOR |
| 15 | WIRE-IN (was #16) | pending | EXECUTION + TELEMETRY |
| 16 | ML-CALIBRATION T2 (was #17) | pending | WIRE-IN |
| 17 | OBSERVABILITY T2 + active-trading flip (was #18) | pending | all above |

**POOL (#12) per umbrella v4:** Adaptive Ratio Manager (ARM) consumes per-class telemetry instances (from TELEMETRY) + per-class queue depth + queue partitioning (from RTB) as the substrate for cross-class pool sizing. ARM constructor already takes injected telemetry (B79.0a). With RTB (#11) done, per-class TelemetryAggregator + per-class queue depth via `getQueueDepth()` are both available.

---

## CLOSED THIS SESSION (2026-05-27)

### B79.0n.RTB (#11) — CLOSED 2026-05-27

See block above. Closing commit `6fd6bcac6`.

---

## OPERATIONAL INVARIANTS (DO NOT FORGET)

- **CLAUDE.md §5 #19 CI per-batch confirmation MANDATORY** — never close a batch with red CI. `gh run list --branch migration/aws-supabase --limit 1`.
- **§10.5 alerts every turn** — SURFACE actionable alerts IN RESPONSE, not just verify log read.
- **§6.5.0 file-first dispatch** — SCP to `/home/langston/inbox/<batch>/`, NEVER /mnt/gdrive paths. Short pointer prompt + verbatim Telegram relay of reply.
- **§6.5.0.a embedded-diff dispatches** for Step 4 code reviews (no /mnt/gdrive cd, no git status on FUSE mount).
- **§7.1 code edits in C:\dev mirror ONLY** — governance docs in GDrive OK. Git pull from GDrive after each push.
- **§3.1 MEMORY 2-file pattern** — edit truth file FIRST, then copy to in-repo `.claude/memory/MEMORY.md` + commit/push same governance turn.
- **§3.2 MEMORY ≤200 lines** — `wc -l` after edit; prune before commit.
- **Plain-language summaries:** post to BOTH Telegram topic 21 AND Claude Desktop (Kyle directive 2026-05-25). TWO paragraphs default. No code/files/jargon to Kyle.
- **xStock 24/5 (NOT US RTH).** US market holidays pause cadence.
- **Langston canonical session UUID is bridge-locked.** Use fresh `uuidgen` for SSH-deliver. Always pass `--permission-mode bypassPermissions`.
- **Autonomy with Langston:** iterate to consensus per §6.7. Escalate to Kyle only on deadlock / architectural decisions / risk boundaries.
- **All-8-docs ACTUALLY edited at Step 10** per Kyle PATTERN-DETECT directive.
- **Phase 24 standing rule:** completion reports MUST include "Asset-class onboarding workflow learnings" 4-section block (a/b/c/d).
- **Per-step MEMORY truth-file update discipline** (Kyle directive 2026-05-27) — update MEMORY after every workflow step, not just batch close. Survives mid-batch compaction.
- **4-phase migration pattern** (B79.0n.RTB §4.20): Phase 1 nullable + seed → Phase 2 backfill dual-path → Phase 3 CHECK + index → Phase 4 SET NOT NULL contingent. Standalone CLI scripts MUST have `import 'dotenv/config'` at top.
- **LOCKED-module override pattern** (B79.0n.RTB §4.21): umbrella-row-authorized + scope-bounded (IN/OUT enumerated) + Langston-Step4-confirmed-no-drift + governance-documents-what-stayed-untouched.

---

## ACTIVE TASKS

#124 RTB Step 11 — in_progress (completion report drafted, MEMORY synced, awaiting 3-way sync + commit + push + close summary).
