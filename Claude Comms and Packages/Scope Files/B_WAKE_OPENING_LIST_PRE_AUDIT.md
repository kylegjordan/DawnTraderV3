# B-WAKE-OPENING-LIST — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture · **Scope:** `B_WAKE_OPENING_LIST_SCOPE.md` r4a (`c8e95658e`; Langston APPROVED r4 with three text amendments, all landed) · **Issue:** `#1241` · **Owner:** Infra Claude · **Read at:** `origin/migration/aws-supabase` `88c35cab9` (2026-11-05).

## 0. Previously stated vs now

- **PREVIOUSLY (scope OBJ-6):** Langston's rules file states the class at repo `LANGSTON_CLAUDE.md:122/:171/:300` and at live `/home/langston/CLAUDE.md:160/:209/:340`. **NOW:** one set of lines, **`:125`, `:174`, `:303`**, in both. **REASON:** `B-LANGSTON-CLAUDEMD-RESIDUAL` installed the repo copy as his live file at 08:21Z today (blob `b9fcbc96`, sha256 `ea4fcdab…`), so live and repo are the same bytes and the trim moved the lines. His memory part (`memory-parts/00-legacy.md:34` at the scope's read) is re-read at Step 3, because his memory changes daily.
- **PREVIOUSLY (scope OBJ-1):** "two copies" of `address_list.py`, one for "the two bridges". **NOW:** Coltrane's bot does not run from `/opt/discord-bridges/`; it runs `/usr/local/bin/coltrane-bot.py`. So it loads the Helsinki copy **by absolute path** (A3), still two copies in all. **REASON:** A3.

## 1. AUDIT

### 1.1 Sources read (the six)
1. **Code, at the ref:** `comms-infra/discord/discord-langston-bridge.py` (1,312 lines): `:81` `ADDRESS_RE`, `:85` `ADDRESS_START_RE`, `:96` `CC_NAME_RE`, `:1122-1127` author classification, `:1196-1206` the gate, `:541` voice. `comms-infra/codex/coltrane-bot.py` (532 lines): `:92-100` the regexes, `:116-129` `engage_reason`, `:335-345` its reply prompt. `comms-infra/laptop/cc-wake-filter.py` (1,254 lines): `:26` imports, `:44-75` `ALIAS` and `NAMES`, `:159` `MY_RE`, `:163-165` `CREW_ALL_RE` and `OTHERS_RE`, `:209-215` `OPEN_RE`, `:217-224` `addressed_to_me`, `:1064-1073` the Kyle and voice branches, `:1201-1218` the crew branch, `:1219-1240` the no-header guard. `comms-infra/discord/deploy.sh` (the bridges group manifest, `:63-79`). `comms-infra/systemd/coltrane-bot.service` and `coltrane-bot.service.d/onfailure.conf`.
2. **Runtime, measured 2026-11-05:**
   - Every live bridges-group file equals its blob at the branch head (sha256 prefix, live vs `git show`): `discord-cc-bridge.py` `a0dd2005` · `discord-langston-bridge.py` `6a879728` · `discord_common.py` `2abbf362` · `gateway_watchdog.py` `e8e2a6bd` · `langston_queue.py` `55e0b1b5` · `alert_lane.py` `37c0e414` · `crew-status-post.py` `05d62e50` · `bridge-failed-notify.sh` `cc2a72a6`. Coltrane's `/usr/local/bin/coltrane-bot.py` `a5a2f209` = its blob. The laptop filter `~/.claude/cc-wake-filter.py` = the repo file (byte compare, CR stripped). **So today nothing uninstalled is waiting on any file this batch installs.**
   - Coltrane's unit, re-measured: `Restart=always`, `RestartUSec=15s`, `StartLimitIntervalUSec=10s`, `StartLimitBurst=5`, `OnFailure=` from the drop-in (live drop-in sha `1711837b`).
   - The inbox: see A6 (Coltrane → Langston).
3. **SYSTEM_IMPACT_MAP, "Discord Comms Fabric" (`:2969`):** it records the address gate (*"Change the address-Langston gate → `ADDRESS_START_RE`"*), the display-name routing and the three-way agreement rule for a session name (*"update the webhook username AND the wake-filter `NAMES` … AND the Langston bridge"*). **It is silent on Coltrane's gate, and its bridge row still names model `claude-opus-4-8[1m]`** (stale; Langston runs Opus 5 since 2026-07-27). Both are corrected in the same OBJ-6 edit (§9.4 disposition 1 — I am editing that entry anyway, and a live value in it is the "name where to read it" class: the corrected row will say where to read the model, not what it is).
4. **SYSTEM_MANUAL:** silent, correctly (comms, not trading).
5. **The ledger:** `#1241` (this), `#1040` (B-WAKE-LEAD-NAME: `OPEN_RE`), `#995` (wake noise — this is a routing change Kyle ordered, not a new behaviour rule), `#1201` (alert markers), `#1243` (stale roster in `CLAUDE.md` §6.9 — the scope's out-of-scope item, already filed), `#1198`/`#1206` (Coltrane's stop path).
6. **Provenance (git, not path-limited), subjects verbatim:**
   - `ADDRESS_START_RE`: `dfa74f460` (2026-06-20) *"B-DISCORD: CC-addresses-Langston convention — name at START of post (Kyle 2026-06-19). Bridge engages a CC post only if it begins with 'Langston'; mid-sentence mention no longer…"*
   - `NAME_START_RE`: `59926cb62` (2026-09-11) *"Coltrane now wakes only when addressed: Kyle may name it anywhere, everyone else must lead with its name - and its instructions no longer claim it cannot read Langston's files"*
   - the crew branch's name-or-nothing rule: `95424ba94` (2026-09-04) *"B-WAKE-QUIET Step 4 r2: Langston two blockers and four findings, all applied"*
   - `CC_NAME_RE`: `1ed04739e` (2026-06-19) *"B-DISCORD: Langston crossed-wire fix + transcript dedup tooling + Discord-reply note"*
   - `bridge/canonical/`: no coverage (the Discord fabric postdates the governance change).

### 1.2 Findings
- **A1 — census of the wake decision (tests excluded).** Exactly three code sites decide whether a session post wakes someone: Langston's bridge `:1204`, Coltrane's `engage_reason` `:124-125`, the session filter's crew branch `:1216`. The wake file (`:1025`) and Kyle's branches (`:1066`, `:1072`) keep `addressed_to_me` (scope: unchanged). `OPEN_RE` (`:215`) is Langston's reply rule and stays. No fourth site (repo-wide grep for `ADDRESS_START_RE|NAME_START_RE|MY_RE.search|addressed_to_me|OPEN_RE`, tests and change lists excluded).
- **A2 — `CC_NAME_RE` is dead.** Repo-wide, its only code occurrence is its own definition at `:96` (the other hits are this batch's scope and `B_PM_CLAUDE_PRE_AUDIT.md:116`, which notes it unused). It writes no state, so the deletion-time census is empty: no reader to strand. Disposition (5): delete, `DELETED_COMPONENTS_LOG` row, archived copy.
- **A3 — where each consumer finds the module.** The two bridges run from `/opt/discord-bridges/` and `deploy.sh` installs a manifest of files there (`:63-79`); `address_list.py` joins the `bridges` group. Coltrane's bot is `/usr/local/bin/coltrane-bot.py`, so a plain import would not find it; it loads `/opt/discord-bridges/address_list.py` **by absolute path**, inside the same guard as the bridges (refuse to start on absent, broken or wrong-sha), so there is still exactly ONE Helsinki copy. The laptop copy installs beside `~/.claude/cc-wake-filter.py`, one file shared by all five sessions' watchers.
- **A4 — `deploy.sh`'s bridges group installs the WHOLE group from one sha** and restarts both bridges. Measured today: every live file in the group equals the head (§1.1 (2)), so only this batch's changes ride. **This is re-measured at install time; any file whose live copy differs from its blob at the PREVIOUS reviewed install stops the install** — another session's uninstalled change is theirs to install, never mine (the `dt-deploy` lesson, my memory).
- **A5 — the filter's parse must see the same text the old rule saw.** The crew branch tests `full = _defang(body_raw)` (`:1063`). The parser is fed that same string, so a marker or a defanged mention behaves identically. The Kyle branch is untouched (Q1 default (b)).
- **A6 — FINDING, outside scope: Coltrane cannot wake Langston at all, by any wording.** The bridge accepts a non-Kyle post only from the CC bot or the shared CC webhook (`:1126-1127`); Coltrane posts as its own bot (`coltrane-bot.py:1-12`), so its post reaches `else: return` at `:1206` whatever it says. **Measured:** in the whole inbox, 1 Coltrane post has ever opened with "Langston" (2026-10-16T15:30:14Z) and Langston answered 0 of them (control: 7,058 Langston replies carry a `reply_to`, so the instrument can match one). Yet Coltrane's own prompt tells it *"Answering Langston? His name must be the FIRST WORD"* (`:341`) and its docstring calls iterating with Langston *"the entire point of putting them in one channel"*. **Bug taxonomy: outcome (2)** — working as built, the decision missing: whether Coltrane may invoke Langston (a paid invoke on Kyle's subscription; Kyle's boundary says only he requests Coltrane). **DISPOSITION: decision required — no work in this batch; put to Kyle through PM Claude.** This batch does not change who the bridge accepts; it only changes where in an accepted post the name may sit.
- **A7 — Coltrane's reply prompt** (`:340-341`) says Langston's name must be the FIRST WORD. Under the new rule a first word still works, and so does an opening list; the line is corrected to say so (OBJ-6), and — because of A6 — it stays true only once Kyle rules.
- **A8 — the rules sweep, by class, at the ref** (patterns: *anywhere*, *lead(s) with*, *at the START*, *name routing*, *first word*):

| file:line | states | action |
|---|---|---|
| `CLAUDE.md:224` (§6 live mechanics) | a session post must LEAD with "Langston"; Kyle anywhere | change: "open the post with his name — alone or in a list of names" |
| `CLAUDE.md:251` | Kyle names Langston anywhere | read and left (Kyle rule, Q1 (b)) |
| `CLAUDE.md:255`, `:261` (§6.4) | a session name "anywhere" wakes it | change: Kyle anywhere; a session post must name it in its opening list |
| `CLAUDE.md:265` (§6.5) | lead the post with "Langston" | change, as `:224` |
| `CLAUDE.md:317` (§6.9 item 2) | the wake file uses "the same name-routing rules" | change: the wake file is name-anywhere with no-name broadcast, by design (scope §0) |
| shared `MEMORY.md` 4.6 | Langston: name at the START; session reply discipline | change the Langston clause as `:224` |
| `LANGSTON_CLAUDE.md:125`, `:303` | a CC post engages him only when it LEADS with "Langston" | change, via `langston-rules-install` |
| `LANGSTON_CLAUDE.md:174` (§5.3) | a session wakes when its name appears anywhere | change: Kyle anywhere; a session or Langston post, opening list |
| his `memory-parts/00-legacy.md` (line re-read at Step 3) | CC posts must LEAD with "Langston" | change via `langston-memory-write --part … --expect-sha …` |
| `comms-infra/codex/AGENTS.md:64-69` (the Codex stand-ins' table) | Langston first word; sessions "anywhere" | change both columns |
| `coltrane-bot.py:340-341` (its prompt) | Langston's name must be the FIRST WORD | change (A7) |
| `CONDUCT.md`, root `AGENTS.md`, `alert-lane/CLAUDE.md` | no statement of the rule (grep, 0 hits; positive control: the same grep hits `CLAUDE.md:224`) | nothing |

## 2. PLAN — each item points to its finding

| # | item | from |
|---|---|---|
| P1 | `comms-infra/discord/address_list.py`: `MARKUP` (one class), `SEPARATOR`, `opening_addressees(text, registry)` per scope OBJ-1's algorithm; `EXPECTED_SHA256` constant computed from the committed file by a test, not by hand. | scope OBJ-1, A1 |
| P2 | Langston bridge: load `address_list.py` by path inside `try/except Exception` → refuse to start (exit non-zero) on absent, broken or wrong-sha; `:1204` becomes `"LANGSTON" in opening_addressees(content, REGISTRY)`; delete `CC_NAME_RE` (A2). | OBJ-2, A2, A3 |
| P3 | Coltrane bot: the same guarded load from `/opt/discord-bridges/address_list.py`; `engage_reason` non-Kyle branch → `"COLTRANE" in opening_addressees(...)`; Kyle branch, DMs and `CREW_RE` unchanged; its prompt line corrected (A7). | OBJ-3, A3, A7 |
| P4 | `coltrane-bot.service.d/onfailure.conf` gains `StartLimitIntervalSec=5min`; scratch-unit drill per scope OBJ-1 (real `bridge-failed-notify.sh`, `cc-send` stubbed). | OBJ-1/5 (MF-A) |
| P5 | Session filter: guarded load beside itself; latch per cause (drift, absence, missing alias, parser key set) — one WAKE per cause recorded in the state file, then `MY_RE` anywhere; crew branch `:1216` → opening list or `CREW_ALL_RE`. Kyle, voice, wake-file and Langston-reply branches unchanged. | OBJ-1/4, A5 |
| P6 | Tests: the parser cases of scope OBJ-1 (incl. `@`, `<@`, `>` quote, CC-PM clock time inside a list); every session × every `NAMES` form → that session's WAKE line through the filter fed with the `==> file <==` frame, positive control first; latch cases; the month replay before/after, per session (expected 345 lost pairs from 272 posts); bridge and bot gate cases; mutations judged by exit code and named FAIL line (no separator rule, no lookbehind position, no guard). | OBJ-1/2/3/4 |
| P7 | `deploy.sh` manifest gains `address_list.py` (bridges group). Install order: (1) re-measure A4; (2) `deploy.sh --only bridges` with the probe-in-flight restart check for Langston's bridge (scope OBJ-5); (3) laptop: a gated install script copies the filter and module from the reviewed sha, each session re-arms and reads its last 30 inbox lines once; (4) Coltrane in a quiet window under the `pgrep` predicate, the drop-in and the bot together, `daemon-reload`, restart. | OBJ-5, A3, A4 |
| P8 | Live verification per scope OBJ-5 (three posts, WAKE lines read). | OBJ-5 |
| P9 | Governance: the A8 table, line by line; SIM "Discord Comms Fabric" (the one rule, its three sites, the parser, Coltrane's gate, and the model row as a read-site — §1.1 (3)); `COMMS_BRIDGE_RUNBOOK.md`; `DELETED_COMPONENTS_LOG.md` (A2); `#1241`; my task list. | OBJ-6, A2, A8 |
| P10 | A6 to Kyle through PM Claude, as a decision, with the measurement. | A6 |

**`UNAUDITED`:** none.

## 3. Plain-language summary
I read every piece of code that decides who a message wakes. There are exactly three places, and each will use one shared rule: everyone named at the start of a message wakes. Every running copy matches GitHub today, so installing this carries nothing else along with it. One surprise outside this batch: Coltrane can't wake Langston at all, however it words a message, because Langston's bridge only listens to Kyle and the shared session account. Whether it should is Kyle's call, so it goes to him rather than into this change.
