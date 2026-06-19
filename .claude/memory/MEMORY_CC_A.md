# MEMORY — Claude Old (CC-A) volatile working-state

> OWNED by Claude Old (CC-A), session `3ce652e6` (comms/roadmap/governance). Read this + shared `MEMORY.md` (protocols) at session-start; write volatile state ONLY here. CC-B owns `MEMORY_CC_B.md`. Detailed fee/strategy scratch: `_scratch_xstock_globals_resume.md`. Mirror to `.claude/memory/`.

## ★ WHERE I AM (2026-06-19, late — context was at 95%, this is the lifeline)

**★LATEST (right before my compaction): CN SHELL-SWAP COMPLETE.** Moniker TRANSFERRED to `f9ed24c3` (roster committed `b5a5ae238`, CC-B session_id 7f66d970→f9ed24c3, 7f66d970 RETIRED). New shell re-seeded to 68MB; the 86%-context was just loaded summaries → Kyle compacting it; Kyle is sending the new shell the start-as-CC-B prompt (run session-start, arm CC-B watcher, then reorg-B1). Awaiting CN's armed-confirmation = swap fully done. **MY NEXT = Discord feasibility study (recommended dive) + queue below.** CLEANUP PENDING (CC-A housekeeping): delete the old `7f66d970` transcript + the intermediate seed files (`SEED_1WEEK`/`SEED_2WEEK`/`TRIMMED2`/etc.), KEEP `7f66d970…BACKUP-20260619b-pre-reprune` (311MB safety) a while.

### CLAUDE NEW SHELL-SWAP — IN PROGRESS (the ACTIVE task)
- CN's old session (`7f66d970`) was STUCK (311MB rendering freeze; yesterday's 309MB prune too gentle). Kyle decided to SWAP CN's shell to a fresh session (he believes the old shell is damaged — though see the 1M note, the "damage" symptom is likely just the cosmetic 1M-dropdown quirk + size).
- **New session Kyle created = `f9ed24c3-9a40-4fa7-a9c4-f6c479801602`** ("Awaiting instructions").
- I RE-HOMED a 196MB seed (last week, since 2026-06-12, + ALL 116 compaction summaries) into `f9ed24c3`: re-stamped every entry's `sessionId` → f9ed24c3, dropped 7922 old custom-title entries, validated (0 bad JSON, 0 dangling, all sessionId correct). DONE.
- **Health check on f9ed24c3 PASSED:** files open (CLAUDE.md + MEMORY.md + MEMORY_CC_B.md), oriented (correctly recalled CN's recent work — memory split, pruning me, the audit reversal, both-classes plan, reorg-B1 next), responsive (no freeze / no can't-send). **The stuck-UI is FIXED on the new shell — the transplant works.**
- ★OPEN DECISION (awaiting Kyle): the 196MB seed loads ~865k tokens = **87% context (too heavy)** + 196MB file still near the freeze-zone. I RECOMMENDED a quick re-seed to **~69MB** (all 116 summaries + last ~2.5 days = since 2026-06-17; re-stamped to f9ed24c3) → ~30% context, durable headroom. Kyle picks: re-seed-69MB (my reco) vs accept-196MB + transfer-moniker now.
- PENDING after the seed decision: **TRANSFER the "Claude New" moniker to f9ed24c3** — update `(repo)/.claude/cc-session-roster.json` CC-B `session_id` `7f66d970` → `f9ed24c3`; then the new shell runs session-start (re-arm watcher as CC-B, §10.5 alerts, roster-bind) + picks up **reorg-B1** (the old B6.5f re-scoped to cover BOTH crypto + xStock symbol-recognition completeness).
- Backups/seeds: `7f66d970…BACKUP-20260619b-pre-reprune` (311MB full), `f9ed24c3…ORIG-tiny` (new session's original 36KB). Seeds built: `…SEED_1WEEK`(196MB, currently live in f9ed24c3), `…TRIMMED2`(69MB, Jun17), 135MB(Jun15 cutoff), `…SEED_2WEEK`(303MB).

### 1M MODEL QUESTION (Kyle, VERIFYING via docs)
A BRAND-NEW session ALSO shows no "Opus 4.8 1M" dropdown option but hovers as 1.0M context. Kyle's hypothesis: **1M is now the DEFAULT (no 200K option)** → that fully explains the non-issue. Checking Anthropic/Claude docs (claude-code-guide). If confirmed: everyone's on 1M by default, the dropdown just doesn't distinguish — NO reinstall needed; the "damage" theory for CN is mostly the rendering-bug-from-size, not a defect.

### MY GOVERNANCE (done earlier today — landed)
B-XSTOCK-GLOBALS CLOSED + B-GOV-2 activated-in-shadow-but-PAUSED (both pushed `b1453d22b`). Memory-split done + pushed (`dff806803`). I was pruned 457MB→17MB (works great). Sync 0/0.

## ★ NEXT ACTIONS (CC-A queue)
1. Finish CN shell-swap: re-seed decision → **moniker transfer** (roster `7f66d970`→`f9ed24c3` + watcher).
2. Confirm the 1M-default question (docs) + tell Kyle (don't reinstall).
3. **Discord feasibility study + migration plan** (Kyle wants it; my recommended dive once CN swap settles).
4. B-GOV-2 clean re-activation: 2 §13 follow-ups (seed `GOVERNANCE_EXCEPTIONS.md` + shadow-surfacing fix) → re-enable shadow → go-live. Langston Step-8 for both closed batches.
5. xStock guardrail-tripwire §13 follow-up (centralized witness in `registerOpenVtsTrade`).

## ★ PRUNE / SHELL LEARNINGS
- Prune AGGRESSIVELY: target ~20-70MB (my 17MB fine; 195MB = 87% context too heavy; 311MB = stuck). 200MB+ too big for a durable light shell.
- Runbook `1-system-manual/CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md`; scripts `memory/trim_transcript.py` (aggressive) + `distill_transcript.py` (safe). Re-home = set `sessionId` per entry to the new UUID + drop `custom-title` entries; session must be ARCHIVED (released) during the file swap; filename+sessionId match → loads (proven on f9ed24c3); picker metadata may lag (cosmetic).

## ★ KEY CONTEXT (still live; detail in `_scratch_xstock_globals_resume.md`)
- FEE REALITY: Kraken July-9 Tier1 = 0.40% maker / 0.80% taker = our model (correct). No US-person-accessible exchange escapes it. Strategy modeled for ~0.10%. → don't switch; adapt (maker + bigger targets ≥3.5-4% + AoP tier-climb).
- TRADING-APPROACH 3-way: CC-A + Langston converged; **Kyle told CN to proceed with its+Langston decision — I do NOT owe a concur/fee-post.**
- CN carries the both-classes Phase-19 plan + reorg-B1 next; the active-pipeline audit is done (Langston-approved).
