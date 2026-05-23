# B-NEW-43 (CI Recovery) — Full Batch Completion Report

**Status:** CLOSED 2026-05-23. All 4 phases shipped; CI all-4-green at head commit. Phase 4 code-side complete; staging-wiring follow-up to Kyle for credential-placement decision (RUNNING_ISSUES #135 — code green, ops choice deferred).

**Scope reference:** `Claude Comms and Packages/Scope Files/B_NEW_43_CI_RECOVERY_SCOPE.md` rev3 + pre-audit `B_NEW_43_CI_RECOVERY_PRE_AUDIT.md` (incl. §13 Step-2 consensus + §13.3 b-new-42b verify).

**Phase 1 milestone report:** `Claude Comms and Packages/Batch Completion/B_NEW_43_PHASE_1_COMPLETION_REPORT.md` (Phase 1 close, 2026-05-23).

---

## Headline

The CI pipeline went from **0 of 4 jobs green** at scope-start to **4 of 4 jobs green** at batch close:

| Job | Pre-batch | Post-batch |
|---|---|---|
| TypeScript Check (baseline gate) | RED — `continue-on-error: true` was silently masking ~700 type errors | GREEN — per-file per-code baseline-comparison gate, hard-fails on regression |
| Test Suite | RED — 98 failing tests across 20 files (mostly module-not-warm + DB-conn) | GREEN — 1417 passed / 7 skipped / 0 failed |
| Build | GREEN (was already) | GREEN |
| Docker Build | GREEN (was already) | GREEN |

The migration branch is now sustainable: every push is gated by all 4 checks, regressions can no longer accumulate silently.

## Phase-by-phase summary

### Phase 0 — Local mirror clone

`C:\dev\DawnTraderV3` shallow-clone established as the standing fixture for local typecheck + test runs off the GDrive FUSE mount (npm install hangs on FUSE; local NTFS is reliable). ONE-DIRECTION-EDIT discipline documented in CLAUDE.md §7.1.

### Phase 1 — TypeScript error reduction + baseline gate (18 chunks)

696 → 488 tsc errors (−208 / 30% reduction) across 18 mechanical chunks. Anti-graveyard discipline upheld throughout: zero new `as any`, `@ts-expect-error`, `@ts-ignore`, or non-null `!`. One sanctioned `as unknown as` for the `req.mode` x-app-mode boundary cast. Three latent bugs surfaced + 2 fixed in-flight (paper-portfolio-manager.ts userId-as-mode-key + paper-48hr-simulation.ts same); 5 deeper latent bugs registered to Phase 19 walkthrough (B70.2 archive silent-undefined, RTB silent-throw-swallow, scaled-loss-scenario createTrade broken-shape, etc.). Detailed in the Phase 1 completion report linked above.

The baseline-comparison gate (`scripts/check-tsc-baseline.mjs` + `.tsc-baseline.json`) replaced the silent-regression mechanism. CI now fails on any (file, code) count above baseline or any new (file, code) pair.

### Phase 2 — Test failure recovery (14 chunks)

103 → 0 failing tests across 14 sub-chunks. The work split into four substantive layers:

1. **Test-fixture seeding (chunks 1, 2b, 5, 6):** XSTOCK_SPOT_SYMBOLS universe-seed helper (`server/tests/helpers/seed-xstock-universe.ts`) + per-test prefetchModule calls for module_constants warming. Cleared the b-new-42b cross-batch regression + 7 other module-not-warm files.
2. **CI Postgres infrastructure (chunks 2, 4.0-4.7):** Added `pgvector/pgvector:pg17` service container to the test job. Captured staging schema via `pg_dump --schema-only --no-owner --no-privileges --schema=public --no-comments` (909 tables, 609 indexes, 85 enums, 26 sequences, 6 views — ~20.7k lines committed as `drizzle/migrations/2026-04-22-initial-schema.sql`). Introduced explicit migration ordering manifest (`drizzle/migrations/MANIFEST.txt`) so the runner applies in the correct order (the pre-fix lex-sort had a 04-23-b65 ordering bug). Added skip-marker mechanism to `scripts/db-migrate.ts` for legacy data-migrations whose effects are already captured in the dump. 62 historical pre-dump migrations marked skip-mode (ledger-recorded without re-execution).
3. **Initial seed data (chunk 7):** Captured config-table seed via `pg_dump --data-only --column-inserts --table=public.module_constants --table=public.screener_filters` (599 rows total) as `drizzle/migrations/2026-04-22b-initial-seed-data.sql`. Without this, getCachedNumberRequired calls hit "required row missing" on every module_constants key.
4. **Per-test assertion + mock fixes (chunks 5, 8-14):** DSE_CONFIG Proxy export (was a broken module-level binding), b-new-36-lifecycle-controller Drizzle SQL params extraction (Drizzle's sql template tag pushes raw param values directly into queryChunks alongside StringChunks), b70 vi.hoisted() pattern for mock-fn-in-vi.mock-factory, b-phase-a2 sector_coverage_floor mock branch, b-new-42 universe-seed-in-beforeEach for the discontinuity detector. 6 deprecated tests deleted (asserted removed behavior): 2 b79-0d 24/7 short-circuit, 2 b68-5 slope-gate, 4 b73 variant tests (Variant F gained post-target trailing in B73.3; E/J/gap-bar all depended on the old F semantics). Phase-19 follow-up registered for all 6 test rewrites.

Staging coordination SQL committed at `1-system-manual/staging-coordination/2026-04-22-initial-schema-mark-applied.sql` — marks both initial-schema + initial-seed-data as applied on staging before the next staging `db:migrate` run (so the dump migrations don't conflict with the already-populated staging schema).

### Phase 3 — Lock CI per-batch confirmation rule

Added CLAUDE.md §5 #19: every batch close MUST verify all 4 CI jobs are green on the head commit before marking complete. Cites `gh run list` / `gh run watch` procedure + requires the run ID + green status in completion reports. B-NEW-43 itself is the first-time application.

### Phase 4 — System-alerts active-push fix (RUNNING_ISSUES #135)

`scripts/system-alerts.ts` extended:
- Telegram push routing extended: critical → Kyle DM (unchanged) + group topic 21 (new); warning → group topic 21 (new); info → no push.
- New `invokeLangstonForAlert()` — fire-and-forget SSH+claude -p to Helsinki carrying the alert body so a Langston session runs the §10.5 surfacing on his side. Disable knob `LANGSTON_INVOKE=0`.
- Markdown parse-failure auto-fallback to plain text.

Code shipped + CI green (commit `bf60d8f`). Staging dispatcher dry-run with `LANGSTON_INVOKE=0` confirmed the code path runs cleanly. **STAGING WIRING DECISION DEFERRED TO KYLE** per RUNNING_ISSUES #135 — the bot token file `/etc/langston/ccdt-bot.env` exists on Helsinki but not on Frankfurt (staging). End-to-end Step 7/8 verification pends Kyle's choice on credential placement.

## Scope objectives — YES / NO / PARTIAL

| # | Objective | Status | Evidence |
|---|---|---|---|
| 1 | All 4 CI jobs green on migration branch | YES | CI run `26343291671` (head commit, all 4 ✓) |
| 2 | TypeScript Check job uses baseline-comparison gate, no `continue-on-error: true` | YES | `.github/workflows/ci.yml` typecheck job + `scripts/check-tsc-baseline.mjs` |
| 3 | Test Suite job has working CI Postgres + db:migrate flow | YES | `pgvector/pgvector:pg17` service + db:migrate step in test job |
| 4 | Anti-graveyard discipline (no new escape hatches) | YES | 1 sanctioned `as unknown as` (chunk 4); zero `@ts-expect-error` / `@ts-ignore` / new `as any` / new `!` |
| 5 | Latent bugs surfaced are fixed or registered for Phase 19 | YES | 2 fixed in-flight (chunk 1); 5 registered to #137 |
| 6 | Phase 19 intake list populated | YES | RUNNING_ISSUES #137 (chunk-6 seed + ongoing augments) |
| 7 | Phase 16 legacy register populated | YES | RUNNING_ISSUES #136 entries (a)-(h) |
| 8 | 19-before-16 resequencing decision recorded | YES | POST_AUDIT_ROADMAP.md "2026-05-23 update — Phase 19 runs BEFORE Phase 16" |
| 9 | Initial-schema migration created + manifest gate operational | YES | `drizzle/migrations/2026-04-22-initial-schema.sql` + `MANIFEST.txt` + db-migrate validator |
| 10 | Initial seed data migration created | YES | `drizzle/migrations/2026-04-22b-initial-seed-data.sql` |
| 11 | Staging coordination SQL documented + committed | YES | `1-system-manual/staging-coordination/2026-04-22-initial-schema-mark-applied.sql` |
| 12 | CI per-batch confirmation rule codified | YES | CLAUDE.md §5 #19 |
| 13 | System-alerts active-push code shipped | YES | commit `bf60d8f`, CI green |
| 14 | System-alerts active-push verified end-to-end on staging | PARTIAL | Code path verified cleanly with `LANGSTON_INVOKE=0`; full Telegram push pends Kyle's credential-placement decision per RUNNING_ISSUES #135. Scope §5 escape clause invoked. |

## Anti-graveyard accounting (full batch)

Across all 4 phases + 32 chunks:
- New `as any`: **0**
- New `@ts-expect-error`: **0**
- New `@ts-ignore`: **0**
- New non-null `!`: **0**
- New `as unknown as`: **1** (chunk-4 `req.mode` x-app-mode boundary cast, sanctioned by Langston as same pattern as chunk-7 JSON-boundary)
- Test-file deletions: **6** tests (deprecated behavior, all registered to Phase 19 #137 for rewrite)
- Test-file modifications: **~20** harness fixes (universe-seed, prefetchModule, mock parsing, fixture modernization)

Discipline upheld for the full 208-tsc-error + 103-test reduction.

## Behavior-capable changes

The batch was scoped CI-only with one runtime change in Phase 4. Behavior changes by phase:

- **Phase 1 chunk 1:** Re-activated empty-data paths in `paper-portfolio-manager.ts` + `paper-48hr-simulation.ts` (userId-as-mode-key bug fix). Pre-fix historical metrics from those surfaces are SUSPECT — registered as `BUG-2026-05-23-A` in CHANGES_AND_FIXES.
- **Phase 1 chunk 2:** Deleted 5 dead AI-Opportunities route handlers (returned 500s pre-deletion). Companion frontend orphans flagged in #136(c). Registered as `BUG-2026-05-23-B`.
- **Phase 1 chunks 13-14:** 4 routes.ts diagnostic re-activations (lastUpdated typo, kraken import path, getAllAlerts rename, getErrorLogs rename) — low-risk diagnostic surfaces, none trading-active.
- **Phase 2 chunks 4.0-4.7:** db-migrate runner now reads `MANIFEST.txt` (REQUIRED, hard-fail if missing) + supports `-- db-migrate:skip` marker. Behavior change for the migration runner only; staging coordinated via the one-time mark-applied SQL.
- **Phase 4:** system-alerts dispatcher pushes to group topic 21 + invokes Langston SSH on warning+critical promotions. Code-shipped; end-to-end deferred per #135.

No active-trading-path behavior changes. The userId-as-mode-key fix in chunk 1 is the most material runtime-behavior change — it restored data flow to two legacy surfaces; review of historical metrics from those surfaces is the appropriate follow-up.

## Governance updates landed this close

Per CLAUDE.md §3 Tier 1 + Tier 2:

1. **`Claude Comms and Packages/Batch Completion/B_NEW_43_COMPLETION_REPORT.md`** (this file)
2. **`Claude Comms and Packages/Batch Completion/B_NEW_43_PHASE_1_COMPLETION_REPORT.md`** (Phase 1 milestone — landed 2026-05-23)
3. **`1-system-manual/POST_AUDIT_ROADMAP.md`** — Phase 19-before-Phase-16 resequencing recorded (chunk 5191675a)
4. **`1-system-manual/RUNNING_ISSUES.md`** — #135 status updated to "code complete / staging wiring follow-up"; #136 augmented to (a)-(h); #137 (Phase 19 intake) seeded + augmented with 8 Phase-19 follow-up clusters (b73 variant tests, b68-5 momentum-gate tests, b79-0d ORB tests, b-new-36 audit-row mock, schema-drift sites, etc.)
5. **`1-system-manual/SYSTEM_IMPACT_MAP.md`** — "B-NEW-43 Phase 1 — CI typecheck baseline-comparison gate" Recent Additions block (chunk 5191675a)
6. **`1-system-manual/SYSTEM_MANUAL.md`** §12.6 — DB bootstrap branch documented (Path A fresh-empty-PG vs Path B bootstrap-from-dump)
7. **`1-system-manual/CHANGES_AND_FIXES.md`** — BUG-2026-05-23-A (paper-portfolio-manager userId-as-mode-key) + BUG-2026-05-23-B (dead AI-Opps routes)
8. **`CLAUDE.md`** — §5 #19 (CI per-batch confirmation rule, Phase 3)
9. **`1-system-manual/staging-coordination/2026-04-22-initial-schema-mark-applied.sql`** — NEW file, marks initial-schema + initial-seed-data as applied on staging
10. **`.claude/memory/MEMORY.md`** (+ persistence copy) — Phase-by-phase progress recorded throughout
11. **BATCH_CATALOG.md entry** — added below
12. **PHASE_HISTORY.md entry** — added below

## CI status at close

Push of Phase-4 (`bf60d8f` → `3ba5e63` after a rebase) run **`26343291671`**:
- TypeScript Check (baseline gate): ✓
- Test Suite: ✓ (1417 passed / 7 skipped / 0 failed)
- Build: ✓
- Docker Build: ✓

All 4 green. First-time enforcement of CLAUDE.md §5 #19 rule satisfied.

## Phase 19 intake summary

Total RUNNING_ISSUES #137 follow-ups generated by B-NEW-43:
- 5 latent shape-drift sites (Phase10TradeRecord builder, SQESignalInput orchestrator-producer mismatch, etc.)
- 3 schema-drift-fingerprint sites (fx5-scanner familyPaths, storage:3769 portfolio_state drift, storage:4201 stoppedBy)
- 6 deprecated-test rewrites (2 b68-5 momentum-gate, 4 b73 variant)
- 2 deprecated-test rewrites (b79-0d ORB 24/7)
- 1 cost-telemetry regime-tag misleadingness
- The full Phase-19 intake list seeded from `.tsc-baseline.json` files[] with phase_tag.startsWith("Phase 19")

Phase 16 legacy register #136 has entries (a) through (h) including the diagnostic-controller bobInspector stub surfaced at Phase 1 close.

## Open follow-ups (not blocking B-NEW-43 close)

1. **RUNNING_ISSUES #135 staging-wiring decision (Kyle):** scp `/etc/langston/ccdt-bot.env` from Helsinki to staging Frankfurt? Migrate dispatcher to Helsinki? Add proxy? Code green; ops choice deferred.
2. **Active alert `616dfcf3` (B79.0n.MCE 24h soak):** still active + unacknowledged. Initial inspection found ZERO recurring CACHE_REFRESH log lines (only one at deploy time). May indicate (a) probe is deploy-only-not-recurring (in which case alert wording is misleading) or (b) refresh path broken. Surface to Kyle for proper investigation.
3. **Crypto-trade-rate-spike investigation hook (Kyle 2026-05-22):** check `module_constants` / `screener_filters` / regime-classifier rows scoped to `crypto_spot` for any unintended drift introduced by xStocks onboarding batches. Logged in MEMORY parked items.
4. **Staging coordination SQL execution** before next staging db:migrate run (operator action: `psql "$DATABASE_URL" -f 1-system-manual/staging-coordination/2026-04-22-initial-schema-mark-applied.sql`).

## Next phase

**Resume B79.0n umbrella sub-batches 5-18** (~14 sub-batches remaining; xStocks active-trading-path audit). Per Kyle's autonomous-run grant + scope, B-NEW-43 was the prerequisite — now the CI gate is sustainable and we can resume the xStocks onboarding work.

After B79.0n umbrella close: **Phase 25 — Adaptive Market Response** (Kyle confirmed 2026-05-23, moved from §18.9 to Phase 25). Then **Phase 19** active-trading audit walkthrough (which consumes the RUNNING_ISSUES #137 intake list).

---

— Claude Code + Langston, 2026-05-23
