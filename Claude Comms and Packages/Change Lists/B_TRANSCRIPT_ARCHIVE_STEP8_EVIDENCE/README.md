# B-TRANSCRIPT-ARCHIVE Step-8 primary evidence packet

Captured read-only on Kyle's Windows owner machine and staging at `2026-11-10T09:39:17Z`, after Coltrane's `2026-11-10T09:34:38Z` reply halted Step 8 because the laptop population was unreachable from Helsinki. The review target before this packet was exact ref `2fadd2019042af82ded41505bf991e75d3ab0086`; this packet adds no runtime change. It makes the primary command outputs and their read-only derivations reachable in Coltrane's repo mirror.

The two Python files beside this record are the exact read-only derivations for the bidirectional population and complete-marker census. Both configure traversal failures to raise rather than disappear. Re-run them on the Windows owner machine with Python 3; they import the installed runtime, not the working-tree copy.

## 1. Registered archive task — verbatim query

Command:

```powershell
schtasks /Query /TN "\DawnTrader-Transcript-Archive" /V /FO LIST
```

Output:

```text
Folder: \
HostName:                             KYLEGJORDAN
TaskName:                             \DawnTrader-Transcript-Archive
Next Run Time:                        11/11/2026 2:30:00 AM
Status:                               Ready
Logon Mode:                           Interactive only
Last Run Time:                        11/10/2026 2:30:01 AM
Last Result:                          0
Author:                               N/A
Task To Run:                          C:\Python313\python.exe -I "C:\Users\kyleg\.claude\transcript-archive-bin\dt_archive_trigger.py" nightly
Start In:                             C:\Users\kyleg\.claude\transcript-archive-bin
Comment:                              B-TRANSCRIPT-ARCHIVE P7: nightly transcript archive (Infra Claude). A failure or a missed night raises a staging system alert, key transcript-archive-nightly.
Scheduled Task State:                 Enabled
Idle Time:                            Disabled
Power Management:
Delete Task If Not Rescheduled:       Disabled
Stop Task If Runs X Hours and X Mins: 01:00:00
Schedule:                             Scheduling data is not available in this format.
Schedule Type:                        Daily
Start Time:                           2:30:00 AM
Start Date:                           11/7/2026
End Date:                             N/A
Days:                                 Every 1 day(s)
Months:                               N/A
Repeat: Every:                        Disabled
Repeat: Until: Time:                  Disabled
Repeat: Until: Duration:              Disabled
Repeat: Stop If Still Running:        Disabled
```

The event-channel query is included to delimit provenance rather than overclaim it:

```text
> wevtutil gl Microsoft-Windows-TaskScheduler/Operational
name: Microsoft-Windows-TaskScheduler/Operational
enabled: false
type: Operational
retention: false
autoBackup: false
maxSize: 10485760
```

Therefore the record is the registered schedule/action, Last Run metadata, and corresponding run record below; it is not claimed as an immutable Windows event chain.

## 2. Corresponding run and installed object — verbatim reads

Commands:

```powershell
Select-String -Path C:\Users\kyleg\.claude\transcript-archive\RUNS.log -Pattern '^2026-11-10T01:31:02Z'
Get-Content C:\Users\kyleg\.claude\transcript-archive\RUNS.log -Tail 5
Get-Content C:\Users\kyleg\.claude\transcript-archive-bin\INSTALLED_FROM.txt
git hash-object <installed-file>
git rev-parse fa03c15cc568d821d32e2b0c3c7711e9c7377712:<repo-path>
```

Output:

```text
C:\Users\kyleg\.claude\transcript-archive\RUNS.log:40:2026-11-10T01:31:02Z nightly 0 ARCHIVE RUN OK — 1106 raw files, 171 lines, layer (c) 28 values; HEARTBEAT: 4 of 2036 runs hold a human turn; shared index 13770 bytes

2026-11-08T13:16:06Z precompact 0 ARCHIVE RUN OK — 1105 raw files, 655 lines, layer (c) 28 values; HEARTBEAT: 4 of 2018 runs hold a human turn; shared index 13770 bytes
2026-11-09T01:31:09Z nightly 0 ARCHIVE RUN OK — 1105 raw files, 181 lines, layer (c) 28 values; HEARTBEAT: 4 of 2030 runs hold a human turn; shared index 13770 bytes
2026-11-09T20:11:46Z precompact-hook - fired; input keys: custom_instructions,cwd,hook_event_name,prompt_id,scratchpad_dir,session_id,transcript_path,trigger
2026-11-09T20:13:03Z precompact 0 ARCHIVE RUN OK — 1106 raw files, 109 lines, layer (c) 28 values; HEARTBEAT: 4 of 2036 runs hold a human turn; shared index 13770 bytes
2026-11-10T01:31:02Z nightly 0 ARCHIVE RUN OK — 1106 raw files, 171 lines, layer (c) 28 values; HEARTBEAT: 4 of 2036 runs hold a human turn; shared index 13770 bytes

installed from fa03c15cc568d821d32e2b0c3c7711e9c7377712 at 2026-11-07T05:55:01Z by Infra Claude (B-TRANSCRIPT-ARCHIVE: the shared index cap deleted, Langston PROCEED at b9da8d2d7, runtime files unchanged since); previous copy kept at ~/.claude/transcript-archive-bin.4635e5926

DawnTrader-Transcript-Archive.task.xml live=a4378fab5d4ae48e16b720ed60d8a954fe35dff6 ref=a4378fab5d4ae48e16b720ed60d8a954fe35dff6 equal=True
dt_archive_run.py live=e78ca6298641815d30394ffee9cc86db788815cb ref=e78ca6298641815d30394ffee9cc86db788815cb equal=True
dt_archive_trigger.py live=5618f4be438c519d4b8c839f2affdf483b915c8c ref=5618f4be438c519d4b8c839f2affdf483b915c8c equal=True
dt_archive.py live=9e7f4e62b882fd7df04ebb407f975dbd52536757 ref=9e7f4e62b882fd7df04ebb407f975dbd52536757 equal=True
dt_index.py live=07e988234095fcd76b03eeabd229a1239a21010e ref=07e988234095fcd76b03eeabd229a1239a21010e equal=True
dt_offset_census.py live=3e4c8ae8faf71e77068ee02b35262baba6399e53 ref=3e4c8ae8faf71e77068ee02b35262baba6399e53 equal=True
dt_secret_hashes.py live=7ce9451ea4cbff2badbf598189ef4ac6681871e3 ref=7ce9451ea4cbff2badbf598189ef4ac6681871e3 equal=True
dt_transcript.py live=63474c653cc590186ea372c9c5fd660e4fffbac7 ref=63474c653cc590186ea372c9c5fd660e4fffbac7 equal=True
```

## 3. Bidirectional population — reproducible output

Command:

```powershell
python "Claude Comms and Packages/Change Lists/B_TRANSCRIPT_ARCHIVE_STEP8_EVIDENCE/step7_bidirectional_census.py"
```

Output, exit 0:

```text
cutoff UTC: 2026-11-10T01:31:02Z
raw rows now: 1107
raw identities now: 1107
raw identities created by cutoff: 1106
raw identities created after cutoff: 1
state files: 1106
state raw identities: 1106
archive paths committed by state: 1567
archive markdown files on disk: 1567
cutoff raw without state: 0
state without cutoff raw: 0
committed archive missing on disk: 0
archive file with no state owner: 0
states with no committed archive path: 36
empty states that are workflow journals with zero archived ids: 36 of 36
archive files shorter than committed length: 0
post-cutoff raw: c:\users\kyleg\.claude\projects\c--dawntraderv3-pm\994e6488-db2e-49a0-8e00-4d3635208c2d\subagents\agent-a96881e35ee32eaa3.jsonl | size=631257 | ctime=1794301575.667400 | mtime=1794301620.086849
```

## 4. Installed offset census — verbatim output

Command:

```powershell
python C:\Users\kyleg\.claude\transcript-archive-bin\dt_offset_census.py
```

Output, exit 0:

```text
states: 1106
orphan states (raw file gone): 0
  ok                                            1106
fingerprint present: 1106 of 1106
```

Its zero is not an unexercised arm: the prior P10 record in the batch change list plants a state, removes its raw file, and obtains one `ORPHAN: raw file gone` before accepting the live zero.

## 5. Both staging alert rows and local state — verbatim reads

Staging command reads `/var/log/dawntrader/system-alerts.jsonl` and prints only the two exact ids. Output:

```json
{"acknowledged_at": "2026-11-08T01:31:14.327Z", "acknowledged_by": "cc-infra", "body": "The laptop's nightly transcript archive last succeeded at 2026-11-07T01:30:22Z and no later success has resolved this check. Either the run did not happen (laptop off, task disabled or broken) or it could not reach staging to resolve this - read RUNS.log in ~/.claude/transcript-archive on the laptop. Owner: Infra Claude.", "category": "health_check", "created_at": "2026-11-07T01:30:23.839Z", "dedupe_key": "transcript-archive-deadman-20261107T013022Z", "fired_at": null, "id": "04dd44a1-3ff3-40d8-a07d-ebd20c3771da", "metadata": {"last_ok": "2026-11-07T01:30:22Z", "owner": "CC-INFRA", "source": "dt_archive_trigger"}, "recurrence_interval_seconds": null, "resolution_evidence": "laptop:~/.claude/transcript-archive/RUNS.log:30 (nightly 2026-11-08T01:31:10Z, exit 0)", "resolved_at": "2026-11-08T01:31:14.327Z", "resolved_by_claimed": "cc-infra", "resolved_by_transport": "cli", "schema_version": 1, "severity": "warning", "state": "resolved", "title": "Transcript archive: the nightly run has not succeeded since 2026-11-07T01:30:22Z", "triggers_at": "2026-11-08T03:30:22Z"}
{"acknowledged_at": null, "acknowledged_by": null, "body": "The laptop's nightly transcript archive last succeeded at 2026-11-10T01:31:02Z and no later success has resolved this check. Either the run did not happen (laptop off, task disabled or broken) or it could not reach staging to resolve this - read RUNS.log in ~/.claude/transcript-archive on the laptop. Owner: Infra Claude.", "category": "health_check", "created_at": "2026-11-10T01:31:05.222Z", "dedupe_key": "transcript-archive-deadman-20261110T013102Z", "fired_at": null, "id": "719af3be-be8c-4e69-8b3a-7d794fb743c1", "metadata": {"last_ok": "2026-11-10T01:31:02Z", "owner": "CC-INFRA", "source": "dt_archive_trigger"}, "recurrence_interval_seconds": null, "resolution_evidence": null, "resolved_at": null, "resolved_by_claimed": null, "resolved_by_transport": null, "schema_version": 1, "severity": "warning", "state": "scheduled", "title": "Transcript archive: the nightly run has not succeeded since 2026-11-10T01:31:02Z", "triggers_at": "2026-11-11T03:31:02Z"}
```

Local read:

```text
> Get-Content C:\Users\kyleg\.claude\transcript-archive\.alert-state.json
{"deadman_keys": ["transcript-archive-deadman-20261110T013102Z"]}
```

## 6. Prior scheduled Drive snapshot — delimited primary evidence

Registered task query:

```text
Folder: \
HostName:                             KYLEGJORDAN
TaskName:                             \Claude Code Session Backup
Next Run Time:                        11/10/2026 11:30:00 AM
Status:                               Ready
Logon Mode:                           Interactive only
Last Run Time:                        11/9/2026 11:30:01 AM
Last Result:                          0
Author:                               N/A
Task To Run:                          powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "C:\Users\kyleg\.claude\backup-claude-sessions.ps1"
Start In:                             N/A
Comment:                              Daily additive backup of Claude Code session transcripts (~/.claude/projects) to Google Drive. Created with Claude Code.
Scheduled Task State:                 Enabled
Idle Time:                            Disabled
Power Management:
Run As User:                          kyleg
Delete Task If Not Rescheduled:       Disabled
Stop Task If Runs X Hours and X Mins: 01:00:00
Schedule:                             Scheduling data is not available in this format.
Schedule Type:                        Daily
Start Time:                           11:30:00 AM
Start Date:                           6/16/2026
End Date:                             N/A
Days:                                 Every 1 day(s)
Months:                               N/A
Repeat: Every:                        Disabled
Repeat: Until: Time:                  Disabled
Repeat: Until: Duration:              Disabled
Repeat: Stop If Still Running:        Disabled
```

Verbatim nonblank lines from the transcript-archive leg in the backup log:

```text
[2026-11-09 11:30:04] Transcript archive - C:\Users\kyleg\.claude\transcript-archive -> G:\My Drive\Claude Code Backup Folders\Transcript Archive
Started : Monday, November 9, 2026 11:33:06 AM
Source : C:\Users\kyleg\.claude\transcript-archive\
Dest = G:\My Drive\Claude Code Backup Folders\Transcript Archive\
Files : *.*
Exc Files : value-hashes.json
            *.lock
               Total    Copied   Skipped  Mismatch    FAILED    Extras
Dirs :            27         0        27         0         0         0
Files :         2679      1119      1560         0         0         0
Bytes :      69.67 m   19.70 m   49.96 m         0         0         0
Ended : Monday, November 9, 2026 11:33:52 AM
```

Read-only restore samples:

```text
Relative          : CC-INFRA\2026-07-23_e6446f21.md
SourceLength      : 22918
DestinationLength : 22918
SourceSHA256      : 125F5F5961B751B45A546BB603EFBDCBB1E7BE33C8CCE5BA14100420E5A1D5D7
DestinationSHA256 : 125F5F5961B751B45A546BB603EFBDCBB1E7BE33C8CCE5BA14100420E5A1D5D7
Equal             : True

SourceLength       : 6230
DestinationLength  : 5733
SourcePrefixLength : 5733
SourcePrefixSHA256 : DDADD7ADFFA8E3C7664BC0DF22AEC5E38A31290565411B574BA49A220D4EAFB1
DestinationSHA256  : DDADD7ADFFA8E3C7664BC0DF22AEC5E38A31290565411B574BA49A220D4EAFB1
Equal              : True
```

This proves one recovered closed file and one append-only prefix from the 2026-11-09 scheduled snapshot. It does not claim whole-manifest restore coverage or that the 2026-11-10 archive run was already on Drive.

## 7. Complete-marker census and exact installed tests

Command:

```powershell
python "Claude Comms and Packages/Change Lists/B_TRANSCRIPT_ARCHIVE_STEP8_EVIDENCE/step7_marker_census.py"
```

Summary output, exit 0; the script prints all 64 per-kind counts:

```text
archive markdown files (sample excluded): 1568
expected complete marker kinds: 64
positive control recovered exactly once: 64 of 64; ok=True
recognised complete marker strings: 175
unrecognised complete marker strings: 2
EXCLUDED ... 1
EXCLUDED … 1
```

The population is 1,563 files under the five crew aliases, 4 under `HEARTBEAT`, and root `INDEX.md`; the duplicate `sample` derivative is excluded. The two unrecognised strings are prose placeholders, not redactor kinds. A zero means no complete recognised marker string of that kind persisted in this population; it is not evidence that no redactor event occurred or that every historical secret is absent.

The installed distiller is byte-identical to exact installed ref `fa03c15cc568d821d32e2b0c3c7711e9c7377712`; the two test files used below are also byte-identical to that ref. Commands and final outputs:

```text
python comms-infra/laptop/transcript-archive/test_dt_transcript.py
0 failed

python comms-infra/laptop/transcript-archive/mutate_dt_transcript.py
59/59 caught (0 of them by a crash rather than an assertion)
```

## 8. Review boundaries

- No web or staging UI exists for this laptop archive batch.
- The Windows task event channel is disabled; task execution provenance is intentionally limited as stated above.
- The backup evidence is a prior scheduled snapshot and two restore samples, not a complete current restore manifest.
- The marker census measures complete recognised strings, not historical-secret absence.
- The packet contains no secret values, hash-key material, database URL, or webhook URL.
