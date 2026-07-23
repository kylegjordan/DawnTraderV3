# dt-drive-backup.ps1 — refresh the OFF-PLATFORM archive of the repo onto Google Drive.
#
# WHY A BUNDLE AND NOT A REPO: git's own FAQ forbids putting any portion of a git
# repository on cloud-sync storage ("missing objects... broken refs... data loss").
# We measured it: a bare repo pushed to the G: drive reported SUCCESS while holding
# 2.7 MB with no pack file at all. A bundle is ONE large sequential file — the only
# write shape that mount survives.
#
# WHY THE GATE IS REPRODUCTION AND NOT COMPARISON: comparing refs proves the
# pointers agree and NOTHING about whether the objects exist. That check certified
# an empty backup four times. PASS is earned only by cloning FROM the archive and
# matching a known path's object hash against source.
#
# This is the laptop-side half. The Helsinki mirror self-updates from GitHub on its
# own schedule and does not depend on this machine being awake.

$ErrorActionPreference = 'Stop'
$Repo   = 'C:\DawnTraderV3'                                   # the spare/reference clone
$Branch = 'migration/aws-supabase'
$Known  = '1-system-manual/PHASE_19_PLAN.md'
$Drive  = 'G:\My Drive\Dawn Trader\DawnTraderV3-backup.bundle'
$Staging= Join-Path $env:TEMP 'dt-backup.bundle'
$Log    = Join-Path $env:USERPROFILE '.claude\dt-drive-backup.log'
$Stamp  = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

function Log($msg) { Add-Content -Path $Log -Value "$Stamp $msg" }

try {
    Set-Location $Repo
    git fetch --quiet origin $Branch
    git reset --hard --quiet "origin/$Branch"

    $srcCommit = (git rev-parse "origin/$Branch").Trim()
    $srcBlob   = (git rev-parse "origin/${Branch}:$Known").Trim()

    # Build LOCALLY first so a mid-write sync cannot corrupt creation, then copy one file.
    git bundle create $Staging $Branch 2>&1 | Out-Null
    Copy-Item -Path $Staging -Destination $Drive -Force

    # ---- THE GATE: reproduce from the archive that is actually on Drive ----
    $tmp = Join-Path $env:TEMP ("dt-gate-" + [guid]::NewGuid().ToString('N'))
    git clone --quiet --branch $Branch $Drive $tmp 2>&1 | Out-Null
    Push-Location $tmp
    $repCommit = (git rev-parse HEAD).Trim()
    $repBlob   = (git rev-parse "HEAD:$Known").Trim()
    Pop-Location
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue

    if ($srcCommit -eq $repCommit -and $srcBlob -eq $repBlob -and $repBlob) {
        Log "PASS reproduced=$repCommit blob=$repBlob"
        exit 0
    } else {
        Log "FAIL source=$srcCommit/$srcBlob reproduced=$repCommit/$repBlob - archive did NOT reproduce; treat as NOT a valid backup"
        exit 1
    }
}
catch {
    Log "ERROR $($_.Exception.Message)"
    exit 1
}
