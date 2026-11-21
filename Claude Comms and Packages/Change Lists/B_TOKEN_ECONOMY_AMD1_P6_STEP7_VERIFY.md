# B-TOKEN-ECONOMY amendment 1, P6 — Step 7 first-pass verification (Infra Claude)

**What P6 is:** the alert lane routes each due alert to an owner from the owner table (read from the Helsinki mirror at
the branch head), falls back to a Langston precedent, then to CC-INFRA, and escalates a table-vs-precedent clash
instead of guessing. Installed `39a3849c2` with `deploy.sh --only bridges`; the Langston bridge was restarted while idle
at **T' = 2026-11-21T00:13:33Z**. Rollback = `deploy.sh --sha 27ef0d3f7cc3a88419afa19f6e12412f5ed57772 --only bridges`.

**No staging-UI surface.** P6 changes only Langston's bridge routing on Helsinki. It does not touch the app, the API or
any page, so the §9.3 UI navigation has nothing to look at. The verifiable outputs are the lane's own Discord posts, the
bridge journal, and the five sessions' wake-filter owner records. All three are read below.

## The instrument — `comms-infra/discord/alert_lane_daily_read.py`

Commits: `bb5760e31` (tool), `6cd4198e1` (OWNER DIFFERS split from RULE NOT STATED; journal windowed), `910b2a122`
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
Self-test: 13 checks, exit 0. Mutants M6/M7 (the `rule_only` bucket and the journal window) are each killed with exit 1
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
| ii | seeds: batch key → its owner; unknown key → CC-INFRA; failed read → escalation | **PASS** (all three) |
| iii | fallback ≤ 2/day | day 0: 1 (the seed); **owed** |
| iv | churn 0; interleave escalations < 3.6/day | day 0: churn 0, escalations 0; **owed** |
| v | each day: deploy reflog, due count, installed lane sha | day 0: due 25, installed = ref; deploy reflog carried in each daily entry |

Stated limit (R2-3): a marker with no live alert row cannot be joined. It is counted as unjoined, never read as
agreement. The historical join blind spot is 247 of 838 markers.

## Finding folded in

The (v) leg listed `alert_owner_table.json` as an installed file. The bridge never installs it; it reads the table from
the mirror. So (v) printed UNREADABLE on every run, a standing false alarm. Fixed in `910b2a122`.
`DISPOSITION: folded into this batch.`

`REVIEWER: none spawned. Every load-bearing claim above carries its object and the command that re-derives it.`
NOT RE-READ: the pre-install failed-read seed result is cited from the r3 install note and was not re-run for this
record.

**Next:** Step 8, Langston's independent pass on this record and the day-0 read. Then the daily reads to T'+7d
(2026-11-28 00:13Z), each appended here.
