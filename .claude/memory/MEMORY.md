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

## CURRENT STATE (2026-05-22 — B79.0n.MCE CLOSED (Steps 1-11); B-NEW-43 CI Recovery is the next active batch)

### B79.0n.MCE — CLOSED 2026-05-22 (sub-batch 4 of 18, umbrella v4). Pending only Kyle's formal acknowledgment.

Deployed staging commit `aa0564107`, PM2 #311, migration `2026-05-22-b79-0n-mce-dbs-per-class.sql` applied clean. Removed the silent `assetClass='crypto_spot'` default from 3 MCE/cost-model surface API groups (`calculatePairRegime`, `MCE.computeContext`, `cost-model.ts` ×3) — now REQUIRED `AssetClass` + perp fail-hard exhaustive switch; MCE per-symbol cache key → `${symbol}:${assetClass}`; per-class `dbs_calculation` seed migration (wildcard retired, net +1); `cost-metrics.ts` dead-chain removed; 6 new unit tests. Steps 1-11 done; Langston ACK at Steps 1/2/4/8 ("shipped clean"). Step 7+8 verified — `[B79.0n.MCE][CACHE_REFRESH]` probe fired (crypto_spot=1 + xstock_spot=8). Completion report `B79_0n_MCE_COMPLETION_REPORT.md`, governance close commit `7c7ca70e3` — 14/15 objectives YES, 1 PARTIAL (CI all-4-green = pre-existing B-NEW-43 debt, zero new MCE errors). Governance done: BATCH_CATALOG, PHASE_HISTORY, SIM, SYSTEM_MANUAL (wildcard-retirement pattern + 3-cache-layer model), RUNNING_ISSUES (#133 orphan `cost_model.default_avg_return` + #134 b72-warmup prefetch cleanup), ASSET_CLASS_ONBOARDING_WORKFLOW (Step 4.10). 24h soak alert `616dfcf3` fires 2026-05-23T12:10Z.

### B-NEW-43 CI Recovery — ACTIVE BATCH, IN IMPLEMENTATION (Step 3, Phase 0). Scope rev3 (Phase 4 alert-fix folded in). Runs BEFORE B79.0n sub-batch #5.

Standalone CI-health batch. Scope rev3 `B_NEW_43_CI_RECOVERY_SCOPE.md` (`17abbb3e3`); pre-audit `B_NEW_43_CI_RECOVERY_PRE_AUDIT.md` (`eb9bfc06b` + §13 Step-2-consensus addendum `7a892bbdb`). **CI baseline (run 26255691977):** 696 TS errors (TS2339 220 / TS2345 114 / TS2304 87; routes.ts 213, storage.ts 59 — 40 of which = one missing `TradingMode` import) + 98 test failures (≈54 module-not-warm, ≈31 assertion, ≈9 DB-conn, 5 stale-knob-mock, 1 vi.mock-hoist). 5 phases P0-P4 (P4 = alert-notification fix, added rev3). Kyle LOCKED: one batch, runs before sub-batch #5, CI Postgres approved.

**Step 2 pre-audit — 3 corrections to scope, all Langston-ACK'd:** (1) `db:push` is BROKEN on this schema (drizzle-kit PG-ARRAY introspection bug — the documented reason `db-migrate.ts` exists) — Phase 2.2 MUST use `npm run db:migrate` (also the only path that seeds the `module_constants` rows the 54 not-warm tests need); (2) the CI typecheck job has `continue-on-error: true` — THE silent-regression mechanism — must be removed after Phase 1 reaches green; (3) ~80-130 distinct fixes (above scoped 40-70), effort ~5.25-7d, stays one batch. Phase 0 gains 2 tasks: empty-Postgres `db:migrate` validation + the b-new-42b diagnostic.

**b-new-42b cross-batch regression — diagnosed + runtime-VERIFIED (Kyle directed verify-now):** price-discontinuity-detector test passed 11/11 at ship (2026-05-17, run 26001413225), now fails 11/11; detector+test byte-identical. Cause = commit `230348507` (B79.0n.UNIVERSE-DISCOVERY) made `XSTOCK_SPOT_SYMBOLS` boot-populated (empty at module load); unit tests run no boot → detector early-returns for all xStocks. **Runtime verified SAFE:** universe init is a hard boot gate in `index.ts:55-96` (top-level await + `process.exit(1)` on total fallback failure) completing before the Express app; all 9 `XSTOCK_SPOT_SYMBOLS` code usages are call-time (zero module-load captures). No fast-follow runtime batch needed. Only residual = test-coverage gap → B-NEW-43 Phase 2 (harness seeds universe via `_replaceXstockUniverse()` in beforeEach). Phase 2: b-new-42b's 11 + ~4 b79-0f failures = ONE root cause.

**rev3 — Phase 4 added (Kyle directive 2026-05-22):** fold in the system-alerts active-push fix (RUNNING_ISSUES #135). Phase 4 = the SOLE runtime change in B-NEW-43 (the `fire-due` dispatcher gains Telegram-post + Langston-invoke on alert promotion); runs strictly LAST; own pre-audit addendum + Step 4 + staging deploy + Step 7/8 verify. **Langston ACK'd rev3** — 8 concerns recorded for the Phase-4 pre-audit addendum + a §5 escape clause added (if Phases 0-3 close green but Phase 4 snags, B-NEW-43 closes on the CI work + Phase 4 splits to a follow-up).

**Phase 0 COMPLETE (2026-05-22):** mirror clone at `C:/dev/DawnTraderV3` (shallow `--depth 1` — full clone failed `early EOF` on the large repo); `npm install` works there (26s, 658 pkgs) — proven off-FUSE; `npx tsc --noEmit` runs → exactly 696 errors (= CI run 26255691977, authoritative); vitest 3.2.4 available; CLAUDE.md §7.1 runbook + ONE-DIRECTION-EDIT sync protocol documented (commit `42f220563`). **Empty-Postgres `db:migrate` validation (pre-audit Q1) → moved to Phase 2.2** — no local Docker/Postgres on the dev machine; the CI Postgres added in Phase 2.2 IS the environment, and its `db:migrate` step succeeding is that validation. **Code edits now land in the `C:/dev` mirror ONLY; push from there; GDrive clone is `git pull`-only.** Mirror git identity not configured — commits use inline `git -c user.name=kylegjordan -c user.email=kylegjordan@gmail.com` (per the no-config-change rule).

**Phase 1 chunk 1 DONE — TS2304 `TradingMode` cluster (committed on mirror `6eb523d`, NOT pushed — awaiting Langston Step 4).** storage.ts missing `TradingMode` import added (from `./lib/event-bus`) → 40 errors cleared; the import surfaced a real latent bug (typecheck had masked it): `paper-portfolio-manager.ts` (7 sites) + `paper-48hr-simulation.ts` (3 sites) passed `this.userId` where the mode-keyed paper-sim storage API wants `TradingMode` — those lookups matched nothing → 48h-sim reports + paper portfolio metrics ran on empty data. Kyle directed fix (remove legacy userId dep): portfolio-manager → `this.mode`; 48h-sim → `'paper'`. Local tsc **696→656**, zero new errors. `TradingMode` is duplicate-defined 6+ files (type-dedup debt, flagged not fixed). Kyle context: userId dependency is a long-standing legacy-PM mistake; legacy pieces remain codebase-wide for future cleanup.

### Active alerts (§10.5)
- `c82c256c` — B-NEW-35 7-day dedup soak 2026-05-27. No action.
- `b83b1e4b` — B-NEW-40 14-day soak 2026-05-31. No action.
- `283bd74e` — B-NEW-36 weekend_shutdown timer verify 2026-05-23 00:05Z. No action.
- `d4b2e590` — ✅ ACK'd 2026-05-22 — UD 24h crypto regression check ran: NO regression (FX5 pool healthy ~200-230; signal eval volume up; VTS crypto rate elevated not depressed — daily counts span 20-190 so the −8.6% window-delta is noise per §13). No RUNNING_ISSUES filed.
- `2af50871` — ✅ ACK'd 2026-05-22 — UD 06:00Z cron self-fire verified: discovery_runs run_id=2 `triggered_by=cron_daily` started 06:00:00Z, duration 605797ms, 479 symbols, no error_log; universe stable (489 active / 15 sectors). All-green.
- `616dfcf3` — **B79.0n.MCE 24h post-deploy soak — fires 2026-05-23T12:10Z.** Grep error.log for B79.0n.MCE fail-hard throws (expect zero); confirm CACHE_REFRESH still firing; crypto regression vs baseline. No action until then.

---

## NEXT IMMEDIATE STEPS (2026-05-22)

B79.0n.MCE CLOSED + Kyle-acknowledged. B-NEW-43 active; Phase 0 COMPLETE; Phase 1 chunk 1 DONE (committed mirror `6eb523d`, unpushed). Next:
1. **B-NEW-43 Phase 1 — dispatch Langston Step 4 review of chunk 1** (the `6eb523d` TradingMode diff — 3 files, +16/-11) → on ACK, push from the mirror.
2. **Continue Phase 1 chunks** (scope §3 Phase 1 order): remaining TS2304 (`settings` family 14, `aiOpportunitiesService` 5, smaller) → TS2339 type-definition cluster (~15-22 root causes incl. `req.user` narrow type = 20) → TS2345 → routes.ts deep-clean (chunk by section banner, ~20-40/commit) → long tail. Each chunk: fix on mirror → local tsc verify → commit → Langston Step 4 → push. After Phase 1 green: remove typecheck `continue-on-error:true` from ci.yml. Then Phase 2 (`db:migrate` NOT `db:push`) → Phase 3 (lock CI) → Phase 4 (alert active-push fix).
3. **616dfcf3 alert** — B79.0n.MCE 24h soak, fires 2026-05-23T12:10Z. Background monitor.

### Recent commits
- `17abbb3e3` — B-NEW-43 scope rev3 (Phase 4 alert-notification fix folded in)
- `15f6fcafc` — RUNNING_ISSUES #135 (system-alerts no active push)
- `7c7ca70e3` — B79.0n.MCE Step 10-11 governance close + completion report
- `aa0564107` — CLAUDE.md §5 #17 xStock 24/5 (staging deployed at this commit)
- `eb9bfc06b` / `7a892bbdb` — B-NEW-43 pre-audit + §13 consensus + §13.3 b-new-42b verify

### Parked items
- Roadmap sequencing changes (2026-05-21) recorded in POST_AUDIT_ROADMAP.md — regime confidence-chain calibration → Phase 19; crypto_perp/Phase 25 → post-launch; VTS partition → post-launch; daily loss-budget → optional Phase 19.
- ML design preliminary research brief: `Claude Comms and Packages/Cross-Session Briefs/ML_DESIGN_PRELIMINARY_2026-05-21.md` (untracked draft).
- Ops pending: xstock_spot BE-stop flip true→false.

### Permissions reminder
`.claude/settings.local.json` `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. CLAUDE.md §5 #16 — load-bearing; do NOT delete.

---

## REQUIRED PRE-READS (next session)
1. `DawnTraderV3/CLAUDE.md` (§1 + §3.3 + §5 #15-17 + §6.5.0.a + §10.5)
2. This file
3. `Claude Comms and Packages/Scope Files/B_NEW_43_CI_RECOVERY_SCOPE.md` (rev2 FINALIZED) + `B_NEW_43_CI_RECOVERY_PRE_AUDIT.md` (incl. §13 Step-2 consensus + §13.3 b-new-42b verify) — the ACTIVE batch
4. `Claude Comms and Packages/Scope Files/B79_0n_UMBRELLA_XSTOCK_ACTIVE_TRADING_PATH.md` (rev 4 — §1.5 B72-prior-arc per sub-batch)
5. `Claude Comms and Packages/Batch Completion/B79_0n_MCE_COMPLETION_REPORT.md` (closed sub-batch 4 — reference only)
