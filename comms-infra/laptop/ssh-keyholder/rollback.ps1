[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][string]$InstallState
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run rollback from an elevated PowerShell window.'
}

$statePath = [IO.Path]::GetFullPath($InstallState)
if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) { throw "Install state not found: $statePath" }
$state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
$expectedInstallRoot = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE '.claude\ssh-keyholder'))
$expectedStateRoot = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'DawnTrader\ssh-keyholder'))
$expectedConfigPath = [IO.Path]::GetFullPath((Join-Path $expectedStateRoot 'config.json'))
$expectedMarkerPath = [IO.Path]::GetFullPath((Join-Path $expectedStateRoot 'unlock.json'))
$expectedGpoScriptsRoot = [IO.Path]::GetFullPath((Join-Path $env:SystemRoot 'System32\GroupPolicy\User\Scripts'))
$expectedGpoIni = [IO.Path]::GetFullPath((Join-Path $expectedGpoScriptsRoot 'scripts.ini'))
$expectedGpoLogoff = [IO.Path]::GetFullPath((Join-Path $expectedGpoScriptsRoot 'Logoff\DawnTraderSshKeyholderLock.cmd'))
$expectedBackupBase = [IO.Path]::GetFullPath((Join-Path $env:ProgramData 'DawnTrader\ssh-keyholder-backups'))
$recordedBackupRoot = [IO.Path]::GetFullPath($state.backupRoot)
$registryPath = 'Registry::HKEY_CURRENT_USER\Software\OpenSSH\Agent\Keys'
$sshAdd = 'C:\Windows\System32\OpenSSH\ssh-add.exe'
$syncPolicyPath = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Policies\System'
$syncPolicyName = 'RunLogonScriptSync'

if ([int]$state.version -ne 2) { throw 'Refusing rollback: unsupported install-state version.' }
if ([IO.Path]::GetFullPath($state.installRoot) -ne $expectedInstallRoot) { throw 'Refusing rollback: unexpected install root.' }
if ([IO.Path]::GetFullPath($state.stateRoot) -ne $expectedStateRoot) { throw 'Refusing rollback: unexpected runtime state root.' }
if ([IO.Path]::GetFullPath($state.configPath) -ne $expectedConfigPath) { throw 'Refusing rollback: unexpected config path.' }
if ([IO.Path]::GetFullPath($state.markerPath) -ne $expectedMarkerPath) { throw 'Refusing rollback: unexpected marker path.' }
if ([IO.Path]::GetFullPath($state.gpoIniPath) -ne $expectedGpoIni) { throw 'Refusing rollback: unexpected local Group Policy script file.' }
if ([IO.Path]::GetFullPath($state.gpoLogoffPath) -ne $expectedGpoLogoff) { throw 'Refusing rollback: unexpected logoff script path.' }
if (($recordedBackupRoot + [IO.Path]::DirectorySeparatorChar) -notlike ($expectedBackupBase + [IO.Path]::DirectorySeparatorChar + '*')) {
    throw 'Refusing rollback: recorded backup root is outside the bounded backup path.'
}
if ([IO.Path]::GetDirectoryName($statePath) -ne $recordedBackupRoot) { throw 'Refusing rollback: manifest is outside its recorded backup root.' }
if ($state.taskName -ne 'DawnTrader SSH Keyholder Lock') { throw 'Refusing rollback: unexpected task name.' }
if (-not $PSCmdlet.ShouldProcess($expectedInstallRoot, 'Restore the exact recorded pre-install key-holder state')) { return }

# Do not trust the installed Python files during rollback. Purge through fixed Windows
# components, then prove the holder is cold before restoring the recorded pre-state.
Remove-Item -LiteralPath $expectedMarkerPath -Force -ErrorAction SilentlyContinue
Set-Service -Name ssh-agent -StartupType Manual
Start-Service -Name ssh-agent
& $sshAdd -D *> $null
if ($LASTEXITCODE -notin @(0, 1)) { throw 'Direct ssh-agent identity purge failed; rollback stopped.' }
Remove-Item -LiteralPath $registryPath -Recurse -Force -ErrorAction SilentlyContinue
Stop-Service -Name ssh-agent -Force
$lockedService = Get-CimInstance Win32_Service -Filter "Name='ssh-agent'"
if ($lockedService.State -ne 'Stopped' -or [int]$lockedService.ProcessId -ne 0) { throw 'ssh-agent is not stopped during rollback.' }
if (Test-Path -LiteralPath $registryPath) { throw 'ssh-agent registry material remains during rollback.' }
if (Test-Path -LiteralPath $expectedMarkerPath) { throw 'unlock marker remains during rollback.' }

Unregister-ScheduledTask -TaskName $state.taskName -Confirm:$false -ErrorAction SilentlyContinue
$taskBackup = Join-Path $recordedBackupRoot 'task.xml'
if ([bool]$state.previousTaskPresent) {
    if (-not (Test-Path -LiteralPath $taskBackup -PathType Leaf)) { throw 'Recorded prior task XML is missing.' }
    Register-ScheduledTask -TaskName $state.taskName -Xml (Get-Content -LiteralPath $taskBackup -Raw) -Force | Out-Null
}

$gpoIniBackup = Join-Path $recordedBackupRoot 'scripts.ini'
if ([bool]$state.gpoIniPresent) {
    if (-not (Test-Path -LiteralPath $gpoIniBackup -PathType Leaf)) { throw 'Recorded prior scripts.ini is missing.' }
    Copy-Item -LiteralPath $gpoIniBackup -Destination $expectedGpoIni -Force
} else {
    Remove-Item -LiteralPath $expectedGpoIni -Force -ErrorAction SilentlyContinue
}
$gpoLogoffBackup = Join-Path $recordedBackupRoot 'logoff.cmd'
if ([bool]$state.gpoLogoffPresent) {
    if (-not (Test-Path -LiteralPath $gpoLogoffBackup -PathType Leaf)) { throw 'Recorded prior logoff script is missing.' }
    Copy-Item -LiteralPath $gpoLogoffBackup -Destination $expectedGpoLogoff -Force
} else {
    Remove-Item -LiteralPath $expectedGpoLogoff -Force -ErrorAction SilentlyContinue
}
if ([bool]$state.syncPolicyPresent) {
    New-Item -Path $syncPolicyPath -Force | Out-Null
    New-ItemProperty -LiteralPath $syncPolicyPath -Name $syncPolicyName -PropertyType DWord -Value ([int]$state.syncPolicyValue) -Force | Out-Null
} else {
    Remove-ItemProperty -LiteralPath $syncPolicyPath -Name $syncPolicyName -Force -ErrorAction SilentlyContinue
}
& "$env:SystemRoot\System32\gpupdate.exe" /Target:User /Force /Wait:120 | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Local Group Policy refresh failed during rollback.' }

$installedBackup = Join-Path $recordedBackupRoot 'installed'
if (Test-Path -LiteralPath $expectedInstallRoot) { Remove-Item -LiteralPath $expectedInstallRoot -Recurse -Force }
if (Test-Path -LiteralPath $installedBackup) { Copy-Item -LiteralPath $installedBackup -Destination $expectedInstallRoot -Recurse }

$configBackup = Join-Path $recordedBackupRoot 'config.json'
if (Test-Path -LiteralPath $configBackup) {
    Copy-Item -LiteralPath $configBackup -Destination $expectedConfigPath -Force
} else {
    Remove-Item -LiteralPath $expectedConfigPath -Force -ErrorAction SilentlyContinue
}
if (-not [bool]$state.previousStateRootPresent -and (Test-Path -LiteralPath $expectedStateRoot)) {
    Remove-Item -LiteralPath $expectedStateRoot -Recurse -Force
}

$mode = switch ($state.previousServiceMode) {
    'Auto' { 'Automatic' }
    'Manual' { 'Manual' }
    'Disabled' { 'Disabled' }
    default { throw "Unknown recorded ssh-agent start mode: $($state.previousServiceMode)" }
}
Set-Service -Name ssh-agent -StartupType $mode
if ($state.previousServiceState -eq 'Running') {
    Start-Service -Name ssh-agent
} elseif ($state.previousServiceState -ne 'Stopped') {
    throw "Unknown recorded ssh-agent state: $($state.previousServiceState)"
}

$restored = Get-CimInstance Win32_Service -Filter "Name='ssh-agent'"
if ($restored.StartMode -ne $state.previousServiceMode -or $restored.State -ne $state.previousServiceState) {
    throw 'Rollback did not restore the recorded ssh-agent mode and state.'
}
if ([bool](Get-ScheduledTask -TaskName $state.taskName -ErrorAction SilentlyContinue) -ne [bool]$state.previousTaskPresent) {
    throw 'Rollback did not restore the recorded scheduled-task presence.'
}
if ([bool](Test-Path -LiteralPath $expectedInstallRoot) -ne [bool]$state.previousInstallRootPresent) { throw 'Rollback did not restore install-root presence.' }
if ([bool](Test-Path -LiteralPath $expectedStateRoot) -ne [bool]$state.previousStateRootPresent) { throw 'Rollback did not restore state-root presence.' }
if ([bool](Test-Path -LiteralPath $expectedGpoIni) -ne [bool]$state.gpoIniPresent) { throw 'Rollback did not restore scripts.ini presence.' }
if ([bool](Test-Path -LiteralPath $expectedGpoLogoff) -ne [bool]$state.gpoLogoffPresent) { throw 'Rollback did not restore logoff-script presence.' }
if ([bool]$state.syncPolicyPresent) {
    if ((Get-ItemPropertyValue -LiteralPath $syncPolicyPath -Name $syncPolicyName) -ne [int]$state.syncPolicyValue) { throw 'Rollback did not restore synchronous-logon policy.' }
} elseif ($null -ne (Get-ItemProperty -LiteralPath $syncPolicyPath -Name $syncPolicyName -ErrorAction SilentlyContinue)) {
    throw 'Rollback left a synchronous-logon policy value that was not present before.'
}
if ($state.previousServiceState -eq 'Stopped') {
    if (Test-Path -LiteralPath $registryPath) { throw 'Rollback restored a stopped service with registry identity material.' }
    if (Test-Path -LiteralPath $expectedMarkerPath) { throw 'Rollback restored a stopped service with an unlock marker.' }
}

Write-Output "ROLLED_BACK_EXACT manifest=$statePath service=$($restored.State)/$($restored.StartMode)"
