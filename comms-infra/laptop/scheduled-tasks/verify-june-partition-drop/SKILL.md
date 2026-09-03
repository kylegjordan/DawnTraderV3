---
name: verify-june-partition-drop
description: Verify the June ticker-snap partition actually dropped and DB disk fell back to ~56%
---

You are CC-B (NEW Claude). This is a DATED VERIFICATION owed to Langston (committed 2026-07-27): confirm the DB-disk 81% CRITICAL alert self-resolved as predicted, rather than being quietly accepted as "expected."

BACKGROUND: On 2026-07-27 the DB was 163 GB of its 200 GB cap (81%). The single largest object was `xstock_spot_ticker_snap_2026_06` at 50 GB — the JUNE monthly partition. ticker_snap retention is 30-day hot; pre-2026-08-01 partitions are MONTHLY, so June's partition can only drop once its newest row (06-30) clears 30 days = ~07-30/31. Predicted: it drops, DB falls 163 GB → ~113 GB (~56%). Daily partitioning begins 2026-08-01 (daily-partition-cutover.ts).

WHAT TO DO:
1. Query staging. SSH root@188.245.193.8 then `su - deploy -c 'cd /home/deploy/dawntrader && set -a && . ./.env && psql "$DATABASE_URL" -f /tmp/q.sql'`. IMPORTANT quoting trap: nested single quotes and `$$` both break through `su -c` — write the SQL to a temp file first with a heredoc and use `psql -f`. Check: (a) total DB size `pg_database_size`, (b) whether `xstock_spot_ticker_snap_2026_06` still exists, (c) the largest tables.
2. IF the June partition is GONE and DB is back near ~56% (roughly 105-120 GB): PREDICTION CONFIRMED — the tiering works. Resolve any active DB-disk system alert with evidence (`npm run system-alerts -- resolve <FULL-UUID> --by cc-session-<date> --evidence "<path:line or measured figures>"` — evidence must LEAD with a reference token, free text is rejected). Post a brief plain-language note to Kyle on Discord (`ssh root@204.168.141.77 "cc-send --sender 'NEW Claude' --message '...'"`) AND tell Langston it verified. Then DELETE this scheduled task.
3. IF the June partition is STILL THERE (or the DB is still >75%): THIS IS A REAL TIERING FAILURE, not expected noise. Do NOT dismiss it. Investigate why the retention sweep didn't drop it (check the b75-retention sweep cron + its log, and whether the table is registered in the sweep's hardcoded table list — a known trap: adding a table to retention config alone does NOT tier it, it must also be in the sweep list). File it in RUNNING_ISSUES with a named batch home per §9.4, surface to Kyle in plain language, and tell Langston (he flagged this and is owed the outcome either way).

Do the §10.5 alert check first per CLAUDE.md. Plain language to Kyle; technical detail is fine for Langston.