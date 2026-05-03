# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## ⭐ SESSION-START PROTOCOL — DO THIS IMMEDIATELY EVERY NEW SESSION / POST-COMPACT

1. **Read `DawnTraderV3/CLAUDE.md`** end-to-end. Lock in: 11-step workflow (§2), governance tiers (§3 + 200-line MEMORY cap + 2-file MEMORY pattern), critical rules (§5 — incl. rule #14 KNOWN_NONEXISTENT_NAMES registry), Three-way comms protocol (§6 — two-step canonical: CC `--account ccdt-relay --thread-id 21`; brain `agent --deliver --reply-account default`; if relay session stale → archive-rename per §8.1), SIM discipline (§9), **Kyle preference: visual UI verification via Claude-in-Chrome for any UI-touching change** (§11). DO NOT ASK Kyle to remind me.
2. **Read this file (`MEMORY.md`)** for volatile state.
3. **Read `1-system-manual/POST_AUDIT_ROADMAP.md`** Phase 15c sequencing — focus on the calibration windows + B67.5 consumer wiring as the next active milestone.
4. **Read latest closure** in `Claude Comms and Packages/Batch Completion/BATCH_68_PROGRESS_REPORT.md` (B68.1 closure) and `BATCH_67_PROGRESS_REPORT.md` (B67 implementation-track close-out 2026-05-03).
5. **Start the silent polling chain** for Langston: `ssh root@204.168.141.77 "sleep 30 && cc-poll-once"` with `run_in_background: true`. Relaunch silently each wake.
6. **Acknowledge readiness to Kyle in one line.** Don't dump context.

**Do NOT** announce polling status. Do NOT confabulate — read the file. Do NOT skip SIM consultation in any pre-audit. Do NOT skip Claude-in-Chrome UI verification on UI-touching batches.

---

## ⭐ B68.x CHAIN MODULATOR SERIES COMPLETE 2026-05-03

**B68.1 SHIPPED 2026-05-03 — final B68.x modulator.** PM2 #135. Commit `cb861176`. The full 7-modulator confidence chain is now LIVE and emitting ablation data:

```
raw × macro × phase × freshness × outcome × volume_regime × pair_correlation
    × multi_tf_agreement → clamp [b67_5_post_composition_floor (0.45), 1.0]
```

**Visual UI verified** on staging Drift Dashboard tab — Factor Ablation Comparison panel shows all 10 factor types including `b68_1_multi_tf_agreement` (Total 18 / Replayed 0 / Pending 18). Replay cron runs nightly 04:00 UTC; Factor Calibration panel populates b68_1 tomorrow morning.

**Higher-TF source for B68.1:** Kraken native 240-min OHLC via existing `ohlcCache` (new cache key `${symbol}_240`). NOT B74's DB archive at runtime. Collapsed master plan's "~2 weeks; needs new infrastructure" estimate to ~1 day.

**Four calibration windows running in parallel:**

| Window | Day | Ends | Factor types observed |
|---|---|---|---|
| B67.4 | 2 of 14 | 2026-05-15 | 7 (b67_1×3 + b67_2_phase + b67_4_outcome + b68_4_age + b68_5_pathB) |
| B68.2 | 1 of 14 | 2026-05-16 | b68_2_volume_regime |
| B68.3 | 1 of 14 | 2026-05-16 | b68_3_pair_correlation |
| **B68.1** | **0 of 14** | **2026-05-17** | **b68_1_multi_tf_agreement** |

**B67 implementation track CLOSED 2026-05-03.** All 8 foundation sub-deliverables LIVE. Only remaining B67 piece: **B67.5 consumer wiring** — gated on B67.4 calibration check 2026-05-15 (needs tertile-monotonic WR + ≥7pp HIGH-LOW gap + p<0.05 + n≥150/bucket per Langston cc-inbox #856). When B67.4 calibration passes, B67.5 ships as own batch (~1 week) and finalizes B67 closure. Wires confidence into 7 consumers + deletes RegimeWeight + handles deferred RUNNING_ISSUES #44 #45.

---

## Current State (2026-05-03 post-B68.1, PM2 #135)

- **Branch:** `migration/aws-supabase`
- **Implementation HEAD:** `cb861176` (B68.1 — Multi-Timeframe Agreement, 7th and final B68.x modulator)
- **Supabase:** Compute on Micro tier (1 GB memory, 2-core ARM CPU). Upgraded 2026-05-03 from Nano. Stable.
- **Live state:** All 7 chain modulators emitting ablation data. B74 archivers + B73 replay still running. RUNNING_ISSUES #51 (B67.5 floor) RESOLVED.
- **Closed Trades** showing `conf 0.450` floor engagement on every recent trade — expected (7-modulator chain compounding correctly into the new floor).

---

## ⭐ Today's batches (2026-05-01 → 2026-05-03)

| Batch | Date | Commit | Status |
|---|---|---|---|
| B67.4 cheap-tier bundle (3 levers) | 2026-05-01 | `24c88702` + 3 hotfixes | LIVE PM2 #126 |
| B68.2 Volume Regime | 2026-05-02 | `50670465` | LIVE PM2 #128 |
| B68.3 Pair Correlation | 2026-05-02 | `98751a6c` + `0b9136b6` + `1cd79f04` | LIVE PM2 #129 |
| B67.5-prep (floor 0.40 → 0.45) | 2026-05-03 | `1d25cb7c` | LIVE PM2 #130 |
| **B68.1 Multi-TF Agreement** | **2026-05-03** | **`cb861176`** | **LIVE PM2 #135** |

**Heartbeat infra fix 2026-05-01:** removed `agents.defaults.heartbeat` + `subagents` blocks from `/root/.openclaw/openclaw.json`. Was stamping gpt-4.1-mini onto Langston's session record. Langston stable on Opus 4.6.

**Supabase compute upgrade 2026-05-03:** Nano → Micro. Free.

Earlier work — see BATCH_CATALOG for B74/B74.1/B73/B73.1/B73.2 + B67.0 through B67.3.5.

---

## ⭐ ACTIVE QUEUE — B69 + B70 in parallel with calibration windows

**Kyle directive 2026-05-03:** B69 and B70 are the next batches. **Run them in parallel with the 14d observation period** (windows close 2026-05-15 → 2026-05-17). After observation closes, B67.5 consumer wiring kicks off (gated on B67.4 calibration check pass).

**B69 — Asset class + standardized schema** (queued, no scope file yet):
- Add `assetClass` field across all trade/signal tables.
- Standardize displayed fields = captured fields = archived fields.
- Prerequisite for equity/FX expansion + asset-class-specific external data routing.

**B70 — Data archiving update** (queued, no scope file yet):
- Unified archiver across VTS/Paper/Live.
- Pair-level scan capture.
- Option B retroactive B62 re-labeling of Mar 6 – Apr 16 VTS data.

**Numbering note:** master plan §5.4 #8 ML-light is also informally referred to as "B69 ML-Lite" but BATCH_CATALOG B69 is the schema work above. ML-light needs renumbering when it ships (Kyle deferred to end of pre-Phase-16).

## ⭐ Following batches (sequential, post-observation)

1. **B67.5 consumer wiring** — gated on B67.4 calibration check ~2026-05-15. ~1 week. Wires confidence into 7 consumers + deletes RegimeWeight + handles deferred RUNNING_ISSUES #44/#45.
2. **External Data Tier-2 decision gate** — Kyle directive 2026-05-03: evaluate AFTER (a) 14d observation closes AND (b) B67.5 lands + chain operational. Original framing: exchange flows / liquidations / DXY / SPX cross-asset (~2-3 weeks if go). Tracked in BATCH_CATALOG as "External Data Tier-2" placeholder row.
3. **B72 — Comprehensive lever-to-module_constants sweep** — final pre-Phase-19 backstop sweep of 51 static + 18 adaptive levers from B63 Item 15 inventory.
4. **B69 ML-light** (renumbering needed) — deferred to end of pre-Phase-16 per Kyle directive.

## ⭐ B63 Item 13 — CLOSED 2026-05-03

Final decision (Kyle directive 2026-05-03): **KEEP `vwap_pullback` in strong-trend lane. NO dedicated pullback strategy will be created in the strong-trend family. Do not re-raise.** Closure rationale logged in BATCH_CATALOG. Original "Future TBD" re-evaluation slot retired.

---

## ⭐ Calibration milestones (running in parallel with B69/B70)

1. **B67.4 calibration check 2026-05-15** — if passes, B67.5 consumer wiring kicks off.
2. **B68.2 + B68.3 calibration checks 2026-05-16** — per-factor analysis. May trigger v2 sensitivity tuning.
3. **B68.1 calibration check 2026-05-17** — newest factor; per-factor monotonic-WR + lift analysis.
4. **External Data Tier-2 decision** post-B67.5 ship — evaluate go/no-go.
5. **B73 ongoing observation** — first variant winner declaration when n=200 total + n=50 per-regime.

---

## Open RUNNING_ISSUES (6 OPEN, 5 DEFERRED, 1 IN PROGRESS, 0 CRITICAL)

- **OPEN #39** CI TS Check legacy baseline (Phase 16 cleanup target). 664 errors stable.
- **OPEN #43 #49 #50 #53** Four calibration window observations (B67.4 / B68.2 / B68.3 / B68.1, all running through 2026-05-15-17).
- **OPEN #46** Passive archive partition-aware index gap (count(*) queries 56s on Supabase). Lower priority post-Micro upgrade.
- **DEFERRED #12e #40 #44 #45 #52** — explicitly deferred to specific future batches. #44 + #45 fold into B67.5 consumer wiring. #52 (OHLC-shape map duplication, 4 sites) is a small dedicated cleanup batch candidate.
- **IN PROGRESS #42** narration leak (moot per Kyle 2026-05-02 — all topics shut down except topic 21).

OpenClaw update 2026.4.14 → 2026.4.29 — **deferred** per Kyle 2026-05-02.

---

## Kyle Operating Directives (active)

- **Don't pause to ask permission during workflow execution.** Iterate with Langston through all 11 steps until closed. Stop only for deadlocks, architectural decisions Kyle owns, or new directives.
- **Visual UI verification via Claude-in-Chrome on every UI-touching batch.** Not optional. (CLAUDE.md §11 + Kyle reminder 2026-05-03.)
- **Code-level explanations in plain language when asked.**
- **VTS broadness is the design.** Don't propose changes that narrow VTS admission.
- **NO WORKAROUNDS.** Fix things properly.
- **No new TypeScript errors.** Legacy errors → Phase 16. New code shouldn't add to count.
- **No fallbacks for DB-governed settings** (CLAUDE.md §11). Cold-start warmup paths are NOT fallbacks (legitimate runtime states with telemetry).
- **No shadow theater for B67.** Confidence is decorative pre-B67.5; ship live, ablation collects evidence.
- **DM channel for autonomous work:** Telegram chat ID `8734856533` (Kyle's direct), NOT batch-implementation group thread 21.

---

## Session Behavior Invariants

- **Iterate with Langston to consensus; don't escalate every response to Kyle.** CLAUDE.md §6.
- **Telegram 2-step canonical** (`--reply-account default` Step 2, NEVER `ccdt-relay`). /tmp file → scp → MSG=$(cat). Step 1 (CC speaks via @CCDTCommsBot): `openclaw message send --channel telegram --account ccdt-relay --target "-1003575211453" --thread-id 21 --message "$MSG"`. Step 2 (Langston replies via @LangstonDTBot): `openclaw agent --deliver --session-id 16b70816-c63d-4cf0-8c80-bebd9f2cf066 --message "$MSG" --reply-channel telegram --reply-account default --reply-to "-1003575211453"`.
- **Mini-batch streamlining:** for small surface batches, can combine Steps 1/2/4 into single Langston review. Standard 11-step otherwise.
- **VTS position sizing nominal $1000 base** producing ~$150/trade. Intentional — NOT a bug.
- **Langston brain session UUID:** `16b70816-c63d-4cf0-8c80-bebd9f2cf066` (topic-21, Opus 4.6).
- **GDrive npm install fails with EBADF** on cold tree (tar throughput exceeds GDrive sync). CI is the verification gate. Workflow fix candidate: symlink node_modules to local SSD.

---

## Required pre-reads on session start (in order)

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `1-system-manual/POST_AUDIT_ROADMAP.md` Phase 15c (B67.5 milestone after B67.4 calibration check)
4. `Claude Comms and Packages/Batch Completion/BATCH_68_PROGRESS_REPORT.md` (B68.1 closure section)
5. `Claude Comms and Packages/Batch Completion/BATCH_67_PROGRESS_REPORT.md` (B67 close-out + B67.5 spec preview)
6. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in pre-audit
