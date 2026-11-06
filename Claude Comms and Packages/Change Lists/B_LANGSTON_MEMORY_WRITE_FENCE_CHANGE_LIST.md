# B-LANGSTON-MEMORY-WRITE-FENCE — Step 4 change list

## Dispatch header
- **(i) Declared change-class:** `non_architecture` (scope header).
- **(ii) That class's doc set:** scope `B_LANGSTON_MEMORY_WRITE_FENCE_SCOPE.md` r2 **present** (Step 1 APPROVED) · pre-audit `B_LANGSTON_MEMORY_WRITE_FENCE_PRE_AUDIT.md` r2a **present** (Step 2 PROCEED, C-14/C-15 folded at `4b3d081ff`) · this change list **present** · completion report **absent, not yet due** · SIM writer entry, `LANGSTON_ARCHITECTURE.md`, `#1234`/`#1057`, the OBJ-7 lines **absent, not yet due** (Step 10, P9).
- **(iii) Step-2 reference:** the pre-audit r2a above.
- **Graded ref:** `9ca9e2019` (code `2a336946a`, root-suite expectation `d25a30cfe`, executable bits `9ca9e2019`). Diff: `git diff 4b3d081ff..9ca9e2019 -- comms-infra/langston-memory/ comms-infra/systemd/`.

## What changed, by plan item
**P1 `langston-memory-write`.**
- `fence_table()` — ONE per-path table of owner, group, mode and `+i`: `MEMORY.md` and `MEMORY-ARCHIVE.md` `root:langston 0640 +i`; `compose-state.json` `root:root 0600 +i`; `.memory-archive/` `root:langston 0750`; `index.jsonl` and archive files `root:langston 0640`; the lock, now inside `.memory-archive/`, `root:root 0600` (the spec did not say; judgement call).
- `owner_only()` and `hand_to_owner()` both read the table; each docstring is rewritten as disposition (2) with the 2026-10-17 premise and its inversion stated (A9, A11/C-14).
- `ensure_fence()` runs under the lock at the start of every root call, idempotently (C-4).
- Every replace of a `+i` file: stage inside `.memory-archive/` (root-only, same filesystem — C-10), clear `+i`, `os.replace`, set `+i` in `finally`. ⚠️ **Judgement call:** the flag is set and cleared by the `FS_IOC_SETFLAGS` ioctl on an `O_NOFOLLOW` file descriptor, not by running `chattr` on a path — `chattr` re-resolves the name, so a name he swaps inside his own home in that window could receive the flag. The FINAL set goes on the staged file itself. The daily check reads the flag with `lsattr`, so the instrument stays independent of the writer.
- ⚠️ **Refuse, never adopt:** `ensure_fence` refuses (exit 6, *"never adopted"*) any fenced path owned by another account, except `MEMORY.md`, whose bytes are already checked against compose-state. **So P5 must chown the live `.memory-archive/` (401 langston-owned entries) BEFORE the new writer's first call.**
- `--self-test` is root-only; its teardown clears the flag (`chattr -R -i`) and removes WITHOUT `ignore_errors` (C-8).

**P2 the client branch** is the first statement of `run()` (C-9 — what makes compose-state `root:root` safe). Run as langston, the writer builds a request (argv + stdin, size-capped), writes it into `tmp/` and renames it into `in/` (so the path unit never sees half a request), waits for `out/<id>.res`, relays exit code, stdout and stderr verbatim, and rewrites exit 7's `--allow-growth` advice to *"shrink in the same write, or ask Infra Claude to run it as root"*.

**P3 `langston-memory-spoold` (new, 277 lines) + `langston-memory-spoold.{path,service}`.** Each entry: `open(O_RDONLY|O_NOFOLLOW|O_NONBLOCK|O_CLOEXEC)` (a link refuses; a FIFO cannot stall it) → `fstat` on the fd: a regular file, ONE link, owned by langston → read once by fd, size-capped → the name is unlinked only AFTER the read and only if it still holds the inode that was read → validate the IN-MEMORY copy against `langston_memory_allowlist.py` (new, 123 lines: the five modes, the A5 flags, `--part` a plain name of an existing part, `--reason` capped) → run the writer as root from that same copy with `--by` forced to `langston` (a request's `--by` is overridden, not refused — judgement call) → result to `out/<id>.res` `root:langston 0640` via temp + rename. Spool `tmp/` and `in/` `root:langston 1730`, `out/` `root:langston 0750`.

**P4 `langston-memory-fence-check` (new, 348 lines) + `.service/.timer`.** Daily: every fenced path against the SAME table (`lsattr` for the flag), live `MEMORY.md` sha vs compose-state `last_written_sha`, the spool `.path` active and enabled and `.service` neither failed nor masked, and the trust chains of the writer, service and allowlist (A10). It mints through the existing alert path; its own failure pages; the row clears only by hand-resolve with evidence (stated in the body). Exit 1 (alert armed) counts as success in the unit, matching `langston-privacy-check`.

**P6 tests.**
| suite | where | result |
|---|---|---|
| `test_memory_fence.py` (pure) | laptop | ALL PASS, exit 0 |
| `mutate_memory_fence.py` | laptop | **13 of 13 caught**, by exit code and named FAIL line — allowlist bypass, `--part` path, `--by` from the request, no size cap, client branch inside `open_lock`, `owner_only` restored, `hand_to_owner` on the target's owner, lock or stage back in his home, no exit-7 rewrite, no `O_NOFOLLOW`, unlink before read, re-read by path |
| `test_memory_fence_root.py` (root, Linux) | **Helsinki, scratch `/srv/lmw-fence-test`, stand-in account `nobody`, at `9ca9e2019`** | **173 / 0, exit 0** — §1 his five modes through the real spool and service with the table asserted after each (83); §2 refusals verbatim (12); §3 `>>`, `>`, temp-and-rename, `mv`, `rm` refused (14); §4 `MEMORY-ARCHIVE.md` fenced after a trim (20); §5 SIGKILL between clear and set leaves the flag CLEAR and the next call re-arms it (2); §6 the daily check pages on a cleared flag, a forged sha and a stopped service, never reads a failure as PASS (35); §7 the known gap below (3); §8 the self-test leaves nothing behind (4) |
| `test_memory_trim.py`, `test_ledger_split.py` | teardown only | clear `+i` before removing |

Round 1 of the root suite (`2a336946a`) was 172/1: an append to `compose-state.json` was REFUSED as intended, but with EPERM not EACCES — the kernel checks the immutable flag before the mode bits on a write open. The fence held; the expected text was corrected (`d25a30cfe`). Never touched `/home/langston`, the live spool, the live units or the alerts.

## For your ruling — the gap the build found
**`.memory-archive/` is itself an entry in his home, so his account can rename it away and create its own** (A3's ownership argument covers what is INSIDE it, not the directory). Measured in §7: the rename succeeds; the next root call REFUSES (exit 6, never adopted) and the daily check pages; restored by root, the next call exits 0. So today it is a loud refusal plus a page, never a silent bypass — but it is a denial of his own writes until root restores it. Closing it needs either `+i` on the directory (which would stop the writer creating archive files in it) or moving the archive out of his home (which moves `langston_memory.py`'s reader paths, the backup and the size watch). My recommendation: accept the loud refusal for this batch, and name the move as a follow-on only if you rule the gap must close.

## Not yet done
P5 install (chown of the live `.memory-archive/` first; old lock deleted; no two writer versions across the lock move; `fs.protected_*` recorded), P7, P8, P9.

## Smaller things to attack
1. The ioctl-on-fd flag mechanism instead of `chattr` on a path.
2. `--dry-run` is in A5's allowlist but the writer accepts it only with `--trim` (disallowed), so through the spool it can only ever return exit 2 — strike it from the allowlist, or leave it as harmless?
3. A10 said `hand_to_owner()` "walks" a path chain; it does not — the check walks the writer, service and allowlist chains instead.

## Step 7 — a test this batch broke and did not run (found 2026-11-06 at B-LANGSTON-TWO-WORKERS Step 3; §9.4 disposition 1, folded here)
- **`test_memory_trim.py` has failed since `2a336946a` (this batch's Step 3).** That commit dropped `growth_gate`'s `st` argument and moved index writes behind the FENCE table, and the trim suite's LIVE-gate section was not updated: it called `growth_gate(..., st_, "test")` (a `TypeError`), and once that call was fixed its four LIVE checks still refused with exit 6, *"index.jsonl has no row in the FENCE table"*, because the table is built at import from the live home and the test re-points the module afterwards. The change list's line 30 recorded this file as "teardown only", and the suite is not in CI, so nothing caught it.
- **Fix:** the call drops `st_`; after re-pointing the module the test rebuilds `g.FENCE = g.fence_table(h.top, g.OWNER)`. **Result: 62 PASS, 0 FAIL**, on the writer at HEAD and on the two-workers writer (Helsinki, as root).

## Step 7 — the scheduled fence check (2026-11-06 05:51:37Z): PASS
- `langston-memory-fence-check.service` on its timer: **"PASS: 0 finding(s), 0 unmeasured; alerts: none"**, `Deactivated successfully`. Next run 2026-11-07 05:51Z.
- With this, the shrink gate (installed 2026-11-05 18:15Z at `fe3c4ad1f`), the fence and the daily check are all live, and the trim suite this batch broke is repaired (`1c6cb9f4d`, 62/0). **Step 7 complete; Step 8 next.**
