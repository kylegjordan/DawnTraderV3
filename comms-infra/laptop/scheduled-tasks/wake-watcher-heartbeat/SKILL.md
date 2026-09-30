---
name: wake-watcher-heartbeat
description: Hourly comms + wake-watcher heartbeat for ALL THREE Claude Code sessions (OLD / NEW / ANALYST) — health-check the Discord bridges + system alerts, then post the result to Discord so every session's wake watcher fires and each can re-verify + re-arm its watcher
---

Hourly comms + wake-watcher heartbeat for ALL THREE DawnTrader Claude Code sessions: OLD Claude (CC-A), NEW Claude (CC-B), and ANALYST Claude (CC-C).

This runs in a FRESH context with no memory of any session. ★ CHANGED 2026-09-30 (B-TOKEN-BURN-CUT, #1127): its value is step 2b — it reads each session's watcher liveness file on this laptop and wakes NOBODY when all are alive. It used to post a line that woke every session hourly so each could check itself; the all-clear has been suppressed since #995, and the watchers now prove their own liveness with a file. Do NOT try to arm or re-arm any Monitor here — the wake watchers live in the interactive sessions, not in this run; anything you arm here is useless to them.

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

2b. WATCHER LIVENESS — read on THIS laptop, wakes nobody (B-TOKEN-BURN-CUT, #1127). Each session's event-only watcher writes C:/Users/kyleg/.claude/cc-wake-state/<ALIAS>.json.alive every 300 s. For each of CC-A CC-B CC-C CC-INFRA:
   python -c "import os,time,sys; p='C:/Users/kyleg/.claude/cc-wake-state/'+sys.argv[1]+'.json.alive'; print(sys.argv[1], 'none' if not os.path.exists(p) else int(time.time()-os.path.getmtime(p)))" <ALIAS>
   Older than 900 s = DEAD (three missed keepalives). No file = "not armed" (a session that has not switched to the event-only watcher yet, or is closed).
   ⛔ A DEAD watcher CANNOT be woken by the Discord post in step 4 — it is the thing that is dead. That is why a DEAD result adds --notify (Kyle's phone) in step 4.

2c. DAILY CONTROL — only on the first run at or after 09:00 local, and only if ALL FOUR .alive files exist (until then some session is still on the old watcher, which would treat the control line as a message and WAKE):
   ssh root@204.168.141.77 'for a in CC-A CC-B CC-C CC-INFRA; do echo "WATCHER-CONTROL $a $(date -u +%Y%m%d)" >> /var/log/cc-wake.log; done'
   A live watcher answers by writing C:/Users/kyleg/.claude/cc-wake-state/<ALIAS>.json.control starting with that YYYYMMDD — no print, no wake. On the NEXT run, report any session whose .control does not start with today's date as "control NOT answered".

3. Compose ONE plain line: "bridges active: <y/n> | inbox-log last-write: <time> | active-unacked alerts: <none / list ids> | watchers: <all alive / DEAD: names / not armed: names> | control: <answered / NOT answered: names / not run>". If a bridge is NOT active or an alert is active+unacked, say so clearly so the woken sessions act on it.

4. POST that line to Discord so all three watchers fire. The message MUST name ALL FOUR sessions so none of them filter it out. ⚠️ Infra Claude was added 2026-08-26: the post named three, so his filter correctly SUPPRESSED it as "names other sessions, not me" and he sat outside this whole safety layer, and the sender MUST be "Heartbeat" — NOT any session's display name, or that session will treat it as its own post and never wake. Run:

   ssh root@204.168.141.77 '/opt/discord-bridges/venv/bin/python3 /opt/discord-bridges/discord-cc-bridge.py send --sender "Heartbeat" --message "OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: <the line from step 3>."'

   An all-clear post wakes nobody (every filter suppresses it, #995 OBJ-10). Add --notify ONLY when a watcher is DEAD or the control was NOT answered: that pings Kyle's phone, because a dead watcher cannot be reached any other way (the out-of-band wake is `B-WAKE-OUT-OF-BAND`, after live). Otherwise do NOT add --notify.

5. Output the same one line as your result so it also shows in the run history.

Connectors/tools: use the Bash tool for the SSH commands (keys are on this machine).