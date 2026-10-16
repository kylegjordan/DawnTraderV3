# B-CREW-ACCESS-HARDEN — P3 disposable Windows key-holder proof

**Workflow:** Step 9 iteration · live gate P3a · exact-ref review required before execution

**Purpose:** prove the reviewed Windows key-holder lifecycle with encrypted disposable keys
before any production replacement key is created or authorized. No disposable public key may be
added to staging, Helsinki, GitHub or any other server.

## Reviewed source and current pre-state

Coltrane approved the dormant Ref A source at exact ref
`6474a2d4f7cab094010a549c8fed1c9645dbd51a`. The exact path-limited Git blob population in
this candidate is 12 files: 9 unchanged and 3 changed.
The unchanged approved holder code, capture/sealing tools, configuration and tests are:

| unchanged path | blob at both refs |
|---|---|
| `caller_capture_bindings.json` | `51ad685c46e5f7110fe04f36c3f6734645f140d7` |
| `capture_caller_processes.ps1` | `ca589183822c3a44182dcaadb572dde170d71a68` |
| `config.example.json` | `aca6b25db6c01b39659a5d276bc9007269421429` |
| `dt-ssh-keyholder.py` | `2bd7c7939427e7d4a8462793ecf5c6dfa19caa37` |
| `seal_caller_evidence.py` | `96910319befe043cad9829f0e94a48dd47ba1ccb` |
| `ssh_keyholder.py` | `715cca9e3aa8f30a69da7eb287dc61ca3c9eb187` |
| `test_ssh_keyholder.py` | `8914373fe12ac220c5da7b8acbc2175bad495c7e` |
| `test_verify_caller_census.py` | `897981f5fbb90d42b8d8ea82f7e957e27742bd27` |
| `verify_caller_census.py` | `6fc1fc077c6ee01606b6bc3025c5ae7a66cf4dfa` |

The three files changed by this review round are:

| changed path | approved-ref blob | review-ref blob |
|---|---|---|
| `README.md` | `53f7a8ea7469953b10c165f5a0ecb4c2fe3c964c` | `e7ad7d25a118710c868c3a887c99af8ed0547f6e` |
| `install.ps1` | `5fd93c561e90e04a4ed3568c1284efc4a4a0098b` | `e38eaa7cfd79568bb51f34fdfd972f8f71bc902b` |
| `rollback.ps1` | `46b5bfec42c8828783467c977e0e26f51624ee3f` | `da57d6a0166c462698650539e1c1e33610c09280` |

The focused suites pass 11 of 11 key-holder tests and 36 of 36 caller census/parser tests.
The prior approval therefore still covers the nine unchanged blobs; this review must separately
approve the changed installer, rollback and documentation blobs plus this execution plan.

The read-only laptop preflight on 2026-10-15 returned:

- the current shell is not elevated;
- Windows `ssh-agent` is Stopped and Disabled with process id 0;
- the bounded agent registry path, install root, runtime-state root, scheduled task, local Group
  Policy script file, Scripts directory and Logoff command directory are absent;
- the synchronous-logon policy key and value, key-holder backup root and key-holder Group Policy
  command are absent;
- `ssh-add -l` cannot connect to an agent and exits 2;
- the existing production laptop key remains present with fingerprint
  `SHA256:8A/uD7oibDmK87ZMHYkWeiXGUFLAJQUY3773YcDkUOw`;
- Python 3.13 and the absolute Windows OpenSSH clients are present.

This is the required cold install pre-state. The existing production key and every server
authorization remain unchanged throughout P3a.

## Manual-secret boundary

Kyle performs every passphrase prompt directly. The passphrase must appear only at interactive
`ssh-keygen` or `ssh-add` prompts and must not appear in an argument, file, environment variable,
task, repository record, process capture or log. INFRA Codex records only public fingerprints,
exit states and bounded service/registry/marker evidence.

Two encrypted, uniquely named disposable ED25519 keypairs are created under Kyle's `.ssh`
directory after proving the target paths do not exist. One is the configured expected identity;
the second exists only for wrong-identity and multiple-identity refusal tests. Their filenames
contain `disposable`, which is required by the installer's fault-test fence.

## Live proof sequence

### A. Transactional installer rollback mutations

From an elevated PowerShell window, run the exact reviewed installer four times against the
expected disposable key with its explicit fault-test fence, stopping respectively after files,
service-mode change, local Group Policy registration and task registration. Every injected
failure must invoke the reviewed rollback and return to the captured cold pre-state: service
Stopped/Disabled; registry, marker, install root, runtime-state root, task and Group Policy
objects absent. Each rollback manifest stays in the newly created bounded owner-only backup root
for evidence; that evidence root is the one intentional addition and is not misreported as part
of the restored runtime pre-state.

Each case is accepted only when the installer output names the intended injected point and the
successful automatic rollback manifest. A failure at an earlier point cannot count for a later
mutation.

Any unequal restoration is a design stop. Do not proceed to a normal installation.

### B. Normal installation and current-session memory proof

Run the same installer without fault injection. It must print `INSTALLED_LOCKED`, report the
owner-only rollback manifest, leave the service Stopped/Manual, and prove no registry identity,
marker or usable in-memory identity exists.

Kyle then runs the installed `unlock` command and enters the expected disposable key's
passphrase at the interactive Windows `ssh-add` prompt. Capture the bounded state before load,
after load, and after the attributed registry record is removed. The post-unlock state must have:

- exactly the expected disposable fingerprint in the running agent;
- no bounded registry material;
- an owner-only marker matching the current logon LUID and agent process id/start time;
- a successful `assert` result; and
- a successful agent sign/verify probe against the disposable public key.

Arm the process tracer and run one valid expected-only holder `exec` as its positive control. It
must spawn the configured absolute Windows OpenSSH client as a descendant of that exact holder
invocation. Also create a public-key selector copy with no readable adjacent private key and run
the raw Windows client with disk identities disabled and agent use enabled. Its verbose trace
must offer the expected disposable fingerprint from the agent; authentication may fail because
the disposable key is deliberately authorized nowhere. This exact raw command and selector are
reused unchanged at every cold-state check.

If attributed-record removal also destroys signing ability, or registry material reappears, stop
and run exact rollback. Do not weaken the nonpersistent requirement.

### C. Live refusal mutations

Prove each state refuses before any `ssh.exe`, `scp.exe` or `sftp.exe` child starts:

1. no loaded identity;
2. only the wrong disposable fingerprint;
3. expected plus wrong disposable fingerprints;
4. the expected disposable fingerprint deliberately loaded while the prior unlock marker is
   stale because the agent service process epoch changed.

For each mutation, capture the marker, logon LUID, service process epoch, registry population,
agent fingerprint population, holder refusal and a process-start trace from the same armed tracer
used by the valid positive control. Each invalid holder invocation must produce zero SSH-family
descendants of that invocation; an unrelated process does not count. Finish each case with the
reviewed `lock`, which must remove the marker first, purge identities and registry state, and stop
the service before printing `LOCKED`.

Before the stale-marker mutation, perform the omitted clean service-restart proof: after a valid
unlock, restart the service without running `lock` or `unlock`, then require absent registry
material, an empty identity list, no offer from the unchanged raw selector command, and failure
of the agent sign/verify probe. Only then deliberately load the expected identity against the
stale prior marker and prove pre-client refusal.

### D. Cold boundaries

After a successful disposable unlock, use a real Windows sign-out/sign-in. Before running
`unlock` in the new session, prove the holder marker and bounded registry record are absent, the
service is stopped, and the agent sign probe fails. Then start the Manual service, require an
empty identity list, and run the unchanged disk-disabled, agent-enabled raw selector command used
by the positive control; its verbose trace must not offer the disposable fingerprint.

Repeat the same sequence after a real machine reboot. A disposable fingerprint that survives or
rehydrates after either boundary is a design stop. A stale-marker wrapper refusal is defence in
depth and does not substitute for the raw cold-key proof.

Record the pre/post `whoami /logonid` LUID and the operating system's `LastBootUpTime`. The
sign-out/sign-in boundary is valid only when the LUID changes while the boot time remains
unchanged; the reboot boundary is valid only when the boot time changes. Capture post-boundary
state before any operator cleanup. Export the Windows Group Policy and Task Scheduler operational
records for the boundary, including records that name the bounded lock script or task, so an
operator-run `lock` or service restart cannot be presented as the automatic boundary result.

### E. Exact restoration

Run the reviewed rollback from the recorded successful-install manifest. It must restore the
captured Stopped/Disabled service state and the captured presence or absence of every bounded
install, runtime, registry, task, Group Policy and synchronous-policy object, including the
Scripts and Logoff directories and the synchronous-policy registry key. If `scripts.ini` existed before
installation, its restored bytes and SHA-256 must match the captured object. The owner-only backup
manifests remain as the evidence exception. Re-run the cold preflight and focused tests. Only
after exact runtime restoration and recorded public evidence may the two disposable
private/public keypairs be deleted; verify all four bounded files are then absent.

## Stop conditions

Stop without creating a production replacement key if any injected install fails to restore the
pre-state, if the registry record cannot be removed while current-session signing remains usable,
if an invalid marker/identity population starts a client, if cleanup is partial, or if either
cold boundary retains or rehydrates the disposable identity. The existing production key and
server authorizations remain the recovery path and are not changed by this proof.

REVIEWER: claim-only · verify that the sequence discriminates transactional rollback,
nonpersistent current-session use, pre-client refusal, real sign-out and reboot cold states, and
exact restoration without authorizing a disposable key anywhere · pending · re-derived y

## Live attempt 1 — 2026-10-16, refused before any mutation (Infra Claude)

Crew mode returned to Claude (order S2) and Infra Claude resumed P3a. Pre-flight at
`d0f743dde`: the 12-file population was blob-identical to the approved `159d16134`; focused
suites 11/11 and 36/36; cold pre-state as recorded above (service Stopped/Disabled pid 0;
agent registry, install root, runtime root, backup root, task, Group Policy `Scripts`
directory and synchronous-policy value all absent); production key
`SHA256:8A/uD7oibDmK87ZMHYkWeiXGUFLAJQUY3773YcDkUOw` present and untouched.

Kyle created both disposable keys at the interactive prompt (no passphrase was seen by any
session). Public fingerprints, both confirmed encrypted (empty passphrase refused):
expected `SHA256:uwDouLcdC1w6KmU9ynKb+w6xN44U94ejCeIqUVCTPyU`
(`%USERPROFILE%\.ssh\dt_disposable_expected_20261016`), wrong
`SHA256:cBrcLlF7SSwZcH6RPnLurfukbUG+SzRi2LIJT/X588A`
(`%USERPROFILE%\.ssh\dt_disposable_wrong_20261016`).

Section A was run from Kyle's elevated window through the evidence harness. All four cases
ended with `Too many arguments.` and **no backup manifest was created** — the installer refused
before its first mutation, so the four `EQUAL-TO-PRE True` lines proved nothing about
rollback. **This attempt is not evidence for section A.** The harness has been corrected so
that shape cannot read as a pass (below).

### Cause — reproduced outside the installer

The laptop has only Windows PowerShell 5.1 (`5.1.26100.9711`; no `pwsh`), which an elevated
"Run as administrator" window opens. Under `ErrorActionPreference = 'Stop'` that shell:

| site | old form | failure on 5.1 |
|---|---|---|
| `install.ps1` passphrase check (every run) | `& $sshKeygen -y -P '' -f $privateKey *> $null` | the empty argument is dropped; ssh-keygen sees `-y -P -f <key>` and writes `Too many arguments.`, which becomes a terminating error |
| `install.ps1` `Assert-LockedState` (success path) | `& $sshAdd -l *> $null` | with the agent stopped, ssh-add writes `Error connecting to agent` → throws, so a correct install would fail its own final check |
| `rollback.ps1` purge | `& $sshAdd -D *> $null` | throws whenever ssh-add writes stderr → **rollback stops half-way**, i.e. an injected or real install failure could not finish restoring |

Reproduced directly on the laptop: `ssh-keygen -y -P '' … *> $null` → `THROWN: Too many
arguments.`; `ssh-add -l` and `ssh-add -D` with the agent stopped → `THROWN: Error connecting
to agent`. Neither script had been executed before approval; the approved suites exercise the
Python holder and the census only, and CI only parses the PowerShell.

### Correction — commit `91c84d786`

One helper, byte-identical in both scripts between `# BEGIN/# END native-call helper`, runs
every external program through `Diagnostics.Process` with a command line built by Windows CRT
quoting (`''` arrives as `""`), stdin closed (no tool can wait on a prompt), stdout and stderr
captured as text, and the exit code returned. All seven native calls use it (ssh-keygen ×2,
ssh-add ×2 — `-l` in install, `-D` in rollback — icacls, gpupdate ×2, the installed `lock`);
only the call to `rollback.ps1` keeps the call operator. The passphrase check additionally
refuses if ssh-keygen reports `Too many arguments`/usage, so a lost argument cannot read as
"encrypted".

- `test_ps_native.py` (new): runs the helper on the real stock `powershell.exe` after a
  **positive control proving that shell reproduces the original `Too many arguments` failure**;
  then empty-argument delivery (unencrypted throwaway key → exit 0 + public key), encrypted
  throwaway key refuses an empty passphrase without throwing, stderr + non-zero exit without a
  throw, `ssh-add -l` returns an exit code, exact quoting round-trip of eight awkward values,
  and static checks (identical helper; no call operator, `*>`, `2>&1` or `$LASTEXITCODE`
  outside it). **8/8 on the laptop.** Off Windows the runtime class is skipped and labelled
  "not evidence"; CI now runs the file for its static checks.
- `ps_native_mutations.py` (new): **7 mutations, 7 killed cleanly, 0 problems** (empty
  argument dropped; spaces unquoted; backslash-before-quote not doubled; trailing backslash
  not doubled; installer passphrase check reverted to the call operator; rollback purge
  reverted; helper copies diverge).
- Existing suites unchanged: 11/11 and 36/36.

### Population for this review — 14 files at `91c84d786`

Unchanged from the approved ref (9): `caller_capture_bindings.json` `51ad685c`,
`capture_caller_processes.ps1` `ca589183`, `config.example.json` `aca6b25d`,
`dt-ssh-keyholder.py` `2bd7c793`, `seal_caller_evidence.py` `96910319`, `ssh_keyholder.py`
`715cca9e`, `test_ssh_keyholder.py` `8914373f`, `test_verify_caller_census.py` `897981f5`,
`verify_caller_census.py` `6fc1fc07`.
Changed (3): `README.md` `e7ad7d25` → `a775e8e3`; `install.ps1` `e38eaa7c` → `117478f2`;
`rollback.ps1` `da57d6a0` → `0b47ba54`. New (2): `test_ps_native.py` `3b62e189`,
`ps_native_mutations.py` `7f0f810c`. Plus one line in `.github/workflows/ci.yml`.

### Evidence harness (section A)

`B_CREW_ACCESS_HARDEN_P3A_FAULT_HARNESS.ps1` (this folder) runs the reviewed installer
unchanged. A case now PASSES only when the installer's message names the injected point AND
its automatic restore, exactly one new backup manifest exists, and every measured object
equals the captured pre-state; the first non-PASS stops the run. It never handles a
passphrase.

Sections B–E and the stop conditions above are unchanged. The two disposable keys stay in
place for the re-run; they are authorized nowhere.

REVIEWER: claim-only · does the helper close all three 5.1 failure sites without opening a
new one (argument injection through the built command line, a hang on stdin or a full pipe,
a lost exit code), and does the new harness PASS criterion discriminate a refused run from a
restored one · pending · re-derived y
