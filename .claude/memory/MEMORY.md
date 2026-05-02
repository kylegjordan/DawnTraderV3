# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## ⭐ SESSION-START PROTOCOL — DO THIS IMMEDIATELY EVERY NEW SESSION / POST-COMPACT

1. **Read `DawnTraderV3/CLAUDE.md`** end-to-end. Lock in: 11-step workflow (§2), governance tiers (§3 + 200-line MEMORY cap + 2-file MEMORY pattern), critical rules (§5 — incl. rule #14 KNOWN_NONEXISTENT_NAMES registry practice), Three-way comms protocol (§6 — two-step canonical: CC `--account ccdt-relay --thread-id 21`; brain `agent --deliver --reply-account default`; if relay session stale → archive-rename per §8.1), SIM discipline (§9). DO NOT ASK Kyle to remind me.
2. **Read this file (`MEMORY.md`)** for volatile state.
3. **⭐ Read the master regime overhaul plan** at `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` — sections §0, §0.10, §0.11 (esp. **§0.11.B for the B68.1 Multi-TF agreement entry** — that's the next batch), §0.12.
4. **⭐ Read `1-system-manual/POST_AUDIT_ROADMAP.md`** Phase 15c sequencing — focus on the B68.1 multi-TF entry (the active queued batch).
5. **Read latest batch closure** in `Claude Comms and Packages/Batch Completion/BATCH_67_PROGRESS_REPORT.md` — has the B67 implementation-track close-out (2026-05-03) listing all sub-deliverables shipped + B67.5 consumer-wiring spec preview.
6. **Start the silent polling chain** for Langston: `ssh root@204.168.141.77 "sleep 30 && cc-poll-once"` with `run_in_background: true`. Relaunch silently each wake.
7. **Acknowledge readiness to Kyle in one line.** Don't dump context.

**Do NOT** announce polling status. Do NOT confabulate — read the file. Do NOT skip SIM consultation in any pre-audit.

---

## ⭐ B67 IMPLEMENTATION TRACK CLOSED 2026-05-03 — CALIBRATION WINDOWS RUNNING

**B67 implementation closed.** All 8 foundation sub-deliverables LIVE on PM2 #130: B67.0 (ablation framework) / B67.0.1 (join fix) / B67.1 (macro modifier) / B67.2 (phase) / B67.2.1 (trade-record persistence + UI) / B67.3 (per-underlying cap, shadow) / B67.3.5 (TFS desat + phase backfill) / B67.4 (cheap-tier bundle: outcome feedback + regime-age + Path B sustainability) / B67.5-prep (post-composition floor 0.45 module_constant).

**Only remaining B67 piece:** B67.5 consumer wiring (7 consumers + RegimeWeight deletion). **Gated on calibration check 2026-05-15** (B67.4 14d window end; needs tertile-monotonic WR + ≥7pp HIGH-LOW gap + p<0.05 + n≥150/bucket per Langston cc-inbox #856). When calibration passes, B67.5 ships as own batch + finalizes B67 closure.

**Three calibration windows running in parallel** per master plan §0.11.C step 5 (framework attributes per-factor independently — single chain instrumented for 9 factor types):

| Window | Day | Ends | Factor types observed |
|---|---|---|---|
| B67.4 | 2 of 14 | 2026-05-15 | 7 (b67_1_btc_dom / funding / mcap + b67_2_phase + b67_4_outcome + b68_4_age + b68_5_pathB) |
| B68.2 | 1 of 14 | 2026-05-16 | b68_2_volume_regime |
| B68.3 | 1 of 14 | 2026-05-16 | b68_3_pair_correlation |

**Modulation chain (post-B67.5-prep):** `raw × macro × phase × freshness × outcome × volume_regime × pair_correlation → clamp [b67_5_post_composition_floor (0.45), 1.0]`. 6 chain modulators. After B68.1 = 7 modulators.

---

## Current State (2026-05-03 — B67.5-prep SHIPPED, PM2 #130)

- **Branch:** `migration/aws-supabase`
- **HEAD commit:** `5c372d6a` (B67.5-prep governance — RUNNING_ISSUES #51 RESOLVED)
- **Implementation HEAD:** `1d25cb7c` (B67.5-prep — post-composition floor module_constant 0.45)
- **Supabase:** Compute upgraded Nano → **Micro** today (1 GB memory, 2-core ARM CPU, ~87 Mbps baseline IO). Free upgrade — already paying for Micro. Triggered by Disk IO Budget alert from compounding write load (B74 archivers + 9 ablation factors per signal eval). Backend reconnect post-upgrade clean; all 9 factors still emitting.
- **Live state:** B67.5-prep + B68.3 + B68.2 + B67.4 + all foundation. B74 archivers + B73 replay still running. RUNNING_ISSUES #51 (B67.5 floor decision URGENT) RESOLVED.

---

## ⭐ ACTIVE NEXT BATCH — B68.1 Multi-Timeframe Agreement

**This is the next batch.** B67.5 consumer wiring is gated on calibration; B68.1 is the active implementation work.

**Read before starting B68.1:**
1. **Master plan §0.11.B** in `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` — has the B68.1 design line: *"Multi-timeframe agreement | 1h regime confirming 1m signals. Higher-TF OHLC pipeline. ~2 weeks. Own batch. Needs new higher-TF OHLC data path — real new infrastructure, heaviest of the three."*
2. **POST_AUDIT_ROADMAP.md** Phase 15c — for surrounding sequencing.
3. The B68.2 + B68.3 scope/pre-audit files (`BATCH_68_2_*` and `BATCH_68_3_*`) for the established chain-factor architectural pattern that B68.1 should mirror.

**B68.1 scope at-a-glance** (to be formalized in `BATCH_68_1_SCOPE.md` at Step 1):
- Adds **higher-TF (1h) regime classification** as confirmation gate on 1m-derived signals.
- Reuses B74's 1-min crypto OHLC archive — aggregate to 1h via SQL or in-process rollup.
- Per-pair higher-TF regime computed once per cycle (not per signal eval — performance critical at 110+ pairs).
- New chain factor `b68_1_multi_tf_agreement` with score derived from `agreement(1m_regime, 1h_regime)` mapping.
- 7th and final B68.x chain modulator.
- ~2 weeks effort (heavier than B68.2/B68.3 because new infrastructure: higher-TF aggregation + caching).

**Workflow:** standard 11-step. Step 1 scope draft → Langston review → Step 2 pre-audit → Step 4 code review → push → CI → deploy → verify → governance → close.

---

## ⭐ Today's batches (2026-05-01 → 2026-05-03)

| Batch | Date | Commit | Status |
|---|---|---|---|
| B67.4 cheap-tier bundle (3 levers) | 2026-05-01 | `24c88702` + 3 hotfixes | LIVE PM2 #126 |
| B68.2 Volume Regime | 2026-05-02 | `50670465` | LIVE PM2 #128 |
| B68.3 Pair Correlation | 2026-05-02 | `98751a6c` + `0b9136b6` + `1cd79f04` | LIVE PM2 #129 |
| B67.5-prep (floor 0.40 → 0.45) | 2026-05-03 | `1d25cb7c` | LIVE PM2 #130 |

**Heartbeat infra fix 2026-05-01:** removed `agents.defaults.heartbeat` + `subagents` blocks from `/root/.openclaw/openclaw.json`. Was stamping gpt-4.1-mini onto Langston's session record on every async-exec-result NO_REPLY ack. Langston now stable on Opus 4.6 with correct cap.

**Supabase compute upgrade 2026-05-03:** Nano → Micro. Free (already billing). Direct response to Disk IO Budget alert.

Earlier work — see BATCH_CATALOG for B74/B74.1/B73/B73.1/B73.2 + B67.0 through B67.3.5.

---

## ⭐ Future implementations (post-B68.1)

1. **B67.4 calibration check 2026-05-15** — if passes, **B67.5 consumer wiring** kicks off (own batch, ~1 week). Wires confidence into 7 consumers + deletes RegimeWeight + handles deferred RUNNING_ISSUES #44 #45 (active-path emit hook + persist hook).
2. **B68.2 + B68.3 calibration checks 2026-05-16** — own per-factor analysis. Each may trigger v2 sensitivity tuning if data shows it.
3. **B69 ML-light** — deferred to end of pre-Phase-16. Trains on data accumulated by B67.x + B68.x.
4. **B72 lever sweep** — final pre-Phase-19 batch. Sweep all new constants from B67/B68/B69.
5. **B70 archival** — passive archive aging-off (eventually needed as B74 disk grows).
6. **B73 ongoing observation** — first variant winner declaration when n=200 total + n=50 per-regime.

---

## Open RUNNING_ISSUES (5 OPEN, 4 DEFERRED, 1 IN PROGRESS, 0 CRITICAL)

- **OPEN #39** CI TS Check legacy baseline (Phase 16 cleanup target).
- **OPEN #43 #49 #50** Three calibration window observations (B67.4 / B68.2 / B68.3, all running through 2026-05-15-16).
- **OPEN #46** Passive archive partition-aware index gap (count(*) queries 56s on Supabase). Lower priority post-Micro upgrade.
- **DEFERRED #12e #40 #44 #45** — all explicitly deferred to specific future batches. #44 + #45 fold into B67.5 consumer wiring.
- **IN PROGRESS #42** narration leak (moot per Kyle 2026-05-02 — all topics shut down except topic 21).

OpenClaw update 2026.4.14 → 2026.4.29 — **deferred** per Kyle 2026-05-02 (topic-routing fix moot since only topic 21 active; current state stable; revisit post-calibration windows).

---

## Kyle Operating Directives (active)

- **Don't pause to ask permission during workflow execution.** Iterate with Langston through all 11 steps until closed. Stop only for deadlocks, architectural decisions Kyle owns, or new directives.
- **Code-level explanations in plain language when asked.**
- **VTS broadness is the design.** Don't propose changes that narrow VTS admission.
- **NO WORKAROUNDS.** Fix things properly.
- **No new TypeScript errors.** Legacy errors → Phase 16. New code shouldn't add to count.
- **No fallbacks for DB-governed settings** (CLAUDE.md §11). Cold-start warmup paths are NOT fallbacks (legitimate runtime states with telemetry).
- **No shadow theater for B67.** Confidence is decorative pre-B67.5; ship live, ablation collects evidence.
- **DM channel for autonomous work:** Telegram chat ID `8734856533` (Kyle's direct), NOT batch-implementation group `-1003575211453` thread 21.

---

## Session Behavior Invariants

- **Iterate with Langston to consensus; don't escalate every response to Kyle.** CLAUDE.md §6.
- **Telegram 2-step canonical** (`--reply-account default` Step 2, NEVER `ccdt-relay`). /tmp file → scp → MSG=$(cat). Step 1 (CC speaks via @CCDTCommsBot): `openclaw message send --channel telegram --account ccdt-relay --target "-1003575211453" --thread-id 21 --message "$MSG"`. Step 2 (Langston replies via @LangstonDTBot): `openclaw agent --deliver --session-id 16b70816-c63d-4cf0-8c80-bebd9f2cf066 --message "$MSG" --reply-channel telegram --reply-account default --reply-to "-1003575211453"`.
- **Mini-batch streamlining:** for small surface batches (e.g., B67.5-prep), can combine Steps 1/2/4 into single Langston review. Standard 11-step otherwise.
- **VTS position sizing nominal $1000 base** producing ~$150/trade. Intentional — NOT a bug.
- **Langston brain session UUID:** `16b70816-c63d-4cf0-8c80-bebd9f2cf066` (topic-21, Opus 4.6).

---

## Required pre-reads on session start (in order)

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. **`Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0 / §0.10 / §0.11 (esp. §0.11.B for B68.1 multi-TF design)**
4. `1-system-manual/POST_AUDIT_ROADMAP.md` Phase 15c — B68.1 entry
5. `Claude Comms and Packages/Batch Completion/BATCH_67_PROGRESS_REPORT.md` — B67 implementation-track close-out section (2026-05-03)
6. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in B68.1 pre-audit
