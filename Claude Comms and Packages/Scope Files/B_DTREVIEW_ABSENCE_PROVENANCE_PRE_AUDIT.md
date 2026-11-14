# B-DTREVIEW-ABSENCE-PROVENANCE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture (re-checked after the OBJ-3 read below, per Langston's Step-1 note: no trading code, no shared trading state; crew tooling on Helsinki only)

**Owner:** Infra Claude · **Row** 1w1 · **Issue** `#1181` · **Scope** `Scope Files/B_DTREVIEW_ABSENCE_PROVENANCE_SCOPE.md` (`2df51fbc9`), Step 1 APPROVE WITH CONDITIONS (Langston, Discord `1571121378738962435`, re-read at `2849ef585`). Every `path:line` below is at `2849ef585` unless stated.

## 0. PREVIOUSLY STATED vs NOW

| # | previously stated (scope) | now | reason |
|---|---|---|---|
| 1 | OBJ-2(a) wording: *"origin does not have this commit"* | **"origin did not serve this commit id"**, with git's line verbatim | Langston condition 1: upload-pack does not distinguish an absent commit from one it will not serve. |
| 2 | OBJ-5: the extra fetch adds **at most 120 s** (`FETCH_TIMEOUT`) | Own limit **`PIN_FETCH_TIMEOUT=60`**. Worst-case lock hold **180 s** (120 branch + 60 pin) against `dt-backup-sync`'s `LOCK_WAIT=300` (`dt-backup-sync.sh:62`), a **120 s margin**. | Condition 4 bounds the other lock holder. Measured round trip to GitHub from a store holding the history is 1.50 / 1.79 / 1.87 s (three by-sha fetches of a fabricated id) and 1.58 s for a present full id (§A.4). 60 s is about 30× typical. |
| 3 | J3: *"the pin check moves before the lock release"* | **Only the by-sha fetch moves inside the hold.** The resolve (`dt-review:296-327`), its head/tree positive control (`:245-249`) and `store_readable` (`:261-274`) stay exactly where they are. | Condition 5. The fetch inside the hold is a trigger, not an absence claim; every absence claim still runs after the same controls as today. |
| 4 | OBJ-4 control: *"without the anchor, the same gc drops it"* | The control runs on a **synthetic, non-shared test mirror**. It must also **expire the reflog**, because the mirror logs every ref update (`core.logAllRefUpdates=always`, SIM `:3123`) and a reflog entry alone would keep the object. | Condition 3 (a `--shared` clone keeps the object via its alternate, so the control would pass vacuously) and the reflog, found in this audit. |
| 5 | OBJ-7: bridge prompt text *"only if it states pin-miss semantics"* | **N/A.** The prompt (`discord-langston-bridge.py:226-227`) keys only on a stdout line 1 starting `OFF-BRANCH:` or `DEGRADED:`. Both new header variants keep the `OFF-BRANCH:` prefix. | Read at the ref (§A.6). |

## A. AUDIT

### A.1 Sources read
| # | source | what it gave |
|---|---|---|
| 1 | code: `comms-infra/helsinki/dt-review` (all 461 lines), `dt-backup-sync.sh:56-62, :130-235`, `tests/dt-review_tests.sh` (366 lines), `deploy.sh:53, :84, :346-376`, `coltrane-review`, `coltrane-repo-refresh` | the code paths below |
| 2 | runtime: Helsinki measurements §A.3-A.4 (scratch dirs as langston under `/tmp/dtr-meas.*`, removed; nothing written to `/srv`) | git 2.43.0 behaviour |
| 3 | System Impact Map `:1375`, `:3117-3127` | mirror state, lock, stamps |
| 4 | System Manual | silent. Correct for crew tooling, so not a gap. |
| 5 | ledger: `#1181` (with its 2026-11-14 annotation), `BATCH_CATALOG` B-CREDENTIALS-PRIVATE-REPO, `LANGSTON_ARCHITECTURE.md:128-135, :191, :196` | intent: *"a positive control before any absence claim"* (`a1ea15b50`) |
| 6 | `bridge/canonical/` | not applicable: the tool dates from 2026-07-23, after the governance change |

### A.2 Census of everything that touches the mirror's refs (tests excluded; `git grep dawntrader-backup.git -- comms-infra scripts ':!*.md'`)
The new state is one ref per pin miss under **`refs/dt-review/pins/<sha>`**. Who could see it:
| component | how it uses refs | affected by the new namespace? |
|---|---|---|
| `dt-backup-sync.sh` | fetches `+refs/heads/*:refs/heads/*` with `--prune` (`:137`) | **No.** The prune is bounded by the refspec, so it only touches `refs/heads/*`. Test P7 checks this directly. |
| `dt-backup-sync.sh` reproduction | `clone --shared --branch $BRANCH` (`:194`) and the head's tree only | **No.** It reads one branch. |
| `dt-backup-sync.sh` `gc --auto` (`:231`) | keeps reachable objects | **Yes, intended.** The pin ref keeps the object (OBJ-4). |
| `deploy.sh` readers group | deletes `refs/remotes/*` (`:359`, decision 14) | **No.** That is a different namespace. |
| `coltrane-repo-refresh` | fetches explicit `refs/heads/$BRANCH` and `refs/heads/review/*` | **No.** |
| `dt-push-notice.sh`, `live-vs-sha.py`, `langston-privacy-check`, `langston-size-watch`, `install-fence.sh`, `langston-rules-install`, `dt-install-drift` | read named refs/shas only. *(Corrected at Step 2, Langston: my grep's claim of "only `deploy.sh`" was overstated. His re-run over `comms-infra scripts` also hits `coltrane-review:89` (`for-each-ref --contains refs/heads/review/`, bounded to `refs/heads/review/`, run against Coltrane's own mirror) and `scripts/dt-drive-backup.ps1:37` (`git bundle create`, on the laptop clone, not this mirror). Neither enumerates this mirror's refs, so the conclusion stands.)* | **No.** |
| Drive bundle | built from the laptop clone (`scripts/dt-drive-backup.ps1:21`), not from the mirror | **No.** |
**Writers of the new ref: exactly one, `dt-review`.** **Deleters: none** (J2 accepted; the System Impact Map names the command that counts them, condition 6).

### A.3 Measured on Helsinki, git 2.43.0 (default protocol v2), against a local stand-in origin
The setup first proves each wanted commit is absent from the test mirror (`cat-file -t` fails before, succeeds after). The stand-in mirror is a `--no-local --single-branch` clone, so nothing arrives by hardlink. My first run used a plain local clone and every object was already present; that run is discarded.
| want (40 hex unless stated) | proto 2 result | proto 0 result |
|---|---|---|
| commit on a side branch the mirror lacks | rc 0, object + pin ref present | rc 0 |
| commit on a **deleted** branch (force-pushed away) | **rc 0, served** | rc 1, `Server does not allow request for unadvertised object` |
| fabricated id | rc 128, `fatal: git upload-pack: not our ref <id>` | rc 1, `error: Server does not allow request for unadvertised object <id>` |
| 12-char prefix | rc 128, `fatal: couldn't find remote ref <prefix>` (client-side) | same |
`rev-parse --is-shallow-repository` afterwards: `false`.
**Against the real GitHub** (Langston's 2026-11-14 measurement, plus mine in §A.4): a fabricated id gives `fatal: remote error: upload-pack: not our ref <id>` (rc 128). Commits that branch force-pushes left behind are served (3 of 3, his). **So the "did not serve" class has two git spellings, `not our ref` and `does not allow request for unadvertised object`, and both map to (a).**

### A.4 Latency against the real GitHub, from a `--shared` scratch clone of the mirror
By-sha fetch of a fabricated id: **1.50, 1.79, 1.87 s**. Of the present branch head: **1.58 s**. That is the connect-and-negotiate floor a real pin fetch pays, plus a few KB for a side-branch commit. Langston's aside stands: into an EMPTY store the same fetch passed 120 s. That case cannot arise here, because the mirror always holds the branch history.

### A.5 Branch-containment check for condition 2, measured on the real mirror (135 heads)
`for-each-ref --count=1 --contains <sha> refs/heads/` took **0.011 s** (head), **0.012 s** (head~500), and **0.031 s** for a commit reachable from no head (`05e95c195`, taken from the reflogs). The mirror has a commit-graph. That is cheap enough to run on every off-branch read.

### A.6 Who reads the output wording
- Bridge prompt `:226-227`: keys on the `OFF-BRANCH:` / `DEGRADED:` prefix of stdout line 1. **Prefix kept, so no bridge change.**
- Langston's rules file `:17-19`: describes the read forms, not pin-miss wording. **No change.**
- Tests asserting the old wording: `dt-review_tests.sh:114` (a fabricated full id must read `is not in the mirror …`). This **changes by design**: the id now goes to origin first (P3). Line 129 (`OFF-BRANCH: $OFF is not an ancestor`) is kept, because the new text extends after that phrase.

### A.7 OBJ-3: the five-disposition read on every pin-miss branch (`dt-review:296-327`)
| branch | today | disposition | change |
|---|---|---|---|
| R1 short prefix shared by a **blob/tree**, no commit (`:301-305`) | "no commit with prefix … is in the mirror" | **(2) update**: an absence about the mirror, and no origin check is possible for a prefix | Append the (c) clause: "no origin check: a short id cannot be fetched by id — give the full 40-character id". |
| R2 full id that **is** a blob/tree (`:302`) | refused, exit 2, "names a blob, not a commit" | (1) keep | The pin fetch is **not** triggered, because the object is present (trigger is `cat-file -e $PIN`, not `^{commit}`). Test P8. |
| R3 **tag** unresolvable to a commit (`:306`) | exit 3 | (1) keep | none |
| R4 disambiguate failed (`:310`) | exit 3 | (1) keep | none |
| R5 **ambiguous** prefix (`:320-322`) | "ambiguous … give more of the sha" | (1) keep | none |
| R6 commit held but **unreadable** (`:324`) | exit 3 | (1) keep | none (if the object is present, there is no fetch) |
| R7 store unreadable (`:326`) | exit 3 | (1) keep | still runs before any absence claim |
| R8 **plain miss** (`:326-327`) | "is not in the mirror (…)" | **(2) update** | Three-way wording per the pin-fetch outcome (P-items below). |
| R9 hex-named branch (`:331-334`) | refuse A8 | (1) keep | none |
| R10 merge-base rc 1, off-branch header (`:343-344`) | one OFF-BRANCH line | **(2) update** | Condition 2: say whether it is on a mirror branch or on none. |
No branch lands in (3), (4) or (5). **change-class stays `non_architecture`.**

## B. PLAN — each item names the finding it comes from

| # | change | from |
|---|---|---|
| **P1** | A new constant `PIN_FETCH_TIMEOUT=60`. Inside the existing lock hold (between the branch fetch at `:210-223` and the lock release `exec 9>&-` at `:231`): if `PINNED` and `FETCH=ok` and `${#PIN}=40` and `git cat-file -e "$PIN"` fails, run `timeout $PIN_FETCH_TIMEOUT git -c gc.auto=0 -c maintenance.auto=false --git-dir=$REPO fetch --quiet --no-write-fetch-head "$REMOTE" "$PIN:refs/dt-review/pins/$PIN"`, keeping git's stderr. **No `--depth`.** | A.3, A.4, §0 rows 2-3 |
| **P2** | Record the outcome as `PINFETCH` = `served` (rc 0) · `notserved` (stderr has `not our ref` or `does not allow request for unadvertised object`) · `timeout` (rc 124) · `failed` (anything else, git's first line kept) · `short` (pin < 40) · `nobranch` (the branch fetch was not ok, so no pin fetch) · `present` (object already held). | A.3 |
| **P3** | The plain-miss refusal (R8) becomes three-way (condition 1). `notserved`: **"REFUSED: origin did not serve commit id <sha> (git: <line>); the mirror does not hold it either (…ages…)"**. `timeout`/`failed`/`nobranch`: **"REFUSED: <sha> is not in the mirror, and the origin check <timed out after 60s \| failed: git: <line> \| was not made: the branch fetch <failed\|was skipped\|was not attempted> (<reason>)>"**. `short`: **"REFUSED: no commit with prefix <p> is in the mirror; no origin check was made: a short id cannot be fetched by id (give the full 40-character id)"**. Exit codes unchanged (1). | A.7 R8, R1; condition 1; J1 |
| **P4** | R10 header (condition 2): after merge-base rc 1, run `for-each-ref --count=1 --format='%(refname:short)' --contains "$SHA" refs/heads/` (any git message → `broken`). Non-empty: `OFF-BRANCH: <sha> is not an ancestor of <branch>; it is on mirror branch <b> — <EXACT>, provenance is NOT the graded ref`. Empty: `OFF-BRANCH: <sha> is not an ancestor of <branch>; it is on NO branch the mirror holds (all-branch sync <age(SYNC_PASS)>): pushed since that sync, or force-pushed away; the mirror cannot tell which — <EXACT>, provenance is NOT the graded ref`. The prefix up to "not an ancestor of <branch>" is unchanged. | A.5, A.6, condition 2 |
| **P5** | Header comment block + EXIT text updated for the pin fetch, the anchor namespace and the three refusal kinds. | — |
| **P6** | Tests, a new section in `dt-review_tests.sh` on a **synthetic, fully local** origin `$T/po.git` and test mirror `$T/pm.git` (`--no-local --single-branch`, `core.logAllRefUpdates=always`), with the test copy's `REMOTE=file://$T/po.git` (condition 3). Each case states its before-call absence and has a CONTROL against `dt-review.r6` = the installed blob (`445b6a505`): **T1** a side-branch commit inside the sync gap is served, header "on NO branch", pin ref exists (CONTROL: r6 refuses "not in the mirror"). **T2** a force-pushed-away commit is served with "on NO branch". A commit on a mirror side branch reads "on mirror branch <b>". **T3** fabricated full id gives exit 1, "origin did not serve", git's `not our ref` line, and never "does not have" (CONTROL: r6 "is not in the mirror"). **T4** a short id of an absent commit gives (c) wording, no pin ref, no fetch (CONTROL). **T5** an unreachable remote gives `nobranch` wording, never (a). **T6** `PIN_FETCH_TIMEOUT=0.001` gives the timeout wording, never (a). **T7** anchor: `reflog expire --expire=now --all` + `gc --prune=now` keeps the commit; a `fetch --prune "+refs/heads/*:refs/heads/*"` keeps the pin ref; `is-shallow` is `false` (CONTROL: delete the pin ref, expire, gc, and the object is gone). **T8** a full id of a present blob gives no fetch and no pin ref (R2). **T9** timings printed. **Update** `:114`'s real-GitHub fabricated-id case to the (a) wording with GitHub's `remote error: upload-pack: not our ref` line. That is the positive control on the real origin. | condition 3, A.3, A.6 |
| **P7** | Ship (condition 4 / `#1004`): commit, CI 4/4, then `deploy.sh --sha <head> --only readers`. Record installed `/usr/local/bin/dt-review` sha256 == blob at the shipping head. | OBJ-6 |
| **P8** | Docs: System Impact Map, the `dt-review` row (fetches the review branch **and**, on a full-id pin miss, that one commit by id) plus a mirror-state line for `refs/dt-review/pins/*` with the **command** that counts it (`git --git-dir=/srv/dawntrader-backup.git for-each-ref refs/dt-review/pins \| wc -l`), never a count (condition 6). A `LANGSTON_ARCHITECTURE.md` change-log row. | OBJ-7, condition 6 |

**Latency, stated (condition 4):** a dt-review call now holds the shared lock for at most 120 s (branch fetch) + 60 s (pin fetch) = **180 s**, which is **120 s inside `dt-backup-sync`'s 300 s wait**. A pin fetch only happens on a full-id miss. A concurrent `dt-review` call waits up to its own 90 s and then refuses with the existing "mirror busy" wording, which is unchanged and already a (b)-class refusal. A `124` from the pin fetch maps to the timeout wording, never to (a).

**UNAUDITED: none.** Every plan item points at a finding above.

## B2. STEP-2 RULING FOLDED (Langston APPROVE WITH CONDITIONS, Discord `1571126004296974478`, re-read at `6489caa3a`)

| cond | what he found | what the plan now does |
|---|---|---|
| **C-1** | P1's command dropped `9>&-` and `GIT_SSH_COMMAND`. The no-inherit rule for fd 9 is a stated invariant: System Impact Map `:3126`, `dt-backup-sync.sh:73` on all 13 git calls, and `dt-review:207/:212`. A leaked fd would let a child outliving `timeout` hold the lock past 180 s. | **P1 amended:** the pin fetch runs with the same `GIT_SSH_COMMAND` as `:210` (BatchMode, ConnectTimeout=15, ServerAlive 15/2) and ends in `9>&-`, exactly like the branch fetch. T10 (new) checks it by reading the fetch line's own text in the shipped file, and the T6 timeout case asserts the lock is free right after the refusal. |
| **C-2** | A by-sha fetch without `--no-tags` also wrote the tags pointing at the commit (3 refs where 1 was wanted, measured). That is a write into a namespace the census does not cover and `--prune` can never clean. It also makes T7's control stop discriminating. Latent today (origin has 0 tags). | **P1 amended: `--no-tags`.** **Landed in T1/C-2** *(pointer corrected at Step 4, Langston condition 4: this row first said "T7 amended")*: the synthetic origin carries a tag on the pinned commit, and the test asserts that after the pin fetch the test mirror holds **exactly one new ref** (the pin) and **zero tags**. CONTROL: the same fetch without `--no-tags` writes the tag. |
| **C-3** | T6 cannot be built: `mk_dtr` (`dt-review_tests.sh:35`) seds exactly three lines, and `:5` says test copies differ only in REPO, REMOTE and LOCK_WAIT. | **A fourth sed for `PIN_FETCH_TIMEOUT`, with the `:5` invariant line updated to name all four.** Not a `:-` env default: an environment override in the shipped tool would let any caller lengthen the lock hold past the 300 s that `dt-backup-sync` is sized against. |
| **fold** | Into P8 (§9.4 disposition 1): the System Impact Map line for `refs/dt-review/pins/*` must also say it has **no automatic deleter**, and name the removal verb. | **P8 amended:** count `git --git-dir=/srv/dawntrader-backup.git for-each-ref refs/dt-review/pins \| wc -l`; remove one, as langston, `git --git-dir=/srv/dawntrader-backup.git update-ref -d refs/dt-review/pins/<sha>` (the object then goes at the next `gc` once its reflog entry expires). The line also says what the namespace can hold: history that a force-push removed from origin, kept permanently until someone removes it. |
| accuracy | A.2's census sentence was overstated. | Reworded in place above. |
No `DEPLOY_WINDOWS.jsonl` row is owed (KD-56): verification is tests plus an install-sha match, with no observation window.

## C. Plain-language summary
The audit confirmed the scope's design and measured the parts it rested on. GitHub hands over a missing commit in under two seconds. A fake commit id comes back with "not our ref". A short id can't be checked at all. The tool's own copy can tell in a few hundredths of a second whether a commit sits on any branch it holds. The plan adds one guarded fetch inside the existing lock, rewords two refusals and one header, and adds nine tests on a self-contained test setup, so none of them can pass by accident.
