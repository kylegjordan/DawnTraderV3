# B-ROOT-DUPLICATE-SCANNER-RETIRE — SCOPE (Step 1, r1a)

change-class: non_architecture

**Issue:** `#1161` · **Plan row:** `SPRINT_TO_LIVE_PLAN` 2a0d (after 2a0c) · **Owner:** CC-B · **Origin:** Langston, `B-ENGINE-HEARTBEAT-DEAD-PATHS` Step 2 (2026-10-06): the Central Clock subscriber census found a 7th `subscribe` site in a root-level twin.
**Read at:** `origin/migration/aws-supabase` (head `4761f6b6d`; re-checked at `d8d176cea` before dispatch — the root file set is unchanged).

## 0. What is there (measured)
1. **`fx5-scanner.ts` at the repository ROOT** (1,174 lines; last and only commit `b4ff71025` 2026-03-20, *"Update scanner to include pattern-only trading pairs"*) — an old copy of `server/services/fx5-scanner.ts` (1,905 lines). It calls `centralClock.subscribe('FX5Scanner', …)` at `:292` with the SAME module id as the live scanner; `central-clock.ts` replaces the handler on a duplicate id, so loading it would silently take over the live scanner's tick.
2. **Zero importers.** Every import of `fx5-scanner` in the tree is relative from `server/services/` (`'./fx5-scanner(.js)'`, e.g. `vts-runner.ts:5207/5320`, `adaptive-scan-manager.ts`) and resolves to the live file; no import path from the root or from `server/` resolves to the root copy (search: `from '(./|../)fx5-scanner'` + dynamic `import()`; control: the same search finds the `server/services` importers).
3. **Not type-checked, not built.** `tsconfig.json` `include` is `client/src/**`, `shared/**`, `server/**` — root `.ts` files are outside it, which is why the twin never broke CI and why deleting root files cannot move the tsc baseline (it holds no root-path entries).
4. **The nine root `test-*.ts` scripts** (Langston: census, do not sweep blind): `test-adjustable-guardrails{,-simple}`, `test-behavioral-integration`, `test-historic-replay`, `test-safety-enforcement`, `test-stage{b,c}-validation`, `test-validation`, `test-watchlist-execution`. Introduced 2025-10-12 (Replit: `f60673258`, `951fcc0fb`, `53ca657f5`), run by hand (`npx tsx …`); referenced only by Replit-era docs (`docs/task-10-*.md`, `docs/audits/phase-8.8.1-8.8.2-audit.json`) and `attached_assets/` directives — not by `package.json`, CI, or any code.

## 1. Provenance (TIER 1)
| thing | introduced | intent | disposition |
|---|---|---|---|
| root `fx5-scanner.ts` | `b4ff71025` 2026-03-20 (Replit) | an edit landed on a stray root copy instead of (or beside) the service file; `INFERRED-FROM-CODE` — the commit message names only the feature | **(5) disconnected — delete** |
| root `test-*.ts` ×9 | 2025-10 (Replit, Tasks 7-10 validation harnesses) | manual validation scripts for directives long superseded | **decided per script at Step 2, by READING first** — a script is executed only if its import graph is shown free of database, network and file-write side effects, and **never against staging or any shared database** (r1a: a grep for `db.`/`storage.`/`fetch(`/`DATABASE_URL` hits `test-adjustable-guardrails{,-simple}.ts`, and a grep cannot clear the others because a side effect can sit in an imported module). A script that tests deleted behaviour or cannot run without a live database is **(5) delete**; one that still validates something live is **(2) move under `server/tests/` or `scripts/` and wire it** |

## 2. Objectives
1. **Delete the root scanner twin** (rule 18: `DELETED_COMPONENTS_LOG` + `_archive/deleted-code/fx5-scanner.root-twin.ts.removed`). *Verify:* the importer census at the ref (zero), the live clock subscriber list unchanged after deploy (5, with `FX5Scanner` from the live file).
2. **Disposition each root test script** with evidence (what it exercises; whether that behaviour still exists at the ref; whether it was executed, and if not, why not). *Verify:* a table in the pre-audit, one row per script. *(Root `test-*.ts` are outside vitest's `include: ['server/**/*.test.ts']`, so CI has never run them.)*
3. **Correct the Replit-era docs** that point at deleted scripts (`docs/task-10-*.md`) to say so, rather than leave instructions that no longer work.

## 3. Out of scope
Any change to the live `server/services/fx5-scanner.ts`; the Central Clock (locked module).

## 4. Blast radius
Root-level files only (not compiled, not imported); docs. No runtime behaviour. No deploy needed for the code effect (the twin never loads) — it rides the next deploy for record-keeping only.
