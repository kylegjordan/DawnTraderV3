[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$expectedNames = @(
    '.claude\memory\MEMORY.md',
    '.claude\hooks\inject-due-alerts.mjs',
    'comms-infra\codex-channel-mirror.py',
    'comms-infra\codex-discord-outbox.py',
    'comms-infra\laptop\crew-status.py',
    'comms-infra\tools\verify-agent-artifacts.py',
    'comms-infra\laptop\dt-media-get',
    'comms-infra\laptop\dt-media-post',
    'direct:powershell',
    'direct:git-bash'
)
$captureRoot = Join-Path $env:LOCALAPPDATA 'DawnTrader\ssh-keyholder\captures'
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
$resolvedRoot = [IO.Path]::GetFullPath($captureRoot).TrimEnd('\') + '\'
if (-not $resolvedOutput.StartsWith($resolvedRoot, [StringComparison]::OrdinalIgnoreCase)) {
    throw "OutputDirectory must be below $captureRoot"
}
if (Test-Path -LiteralPath $resolvedOutput) {
    throw "capture output already exists: $resolvedOutput"
}

$bindingsPath = Join-Path $PSScriptRoot 'caller_capture_bindings.json'
$bindingBytes = [IO.File]::ReadAllBytes($bindingsPath)
$bindings = [Text.Encoding]::UTF8.GetString($bindingBytes) | ConvertFrom-Json
if ($bindings.schema -ne 'dt-caller-bindings-v1' -or $bindings.active -ne $true) {
    throw 'the repo-canonical caller bindings are not active; Ref B must review and activate them first'
}
$rows = @($bindings.entries)
$observedNames = @($rows | ForEach-Object { [string]$_.name })
if ($rows.Count -ne $expectedNames.Count -or
    @(Compare-Object -ReferenceObject $expectedNames -DifferenceObject $observedNames).Count -ne 0) {
    throw 'canonical bindings must name each of the ten logical entries exactly once'
}
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
foreach ($row in $rows) {
    foreach ($prefix in @('positive', 'negative')) {
        $command = [string]$row."${prefix}Command"
        $arguments = @($row."${prefix}Arguments")
        if (-not $command -or -not [IO.Path]::IsPathFullyQualified($command) -or $null -eq $row."${prefix}Arguments") {
            throw "$($row.name): canonical $prefix command binding is incomplete"
        }
        if ($arguments | Where-Object { $_ -isnot [string] }) {
            throw "$($row.name): canonical $prefix arguments must all be strings"
        }
    }
    if ($null -ne $row.sourcePath) {
        if ([string]$row.sourcePath -ne [string]$row.name -or [string]$row.sourceSha256 -notmatch '^[0-9a-f]{64}$') {
            throw "$($row.name): canonical source binding is incomplete"
        }
        $sourcePath = [IO.Path]::GetFullPath((Join-Path $repoRoot ([string]$row.sourcePath)))
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            throw "$($row.name): bound source does not exist"
        }
        $sourceBytes = [IO.File]::ReadAllBytes($sourcePath)
        $sourceText = [Text.Encoding]::UTF8.GetString($sourceBytes).Replace("`r`n", "`n")
        $sha256 = [Security.Cryptography.SHA256]::Create()
        try {
            $sourceDigest = -join ($sha256.ComputeHash([Text.Encoding]::UTF8.GetBytes($sourceText)) | ForEach-Object { $_.ToString('x2') })
        } finally {
            $sha256.Dispose()
        }
        if ($sourceDigest -ne $row.sourceSha256) {
            throw "$($row.name): bound source hash differs"
        }
    }
}
New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
& icacls.exe $resolvedOutput /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F" /grant:r '*S-1-5-18:(OI)(CI)F' | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "failed to restrict capture directory ACL: icacls exit $LASTEXITCODE"
}
[IO.File]::WriteAllBytes((Join-Path $resolvedOutput 'caller-bindings.json'), $bindingBytes)

$captureId = [guid]::NewGuid().ToString()
$events = [Collections.Generic.List[object]]::new()
$manifestRows = [Collections.Generic.List[object]]::new()

function Invoke-CapturedEntry {
    param([object]$Row, [ValidateSet('positive', 'negative')][string]$Phase)
    $commandProperty = "${Phase}Command"
    $argumentsProperty = "${Phase}Arguments"
    $command = [IO.Path]::GetFullPath([string]$Row.$commandProperty)
    if (-not [IO.Path]::IsPathFullyQualified($command) -or -not (Test-Path -LiteralPath $command -PathType Leaf)) {
        throw "$($Row.name): $Phase command is not an existing absolute file"
    }
    $arguments = @($Row.$argumentsProperty | ForEach-Object { [string]$_ })
    $source = "dt-keyholder-$captureId-$($Row.name)-$Phase" -replace '[^A-Za-z0-9_.-]', '_'
    $rawPath = Join-Path $resolvedOutput "$source.jsonl"
    $messageData = @{ captureId = $captureId; entryName = [string]$Row.name; phase = $Phase; rawPath = $rawPath }
    Register-CimIndicationEvent -ClassName Win32_ProcessStartTrace -SourceIdentifier $source -MessageData $messageData -Action {
        $record = $Event.SourceEventArgs.NewEvent
        $name = [string]$record.ProcessName
        $pidValue = [int]$record.ProcessID
        $image = $null
        if ($name -in @('ssh.exe', 'scp.exe', 'sftp.exe')) {
            try { $image = (Get-CimInstance Win32_Process -Filter "ProcessId=$pidValue" -ErrorAction Stop).ExecutablePath } catch { }
        }
        $observed = [ordered]@{
            captureId = [string]$Event.MessageData.captureId
            eventId = [guid]::NewGuid().ToString()
            entryName = [string]$Event.MessageData.entryName
            phase = [string]$Event.MessageData.phase
            timestampUtc = [DateTime]::FromFileTimeUtc([int64]$record.TIME_CREATED).ToString('o')
            processId = $pidValue
            parentProcessId = [int]$record.ParentProcessID
            image = $image
            processName = $name
        }
        [IO.File]::AppendAllText([string]$Event.MessageData.rawPath, ($observed | ConvertTo-Json -Compress) + [Environment]::NewLine)
    } | Out-Null
    $started = [DateTimeOffset]::UtcNow
    try {
        $startInfo = [Diagnostics.ProcessStartInfo]::new()
        $startInfo.FileName = $command
        $startInfo.UseShellExecute = $false
        foreach ($argument in $arguments) { $startInfo.ArgumentList.Add($argument) }
        $process = [Diagnostics.Process]::Start($startInfo)
        $process.WaitForExit()
        $exitCode = $process.ExitCode
        Start-Sleep -Milliseconds 500
    } finally {
        Unregister-Event -SourceIdentifier $source -ErrorAction SilentlyContinue
        Get-Event -SourceIdentifier $source -ErrorAction SilentlyContinue | Remove-Event -ErrorAction SilentlyContinue
    }
    if (Test-Path -LiteralPath $rawPath) {
        foreach ($line in Get-Content -LiteralPath $rawPath) {
            if ($line) { $events.Add(($line | ConvertFrom-Json)) }
        }
        Remove-Item -LiteralPath $rawPath -Force
    }
    $ended = [DateTimeOffset]::UtcNow
    return [ordered]@{ started = $started; ended = $ended; exitCode = $exitCode; processId = [int]$process.Id }
}

try {
    foreach ($row in $rows) {
        $positive = Invoke-CapturedEntry -Row $row -Phase positive
        if ($positive.exitCode -ne 0) { throw "$($row.name): positive entry failed with $($positive.exitCode)" }
        $negative = Invoke-CapturedEntry -Row $row -Phase negative
        if ($negative.exitCode -eq 0) { throw "$($row.name): locked negative entry unexpectedly succeeded" }
        $positiveIds = @($events | Where-Object { $_.entryName -eq $row.name -and $_.phase -eq 'positive' -and $_.processName -in @('ssh.exe', 'scp.exe', 'sftp.exe') } | ForEach-Object { $_.eventId })
        $manifestRows.Add([ordered]@{
            name = [string]$row.name
            result = 'success'
            startedAtUtc = $positive.started.ToString('o')
            endedAtUtc = $positive.ended.ToString('o')
            negativeStartedAtUtc = $negative.started.ToString('o')
            negativeEndedAtUtc = $negative.ended.ToString('o')
            entryProcessId = [int]$positive.processId
            processEventIds = $positiveIds
        })
    }

    $processPath = Join-Path $resolvedOutput 'process-events.jsonl'
    foreach ($eventRow in $events) {
        Add-Content -LiteralPath $processPath -Value ($eventRow | ConvertTo-Json -Compress) -Encoding utf8
    }
    $manifest = [ordered]@{
        schema = 'dt-caller-process-capture-v1'
        captureId = $captureId
        bindingsFile = 'caller-bindings.json'
        bindingsSha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $resolvedOutput 'caller-bindings.json')).Hash.ToLowerInvariant()
        rows = $manifestRows
    }
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $resolvedOutput 'capture-manifest.json') -Encoding utf8
    Write-Output "CALLER_PROCESS_CAPTURED capture=$captureId output=$resolvedOutput"
} catch {
    Write-Error "CALLER_PROCESS_CAPTURE_FAILED capture=$captureId output=$resolvedOutput error=$($_.Exception.Message)"
    throw
}
