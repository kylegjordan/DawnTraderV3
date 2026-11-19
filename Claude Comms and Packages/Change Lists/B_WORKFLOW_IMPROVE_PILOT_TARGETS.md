# B-WORKFLOW-IMPROVE — Q0: the pilot targets (OBJ-9 prerequisite)

actor: PM Claude (session 994e6488) · role: implementer · crew mode: CLAUDE, generation 3 · read at `origin/migration/aws-supabase` = `c8b07e21f` · 2026-11-19 ~22:15Z
STEP: 3 of 11 (task Q0) · status: **OPEN — two of four classes have a confirmed target; two need a new candidate or a reviewer-ruled criterion change**

Criteria (pre-audit B8): the escape is closed or its defect is pinned to a ref; it has an introducing batch with a scope or pre-audit document; the four together cover second path, enum drift, meaning mismatch, failed-read-as-empty.

| issue | state at ref (`RUNNING_ISSUES.md`) | introducing commit | introducing batch and documents | class | verdict |
|---|---|---|---|---|---|
| #691 | `:4028` CLOSED 2026-11-14 (B-CRON-MISSED-CATCHUP) | `00945ddf8` 2026-05-31 | B-NEW-49: `B_NEW_49_SCOPE.md`, `B_NEW_49_PRE_AUDIT.md`, `B_NEW_49_COMPLETION_REPORT.md`, `B_NEW_49_STEP4_REVIEW.md` | second path | **CONFIRMED** |
| #1211 | `:11417` CLOSED 2026-10-18 | `00945ddf8` 2026-05-31: `cron-fire-evidence-verifier.ts:73` at that commit reads "verifier silently skips this run rather than alerting" | B-NEW-49 (same documents) | failed-read-as-empty | **CONFIRMED** |
| #903 | `:5255` CLOSED 2026-10-07 | not `567385eae`: that commit touches `mode-dashboard-tab.tsx`, `server/routes.ts`, `server/storage.ts` only, while the entry names the bare-`fetch` sites in `dashboard.tsx` and `use-trading.tsx`. Those date from 2025-10 | pre-governance, no audit to replay | meaning mismatch | **SUBSTITUTE** |
| #1063 | `:10059` OPEN 2026-09-13 | `e0b51b437` 2026-03-19 is the first `-S` hit for the `ABCD` enum entry (a first hit, not a blame) | pre-governance | enum drift | pinned to a ref; **fails the introducing-batch criterion** |
| #1160 | `:11025` OPEN 2026-10-06 | `isTradingActive` first appears at `5aa1f2e96` 2025-10-30 | pre-governance | meaning mismatch | **SUBSTITUTE** |
| #1195 | `:11256` CLOSED 2026-10-18 (B-B75-EXPORT-COMPLETENESS) | `565b605f0` 2026-05-06, "B75 hotfix" with no batch-id | none for the introduction | copy defect (counted the exported rows, not the source) | pinned; **fails the introducing-batch criterion** |

## What this means for the pilot
- **Two confirmed targets, one batch:** #691 and #1211 both trace to B-NEW-49. They replay one audit, so they count as one batch for OBJ-9's "at least four closed batches".
- **Enum drift and meaning mismatch have no candidate that meets the criteria.** Every one found predates governance, so there is no audit to replay.
- **Next (inside Q0, before any replay):** search the closed `RUNNING_ISSUES` entries from 2026-06 on for an enum-drift and a meaning-mismatch escape whose introducing commit carries a batch-id with a scope or pre-audit. If none exists, the alternative goes to the reviewer as a criterion change (scope change control, OBJ-2): allow a pinned pre-governance defect to be replayed against the batch that last touched the code without catching it. Langston rules; it is not decided here.

## Not verified (labelled, from the helper's archaeology)
- That #691's pilot-relevant line is in `00945ddf8`'s diff (file list and pre-audit attribution only).
- Whether `e0b51b437` is the true origin of the `ABCD` entry (no `git log -L` or blame).
- The B-B75 line-by-line state for #1195.

Re-checked by PM directly at the ref: the `:73` comment at `00945ddf8`; `567385eae`'s file list; all six `RUNNING_ISSUES` heading lines.

Commands: `git show -s --format='%h %ad %s' --date=short <sha>`; `git log <ref> -S'<string>' --reverse -- <path>`; `git show <ref>:1-system-manual/RUNNING_ISSUES.md | grep -nE '^### #<N>\b'`; `git ls-tree -r --name-only <ref> -- "Claude Comms and Packages/" | grep -iE '<batch>'`.
