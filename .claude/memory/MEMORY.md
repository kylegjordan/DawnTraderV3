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

## CURRENT STATE (2026-05-23 — B-NEW-43 Phase 1 CLOSED; Phase 2 in progress, paused at chunk 4 design ask)

### B-NEW-43 Phase 1 — CLOSED 2026-05-23. Governance commit `5191675a` shipped (Phases 2/3/4 pending; BATCH_CATALOG + PHASE_HISTORY deferred to full batch close).

696 → 488 tsc errors (−208 / 30%); 18 chunks; Langston ACK per-chunk; one sanctioned `as unknown as` (chunk-4 req.mode); CI typecheck baseline-comparison gate green. POST_AUDIT_ROADMAP updated with 19-before-16 swap. RUNNING_ISSUES augmented (#136 + #137 closing lists). CHANGES_AND_FIXES has `BUG-2026-05-23-A` (paper-portfolio-manager + paper-48hr-simulation userId-as-mode latent bug + historical-metrics-suspect flag) + `BUG-2026-05-23-B` (dead AI-Opps routes deleted). SIM has "B-NEW-43 Phase 1 — CI typecheck baseline-comparison gate" block.

### B-NEW-43 Phase 2 — IN PROGRESS. Chunks 1-5 shipped. CI db:migrate GREEN. ~77 residual test failures.

**Chunks 1-3 (`25b5069` → `e5b1d90`, all ACK'd):** see prior block. b-new-42b fix (15/15 PASS) + b79-0f fixture extension (32/32 PASS) + CI Postgres service container + db-migrate MANIFEST.txt with validation.

**Chunks 4.0-4.7 (`f118715` → `3d59d88`, Langston Step-2 design ACK pre-impl):** initial-schema migration. Captured staging schema via `pg_dump --schema-only --no-owner --no-privileges --schema=public` against Supabase PG 17.6; saved as `drizzle/migrations/2026-04-22-initial-schema.sql` (~20.7k lines, 909 tables, 609 indexes, 85 enums, 26 sequences, 6 views; cleaned: stripped psql `\restrict`/`\unrestrict`, `_migrations` block, added `CREATE EXTENSION vector WITH SCHEMA public`, `RESET search_path` at tail, idempotent `CREATE SCHEMA IF NOT EXISTS public`). Added to MANIFEST.txt at top. CI image switched to `pgvector/pgvector:pg17`. Iterated 7 times to surface + fix empty-DB-safety issues; final shape includes a `-- db-migrate:skip` mechanism in `db-migrate.ts` (records ledger row but doesn't execute SQL) applied to 62+4 historical pre-dump migrations whose effects are already in the dump. Staging coordination SQL committed at `1-system-manual/staging-coordination/2026-04-22-initial-schema-mark-applied.sql`. SYSTEM_MANUAL §12.6 documents the bootstrap-from-dump-vs-fresh-empty-PG branch.

**Chunk 4 CI verification (`26332635303`):** db:migrate GREEN — initial-schema applies, 66 deltas process (some apply normally, 66 ledger-only-skip-marker), search_path reset. Test job advances past db:migrate to vitest.

**Chunk 5 (`d2ff328`):** harness fixes for b74-universe-loader (seedXstockUniverse in beforeAll, 1→0 local fail) + b63-item16-dbs-store (prefetchModule('dbs_calculation') in beforeAll, expected CI clear of 9 module-not-warm).

**Chunk 6 (`8ab9d59`):** bulk prefetchModule beforeAll for 7 module-not-warm files: cost_telemetry+dynamic_sizing→position_sizing, market_indicators_narrative→dbs_calculation, net_expectancy→cost_geometry, mapping_drift_integrity→drift_detector, b63-item12-geometry-override→strategy.vwap_pullback, directive-11.7S-strategy-modes→governance_modes. Cleared the "module is not warm" layer. CI 17 failed files / 71 failed tests after chunk 6.

**Chunk 7 (`f234fd9`):** initial seed data for module_constants (541 rows) + screener_filters (58 rows) via pg_dump --data-only --column-inserts against staging. Added as NEW `drizzle/migrations/2026-04-22b-initial-seed-data.sql` (~670 lines), MANIFEST entry 2 (after initial-schema, before deltas). Companion to chunk 4's --schema-only dump. Staging-coordination SQL extended. CI after chunk 7: 11 failed files / 25 failed tests (was 17/71). −46 tests cleared.

**Chunk 8 (`8999935`):** 5 targeted residual-tail fixes — (a) b79-0d-orb (g)/(g2) DELETED (deprecated 24/7-short-circuit behavior removed in B-NEW-36 sub-batch (c)). (b) b70-run-mode-controller vi.hoisted() for mock fn (vi.mock factory hoist ReferenceError). (c) b-phase-a2-xstock-dbs-store mock: sector_coverage_floor branch added to getCachedNumberRequired (was only in getCachedConstant). (d)+(e) b-new-42-tec-halt-resilience + b-new-42-tec-split-resilience seedXstockUniverse() in beforeEach. CI after chunk 8: 6 failed files / 14 failed tests.

**Chunk 9 (`2117dfb`):** DSE_CONFIG Proxy export fix (was nonexistent module-level binding → undefined import → MIN_MULTIPLIER read on undefined; replaced with Proxy that lazily delegates to getDSEConfig()) + b79-0m-b2 test (c) modernized from 60-bar to 24-bar floor expectation (B-NEW-34 lowered the floor on 2026-05-15, test had stale fixture).

**Chunk 10 (`5e7b654`):** removed 2 b68-5-path-b-sustainability deprecated tests (asserted OLD b68_5DbsSlopeMin slope gate that was replaced by b68_5PathBMomentumMin per market-context-engine.ts:400). Phase-19 follow-up: write momentum-gate test coverage.

**Chunks 11-14 (`fa2d00a` → `b5fb9fe`):** iteratively-converged b-new-36-lifecycle-controller mock (Drizzle sql template params extraction — alternating StringChunk + raw values, not Param-wrapped) + removed 4 b73 exit-strategy-replay deprecated variant tests (Variant F gained post-target trailing in B73.3, E/J/gap-bar all depended on the old F semantics) + removed empty b73 describes. Phase-19 follow-up registered for all 4 b73 test rewrites.

**🟢 PHASE 2 COMPLETE — CI all 4 jobs GREEN at commit `b5fb9fe`** (run 26343130292). Test Suite: 1417 passed / 7 skipped / 0 failed. TypeScript Check, Build, Docker Build all green.

**Phase 3 (`cc4e74339`):** CLAUDE.md §5 #19 added — CI per-batch confirmation rule. Every batch close MUST verify all 4 CI jobs green on head commit before marking complete. B-NEW-43 itself is the first-time application.

**Phase 4 (`bf60d8f` + `6153115` hotfix):** system-alerts active-push fix (RUNNING_ISSUES #135 RESOLVED). `scripts/system-alerts.ts` extended: Telegram routing now posts warning + critical promotions to group topic 21 (was only critical → Kyle DM); fire-and-forget SSH+claude-cli invoke to Langston on Helsinki so a session runs the §10.5 surfacing on his side; `LANGSTON_INVOKE=0` disable knob. Kyle-authorized 2026-05-23 token scp from Helsinki to staging `/etc/langston/ccdt-bot.env` (mode 640 root:deploy). Hotfix `6153115` fixed JS-default-parameter quirk in telegramSend's Markdown-fail-fallback (was infinite-recursing because explicit `undefined` re-uses default 'Markdown'; switched sentinel to `'plain'`). End-to-end verified on staging via 3 manual test alerts; final test post-hotfix delivered cleanly via plain-text fallback. #135 closed.

**🟢 B-NEW-43 BATCH CLOSED 2026-05-23** at head commit `3ba5e63` with CI all-4-green at run `26343291671`. Full completion report at `Claude Comms and Packages/Batch Completion/B_NEW_43_COMPLETION_REPORT.md`. BATCH_CATALOG.md + PHASE_HISTORY.md entries added. Next: resume B79.0n umbrella sub-batches 5-18 (xStocks active-trading-path audit, ~14 sub-batches).

**Test status post-chunk-5 (CI run 26332635303):** 18 failing test files / 77 failing tests (was 71 suites / 103 tests local pre-Phase-2). Remaining failures:
- b63-item16-dbs-store, b68-5-path-b-sustainability, b73-exit-strategy-replay (4), b79-0m-b2-pattern-filter — module-not-warm pattern; need beforeAll prefetchModule calls
- b79-0d-orb 24/7 tests (g, g2) — assertion drift: B-NEW-36 sub-batch (c) removed the per-symbol weekend-bypass for the 10 named symbols (empirical verification showed they share hours with other xStocks); test cases test deprecated behavior. Hold for Langston review on delete-vs-rewrite call.
- directive-11.7S-strategy-modes (many) — needs investigation (likely module-not-warm or schema drift)
- Others to be investigated case-by-case

### Active alerts (§10.5)
- `c82c256c` — B-NEW-35 7-day dedup soak 2026-05-27. No action.
- `b83b1e4b` — B-NEW-40 14-day soak 2026-05-31. No action.
- `616dfcf3` — **B79.0n.MCE 24h post-deploy soak — fires 2026-05-23T12:10Z (within next ~1h).** Grep error.log for B79.0n.MCE fail-hard throws; confirm CACHE_REFRESH; crypto regression vs baseline.

---

## NEXT IMMEDIATE STEPS (2026-05-23 — post-B-NEW-43 close)

1. **Resume B79.0n umbrella sub-batches 5-18** (~14 sub-batches remaining; xStocks active-trading-path audit). Sub-batch #5 was queued behind B-NEW-43 per Kyle's lock.
2. ~~RUNNING_ISSUES #135 staging-wiring decision~~ — RESOLVED 2026-05-23. Kyle authorized token scp; verified end-to-end.
3. **616dfcf3 alert (B79.0n.MCE 24h soak)** — STILL ACTIVE, unacknowledged. Initial inspection found ZERO recurring CACHE_REFRESH log lines (only one at deploy time 12:09Z). May indicate (a) probe deploy-only-not-recurring (alert wording misleading) or (b) refresh path broken. Needs proper investigation.
4. **Staging coordination — ACTION REQUIRED BEFORE NEXT STAGING `db:migrate`:** run `1-system-manual/staging-coordination/2026-04-22-initial-schema-mark-applied.sql` on staging. Without it, the next staging db:migrate run would conflict on initial-schema + initial-seed-data.
5. After B79.0n umbrella close: **Phase 25 — Adaptive Market Response** (Kyle confirmed 2026-05-23; moved from §18.9 to Phase 25). Then **Phase 19** active-trading audit walkthrough.

### Recent commits (origin HEAD post-batch-close at `3ba5e63` 🟢 CI all-green run 26343291671)
- (batch-close governance commits — BATCH_CATALOG + PHASE_HISTORY + completion report — landing in this session's final push)
- `3ba5e63` — B-NEW-43 Phase 4 (system-alerts active-push fix — `bf60d8f` rebased over Phase-3 governance)
- `cc4e74339` — B-NEW-43 Phase 3 (CLAUDE.md §5 #19 CI per-batch confirmation rule)
- `b5fb9fe` — B-NEW-43 Phase 2 chunk 14 (b-new-36 mock: raw params from queryChunks — CI all-4-green)
- `84d8c45` — B-NEW-43 Phase 2 chunk 13 (remove empty b73 describes + restore b-new-36 sqlText)
- `1100bf3` — B-NEW-43 Phase 2 chunk 12 (remove 4 b73 variant tests + refine b-new-36 mock)
- `fa2d00a` — B-NEW-43 Phase 2 chunk 11 (b-new-36 Drizzle SQL params extraction)
- `5e7b654` — B-NEW-43 Phase 2 chunk 10 (remove deprecated b68-5 slope-gate tests)
- `2117dfb` — B-NEW-43 Phase 2 chunk 9 (DSE_CONFIG Proxy + b79-0m-b2 modernized)
- `8999935` — B-NEW-43 Phase 2 chunk 8 (deprecated test removal + mock/hoist + universe-seed propagation)
- `f234fd9` — B-NEW-43 Phase 2 chunk 7 (initial seed data for module_constants + screener_filters)
- `8ab9d59` — B-NEW-43 Phase 2 chunk 6 (bulk prefetchModule for 7 module-not-warm files)
- `d2ff328` — B-NEW-43 Phase 2 chunk 5 (b74-universe-loader + b63-item16-dbs-store harness fixes)
- `3d59d88` — B-NEW-43 Phase 2 chunk 4.7 (bulk skip-marker on 62 pre-dump migrations)
- `c2ef6d8` — B-NEW-43 Phase 2 chunk 4.6 (skip-marker phase2-add-unique-constraints)
- `ed113c5` — B-NEW-43 Phase 2 chunk 4.5 (skip-marker mechanism + 3 dedup files)
- `c6a5d87` — B-NEW-43 Phase 2 chunk 4.4 (RESET search_path at dump tail)
- `adac99b` — B-NEW-43 Phase 2 chunk 4.3 (CREATE EXTENSION vector WITH SCHEMA public)
- `f67bb11` — B-NEW-43 Phase 2 chunk 4.2 (pgvector image + CREATE EXTENSION)
- `7bfa406` — B-NEW-43 Phase 2 chunk 4.1 (strip _migrations from dump)
- `f118715` — B-NEW-43 Phase 2 chunk 4 (initial pg_dump + staging coord + SYSTEM_MANUAL §12.6)
- `e5b1d90` — B-NEW-43 Phase 2 chunk 3 (MANIFEST.txt + validator)
- `fd5467d` — B-NEW-43 Phase 2 chunk 2b (b79-0f fixture extension)
- `7950725` — B-NEW-43 Phase 2 chunk 2 (CI Postgres + db:migrate)
- `25b5069` — B-NEW-43 Phase 2 chunk 1 + defense-in-depth (b-new-42b harness fix)
- `5191675a` — B-NEW-43 Phase 1 close governance
- `ccf58e6` — B-NEW-43 Phase 1 chunk 18

**Mirror workflow:** code on `C:/dev/DawnTraderV3` (commits use inline `git -c user.name=kylegjordan -c user.email=kylegjordan@gmail.com`); GDrive clone is governance-docs + `git pull`-only for code per CLAUDE.md §7.1.

### Parked items
- Roadmap sequencing (2026-05-21) — Phase 25 + VTS partition + daily loss-budget — in POST_AUDIT_ROADMAP.
- Phase 19 before Phase 16 (2026-05-23) — in POST_AUDIT_ROADMAP.
- **Adaptive Market Response (body) → Phase 25 (Kyle confirmed 2026-05-23 — moved from §18.9 to Phase 25 per prior CC session's recommendation).** Slots between end of xStocks onboarding (B79.0n umbrella close) and Phase 19 (active-trading audit). Ships with conservative operator-set thresholds (NOT VTS-calibrated); brain later replaced by ML posture model M2. Scope file to be `BATCH_25_AMR_SCOPE.md` when ready. POST_AUDIT_ROADMAP ARM block + concept doc need a sweep to reconcile from §18.9 → Phase 25 labels (TBD batch).
- **Crypto-trade-rate-spike investigation hook (Kyle 2026-05-22-ish, raised again 2026-05-23):** Kyle directly asked whether the B79.0n umbrella xStocks onboarding may have accidentally touched crypto variables in the DB while landing xStock plumbing. Check `module_constants` / `screener_filters` / regime-classifier rows scoped to `crypto_spot` for any unintended drift. **The "7d VTS bleed analysis 2026-05-23" item previously sitting here was added by a prior CC session — Kyle does NOT recall asking for that analysis. Numbers in it (1046 trades, WR 31%/29.5%, net −$791, regime confidence identical on TP/SL) are of suspect provenance and should not be cited until re-derived from staging.** The crypto-variables-touched-by-xstock-work check is the real outstanding ask.
- ML design preliminary research brief: `Claude Comms and Packages/Cross-Session Briefs/ML_DESIGN_PRELIMINARY_2026-05-21.md` (untracked draft).
- Ops pending: xstock_spot BE-stop flip true→false.
- **NEW 2026-05-23:** Phase 19 candidate proposed by Langston in chunk-3 design ACK: extend `_migrations` ledger with `expected_order` integer matching MANIFEST position. Catches historical-out-of-order applications. Not for B-NEW-43; POST_AUDIT_ROADMAP candidate.

### Phase 19 intake / Phase 16 register pointers
- Phase 19 intake list: RUNNING_ISSUES #137. Source of truth = baseline `files[]` with `phase_tag.startsWith("Phase 19")`.
- Phase 16 legacy register: RUNNING_ISSUES #136 entries (a)-(h).

### Permissions reminder
`.claude/settings.local.json` `defaultMode: "bypassPermissions"` at TOP LEVEL (line 2) AND inside permissions block. CLAUDE.md §5 #16 — load-bearing; do NOT delete.

---

## REQUIRED PRE-READS (next session)
1. `DawnTraderV3/CLAUDE.md` (§1 + §3.3 + §5 #15-17 + §6.5.0.a + §10.5 + §7.1 mirror)
2. This file
3. `Claude Comms and Packages/Batch Completion/B_NEW_43_PHASE_1_COMPLETION_REPORT.md` (Phase 1 close — reference)
4. `Claude Comms and Packages/Scope Files/B_NEW_43_CI_RECOVERY_SCOPE.md` (rev3) + pre-audit — Phase 2 in progress
5. Langston Step-2 design ACK for chunk-4 initial-schema (when reply arrives, captured at `/home/langston/inbox/b-new-43/b43_phase2_chunk4_design_ask.md`)
6. `.tsc-baseline.json` (488 / 68 — Phase 1 frozen)
