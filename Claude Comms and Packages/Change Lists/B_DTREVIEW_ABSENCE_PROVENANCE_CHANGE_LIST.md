# B-DTREVIEW-ABSENCE-PROVENANCE — CHANGE LIST (Step 4)

## Dispatch header
| field | value |
|---|---|
| **(i) declared change-class** | `non_architecture` (scope header; re-checked at Step 2 after OBJ-3, Langston agreed) |
| **(ii) doc set for that class** | scope **present** `Scope Files/B_DTREVIEW_ABSENCE_PROVENANCE_SCOPE.md` · pre-audit **present** `Scope Files/B_DTREVIEW_ABSENCE_PROVENANCE_PRE_AUDIT.md` · completion report **absent, due at Step 11** · `BATCH_CATALOG` / `PHASE_HISTORY` **absent, due at Step 10** · System Impact Map **judged APPLICABLE** (a new mirror ref namespace = cross-cutting state; P8) · System Manual **judged N/A** (crew tooling, no trading architecture) · `LANGSTON_ARCHITECTURE.md` **judged APPLICABLE** (his read path changes; P8) · `RUNNING_ISSUES` `#1181` **present** (annotated 2026-11-14) · plan row 1w1 **present** · declared-open row **present** `GOVERNANCE_EXCEPTIONS.md` (`9e76249b0`) |
| **(iii) Step-2 reference** | `Scope Files/B_DTREVIEW_ABSENCE_PROVENANCE_PRE_AUDIT.md` at `3554c63ce` (approved with conditions, `1571126004296974478`; conditions folded in §B2) |

**Code ref:** `18a10e7e8` on `migration/aws-supabase`. Two files: `comms-infra/helsinki/dt-review` (+86/−3), `comms-infra/helsinki/tests/dt-review_tests.sh` (+120/−3). No untracked files (`git status --porcelain` showed no `??`). Blob sha256 at the ref: `dt-review` `fc8b71ff…`, tests `269ec08c…`. Both are byte-identical to the copies run on Helsinki.

## The load-bearing hunks

**1. The bound** (`dt-review`, after `FETCH_TIMEOUT=120`):
```sh
PIN_FETCH_TIMEOUT=60
```
A plain assignment (C-3): an environment override would let a caller lengthen the lock hold. Worst hold = 120 + 60 = 180 s, against `dt-backup-sync`'s `LOCK_WAIT=300` (`dt-backup-sync.sh:62`, breach = `gate_fail` `:132`).

**2. The pin fetch, inside the hold, after the success stamp of a good branch fetch** (before `exec 9>&-`):
```sh
      if [ -n "$PINNED" ] && [ ${#PIN} -eq 40 ]; then
        pe=$(git --git-dir="$REPO" cat-file -e "$PIN" 2>&1 9>&-)
        if [ $? -eq 0 ]; then
          PINFETCH=present
        else
          PERR=$(GIT_SSH_COMMAND='ssh -o BatchMode=yes -o ConnectTimeout=15 -o ServerAliveInterval=15 -o ServerAliveCountMax=2' \
            timeout "$PIN_FETCH_TIMEOUT" git -c gc.auto=0 -c maintenance.auto=false --git-dir="$REPO" fetch --quiet --no-tags --no-write-fetch-head "$REMOTE" \
            "$PIN:refs/dt-review/pins/$PIN" 2>&1 9>&-)
          prc=$?
          PINWHY=$(printf '%s\n' "$PERR" | sed -n '/./{p;q;}')
          if [ $prc -eq 0 ]; then PINFETCH=served
          elif [ $prc -eq 124 ]; then PINFETCH=timeout
          else
            case "$PERR" in
              *"not our ref"*|*"does not allow request for unadvertised object"*) PINFETCH=notserved ;;
              *) PINFETCH=failed ;;
            esac
            [ -n "$PINWHY" ] || PINWHY="git fetch exited $prc with no message"
          fi
        fi
      fi
```
The trigger is the object (`cat-file -e`), not `^{commit}`, so a present full-id blob is never fetched (T8). It carries the same SSH options and `9>&-` as the branch fetch (C-1), `--no-tags` (C-2), and no `--depth`. `cat-file`'s stderr is captured, not discarded; a failing check only triggers a fetch and claims nothing.

**3. The plain-miss refusal (R8), BEFORE → AFTER:**
```sh
# BEFORE
    say "REFUSED: $PIN is not in the mirror ($BRANCH head $HEAD, fetched ...; last fetch $LAST; other branches last synced ...)"
# AFTER (store_readable and the head/tree control still run first, unchanged)
    case "$PINFETCH" in
      notserved) say "REFUSED: origin did not serve commit id $PIN (git: $PINWHY); the mirror does not hold it either ($AGES)" ;;
      timeout)   say "REFUSED: $PIN is not in the mirror, and the origin check timed out after ${PIN_FETCH_TIMEOUT}s ($AGES)" ;;
      failed)    say "REFUSED: $PIN is not in the mirror, and the origin check failed (git: $PINWHY) ($AGES)" ;;
      served)    broken "origin served $PIN into refs/dt-review/pins/, but the mirror cannot resolve it to a commit" ;;
      present)   broken "the mirror held object $PIN at the fetch and cannot resolve it to a commit now" ;;
      *) short id -> "no commit with prefix $PIN is in the mirror; no origin check was made: a short id cannot be fetched by id — give the full 40-character id"
         else      -> "$PIN is not in the mirror, and no origin check was made: the branch fetch was $LAST" ;;
    esac
```
`$AGES` is the same freshness text as before. Exit codes are unchanged: 1 for a refusal, 3 for `broken`.

**4. The short-prefix-blob refusal (R1)** gains `; no origin check was made: a short id cannot be fetched by id — give the full 40-character id` before the freshness text.

**5. The OFF-BRANCH line (R10), BEFORE → AFTER:**
```sh
# BEFORE
       LOUD="OFF-BRANCH: $SHA is not an ancestor of $BRANCH — $EXACT, provenance is NOT the graded ref" ;;
# AFTER
       ob=$(git --git-dir="$REPO" for-each-ref --count=1 --format='%(refname:short)' --contains "$SHA" refs/heads/ 2>"$TMPD/fe")
       orc=$?
       [ $orc -eq 0 ] && [ ! -s "$TMPD/fe" ] || broken "could not tell which mirror branch holds $SHA (for-each-ref exit $orc)" "$(cat "$TMPD/fe")"
       if [ -n "$ob" ]; then WHERE="it is on mirror branch $ob"
       else WHERE="it is on NO branch the mirror holds (all-branch sync $(age "$SYNC_PASS")): pushed since that sync, or force-pushed away; the mirror cannot tell which"; fi
       LOUD="OFF-BRANCH: $SHA is not an ancestor of $BRANCH; $WHERE — $EXACT, provenance is NOT the graded ref" ;;
```
The prefix up to `not an ancestor of <branch>` is unchanged, so the bridge prompt (`:226-227`) and test `b` (`:129`) still match.

## Tests — run on Helsinki as langston in `/tmp/dtr-test`, 2026-11-14
**127 pass, 0 fail.** The suite was staged with the new copy, the baseline, r1-r5, and **r6 = `445b6a505` (sha256 `d5ee2e2f…`, equal to the installed `/usr/local/bin/dt-review`)**.
| case | asserts | control |
|---|---|---|
| T1 | side-branch commit absent before the call is served; header "on NO branch"; pin ref; exactly one new ref, zero tags although origin tags it | r6 refuses "not in the mirror"; the same fetch **without** `--no-tags` writes the tag |
| T2 | a deleted-branch commit is served with "on NO branch … force-pushed away"; after `update-ref refs/heads/side2`, "on mirror branch side2" | — |
| T3 | made-up full id: "origin did not serve commit id … (git: … not our ref …)", never "does not have"; no pin ref | r6 "not in the mirror" |
| T4 | 12-char prefix of an absent commit: "no origin check was made: a short id…"; no fetch, no ref | r6 bare "not in the mirror" |
| T5 / d4 | unreachable origin: "no origin check was made: the branch fetch was FAILED (", never "did not serve" | — |
| T6 | `PIN_FETCH_TIMEOUT=0.001`: timeout wording; `flock -n` on the lock succeeds immediately after. ⚠️ **Corrected at Step 4 (Langston condition 1): this shows lock LIVENESS only, NOT `9>&-`.** coreutils `timeout` group-kills, so he measured `flock -n` succeeding even with fd 9 inherited. T11 is the discriminating case. | — |
| T7 | `reflog expire --expire=now --all` + `gc --prune=now` keep the pinned commit; not shallow; a `--prune "+refs/heads/*:refs/heads/*"` fetch keeps the pin ref | pin ref removed → the same expiry + gc drops it |
| T8 | full id of a present blob → "names a blob" (exit 2), no pin ref | — |
| T10 | the shipped fetch line carries `GIT_SSH_COMMAND`, `timeout "$PIN_FETCH_TIMEOUT"`, `--no-tags`, `9>&-`, no `--depth` | — |
| c (real GitHub) | made-up full id → `origin did not serve … (git: fatal: remote error: upload-pack: not our ref …)` | — |
| b, F3-9 | existing cases updated to the new wording | — |
**Mutants (judged by the summary line, each restored after):** removing `--no-tags` failed T1-tags, T7-ctl and T10. Making the "did not serve" class never match failed `c` and T3. Not mapping 124 to timeout failed T6. T9: 63 ms per pin read on the local stand-in; against GitHub, 1.5-1.9 s (pre-audit §A.4).

## What I want attacked
1. **T6 asserts the lock is free after a `timeout`-killed fetch.** That shows `9>&-` holds for git's direct child on a local `file://` origin. Over SSH the grandchild is `ssh`; T10 checks the text, not that behaviour. Is the text check enough, or do you want a forced-hang SSH case?
2. **The `served`/`present` → exit 3 arms** have no test. They are reachable only by a race (an object gone between the fetch and the resolve) or a non-commit served by id. Is a refusal-free `broken` the right class for both?
3. **`age "$SYNC_PASS"` in the no-branch header** quotes only the all-branch stamp, deliberately, because `DT_REVIEW_FETCH_OK` refreshes only the review branch.

## Step-4 amendment (Langston APPROVE WITH CONDITIONS, Discord `1571135217438167187`)
| cond | change | evidence |
|---|---|---|
| 1 | T6's claim corrected above. **T11 added:** a stand-in `ssh` first on PATH records its own open fds, and an `ssh://` remote sends both fetches through it. | Both grandchildren started without fd 9 (`0 1 10 2 3` each). CONTROL: the same copy with `9>&-` removed from the pin fetch line only, and that line's grandchild holds fd 9. |
| 2 | `--count=1` dropped. Every holder is counted: one → `it is on mirror branch <b>`; 2-5 → `it is on N mirror branches: <all>`; >5 → `it is on N mirror branches, including <first five>`. | T2: one branch, two branches (`side2 side3`), seven branches (count + first five). Existing `b` (one branch) unchanged. |
| 3 | System Impact Map + `LANGSTON_ARCHITECTURE.md` + his memory's two facts | Step 10 (before close), with the P8 fold verbatim and the sentence that nothing alarms on the pin count. |
| 4 | Pre-audit §B2 C-2 pointer corrected to T1/C-2. | — |
**Re-run on Helsinki, 2026-11-14: 132 pass, 0 fail.** `dt-review` sha256 `42c8ec1c…`, tests `d8c7d993…` (byte-identical to the amendment commit's blobs).
