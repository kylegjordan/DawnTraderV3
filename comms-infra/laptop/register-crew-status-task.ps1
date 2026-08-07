# register-crew-status-task.ps1 — install the crew-status job as a Windows Scheduled Task.
#
# B-CREW-STATUS. Langston's standing gate holds SCHEDULING specifically, so the properties he
# required are set HERE, in the definition, not left to the script's own behaviour:
#
#  * WorkingDirectory is pinned to a DEDICATED, NON-MAPPED directory (his C6). `claude -p`
#    writes its own transcript under a slug derived from the cwd; if that slug were one of the
#    four mapped session dirs — and `G--My-Drive` is one, on this very laptop — the job would
#    read its own summariser prompt back as "Kyle last said", with a fresh timestamp that also
#    cleared real unanswered-ask flags. Self-input through the transcript door.
#  * MultipleInstances = IgnoreNew: a cycle that runs long (the summariser can take ~60s on a
#    cold call) must never have a second copy started on top of it.
#  * 60s repetition — Task Scheduler's floor. No sub-minute attempt was made.
#  * Runs ONLY when the user is logged on, deliberately: the job needs Kyle's ssh keys, his
#    gh token file and the claude CLI's auth. A "whether logged on or not" task would run
#    without those and fail silently every minute, which is worse than not running.
#  * Output is appended to a log. A scheduled job with no trace makes "is it working?"
#    unanswerable — the exact complaint that shipped the fresh-rules hook without logging.
#
# Rollback: Unregister-ScheduledTask -TaskName "DawnTrader Crew Status" -Confirm:$false
# The page and the Discord message simply stop updating and BOTH state their own age, so the
# failure mode is visibly stale rather than quietly wrong.

$ErrorActionPreference = "Stop"

$TaskName = "DawnTrader Crew Status"
$Script   = "C:\DawnTraderV3-infra\comms-infra\laptop\crew-status.py"
$WorkDir  = "$env:USERPROFILE\.claude\crew-status-work"   # NOT a mapped session slug (C6)
$LogFile  = "$env:USERPROFILE\.claude\crew-status-task.log"

New-Item -ItemType Directory -Force -Path $WorkDir | Out-Null

# cmd /c wrapper so both streams can be appended to one log without PowerShell's redirection
# quirks; the python job itself is quiet on success and loud on failure.
$cmd = "/c python `"$Script`" --once >> `"$LogFile`" 2>&1"

$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument $cmd -WorkingDirectory $WorkDir

# [TimeSpan]::MaxValue serialises to P99999999DT23H59M59S, which Task Scheduler REJECTS as out
# of range (measured — the registration failed outright). An EMPTY Duration is the schema's way
# of saying "repeat indefinitely", so the trigger is built and then the field cleared.
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date) `
    -RepetitionInterval (New-TimeSpan -Minutes 1)
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
    -Description "Derives crew status from existing artifacts (Discord log, Desktop transcripts, git, board, alerts) and writes the local page + the standing Discord message. No session does anything differently. B-CREW-STATUS." | Out-Null

# Read the registration BACK rather than trusting the exit — a success return is not the row.
# ★ And do NOT announce success before the read-back proves it: the first version of this
# script printed "REGISTERED" unconditionally and then crashed on a null task, which is the
# same unconditional-success pattern that has already produced three false "landed" claims in
# this batch. Verify, THEN report.
$t = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if (-not $t) { Write-Output "REGISTRATION FAILED: no task named '$TaskName' exists after the call."; exit 1 }
$i = $t | Get-ScheduledTaskInfo
Write-Output "REGISTERED: $($t.TaskName)"
Write-Output "  state              : $($t.State)"
Write-Output "  working directory  : $($t.Actions[0].WorkingDirectory)"
Write-Output "  multiple instances : $($t.Settings.MultipleInstancesPolicy)  (IgnoreNew = no overlap)"
Write-Output "  repetition         : $($t.Triggers[0].Repetition.Interval)"
Write-Output "  next run           : $($i.NextRunTime)"
Write-Output "  log                : $LogFile"
