# B-TOKEN-BURN-CUT — Step 8 condition: raw wake-audit output (CC-A, 2026-10-01 ~22:28Z)

Instrument: `scripts/analysis/b-token-burn-cut-wake-audit.py` at the commit that adds this file (precedence fixed, five buckets plus their sum, OTHER summaries listed, each transcript's first and last entry timestamps). Run on the laptop; verbatim output below. ⚠️ Laptop-only: RULED ON REPORTED FACT for Langston, here so the derivation and the observed span are second-party checkable.

**What it settles:** CC-A's transcript `66dbb030` spans 2026-04-15 to now — the 20:37Z resume did NOT open a new transcript. The `--all` run finds one other CC-A file touched today (`f235cb15`, a 4-minute scheduled-task run, 0 notifications). Over CC-A's idle stretch (window `2026-09-30T21:29`..`2026-10-01T20:37`) the transcript holds ONE notification, a timer of mine (OTHER), and zero watcher, empty or Monitor.

## 1. Newest transcript per alias — window 2026-10-01T00:00 .. 2026-10-01T23:59 UTC

```
CC-A 66dbb030-b3cb-4448-8086-39344c645007.jsonl  entries 2026-04-15T21:42:24 .. 2026-10-01T22:27:52  first arm in window: 2026-10-01T20:37:35
   notifications in window: 7  ->  {'watcher_wake': 7, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 0}  (sum 7)
CC-B 0fe1c46a-a390-40b1-92b3-b160c6024f60.jsonl  entries 2026-05-11T19:23:14 .. 2026-10-01T22:15:04  first arm in window: 2026-10-01T01:49:10
   notifications in window: 10  ->  {'watcher_wake': 8, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 2}  (sum 10)
   OTHER x2: Background command "Recount after 40s, then arm the CC-B watcher" comp
CC-C 4dfcc10e-4139-42d2-88d6-5b54af3cbe7b.jsonl  entries 2026-05-11T19:23:14 .. 2026-10-01T22:27:50  first arm in window: 2026-10-01T01:01:54
   notifications in window: 30  ->  {'watcher_wake': 10, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 20}  (sum 30)
   OTHER x3: Background command "Push once no CI run is in progress" completed (exi
   OTHER x2: Agent "Object check of the valve audit" finished
   OTHER x1: Background command "Wait for Langston's next reply addressed to me, th
   OTHER x1: Background command "Wait for Langston's next reply to me, then exit" c
   OTHER x1: Background command "Push the r4 commit once CI is idle" completed (exi
   OTHER x1: Background command "Push the folds once CI is idle" completed (exit co
   OTHER x1: Background command "Push the fixes once CI is idle" completed (exit co
   OTHER x1: Background command "Wait for the CI run and print per-job results" com
CC-INFRA 644fc5fe-3be9-4b77-8317-91cba9fe8f43.jsonl  entries 2026-09-30T12:24:11 .. 2026-10-01T22:27:56  first arm in window: 2026-10-01T01:48:45
   notifications in window: 10  ->  {'watcher_wake': 9, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 1}  (sum 10)
   OTHER x1: Background command "Run the three mutation runners at the current head
```

## 2. Every transcript touched since window start (--all) — window 2026-10-01T00:00 .. 2026-10-01T23:59 UTC

```
CC-A 66dbb030-b3cb-4448-8086-39344c645007.jsonl  entries 2026-04-15T21:42:24 .. 2026-10-01T22:27:52  first arm in window: 2026-10-01T20:37:35
   notifications in window: 7  ->  {'watcher_wake': 7, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 0}  (sum 7)
CC-A f235cb15-1117-4ea0-9eb4-b0ae22162c72.jsonl  entries 2026-10-01T07:26:36 .. 2026-10-01T07:31:05  first arm in window: None
   notifications in window: 0  ->  {'watcher_wake': 0, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 0}  (sum 0)
CC-B 0fe1c46a-a390-40b1-92b3-b160c6024f60.jsonl  entries 2026-05-11T19:23:14 .. 2026-10-01T22:15:04  first arm in window: 2026-10-01T01:49:10
   notifications in window: 10  ->  {'watcher_wake': 8, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 2}  (sum 10)
   OTHER x2: Background command "Recount after 40s, then arm the CC-B watcher" comp
CC-C 157dc1ed-d5b7-4c6f-a6cd-eb377b890318.jsonl  entries 2026-10-01T08:10:58 .. 2026-10-01T08:11:25  first arm in window: None
   notifications in window: 0  ->  {'watcher_wake': 0, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 0}  (sum 0)
CC-C 4dfcc10e-4139-42d2-88d6-5b54af3cbe7b.jsonl  entries 2026-05-11T19:23:14 .. 2026-10-01T22:28:16  first arm in window: 2026-10-01T01:01:54
   notifications in window: 30  ->  {'watcher_wake': 10, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 20}  (sum 30)
   OTHER x3: Background command "Push once no CI run is in progress" completed (exi
   OTHER x2: Agent "Object check of the valve audit" finished
   OTHER x1: Background command "Wait for Langston's next reply addressed to me, th
   OTHER x1: Background command "Wait for Langston's next reply to me, then exit" c
   OTHER x1: Background command "Push the r4 commit once CI is idle" completed (exi
   OTHER x1: Background command "Push the folds once CI is idle" completed (exit co
   OTHER x1: Background command "Push the fixes once CI is idle" completed (exit co
   OTHER x1: Background command "Wait for the CI run and print per-job results" com
CC-INFRA 644fc5fe-3be9-4b77-8317-91cba9fe8f43.jsonl  entries 2026-09-30T12:24:11 .. 2026-10-01T22:28:12  first arm in window: 2026-10-01T01:48:45
   notifications in window: 10  ->  {'watcher_wake': 9, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 1}  (sum 10)
   OTHER x1: Background command "Run the three mutation runners at the current head
```

## 3. CC-A's idle stretch, --all — window 2026-09-30T21:29 .. 2026-10-01T20:37 UTC

```
CC-A 66dbb030-b3cb-4448-8086-39344c645007.jsonl  entries 2026-04-15T21:42:24 .. 2026-10-01T22:28:27  first arm in window: None
   notifications in window: 1  ->  {'watcher_wake': 0, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 1}  (sum 1)
   OTHER x1: Background command "After the 21:30 tick, check for alerts on this bat
CC-A f235cb15-1117-4ea0-9eb4-b0ae22162c72.jsonl  entries 2026-10-01T07:26:36 .. 2026-10-01T07:31:05  first arm in window: None
   notifications in window: 0  ->  {'watcher_wake': 0, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 0}  (sum 0)
CC-B 0fe1c46a-a390-40b1-92b3-b160c6024f60.jsonl  entries 2026-05-11T19:23:14 .. 2026-10-01T22:15:04  first arm in window: 2026-10-01T01:49:10
   notifications in window: 2  ->  {'watcher_wake': 2, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 0}  (sum 2)
CC-C 157dc1ed-d5b7-4c6f-a6cd-eb377b890318.jsonl  entries 2026-10-01T08:10:58 .. 2026-10-01T08:11:25  first arm in window: None
   notifications in window: 0  ->  {'watcher_wake': 0, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 0}  (sum 0)
CC-C 4dfcc10e-4139-42d2-88d6-5b54af3cbe7b.jsonl  entries 2026-05-11T19:23:14 .. 2026-10-01T22:28:28  first arm in window: 2026-10-01T01:01:54
   notifications in window: 13  ->  {'watcher_wake': 5, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 8}  (sum 13)
   OTHER x1: Background command "Wait for Langston's next reply addressed to me, th
   OTHER x1: Background command "Wait for Langston's next reply to me, then exit" c
   OTHER x1: Background command "Push the r4 commit once CI is idle" completed (exi
   OTHER x1: Background command "Push the folds once CI is idle" completed (exit co
   OTHER x1: Background command "Push the fixes once CI is idle" completed (exit co
   OTHER x1: Background command "Wait for the CI run and print per-job results" com
   OTHER x1: Background command "Push the scope once CI is idle" completed (exit co
   OTHER x1: Background command "Check the watcher is alive and re-arm it" complete
CC-INFRA 644fc5fe-3be9-4b77-8317-91cba9fe8f43.jsonl  entries 2026-09-30T12:24:11 .. 2026-10-01T22:28:45  first arm in window: 2026-10-01T01:48:45
   notifications in window: 3  ->  {'watcher_wake': 3, 'watcher_empty': 0, 'watcher_unreadable': 0, 'monitor': 0, 'other_task': 0}  (sum 3)
```

