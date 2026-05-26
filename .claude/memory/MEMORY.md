# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + ONE-paragraph default; §3.3 Phase-24 learning-capture; §5 #15 NO PATCHES + #16 permission-prompt + #19 CI per-batch confirmation; §6.5.0.a embedded-diff + no-gdrive dispatch; §7.1 mirror; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. **Telegram poll:** `ssh root@204.168.141.77 "tail -30 /var/log/cc-bridge-inbox.jsonl"`.
5. Plain-language summaries to Kyle: TWO paragraphs default, also post in Claude Desktop AND Telegram topic 21 (Kyle directive 2026-05-25).
6. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-26 evening — B79.0n.TELEMETRY (#10) FULLY CLOSED; 8 of 18 umbrella sub-batches done; RTB (#11) is next)

### 🟢 B79.0n.TELEMETRY (#10) — FULLY CLOSED 2026-05-26

**Closing commit:** `b746fa717` (governance + completion report). Code commit `12e451d` + test-fixture fix `02bad33`. Deploy `02bad33` PM2 #323 created 2026-05-26T18:01:48.682Z.
**CI:** run `26465795903` all-4-green on `02bad33`.
**Verify-gate alert:** `1f34cf84-a37c-425c-a1c4-54924b053061` triggers 2026-05-28T18:01:48Z.
**Completion report:** `Claude Comms and Packages/Batch Completion/B79_0n_TELEMETRY_COMPLETION_REPORT.md`.

**What landed:** completes the B79.0a per-asset-class TelemetryAggregator factory pattern across all 4 active classes. Previously crypto_spot (global singleton, no-touch fence) + xstock_spot (factory triad) were covered; xstock_perp + crypto_perp THREW. Now all 4 active classes covered. Variant C in-memory-only invariant for new instances (Langston AGREE Q1). `peekTelemetryInstance()` non-arming-read pattern codified for stats accessor. `assertNever` exhaustive-switch enforcement. 4 reserved-future classes throw `[CLASS_NOT_WIRED]`.

**Files:** 12 changed = 7 production + 5 new tests. +980 / -48 LOC net. NO DB migration, NO API extensions, NO SQL schema changes. crypto_spot 18mo+ disk-persist state untouched.

**Tests:** 28 NEW pass + 93 existing telemetry-related pass unchanged. 1 CI iteration (b79-0b test fixture update for new factory contract — promote-then-retire fixture-lag pattern from §4.15).

**Langston Step 1+2+4+8 ALL ACK GREEN.** 5 Q's at Step 1 → AGREE. 2 clarifications at Step 2 (C1 cold-boot crypto_spot row source='global-singleton' + C2 isolation BOTH directions test) folded inline as code comments. Step 4 code review clean with 4 quality observations (none blockers). Step 8 second-pass independently verified — boot logs at 18:01:53Z + HTTP 200 in 15.9ms + zero error-log matches + crypto_spot no-touch fence held.

**Governance ALL 8 docs ACTUALLY edited:** BATCH_CATALOG / PHASE_HISTORY / SIM (new "Recent additions (B79.0n.TELEMETRY)" section) / SYSTEM_MANUAL §10.9 NEW / ASSET_CLASS_ONBOARDING_WORKFLOW §4.19 NEW / MULTI_ASSET_VTS_EXPANSION_PLAN / CHANGES_AND_FIXES CLOSURE-2026-05-26 / RUNNING_ISSUES #147 (TELEMETRY.b deferred) + #148 (MarketDataHealthCheck EACCES finding).

**Active-trading impact today:** ZERO. paper_sim_trades + trades both empty. The 3 new factory-managed instances stay at recordCount=0 by design until WIRE-IN (#16) threads per-class VTS writers. Crypto VTS writes continue landing on global singleton (HYPE/USD, LULU/USD, LMWR/USD, XRP/GBP post-restart).

### 🟢 VERIFY-GATE WATCHLIST

**3 active scheduled alerts:**
- `27da1fa0-11e5-4dda-af08-305b1969adde` — B79.0n.SCORING + TEC +24h at 2026-05-27 02:47 UTC (PICK_FALLBACK + SQE_STATIC_MIRROR counter check; expect 0)
- `cbe84d5b-73a6-4ed7-9009-447b37ecec04` — B79.0n.SCORING + TEC +48h at 2026-05-28 02:47 UTC (final gate; greenlight TEC.b; SCORING.b may re-scope to sub-batch 18)
- `1f34cf84-a37c-425c-a1c4-54924b053061` — B79.0n.TELEMETRY +48h at 2026-05-28 18:01:48Z (perp recordCount=0 invariant)

**§10.5 protocol:** every turn `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`. When state=active AND acknowledged_at=null AND triggers_at <= NOW(): surface IN RESPONSE to Kyle. ACK via `npm run system-alerts -- ack <id> --by cc-session-2026-05-26` after probe.

### .b follow-ups queued (RUNNING_ISSUES)

- **#141 B79.0n.TEC.b:** strict 11-key HARD-FAIL restoration via `requireKey<T>` — 7d SLA after 48h gate close
- **#142 B79.0n.SCORING.b:** EXISTS-gated wildcard retirement + F-1 resolver hooks — Kyle flagged for re-scoping into sub-batch 18 (weak observability in VTS-shadow)
- **#147 B79.0n.TELEMETRY.b:** per-class disk persistence for non-crypto_spot instances — no SLA today (no perp class persists yet)
- **#148 (Tier-3 polish):** MarketDataHealthCheck EACCES on `/home/runner` path — unrelated finding

---

## REMAINING UMBRELLA V4 SUB-BATCHES (10 of 18 left)

| # | Name | Status | Dependencies |
|---|---|---|---|
| 11 | RTB | 🟡 NEXT — unblocked by TELEMETRY | TELEMETRY ✅ |
| 12 | RTB-REFRESH | pending | RTB |
| 13 | POOL | pending | RTB |
| 14 | ORCHESTRATOR | pending | RTB + POOL |
| 15 | EXECUTION | pending | ORCHESTRATOR |
| 16 | WIRE-IN | pending | EXECUTION + TELEMETRY |
| 17 | ML-CALIBRATION (T2) | pending | WIRE-IN |
| 18 | OBSERVABILITY (T2) + active-trading flip | pending | all above |

**RTB (#11) per umbrella v4:** Adaptive Ratio Manager consumes telemetry per-class. ARM constructor already takes injected telemetry (B79.0a). With TELEMETRY (#10) done, all 4 active classes now have per-class TelemetryAggregator instances available via `getAssetClassInstances(assetClass).ratioManager` for RTB to consume.

---

## CLOSED THIS SESSION (2026-05-26)

### B79.0n.SCORING (#8) + B79.0n.TEC (#9) — CLOSED 2026-05-26 morning

Deploy chain: `ceeaa15c6` → `29bfda74f` (R-5 hotfix) → `b458588e5` → `33bcb5e99` (governance) → `a4a466fb9` (MEMORY).
- TEC: 3 migrations (40 rows per-class seed + EXISTS-gated retire + idempotent A.2 backfill); HARD-FAIL 1→11 keys softened to `pick()` + `_tecPickFallbackCount` counter (7 test fixtures broke under strict throw; .b restores)
- SCORING: 8 rows migration (4 perp + 4 crypto_spot promotion); `getPredictiveConfidence(assetClass, symbol, regime, strategy)` F-2 fix; `getSQEStaticMirrorFallbackStats()` accessor
- 5-round CI iteration codified patterns 4.15-4.18 in onboarding workflow

### B79.0n.TELEMETRY (#10) — CLOSED 2026-05-26 evening (this session)

See block above. Closing commit b746fa717.

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
- **Promote-then-retire fixture-lag pattern** (codified §4.15): when a batch changes a contract that existing test fixtures assert, update the fixtures in the SAME CI iteration. Surfaced again on TELEMETRY at b79-0b.

---

## ACTIVE TASKS

#113 TELEMETRY Steps 4-11 — in_progress (Step 11 dispatched to Langston, awaiting ACK + 3-way MEMORY sync).
