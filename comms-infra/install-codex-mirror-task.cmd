@echo off
REM Installs the Codex channel mirror as a Windows scheduled task, every 15 min.
REM Written as a .cmd because Git Bash mangles schtasks' /flags into paths.
REM Re-runnable: /F overwrites an existing task of the same name.

schtasks /create /tn "codex-channel-mirror" /tr "\"C:\Python313\python.exe\" \"C:\DawnTraderV3-infra\comms-infra\codex-channel-mirror.py\" --once" /sc minute /mo 15 /f
echo.
echo === verifying ===
schtasks /query /tn "codex-channel-mirror" /fo LIST | findstr /I "TaskName Next Status"
