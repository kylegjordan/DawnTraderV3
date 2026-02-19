@echo off
echo ============================================
echo  DawnTrader Repository Sync
echo  Pulling latest from GitHub into local clone
echo ============================================
echo.

REM --- Configuration ---
set MAIN_REPO=G:\My Drive\Dawn Trader\DT_Clone_Repo\DawnTraderV3
set WORKTREE=%MAIN_REPO%\.claude\worktrees\keen-gagarin
set MAIN_BRANCH=dawntrader-v4
set WORKTREE_BRANCH=claude/keen-gagarin

REM --- Step 1: Fetch latest from GitHub ---
echo [1/4] Fetching latest from GitHub...
cd /d "%MAIN_REPO%"
git fetch origin
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to fetch from GitHub. Check your internet connection.
    pause
    exit /b 1
)
echo      Fetch complete.
echo.

REM --- Step 2: Fast-forward main branch ---
echo [2/4] Updating %MAIN_BRANCH% branch...
git checkout %MAIN_BRANCH%
git merge --ff-only origin/%MAIN_BRANCH%
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Could not fast-forward %MAIN_BRANCH%. May have local changes.
    echo          You may need to resolve this manually.
    pause
    exit /b 1
)
echo      %MAIN_BRANCH% is up to date.
echo.

REM --- Step 3: Update worktree branch ---
echo [3/4] Updating worktree branch (%WORKTREE_BRANCH%)...
cd /d "%WORKTREE%"
git merge %MAIN_BRANCH%
if %ERRORLEVEL% NEQ 0 (
    echo WARNING: Merge into worktree had conflicts. Resolve manually.
    pause
    exit /b 1
)
echo      Worktree updated.
echo.

REM --- Step 4: Show what changed ---
echo [4/4] Recent changes:
echo.
git log --oneline -5
echo.
echo ============================================
echo  Sync complete! Repository is up to date.
echo  Claude Code can now read the latest files.
echo ============================================
pause
