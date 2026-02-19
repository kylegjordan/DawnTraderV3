@echo off
echo ============================================
echo  DawnTrader Repository Sync
echo  Pulling latest from GitHub into local clone
echo ============================================
echo.

REM --- Configuration ---
set REPO=G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3
set BRANCH=dawntrader-v4

cd /d "%REPO%"

REM --- Step 1: Fetch latest from GitHub ---
echo [1/3] Fetching latest from GitHub...
git fetch origin
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to fetch from GitHub. Check your internet connection.
    pause
    exit /b 1
)
echo      Fetch complete.
echo.

REM --- Step 2: Fast-forward to match remote ---
echo [2/3] Updating %BRANCH% branch...
git checkout %BRANCH%
git merge --ff-only origin/%BRANCH%
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Could not fast-forward %BRANCH%. May have local changes.
    echo          Run: git reset --hard origin/%BRANCH%
    echo          (This discards local changes to match GitHub exactly)
    pause
    exit /b 1
)
echo      %BRANCH% is up to date.
echo.

REM --- Step 3: Show what changed ---
echo [3/3] Recent changes:
echo.
git log --oneline -5
echo.
echo ============================================
echo  Sync complete! Repository is up to date.
echo  Claude Code can now read the latest files.
echo ============================================
echo.
echo  Repo: %REPO%
echo  Branch: %BRANCH%
echo ============================================
pause
