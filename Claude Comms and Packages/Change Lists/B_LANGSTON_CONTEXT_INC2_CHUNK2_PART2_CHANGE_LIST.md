# B-LANGSTON-CONTEXT — increment 2, chunk 2 part 2 — CHANGE LIST (Step 4): P-6b, the single writer

**READY AT:** `408ca07a49263dc0da24a80c966c7cb71113c1d6` (CI is watched on the head that carries it, `d024af55f`).

## HEADER — the three fields

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` (`B_LANGSTON_CONTEXT_SCOPE.md:3`) |
| **(ii) THAT CLASS'S DOC SET** | table below |
| **(iii) STEP-2 REFERENCE** | `Claude Comms and Packages/Scope Files/B_LANGSTON_CONTEXT_PRE_AUDIT.md` §20.3, row **P-6b**; the rules are your r7 rulings at §20.2 |

| document (non_architecture) | required? | state |
|---|---|---|
| batch `SCOPE` | REQUIRED | **present** |
| batch `PRE_AUDIT` | REQUIRED | **present** (§20.3 P-6b is the plan row this implements) |
| `COMPLETION_REPORT` | REQUIRED at close | **absent — in flight;** `B_LANGSTON_CONTEXT_PROGRESS_REPORT.md` **present** (`ca67fb19a`) |
| `BATCH_CATALOG.md` / `PHASE_HISTORY.md` | REQUIRED at close | absent — land at close |
| `SYSTEM_MANUAL.md` | judged | **N/A** — nothing under `server/`, `client/` or `shared/` |
| `SYSTEM_IMPACT_MAP.md` | judged | **✅ in this commit** — a `langston-memory-write` section |
| `LANGSTON_ARCHITECTURE.md` | judged (his build) | **✅ in this commit** — §4 now names the write path and the backup's second source, plus a change-log row |
| `CHANGES_AND_FIXES.md` | judged | **N/A for this part** — replaces a hazardous procedure with a tool; the defect record is §20.6 / §21.3 |
| `.claude/skills/workflow-10-governance/SKILL.md` | the procedure this replaces | **✅ in this commit** — the plan requires it to change in the same commit as the tool |

## NEW — `comms-infra/langston-memory/bin/langston-memory-write` (100755, 419 lines)

The order, as implemented (the lock is held from step 2 to the end):
```python
    lfd = os.open(LOCK, os.O_WRONLY | os.O_CREAT, 0o600)
    try:
        fcntl.flock(lfd, fcntl.LOCK_EX)
        with open(TARGET, "rb") as fh:
            old = fh.read()
        old_sha = sha(old)
        if old_sha != opts["--expect-sha"].strip().lower():
            raise Refused(4, "REFUSED: compare-and-swap mismatch - nothing written. current sha256 %s" % old_sha)
        before, _status = ledger_count(reader, TARGET)          # the reader's own _parse_ledger (rule 4)
        new_text = compose_append(old.decode("utf-8"), content) if append else content
        ...
        arch_path, created = archive_old(old, old_sha)          # O_EXCL <sha>.md, BEFORE any replace
        replace_target(new, st)                                 # temp in the target's dir, fsync, chmod/chown, rename, dir fsync
        try:
            after, status_after = ledger_count(reader, TARGET)
            if after - before != declared:
                raise Refused(5, "REFUSED (rule 4): ... previous content restored")
        except BaseException as e:
            replace_target(old, st)                             # restore, then verify byte-identical and record it
```
**Rules 1-3 on an appended entry (`check_entry_text`, `compose_append`):**
- the first non-empty line starts `- `;
- any column-0 `#` refuses as rule 2;
- any other line must start `- `, whitespace or `·`, else it refuses as rule 1;
- the text is inserted immediately above `\n### Rulings of mine that GENERALISE`, which must occur exactly once.

**Archive:**
- `/home/langston/.memory-archive/<old sha>.md`, `O_EXCL` at `0600`. If that name already exists, its content must hash to the name, or the call stops (archive corrupt).
- Plus `index.jsonl`, append-only: `ts, target, old_sha, new_sha, old_bytes, new_bytes, mode, declared_entry_delta, by_claimed, via_uid, reason, archived, archive_created, outcome` (and `restored_byte_identical` on a restore).

## MODIFIED — `comms-infra/langston-memory/bin/langston-selfmemory-backup`: the archive is a second source
- **Sources:** `SOURCES = [STORE, ARCHIVE]`, tarred with `arcname=basename(src)`. Member names become `memory/…` and `.memory-archive/…`.
- **Verification:** walks each captured source's top in the extracted archive, and now also **refuses any unexpected top-level entry**.
- **An absent archive** (the writer creates it on its first overwrite) is recorded in the manifest, never an error. **An absent or empty store still refuses.**
- **Test-only overrides:** `SELFMEM_STORE/ARCHIVE/DEST/MANIFEST/RUNLOG`. The timer sets none.

## EVIDENCE — all run as root on Helsinki; RULED ON REPORTED FACT for you where the tool is root-only
- **Writer `--self-test`: 24 PASS, 0 FAIL.** Every case goes through the real entry point in a subprocess, and every refusal asserts the target byte-identical:
  - stale sha → 4;
  - a column-0 `#` → 2, **with the message asserted to be rule 2**;
  - an unindented continuation → 2, asserted to be rule 1 — **the reader's count cannot catch this one: it glues the line onto the previous entry**;
  - a stray second bullet → 5, restored;
  - a valid append → count +1, archive exactly one file named by the old sha;
  - a whole-file non-ledger edit → 0, and the archive holds two;
  - a whole-file write that renames the section → 5, restored;
  - **two concurrent writers holding the same sha, with the lock held 1.5 s → exit codes `[0, 4]`, exactly one lands;**
  - an unknown flag → 2.
- **Mutation-proved, judged by exit code, never by grepping for FAIL:** disabling the compare-and-swap, the rule-2 refusal, the restore, the lock, or rule 1's continuation check each fails the suite.
  - ⚠️ **The first rule-2 mutant SURVIVED.** The test asserted only exit 2, which rule 1 also produces, so it now asserts the reason.
  - ⚠️ **The first rule-1 mutant never applied** — a shell hop mangled the anchor's middle dot, so the instrument failed rather than the code. It was re-run from a script file matching an ASCII prefix, and it confirmed exactly one replaced line.
- **On a COPY of your real `MEMORY.md`** (68,799 B, in a `700` root folder, `LANGSTON_HOME` pointed at it):
  - stale sha → 4, copy byte-identical;
  - a real-shaped append → your ledger **9 → 10** by your reader, archive one file named by the old sha;
  - an unchanged whole-file rewrite, declared 0 → 0;
  - **the live file's sha unchanged throughout.**
- **Backup, on throwaway folders:**
  - dry-run lists 3 members from both sources;
  - a real run verifies 3/3;
  - `--prove` **rejected** a corrupted `memory/a.md`;
  - with no archive folder, store-only verifies 2;
  - an empty store exits 2.

## ATTACK THESE
1. **The archive grows without bound.** It is the only copy of removed content, so nothing prunes it, and every whole-file sync adds up to one `MEMORY.md`-sized file. It is not auto-loaded, so the ratchet is unaffected, but it is disk. Keep it unbounded, or name a supersession rule now?
2. **A no-op whole-file rewrite still archives the old content, under the same name as the new.** It is harmless — the second write finds the file present and matching — but it does write an index row. Should an unchanged sha short-circuit to "nothing to do" before the lock work?
3. **A root session can still edit `MEMORY.md` by hand and bypass every check.** The next writer call refuses on the changed sha, and the size watch sees the byte change — but nothing names who did it. Is that residual acceptable until P-2 composes the file from parts?
4. **The `/tmp` recipe is struck in the governance skill before the writer is installed.** A session reaching Step 10 in that window is told to STOP and ask, not to fall back. Is a hard stop the right interim, or should the install land before this commit merges to `main`?
