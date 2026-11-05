# B-PM-CLAUDE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r3, 2026-11-04; Step 2 PROCEED 20:51:50Z)

change-class: non_architecture

**Owner:** PM Claude (session `994e6488-db2e-49a0-8e00-4d3635208c2d`, clone `C:\DawnTraderV3-pm`). **Scope:** `B_PM_CLAUDE_SCOPE.md` r2 at `f6227fd49` (Langston PROCEED with C1–C6, 2026-11-04T19:09:10Z). **Audit ref:** every `path:line` below is read at `origin/migration/aws-supabase` = `f6227fd49` unless marked. **Governance confirmer:** Langston (Kyle alternate) — scope §6, C5.

---

## 0. PREVIOUSLY STATED vs NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 0.1 | Scope r1 OBJ-4 verify: "`dt-deploy --by pm-claude` is refused" | dropped as evidence; the parity test's positive assertion replaces it | Langston C1: passes before any change, discriminates nothing |
| 0.2 | Scope §2: dt-deploy's actor table "is DERIVED from `ALERT_ACTORS`" (citing SIM:3791) | the bash table at `scripts/dt-deploy.sh:117-149` is hand-maintained; only `dt-deploy-actor-parity.test.ts:79` ties it to `ALERT_ACTORS` | Langston Q1, re-read here (A5) |
| 0.3 | Scope §2: name registries to change = 3 (wake filter, `SESSION_RE`, `WAITING_WORDS`) | **14 registries gain PM, 7 hand lists deliberately keep PM out, the rest are dormant, cosmetic or single-name** (§3) | C4: enumerated, not trusted |
| 0.4 | Scope OBJ-1(a): "the shared memory link for the `C--DawnTraderV3-pm` project folder" (to be created) | that folder already holds a **real, empty `memory` directory** made by the app at 20:08Z; the link must REPLACE it | A2, measured `dir` 2026-11-04 |
| 0.6 | Scope OBJ-4(d): "the Codex side's equivalent covers PM Codex" | there is no Codex-side conversation backup for any of the five Codex mirrors; nothing to extend | A7 — flagged for Langston |
| 0.5 | Scope §2: Coltrane's live bridge "unconfirmed" | **`coltrane-bot.service` is live** (`/usr/local/bin/coltrane-bot.py`, sha256 `a5a2f209…` = the blob at the ref) | A8 |

---

## 1. Sources read (the six)

| # | source | read? | what |
|---|---|---|---|
| 1 | code at the ref | ✅ | every file in §2 and §3, by `git show <ref>:<path>`; installed copies hashed against their blobs where they run outside the repo |
| 2 | runtime | ✅ partial | Helsinki: `systemctl` (Coltrane, crew-switch), installed-file hashes, Langston bridge journal; laptop: the project folders, the installed wake filter, `nightly-backup.ps1`. **No app logs or database: this batch touches no trading path and no table.** |
| 3 | System Impact Map | ✅ | Session-Instruction Loading Estate (SIM:1058), Session Task Lists (:1098), Sprint plan as checker artefact (:1125ff), Discord Comms Fabric (:2955), Hook Layer (:3022), B-CODEX-FAILOVER (:3968), alert actors (:948, :3791) |
| 4 | System Manual | ✅ (searched) | no entry for any component here, positive control `Coltrane` → 1 line (scope §2). SIM-scope batch. |
| 5 | ledger | ✅ | `RUNNING_ISSUES`, `BATCH_CATALOG`, plan, by symbol: `verify_caller_census`, `WHO_NAME`, `langston-promote-patterns` — **no entries**; `B-CREW-ACCESS-HARDEN` row found (plan §0a Infra line 7, PARKED at Step 9) |
| 6 | `bridge/canonical/` | not applicable | every component here post-dates the 2026-01/02 governance change (oldest: the roster, 2026-06-12). Consulted for none. |

---

## 2. Audit, per component

### A1 — Session roster (`.claude/cc-session-roster.json`)
**Writers:** each session for its own entry, on Kyle's naming. **Readers:** sessions at start (by hand); wake filter, `alert-split.mjs`, crew-status cite it, none parse it (census: `git grep cc-session-roster` → comments and docs only). **Rules at the ref:** one name = one `session_id`; a participant with no session id goes under `non_session_participants`. CC-C's id is in the app's `local_…` space while the others are CLI ids — mixed today; PM uses its CLI id. **Change:** one `roster[]` entry (`PM Claude`, alias `CC-PM`, `session_id 994e6488-…`); `PM Codex` under `non_session_participants`, same shape as the existing `Codex` entry.

### A2 — Per-session loader (`.claude/hooks/load-own-memory.mjs`)
Read whole. `CLONE_TO_SESSION` :35-43 (4 entries); identity from `CLAUDE_PROJECT_DIR` basename; unmapped → `exit(0)` :53; truth file at `dirname(transcript_path)/memory/<file>` :63, mirror fallback :69; per-file missing breadcrumb :78-82; slices at `CHUNK_LIMIT` 7,000 B :29; 5 registrations `settings.local.json:193-209` ⇒ 35,000 B; stale wording :103 ("prune the file to its 24,576 B cap").
**Measured:** `~/.claude/projects/C--DawnTraderV3-pm/memory` is a **real empty directory** (not a junction; created 20:08Z by the app); `C--DawnTraderV3-old/memory` is a junction to `DT-SHARED-MEMORY`. So today the loader would find no truth file, fall back to the in-clone mirror, and the shared `MEMORY.md` does not auto-load for PM at all.
**Design (scope §3 disposition 2):** PM needs TWO files. **Option chosen: extend this hook, not a second hook.** A map entry gains an optional `rules` path (`1-system-manual/PM_CLAUDE_RULES.md`, read from the clone); each file is read and checked SEPARATELY, the missing-file breadcrumb is emitted per file (C6), then the two texts are joined in a fixed order (rules, then notebook) and sliced. Reason against a second hook: a second hook would need its own 5 registrations (or a different chunk count) in the shared `settings.local.json`, which every session loads. Budget: 8,192 + 10,240 B = 18,432 B → 3 slices of 5, headroom 2.
**Other sessions:** their entries carry no `rules` key, so their path is byte-identical; proved by the OBJ-1 byte-compare (P2).

### A3 — `alert-split.mjs` and `log-instructions-loaded.mjs`
`alert-split.mjs:19-24` `CLONE_TO_ALIAS` (4) decides which due alerts a session is shown, keyed by alias, from `<ALIAS>.alert-owners.json` written by that session's wake filter. **PM gains `'DawnTraderV3-pm': 'CC-PM'`.** Consequence, stated: PM is not in `ALERT_OWNERS` (A4), so no alert is ever routed TO PM; PM sees unrouted alerts in full and critical ones as one line, others counted — the right view for a PM that owns no alerts.
`log-instructions-loaded.mjs:39-43` has **3** entries — Infra is already missing (`#1237`'s family). **Gains `-infra` and `-pm`.**

### A4 — Wake filter (`comms-infra/laptop/cc-wake-filter.py`, 1,241 lines; installed copy sha256 = blob, `7c8ed302…`)
Registries: `NAMES` :45-55, `ALIAS_NAME` :56-57, `MY_RE` :146, the other-names suppression regex :153 (built from `NAMES`), `ALERT_OWNERS` :179, `OPEN_RE` :201-203 (built from `NAMES`). Lease `LEASE_V1` :339; owner record `<ALIAS>.alert-owners.json` :675.
**Change:** `NAMES["CC-PM"] = [r"pm[\s_-]*claude", r"claude[\s_-]*pm", r"cc[\s_-]*pm"]`, `ALIAS_NAME["CC-PM"] = "PM Claude"`. No bare `pm` (C4). **`ALERT_OWNERS` unchanged** — PM owns no alerts; a marker `owner=CC-PM` would be named on stderr and not recorded (:791), which is the correct refusal.
**Behaviour change for the other four (C3), stated:** a message naming only "PM Claude" moved from broadcast to suppressed for them, once each re-arms. Each running watcher holds the code it armed with (SIM:3842), so the rollout is the ordered re-arm in P1.
**PM Codex in the filter:** not added. Codex sessions do not run this filter (`AGENTS.md` §3: "Claude has machinery you do not").

### A5 — Alert actors (`server/services/system-alerts.ts:218-252`)
`AlertActorTag = 'roster' | 'codex' | 'machine' | 'human'` :218. **Readers of the tag, census (git grep `ALERT_ACTORS|AlertActorTag|tag ===|tag !==`, tests included):**
- `dt-deploy-actor-parity.test.ts:79` — deploy set = every non-`machine` actor, asserted equal to the literal list at :94-96 and to the bash table's keys at :101-105, and contained in `USAGE` (:134-141) and `DEPLOY_ACTOR_LIST` (:143-155);
- `system-alerts-actor-allowlist.test.ts:46` (tag must be one of the four) and :58 (roster tag = exactly the four sessions);
- `client/src/pages/system-alerts.tsx:35` — the tag union, mirrored by hand, shown as `value (tag)` :171;
- `server/routes.ts:6484` — sends `{value, tag}` to that page;
- `scripts/governance-checker/config.mjs:374-383` `EXCEPTION_CONFIRMERS` — a separate hand list, **no change** (Langston agreed).
**Deliberately NOT changed, hand copies that must stay without PM:** `scripts/dt-deploy.sh:117-149` (deploy), `comms-infra/langston-memory/bin/langston-size-watch:536` `ACTORS` (who may set Langston's size ceiling — Infra's, and PM must not), `comms-infra/codex/coltrane-size-watch:219`, `token-watch/deploy/install_storage.sh:23`.
**Design (Q1, Langston's preference (i)):** a fifth tag **`'advisory'`** — *"acts on alerts, never deploys"* — for `pm-claude` and `pm-codex`. The parity test's derivation at :79 becomes `!['machine','advisory'].includes(a.tag)`, the machine-exclusion loop at :97-98 gains the advisory set, and a NEW test asserts each advisory actor is present in `ALERT_ACTORS` and absent from the bash table and from `DEPLOY_ACTOR_LIST` (C1). The allowlist test's tag list :46 and the client union :35 gain `'advisory'`; :58 unchanged (PM is not `roster`, so it stays exactly four).
**Normalisation table** (`system-alerts.ts:261`): no alias added. `pm` must be REFUSED (scope OBJ-4 verify) — a test asserts it.

### A6 — Codex mirror + crew switch
`AGENTS.md` §1 table :9-13 maps folder → Codex name → actor; §2 step 3 lists each Codex's memory file in `.claude/memory/` (the mirror — Codex reads the mirror, not the shared folder). **Change:** a fifth row `C:\DawnTraderV3-pm` → **PM Codex** (actor `pm-codex`) → PM Claude; §2 step 3 gains `MEMORY_PM.md` plus `1-system-manual/PM_CLAUDE_RULES.md`.
`crew-switch.py:39-41` `CREWS`; `COUNTERPART` :44 zips by POSITION; installed `/usr/local/bin/crew-switch` sha256 `87d63ceb…` = blob. **Change:** `'PM Claude'` and `'PM Codex'` appended as index 4 in both lists; its 41-test suite run; re-installed on Helsinki and hash-checked. ⚠️ `crew-switch` is Infra Claude's / OLD Claude's tool (B-CODEX-FAILOVER, CC-A) — told before the edit.
**Coltrane addressing (A8):** recorded in the PM rules file.

### A7 — Nightly backup, transcript-bloat check (outside the repo)
`~/.claude/session-fix/nightly-backup.ps1:12` `$srcDirs` = old, new, analyst, `DT-SHARED-MEMORY` (✔ re-read 2026-11-04). `~/.claude/scheduled-tasks/transcript-bloat-check/SKILL.md` step 2 lists the same three folders (✔ re-read). **Both gain `C--DawnTraderV3-infra` and `C--DawnTraderV3-pm`** (`#1237`, forward-only, C2). These are not in git; the change is recorded in the completion report with before/after hashes.
**Codex-side equivalent:** Codex sessions share their Claude counterpart's folder; their own conversation store is in the ChatGPT app, which no crew script backs up today (scope §2: none found). **Disposition:** PM Codex inherits whatever the other four Codex mirrors have — none — and this batch does not invent one; the gap is the same for all five and is named in the completion report rather than silently claimed covered. *(Scope OBJ-4(d) said "the Codex side's equivalent covers PM Codex"; there is no equivalent to extend — PREVIOUSLY/NOW 0.6.)*

### A8 — Langston's and Coltrane's bridges (read, not changed)
`discord-langston-bridge.py:1126-1127, :1204` — Langston engages any CC-webhook post starting "Langston", and leads his reply with the post's display name (**NOT RE-READ** in this audit beyond `WHO_NAME`). Live proof this works for PM: his 19:09:10Z reply led "PM Claude —" (inbox).
`WHO_NAME` :734 = `{CC-A, CC-B, Langston, Kyle}` — the self-advance queue's owner display; CC-C, CC-INFRA and PM fall back to the raw value. Finding F2.
Coltrane: `coltrane-bot.py:92` `NAME_RE` (anywhere) is used for **Kyle's** posts, `:97` `NAME_START_RE` (start-anchored) for everyone else's (`:124`). ⇒ **a Kyle message mentioning "PM Codex" anywhere wakes Coltrane** — the same as "OLD Codex" does today; a session post wakes him only if it STARTS with "Coltrane" or "Codex". Pre-existing behaviour, unchanged, recorded.

### A9 — Governance checker + status board
`config.mjs:236` `WAITING_WORDS` (+`'PM Claude'`); `census.mjs:82` `SESSION_RE` (+`|PM Claude`, no optional suffix) and `sessionOf` :84-91 (+`'PM CLAUDE' → 'CC-PM'`), used for owner attribution at :247-275 and the §0/§4 owner columns :477-521; `StatusBoardPage.tsx:39-42` `SESSIONS` (+`{key:'CC-PM', name:'PM Claude'}`). Tests: `census.test.mjs`, `status-board.test.mjs`, `poller.test.mjs` gain a PM case. **The §6 tally is NOT affected:** B-PM-CLAUDE is a §0a line, not a §4 row, and §6 counts §4 rows only (plan :589).
**Ordering constraint:** the §0a `B-PM-CLAUDE` line names owner `PM Claude`; it lands in the SAME commit as the checker change (P5), so no checker run sees an owner it cannot read.

### A10 — Session task lists and the completion report's T1 row
SIM:1098: every completion report carries a T1 row saying the owner's task list was updated, checked by `gov-ledgerrow`. PM has no list. **Plan:** create `1-system-manual/CC_PM_SESSION_TASK_LIST.md` (PM's own queue; the other sessions' lists stay theirs). Alternative (an `na-skip` confirmed by Langston) rejected: PM will own work items from now on.

---

## 3. C4 — every name registry, enumerated

**Method:** `git grep -l -i -E "infra[^a-z]{0,6}claude|cc-infra|DawnTraderV3-infra"` at the ref, non-Markdown → **85 files**; minus archived code, change lists, scope JSON, `scripts/analysis`, `scripts/inventory`, `scripts/batch-verify` and tests → read each matching line. **Positive control:** the search returned all seven registries already known from the scope (wake filter, loader, alert-split, roster, census, config, status board). **Reach limit:** a list that never names Infra (three- or two-session lists) is invisible to this search. **A fresh reader, given the claim alone, found four such lists my search missed** — `dt-push-notice.sh:197`, `discord_common.py:160`, the Langston bridge's `:96`/`:383`/`:563`/`:577`, `scripts/crew.ts:59` — each re-derived at the ref and added below (§7).

| registry | path:line | purpose | disposition |
|---|---|---|---|
| roster | `.claude/cc-session-roster.json` | name ↔ session id | **ADD** (A1) |
| loader map | `.claude/hooks/load-own-memory.mjs:35` | clone → notebook | **ADD** (A2) |
| alert view map | `.claude/hooks/alert-split.mjs:19` | clone → alias | **ADD** (A3) |
| loaded-set log map | `.claude/hooks/log-instructions-loaded.mjs:39` | clone → alias | **ADD** PM + Infra (A3, `#1237`) |
| wake names | `comms-infra/laptop/cc-wake-filter.py:45,:56` | wake routing | **ADD** (A4) |
| alert owners | `cc-wake-filter.py:179`, `comms-infra/discord/alert_lane.py:25` | who alerts route to | **KEEP WITHOUT PM** — PM owns no alerts |
| heartbeat aliases | `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/control_state.py:28` | which watchers the hourly heartbeat checks | **ADD `CC-PM`** — PM arms a watcher, so its death must be reported |
| alert actors | `server/services/system-alerts.ts:224` (+ client :35, tests) | who may ack/resolve | **ADD as `advisory`** (A5) |
| deploy actors | `scripts/dt-deploy.sh:117` | who may deploy | **KEEP WITHOUT PM** (C1 asserts it) |
| exception confirmers | `scripts/governance-checker/config.mjs:379` | who confirms checker exceptions | **KEEP WITHOUT PM** |
| Langston ceiling / other size-watch actors | `langston-size-watch:536`, `coltrane-size-watch:219`, `token-watch/deploy/install_storage.sh:23` | who may change Langston/Coltrane/token-watch settings | **KEEP WITHOUT PM** |
| waiting words | `config.mjs:236` | status board / checker | **ADD** (A9) |
| owner regex | `scripts/governance-checker/census.mjs:82-91` | plan owner attribution | **ADD** (A9) |
| status board sessions | `client/src/pages/status-board/StatusBoardPage.tsx:39` | page display | **ADD** (A9) |
| crew switch | `comms-infra/crew-switch/crew-switch.py:40-41` | Claude↔Codex switch | **ADD** at index 4 (A6) |
| Codex map | `AGENTS.md` §1 | folder → Codex name | **ADD** (A6) |
| Langston-memory screen | `comms-infra/langston-memory/bin/langston-promote-patterns:104` | refuses promoting session names into Langston's memory | **ADD `\bPM Claude\b`, `\bPM Codex\b`** — same purpose; Infra Claude's file, told before; installed by Infra |
| self-advance owner display | `discord-langston-bridge.py:734` `WHO_NAME` | Langston queue display | finding F2 |
| SSH caller census | `comms-infra/laptop/ssh-keyholder/verify_caller_census.py:21-26` `ROOTS` | B-CREW-ACCESS-HARDEN's census of laptop SSH callers | finding F1 |
| push notice | `comms-infra/discord/dt-push-notice.sh:197` `MSG` | who the "review branch moved" notice — and its escalated "rules changed, pull now" variant — is addressed to | **ADD PM and Infra** — finding F4 |
| Langston bridge prompt owner sets, unused name regex | `discord-langston-bridge.py:96` `CC_NAME_RE` (old/new only), `:383`, `:563-565`, `:577` (`<CC-A\|CC-B\|Kyle>`) | the owner choices Langston's alert and queue prompts offer him | **NO CHANGE** — PM owns no alerts or queue items; the CC-C/CC-INFRA staleness is noted under F2, not fixed here |
| avatars | `comms-infra/discord/discord_common.py:160` | optional per-sender icons, OLD/NEW only | **NO CHANGE** — cosmetic and config-gated |
| crew board CLI | `scripts/crew.ts:59` `CREW_SESSION` | free-text identity for the retired coordination board (`CLAUDE.md` 25.a) | **NO CHANGE** — retired |
| crew-status page | `comms-infra/laptop/crew-status.py:82`, `crew-status-audit.py:38` | the crew-status page | **NO CHANGE — dormant** (page off since 2026-08-26, scope §2) |
| prose / senders | `codex-channel-mirror.py:161`, `dt-api`, `dt-unit-failure-alert`, `agent-unit-failure-alert`, `store_watch.py`, `unit_failed.py`, `langston-memory-write`, `langston_memory.py`, `nginx.conf` | messages naming Infra as owner, or Infra's own sender | **NO CHANGE** — they name a specific owner, not the crew |
| folder paths | `crew_context.py:26`, `register-crew-status-task.ps1:36`, `verify-agent-artifacts.py:27`, `install-codex-*.cmd` | Infra's own clone as a script location | **NO CHANGE** |

**Invariant (C4), applied to every ADD row:** long form only (`PM Claude`, `PM Codex`, alias `CC-PM`, actors `pm-claude`/`pm-codex`); no bare `pm`, no optional-suffix alternative. A test per regex registry asserts that "4 PM", "PM ET" and "pm2" do NOT match (wake filter, census).

---

## 4. Findings (§9.4)

**F1 — the SSH caller census does not know the PM clone.** `verify_caller_census.py:21-26` lists the four clones as the roots it inspects; scripts run from `C:\DawnTraderV3-pm` are outside it. B-CREW-ACCESS-HARDEN is PARKED at Step 9 (plan §0a, Infra line 7).
DISPOSITION: added to B-CREW-ACCESS-HARDEN (Infra Claude's) — told to Infra Claude in one post when this audit is dispatched; the census is a bounded count, so adding a root is that batch's decision.

**F2 — Langston's self-advance queue shows only CC-A and CC-B by name** (`WHO_NAME` :734, unchanged since `1bba1087d`, 2026-07-03); CC-C, CC-INFRA and PM show their raw alias.
DISPOSITION: folded into this batch as P8 — one dict line (`CC-C`, `CC-INFRA`, `CC-PM`), installed by Infra Claude with the bridge restart at a quiet moment. Langston may strike it to keep the bridge untouched; then it becomes no work, cosmetic.

**F4 — the push notice names only OLD, NEW and ANALYST Claude** (`dt-push-notice.sh:197`). Under the wake filter's rule (:38-43; a message naming only OTHER sessions is suppressed), Infra Claude's watcher drops it, **including the escalated "rules changed in this push, pull and reload now" variant** that `CLAUDE.md` §7.1 says must reach a session mid-task; PM Claude would drop it too once P1 lands. Derived from the routing rule, **not yet live-tested** — P1's filter tests add the case.
DISPOSITION: folded into this batch as P8b — the one `MSG` line names all five; installed on Helsinki by Infra Claude; owner of the script told before.

**F3 — Infra Claude missing from the nightly backup, the loaded-set log and the bloat check** — already `#1237`, folded (OBJ-4(d)).

---

## 5. Implementation plan — increments, each back-referenced

> **r2 (Langston CHANGES, 2026-11-04T19:42:34Z, graded at `03d28c4bd`: every load-bearing citation held; four plan conditions C-A to C-D plus riders).** Changed in r2: new **P0**, and P1, P2, P3, P6, P8 amended; `#1238` filed. The audit half (§0-§4) is unchanged.

**P0 — the checker rows, BEFORE P1's code commit (C-A, C-B; r3 per Langston 20:17:07Z).** **The batch is re-declared `non_architecture`** (scope header; Langston lowered it, citing `GOVERNANCE_EXCEPTIONS.md:73`: a REQUIRED row cannot take N/A, so the class was wrong). Two rows in `1-system-manual/GOVERNANCE_EXCEPTIONS.md`, each with the confirmer cell written `langston (Discord PROCEED <inbox ts>)` — leading token `langston`, valid under today's legacy loader (`poller.mjs:702`, which only requires a non-`pending` cell) and under the dormant V2 confirmer list (`EXCEPTIONS_V2_ENABLED = false`, `config.mjs:372`). **r2's reasoning here was wrong on mechanism:** `EXCEPTION_CONFIRMERS` is not enforced today, so a `pm-claude` cell WOULD be honoured; PM Claude does not write one by rule, not because the checker stops it. If the next checker run raises `declared:non_architecture heuristic:architecture`, a `class-override` row is added on the same Langston reply.
- `open` — B-PM-CLAUDE open from P1's first code-bearing push. Reason: `DEADLINE_HOURS = 4` (`config.mjs:251`) runs from that push, and the doc set requires the completion report, which cannot exist until close; ten increments across the laptop, Helsinki, a crew switch and the board will not land in four hours. *(No alert so far proves nothing: `B-PRICE-STALENESS-BOUND` sat eight days with no row and drew none.)*
- `na-skip | system_manual` — **chosen over writing Manual content.** Reason: `CLAUDE.md` §9 rule 4 scopes the System Manual to architecture, strategy logic, regime detection, filter design, the signal pipeline, quantitative maths and the canonical meaning of those terms; it names no crew session anywhere (Langston's measurement: only `:8541`, on session refresh). The crew identity and loading fabric is documented in the System Impact Map (Session-Instruction Loading Estate, Discord Comms Fabric, B-CODEX-FAILOVER), which this batch updates at Step 10. Under `non_architecture` the System Manual row is conditional, so the N/A is correctly tiered to Langston alone; precedents `P19-B8.4c` (`GOVERNANCE_EXCEPTIONS.md:95`) and `B-COMMS-IMAGES-2` (`:79`), both `non_architecture`. *(r2 cited `B-TELEGRAM-DECOMM` `:90`, which is a `pre_audit` N/A — the wrong key.)*
**Confirmation:** Langston's PROCEED on this r3 confirms both rows as worded; P0 records them citing that reply's inbox timestamp.


| inc | what | from | files | verify |
|---|---|---|---|---|
| **P1 (first, Q3)** | wake filter: `CC-PM` in `NAMES`/`ALIAS_NAME`; tests for the four routing cases + the "4 PM / PM ET / pm2" negatives **+ the compound-collision negative `"at 3 pm Claude will post"`** (r2 rider: it must NOT read as naming PM, so it still broadcasts to the other four — the one case where adding PM could cost another session a wake; Langston measured 0 of 32,932 inbox bodies would flip today) **+ the F4 escalated-notice case**; install to `~/.claude/`; **ordered re-arm**: PM arms; OLD, NEW, ANALYST, Infra each re-arm (asked by one Discord post naming each; each replies with `sha256sum ~/.claude/cc-wake-filter.py` at arm time); heartbeat `control_state.py` gains `CC-PM` | A4, §3, C3 | `cc-wake-filter.py`, `control_state.py`, `scripts/analysis/test-wake-filter-cuts.py` | 4 live probes (scope OBJ-2), each with inbox id and the filter sha it ran on; 5 sha receipts = blob |
| **P1b** | the hourly heartbeat learns PM: `control_state.py` `ALIASES` + the heartbeat skill's alias lists and post names + its tests, in ONE commit, only after PM's watcher is armed and proven | P1 Step-4 finding (13 of 44 heartbeat tests turned red; a partial install pages Kyle) | `comms-infra/laptop/scheduled-tasks/wake-watcher-heartbeat/{control_state.py,SKILL.md}`, `scripts/analysis/test-heartbeat-control.py` | heartbeat suite green with CC-PM; one live heartbeat run lists PM alive. **`HOME: B-PM-CLAUDE P1b, owner PM Claude, placed in B-PM-CLAUDE after P1, before P2`** (Langston 21:34Z). ⚠️ **Until P1b lands PM is NOT in the heartbeat liveness list, so heartbeat silence is NOT evidence that PM's watcher is alive** (#661 leg 3). |
| **P1c** | alerts can be routed to PM: `ALERT_OWNERS` in the wake filter gains `CC-PM`, and the two other copies of that list move with it, `ALERT_HANDLING_PROTOCOL.md:19` and Langston's own `CLAUDE.md` §10.5 (already stale at `CC-A\|CC-B\|Kyle`) | Langston 21:34Z: today `owner=CC-PM` fails validation (`cc-wake-filter.py:795`), is not recorded, and the marker is stripped (`:1099`), so routing fails; PM will own its own batch's governance alerts | the filter, the protocol, Langston's file (his to edit) | a marker `owner=CC-PM` is recorded and wakes PM (test); Langston confirms his file. **`HOME: B-PM-CLAUDE P1c, owner PM Claude, placed in B-PM-CLAUDE after P1b, before P2`** |
| **P1d** | the enforced slot check (scope OBJ-9, KD-28), **run BEFORE P1c** | section 9 below (its own audit and plan, r4) | see 9.3 | see 9.3. **`HOME: B-PM-CLAUDE P1d, owner PM Claude, placed in B-PM-CLAUDE after P1b, before P1c`** (KD-28) |
| **P2** | identity: roster entry + PM Codex; replace the empty `C--DawnTraderV3-pm\memory` dir with a junction to `DT-SHARED-MEMORY` (after checking it is still empty); loader `rules` key + per-file breadcrumb + :103 wording — **C-D: the breadcrumb for a missing file no longer ends `process.exit(0)` (`:78-83`); it is printed and loading CONTINUES with the other file; `exit(0)` only when NEITHER loaded;** `alert-split` and `log-instructions-loaded` maps (PM + Infra) | A1–A3, C6, `#1237` | roster, 3 hooks | capture each clone's loader output BEFORE, byte-compare AFTER (4 clones identical); unmapped folder → 0 B; PM start shows rules + notebook; **rename-away control, TWO-ARMED (C-D):** rules missing → breadcrumb for rules AND the notebook still injected; notebook missing → breadcrumb for the notebook AND the rules still injected |
| **P3** | actors: `'advisory'` tag, `pm-claude`, `pm-codex`; parity test derivation + positive assertion; allowlist test; client tag union; **the header comment at `system-alerts.ts:212-217` amended — "tagged by what each entry IS" now says `advisory` is a capability (acts on alerts, never deploys), so `pm-codex` sits under `advisory`, not `codex`, and `codex` stays "the Codex crew that deploys"; a new test pins the advisory set to EXACTLY `{pm-claude, pm-codex}`, the way `system-alerts-actor-allowlist.test.ts:58` pins roster to four** | A5, C1 | `system-alerts.ts`, 2 tests, `system-alerts.tsx` | CI 4/4; deploy; `ack --by pm-claude` accepted, `--by pm` refused on staging; `dt-deploy.sh` untouched (diff shows no change) |
| **P4** | Codex: `AGENTS.md` row + §2 step 3; `crew-switch.py` `CREWS` index 4, tests, Helsinki install + hash | A6 | `AGENTS.md`, `crew-switch.py` (+ tests) | 41+ tests green; installed sha = blob; switch to Codex and back with Kyle watching, receipts recorded |
| **P5** | checker + board: `WAITING_WORDS`, `SESSION_RE`/`sessionOf`, `SESSIONS`; tests with a PM line; **in the same commit** the §0a `B-PM-CLAUDE` line (new stage `PM Claude list`, order 1) | A9 | `config.mjs`, `census.mjs`, `StatusBoardPage.tsx`, 3 tests, `SPRINT_TO_LIVE_PLAN.md` | checker tests green; next checker run raises nothing for the line; status page shows it under PM Claude (UI, Claude-in-Chrome) |
| **P6** | PM's own kit: `PM_CLAUDE_RULES.md` adopted (Coltrane addressing added, **including that Kyle's posts wake him on "codex" ANYWHERE — `coltrane-bot.py:92`, `:124` — while `AGENTS.md:15` states only the start-anchored rule; pre-existing — **disposition 1, folded into P4: `AGENTS.md` is edited there anyway, so `:15` gains the sentence that Kyle's posts wake Coltrane on "codex" anywhere**; **C-C: a max-line rule — no line in the rules file or the notebook over 1,500 B**), 7 `pm-*` skills, `1-system-manual/pm/` (intent register, session log, stall log, archive, index), `CC_PM_SESSION_TASK_LIST.md`, the daily prune scheduled task | scope OBJ-3, A10 | new files only | sizes at the ref (≤8,192 / ≤10,240 / ≤18,432 B); **C-C: the REAL packer (`load-own-memory.mjs:90-98`, greedy line-packing at `CHUNK_LIMIT` 7,000) run over the real two files at the ref, asserting `slices ≤` the number of `load-own-memory.mjs` registrations READ from `.claude/settings.local.json` (five today, `:193-209`) — never a literal, so a sixth registration cannot silently under-test; and **every registration must declare the same total** (the second number in `load-own-memory.mjs <index> <total>`), with `slices ≤` that declared total — a count alone would pass six entries still saying 5 (Langston, P0 ruling 20:51:50Z) (a test, not arithmetic: the slice count depends on line lengths, not total bytes), and the longest line of each ≤ 1,500 B;** skill listing shows all 7 descriptions; seeded prune positive + negative control |
| **P7** | off-repo: `nightly-backup.ps1` and the bloat-check skill gain `-infra` and `-pm` | A7, `#1237` | 2 files outside git | before/after hashes in the report; the next nightly zip lists both folders |
| **P8** | `WHO_NAME` (F2, **kept**: one line fixes CC-C, CC-INFRA and PM); `langston-promote-patterns` (+PM); **each edited in the repo-canonical file (`comms-infra/discord/discord-langston-bridge.py`, `comms-infra/langston-memory/bin/langston-promote-patterns`) AND installed by Infra Claude — an install-only change is reverted by the next deploy** | F2, §3 | 2 Helsinki files | installed sha = blob; bridge active after restart |
| **P8b** | `dt-push-notice.sh:197` names all five sessions | F4 | 1 Helsinki file | filter test: an escalated notice naming all five wakes Infra and PM; the next real push notice reaches both (inbox + each watcher's wake) |
| **P9** | the board's `Owner` field gains `PM Claude` by the protocol's options-list procedure | scope OBJ-6(c) | GitHub project | full histogram before/after identical except the new option |
| **P10** | rhythm (OBJ-5) and the waking proof (OBJ-7) | scope | scheduled task; one `SendMessage` | decision recorded; two scheduled runs in the session log; target session replied |

**Codex conversation backup (A7, PREVIOUSLY/NOW 0.6) — disposition 3, per Langston:** filed as `#1238`, owner Infra Claude, beside `#1237`; not built here. Its place in the plan waits on Kyle (nothing is slotted without his agreement).

**UNAUDITED:** none of P0–P10 lacks a finding above. **P10's scheduled-task mechanics** (the desktop app's scheduled tasks running from `C:\DawnTraderV3-pm`) are audited only by SIM's `#700` note (a session in a non-repo folder fires no hooks) — the task will be created with its working folder ON the PM clone, and its first run checked for the hooks firing.

**Rollback:** every repo change is a revert of its increment. The two off-repo files keep a `.pre-b-pm-claude` copy. The wake filter rolls back by re-installing the previous blob and re-arming.

---

## 6. Risks
- **The wake-filter rollout is the riskiest step** — a mistake silences a session's wakes. It goes first (Q3), with sha receipts, while the batch is small enough to roll back.
- **Replacing the `memory` directory:** it must be empty when replaced (checked at the time); a non-empty one is moved aside, never deleted.
- **Shared files edited by other owners** (`crew-switch.py`, `langston-promote-patterns`, the Langston bridge, the backup script): each owner is told before the edit; Helsinki installs are Infra Claude's.

---

## 7. Review record
`REVIEWER: claim-only · "which live code holds a session-name or clone-folder list, beyond a naive Infra search; what other states fit" · HIT: 4 lists missed (push notice, avatars, Langston bridge owner sets + unused regex, crew.ts) · re-derived y (each read at f6227fd49; push notice → F4/P8b, the rest NO CHANGE with reasons in §3)`.
**NOT RE-READ (load-bearing, not routed to a reader):** Langston bridge display-name mechanism (`:1126-1127, :1204`) — relied on only through its observed behaviour (his 19:09Z reply led "PM Claude").

---

## 8. Plain-language summary
The audit checked every place in the system that keeps a list of the crew's names. Fourteen of them need PM Claude added so it can be woken, show up on the status page, and take part in a crew switch; seven deliberately keep it out, so it can never deploy, approve exceptions or change Langston's settings. A second, independent reader found that the "pull now, the rules changed" notice after a push is addressed to only three sessions, so Infra Claude is not woken by it; the plan fixes that line for him and for PM. It also found that the folder the app made for this session holds an empty notebook folder that has to be swapped for the shared one, that there is no backup of the ChatGPT side's conversations for anyone, and two small gaps belonging to other sessions. The plan does the risky part first: teaching the wake system the new name, with every session confirming it loaded the new version.

---

## 9. P1d — THE ENFORCED SLOT CHECK (scope OBJ-9, KD-28): AUDIT AND PLAN (r5, 2026-11-05; r4 sent back by Langston with C1-C4, folded)

### 9.0 PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED** (scope r4 OBJ-9(a)): the gatherer reads at a ref "as `reconcile-decisions.mjs` does". **NOW:** it runs `git fetch --quiet` first and stamps the record `DEGRADED` when the ref read is behind `origin`. **REASON:** Langston C1 — `reconcile-decisions.mjs` has no fetch (`:15`, `:29`), so copying it would rebuild the 11-04 stale-queue miss (`#449` shape).
- **PREVIOUSLY STATED** (scope r4 OBJ-9(b)): the reader runs through the `pm-slotting` skill "already in OBJ-3(c)". **NOW:** that one skill is created in P1d, pulled forward from P6. **REASON:** P6 comes later and the check must exist before any further slotting advice.
- **PREVIOUSLY STATED** (scope r4 OBJ-9(d)): Guard 2 recognises a placement decision by its wording. **NOW:** by an appended `kind` column. **REASON:** Langston Q2 — a wording test on the hard gate re-imports Guard 1's weakness.

### 9.1 The six sources, named
1. **Code at `origin/migration/aws-supabase`:** `scripts/pm/reconcile-decisions.mjs` read in full (75 lines); `scripts/governance-checker/census.mjs:82-100` (`SESSION_RE`, `sessionOf`, `firstSession`) and `:392` (`cellClosed`); `checker.mjs:425` (`mapStatus`), with `planRowsByBatch` `:338` and `presprintRows` `:389` per the Step-1 citations Langston re-read at `caaef7afe`; `.claude/hooks/guard-bare-commit.mjs:178-304` (the block pattern); the `.claude/settings.local.json` hooks block.
2. **Runtime logs and database:** not applicable — nothing on staging changes; the only runtime is hook processes on the laptop.
3. **System Impact Map:** **silent** on `DECISIONS.md`, `reconcile-decisions` and `PM Claude` (0 matching lines each at the ref; control `governance-checker` 15). A governance gap → entries at Step 10 (OBJ-8), written into the relevant section.
4. **System Manual:** out of its scope — no trading architecture, strategy, regime, filter or maths changes.
5. **Ledger:** `B-SLOT-PLACEMENT-CHECK` (`#1009` P2, OLD Claude, after live) is adjacent, not a duplicate (scope OBJ-9(e)); `#449` (stale ref), `#448` (two predicates for one meaning) and `#453` (a silence is not an absence) shape the conditions. No earlier mechanism that checks a queue BEFORE a recommendation was found.
6. **`bridge/canonical/`:** 14 files, 0 hits for "task list" or "slotting" (control: "regime" hits 10) — no coverage, as expected for a role created 2026-11-04.

### 9.2 Audit, per component
- **D1 `reconcile-decisions.mjs`.** Read-only; `git show REF:path`, no fetch; header found by the literal prefix `| D | date |` (`:35`); columns resolved by name (`:37-39`); rows matched by `^\| KD-\d+ \|` (`:41`); exits 0/1/2. **Entry points, repo-wide:** exactly one — run by hand. It is named only in `PM_CLAUDE_RULES.md:15`, `DECISIONS.md:12,:28`, PM's memory and this batch's scope; no script, hook or schedule calls it.
- **D2 checker exports.** `planRowsByBatch`, `presprintRows`, `mapStatus`, `firstSession` and `cellClosed` are exported and pure; P1d imports them read-only (C2: no third open/closed rule). `SESSION_RE` knows the four coding sessions only, which suffices because slot-check owners are coding sessions (PM's own entry lands in P5).
- **D2b `binds` IS FREE TEXT, AND `firstSession` DROPS OWNERS FROM IT (Langston r4 C1, measured over all 28 cells).** `KD-2`'s `NEW, ANALYST, OLD, Infra Claude` resolves to `{CC-C, CC-INFRA}` only (bare `NEW`/`OLD` do not match `census.mjs:82`); `KD-4`'s `all sessions` binds nobody; `KD-18` returns its first owner only; `KD-26` returns its two `(released)` sessions as bound. ⇒ `firstSession` (defined as *first named*, `:93`) is the wrong tool for `binds`; P1d needs its own normalisation table (below), and `binds` becomes a constrained vocabulary for new rows.
- **D3 task lists.** Four schemas (Langston, at the ref): only CC_A's has a numbered order table (`| # | item | status | decision |`); CC_B `| batch | step | waiting on |`; CC_C `| plan row | batch | where it stands (2026-09-30) |`; CC_INFRA `| batch | stalled at | waiting on | note |`. ⇒ C3: CC_A's table is parsed; the others are emitted verbatim under `task-list: UNPARSEABLE (<schema>)`.
- **D4 hook wiring — `.claude/settings.local.json` IS TRACKED IN GIT** (`git ls-files`), so every clone runs every hook it lists. ⇒ both new hooks exit 0 on their first line unless `$CLAUDE_PROJECT_DIR` ends in `DawnTraderV3-pm`. Block pattern: exit 2 with the reason on stderr (`guard-bare-commit.mjs:239-249`); an unparseable payload exits 0 (`:178`); any other non-zero exit is non-blocking, so a broken hook file cannot stop another session's work. Cost to the other four sessions: one short node start per matching tool call.
- **D5 UNVERIFIED — does the desktop app run `PreToolUse` hooks on its own MCP tool `mcp__ccd_turn__wrap_up`?** No hook in the repo targets an MCP tool today (Step-1 survey). Checked first, by a probe, before Guard 1 is built (§9.3 P1d-1).
- **D6 `DECISIONS.md`.** 8 columns, 28 rows. Appending `kind` adds one cell per row; KD-1..KD-28 are backfilled `pre-guard`; from the install onward every new row carries `placement` or `other`.
- **D7 commit path — r4's premise was FALSE (Langston r4 C2).** `guard-bare-commit.mjs:221` treats a bare commit as a hit only when it is not path-limited, not an amend and not attested, and `:252` exits 0 on attestation — so `git commit --amend` and an attested `git commit -m …` both land `DECISIONS.md` without naming it. ⇒ Guard 2's hook keys on the STAGED SET (`git diff --cached --name-only`), for every `git commit` including `--amend`, never on the command-line text.
- **D8 where a cited record lives at check time (Langston r4 C3).** `REF` defaults to `origin/…` (`:15`) and anchors are read at `REF` (`:44`, `:59-60`); a record committed in the same commit as its decision row, or in any unpushed commit, does not exist at `origin` yet. ⇒ the record is resolved index → working tree → ref, in that order, in `--index` mode; at `origin` the ancestor check applies.

### 9.3 Plan — each item back-referenced
| # | what | from | done means |
|---|---|---|---|
| **P1d-1** | Probe: ONE log-only hook file registered against BOTH `mcp__ccd_turn__wrap_up` and a known-firing matcher (`Bash`) in the same run; it logs the tool name and the project-directory discriminator it actually sees (C4) | D5; r4 C4 | the `Bash` line proves the hook runs and reads its directory (the control); the `wrap_up` line shows `tool_name` and `tool_input.ask`. **If only the `Bash` line appears,** the `wrap_up` arm becomes a `Stop` hook that exits 2 when the turn's last message proposes a slot without a record — which still blocks the turn from ending, so the correction happens in the same turn. The `cc-send` arm is a Bash call and stays preventive either way |
| **P1d-2** | `scripts/pm/slot-check.mjs --owner <CC-A or CC-B or CC-C or CC-INFRA> --item "<text>" [--ref]`: fetch first; read plan §4 rows, pre-sprint rows, the owner's task list and `DECISIONS.md` at the ref; owners in `binds` resolved through a named normalisation table (`OLD`, `OLD Claude`, `CC-A` → CC-A; `NEW`, `NEW Claude`, `CC-B` → CC-B; `ANALYST`, `ANALYST Claude`, `CC-C` → CC-C; `Infra`, `Infra Claude`, `CC-INFRA` → CC-INFRA; `PM Claude`, `CC-PM` → CC-PM; `all sessions`, `all four`, `the crew` → all four coding sessions; any session followed by `(released)` → excluded), every owner in the cell, not the first (r4 C1); a `binds` cell the table cannot resolve is printed `UNRESOLVED` in the record, never dropped; write `1-system-manual/pm/slot-checks/<UTC>_<alias>_<slug>.md` with a header (ref sha, `origin` head sha, `FRESH`/`DEGRADED`, owner, item) and sections: open plan rows in plan order; pre-sprint rows; the task list (parsed, or verbatim `UNPARSEABLE`); decisions binding the owner and not DONE, newest first, last 48 h flagged; plan-vs-task-list disagreements; every empty section printed as `EMPTY` | D1, D2, D2b, D3; C1, C2, C3; r4 C1 | tests in P1d-6 |
| **P1d-3** | `.claude/skills/pm-slotting/SKILL.md` (OBJ-3(c)'s skill, pulled forward): PM spawns ONE agent on `model: sonnet` that runs the script, appends per candidate position what it pushes back, ranked on Kyle's priorities (open trades, faulty closes, calibration data, KD-2 data truth first), repeats every `UNPARSEABLE` line, and returns ≤ 200 words; PM commits the record and quotes its path | scope OBJ-9(b), KD-28 | the skill listing shows the description; one real run's agent token count and returned size recorded |
| **P1d-4** | Guard 1, `.claude/hooks/guard-pm-slot.mjs` (PM clone only), on `wrap_up` (`ask` + `recap`) and on Bash `cc-send` with `--sender "PM Claude"`: when the text proposes placement, ownership or order AND names a session, it requires a `FRESH` record for that owner from the last 6 h; a determinate miss → exit 2 with the exact command to run; the hook's own fault → exit 0 plus a line in `~/.claude/pm-slot-guard-misses.log`. **Scoping (r4 C4):** the clone is identified as the four precedent hooks do it, `basename(CLAUDE_PROJECT_DIR)` against a map (`alert-split.mjs:20-23`, `load-own-memory.mjs:36-42`, `log-instructions-loaded.mjs:40-42`, `inject-due-alerts.mjs:125`), not a suffix test; a mapped non-PM clone exits 0 silently; an UNREADABLE or UNMAPPED directory exits 0 AND writes a miss-log line, so a dead gate is visible | D4, D5; Q1; r4 C4 | P1d-6 tests |
| **P1d-5** | Guard 2: `kind` column appended + backfill; `reconcile-decisions.mjs` gains (i) for `kind = placement`: a `slot-check: <path>` citation whose file exists at the ref, is not `DEGRADED`, and whose header sha is an ancestor of the ref (`git merge-base --is-ancestor`), or an explicit `no-slot-check: <reason>`; (ii) an `--index` mode reading the staged blob; (iii) it prints the Guard-1 miss log (the named reader). Hook `.claude/hooks/guard-pm-decisions.mjs` (PM clone only, same scoping as P1d-4) runs on EVERY `git commit`, `--amend` and attested commits included, and acts when the STAGED SET (`git diff --cached --name-only`) contains `DECISIONS.md` (r4 C2); it runs reconcile in `--index` mode, where a cited record resolves index → working tree → ref (r4 C3), and blocks only on placement-citation failures (anchor mismatches warn, since anchors are read at `REF`, `:44`, `:59-60`). **Method item 5 gains the sequence:** the slot-check record is committed in the same commit as its decision row. **`binds` vocabulary for new rows:** session aliases separated by `;`, `(released)` allowed, `all four` allowed | D1, D6, D7, D8; Q2; r4 C1-C3 | P1d-6 tests |
| **P1d-6** | `scripts/pm/test-slot-check.mjs`: the replay of the 11-04 miss at a ref after KD-13/14 lists them for CC-A, and at a ref before them does not (discriminates); **named `binds` fixtures that break `firstSession`: `KD-2` resolves to all four, `KD-4` to all four, `KD-18` to CC-C and CC-A, `KD-26` to CC-A only** (r4 record item a); an owner with nothing open gets an explicit `EMPTY` record, built from a FIXTURE plan and ledger since every live owner has open rows (r4 record item b); a ref behind `origin` is stamped `DEGRADED`; CC_B's list is emitted verbatim `UNPARSEABLE`. Guard tests on crafted payloads: refuse (slotting text, no record), allow (with a record), allow (non-slotting text), allow (hook fault). Guard 2: an uncited placement row fails, a cited one passes, an `other` row passes, a record citing a non-ancestor sha fails, **an `--amend` and an attested commit carrying an uncited placement row are both refused, and a record committed in the same commit resolves from the index** (r4 C2, C3). Scoping: the probe-style control proves the hook reads its directory, and an unmapped directory writes a miss-log line | scope Verify; Langston's record items | all green, output kept in the change list |
| **P1d-7** | `PM_CLAUDE_RULES.md`'s slot rule points at the skill; PM memory updated | KD-28 | sizes under cap at the ref |

**Status convention (r4 record item c):** `KD-28` reads `IN PROGRESS`, outside the vocabulary at `DECISIONS.md:17`; the slot check filters on "not DONE", never on a whitelist, and method item 5 states that convention beside the vocabulary.

### 9.4 Risks
- **R1 (D5):** the app may not run hooks on its own tools → P1d-1 settles it first.
- **R2:** Guard 1 recognises slotting by wording (stated in scope); Guard 2 is the hard gate.
- **R3:** the hooks live in a tracked settings file and so run in every clone → each exits on its first line outside the PM clone, and a fault exit is non-blocking (D4).
- **R4:** the reader agent's analysis is judgement → it is written into the committed record, so Langston and Kyle see what the recommendation rested on.

### 9.5 Findings (§9.4)
- **The System Impact Map is silent on the decision ledger and its reconciler (§9.1 source 3).** DISPOSITION: folded into this batch — entries at Step 10 under OBJ-8.

### 9.6 Review record
- **r4 (`54d031a4c`):** Langston **CHANGES**, Discord `1567710773030158337` — C1 `binds` owner resolution (blocker), C2 Guard 2 trigger bypassable through amend and attestation (blocker), C3 record-existence deadlock on first use (blocker), C4 probe and scoping controls; record items a-d. D4 answered: a shared tracked settings file is fine, precedented four times. **All folded in r5.**
