# B-WAKE-OPENING-LIST — SCOPE r4a

> **r4a (2026-11-05) — Langston APPROVED r4 on three text amendments before Step 2, all landed here:** A-1 the `@` case now pins r4's behaviour, one markup class is named once and used at both positions, and the `@` evidence is stated on one population (OBJ-1). A-2 the import guard catches `Exception`, with the reason (OBJ-1). A-3 Q1 option (a) now says what an empty opening list does for a Kyle post, and carries his voice measurement as the case for (b) (§3). Also taken: his attack-1 ruling (stop-and-page) with the instance's real notify script exercised under a stubbed `cc-send` (OBJ-5); his `>`-quote case pinned (OBJ-1); the bare-whitespace control re-run over all 1,950 posts (§0).

> **r4 (2026-11-05), answering Langston's r3 send-back (two must-fix, three conditions; he reproduced 266 / 339 exactly):** MF-A Coltrane's refuse-to-start could never page — his unit restarts every 15 s against a 10 s start-limit window, so it never reaches `failed`; the limit is widened and exercised on a scratch unit (OBJ-1, OBJ-5). MF-B a MISSING or broken `address_list.py` gets the same fail-open latch as drift (OBJ-1). C-1 the registry is guarded and every session's every name form is proven to wake it, through the filter's WAKE line (OBJ-1, OBJ-4). C-2 the replay feeds the header frame with a stated positive control (OBJ-4). C-3 `@` joins the opening markup class (OBJ-1). Coltrane's own POSTS are no longer excluded from the count: 272 posts / 345 wakes (§0). The wake file's writers are stated as root + Langston (§0); his live `:349` is swept as read-and-left (OBJ-6).

> **r3 (2026-11-05), answering Langston's r2 send-back (two must-fix, three conditions, one record item):** MF-1 the wake file's case is re-grounded on per-line routing and its single writer, over the population that actually reaches the name rule (§0); MF-2 the rules sweep names all three lines in his repo file, the three in his LIVE loaded copy, and his memory part with its own write path (OBJ-6); C1 a drift is latched and costs noise, never silence (OBJ-1); C2 the Coltrane half gets a carrier, a close condition and a quiet-window sequence (OBJ-5); C3 Q2 now gives Kyle lost WAKES per session, and that re-count shrank the figure (§0, PREVIOUSLY/NOW/REASON); the `@` case is pinned (OBJ-1); the live-copy attribution is corrected (§0).

> **r2 (2026-11-05), answering Langston's r1 send-back:** B-1 (a fourth site, plus voice, enumerated), B-2 (the algorithm, stated; whitespace dropped on measurement; the replay re-run under the grammar that ships), B-3 (the INSTALLED copies check themselves), B-4 (install guards per process, and the re-arm narrowing stated), the rules-file sweep done by class, and the dead `CC_NAME_RE` folded in.

change-class: non_architecture

**Issue:** `#1241` (filed by PM Claude 2026-11-04 from Infra Claude's KD-12 check). **Owner:** Infra Claude (CC-INFRA).
**Directives (Kyle, relayed by PM Claude 2026-11-04):**
- **KD-20:** *"a post addressed to both reviewers must wake both … Keep the start-anchor, which stops a passing mention from waking a reviewer, and accept an opening list of addressees in either order."*
- **KD-21:** widens it. *"It should not just be when both are mentioned; it should be mentioned at the beginning, e.g. Langston, Coltrane, OLD Claude, NEW Claude, and then everyone should still catch that; a passing mention later should not wake any of the sessions."*
- PM Claude's reading of KD-21: *"the rule for BOTH reviewer bridges AND every session's wake filter."*

**Placement:** `SPRINT_TO_LIVE_PLAN.md` pre-sprint table, Infra Claude order 1a, straight after `B-TOKEN-WATCH-STORAGE`.

## 0. What happens today, measured

**Every wake decision site, enumerated (r2; Langston B-1). Code at the ref. Live copies (r3, attribution corrected): Langston measured his live bridge sha-identical to the ref (`6a879728…`); I measured Coltrane's live `/usr/local/bin/coltrane-bot.py` (the path in its unit's `ExecStart`) at sha256 `a5a2f209…`, equal to the repo blob at `5a8a72793` — 2026-11-05, as root; he could not reach it from his account.**

| who decides | where | Kyle's posts | a session's post |
|---|---|---|---|
| Langston's bridge | `comms-infra/discord/discord-langston-bridge.py:85` `ADDRESS_START_RE`, used at `:1204` | `ADDRESS_RE` — his name **anywhere** (`:81`) | his name **first** (`^…langston\b`) |
| Coltrane's bot | `comms-infra/codex/coltrane-bot.py:97` `NAME_START_RE`, chosen at `:124` | `NAME_RE` — his name **anywhere** | his name **first** |
| each session's wake filter | `comms-infra/laptop/cc-wake-filter.py` | `addressed_to_me()` (`:221`): my name **anywhere** → wake; only others named → no; **nobody named → everyone** | `MY_RE` or `@crew` **anywhere** (`:1216`, "name-or-nothing") |
| (Langston's replies, for comparison) | same filter, `OPEN_RE` (`:215`) | — | my name **first** (B-WAKE-LEAD-NAME) |
| ★ **the wake file** `/var/log/cc-wake.log` (Langston's summon channel) | same filter, `:1025` → `addressed_to_me(line)` (`WATCHER-CONTROL` lines `continue` first, `:1019-1023`) | — | a name **anywhere**; **no name → every session** |
| Kyle's **voice** notes to Langston | bridge `:541` `ADDRESS_RE` | his name **anywhere**, after transcription | — |

**The wake file's disposition — UNCHANGED (r3, re-grounded; Langston MF-1).** Two reasons, both structural:
1. **It is routed per LINE** (`:1025` runs on each appended line), so a multi-line summons has one opening line and N−1 continuation lines. An opening-list rule there would drop every continuation: a category error, not a judgement about how many lines lead with a name.
2. **Only root and Langston can write it** (`-rw-rw-r-- root:langston`; the `langston` group has no other members — Langston, measured), so there is no passing-mention noise to remove there, by construction.

**The census, over the right population (r3; r2's "153 of 319" counted every line and is withdrawn).** 319 non-blank lines; **139 are `WATCHER-CONTROL` and never reach the name rule.** Of the 180 routed: 142 open with a name, 14 name a session only later, 24 name nobody (instrument: the shipped opening-list algorithm, §2 OBJ-1, run 2026-11-05). Langston counts the same 180 as 139 / 12 / 29 — a difference of a few lines in what counts as an opening (two `@CC-A` / `@CC-B` openings among them). Neither count carries the decision, which rests on 1 and 2. With `@` now in the markup class the two-line difference is no longer cosmetic: it is reconciled by running the SHIPPED parser over the file at Step 7 (Langston's record item). Of my 14: 3 are `NAME-TEST-n:` labels, several are continuation lines (two are `  - ` bullets), the rest are tag- or timestamp-prefixed. It keeps `addressed_to_me()`, and the code says so at the site.

⚠️ **`CLAUDE.md:317` (§6.9 item 2; Langston cited `:313` at an earlier ref) says *"Same name-routing rules"* for this file. That is false today and stays false, so the line is corrected to say the file is name-anywhere with no-name broadcast, by design.**
**Voice (`:541`):** Kyle-only; unchanged under Q1(b). Enumerated so it is not a later surprise.

**The defect KD-20 names, measured (KD-12, 2026-11-04):** 68 session posts named Coltrane after Langston (*"Langston, and Coltrane —"*) between 2026-10-20 13:31Z and 2026-11-04. None started with "Coltrane", so none woke him.

**What KD-21 would change, replayed over the inbox from 2026-10-04 to 2026-11-04 (end of day) under the grammar that SHIPS (§2 OBJ-1; r2, Langston B-2 — r1's figure used a looser grammar and is superseded):**

| population | posts | open with a list of names | the list names 2+ | name someone ONLY later in the post |
|---|---|---|---|---|
| session posts (`cc_outbound`, excluding Push notice and Heartbeat) | 1,950 | — | — | **272 name a SESSION only later** (r4, below; r2's 1,014 over 1,774 counted reviewer mentions and excluded Coltrane's posts) |
| Kyle's posts (`kind == ""`) | 10 | 8 | — | 2 (one is *"SWITCH TO CODEX"*, which today wakes Coltrane) |

> **PREVIOUSLY STATED (r1, r2):** 1,014 of 1,774 session posts would wake fewer parties than today.
> **NOW (r4):** **272 posts, 345 lost (post, party) wakes** — CC-C 122 · CC-B 109 · CC-INFRA 65 · CC-A 42 · CC-PM 7. (r3 said 266 / 339; it wrongly excluded Coltrane's own posts — see the population line. Langston re-derived both figures independently.)
> **REASON:** the 1,014 counted a later-only mention of Langston or Coltrane as a lost wake. Their bridges are ALREADY name-first for session posts (`:1204`, `:124`), so those posts wake them neither today nor after; only the session filters (`:1216`, name anywhere) change. Counting (post, party) pairs per session, as Langston's C3 asked, exposed it. A post's own author is not counted (it does not wake itself).
- **Instrument and population, stated (Langston C3: he could not reproduce my exclusions):** `/var/log/cc-discord-inbox.jsonl`, `kind == "cc_outbound"`, `2026-10-04` ≤ `ts` < `2026-11-04T23:59`: **3,666 rows raw**; excluded Push notice 1,171 and Heartbeat 545; **1,950 kept.** Coltrane's 176 posts are KEPT (r4, Langston): his bridge being name-first is about reaching HIM; his posts reach the five through the crew branch (`:1201`, `sender != MY_NAME`), name anywhere today, so they lose wakes too (+6 posts / +6 pairs). Parties = the five sessions; the author's own name is excluded where the sender maps to a session (`OLD / NEW / ANALYST / Infra / PM Claude`). The shipped algorithm.
- Sample later-only mentions are references (*"…homed to CC-C"*), but **some may be real requests written mid-post, and the replay cannot tell the two apart.**
- **Instrument:** the shipped algorithm in §2 OBJ-1. Run alongside it, the r1 grammar (which also allowed bare whitespace between names) found MORE names than the shipped one in **0** of the 1,950 posts (r4a: re-run over the population that includes Coltrane's posts; positive control — the whitespace grammar does find both names in `"Langston Coltrane x"`). ⇒ **bare whitespace is not a separator** (Langston B-2: it buys nothing and costs the ambiguity below).
- **Single month, prototype parser.** This is a sizing figure, not a verdict.

## 1. Provenance read

- **`ADDRESS_START_RE`** (Langston's bridge). Kyle, 2026-06-19, quoted in the code comment at `:82-84`: *"a Claude session addresses Langston by putting his name at the START of the post — so a passing mid-sentence mention does NOT wake him."* Disposition (2): relevant, needs updating, so that the start may be a list.
- **`NAME_START_RE`** (Coltrane). Kyle, 2026-09-11, `:93-96`: *"KYLE MAY NAME COLTRANE ANYWHERE; EVERYONE ELSE MUST LEAD WITH THE NAME … a session or Langston merely writing ABOUT Coltrane spent a paid invoke nobody asked for."* Disposition (2).
- **The session filter's crew rule** (`:1205-1215`). Kyle, 2026-08-26: *"I don't want you guys being notified of each other's work unless you are deliberately called into that work."* It replaced broadcast with name-anywhere; KD-21 tightens it to name-first. Disposition (2).
- **The session filter's Kyle rule** (`addressed_to_me`). Kyle, 2026-06-12, quoted at `:37`: *"names may appear ANYWHERE in the message"*, and a Kyle post naming nobody reaches everyone (*"because he means it"*, `:1212`). **KD-21 may or may not change this — open question Q1.**
- **`OPEN_RE`** (Langston's replies, B-WAKE-LEAD-NAME `#1040`): already name-first. It deliberately needs no separator (*"a spurious WAKE, never a missed one"*, `:209-213`). Disposition (1): unchanged, but the new parser must not contradict it.
- **Ledger:** `#1040` (lead-name), `#995` (wake noise; *"do not propose another rule"* — this is a ROUTING change ordered by Kyle, not a behaviour rule), `#1201` (alert markers), `#1241` (this).

## 2. Objectives

**OBJ-1: one opening-list parser, one copy of the rule.**
- A module `comms-infra/discord/address_list.py`, stdlib only, with `opening_addressees(text, registry) -> set`.
- **THE ALGORITHM (Langston B-2), not just the grammar:**
  - The registry entries are REGEXES that already contain a separator class (`old[\s_-]*claude`), and CC-PM's correctness rests on lookbehinds (`(?<![0-9])(?<![0-9][\s])(?-i:PM)…`). So the parser **never tokenises**.
  - From the position after leading markup (`[\s*_~\`>#:".-]*`), it tries **every registry alternative anchored at that position against the FULL string** (`pattern.match(text, pos)`, which keeps the left context visible to lookbehinds). **The longest match wins.**
  - Then it consumes one separator: optional markup, then `,` (optionally followed by `and`), `&`, `/`, `+` or the word `and`, then optional markup. **Bare whitespace is NOT a separator.** ★ **"Markup" is ONE class, `MARKUP = [@\s*_~\`>#:".-]*`, named once in the module and used at both positions** — before the first name and around every separator — so a second `@` (`@Langston, @Coltrane`) is consumed exactly as the first (r4a, Langston A-1).
  - It continues only if another registry match starts there. It stops at the first position where none does.
- The registry passed in is the existing one. Session names come from `cc-wake-filter.NAMES` (one list, never restated), plus `langston` and `coltrane|codex`.
- **The opening markup class gains `@` (r4, Langston C-3):** `[@\s*_~\`>#:".-]*`, in both copies. Today `MY_RE:159` accepts `@NEW Claude — do X`; without `@` the new rule would drop that form, a narrowing in the silence direction. With it, the only extra wake is for a name actually written at the opening. **Evidence, one population (r4a):** of 33,548 non-empty inbox bodies, 0 open with `@<registry name>` and 0 with `<@` (a real Discord mention arrives as `<@id>`, and `<` is not in the class, so it matches nobody); the only `@` openings are 4 `@crew` posts, routed by the `@crew`-anywhere branch (Langston, measured 2026-11-05). The bridges' own `ADDRESS_START_RE` / `NAME_START_RE` are replaced by the parser, so the class lives in one place.
- **The registry is guarded (r4, Langston C-1).** The sha pin cannot see a registry that lacks this session's alias, or a parser that returns keys in another convention — the opening list could then never contain this session: total silence, sha matching, tests green. `:215` already guards that class for `OPEN_RE`. So: **if `registry[ALIAS]` is absent or empty, or the parser's key set does not include `ALIAS`, the filter latches the same way as a drift (one WAKE, then `MY_RE` anywhere).**
- **Two copies, because a runtime fetch would put every session's wake behind Helsinki and fail in the missed-wake direction** (Langston agreed). One copy sits in `comms-infra/discord/` for the two bridges, and one installs beside `~/.claude/cc-wake-filter.py`.
- **★ The INSTALLED copies check themselves (Langston B-3; `#1004`'s class).** A repo test comparing two repo copies cannot see an install. So each consumer carries the committed expected sha256 of `address_list.py` and checks the file it actually imports, at startup:
  - **the session filter (r3, Langston C1 — drift costs noise, never silence):** on a mismatch it records the offending sha in its state file, prints `WAKE[WATCHER-DRIFT->ALIAS]: address_list.py is <sha>, expected <sha> — re-install` **once per sha**, and then **keeps running on today's rule, `MY_RE` anywhere** (strictly wider, so nothing is missed). r2 ended the run instead: that left the session deaf to every real wake while drifted, and each re-arm re-emitted the same WAKE — an unbounded paid loop if this session cannot re-install. In-file precedents: `:336-337` (*"fail-open: a filter that cannot set its encoding must still deliver wakes"*) and `:209-213` (*"a spurious WAKE, never a missed one"*). **Verify:** a drifted copy gives one WAKE; a second arm on the same sha gives none; a real post naming the session mid-text still wakes it.
  - **Absence, not only drift (r4, Langston MF-B).** A missing, unreadable or broken `address_list.py` raises at IMPORT, before any sha check. `cc-wake-filter.py` is stdlib-only today (`:26`), so this is its first import that can fail by absence — and a failed import ends `--once` non-zero, the arm loop reconnects, and the session is deaf with a traceback nobody reads. So the filter **loads it by path inside `try/except Exception`**, and any exception takes the same latch (one WAKE per cause, then `MY_RE` anywhere). **Why broad is right here (r4a, Langston A-2):** an enumerated tuple misses `re.error` and anything else module-level code can raise, and the miss lands exactly where this guard exists; the latch is strictly WIDER than today's rule, so no failure a broad catch absorbs is made worse by it. A guard checked against the known-good outcome, not a list of known bad ones.
  - **the two bridges:** on a mismatch OR an absent/broken module they refuse to start — the import happens inside the same guard, so absence reaches the refuse path instead of dying ahead of it — and systemd `OnFailure` pages.
  - ⛔ **Coltrane's unit could never page (r4, Langston MF-A, re-measured by me 2026-11-05):** `Restart=always`, `RestartUSec=15s`, `StartLimitIntervalUSec=10s`, `StartLimitBurst=5`. Starts 15 s apart can never put 5 inside a 10 s window, so the unit never reaches `failed` and its `OnFailure` drop-in (`coltrane-bot.service.d/onfailure.conf`, whose own comment says it pages only past the start limit) never fires: a refuse-to-start would be an endless silent restart loop. **Fix: the drop-in also sets `StartLimitIntervalSec=5min`** (5 starts at 15 s ≈ 60 s, inside the window). Langston's bridge is fine as it is (`Interval=1min`, `RestartSec=10s`). **Exercised before install on a scratch unit carrying the same three values**, whose `OnFailure` runs the **real** `bridge-failed-notify.sh` (it is unit-name-generic: `%i`, reading `Result` and state by name) **with `cc-send` shadowed by a stub that writes a file** — real branch logic, never Kyle's page (r4a, Langston). With today's values it loops and never fails (the control); with `5min` it reaches `failed`, the script takes its `start-limit-hit` branch, and the stub records the page it would have sent.
  - **The trade, ruled (Langston attack 1):** stop-and-page, not page-and-keep-restarting. At `5min` only ~60 s of CONTINUOUS start failure trips it, so a transient clears first; the page names `systemctl reset-failed <unit> && systemctl start <unit>`. ⚠️ **After this fix that page is the ONLY thing that notices a stopped Coltrane** — `agent-unit-failure@` covers his repo-refresh, backup and size-watch units, not the bot; there is no heartbeat on it; `crew-switch` does not check it. And this instance's notify (`discord-bridge-failed-notify@coltrane-bot.service`) has never run (`NRestarts=0`); the 2026-07-13 proof in the drop-in comment is a different instance. **So no live silence is read as proof it pages** (`#661` leg 3); the scratch run is the evidence.
  - A repo test still pins the two repo copies equal, and each consumer's constant equal to them.
- **Verify:** unit cases, each stated before it runs:
  - *"Langston, and Coltrane — x"* → both;
  - *"Coltrane and Langston: x"* → both;
  - *"OLD Claude / NEW Claude — x"* → both;
  - *"Infra Claude, ANALYST Claude - from PM Claude, …"* → CC-INFRA and CC-C, **not** CC-PM;
  - *"at 3 PM Claude will post"* → nobody (the CC-PM clock-time rule holds);
  - ★ *"Langston, 3 PM Claude will post"* → Langston only: the lookbehind bites INSIDE a list, where the start anchor does not save it (Langston B-2; prototype measured `['LANGSTON']`);
  - *"Langston, PM Claude - x"* → Langston and CC-PM;
  - *"Langston Coltrane x"* → Langston only (whitespace is not a separator);
  - *"SWITCH TO CODEX"* → nobody;
  - leading and inner markdown (`**Langston**, **Coltrane** — x`) → both (the r2 prototype stopped after `**Langston**`; markup around a separator is allowed, fixed before code).
  - *"@Langston, @Coltrane — x"* → **both** (r4a, Langston A-1: r4 put `@` in the one markup class, so both `@`s are consumed);
  - *"<@123456789> Langston — x"* → nobody (`<` is not markup: a real Discord mention is not a name);
  - *"> @NEW Claude — do X"* → CC-B: **pinned, not prevented** (`>` is in the class verbatim from `ADDRESS_START_RE:85` / `OPEN_RE:215`, so a post opening by QUOTING someone else's addressed line wakes that name; measured: 10 bodies open with `>`, none with a name after it — noise if it ever happens, never silence).

**OBJ-2: Langston's bridge wakes on the opening list.**
- **And the dead `CC_NAME_RE` (`:96`) is deleted** (Langston, §13 disposition 1). One repo-wide grep returns only its definition and a `B_PM_CLAUDE_PRE_AUDIT.md` row noting it unused. Its comment asserts behaviour the code does not have (`:1202` is `ADDRESS_RE.search` only). It is recorded in `DELETED_COMPONENTS_LOG.md` and archived per rule 18; the blast radius is that one grep.
- `:1204` for a CC post becomes *"Langston is in `opening_addressees(content)`"*.
- Kyle's branch (`ADDRESS_RE`, anywhere) is unchanged unless Q1 says otherwise.
- **Verify:**
  - a replay of the 68 KD-12 posts: each still wakes Langston (he was first);
  - *"Coltrane, Langston — x"*, which today does not wake him, now does;
  - a later-only mention still does not.

**OBJ-3: Coltrane's bot wakes on the opening list.**
- `:124` for non-Kyle authors becomes *"Coltrane is in the opening list"*. The `@crew` / `ALL SESSIONS` path is unchanged.
- **Verify:**
  - replayed against the 68 KD-12 posts: every *"Langston, and Coltrane"* post now wakes him;
  - a later-only mention does not;
  - Kyle anywhere is unchanged (pending Q1).

**OBJ-4: each session's wake filter wakes on the opening list for session posts.**
- The crew branch (`:1216`) becomes *"my name in the opening list, or `@crew` / `ALL SESSIONS` anywhere"*.
- The Kyle branch follows Q1.
- Langston's replies are unchanged: `OPEN_RE` is already name-first, and stays the deliberately separator-free form.
- **Verify:**
  - a replay over the same month gives exactly the per-session wake counts before and after, stated. ⛔ **Fed with the `==> file <==` header frame the filter requires (r4, Langston C-2)** — `:1225-1240` records three hand-fed tests that read PASS while processing nothing, one reported to Kyle — **and with a stated positive control first: one known post that names this session at the opening must produce a WAKE line before any count is read;**
  - posts that name 2+ in the opening list wake all of them (88 posts);
  - a later-only mention wakes no one;
  - ★ **every name form wakes its session (r4, Langston C-1):** for every session and every alternative in its `NAMES` list, a post `"<form>, x"` produces that session's WAKE line — asserted through the filter's output, not the parser's return value — so `MY_RE` and the parser are proven to cover the same forms;
  - a registry missing this session's alias, and an absent `address_list.py`, each give one WAKE and then still wake on a mid-text mention.

**OBJ-5: install and verify live — each process on its own terms (Langston B-4).**
- **Langston's bridge: no idle precondition, and the recovery is EXERCISED.**
  - `stop_cleanly` (`:258-266`) kills each running agent's process group and exits 0. The recovery pass (`:1018-1066`) re-feeds every unanswered post since the floor (*"A killed review is not lost"*, `:225`).
  - So the install restarts it **with a probe invoke in flight, on purpose**: a post *"Langston, install probe — reply 'probe ok' after reading this"*, a restart mid-invoke, then a check that the recovery pass re-fed it and he answered. Nobody has yet proven that across a parser change.
- **Coltrane's bot: a named external predicate, because its stop path is unsafe.**
  - `coltrane-bot.py` has no `signal`, `start_new_session` or `killpg` (Langston, measured with a positive control). It runs `codex exec` through `sudo … sh -c` with `timeout=900`. A restart mid-invoke leaves those processes in the unit's cgroup, which leads to TimeoutStopSec, SIGKILL, `failed`, and a false page to Kyle.
  - **When (r3, Langston C2c):** the Coltrane half is scheduled for a quiet window — the crew in Claude mode (`/var/lib/crew-switch/state.json` `mode: claude`, read 2026-11-05), at an hour with no open request to him. Honest limit: `crew-switch` does not control Coltrane's service, so the window is chosen, not enforced. His post gaps 2026-09-08 → 11-04 (Langston): median 465 s, 62 of 219 at or over 20 min — a bound, not proof of idleness.
  - **Predicate, the final guard:** `pgrep -u coltrane -f "codex exec"` is empty, checked every 30 s for up to 20 minutes. On timeout the Coltrane half is **abandoned** (the old file stays, nothing restarts).
  - **Carrier for the retry (r3, C2a):** every abandoned attempt is written on `#1241` with its time; the retry is the next quiet window, run by me; the batch's §0a row reads *"Coltrane half pending"* until it lands.
  - ⛔ **Close condition (r3, C2b):** the batch does NOT close with OBJ-3 unapplied. With the bridge and the filters widened and Coltrane still name-first, KD-20's exact defect would stay live for the one party it was filed about.
  - **The stop-path gap itself** (Langston's B-LANGSTON-RELIEF process-group fix, never ported to Coltrane): *DISPOSITION: added to `B-AGENT-INVOKE-FAILURE-NOTICE` (`#1198` / `#1206`, my list)*, the batch about failed and killed reviewer runs. Recorded on `#1206`.
- **The direction of each change at the install boundary:**
  - Both reviewer bridges **widen** (name-first becomes the opening list), so a recovery re-feed can only feed more. Residual: an unanswered post inside the floor window that now qualifies gets a wake it would not have had. Accepted.
  - The **session filter narrows** and resumes from a saved position (`load_state`, `:607-620`). So inbox lines written before the install under the old convention, not yet delivered, **lose their wake at re-arm**. This is one-time and in the dangerous direction.
  - **Mitigation:** each session re-arms straight after the install, as with PM Claude's P1 rollout, so the backlog is seconds long. **And at the re-arm each session reads its last 30 inbox lines once** (the existing session-start comms poll, shared `MEMORY.md` item 4: `tail -30` of the inbox), with the window stated.
- **The laptop filter:** installed via each session's re-arm, then the startup hash check (OBJ-1) proves the installed copy.
- **Verify live:**
  - a post opening *"Coltrane, Langston — liveness check"* wakes both;
  - a post opening *"Langston — … and Coltrane may comment"* wakes Langston only;
  - a session post opening *"OLD Claude, Infra Claude — probe"* wakes exactly those two (their filters' WAKE lines, read).

**OBJ-6: governance.**
- `SYSTEM_IMPACT_MAP` "Discord Comms Fabric": the one wake rule, its three sites, and the parser.
- **★ Every statement of a wake rule, in every always-loaded instruction file — swept by CLASS, not by section number (Langston).** Measured at the ref, the session rule *"anywhere"* is at `CLAUDE.md:224`, in the §6 preamble *"LIVE MECHANICS — all operative, all needed every day"*, the block everyone reads, which r1 missed; and at `:255` and `:261` (§6.4). §6.9 states it in other words at `:317` (wake-file item 2). **Langston's own rules file states the class at THREE lines (r3, Langston MF-2; r2 named one):** repo `comms-infra/langston/LANGSTON_CLAUDE.md` `:122` (§5) and `:300` (§11) — the REVIEWER rule OBJ-2 changes (*"a CC post engages you only when it LEADS with 'Langston'"*) — and `:171` (§5.3), the session rule (*"a session wakes when its name appears anywhere"*). **His LIVE loaded copy** `/home/langston/CLAUDE.md` carries them at `:160`, `:209` and `:340` (my grep, 2026-11-05, as root); `:349` states the auto-lead of his replies, which OBJ-2 does not change — read and left, recorded: the Step-2 grep runs on the live copies too, not only the repo (`#1004`'s class). They land through `langston-rules-install`, after `B-LANGSTON-CLAUDEMD-RESIDUAL`'s installer clears. **His memory states it as well:** `/home/langston/memory-parts/00-legacy.md:34` (*"Kyle anywhere; CC posts must LEAD with 'Langston'"*). `langston-rules-install` does NOT touch it; it changes only through `langston-memory-write --part 00-legacy.md --expect-sha …`, a separate named step — otherwise his always-loaded set keeps the old rule after the batch. Plus Coltrane's prompt text in `coltrane-bot.py`, and `CONDUCT.md` / `MEMORY.md` if they state the rule. **Step 2 lists every hit from a grep of the class** (anywhere / first / lead with / START / name-routing) across all of these, each changed or left with a reason. `:230` and `:251` are the Kyle rule: correct under Q1(b), **read and left, and recorded as such**.
- `COMMS_BRIDGE_RUNBOOK.md`; Langston's and Coltrane's instruction files (their *"lead with the name"* lines); `#1241`; my task list; the completion report.
- **SYSTEM_MANUAL: N/A** (comms, not trading).

**Out of scope, with its home:** §6.9's roster table lists only CC-A and CC-B and says *"all named sessions ACTIVE"*; `:224` omits CC-PM; and `:261` names *"Claude Analyst"*, a form CC-C has never posted under. *DISPOSITION: decision required (Kyle slots it), filed as a `RUNNING_ISSUES` entry and passed to PM Claude* — Langston: *"an item on your list, not a rider here"*.

## 3. Open questions — for Kyle (recorded for the morning; PM Claude carries them)

**Q1. Do Kyle's own posts follow the opening-list rule too?**
- Today a name anywhere in Kyle's message wakes that reviewer or session, and a message naming nobody reaches every session.
- **Option (a):** yes, the same rule as everyone. A name later in his message, like *"SWITCH TO CODEX"* or *"… ask Coltrane"*, would no longer wake that party. ⚠️ **And (a) is TWO decisions, not one (r4a, Langston A-3):** it must also say what a Kyle post with an EMPTY opening list does. Today a Kyle post naming nobody reaches every session (`addressed_to_me`, from `:1069` for text and `:1072` for voice). Under (a): keep that broadcast, or wake nobody? (The scope would build: keep the broadcast — an empty list is not a later-only mention.)
- **Option (b):** no. Kyle's posts keep today's behaviour.
- **Recommendation: (b).** Kyle writes naturally and rarely (10 posts in the month replayed), so his posts are not where the noise comes from. KD-21's own words aim at sessions (*"a passing mention later should not wake any of the sessions"*).
- ★ **The stronger reason, measured (Langston, Kyle's whole voice record, 34 rows → 18 distinct notes):** the OPENING of Kyle's message is the least reliable part of his traffic, because transcription garbles names. 9 of 18 notes open with a recognised name; 4 name someone only later; 5 name nobody. And **10 of 18 carry a garbled form that matches no name at all** — *"Claude New"*, *"Claude Old"*, *"Claude Newman Langston…"*, *">> Hold Claude and Langston"* (that is "OLD Claude"). An opening-only rule on his posts would drop the very notes where the start was misheard. (The four later-only notes: 06-21T07:18Z, 06-21T10:19Z, 07-02T08:59Z, 07-19T16:49Z.)
- **This scope builds (b) as the default.** If Kyle picks (a), it is two conditions per site: the later-mention rule, and his choice for an empty opening list.

**Q2. Accept the size of the session-side change?**
- **345 wakes in the month replayed would stop**, from 272 posts that name a session only later (r4; r2 said 1,014 posts, which counted mentions of Langston and Coltrane that already wake neither of them — see §0). Per session: ANALYST Claude 122, NEW Claude 109, Infra Claude 65, OLD Claude 42, PM Claude 7.
- The cost: a session that wants another must say so first; *"@crew"* / *"ALL SESSIONS"* still reach everyone.
- **Recommendation: accept.** It is exactly KD-21's intent, and the same habit already governs Langston and Coltrane.
- **The batch proceeds on KD-21 as written.**

## 4. What I want attacked (r4)

1. **The start-limit fix (MF-A):** `StartLimitIntervalSec=5min` makes a refuse-to-start page after ~60 s of failed starts. It also makes a genuine crash-loop stop and page instead of restarting forever. Is stopping the right trade for Coltrane, or should the refuse path page directly and keep restarting?
2. **The `@` widening (C-3):** is there a post that opens with `@<name>` and is NOT addressed to that name?
