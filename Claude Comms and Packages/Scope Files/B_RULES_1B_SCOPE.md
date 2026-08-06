# B-RULES-1b — SCOPE: rule slimming against PROVEN mechanisms (governance programme Part 1, leg 2)

change-class: non_architecture
**Owner:** CC-A (OLD Claude) · 2026-08-06 · Sequence: the Langston-approved 1a→1e order (1a CLOSED #651; this is 1b).

## 1. WHAT THIS LEG IS — AND THE TWO RULES THAT BOUND IT
Kyle's governing instruction: every behaviour gets an enforcement home that is NOT `CLAUDE.md`; the instructions file follows Anthropic's guidance (≤200 lines; ours measured **141,158 B at today's session start** by the OBJ-1 instrument). **Bound 1 — NO-TRIM (#339, Kyle-ruled):** nothing deleted or made unfindable. **Bound 2 — the #564 placement rule:** `CLAUDE.md` keeps the OPERATIVE statement; depth moves to a named home. ⇒ **1b "removals" are conversions: a rule whose enforcement mechanism is PROVEN keeps a short operative line + pointer; its procedure/depth moves to (or already lives in) the mechanism's own home.** A rule whose mechanism is unproven MOVES NOTHING (rule 29 stays whole — leg-2 hooks unbuilt).

## 2. THE CANDIDATES — each with its mechanism, the PROOF, and the regression check (Langston 1a condition: every conversion names the incident it must still catch)
| # | rule (CLAUDE.md) | mechanism (the enforcement home) | proof it lives | regression check + incident |
|---|---|---|---|---|
| C1 | rule 21 daily model+feature check (~4,600 B incl. the 2026-06-16 expansion) | scheduled task `daily-claude-model-check` + its SKILL.md (the full procedure incl. the two-way availability confirm + dropdown trap) | **MEASURED today: `lastRunAt=2026-08-06T07:59:57Z`, enabled, next 08-07** — the 1a gate ("show it fired in the last 7 days") passes | check = the task registry's lastRunAt staying <48h (heartbeat-observable); incident = the Fable-listed-but-dead dropdown trap, which must stay IN THE SKILL.md verbatim |
| C2 | rule 22 governed-read, the mechanically-blocked shape (~1,900 B of mechanism prose) | `guard-governed-read.mjs` PreToolUse hook (wired) + `session-reminder.mjs` re-injection | both hooks registered + firing (the reminder visibly re-injects each compaction — observed in-session today) | check = the hook blocking the `git show`+`2>/dev/null` shape (walkable, one command); incident = the 07-10 stale-ledger false absence. **The STANDING rule (refusal-not-recollection, absence-needs-presence) STAYS — only the mechanism description slims** |
| C3 | rule 25 commit-discipline mechanics (~1,200 B of the tier/lock prose) | `guard-bare-commit.mjs` hook + `CLAUDE_CODE_PERMISSION_PROMPT_RUNBOOK`-style depth already relocated | hook registered (settings.local.json, verified in the 1a close) | check = a bare `git commit` without paths being blocked (walkable); incident = #540 index sweeps. **25.c (read the staged CONTENT) STAYS — no hook covers it** |
| C4 | §6.9 wake-watcher re-arm mechanics (~2,600 B duplicated with MEMORY 4.5) | the SessionStart hook + hourly heartbeat task | heartbeat `lastRunAt=2026-08-06T10:05Z`, hourly, waking all sessions (observed all session) | check = heartbeat arrival gap <2h; incident = the 06-19 run_in_background silent-stream trap, which must stay in the ONE surviving copy (MEMORY 4.5) |
| C5 | the CLAUDE.md self-measurement + load claims already corrected in 1a | the OBJ-1 instrument (both sides, degraded-flag hardened) | five+ rows, falsifiable-at-birth passed, Langston-verified | check = per-session-start rows continuing; incident = the stale-in-its-own-edit byte figures (history §5.30) |

**Explicitly NOT candidates (stated so absence is a decision, not an oversight):** rule 29 (its hooks are leg 2 of B-MEASURE-GATE, unbuilt) · rule 24/24.a (judgment rules, no mechanism exists) · rule 28 (Langston 1a ruling: not stated a third time, but its bridge-send signature analysis is leg-2 scope, not 1b) · THE EIGHT index · §1 persona compression (scheduled separately per 1a ruling) · anything in Langston's file (INFRA Claude's lane).

## 3. METHOD (per candidate, the same four steps)
(a) draft the replacement operative line + pointer; (b) verify the mechanism's home carries the FULL procedure including the named incident (add it there FIRST if missing — nothing is unfindable at any instant); (c) walk the regression check; (d) the diff is a Step-4 gate through Langston (his 1a OWNERSHIP condition: every CLAUDE.md diff gates through him). One commit per candidate, so a bounce surgically reverts one conversion.

## 4. VERIFICATION
- Per candidate: the regression check walked + the incident text present at the new home (grep the identifier, not the phrasing).
- Whole leg: the OBJ-1 instrument's next-session `context_bytes_total` DROPS by approximately the sum of converted bytes — **the programme's success metric, measured by its own instrument** (baseline 185,139 B CC-A; populations named in the rows).
- §339 audit: every removed passage's content findable at a named home (list in the completion report, old-location → new-location).

## 5. OUT OF SCOPE
`.claude/rules/` path-scoped extraction (1c) · skills (1d, Kyle's list is its design input) · ORDERING (1e) · Langston-side anything · any rule whose mechanism is unproven.
