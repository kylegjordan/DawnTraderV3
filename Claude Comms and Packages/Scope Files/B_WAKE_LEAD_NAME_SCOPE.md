# B-WAKE-LEAD-NAME — SCOPE (Step 1)

change-class: non_architecture

**Owner:** Infra Claude (CC-INFRA) · **Issue:** `#1040` · **Plan:** `PHASE_19_PLAN.md` row 4.51, after 4.5 (`B-WAKE-QUIET`) · **Found in:** `B-LANGSTON-CONTEXT` pre-audit §21.7 · **Card:** delivery board, Status = Scope
**Why `non_architecture`:** one branch of one filter file on the laptop, used by the four sessions' wake watchers. No `server/`, `client/` or `shared/` code, no Helsinki service, no staging deploy, no change to what any bridge writes.

---

## 0. THE PROBLEM, MEASURED

Langston ends most replies with `[[ALERT … owner=X]]` markers — his §10.5 triage for every due alert. **The wake filter treats a marker naming another session as "not mine" and `continue`s before it checks whether the reply opens with this session's name.** So a reply addressed to me that happens to end with another session's triage never wakes me.

**Replay, 2026-09-11:** every `langston_outbound` row since 2026-09-03 (409) through the live filter, per alias:

| session | replies opening with its name | never woke it | of those, last marker names another owner |
|---|---|---|---|
| OLD Claude | 50 | 25 | 25 |
| NEW Claude | 50 | 27 | 27 |
| ANALYST Claude | 134 | 26 | 26 |
| Infra Claude | 24 | 15 | 15 |

★ **For every session the dropped count equals the other-owner-marker count exactly** — the mechanism, not a coincidence. **Found because two of Langston's replies to `B-LANGSTON-CONTEXT` §20 never woke Infra Claude.**

**Mechanism, `comms-infra/laptop/cc-wake-filter.py:366-367`** (identical, line endings ignored, to the live `C:\Users\kyleg\.claude\cc-wake-filter.py`):
```
if mo.group(1).upper() != ALIAS:
    continue
```
…reached before the name check at `:387` (`elif MY_RE.search(full)`).

---

## 1.a ARCHITECTURAL READ

| source | what it says | bearing |
|---|---|---|
| `SYSTEM_IMPACT_MAP.md:2790` | `cc-wake-filter.py` is repo-canonical at `comms-infra/laptop/`, the wake path for the desktop sessions | the file this batch changes; the live copy is installed from it |
| `SYSTEM_IMPACT_MAP.md:2822` | display-name routing: the filter routes by the sessions' posted names | the name registry this fix reuses (`NAMES` / `MY_RE`) — unchanged |
| `SYSTEM_IMPACT_MAP.md:2826` | §10.5 owner-routing, B-ALERT-PROTOCOL `#340` | the marker's purpose — preserved |
| `SYSTEM_IMPACT_MAP.md:3638-3640` | B-WAKE-QUIET: the marker became a suppressor; *"28 markers across 25 messages, of which 21 still wake their owner through the prose-name fall-through; only 4 were marker-only"* | the reach `#995` measured — **the OWNER direction only** (see 1.b) |
| `SYSTEM_IMPACT_MAP.md:3642` | *"a running Monitor holds the code it armed with, so every change here is inert for any session that has not re-armed"* | OBJ-3: the fix reaches a session only when its watcher re-arms |
| `SYSTEM_MANUAL.md` | no entry for the wake filter (grep for `cc-wake-filter`, `wake watcher`, `wake-filter`: none) | comms infrastructure is System Impact Map scope, not System Manual scope — judged, not skipped |

**Census at the component:** WRITES the input — the Langston bridge, which **auto-leads every reply with the addressee's name** (`comms-infra/discord/discord-langston-bridge.py:97` `resolve_recipient_name`, enforced at `:532`; the repo copy is byte-identical to the live one) — that is why an opening name is a reliable addressee signal. READS — each session's wake-watcher Monitor (four laptop sessions). MUTATES / DELETES / SCHEDULES — none; the filter is a pure stdin→stdout stage. **TEST — `scripts/analysis/test-wake-filter-cuts.py`** (13 cases, `#995`), one subprocess per case against the LIVE filter.

---

## 1.b PROVENANCE READ

**Corpora searched:** `git log -S "ALERT_OWNER_RE" --reverse` (not path-limited) → `4142d301c`, `d24287669`, `0e5f8f320`, `40b84932c`; `git log -S "A SUPPRESSOR ONLY, NEVER A WAKER"` → `cb9c14c89`; `RUNNING_ISSUES.md` `#995` and `#340`; the System Impact Map rows above; the test file.

### TIER 1 — the `langston_outbound` marker branch (its behaviour changes)
**Introduced — `4142d301c`, 2026-06-23, B-ALERT-PROTOCOL (`#340`), verbatim:**
> *"OBJ-2 — bridge is_alert prompt: Langston ends triage with [[ALERT id owner action]]. OBJ-3 — cc-wake-filter.py routes the wake to the named owner (mirror synced)."*

**Changed — `cb9c14c89`, 2026-09-03, B-WAKE-QUIET OBJ-11 (`#995`), verbatim:**
> *"OBJ-11 the alert-owner marker becomes a suppressor only, never a waker. The dedicated wake was a duplicate: inject-due-alerts puts the full due list with full ids at the top of every prompt in every session. A marker naming another session still suppresses; a marker naming me falls through to the ordinary rules, so Langston triage still wakes me when he addresses me by name."*

**What `#995` measured, and what it did not** (`RUNNING_ISSUES` `#995`, Langston at Step 8): *"the 28 markers sit in 25 messages, and 21 of the 25 STILL WAKE THE OWNER through the prose-name fall-through."* ⇒ **the marker's OWNER was measured. A reply whose addressee is NOT the marker's owner was neither measured nor ruled on.** At that time his replies rarely carried other sessions' triage; they now routinely do.

**DISPOSITION: (2) RELEVANT, NEEDS UPDATING TO TODAY'S INTENT.** The intent stands — another session's triage must not wake me. The unintended reach contradicts `cb9c14c89`'s own stated guarantee: *"Langston triage still wakes me when he addresses me by name."* A reply that opens with my name IS him addressing me by name.

### TIER 2 — read or called, unchanged
- `ALERT_MARKER_STRIP` (`:378-379`) — strips the markers before the name check so `owner=CC-A` cannot satisfy `MY_RE`. **(1) relevant and correct**; this fix relies on it.
- `MY_RE` / `NAMES` — the per-alias name patterns. **(1) relevant and correct**; reused, anchored at the opening.
- The bridge's auto-lead — **(1) relevant and correct**; it is what makes the opening name the addressee by construction.

### ALREADY DECIDED? (§9.5(b-ii))
Searched `#995`, `#340` and the System Impact Map for a decision to suppress replies ADDRESSED to a session: **none**. `#995` decided the opposite in words (the guarantee above). **This is not a re-litigation.** The existing test's `LANG_MARKER_THEIRS` case — *"NEW Claude — yours."* with an `owner=CC-B` marker, run as CC-A — is a reply to someone else and must stay silent; **no existing case covers a reply opening with my own name that ends with another owner's marker.**

---

## 2. OBJECTIVES

**OBJ-1 — A Langston reply that OPENS with this session's name wakes it, whatever alert markers it ends with.**
*Opening* = the first name after leading whitespace, markdown or punctuation, using the filter's existing per-alias `NAMES` patterns.
**Verify:** the same replay (all `langston_outbound` rows since 2026-09-03, per alias, through the FIXED filter): **replies opening with the session's name that do not wake it → 0 for all four sessions** (was 25 / 27 / 26 / 15).

**OBJ-2 — Nothing else changes.**
**Verify, both directions:**
- per alias, the wake count on replies that do **not** open with that session's name is **identical** before and after the fix;
- `scripts/analysis/test-wake-filter-cuts.py` keeps all 13 existing cases passing, **plus three new ones**:
  - (a) `"OLD Claude — …" + [[ALERT owner=CC-B]]`, run as CC-A → **WAKE** (the defect, now a regression guard);
  - (b) `"Kyle — … OLD Claude, this bit is for you … " + [[ALERT owner=CC-B]]` → **silent** (a mid-body mention with another owner's triage stays suppressed — the #995 cut is untouched);
  - (c) `"NEW Claude — …" + [[ALERT owner=CC-A]]`, run as CC-A → **silent** (marker mine, prose someone else — unchanged).

**OBJ-3 — The fix reaches every session.**
**Verify:** repo copy and live laptop copy identical (sha256, line endings ignored). **A running Monitor holds the code it armed with** (System Impact Map `:3642`), so each session must re-arm — **one crew post** saying so, and a replay-equivalent live check that a real reply to Infra Claude ending in another owner's marker produces a `WAKE` line after re-arm.

---

## 3. OUT OF SCOPE
The `CC-WAKE` tag branch · the heartbeat (`B-HEARTBEAT-RESCOPE`, 4.7) · push-notice suppression · Kyle/voice routing · `cc_outbound` routing · any change to what Langston's bridge writes · the rules-layer question (`B-RULES-LAYER`, 4.6).

## 4. BLAST RADIUS AND ROLLBACK
One branch of one file; four consumers, all laptop Monitors; no server, no Helsinki service, no staging. **Rollback:** revert the commit and copy the previous file over the live one; watchers re-arm.

## 5. GOVERNANCE THIS BATCH OWES
`RUNNING_ISSUES` `#1040` (closed with the replay numbers) · System Impact Map content update to the `:3638` entry (the owner-direction limit and the fix) · `BATCH_CATALOG` · `PHASE_19_PLAN` row 4.51 · completion report. System Manual: not applicable (judged above).
