# B-WAKE-LEAD-NAME — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture

**Step 2** · **Scope:** `B_WAKE_LEAD_NAME_SCOPE.md` r2 at `928e652f0` (Step 1 approved with revisions, Langston 2026-09-11 15:52Z) · **Owner:** Infra Claude · **Issue:** `#1040` · **Plan:** `PHASE_19_PLAN.md` row 4.51

---

## 0. PREVIOUSLY STATED → NOW

| previously stated | now | reason |
|---|---|---|
| **93** dropped replies — OLD 25, NEW 27, ANALYST 26, Infra 15 (scope §0, measured ~15:05Z) | **104** — OLD 28, NEW 28, ANALYST 29, Infra 19 (measured **2026-09-11T16:07:00Z**) | the same predicate, re-run an hour later on a growing log: Langston replied to every session in between. **The population is a moving log, so every figure below carries its measurement time.** OBJ-1 re-measures at Step 7. |
| scope r1: *"the bridge auto-leads every reply with the addressee"* | **non-alert replies only** — `discord-langston-bridge.py:530` `if not task.get("is_alert"):` | Langston, Step 1 |
| my first run of the addressee join, this audit: mostly MISMATCH | **104 of 104 MATCH** (F-3) | **the instrument was wrong, not the key.** It read the author from `sender`/`author`; incoming rows record it as `sender_username` (`"Infra Claude#0000"`). Every triggering row therefore had no author, and "no author" scored as a mismatch. Caught by a control on a known message, fixed, and the join re-run behind that control. |

---

## 1. THE SIX SOURCES — WHICH I READ, AND WHAT EACH RETURNED

| # | source | read | returned |
|---|---|---|---|
| 1 | **code at the ref** | `comms-infra/laptop/cc-wake-filter.py` `:14-40` (`NAMES`, `ALIAS_NAME`), `:111` (`MY_RE`), `:117-118` (`OTHERS_RE`), `:141-147` (`ALERT_OWNERS`, `ALERT_OWNER_RE`, `ALERT_MARKER_STRIP`), `:149-156` (`addressed_to_me`), `:267-388` (the stdin loop, the `langston_outbound` branch) · `comms-infra/discord/discord-langston-bridge.py` `:83` (`ADDRESS_START_RE`), `:97` (`resolve_recipient_name`), `:524-535` (auto-lead + mirror) · `scripts/analysis/test-wake-filter-cuts.py` · `scripts/analysis/wake_narration.py` `:50-55` | F-1, F-2, F-4, F-5, F-6 |
| 2 | **runtime** | `/var/log/cc-discord-inbox.jsonl` on Helsinki, 19,466 rows at 16:07Z — the replay and the join. No PM2 log, no database: the filter is a laptop stdin→stdout stage with no state and no store. | F-3 |
| 3 | **System Impact Map** | `:2790`, `:2822`, `:2826`, `:3638-3642` | the filter is repo-canonical at `comms-infra/laptop/`; routing is by display name; the `#995` marker cut and its measured owner-direction reach; a running watcher holds the code it armed with |
| 4 | **System Manual** | full-file search for `cc-wake-filter`, `wake watcher`, `wake-filter`: **0**; control `regime`: 429 | ⚠️ **SILENT — flagged, and judged not a gap:** `CLAUDE.md` §9 scopes the System Manual to architecture, strategy logic, regime, filter design, signal pipeline and quantitative math. Crew wake routing is comms infrastructure, owned by the System Impact Map. **Disposition 5, no work.** |
| 5 | **ledger + reports** | `RUNNING_ISSUES` `#995`, `#340`, `#402`, `#1004` · `BATCH_CATALOG` (B-ALERT-PROTOCOL `:387`) · `B_WAKE_QUIET_COMPLETION_REPORT.md` `:44`, `:50-52`, `:106` · `ALERT_HANDLING_PROTOCOL.md` `:18-34` | no decision to suppress a reply ADDRESSED to a session; `#995`'s report records the 21-of-28 owner-direction figure and the protocol change to *"name the owner in the prose"* |
| 6 | **`bridge/canonical/`** | search for `cc-wake`, `wake watcher`, `wake-filter`, `ALERT owner`: **0 files**; control `regime`: 10 files | **no pre-governance coverage** — the wake filter post-dates the corpus (introduced 2026-06, the Discord era). A finding in itself, and the reason 1.b of the scope rests on git archaeology instead. |

---

## 2. ENTRY POINTS — ENUMERATED REPO-WIDE, BEFORE ANY TRACE

**Every file naming `cc-wake-filter`:** 39 in the repo (docs, reports, memory files, two bridges' comments, the filter, its test, the narration script). **The ones that EXECUTE it:**
1. **The wake-watcher command** — shared `MEMORY.md:19` (the same command in `CLAUDE_CODE_WAKE_WATCHER_RUNBOOK.md:8`): `… tail -n0 -F /var/log/cc-discord-inbox.jsonl /var/log/langston-alert-invokes.log /var/log/cc-wake.log | python3 -u "C:/Users/kyleg/.claude/cc-wake-filter.py" <ALIAS>`, armed by each of the four sessions. **One command form, four instances.**
2. **`scripts/analysis/test-wake-filter-cuts.py:8`** — `FILTER = r'C:\Users\kyleg\.claude\cc-wake-filter.py'`, one subprocess per case, **run as `CC-A` only**.

**Exactly two invocation forms.** `wake_narration.py` names the filter only inside a classifier string; it reads transcripts and never runs it. No mutual-exclusion check is needed: the filter holds no state, and each instance reads its own stdin.
`REVIEWER r1: claim-only · "the filter is executed only by the watcher command and its test; only the sessions and wake_narration.py parse WAKE lines" · what else is consistent · both claims held at the invocation and parser level; FOUR leads raised · re-derived: y`
**The leads, each re-derived before it moved anything:**
- **Input-format dependents that do not run the filter:** `comms-infra/codex/coltrane-bot.py:154-162` writes `cc_outbound` rows with `transport` fixed to `"discord"`, because the filter's label at `:326` falls back to "Telegram" for anything else; `comms-infra/discord/discord-cc-bridge.py:205-209` writes Kyle's inbound with an empty `kind`, which the filter treats as a Kyle message. **Both write kinds other than `langston_outbound`, so this batch's branch does not touch them** — recorded in the census as input dependents.
- **`wake_narration.py` has a sixth, catch-all bucket** (`'WAKE['` → "other wake", `:55`), and **"first match wins"** (`:48`, loop at `:72`). "Langston" (`:52`) is tested before the catch-all, so **a tagged `WAKE[LANGSTON->…` line still classifies as "Langston"** (F-6 stands).
- **Three hand-install leftovers sit beside the live filter:** `cc-wake-filter.py.bak-20260823`, `.pre-images2-20260807-042957`, `.pre-pushnotice-20260818`. The live copy (32,185 B, 2026-09-04 15:58) is byte-identical to the repo. This is the `#1004` residue F-7 describes.
- **The filter also prints a non-`WAKE[` line**, `[cc-wake-filter] UNROUTED LINE` (`:459`); it is unaffected.
**NOT covered by that read, stated as limits:** the Helsinki copies of related scripts, git stashes and other branches, and one-off commands typed inside sessions, which live only in transcripts that were not opened.

---

## 3. COMPONENT CENSUS — `cc-wake-filter.py`, the `langston_outbound` branch

| question | answer |
|---|---|
| who **writes** its input | `discord-langston-bridge.py:535` (`langston_outbound`, fields `ts, source, transport, kind, channel_id, message_id, reply_to, text` — **no recipient field**) · `discord-cc-bridge.py` (`cc_outbound`, Kyle's inbound) · the Langston bridge's inbound mirror (`langston_inbound`, `langston_alert_inbound`: `author_id`, `sender_username`) |
| who **reads** its output | the four sessions (their `WAKE[` lines, delivered through each Monitor) · **`scripts/analysis/wake_narration.py:48-72`**, which classifies transcript lines by prefix with **first match wins** — `WAKE[LANGSTON` → "Langston" (`:52`), `WAKE[ALERT-OWNER` → "alert routed" (`:53`, no longer printed since `#995`), then a catch-all `WAKE[` → "other wake" (`:55`) |
| who **depends on its input format** without running it | `coltrane-bot.py:154-162` (`cc_outbound`, `transport="discord"` for the `:326` label) · `discord-cc-bridge.py:205-209` (Kyle's inbound with an empty `kind`) — **neither writes `langston_outbound`** |
| who **mutates** | none — pure stdin→stdout |
| ★ who **deletes** | none — the filter keeps nothing |
| who **schedules** | the watcher command's `while true … tail -F` loop (`MEMORY.md:19`) — one per session |

---

## 4. FINDINGS

**F-1 — the mechanism.** `:348-349` finds the LAST owner marker in `body_raw`; `:366-367` `continue`s when its owner is not this alias. The marker strip at `:378-379` sits inside `if mo:`, **below** that `continue`, and the name check at `:387` is never reached. *(Verified by Langston at the stamped sha.)*

**F-2 — the bridge names the addressee on non-alert replies only.** `:530` gates the auto-lead; `:532-533` prepend `"{recipient} — "` whenever the reply does not already open with that name. ⇒ **on a non-alert reply the first anchored name is the addressee, mechanically.** On an alert reply it is whatever Langston wrote.

**F-3 — the addressee join: the opening name IS the triggering author on all 104 dropped replies.** *Measured 2026-09-11T16:07:00Z.* Population: `kind == "langston_outbound"`, `ts >= "2026-09-03"`, opening per the filter's own `NAMES` patterns anchored like `ADDRESS_START_RE`, last `ALERT_OWNER_RE` owner ≠ that alias. Join: `reply_to` → the non-`langston_outbound` row(s) with that `message_id` → `sender` or `sender_username` (discriminator stripped) → alias.

| alias | MATCH | MISMATCH | alert path | non-session author | no triggering row |
|---|---|---|---|---|---|
| OLD Claude | 28 | 0 | 0 | 0 | 0 |
| NEW Claude | 28 | 0 | 0 | 0 | 0 |
| ANALYST Claude | 29 | 0 | 0 | 0 | 0 |
| Infra Claude | 19 | 0 | 0 | 0 | 0 |

**Controls, both run:** POSITIVE — message `1547973065172979794` (my 14:12Z dispatch) resolves to `CC-INFRA`, asserted before the join ran. **NEGATIVE — a fixture reply opening *NEW Claude* that answers that same dispatch classifies MISMATCH, and its twin opening *Infra Claude* classifies MATCH** — so the join can report a failure, and the 0 column is a measurement. **The alert path is populated, not an empty category:** 150 `langston_outbound` rows since 2026-09-03 answer an alert inbound row, and **0 of the 150 open with a session name** — which is why none enter the key and the table's alert-path column is 0.

**F-4 — there is no recipient field** in the `langston_outbound` mirror row (`:535`), so the filter can only re-recognise the bridge's prefix as text. Adding one is out of scope.

**F-5 — the test harness runs as `CC-A` only** (`test-wake-filter-cuts.py:74`), so every new case is written from CC-A's side.

**F-6 — the WAKE line format has one downstream parser besides the sessions:** `wake_narration.py:50-55`, keyed on the line's opening label. **An appended routing tag leaves the label, and so the classification, unchanged.** Relabelling the line (for example as `WAKE[ALERT-OWNER`) would silently move these wakes into the "alert routed" row, which `#995` withdrew as a tautology.

**F-7 — the live filter is hand-copied** (scope 1.a): no job installs it, and `cb9c14c89` records *"Mirror and live patched in the same run."* This batch adds an instance of `#1004`'s class.

**F-8 — no pre-governance coverage, and the System Manual is silent by scope** (§1, rows 4 and 6).

---

## 5. THE PLAN — every item points back at its finding

| # | item | from | verification |
|---|---|---|---|
| **P-1** | **Restructure the `langston_outbound` branch into the scope's §2.0 order:** (1) last owner from `body_raw` (unchanged); (2) strip ALL markers from `text` and `full`, unconditionally, before any decision; (3) `OPEN_RE` per alias = `^[\s*_~`>#:\".\-]*(?:<NAMES[ALIAS]>)\b`, no separator requirement, tested on stripped `full`; (4) owner suppression only when the owner is not this alias **and** `OPEN_RE` does not match; (5) the `CC-WAKE` tag and `MY_RE` fall-through as today. | F-1, F-2, F-3 | the existing 13 cases pass; new cases (a)(b)(c) (scope OBJ-2) |
| **P-2** | **The routing tag:** when a wake comes through step (4)'s exception — owner not this alias, reply opens with this alias — append `  [alert routed to <OWNER>]` to the WAKE line. **The `WAKE[LANGSTON->` label is kept.** | scope OBJ-4, F-6 | case (a) asserts the tag names `CC-B`; `LANG_MARKER_MINE_NAMED` asserts no tag; `wake_narration.py`'s classifier still returns "Langston" for a tagged line (a direct call on a sample line) |
| **P-3** | **Tests:** add cases (a), (b), (c) to `test-wake-filter-cuts.py`, from CC-A's side, with the tag assertions from P-2. | F-5 | the harness's own "the instrument speaks" guard still passes; 16 of 16 |
| **P-4** | **Commit the replay and join** as `scripts/analysis/replay-wake-lead-name.py`: fetch the rows over SSH, run the filter per alias before and after, then join. The row predicate and the author field come from §4 F-3, and **both controls are assertions that stop the run.** | scope OBJ-1, F-3 | before/after per alias; dropped-with-opening-name → 0; wakes on replies NOT opening with the name identical; every newly-waking row joins MATCH, and every one with an other-owner marker carries the tag |
| **P-5** | **Install:** copy the repo file over `C:\Users\kyleg\.claude\cc-wake-filter.py`, compare sha256 with line endings ignored, and post one crew note to re-arm the watcher (a running watcher holds the code it armed with). | scope OBJ-3, F-7 | sha match; after my own re-arm, a real reply to Infra Claude ending in another owner's marker produces a tagged `WAKE` line |
| **P-6** | **Governance:** `ALERT_HANDLING_PROTOCOL.md` `:27` (non-alert replies only), `:26-29` and `:32` (an opening name wakes despite another owner's marker; the tag) · System Impact Map `:3638-3642` · `RUNNING_ISSUES` `#1040` (closed with the numbers) and a `#1004` amendment · `BATCH_CATALOG` · `PHASE_19_PLAN` 4.51 · completion report. | F-2, F-6, F-7 | Step 10 ledger |

**Nothing in the plan is `UNAUDITED`.**

---

## 6. PLAIN-LANGUAGE SUMMARY

**What the audit found:** when the reviewer answers one Claude session, he often tacks alert notes for other sessions onto the end, and the wake filter reads those notes as "not for you" — so it stays silent even though the reply starts with that session's name. I checked all 104 such replies since 09-03 against the message each one was answering. **Every one was genuinely addressed to the session it named first**, so "a reply that starts with your name wakes you" is the right rule. The only other thing that reads the wake lines is a measurement script, and adding a short routing note at the end of the line does not change what it counts.

**The plan:** reorder one block of the filter so the name at the start of a reply is checked before those alert notes can silence it, and add a routing note, so a woken session can see the alert belongs to someone else. Prove it by re-running the same 104-reply check before and after, plus three new test cases. Then copy the filter to the laptop and have every session restart its watcher.

---

## 7. STEPS 4-6 RECORD *(2026-09-11)*

**Step 4 — APPROVED by Langston at `c05e9d1fa`, 16:48Z.** He re-derived rather than took on report:
- the diff (+49/-18, three files);
- **both suite runs** — AFTER 19/19, BEFORE exactly 4 FAIL: (a), and conditions 3, 4, 5;
- `OWNER_CANON` cannot KeyError, because `ALERT_OWNER_RE` is built from the same tuple;
- `wake_narration.classify()` returns `'Langston'` on three tagged lines;
- a whole-tree search for `WAKE[` consumers found no third reader.

**RULED ON REPORTED FACT, his words:** the 107-row replay table — he read the join, the sentinel ordering and the stop conditions, but did not re-run it.
**FINDING-1** was a comment claiming the replay's key was independent of `OPEN_RE`; it is the same predicate. Fixed in `e4d6d01db`, no re-review. **FINDING-2** was accepted as stated: condition 3 has zero real rows, so it is pinned by fixture only, and it removes an accidental exemption rather than losing a wake.

**Step 5 — CI green 4/4** on run `34623482499` (head `aee2bc191`, which contains `c05e9d1fa`). My own run `34623470603` was cancelled by a later push; each job was verified on the covering run.

**Step 6 — P-5, the install (no staging surface — this is a laptop tool, so `dt-deploy` does not apply).**

| check | result |
|---|---|
| rollback copy | `C:\Users\kyleg\.claude\cc-wake-filter.py.pre-lead-name-20260911` |
| live file == `c05e9d1fa` blob, **modulo line endings** (condition 2) | before install **False** · after **True** · sha256 of the LF form `ac327ab0a1cc…` on both sides · installed 16:49:09Z |
| suite against the installed live file | 19/19 |

**Condition 1 — per session, from the OBJECT: the watcher process's start time against the 16:49:09Z install** (`Win32_Process`, command line `cc-wake-filter.py <ALIAS>`). **A posted request is not evidence, and silence is not the fix working.**

| session | watcher start (UTC) | status at 16:52Z |
|---|---|---|
| CC-INFRA | 16:51:28 | ✅ **VERIFIED** — and a liveness probe at 16:51:51Z came back through it |
| CC-B | 14:53:48 | ⏳ **UNVERIFIED** — running the pre-install code |
| CC-C | 09:40:26 | ⏳ **UNVERIFIED** — running the pre-install code |
| CC-A | — | ⚠️ **NO WATCHER RUNNING AT ALL** — not a re-arm gap, a session that cannot be woken by anything right now |

A crew note asking for the re-arm went out at 16:50Z. A process watch reports each session as its watcher restarts. **The close will carry this table as measured then, not this snapshot.**

**Step 7, still owed:** a REAL Langston reply to a session, ending in another owner's marker, producing a tagged `WAKE` line on a re-armed watcher.
