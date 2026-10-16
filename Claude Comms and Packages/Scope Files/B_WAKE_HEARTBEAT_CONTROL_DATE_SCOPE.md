# B-WAKE-HEARTBEAT-CONTROL-DATE — SCOPE r5 (2026-10-16) — ✅ APPROVED by Langston at Step 1 (16:01Z, at `f565e42c4`), with two in-commit conditions folded below

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1q**, after row 1n · **Issue:** `#1162` · **Reviewer:** Langston
**r2:** answered Langston's Step-1 CHANGES on r1 (`4346c1d80`). **r3:** answers his CHANGES on r2 (`894adb15a`, 15:36Z): §3 is rewritten on BYTE OFFSETS, not instants (his option (b)); the issue gate is no longer a local time; state 2 is split into GATED and NOT RUN; plus record items R1-R5. **r4:** answers his CHANGES on r3 (`ca035c52a`, 15:45Z) — a bound on *awaiting*, a refusing record file, and the issue made per alias with post-issue reads. **r5:** answers his CHANGES on r4 (`1773280ed`, 15:54Z) — the table is made TOTAL (step 2b's STUCK and CENSUS-FAILED carried, plus a final else that cannot read as all-clear), and the record is read back in the same run. Tables of what changed where are at the end.

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
  - the `.control` write is gated on `ONCE` (`:1000`), which is true in live operation (every arm runs `--once`), so a streaming-mode filter would never answer (r4 record (b));
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

  Named without an alias prefix, so `_sweep_tmp` (`:637-652`, which deletes only `<ALIAS>.*` files containing `.tmp` or `.lease.stale.`) and the lease rename-aside (`:552-563`) cannot touch it (R4, measured; Langston re-derived it at the ref).
  - **It also holds each alias's `P` from the previous run** (for the awaiting bound below) **and the log's inode from the previous run** (r5 record 1: rotation is detected by the log's own inode changing between runs, not by all four aliases agreeing).
  - **It refuses rather than degrades (r4 BLOCKER-2):**
    - **absent** → created empty and reported as `control record: new`, **with `--notify`** (Step-1 condition 1);
    - **unparseable** → moved aside to `heartbeat-control.json.bad-<utc>`, started empty, and reported as `control record: RESET (unreadable)`, **with `--notify`**.

    ★ **Why both page (Langston's condition 1):** the read-back catches a write that does not land, but it is in-run only. A record that is written, reads back, and then **does not survive to the next run** would read `new` every hour and draw no decisions, forever. Paging on `new` and `RESET` closes that, at the cost of exactly one expected page at install.

    In either case **no NOT answered, re-issue, NOT-delivering or ISSUER NOT RUN decision is drawn on that run** (r5 record 2: ISSUER NOT RUN's second-run test cannot evaluate on a reset record either). States 1-4 still print, and states 4b, 5, 6 and ISSUER NOT RUN print `held (record reset)`.
  - **And it is READ BACK in the same run (r5 BLOCKER-2):** after every write — create, reset, prune, a re-issue entry or the run's `P`s — the script re-reads the file and compares it with what it wrote. **A mismatch, or a failed read, is `control record NOT PERSISTING` and pages that run.** No cross-run memory is needed, which matters because the memory is the broken thing. A record that cannot persist can therefore never park the fleet in permanent `held`.
  - **Prune rule:** on every run, drop every entry whose token is not that alias's current `N`. The file is then bounded at four aliases × at most three re-issues + four `P`s.

**THE ISSUE RULE (BLOCKER-2) — replaces the 09:00-local gate in step 2c.**
- **Issue per alias (r4 BLOCKER-3):** while all four `.alive` exist, write `WATCHER-CONTROL <alias> <D>` for **each alias whose own `N != D`**. A half-written loop, like the measured `20261006` pair, then self-corrects without duplicating the others. `D` comes from the same remote run as `N` and is never recomputed on the laptop (Langston's condition). This is the issuer's UTC day, so there is no local date anywhere, and it self-heals on the first run back.
- **Pre- or post-issue reads: POST.** Sequence:
  1. remote run 1 reads `N`, `O`, the inode and `D`;
  2. the per-alias issue;
  3. **remote run 2 re-reads `N`, `O` and the inode.**

  The NOT-RUN check and the whole per-alias decision use run 2. An alias issued seconds earlier reads `P <= O`, i.e. **awaiting**, so no re-issue or `T` budget is spent on a superseded token.
- If `N != D` and some `.alive` is missing → **`ISSUER GATED BY <aliases>`**, reported and not paged (not armed must not page — Langston).
- If all four are alive and run 2 still shows `N != D` for an alias (its write failed) → **`ISSUER NOT RUN <alias>`**, **paged on the second consecutive run** (the previous state comes from the record).

**THE PER-ALIAS DECISION, in this ORDER, after the issue rule:**
| order | state | predicate | action |
|---|---|---|---|
| 1 | **DEAD** | step 2b says DEAD | as now; never re-issue; never a control page |
| 1a | **STUCK (control pending)** | step 2b says STUCK, and the alias is not already answered (state 3 is checked first for STUCK: the `.control` write is independent of the position save, so a STUCK watcher that reaches the line answers normally) | reported; **no page and no re-issue** — 2b already reports STUCK, and re-arming a STUCK watcher is the wrong fix (Langston) |
| 1b | **CENSUS-FAILED (control not judged)** | step 2b's watcher census failed | reported; no page, no re-issue, as 2b |
| 2 | **not armed** | no `.alive` | reported; it is what gates the issue above |
| 3 | **answered** | `A == N` (exact token) | — |
| 4 | **awaiting** | `P` has the same inode as the log, `P <= O`, and `P` differs from the `P` recorded for this `(alias, N)` on the previous run, or there is no previous `P` | — the watcher has not reached the line yet; a lagging save fails toward this state for one run |
| 4b | **NOT delivering** | `P <= O` and `P` **unchanged** from the previous run on the same `(alias, N)`, while `.alive` is fresh | `--notify` — **the control's own target failure (C3):** `.alive` is refreshed only after a successful `_checkpoint()` (`:960-975`), so a fresh `.alive` with a frozen `pos['/var/log/cc-wake.log']` means the follower is checkpointing but emits no `#@AT`/`#@POS` for this source — it started, but does not deliver it (gloss corrected per Langston's Step-1 record item, 29(c)). Bounded at **two runs**: one run of awaiting, then a page. A line written seconds before a run is always passed by a live watcher before the next hourly run. |
| 5 | **NOT answered** | `P > O`, the log inode unchanged since the last run (a rotation goes to state 6, r5 record 1), `A != N`, and the record holds a re-issue for `(alias, N)` whose write time is **later than `T`** (the arm was live before that re-issue and consumed it) — **or** 3 distinct `T`s already re-issued against this `N` (R1) | `--notify` |
| 6 | **re-issued** | `P > O` (or inode differs) and `A != N`, otherwise | append one `WATCHER-CONTROL <alias> <N>` line (that alias only), record `(offset, write time, T)`; **no `--notify`** |
| 7 | **UNDETERMINED (<the inputs>)** | **anything not matched above — the table is TOTAL** (r5 BLOCKER-1) | prints the raw `N`, `O`, inode, `A`, `P`, `T` and 2b state, and **pages**. An unmatched combination is by construction a case this design did not foresee, so it is never allowed to read as an all-clear. The two-run awaiting bound and 2b's 40 s re-check make the known transients (a reconnect's 30 s sleep that skips the keepalive save, `:623`) land in states 1a/4, not here. |

**Why 5 before 6, and why `P > O` alone is not enough (measured 2026-10-16, CC-A):**
- The stale reset at `:857-870` moves `pos` to the end and the next save records it, so `P = 90455 > O = 90331` while the 10-16 line was never read. `P > O` cannot tell "consumed and failed" from "skipped by a start-from-end".
- A re-issue separates them. It lands after `P`, so a live watcher must consume it, and the record's write time against `T` says whether it was live when it landed.
- A genuine failure therefore pages **one run later** than today. That run is the retry.
- A watcher that re-arms from the end again after the re-issue (`T` later) is re-issued again, bounded at three (R1). That closes r1's BLOCKER-3 without counting runs.

| obj | objective | verified by |
|---|---|---|
| OBJ-1 | Steps 2c to 4 use only the reads above; **no local-date or local-time test remains** — the issue rule and the decision table both run on the issuer's UTC date and byte offsets. | prompt text; fixture **yesterday's token, answered** → *answered* (discriminates: the old test read it as NOT answered between local midnight and the issue) |
| OBJ-2 | A watcher that skipped its line gets a re-issue on the run that sees `P > O`, at most 3 per (alias, token). The line travels the normal pipeline, so the control stays a delivery proof. | fixture: `P > O`, no record → re-issued and recorded; same inputs plus a later re-issue write time → NOT answered; a new `T` after the re-issue → re-issued; a third `T` → NOT answered |
| OBJ-3 | Control `--notify` only in states 4b, 5 and 7, for `control record new`, `RESET` or `NOT PERSISTING` (Step-1 condition 1), and for ISSUER NOT RUN on its second consecutive run; never on DEAD, STUCK, CENSUS-FAILED, not armed, awaiting, re-issued or GATED. | fixtures for each state, including: `P <= O` unchanged for two runs → NOT delivering on the second; a record file deleted between runs → `new`, **paged**, no decisions drawn; a corrupt record → `RESET`, moved aside, no decisions drawn; a record whose write does not read back → `NOT PERSISTING`, paged; a STUCK alias short of its line → `STUCK (control pending)`, no page; a combination matching no row → `UNDETERMINED`, paged; **a totality test that enumerates the 2b states × {answered, P<=O moved, P<=O unchanged, P>O, **P absent** (no `pos['/var/log/cc-wake.log']` key), **P's inode ≠ the log's outside a recorded rotation**} (Step-1 condition 2: the last two are the cells that reach state 7, so the grid must enumerate a 7) × {record ok, new, reset} and asserts every cell prints exactly one state** |
| OBJ-4 | ISSUER GATED BY / ISSUER NOT RUN are their own states, computed from `N`, `D` and the `.alive` set. | fixtures: one `.alive` missing → GATED BY that alias; all alive, write fails twice → NOT RUN, paged on the second |
| OBJ-5 | Step 3's labels are enumerated: answered / awaiting / re-issued / NOT answered / NOT delivering / STUCK (control pending) / CENSUS-FAILED (control not judged) / UNDETERMINED / ISSUER GATED BY / ISSUER NOT RUN / control record new, RESET or NOT PERSISTING / **log rotated** (r4 record (c), r5 record 1: the log's own inode differing from the recorded one is one rotation — reported once, its re-issues labelled as caused by it, and state 5 not evaluated that run), with DEAD and not armed carried from 2b. "not run" is removed. | prompt text; a fixture with a changed inode for all four → `log rotated`, four re-issues, no page |

**The decision is one python script in the prompt** that reads the Helsinki print and the laptop files and prints one state per alias. The model copies its output; the fixtures run that same script over a temp directory and a log copy.

## 4. DESIGN CHOICES, FOR ATTACK
- **Prompt-only, with the decision as a printed script result.** ⚠️ **AMENDED AT STEP 2 (Langston BLOCKER-1, pre-audit r2):** the filter changes by ONE regex arm, `\bcontrol:\s*(?:NOT answered|CHECK FAILED)\b`, so a failed check has its own true verdict instead of borrowing `NOT answered`. Otherwise the filter is untouched. The late line is delivered through the normal path, so the control stays a delivery proof (C3).
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
- **The `.control` write at `:1001-1002` has no local `except`** (unlike `:966`/`:974`). An OSError is swallowed as a generic `LINE DROPPED` (`:1220-1226`) while the position still advances, so the alias would read `P > O, A != N` and this batch would page "not answered" when delivery worked (Langston r4 record (a)). **DISPOSITION: added to row 1z** with the other filter items.

## 6. DOCUMENT SET (class `non_architecture`)
- this SCOPE and a PRE_AUDIT;
- the change list;
- the completion report;
- `BATCH_CATALOG`, `PHASE_HISTORY`, `SYSTEM_IMPACT_MAP` (wake-watcher block), `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK` layer 3, `RUNNING_ISSUES` `#1162`, the sprint plan rows 1q and 1z, and CC-A's task list;
- the board card;
- CC-A's `MEMORY_CC_A.md` position row (graded by the Step-10 tier ledger; r5 record 3).

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

## r3 → r4, by Langston's item
| item | where |
|---|---|
| BLOCKER-1 awaiting unbounded, the control's own target failure | state 4 narrowed + new state 4b NOT delivering (two runs), OBJ-3 fixture |
| BLOCKER-2 absent/unparseable record degrades to all-clear; append-forever | §3 record file: refuse rules, `held (record reset)`, prune rule; OBJ-3 fixtures |
| BLOCKER-3 per-alias issue; pre- vs post-issue reads | §3 issue rule (per alias, all-four gate kept), the two-run sequence, `ISSUER NOT RUN <alias>` |
| record (a) `.control` write without `except` | §5, row 1z |
| record (b) `ONCE` gate | §2 tier 2 |
| record (c) rotation | OBJ-5 `log rotated` |

## r4 → r5, by Langston's item
| item | where |
|---|---|
| BLOCKER-1 table not total; STUCK and CENSUS-FAILED not carried | states 1a, 1b, 7 (UNDETERMINED, paged); OBJ-5 labels; OBJ-3 totality test |
| BLOCKER-2 a record that cannot persist parks the fleet in `held` forever | §3 read-back in the same run → `NOT PERSISTING`, paged |
| record 1 partial rotation | §3 record holds the log inode; state 5 excludes a rotated run; OBJ-5 |
| record 2 ISSUER NOT RUN on a reset record | §3 "no decision drawn" list |
| record 3 the MEMORY row | §6 |
