---
name: wake-watcher-heartbeat-cc-a
description: Hourly comms + wake-watcher heartbeat for the CC-A (OLD Claude) session — health-check the Discord bridges/alerts, and (the real point) wake the CC-A session so it can re-verify + re-arm its wake watcher
---

Hourly comms + wake-watcher heartbeat for the CC-A ("OLD Claude") DawnTrader session.

This runs in a FRESH context. Its PRIMARY value is the completion notification it sends back to the CC-A interactive session: that hourly cue lets CC-A re-verify and re-arm its wake watcher, covering the case where the watcher dies mid-session WITHOUT a context compaction (compaction is already handled by the SessionStart hook). Do NOT try to arm/re-arm any Monitor here — the wake watcher lives in the CC-A interactive session, not in this run; anything you arm here is useless to that session.

Do exactly this, keep it short, and output ONE line:
1. SSH root@204.168.141.77 and run: systemctl is-active discord-cc-bridge.service discord-langston-bridge.service  (both should print "active"); and stat -c %y /var/log/cc-discord-inbox.jsonl (when the Discord inbox log was last written — "recent" = within the last hour or so of normal chatter).
2. SSH root@188.245.193.8 and run: tail -20 /var/log/dawntrader/system-alerts.jsonl  — note any entry whose latest state is "active" and acknowledged_at is null (a real un-handled alert).
3. Output ONE plain line: "bridges active: <y/n> | inbox-log last-write: <time> | active-unacked alerts: <none / list ids>". If a bridge is NOT active or an alert is active+unacked, say so clearly so the notified CC-A session acts on it.

Connectors/tools: use the Bash tool for the SSH commands (keys are on this machine). No Discord post needed — the completion notification is what matters.