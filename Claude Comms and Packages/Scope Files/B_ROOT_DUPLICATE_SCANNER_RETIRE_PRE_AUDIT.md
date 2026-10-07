# B-ROOT-DUPLICATE-SCANNER-RETIRE — PRE-AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · **Issue:** `#1161` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 2a0d (absorbs `PHASE_19_PLAN` 3n.a) · **Owner:** CC-B
**Scope:** `B_ROOT_DUPLICATE_SCANNER_RETIRE_SCOPE.md` r2 (`c11f2f09d`), Langston Step-1 PROCEED with C1-C5.
**Read at:** `origin/migration/aws-supabase` (head `c31e22767`); staging `out*.log` 2026-10-06/07.

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED: `centralClock.subscribe` has 7 code sites (2a0b pre-audit §1b), 5 live subscribers. NOW: 8 code sites; 6 outside the twins, of which 5 are live — the 6th, `server/core/system/trading_scheduler.ts:66`, is DEAD code.** REASON: §A1 enumerates every site at the ref; §A2 shows the scheduler has no importer and never starts. The 2a0b record is corrected at Step 10.

## SOURCES READ
| # | source | read |
|---|---|---|
| 1 | code | every `centralClock.subscribe(` site at the ref; the three scanner copies; `server/core/system/trading_scheduler.ts` (whole); the nine root `test-*.ts` and their imports; `server/services/behavioral-template.ts`, `schema-audit.ts`, `provenance-governance.ts` importers; `tsconfig.json`, `vitest.config.ts` |
| 2 | runtime | staging `out*.log` (2026-10-06 02:36Z → 10-07): the scheduler's start line vs a live subscriber's |
| 3 | System Impact Map | the Central Clock subscriber list (5 live) — correct as a RUNTIME list; the 2a0b pre-audit's CODE census (7) is the record to correct |
| 4 | System Manual | the Central Clock chapter — unaffected (no live subscriber changes) |
| 5 | ledger | `#1161`; `PHASE_19_PLAN` 3n.a (struck, absorbed); `DELETED_COMPONENTS_LOG` "left intentionally" conventions |
| 6 | provenance | root twin `b4ff71025` 2026-03-20; `BATCH_19G_HF2/` `238d33154` 2026-03-19 (*"Batch 19G HF2: Fix pattern filter DB field mapping"* — a Replit patch drop: `INSTRUCTIONS.md` + two service copies); `trading_scheduler.ts` `57f8a05bd` 2025-12-20 (*"Align trading engine subsystems and improve performance metrics"*); the nine scripts 2025-10-12/21 (Replit Tasks 7-10) |

## A. AUDIT
**A1 — `centralClock.subscribe` code sites at the ref (C1 + C3's instrument).** Search: `git grep "centralClock.subscribe(" <ref> -- . ':!*.md' ':!server/tests'`; control: the same form finds the 5 known live sites. Code sites (`.ts`, not archived): `server/services/fx5-scanner.ts:603` (FX5Scanner) · `server/asset_classes/xstock_spot/scanner.ts:246` (XstockSpotScanner) · `server/core/rtb/tcl_watchdog.ts:126` (`TCL_<mode>`) · `server/services/rtb-refresh-service.ts:217` (RTBRefreshService) · `server/utils/market-events.ts:411` (MarketEventScheduler) · **`server/core/system/trading_scheduler.ts:66`** · **root `fx5-scanner.ts:292`** · **`BATCH_19G_HF2/server/services/fx5-scanner.ts:292`**. Non-code hits (an archived `.removed`, a change-list diff, an audit JSON, an `attached_assets` directive) are history and untouched.

**A2 — the scheduler is dead (a find inside this batch's class — §9.4 disposition 1, folded).** `tradingScheduler` (`trading_scheduler.ts:136`) has **zero importers** in `server/`, `shared/`, `client/`, `scripts/` (control: the same search finds 8 files importing `rtb-refresh-service`); it is the only file in `server/core/system/`; no folder-level import. Its start line `[A3.R9.0][SCHEDULER] Started` appears **0** times in the retained staging logs (control: `RTBRefreshService` 3). It would subscribe under its own id and call `centralClock.start()` if ever started — the same hazard class as the twins. **Disposition (5): delete.**

**A3 — the three scanner copies.** (a) root `fx5-scanner.ts` (1,174 lines) and (b) `BATCH_19G_HF2/` (`fx5-scanner.ts` 1,135 + `market-scanner.ts` 853 + `INSTRUCTIONS.md`): zero importers (Langston: 13 importer sites, all resolving inside `server/`), outside `tsconfig` `include`, zero `.tsc-baseline.json` entries ⇒ deleting them cannot move the tsc baseline. **Disposition (5): delete both, the whole `BATCH_19G_HF2/` folder.** (c) `docs/current_state/screeners_export/` — a curated export of the whole screener (`MANIFEST.md`, `README.md`, `backend/` 11 files, `frontend/`), made for a past review; its `fx5-scanner.ts` (320 lines) has no subscribe call and is not compiled. **Disposition: KEPT as a labelled historical export** — named in `DELETED_COMPONENTS_LOG`'s left-intentionally list so a later grep is not read as a missed sweep.

**A4 — the nine root scripts (objective 2; C5: a delete needs no execution).**
| script | imports | what it does | disposition |
|---|---|---|---|
| `test-adjustable-guardrails.ts` | `server/services/risk-manager` **MISSING** | — cannot load | (5) delete |
| `test-stagec-validation.ts` | `server/services/stage-c-validator` **MISSING** | — cannot load | (5) delete |
| `test-watchlist-execution.ts` | `server/services/nlai-interpreter` **MISSING** | — cannot load | (5) delete |
| `test-adjustable-guardrails-simple.ts` | `server/storage` | hand-run guardrail checks against 2025-10 storage APIs (guardrails since moved to v2) | (5) delete |
| `test-behavioral-integration.ts` | `server/services/behavioral-template` | exercises a module with **zero live importers** (A5) | (5) delete |
| `test-safety-enforcement.ts` | `server/services/behavioral-template` | same | (5) delete |
| `test-validation.ts` | `server/services/strategy-validator` | report generator: runs `runAllTests('test-user-id')`, writes `docs/strategy-validation-report.md` — not a test (no assertion) | (5) delete — the live route already runs the validator |
| `test-stageb-validation.ts` | `stage-b-validator` + `storage` | report generator for a hard-coded Replit test-user uuid, writes `docs/…stageb-report.md` | (5) delete |
| `test-historic-replay.ts` | `stage-b-validator` | report generator, 90-day replay, writes `docs/…historic-report.md` | (5) delete |
No script is proposed for (2) keep-and-wire, so **none is executed** (C5). The two validators they call remain live through `routes.ts` and are untouched.

**A5 — `behavioral-template.ts` (569 lines) has zero live importers** (only the two root scripts above; control as A2). **§9.4 disposition 1 — folded** (same zero-importer class as the scope's 2b pair). **Disposition (5): delete** — its importer census at Step 3 includes dynamic imports by path and by name.

**A6 — the scope's 2b pair.** `schema-audit.ts` (253) — only importer `provenance-governance.ts:12`; `provenance-governance.ts` (556) — zero importers (2a0c §A1b, control 25). Both default their report paths to `/home/runner/workspace` (the Replit layout). **Disposition (5): delete both.**

**A7 — documents pointing at deleted scripts (C4's enumerated population):** `docs/task-10-1-adjustable-guardrails.md` (4), `docs/task-10-behavioral-integration-report.md` (4), `docs/task-7-validation-final-report.md` (3), `docs/task-7-completion-summary.md` (1), `docs/audits/phase-8.8.1-8.8.2-audit.json` (1). Each gets a one-line header note naming the deletion and its log entry; the `attached_assets/` dumps are pasted directives (history) and are not edited.

## B. PLAN (each item points at its finding)
1. Delete root `fx5-scanner.ts` and the `BATCH_19G_HF2/` folder (3 files). *(A3)*
2. Delete `server/core/system/trading_scheduler.ts`. *(A2)*
3. Delete the nine root `test-*.ts`. *(A4)*
4. Delete `server/services/behavioral-template.ts`, `schema-audit.ts`, `provenance-governance.ts`. *(A5, A6)*
5. Each deletion: `DELETED_COMPONENTS_LOG` entry (what / why / importer census with control / archive path / commit) + `_archive/deleted-code/<name>.removed` copy; the docs export (A3c) listed as LEFT INTENTIONALLY.
6. Header notes on the five documents (A7).
7. **Verify (C3):** a fence test `b-root-duplicate-scanner-retire.test.ts` enumerating every `centralClock.subscribe(` site in compiled code (`server/**`, `shared/**`) and asserting the set equals the five live subscribers' sites; positive control in the same test (the enumeration finds `rtb-refresh-service.ts`); plus absence fences for every deleted path. `tsc` baseline unchanged or lower; CI 4/4.
8. **Runtime no-change control (labelled, not the test):** after the next deploy, the clock's subscriber list still reads the same five.
9. **Step 10:** the 2a0b pre-audit's census line corrected (7 → 8 code sites, 5 live, the scheduler named); System Impact Map's Central Clock entry gains a one-line note that no non-live copy carries a subscribe after this batch; `PHASE_19_PLAN` 3n.a already struck.

No item is UNAUDITED.

## C. HONEST LIMITS
- The runtime evidence for A2 is the retained log window (about one day); the zero-importer census is what makes it dead, the log is corroboration.
- A deletion of uncompiled files cannot fail CI; the fence (item 7) is what makes the result checkable.

## D. LANGSTON STEP-2 PROCEED (2026-10-07 ~05:15Z) — four conditions, carried into Step 3
- **C-1 — every deletion subject gets its introducing commit and an intent read, not a zero-importer count.** `behavioral-template.ts` (569 lines, live exports `detectIntent`, `fetchUserContext`, `getBehavioralGuidance`, `enhancePrompt`, `validateResponse`) **WAS wired:** `audit_userid_refs.txt:503` records `server/services/system-truth-diagnostic.ts:10: import { fetchUserContext } from './behavioral-template'`; `system-truth-diagnostic.ts` is gone at the ref and **its removal is not in `DELETED_COMPONENTS_LOG`** — unrecorded drift, not a recorded disposition. Step 3 states each of the three files' introducing commit and intent; the expected disposition is still (5) — the surviving fragment of a removed NLAI family (`nlai-interpreter` is one of A4's three missing modules) — stated with the commits. The retroactive `system-truth-diagnostic` note folds into the same log entry (§9.4 disposition 1).
- **C-2 — A2's "same hazard class as the twins" is wrong in kind.** The twins collide on id `'FX5Scanner'`, so `central-clock.ts` REPLACES the live scanner's handler; the scheduler subscribes under `'TradingScheduler'` (`trading_scheduler.ts:25`), so it would ADD a fan-out (and `centralClock.start()`). Both earn deletion; the log keeps the two mechanisms separate. The runtime evidence uses the constructor line `[A3.R9.0][SCHEDULER] TradingScheduler initialized` (fires on module LOAD, so it also covers a computed-path dynamic import): 0 hits in the retained window, controls `RTBRefreshService` 3 / `MarketEventScheduler` 2.
- **C-3 — the item-7 fence also asserts NO DUPLICATE SUBSCRIBER ID** across the enumerated set — so a new copy re-colliding on `'FX5Scanner'` fails it, not only a new file.
- **C-4 — stated:** `vitest.config.ts` `include: ['server/**/*.test.ts']` keeps the nine root scripts outside the runner; `.tsc-baseline.json` holds **zero** entries for all 13 delete paths (control: 45 `server/` keys) ⇒ item 7's tsc baseline is UNCHANGED, no same-commit `--sync`. Positive-control the Step-3 importer census: an unscoped `fx5-scanner` grep returned a false zero for Langston; scope it to `server/`.

