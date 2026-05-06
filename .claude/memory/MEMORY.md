# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — comms protocol changed 2026-05-06).
2. Read this file.
3. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for current phase + B73.
4. **Receive messages from Kyle in this Claude Desktop conversation.** No Telegram polling on Kyle's behalf.
5. **For Kyle ↔ Langston traffic visibility,** tail the unified log when relevant: `ssh root@204.168.141.77 "tail /var/log/cc-bridge-inbox.jsonl"`. No 30s background polling chain anymore.
6. Acknowledge readiness in one line. Don't dump context.

**Do NOT:** confabulate; skip SIM in pre-audit; wait on legacy-TS-baseline CI before deploying — Test+Build+Docker pass is enough.

---

## LANGSTON RUNTIME + COMMS — migrated 2026-05-06

**Both Langston and the CC↔Kyle relay run on custom Python bridges, not OpenClaw.** OpenClaw fully decommissioned (both Telegram accounts disabled in config; gateway idle).

**Two systemd services on Hetzner `204.168.141.77`:**
- `langston-bridge.service` — `/usr/local/bin/langston-bridge.py`. Long-polls `@LangstonDTBot`. Invokes `claude -p --session-id <UUID> --model claude-opus-4-7` per inbound. Posts replies. **No @-mention required in topic 21** — Langston judges per his CLAUDE.md §11; outputs `[SILENT]` to skip Telegram post when not his to answer. Mirrors all in/out/silent to shared log.
- `cc-comms-bridge.service` — `/usr/local/bin/cc-comms-bridge`. Long-polls `@CCDTCommsBot`. Writes inbound to shared log. Provides `cc-comms-bridge send --thread-id N --message "..."` CLI for main CC's outbound. Mirrors my outbound to same log.

**Unified inbox log:** `/var/log/cc-bridge-inbox.jsonl`. Single tail-point. JSON entries with `kind` ∈ {direct inbound from cc-comms-bridge poll, `langston_inbound`, `langston_outbound`, `langston_silent`, `cc_outbound`}.

**Send protocol:**
- Kyle ↔ main CC: this Claude Desktop conversation only. Telegram NOT used.
- Kyle → Langston: DM `@LangstonDTBot` or post in topic 21 (mention optional). Auto-handled.
- main CC → Kyle (visibility): `ssh root@204.168.141.77 'cc-comms-bridge send --thread-id 21 --message "..."'`
- main CC → Langston: TWO STEPS. (a) `cc-comms-bridge send` for visibility, (b) `ssh ... claude -p --session-id <UUID> --model claude-opus-4-7 "..."` for delivery (Telegram bot-to-bot is BLOCKED at platform level). Then post Langston's stdout reply via `@LangstonDTBot`'s `sendMessage` for Kyle's visibility.
- Receiving: `tail /var/log/cc-bridge-inbox.jsonl` (one-shot) or `tail -F` (streaming).

**Model:** Opus 4.7, 1M context (auto-upgraded by Max plan; verified via SDK `modelUsage.contextWindow`). Bridge passes `--model claude-opus-4-7`.

**Cost:** $200/mo Max sub replaces ~$750/mo OpenClaw+API. Savings ~$550/mo.

**Bot-to-bot block (Telegram platform rule):** `@CCDTCommsBot` cannot see `@LangstonDTBot` messages and vice versa. Workaround: bridges mirror to shared log so each AI has visibility via filesystem.

**OAuth token:** `/etc/langston/oauth.env`, valid 1 year (issued 2026-05-06). Rotate by 2027-04 via `claude setup-token` from Kyle's laptop.

**Full canonical reference:** project `CLAUDE.md` §6 (send/receive) + §8 (operations + diagnostic runbook).

---

## CURRENT STATE — 2026-05-06

- **Branch:** `migration/aws-supabase`
- **Most recent HEAD:** `f4e6a73f6` (B75 Step 3 ship). PM2 #172.
- **Live:** B70 family + B72 family + **B75 Data Lifecycle (tiered storage)**. 18/18 canonical strategies DB-tunable. 49 + 2 = 51 modules / ~332 rows in `module_constants`.
- **DB-only UPDATEs (no commits):** `b67_5_post_composition_floor=0.20`, **`b68_5_path_b_momentum_min=0.001`** (lowered 0.002→0.001 per B75 close Langston consensus), `moonbag_qualifying_strategies=[]`. Path B gate: `(absDbs ≥ 0.30 && mom > 0.001)`. Trailing-after-target DISABLED. **`break_even_enabled=false`** (post-B75 variant K — disable BE-stop per Exit Strategy Ablation 7d window: variant K Sharpe 2.13 vs current J at 0.39, ~+98 P&L%/week; required code change `d6d2430ce` because existing `break_even_trigger_r` constant was a no-op since B65.1, then DB UPDATE).
- **DatabaseMonitor:** alarm CRITICAL→NORMAL (5.2% of 200 GB plan cap, was 88.7% of stale 10 GiB).
- **B75 sweep verified end-to-end 2026-05-06:** 1,548,341 rows archived (1 cold + 3 warm), 1.16 GB recovered, all 4 manifest rows active. Cold-tier auto-fallback fired correctly on Dec 99 MB archive.

---

## B72 family — fully closed 2026-05-06

- **B72 main** (commits `924a7c18`–`45eb1c0d`): sync-read API + 9 file-based strategies migrated to module_constants.
- **B72.1** (`31f4b873` + `c6ff5ad9`): 5 carry-over modules wired (adaptive_weights, concentration_risk, guardrail_defaults, goal_alignment, strategy_profiles).
- **B72.2** (`eeabb7147` + `6c42dc370` + `e00e86619`): 9 in-class quant strategies (`vwap_pullback`, `abcd_long`, `sma_trend_ride`, `breakout`, `mean_reversion`, `range_trade`, `vwap_bounce`, `liquidity_trap`, `dhma`) — 131 rows seeded; dispatcher param literals stripped; 5 vts-vs-orchestrator discrepancies collapsed. **`vwap_pullback` is the highest-volume strategy (26.5k evals/7d).**

**Audit-process bug** logged as `BUG-2026-05-06-A`: filesystem-grep audits miss in-class methods. Strategy enumeration must use `STRATEGY_DISPLAY_NAMES` SSOT + class-wide grep. Audit conclusions contradicting production telemetry trigger re-audit. Kyle's pushback caught this.

Completion reports: `BATCH_72_COMPLETION_REPORT.md` (with §L correcting the wrong B72.1 §K.3) + `BATCH_72_2_COMPLETION_REPORT.md`.

---

## B75 — SHIPPED 2026-05-06 (data lifecycle / tiered storage)

> **Renumber note:** Originally drafted as B73. Step 2 pre-audit grep found B73 was already shipped 2026-04-29 (Exit-Strategy Ablation Framework + B73.1/.2/.3 + 5 source files). Kyle confirmed renumber to B75. Original B73 scope file restored.

**Architecture (Kyle directive: "we don't ever drop data"):** tiered hot/warm/cold. HOT=Supabase disk (30d ticker / 365d OHLC / 14d ctx-bridge). WARM=Supabase Storage JSONL.gz (~6× cheaper, sec latency, 365d retention). COLD=Backblaze B2 JSONL.gz (~125× cheaper, indefinite, never deleted). 5y full-fidelity B74 in cold ≈ $2.55/mo. Move-not-delete at every boundary.

**Live:** PM2 #172, HEAD `f4e6a73f6`. 12 files / 2,653 LOC. Migration applied: 18 `data_lifecycle` rows + 3 `database_monitor` rows + 0 manifest rows. **DatabaseMonitor alarm CRITICAL→NORMAL** (5.2% / 200 GB plan cap). All 3 sweeps + rehydrate CLI + cold rotator deployed (cold rotator stays dry-run until B2 creds land).

**Manifest seam:** `data_archive_manifest` table with state machine (pending→uploaded→verified→active→migrating→migrated), UNIQUE(source_table, partition_label, tier) supporting warm+cold coexistence. Future ML/analytics rehydration schedulers query manifest once instead of needing to know storage layout. CLI `b75-rehydrate.ts --table X --from D1 --to D2 --out PATH [--restore-cold]`.

**Pending Kyle external (non-blocking):**
1. `SUPABASE_SERVICE_ROLE_KEY` to staging .env — needed for sweeps to run. Source: `https://supabase.com/dashboard/project/vqqyisaudwenrdhnmjwt/settings/api` (service_role, NOT anon).
2. Backblaze B2 account + 4 env vars (B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET, B2_ENDPOINT) + flip `data_lifecycle.cold_rotator_dry_run=false`. Cold rotator stays dry-run until.

**B75.x deferrals (logged):** keyset pagination (LIMIT/OFFSET acceptable for first sweeps; becomes O(N²) hot for B74 ticker partitions ~10M rows expected late June); multipart upload for >45MB warm objects; partition `context_bridge_log` (B75.1); partition `execution_attempt_audit` + `walter_memory` (B75.2); Phase 2 cold-rotator wiring; B70 `b70_postgres_retention_days` migration into `data_lifecycle` registry.

**Bridge architecture validated end-to-end** in this batch (Langston Steps 1 rev1+rev2, 2, 4 all completed via SSH+claude-cli delivery). SDK session-lock contention discovered: when bridge daemon polls Telegram, the canonical session UUID is locked; SSH delivery must either (a) stop bridge first, OR (b) use fresh UUID for one-off delivery. Bridge restart resumes Kyle↔Langston Telegram on canonical UUID without context loss. Documented in CLAUDE.md §8.2.

**Sequencing after B75:**
1. **B76 — Calibration aggregator framework refactor** (RUNNING_ISSUES #54, Langston consensus). Must land BEFORE B67.5 wiring (~2026-05-15). 1-2 day focused batch. Refactor `emitAblationRecord` to take chain-final values across all 10 buildXAlternate helpers so per-factor predictive lift becomes trustworthy on first chain modulator (b67_2_phase_preference shows +0.0pp lift today purely due to measurement bug).
2. **K.1 — Disable BE-stop** (per B75 close exit-ablation finding: variant K Sharpe 2.13 vs current J Sharpe 0.39, ~+98 P&L%/week extrapolated). Likely Kyle-driven separate batch.
3. Phase 16 (TS errors + storage.ts modularization).
4. B75.x deferrals (#K.5 partition ctx-bridge, #K.6 partition audit/walter, #K.7 B70 knob registry migration) — interleave when triggered.

**B75 close pending external Kyle action: RESOLVED 2026-05-06.** Kyle bumped Supabase project Storage Global file size limit to 5 GB. Future archives will land in warm tier consistently (cold-fallback path remains for >5 GB or B2 native ≤5 GB).

---

## RECURRING ANALYSIS RECIPE (trigger: "**run the calibration review**")

End-to-end without re-asking what:

1. **Factor calibration table.** `GET /api/analytics/factor-calibration?window=rolling_7d` — render 10-row factor table: avg/abs/max shift, n, %zero, REAL tertile WR (low/mid/high) + spread, ALT tertile WR + spread, **predictive lift** (REAL−ALT spread), status.
2. **Exit-strategy ablation table.** `GET /api/analytics/exit-strategy-ablation?window=rolling_7d` — render 12-variant table (id, name, n, mean P&L %, Δ vs A, Sharpe, WR%, avg duration, exit-reason breakdown). Highlight A. Sort by Sharpe desc.
3. **Verify recent fixes:**
   - **b68_5 path_b_sustainability:** lift drifting from -2.0pp toward 0+ (post-B70.3 momentum gate). If still ≤ -1.0pp, fix isn't taking.
   - **Trailing-after-target DISABLED:** `exit_reason='TRAIL_hit'` near-zero in last-24h `exit_decision_archive`. If trailing variants still accumulating, `moonbag_qualifying_strategies=[]` override has been reverted somewhere.
   - **liquidity_trap exclusion:** `strategy_disabled_bearish` reject reason ABSENT from recent strategy_internal nullReasons (was 7,342×/24h pre-B70.3).
   - **Post-composition floor 0.20:** newer `signal_eval_archive` admit rows show `regimeConfidenceModulated` distributed below 0.45.
   - **B72 sync-read API healthy:** `[B72][INIT_OK] (pre-orchestrator)`. No `module_constants ... not warm`. All prefetched modules warm clean.
4. **Plain-language interpretation:** which factors decision-grade vs inert vs hurting; which exit variant data favors; whether each fix is working as designed.
5. **Recommendations** for any factor needing intervention before B67.5 wires (~2026-05-15).

---

## Calibration windows (active)

B67.4 cheap-tier ends 2026-05-15 · B68.2 volume regime ends 2026-05-16 · B68.3 pair correlation ends 2026-05-16 · B68.1 multi-TF ends 2026-05-17. Gate: tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket. **B67.5 consumer wiring** post-2026-05-15 if B67.4 passes.

---

## Recent batch history

| Batch | Date | Note |
|---|---|---|
| B67.4 / B68.2 / B68.3 / B67.5-prep / B68.1 | 2026-05-01 → -03 | Confidence chain (7 modulators) closed observational |
| B69 + B69.1/2/3 + B73.3 | 2026-05-03 → -04 | Asset class + UI + calibration viz fixes |
| B70 + B70.1/.2/.3/.3b | 2026-05-04 → -05 | Unified archive + Path B momentum gate + floor drop |
| **B72 + B72.1 + B72.2** | 2026-05-05/06 | CLOSED. 18/18 canonical strategies DB-tunable. 49 modules / ~311 rows |
| **Comms migration (Langston OpenClaw → CC Max)** | 2026-05-06 | Custom Python bridges replace OpenClaw. ~$550/mo savings. New send protocol per CLAUDE.md §6. |
| **B75 (Data Lifecycle / Tiered Storage)** | 2026-05-06 | CLOSED. Hot/warm/cold tiered architecture per Kyle's "never drop data" directive. DatabaseMonitor alarm CRITICAL→NORMAL. Originally drafted as B73; renumbered after pre-audit found B73 was already shipped 2026-04-29. |

---

## Open RUNNING_ISSUES

- OPEN: #39 (CI TS legacy → Phase 16), #43/#49/#50/#53 (4 calibration windows), #46 (passive archive index)
- DEFERRED: #12e, #40, #44, #45, #52, #54
- RESOLVED: #55, #56–#59, BUG-2026-05-05-E/F/G (B72 hotfixes), BUG-2026-05-06-A (B72 audit-process gap)

---

## Next session pickup priority

1. **B73 — data lifecycle / storage cost batch** (scope above). Live test of new comms architecture.
2. **trading-engine.ts BUG-012 cleanup:** `calculateGoalAlignmentScore` (L130–209) duplicates pre-execution-validator's alignment block. Pre-existing, separate batch.
3. **Tier 2 governance housekeeping:** SIM per-source-file annotations across ~25 PROMOTE files. No runtime impact.
4. **Phase 16** (TS errors + storage.ts modularization) per POST_AUDIT_ROADMAP — post-B73.

---

## Kyle Operating Directives (active)

- Don't pause to ask permission during workflow execution. Iterate with Langston through 11 steps.
- Visual UI verification via Claude-in-Chrome on every UI-touching batch.
- Deploy after Test+Build+Docker pass — don't wait on legacy TS Check baseline.
- **NO WORKAROUNDS.** Fix things properly. No new TypeScript errors.
- **No fallbacks for DB-governed settings.** Cold-start warmup paths are NOT fallbacks.
- Sensitive credentials → staging `.env` via SSH only. Never commit / paste in chat.
- **Post-mass-migration discipline:** `grep -rn "<OLD_CONST>" server/ --include="*.ts"` on every removed const before push. `tsc --noEmit` on touched files.
- Iterate with Langston to consensus; escalate to Kyle only on deadlock / scope expansion / new directive.
- **Kyle messages me here in Claude Desktop.** Not via Telegram. CCDTCommsBot is for outbound visibility only.

---

## Session Behavior Invariants

- **New comms:** see CLAUDE.md §6.4–6.7. `cc-comms-bridge send` for outbound; SSH+`claude -p --session-id <UUID>` for AI-to-AI delivery to Langston; tail `/var/log/cc-bridge-inbox.jsonl` for inbound. NO `openclaw`, NO `cc-inbox`, NO `--deliver`.
- VTS position sizing $1000 base → ~$150/trade. Intentional.
- GDrive npm install fails EBADF — CI is verification gate.
- CoinGecko Demo API key in staging `.env` (don't commit).

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — new comms)
2. This file
3. `1-system-manual/POST_AUDIT_ROADMAP.md` — phase + B73
4. `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` — live DB-tunable settings
5. `Claude Comms and Packages/Batch Completion/BATCH_72_2_COMPLETION_REPORT.md` — most recent closure
6. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
