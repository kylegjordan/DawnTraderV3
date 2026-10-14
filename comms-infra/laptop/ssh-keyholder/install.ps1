[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^SHA256:[A-Za-z0-9+/]{43}$')][string]$ExpectedFingerprint,
    [Parameter(Mandatory = $true)][string]$PrivateKeyPath,
    [string]$PythonPath = 'C:\Python313\python.exe'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run the installer from an elevated PowerShell window.'
}

$sourceRoot = $PSScriptRoot
$installRoot = Join-Path $env:USERPROFILE '.claude\ssh-keyholder'
$stateRoot = Join-Path $env:LOCALAPPDATA 'DawnTrader\ssh-keyholder'
$configPath = Join-Path $stateRoot 'config.json'
$markerPath = Join-Path $stateRoot 'unlock.json'
$taskName = 'DawnTrader SSH Keyholder Lock'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$backupRoot = Join-Path $stateRoot "backups\$stamp"

$privateKey = [IO.Path]::GetFullPath($PrivateKeyPath)
$python = [IO.Path]::GetFullPath($PythonPath)
if (-not (Test-Path -LiteralPath $privateKey -PathType Leaf)) { throw "Private key not found: $privateKey" }
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "Python not found: $python" }
$sshKeygen = 'C:\Windows\System32\OpenSSH\ssh-keygen.exe'
if (-not (Test-Path -LiteralPath $sshKeygen -PathType Leaf)) { throw "Windows ssh-keygen not found: $sshKeygen" }
$fingerprintOutput = & $sshKeygen -l -E sha256 -f $privateKey 2>&1
if ($LASTEXITCODE -ne 0) { throw "Private key fingerprint could not be read: $privateKey" }
$observedFingerprint = [regex]::Match(($fingerprintOutput -join "`n"), 'SHA256:[A-Za-z0-9+/]{43}').Value
if ($observedFingerprint -ne $ExpectedFingerprint) {
    throw "Private key fingerprint does not match ExpectedFingerprint: $observedFingerprint"
}
& $sshKeygen -y -P '' -f $privateKey *> $null
if ($LASTEXITCODE -eq 0) { throw 'The configured private key has no passphrase; installation refused.' }

$requiredSources = @('dt-ssh-keyholder.py', 'ssh_keyholder.py')
foreach ($name in $requiredSources) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $name) -PathType Leaf)) {
        throw "Installer source is incomplete: $name"
    }
}

if (-not $PSCmdlet.ShouldProcess($installRoot, 'Install the reviewed SSH key-holder and cold-lock task')) { return }

New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
& "$env:SystemRoot\System32\icacls.exe" $stateRoot '/inheritance:r' '/grant:r' "*$sid`:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not secure $stateRoot" }
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$previousServiceMode = (Get-CimInstance Win32_Service -Filter "Name='ssh-agent'").StartMode
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Export-ScheduledTask -TaskName $taskName | Set-Content -LiteralPath (Join-Path $backupRoot 'task.xml') -Encoding UTF8
}
if (Test-Path -LiteralPath $installRoot) {
    Copy-Item -LiteralPath $installRoot -Destination (Join-Path $backupRoot 'installed') -Recurse
}
if (Test-Path -LiteralPath $configPath) {
    Copy-Item -LiteralPath $configPath -Destination (Join-Path $backupRoot 'config.json')
}

New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
foreach ($name in $requiredSources) {
    Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $installRoot $name) -Force
}

$config = [ordered]@{
    expectedFingerprint = $ExpectedFingerprint
    privateKeyPath = $privateKey
    markerPath = $markerPath
    registryPath = 'Software\OpenSSH\Agent\Keys'
    clients = [ordered]@{
        ssh = 'C:\Windows\System32\OpenSSH\ssh.exe'
        scp = 'C:\Windows\System32\OpenSSH\scp.exe'
        sftp = 'C:\Windows\System32\OpenSSH\sftp.exe'
    }
}
[IO.File]::WriteAllText($configPath, ($config | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))

foreach ($path in @($installRoot, $stateRoot)) {
    & "$env:SystemRoot\System32\icacls.exe" $path '/inheritance:r' '/grant:r' "*$sid`:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Could not secure $path" }
}
& "$env:SystemRoot\System32\icacls.exe" $configPath '/inheritance:r' '/grant:r' "*$sid`:F" '*S-1-5-18:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not secure $configPath" }

Set-Service -Name ssh-agent -StartupType Manual
$installedCli = Join-Path $installRoot 'dt-ssh-keyholder.py'
$commandXml = [Security.SecurityElement]::Escape($python)
$argumentXml = [Security.SecurityElement]::Escape("`"$installedCli`" lock")
$userXml = [Security.SecurityElement]::Escape($sid)
$taskXml = @"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo><Description>Fail closed at logon, lock, and disconnect by purging the DawnTrader SSH agent.</Description></RegistrationInfo>
  <Triggers>
    <LogonTrigger><Enabled>true</Enabled><UserId>$userXml</UserId></LogonTrigger>
    <SessionStateChangeTrigger><Enabled>true</Enabled><StateChange>SessionLock</StateChange><UserId>$userXml</UserId></SessionStateChangeTrigger>
    <SessionStateChangeTrigger><Enabled>true</Enabled><StateChange>ConsoleDisconnect</StateChange><UserId>$userXml</UserId></SessionStateChangeTrigger>
    <SessionStateChangeTrigger><Enabled>true</Enabled><StateChange>RemoteDisconnect</StateChange><UserId>$userXml</UserId></SessionStateChangeTrigger>
  </Triggers>
  <Principals><Principal id="Author"><UserId>$userXml</UserId><LogonType>InteractiveToken</LogonType><RunLevel>HighestAvailable</RunLevel></Principal></Principals>
  <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><StartWhenAvailable>true</StartWhenAvailable><ExecutionTimeLimit>PT5M</ExecutionTimeLimit><Enabled>true</Enabled></Settings>
  <Actions Context="Author"><Exec><Command>$commandXml</Command><Arguments>$argumentXml</Arguments></Exec></Actions>
</Task>
"@
Register-ScheduledTask -TaskName $taskName -Xml $taskXml -Force | Out-Null

$installState = [ordered]@{
    version = 1
    installedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    installRoot = $installRoot
    stateRoot = $stateRoot
    configPath = $configPath
    pythonPath = $python
    taskName = $taskName
    previousTaskPresent = [bool]$existingTask
    previousServiceMode = $previousServiceMode
    backupRoot = $backupRoot
}
$installStatePath = Join-Path $backupRoot 'install-state.json'
$installState | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $installStatePath -Encoding UTF8
& "$env:SystemRoot\System32\icacls.exe" $installStatePath '/inheritance:r' '/grant:r' "*$sid`:F" '*S-1-5-18:F' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not secure $installStatePath" }

Write-Output "INSTALLED_LOCKED fingerprint=$ExpectedFingerprint rollback=$installStatePath"
