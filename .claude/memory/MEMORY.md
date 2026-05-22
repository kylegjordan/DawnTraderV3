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

## CURRENT STATE (2026-05-22 — B79.0n.MCE DEPLOYED + Step 7 verified; Steps 8/10/11 remain. B-NEW-43 Step 2 pre-audit DONE + Langston ACK)

### B79.0n.MCE — sub-batch 4 of 18 (umbrella v4). Steps 1-7 done (deployed + first-pass verified); Steps 8, 10, 11 remain.

**DEPLOYED 2026-05-22 ~12:10Z** — staging at commit `aa0564107`, PM2 #311, migration `2026-05-22-b79-0n-mce-dbs-per-class.sql` applied (1 pending → applied clean). Payload commits `c69320545` (Step 3-4 impl) + `713fd7ae2` (Step 5 fix-forward).

**What it does:** removes the silent `assetClass='crypto_spot'` default from 3 MCE surface APIs — `calculatePairRegime`, `MCE.computeContext`, and `cost-model.ts` (`getFrictionForAssetClass` + `getDefaultCostComponentsForAssetClass` + `getCachedCostMetrics`) — all now REQUIRED `assetClass: AssetClass`. Perp/non-spot classes fail-hard (exhaustive switch + RUNNING_ISSUES-pointing error). MCE per-symbol cache key extended `${symbol}` → `${symbol}:${assetClass}`. 2 ablation paths (`buildB68_5Alternate`, `computeMultiTfAgreement`) + `BackfillContext` thread assetClass. Seed migration `2026-05-22-b79-0n-mce-dbs-per-class.sql` — per-class `dbs_calculation.min_sample_count` rows + wildcard retirement (net +1 row) + rollback companion. Dead-code cleanup: deleted `cost-metrics.ts` dead chain (`getDefaultAvgReturn` + `updateCostData` + `getTransactionCostFactor` + `updateSpreadCache`) per Langston Q-VI(a). 6 new unit tests.

**Langston trail:** Step 1 rev2 ACK → Step 2 pre-audit v2 ACK (after Kyle pushed for thorough SIM + code review; v1 had 3 errors — directional-bias-store already per-class from B-PHASE-A2, cost-metrics dead code, caller over-count) → Step 4 code-review ACK clear-to-push (5 asks concur, 4 nits).

**CI status (run 26245428198):** Build ✓ Docker ✓. TypeScript Check ✗ + Test Suite ✗ — BUT verified clean-relative-to-baseline: ZERO new server TS errors (signal-orchestrator −1 from the telemetry fix), test failures identical 98 to STORAGE baseline, all 6 new MCE tests pass. CI red is 100% pre-existing debt → B-NEW-43.

**Step 6-7 DONE.** Deploy gate cleared (≥12:00Z + d4b2e590 24h UD regression check came back CLEAN — no crypto regression). Step 7 first-pass verify: HTTP 200, PM2 online stable, migration applied, `[B79.0n.MCE][CACHE_REFRESH]` probe fired at 12:09:52Z (crypto_spot=1 + xstock_spot=8 = 9 dbs_calculation rows — per-class resolution confirmed working), universes loaded (xstock 489 / crypto 422), boot-time heartbeat spike settled (no recurrence), no new errors. MCE 24h soak alert created (triggers 2026-05-23T12:10Z). **Remaining:** Step 8 (Langston second-pass — grep PM2 for `[B79.0n.MCE][CACHE_REFRESH]`) → Step 10 governance → Step 11 completion report.

**Governance owed at Step 10:** BATCH_CATALOG, PHASE_HISTORY, SIM, SYSTEM_MANUAL (Layer-2 wildcard-retirement migration pattern + 3-cache-layer table from pre-audit §1.5), RUNNING_ISSUES (incl. NEW orphan `cost_model.default_avg_return` row + `b72-warmup.ts` prefetch cleanup), ASSET_CLASS_ONBOARDING_WORKFLOW, completion report with §3.3 onboarding learnings.

### B-NEW-43 CI Recovery — Step 2 pre-audit DONE + Langston ACK/consensus. Runs AFTER B79.0n.MCE Step 11, BEFORE B79.0n sub-batch #5.

Standalone CI-health batch. Scope rev2 `B_NEW_43_CI_RECOVERY_SCOPE.md` (`ad2b37018`); pre-audit `B_NEW_43_CI_RECOVERY_PRE_AUDIT.md` (`eb9bfc06b` + §13 Step-2-consensus addendum `7a892bbdb`). **CI baseline (run 26255691977):** 696 TS errors (TS2339 220 / TS2345 114 / TS2304 87; routes.ts 213, storage.ts 59 — 40 of which = one missing `TradingMode` import) + 98 test failures (≈54 module-not-warm, ≈31 assertion, ≈9 DB-conn, 5 stale-knob-mock, 1 vi.mock-hoist). 4 phases P0-P3. Kyle LOCKED: one batch, runs before sub-batch #5, CI Postgres approved.

**Step 2 pre-audit — 3 corrections to scope, all Langston-ACK'd:** (1) `db:push` is BROKEN on this schema (drizzle-kit PG-ARRAY introspection bug — the documented reason `db-migrate.ts` exists) — Phase 2.2 MUST use `npm run db:migrate` (also the only path that seeds the `module_constants` rows the 54 not-warm tests need); (2) the CI typecheck job has `continue-on-error: true` — THE silent-regression mechanism — must be removed after Phase 1 reaches green; (3) ~80-130 distinct fixes (above scoped 40-70), effort ~5.25-7d, stays one batch. Phase 0 gains 2 tasks: empty-Postgres `db:migrate` validation + the b-new-42b diagnostic.

**b-new-42b cross-batch regression — diagnosed + runtime-VERIFIED (Kyle directed verify-now):** price-discontinuity-detector test passed 11/11 at ship (2026-05-17, run 26001413225), now fails 11/11; detector+test byte-identical. Cause = commit `230348507` (B79.0n.UNIVERSE-DISCOVERY) made `XSTOCK_SPOT_SYMBOLS` boot-populated (empty at module load); unit tests run no boot → detector early-returns for all xStocks. **Runtime verified SAFE:** universe init is a hard boot gate in `index.ts:55-96` (top-level await + `process.exit(1)` on total fallback failure) completing before the Express app; all 9 `XSTOCK_SPOT_SYMBOLS` code usages are call-time (zero module-load captures). No fast-follow runtime batch needed. Only residual = test-coverage gap → B-NEW-43 Phase 2 (harness seeds universe via `_replaceXstockUniverse()` in beforeEach). Phase 2: b-new-42b's 11 + ~4 b79-0f failures = ONE root cause.

### Active alerts (§10.5)
- `c82c256c` — B-NEW-35 7-day dedup soak 2026-05-27. No action.
- `b83b1e4b` — B-NEW-40 14-day soak 2026-05-31. No action.
- `283bd74e` — B-NEW-36 weekend_shutdown timer verify 2026-05-23 00:05Z. No action.
- `d4b2e590` — ✅ ACK'd 2026-05-22 — UD 24h crypto regression check ran: NO regression (FX5 pool healthy ~200-230; signal eval volume up; VTS crypto rate elevated not depressed — daily counts span 20-190 so the −8.6% window-delta is noise per §13). No RUNNING_ISSUES filed.
- `2af50871` — **B79.0n.UD 06:00Z cron self-fire review — fires 2026-05-22T13:00:00Z (TODAY, ~1h out).** psql `discovery_runs ORDER BY run_id DESC LIMIT 3` — verify run_id=2 `triggered_by='cron_daily'`.
- `<new>` — **B79.0n.MCE 24h post-deploy soak — fires 2026-05-23T12:10Z.** Grep error.log for B79.0n.MCE fail-hard throws (expect zero); confirm CACHE_REFRESH still firing; crypto regression vs baseline. No action until then.

---

## NEXT IMMEDIATE STEPS (2026-05-22)

Kyle wants momentum — close B79.0n.MCE today, then start B-NEW-43 (neither waits on the 24h soak; soak is a background monitor). Order:
1. **B79.0n.MCE Step 8** — dispatch Langston second-pass (grep staging PM2 for `[B79.0n.MCE][CACHE_REFRESH]`, verify per-class dbs_calculation rows, HTTP 200, no fail-hard throws).
2. **B79.0n.MCE Step 10** — governance docs (see "Governance owed" above).
3. **B79.0n.MCE Step 11** — completion report w/ §3.3 onboarding learnings → Kyle ack → batch CLOSED.
4. **2af50871 alert** — fires 13:00Z (~1h out): psql `discovery_runs` verify run_id=2 `triggered_by='cron_daily'`. Surface + ack.
5. **B-NEW-43 implementation** — starts after MCE Step 11 closes. Step 3 = Phase 0 (local typecheck mirror clone — zero staging impact). Then Phase 0 also: empty-Postgres db:migrate validation + b-new-42b CI-history note already done.

### Recent commits
- `aa0564107` — CLAUDE.md §5 #17 xStock 24/5 (remote HEAD; staging deployed at this commit)
- `c11b15792` / `57dbace3f` — B-NEW-43 pre-audit §13.3 b-new-42b runtime-verify + memory sync
- `7a892bbdb` / `eb9bfc06b` — B-NEW-43 pre-audit + §13 Step-2 consensus
- `713fd7ae2` / `c69320545` — B79.0n.MCE Step 5 fix-forward + Step 3-4 impl (the deployed payload)

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
