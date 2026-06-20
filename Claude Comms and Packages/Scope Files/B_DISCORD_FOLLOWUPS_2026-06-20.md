# B-DISCORD — Follow-up punch list (Kyle directive 2026-06-20, ~1 AM)

Captured verbatim-in-intent so none are lost. Owner: OLD Claude (CC-A) unless noted. These are the items Kyle listed after the Discord comms system + 3-way mesh were built and tested.

1. **Memory file for the PREVIOUS Claude New (session `7f66d970`).** Right now it's unclear which memory file that retired session would use. Create one for it, **mirroring the CURRENT NEW Claude's working-state (`MEMORY_CC_B.md`)**, so if Kyle ever interacts with `7f66d970` again it starts from that baseline and branches off independently. *(Done this turn — `MEMORY_CC_C.md` created as a mirror; full revival still needs: a name/alias, a roster entry in `.claude/cc-session-roster.json`, a `NAMES` entry in `cc-wake-filter.py`, and its own Monitor-tool wake watcher.)*

2. **Rewrite ALL Telegram-based comms documentation to Discord.** Every doc that describes how Kyle/OLD Claude/NEW Claude/Langston communicate must move from Telegram to the Discord model: `CLAUDE.md` §6 (three-way protocol — bot-to-bot now native; retire §6.5.0/.0a/.0b/.1 SSH-deliver), §8 (Langston ops: bots/bridges/logs), §6.9 (wake channel — now tails the Discord inbox), §6.10; the SIM comms components; `MEMORY.md` session-start steps; `comms-infra/` docs. (Was already homed in the TEST_AND_SWITCH_RUNBOOK as a post-switch task; Kyle now wants it done.)

3. **CLAUDE.md set up for the new comms — all three participants.** §6/§8 rewritten to cover OLD Claude, NEW Claude, AND Langston on Discord (names, the start-with-"Langston" rule, response discipline, wake mesh, the Monitor-tool-not-Bash watcher rule). (Subset of #2, called out separately by Kyle.)

4. **Trim CLAUDE.md (the R3 slim that was approved in B-GOV but never executed).** Keep ALL rules always-loaded; strip only the *narrative* (backstory/why/war-stories) into `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md`, leaving terse imperative rules + "see history §X" pointers. **Specifically: condense the long §0 mission statement** — keep a mission/purpose statement but much shorter (doesn't have to be the whole thing).

5. **Governance batch for the Discord setup (B-DISCORD).** The Discord work shipped across many commits with NO formal governance. Produce the proper doc-set: scope, pre-audit, completion report, BATCH_CATALOG entry, PHASE_HISTORY, RUNNING_ISSUES, SIM update (new `comms-infra/` components + the bridges/bots/logs), and the doc-rewrites in #2/#3.

6. **Capture session-transcript pruning + duplicate-ID debugging in CLAUDE.md.** The trim/dedup knowledge (runbook `CLAUDE_CODE_SESSION_TRANSCRIPT_TRIM_RUNBOOK.md` + `memory/{trim,distill,dedup}_transcript.py`) should be referenced as a governed procedure in CLAUDE.md so it's not buried — when a session bloats or the scroll-bounce duplicate-ID bug hits, the fix is findable from the always-loaded file.

7. **(Kyle's own action / FYI) Next batch coordinated via Discord.** Kyle will have the CURRENT NEW Claude start the next batch and they'll test how batch work flows over Discord. Not a CC-A task — noted so we watch how it goes and fold learnings into #2/#5.

8. **Governance watcher: when does it leave shadow mode?** ANSWER (see below) — exit gated on 3 things; currently the timer is DISABLED. Track to go-live. → scheduled as **B-GOV-3** (`B_GOV_3_SCOPE_governance-checker-golive.md`), slotted 2nd in OLD Claude's governance queue.

9. **★ Topic-21 (Telegram) → a SEARCHABLE resource accessible by ALL THREE agents (Kyle directive 2026-06-20 — explicitly on the governance list).** Archive the full Telegram topic-21 thread history into a durable, greppable file under `Claude Comms and Packages/Telegram Discussion Archives/`, and make it reachable by OLD Claude, NEW Claude, AND Langston (in-repo so it's on everyone's mount + greppable; Langston reads it via his FUSE mount / `ssh staging`). This preserves the entire pre-Discord discussion record as a searchable knowledge base, not just a dead dump. **This is a formal governance deliverable** — folds into the B-DISCORD governance batch (#5). Mechanism: pull topic-21 history (the bridge inbox log + Telegram export), normalize to a searchable markdown/JSONL, commit, and reference it from the comms docs.

---

## Answer to #8 — governance-checker shadow-mode exit criteria
The checker (B-GOV-2) runs in shadow mode and its timer is currently **disabled** (turned off this session after the activation incident flooded the §10.5 queue with 88 info alerts). It comes OUT of shadow → live paging only after all three:
1. **Seed `GOVERNANCE_EXCEPTIONS.md`** — mark already-closed / legitimately-OPEN historical batches so the first live tick doesn't false-alarm on them (the flood was exactly this).
2. **Fix shadow-surfacing** — shadow-mode alerts currently DO surface in the §10.5 queue; shadow must be truly silent (or LOW-only) until validated, so a shadow run can't page.
3. **Clean validation window (the B-GOV Obj-11 backtest gate)** — run it over the last ~15–20 closes: it MUST pass known-good clean closes (no false alarms) AND flag a known real gap (e.g. B3b's missing pre-audit). Only when both reproduce are the thresholds trusted.

Then flip out of shadow. Until then it stays disabled. (Homed as the B-GOV-2 calibration follow-ups in RUNNING_ISSUES / §13.)
