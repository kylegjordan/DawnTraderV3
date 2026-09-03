---
name: wake-watcher-heartbeat
description: Hourly comms + wake-watcher heartbeat for ALL THREE Claude Code sessions (OLD / NEW / ANALYST) — health-check the Discord bridges + system alerts, then post the result to Discord so every session's wake watcher fires and each can re-verify + re-arm its watcher
---

Hourly comms + wake-watcher heartbeat for ALL THREE DawnTrader Claude Code sessions: OLD Claude (CC-A), NEW Claude (CC-B), and ANALYST Claude (CC-C).

This runs in a FRESH context with no memory of any session. Its PRIMARY value is the Discord post in step 4: every session's wake watcher tails the Discord inbox, so one post naming all three names wakes all three. That hourly cue lets each session re-verify and re-arm its own wake watcher, covering the case where a watcher dies mid-session WITHOUT a context compaction (compaction is already handled by the SessionStart hook). Do NOT try to arm or re-arm any Monitor here — the wake watchers live in the interactive sessions, not in this run; anything you arm here is useless to them.

Do exactly this, keep it short:

1. SSH root@204.168.141.77 and run: systemctl is-active discord-cc-bridge.service discord-langston-bridge.service  (both should print "active").
   Then get the inbox log's AGE IN SECONDS — computed on the server, never by comparing a timestamp you read to your own clock:
   ssh root@204.168.141.77 'echo $(( $(date +%s) - $(stat -c %Y /var/log/cc-discord-inbox.jsonl) ))'
   Report it as "recent" under ~3600s. STALE only above that.
   ⛔ THIS COMPARED A UTC TIMESTAMP TO LOCAL WALL-CLOCK TIME UNTIL 2026-08-28 AND RAISED A FALSE STALE ALARM EVERY SINGLE HOUR. Measured: it reported a log written 21:04Z as "STALE, over an hour old" while the file's real age was ONE MINUTE and the channel was actively busy (three posts, a push notice and a reviewer reply inside the preceding three minutes). The task runs on a machine whose local clock is offset from UTC, so subtracting by eye added the offset as apparent age. Computing the delta ON THE SERVER removes both clocks from the comparison.
   ★ WHY THIS MATTERED MORE THAN A WRONG NUMBER: it fired hourly, forever, and a warning that is always wrong teaches four sessions to skip the line it appears on — the same alert-fatigue failure recorded for the disk alarm, where clearing it became reflex and the next one would have been ignored too.

2. SSH root@188.245.193.8 and read the WHOLE alert file, not a tail — count every entry whose state is "active", acknowledged_at is null, and triggers_at is in the past.
   ⛔ THIS READ `tail -20` UNTIL 2026-08-26 AND IT UNDER-REPORTED EVERY HOUR. MEASURED that day: the file held 735 rows and NINE due alerts, the oldest fired 2026-08-07 — a 20-row tail reaches none of them. A session using the same shape reported "2 active" the same evening and was corrected by Langston. The queue is append-only and re-surfaces on a back-off, so the due items are scattered through the file, NOT clustered at the end.
   ssh root@188.245.193.8 'cat /var/log/dawntrader/system-alerts.jsonl' | python3 -c "
import sys,json
from datetime import datetime,timezone
now=datetime.now(timezone.utc); due=[]
for l in sys.stdin:
    l=l.strip()
    if not l: continue
    try: o=json.loads(l)
    except Exception: continue
    if o.get('state')!='active' or o.get('acknowledged_at') is not None: continue
    t=o.get('triggers_at')
    try:
        if t and datetime.fromisoformat(str(t).replace('Z','+00:00'))>now: continue
    except Exception: pass
    due.append(o)
print(len(due),'due:',[str(o.get('id'))[:8] for o in due])"

3. Compose ONE plain line: "bridges active: <y/n> | inbox-log last-write: <time> | active-unacked alerts: <none / list ids>". If a bridge is NOT active or an alert is active+unacked, say so clearly so the woken sessions act on it.

4. POST that line to Discord so all three watchers fire. The message MUST name ALL FOUR sessions so none of them filter it out. ⚠️ Infra Claude was added 2026-08-26: the post named three, so his filter correctly SUPPRESSED it as "names other sessions, not me" and he sat outside this whole safety layer, and the sender MUST be "Heartbeat" — NOT any session's display name, or that session will treat it as its own post and never wake. Run:

   ssh root@204.168.141.77 '/opt/discord-bridges/venv/bin/python3 /opt/discord-bridges/discord-cc-bridge.py send --sender "Heartbeat" --message "OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: <the line from step 3>. Re-verify your wake watcher is alive (are WAKE events arriving?); re-arm only if dead, and TaskStop a duplicate if you then see doubled wake events. Then sweep the Discord inbox for anything missed."'

   Do NOT add --notify (that pings Kyle's phone; this is a routine crew heartbeat, not something he needs pushed to him).

5. Output the same one line as your result so it also shows in the run history.

Connectors/tools: use the Bash tool for the SSH commands (keys are on this machine).