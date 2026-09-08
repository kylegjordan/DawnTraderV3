@echo off
REM Installs the Codex Discord OUTBOX as a Windows scheduled task, every 5 min.
REM Written as a .cmd because Git Bash mangles schtasks' /flags into paths
REM (measured again 2026-09-08: /query became 'C:/Program Files/Git/query').
REM Re-runnable: /F overwrites an existing task of the same name.

:: pythonw.exe, NOT python.exe. And pythonw ALONE IS NOT ENOUGH here -- the script also
:: passes CREATE_NO_WINDOW to its scp/ssh children, because those are CONSOLE applications
:: and Windows gives the CHILD its own console regardless of what the parent is. Kyle
:: reported the flashing black window on the mirror on 2026-09-05, and switching that task
:: to pythonw did NOT stop it. Both halves are required; removing either restores the flash.
schtasks /create /tn "codex-discord-outbox" /tr "\"C:\Python313\pythonw.exe\" \"C:\DawnTraderV3-infra\comms-infra\codex-discord-outbox.py\" --once" /sc minute /mo 5 /f
echo.
echo === verifying ===
schtasks /query /tn "codex-discord-outbox" /fo LIST | findstr /I "TaskName Next Status"
