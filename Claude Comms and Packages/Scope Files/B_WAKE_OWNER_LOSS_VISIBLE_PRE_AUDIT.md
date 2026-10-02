# B-WAKE-OWNER-LOSS-VISIBLE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

> Row 1p, `SPRINT_TO_LIVE_PLAN.md` · `#1142` · change-class `non_architecture` · Step 1 APPROVED by Langston 2026-10-02 (inbox id 1555699114975694848): **Option B (sidecar append)**, with seven conditions C1–C7. Every plan item below points back at the audit finding (A-n) or the condition (C-n) it comes from; anything with neither is marked `UNAUDITED`.
> Code is quoted at `origin/migration/aws-supabase` (`910f69ddf`); `cc-wake-filter.py` there is 1,088 lines.

## PREVIOUSLY STATED vs NOW

- **PREVIOUSLY STATED (scope §2, my basis for rejecting Option A): "A `--once` watcher exits on its first wake." NOW: it exits at the first `#@CAUGHTUP` AFTER a delivery (`cc-wake-filter.py:832-834`, `_checkpoint(); sys.exit(0)`), and the follower emits `#@CAUGHTUP` on every idle 1 s pass. REASON: Langston's correction at Step 1, re-derived by him; it strengthens Option B — Option A's write window is a sub-second tail of further marker lines, and only on the delivering run.**
- No number moved. The measured 0 lost-routing lines in 1,436 outputs stands (RULED ON REPORTED FACT).

## AUDIT

### A1 — `record_owners`, read at the ref (`:634-701`)
- One call per `langston_outbound` line, FIRST in that branch (`:913`), so every Langston reply is recorded whether or not it wakes this session.
- It builds `owners` lazily from disk (`_load_owners`, `:642`; a seed uses the in-memory `_SEED_OWNERS`), walks every `[[ALERT …]]` marker, and sets ONE flag, `changed`, for four kinds of edit: a skipped-as-prose count (`:650-653`), a reject (`:658-672`), a new id (`:675-677`), an owner flip (`:678-683`). **An id whose owner is re-stated unchanged is NOT edited** (no branch for `prev.owner == own`).
- One save at the end (`:684-686`). On `OSError`: a seed counts `_SEED_LOST` and returns (`:688-695`); otherwise one stderr line, routing lost (`:700-701`). **Nothing records which ids were lost** — the in-memory `owners` is discarded with the call.
- ⇒ **The lost set is the NEW + FLIPPED ids of that call** (C2). A reject or a prose skip can also be the only edit, and its loss has no id (C3).

### A2 — the clock in the record
- `record_owners(body_raw, d.get("ts"))` (`:913`): `ts` is the Discord MESSAGE timestamp, not wall-clock. A resumed watcher can replay older messages (Langston: up to `STALE_S` = 12 h).
- The hook's reject window mixes the two: `Date.now() - Date.parse(r.ts)` (`inject-due-alerts.mjs:191`) — wall-clock now against a message ts. Harmless for rejects; for this batch's clearing rule it would not be (C1).

### A3 — census of the owner record (`<ALIAS>.alert-owners.json`), repo-wide, tests excluded
| question | members |
|---|---|
| writes | `_save_owners` only — called from `record_owners` (`:686`) and the seed's `#@CAUGHTUP` (`:800`). One writer function, two call sites, never concurrent within a process. Across processes: one watcher per alias since `#1140`; a seed is documented as "run only with that alias's watcher stopped" (`#1140` r3 note). |
| reads | the filter (`_load_owners`, `:618`); `inject-due-alerts.mjs:160` (`readFileSync`, own try/catch → fail-open); `alert-split.mjs` receives the parsed object (pure). |
| mutates | `record_owners` only. |
| deletes | **none** in the repo. `_sweep_tmp` (`:569-584`) removes `<ALIAS>.*.tmp*` and `*.lease.stale.*` older than an hour — never the record itself. |
| schedules | the wake watcher's `--once` loop (the session's arm), the manual `--seed-owners`, and the tests. No timer, no cron. |
Out-of-repo writer: the one-off `B_TOKEN_BURN_CUT_AMENDMENT_1_SWITCH.py` (frozen record, copied seeded records in once on 2026-09-30).

### A4 — census of the NEW sidecar (`<ALIAS>.alert-owners.lost.jsonl`)
| question | members |
|---|---|
| writes | the filter's non-seed failure branch only (plan P1). Plain append, no rename. |
| reads | `inject-due-alerts.mjs` only (plan P3), tail-bounded. |
| mutates / deletes | **none.** Clearing is decided at read time, so nothing rewrites the file. `_sweep_tmp` does not match it (its name holds neither `.tmp` nor `.lease.stale.`). **Growth is unbounded and stated as the residual** (C5): the condition that makes a save fail can append on every marker line until it clears. |
| schedules | as A3. |

### A5 — the hook (`inject-due-alerts.mjs`)
- Runs per prompt from each clone's own working tree (`node "$CLAUDE_PROJECT_DIR/.claude/hooks/inject-due-alerts.mjs"`, `.claude/settings.local.json:257`, wired in this clone and in `-new` and `-analyst`, read directly). A pull therefore updates it at the next prompt — no re-arm needed for the hook half.
- Reads the owner record at `:156-163` inside its own try/catch. The rejects line (`:189-191`) goes to CC-A only, because rejects are Langston's to fix. **A lost routing is different: it lives in THIS session's record, and only this session's view is wrong** — so it is shown to the session whose sidecar it is.
- Pure logic lives in `alert-split.mjs` and is tested by `scripts/analysis/test-alert-split.mjs` (cases state their expectation; the suite counts cases that showed something).

### A6 — the census stamp (`:400`)
`'{0} {1}' -f $_.ProcessId, $_.CreationDate.ToString('s')` — local time, no zone. Its parser (`:421-424`) needs two space-separated tokens, the first a pid; a `…Z` stamp keeps that shape. Langston's reader census at Step 1: the only other parser is `test-wake-lease.py:170`, keyed on the `WATCHER-ORPHAN: 2 reader` prefix and the pids, not the stamp.

### A7 — the stale comment
At the ref it is `cc-wake-filter.py:1068`: *"STDERR, deliberately: the Monitor treats stdout as the event stream, so a stdout line here would forge a wake."* Introduced `bb1b19044` (`#730`). The diagnostic stays; the REASON is stale. **The current reason:** stdout carries only the `WAKE[` lines a session acts on; diagnostics go to stderr so they never read as a wake line. Both reach the task's output file, which is why every diagnostic leads with `[cc-wake-filter]`.

### A8 — the existing held-file test
`test-wake-filter-cuts.py:251-266` holds the owner record open 7 s with a Python `open()` (which blocks `os.replace` on Windows) while a Langston reply addressed to CC-A arrives, and asserts: the wake printed, no `LINE DROPPED`, the `NOT saved` line, rc 0. **This is the harness for OBJ-1** — it already proves the wake and the loss coexist; P1's check extends the same run (C7).

### A9 — sources read, and what they said
Code at the ref (A1–A8). Runtime: the laptop task outputs (the 1,436-file count in the scope). `SYSTEM_IMPACT_MAP.md` "Discord Comms Fabric" (the owner record, `#1142` already named at SIM:3714) and the hook-layer row (SIM:2898). `SYSTEM_MANUAL.md`: silent, correctly — comms tooling. Ledger: `#1142`, `#1140`, the B-TOKEN-BURN-CUT and B-WAKE-ARM-EXCLUSIVE catalog entries and reports; no earlier decision against an in-band loss record — `ecabf7a47` chose stderr as a stopgap and Langston named the in-band form the same day. `bridge/canonical/`: not consulted — the record dates from 2026-09-30, far after the governance change, and its provenance is fully in commits.

## PLAN

| # | change | from |
|---|---|---|
| **P1** | `record_owners` keeps a list `mutated` (ids set NEW or FLIPPED in this call) and counts `lost_rejects` / `lost_prose` (edits with no id). On a failed save, **non-seed only**: append ONE line to `<ALIAS>.alert-owners.lost.jsonl` — `{"ts": <message ts>, "at": <wall-clock UTC>, "ids": [...], "no_id": {"rejects": n, "prose": n}}` — with `open(…, "a")`. If the append itself fails, the existing stderr line stays, now naming the ids; that residue is stated. The stderr line is kept in both cases. The seed branch is untouched (`_SEED_LOST` and the refusal to stamp `seeded_at` stay). | A1, C2, C3, C6 |
| **P2** | `alert-split.mjs` gains a pure `lostRoutings(lines, owners, nowMs)`: an id is **cleared** when `owners[id].ts >= loss.ts` (MESSAGE clock on both sides — a later marker for that id, or the same message replayed and saved); a loss line **expires** when `nowMs - Date.parse(loss.at) >= 24 h` (WALL clock). Returns the uncleared ids and the summed no-id counts of unexpired lines. **Which field each rule reads is written in the code comment.** `>=` rather than `>` because the replay of the very message that was lost is the repair. | A2, C1 |
| **P3** | The hook reads the sidecar's LAST 64 KB (read from an offset, never the whole file), parses whole lines only, inside its OWN try/catch (a failure skips this line of output and never touches narrowing), and for ITS alias emits: `⚠ N alert routing(s) this session failed to record in the last 24 h — they read as unrouted here until Langston re-states them: <8-char ids>` plus the no-id counts, ending **"— tell Langston, leading with his name."** | A5, C4, C5, C6 |
| **P4** | Census stamp → `($_.CreationDate.ToUniversalTime().ToString('s') + 'Z')`. | A6 |
| **P5** | The comment at the UNROUTED-LINE diagnostic restated with the current reason (A7). | A7, condition A |
| **P6** | Tests. (a) Extend the held-file case in `test-wake-filter-cuts.py`: the same run must print the wake AND leave a sidecar line naming the marker's id with `ts` = the message ts and an `at` stamp (C7); a second case where the only edit is a reject leaves `"ids": []` and `"rejects": 1` (C3); a seed run under the same hold writes NO sidecar (C6). Control: the installed filter writes no sidecar. (b) `test-alert-split.mjs`: cleared by a later owner ts; cleared by an equal ts; NOT cleared by an older ts (the replay case, C1); expired by `at` while its message ts is old (C1); no-id counts summed; a truncated first line skipped. (c) The ORPHAN stamp ends in `Z` and is within a minute of the reader's start in UTC (in `test-wake-lease.py`'s real-orphan case). | A8, C1, C3, C6, C7 |
| **P7** | Close check for condition A: `grep -c "the Monitor treats stdout" comms-infra/laptop/cc-wake-filter.py` = 0, with a control grep for `UNROUTED LINE` = 1. | A7, condition A |
| **P8** | Install: filter copied to `~/.claude`, sha256 = the blob; the hook is live in each clone at its next prompt after a pull; each session re-arms (the lease makes that safe) so its watcher runs the new filter. | A5 |

Nothing in the plan is `UNAUDITED`.

## RESIDUALS, STATED

- **Sidecar growth is unbounded** while a save keeps failing (C5); the read is bounded to 64 KB. No pruning in this batch.
- **If the append also fails**, only stderr remains (the pre-batch state, now with ids).
- **The clearing rule trusts message timestamps**, which come from Discord via the follower and are not re-checked.
- **Laptop-only behaviour** (Windows file holds) stays `RULED ON REPORTED FACT` for Langston; the logic in P2 is pure and testable anywhere.

## PLAIN-LANGUAGE SUMMARY

When a session fails to save who owns an alert, it will now write a one-line note saying which alerts were affected, in a small separate file. The per-turn alert list then tells that session which alerts are showing to everyone by mistake, and to ask Langston to repeat his routing. Two leftovers are fixed alongside: a time shown in local time, and an out-of-date code comment.

## STEP 2 CLEARED (Langston, 2026-10-02, inbox id 1555705491…; re-derived by him at `f8e15cfbc`) — two mandatory changes and four conditions, folded into the plan

| ref | ruling | plan change |
|---|---|---|
| **B1** | the held-file legs are `if WIN:` and print SKIP on POSIX (`test-wake-filter-cuts.py:219-224`), so extending them proves nothing in CI | **P6a gains a POSIX-reachable forced-failure leg:** the owner-record destination is made a DIRECTORY, so the save raises `OSError` on both platforms; the sidecar line is asserted there. The Windows held-file leg stays as the fidelity case. |
| **B2** | an unwrapped append inside the per-line try would turn a record failure into a dropped WAKE (`:696-699`) | **P1: the append has its own `try/except OSError`.** P6a adds an append-fails leg (the sidecar path is ALSO a directory): expected, stated before running — the wake prints, no `LINE DROPPED`, rc 0, and the stderr line names the ids and says the loss record could not be written. |
| **C8** | two unleased arms for one alias are reachable, so a torn append is possible | **P3 skips and counts an unparseable line ANYWHERE in the tail**, not only a truncated first line; the count is shown. |
| **C9** | `at` is `…Z` (second resolution) and the message `ts` is `+00:00` with microseconds; a missing `ts` is live | **P2 compares PARSED epoch ms; an absent or unparseable `ts` on either side never clears — the 24 h `at` expiry is the only exit.** Tests: same instant in the two formats clears; a null `ts` does not. |
| **C10** | state reader coverage per alias | **MEASURED 2026-10-03: `inject-due-alerts` is wired in `settings.local.json` in all four clones (`-old`, `-new`, `-analyst`, `-infra`; 1 line each, control: 9 `"hooks"` keys each), and both hook files exist in `-infra`.** Coverage 4 of 4 (laptop, RULED ON REPORTED FACT). |
| **C11** | carry the data, not just counts | **P1 records `{"id", "owner"}` per lost id and the reject snippets (`snip`, `:663`).** **P2 also clears an id when `owners[id].owner` equals the lost owner** (a flip back to the on-disk owner, or a re-statement of a routing that already stands). The report line names id → owner, so Langston can re-state without re-deriving. |
| §13 | out of scope: does `-infra` lack the hook? | **Disposition 5, no work — present in all four clones (C10's measurement).** |

**Residuals added:** the sidecar has no deleter in the repo; an out-of-repo deletion silently drops the report (benign consequence, stated). A closed session never reads its sidecar within 24 h, which is why P1 keeps naming the ids on stderr — the task output is the durable copy.
