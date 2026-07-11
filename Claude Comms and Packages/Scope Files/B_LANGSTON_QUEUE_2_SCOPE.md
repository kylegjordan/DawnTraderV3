# B-LANGSTON-QUEUE-2 — Hotfix document

change-class: hotfix

> **The first real hotfix under Kyle's proposed hotfix category (2026-07-11).** A hotfix is a single
> living document — the issue, a brief scope, the fix, proof of verification, and a touch-list of the
> other governance records it affects — at the right weight for small, no-new-architecture work. This
> file also carries the `change-class: hotfix` header the governance-checker reads to grade the batch
> against the lighter hotfix doc-set (`config.mjs:127` → `required: ['changes_and_fixes']`).
>
> **Why it needs this file at all:** the checker's `readDeclaredClass` (`checker.mjs:228`) reads the
> change-class ONLY from a `*SCOPE*` file matching the batch-id. Without it the batch fell to the
> fail-closed default (`architecture`) and fired 5 doc-gap alerts. A GOVERNANCE_EXCEPTIONS
> `class-override` row alone does NOT clear them — that ledger type is documented but unwired in the
> checker's `loadExceptions` (RUNNING_ISSUES #464, Langston 2026-07-11). This declaration is the
> mechanism that actually works.

## Issue
The Langston review-queue/message-bridge (`/opt/discord-bridges/`: `langston_queue.py`,
`discord-langston-bridge.py`) carried a cluster of real defects: a `--help` could silently spawn a
second bridge (the 17-day ghost, #496); the 500-char summary slice chopped reviews mid-sentence
(#488); a verdict for a missing id was silently dropped (#482); `save_queue` silently DELETED
finished verdicts when full (#489, data-loss); no lock across load→save (#495); and a contradictory
verdict could overwrite a settled one (#401).

## Scope (brief)
Fix all six on the live bridge, no new architecture, no change to how the system decides trades,
no engine/strategy/regime/signal-pipeline/math touched. Comms-infra only.

## The fix (6 objectives — see B_LANGSTON_QUEUE_2_COMPLETION_REPORT.md for full evidence)
- **OBJ-0 (#496):** `argparse` (`--help` exits, unknown flags error) + abstract-socket singleton — no 2nd bridge.
- **OBJ-1 (#488):** delete the `[:500]` slice — reviews stored whole.
- **OBJ-2 (#482):** `unknown-id` fails loud (logged + surfaced), never dropped.
- **OBJ-3 (#489):** `save_queue` move-not-delete (archive + fsync-before-replace + eviction log).
- **OBJ-5 (#495):** atomic write + all six callsites hold `queue_lock` across load→save.
- **OBJ-4 (#401):** `apply_marker` guards terminal states — a contradictory verdict returns `dup-terminal`, no overwrite.

## Proof of verification
Deployed to the live bridge; singleton acquired, one process, gateway connected; end-to-end
round-trips through the locked path; queue intact. Linux-flock acceptance tests: 0-lost move-not-delete
(the "STOP" verdict survives), no-deadlock, whole-summary. Langston independently re-read all six at
the box (`/opt/discord-bridges/`) and confirmed each.

## Touch-list (governance records affected — the honesty discipline)
- **CHANGES_AND_FIXES.md** — FIX-2026-07-11 (the required hotfix doc).
- **RUNNING_ISSUES.md** — #496/#495/#489/#488/#482/#401 resolved; #463 (bridge diff-coverage gap) + #464 (class-override unwired) filed.
- **BATCH_CATALOG.md** — B-LANGSTON-QUEUE-2 row.
- **PHASE_HISTORY.md** — plain-language entry.
- **GOVERNANCE_EXCEPTIONS.md** — class-override row (Langston-confirmed; audit trail).
- **B_LANGSTON_QUEUE_2_COMPLETION_REPORT.md** — full objective-by-objective evidence.
- **SYSTEM_MANUAL / SIM** — N/A (comms infra, no engine/strategy/regime/signal/math change).
- Bridge code lives OUTSIDE the CI'd repo (`/opt/discord-bridges/`), so it is documentation-graded, not diff-graded (#463).
