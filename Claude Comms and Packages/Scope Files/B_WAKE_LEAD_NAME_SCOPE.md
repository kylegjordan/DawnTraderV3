# B-WAKE-LEAD-NAME — SCOPE (Step 1, r2)

change-class: non_architecture

**Owner:** Infra Claude (CC-INFRA) · **Issue:** `#1040` · **Plan:** `PHASE_19_PLAN.md` row 4.51, after 4.5 (`B-WAKE-QUIET`) · **Found in:** `B-LANGSTON-CONTEXT` pre-audit §21.7 · **Card:** delivery board
**Why `non_architecture`:** one branch of one filter file on the laptop, used by the four sessions' wake watchers, plus its test and two governance documents. No `server/`, `client/` or `shared/` code, no Helsinki service, no staging deploy, no change to what any bridge writes.

> **r2 — LANGSTON STEP 1, 2026-09-11 15:52Z: APPROVED WITH REVISIONS.** Every revision is folded below, and each place is marked **[r2]**. His three required amendments became OBJ-1's join, the strip-first order in §2.0, and the new OBJ-4.

---

## 0. THE PROBLEM, MEASURED

Langston ends most replies with `[[ALERT … owner=X]]` markers — his §10.5 triage for every due alert. **The wake filter treats a marker naming another session as "not mine" and `continue`s before it checks whether the reply opens with this session's name.** So a reply addressed to me that happens to end with another session's triage never wakes me.

**Replay, 2026-09-11** — every row since 2026-09-03 through the live filter, per alias:

| session | replies opening with its name | never woke it | of those, last marker names another owner |
|---|---|---|---|
| OLD Claude | 50 | 25 | 25 |
| NEW Claude | 50 | 27 | 27 |
| ANALYST Claude | 134 | 26 | 26 |
| Infra Claude | 24 | 15 | 15 |

★ **For every session the dropped count equals the other-owner-marker count exactly** — the mechanism, not a coincidence.
⚠️ **[r2] These magnitudes are `RULED ON REPORTED FACT` for Step 1** — Langston did not re-derive them, and OBJ-1 re-runs them. **THE EXACT ROW PREDICATE, so he can re-run it at Step 4:**
- **population:** rows of `/var/log/cc-discord-inbox.jsonl` with `kind == "langston_outbound"` and `ts >= "2026-09-03"` (string comparison on the row's ISO timestamp) — 409 rows;
- **"opens with the name":** `re.match(r"^[\s*_~`>#:\".\-]*" + re.escape(<display name>) + r"\b", text, re.I)`, where the display name is `OLD Claude` / `NEW Claude` / `ANALYST Claude` / `Infra Claude`;
- **"never woke it":** the live filter, run as that alias over the selected rows behind a `==> /var/log/cc-discord-inbox.jsonl <==` header, emitted no line starting `WAKE[`;
- **"last marker names another owner":** the LAST `\[\[ALERT[^\]]*owner=([A-Za-z-]+)` match in `text`, uppercased, is not the alias.

**Mechanism, `comms-infra/laptop/cc-wake-filter.py:366-367`** (identical, line endings ignored, to the live `C:\Users\kyleg\.claude\cc-wake-filter.py`):
```
if mo.group(1).upper() != ALIAS:
    continue
```
…reached before the name check at `:387` (`elif MY_RE.search(full)`). Langston verified this himself at the stamped sha; the strip at `:378-379` sits inside `if mo:`, **below** the `continue`.

---

## 1.a ARCHITECTURAL READ

| source | what it says | bearing |
|---|---|---|
| `SYSTEM_IMPACT_MAP.md:2790` | `cc-wake-filter.py` is repo-canonical at `comms-infra/laptop/`, the wake path for the desktop sessions | the file this batch changes |
| `SYSTEM_IMPACT_MAP.md:2822` | display-name routing: the filter routes by the sessions' posted names | the name registry this fix reuses (`NAMES`) — unchanged |
| `SYSTEM_IMPACT_MAP.md:2826` | §10.5 owner-routing, B-ALERT-PROTOCOL `#340` | the marker's purpose — preserved, and made visible (OBJ-4) |
| `SYSTEM_IMPACT_MAP.md:3638-3640` | B-WAKE-QUIET: the marker became a suppressor; *"28 markers across 25 messages, of which 21 still wake their owner through the prose-name fall-through; only 4 were marker-only"* | the reach `#995` measured — **the OWNER direction only** (1.b) |
| `SYSTEM_IMPACT_MAP.md:3642` | *"a running Monitor holds the code it armed with, so every change here is inert for any session that has not re-armed"* | OBJ-3 |
| `ALERT_HANDLING_PROTOCOL.md:20, :26-29, :32` | **[r2]** the owner token set mirrored in the filter (`:20`); the `#995` change and *why it is safe* (`:26-27`); *"name them in the prose"* (`:29`); routing to the named owner (`:32`) | **`:27`'s safety argument is over-broad (next row) and this batch changes the behaviour `:27` and `:32` describe — a required governance update, §5** |
| `SYSTEM_MANUAL.md` | no entry for the wake filter — full-file search for `cc-wake-filter`, `wake watcher`, `wake-filter`: **0**; the same search for `regime`: 429 | comms infrastructure is System Impact Map scope — judged, not skipped |

### ⛔ [r2] WHY THE OPENING NAME IS THE ADDRESSEE — THE MECHANICAL ARGUMENT, AND WHERE IT DOES NOT HOLD
- **The bridge's auto-lead applies to every NON-ALERT reply, not every reply.** `comms-infra/discord/discord-langston-bridge.py:530` gates it on `if not task.get("is_alert"):`. The comment at `:527-529` gives the reason: an alert's addresser is the alerts webhook, with no session to wake. ⚠️ **My r1 sentence "auto-leads every reply" was false for exactly the class this batch governs.** The same over-broad sentence is the safety argument at `ALERT_HANDLING_PROTOCOL.md:27`, which this batch corrects.
- **For a non-alert reply the first anchored name IS the addressee, mechanically.** `:531` resolves the recipient, and `:532-533` prepend `"{recipient} — "` **whenever the reply does not already open with that name** (`cleaned[:len(recipient)+2].lower().startswith(recipient.lower())`). So either Langston opened with the addressee, or the bridge put it there. His 15:22Z reply, *"Infra Claude — **NEW Claude — …"*, resolves correctly under this rule.
- **There is no recipient field to key on instead.** `:535` mirrors the reply as `mirror_event("langston_outbound", channel_id=…, message_id=…, reply_to=…, text=…)`. The filter can only re-recognise the prefix as text, and adding a field is out of scope. **"Key on the bridge's prefix" and "opens with the name" are the same operation.**
- **For an alert reply the opening name is whatever Langston wrote.** OBJ-1's join cannot confirm an addressee there, so those rows are counted separately (OBJ-1).
- **The anchor reuses the bridge's own shape** — `ADDRESS_START_RE` at `:83`, `^[\s*_~`>#:\".\-]*langston\b` — built per alias from the filter's `NAMES[ALIAS]` patterns. **No separator is required**: Langston's own leads vary, and only the bridge's is always `" — "`.

**Census at the component:** WRITES the input — the Langston bridge (above). READS — each session's wake-watcher Monitor (four laptop sessions). MUTATES / DELETES / SCHEDULES — none; the filter is a pure stdin→stdout stage. **TEST — `scripts/analysis/test-wake-filter-cuts.py`** (13 cases, `#995`), one subprocess per case against the LIVE filter.

### ⛔ [r2] INSTALLED OUTSIDE THE TREE — THE `#1004` CLASS, STATED PLAINLY
The live filter at `C:\Users\kyleg\.claude\cc-wake-filter.py` is **copied by hand.** Evidence:
- **nothing installs it** — a repo search for `cc-wake-filter` across shell, PowerShell, Node, Python and JSON finds only the filter itself, its two tests or analysis scripts, and two bridges that mention it;
- **its own history says so** — `cb9c14c89`: *"Mirror and live patched in the same run and verified content-identical."*
- **`#402` is not a sync job for it** — `#402` is `B-CANONICAL-BRIDGE-CHURN`, a generated `bridge/canonical/` mapping file re-stamped every build.

⇒ **This batch adds one more instance of `#1004`'s class** — an executable the running system uses that is not derived from the repo. It does not fix the class. OBJ-3 verifies repo == live by hash after the copy, and a `#1004` amendment records the instance at Step 10.

---

## 1.b PROVENANCE READ

**Corpora searched:** `git log -S "ALERT_OWNER_RE" --reverse` (not path-limited) → `4142d301c`, `d24287669`, `0e5f8f320`, `40b84932c`; `git log -S "A SUPPRESSOR ONLY, NEVER A WAKER"` → `cb9c14c89`; `git log -- comms-infra/laptop/cc-wake-filter.py` (8 commits, 2026-08-23 → 2026-09-04); `RUNNING_ISSUES.md` `#995`, `#340`, `#402`, `#1004`; `ALERT_HANDLING_PROTOCOL.md`; the System Impact Map rows above; the test file.

### TIER 1 — the `langston_outbound` marker branch (its behaviour changes)
**Introduced — `4142d301c`, 2026-06-23, B-ALERT-PROTOCOL (`#340`), verbatim:**
> *"OBJ-2 — bridge is_alert prompt: Langston ends triage with [[ALERT id owner action]]. OBJ-3 — cc-wake-filter.py routes the wake to the named owner (mirror synced)."*

**Changed — `cb9c14c89`, 2026-09-03, B-WAKE-QUIET OBJ-11 (`#995`), verbatim:**
> *"OBJ-11 the alert-owner marker becomes a suppressor only, never a waker. The dedicated wake was a duplicate: inject-due-alerts puts the full due list with full ids at the top of every prompt in every session. A marker naming another session still suppresses; a marker naming me falls through to the ordinary rules, so Langston triage still wakes me when he addresses me by name."*

**What `#995` measured, and what it did not** (`RUNNING_ISSUES` `#995`, Langston at Step 8): *"the 28 markers sit in 25 messages, and 21 of the 25 STILL WAKE THE OWNER through the prose-name fall-through."* ⇒ **the marker's OWNER was measured. A reply whose addressee is NOT the marker's owner was neither measured nor ruled on.** Replies then rarely carried other sessions' triage; they now routinely do.

**DISPOSITION: (2) RELEVANT, NEEDS UPDATING TO TODAY'S INTENT.** The intent stands: another session's triage must not wake me. The unintended reach contradicts `cb9c14c89`'s own guarantee — *"Langston triage still wakes me when he addresses me by name."*

### TIER 2 — read or called
- `ALERT_MARKER_STRIP` (`:378-379`) — **(1) relevant and correct, but moved** [r2]: today it runs only inside `if mo:`, below the `continue`, and is safe only because a marker cannot sit at byte 0. This file has already re-created that ordering defect one layer along twice (its own comments at `:369` and `:375`). §2.0 makes the order a design.
- `NAMES` / `MY_RE` — **(1) relevant and correct**; reused, anchored at the opening.
- The bridge's auto-lead (`:530-533`) — **(1) relevant and correct, and narrower than r1 said** — non-alert replies only.

### ALREADY DECIDED? (§9.5(b-ii))
Searched `#995`, `#340`, the protocol and the System Impact Map for a decision to suppress replies ADDRESSED to a session: **none**. `#995` promised the opposite in words. **This is not a re-litigation.** The existing test's `LANG_MARKER_THEIRS` case — *"NEW Claude — yours."* with an `owner=CC-B` marker, run as CC-A — is a reply to someone else and stays silent. **No existing case covers a reply that opens with my own name and ends with another owner's marker.**

---

## 2. OBJECTIVES

### 2.0 [r2] ORDER OF OPERATIONS — BY DESIGN, NOT BY LUCK
In the `langston_outbound` branch: **(1)** read the LAST owner marker from the raw body (as today) → **(2)** strip ALL markers from both `text` and `full`, **unconditionally** → **(3)** decide the opening name on the stripped text → **(4)** apply the owner suppression, unless (3) matched → **(5)** name fall-through as today. Both decisions read stripped text, whatever the marker's position.

**OBJ-1 — A Langston reply that OPENS with this session's name wakes it, whatever alert markers it ends with.**
**Verify, and [r2] not by the tautology alone:**
- **(a)** the §0 replay through the fixed filter: dropped-with-opening-name → 0 for all four sessions (was 25 / 27 / 26 / 15). ⚠️ True by construction once the key IS the opening name, so it proves the implementation, not the key.
- **(b) THE JOIN — this is what proves the key.** For every reply that NEWLY wakes under the fix: resolve its `reply_to` to the triggering row, **keyed on `(message_id, kind)`** because the inbox log fans one Discord message into several rows by kind. Take that row's author and map it to its session. **Assert opening name == triggering author's session.** Prediction: 100% on the non-alert path; **any mismatch is a finding, not noise.** Rows on the alert path (no session author to join to) are reported as their own count, "addressee not verifiable by join", never folded into the 100%.

**OBJ-2 — Nothing else changes.**
**Verify, both directions:**
- per alias, the wake count on replies that do **not** open with that session's name is **identical** before and after the fix;
- `scripts/analysis/test-wake-filter-cuts.py`: the 13 existing cases still pass, **plus three new ones**:
  - (a) `"OLD Claude — …" + [[ALERT owner=CC-B]]`, run as CC-A → **WAKE** (the defect, now a regression guard);
  - (b) `"Kyle — … OLD Claude, this bit is for you … " + [[ALERT owner=CC-B]]` → **silent** (a mid-body mention with another owner's triage stays suppressed — the `#995` cut is untouched);
  - (c) `"NEW Claude — …" + [[ALERT owner=CC-A]]`, run as CC-A → **silent** (marker mine, prose to someone else — unchanged).

**OBJ-3 — The fix reaches every session.**
**Verify:** repo copy and live laptop copy identical (sha256, line endings ignored) after the hand copy, which is an instance of `#1004`'s class (1.a). **A running Monitor holds the code it armed with** (System Impact Map `:3642`), so: **one crew post** telling every session to re-arm, and **one live check** that a real reply to Infra Claude ending in another owner's marker produces a `WAKE` line after re-arm.

**OBJ-4 [r2] — The wake line must not hide the routing.**
Today the name fall-through prints marker-stripped text, and that only ever happened when the marker was MINE. Under the fix a session can wake on a triage whose *other-owner* routing has been deleted from the line it sees, which is the double-claim `#340` exists to prevent. ⇒ **when a reply wakes this session through the opening name while its last marker names a different owner, the WAKE line carries `[alert routed to <OWNER>]`.**
**Verify:** new test case (a) asserts the tag is present and names `CC-B`; test case "marker owns me AND he addresses me" (existing, `LANG_MARKER_MINE_NAMED`) asserts **no** tag; and in the OBJ-1 replay, every newly-waking row whose last marker names another owner carries the tag.

---

## 3. OUT OF SCOPE, AND ONE RESIDUAL NAMED SO NOBODY REDISCOVERS IT
**Out of scope:** the `CC-WAKE` tag branch · the heartbeat (`B-HEARTBEAT-RESCOPE`, 4.7) · push-notice suppression · Kyle/voice routing · `cc_outbound` routing · any change to what Langston's bridge writes, including a recipient field · the rules-layer question (`B-RULES-LAYER`, 4.6) · fixing `#1004`'s class.

⚠️ **[r2] RESIDUAL, BY DESIGN, NOT A DEFECT:** *"Kyle — OLD Claude, this bit is yours … `[[ALERT owner=CC-B]]`"* **stays silent for CC-A.** That is OBJ-2(b), and it is still a real address to CC-A being dropped. It is the cost of `#995`'s cut, which this batch deliberately leaves in place.

## 4. BLAST RADIUS AND ROLLBACK
One branch of one file, plus one test file; four consumers, all laptop Monitors; no server, no Helsinki service, no staging. **Rollback:** revert the commit, copy the previous file over the live one, and re-arm the watchers.

## 5. GOVERNANCE THIS BATCH OWES
- `RUNNING_ISSUES` `#1040`, closed with the replay and join numbers · `#1004` amendment: one more hand-installed executable.
- **[r2] `ALERT_HANDLING_PROTOCOL.md` — REQUIRED:** `:27`'s "auto-leads every reply" corrected to non-alert replies only; `:26-29` and `:32` updated for an opening name that wakes despite another owner's marker, and for the new routing tag; `:20`'s standing drift warning honoured by editing the protocol and the filter in the same commit.
- System Impact Map: content update to the `:3638-3642` entry (the owner-direction limit, the fix, the tag).
- `BATCH_CATALOG` · `PHASE_19_PLAN` row 4.51 · completion report.
- System Manual: not applicable (judged in 1.a).
