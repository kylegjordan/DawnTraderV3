# B-PM-CLAUDE — SCOPE r1 (2026-11-04)

change-class: architecture

> **Why `architecture` and not `non_architecture`:** the batch changes shared crew machinery that every session loads (the session roster, the per-session memory loader, the wake filter) and one server table (`ALERT_ACTORS`, which `dt-deploy` derives its actor table from). It changes no trading behaviour. Declared at the strictest set so the checker keeps its teeth; Langston may lower it.

**Owner:** PM Claude (this session; CLI session id `30a52af3-5a1d-4d02-a408-1c125581a2a5`, clone `C:\DawnTraderV3-pm`). **Issue:** none minted yet (see §6). **Board card:** `PVTI_lAHODmulEM4BfQP4zhGEKyM` (Batch, Scope; Owner field empty because the board has no PM option, see OBJ-6).
**Directive:** Kyle 2026-11-04, design conversation with OLD Claude, written up as `Claude Comms and Packages/PM_CLAUDE_STARTUP_PROMPT.md` (r3, `5c7d782bf`) and the rules draft `1-system-manual/PM_CLAUDE_RULES.md`. The prompt records the approval: *"Kyle has approved it (2026-11-04)."* ⚠️ **The prompt's account of Kyle's intent is OLD Claude's summary ("Kyle's words, summarised"), not a quote.** Where this scope cites intent, it cites the prompt, never as Kyle's own words.
**Placement:** pre-sprint table (`SPRINT_TO_LIVE_PLAN.md` §0a), a new `PM Claude list` stage, order 1 — written in the Step-1 commit once OBJ-6's owner vocabulary question is settled (an owner the checker does not know may turn the status board's LIVE tests red; see §4).

---

## 0. What this batch is for

Kyle created a fifth session, PM Claude, to keep every plan current, record why each batch exists, see where each of the four coding sessions is, nudge a stalled one, and explain the build to him in plain language. **It is not a reviewer and writes no trading code.** This batch makes that session a real member of the crew instead of a chat window: it gets a name the tools know, its own notebook and rules that survive a context reset, a Discord identity that wakes only it, a ChatGPT mirror that moves with every crew switch, and the records it keeps.

**Done means:** PM Claude can be named on Discord and wakes alone; its rules and notebook load on every start and compaction; it can wake another session directly and that was proved once; its records live in the repo; it moves with the crew to ChatGPT and back, proved once with Kyle watching; and nothing any other session loads or does has changed except where a list gains one entry.

---

## 1. Objectives and how each is verified

**OBJ-1 Identity.**
(a) A `PM Claude` entry in `.claude/cc-session-roster.json`, bound to the session Kyle confirms (§3b), named by Kyle 2026-11-04; `PM Codex` under `non_session_participants`, and the shared memory link (`memory\` subfolder only, `CLAUDE.md` §3.1) for the `C--DawnTraderV3-pm` project folder so the loader finds the truth file rather than the mirror. The loader's clone map and `alert-split.mjs`'s map both gain the PM folder. (b) `load-own-memory.mjs` maps `C:\DawnTraderV3-pm` to `MEMORY_PM.md` **and** injects `1-system-manual/PM_CLAUDE_RULES.md`, on startup, resume and compaction. (c) `MEMORY_PM.md` exists, mirrored to `.claude/memory/`, with a CURRENT POSITION block in the `STEP: N of 11` form.
*Verify:* a fresh session started on `C:\DawnTraderV3-pm` shows both injections in its start-up context; a forced compaction shows them again; a start on each of the other four clones injects exactly what it injected before (byte-compared against a capture taken before the change); an unmapped folder still injects nothing (fail-open control).

**OBJ-2 Discord.**
(a) `PM Claude` added to the wake filter's name registry (`NAMES`, `ALIAS_NAME`) under one alias. (b) PM Claude arms its own watcher with the shared `MEMORY.md` 4.5 command and its own alias. (c) It posts with `--sender "PM Claude"` through `cc-send`.
*Verify, four live probes, each recorded with its inbox id:* a Kyle message naming only "PM Claude" wakes PM Claude and no other session; a message naming only another session does not wake PM Claude; PM Claude's own post does not wake PM Claude (self-wake control); a PM Claude post starting "Langston" gets a Langston reply led with "PM Claude". How Coltrane is addressed is recorded in the PM rules file.

**OBJ-3 Rules, notebook, skills, records and pruning.**
(a) `PM_CLAUDE_RULES.md` adopted (refined with Kyle). (b) **Size limits at the ref** (`git show <ref>:<path> | wc -c`): rules ≤ 8,192 B, notebook ≤ 10,240 B, the two together ≤ 18,432 B. (c) Seven skills under `.claude/skills/`: `pm-crew-check`, `pm-nudge`, `pm-intent`, `pm-slotting`, `pm-status-report`, `pm-memory-prune`, `pm-codex-switch`, each description leading with what it is ONLY for, saying what it is NOT for, and holding no colon-space. (d) `1-system-manual/pm/` with an intent register, a session log, a stall-and-drift log, an archive folder and an index. (e) A daily scheduled pruning pass (desktop scheduled task running `pm-memory-prune`): past ~8 KB, closed items move whole, dated, into `pm/archive/memory/<YYYY-MM>.md` with a one-line pointer left behind; nothing deleted.
*Verify:* sizes read at the pushed ref; the skill listing (not the files) shows all seven descriptions; one pruning run on a seeded oversize copy moves the seeded closed item whole and leaves its pointer (positive control), and a run under the threshold moves nothing.

**OBJ-4 The ChatGPT mirror, PM Codex.**
(a) `PM Codex` in `AGENTS.md`, mapped to `C:\DawnTraderV3-pm`, resuming from the CURRENT POSITION block and reading the same rules file and records. (b) Canonical actors `pm-claude` and `pm-codex` in `ALERT_ACTORS` — **alert actors only: not deploy actors, not exception confirmers** — with every derived reader and pinned test updated (§2 lists them). (c) PM in the Helsinki `crew-switch` session list at the same index in both crews, so one switch line moves it and its handover receipt is chased. (d) The nightly session backup, the transcript-bloat check and the instructions-loaded map cover this session's folder **and Infra Claude's** (§3a); the Codex side's equivalent covers PM Codex.
*Verify:* an ack with `--by pm-claude` is accepted and one with `--by pm` is refused (the allowlist's negative control); `dt-deploy --by pm-claude` is **refused** while `--by cc-a` still passes (the installed `dt-deploy` matches the blob, #1004); one switch to PM Codex and back with Kyle watching, receipts recorded; the next nightly backup lists this session's folder.

**OBJ-5 Rhythm.** Kyle and PM Claude agree how often PM Claude checks the crew; the agreed check runs as a scheduled task reading the work record, plans and notebooks first.
*Verify:* the decision is recorded with date and source; two consecutive scheduled runs appear in the session log.

**OBJ-6 The plan and the boards know PM Claude.**
(a) The governance checker and status board accept `PM Claude` as an owner and as a `waiting on` party (`WAITING_WORDS` in `scripts/governance-checker/config.mjs`). (b) The pre-sprint table carries the `B-PM-CLAUDE` line. (c) The delivery board's `Owner` field gains a `PM Claude` option **by the protocol's options-list procedure** (§5.x: snapshot every card, apply, re-set from the snapshot with freshly fetched ids, read back the full histogram through the API, not `item-list`).
*Verify:* status-board and checker tests green, including a new case where a PM Claude line renders; the board histogram before and after is identical except the new option; this card shows `Owner = PM Claude`.

**OBJ-7 Waking proof.** One short, harmless message to one session through the desktop app's session-messaging tool, recorded with the time, the target and the session's reply.
*Verify:* the target session took a turn in response (its last-active time moved and its reply exists).

**OBJ-8 Governance.** The documents the declared class requires (`workflow-10-governance`), plus a note in `BUILD_METHOD_PLAYBOOK.md` describing the PM role, the System Impact Map entries for any component whose consumers change, and `CLAUDE.md` §6.9's session table gaining PM Claude (a one-line pointer, no new rule text).

---

## 2. Architectural read (1.a), at `3be1433ce`

**System Manual: no entry for any component below** (searched: `cc-session-roster`, `load-own-memory`, `CLONE_TO`, `cc-wake-filter`, `ALERT_ACTORS`, `AGENTS.md`, `crew-switch`, `nightly-backup`, `WAITING_WORDS`, `status board`, `discord-langston-bridge`; positive control: `Coltrane` returns 1 line). That fits its scope, which is trading architecture and maths. **This batch is SIM-scope, not System-Manual-scope.**

| component | System Impact Map | change point (at the ref) | lists that must move with it |
|---|---|---|---|
| session roster | one line, SIM:948 (in the `B-ALERT-ACTOR-ALLOWLIST` update); no section of its own | `.claude/cc-session-roster.json` `roster[]`; PM Codex under `non_session_participants` per the file's own rule | none in code (cited only) |
| per-session loader | "Session-Instruction Loading Estate", SIM:1058; SIM:1080 *"must `exit(0)` on an unmapped folder"* | `.claude/hooks/load-own-memory.mjs:35-43` `CLONE_TO_SESSION` (✔ re-read); 7,000 B chunks, 5 registrations in `.claude/settings.local.json:193-209` (✔ re-read) ⇒ ~35 KB ceiling, PM needs ~18 KB | `alert-split.mjs:19-24` `CLONE_TO_ALIAS` (✔ re-read, 4 entries); `log-instructions-loaded.mjs:39-43` (3 entries, **Infra already missing** — NOT RE-READ) |
| wake filter | "Discord Comms Fabric", SIM:2955; SIM:3842 *"STILL A HAND-INSTALLED COPY … each running watcher holds the code it armed with"* | canonical `comms-infra/laptop/cc-wake-filter.py` `NAMES` :45-55, `ALIAS_NAME` :56-57 (✔ re-read on the installed copy); installed by hand to `~/.claude/`, sha256-verified | heartbeat `control_state.py:28` `ALIASES`; `crew-status.py:82` (page off since 08-26); `alert_lane.py:25` `OWNERS` (NOT RE-READ) |
| alert actors | SIM:948; SIM:3791 (*dt-deploy's table is DERIVED from `ALERT_ACTORS` where `tag !== 'machine'`*); SIM:3970 | `server/services/system-alerts.ts:224-251` | pinned: `system-alerts-actor-allowlist.test.ts:58` (✔ re-read), `dt-deploy-actor-parity.test.ts:94-96` (✔ re-read; its comment: *"the question is whether the new actor DEPLOYS"*); hand table `scripts/dt-deploy.sh:117-149`; `config.mjs:379` `EXCEPTION_CONFIRMERS` (✔ re-read) |
| Codex mirror + crew switch | SIM:3972 (`AGENTS.md`), SIM:3974 (`crew-switch`) | `AGENTS.md` §1/§2.3/§3; `comms-infra/crew-switch/crew-switch.py` `CREWS` (✔ re-read): `COUNTERPART` zips the two lists **by position**, so PM Claude and PM Codex go in at the same index | its 41-test suite; installed copy on Helsinki, hash-verified |
| nightly conversation backup | **none** (and the trim runbook names no nightly script) | **outside the repo:** `~/.claude/session-fix/nightly-backup.ps1:12` (✔ re-read) — a hard-coded folder list | `transcript-bloat-check/SKILL.md:11-13` (3 folders) |
| governance checker + status board | **none** (`status board`, `WAITING_WORDS`: 0 lines) | `config.mjs:236` `WAITING_WORDS` (✔ re-read); `census.mjs:82-91` `SESSION_RE` + `sessionOf()` (✔ re-read; a PM owner cell gets `session: null`); `StatusBoardPage.tsx:39-42` `SESSIONS` | a push is the checker's deploy |
| Langston's bridge | SIM:3016 — *"a CC post must START with 'Langston'"* | `discord-langston-bridge.py:1126-1127, :1204`: **any** CC-webhook post that starts "Langston" engages him, whatever its `--sender`; his reply leads with the webhook display name (NOT RE-READ). `WHO_NAME` :734 knows only CC-A/CC-B | — |

**Coltrane:** not in the roster; `AGENTS.md` §1 says he wakes on a post that STARTS with "Coltrane". The repo holds two bridges with different rules (`coltrane-bridge.py` wakes on `coltrane|codex` ANYWHERE; `coltrane-bot.py` anchors at the start). **Which one is live is unconfirmed** — checked on the box at Step 2, because if it is the anywhere-form, a post merely naming "PM Codex" wakes Coltrane.

## 3. Provenance read (1.b)

**Corpora searched:** `BATCH_CATALOG.md`, `RUNNING_ISSUES.md`, `Batch Completion/`, by file and symbol name; `git log -S "<symbol>" --reverse` unpathed, introducing commits read. Quotes below are verbatim from those commits, gathered by a fresh-context read and **NOT RE-READ by me** except where marked.

- **Roster — TIER 1.** `d89166ade` (2026-06-12): *"Session names hard-bound to session IDs: .claude/cc-session-roster.json registry (Kyle directive 2026-06-12) — name=one session_id forever, no role inference, unnamed sessions ask Kyle"*. **Disposition (1): still relevant and correct.** PM Claude is not inferring a name: Kyle named it.
- **Per-session loader — TIER 1.** `4610466c8` (2026-07-25, B-MEMORY-AUTOLOAD): *"identifies the session by its clone folder … Fail-open by construction: unmapped folder or missing file -> inject nothing, exit 0."* **Disposition (2): relevant, needs updating** — it loads exactly ONE file per session, and PM needs two (its rules and its notebook). Step 2 chooses between a second file in this hook and a separate PM-gated hook; both stay under the chunk ceiling and keep the fail-open contract.
- **Wake filter — TIER 1.** Re-homed to `comms-infra/laptop/` by `b279dfe79` (2026-08-07): *"the repo's only copy of the live wake filter … was 3 weeks stale — it predates ANALYST Claude, so a restore from it would have silently broken CC-C routing."* Original authorship predates the move and was not traced. **Disposition (1).** The registry was built to grow by one line per session (its CC-INFRA comment: *"onboarding him required no change here at all"*). ⚠️ **No bare `pm` pattern** — it would match "2 pm" and "pm2".
- **Alert actors — TIER 1.** `dbcca4a9f` (2026-09-03): *"ALERT_ACTORS, nine entries, each tagged roster | machine | human … Roster = the four sessions in .claude/cc-session-roster.json"*; Codex extension `bac793f92` (2026-10-13): *"Both gates (dt-deploy --by and the alert ack/resolve --by) are exact-match against ALERT_ACTORS, so a Codex session was either refused or would have acted under the Claude name it stands in for"*. **Disposition (2).** ⛔ **The one design point Step 2 must settle: PM Claude writes no app code, so `pm-claude` and `pm-codex` must be alert actors but NOT deploy actors** — today every non-machine actor can deploy, so a plain `roster` tag would hand PM a deploy right it should not have. Not exception confirmers either (PM is not a reviewer).
- **`AGENTS.md` + crew switch — TIER 1.** `ae9b039a2` (2026-10-13): *"Kyle directed a Codex crew to stand in for the four Claude sessions when his weekly Claude allowance runs out … This file maps folder -> session"*; `33fed96c4`: *"crew-switch (Kyle's one-message trigger with a confirmation checklist)"*. A Codex mirror is not a copy: it **shares its Claude counterpart's folder and notebook**, and turning one on turns the other off. **Disposition (1).**
- **Nightly backup — TIER 1.** No introducing commit (the script is outside the repo); the playbook (`cc0eef653`, `BUILD_METHOD_PLAYBOOK.md:132`): *"A nightly job copies them to cloud storage as one overwriting file"*. **INFERRED-FROM-CODE.** **Disposition (2).**
- **Status board + checker — TIER 1.** RUNNING_ISSUES `#1227`: *"KYLE HAS NO PAGE THAT SHOWS THE AGREED PLAN, WHO HOLDS EACH ITEM AND WHERE IT HAS GOT TO"*; `WAITING_WORDS` from `ebeb0bf32` (B-STATUS-BOARD Step-3). **Disposition (2)** — it must name a fifth owner. OLD Claude owns B-STATUS-BOARD, still at Step 7; the PM lines are additive and are told to OLD Claude before the edit.
- **Langston's bridge — TIER 2.** `dfa74f460` (2026-06-20): *"Bridge engages a CC post only if it begins with 'Langston'"*. Read, not changed.

## 3a. 🟨 Found during the read — Infra Claude is missing from three of the same lists
The nightly conversation backup (`nightly-backup.ps1:12`, ✔ re-read: old, new, analyst and the shared memory folder — **no infra folder**), the instructions-loaded log map, and the transcript-bloat check all omit Infra Claude, who joined 2026-08-26. **So Infra Claude's conversations have not been in the nightly backup.**
DISPOSITION: folded into this batch — OBJ-4(d) adds both the PM and the Infra folder to each of those three lists, since the batch edits those exact lines; Infra Claude is told before the edit.

## 3b. 🟨 Found during the read — this session's own conversation sits in OLD Claude's folder
This PM session was opened on `C:\DawnTraderV3-old`, so its transcript file is in OLD Claude's conversation folder — the commingling `CLAUDE.md` §3.1 warns against — and on a restart the loader would hand it OLD Claude's notebook. It has been moved to `C:\DawnTraderV3-pm`, but its transcript stays where it started.
DISPOSITION: decision required — no work, on Kyle's answer: bind the roster entry to a fresh session opened on `C:\DawnTraderV3-pm` (recommended; it resumes from `MEMORY_PM.md`), or to this one. OBJ-1(a) waits on it.

---

## 4. Out of scope
- Reviewing anything. PM Claude never takes part in a scope, audit, diff review or completion report of another session's batch.
- Any change to trading code, the pipeline, or alert behaviour beyond the two new actor names.
- Retiring or renaming any existing session, alias or actor.

## 5. Risks
- **Every session loads the files this batch edits.** A broken loader or filter silences a session's notebook or its wakes. Mitigation: the byte-compare control in OBJ-1 and the four probes in OBJ-2; the filter is a running process, so each session runs its old copy until it re-arms (shared `MEMORY.md`: a running watcher holds the code it armed with).
- **The board's options-list change can clear the Owner field on every card** (protocol §5.x). Mitigation: the snapshot procedure, read back through the API.
- **`dt-deploy` does not install itself** (#1004). If its actor table changes, it is installed by hand and its hash checked.

## 6. Issue number
`RUNNING_ISSUES.md` takes the next number after a pull; minted in the Step-1 commit only if Langston wants one for a crew-tooling batch.
