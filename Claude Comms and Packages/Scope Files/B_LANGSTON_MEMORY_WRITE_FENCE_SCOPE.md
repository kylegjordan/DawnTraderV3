# B-LANGSTON-MEMORY-WRITE-FENCE — SCOPE r1

change-class: non_architecture

> **Class:** `non_architecture`, on the precedent of `B-LANGSTON-CONTEXT` and `B-LANGSTON-CLAUDEMD-RESIDUAL` (re-declared by Langston's Step-4 C-2): no trading architecture, strategy, regime, filter, pipeline or math changes, so the System Manual does not apply; the System Impact Map does and will be updated.

**Issue:** `#1234` (raised by Langston 2026-10-20T21:58Z; placed by Kyle 2026-11-04). **Owner:** Infra Claude (CC-INFRA), with Langston (it is his memory file).
**Placement:** `SPRINT_TO_LIVE_PLAN.md` §0a, stage "0 — clear the plates (Infra Claude)", order 4, after `B-LANGSTON-CLAUDEMD-RESIDUAL`.
**Langston's words (2026-10-20T21:58Z, the post that raised it):** *"`--expect-sha` guards only the *part*; nothing stops another session writing the composed output, and each occurrence locks all of us out. This is at least the sixth, and the first by a non-Langston session — that is new, and it is why a reminder in my file won't hold."*

## 0. What happens today, measured 2026-11-05 on Helsinki (read-only)

**The lock.** `langston-memory-write` composes `/home/langston/MEMORY.md` from `memory-parts/00-legacy.md` and records the sha it wrote (`compose-state` `last_written_sha`). Before every write it compares that sha with the live file; a mismatch refuses with *"REFUSED: … was written OUTSIDE the composer (out-of-band)"* (`comms-infra/langston-memory/bin/langston-memory-write:955`, `:1686`, `:1890`). The refusal is correct — it keeps the hand edit instead of overwriting it — but it refuses every later write by everyone until someone reconciles by hand.

**How often.** The writer's own index (`/home/langston/.memory-archive/index.jsonl`, 449 rows) records 5 hand reconciles whose `reason` names an out-of-band edit: 2026-09-13, 09-30, 10-02 (twice) and 10-20. 4 of the 5 were Langston's own edits; 1 was CC-C's. The 2026-09-29 entry on `#1057` records a sixth, after the tool had refused for 16 days. *Population limit: this counts reconciles whose reason uses the words "out-of-band"; one worded differently is not counted. Langston's own count is "at least six".*

**Who writes through the tool, by account** (same index, `via_uid`): root (every CC session, and the 03:50Z trim timer, whose unit has no `User=`) and Langston's own account (uid 999). **335 of the uid-999 rows are claimed by Langston himself** — 184 `part-ledger-append`, 87 `part-whole-file`, 58 `ledger-file-append`, 4 `compose`, 2 `whole-file`. He writes his memory himself, through the tool, most days.

**The file's protection today:**

| object | owner, mode | immutable |
|---|---|---|
| `/home/langston` | langston:langston 0750 | — |
| `MEMORY.md` | langston:langston 0600 | no |
| `memory-parts/00-legacy.md` | langston:langston 0600 | no |
| `LEDGER.md`, `MEMORY-ARCHIVE.md` | langston:langston 0600 | no |
| `/usr/local/bin/langston-memory-write` | root:langston 0750 | — |

`sudo -l -U langston`: *"User langston is not allowed to run sudo"*. There is no `/etc/claude-code/managed-settings.json` on the box.

**What this means for a fence:**
1. **A fence that blocks only OTHER accounts misses 4 of the 5 recorded cases** — they were Langston's own.
2. **A fence that blocks Langston must keep his 335-call path working, and must not give his account root.** His account runs a permission-bypassed agent whose prompts come from the Discord channel.
3. **Changing the owner alone does not fence anything.** The directory is his, so his account can rename or delete any file in it, whoever owns the file. Only the immutable flag stops a rename by the directory's owner, and only root can set or clear it. That is the `B-LANGSTON-CLAUDEMD-RESIDUAL` method: root-owned, the flag set, the new bytes staged in a root-only directory and renamed over the target, the flag set again in a `finally` (`comms-infra/langston/langston-rules-install`, docstring steps 3–5).

## 1. Objectives

| # | objective | done when |
|---|---|---|
| OBJ-1 | **Census (Step 2), before any design is fixed:** every file the writer owns; for each, whether a direct write locks the tool or is merely caught per call (`MEMORY.md` locks; a part is guarded by `--expect-sha` per call); every account and unit that reads or writes each one — the CC sessions, Langston's own calls, the trim timer, the size watch, the load canary, the recall index, the self-memory backup, the privacy check, and the harness loading `@MEMORY.md` into every invoke. | A table in the pre-audit, each row cited to code at the ref or to a live read with its command. The fence covers exactly the files that LOCK; a file that is only caught per call is listed and left alone, with the reason. |
| OBJ-2 | **The fence.** Each file OBJ-1 finds that locks becomes root-owned, readable by Langston's account (`root:langston 0640`, keeping today's privacy: no other account reads it), with the immutable flag set. The writer clears the flag, renames its staged file into place and sets the flag again in a `finally`, staging in a root-only directory — the RESIDUAL method, reused, not re-written. | **Positive controls, each run as the account named:** as langston — append (`>>`), overwrite (`>`), write-a-temp-and-rename (the shape an editor tool uses), `mv` over, `rm` — **each fails with "Operation not permitted"**; as root, `cat >` fails the same way. After the attempts the file's sha is unchanged. A writer call then succeeds and the flag is set again afterwards. A writer killed between clearing and setting the flag leaves it set (the `finally`, exercised by a fault injection). |
| OBJ-3 | **Langston keeps writing his own memory, without root.** His command line does not change: the writer, run as his account, hands the request to a root-owned service that runs the writer as root, and returns its exit code and output. **No sudo rule.** (Design candidates in §3; Langston rules at Step 1, the pre-audit fixes the detail.) | Each of the five modes he uses (above) succeeds when run as his account, with the same exit codes and output as today (exit 4 on a stale `--expect-sha`, exit 7 on growth over the ceiling, and so on). The service refuses a mode outside that list, any path argument it was not built to take, and a spool entry that is a link — each refusal tested. `sudo -l -U langston` is unchanged. |
| OBJ-4 | **A fence that has been switched off is noticed.** A daily check that each fenced file still has its owner, mode and flag, and that its live sha equals `last_written_sha`; a mismatch pages Infra Claude through the existing alert path. | Positive control on a test home: clear the flag (or edit the file out-of-band) → the check pages; restore → it clears. The check's own failure (unreadable state) pages too, never reads as PASS. |
| OBJ-5 | **Every reader still reads.** | After install: load canary LOADED; the 04:10Z recall index builds; the self-memory backup's reproduction check PASSES; the privacy check PASSES (and still sees the file — its reach re-derived, not assumed); the size watch reads the file; Langston's next real invoke loads `@MEMORY.md` (canary probe, not inference). |
| OBJ-6 | **Coltrane parity.** His memory store is written by `coltrane-memory`. | Written per objective: whether his store has a composed file that a direct edit can lock (measured at Step 2). If not, the fence does not apply to him and that is stated with the evidence. |
| OBJ-7 | **The instructions match the new reality — no new rule.** Langston's `CLAUDE.md` already tells him to write only through the tool, and that failed while loaded (Langston 2026-09-29 22:03Z, `#995`). Nothing is added to it; any line that describes how to write the file is corrected so it does not describe a path that now fails. Same for `workflow-10-governance`'s Langston row. | The lines are listed in the pre-audit; edits ride `B-LANGSTON-CLAUDEMD-RESIDUAL`'s install path (his file changes only by a reviewed install). |

## 2. Provenance read (Step 1.b)

Corpora searched: `RUNNING_ISSUES.md` (`#1234`, `#1057`, `#979`), `SYSTEM_IMPACT_MAP.md` ("`langston-memory-write` — THE ONE WRITER FOR LANGSTON'S MEMORY FILE"), `LANGSTON_ARCHITECTURE.md` §4 and its change log, `SPRINT_TO_LIVE_PLAN.md` §0a, and `git log -S` on the writer's symbols (not path-limited). `SYSTEM_MANUAL.md` has no entry for the writer (searched for `langston-memory-write` and `/home/langston/MEMORY`), which is consistent with the class above.

- **Tier 1 — `langston-memory-write` (behaviour changes: the flag around its rename, and a request path for Langston's account).** Introduced `408ca07a4`, 2026-09-11, subject verbatim: *"B-LANGSTON-CONTEXT Step-3 (increment 2, chunk 2 part 2): P-6b - Langston's memory file gets ONE writer, its archive joins the verified backup, and the /tmp recipe is retired in the same commit"*. The out-of-band refusal arrived with composition, `9b5082440`, 2026-09-13: *"B-LANGSTON-CONTEXT P-2 unit 1: the --compose mode (parts -> MEMORY.md), Langston's 20:48Z conditions folded"*. Its own map entry states the gap this batch closes: *"it guarantees only writes that go THROUGH it. A root session that edits the file by hand bypasses every check."* **Disposition (2): relevant, needs updating to today's intent** — one writer was the intent from the start; the filesystem never enforced it.
- **Tier 1 — the file's permission model (`MEMORY.md`, langston-owned 0600).** INFERRED-FROM-CODE: no commit or entry records choosing langston ownership for the composed file; it predates the writer (the file existed as Langston's own state since 2026-05-06). **Disposition (2).**
- **Tier 2 — read or run, behaviour unchanged:** the trim timer (runs the writer as root — unaffected by the fence except through the writer); `langston-size-watch`, `langston-load-canary`, the recall index, `langston-selfmemory-backup`, `langston-privacy-check` (readers — OBJ-5); the harness's `@MEMORY.md` import (a reader, as his account — hence group-read for langston).

## 3. Langston's account: three candidate designs (for his ruling)

| | design | for | against |
|---|---|---|---|
| **D1 (recommended)** | The writer, run as his account, puts the request (its arguments and stdin) in a spool directory only his account can write, and waits; a root service (path- or socket-activated) takes it, re-checks it against a fixed list of modes and arguments, runs the writer as root, and hands back the exit code and output. | No sudo; root accepts a fixed, narrow request shape; his command line and exit codes stay the same. | New moving part; the root side must treat the spool as hostile (links, races, size) — the same care `coltrane-telegram-corpus-install` needed. |
| D2 | A sudo rule letting his account run exactly the writer as root. | Smallest change. | Any argument-handling bug in a 2,395-line tool becomes root for an account fed from Discord. |
| D3 | A root-owned managed-settings rule denying his editor tools that path. | No root service. | Stops his editor tools only, not a shell redirect, and nothing for other sessions; a second layer at most, not the fence. |

## 4. Questions for Langston

- **Q1:** D1, D2 or D3 (or a fourth)?
- **Q2 — `#1057` (`B-LANGSTON-RECONCILE-VERB`, order 16):** its (b), a daily out-of-band check, is the same check as OBJ-4 here. Fold (b) into this batch (§9.4 disposition 1, since this batch needs it to verify itself) and leave (a), the reviewed adopt verb, at order 16 for the rare deliberate bypass? My recommendation: yes.
- **Q3:** the parts and `LEDGER.md` — fence them too, or leave them caught per call? My recommendation: fence only what LOCKS (OBJ-1 decides), so nothing is fenced without a measured reason.

## 5. Out of scope

`#1057`'s adopt verb (unless Q2 says otherwise); Langston's `CLAUDE.md` content beyond OBJ-7's line corrections; the ceiling (row 2.8a/2.8b); his model.
