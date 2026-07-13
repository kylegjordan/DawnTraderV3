# B-GOV-ORPHAN-CLASS — Completion Report (governance-checker disposition honesty)

**Batch:** B-GOV-ORPHAN-CLASS · **change-class:** non_architecture · **Owner:** NEW Claude (CC-B) · **Date:** 2026-07-13
**Kyle directive (2026-07-13):** "fix and repair all the old issues per the governance checker's list … and make sure you don't keep making the same mistake." Root cause of the recurring re-flags: the checker re-minted alerts for batches already dispositioned, because a confirmed class-override was never read and the orphan-sweep was class-blind. **Langston: Step-1 + Step-2 + Step-4 + Step-8 ALL PASS (each verified independently at the ref, not on reported fact).**

## Objectives checklist

| # | Objective | Status | Evidence |
|---|---|---|---|
| OBJ-1 | Parse `class-override` rows so a confirmed override DECLARES the class (the load-bearing fix); suppress `gov-underdeclared` AT SOURCE for a confirmed override | ✅ DONE + DEPLOYED + VERIFIED | `loadExceptions` builds `classOverride:Map` (shared `isConfirmed` predicate, VALID_CLASSES-gated, fail-closed); apply loop sets `declaredClass/classDeclared` (override-wins + durable supersede log); `decideAlerts` `confirmedOverride` guards the underdeclared OPEN condition. Enforcing tick on the box: B8.2b / B8.2c / B8.4b-classundeclared / B8.4c-underdeclared did NOT re-mint. |
| OBJ-2 | Orphan-sweep covers `gov-classundeclared:` (not only `gov-docgap:`) | ✅ DONE | `decideOrphanSweep` matches classundeclared keys; resolves out-of-window when class is declared (header OR confirmed override), keeps when genuinely undeclared. |
| OBJ-3 | Class-aware `verifyDoc` — resolve an aged-out doc-gap when the doc is NOT required for the batch's class | ✅ DONE | Reuses `checkBatchDocset(...).required` (effectiveRequired = class.required ∪ REQUIRED_IF); `doc in required` verified an OBJECT key-test by Langston at the ref. Genuinely-missing required doc stays surfaced (no cry-silence). |
| OBJ-4 | Per-tick store-reconcile so `state.openAlerts` self-cleans against the store (SSOT) | ✅ DONE + VERIFIED | New pure export `decideStaleOpenAlertDrops`; `alertSink.liveAlertIds()` lists ALL non-resolved states (active + **acknowledged** + scheduled — OLD Claude Step-4 catch: acked = claimed-live) and FAILS OPEN (returns null) on any read error; reconcile runs on a pre-decide snapshot. Live tick self-reconciled `state.openAlerts`. |
| OBJ-5 | `readDeclaredClass` git-path portability (Windows backslash) | ✅ DONE | Added `sjoin` posix helper; replaced `join(SCOPE_DIR,…)` in `readDeclaredClass` so the `git show ${GOV_REF}:${relPath}` path is forward-slash. |

## Verification (Langston Step-8, independently reproduced on the box)
- **Deployed commit `7f53c2d77`** on the checker box (`/opt/governance-checker/DawnTraderV3`). Shadow dry-run first (exit 0, no crash) → then enforcing tick.
- **Store active+unacked = 0** across the SSOT (`system-alerts.jsonl`, collapsed to latest-state-per-id). By construction, NONE of the four class re-flags re-minted (all `resolved`) — the class-override is being read.
- The sole residual `gov-docgap:P19-B8.4b:phase_19_plan` was **scheduled, not active** — a genuine parent-ride doc-gap (B8.4b has no standalone `P19-B8.4b` plan token; `findEntryDoc` correctly requires the full token), dispositioned as a **parent-ride na-skip** (`GOVERNANCE_EXCEPTIONS.md`, Langston-confirmed, same precedent as B8.4b's scope/pre_audit/system_manual :37/:38/:43). Resolves next tick.

## Tests
`poller.test.mjs` **75 passed / 0 failed** (11 new): OBJ-1 suppress-at-source-no-flap, OBJ-2 classundeclared sweep (resolve-when-declared / keep-when-undeclared / skip-in-window), OBJ-3 not-owed-resolved vs missing-required-kept, OBJ-4 drop-stale + fail-open-on-null. `node --check` clean both files. CI all-4 green on `7f53c2d77`.

## Policy decision (Langston-agreed, non-blocking)
KEEP the matcher exact — a prose mention of a sub-batch under its parent is NOT a plan entry; loosening the matcher would let a genuinely-missing entry hide behind a parent's paragraph. Parent-ride coverage is recorded as a deliberate, auditable `na-skip` (one row per sub-batch doc). Homed as a policy legend note in `GOVERNANCE_EXCEPTIONS.md`.

## Governance files changed
- `scripts/governance-checker/poller.mjs` + `checker.mjs` + `poller.test.mjs` — the fix (OBJ-1..5) + tests.
- `1-system-manual/GOVERNANCE_EXCEPTIONS.md` — parent-ride policy legend note + `P19-B8.4b | na-skip | phase_19_plan` row.
- `1-system-manual/RUNNING_ISSUES.md` — #497 + #352 RESOLVED.
- `1-system-manual/BATCH_CATALOG.md`, `PHASE_HISTORY.md` — batch entry.
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — governance-checker grading-semantics note (class-override now read + class-aware sweep + per-tick store-reconcile).
- `Claude Comms and Packages/Scope Files/B_GOV_ORPHAN_CLASS_{SCOPE,PRE_AUDIT}.md` + this report.
- `.claude/memory/MEMORY_CC_B.md` (+ user-cache truth) + Langston's `/home/langston/MEMORY.md`.

## Sign-offs
- Langston Step-1/2/4/8: **ALL PASS** (each verified at `origin/migration/aws-supabase`, not on reported fact).
- Kyle acknowledgment: pending.
