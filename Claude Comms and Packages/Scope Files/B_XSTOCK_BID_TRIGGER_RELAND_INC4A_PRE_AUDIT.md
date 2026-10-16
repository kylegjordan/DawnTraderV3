# B-XSTOCK-BID-TRIGGER-RELAND increment (4a) — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (r1, CC-C, 2026-10-16)

**Scope:** `B_XSTOCK_BID_TRIGGER_RELAND_SCOPE.md` §INC-4A r2, objectives 10-13, APPROVED by Coltrane 2026-10-16 10:03Z at `74803cef2` (Langston's Step-1 review queued behind his bridge backlog). change-class: architecture.
**Coltrane's four Step-2 items, answered below:** the exact population (A2), the classification predicate (A4), the standing-member lifecycle (P3), the operator-visible sink (A6/P4).

## PREVIOUSLY STATED vs NOW
- **PREVIOUSLY STATED** (scope objective 12): *"every VTS trade that closes `timeout_unpriced` (both lanes) is recorded where an operator sees it"*, framed as one silent close in three (Langston, `#1191` am.2). **NOW:** the **shadow lane is not on the rail at all** — its no-decision streak is never tracked for paging — and it closed **125 xStock + 25 crypto trades `timeout_unpriced` since 2026-09-22** (`rtb_shadow_pairings`, against 232 + 14,104 priced `timeout`s), versus **3** on the real lane (`exit_decision_archive`, 1 of them inside the regular session). **REASON:** the scope sized objective 12 on the real lane only; A6 measured both sinks.
- **PREVIOUSLY STATED** (`#1191`): 74/87/66/61 rows minted per weekday. **NOW (the five-count baseline, A3):** 10-13/14/15 — pages ATTEMPTED 92/103/77, MINTED 64/33/21, SUPPRESSED by open keys 28/70/56. **REASON:** minted rows understate the condition by up to 3x while keys stay open — Coltrane's BLOCKER-2, measured.

## THE AUDIT

### A1 — Census at every hop (§9.5(a), repo-wide, tests excluded; `server/` and `scripts/`)
| question | members |
|---|---|
| who WRITES a `no-trigger-vts-*` row | **exactly one**: `vts-runner.ts:4008` (`addAlert`, inside the real-lane exit pass) |
| who RESOLVES one | **no key-based resolver in code** — `resolveAlertsByDedupeKey` (`system-alerts.ts:856`) has one caller, the venue-quiet sweep, which matches only `price-skip-*`/`venue-quiet-*` keys (`venue-quiet-alerting.ts:169-173`). By id: the operator CLI (`scripts/system-alerts.ts:315`), and the heartbeat checker for ids it tracks itself. ⇒ humans only (335/335 `cli`, `#1191` am.1) |
| who DELETES / prunes | none for rows; the in-memory streak map `_vtsNoTriggerStreak` (`vts-runner.ts:222`) has one writer (`:3977-3978`) and one pruner (`:4150`, trades no longer open) |
| who SCHEDULES | the VTS sim pass (one loop); the shadow lane runs in the same pass with its own exit loop (`resolveOpenShadowTrades`, `:4564-4739`): it keeps a per-class no-decision COUNT reset every pass (`:4704-4707`, `:4721-4724`) — **by design "one count, not a streak"** (`:223`) — and raises no page |
| who READS the rows | the generic alert readers (dispatcher re-surface, `inject-due-alerts`, `due-alerts.py`); nothing reads them by key |
| the page rule | `stepNoTriggerStreak` (`core/trading/vts-no-trigger-streak.ts:31`), pure: page once per paging run after 10 min (`VTS_NO_TRIGGER_ALERT_AFTER_MS`, `:217`); xStock pages only in the US `regular` session (`:3969-3971`) |
**Entry points enumerated first:** the rail has ONE entry (the real-lane pass). **A sibling rail exists on the paper engine** — `no-trigger-${this.mode}-<SYMBOL>` (`active-execution-engine.ts:3718`, `mode` typed `'live'|'paper'` so it can never produce `vts`), built by CC-C in `d61edadc1` (2026-09-14, 8a-P2): 9 rows since 09-26, all resolved by hand (`cli` 9/9), with the same missing clear. See P1b. The shadow lane is a second exit loop with no rail — that absence is the A6 finding, not an oversight to preserve.

### A2 — The exact population (Coltrane item 1)
**VTS real lane, `asset_class = xstock_spot`, streaks crossing the page threshold in the US regular session (Mon-Fri 09:30-16:00 ET, `getXstockSession === 'regular'`), read from `error.log` `[8a-P3][VTS_NO_TRIGGER_ESCALATION]` lines and the alert file by `created_at`.** Crypto: 0 attempted pages on all three days (it is not in this flood and is unchanged). The shadow lane is a separate population (A6).

### A3 — The five-count baseline (pre-deploy, the objective-11 pre-registration's "before")
| day (UTC) | streak crossings = pages ATTEMPTED | standing joins | MINTED | SUPPRESSED (attempted − minted) | by last reason |
|---|---|---|---|---|---|
| 10-13 | 92 (64 symbols) | 0 (no record exists) | 64 | 28 | too_wide 73 · too_old 11 · no_usable_mark 8 |
| 10-14 | 103 (68) | 0 | 33 | 70 | too_wide 72 · too_old 30 · no_usable_mark 1 |
| 10-15 | 77 (48) | 0 | 21 | 56 | too_wide 64 · too_old 9 · no_usable_mark 4 |
"Exceptional pages attempted" is the attempted column today (every crossing is a page attempt). Positive control: the same grep over the same files finds 3,546 / 3,643 / 2,882 `VTS_NO_TRIGGER_END` lines, so the instrument reads these files.

### A4 — The classification predicate (Coltrane item 2)
The xStock refusal reasons are a closed set: `XsGuardReason = ok | no_row | age_unknown | too_old | side_unusable | too_wide` (`asset_classes/xstock_spot/vts-xs-guard.ts:21`) plus `knobs_unavailable` (`vts-xs-instrument.ts:25`), and the decision-level `no_usable_mark`.
**POSITIVELY IDENTIFIED EXPECTED wide/quiet book — joins the standing record:**
- `no_transactable_side (too_wide)`: a mark AND a two-sided book exist; the book is wider than the ceiling. Expected at the open and overnight.
- `no_transactable_side (too_old)` **only when** the paper rail's own cohort verdict for the class reads `quiet` or `closed` at that instant (`classVerdict(measureXstockTicking(now))`, `venue-quiet-alerting.ts:139-146`) — the market itself is quiet, positively measured. `too_old` with `not_quiet` (the venue is ticking and this symbol is not) is isolated staleness ⇒ pages.
**EVERYTHING ELSE PAGES on its own key, as today:** `no_usable_mark`, `no_row`, `age_unknown`, `side_unusable`, `knobs_unavailable`, `too_old` on a `not_quiet`/`thin`/unreadable verdict, and any reason not in the closed set (fail toward paging).

### A5 — The duration norm for a joined member (the one number Step 2 may set)
**In-session `too_wide` streaks end fast:** 423 ended inside the regular session on 10-13/14/15; minutes after 09:30 ET at the end: **p50 16, p75 19, p90 22, p95 29, max 80**; 406 of 423 ended by 10:00 ET (source: `VTS_NO_TRIGGER_END` lines, streaks >= 60 s, EDT). ⇒ **a joined member still stuck after 30 min of regular-session time pages on its own key** (beyond p95 = 29). Today's 10-min threshold sits inside the open burst, which is why it floods. Off-session time never counts (unchanged).

### A6 — The unpriced-close sinks (Coltrane item 4) and the shadow-lane gap
| lane | sink | priced `time_stop`/`timeout` since 09-22 (positive control) | `timeout_unpriced` since 09-22 |
|---|---|---|---|
| real | `exit_decision_archive` (`exit_reason = 'time_stop_unpriced'`, `source = 'vts-runner'`) | xStock 105 · crypto 80 | **xStock 3** (1 in the regular session) · crypto 0 |
| shadow | `rtb_shadow_pairings` (`close_reason = 'timeout_unpriced'`) | xStock 232 · crypto 14,104 | **xStock 125 · crypto 25** |
**Reading:** a page per unpriced close is right for the real lane (3 in 3.5 weeks) and wrong for the shadow lane (~6 a day would be a new flood).

### A7 — Map, manual, ledger, provenance (six sources)
- **SIM:** has the paper standing record (`SYSTEM_IMPACT_MAP.md:946`, B-VENUE-QUIET-ALERTING) and the two-price trigger (`:350`); **no entry for the VTS rail, its key or its clear** — objective 13.
- **System Manual:** §"A null `triggerPrice` means no decision" (`SYSTEM_MANUAL.md:5731`) — the refusal itself is correct and unchanged.
- **Ledger:** `#1191` (+ am.1-3) is this item; `#638` (resolve on recovery) is the pattern; `#982` (an ack silences a key) is why rows are resolved, never acked; `#994` is Kyle's quiet-market ruling.
- **Provenance:** `57d89095e` (rail, *"cleared on any decision"* — the streak, never the row); `d5c758f10` (xStock joins, regular-session paging); `ae6ae8ff8` (paper standing record + re-measured clearing sweep). `bridge/canonical/`: no coverage — the rail postdates the pre-governance corpus.

## THE PLAN (each item cites the finding it falls out of)
| # | item | from | detail |
|---|---|---|---|
| **P1** | **The VTS clearing sweep** (objective 10) | A1 (no resolver) | Off the exit path, at most once a minute after the VTS pass, awaited by nothing: list open `no-trigger-vts-*` rows; for each, re-measure from durable state — **(a) the named trade is closed** (`vts_open_trades.closed = true` or absent) ⇒ resolve `TRADE-CLOSED trade=<id>`; **(b) the trade has made an exit decision since `created_at`** (a per-trade `lastDecisionAtMs` kept on the in-memory streak's end, restart-safe because a restart with the trade still undecided simply re-mints nothing until a new streak crosses) ⇒ resolve `DECIDED-AFTER-MINT trade=<id>`. New machine actor **`vts-exit-monitor`** in `ALERT_ACTORS` (`system-alerts.ts:212`), transport `engine`; evidence carries the trade id (`isValidResolutionEvidence` matches a uuid/ref token — verified at Step 3). The trade id is parsed from the row body today; P1 also adds `metadata.tradeId` at the mint so the sweep never parses prose. |
| **P1b** | **SCOPE AMENDMENT PROPOSED (§9.4 disposition 1 — the reviewer accepts or rejects):** the paper sibling `no-trigger-paper-*` gets the same re-measured clear | A1 | The same structural gap on CC-C's own 8a-P2 rail (9/9 hand-resolved), so the same fix: the active engine's existing once-a-minute sweep point resolves a `no-trigger-paper-<SYMBOL>` row when the position decided after mint or closed, as `vts-exit-monitor`'s paper twin or the existing `active-exit-monitor` actor. Untouched: CC-B's venue-quiet keys and semantics. If rejected, it is homed as its own `#` with this row's evidence. |
| **P2** | **The predicate** (objective 11) | A4 | A pure `vtsXstockJoinsStandingRecord(lastReason, verdict)` in `core/trading/vts-no-trigger-streak.ts`, returning true ONLY for `too_wide`, and `too_old` with verdict `quiet`/`closed`. Everything else false ⇒ the existing page path. The verdict comes from the paper module's exported `classVerdict` + `measureXstockTicking` (read-only reuse; **no change to `venue-quiet-alerting.ts`** — called in the channel to CC-B before Step 3). |
| **P3** | **The standing record and its member lifecycle** (objective 11; Coltrane item 3) | A4, A5 | ONE row per class, key `vts-quiet-xstock_spot`, `health_check`/`info` (never delivered to Discord). **Join:** a crossing that P2 classifies as expected adds/updates `members[tradeId]` = {symbol, reason, sinceMs, joinedAtMs, joins} and increments `metadata.suppressedPages` (kept earliest `sinceMs` on re-join). **Escalate:** a member whose regular-session paging time reaches **30 min** (A5) pages on its own `no-trigger-vts-<SYMBOL>` key with the existing body (counted as an EXCEPTIONAL page). **Recover/remove:** the P1 sweep drops a member when its trade decided after joining or closed; the record **resolves itself** when no members remain. A member whose reason changes to a non-expected one leaves the record and pages at once. |
| **P4** | **Unpriced closes, both lanes** (objective 12) | A6 | **Real lane:** each `timeout_unpriced` close mints a `warning` on key `vts-unpriced-close-<tradeId>` in ANY session (3 in 3.5 weeks), body carrying symbol, hold and last refusal reason; **left for a human to resolve** (each is a lost learning record someone should see; review question 1). **Shadow lane:** NO page; a per-class standing count row `vts-shadow-unpriced-<class>` (`info`) whose metadata carries a running count, the last 20 trades, and the day's count — the archive row in `rtb_shadow_pairings` stays the record. |
| **P5** | **The instrument** (objective 11's five counts) | A3 | One per-pass log line `[VTS_RAIL] crossings= joins= exceptionalPagesAttempted= minted= suppressed=` (suppressed = `addAlert` returned an existing open row), cumulative since start, so the post-deploy read uses the same five columns as A3. |
| **P6** | **SIM entry** (objective 13) | A7 | Step 10. |
**Not changed:** the refusal itself, every ceiling, the 7-day valve, the paper rail and `venue-quiet-alerting.ts`, crypto paging (0 crossings measured).

## Pre-registration (written before the window, objective 11's verification)
**Window:** the first three full weekday regular sessions after the deploy. **Read:** P5's five counts per day beside A3. **PASS:** minted per-symbol pages fall to the exceptional set only (members past 30 min + non-expected reasons) while crossings stay the same order as A3; `suppressed` near zero (keys now clear); zero rows needing a human resolve to re-arm (P1). **FAIL:** any `no_usable_mark` or isolated-staleness crossing that joins instead of paging; or minted down with suppressed UP (the blind spot moved, not closed).

## Questions for review (attack these)
1. **P4 real lane:** should an unpriced close be a page left for a human, or recorded and auto-resolved? I lean page-and-leave (3 per 3.5 weeks; each is a lost learning record).
2. **P1(b):** "decided after mint" uses an in-memory timestamp; after a restart an undecided trade's row stays open until the trade decides or closes. Acceptable, or must the decision time be durable?
3. **A5's 30 min** — one EDT sample of three days; re-read after the DST change (11-02)?

**REVIEWER (fresh reader, claim-only, 2026-10-16):** `claim-only` · *which objects settle "one writer, no resolver" and "no shadow-lane streak", and what states are consistent with them?* · HIT on detail, not on the claims: by-id resolvers exist (CLI, heartbeat) and the shadow lane keeps a per-pass count by design; plus the paper sibling rail (`active-execution-engine.ts:3718`) · re-derived y (`:223`, `:3712-3720`, the 9 paper rows).
