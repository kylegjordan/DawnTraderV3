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
match the emitters verbatim at `alert_lane.py:459` (rule form) and `:479` (fallback form), and
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
