@echo off
REM Installs the Codex channel mirror as a Windows scheduled task, every 15 min.
REM Written as a .cmd because Git Bash mangles schtasks' /flags into paths.
REM Re-runnable: /F overwrites an existing task of the same name.

:: pythonw.exe, NOT python.exe -- python.exe allocates a CONSOLE, so this task flashed a
:: black terminal window on Kyle's screen four times an hour. Kyle asked for it to stop
:: 2026-09-05. The live task was corrected the same day; this line is the other half, or a
:: reinstall silently restores the flashing (fix-follows-pointer).
schtasks /create /tn "codex-channel-mirror" /tr "\"C:\Python313\pythonw.exe\" \"C:\DawnTraderV3-infra\comms-infra\codex-channel-mirror.py\" --once" /sc minute /mo 15 /f
echo.
echo === verifying ===
schtasks /query /tn "codex-channel-mirror" /fo LIST | findstr /I "TaskName Next Status"
