# DawnTrader V3 — Claude Code Memory (Volatile State)

> Stable workflow/governance/infrastructure live in `DawnTraderV3/CLAUDE.md`. Hard cap 200 lines.

---

## SESSION-START PROTOCOL

1. Read `DawnTraderV3/CLAUDE.md` (esp. §1 plain-language + two-paragraph default; §3.3 Phase-24 learning-capture; §5 #15 NO PATCHES + #16 permission-prompt fix; §6 Langston comms; §6.5.0.a embedded-diff + no-gdrive dispatch pattern; §10.5 alerts).
2. Read this file.
3. **§10.5 alerts check (every turn):** `ssh root@188.245.193.8 "tail -50 /var/log/dawntrader/system-alerts.jsonl"`.
4. Kyle in Claude Desktop. Telegram = Langston verbatim relay + visibility. Summaries TO KYLE go in THIS session (not Telegram-only); Langston-verbatim relays to Telegram STILL mandatory per §6.5 step 3.
5. Acknowledge readiness in one line.

---

## CURRENT STATE (2026-05-22 — B79.0n.MCE Steps 1-5 DONE, deploy gated to 12:00Z today; B-NEW-43 Step 2 pre-audit DONE + Langston ACK)

### B79.0n.MCE — sub-batch 4 of 18 (umbrella v4). Steps 1-5 closed; Steps 6-11 remain.

**Pushed, NOT yet deployed:** commits `c69320545` (Step 3-4 impl, 37 files) + `713fd7ae2` (Step 5 fix-forward).

**What it does:** removes the silent `assetClass='crypto_spot'` default from 3 MCE surface APIs — `calculatePairRegime`, `MCE.computeContext`, and `cost-model.ts` (`getFrictionForAssetClass` + `getDefaultCostComponentsForAssetClass` + `getCachedCostMetrics`) — all now REQUIRED `assetClass: AssetClass`. Perp/non-spot classes fail-hard (exhaustive switch + RUNNING_ISSUES-pointing error). MCE per-symbol cache key extended `${symbol}` → `${symbol}:${assetClass}`. 2 ablation paths (`buildB68_5Alternate`, `computeMultiTfAgreement`) + `BackfillContext` thread assetClass. Seed migration `2026-05-22-b79-0n-mce-dbs-per-class.sql` — per-class `dbs_calculation.min_sample_count` rows + wildcard retirement (net +1 row) + rollback companion. Dead-code cleanup: deleted `cost-metrics.ts` dead chain (`getDefaultAvgReturn` + `updateCostData` + `getTransactionCostFactor` + `updateSpreadCache`) per Langston Q-VI(a). 6 new unit tests.

**Langston trail:** Step 1 rev2 ACK → Step 2 pre-audit v2 ACK (after Kyle pushed for thorough SIM + code review; v1 had 3 errors — directional-bias-store already per-class from B-PHASE-A2, cost-metrics dead code, caller over-count) → Step 4 code-review ACK clear-to-push (5 asks concur, 4 nits).

**CI status (run 26245428198):** Build ✓ Docker ✓. TypeScript Check ✗ + Test Suite ✗ — BUT verified clean-relative-to-baseline: ZERO new server TS errors (signal-orchestrator −1 from the telemetry fix), test failures identical 98 to STORAGE baseline, all 6 new MCE tests pass. CI red is 100% pre-existing debt → B-NEW-43.

**Step 6 deploy GATED to ≥2026-05-22T12:00Z** (Langston C3: pre-deploy 24h baseline must be clean of the 2026-05-21 STORAGE/UD/HYGIENE trio). Deploy = ssh root@188.245.193.8 git pull + npm run build + pm2 restart + run the migration. Create a SEPARATE MCE 24h soak alert at deploy. Then Step 7 (CC verify) → Step 8 (Langston second-pass; grep PM2 for `[B79.0n.MCE][CACHE_REFRESH]` line) → Step 10 governance → Step 11 completion report.

**Governance owed at Step 10:** BATCH_CATALOG, PHASE_HISTORY, SIM, SYSTEM_MANUAL (Layer-2 wildcard-retirement migration pattern + 3-cache-layer table from pre-audit §1.5), RUNNING_ISSUES (incl. NEW orphan `cost_model.default_avg_return` row + `b72-warmup.ts` prefetch cleanup), ASSET_CLASS_ONBOARDING_WORKFLOW, completion report with §3.3 onboarding learnings.

### B-NEW-43 CI Recovery — Step 2 pre-audit DONE + Langston ACK/consensus. Runs AFTER B79.0n.MCE Step 11, BEFORE B79.0n sub-batch #5.

Standalone CI-health batch. Scope rev2 `B_NEW_43_CI_RECOVERY_SCOPE.md` (`ad2b37018`); pre-audit `B_NEW_43_CI_RECOVERY_PRE_AUDIT.md` (`eb9bfc06b` + §13 Step-2-consensus addendum `7a892bbdb`). **CI baseline (run 26255691977):** 696 TS errors (TS2339 220 / TS2345 114 / TS2304 87; routes.ts 213, storage.ts 59 — 40 of which = one missing `TradingMode` import) + 98 test failures (≈54 module-not-warm, ≈31 assertion, ≈9 DB-conn, 5 stale-knob-mock, 1 vi.mock-hoist). 4 phases P0-P3. Kyle LOCKED: one batch, runs before sub-batch #5, CI Postgres approved.

**Step 2 pre-audit — 3 corrections to scope, all Langston-ACK'd:** (1) `db:push` is BROKEN on this schema (drizzle-kit PG-ARRAY introspection bug — the documented reason `db-migrate.ts` exists) — Phase 2.2 MUST use `npm run db:migrate` (also the only path that seeds the `module_constants` rows the 54 not-warm tests need); (2) the CI typecheck job has `continue-on-error: true` — THE silent-regression mechanism — must be removed after Phase 1 reaches green; (3) ~80-130 distinct fixes (above scoped 40-70), effort ~5.25-7d, stays one batch. Phase 0 gains 2 tasks: empty-Postgres `db:migrate` validation + the b-new-42b diagnostic.

**🚩 b-new-42b cross-batch regression (diagnostic done, surfaced to Kyle):** price-discontinuity-detector test passed 11/11 at ship (2026-05-17, run 26001413225), now fails 11/11; detector+test byte-identical since. Cause = commit `230348507` (B79.0n.UNIVERSE-DISCOVERY) made `XSTOCK_SPOT_SYMBOLS` boot-populated (empty at module load); unit tests run no boot → detector early-returns for all xStocks. Production likely fine (boot populates universe) but boot-window-race + zero test coverage need verification — **awaiting Kyle decision** on fast-follow vs fold into Phase 2. Phase 2: b-new-42b's 11 + ~4 b79-0f failures = ONE root cause (harness must seed xStock universe).

### Active alerts (§10.5)
- `c82c256c` — B-NEW-35 7-day dedup soak 2026-05-27. No action.
- `b83b1e4b` — B-NEW-40 14-day soak 2026-05-31. No action.
- `283bd74e` — B-NEW-36 weekend_shutdown timer verify 2026-05-23 00:05Z. No action.
- `d4b2e590` — **B79.0n.UD + STORAGE 24h crypto regression-lock — fires 2026-05-22T11:55:57Z (TODAY).** Compare vs pre-deploy 24h baseline: FX5 pool ±5%, signal gen ±5%, VTS ±5%, active-trade ±1-2/day OR ±15% 7d. Ack after running comparison.
- `2af50871` — **B79.0n.UD 06:00Z cron self-fire review — fires 2026-05-22T13:00:00Z (TODAY).** psql `discovery_runs ORDER BY run_id DESC LIMIT 3` — verify run_id=2 `triggered_by='cron_daily'`.

---

## NEXT IMMEDIATE STEPS (2026-05-22)

B-NEW-43 Step 2 pre-audit DONE + Langston consensus. **B-NEW-43 IMPLEMENTATION (Step 3 = Phase 0) waits for B79.0n.MCE Step 11 to close.** Open: Kyle decision on the b-new-42b fast-follow question (verify boot-window race now, in parallel — vs fold into B-NEW-43 Phase 2).

**B79.0n.MCE close-out (as steps come due):**
1. **2 soak alerts firing today** — `d4b2e590` (11:55Z, UD+STORAGE 24h regression) + `2af50871` (13:00Z, UD cron self-fire). Both still future as of 2026-05-21T22Z. Surface plain-language, run comparisons, ack.
2. **B79.0n.MCE Step 6 deploy** at ≥12:00Z — deploy + run migration + create the MCE-specific 24h soak alert.
3. **B79.0n.MCE Steps 7-11** — CC verify, Langston Step 8 second-pass, Step 10 governance, Step 11 completion report.

### Recent commits
- `7a892bbdb` — B-NEW-43 pre-audit §13 Step-2 consensus + b-new-42b diagnostic
- `eb9bfc06b` — B-NEW-43 Step 2 pre-implementation audit
- `ad2b37018` — B-NEW-43 CI Recovery scope rev2 (FINALIZED, Langston ACK)
- `713fd7ae2` — B79.0n.MCE Step 5 fix-forward (getCachedCostMetrics test-caller args)
- `c69320545` — B79.0n.MCE Step 3-4 implementation (37 files)

### Parked items
- Roadmap sequencing changes (2026-05-21) recorded in POST_AUDIT_ROADMAP.md — regime confidence-chain calibration → Phase 19; crypto_perp/Phase 25 → post-launch; VTS partition → post-launch; daily loss-budget → optional Phase 19.
- ML design preliminary research brief: `Claude Comms and Packages/Cross-Session Briefs/ML_DESIGN_PRELIMINARY_2026-05-21.md` (untracked draft).
- Ops pending: xstock_spot BE-stop flip true→false.

### Permissions reminder
`.claude/settings.local.json` `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. CLAUDE.md §5 #16 — load-bearing; do NOT delete.

---

## REQUIRED PRE-READS (next session)
1. `DawnTraderV3/CLAUDE.md` (§1 + §3.3 + §5 #15-16 + §6.5.0.a + §10.5)
2. This file
3. `Claude Comms and Packages/Scope Files/B79_0n_MCE_SCOPE.md` (rev5) + `B79_0n_MCE_PRE_AUDIT.md` (v2) + `Change Lists/B79_0n_MCE_CHANGE_LIST.md`
4. `Claude Comms and Packages/Scope Files/B_NEW_43_CI_RECOVERY_SCOPE.md` (rev2 — FINALIZED; the batch after B79.0n.MCE closes)
5. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (rev 4 — §1.5 B72-prior-arc per sub-batch)
