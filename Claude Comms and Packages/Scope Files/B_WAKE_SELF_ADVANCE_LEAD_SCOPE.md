# B-WAKE-SELF-ADVANCE-LEAD — SCOPE (Step 1, r1)

change-class: non_architecture

**Owner:** CC-A (OLD Claude) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row **1v**, after row 1s · **Issue:** `#1177` · **Placed by:** CC-A at filing (§9.4 disposition 3, wake layer).

## 0. WHY
A Langston reply produced by his own review queue never wakes the session it answers. Measured over `/var/log/cc-discord-inbox.jsonl`, all history (2026-06-22 → 2026-10-07): **421 of 6,292** Langston replies open `self-advance — `; **35** of those name a session right after the prefix (OLD Claude 18, NEW Claude 17); none woke it. Live cost: a Step-4 send-back on row 1s (`#1167`) sat unread ~15 h.

## 1.a ARCHITECTURAL READ (SIM "Discord Comms Fabric", `SYSTEM_IMPACT_MAP.md:2848`; System Manual N/A — no trading component)
- **The convention:** the Langston bridge prefixes every non-alert reply with the addressee's name (`discord-langston-bridge.py` `resolve_recipient_name` + the prefix at `:550-555` at `c58ee7e39`); the wake filter wakes a session only when a reply OPENS with its name (`cc-wake-filter.py` `OPEN_RE`, `:193`, used at `:1091`). One rule, two ends.
- **Where it breaks:** `_self_advance` (`discord-langston-bridge.py:322-325`) queues the re-invoke with `author_display: "self-advance"` and `author_id: None`, so `resolve_recipient_name` returns `"self-advance"` and the reply opens `self-advance — `. The real addressee is already on the queue item — `nxt["requester"]`, written at enqueue from the triggering post's `author_display` (`:447`).
- **Blast radius:** the bridge's self-advance path only. Direct replies, alert replies (no prefix by design) and the filter are untouched.
- ⚠️ **The installed bridge is NOT the repo's.** `/opt/discord-bridges/discord-langston-bridge.py` sha256 `29074992…` ≠ the blob at `c58ee7e39` (`bb97931a…`); the 84 differing lines are `B-CREDENTIALS-PRIVATE-REPO`'s bridge increment (Infra Claude, `#1023`, in flight — review remote over ssh, logged `ls-remote` retries, the pinned review-source prompt). **Installing this batch's blob would install theirs too.** OBJ-3 sequences it.

## 1.b PROVENANCE READ (corpora: git log -S, the B-DISCORD and B-LANGSTON-QUEUE commits and completion report, SIM)
- **Addressee lead — TIER 1.** `ca8aa9aa1` (2026-06-20), verbatim: *"Langston replied to NEW Claude's scope without naming him -> NEW Claude's wake watcher never fired (it keys on the session name appearing in a post). The bridge now resolves the addresser deterministically from the triggering message author and prepends '<name> - ' to Langston's outgoing reply"*. **Disposition (2):** relevant; needs updating — it assumed the triggering author is always the addressee, which stopped being true two days later.
- **Self-advance — TIER 1.** `a395a8b31` (2026-06-22), verbatim: *"the SELF-ADVANCE re-invoke loop + two-tier cap are fully behind SELF_ADVANCE_ENABLED … self-advance tasks bypass the breaker + use their own prompt"*. The `"self-advance"` author is a label for the breaker and the prompt, never meant as an addressee (no text in the commit or `B_LANGSTON_QUEUE_COMPLETION_REPORT.md` says replies should lead with it). **Disposition (1)** for the loop; the defect is the interaction.
- **`OPEN_RE` — TIER 2.** `B-WAKE-LEAD-NAME` (`#1040`) and `B-TOKEN-BURN-CUT` amendment 1 OBJ-5: keyed on the bridge's prefix by design; its comment warns that coupling the filter to the bridge's prefix punctuation turns a format change into silently dropped wakes. **Disposition (1)** — unchanged.

## 2. DESIGN — fix the source of the convention, not the reader
**The bridge leads a self-advance reply with the queue item's requester.** `_self_advance` carries `addressee = nxt["requester"]` on the task; `resolve_recipient_name` returns it when present. The filter is not changed.
**Rejected: teaching `OPEN_RE` to skip a `self-advance — ` prefix.** It would make the filter know a second bridge string, which is the coupling its own comment forbids, and leave "the opening name is the addressee" false at the source for every other reader of the channel (Kyle included).
**Kept visible:** the reply still says it came from the queue — the bridge keeps a `(self-advance)` marker after the name, so `OLD Claude — (self-advance) …`.

## 3. OBJECTIVES
| # | objective | check |
|---|---|---|
| **OBJ-1** | A self-advance reply opens with the requester's name | a test of the recipient rule run without the Discord client: self-advance task with requester `OLD Claude` → `OLD Claude`; a direct post → its author (unchanged); Kyle → `Kyle` (unchanged); a self-advance task with no requester → falls back to today's behaviour, stated. Runs in CI. |
| **OBJ-2** | The unchanged filter wakes the addressee on that reply | a filter test: a `langston_outbound` line in the new form wakes CC-A and not CC-B; **control:** the old form (`self-advance — **OLD Claude —**`) wakes nobody — the test fails on today's bridge output. |
| **OBJ-3** | The installed bridge is the reviewed blob | sequenced with Infra Claude: either their increment is installed first, or they agree in channel to one combined install. sha256 of the installed file = the blob at the installed sha; service restarted; `journalctl` clean. |
| **OBJ-4** | It works live | observation: the next self-advance reply to any session opens with that session's name and its watcher logs the wake. |
| **OBJ-5** | Docs | SIM fabric row (the self-advance case of the lead); the `OPEN_RE` comment's "by construction" sentence names the self-advance case; the wake-watcher runbook. |

## 4. OUT OF SCOPE
Replaying the 35 missed replies (each was read later by hand or superseded); the cosmetic double name when Langston also opens with the name (the existing guard handles the plain case; the `**bold**` case is a display matter); any change to the queue's ordering or caps.

## 5. OBSERVATION
OBJ-4 is the only window: closes on the first self-advance reply after install.
