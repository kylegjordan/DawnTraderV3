# B-TOKEN-ECONOMY amendment 1, P6 — Step 7 first-pass verification (Infra Claude)

**What P6 is:** the alert lane routes each due alert to an owner from the owner table (read from the Helsinki mirror at
the branch head), falls back to a Langston precedent, then to CC-INFRA, and escalates a table-vs-precedent clash
instead of guessing. Installed `39a3849c2` with `deploy.sh --only bridges`; the Langston bridge was restarted while idle
at **T' = 2026-11-21T00:13:33Z**. Rollback = `deploy.sh --sha 27ef0d3f7cc3a88419afa19f6e12412f5ed57772 --only bridges`.

**No staging-UI surface.** P6 changes only Langston's bridge routing on Helsinki. It does not touch the app, the API or
any page, so the §9.3 UI navigation has nothing to look at. The verifiable outputs are the lane's own Discord posts, the
bridge journal, and the five sessions' wake-filter owner records. All three are read below.

## The instrument — `comms-infra/discord/alert_lane_daily_read.py`

Commits: `bb5760e31` (tool), `6cd4198e1` (OWNER DIFFERS split from RULE NOT STATED; journal windowed), `5ae34287d`
(the owner table removed from the installed-file check; see the finding below). It recomputes every lane marker's owner
from the table, independently of the bridge, and lists every difference one by one. It never reports a net count.

**Run it (Helsinki, read-only):**
```
D=$(mktemp -d /root/p6read.XXXX); cd /srv/dawntrader-backup.git
for f in alert_lane_daily_read.py alert_lane.py alert_owner_route.py alert_owner_table.json; do
  git show refs/heads/migration/aws-supabase:comms-infra/discord/$f > $D/$f; done
journalctl -u discord-langston-bridge.service --since "2026-11-21 00:13:33" --no-pager > $D/journal.txt
# alerts: a WHOLE copy of staging's /var/log/dawntrader/system-alerts.jsonl (never a tail, #980)
cd $D; python3 alert_lane_daily_read.py --self-test
python3 alert_lane_daily_read.py --alerts <alerts copy> --journal $D/journal.txt --installed-dir /opt/discord-bridges
```
Self-test: 13 checks at Step 7 (27 after Step 8, below), exit 0. Mutants M6/M7 (the `rule_only` bucket and the journal window) are each killed with exit 1
against an unmutated control at exit 0, run with the module path set. A crash is never read as a kill.

## Positive control — the instrument can see a difference

Window 2026-11-14 → T', i.e. **before** P6, when Langston chose owners by hand. **Object:** every lane marker in
`/var/log/cc-discord-inbox.jsonl` with `kind=langston_outbound`, `lane=alert` in that window, joined to the whole alerts
file. **Result:** 34 OWNER DIFFERS, 106 RULE NOT STATED, 1 fallback-to-precedent, and 3 churned ids (`0a4276cb`,
`8bd256bc`, `a237a9e2`). The instrument therefore reports both kinds of difference when they exist. Its zeros below are
readings, not silence.

## Since T' — read 2026-11-21 ~00:44Z, window [00:13:33, 00:43:48)

| leg | result |
|---|---|
| (i) lane markers against the table owner | **3: agree 3**, OWNER DIFFERS 0, rule not stated 0, unjoined 0 |
| (iii) fallback | 1 marker by its own rule text, 1 by the journal (this is seed 2, deliberate) |
| (iv) escalations | lane posts 0, journal 0, over 2 batches; churn 0 |
| (v) due now | 25 |
| (v) installed lane files against the ref | bridge, `alert_lane.py`, `alert_owner_route.py` all **equal**; control (one line appended to a copy of `alert_lane.py`): **DIFFERS** `ba78c4e8b183` vs ref `a80b0fb86145` |
| table sha(s) the lane read | `1f9435020e47`, `bb5760e31bce` (the branch head at each batch, as designed) |

The three markers: `ba8b42e2` → CC-C (agree), plus the two seeds below.

## The seeds (criterion ii)

Seeded on staging at 00:39:38Z: one alert with a table batch key (`B-DISK-HEADROOM`), and one with a key that matches no
rule and has no Langston precedent. The failed-read seed (the table path renamed ⇒ a whole-batch escalation) had already
**PASSED** before install (change list, AMENDMENT 1 r3 install note).

Langston lane post `1573498201757978728` (00:40:05Z) carries:
- `[[ALERT id=c4f59196-582e-48c5-a896-8a5f5f59cd0a owner=CC-INFRA action="… (owner table: batch:B-DISK-HEADROOM)"]]`
- `[[ALERT id=fd4f5779-994f-403b-a57d-52a12ef7b3bf owner=CC-INFRA action="… (owner table: fallback - no rule matched, no Langston precedent)"]]`

Journal: `owner table routes 2 of 2 alert(s) at bb5760e31…, 1 by the fallback, 0 escalated`, plus the mirror freshness
line (`369s ago, DT_REVIEW_FETCH_OK`).

**Routing reached the sessions as designed.** All five wake filters (`CC-A`, `CC-B`, `CC-C`, `CC-INFRA`, `CC-PM`)
recorded both ids as owner `CC-INFRA` at 00:40:05 (`~/.claude/cc-wake-state/<alias>.alert-owners.json`). The lane post
woke no session, which is the designed behaviour. Since `#995` (B-WAKE-QUIET OBJ-11) an owner marker only suppresses
and never wakes (`cc-wake-filter.py`, the `langston_outbound` branch). The post opens "Alert lane —", not a session
name. CC-INFRA's own `inject-due-alerts` list then showed both seeds under **YOURS** on its next prompt. Both seeds were
resolved at 00:43:04Z / 00:43:05Z with `--by cc-infra --evidence discord:1573498201757978728` (read back: `state=resolved`).

## Criteria — status at this read

| # | criterion | status |
|---|---|---|
| i | daily for 7 days: routed owner against table owner, every difference listed | day 0: 3 of 3 agree; **days 1-7 owed** |
| C-2 | each daily read publishes the largest (template → owner) group (Langston, Step 8) | tool prints it from day 1 |
| F-3 | each daily read lists every "lane chose X, table sets Y" note (Langston, Step 8) | tool prints it from day 1; day 0: 0 |
| F-4 | each marker recomputed at its batch's pinned commit, table blob beside the sha | tool does it from day 1 |
| ii | seeds: batch key → its owner; unknown key → CC-INFRA; failed read → escalation | **PASS** (all three) |
| iii | fallback ≤ 2/day | day 0: 1 (the seed); **owed** |
| iv | churn 0; interleave escalations < 3.6/day | day 0: churn 0, escalations 0; **owed** |
| v | each day: deploy reflog, due count, installed lane sha | day 0: due 25, installed = ref; deploy reflog carried in each daily entry |

Stated limit (R2-3): a marker with no live alert row cannot be joined. It is counted as unjoined, never read as
agreement. Measured with this tool over every lane marker in the inbox: **0 of 683 unjoined all-history, 0 of 144 in
the 7 days to 2026-11-21T01:39:16Z** (Langston's F-1 figures, re-derived; the self-test's synthetic unjoined marker is
the positive control). *(Corrected at Step 8: this line read "247 of 838", which is Langston's precedent-join figure,
a different object.)*

## Finding folded in

The (v) leg listed `alert_owner_table.json` as an installed file. The bridge never installs it; it reads the table from
the mirror. So (v) printed UNREADABLE on every run, a standing false alarm. Fixed in `5ae34287d`.
`DISPOSITION: folded into this batch.`

`REVIEWER: none spawned.` Every load-bearing claim above carries its object and the command that re-derives it —
**but the bridge journal needs root on Helsinki.** For a reviewer without root, the journal legs here (the pins, the
per-batch table line, the lane-chose notes) are reported fact. Installed-file equality is NOT in that set: Langston
measured that it is readable without root. *(Corrected at Step 8, Langston F-5; narrowed at Step 9.)*
NOT RE-READ: the pre-install failed-read seed result is cited from the r3 install note and was not re-run for this
record.

## Step 8 — Langston PROCEED (Discord `1573510997195362315`), and what it changed

**Day 0, restated as he ruled it (F-3):** the read shows **no table, row or code drift between the two batches and
the read, and each post stated the table's rule in 3 of 3.** It does NOT show the lane choosing independently of the
table and agreeing: the bridge also logs a note when the lane's owner differs from the table's, and day 0 has **0**
such notes (read from the journal; the tool now lists them).

**Table blob beside the sha (F-4 interim, now done in the tool):** both pinned commits the lane read on day 0,
`1f9435020e47` (1 marker) and `bb5760e31bce` (2 markers), carry owner-table blob **`a9f00990f721`** — the same table,
so day 0 spans no table edit.

**Tool changes (`alert_lane_daily_read.py`), each a condition he set before day 1:**
- **C-2:** per day, the largest (template → owner) group of distinct alert ids, the number of groups, and ties.
- **F-3:** per day, every "lane chose X … table sets Y" note, listed one by one; without `--journal` it prints
  UNREAD, never zero.
- **F-4:** each marker's table owner is recomputed at the commit its batch pinned (the journal's
  `owner routing read at <sha>` line), labelled with that commit's table blob; with no pin it falls back to the ref
  head and says `PIN UNKNOWN`.
- **Empty day:** a day with no markers, no escalations and no journal lines prints `EMPTY READ` — a silent day is
  not a passing one.

**Proof:** self-test now 27 checks, exit 0 (adds two shas with different tables, two synthetic lane-chose notes, the
largest group, the template key, the day list, and the printed EMPTY READ / C-2 / UNREAD lines). Mutants, each run
against an unmutated control at exit 0 and judged by exit code: **M8** (every marker recomputed at the latest pin, the
"moving head" F-4 names) exit 1 · **M9** (lane-chose regex broken) exit 1 · **M10** (empty-day check removed) exit 1 ·
**M11** (group sort reversed) exit 1. All four fail by assertion, not by crash (a first M8 that crashed was discarded).

**Re-run on real data, Helsinki, 2026-11-21 ~01:39Z** (window [00:13:33, 01:39:16)): 3 markers, 3 agree, 0 differs,
0 unjoined; recomputed at `1f9435020e47` ×1 and `bb5760e31bce` ×2, both table blob `a9f00990f721`; largest group 1
distinct id (3 groups, all tied); lane-chose notes 0; fallback 1 (the seed); escalations 0 over 2 batches; churn 0;
due 25; all three installed lane files equal the ref.

**Next (superseded below):** the daily reads to T'+7d (2026-11-28 00:13Z), each appended here, then Step 10.

## Step 9 — Langston MET on the day-1 conditions (Discord `1573515420814540851`, 01:48:32Z)

He re-derived at `984ae80bb` from ref copies: self-test 27/0/exit 0; M8, M10, M11 exit 1 by assertion; F-1 683 markers
before 01:39:16Z and 144 in the 7 days, 0 unjoined in both, by his own join; F-4 both pinned commits carry table blob
`a9f00990f721`, read at the mirror; (v) all three installed lane files equal their ref blobs; the lane-chose regexes
match the emitters verbatim at `alert_lane.py:459` (fallback form) and `:479` (rule form), and
`discord_common.py:146-147` supplies the `%Y-%m-%d %H:%M:%S` prefix they anchor on. The bridge `log()` call that
writes them is `:1435` (`:1434` is the loop).

**M9, corrected to what it proves.** M9 kills only when the mutation is confined to the two regex definitions
(`CHOSE_RULE`, `CHOSE_FALLBACK`); it then fails `lane_chose expected [...] got []`. Renaming the phrase throughout the
file also rewrites the self-test's own synthetic journal line, and the test passes at exit 0, because the fixture and
the regex share one literal. That is not a tool defect, but it means M9 alone cannot show the regex matches what the
bridge really writes. The real-data control below does.

**F-3 real-data positive control (his, copied into the repo at
`B_TOKEN_ECONOMY_AMD1_P6_controls/f3_realdata_control.py` and `f3_fb.py`, both pinned to `984ae80bb`).** Each takes a
real alert row from a whole copy of the staging alerts file, routes it through the real `table_route` at the ref table
and the real `apply_table`, formats the note with the real `dc.log` prefix, and runs the tool's `journal_counts` on it.
Only the lane's owner (forced to CC-B) is synthetic, which is the variable under test.

| arm | row | his result | my reproduction (Helsinki, 2026-11-21 ~01:50Z) |
|---|---|---|---|
| rule | `1ae9a06b` (`batch:B-PRICE-SIDE-BY-JOB` → CC-C) | parsed 1/1, every field right | parsed 1/1 |
| fallback | `b83b1e4b` ('B-NEW-40 14-day soak verification due' → CC-INFRA) | parsed 1/1; 489 of 3,539 real rows take the fallback | 3,539 rows, 489 fallback / 3,050 rule; parsed 1/1, exit 0 |

`f3_realdata_control.py` exited **1** in my run, and the reason is its pick rule, not the parse: it wants one *active,
unacknowledged* row of each kind, and at my read no active unacknowledged row took the fallback, so it picked one row
and the `== 2` check failed. The rule note it did emit parsed 1/1; `f3_fb.py`, which picks over every row, covers the
fallback arm at exit 0. Both scripts stamp the note with today's local time and bound the read to 2026-11-21, so they
are dated controls, valid as run on that day. ⇒ **The day-0 lane-chose zero is a reading, not silence.**

**Unjoined real-data control.** Same inbox, same join: Langston's `langston_outbound` posts *without* `lane=alert` give
**94** unjoined all-history and **28** in the same 7 days. So the instrument can see an unjoined marker in real data,
and the lane's 0 of 683 is a reading. *(His measurement; NOT RE-READ by me.)*

**Carries into the daily reads (neither blocked day 1):**
1. F-5 narrowed to the journal legs only (the REVIEWER paragraph above is corrected).
2. **Timezone.** `dc.log` stamps local time; the tool compares against UTC bounds and buckets UTC days. The Helsinki
   box reads `Timezone=Etc/UTC` (`timedatectl`, read at my reproduction), so the reads are sound today, but nothing
   asserts it. ⇒ **every daily entry below records the box's `timedatectl` Timezone line**; a non-UTC reading voids
   that day's F-3 and pin legs until the offset is handled.

**Outside P6, surfaced by Langston (§13):** his own hand-typed alert markers (no `lane=alert`) hold 94 unjoined
all-history / 28 in 7 days over 25 distinct ids; 24 of the 25 share their first 8 hex with a real alert id but differ
mid-uuid (five zero-padded, one transposed). They are well-formed, so they parse, and they route nothing.
`DISPOSITION: decision required — no work, on Langston 1573515420814540851; sent to Kyle's list via PM Claude.`

**Next:** the daily reads, day 1 at ~2026-11-22 00:13Z through day 7 at 2026-11-28 00:13Z, each appended here with the
Timezone line, then Step 10.

## Daily read — day 1 (Infra Claude, run 2026-11-22T10:08:05Z, ~10h after its 00:13Z slot)

**Box:** Helsinki, `Time zone: Etc/UTC (UTC, +0000)` (`timedatectl`) — UTC, so the F-3 and pin legs stand.
**Inputs:** tool + lane + route + table from the Helsinki mirror at `refs/heads/migration/aws-supabase` = `acc954ba8`
(table blob `a9f00990f721`); journal `--since 2026-11-21 00:13:33`; alerts = a WHOLE copy of staging's
`system-alerts.jsonl`, 3,558 lines on both sides of the copy. Self-test 27 checks, 0 failures, exit 0; read exit 0.
**Window:** [2026-11-21T00:13:33, 2026-11-22T10:08:05).

| UTC day | lane markers | agree | OWNER DIFFERS | rule not stated | fallback-to-precedent | unjoined | no rule text |
|---|---|---|---|---|---|---|---|
| 2026-11-21 | 25 | 24 | 0 | 0 | 1 | 0 | 1 |
| 2026-11-22 (to 10:08Z) | 9 | 9 | 0 | 0 | 0 | 0 | 0 |

- **C-2 largest group:** 11-21 `'VTS trade closed with NO price — <SYM>'` → CC-C, 2 distinct ids (18 groups); 11-22 a
  1-id group, tied with 7 more (8 groups).
- **F-3, every note listed:** one, on 11-21. `LANE CHOSE 2026-11-21T05:10:14 a3b1bc1e-dd42-429a-b5ea-6cd53896fd2d lane
  CC-B table CC-INFRA by 'fallback'`. The alert is the critical `ohlc-writer-shed-crypto_perp` (no owner-table rule).
  The lane escalated it to Langston the same second ("no owner-table rule and no Langston precedent, so the
  domain-based owner is provisional"). He triaged at 05:14Z, moved it to CC-A (the one churn below), and it was resolved
  07:19:04Z. 11-22: 0 notes.
- **F-4 pins:** every marker recomputed at its batch's pinned commit; all nine pins carry the same table blob
  `a9f00990f721`.
- **(iii) fallback:** 11-21 no-precedent 2 + to-precedent 1, journal 3; 11-22 0.
- **(iv) escalations:** lane posts 0 both days; journal 11-21 7 (1 table-rule) over 19 batches, 11-22 0 over 7.
- **(iv) churn:** 1 — `a3b1bc1e` CC-INFRA → CC-A (the F-3 item above).
- **(v):** due now 19; installed `discord-langston-bridge.py`, `alert_lane.py`, `alert_owner_route.py` all equal to
  the ref. Last staging deploy `c21c1502a` 2026-11-21T05:08:44Z (claimed `cc-c`), an app deploy that does not touch
  the Helsinki lane.

**Reading:** 33 of 34 markers agree with the table, 0 OWNER DIFFERS. The one difference is a critical alert with no
table rule, which the lane escalated as built. **Whether a critical no-rule alert should carry the table's fallback
owner or a provisional domain owner is a question for Step 10, not a defect found here. NOT RE-READ:** I have not
traced which lane branch picked CC-B.

## Daily read — day 2 catch-up (INFRA Codex, run 2026-11-23T22:49:00Z)

**Box:** Helsinki, `Timezone=Etc/UTC` (`timedatectl`) — UTC, so the F-3 and pin legs stand. **Inputs:** tool + lane +
route + table from the mirror at `187283b5de01acea562b220dac06ccb350da512a` (table blob
`ff139a8904479c26b1f1048a3bae64ef6a740600`); journal since T'; alerts = a WHOLE copy of staging's
`system-alerts.jsonl`, **3,587 lines on both sides of the copy**. Self-test **27 checks, 0 failures, exit 0**; read
exit 0. Window `[2026-11-21T00:13:33, 2026-11-23T22:49:00)`.

| UTC day | lane markers | agree | OWNER DIFFERS | rule not stated | fallback-to-precedent | unjoined | no rule text |
|---|---:|---:|---:|---:|---:|---:|---:|
| **2026-11-22 (the complete day-2 population)** | **17** | **17** | **0** | **0** | **0** | **0** | **0** |
| 2026-11-23 (partial, to 22:49Z) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

- **C-2 largest group, 11-22:** one distinct id, tied across 15 groups; the named representative was
  `B-TOKEN-WATCH-FOLLOWUP-MEMORY P<N>: the re-registered <N> h store-growth read is due - owner Infra Claude` →
  CC-INFRA.
- **F-3:** 0 lane-chose-different notes on 11-22. This is a reading over 17 joined markers, not silence.
- **F-4:** every marker was recomputed at its batch's pinned commit. Six pinned commits used table blob
  `a9f00990f721`; one marker pinned at `3a85372e5b2a` used the newer blob `ff139a890447`. The tool therefore measured
  across a real table edit without substituting the latest table, and all 17 still agreed.
- **(iii) fallback, 11-22:** no-precedent 0 + to-precedent 0; journal 0.
- **(iv), 11-22:** lane-post escalations 0; journal escalations 2 (one table-rule) over 13 batches. No 11-22 id
  changed owner. The whole-window churn remains the day-1 `a3b1bc1e` CC-INFRA → CC-A event already recorded above.
- **(v):** due now 30; installed `discord-langston-bridge.py`, `alert_lane.py`, and `alert_owner_route.py` all equal
  the ref. The staging deploy record remains `c21c1502a` at 2026-11-21T05:08:44Z, claimed `cc-c`; no lane file moved.

**Reading:** the complete day-2 population is **17 of 17 agreement, 0 OWNER DIFFERS, 0 fallback and 0 unjoined**.
The partial 11-23 row is explicitly **EMPTY READ, not a pass**: Langston is off for the Codex shift and his bridge
logged no lane batch that day. It is carried visibly and is not used to satisfy a daily criterion.

## Daily read — day 3 catch-up (INFRA Codex, run 2026-11-24T11:14:57Z)

**Box:** Helsinki, `Timezone=Etc/UTC` (`timedatectl`) — UTC, so the F-3 and pin legs stand. **Inputs:** tool + lane +
route + table from the mirror at `239f9a2955da0c0dccdfa5cad45da2e1901bde8d` (table blob
`ff139a8904479c26b1f1048a3bae64ef6a740600`); journal since T'; alerts = a WHOLE copy of staging's
`system-alerts.jsonl`, **3,614 lines on both sides of the copy**. Self-test **27 checks, 0 failures, exit 0**; read
exit 0. Window `[2026-11-21T00:13:33, 2026-11-24T11:14:57)`.

| UTC day | lane markers | agree | OWNER DIFFERS | rule not stated | fallback-to-precedent | unjoined | no rule text |
|---|---:|---:|---:|---:|---:|---:|---:|
| **2026-11-23 (the complete day-3 population)** | **0** | **0** | **0** | **0** | **0** | **0** | **0** |
| 2026-11-24 (partial, to 11:14Z) | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

- **C-2 / F-3 / F-4:** both days are `EMPTY READ`; no lane marker, escalation or journal line exists to grade,
  group or pin. Zero is not called agreement.
- **(iii) fallback / (iv) escalation and churn:** no new day-3 marker exists. The whole-window churn remains the
  day-1 `a3b1bc1e` CC-INFRA to CC-A event already recorded above.
- **(v):** due now 19; installed `discord-langston-bridge.py`, `alert_lane.py`, and `alert_owner_route.py` all equal
  the ref. The staging deploy record is `e3a96a8126f0280a9568bb1823b9210783f0afe0` at
  2026-11-24T00:03:08Z, claimed `codex-b`; no lane file moved.

**Reading:** day 3 is **NOT RUN**, not PASS or FAIL, because Langston and his bridge are off for the Codex shift and
there is no population to grade. The empty row remains in the record so the seven-day criterion cannot silently turn
an off-shift absence into agreement.

## Daily read — day 4 catch-up (INFRA Codex, run 2026-11-25T09:43:57Z)

Helsinki reported `Timezone=Etc/UTC`. The existing reader ran from mirror ref
`674967db81f6ea5810f6d760c31ba4af69a2b8f7` (owner table blob `ff139a890447`) against the bridge journal and
the whole 3,634-line staging alert stream. All 27 reader self-tests passed. The same full observation read still
found 17 of 17 agreeing markers on November 22, a live positive control for the marker reader.

The complete November 24 UTC day had zero lane markers, escalations, or lane journal batches to grade. Day 4 is
**NOT RUN**. The partial November 25 day through 09:43:57Z is also empty and ungraded. The bridge was inactive at
the read. There was no new ownership churn. The installed bridge, lane and owner-route files matched the pinned
ref, and the read found 25 due staging alerts across all owners.

## Daily read — day 5 (INFRA Codex, 2026-11-26T00:14:03Z)

Helsinki reported `Timezone=Etc/UTC`; the Langston bridge was inactive during the Codex shift. The reader used mirror
ref `2dbc2b568f5747dd347155f8bfbc844b72ed9af5`, owner table blob `ff139a890447`, the bridge journal from T', and
the whole staging alert stream (3,656 lines at both ends). It passed all 27 self-tests and again found 17 of 17
agreeing markers on November 22 as the live positive control.

November 25 UTC had zero lane markers, escalations, or journal batches to grade. Day 5 is **NOT RUN**. The new
partial UTC day through 00:14:03Z was empty and remains ungraded. The one earlier ownership change remains the
day-1 event named above. All three installed lane files matched the ref. The due queue held 24 alerts across all
owners. The last staging deploy record remained `e3a96a8126f0280a9568bb1823b9210783f0afe0` at
`2026-11-24T00:03:08Z`, claimed by `codex-b`.

## Days 6 and 7 and the scheduled window close — Step 9, INFRA Codex, 2026-11-28

The 00:13:44 UTC read recorded in the INFRA POSITION was reproduced on Helsinki against both the registered
end (`2026-11-28T00:13:33Z`, exclusive) and the saved read cutoff (`00:13:44Z`, exclusive). The start was
`2026-11-21T00:13:33Z`. Both cutoffs gave the same observation counts. Helsinki reported `Timezone=Etc/UTC`.
The bridge was inactive and disabled at reproduction. The reader came from `a6d32759535fbebd0d13b0ef34f83b10a95a6c74`
and recomputed each marker at its own logged pin. All 27 self-tests passed. The complete staging alert stream had
4,663 lines and 9,222,317 bytes. Source and received SHA-256 matched
`54a495f5fd7c1fff8e2a7773399ad8ea3ea2b6c2f76ef638ea25e5f1dab3c6dc`. Both reads exited 0.

| UTC bucket | Lane markers | Agree | Journal batches / escalations | Disposition |
| --- | ---: | ---: | ---: | --- |
| Nov 21, day 1 from install | 25 | 24 | 19 / 7 | Active, F-3 and ownership churn below |
| Nov 22, day 2 | 17 | 17 | 13 / 2 | Active, positive control for the empty days |
| Nov 23–25, days 3–5 | 0 each | — | 0 / 0 each | NOT RUN, off shift |
| Nov 26, day 6 | 0 | — | 0 / 0 | NOT RUN, off shift |
| Nov 27, day 7 | 0 | — | 0 / 0 | NOT RUN, off shift |
| Nov 28, midnight to the registered cutoff | 0 | — | 0 / 0 | Partial boundary bucket, no activity |

The window contains 42 marker observations, with 41 agreements, one reader-classified fallback-to-precedent
observation, zero `OWNER DIFFERS` and zero unjoined. Day 1's earlier 33/34 read already included nine of the
17 Nov 22 markers. The two latest UTC day buckets and the partial boundary had no groups, pins or F-3 notes to grade.
The `fallback-to-precedent` aggregate bucket alone cannot identify the exact F-3 case. The reader's lane-post
escalation counter parses raw `ESCALATE` tags. The bridge publishes the handoff in prose, and the journal shows
actual escalations. The component counts therefore leave the seven-day interleave-rate objective unproven.

**Environment (R2-9).** The staging checkout reflog has Phase A `5ecd7ee24fb7a741e8e015e0e6a262a464e7d016`
at Nov 26 02:31:50 UTC, current through the Nov 27 bucket and the closing cutoff. The next checkout, R3
`8f97c294ed705fab920245762183632eec7bad71`, was Nov 28 02:35:07 UTC, outside the window. At reproduction all
three installed lane files matched both the reader ref and the prior reviewed KD-115 installation
`bb141c1244af02a398355be80fe1f8bd8e3d03f9` byte for byte. KD-115's installation receipt was Nov 22 21:24:16 UTC
and is recorded in `ac5461854`. The reader counted 235 due staging alerts across all owners at reproduction.
Contemporaneous due-count snapshots for days 6 and 7 were unavailable, so those two R2-9 daily legs remain unproven.

### F-3 evidence and Step 10 disposition for review

- The one journal F-3 note was Nov 21 05:10:14 UTC for critical `a3b1bc1e-dd42-429a-b5ea-6cd53896fd2d`
  (`ohlc-writer-shed-crypto_perp`). It explicitly logged no matched rule and no precedent. The lane proposed CC-B
  by domain and requested critical escalation. The bridge applied generic fallback CC-INFRA to the marker and kept
  the escalation. Discord `1573566186925596673` records the provisional proposal. Langston routed to CC-A at
  05:14:06 UTC (`1573567156816314489`). The 07:10 repeat `1573596383112466473` cites the new precedent. The staging
  ledger shows resolution at 07:19:04.719 UTC. The one measured churn case was CC-INFRA to CC-A.
- The fallback branch at install ref `39a3849c2` rewrites the marker and retains its separately requested escalation.
  A matched rule with a conflicting established precedent takes a separate escalation path. Day 1's journal counted
  three unmatched table candidates before enforcement. The reader also counted two explicit fallback markers and one
  fallback-to-precedent observation. Coltrane should rule on the R2-5 daily threshold and any warranted owner-table row
  using the final routes and governing precedent. A single provisional proposal gives no authority to add an owner rule.
- **Disposition proposed for review:** INFRA owns the outstanding proof in the existing amendment 1 P6 verification
  lane. The seven-day pass stays open. Step 10 carries the F-3 policy question and the R2-5 tally to the KD-34 decision
  path with the owning session and reviewers. Close the observation objective on a reviewer-approved active window
  that gives the registered daily alert comparisons and environmental evidence, or record an explicitly approved
  unproven disposition with the retained evidence. The proof fails on an empty or unreadable day, a missing pin or
  required snapshot, or a breached approved threshold. Close the F-3 decision when the agreed policy names the
  effective owner and the escalation behavior for the no-rule, no-precedent critical case. If a change is agreed,
  reproduce that case and the matched-rule and established-precedent controls before any change is proposed for install.
  Keep the policy item open if evidence cannot establish those branches or the owners have no agreed disposition.

`REVIEWER: claim-only · F-3 branch and seven-day criteria · distinct fallback and named-rule paths, incomplete window · re-derived y`

### Coltrane’s ruling — 2026-11-28 10:04:53 UTC

Coltrane accepted the Step 9 evidence at exact `aa7fba589cdd52e5704eb33eec71950366bf7560`, sent in Discord
request `1576176283015192679`. Exact CI `46131870558` passed all four jobs. He reproduced the two active-day marker
counts at both cutoffs. The Nov 21–28 window is **UNPROVEN** and the **P6 objective stays open**. Days 3–7 are
**NOT RUN**. Contemporaneous day-6 and day-7 due counts and the seven-day interleave rate remain unproven.

**R2-5.** Count distinct fallback-routed alert IDs by UTC `created_at`, using the published final routing markers.
The two observed fallback IDs on Nov 21 were the seed `fd4f5779-994f-403b-a57d-52a12ef7b3bf` (Discord
`1573498201757978728`) and critical `a3b1bc1e-dd42-429a-b5ea-6cd53896fd2d` (Discord `1573566186925596673`).
Both published markers name CC-INFRA and state fallback. The critical repeat uses Langston’s later precedent.
The three journal candidates were counted before enforcement. The two published fallback IDs meet the daily cap
of two for this observed cohort, including the seed. Coltrane ruled that this evidence triggers no new owner-table row.

**Next active window, INFRA owner.** Submit the dates of seven consecutive active observation days for reviewer
approval once Langston is authorized to be on duty. Register the UTC start and end, the daily evidence cutoff, the
installed lane baseline, and alert reminder details before starting. Use the approved P6 criteria from the pre-audit.
Each day needs the complete per-alert comparison at logged routing pins, a contemporaneous due count, staging
deploy reflog, installed lane SHAs, and separate fallback, ownership churn, and interleave measures. Establish a
source for the interleave count that can see handoffs before registering the read. Preserve the earlier seed and
reader controls and the reviewed thresholds. An empty or unreadable day, missing proof, or a threshold breach leaves
the objective open. This record prepares the next review. The window starts after reviewer approval and authorized
active duty.

**F-3 Step 10 return.** PM owns assembly of the KD-34 provenance pack. The question is who owns a critical alert
when neither the table nor precedent supplies an owner, and how the handoff must work. Start with amendment 1
pre-audit P6 and R2-4 through R2-6, the installed `39a3849c2` fallback and escalation paths, and the exact alert and
Discord receipts above. The owning session and reviewers settle the policy and PM records the decision. If the
decision changes the behavior, replay the exact critical case and the matched-rule and established-precedent controls
before seeking any install approval. The policy remains open pending that record.

## Step 10 checkpoint — F-3 policy disposition (KD-129, 2026-11-28 UTC)

PM reported recording KD-129 after the INFRA and Coltrane policy round. The provenance starts with Coltrane’s
10:04:53 UTC Step 9 ruling in response to Discord `1576176283015192679` and his 10:44:33 UTC policy reply to
PM’s Discord `1576186160244588574`. INFRA concurred in the INFRA Codex chat. This checkpoint records the governed
policy and the proof required of a proposed change. The fallback path under review is pinned at `39a3849c2`.
The Step 9 environment record separately identifies the later KD-115 installation.

**Observed evidence.** R2-5 grades distinct final fallback IDs by UTC `created_at`: Nov 21 had two, the seed
`fd4f5779-994f-403b-a57d-52a12ef7b3bf` and critical `a3b1bc1e-dd42-429a-b5ea-6cd53896fd2d`. The three pre-enforcement
candidates measure a different population. Two meet the daily cap, so the ruling adds no owner-family row. For the
critical ID, the 05:10:14 journal records a provisional CC-B proposal, INFRA fallback and escalation. The reviewer
assigned CC-A at 05:14:06, 3 minutes 52 seconds later. The 07:10 repeat used that assignment and still described the
alert as unclaimed. The retained record establishes assignment, and same-ID acceptance is unverified. The ledger
records resolution at 07:19:04.719. The Nov 21 case predates KD-129 and supplies the replay control.

**KD-129.** For a critical alert with neither a matching rule nor established precedent, CC-INFRA is the immediate
first responder and escalates immediately to the on-duty reviewer. The provisional domain suggestion travels as
context. From first triage, the reviewer must record a named assignee within five minutes, and that assignee must
confirm acceptance on the same alert ID within ten minutes from that same starting point. INFRA owns the alert until
acceptance or resolution. If the reviewer route fails or is unavailable, or either deadline is missed, PM steps in
immediately to secure a named backup and verify receipt. A repeat keeps the first-triage clock. The critical escalation
must also work when the lane escalation tag is missing. A routing marker establishes assignment. The receiving
assignee’s attributable same-ID confirmation establishes acceptance. Preserve the distinct R2-4 failed-read route.

| Required review control | Evidence to require before proposing installation |
| --- | --- |
| Exact critical ID `a3b1bc1e` | INFRA first response and reviewer escalation with provisional CC-B as context. Record named assignment and same-ID acceptance independently at the registered deadlines. |
| Matched rule | The existing rule retains its governed owner and escalation behavior. |
| Established precedent | The existing precedent path retains its governed owner and escalation behavior. |
| Missing lane escalation tag | The same critical no-rule, no-precedent input still produces reviewer escalation and INFRA ownership. |
| Failed or unavailable reviewer delivery | PM receives the immediate backup escalation. Record the named backup and evidence that the backup received it. |
| Missed assignment or acceptance | Exercise both deadlines. An assignment alone or a confirmation for another ID leaves INFRA responsible and invokes PM backup when due. A repeat preserves the original deadlines. |
| R2-4 failed rules read | A failed or unreadable routing input follows the approved failed-read escalation, separate from a successful lookup with zero matches. |

**Disposition.** The F-3 policy is recorded for this checkpoint. Keep the proof above open pending the governed
review of a candidate. The owner-family table and installed routing are outside this documentation change. P6’s
separate seven-day observation remains UNPROVEN. Days 3–7 of the original window were NOT RUN. INFRA returns to
the active-window registration after reviewer approval and authorization for Langston to be on duty. The independent
Conversation Index return is Step 2 at `90feb6ef372dd48c67f59482ad4d3ec5db079d9c`.

**Independent review, 11:49:56 UTC.** Coltrane accepted the policy and controls at exact `98258392a9ffe1eb6434deef8baa5bacde380dee`
in response to Discord `1576202539769139234`. He returned the documentation checkpoint for the pinned KD-129
row in `DECISIONS.md` and its cited provenance pack. PM owns that record under the KD-34 decision protocol.
The next review action is to verify both sources at PM's published ref and add their exact citations.
