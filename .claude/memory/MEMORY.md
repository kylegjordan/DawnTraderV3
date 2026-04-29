# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## ⭐ SESSION-START PROTOCOL — DO THIS IMMEDIATELY EVERY NEW SESSION / POST-COMPACT

1. **Read `DawnTraderV3/CLAUDE.md`** end-to-end. Lock in: 11-step workflow (§2), governance tiers (§3 + 200-line MEMORY cap + 2-file MEMORY pattern), critical rules (§5), Three-way comms protocol (§6 — **two-step canonical form** for Telegram + brain delivery: Step 1 sends CC's msg via `--account ccdt-relay`; Step 2 delivers to Langston's brain WITHOUT `--reply-account` so his reply uses `@LangstonDTBot` not `@CCDTCommsBot`. NEVER use `--reply-account ccdt-relay` on the agent --deliver call), SIM discipline (§9). DO NOT ASK Kyle to remind me of these — they are binding.
2. **Read this file (`MEMORY.md`)** for volatile state.
3. **Read `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md`** end-to-end (master regime overhaul plan, sections §0 + §0.10 + §0.11 + §0.12 are the resolved-decisions + reorganization + foundation work + open discussion items). If anything in §0.12 is stale relative to commits past `35b9de16`, update it.
4. **Start the silent polling chain** for Langston: `ssh root@204.168.141.77 "sleep 30 && cc-poll-once"` with `run_in_background: true`. Relaunch silently on every wake.
5. **Acknowledge readiness to Kyle in one line.** Don't dump context back at him.

**Do NOT** announce polling status. Do NOT confabulate about prior session details — read the file. Do NOT skip the SIM consultation in any pre-audit.

---

## ⭐ B67 CALIBRATION WINDOW STATUS

**Status:** NOT YET STARTED. All 6 pre-window fixes done. Only B67.4 cheap-tier bundle (step 7) remains.

**Window starts when:** B67.4 cheap-tier bundle (B67.4 outcome feedback + B68.4 regime-age first-class + B68.5 Path B sustainability tightening) ships AND post-deploy verification confirms all 5 factors emitting ablation rows correctly.

**Pre-window fix status:**
1. ✅ Lock window dates — placeholder updated each session
2. ✅ B67.2 phase transition log — verified working (false alarm, widened log window showed transitions firing)
3. ✅ Fallback removal — `cab55804` — all `??` config defaults throw; BTC/ETH funding weighting in `module_constants`; cold-start warmup fallback retained
4. ✅ B67.3 activation — `c1b314ad` + DB UPDATE — `pair_id_hash` persistence wired; cap actively gating cohort 0
5. ✅ B67.2.1 phase 1+2+3 — `141ec3c3` + `41abd541` + `575dbca4` — schema + active path + VTS path + UI (regime + conf + phase badge in same column) + CSV exports
6. ✅ Replay logic + cron — `3d1a1e7f` + `5e1031a6` + `33df2380` — VTS JSONL reader, signal-id pass-through fix, cron at 04:00 UTC
6.5 ✅ Persistence + dashboard cleanup — `8f417ca5` — `regimePhaseStore` and macro feed window persist to `/tmp/*.json`; legacy ablation rows hidden
6.6 ✅ B67.3.5 Pre-Window Hardening — `49209eb4` + `d97d47d7` — phase backfill from OHLC + TFS branch desat (continuous mapping [0.50, 0.90]). 5 module_constants. PM2 #114. First diversified macro modifier 0.85. Other 4 regime branches deferred (RUNNING_ISSUES #40).
7. ⏳ B67.4 cheap-tier bundle — NEXT

**Window dates:** Start TBD (after B67.4 ships). End = Start + 14 days. Day 0 of 14.

**Subsequent batches** (B68.2 → B68.3 → B68.1) get their own ~14d mini-windows. ML-light (B69) deferred to end of pre-Phase-16 batches.

---

## ⭐ Resolved 2026-04-29 evening — both items shipped in B67.3.5

Items 1 + 2 from the prior session's open-discussion list are RESOLVED in B67.3.5 (commits `49209eb4` + `d97d47d7`, PM2 #114). Phase backfill from OHLC + TFS branch desaturation. Other 4 regime branches deferred to post-window classifier-tuning batch (RUNNING_ISSUES #40).

---

## Current State (2026-04-29 evening post-B67.3.5, PM2 #114)

- **Branch:** `migration/aws-supabase`
- **HEAD commit:** `d97d47d7` (B67.3.5 CI fixes). Chain: `49209eb4` B67.3.5 impl → `d97d47d7` test fixture + regime-string CI fixes.
- **Live behavior on staging (PM2 #114):**
  - All B67.0/1/2/2.1/3 + replay logic + persistence + B67.3.5 LIVE
  - **First diversified macro modifier observed:** value=0.85 (clamped to min) with real z-scores BTC -0.79, funding +1.90 (very crowded longs), mcap +0.08
  - TFS branch using continuous formula `confidence = 0.50 + 0.40 × (mom_factor × dbs_strength × vol_inverse)` via 5 module_constants in regime_classifier module
  - Phase backfill ready to fire on cold pairs entering universe
  - All B67 contracts resolving cleanly (no missing-key errors)
- **Tomorrow ~6 UTC verification:** check (a) cron ran 04:00 UTC + replay populated rows; (b) backfill log lines on cold pairs (`[regime-phase][backfill] applied`); (c) TFS confidence raw distribution P10≤0.55, P50∈[0.60,0.80], P90≥0.80; (d) phase mix EARLY/PRIME/LATE; (e) new closed trades carry B67.2.1 fields.

---

## Kyle Operating Directives (active)

- **Don't pause to ask permission during workflow execution.** Iterate with Langston through all 11 phases until closed. Stop only for deadlocks, architectural decisions Kyle owns, or new directives.
- **Code-level explanations in plain language when asked.**
- **VTS broadness is the design.** Don't propose changes that narrow VTS admission.
- **NO WORKAROUNDS.** Fix things properly. Don't ship workarounds — they compound.
- **No new TypeScript errors.** Legacy errors go to Phase 16. New code should not add to the count.
- **No fallbacks for DB-governed settings** (CLAUDE.md §11). If it should come from the DB, fail hard if missing — don't silently use a default. Cold-start warmup paths are NOT fallbacks (legitimate runtime states with telemetry).
- **No shadow theater for B67.** Confidence is decorative pre-B67.5; ship live, ablation framework collects evidence.
- **DM channel for autonomous work:** Telegram chat ID `8734856533` (Kyle's direct), NOT the batch implementation group `-1003575211453` thread 21.

---

## Session Behavior Invariants

- **Iterate with Langston to consensus; don't escalate every response to Kyle.** CLAUDE.md §6.
- **Telegram 2-step canonical** (DO NOT use combined `--reply-account ccdt-relay` — it forces Langston's reply through CC's bot, collapsing identities). /tmp file → scp to 204.168.141.77 → MSG=$(cat). **Step 1** (CC speaks via @CCDTCommsBot): `openclaw message send --channel telegram --account ccdt-relay --target "-1003575211453" --thread-id 21 --message "$MSG"`. **Step 2** (Langston's reply via @LangstonDTBot — no `--reply-account` flag): `openclaw agent --deliver --session-id 16b70816-c63d-4cf0-8c80-bebd9f2cf066 --message "$MSG"`. Kyle prefers replies in Claude Code Desktop app unless explicitly asked for Telegram.
- **VTS position sizing nominal $1000 base** producing ~$150/trade. Intentional — NOT a bug.
- **Langston brain session UUID:** `16b70816-c63d-4cf0-8c80-bebd9f2cf066` (topic-21, Opus 4.6).

---

## Required pre-reads on session start (in order)

1. `DawnTraderV3/CLAUDE.md`
2. This file
3. `Claude Comms and Packages/Scope Files/REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0 + §0.10 + §0.11 + §0.12
4. `1-system-manual/POST_AUDIT_ROADMAP.md` Phase 15c sequencing (if mid-batch)
5. Latest batch completion / progress report in `Claude Comms and Packages/Batch Completion/` if mid-batch
6. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in current batch (B67.x foundation work section near the end)
