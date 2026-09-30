# B-TOKEN-BURN-CUT — SCOPE (Step 1)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Directive:** Kyle, Desktop chat, 2026-09-30 · **Placement:** pre-sprint, alongside row 1 `B-PLAN-CURRENCY-CHECK` (see §6)

## 0. Why this batch exists — the measurement Kyle acted on

Kyle asked why the four sessions and Langston used up the week plus ~$213 of extra usage (the app's figure, $212.89) on 2026-09-29/30. Measured from every assistant API call (deduplicated by message id) in each session's own transcript, the pre-trim copies saved on 2026-09-29, the subagent/workflow transcripts, and Langston's `/home/langston/.claude/projects/**` transcripts. Every call is priced at list rates as a yardstick for SHARES (not the bill); instruments are `tok_turns.py`, `tok_sub.py` and `tok_langston.py`, to be committed with the pre-audit.

| surface, 09-29 + 09-30 | list-rate $ | early-Sept busy day for comparison |
|---|---|---|
| four sessions' own conversations | 2,095 | ~720-850 per day (09-02, 09-03, 09-11, 09-13) |
| helper agents + workflows (Ultracode from 09-29 13:00) | 1,524 | $2-30 per session per day |
| Langston | 403 | 140-212 per day |

Findings this batch acts on (the others went to Kyle and were disposed of there):

- **F1: the watcher can no longer be permanent.** The app's Monitor tool no longer has a `persistent` option; its schema caps `timeout_ms` at 1,800,000 ms and it states "Every monitor expires after `timeout_ms` (default 5 minutes, at most 30 minutes)". The arm procedure still says `persistent: true` (`CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md` §1; shared `MEMORY.md` §4.5). Measured expiry notices ("Monitor expired after 30m…"): CC-A 66/36, CC-B 60/34, CC-C 74/48, Infra 62/8 on 09-29/09-30. ANALYST Claude has run 30-minute watches since 09-22 (47-49 arms a day, 09-23 to 09-28). Every expiry wakes the session. Turns started by a watch notice that is not a WAKE line (every one sampled in ANALYST Claude's transcript is an expiry notice: 390 of 390) cost $421 across the four sessions on the two days; 164 of those 165 turns ended with a text reply.
- **F2: each wake re-reads a 400k-800k-token conversation** (median input per call, 09-29/30), so a wake with nothing to do still costs about $1-3. Kyle declined compacting earlier ("what's the point of a 1M context"). ⇒ **cutting the NUMBER of wakes is the lever; their unit cost stays.**
- **F3: the second-reader loop and the Ultracode fleets.** Kyle approved (point 1): Ultracode stays off, and the fresh-reader check becomes **one pass, only on claims that would change what gets built**. Kyle switches Ultracode himself; this batch changes the reader-loop text.

## 1. Objectives

**OBJ-1 — A session is woken only when a wake-worthy event arrives.** The watcher is re-armed as a Bash `run_in_background` task that **exits after it prints the first wake-worthy line** — one completion notification per event — instead of a Monitor that expires every 30 minutes. The routing rules in `cc-wake-filter.py` (name-or-nothing, suppressions, the Langston lead-name rule) are **unchanged**; only the delivery mechanism changes.
*Verify:* (a) across ≥6 idle hours for each session after re-arm, its transcript carries **zero** "Monitor expired" notices and zero watcher-originated turns without an event; (b) a planted message naming the session wakes it (positive control), and a planted message naming only another session does not (negative control), per session.

**OBJ-2 — No event is lost between wakes.** Between the watcher exiting and the session re-arming, and during the whole turn the session spends on the wake (minutes), new lines keep arriving. `tail -n0` on re-arm would drop them. The watcher resumes from **the last position it delivered** (per source file) so every line arriving in the gap is filtered and delivered on the next arm, in order, once.
*Verify:* planted events posted (i) while the session is mid-turn and (ii) in the gap before re-arm are each delivered exactly once, in order; a duplicate-delivery check (same event twice) returns none.

**OBJ-3 — The arm procedure is updated everywhere it lives, and every session runs it.** Sites to census at Step 2 (at least): `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md` §1-§2 (including the 06-19 trap, which this design deliberately inverts: exit-on-first-event *uses* the notify-on-exit behaviour that silently broke a never-exiting watcher), shared `MEMORY.md` §4.5 (inline command, kept inline by design), `CLAUDE.md` §6 comms block ("MUST be armed with the Monitor tool") and §6.9 mechanics, `.claude/hooks/session-reminder.mjs` text, the SessionStart re-arm reminder, and the hourly `wake-watcher-heartbeat` scheduled tasks' re-arm instruction. All four sessions re-arm on the new form.
*Verify:* a census at the ref of `persistent: true` / "Monitor tool" arm references returns only the new form or a history note; each session's transcript shows the new arm and satisfies OBJ-1(a).

**OBJ-4 — The fresh-reader check is one pass, on load-bearing claims only (Kyle, 2026-09-30).** Every skill carrying the loop ("iterate to consensus … cap at three rounds") — census at Step 2; found at the ref so far: `bug-investigation`, `workflow-02`, `workflow-04`, `workflow-07`, `workflow-11` — is rewritten to: one fresh reader, only for a claim that would change what gets built; its HIT is still re-derived at the ref and its CLEAN is still never evidence (those two properties are Langston's and are kept). My own memory line carrying the 2026-08-31 every-dispatch form is updated.
*Verify:* at the ref, no skill instructs a multi-round loop or a reader on every dispatch; the kept properties (hit = lead, clean ≠ evidence, the one-line `REVIEWER:` record) are present.

## 2. Out of scope (declared)
- Compacting sessions earlier — Kyle declined, 2026-09-30.
- Langston's `MEMORY.md` over its cap (91,584 B against the ~24 KB bytes-first cap) — Infra Claude's, `#946`; relayed 2026-09-30.
- The app's injected "The user hasn't heard from you in a while" nudge (up to 119 a day, ANALYST Claude 09-29) — an app behaviour with no setting in the Code-tab preferences (checked 2026-09-30); nothing this repo can change. Reported to Kyle.
- The routing rules of the wake filter — unchanged by design (B-WAKE-QUIET `#995`: only not delivering a wake reduced commentary; this batch removes deliveries that carry no event).

## 3. Architectural read (1.a)
`SYSTEM_IMPACT_MAP.md` "Discord Comms Fabric" (:2806 onward, and the B-COMMS-IMAGES-2 / B-WAKE-QUIET / B-WAKE-LEAD-NAME content updates at :2808, :3663, :3670): `cc-wake-filter.py` is repo-canonical at `comms-infra/laptop/cc-wake-filter.py` and hand-copied to `C:\Users\kyleg\.claude\` (:3681); the repo copy equals the live copy (compared CRLF-normalised, 2026-09-30). The watcher consumes `/var/log/cc-discord-inbox.jsonl`, `/var/log/langston-alert-invokes.log`, `/var/log/cc-wake.log` on Helsinki; nothing downstream consumes the watcher except the session itself. The `SYSTEM_MANUAL.md` does not cover comms tooling (not trading architecture) — judged N/A for content, to be re-checked at Step 10. No trading path, database or staging component is touched.

## 4. Provenance (1.b)
Corpora searched: `git log` (not path-limited) on the runbook, `MEMORY.md`, `CLAUDE.md` and `comms-infra/laptop/cc-wake-filter.py`; the runbook's §5 history; `SYSTEM_IMPACT_MAP.md`; `RUNNING_ISSUES.md` for `#995`.
- **Tier 1 — the arm method (Monitor, persistent).** Introduced `c975db4f4` (2026-06-20), verbatim: *"MEMORY 4.5: wake watcher MUST use the Monitor TOOL not Bash run_in_background (a while-true bg Bash task never wakes the session — silently broke CC-B's wake 2026-06-19)"*. Intent: a streaming watcher needs per-line events. **Disposition (2): relevant, needs updating to today's intent** — the platform removed the permanent option, so a never-exiting stream now costs a wake every 30 minutes; an exit-on-first-event task restores event-only waking without the 06-19 failure (it exits, so it notifies).
- **Tier 1 — the reader loop.** Kyle 2026-08-27 (standing approval, loop until the reader's items are satisfied, cap 3) and 2026-08-31 (every dispatch, every step), written into the skills listed in OBJ-4. **Disposition (2)**: Kyle's own 2026-09-30 decision narrows it on cost.
- **Tier 2 — `cc-wake-filter.py`**: routing/suppression, built 2026-06-11/12, re-homed `b279dfe79` (B-COMMS-IMAGES-2). Read, not changed in behaviour — (1) still relevant and correct. Its stdin loop may gain a stop-after-first-delivery switch; that is a mechanism change, not a routing change.
- **Tier 2 — hourly heartbeat** (`wake-watcher-heartbeat`, 2026-07-13): liveness backstop; its instruction text changes (OBJ-3), its role does not.

## 5. Existence + ledger check
Searched `RUNNING_ISSUES.md` and `BATCH_CATALOG.md` for the wake-watcher path and "persistent" — B-WAKE-QUIET (`#995`) closed the *routing* side; no entry covers the Monitor expiry (it began with the platform change). No existing capability delivers exit-on-event waking.

## 6. Placement
Pre-sprint, second exception after row 1 (Kyle, 2026-09-30: *"it's important that we get this done or figured out before we go into the sprint"*). Proposed plan row **1h** in `SPRINT_TO_LIVE_PLAN.md` §4 and a §0 line, taken ahead of row 1's Step 4 because every idle hour costs every session two wakes; **placement is for Langston to confirm at this step.**
