# B-WORKFLOW-IMPROVE — Q8: the pilot (OBJ-9)

actor: PM Claude (session 994e6488) · role: implementer · STEP: 3 of 11 (task Q8) · 2026-11-20
Targets: `B_WORKFLOW_IMPROVE_PILOT_TARGETS.md` (four batches, all four defect classes).
Method: each target batch's audit was replayed in a git worktree at the batch's parent or head, running the new audit aids (`code-refs.mjs`, `census.mjs`, `history.mjs`) through `--root` where they take it. B-NEW-49 was replayed by PM; Batch 19F, Batch 74 and B-NEW-40 by one sonnet helper each, and PM re-checked each helper's load-bearing claim at the ref (listed under "Re-checked by PM").

**Result in one line: the aids find WHERE a thing is used and what reaches it; none of the five escapes was a "where" miss. Every one was a VALUE or MEANING miss — two lists that should agree, one label counted two ways, a failed read treated as empty, a library's own behaviour. The aids narrow the search; they do not catch these classes. No gate is switched on by this pilot.**

## Per batch

### B-NEW-49 — #691 (second path) and #1211 (failed-read-as-empty) · worktree at base `36126033e`, head `00945ddf8`
| | |
|---|---|
| aids found | `census formula-auto-audit` (17.7 s): reach via the dynamic import at `index.ts:517`, the `cron.schedule` entry point at `:195`; 152 entry-point lines and 929 import-graph files searched. A direct grep control gave 7 schedules in 5 files, the same population the hand audit used. `code-refs queryLastFires` at head: 2 references (1 use, 1 definition) in `cron-fire-evidence-verifier.ts:46`, five unresolved surfaces named. `history` found #164 (the node-cron silent-failure audit) at `RUNNING_ISSUES` `:418`, which is relevant provenance the pre-audit did not cite. |
| aids missed | #1211: the meaning of a failed read inside the batch's own new code. No aid reads error paths. #691: node-cron's own missed-execution behaviour lives in a third-party library, which no aid scans. |
| hand audit missed | Pre-audit §2.5 (the verifier) never asks what happens when the query fails. Its "MISSED" lines (22, 30, 39, 48) are observations; it checked `getNextRun` but never asked what node-cron does when the event loop is blocked at the scheduled second. §2.3 accepted "failure swallowed + logged" for `writeFireRow`, later one cause of #691's missing rows. |

### Batch 19F — #1063 (enum drift) · worktree at parent `c928dd8ea`, head `bd40aa666`
| | |
|---|---|
| aids found | `census --symbol PatternType --file server/types.ts`: 21 uses in 6 files at the parent, 22 at the head, reaching `pattern-recognizer.ts`. `census --symbol patternTypeEnum`: 3 type-aware uses, all column declarations. `history shared/schema.ts` surfaced `db521adc7` (Batch 14 hotfix, an earlier enum expansion), buried among 183 unattributed commits. |
| aids missed | The gap itself: nothing puts the TypeScript union and the database enum values side by side. `census --table pattern_type` returned "0 raw-SQL lines": `pattern_type` is an enum type, not a table, so that zero is the wrong object, not a clean result. |
| hand audit missed | No pre-audit exists (`ls-tree` finds only `BATCH_19F_SCOPE.md`). The 127-line scope is silent on the database enum, a migration and the schema; the batch added `'ABCD'` to the union and left the enum at five values. |

### Batch 74 — #1029 (meaning mismatch) · worktree at parent `399445527`, head `b8eba807e`
| | |
|---|---|
| aids found | `census --path` on each archiver: each reached at startup (`index.ts:767` → `passive-archive-bootstrap.ts:27`), each with its `setInterval` entry points. |
| aids missed | The counters are object properties; `census --symbol` and `code-refs` accept only top-level declarations, so both exit 2 on `cumulativeOhlcRows`. No aid shows sibling producers that feed one label or panel. The aids list sites; they cannot say what each site counts (increment before or after the guard, buffer or filter). `census --table passive_archive_ohlc` returned 0: no table has that name. |
| hand audit missed | The 247-line pre-audit has no mention of scanned, persisted, counter or cumulative. The commit chose "scanned = received, stored = persisted" and never checked that definition per producer: crypto counts in the message handler, perp counts at `:106` and persists at `:125`, equity-spot counts in the parser. |

### B-NEW-40 — #448 (enum drift, three alert-category lists) · worktree at `6a70b45c4`
| | |
|---|---|
| aids found | `code-refs AlertCategory --file server/services/system-alerts.ts`: 3 uses, and "string-keyed access" named as unresolved. `census`: `routes.ts` reaches the alert engine through a dynamic import at `:6373`, the only pointer toward the second list, and it points at the file, not the list. |
| aids missed | The route's own `new Set([...])` of the five category strings (`routes.ts:6329-6331`) is not a reference to the type, so type-aware search cannot see it. The CLI's `as AlertCategory` casts in `scripts/system-alerts.ts` are outside both TypeScript programs, and census's "searched" line does not say `scripts/` was skipped. `census --table system_alerts` matched a different, database-backed alerts table: the real store is a JSONL file. `code-refs AlertCategory` without `--file` exits 2 (ambiguous). |
| hand audit missed | The pre-audit lists the values (lines 259, 273, 283) but never enumerates where the list is defined or checked, so the route allowlist and the CLI cast were never named as copies. |

## Blind-spot list (what Step 2 must not rely on the aids for)
1. **Value-set agreement.** No aid compares two lists of values (a TypeScript union against a database enum, a union against a string `Set`). Enum drift is invisible to all three. The Q9 enum-parity step compares the schema enum against the live database; in #1063 those two agreed and the TypeScript union drifted, so it would not have caught this one either (reasoning, not run).
2. **Literal copies.** A string list or `Set` that repeats a union's members is not a reference; type-aware search misses it.
3. **Properties and fields.** `--symbol` takes only top-level declarations. Counters, flags and struct members, where meaning mismatches live, cannot be asked about.
4. **Sibling producers.** Nothing lists the other files that feed the same label, panel or table from one of them.
5. **Meaning at a site.** The aids list sites. Whether a counter is bumped before or after a filter, or whether an empty result means "none" or "read failed", needs a person or the reviewer to read the lines.
6. **Error paths and third-party behaviour.** Failed-read handling and a library's own scheduling semantics are on no surface the aids scan.
7. **`--table` by name.** It returns a misleading zero for an enum type or a misnamed table, and can match a different system with a similar name. A zero from `--table` needs the object confirmed first.
8. **Files outside the TypeScript programs** (`scripts/`) are skipped silently.
9. **Old refs.** `RUNNING_ISSUES`, `DECISIONS` and `DELETED_COMPONENTS_LOG` did not exist before mid-2026; `history` reports them UNREADABLE (correctly), so the issue-entry leg runs only on recent refs.
10. **Ambiguous symbols** exit 2 and need a second run with `--file`.

## Defect found and fixed in this batch (§9.4 disposition 1, folded in)
`history.mjs` reported "docs: NONE FOUND" for every numbered batch before about B80, whose documents use `BATCH_<n>_` names (B55, B74). Fixed in tool_version 1.1: `B<n>` ids also look for `BATCH_<n>_`, and a sub-batch with no documents of its own (B74.1, B64a) shows its parent's, each labelled `parent B74:`. Proof at the ref:
- positive control: `history server/jobs/formula-auto-audit.ts --ref 36126033e` now lists `BATCH_55_COMPLETION_REPORT.md, BATCH_55_SCOPE.md` for B55 (was NONE FOUND);
- `crypto-spot-archiver.ts --ref 399445527`: B74 now lists its scope, pre-audit and completion report (the B74 helper saw NONE FOUND);
- no regression: `system-alerts.ts --ref 6a70b45c4` still lists `B_NEW_40_PRE_AUDIT.md, B_NEW_40_SCOPE.md`.
- Known limit, stated: the prefix `BATCH_67_` also matches `BATCH_67_1_SCOPE.md`, so a parent or numbered batch can list its sub-batches' documents too. Labelled, not hidden; over-inclusion is the safe direction for an audit aid.
- The governance checker's `batchIdToFileRegex` (`scripts/governance-checker/config.mjs:89`) has the same `BATCH_<n>` blind spot. It grades modern ids only, so nothing is owed now: no work, recorded here.

## Reliance text for Step 2 (proposed for the step skill, Q7; Langston rules at Step 4)
> **The audit aids answer WHERE, not WHETHER.** Use `census` / `code-refs` / `history` to find every use, entry point and earlier batch, and quote their "cannot see" lines in the pre-audit. **Do not cite an aid's silence for:** two value lists agreeing, literal copies of a list, properties or fields, sibling producers of one label, what a site means, error paths, or a library's own behaviour. For each of those that the batch touches, the pre-audit names the lists or sites and compares them by hand. A `--table` zero counts only after the object is confirmed to be a table with that name.

## What this does not settle
- **No gate is switched on.** Whether any aid becomes a required step is the reviewer's ruling at Step 4.
- A value-set comparison aid (blind spot 1) and a field-level census (blind spot 3) would close the two largest gaps. They are proposals for Step 4, not built here.
- One replay per batch, by one reader each; the helpers' "hand audit missed" rows rest on grep of the documents, not a full read, except where PM re-checked.

## Re-checked by PM at the ref
- `bd40aa666:shared/schema.ts:105` — the `pattern_type` enum holds five values, no ABCD.
- `6a70b45c4:server/routes.ts:6329-6331` — the `CATEGORIES` `new Set` of five literal strings.
- `tsconfig.json` and `server/tsconfig.json` include patterns name `client/src`, `shared`, `server` only (working copy; neither has changed to include `scripts/`).
- The B55, B74 and B-NEW-40 history runs above.
