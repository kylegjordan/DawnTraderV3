# B-NEW-43 Phase 1 — Completion Report (CI typecheck recovery)

**Status:** CLOSED 2026-05-23. Langston Step-4 ACK at every chunk + Phase 1 close proposal ACK. Phase 2 (test failures), Phase 3 (CI lock), Phase 4 (system-alerts active-push) remain within the B-NEW-43 umbrella as separate phases.

**Scope reference:** `Claude Comms and Packages/Scope Files/B_NEW_43_CI_RECOVERY_SCOPE.md` rev3.
**Pre-audit reference:** `Claude Comms and Packages/Scope Files/B_NEW_43_CI_RECOVERY_PRE_AUDIT.md` (incl. §13 Step-2 consensus addendum + §13.3 b-new-42b verify).

---

## Headline

**TypeScript error count 696 → 488 across the migration branch — −208 errors / 30% reduction.** Baseline frozen per-file per-code in `.tsc-baseline.json` (488 errors / 68 files). CI typecheck gate (`scripts/check-tsc-baseline.mjs`) installed at chunk 5, hard-gates on every push since (no `continue-on-error: true` — the original silent-regression mechanism is gone). Anti-graveyard discipline held across all 18 chunks: zero new `@ts-expect-error`, zero new `@ts-ignore`, zero new `as any`, zero new non-null assertions, one sanctioned `as unknown as` (chunk-4 `req.mode` x-app-mode boundary cast — same JSON-boundary pattern Langston approved at chunk 7).

All remaining 488 baseline errors are classified Phase 19 (active-trading-path restoration walkthrough — 54+ files / ~296 errors) or Phase 16 (legacy-cleanup register — RUNNING_ISSUES #136). The mechanical sweep is drained at the right line; deeper picking belongs to Phase 19's structured walkthrough, not mid-Phase-1 ad-hoc.

## Chunk inventory

| Chunk | Δ tsc | Topic | Push commit |
|---|---|---|---|
| 1 | 696→656 (−40) | TS2304 `TradingMode` missing-import in `storage.ts` — surfaced + fixed real latent userId-vs-mode bug in `paper-portfolio-manager.ts` (7 sites) + `paper-48hr-simulation.ts` (3 sites) | `387b2d3` |
| 2 | 656→646 (−10) | TS2304 dead AI-Opportunities routes deleted (5 handlers, `aiOpportunitiesService` removed in prior cleanup) + 3 genuine missing imports added | `bf78c46` |
| 3 | 646→634 (−12) | TS2304 settings cluster (per-case investigations; legacy `getTradingSettings` migrations in dead methods of command-router / stage-b-validator / historic-signal-generator) + signal-orchestrator family-map vars + OpenAI legacy + remaining TS2304 singletons | (multiple) |
| 4 | 634→621 (−13) | TS2339 `req.user.tradingMode` cluster — REDONE via `req.mode` (request-declared mode) after Kyle's per-user-trading drift alarm; canonical `as unknown as` boundary cast for the x-app-mode header path | (multiple) |
| 5 | 621→621 | Baseline freeze (585 / 91 at freeze, commit `0519224`) + `check-tsc-baseline.mjs` per-file per-code gate + ci.yml `continue-on-error: true` removal | `0519224` |
| 6 | 621→621 | Full 91-file `phase_tag` + `context` audit (Phase 19 / Phase 16 / B-NEW-43 / current-operational classifications) + Phase-19 intake seed in #137 + Phase-16 register seed in #136 | (audit-only) |
| 7-13 | 621→519 (−102) | Mixed mechanical clean-clearance: TS2554 (signature mismatches), TS2769 (overload not-matches), TS18046 (truthy on `unknown`), TS2339 (Boolean fields after IIFE narrowing), 4 routes.ts diagnostic re-activations (lastUpdated typo, kraken import path, getAllAlerts rename, getErrorLogs rename) | (multiple) |
| 14 | 519→513 (−6) | TS2554 signature-mismatch cluster | (one push) |
| 15 | 513→506 (−7) | Phase 41F-L userId-purge stragglers — server-services subset (5 files / 7 multi-line shorthand sites). Initial broad-script attempt over 27 sites caused silent-tsc-crash (513→2); reverted, restarted with stricter regex + per-site Edit | `b24c213` |
| 16 | 506→501 (−5) | routes.ts multi-line userId stragglers 5-of-6. Site `routes.ts:14151` (`storage.createTrade`) HELD — cascade bisection revealed it as sole cascade culprit. Underlying broken shape: simulator literal supplies 14 fields, schema requires ~45 (+strategy/strategyName mismatch). Properly flagged to Phase 16/19 review per "bisect-and-hold" precedent | `b4585ca` |
| 17 | 501→493 (−8) | routes.ts single-line userId TS2353 sites (`storage.getLatestCalibration` + `storage.listStrategySettingsAudit`) | `344b680` |
| 18 | 493→488 (−5) | `cle-orchestrator.ts` (4 sites) + `market-scan-task.ts` (1 site) single-line userId. 2 files DROPPED entirely from baseline (their only remaining errors were these userIds) | `ccf58e6` |

**Latest baseline: `.tsc-baseline.json` — 488 errors / 68 files / `last_synced_at_iso: 2026-05-23T10:06:53.917Z` / `last_synced_by_batch: B-NEW-43 (chunk 7+ — sync after clean-error fixes)`.**

## Scope objectives — YES / NO / PARTIAL

| # | Objective (from scope rev3 §3 Phase 1) | Status | Evidence |
|---|---|---|---|
| 1 | Reduce TS error count via mechanical clean-clearance fixes (~80-130 distinct) | YES | −208 (above high-end of estimate); 18 chunks |
| 2 | Anti-graveyard discipline (no `@ts-expect-error` / `@ts-ignore` / new `as any` / new `!` additions) | YES | Anti-graveyard accounting in §X below |
| 3 | No new latent bugs introduced; latent bugs SURFACED documented | YES | 4 surfacings documented (paper-PM-userId-as-mode, RTB silently swallowing ngc throw, B70.2 archive silently writing undefined, scaled-loss-scenario simulator broken) |
| 4 | Per-batch enumeration of `as unknown as` additions, soft cap ~10 without Kyle approval | YES | 1 add (chunk 4 req.mode), well under cap |
| 5 | Baseline-comparison gate operational + no `continue-on-error: true` on typecheck | YES | `scripts/check-tsc-baseline.mjs` + `ci.yml` typecheck job (chunk 5 onwards) |
| 6 | Per-file per-code baseline (not total count) prevents trade-fix-for-new-error silent regression | YES | Gate semantics enforced; chunks 7-18 confirmed by sync diffs |
| 7 | Phase 19 intake list populated from baseline `files[]` with `phase_tag.startsWith("Phase 19")` | YES | RUNNING_ISSUES #137 (chunk-6 seed + Phase-1-close augmentation) |
| 8 | Phase 16 legacy register populated for in-flight legacy surfacings | YES | RUNNING_ISSUES #136 (entries a-g + bobInspector stub from Phase-1-close) |
| 9 | 19-before-16 resequencing decision recorded | YES | POST_AUDIT_ROADMAP.md update + #137 closing paragraph |
| 10 | Local typecheck environment for fast iteration off the GDrive FUSE mount | YES | `C:\dev\DawnTraderV3` shallow-clone mirror per CLAUDE.md §7.1 |

## Anti-graveyard accounting (full Phase 1)

Searched all 18 chunks for new escape-hatch insertions in committed diffs:

- New `as any`: **0**
- New `@ts-expect-error`: **0**
- New `@ts-ignore`: **0**
- New non-null `!`: **0**
- New `as unknown as`: **1** — chunk-4 `req.mode` x-app-mode boundary cast (sanctioned, same pattern Langston approved at chunk-7 JSON-boundary)

Discipline upheld for the full 208-error reduction.

## Behavior-capable changes (full Phase 1)

Per Langston's chunk-13/14 Step-4 review framework — fixes that re-activated previously silent-failing code paths, kept within ~5 per chunk soft cap and documented:

1. **Chunk 1 — paper-portfolio-manager.ts (7 sites) + paper-48hr-simulation.ts (3 sites):** were passing `this.userId` where mode-keyed paper-sim storage API expected `TradingMode`. Lookups returned empty — 48h-sim reports + paper portfolio metrics ran on empty data, possibly for an unknown long period. **Pre-fix historical metrics from those 2 sources are suspect** (Langston note 2 at Phase-1-close, recorded in CHANGES_AND_FIXES entry).

2. **Chunk 2 — 5 dead AI-Opportunities route handlers removed:** `aiOpportunitiesService` exported nowhere (removed in a prior cleanup). The routes returned 500s when called. Removed cleanly; the orphaned frontend (`ai-opportunities-tab.tsx` + `validation-reports-tab.tsx`) now flagged in #136(c) for Phase 16 removal.

3. **Chunks 13-14 — 4 routes.ts diagnostic re-activations:**
   - `lastUpdated` typo (was reading non-existent property; now reads correct `lastUpdate`)
   - `kraken` import path corrected
   - `getAllAlerts` rename surfaced (previous name unbound)
   - `getErrorLogs` rename surfaced
   All low-risk diagnostic surfaces (none trading-active); Langston ACK at the time noted "within ~5/chunk cap, properly documented."

No active-trading-path behavior changes. The userId-fix in chunk 1 is the most material — it restored an empty-data path to a working data path; review of historical metrics from that surface is the appropriate follow-up.

## Latent bug surfacings (recorded for Phase 19 / Phase 16)

Documented in #137 (Phase-19 intake) closing paragraph:

(a) **`Phase10TradeRecord` shape drift** — `server/services/vts-runner.ts:1543` builder never sets ~13 fields read by the B70.2 at-entry-context archive at lines ~1882-1921; archive silently writes undefined for `entryPrice` / `takeProfit` / `stopLoss` / `quantity` / `expectedEdge` / `phase` / `phaseAgeSeconds` / `strategyPhaseWeight` / `pairIdHash` / `atrAtOpen` / `regimeConfidenceRaw` / `macroModifierValue` / `regimeConfidenceModulated`.

(b) **`SQESignalInput` shape drift** — `server/core/rtb/ready_to_buy_service.ts:1595/1652/1653/1656/1692/1693/1701` reads `input.ngc` / `input.riskScore` / `input.profitRate` never set by the signal-orchestrator producer (~lines 643-669) or declared on the interface (lines 88-114). `input.ngc.toFixed(4)` at 1595 would throw on undefined and the orchestrator wraps the call in `.catch()` — RTB queueing via that path may be silently failing. Phase 19 owns the resolution.

(c) **`routes.ts:14151 storage.createTrade`** — broken simulator literal supplies 14 fields where the InsertTrade type requires ~45, with a `strategy` vs `strategyName` field-name mismatch on top. Properly flagged to Phase 16/19 review (HELD via chunk-16 bisect-and-hold precedent).

(d) **`storage.ts:3769 + 11167 upsertPortfolioState` portfolio_state schema drift** — `cash`, `cryptoValue`, `totalValue`, `unrealizedPnl`, `realizedPnl`, `lastUpdated` fields written but not in the type. Phase 19 owns.

(e) **`diagnostic-controller.ts:53,107 BobInspectionReport`** — `bobInspector` removed (directive 12.2.3) but the stub still references `commandId` not in the type. **Not dead code** per Langston Phase-1-close spot-check — both `triggerErrorInspection` + `triggerUserDiagnostic` still construct + return the command. Phase 19 owns.

(f) **`actuation-policy.ts:263 createProposedAdjustment`** — field named `currentValue` in code, schema column probably `oldValue` — latent persistence bug. Proposed adjustments not writing the "old value" to the right column. Phase 19 owns (active actuation governance touches the adjustment framework).

## Governance updates landed this close

1. **`Claude Comms and Packages/Batch Completion/B_NEW_43_PHASE_1_COMPLETION_REPORT.md`** — this file.
2. **`1-system-manual/RUNNING_ISSUES.md`** — #137 augmented (Phase-19 intake closing paragraph adds B43-adjacent schema-drift sites: fx5-scanner:1453 `familyPaths`, storage:3769 portfolio_state drift, storage:4201 `stoppedBy`, per Langston Phase-1-close note 1). #136 augmented (entry h: `diagnostic-controller.ts` bobInspector stub).
3. **`1-system-manual/POST_AUDIT_ROADMAP.md`** — 19-before-16 resequencing recorded.
4. **`1-system-manual/SYSTEM_IMPACT_MAP.md`** — `scripts/check-tsc-baseline.mjs` + the per-file per-code gate added to CI infrastructure map.
5. **`1-system-manual/CHANGES_AND_FIXES.md`** — chunk-1 paper-portfolio-manager / paper-48hr-simulation userId-as-mode latent bug fix entry with historical-metrics-suspect flag (per Langston note 2). Chunk-2 dead-route deletion entry.
6. **`.claude/memory/MEMORY.md`** + persistence copy `G:\...\.claude\memory\MEMORY.md` — Phase 1 close state, Phase 2 next.
7. **`/home/langston/MEMORY.md`** on Hetzner — same.
8. **NOT updated this close (deferred to full B-NEW-43 batch close):** `BATCH_CATALOG.md`, `PHASE_HISTORY.md`. B-NEW-43 has 4 phases; only Phase 1 is complete. Batch-level governance closes when all 4 phases land.

## CI status at close

Push of chunk-18 (`ccf58e6`) run `26330002338`:
- TypeScript Check (baseline gate): ✓
- Build: ✓
- Docker Build: ✓
- Test Suite: ✗ (98 failing tests — pre-existing Phase-2 work, separate phase per scope rev3 §3)

Phase 1's CI responsibility is the typecheck gate; that's green.

## Next phase

**Phase 2** — test failures (~98 across 20 files): module-warming via `npm run db:migrate` (NOT `db:push` — broken on this schema per Step-2 consensus, scope §13) + CI Postgres + assertion-tail fixes + xstock-universe harness seeding (the b-new-42b cross-batch regression fix per pre-audit §13.3).

**Phase 3** — lock CI (per-batch CI-status confirmation rule).

**Phase 4** — system-alerts active-push notification (RUNNING_ISSUES #135 — the `fire-due` dispatcher gains Telegram-post + Langston-invoke on promotion).

Per scope §5 escape clause: if Phases 0-3 close green but Phase 4 snags, B-NEW-43 closes on the CI work + Phase 4 splits to a follow-up.

## Closing

Phase 1 closed via 18 chunks, per-chunk Langston Step-4 ACK on each, no escalations to Kyle for arbitration (autonomous CC↔Langston loop held end-to-end after Kyle's autonomous-run grant). Mirror clone (`C:\dev\DawnTraderV3`) is now standing fixture for Phase 2+ local iteration.

— Claude Code, 2026-05-23
