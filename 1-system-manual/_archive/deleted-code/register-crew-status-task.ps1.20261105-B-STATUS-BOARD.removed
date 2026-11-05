# register-crew-status-task.ps1 - install the crew-status job as a Windows Scheduled Task.
#
# ASCII ONLY, DELIBERATELY. Windows PowerShell 5.1 reads .ps1 files as ANSI unless they carry a
# BOM, so a UTF-8 em-dash in a comment corrupts the parse and the whole script fails to run.
# That happened here on 2026-08-07 and left the task on its previous definition, which meant the
# defect this rewrite exists to fix (a console window every 60 seconds) kept happening while the
# fix "had been applied". Keep this file ASCII.
#
# B-CREW-STATUS. Langston's gate holds SCHEDULING, so the properties he required are set HERE,
# in the definition, not left to the script's own behaviour:
#
#  * WorkingDirectory is pinned to a DEDICATED, NON-MAPPED directory (his C6). `claude -p`
#    writes its own transcript under a slug derived from the cwd; if that slug were one of the
#    four mapped session dirs - and one IS, on this laptop - the job would read its own
#    summariser prompt back as "Kyle last said", with a fresh timestamp that also cleared real
#    unanswered-ask flags. Self-input through the transcript door.
#  * pythonw.exe, NOT cmd.exe. Kyle, 2026-08-07: "these terminal windows open up and they just
#    sit there, and every one minute they flash up on the screen." The console existed ONLY so
#    a shell could redirect output into a log, so the script now writes its own log and the task
#    runs the windowless interpreter. -Hidden in the settings does NOT prevent this: it hides
#    the task, not a console spawned by the action.
#  * MultipleInstances = IgnoreNew, paired with a 10-minute ExecutionTimeLimit - IgnoreNew alone
#    would let one hung instance suppress every future tick forever (Langston).
#  * 60s repetition - Task Scheduler's floor. No sub-minute attempt.
#  * Runs ONLY when the user is logged on, deliberately: the job needs Kyle's ssh keys, his gh
#    token file and the claude CLI's auth. A "whether logged on or not" task would run without
#    those and fail silently every minute, which is worse than not running.
#
# Rollback: Unregister-ScheduledTask -TaskName "DawnTrader Crew Status" -Confirm:$false
# The page and the Discord message then simply stop updating, and BOTH state their own age, so
# the failure mode is visibly stale rather than quietly wrong.

$ErrorActionPreference = "Stop"

$TaskName = "DawnTrader Crew Status"
$Script   = "C:\DawnTraderV3-infra\comms-infra\laptop\crew-status.py"
$WorkDir  = "$env:USERPROFILE\.claude\crew-status-work"   # NOT a mapped session slug (C6)
$LogFile  = "$env:USERPROFILE\.claude\crew-status-task.log"

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

$Pythonw = (Get-Command pythonw.exe -ErrorAction SilentlyContinue).Source
if (-not $Pythonw) { throw "pythonw.exe not found on PATH; it is required so the job runs without a console window." }

$action = New-ScheduledTaskAction -Execute $Pythonw -Argument "`"$Script`" --once" -WorkingDirectory $WorkDir

# [TimeSpan]::MaxValue serialises to P99999999DT23H59M59S, which Task Scheduler REJECTS as out
# of range (measured - the registration failed outright). An EMPTY Duration is the schema's way
# of saying "repeat indefinitely", so the trigger is built and then the field cleared.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 1)
$trigger.Repetition.Duration = ""

$settings = New-ScheduledTaskSettingsSet `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 10) `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -Hidden

$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force `
    -Description "Derives crew status from existing artifacts and writes the local page plus the standing Discord message. No session does anything differently. B-CREW-STATUS." | Out-Null

# Read the registration BACK rather than trusting the exit - a success return is not the row.
# And do NOT announce success before the read-back proves it: an earlier version printed
# REGISTERED unconditionally and then crashed on a null task, which is the same
# unconditional-success pattern that produced three false "landed" claims in this batch.
$t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $t) { Write-Output "REGISTRATION FAILED: no task named '$TaskName' exists after the call."; exit 1 }
$i = $t | Get-ScheduledTaskInfo
Write-Output "REGISTERED: $($t.TaskName)"
Write-Output "  state              : $($t.State)"
Write-Output "  executes           : $($t.Actions[0].Execute)"
Write-Output "  arguments          : $($t.Actions[0].Arguments)"
Write-Output "  working directory  : $($t.Actions[0].WorkingDirectory)"
Write-Output "  multiple instances : $($t.Settings.MultipleInstances)"
Write-Output "  repetition         : $($t.Triggers[0].Repetition.Interval)"
Write-Output "  next run           : $($i.NextRunTime)"
Write-Output "  log                : $LogFile"
if ($t.Actions[0].Execute -match 'cmd\.exe') { Write-Output "  WARNING: still launching via cmd.exe - a console will appear every cycle." }
