[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^SHA256:[A-Za-z0-9+/]{43}$')][string]$ExpectedFingerprint,
    [Parameter(Mandatory = $true)][string]$PrivateKeyPath,
    [string]$PythonPath = 'C:\Python313\python.exe',
    [ValidateSet('none', 'after-files', 'after-service', 'after-logoff', 'after-task')][string]$TestFailureAfter = 'none'
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# BEGIN native-call helper (identical in install.ps1 and rollback.ps1; test_ps_native.py checks both)
# Windows PowerShell 5.1 drops an empty-string argument to a native program and, under
# ErrorActionPreference Stop, turns any redirected native stderr line into a terminating
# error. Both broke this script on the stock laptop shell. Every external program therefore
# goes through this helper: it builds the command line itself (CRT quoting, so '' arrives
# as an empty argument), starts the program in the current directory with stdin closed so
# no tool can wait on a prompt, reads stdout and stderr concurrently, stops a program that
# outlives TimeoutSeconds, and reports the exit code. Output still held open by a
# descendant after exit is reported as OutputComplete=$false with empty text, so a caller
# that needs the text fails closed. It behaves the same on PowerShell 5.1 and 7.
function ConvertTo-NativeArgument([string]$Value) {
    if ($Value -eq '') { return '""' }
    if ($Value -notmatch '[\s"]') { return $Value }
    $escaped = [regex]::Replace($Value, '(\\*)"', '$1$1\"')
    $escaped = [regex]::Replace($escaped, '(\\+)\z', '$1$1')
    return '"' + $escaped + '"'
}

function Invoke-NativeTool([string]$FilePath, [string[]]$Arguments, [int]$TimeoutSeconds = 300) {
    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $FilePath
    $startInfo.Arguments = (@($Arguments | ForEach-Object { ConvertTo-NativeArgument $_ }) -join ' ')
    $startInfo.WorkingDirectory = (Get-Location -PSProvider FileSystem).ProviderPath
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardInput = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $process = [Diagnostics.Process]::Start($startInfo)
    try {
        $process.StandardInput.Close()
        $stdoutTask = $process.StandardOutput.ReadToEndAsync()
        $stderrTask = $process.StandardError.ReadToEndAsync()
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            try { $process.Kill() } catch { }
            throw "$FilePath did not exit within $TimeoutSeconds seconds and was stopped."
        }
        $complete = [Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdoutTask, $stderrTask), 30000)
        $stdout = if ($complete) { $stdoutTask.Result } else { '' }
        $stderr = if ($complete) { $stderrTask.Result } else { '' }
        return [pscustomobject]@{ ExitCode = $process.ExitCode; StdOut = $stdout; StdErr = $stderr; OutputComplete = $complete }
    } finally {
        $process.Dispose()
    }
}
# END native-call helper

# BEGIN key-encryption check (test_ps_native.py runs this function for real)
# The key must PROVE it is passphrase-protected: an empty passphrase has to be refused with
# ssh-keygen's own "incorrect passphrase" answer. Any other non-zero exit (a lost argument,
# "UNPROTECTED PRIVATE KEY FILE" for a loose-permission plain key, an unreadable file) is
# not proof of encryption and refuses installation.
function Assert-KeyIsPassphraseProtected([string]$Keygen, [string]$KeyPath) {
    $result = Invoke-NativeTool $Keygen @('-y', '-P', '', '-f', $KeyPath) 60
    if ($result.ExitCode -eq 0) { throw 'The configured private key has no passphrase; installation refused.' }
    if (-not $result.OutputComplete -or $result.StdErr -notmatch 'incorrect passphrase') {
        throw "The private key's passphrase protection could not be confirmed (ssh-keygen exit $($result.ExitCode): $($result.StdErr.Trim())); installation refused."
    }
}
# END key-encryption check


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
$registryPath = 'Registry::HKEY_CURRENT_USER\Software\OpenSSH\Agent\Keys'
$gpoScriptsRoot = Join-Path $env:SystemRoot 'System32\GroupPolicy\User\Scripts'
$gpoIniPath = Join-Path $gpoScriptsRoot 'scripts.ini'
$gpoLogoffRoot = Join-Path $gpoScriptsRoot 'Logoff'
$gpoLogoffPath = Join-Path $gpoLogoffRoot 'DawnTraderSshKeyholderLock.cmd'
$syncPolicyPath = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Policies\System'
$syncPolicyName = 'RunLogonScriptSync'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$backupBase = Join-Path $env:ProgramData 'DawnTrader\ssh-keyholder-backups'
$backupRoot = Join-Path $backupBase $stamp
$installStatePath = Join-Path $backupRoot 'install-state.json'
$sshKeygen = 'C:\Windows\System32\OpenSSH\ssh-keygen.exe'
$sshAdd = 'C:\Windows\System32\OpenSSH\ssh-add.exe'
$rollbackScript = Join-Path $sourceRoot 'rollback.ps1'

function Set-OwnerOnlyAcl([string]$Path, [bool]$Directory) {
    $grant = if ($Directory) { "*$sid`:(OI)(CI)F" } else { "*$sid`:F" }
    $systemGrant = if ($Directory) { '*S-1-5-18:(OI)(CI)F' } else { '*S-1-5-18:F' }
    $aclResult = Invoke-NativeTool "$env:SystemRoot\System32\icacls.exe" @($Path, '/inheritance:r', '/grant:r', $grant, $systemGrant)
    if ($aclResult.ExitCode -ne 0) { throw "Could not secure $Path : $($aclResult.StdErr.Trim())" }
}

function Assert-LockedState {
    $service = Get-CimInstance Win32_Service -Filter "Name='ssh-agent'"
    if (-not $service -or $service.State -ne 'Stopped' -or [int]$service.ProcessId -ne 0) {
        throw 'ssh-agent is not positively stopped.'
    }
    if (Test-Path -LiteralPath $registryPath) { throw 'Windows ssh-agent registry material remains.' }
    if (Test-Path -LiteralPath $markerPath) { throw 'The key-holder unlock marker remains.' }
    if ((Invoke-NativeTool $sshAdd @('-l')).ExitCode -eq 0) { throw 'ssh-add still reports a usable in-memory identity while locked.' }
}

function Invoke-TestFailure([string]$Point) {
    if ($TestFailureAfter -ne $Point) { return }
    if ($env:DT_KEYHOLDER_ENABLE_FAULT_TESTS -ne 'I_UNDERSTAND' -or [IO.Path]::GetFileName($privateKey) -notlike '*disposable*') {
        throw 'Fault injection is restricted to an explicitly enabled disposable-key proof.'
    }
    throw "Injected installer failure at $Point"
}

function Add-LocalGpoScript([string]$Section, [string]$CommandPath) {
    New-Item -ItemType Directory -Path $gpoLogoffRoot -Force | Out-Null
    $command = "@echo off`r`n`"$PythonPath`" `"$(Join-Path $installRoot 'dt-ssh-keyholder.py')`" lock`r`nexit /b %ERRORLEVEL%`r`n"
    [IO.File]::WriteAllText($gpoLogoffPath, $command, [Text.ASCIIEncoding]::new())

    $lines = if (Test-Path -LiteralPath $gpoIniPath) {
        [Collections.Generic.List[string]](Get-Content -LiteralPath $gpoIniPath)
    } else {
        [Collections.Generic.List[string]]::new()
    }
    $sectionStart = -1
    $sectionEnd = $lines.Count
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($lines[$i] -eq "[$Section]") { $sectionStart = $i; continue }
        if ($sectionStart -ge 0 -and $i -gt $sectionStart -and $lines[$i] -match '^\[.+\]$') {
            $sectionEnd = $i
            break
        }
    }
    if ($sectionStart -lt 0) {
        if ($lines.Count -gt 0 -and $lines[$lines.Count - 1] -ne '') { $lines.Add('') }
        $lines.Add("[$Section]")
        $sectionStart = $lines.Count - 1
        $sectionEnd = $lines.Count
    }
    $indexes = @()
    for ($i = $sectionStart + 1; $i -lt $sectionEnd; $i++) {
        if ($lines[$i] -match '^(\d+)CmdLine=') { $indexes += [int]$Matches[1] }
        if ($lines[$i] -like '*DawnTraderSshKeyholderLock.cmd*') {
            throw 'The DawnTrader logoff command is already registered in local Group Policy.'
        }
    }
    $nextIndex = if ($indexes.Count -eq 0) { 0 } else { ($indexes | Measure-Object -Maximum).Maximum + 1 }
    $lines.Insert($sectionEnd, "${nextIndex}Parameters=")
    $lines.Insert($sectionEnd, "${nextIndex}CmdLine=$CommandPath")
    New-Item -ItemType Directory -Path $gpoScriptsRoot -Force | Out-Null
    [IO.File]::WriteAllLines($gpoIniPath, $lines, [Text.UnicodeEncoding]::new($false, $true))
}

$privateKey = [IO.Path]::GetFullPath($PrivateKeyPath)
$python = [IO.Path]::GetFullPath($PythonPath)
if (-not (Test-Path -LiteralPath $privateKey -PathType Leaf)) { throw "Private key not found: $privateKey" }
if (-not (Test-Path -LiteralPath $python -PathType Leaf)) { throw "Python not found: $python" }
foreach ($path in @($sshKeygen, $sshAdd, $rollbackScript)) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Required installer dependency not found: $path" }
}
$fingerprintResult = Invoke-NativeTool $sshKeygen @('-l', '-E', 'sha256', '-f', $privateKey)
if ($fingerprintResult.ExitCode -ne 0) { throw "Private key fingerprint could not be read: $privateKey" }
$observedFingerprint = [regex]::Match($fingerprintResult.StdOut, 'SHA256:[A-Za-z0-9+/]{43}').Value
if ($observedFingerprint -ne $ExpectedFingerprint) { throw "Private key fingerprint does not match ExpectedFingerprint: $observedFingerprint" }
Assert-KeyIsPassphraseProtected $sshKeygen $privateKey

$requiredSources = @('dt-ssh-keyholder.py', 'ssh_keyholder.py')
foreach ($name in $requiredSources) {
    if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot $name) -PathType Leaf)) { throw "Installer source is incomplete: $name" }
}

$service = Get-CimInstance Win32_Service -Filter "Name='ssh-agent'"
if (-not $service) { throw 'Windows ssh-agent service is absent.' }
if ($service.State -ne 'Stopped' -or [int]$service.ProcessId -ne 0) { throw 'Installation requires the pre-state ssh-agent to be stopped.' }
if (Test-Path -LiteralPath $registryPath) { throw 'Installation requires an empty Windows ssh-agent registry store.' }
if (Test-Path -LiteralPath $markerPath) { throw 'Installation requires no pre-existing unlock marker.' }
$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath $installRoot) { throw 'Installation requires the bounded install root to be absent; roll back the earlier generation first.' }
if (Test-Path -LiteralPath $stateRoot) { throw 'Installation requires the bounded runtime state root to be absent; roll back the earlier generation first.' }
if ($existingTask) { throw 'Installation requires the bounded scheduled task to be absent.' }
if (Test-Path -LiteralPath $gpoLogoffPath) { throw 'Installation requires the bounded Group Policy script to be absent.' }

if (-not $PSCmdlet.ShouldProcess($installRoot, 'Install the reviewed SSH key-holder, synchronous logoff script and cold-lock task')) { return }

New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
Set-OwnerOnlyAcl $backupBase $true
Set-OwnerOnlyAcl $backupRoot $true

if (Test-Path -LiteralPath $gpoIniPath) { Copy-Item -LiteralPath $gpoIniPath -Destination (Join-Path $backupRoot 'scripts.ini') }

$gpoScriptsRootPresent = Test-Path -LiteralPath $gpoScriptsRoot
$gpoLogoffRootPresent = Test-Path -LiteralPath $gpoLogoffRoot
$syncPolicyKeyPresent = Test-Path -LiteralPath $syncPolicyPath
$gpoIniSha256 = if (Test-Path -LiteralPath $gpoIniPath -PathType Leaf) {
    (Get-FileHash -LiteralPath $gpoIniPath -Algorithm SHA256).Hash.ToLowerInvariant()
} else { $null }

$installState = [ordered]@{
    version = 3
    phase = 'captured'
    installedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    installRoot = $installRoot
    stateRoot = $stateRoot
    configPath = $configPath
    markerPath = $markerPath
    pythonPath = $python
    taskName = $taskName
    previousTaskPresent = $false
    previousInstallRootPresent = $false
    previousStateRootPresent = $false
    previousServiceMode = $service.StartMode
    previousServiceState = $service.State
    gpoIniPath = $gpoIniPath
    gpoIniPresent = (Test-Path -LiteralPath $gpoIniPath)
    gpoIniSha256 = $gpoIniSha256
    gpoScriptsRootPresent = $gpoScriptsRootPresent
    gpoLogoffRootPresent = $gpoLogoffRootPresent
    gpoLogoffPath = $gpoLogoffPath
    gpoLogoffPresent = (Test-Path -LiteralPath $gpoLogoffPath)
    syncPolicyKeyPresent = $syncPolicyKeyPresent
    syncPolicyPresent = $false
    syncPolicyValue = $null
    backupRoot = $backupRoot
}
$syncPolicy = Get-ItemProperty -LiteralPath $syncPolicyPath -Name $syncPolicyName -ErrorAction SilentlyContinue
if ($null -ne $syncPolicy) {
    $installState.syncPolicyPresent = $true
    $installState.syncPolicyValue = [int]$syncPolicy.$syncPolicyName
}
[IO.File]::WriteAllText($installStatePath, ($installState | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Set-OwnerOnlyAcl $installStatePath $false

try {
    New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
    Set-OwnerOnlyAcl $stateRoot $true
    New-Item -ItemType Directory -Path $installRoot -Force | Out-Null
    foreach ($name in $requiredSources) { Copy-Item -LiteralPath (Join-Path $sourceRoot $name) -Destination (Join-Path $installRoot $name) -Force }

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
    Set-OwnerOnlyAcl $installRoot $true
    Set-OwnerOnlyAcl $configPath $false
    Invoke-TestFailure 'after-files'

    Set-Service -Name ssh-agent -StartupType Manual
    Invoke-TestFailure 'after-service'
    Add-LocalGpoScript 'Logoff' $gpoLogoffPath
    Add-LocalGpoScript 'Logon' $gpoLogoffPath
    New-Item -Path $syncPolicyPath -Force | Out-Null
    New-ItemProperty -LiteralPath $syncPolicyPath -Name $syncPolicyName -PropertyType DWord -Value 1 -Force | Out-Null
    if ((Invoke-NativeTool "$env:SystemRoot\System32\gpupdate.exe" @('/Target:User', '/Force', '/Wait:120')).ExitCode -ne 0) { throw 'Local Group Policy refresh failed.' }
    Invoke-TestFailure 'after-logoff'

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
    Invoke-TestFailure 'after-task'

    $lockResult = Invoke-NativeTool $python @($installedCli, 'lock')
    if ($lockResult.StdOut) { Write-Host $lockResult.StdOut.TrimEnd() }
    if ($lockResult.ExitCode -ne 0) { throw "Installed key-holder lock failed: $($lockResult.StdOut.Trim()) $($lockResult.StdErr.Trim())" }
    Assert-LockedState
    $gpoRegistrations = @(Select-String -LiteralPath $gpoIniPath -SimpleMatch $gpoLogoffPath)
    if ($gpoRegistrations.Count -ne 2) { throw 'Synchronous local Group Policy logon and logoff commands are not both registered.' }
    if ((Get-ItemPropertyValue -LiteralPath $syncPolicyPath -Name $syncPolicyName) -ne 1) { throw 'Synchronous logon-script policy is not enabled.' }

    $installState.phase = 'installed_locked'
    [IO.File]::WriteAllText($installStatePath, ($installState | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
    Set-OwnerOnlyAcl $installStatePath $false
    Write-Output "INSTALLED_LOCKED fingerprint=$ExpectedFingerprint rollback=$installStatePath"
} catch {
    $installFailure = $_
    try {
        & $rollbackScript -InstallState $installStatePath -Confirm:$false
        throw "Installation failed and the captured pre-state was restored; manifest=$installStatePath; cause=$installFailure"
    } catch {
        if ($_.Exception.Message -like 'Installation failed and the captured pre-state was restored*') { throw }
        throw "Installation failed ($installFailure); automatic rollback also failed ($($_.Exception.Message)); use manifest $installStatePath"
    }
}
