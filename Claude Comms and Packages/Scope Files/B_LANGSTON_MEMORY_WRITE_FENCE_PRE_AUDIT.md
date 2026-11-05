# B-LANGSTON-MEMORY-WRITE-FENCE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · **Scope:** `B_LANGSTON_MEMORY_WRITE_FENCE_SCOPE.md` r2 (Langston APPROVED r1 at Step 1 with six conditions, all folded in r2) · **Issue:** `#1234` (+ `#1057`(b), folded) · **Owner:** Infra Claude · **Read at:** `origin/migration/aws-supabase`, 2026-11-05; live reads on Helsinki as root, read-only.

## 0. Previously stated vs now
- **PREVIOUSLY (scope r1):** "335 of the uid-999 rows are claimed by Langston". **NOW:** **173 calls** — 92 `part-ledger-append`, 46 `part-whole-file`, 32 `ledger-file-append`, 2 `compose`, 1 `whole-file` (rows with `outcome == "attempted"`, `via_uid == 999`, `by_claimed == "langston"`, `.memory-archive/index.jsonl`). **REASON:** the index writes an `attempted` row and a terminal row per call (Langston, C-3); this audit counts calls.

## 1. AUDIT

### 1.1 Sources read (the six)
1. **Code, at the ref:** `comms-infra/langston-memory/bin/langston-memory-write` (2,395 lines; installed copy byte-identical, `47738ca3…`, Langston at Step 1): paths `:75-86`, flags `:89-90`, the out-of-band refusals `:955`, `:1686`, `:1890`, first-compose `:945-948`, compose-state write `:911`, the uid gate `:1487-1494`, `--self-test` ownership assertions `:2320`. `comms-infra/langston-memory/bin/langston_memory.py` (the reader): reads `.memory-archive/index.jsonl` (`:366`) and archive files (`:422`); writes only under `/opt/langston-memory/` (`:16-17`, `:73`). `comms-infra/langston/langston-rules-install` (the method reused).
2. **Runtime (Helsinki, 2026-11-05):**

| path | owner, mode | category (scope OBJ-1) |
|---|---|---|
| `MEMORY.md` | langston:langston 0600 | **(a) locks** — a direct write trips `:955`/`:1686`/`:1890` |
| `.memory-archive/compose-state.json` | langston:langston 0600 | **(b) disarms** — its `last_written_sha` is what the refusals and the detector test (C-1) |
| `.memory-archive/` (dir, 401 entries) | langston:langston 0700 | **(b) disarms** — holds compose-state, the index (`index.jsonl`, 0600) and every replaced version |
| `.memory-write.lock` | langston:langston 0600 | **(b) disarms** — unlink and recreate splits the lock across inodes (C-2) |
| `memory-parts/` + `00-legacy.md` | langston:langston 0700 / 0600 | **(c) caught per call** — `--expect-sha` refuses a stale part (exit 4) |
| `LEDGER.md` | langston:langston 0600 | **(c) caught per call** — CAS on its own sha |
| `MEMORY-ARCHIVE.md` | langston:langston 0600 | **(c)** — written by `--trim` only, append-only; a hand edit is caught by the next trim's CAS |
| harness auto-memory `/home/langston/.claude/projects/-home-langston/memory/` | his | **OUTSIDE the fence**: a second store, written by his harness, not by this tool (scope OBJ-1) |

3. **Every account and unit that touches these files** (live `systemctl show -p User`, unit files, and a grep of `/usr/local/bin`, `/usr/local/sbin`, `/opt/langston-memory/bin`, `/opt/discord-bridges`, `/etc/systemd/system`):

| reader / writer | runs as | touches | needs after the fence |
|---|---|---|---|
| CC sessions' writer calls | root | all (a)-(c) | unchanged (root) |
| `langston-memory-trim.service` (03:50Z) | root (no `User=`) | `MEMORY.md`, `MEMORY-ARCHIVE.md`, archive | unchanged (root) |
| **Langston's own 173 calls** | langston (uid 999) | (a), (b), (c) | **through the D1 service (OBJ-3)** |
| the harness (`@MEMORY.md`) | langston | reads `MEMORY.md` | group read: `root:langston 0640` |
| `langston-memory-index.service` | langston | reads `index.jsonl` + archive files (`langston_memory.py:366`, `:422`) | group read on `.memory-archive/` (`root:langston 0750`, files `0640`) |
| `langston-log-loaded` (bridge-invoked) | langston | reads `MEMORY.md` | group read |
| `langston-size-watch`, `langston-selfmemory-backup`, `langston-privacy-check`, `langston-load-canary` | root | read | unchanged |

4. **SYSTEM_IMPACT_MAP:** the writer's entry (`:3921`) records *"it guarantees only writes that go THROUGH it"* — the gap this batch closes; updated at Step 10 with the fence, the service and the detector. **SYSTEM_MANUAL:** silent, correctly.
5. **Ledger:** `#1234`, `#1057` (the 5 hand reconciles, the adopt verb at order 16), `#979` (shared `/tmp`), `#1215` (the size watch alarms only when it stops).
6. **Provenance:** the writer `408ca07a4` (2026-09-11) and the refusal `9b5082440` (2026-09-13), both quoted in the scope §2. `bridge/canonical/`: no coverage.

### 1.2 Findings
- **A1 — census complete; categories as the table.** The fence covers (a) and (b) — `MEMORY.md`, `.memory-archive/` with its contents, `.memory-write.lock`. (c) is left with its reason.
- **A2 — read access after the fence comes from the group, not ownership.** `getent group langston` has exactly one member (Langston, measured at Step 1), so `root:langston 0640`/`0750` keeps today's privacy: no other account gains a read.
- **A3 — the immutable flag does not fit files the writer appends to on every call.** `index.jsonl` is appended on every call (attempted + terminal) and archive files are created exclusively. Setting `+i` on those means clear-append-set on every write. **Plan:** `+i` on `MEMORY.md` and `compose-state.json` (each replaced, never appended); the `.memory-archive/` DIRECTORY becomes `root:langston 0750` (his account can no longer create, rename or unlink inside it — ownership of the directory is what stops that, unlike his home); `index.jsonl` and archive files become `root:langston 0640` (not writable by him); the lock moves INTO `.memory-archive/` (root-owned dir) so he cannot unlink or replace it. **Why ownership suffices inside `.memory-archive/` but not in his home:** the rename/unlink power comes from owning the directory; he owns `/home/langston` (so `+i` is required there) but will not own `.memory-archive/`.
- **A4 — the uid gate.** `:1487-1494` lets root or langston run the writer. After the fence a direct run as langston can no longer write (EPERM). The writer, run as langston, becomes the D1 client (OBJ-3); run as root it is unchanged.
- **A5 — the D1 allowlist, from his own use (§0):** modes `part-ledger-append`, `part-whole-file`, `ledger-file-append`, `compose`, `whole-file`; flags `--expect-sha` (64 hex), `--ledger-delta` / `--retractions-delta` (integers), `--ledger-append`, `--entries` (integer), `--reason` (text, length-capped), `--part` (a name matching an existing file in `memory-parts/`, no path separators), `--compose`, `--dry-run`. `--by` is SET by the service to `langston` (never taken from the request). **Not allowed:** `--trim`, `--split-ledger`, `--rename-part`, `--to` (root-only maintenance). ⚠️ **`--allow-growth` is a ruling for you:** today he can override the growth gate as himself; keeping it keeps parity, dropping it removes a self-granted bypass of the ceiling.
- **A6 — spool shape (Q1 conditions):** `/var/spool/langston-memory/in/` `root:langston 1730` (sticky; his account can create, cannot list or remove others; there are no others) and `out/` `root:langston 0750`, results `0640`. One request = one JSON file (argv list + stdin bytes, size-capped) created by his account; a root `.path` unit triggers the service, which opens each entry `O_NOFOLLOW`, reads it once by fd, validates against A5, runs the writer as root with the validated argv, and writes the result (exit code, stdout, stderr verbatim) to `out/<id>`. The client waits for `out/<id>` with a timeout and exits with the returned code. **The allowlist file is ≤ 150 lines** so it reviews in one sitting (his condition).
- **A7 — `--self-test:2320`** asserts the lock, archive dir, index and archive file belong to the owner; under the fence they belong to root with group langston. Updated in the same change (C-2).
- **A8 — OBJ-7's two homes:** his `CLAUDE.md` write-path lines (via `langston-rules-install`) and the "⇒ THE RECIPE" block in `memory-parts/00-legacy.md` (via a writer call). Exact lines are taken at Step 3 from the live files, because his memory changes daily.

## 2. PLAN — each item points to its finding
| # | item | from |
|---|---|---|
| P1 | Writer: `ensure_fence()` at the START of every root call — sets owner/mode/`+i` idempotently on (a)/(b) (C-4: re-armed at the next call after a SIGKILL); around each replace of `MEMORY.md` or `compose-state.json`: clear `+i`, `os.replace` from a staged file in a root-only dir, set `+i` in a `finally`. The lock path moves into `.memory-archive/`. `--self-test` assertions updated. | A1, A3, A7, C-2, C-4 |
| P2 | Writer as langston → client: build the request, spool it, wait, relay the result verbatim (exit 4's text distinguishes out-of-band from a stale `--expect-sha`, C-3). | A4, A6 |
| P3 | `langston-memory-spoold` (root) + `.path`/`.service` units: the A5 allowlist as the authority, `O_NOFOLLOW` read-once, verbatim result. | A5, A6 |
| P4 | Daily fence check (folds `#1057`(b)): owner/mode/flag on every fenced path, live `MEMORY.md` sha vs `last_written_sha`, and the spool service's state (failed/masked/inactive pages); mints through the existing alert path; **the clear is a hand-resolve with evidence** (no machine actor exists for it; the same constraint as `B-TOKEN-WATCH-STORAGE` A8) — resolved, never acked. Break-glass written into the install record. | C-5, C-6 |
| P5 | Install: the files, the units, then a one-time migration of ownership/modes/flags; `--self-test`; then each of his five modes driven as langston through the spool on a test home first, then live. | A1-A6 |
| P6 | Tests: as langston — `>>`, `>`, temp-and-rename, `mv`, `rm` on `MEMORY.md` → EPERM, and the same on `compose-state.json` and inside `.memory-archive/`; SIGKILL between clear and set → flag CLEAR, next call re-arms it; each mode through the spool, including a refused-growth (exit 7) and a stale `--expect-sha` (exit 4) with their texts; each disallowed flag, a path in `--part`, a symlinked spool entry, an oversize request → refused; the detector pages on a cleared flag, a forged sha and a stopped service. | P1-P4 |
| P7 | OBJ-5: canary LOADED, the 04:10Z index builds, backup reproduction PASS, privacy check PASS, size watch reads. | A2, table |
| P8 | OBJ-6 (Coltrane): `coltrane-memory` has no composed file a hand edit can lock (its store is `<type>_<slug>.md` entry files plus `.history/` copies, `SYSTEM_IMPACT_MAP` "Coltrane's library"); stated with that evidence — the fence does not apply to him. | scope OBJ-6 |
| P9 | OBJ-7 (two homes) and governance: SIM writer entry; `LANGSTON_ARCHITECTURE.md` (his write path changed — before/after); `#1234` and `#1057` updated; my task list; the completion report. | A8 |

**`UNAUDITED`:** none. **For ruling:** A5's `--allow-growth`; A3's split between `+i` and directory ownership.

## 3. Plain-language summary
I listed every file Langston's memory tool uses, and everything that reads or writes them. Three things get locked down: his main memory file, the record the tool uses to spot outside edits, and the folder that holds its history. After this, only the tool can change them. Langston keeps saving his own memory by handing each save to a small service that runs with administrator rights and only accepts the five kinds of save he actually uses. Everything that reads his memory keeps working, because his account can still read, just not write.
