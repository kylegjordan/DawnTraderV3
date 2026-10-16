# B-WAKE-HEARTBEAT-CONTROL-DATE — SCOPE r3 (2026-10-16)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1q**, after row 1n · **Issue:** `#1162` · **Reviewer:** Langston
**r2:** answered Langston's Step-1 CHANGES on r1 (`4346c1d80`). **r3:** answers his CHANGES on r2 (`894adb15a`, 15:36Z): §3 is rewritten on BYTE OFFSETS, not instants (his option (b)); the issue gate is no longer a local time; state 2 is split into GATED and NOT RUN; plus record items R1-R5. Tables of what changed where are at the end.

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
**All inputs are read as files or computed by machines, never inferred (r3, Langston BLOCKER-1, option (b)).**
- **On Helsinki** — ONE remote python run that scans the **whole** `/var/log/cc-wake.log`, never a tail (R3; step 2's own lesson). For each alias it prints three things:
  - `N`, the newest `WATCHER-CONTROL <alias> <token>` token;
  - `O`, that line's **byte offset**;
  - the file's **inode**, plus today's UTC date `D` (`date -u +%Y%m%d`, the issuer's own clock).
- **On the laptop**, under `C:/Users/kyleg/.claude/cc-wake-state/`:
  - `A` = the FIRST whitespace field of `<alias>.json.control` (R2: `:1002` writes `"<token> <utc>"`, so it is `split()[0]`, not `startswith`);
  - `P` = `(ino, offset)` from `pos['/var/log/cc-wake.log']` in `<alias>.json`;
  - `T` = `taken_at` from `<alias>.lease`;
  - `.alive` age (step 2b).
- **The heartbeat's own record** `C:/Users/kyleg/.claude/cc-wake-state/heartbeat-control.json`:
  - for each alias and token, its re-issues: offset, UTC write time and the arm's `taken_at` at the time;
  - the previous run's ISSUER state.

  Named without an alias prefix, so `_sweep_tmp` (`:637-652`, which deletes only `<ALIAS>.*` files containing `.tmp` or `.lease.stale.`) and the lease rename-aside (`:552-563`) cannot touch it (R4, measured).

**THE ISSUE RULE (BLOCKER-2) — replaces the 09:00-local gate in step 2c.**
- **Issue** a control for all four when `N != D` **and** all four `.alive` exist. This is the issuer's UTC day, so there is no local date anywhere, and it self-heals on the first run back.
- If `N != D` and some `.alive` is missing → **`ISSUER GATED BY <aliases>`**, reported and not paged (not armed must not page — Langston).
- If all four are alive, `N != D`, and the issue write failed (re-read `N` still `!= D`) → **`ISSUER NOT RUN`**, **paged on the second consecutive run** (the previous state comes from the record).

**THE PER-ALIAS DECISION, in this ORDER, after the issue rule:**
| order | state | predicate | action |
|---|---|---|---|
| 1 | **DEAD** | step 2b says DEAD | as now; never re-issue; never a control page |
| 2 | **not armed** | no `.alive` | reported; it is what gates the issue above |
| 3 | **answered** | `A == N` (exact token) | — |
| 4 | **awaiting** | `P` has the same inode as the log and `P <= O` | — the watcher has not reached the line yet; a lagging save fails toward this state |
| 5 | **NOT answered** | `P > O` (or inode differs), `A != N`, and the record holds a re-issue for `(alias, N)` whose write time is **later than `T`** (the arm was live before that re-issue and consumed it) — **or** 3 distinct `T`s already re-issued against this `N` (R1) | `--notify` |
| 6 | **re-issued** | `P > O` (or inode differs) and `A != N`, otherwise | append one `WATCHER-CONTROL <alias> <N>` line (that alias only), record `(offset, write time, T)`; **no `--notify`** |

**Why 5 before 6, and why `P > O` alone is not enough (measured 2026-10-16, CC-A):**
- The stale reset at `:857-870` moves `pos` to the end and the next save records it, so `P = 90455 > O = 90331` while the 10-16 line was never read. `P > O` cannot tell "consumed and failed" from "skipped by a start-from-end".
- A re-issue separates them. It lands after `P`, so a live watcher must consume it, and the record's write time against `T` says whether it was live when it landed.
- A genuine failure therefore pages **one run later** than today. That run is the retry.
- A watcher that re-arms from the end again after the re-issue (`T` later) is re-issued again, bounded at three (R1). That closes r1's BLOCKER-3 without counting runs.

| obj | objective | verified by |
|---|---|---|
| OBJ-1 | Steps 2c to 4 use only the reads above; **no local-date or local-time test remains** — the issue rule and the decision table both run on the issuer's UTC date and byte offsets. | prompt text; fixture **yesterday's token, answered** → *answered* (discriminates: the old test read it as NOT answered between local midnight and the issue) |
| OBJ-2 | A watcher that skipped its line gets a re-issue on the run that sees `P > O`, at most 3 per (alias, token). The line travels the normal pipeline, so the control stays a delivery proof. | fixture: `P > O`, no record → re-issued and recorded; same inputs plus a later re-issue write time → NOT answered; a new `T` after the re-issue → re-issued; a third `T` → NOT answered |
| OBJ-3 | Control `--notify` only in state 5 and for ISSUER NOT RUN on its second consecutive run; never on DEAD, not armed, awaiting, re-issued or GATED. | fixtures for each state |
| OBJ-4 | ISSUER GATED BY / ISSUER NOT RUN are their own states, computed from `N`, `D` and the `.alive` set. | fixtures: one `.alive` missing → GATED BY that alias; all alive, write fails twice → NOT RUN, paged on the second |
| OBJ-5 | Step 3's labels are enumerated: answered / awaiting / re-issued / NOT answered / ISSUER GATED BY / ISSUER NOT RUN, with DEAD and not armed carried from 2b. "not run" is removed. | prompt text |

**The decision is one python script in the prompt** that reads the Helsinki print and the laptop files and prints one state per alias. The model copies its output; the fixtures run that same script over a temp directory and a log copy.

## 4. DESIGN CHOICES, FOR ATTACK
- **Prompt-only, with the decision as a printed script result.** The filter is untouched. The late line is delivered through the normal path, so the control stays a delivery proof (C3).
- **Rejected: the filter replaying its own control at arm time.** That is `.alive` with extra steps (Langston confirmed).
- **JUDGEMENT CALL A (answered by Langston):** read `taken_at` from inside the lease, not the file mtime. In r3 it is used only against the heartbeat's own re-issue write times — both UTC, both machine-written.
- **JUDGEMENT CALL B:** a re-issue costs one log line per (alias, token, arm). It costs zero turns for every alias, because a control line never reaches `addressed_to_me` (`:1004`). At most 3 re-issues per (alias, token); after that, or once a re-issue lands while the arm is live and goes unanswered, it pages in state 5 (r3; R1).
- **JUDGEMENT CALL C (r3, in Langston's form):**
  - `ISSUER GATED BY <alias>` is reported, not paged, and names who held it.
  - `ISSUER NOT RUN` (all alive and the write failed) pages on the second consecutive run.
  - A heartbeat that is not running at all cannot report itself; that observer is on row 1z (§5).
- **Why `N != D` and not 26 h:** both self-heal. The UTC-day test needs no instant for the 56 unstamped legacy lines, so there is no transition rule to write.
- **R5:** the live copy matching the repo copy apart from line endings is measured on the laptop by CC-A; Langston cannot reach it, so for him it is RULED ON REPORTED FACT and decision-inert. Step 6 installs the repo copy and re-measures both sides.

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

## r2 → r3, by Langston's item
| item | where |
|---|---|
| BLOCKER-1 states not computable (token is a day, `T` an instant) → byte offsets | §3 inputs and table, states 4-6; the measured CC-A case for why `P > O` alone is not enough |
| BLOCKER-2 the 09:00-local issue gate unaddressed | §3 issue rule (`N != D` and all four alive) |
| BLOCKER-3 / call C a false premise; split state 2 | §3 issue rule: GATED BY reported, NOT RUN paged on the second run; §4 call C |
| R1 an unbounded state 4 → count distinct `T`s, page at the third | state 5 |
| R2 `split()[0]` | §3 inputs |
| R3 Helsinki vs laptop, whole file | §3 inputs |
| R4 the new file must not be swept | §3 inputs (named file, measured sweep predicate) |
| R5 live copy | §4 |
