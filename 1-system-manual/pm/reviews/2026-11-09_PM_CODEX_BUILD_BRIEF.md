# PM Codex build brief, for OLD Codex (first job of the Codex shift)

**Decision:** Kyle 2026-11-09, recorded as KD-62: "OLD Codex builds it." PM Codex was planned (B-PM-CLAUDE P4, roster entry "planned") but never built. The Claude allowance is past Kyle's 85% stop line, so the build happens on the Codex side, reviewed by Coltrane.

**Source of the requirements:** `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md` item 4. This brief adds what PM Claude learned running the role.

## What PM Codex is
The ChatGPT stand-in for PM Claude (Kyle's project manager and coordinator), working in `C:\DawnTraderV3-pm`. It keeps the crew moving, triages every Discord post addressed to Kyle, brings Kyle only what needs him, and records his decisions. It does not build trading code.

## How to build it (Kyle, 2026-11-09, KD-65): just build it, NOT as a batch
**No eleven workflow steps, no scope, audit, change list or step-by-step review.** Kyle: *"That's overkill. I just want it built."* Write the files, push them, tell Kyle how to open PM Codex, then prove it works. The one exception is item 3 below: it changes the live switch tool, so it gets a single look from Coltrane before it is installed. If time is short, leave items 3 and 4 for later. PM Codex works without them, and the PM can hand over by hand meanwhile.

## What to build
**Two must-haves from Coltrane's review (2026-11-09 21:18Z; they were folded into the scope at `8338c1603` on `review/pm-codex-p4-scope`, which KD-65 set aside; carry them into the direct build):**
- **PM Codex's name gives it no permissions.** `codex-pm` is the session's identity only. Prove it is refused by the alert allowlist, both deploy-actor checks and exception confirmation. `pm-codex` is accepted only for alert actions. The PM writes no app code and never deploys.
- **No unsafe Coltrane stop.** `crew-switch` controls only Langston today, and stopping Coltrane mid-review can orphan his process and raise a false failure alert (`RUNNING_ISSUES` 11340-11341, owned by `#1198` / B-AGENT-INVOKE-FAILURE-NOTICE, INFRA). Until that lands, PM Codex's usage stop may stop Coltrane only when he is idle (no review running), and must refuse otherwise.

0. **Tell Kyle, in plain step-by-step words, how to open the new PM Codex session (Kyle, 2026-11-09).** He has not opened a Codex session in the PM folder before. Give him: which app to open; how to start a new session there; that its folder is `C:\DawnTraderV3-pm`; and the exact first message to paste. That message tells it it is PM Codex, to pull first, and to read the PM section of `AGENTS.md` and the crew handover sheet `1-system-manual/pm/handovers/2026-11-09_claude-to-codex.md`. Check the steps against the Codex app as it is today, not from memory. Do this once steps 1-3 below are reviewed, so the session he opens finds its instructions in place. Until then, tell him it is coming and roughly when.
1. **`AGENTS.md`:** add the row `C:\DawnTraderV3-pm` → **PM Codex** (actor `codex-pm`), standing in for PM Claude (CC-PM). Add a short PM section telling it to read, in order:
   - `1-system-manual/PM_CLAUDE_RULES.md` (the role file);
   - `.claude/memory/MEMORY_PM.md`, the CURRENT POSITION block first (it has the stop record, pending Kyle decisions and the plan);
   - `1-system-manual/pm/DECISIONS.md` (the KD ledger), `DECISION_PROTOCOL.md`, `OPEN_BATCH_REGISTER.md`;
   - `1-system-manual/SPRINT_TO_LIVE_PLAN.md` and `Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md`.
   - **Where the old history is:** the full conversation archive is on the laptop at `C:\Users\kyleg\.claude\transcript-archive\` (`CC-PM\` plus `INDEX.md`), and older notes trimmed out of memory are in the file history (`git log -p -- .claude/memory/MEMORY_PM.md`). Search these before answering Kyle about anything older.
2. **Discord:** PM Codex posts as **"PM Codex"** through the existing Codex outbox (`comms-infra/codex/codex-send`). The sender is set by the outbox, never by the message, so map the PM folder to "PM Codex" there.
3. **`crew-switch` (can wait; one Coltrane look before installing):** add PM CLAUDE / PM CODEX to its session list, so one switch line moves the PM with the crew and its handover receipt is chased like everyone else's.
4. **Alert actor names (can wait for the next deploy):** add `pm-claude` and `pm-codex` to `ALERT_ACTORS` in `server/services/system-alerts.ts`. This is a code change that needs a deploy, so it may wait for the next deploy. The PM rarely acks alerts.
5. **Roster:** change the "PM Codex" entry in `.claude/cc-session-roster.json` from "planned" to "active".
6. **Backups:** confirm the transcript archive and nightly backup cover `C:\DawnTraderV3-pm`, and the Codex side's equivalent covers PM Codex.
7. **The return trip is PM Codex's job (Kyle, 2026-11-09).** Write PM Codex's own procedure for the switch back to Claude, mirroring PM Claude's `.claude/skills/pm-transition-to-codex/SKILL.md` in reverse, and point to it from the PM section of `AGENTS.md`.
   - **Trigger: Kyle tells PM Codex in its chat to switch back.** PM Codex then issues the order itself, `ssh root@204.168.141.77 'crew-switch start claude'`, and checks `crew-switch status` (crew on CLAUDE, Langston bridge back on). Kyle does not post on Discord. Never switch on PM Codex's own judgement.
   - Before the order: collect each Codex session's handover block and write `1-system-manual/pm/handovers/<date>_codex-to-claude.md`; check every clone is synced.
   - After it: tell Kyle which Claude windows to open (nothing can open them for him); chase receipts; re-send every unanswered Coltrane review to Langston; hand PM Claude a PM handover block in MEMORY_PM.md; report complete only when every check passes, so Kyle never chases a session himself.
7b. **PM Codex's usage stop, built for Codex (Kyle, 2026-11-09).** PM Claude's stop is `.claude/skills/pm-usage-stop/SKILL.md`. PM Codex needs the same duty (stop everything that spends the ChatGPT allowance, record exactly what was stopped, undo exactly that on resume), but **the Codex mechanisms differ, so find out what they are and build for them; do not copy the Claude steps.** Settle and write down, with Coltrane's review:
   - **The reading and the line:** where ChatGPT/Codex usage can be read, and Kyle's stop line for it (ask him; do not assume 85%).
   - **What spends it:** at least the four Codex sessions, PM Codex and Coltrane's bridge on the Helsinki box. Check whether `crew-switch` can turn Coltrane off the way `langston off` turns Langston off; if not, propose how, as a reviewed change.
   - **How to reach the sessions:** Codex has no session-to-session messaging and no wake path, so a stop posted on Discord is only seen when a session next works. Find the reliable route, and the honest limit if there is none (Kyle may have to stop a session by hand).
   - **Anything scheduled on the Codex side** (automations, timers) that would keep spending, and how to pause and resume each.
   - **Resume:** reverse the recorded list, only on Kyle's word.
8. **Prove one handover with Kyle watching:** PM Claude → PM Codex → back. Not done until this passes.

## Rules PM Codex must carry (learned the hard way)
- Kyle gets plain language only. Every decision ask gives the issue, what the fix fixes, the options, the pros and cons, the session's recommendation, and whether PM agrees (KD-34). One final clear instruction, never back-and-forth.
- Technical decisions are made by the owning session plus the reviewer to consensus. Kyle gets only money, risk or go-live calls, additions to his agreed list, and true deadlocks.
- A placement or ownership ask to Kyle needs a fresh slot check first (`node scripts/pm/slot-check.mjs`).
- Check a decision is not already in DECISIONS.md before asking Kyle again (the database-warning alert was re-asked twice after KD-60 settled it).
- Never type a password into a form. Never touch `G:\My Drive\Misc\I.T. and Security`. Never touch the COMMAND CENTER session.
