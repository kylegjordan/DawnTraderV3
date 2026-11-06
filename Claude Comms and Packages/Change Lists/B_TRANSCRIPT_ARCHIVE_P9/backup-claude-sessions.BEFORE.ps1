# Backs up Claude Code to Google Drive, so a new laptop can be set up the same way.
# Additive: copies new/updated files, never deletes from the backup.
# Run by the "Claude Code Session Backup" scheduled task (daily, in the user session).
# Restore steps: "NEW LAPTOP RESTORE GUIDE.md" in the backup folder.
#
#   Session Transcripts\        every conversation + memory      (~\.claude\projects)
#   Desktop App Session List\   the Code tab's sidebar list      (%APPDATA%\Claude\claude-code-sessions)
#   Claude Settings\            settings, CLAUDE.md, hooks, skills, scheduled tasks, plugins, backup tools
#   Code\GmailHub\              Gmail Hub code (no other copy exists; .venv is rebuilt on restore)
#   Outlook Signatures\         signatures for every account
#   Windows Scheduled Tasks\    definitions of Kyle's own Windows tasks (XML)
#   Secrets Vault\              encrypted sign-ins and keys (~\.claude\backup\vault.py)

$ErrorActionPreference = 'Stop'

$root  = 'G:\My Drive\Claude Code Backup Folders'
$claude = Join-Path $env:USERPROFILE '.claude'
$log   = Join-Path $claude 'backup-claude-sessions.log'
$stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
$failed = @()

# G: only exists when Google Drive is mounted in the user session. Bail cleanly if not.
if (-not (Test-Path 'G:\My Drive')) {
    Add-Content $log "[$stamp] SKIPPED: G:\My Drive not mounted (Google Drive not running)."
    exit 0
}

# /E recurse; no /MIR so nothing is ever purged from the backup;
# /R:2 /W:5 light retry; /NFL /NDL /NP keep the log to summaries only.
function Copy-Part($label, $src, $dest, [string[]]$extra) {
    if (-not (Test-Path $src)) { Add-Content $log "[$stamp] $label - source missing, skipped: $src"; return }
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Add-Content $log "[$stamp] $label - $src -> $dest"
    $robocopyArgs = @($src, $dest) + $extra + @('/R:2', '/W:5', '/NFL', '/NDL', '/NP', "/LOG+:$log")
    robocopy @robocopyArgs | Out-Null
    if ($LASTEXITCODE -ge 8) { $script:failed += $label; Add-Content $log "[$stamp] ERROR: $label (robocopy exit $LASTEXITCODE)" }
}

Add-Content $log "[$stamp] Starting backup to $root"

Copy-Part 'Session transcripts' (Join-Path $claude 'projects') "$root\Session Transcripts" @('/E')
Copy-Part 'Desktop app session list' (Join-Path $env:APPDATA 'Claude\claude-code-sessions') "$root\Desktop App Session List" @('/E')

# Settings: listed files and folders only. Sign-ins and keys go to the encrypted vault, never here.
Copy-Part 'Claude settings (files)' $claude "$root\Claude Settings" @('settings.json', 'CLAUDE.md', 'backup-claude-sessions.ps1')
foreach ($d in 'hooks', 'skills', 'scheduled-tasks', 'plugins', 'backup') {
    Copy-Part "Claude settings ($d)" (Join-Path $claude $d) "$root\Claude Settings\$d" @('/E', '/XD', '__pycache__', '/XF', '*.enc')
}

Copy-Part 'Gmail Hub code' 'C:\GmailHub' "$root\Code\GmailHub" @('/E', '/XD', '.venv', '__pycache__')
Copy-Part 'Command Center code' 'C:\CommandCenter' "$root\Code\CommandCenter" @('/E', '/XD', '.venv', '__pycache__', '.pytest_cache', '_devdata')
Copy-Part 'Outlook signatures' (Join-Path $env:APPDATA 'Microsoft\Signatures') "$root\Outlook Signatures" @('/E')

# Windows scheduled task definitions (Kyle's own tasks, not Windows or vendor ones).
try {
    $taskDir = "$root\Windows Scheduled Tasks"
    New-Item -ItemType Directory -Force -Path $taskDir | Out-Null
    $tasks = Get-ScheduledTask -TaskPath '\' | Where-Object { $_.TaskName -notmatch '^(Microsoft|MicrosoftEdge|OneDrive|Google|Opera|Adobe|Launch Adobe|NvTm|NVIDIA|HP|CreateExplorerShellUnelevatedTask|npcapwatchdog|Intel|ZoomUpdate)' }
    foreach ($t in $tasks) { Export-ScheduledTask -TaskName $t.TaskName -TaskPath '\' | Set-Content -Encoding Unicode -Path (Join-Path $taskDir "$($t.TaskName).xml") }
    Add-Content $log "[$stamp] Windows scheduled tasks - exported $(@($tasks).Count)"
} catch { $failed += 'Windows scheduled tasks'; Add-Content $log "[$stamp] ERROR: Windows scheduled tasks - $_" }

# Encrypted secrets vault (does nothing until the vault has been set up).
try {
    $out = & 'C:\Python313\python.exe' (Join-Path $claude 'backup\vault.py') backup 2>&1
    Add-Content $log "[$stamp] Secrets vault - $($out -join ' ')"
    if ($LASTEXITCODE -ne 0) { $failed += 'Secrets vault' }
} catch { $failed += 'Secrets vault'; Add-Content $log "[$stamp] ERROR: Secrets vault - $_" }

if ($failed.Count) {
    Add-Content $log "[$stamp] Done WITH ERRORS: $($failed -join ', ')"
    exit 1
}
Add-Content $log "[$stamp] Done."
exit 0
