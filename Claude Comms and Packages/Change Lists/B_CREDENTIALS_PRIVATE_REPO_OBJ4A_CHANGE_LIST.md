# B-CREDENTIALS-PRIVATE-REPO — STEP 4 CHANGE LIST, INCREMENT 1: OBJ-4a (the pinned reader)

**Owner:** Infra Claude (CC-INFRA) · **Issue:** `#1023` · **READY AT:** `origin/migration/aws-supabase` = `2767d358abe6023c06f952699cc86f5444d8a2aa` (the code; this change list is the commit after it) · **Diff:** `git diff ab68732d7^ 2767d358abe6023c06f952699cc86f5444d8a2aa -- comms-infra/ .gitattributes "Claude Comms and Packages/Langston Design Asks/"`

## THE THREE HEADER FIELDS
| # | field | value |
|---|---|---|
| **i** | **DECLARED CHANGE-CLASS** | `non_architecture` (scope header, `B_CREDENTIALS_PRIVATE_REPO_SCOPE.md:3`) |
| **ii** | **THAT CLASS'S DOC SET** (scope §7, the class-keyed ledger you approved at Step 1) | see the table below — every row, with its state today |
| **iii** | **THE STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md` — your PROCEED WITH CONDITIONS, 2026-09-29T17:30Z at `3c293f168`, recorded as §6 at `8309ba598` |

| doc | required / judged | state at this increment |
|---|---|---|
| the batch `SCOPE` | REQUIRED | **present** — `Scope Files/B_CREDENTIALS_PRIVATE_REPO_SCOPE.md` (Step-2 amendments at `8309ba598`; a STEP-3 AMENDMENT recording OBJ-4a's outcome texts as built, at `9c3afd18c`) |
| the batch `PRE_AUDIT` | REQUIRED | **present** — as field iii |
| `COMPLETION_REPORT` | REQUIRED | **absent — due at Step 11** |
| `BATCH_CATALOG.md` | REQUIRED | **absent — due at close** |
| `PHASE_HISTORY.md` | REQUIRED | **absent — due at close** |
| `PHASE_19_PLAN.md` | REQUIRED (every class) | **absent — row 4.51a re-point due at Step 10** |
| shared `MEMORY.md` + `MEMORY_CC_INFRA.md` | REQUIRED (Tier 1) | **present** — position updated at each step |
| the four session task lists | REQUIRED (Tier 1) | **absent — due at Step 10** |
| your `/home/langston/MEMORY.md` | REQUIRED (Tier 1) | **proposed** — its source line `00-legacy.md:245` is in this increment's Langston-files diff (r4) |
| `SYSTEM_IMPACT_MAP.md` | judged: applicable | **absent — due at Step 10** (rows `:2811-2815`, `:1184`, the new components) |
| `SYSTEM_MANUAL.md` | judged: applicable, one line | **absent — due at Step 10** (`:10122`) |
| `RUNNING_ISSUES.md` | judged: applicable | **partly** — `#1102` placed (`b850a9378`), `#1022` amended (`8309ba598`); `#920`, `#593`, `#1043`, `#463` (amendment: the uncommitted `langston_queue.py`) due at Step 10 |
| `SPRINT_TO_LIVE_PLAN.md` | judged: applicable | **partly** — row 158 carries `#1102` (`b850a9378`) |
| `MISTAKE_PATTERNS.md` | judged: applicable | **absent — due at Step 10** |
| `DELETED_COMPONENTS_LOG.md` | judged: applicable | **absent — due at Step 10**: the old installer's staging copies in `/opt/discord-bridges` that `deploy.sh` retires to `/root/deploy-retired/<UTC>/` |
| `LANGSTON_ARCHITECTURE.md` §6 | judged: applicable | **absent — due at Step 10** (your read path) |
| `CLAUDE.md` §7 / §7.1, `workflow-05-ci`, `workflow-07-verify-cc` | judged: applicable | **absent — due at Step 10** |
| `CHANGES_AND_FIXES.md` | judged: N/A | N/A — no trading-system behaviour changes |



**One gate per dispatch (your 15-minute ceiling):**
- **GATE 4a-1 — THE READER:** `comms-infra/helsinki/dt-review`, the bridge's review note (`discord-langston-bridge.py`), and the edits to YOUR files (`Langston Design Asks/B-CREDENTIALS-PRIVATE-REPO_langston-files_r4.md`).
- **GATE 4a-2 — THE INSTALLER AND THE BACKUP GATE:** `comms-infra/discord/deploy.sh`, `comms-infra/helsinki/dt-backup-sync.sh`, and the verbatim `langston_queue.py` commit.

**Commits:** `ab68732d7` both scripts verbatim from Helsinki (the live baseline) · `a1ea15b50` first build · `23b107d91` exec bits · `b4db96b9c` bridge + your-files r1 + installer tests · `12060b293` live `langston_queue.py` verbatim · `b9ca76485` fresh-reader round 1 fixes · `6ea6fc9fe` + `05c7bcafe` round 2 fixes · `764ec389b` round 2 text fixes (bridge note, your-files r3) · `9c3afd18c` round 3 fixes (your-files r4, the scope's STEP-3 AMENDMENT) · `2767d358a` one test control made to discriminate

## THE FRESH-READER RECORD — THE CAP WAS REACHED (3 rounds). Round 3's corrections have NOT been read by a fresh reviewer.
- `REVIEWER r1: object (b4db96b9c) · 3 independent readers (reader; installer; backup-sync + bridge + your files) · 40 findings: 1 blocker, 15 should-fix, 24 minor · fixed at b9ca76485 · re-derived y`
- `REVIEWER r2: object (b9ca76485) · 3 fresh readers, none shown round 1 · 33 findings: 0 blocker, 12 should-fix, 21 minor · fixed at 6ea6fc9fe/05c7bcafe/764ec389b · re-derived y`
- `REVIEWER r3: object (764ec389b) · 3 fresh readers, none shown rounds 1-2 · 27 findings: 0 blocker, 7 should-fix, 20 minor · fixed at 9c3afd18c + 2767d358a, UNREAD by a fresh reviewer (cap) · re-derived y`

**Where I did NOT do what round 3 proposed — rule on these first:**
1. **The backup gate's in-sync rule changed AGAIN, and it is now LOOSER than r2 in one case.** r3 showed r2's verdict on a force-push-back during a run depended on whether the rewind target happened to be in the mirror. I made BOTH pass: the rule is now *equals GitHub's pre-fetch read, OR equals a post-fetch re-read, OR the fetch MOVED the branch to a descendant of the pre-fetch read*. A fetch that exits 0 WITHOUT moving the branch fails — r3 asked for that "in every branch"; I kept ONE exception, a post-fetch re-read equal to the mirror.
2. **A failed object-check instrument is FAIL-INFRA ("not a verdict"), including when git's listing dies on a missing TREE.** It still pages, with git's own line; I did not try to classify git's messages into missing-object vs host trouble.
3. **A clone failure is FAIL-INFRA by default** (r3's first option); I did not add r3's "names the mirror vs names the temp dir" split.
4. **The invalid-BRE check matches git 2.43's MEASURED text `fatal: -e option, '<pat>': ...`**, not r3's suggested `command line, ...` (that is the text for a positional pattern, which `dt-review` never passes).
5. **The installer's late-refusal fix is a REORDER** (the seed and the bridge units now run before anything post-install that can refuse), not an EXIT trap.

**Re-derived, not taken on report:** every load-bearing hit has a test that runs the SAME check against the version before the fix and must FAIL there (a `CONTROL` line). One did not at first: the installer's `GIT_DIR` control passed on the old code, because `git hash-object` needs no repository. I replaced it with a measured one — a planted clean filter, which root's `git hash-object` RAN as root under the old installer (`2767d358a`). Round 3 examples, each failing on `764ec389b`: `a//b` fetched and then exited 3; a `:(glob)` path matching nothing gave `# 0 matches`; names with `"`, `\` or a `:` component read "not in the tree"; a bad-timezone commit was "NOT the committed content"; a stamp `0999` did octal arithmetic; a stale mirror paged as "NOT a verdict"; a no-op fetch PASSed as "GitHub moved again"; a dead `cat-file` PASSed with zero objects checked; the lock fd leaked into `ls-remote` and every page; sudo's warning was written into langston's crontab.

## THE TESTS (committed, re-runnable: `comms-infra/helsinki/tests/`)
Run on Helsinki against `--shared` test clones in `/tmp/dtr-test` only (the live mirror is only cloned FROM; `cc-send` stubbed; every installer write path redirected and asserted; `crontab` faked over a file), all from the COMMITTED blobs: **dt-review 86/86 · dt-backup-sync 43/43 · deploy.sh 49/49.** ⚠️ **The backup-gate harness was itself wrong until round 3:** it cloned the test mirror FROM the test GitHub, so every GitHub commit was readable in the mirror and a stale mirror was never actually exercised. Both now have their own store, and a harness assertion proves it. **Found BY the suite, not by review:** git 2.43's `hash-object -t tree` SEGFAULTS outside a repository (exit 139); it answers "could not get object info" for an absent full id; and `printf '\0100644'` is an octal escape, not a NUL (a test-tree bug, fixed).

## LIVE STATE, read-only, before any install
- The bridge `.py` files, units and drop-in equal the repo. `dt-push-notice.sh` live is the OLDER committed version (A12): it installs with P8, per GB-8, not here.
- ⚠️ **`langston_queue.py` live was B-LANGSTON-QUEUE-2's code (2026-07-11), never committed anywhere** (`git log --all -S "def queue_lock"`: nothing). Committed verbatim at `12060b293` (blob `10345b892` = live) because the new installer would otherwise have REVERTED #401/#488/#489/#495. §9.4 disposition 1; `#463` (bridge code graded on documentation, not diff) is amended at Step 10.
- **Your files:** all 19 BEFORE lines of r4 re-checked against the live files just now (counts only, no content copied): exact, at the stated line numbers.

---
# GATE 4a-1 — THE READER

**THE QUESTION: is `dt-review` at `2767d358a` right, and do the bridge note and your-files r4 describe it correctly?**

**Before (the live baseline, `ab68732d7`):** fetch first with stderr discarded; parse after; header on stdout; no pin; `2>/dev/null` everywhere:
```sh
if ! git --git-dir="$REPO" fetch --quiet "$REMOTE" "+refs/heads/$BRANCH:refs/heads/$BRANCH" 2>/dev/null; then
  echo "dt-review: FETCH FROM GITHUB FAILED — refusing to read a possibly-stale backup." >&2
  echo "dt-review: do not assert file contents from here; read single files off the branch instead." >&2
  exit 1
fi
REF=$(git --git-dir="$REPO" rev-parse "$BRANCH")

cmd="$1"; shift 2>/dev/null
case "$cmd" in
  grep)
    pat="$1"; shift 2>/dev/null
    echo "# whole-tree search at $REF (pulled from GitHub just now)"
    if [ $# -gt 0 ]; then
      git --git-dir="$REPO" grep -n -e "$pat" "$REF" -- "$@"
    else
      git --git-dir="$REPO" grep -n -e "$pat" "$REF"
    fi
    ;;
  show)  echo "# $1 at $REF (pulled from GitHub just now)"; git --git-dir="$REPO" show "$REF:$1" ;;
  ls)    git --git-dir="$REPO" ls-tree -r --name-only "$REF" ;;
  ref)   echo "$REF" ;;
  *)     echo "usage: dt-review grep <pattern> [<path>...] | show <path> | ls | ref" >&2; exit 2 ;;
esac
```

**After — parse before any fetch; path forms refused:**
`comms-infra/helsinki/dt-review` at `2767d358a`, lines 81-98:
```sh
  81  path_form() {   # cmd path
  82    case "$2" in
  83      '') refuse "dt-review $1: an empty path. Nothing was read." ;;
  84      /*) refuse "dt-review $1: '$2' is absolute — paths are relative to the repository root. Nothing was read." ;;
  85      .|./*|*/./*|*/.) refuse "dt-review $1: '$2' — write it without '.' segments. Nothing was read." ;;
  86      *//*) refuse "dt-review $1: '$2' has an empty segment ('//'). Nothing was read." ;;
  87      ..|../*|*/../*|*/..) refuse "dt-review $1: '$2' contains '..'. Nothing was read." ;;
  88      @*) refuse "dt-review $1: '$2' starts with '@' — a pin goes BEFORE the pattern: grep @<sha> <pattern> [<path>...]. Nothing was read." ;;
  89    esac
  90    if [ "$1" = show ]; then
  91      case "$2" in
  92        */) refuse "dt-review show: '$2' ends in '/' — show reads one file. Nothing was read." ;;
  93        :*) refuse "dt-review show: '$2' — pathspec magic is not a file path. Nothing was read." ;;
  94      esac
  95    fi
  96  }
  97  
  98  # ---- 1. PARSE (no network, no mirror access) ----------------------------------------
```

**After — resolve: only a CLEAN absence is "not in the mirror":**
`comms-infra/helsinki/dt-review` at `2767d358a`, lines 289-327:
```sh
 289    SHA=$(git --git-dir="$REPO" rev-parse --verify --quiet "$PIN^{commit}")
 290    if [ -z "$SHA" ]; then
 291      # Why did it not resolve? Only a CLEAN "no such commit" may be reported as absence.
 292      t=$(git --git-dir="$REPO" cat-file -t "$PIN" 2>&1)
 293      case "$t" in
 294        blob|tree)
 295          if [ ${#PIN} -eq 40 ]; then refuse "$PIN names a $t, not a commit. dt-review pins take a COMMIT id."; fi
 296          store_readable || broken "cannot claim $PIN is absent: $STORE_ERR"
 297          say "REFUSED: no commit with prefix $PIN is in the mirror (a $t shares the prefix) ($BRANCH head $HEAD, fetched $(age "$FETCH_OK" "$SYNC_PASS"); last fetch $LAST; other branches last synced $(age "$SYNC_PASS"))"
 298          exit 1 ;;
 299        tag) broken "$PIN names a tag whose target the mirror cannot resolve to a commit" ;;
 300      esac
 301      cands=$(git --git-dir="$REPO" rev-parse --disambiguate="$PIN" 2>"$TMPD/e")
 302      drc=$?
 303      [ $drc -eq 0 ] && [ ! -s "$TMPD/e" ] || broken "could not look $PIN up in the mirror" "$(cat "$TMPD/e")"
 304      nc=0
 305      for o in $cands; do
 306        ot=$(git --git-dir="$REPO" cat-file -t "$o" 2>&1) || broken "$PIN matches object $o, which the mirror cannot read" "$ot"
 307        case "$ot" in
 308          commit) nc=$((nc + 1)) ;;
 309          tag) git --git-dir="$REPO" rev-parse --verify --quiet "$o^{commit}" >/dev/null && nc=$((nc + 1)) ;;
 310        esac
 311      done
 312      if [ "$nc" -gt 1 ]; then
 313        say "REFUSED: $PIN is ambiguous in the mirror ($nc commits share that prefix) — give more of the sha"
 314        exit 1
 315      fi
 316      # One commit that exists but will not resolve is a damaged object, not an absent one.
 317      [ "$nc" -eq 0 ] || broken "$PIN names a commit the mirror holds but cannot read"
 318      store_readable || broken "cannot claim $PIN is absent: $STORE_ERR"
 319      say "REFUSED: $PIN is not in the mirror ($BRANCH head $HEAD, fetched $(age "$FETCH_OK" "$SYNC_PASS"); last fetch $LAST; other branches last synced $(age "$SYNC_PASS"))"
 320      exit 1
 321    fi
 322    # A 7-39 character name can resolve as a BRANCH before it resolves as an object id; a
 323    # hex-named branch must never be served as if it were the object the caller named (A8).
 324    case "$SHA" in
 325      "$PIN"*) ;;
 326      *) refuse "'$PIN' resolved to $SHA, which is not that object id (a ref with a hex name?). Nothing was read." ;;
 327    esac
```

**After — show re-hashes the commit, every tree and the blob; nothing reaches stdout until verified:**
`comms-infra/helsinki/dt-review` at `2767d358a`, lines 371-400:
```sh
 371    show)
 372      rehash commit "$SHA"
 373      cur=$(sed -n '1s/^tree //p' "$TMPD/obj")
 374      [ ${#cur} -eq 40 ] || broken "commit $SHA has no tree line"
 375      rest=$path
 376      while :; do
 377        comp=${rest%%/*}
 378        rehash tree "$cur"
 379        # LITERAL pathspec and -z: no quoting, no pattern or ':' magic, so the one record returned
 380        # (if any) IS this component; only its "mode type oid" field before the TAB is used.
 381        line=$(GIT_LITERAL_PATHSPECS=1 git --git-dir="$REPO" ls-tree -z "$cur" -- "$comp" 2>"$TMPD/e" | tr '\0' '\n' | sed -n '1s/\t.*//p')
 382        [ ! -s "$TMPD/e" ] || broken "cannot list tree $cur" "$(cat "$TMPD/e")"
 383        if [ -z "$line" ]; then
 384          store_readable || broken "cannot claim '$path' is absent: $STORE_ERR"
 385          say "REFUSED: '$path' is not in the tree at $SHA — nothing served"; exit 1
 386        fi
 387        set -- $line          # mode type oid (ls-tree's fixed, space-free first field)
 388        if [ "$rest" = "$comp" ]; then
 389          [ "$2" = blob ] || { say "REFUSED: '$path' at $SHA is a $2, not a file — nothing served"; exit 1; }
 390          break
 391        fi
 392        [ "$2" = tree ] || { say "REFUSED: '$path' is not in the tree at $SHA ('$comp' is a $2) — nothing served"; exit 1; }
 393        cur=$3
 394        rest=${rest#*/}
 395      done
 396      rehash blob "$3"
 397      provenance "show $path"
 398      cat "$TMPD/obj"
 399      ;;
 400    grep)
```

**JUDGEMENT CALLS — attack these:**
1. **Exit map:** 0 served · 1 = `# 0 matches` (a measured zero) OR `REFUSED` (nothing measured), told apart by stderr · 2 = the caller's request (decided before the fetch, except a full sha naming a non-commit, a hex-named branch, and a pattern that does not compile) · 3 = mirror/git failed. Is a shared exit 1 acceptable, given the texts differ?
2. **One loud line:** OFF-BRANCH and DEGRADED combine into ONE line on stdout line 1 AND stderr; everything else on stdout is the content. Your decision 5 — does the combined line still satisfy C3?
3. **`show` re-hashes; `grep` and `ls` do NOT** (cost), and now SAY so (`content is as stored (not re-hashed)`). grep refuses on ANY git stderr, but a blob rewritten IN PLACE with valid zlib would be searched as-is. Accept as the residual, or require it?
4. **"Not in the mirror"** needs a clean `--disambiguate`, no unreadable candidate, and every pack/index/loose dir/alternate readable. Reach: it cannot see a pack whose CONTENT is corrupt but readable. A SHORT pin shared only by a blob/tree is "no commit with prefix", exit 1.
5. **The outcome texts as built differ from the scope's pre-written ones** — each change and its reason is in the scope's STEP-3 AMENDMENT; Step 7 checks against those.
6. **Pin grammar:** `grep @<sha>`, `ls @<sha>`, `show <sha>|@<sha> <path>` (decision 17). `@` as a first pattern character is written `[@]`.
7. **Your files (decision 5), r4:** applied by exact text; each file backed up first; every file shrinks (-80, -5, -337, -103, -2 bytes). New in r4: count ONLY on exit 0 or exit 1 with `# 0 matches` (a failed call and a measured zero both leave an empty stdout file); number from STDOUT only (a bare call shows the stderr provenance ABOVE the file); the stamp comes from the Discord bridge when it can resolve the head, otherwise `dt-review ref`.
8. **The bridge note** now says the same stdout-only rule, and the UUID-rotation retry no longer prepends a second note (it could carry a different sha).

---
# GATE 4a-2 — THE INSTALLER AND THE BACKUP GATE

**THE QUESTION: are `deploy.sh` and `dt-backup-sync.sh` at `2767d358a` safe to run as root / as langston, and do they only ever install or certify what is actually at the reviewed sha?**

**How the installer is run** (it must itself be the reviewed copy): on the laptop `git show <sha>:comms-infra/discord/deploy.sh > deploy-<sha>.sh` and note `git rev-parse <sha>:comms-infra/discord/deploy.sh`; copy it to `/root/`; as root, from `/root` with no `GIT_DIR` set, `git hash-object --no-filters` must match; then `bash /root/deploy-<sha>.sh --sha <sha> --only readers`. The script also refuses unless its own bytes equal deploy.sh at `--sha`. **Root runs no git at all now:** blob ids are computed by python, and the git it runs as langston gets no `GIT_*` from the caller.

**The verified walk — every object re-hashed by root, read as langston:**
`comms-infra/discord/deploy.sh` at `2767d358a`, lines 179-204:
```sh
 179  python3 - "$MIRROR" "$SHA" "$STAGE" "${PATHS[@]}" > "$STAGE/.blobs" <<'PY' || { echo "== PRE-FLIGHT FAILED — nothing has been changed." >&2; exit 2; }
 180  import hashlib, os, subprocess, sys
 181  mirror, sha, stage = sys.argv[1:4]
 182  paths = sys.argv[4:]
 183  cat = subprocess.Popen(["sudo", "-u", "langston", "git", "--git-dir=" + mirror, "cat-file", "--batch"],
 184                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, cwd="/")
 185  def die(msg):
 186      sys.stderr.write("   " + msg + "\n")
 187      sys.exit(2)
 188  cache = {}
 189  def get(oid, want):
 190      if oid in cache:
 191          return cache[oid]
 192      cat.stdin.write((oid + "\n").encode()); cat.stdin.flush()
 193      hdr = cat.stdout.readline().decode().rstrip("\n").split(" ")
 194      if len(hdr) != 3:
 195          die("object %s: %s" % (oid, " ".join(hdr)))
 196      o, typ, size = hdr[0], hdr[1], int(hdr[2])
 197      data = cat.stdout.read(size); cat.stdout.read(1)
 198      if typ != want:
 199          die("object %s is a %s, expected a %s" % (oid, typ, want))
 200      got = hashlib.sha1(("%s %d\0" % (typ, size)).encode() + data).hexdigest()
 201      if got != oid:
 202          die("object %s (%s) re-hashes to %s: the mirror's copy is NOT the reviewed content" % (oid, typ, got))
 203      cache[oid] = data
 204      return data
```

**The mirror's state — as langston, under the lock, asserted:**
`comms-infra/discord/deploy.sh` at `2767d358a`, lines 269-293:
```sh
 269  mirror_state() {   # decision 14 (A9) + the reflog; as langston, under the shared lock
 270    rc=0
 271    sudo -u langston flock -w 300 -E 75 "$MIRROR/dt-fetch.lock" sh -c '
 272      set -e
 273      M=$1
 274      rc=0; git --git-dir="$M" config --unset-all remote.origin.fetch || rc=$?
 275      [ $rc -eq 0 ] || [ $rc -eq 5 ] || { echo "cannot drop remote.origin.fetch (git config exit $rc)" >&2; exit 1; }
 276      git --git-dir="$M" config core.logAllRefUpdates always
 277      refs=$(git --git-dir="$M" for-each-ref --format="delete %(refname)" refs/remotes/)
 278      [ -z "$refs" ] || printf "%s\n" "$refs" | git --git-dir="$M" update-ref --no-deref --stdin
 279    ' sh "$MIRROR" || rc=$?
 280    case $rc in
 281      0) ;;
 282      75) if [ -n "$INSTALLED" ]; then die "the mirror's fetch lock was held for more than 300s"
 283          else die "the mirror's fetch lock was held for more than 300s — nothing was changed; re-run"; fi ;;
 284      *) die "could not update the mirror's refspec/refs (exit $rc; see above)" ;;
 285    esac
 286    # Asserted, not printed. `config --get` exits 1 for an ABSENT key; any other status is a
 287    # failed read. The positive control proves the config is readable at all.
 288    git_l config --get remote.origin.url >/dev/null || die "cannot read the mirror's config"
 289    rc=0; git_l config --get-all remote.origin.fetch >/dev/null || rc=$?
 290    [ $rc -eq 1 ] || die "remote.origin.fetch is still set, or unreadable (git config exit $rc)"
 291    n=$(git_l for-each-ref refs/remotes/ | wc -l)
 292    [ "$n" -eq 0 ] || die "refs/remotes/* still holds $n refs"
 293  }
```

**dt-backup-sync — in sync:**
`comms-infra/helsinki/dt-backup-sync.sh` at `2767d358a`, lines 144-166:
```sh
 144  SRC2=
 145  NOTE=
 146  SYNC=
 147  if [ "$SRC" = "$MIR" ]; then
 148    SYNC=1
 149  else
 150    read_src_retry
 151    [ "$SRC_RC" -eq 0 ] || gate_fail "the mirror ($MIR) differs from GitHub's head read before the fetch ($SRC), and the re-read failed: $SRC_ERR"
 152    [ -n "$SRC_OUT" ] || gate_fail "GitHub answered the re-read with NO branch $BRANCH"
 153    SRC2=$SRC_OUT
 154    if [ "$MIR" = "$SRC2" ]; then
 155      SYNC=1
 156    elif [ "$MIR" = "$MIR0" ]; then
 157      NOTE=" (the fetch exited 0 but did not move the branch off $MIR0, a head GitHub showed neither before nor after it)"
 158    elif ! present "$SRC"; then
 159      NOTE=" (the fetch moved the branch to $MIR, but the mirror does not hold $SRC, GitHub's head read before the fetch)"
 160    elif anc "$SRC" "$MIR"; then
 161      SYNC=1
 162      NOTE=" (a push landed during the run: the fetch moved the branch from ${MIR0:-nothing} to $MIR, which contains GitHub's earlier head; GitHub has since moved to $SRC2, which the next run fetches)"
 163    else
 164      NOTE=" (the fetch moved the branch to $MIR, which does not contain $SRC, GitHub's head read before the fetch)"
 165    fi
 166  fi
```

**dt-backup-sync — the object check must prove it ran:**
`comms-infra/helsinki/dt-backup-sync.sh` at `2767d358a`, lines 188-210:
```sh
 188  MISSING=
 189  OBJ_ERR=
 190  if git -C "$TMP/r" ls-tree -r -t --format='%(objecttype) %(objectname)' HEAD > "$TMP/ls" 2> "$TMP/ls.err" 9>&-; then
 191    awk '$1 != "commit" {print $2}' "$TMP/ls" > "$TMP/want"
 192    NW=$(wc -l < "$TMP/want")
 193    if [ -s "$TMP/ls.err" ]; then OBJ_ERR="listing the head's tree printed: $(sed -n 1p "$TMP/ls.err")"
 194    elif [ "$NW" -lt 1 ]; then OBJ_ERR="listing the head's tree returned no objects"
 195    elif git -C "$TMP/r" cat-file --batch-check='%(objectname) %(objecttype)' < "$TMP/want" > "$TMP/got" 2> "$TMP/got.err" 9>&-; then
 196      NG=$(wc -l < "$TMP/got")
 197      NOK=$(grep -c -E '^[0-9a-f]{40} (blob|tree)$' "$TMP/got")
 198      NMISS=$(grep -c -E '^[0-9a-f]{40} missing$' "$TMP/got")
 199      if [ -s "$TMP/got.err" ]; then OBJ_ERR="cat-file printed: $(sed -n 1p "$TMP/got.err")"
 200      elif [ "$NG" -ne "$NW" ] || [ $((NOK + NMISS)) -ne "$NW" ]; then
 201        OBJ_ERR="cat-file answered $NG lines ($NOK present, $NMISS missing) for $NW objects"
 202      else MISSING=$NMISS; fi
 203    else OBJ_ERR="cat-file exited non-zero: $(sed -n 1p "$TMP/got.err")"; fi
 204  else OBJ_ERR="could not list the head's tree: $(sed -n 1p "$TMP/ls.err")"; fi
 205  rm -rf "$TMP"
 206  # git's own housekeeping, now, synchronously, inside the lock (it is off during the fetches).
 207  git -c gc.autoDetach=false gc --auto --quiet 2>>"$LOG" 9>&- || log "WARN gc --auto failed (see the lines above); the gate result is unaffected"
 208  exec 9>&-
 209  
 210  [ -z "$OBJ_ERR" ] || gate_fail "the object check could not complete: $OBJ_ERR — github=$SRC mirror=$MIR reproduced=$REP_C"
```

**JUDGEMENT CALLS — attack these:**
1. **Trust model:** root never runs git (python hashes; git only as langston); it re-hashes commit -> trees -> blob itself. The ROOT of trust is the operator bringing the reviewed installer from GitHub. Is that the right anchor?
2. **`--only`** (bridges | notices | readers) exists for GB-8: OBJ-4a installs `readers` (and later `bridges` for the note), NOT `notices`, so #1008's push-notice code does not go live before its own-cache fetch (P8).
3. **Order:** pre-flight (every object re-hashed, the crontab read ONCE, both log paths checked for symlinks) -> the mirror's state -> install + verify -> retire -> the comms seed -> the bridge units (daemon-reload, enable, an `is-active` readout, NOT RESTARTED report) -> logs, crons, the mirror's state again. A refusal after the install says the files ARE installed and what did and did not run.
4. **Retiring the old installer's staging copies** from `/opt/discord-bridges` (to `/root/deploy-retired/<UTC>/`): they are what an old installer would reinstall. `DELETED_COMPONENTS_LOG` at Step 10.
5. **The in-sync rule (see "rule on these first", item 1).** A rewind BETWEEN runs is simply fetched; `core.logAllRefUpdates=always` keeps the dropped commits recoverable.
6. **The reproduction** is a `--shared` clone, every object of the HEAD'S TREE must exist (6,562 objects at the current head, measured), and CLAUDE.md is re-hashed. History behind the head is NOT walked (a full walk every 15 minutes is the 460 MB pack). Enough?
7. **git housekeeping:** auto-gc is OFF in both fetches (it could delete packs under a running clone); `gc --auto` runs synchronously INSIDE the lock at the end of dt-backup-sync.
8. **One delayed retry** on ls-remote and fetch (GB-10: 13 transient publickey denials) — an addition, not in the pre-audit. Pages now carry `9>&-` so no child can hold the lock after exit.

---
## THE INSTALL PLAN (Step 6) — for the record now, run only after both gates clear
1. Confirm the reviewed sha is in the live mirror. Record the rollback anchors: `/usr/local/bin/dt-review` and `dt-backup-sync.sh` copied to `*.pre-credentials-<UTC>`; the mirror's `config` saved; `git for-each-ref refs/remotes/` saved.
2. `deploy.sh --only readers` from the operator-checked copy -> install-verify gate. The next */15 tick must log `PASS … (re-hashed)` and write `DT_SYNC_PASS`.
3. Apply your-files r4 by exact text (each file backed up first, re-read after), then `langston-size-watch --status` before and after.
4. In a window with NO queued review (queue state + no `invoking claude` in the journal): `deploy.sh --only bridges` (the note) -> `systemctl restart discord-langston-bridge.service` -> the next invocation's journal shows `review ref resolved to <sha>`.
5. Step 7 on the LIVE reader: the scope's (a)-(e) against the STEP-3 AMENDMENT's texts, with the real `scratch/offbranch-control` branch for (b).
**Rollback:** restore the `*.pre-credentials-*` copies, restore the mirror config, and restart the bridge from its previous file (also kept).

---
## STEP-4 VERDICTS AND WHAT WAS FOLDED (recorded after the dispatches)
- **GATE 4a-1 — Langston, 2026-09-29T20:45Z: APPROVED WITH CONDITIONS** (dt-review at `2767d358a` right; bridge note and your-files r4 correct). C1 provenance states the integrity basis on every read · C2 the peel `error:` kept out of the output · C3 the ref-invariant wording · nit: `(never | head)` back in `instrument_traps:18` (your-files r5, every file still net-negative). **Folded at `3b7b46f59`.**
- **GATE 4a-2 — Langston, 2026-09-29T21:14Z: APPROVED WITH CONDITIONS, no blocker** ("no new review round"). 1 the undecidable rewind arms + a renamed known file → FAIL-INFRA, header sentence corrected · 2 `GIT_*` unset in dt-backup-sync AND dt-review · 3 a failed page is logged · 4 files replaced by rename, target dirs root-owned 0755 checked in pre-flight · 5 an EXIT handler reports the state on any unexpected exit · riders: exact cron line, the "3 times since 09-02" number re-derived with its population, call 6's reach written into the header, discord.py pinning homed to the GB-8 bridges increment. **Folded at `445b6a505`.**
- **Tests, from the committed blobs at `445b6a505`:** dt-review 95/95 · dt-backup-sync 55/55 · deploy.sh 60/60. Each condition has a CONTROL that fails on the version you reviewed (`2767d358a`, or `3b7b46f59` for the reader's GIT_* case).

---
## STEP 4 CLOSED, STEP 5, AND THE ROOT RUN YOU ASKED FOR
- **Step 4 CLOSED — Langston, 2026-09-29T21:47Z: "BOTH GATES' CONDITIONS MET at `445b6a505`. OBJ-4a Step 4 is CLOSED — APPROVED."** Board `Review` stays unset by agreement: the card is batch-level and the GB-8 bridges increment still owes a gate.
- **Correction:** the confirm dispatch cited `dt-review:357` and `:295`; at `445b6a505` they are **`:358`** (the provenance line) and **`:296`** (the peel redirect). The quoted code was exact; the numbers were each one short.
- **Observation (a) FOLDED:** your-files **r6** — the store INDEX line 40 carries *never `| head`* as well (index file now -15 bytes; every file still net-negative; all 19 BEFORE lines re-checked live: exact).
- **Observation (b) DECLINED, with the reason:** `INSTALL-VERIFY FAILED` keeps `DIED=1` and prints no state note. It already lists every file that does not match; adding text now would put an unreviewed change into the installer minutes before it runs as root. (You called it the right call over a false note; it stays as reviewed.)
- **CI, per job, on the reviewed code `445b6a505` (run `36633724430`):** Build success · TypeScript Check (baseline gate) success · Test Suite success · Docker Build success. ⚠️ CI builds and tests the trading app; it does NOT run these shell scripts. The Helsinki suites are their tests.
- **`deploy_tests.sh` as ROOT on Helsinki at `445b6a505`** (the suite file there has sha256 `3aa4d38dd8b7…`, equal to the committed blob), **60/60**, every line:

```text
PASS test copy: no live write path left in executable lines
PASS D0 self-check: a copy whose bytes differ from deploy.sh at --sha is refused
PASS D0b process substitution (no file to check) is refused
PASS D1-BLOCKER: symlinked lock -> the root-owned target is untouched (rc=0)
PASS D1-BLOCKER CONTROL: r1 handed the root-owned target to langston
PASS D1 readers installed + verified (dt-review bfff20f4576669c841c0e687df37c125132a32a8)
PASS D1 the fetch lock is a langston-owned regular file (created by flock as langston)
PASS D1 decision 14 asserted: refspec dropped, refs/remotes/* empty
PASS D2: a forged blob is caught by the re-hash BEFORE install; nothing changed
PASS D2 CONTROL: r1 INSTALLED the forged bytes (its gate fired only afterwards, rc=3)
PASS D3 short sha refused
PASS D3 off-branch sha refused
PASS D3 absent sha refused
PASS D3 unknown group refused
PASS D3 --only '' and --only , refused (no silent no-op)
PASS D3 missing --sha refused
PASS D4 pre-flight names the missing files and changes nothing
PASS D5 bridges: 11 files installed + verified (crew-status-post.py included)
PASS D5 a fresh host is seeded with COMMS_BACKEND=discord
PASS D5 the running bridges are named NOT RESTARTED; no restart issued
PASS D6 notices: 3 files installed + verified; drift log langston-owned
PASS F2-D4: an existing cron line is found; the crontab is untouched
PASS F2-D4: a missing line is ADDED; the other lines are kept
PASS F2-D4: a failed crontab read -> refused, crontab untouched
PASS F3-D2a: ... and refused in PRE-FLIGHT: nothing was installed
PASS F3-D2a CONTROL: r3 refused only AFTER installing (rc=2)
PASS F2-D4 CONTROL: r1 WIPED langston's crontab on a failed read (0 line(s) left)
PASS F2-D7: a symlinked log is refused; the target stays root-owned
PASS F3-D2b: ... and refused in PRE-FLIGHT: nothing was installed
PASS F3-D2b CONTROL: r3 refused the symlink only AFTER installing
PASS F2-D7 CONTROL: r1 chowned the symlink's root-owned target to langston
PASS F2-D5: run by a relative path, the self-check still finds the file
PASS F2-D5 CONTROL: r2 falsely refused a relative path
PASS F2-B5: the mirror's reflog is on (core.logAllRefUpdates=always)
PASS F2-D1: notices retires its 3 stale staging copies (bridges' copies untouched)
PASS F2-D1: bridges retires the units, the drop-in dir and the old deploy.sh
PASS F2-D9: an unmanaged drop-in is named loudly
PASS F2-D10: an unchanged discord.py is reported as unchanged
PASS F3-D1: a late lock timeout names what WAS installed; daemon-reload ran first
PASS F3-D1 CONTROL: r3 said 'nothing was changed' after installing
PASS F3-D3: bridges are read back with is-active after enable
PASS F3-D3 CONTROL: r3 never read the bridges back
PASS F3-D4: an exported GIT_DIR with a planted filter runs nothing; the install verifies
PASS F3-D4 CONTROL: r3's root git RAN the planted filter as root (rc=0)
PASS F3-D5: a warning on the crontab read is not written into the crontab
PASS F3-D5 CONTROL: r3 wrote sudo's warning into langston's crontab
PASS F3-D6: --only with a newline refused
PASS F3-D6 CONTROL: r3 ran readers only and reported 'bridges' as done
PASS F3-D6: the report names the groups run
PASS G2-D4: dt-backup-sync.sh replaced by rename (inode 393725 -> 393699)
PASS G2-D4 CONTROL: r4 truncated it in place (same inode 393699)
PASS G2-D4b: a group-writable target dir is refused before any install
PASS G2-D5a: a failure inside the install loop reports a PARTIAL install (rc=1)
PASS G2-D5a: no temporary file is left in the target dir
PASS G2-D5a CONTROL: r4 stopped mid-install and said nothing about the state (rc=1)
PASS G2-D5b: a post-install failure in a function says the files ARE installed (rc=1)
PASS G2-D5b CONTROL: r4 stopped after installing and said nothing (rc=1)
PASS G2-D6: a different dt-backup-sync cron line refuses in pre-flight
PASS G2-D6 CONTROL: r4 took the stale line as 'already present'
PASS G2 positive: a clean run still installs and writes the canonical cron line
DEPLOY SUMMARY: 60 pass, 0 fail
```
