#!/usr/bin/env bash
# How many wake watchers are running for one session alias — read BEFORE re-arming on a stale .alive
# (B-TOKEN-BURN-CUT Step 7, Langston): since cfe70f92c a stale .alive means EITHER no watcher (dead) OR a watcher
# that runs but cannot save its position — and the usual reason it cannot save is a SECOND watcher of the same alias
# holding the file. Re-arming in that case adds a third.
#   0  -> dead: re-arm (shared MEMORY 4.5).
#   1  -> running: do NOT arm another. If .alive is stale too, its output says `keepalive save skipped` — find what
#         else holds the state file.
#   2+ -> duplicates: TaskStop all but one.
# Counts only the interpreter (python.exe): the WindowsApps python3.exe launcher is a second process per watcher, and
# any shell whose command line merely contains this search text (including this script's) is not a watcher.
# Limit: a watcher started under an interpreter not named python.exe is not counted.
A="${1:?usage: cc-wake-count.sh <ALIAS>}"
powershell -NoProfile -Command "@(Get-CimInstance Win32_Process -Filter \"Name='python.exe'\" | Where-Object { \$_.CommandLine -match 'cc-wake-filter\.py $A --once' }).Count"
