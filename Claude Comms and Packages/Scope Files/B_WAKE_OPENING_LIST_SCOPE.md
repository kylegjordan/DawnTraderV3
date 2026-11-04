# B-WAKE-OPENING-LIST — SCOPE r1

change-class: non_architecture

**Issue:** `#1241` (filed by PM Claude 2026-11-04 from Infra Claude's KD-12 check). **Owner:** Infra Claude (CC-INFRA).
**Directives (Kyle, relayed by PM Claude 2026-11-04):**
- **KD-20:** *"a post addressed to both reviewers must wake both … Keep the start-anchor, which stops a passing mention from waking a reviewer, and accept an opening list of addressees in either order."*
- **KD-21:** widens it. *"It should not just be when both are mentioned; it should be mentioned at the beginning, e.g. Langston, Coltrane, OLD Claude, NEW Claude, and then everyone should still catch that; a passing mention later should not wake any of the sessions."*
- PM Claude's reading of KD-21: *"the rule for BOTH reviewer bridges AND every session's wake filter."*

**Placement:** `SPRINT_TO_LIVE_PLAN.md` pre-sprint table, Infra Claude order 1a, straight after `B-TOKEN-WATCH-STORAGE`.

## 0. What happens today, measured

**Three wake decisions, three rules** (code at `origin/migration/aws-supabase`):

| who decides | where | Kyle's posts | a session's post |
|---|---|---|---|
| Langston's bridge | `comms-infra/discord/discord-langston-bridge.py:85` `ADDRESS_START_RE`, used at `:1204` | `ADDRESS_RE` — his name **anywhere** (`:81`) | his name **first** (`^…langston\b`) |
| Coltrane's bot | `comms-infra/codex/coltrane-bot.py:97` `NAME_START_RE`, chosen at `:124` | `NAME_RE` — his name **anywhere** | his name **first** |
| each session's wake filter | `comms-infra/laptop/cc-wake-filter.py` | `addressed_to_me()` (`:221`): my name **anywhere** → wake; only others named → no; **nobody named → everyone** | `MY_RE` or `@crew` **anywhere** (`:1216`, "name-or-nothing") |
| (Langston's replies, for comparison) | same filter, `OPEN_RE` (`:215`) | — | my name **first** (B-WAKE-LEAD-NAME) |

**The defect KD-20 names, measured (KD-12, 2026-11-04):** 68 session posts named Coltrane after Langston (*"Langston, and Coltrane —"*) between 2026-10-20 13:31Z and 2026-11-04. None started with "Coltrane", so none woke him.

**What KD-21 would change, replayed over the inbox from 2026-10-04 to 2026-11-04** (a prototype opening-list parser, read-only, run on Helsinki):

| population | posts | open with a list of names | the list names 2+ | name someone ONLY later in the post |
|---|---|---|---|---|
| session posts (`cc_outbound`, excluding Push notice, Heartbeat and Coltrane) | 1,750 | 1,111 | 88 | **1,010 (58%)** |
| Kyle's posts (`kind == ""`) | 10 | 8 | — | 2 (one is *"SWITCH TO CODEX"*, which today wakes Coltrane) |

- ⇒ **Under KD-21 as written, 1,010 of 1,750 session posts would wake fewer parties than today.** That is the noise KD-21 removes: sample later-only mentions are references (*"…homed to CC-C"*, *"A scheduled job for Langston …"*). But it is large. **Some of those may be real requests written mid-post, and the replay cannot tell the two apart.**
- **Instrument:** a name counts as "in the opening list" if it is the first token after leading markup and then each further token, joined by `,` `&` `/` `+` `and` or whitespace. The list stops at the first token that is not a name.
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
- A module `comms-infra/discord/address_list.py`, stdlib only, with `opening_addressees(text, registry) -> set`. Its grammar is the replay's: leading markup, then `name (sep name)*`, stopping at the first non-name token.
- The registry passed in is the existing one. Session names come from `cc-wake-filter.NAMES` (one list, never restated), plus `langston` and `coltrane|codex`.
- The laptop filter runs from `~/.claude`, so it carries a byte-identical copy. A test fails if the two copies differ — the `#641` two-copies shape, fenced rather than allowed.
- **Verify:** unit cases, each stated before it runs:
  - *"Langston, and Coltrane — x"* → both;
  - *"Coltrane and Langston: x"* → both;
  - *"OLD Claude / NEW Claude — x"* → both;
  - *"Infra Claude, ANALYST Claude - from PM Claude, …"* → CC-INFRA and CC-C, **not** CC-PM;
  - *"at 3 PM Claude will post"* → nobody (the CC-PM clock-time rule holds);
  - *"SWITCH TO CODEX"* → nobody;
  - leading markdown (`**Langston**, x`) → Langston.

**OBJ-2: Langston's bridge wakes on the opening list.**
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
  - a replay over the same month gives exactly the per-session wake counts before and after, stated;
  - posts that name 2+ in the opening list wake all of them (88 posts);
  - a later-only mention wakes no one.

**OBJ-5: install and verify live.**
- **Installs:** the two Helsinki bridges via their existing install path, with a restart of the Langston bridge and Coltrane bot **while each is idle** (Langston's bridge is restarted only with no invoke in flight). The laptop filter via each session's re-arm, as PM Claude did for B-PM-CLAUDE P1.
- **Verify live:**
  - a post opening *"Coltrane, Langston — liveness check"* wakes both;
  - a post opening *"Langston — … and Coltrane may comment"* wakes Langston only;
  - a session post opening *"OLD Claude, Infra Claude — probe"* wakes exactly those two (their filters' WAKE lines, read).

**OBJ-6: governance.**
- `SYSTEM_IMPACT_MAP` "Discord Comms Fabric": the one wake rule, its three sites, and the parser.
- `CLAUDE.md` §6.4 and §6.9: these say *"mention … anywhere"*, which becomes *"lead with the addressee(s)"*. **This is the operative rule every session reads, so it must change in the same batch.**
- `COMMS_BRIDGE_RUNBOOK.md`; Langston's and Coltrane's instruction files (their *"lead with the name"* lines); `#1241`; my task list; the completion report.
- **SYSTEM_MANUAL: N/A** (comms, not trading).

## 3. Open questions — for Kyle (recorded for the morning; PM Claude carries them)

**Q1. Do Kyle's own posts follow the opening-list rule too?**
- Today a name anywhere in Kyle's message wakes that reviewer or session, and a message naming nobody reaches every session.
- **Option (a):** yes, the same rule as everyone. A name later in his message, like *"SWITCH TO CODEX"* or *"… ask Coltrane"*, would no longer wake that party.
- **Option (b):** no. Kyle's posts keep today's behaviour.
- **Recommendation: (b).** Kyle writes naturally and rarely (10 posts in the month replayed), so his posts are not where the noise comes from. KD-21's own words aim at sessions (*"a passing mention later should not wake any of the sessions"*).
- **This scope builds (b) as the default.** If Kyle picks (a), it is one condition per site.

**Q2. Accept the size of the session-side change?**
- 1,010 of 1,750 session posts in a month name someone only later. Under KD-21 they stop waking that someone.
- The cost: a session that wants another must say so first; *"@crew"* / *"ALL SESSIONS"* still reach everyone.
- **Recommendation: accept.** It is exactly KD-21's intent, and the same habit already governs Langston and Coltrane.
- **The batch proceeds on KD-21 as written.**

## 4. What I want attacked

1. **The grammar.** Whitespace counts as a separator, so *"Langston Coltrane"* is a list. Is that too loose?
2. **One parser in two copies with a byte-equality test**, against a single file that the laptop fetches from Helsinki.
3. **Restarting both reviewer processes for an install.** Langston's bridge holds an in-flight queue; idle-only restart is the guard I propose.
