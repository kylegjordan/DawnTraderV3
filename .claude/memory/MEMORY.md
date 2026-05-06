# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. This file = volatile state only. Keep under 200 lines.

---

## SESSION-START PROTOCOL (every new session / post-compact)

1. Read `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — comms protocol changed 2026-05-06).
2. Read this file.
3. Read `1-system-manual/POST_AUDIT_ROADMAP.md` for current phase.
4. **Receive messages from Kyle in this Claude Desktop conversation.** No Telegram polling on Kyle's behalf.
5. **For Kyle ↔ Langston traffic visibility,** tail the unified log when relevant: `ssh root@204.168.141.77 "tail /var/log/cc-bridge-inbox.jsonl"`. No 30s background polling chain.
6. Acknowledge readiness in one line. Don't dump context.

**Do NOT:** confabulate; skip SIM in pre-audit; wait on legacy-TS-baseline CI before deploying — Test+Build+Docker pass is enough.

---

## LANGSTON RUNTIME + COMMS (since 2026-05-06)

OpenClaw decommissioned. Two systemd bridges on Hetzner `204.168.141.77`:
- `langston-bridge.service` polls `@LangstonDTBot`, invokes `claude -p --session-id <UUID> --model claude-opus-4-7`. `[SILENT]` to skip Telegram post.
- `cc-comms-bridge.service` polls `@CCDTCommsBot`, provides `cc-comms-bridge send --thread-id N --message "..."` CLI for my outbound.

**Unified inbox log:** `/var/log/cc-bridge-inbox.jsonl`. Single tail-point.

**Send protocol:**
- Kyle ↔ main CC: this Claude Desktop conversation only. Telegram NOT used.
- Kyle → Langston: DM `@LangstonDTBot` or post in topic 21 (mention optional).
- main CC → Kyle (visibility): `ssh root@204.168.141.77 'cc-comms-bridge send --thread-id 21 --message "..."'`
- main CC → Langston: TWO STEPS. (a) `cc-comms-bridge send` for visibility, (b) `ssh ... claude -p --session-id <FRESH_UUID> --model claude-opus-4-7 "..."` for delivery (Telegram bot-to-bot is BLOCKED at platform level; canonical UUID often locked by bridge daemon — fresh UUID for one-offs is fine).
- Receiving: `tail /var/log/cc-bridge-inbox.jsonl`.

**Hetzner GDrive FUSE mount is BROKEN for recursive ops** (find / git-against-tree). When delivering review requests to Langston that reference repo files, **stage diffs/files at `/tmp/` via `scp` first** and tell him explicitly NOT to touch `/mnt/gdrive/` or run `git`. His Read tool against absolute `/tmp/` paths works fine. Discovered B76 Step-4: stuck git processes hung 30+ min in disk-wait.

**OAuth token:** `/etc/langston/oauth.env`, valid 1 year (issued 2026-05-06). Rotate by 2027-04 via `claude setup-token`. Cost ~$200/mo (Max sub) replacing ~$750/mo (OpenClaw+API).

**Full canonical reference:** project `CLAUDE.md` §6 + §8.

---

## CURRENT STATE — 2026-05-07 (post-B77)

- **Branch:** `migration/aws-supabase`
- **Most recent HEAD:** `ee7522b4d` (B77 ship). Earlier `65c17bfd3` (B76 closure), `235237ffd` (B76 Step-3 push), `f4e6a73f6` (B75).
- **Live:** B70 family + B72 family + B75 (data lifecycle/tiered storage) + B76 (chain-final calibration framework) + **B77 (`isBreakEvenTriggered` no-op fix, RUNNING_ISSUES #71 RESOLVED)**. 18/18 canonical strategies DB-tunable. 51 modules / ~332 rows in `module_constants` (no new module_constants in B76 or B77).
- **DB-only UPDATEs (no commits):** `b67_5_post_composition_floor=0.20`, `b68_5_path_b_momentum_min=0.001` (B75 close), `moonbag_qualifying_strategies=[]`, `break_even_enabled=false` (variant K). Trailing-after-target DISABLED.
- **DatabaseMonitor:** alarm NORMAL (5.2% / 200 GB plan cap).
- **Calibration framework version marker:** every new `regime_factor_alternates` row stamped `realDecision.metadata.calibrationFrameworkVersion = 'b76_chain_final'` post-B76 deploy.

---

## B76 — SHIPPED 2026-05-06 (chain-final calibration framework)

Closes RUNNING_ISSUES #54. Two-pass stash-then-build pattern in both orchestrator emit paths (signal-orchestrator + vts-runner). Each factor's fire point pushes a `FactorAlternateInput` discriminated-union record onto a stash; after final post-floor clamp on `_modulatedConfChain`, `buildAllAlternates(stash, chainFinal, regimeLabel)` dispatches to existing `buildXAlternate` helpers. `emitAblationRecord` now persists chain-final `realDecision.confidence`; raw classifier value preserved at `realDecision.metadata.predictiveConfidenceRaw`.

**Files:** `factor-ablation-emitter.ts` (+`CALIBRATION_FRAMEWORK_VERSION` const), NEW `factor-ablation-builders.ts` (~210 LOC dispatcher with TS exhaustiveness check), `regime-phase.ts` (+NEW `buildB67_2Alternate` extracted from inline blocks), `signal-orchestrator.ts` + `vts-runner.ts` restructured, `drift-dashboard-aggregator.ts` (removed two `factor_name NOT IN (...)` filters; `computeFactorCalibration` now version-filters b67_1_*/b67_2_* to chain-final cohort only), NEW `b76-chain-final-emit.test.ts`. Zero formula/weight/threshold change. No DB migration. No new module_constants.

**Pre-B76 vs post-B76 row distinction:** aggregator queries surfacing b67_1_*/b67_2_* now require the chain-final marker (Langston Step-1 §4 revision); other 7 factors don't need version filter (predictive lift cancels first-order bias).

**Langston review trail:** Step-1 scope APPROVED-WITH-REVISIONS (architecture two-pass dispatch + version-filter + TS const validated). Step-2 pre-audit + Step-4 code review combined APPROVED-WITH-REVISIONS — one blocker (.js ESM extensions on two new/modified files) fixed pre-push.

**Verify post-deploy:** SQL spot-check `SELECT factor_name, COUNT(*) FROM regime_factor_alternates WHERE real_decision->'metadata'->>'calibrationFrameworkVersion' = 'b76_chain_final' GROUP BY factor_name`. Within 24h, b67_1_*/b67_2_phase_preference rows should show non-zero shift (was 0 by construction pre-B76). Predictive lift on B68.1/.2/.3/B67.4 should preserve sign + stay within ±1pp of pre-B76.

---

## Sequencing after B77

1. **24-48h forward monitor on B76:** confirm b67_1_*/b67_2 accumulate non-zero shifts as macro modifier varies away from 1.0 fallback; B68.1/.2/.3/B67.4 lifts preserve sign + stay within ±1pp of pre-B76 anchors (b67_4 +2.95, b68_1 +5.71, b68_2 +4.13, b68_3 +4.13, b68_4 +2.94, b68_5 -1.78). If any flip → `git revert c8b8709ed 235237ffd` (hotfix first per Langston Step-8 correction).
2. Phase 16 (TS errors + storage.ts modularization).
3. B75.x deferrals (#K.5 partition ctx-bridge, #K.6 partition audit/walter, #K.7 B70 knob registry migration).
4. B67.5 consumer wiring opens 2026-05-15 (gated on calibration windows passing). B76 enables trustworthy lift measurement for the gating decision.

---

## RECURRING ANALYSIS RECIPE (trigger: "**run the calibration review**")

1. **Factor calibration table.** `GET /api/analytics/factor-calibration?window=rolling_7d` — 10-row factor table: avg/abs/max shift, n, %zero, REAL tertile WR (low/mid/high) + spread, ALT tertile WR + spread, **predictive lift** (REAL−ALT spread), status. Post-B76: b67_1_*/b67_2_phase_preference now filterable to chain-final cohort.
2. **Exit-strategy ablation table.** `GET /api/analytics/exit-strategy-ablation?window=rolling_7d` — 12-variant table sorted by Sharpe.
3. **Verify recent fixes:** b68_5 lift drift; trailing-after-target DISABLED (`exit_reason='TRAIL_hit'` near-zero); liquidity_trap exclusion; floor 0.20; B72 sync-read API healthy; **B76 marker** present on every new ablation row.
4. **Plain-language interpretation + recommendations** for B67.5 wiring (~2026-05-15).

---

## Calibration windows (active)

B67.4 cheap-tier ends 2026-05-15 · B68.2 volume regime ends 2026-05-16 · B68.3 pair correlation ends 2026-05-16 · B68.1 multi-TF ends 2026-05-17. Gate: tertile-monotonic WR, ≥7pp HIGH-LOW gap, p<0.05, n≥150/bucket. **B67.5 consumer wiring** post-2026-05-15 if B67.4 passes — now backed by trustworthy chain-final lift data thanks to B76.

---

## Recent batch history

| Batch | Date | Note |
|---|---|---|
| B70 family + B72 family | 2026-05-04 → -06 | Unified archive + 18/18 canonical strategies DB-tunable. Comms migration to CC Max bridges. |
| **B75 (Data Lifecycle / Tiered Storage)** | 2026-05-06 | CLOSED. Hot/warm/cold tiered. DatabaseMonitor alarm CRITICAL→NORMAL. Originally drafted as B73; renumbered after pre-audit grep. |
| **B76 (Chain-Final Calibration Framework)** | 2026-05-06 | CLOSED. Two-pass stash-then-build dispatch. Closes RUNNING_ISSUES #54. Enables trustworthy per-factor predictive lift before B67.5 wiring. |
| **B77 (`isBreakEvenTriggered` no-op fix)** | 2026-05-07 | CLOSED. Closes RUNNING_ISSUES #71. Threads `breakEvenTriggerR` 4th arg with default 1.0 (preserves pre-B77 behavior). Single live caller updated. Zero behavioral change at current settings (variant K keeps BE off). |

---

## Open RUNNING_ISSUES

- OPEN: #39 (CI TS legacy → Phase 16), #43/#49/#50/#53 (4 calibration windows), #46 (passive archive index)
- DEFERRED: #12e, #40, #44, #45, #52
- RESOLVED: #54 (B76), #55, #56–#59, #60–#69 (B75 + hotfixes), #70/#72 (B75 close), **#71 (B77)**, BUG-2026-05-05-E/F/G, BUG-2026-05-06-A

---

## Next session pickup priority

1. **24-48h B76 forward-monitor verify** (b67_1_*/b67_2 accumulating non-zero shifts; B68.x/B67.4 lifts within ±1pp of pre-B76 anchors).
2. **trading-engine.ts BUG-012 cleanup** (calculateGoalAlignmentScore duplicates pre-execution-validator's alignment block).
3. **Tier 2 governance housekeeping:** SIM per-source-file annotations across ~25 PROMOTE files.
4. **Phase 16** (TS errors + storage.ts modularization).

---

## Kyle Operating Directives (active)

- Don't pause to ask permission during workflow execution. Iterate with Langston through 11 steps.
- Visual UI verification via Claude-in-Chrome on every UI-touching batch.
- Deploy after Test+Build+Docker pass — don't wait on legacy TS Check baseline.
- **NO WORKAROUNDS.** Fix things properly. No new TypeScript errors.
- **No fallbacks for DB-governed settings.** Cold-start warmup paths are NOT fallbacks.
- Sensitive credentials → staging `.env` via SSH only. Never commit / paste in chat.
- **Post-mass-migration discipline:** `grep -rn "<OLD_CONST>" server/ --include="*.ts"` on every removed const before push. `tsc --noEmit` on touched files (or trust CI when local tsc unavailable).
- Iterate with Langston to consensus; escalate to Kyle only on deadlock / scope expansion / new directive.
- Kyle messages me here in Claude Desktop. Not via Telegram. CCDTCommsBot is for outbound visibility only.

---

## Session Behavior Invariants

- **New comms:** see CLAUDE.md §6.4–6.7. `cc-comms-bridge send` for outbound; SSH+`claude -p --session-id <FRESH_UUID>` for AI-to-AI delivery to Langston; tail `/var/log/cc-bridge-inbox.jsonl` for inbound. NO `openclaw`, NO `cc-inbox`.
- **Hetzner GDrive FUSE broken for recursive ops** — stage diffs/files at `/tmp/` via scp before delivering Langston review requests. Tell him explicitly NOT to touch `/mnt/gdrive/` or run `git`.
- VTS position sizing $1000 base → ~$150/trade. Intentional.
- GDrive npm install fails EBADF — CI is verification gate.
- CoinGecko Demo API key in staging `.env` (don't commit).

---

## Required pre-reads on session start

1. `DawnTraderV3/CLAUDE.md` (especially §6 + §8 — new comms)
2. This file
3. `1-system-manual/POST_AUDIT_ROADMAP.md`
4. `1-system-manual/CURRENT_SETTINGS_REGISTRY.md` — live DB-tunable settings
5. `Claude Comms and Packages/Batch Completion/BATCH_76_COMPLETION_REPORT.md` — most recent closure
6. `1-system-manual/SYSTEM_IMPACT_MAP.md` for any component touched in next batch
