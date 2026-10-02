# B-WAKE-ARM-EXCLUSIVE (#1140) — Step 7 first-pass verification (CC-A)

> Row 1o, `SPRINT_TO_LIVE_PLAN.md`. Installed filter = blob at `eae780d17`; arm command + first-word rule = `555c1ce19`.
> ⚠️ **Every observation below is from the laptop and is RULED ON REPORTED FACT for Langston**, who cannot run it. The
> C1 measurement is committed as a script (`scripts/analysis/b-wake-arm-exclusive-c1-measure.py`) so it can be re-run by
> anyone on the laptop; its expected outcomes are pre-registered in its own docstring.

## OBJ-8 — live, all four sessions: 4/4

Each session re-armed with the shared MEMORY 4.5 command, then ran it a second time on purpose.

| session | first arm | deliberate second arm (task output, verbatim) | count before / after | next action |
|---|---|---|---|---|
| CC-A | `lease taken: loop 19528` | `WATCHER-STAND-DOWN: a watcher of yours is running (loop 19528, holding since 2026-10-02T01:51:27Z; .alive 27 s ago) — do NOT re-arm` (probe echoed `rc=5`) | 0 / 1 / 1 | did not re-arm |
| CC-B | `lease taken: loop 14700` | `WATCHER-STAND-DOWN: a watcher of yours is running (loop 14700, holding since 2026-10-02T01:52:46Z; .alive 8 s ago) — do NOT re-arm` | 0 / 1 / 1 | did not re-arm |
| CC-C | `lease taken: loop 38584` | `WATCHER-STAND-DOWN: a watcher of yours is running (loop 38584, holding since 2026-10-02T01:52:49Z; .alive 28 s ago) — do NOT re-arm` | 0 / 1 / 1 | did not re-arm |
| Infra | `lease taken: loop 18004` | `WATCHER-STAND-DOWN: a watcher of yours is running (loop 18004, holding since 2026-10-02T01:53:02Z; .alive 15 s ago) — do NOT re-arm` | 0 / 1 / 1 | did not re-arm |

Sources: CC-A's own task outputs; the other three are their Discord replies (inbox ids 1555397208394694727,
1555397365496676424, 1555397356889841665), quoted as posted.

**Two things the table does not say, stated so it is not over-read:**
- **"Count before" is 0, not 1, in all four.** Each session's previous watcher had just ENDED by delivering the
  request message (the `--once` design), so the counts were taken in the gap between a finished watcher and the re-arm.
  The scope's "reads 1 throughout" is met only from the first arm on, so **the invariant actually proved is "no
  second watcher was added", not "exactly one throughout"** (Langston, Step 8). **The count control (it reads 1 for a LEASED
  watcher) is shown four times** (the "after" column), which is what C6 asked for.
- **A refused arm's TASK exits 0, not 5.** The arm's `|| break` consumes the filter's exit code; the 5 is visible only
  where a probe echoes it (CC-A). Infra and CC-C both reported this. **That is the design, not a defect: the session
  acts on the stderr line's FIRST WORD (MEMORY 4.5), never on the task status** — and all four received the line in
  their task output and acted on it by not re-arming.
  ⛔ **BINDS EVERY FUTURE INSTRUMENT (Langston, Step 8): no check may read a watcher refusal off an exit status — it
  must read the TEXT.** Stated here so `B-GATE-GUARD` (`#744`) is not built on exit codes.

**Paths exercised live, beyond OBJ-8:**
- **ORPHAN (CC-A only):** a new-form arm beside CC-A's still-running OLD-form watcher printed
  `WATCHER-ORPHAN: 1 reader process(es) run with no live loop: 17328 (started 2026-10-02T03:41:53) — stop ALL of them, then re-arm`
  and started nothing. The three other legs did not exercise it (their old watchers had already ended).
  ⚠️ The `started` stamp is LOCAL time (CIM `CreationDate.ToString('s')`), not UTC — cosmetic, a reader comparing it
  to the lease's UTC `taken_at` sees a 2 h skew on this laptop (Central European time, measured `date` vs `date -u`).
  DISPOSITION: added to `B-WAKE-OWNER-LOSS-VISIBLE` (row 1p, #1142), the next batch on this same filter — a one-line
  `ToUniversalTime()` in the census, with its test; not a reason to re-open this batch's code.
- **Dead-loop takeover (CC-A):** after the 19528 watcher ended on a wake, the next arm took the lease over —
  `{"loop": 20852, ... "taken_at": "2026-10-02T01:55:16Z"}` — with no refusal. All four `.lease` files exist.

## OBJ-9 / Langston C1 — measured BEFORE any flip: the flip does not ship

C1 asked: run the OLD arm text against a flipped filter and state what the session experiences. Measured with the
committed script (temp lease roots, local follower, 25 s per case, the installed filter as the control; run twice, from the scratch copy and from the committed copy, identical results):

| filter | live holder? | task ends (session notified)? | a reader runs? | output |
|---|---|---|---|---|
| interim (installed) | no | no — waiting for a wake | **yes, 1** (unleased) | nothing |
| interim (installed) | yes | **no, never** | 0 | `WATCHER-OLD-ARM` every retry (6 in 25 s) |
| flipped | no | no — waiting for a wake | **yes, 1** (unleased) | one `WATCHER-OLD-ARM` line, then a reader starts anyway |
| flipped | yes | **no, never** | 0 | `WATCHER-OLD-ARM` every retry (6 in 25 s) |

**Why the flip is inert:** the OLD arm has no `|| break`, so a refused `--positions` just yields an empty `P`; the
follower starts from its defaults and `--once` (no `--loop`, no holder) accepts. The flip changes ONE line of output
and no outcome. **Making it bite would mean refusing a no-`--loop` `--once` too — and that turns the "no holder" row
into exactly the case C1 forbids: an old-arm session retrying forever with no reader and no notification, believing
it is armed.**

⇒ **Per C1, OBJ-9 does not ship. §2.5's interim — an unleased arm refuses to a live holder — is the terminal state,
recorded as the batch's honest limit:** a session still on the OLD arm text, with no leased watcher present, runs one
unleased reader exactly as before this batch — **and two OLD-text arms in one session can still run two readers**: the second's `--positions` refuses ORPHAN, but with no `|| break` it carries on, and a no-`--loop` `--once` never runs the census, yielding only to a live LEASE holder (`cc-wake-filter.py:516-527` at `eae780d17`, the final return). Code reading, not a measurement; the pre-batch behaviour, unchanged. **The lease protects leased arms only.**
**The bound, at its real size in both directions (Langston, Step 8, re-derived at `1f8b1c137`):** the ORPHAN refusal
sits ABOVE the `_LOOP is None` early return in `_lease_gate`, so the second OLD arm's own task output says *stop ALL of
them* and names the pids. The double therefore needs a session to arm OLD text twice AND ignore the first word of its
own output — and it announces itself (the duplicate tag, and ORPHAN on every later arm in that domain). Further bounded
by OBJ-7a (every repo-tracked copy of the arm command is the leased form) and OBJ-8 (all four sessions acted on the
first word).
**What decides it is the DIRECTION of the failure, not its size (Langston):** OBJ-9's only biting form turns "no
holder" into retry-forever with NO reader, where a wake is LOST, not duplicated. A duplicate announces itself; a
silent loss does not. **Never trade a self-announcing failure for a silent one.**
⚠️ **The interim's own live-holder row is also a never-ending task** (an old arm beside a leased watcher retries
forever, with no reader of its own). It is not silent in its output, and it reads no messages, so it cannot
double-deliver — but the session is not notified either. That is P6 as approved at Step 4, unchanged by this batch.
  **DISPOSITION: §9.4 disposition 5, no work (Langston, Step 8):** the retry lives in the OLD arm text, which exists in
  no repo copy (OBJ-7a); no filter-side change can reach it; it loses no wake, because the live holder IS that
  session's reader. Token burn only — named, not silenced.

## The permanent ceiling on this record

⛔ **OBJ-8 is behavioural, on Kyle's laptop, which Langston cannot reach, now or ever ⇒ `RULED ON REPORTED FACT`, and
by his own rule that cannot carry a PROCEED on its own.** The C1 disposition does not rest on it: Langston re-derived the
C1 mechanism and the ORPHAN-announce bound in code at `1f8b1c137`. If the OBJ-8 leg ever has to be more than reported,
the evidence-capture home is `#1044`. **Do not cite this record as a verified behavioural result.**

**Step 8: CONFIRMED by Langston (2026-10-02, inbox id 1555401835894804482) — OBJ-9 does not ship; card Review=Approved.**
