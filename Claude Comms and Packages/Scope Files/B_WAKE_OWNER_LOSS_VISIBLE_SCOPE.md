# B-WAKE-OWNER-LOSS-VISIBLE — SCOPE (Step 1, r1)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1p**, after row 1o (`B-WAKE-ARM-EXCLUSIVE`, closed 2026-10-02) · **Issue:** `#1142` · **Placed by:** Langston, 2026-10-01 (`a89a90138` install approval), §9.4 disposition 3. Two items added since, both §9.4 disposition 2 from `B-WAKE-ARM-EXCLUSIVE` (Step 7 and Step 10); the second is a stated objective with its own check (Langston, Step 11 condition A).

## 0. WHY

Each session's wake filter keeps a record of who owns each alert, taken from Langston's `[[ALERT … owner=…]]` markers. The per-turn alert hook reads it to show a session only its own alerts. When that record cannot be saved (the ~5 s retry runs out), the filter still delivers the wake but names the lost routing only on stderr — the task's output file, which nobody reads once the task is gone (`#1142`). The effect is fail-open: the alert shows to every session instead of its owner. That is noise, not a loss — but nobody can tell it happened or which alert it was.

**MEASURED BEFORE SCOPING, and it changes the size of the batch (laptop-only, RULED ON REPORTED FACT for Langston):** across **1,436** surviving watcher task-output files (all four sessions; oldest 2026-09-22), the line `alert-owner record NOT saved` appears **0** times. The one grep hit was this session's own `git log` output, not a watcher. **Controls:** the same search finds `WAKE[` in 479 files and the filter's other stderr diagnostic (`alert marker NOT recorded`) 15 times, so it can see filter stderr. **Population limit:** the line exists only since `ecabf7a47` (2026-10-01), and only outputs that survived are counted. Langston named the dominant cause as a duplicate watcher holding the file; `B-WAKE-ARM-EXCLUSIVE` has since made that impossible for leased arms. ⇒ **This batch makes a rare and so far unobserved loss visible. It does not fix a measured one.** The batch stays small.

## 1.a ARCHITECTURAL READ

- **SYSTEM_IMPACT_MAP.md**, "Discord Comms Fabric" → the B-TOKEN-BURN-CUT content update ("Alert-owner record (amendment 1, OBJ-5/OBJ-6) … A save that fails past the retry no longer drops the wake on the same line; it names the lost routing (`#1142` makes that visible in band)") and the B-WAKE-ARM-EXCLUSIVE content update (the lease, the `WATCHER-` vocabulary). The "Claude Code Hook Layer" row for `inject-due-alerts.mjs`.
- **SYSTEM_MANUAL.md**: silent on the wake watcher and the alert hook, correctly — comms tooling, SIM-scope.
- **Components:**
  - `comms-infra/laptop/cc-wake-filter.py` — `record_owners` / `_save_owners` (tier 1: behaviour changes on a failed save); the reader census's start stamp (tier 1: output format changes); the UNROUTED-LINE diagnostic's comment (tier 1, comment only).
  - `.claude/hooks/inject-due-alerts.mjs` (tier 1: a new line in its output).
  - `.claude/hooks/alert-split.mjs` (tier 2: reads the owner record; unchanged).
  - `~/.claude/cc-wake-state/<ALIAS>.alert-owners.json` (the record; its readers are the hook and the filter).

## 1.b PROVENANCE READ

Corpora searched: `RUNNING_ISSUES.md` (`#1142`, `#1140`), `BATCH_CATALOG.md` (B-TOKEN-BURN-CUT, B-WAKE-ARM-EXCLUSIVE), the two completion reports, and `git log -S`, not path-limited.

| component | introducing commit, quoted | disposition |
|---|---|---|
| the failed-save branch of `record_owners` | `ecabf7a47` (2026-10-01): *"record_owners catches OSError, names the lost routing on stderr and carries on — the record is advisory, the wake is not."* | **(2) relevant, needs updating**: the wake-protection stays exactly as it is; only where the loss is NAMED changes. |
| `_meta.rejects` in-band precedent (the model for this batch) | `c2d3c3f93` (2026-09-30): *"(c): rejected markers are kept in _meta.rejects (last 20) and the hook shows"* them | (1) still correct; this batch follows its shape. |
| the census's reader start stamp | `22336156f` (2026-10-02, B-WAKE-ARM-EXCLUSIVE Step 3): *"A newcomer acquires only when the holder's loop is dead … AND no reader of the alias runs (the one predicate, now owned by the filter's --count …)"* — the stamp was added to NAME an orphan's start; its timezone was never specified (`CreationDate.ToString('s')` is local). Found live at Step 7 (2 h skew, Central European time). | **(2)**: LOCAL time beside a UTC lease stamp. |
| the UNROUTED-LINE comment's stdout/stderr reason | `bb1b19044` (2026-08-20, `#730`, Langston's rider): *"The chain now has an else that writes UNROUTED LINE (cur=...) to STDERR, so a header-less harness announces itself instead of impersonating a clean suppression. Stderr deliberately: the Monitor treats stdout as the event"* stream. The diagnostic itself stays (1); only its stated reason is stale — the Monitor form retired at `#1127`. | **(2) comment only**: the reason it gives is stale since `#1127`. |
| `alert-split.mjs` (tier 2) | reads the owner record and narrows only a seeded one (`c2d3c3f93` (b)) | (1) unchanged. |

## 2. DESIGN — ONE CHOICE FOR LANGSTON

Langston's 2026-10-01 direction (`#1142`): no retry from memory; a process-local counter written as `_meta.lost_routing {count, last_ts}` on the next successful save, beside `_meta.rejects`, for the hook to show.

**The gap in that form, which I am asking him to rule on:** the next successful save often never comes. A `--once` watcher exits on its first wake, and a Langston reply addressed to this session IS that wake line. So the counter dies with the process in exactly the case where the reply was for this session. The same holds for a reply carrying several markers: one failed save means none of its owners are recorded. **`NOT RE-READ`** — a mechanism claim not routed to a separate reader. Its basis is the code: the recorder runs before every decision in the Langston branch (`cc-wake-filter.py`, the C2 comment above `OWNERS_FILE`), and a `--once` run exits after printing its wake.

- **Option A (his form):** counter → `_meta.lost_routing` on the next good save. Simple; loses the count when the failing line is the last one the process handles.
- **Option B (recommended):** on a failed save, append one JSON line `{ts, ids:[…]}` to a sidecar, `<ALIAS>.alert-owners.lost.jsonl`, with a plain append — no rename, so no dependence on the next save. **This carries no dict forward; it writes only the fact of the loss and which alert ids it concerned.** The hook reads the sidecar and shows a lost id until a LATER owner entry for that id exists (`owners[id].ts` newer than the loss), or for 24 h. No write is needed to clear it, because the hook decides at read time. If the append also fails, the stderr line stays as the last resort, and that residue is named.
  - Unmeasured, stated as such: whether an append can fail on a file another process has open on Windows. The hook reads with Node (`readFileSync`), which opens with shared read/write/delete access, so I expect not; the test plants a held file to check.
- **Shown to whom:** the session whose OWN record lost the routing (each session reads its own record), unlike the rejects, which go to CC-A because they are Langston's to fix. A lost routing makes that session's view of an alert read as unrouted; the line tells it which ids and that Langston's next marker repairs them.

## 3. OBJECTIVES

| # | objective | check |
|---|---|---|
| **OBJ-1** | A failed owner-record save leaves an in-band record of the loss, with the alert ids, that survives the process exiting on that same line | test: hold `<ALIAS>.alert-owners.json` so the replace fails, feed one Langston line with two markers to `--once`, let it exit; the loss record names both ids. Control: the current filter leaves no record. |
| **OBJ-2** | The per-turn alert hook shows the loss to the session whose record lost it, and stops showing an id once a later marker has recorded it | hook test: a loss record + no newer owner entry → the line names the id; a newer owner entry → nothing; older than 24 h → nothing |
| **OBJ-3** | The wake is still delivered on a failed save (no regression of `ecabf7a47`) | the existing case in `scripts/analysis/test-wake-filter-cuts.py` still passes |
| **OBJ-4** | The `WATCHER-ORPHAN` line stamps each reader's start in UTC with a `Z`, matching the lease's `taken_at` | test: the census output parses as UTC; a live reader's stamp is within a minute of its start in UTC |
| **OBJ-5** | **The stale comment is gone (Langston, B-WAKE-ARM-EXCLUSIVE Step 11 condition A)** | **at close: a grep for the string `the Monitor treats stdout` in `comms-infra/laptop/cc-wake-filter.py` returns nothing**, with a control grep for a string known to be there. Anchored on the string, not a line number. The comment is restated with the current reason. |
| **OBJ-6** | Installed and live | the installed filter's sha256 equals the blob; the hook is repo-tracked (each clone loads it at its next session start); each session re-arms with the shared MEMORY 4.5 command (the lease makes that safe) |

## 4. OUT OF SCOPE

- Retrying the owner save from memory (Langston: it trades a named loss for a silent clobber).
- Moving ownership onto the alert record itself: `B-ALERT-OWNER-ON-ROW` (`#1137`, row 1l).
- Langston's owner re-guessing (the "changed owner within 24 h" churn): also `#1137`.

## 5. OBSERVATION

None. Every objective is a test or a grep at close; the loss has not been observed, so there is no window to wait for.
