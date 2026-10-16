# B-WAKE-HEARTBEAT-CONTROL-DATE — SCOPE r2 (2026-10-16)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1q**, after row 1n · **Issue:** `#1162` · **Reviewer:** Langston
**r2:** answers Langston's Step-1 CHANGES on r1 (`4346c1d80`, his reply 2026-10-16): BLOCKERS 1-4, (A), (B), the §0/§1 record items, the label set and the discriminating fixture. A table of what changed where is at the end.

## 0. WHY
The hourly heartbeat task (`comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/SKILL.md`; live copy `~/.claude/scheduled-tasks/wake-watcher-heartbeat/SKILL.md`, the same content apart from line endings, measured 2026-10-16) is meant to page Kyle only when a wake watcher has really failed. **On 2026-10-16 it paged his phone five times (08:16, 10:16, 11:15, 12:16 and 15:15 UTC) with "control NOT answered: CC-A, CC-B, CC-C, CC-INFRA" while the CC-A and CC-C watchers were alive and delivering.** That teaches Kyle to ignore the one line that should mean something.

★ **The durable fix (Langston):** step 2c's state is today **inferred by a model from prompt text.** One hour apart, against the same files, the 10-06 22:14Z run read "not run" and the 23:15Z run read "NOT answered". This batch replaces that inference with a **file read and an exact token match**. `.control` already stores the token: `:1002` writes `"<token> <utc>"`, measured `20261013 2026-10-13T07:14:28Z`.
⚠️ **And the date test is wrong by construction:**
- the issued token is **UTC** (`date -u +%Y%m%d`, step 2c);
- the "today" it is tested against is the **laptop's local date** (UTC+2);
- the issue gate is **09:00 local**.

The two dates disagree for two hours every night, and the 10-06 23:15Z = 01:15-local failure sits exactly in that window.

## 1. MEASURED
Sources:
- inbox `/var/log/cc-discord-inbox.jsonl`, sender `Heartbeat`, 2026-10-06T20Z → 2026-10-16T15Z;
- controls from `/var/log/cc-wake.log`;
- watcher files under `C:/Users/kyleg/.claude/cc-wake-state/`.

- **(a) `#1162` as filed — a false NOT answered before that day's control is issued — did not recur in this window.** Every pre-09:00-local run reads "not run" (for example 10-12 22:14Z → 10-13 06:14Z). It is still the model's reading of "today", which is unfixed rather than gone.
- **(b) THE LARGER FORM: an arm that starts from the log END never sees that day's control** (narrowed per Langston: a watcher that was down and is re-armed from a position under 12 h old resumes at its offset and DOES answer). **The code starts from the end in TWO ways:**
  - **(i) a saved position older than 12 h.** `:857` tests `pos and saved is not None and now - saved > STALE_S`, `:860-869` empties `pos`, and `:871` prints `p:end` for every source. This case announces itself: *"the watcher resumed after more than 12 h away"*.
  - **(ii) no saved position at all.** The `:857` test is false and `:871` still prints `p:end`, but **no notice fires.** A first-ever arm misses the control silently.

  **CC-A on 2026-10-16 is case (i), confirmed:** the controls were written at 07:13Z, and CC-A was re-armed after the crew switch from a 10-13 position. It printed the stale notice (task output `b5l0ec9p0`) and never answered, and five `--notify` heartbeats followed. CC-B and CC-C show the same signature (`.control` dated 2026-10-13 09:14 local; leases **re-taken at new arms** on 10-16), but the mechanism is confirmed for CC-A only. CC-INFRA's watcher has been DEAD since 10-08, so its NOT answered duplicates its DEAD.
- **(c) the issuer itself skips days.** `/var/log/cc-wake.log` holds 13 distinct tokens from 20261001 to 20261016:
  - **20261009, 20261014 and 20261015 are absent** (Langston's enumeration);
  - **20261006 is doubled** (8 lines, two per alias).

  "Newest issued" alone would turn a day with no issue into a silent all-clear.
- **(d) the lease is a true arm signal.** It is written at exactly one site, `_lease_create` `:487-497` (`O_CREAT|O_EXCL`); the other references are a read at `:467` and the rename-aside at `:552`. Nothing refreshes it. It is re-taken at every arm, including the re-arm after each wake, and holds `"taken_at": "<UTC>"` (measured: `{"loop": 30444, …, "taken_at": "2026-10-16T15:26:35Z"}`).
- `--notify` on the 10-16 runs had two causes: the DEAD CC-B/CC-INFRA watchers also add it. Fixing the control removes the false half; a dead watcher still pages, by design.

## 2. PROVENANCE (tier 1: heartbeat steps 2c, 3 and 4, whose behaviour this batch changes)
- **Introduced by** `3a31cf3a6` (2026-09-30, `B-TOKEN-BURN-CUT` Step 3). Verbatim: *"daily control answered by a file; heartbeat DEAD/control-unanswered delivered"* and *"Heartbeat task (repo copy): liveness from each watcher's .alive file, no wake; daily control gated on every session having switched."*
- **What it is for** (`B_TOKEN_BURN_CUT_CHANGE_LIST.md:46`, Langston's C3): *"`.alive` proves the pipeline STARTED, not that the filter DELIVERS"*. **The control is the end-to-end delivery proof.** The pre-audit flagged the line format and the 12 h threshold as *"design choices, flagged for attack"* (`B_TOKEN_BURN_CUT_PRE_AUDIT.md:83`).
- **Corpora searched:**
  - by file and symbol: `RUNNING_ISSUES.md` (`#1162`, `#1127`), `BATCH_CATALOG.md`, the `B_TOKEN_BURN_CUT_*` scope, pre-audit and change list;
  - `git log -S "WATCHER-CONTROL" --reverse`;
  - `SYSTEM_IMPACT_MAP.md` wake-watcher block (`:3764`);
  - `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md:27`.

  The control is not in the System Manual (crew tooling).
- **Disposition: (2) relevant, needs updating to today's intent.**
- **Tier 2 (read, not changed):**
  - `cc-wake-filter.py`: the control branch, where another alias's line is ignored by the `cparts[1].upper() == ALIAS` test at `:1000` and the `continue` at `:1003`; the `.control` write at `:1002`; the start-from-end at `:857`/`:871`; `_lease_create` at `:487-497`.
  - **The filter is not changed.**

## 3. OBJECTIVES
**The per-alias decision, evaluated in this ORDER (BLOCKER-4).** Inputs, all read as files, never inferred:
- `N` = the newest `WATCHER-CONTROL <alias> <token>` token in `cc-wake.log`, and the time of that line;
- `A` = the token in `<alias>.json.control`;
- `T` = `taken_at` from `<alias>.lease`;
- liveness from step 2b;
- the re-issue record `<alias>.json.control-reissued` (new; holds `<token> <taken_at>`).

| order | state | predicate | action |
|---|---|---|---|
| 1 | **DEAD** (or not armed) | step 2b says DEAD / no `.alive` | report DEAD as now; **never re-issue, never a control page** — it already pages as DEAD |
| 2 | **ISSUER NOT RUN (last `<N>`)** | `N` older than 26 h | its own label, reported for every alias; this is the delivery proof not being taken |
| 3 | **answered** | `A == N` (exact token match) | — |
| 4 | **re-issued** | `A != N`, **`T` newer than the newest control line for that alias**, and the re-issue record is not already `<N> <T>` | append one `WATCHER-CONTROL <alias> <N>` line (that alias only), write `<N> <T>` to the record, **no `--notify`** |
| 5 | **awaiting** | `A != N`, `T` older than that line, and the line was written by THIS run or the previous one | — (one run's grace) |
| 6 | **NOT answered** | `A != N`, `T` older than the newest control line for that alias (including a re-issue), and at least one full run since that line | `--notify` |

| obj | objective | verified by |
|---|---|---|
| OBJ-1 | Steps 2c and 3 use the table's file reads and exact token match. No local-date test remains anywhere in steps 2c to 4. | prompt text; **the discriminating fixture**: newest token is yesterday's and `.control` holds it → must read **answered** (the old test read this as NOT answered between local midnight and 09:00) |
| OBJ-2 | A watcher armed after the newest control line (case i or ii) gets **one re-issue per (alias, token, arm)**, keyed by `taken_at` (BLOCKER-2). The re-issued line travels the normal pipeline, so the control still proves delivery. | fixture: `T` after the line → one re-issue and the record written; a second run with the same `T` → no second line; a new arm (new `T`) after the re-issue line → one more re-issue, not a page (BLOCKER-3) |
| OBJ-3 | `--notify` for the control fires only in state 6. It never fires on top of DEAD, never in states 4 or 5, and never for ISSUER NOT RUN (that is reported, not paged; JUDGEMENT CALL C). | fixtures for states 1, 4, 5 and 6; a live day where a late arm reads re-issued, then answered |
| OBJ-4 | **ISSUER NOT RUN**: if `N` for an alias is older than 26 h, step 3 says so as its own state (BLOCKER-1). | fixture with `N` 2 days old → `control: ISSUER NOT RUN (last <token>)` |
| OBJ-5 | **Step 3's label set is enumerated in full:** answered / awaiting / re-issued / NOT answered / ISSUER NOT RUN, plus DEAD carried from 2b. "not run" is removed, because it has no referent without the local-date test. | prompt text |

**The fixtures** run as a small script over a temp directory that imitates the laptop's state folder and a copy of `cc-wake.log`. The heartbeat's decision is written as **one python one-liner in the prompt that reads the files and prints the state per alias**, so the model copies a computed result rather than judging. That one-liner is also what the fixture runs (OBJ-1 to OBJ-5).

## 4. DESIGN CHOICES, FOR ATTACK
- **Prompt-only, with the decision as a printed script result.** The filter is untouched. The late line is delivered through the normal path, so the control stays a delivery proof (C3).
- **Rejected: the filter replaying its own control at arm time.** That is `.alive` with extra steps (Langston confirmed).
- **JUDGEMENT CALL A (answered by Langston):** read `taken_at` from inside the lease, not the file mtime.
- **JUDGEMENT CALL B:** a re-issue costs one log line per (alias, token, arm). It costs zero turns for every alias, because a control line never reaches `addressed_to_me` (`:1004`). A session that re-arms often and never answers would get at most one line per heartbeat run, hourly; it pages in state 6 once a run passes without an answer.
- **JUDGEMENT CALL C:** ISSUER NOT RUN is reported, not paged. The heartbeat is the issuer, so a skipped issue while the heartbeat runs is its own gate holding: step 2c issues only when all four `.alive` files exist. A heartbeat that is not running at all cannot report anything, and that is out of scope (see §5).
- **The 26 h threshold:** one daily issue plus two runs of slack.

## 5. OUT OF SCOPE
- Waking dead watchers, and the switch-driven push wake Kyle asked for today: row 1z `B-CODEX-FAILOVER-AUTOMATION` (`#731`).
- Detecting that the heartbeat task itself did not run (10-13 20:15Z → 10-16 07:13Z had no heartbeat posts): this needs an observer other than the heartbeat. **DISPOSITION: added to row 1z** with the wake work, where an out-of-band observer is already in scope.
- Re-arming CC-B and CC-INFRA: their sessions' own job.
- The 12 h stale threshold: by design.
- The silent no-position start (case ii) printing no notice. **DISPOSITION: added to row 1z**, since it changes the filter, which this batch deliberately does not touch.

## 6. DOCUMENT SET (class `non_architecture`)
- this SCOPE and a PRE_AUDIT;
- the change list;
- the completion report;
- `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_IMPACT_MAP` (wake-watcher block), `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK` layer 3, `RUNNING_ISSUES` `#1162`, the sprint plan rows 1q and 1z, and CC-A's task list;
- the board card.

`SYSTEM_MANUAL`: N/A.

## r1 → r2, by Langston's item
| item | where |
|---|---|
| BLOCKER-1 issuer stops / degrade to all-clear | §1(c), state 2, OBJ-4 |
| BLOCKER-2 "once" keyed on (alias, token, `taken_at`) | state 4, OBJ-2 |
| BLOCKER-3 a re-issue racing a later arm | state 6 predicate ("`T` older than the newest control line"), OBJ-2 third fixture |
| BLOCKER-4 DEAD first | the ordered table, state 1 |
| (A) `taken_at`, not mtime; "renewed" → "re-taken at a new arm"; the two start-from-end cases; the narrowed headline | §1(b), §1(d), §4 |
| (B) citation `:1000`/`:1003`, `:1004` | §2 tier 2, §4 call B |
| UTC token vs local date; inferred state vs file read | §0 |
| label set | OBJ-5 |
| a fixture that discriminates | OBJ-1 |
