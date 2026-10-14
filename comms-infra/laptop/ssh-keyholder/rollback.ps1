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
$recordedBackupRoot = [IO.Path]::GetFullPath($state.backupRoot)
if ([IO.Path]::GetFullPath($state.installRoot) -ne $expectedInstallRoot) {
    throw 'Refusing rollback: recorded install root is outside the exact DawnTrader key-holder path.'
}
if ([IO.Path]::GetFullPath($state.configPath) -ne $expectedConfigPath) {
    throw 'Refusing rollback: recorded config path is outside the exact DawnTrader key-holder path.'
}
if (($recordedBackupRoot + [IO.Path]::DirectorySeparatorChar) -notlike ($expectedStateRoot + [IO.Path]::DirectorySeparatorChar + 'backups' + [IO.Path]::DirectorySeparatorChar + '*')) {
    throw 'Refusing rollback: recorded backup root is outside the bounded key-holder backup path.'
}
if ([IO.Path]::GetDirectoryName($statePath) -ne $recordedBackupRoot) {
    throw 'Refusing rollback: install-state file does not belong to its recorded backup root.'
}
if ($state.taskName -ne 'DawnTrader SSH Keyholder Lock') {
    throw 'Refusing rollback: recorded task name is not the bounded key-holder task.'
}
if (-not $PSCmdlet.ShouldProcess($expectedInstallRoot, 'Roll back the recorded SSH key-holder installation')) { return }

$python = [IO.Path]::GetFullPath($state.pythonPath)
$cli = Join-Path $expectedInstallRoot 'dt-ssh-keyholder.py'
if ((Test-Path -LiteralPath $python -PathType Leaf) -and (Test-Path -LiteralPath $cli -PathType Leaf)) {
    & $python $cli lock
    if ($LASTEXITCODE -ne 0) { throw 'Key-holder lock failed; rollback stopped before removing controls.' }
}

Unregister-ScheduledTask -TaskName $state.taskName -Confirm:$false -ErrorAction SilentlyContinue
$taskBackup = Join-Path $state.backupRoot 'task.xml'
if ($state.previousTaskPresent) {
    if (-not (Test-Path -LiteralPath $taskBackup -PathType Leaf)) { throw 'Recorded prior task XML is missing.' }
    Register-ScheduledTask -TaskName $state.taskName -Xml (Get-Content -LiteralPath $taskBackup -Raw) -Force | Out-Null
}

$mode = switch ($state.previousServiceMode) {
    'Auto' { 'Automatic' }
    'Manual' { 'Manual' }
    'Disabled' { 'Disabled' }
    default { throw "Unknown recorded ssh-agent start mode: $($state.previousServiceMode)" }
}
Set-Service -Name ssh-agent -StartupType $mode

$installedBackup = Join-Path $state.backupRoot 'installed'
if (Test-Path -LiteralPath $expectedInstallRoot) {
    Remove-Item -LiteralPath $expectedInstallRoot -Recurse -Force
}
if (Test-Path -LiteralPath $installedBackup) {
    Copy-Item -LiteralPath $installedBackup -Destination $expectedInstallRoot -Recurse
}

$configBackup = Join-Path $state.backupRoot 'config.json'
if (Test-Path -LiteralPath $configBackup) {
    Copy-Item -LiteralPath $configBackup -Destination $state.configPath -Force
} elseif (Test-Path -LiteralPath $state.configPath) {
    Remove-Item -LiteralPath $state.configPath -Force
}
Write-Output 'ROLLED_BACK_LOCKED'
