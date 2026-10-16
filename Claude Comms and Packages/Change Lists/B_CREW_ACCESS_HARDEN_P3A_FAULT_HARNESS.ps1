# P3a section A - transactional installer rollback mutations (evidence harness; runs the reviewed installer unchanged).
# A case PASSES only when the installer reached the named injected point, reported its own
# automatic restore, created exactly one new backup manifest, and left every measured object
# equal to the captured pre-state. Attempt 1 (2026-10-16) printed EQUAL-TO-PRE True while the
# installer had refused before any change; that shape can no longer read as a pass.
# Run ONLY from an elevated PowerShell window. Writes no secret: it never prompts for or handles a passphrase.
$ErrorActionPreference = 'Stop'
$repoInstaller = 'C:\DawnTraderV3-infra\comms-infra\laptop\ssh-keyholder\install.ps1'
$key = Join-Path $env:USERPROFILE '.ssh\dt_disposable_expected_20261016'
$fp = 'SHA256:uwDouLcdC1w6KmU9ynKb+w6xN44U94ejCeIqUVCTPyU'
$out = Join-Path $env:TEMP ('A-faults-' + (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ') + '.log')

function Snap {
    $s = Get-CimInstance Win32_Service -Filter "Name='ssh-agent'"
    $gpo = Join-Path $env:SystemRoot 'System32\GroupPolicy\User\Scripts'
    $pol = 'Registry::HKEY_CURRENT_USER\Software\Microsoft\Windows\CurrentVersion\Policies\System'
    $v = Get-ItemProperty -LiteralPath $pol -Name RunLogonScriptSync -ErrorAction SilentlyContinue
    [ordered]@{
        service = "$($s.State)/$($s.StartMode)/pid=$($s.ProcessId)"
        agentRegistry = Test-Path -LiteralPath 'Registry::HKEY_CURRENT_USER\Software\OpenSSH\Agent\Keys'
        installRoot = Test-Path -LiteralPath (Join-Path $env:USERPROFILE '.claude\ssh-keyholder')
        stateRoot = Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'DawnTrader\ssh-keyholder')
        marker = Test-Path -LiteralPath (Join-Path $env:LOCALAPPDATA 'DawnTrader\ssh-keyholder\unlock.json')
        task = [bool](Get-ScheduledTask -TaskName 'DawnTrader SSH Keyholder Lock' -ErrorAction SilentlyContinue)
        gpoScriptsRoot = Test-Path -LiteralPath $gpo
        gpoLogoffRoot = Test-Path -LiteralPath (Join-Path $gpo 'Logoff')
        gpoIni = Test-Path -LiteralPath (Join-Path $gpo 'scripts.ini')
        syncPolicyKey = Test-Path -LiteralPath $pol
        syncPolicyValue = if ($null -ne $v) { [string]$v.RunLogonScriptSync } else { 'absent' }
    } | ConvertTo-Json -Compress
}

$p = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Not elevated - open PowerShell as administrator.' }

$backupBase = Join-Path $env:ProgramData 'DawnTrader\ssh-keyholder-backups'
$env:DT_KEYHOLDER_ENABLE_FAULT_TESTS = 'I_UNDERSTAND'   # process-scoped only; removed below
$pre = Snap
"PRE $pre" | Tee-Object -FilePath $out -Append
foreach ($point in @('after-files', 'after-service', 'after-logoff', 'after-task')) {
    Start-Sleep -Seconds 2   # the installer's backup folder is stamped to the second
    $msg = ''
    $before = @(Get-ChildItem $backupBase -Directory -Name -ErrorAction SilentlyContinue)
    try {
        & $repoInstaller -ExpectedFingerprint $fp -PrivateKeyPath $key -TestFailureAfter $point
        $msg = 'NO FAILURE RAISED (unexpected)'
    } catch { $msg = $_.Exception.Message }
    $post = Snap
    $new = @(Get-ChildItem $backupBase -Directory -Name -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_ })
    $manifestOk = ($new.Count -eq 1) -and (Test-Path -LiteralPath (Join-Path (Join-Path $backupBase $new[0]) 'install-state.json'))
    $reached = ($msg -like '*pre-state was restored*') -and ($msg -like "*Injected installer failure at $point*")
    $verdict = if ($reached -and $manifestOk -and ($post -eq $pre)) { 'PASS' } else { 'FAIL' }
    "CASE $point :: $msg" | Tee-Object -FilePath $out -Append
    "POST $point $post" | Tee-Object -FilePath $out -Append
    "RESULT $point $verdict reachedInjectedPoint=$reached newManifest=$manifestOk equalToPre=$($post -eq $pre)" | Tee-Object -FilePath $out -Append
    if ($verdict -ne 'PASS') { "STOP: case $point did not pass; later cases not run" | Tee-Object -FilePath $out -Append; break }
}
Remove-Item Env:\DT_KEYHOLDER_ENABLE_FAULT_TESTS
"BACKUPS $((Get-ChildItem $backupBase -Name -ErrorAction SilentlyContinue) -join ',')" | Tee-Object -FilePath $out -Append
"DONE log=$out" | Tee-Object -FilePath $out -Append
