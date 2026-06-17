# BATCH B-GOV — Completion Report (2026-06-17)

> 🚨 **THIS BATCH DOES NOT MAKE THE GOVERNANCE-CHECKER LIVE. THE CHECKER WILL REMAIN INERT (runs on demand only — the backtest) UNTIL THE B-GOV-2 PRE-ACTIVATION INCREMENT (#324) LANDS AND ITS systemd TIMER IS DEPLOYED.** This batch ships the detection core + decision logic + deployment scaffolding, all tested; it does NOT switch on a live watcher. (§9.1 scaffolding-vs-functional declaration.)

**Batch:** B-GOV (standalone governance/process batch — post-batch governance enforcement). Run autonomously with Langston per Kyle's direction; Kyle drove the design.
**Commit (code):** `3d3dce073` · **CI:** run `27696242225` — all 4 GREEN (Test Suite, TypeScript Check baseline gate, Build, Docker Build).
**Design:** `BATCH_B_GOV_SCOPE_CONVERGED_2026-06-17.md` (Step-1 CLOSED) + `BATCH_B_GOV_PRE_AUDIT.md` (Step-2) + `B_GOV_STEP4_CHANGE_LIST.md` (Step-4).

## What shipped
A deterministic governance checker: **the bot does the mechanical facts, Langston does the judgment.** It detects a post-batch governance gap, names it exactly, and (once live) keeps it flagged in the existing §10.5 system-alerts queue until the fix actually lands. **Honest ceiling:** it detects + drives the fix; it does NOT physically block a push (no airtight block without a side branch, which Kyle ruled out).

- `scripts/governance-checker/config.mjs` — SSOT: batch/phase naming + parser (alpha + numeric ids), code/governance path classes, doc registry, per-class expected-doc-set, constants (4h deadline / 30m tick / 48h open-backstop / hollow floor).
- `checker.mjs` — mechanical core: git-log read, commit classification, doc presence (file-glob + entry), emptiness/hollow detection, pre-audit structural check (cites SIM/Manual + file:line markers).
- `poller.mjs` — live watcher: pure `computeBatchStates` + `decideAlerts` (deadline vs doc-gap kept distinct; stale-open route; confirmed-N/A clears) + side-effect wrappers (git fetch, alert sink via the existing `system-alerts` CLI with id-capture, state IO, exceptions-ledger read).
- `backtest.mjs` — **Obj-11 gate**; `poller.test.mjs` — 23 pure-logic tests.
- `governance-checker.{service,timer}` — systemd oneshot + 30-min timer (own process, local-clone-only, isolated from the node event loop).
- `server/services/system-alerts.ts` — `+'governance'` AlertCategory (one union member; tsc baseline clean).
- `CLAUDE.md` — batch & phase naming convention (Obj-9 + Kyle directive 2026-06-17).
- `1-system-manual/GOVERNANCE_EXCEPTIONS.md` — greppable ledger for the 4 self-declared inputs (batch-id, change-class, open-state, umbrella-namespace) + Langston-confirmed N/A skips.

## Verification (outcomes)
- **Obj-11 backtest GATE: PASS** over the last 200 commits — correctly flags **B3b's known missing pre-audit**, does NOT false-alarm on the known-good P19-B6 (all required docs present), emptiness detector flags a hollow doc and clears SYSTEM_MANUAL.
- **`poller.test.mjs`: 23/23** — deadline fires at 5h not 2h; clears on first governance push; doc-gap opens for missing AND **resolves when the doc later lands** (Obj-13); declared-open suspends + stale-open at 48h; confirmed-N/A clears; regex exact-not-prefix incl `P19-B3` ≠ `P19-B3b`.
- **tsc baseline gate (bench, base `d56a0cc`): no regressions** from the category add.
- **Empirical (Step-2):** 4h deadline validated — 13/13 recent closes within 4h, p90 0.6h, max 2.1h. Untagged-code blind spot ≈ 0 (the "68% tagged" was a parser-coverage artifact; all untagged code commits were the letter-named B-NAMES batch).

## Langston review
Step-1 APPROVE (converged design) → Step-2 PROCEED (4h validated; conditions C1–C8) → **Step-4 CHANGES-NEEDED → re-APPROVE "ship it"** after fixing 2 real defects he caught: (1) doc-gap alerts never auto-resolved (only the missing slice was iterated); (2) the filename regex matched `P19-B3` against `P19-B3b` files (bare-letter hole). Both fixed in-batch + new regression tests; section-(d) doc-set bucketing folds (system_manual conditional in non-arch, ADJUSTMENT_FRAMEWORK registered, phase_19_plan required-for-P19 via predicate) landed; resolve() no longer blanket-swallows.

## Self-declared-input hardening (the soft underbelly)
batch-id / change-class / open-state / umbrella-namespace all **fail-closed to the strict default** when undeclared and are audited in `GOVERNANCE_EXCEPTIONS.md`. Forgetting to declare is the noisy failure, never the silent one.

## Coordination (Kyle directive — shared branch)
Coordinated with Claude New (CC-B): it pushed B6.5b first (clean base `d56a0cc1e`), confirmed B6.5b never touches `system-alerts.ts` (zero file overlap), and gave an explicit all-clear. B-GOV committed with pathspec-limited staging (only its 14 files; never `git add -A`). Tree in sync (0 ahead/0 behind at commit).

## Governance files updated (this batch)
- `1-system-manual/BATCH_CATALOG.md` — B-GOV entry (updated)
- `1-system-manual/PHASE_HISTORY.md` — B-GOV narrative (updated)
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — new governance-checker component + its cross-cutting dependency on the alert queue (updated)
- `1-system-manual/RUNNING_ISSUES.md` — **#324 B-GOV-2 pre-activation increment** (new home)
- `1-system-manual/GOVERNANCE_EXCEPTIONS.md` — created (this batch)
- `CLAUDE.md` — naming convention (updated)
- MEMORY.md (both files) — state (updated)
- **SYSTEM_MANUAL.md — N/A** (no architecture/strategy/regime/filter/signal/math change; the checker is process tooling, not trading architecture — SIM-scope, not Manual-scope; recorded as a confirmed N/A).
- **PHASE_19_PLAN.md — N/A** (B-GOV is a standalone letter-named governance batch, not a P19-* batch; consistent with the naming convention + the checker's own REQUIRED_IF predicate which forces phase_19_plan only for P19-* ids).
- **DELETED_COMPONENTS_LOG.md — N/A** (no deletions).

## Named follow-up (§9.4 — concrete home, decided now)
**#324 — B-GOV-2 (HARD pre-activation gate; blocks the timer flip):** (1) change-class declaration + Obj-12 path-heuristic under-declaration guard (without it every batch defaults to `architecture` → false doc-gap REDs once live); (2) dead-man heartbeat silence-detection (`HEARTBEAT_MISS_LIMIT` is defined-but-unwired). C1 (DELETED_COMPONENTS_LOG conditional) stays a safe deferral. The poller stays INERT until B-GOV-2 lands, so the architecture-default false-RED problem cannot fire in production.

**Status:** code CLOSED + CI green + Langston Step-4 APPROVED. Governance landed. Awaiting Langston Step-8 confirmation + Kyle acknowledgment.
