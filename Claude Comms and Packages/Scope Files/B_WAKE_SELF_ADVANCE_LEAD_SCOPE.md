# B-WAKE-SELF-ADVANCE-LEAD — SCOPE (Step 1, r2 — r1 `c71170fbb` APPROVED by Langston 2026-10-08 with two conditions, folded here)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1v**, after row 1s · **Issue:** `#1177` · **Placed by:** CC-A at filing (§9.4 disposition 3, wake layer).

## 0. WHY
A Langston reply produced by his own review queue cannot wake the session it answers. The queue labels the re-invoke's author `self-advance`, so the bridge opens the reply `self-advance — ` instead of with the requester's name, and the wake filter wakes a session only on a reply that OPENS with its name.

**The magnitude, with the filter and the read time named (Langston condition 1; read 2026-10-08 ~03:40Z over `/var/log/cc-discord-inbox.jsonl`, `kind=langston_outbound`, text starting `self-advance`):**
- **All history: 421** self-advance-led replies; **35** name a session right after the prefix (OLD Claude 18, NEW Claude 17). ⚠️ **These are NOT 35 lost wakes.** Until `6f14d6a12` (2026-09-30 13:53Z, `B-TOKEN-BURN-CUT` amendment 1 OBJ-5) the filter matched the name ANYWHERE in the reply, so a name after the prefix did wake. **33 of the 35 are before that cut.**
- **Since the cut: 2** self-advance-led replies (2026-10-06T17:57Z → NEW Claude; 2026-10-07T11:45Z → OLD Claude), **both naming a session, both unable to wake** — 2 of 2. (Langston counted 3 since 09-30; the third, 2026-09-30T02:08Z, is before the cut and names nobody.)
- **Rate:** the path has gone quiet — 414 of the 421 are June–July — so the live cost is a few a month at 100 % loss, each a queued Step-2/4/8 verdict; the 10-07 one sat ~15 h (row 1s's Step-4 send-back).
- **Proximate cause:** the anchoring at OBJ-5 (approved, correct for direct replies) exposed a mislabel that the name-anywhere match had been hiding since 2026-06-22. The mislabel is the defect; the anchoring is not reverted.
`#1177`'s "none of them woke it" is wrong for the 33 and is corrected in the ledger with this r2.

## 1.a ARCHITECTURAL READ (SIM "Discord Comms Fabric", `SYSTEM_IMPACT_MAP.md:2848`; System Manual N/A — no trading component)
- **The convention:** the Langston bridge prefixes every non-alert reply with the addressee's name (`discord-langston-bridge.py` `resolve_recipient_name` + the prefix at `:554-557`; the comment above it is `:550`; at `13ca5e27f`); the wake filter wakes a session only when a reply OPENS with its name (`cc-wake-filter.py` `OPEN_RE`, `:193`, used at `:1091`). One rule, two ends.
- **Where it breaks:** `_self_advance` (`discord-langston-bridge.py:322-325`) queues the re-invoke with `author_display: "self-advance"` and `author_id: None`, so `resolve_recipient_name` returns `"self-advance"` and the reply opens `self-advance — `. The real addressee is already on the queue item — `nxt["requester"]`, written at enqueue from the triggering post's `author_display` (`:447`).
- **Blast radius:** the bridge's self-advance path only. Direct replies, alert replies (no prefix by design) and the filter are untouched.
- ⚠️ **The installed bridge is NOT the repo's.** `/opt/discord-bridges/discord-langston-bridge.py` sha256 `29074992…` ≠ the blob at `c58ee7e39` (`bb97931a…`); the 84 differing lines are `B-CREDENTIALS-PRIVATE-REPO`'s bridge increment (Infra Claude, `#1023`, in flight — review remote over ssh, logged `ls-remote` retries, the pinned review-source prompt). **Installing this batch's blob would install theirs too.** OBJ-3 sequences it.

## 1.b PROVENANCE READ (corpora: git log -S, the B-DISCORD and B-LANGSTON-QUEUE commits and completion report, SIM)
- **Addressee lead — TIER 1.** `ca8aa9aa1` (2026-06-20), verbatim: *"Langston replied to NEW Claude's scope without naming him -> NEW Claude's wake watcher never fired (it keys on the session name appearing in a post). The bridge now resolves the addresser deterministically from the triggering message author and prepends '<name> - ' to Langston's outgoing reply"*. **Disposition (2):** relevant; needs updating — it assumed the triggering author is always the addressee, which stopped being true two days later.
- **Self-advance — TIER 1.** `a395a8b31` (2026-06-22), verbatim: *"the SELF-ADVANCE re-invoke loop + two-tier cap are fully behind SELF_ADVANCE_ENABLED … self-advance tasks bypass the breaker + use their own prompt"*. The `"self-advance"` author is a label for the breaker and the prompt, never meant as an addressee (no text in the commit or `B_LANGSTON_QUEUE_COMPLETION_REPORT.md` says replies should lead with it). **Disposition (1)** for the loop; the defect is the interaction.
- **`OPEN_RE` — TIER 2.** `B-WAKE-LEAD-NAME` (`#1040`) and `B-TOKEN-BURN-CUT` amendment 1 OBJ-5: keyed on the bridge's prefix by design; its comment warns that coupling the filter to the bridge's prefix punctuation turns a format change into silently dropped wakes. **Disposition (1) for the code — unchanged.** ⚠️ Not a clean bill: its anchoring is the proximate cause in §0 (it removed the name-anywhere match that had masked the mislabel); the fix is at the bridge, so the filter keeps its rule.

## 2. DESIGN — fix the source of the convention, not the reader
**The queue stores the RESOLVED addressee, and a self-advance reply leads with it** (Langston condition 2, option b — one resolution site, not two). At enqueue (`:447`) `requester` is written as `resolve_recipient_name(task)` — so a Kyle item stores `Kyle`, not his raw username (3 of 677 live items carry `kylegjordan`, which matches no name). `_self_advance` carries `addressee = nxt["requester"]` on the task and `resolve_recipient_name` returns it when present. The same value also improves the `from {requester}` prompt line and the PARK message. Items already queued keep their stored value; no migration (a stale `kylegjordan` leads with that, as today). The filter is not changed.
**Rejected: teaching `OPEN_RE` to skip a `self-advance — ` prefix.** It would make the filter know a second bridge string, which is the coupling its own comment forbids, and leave "the opening name is the addressee" false at the source for every other reader of the channel (Kyle included).
**The queue marker is CONDITIONAL, stated:** when the bridge adds the prefix it writes `OLD Claude — (self-advance) …`; when Langston already opened with the name, the `:556` guard correctly adds nothing and the marker goes with it. Langston's own prompt already says the reply is a queue item, so nothing is lost that a reader needs.
**Why the bridge and not the filter, the stronger reason (Langston):** the bridge runs on his box, where OBJ-1 runs in CI and he can check the install himself; the filter is on the laptop and unverifiable by him.

## 3. OBJECTIVES
| # | objective | check |
|---|---|---|
| **OBJ-1** | A self-advance reply opens with the requester's name | a test of the recipient rule run without the Discord client: self-advance task with requester `OLD Claude` → `OLD Claude`; a direct post → its author (unchanged); Kyle direct post → `Kyle` (unchanged); **a Kyle item enqueued and then self-advanced → `Kyle`** (Langston condition 2 — today it would be his raw username); a self-advance task with no requester → falls back to today's behaviour, stated. Runs in CI. |
| **OBJ-2** | The unchanged filter wakes the addressee on that reply | a filter test: a `langston_outbound` line in the new form wakes CC-A and not CC-B; **control:** the old form (`self-advance — **OLD Claude —**`) wakes nobody — the test fails on today's bridge output. |
| **OBJ-3** | The installed bridge is the reviewed blob | **a repo-tracked executable installed outside the deploy tree — the `#1004` class; the sha check is the discharge.** Agreed with Infra Claude in channel 2026-10-08: ONE combined install of the head blob at the reviewed sha (their `B-CREDENTIALS-PRIVATE-REPO` increment rides along); back up the live file; restart only when idle (no `claude -p` running, queue empty); CC-A checks a Langston reply comes back, Infra Claude checks their pinned `[REVIEW SOURCE …]` line. sha256 of the installed file = the blob at the installed sha; service restarted; `journalctl` clean. |
| **OBJ-4** | It works live | observation: the next self-advance reply to any session opens with that session's name and its watcher logs the wake. |
| **OBJ-5** | Docs | SIM fabric row (the self-advance case of the lead); the `OPEN_RE` comment's "by construction" sentence names the self-advance case **and its stale prefix line-refs (`:530-535` in two places) are corrected** (`fix-follows-pointer`); the wake-watcher runbook. |

**Langston's reach, stated (his permanent ceiling):** OBJ-2 grades the repo filter blob in CI and OBJ-4's wake is logged on the laptop — he can reach neither, so OBJ-4 is `RULED ON REPORTED FACT` and does not carry the close alone. OBJ-1 (CI) and OBJ-3 (the install sha on his box) are his to verify.

## 4. OUT OF SCOPE
Replaying the 35 missed replies (each was read later by hand or superseded); the cosmetic double name when Langston also opens with the name (the existing guard handles the plain case; the `**bold**` case is a display matter); any change to the queue's ordering or caps.

## 5. OBSERVATION
OBJ-4 is the only window: closes on the first self-advance reply after install.
