# DawnTrader Windows SSH key-holder

This directory is the repository source for the shared laptop key lifecycle. It is
inactive until the reviewed installer is run from an elevated PowerShell window.
The installer leaves `ssh-agent` in Manual mode, installs synchronous local Group
Policy logon/logoff cleanup, and adds a logon/lock/disconnect task as a second
layer. It does not create, copy, or authorize a private key.

## Safety boundary

- `unlock` purges the agent and its bounded registry store, asks `ssh-add` to prompt
  Kyle for the configured encrypted key, accepts exactly one configured fingerprint,
  removes the registry material attributable to that load, confirms the key remains
  usable in current service memory, then writes an owner-only marker bound to the
  caller's logon LUID and the agent process epoch.
- `assert` and `exec` refuse unless fingerprint, LUID, process id/start time and empty
  persistence store all match. `exec` is the only supported route to the absolute
  Windows `ssh.exe`, `scp.exe`, or `sftp.exe` after activation.
- `lock` removes the marker first, purges agent and registry state, proves the agent is
  empty, and stops it. Every cleanup is attempted even when another one fails; a partial
  cleanup raises an error and can never print `LOCKED`. A stale marker with the expected
  key deliberately left loaded must still refuse before any network client starts.
- Installation writes and secures its rollback manifest before the first service,
  task, policy or installed-file mutation. Every later failure invokes exact rollback.
  The installer refuses a non-cold starting state and prints `INSTALLED_LOCKED` only
  after service, registry, marker and agent-unavailability checks all pass.
- The local Group Policy logon script is synchronous, so raw Windows OpenSSH cannot
  race an asynchronous scheduled task after sign-in; the matching logoff script removes
  the in-memory identity as that session ends. The real sign-out/sign-in proof rejects
  the mechanism if either boundary leaves the key usable. The scheduled task remains
  defence in depth for lock and disconnect events.

## Review and activation order

1. Run `python test_ssh_keyholder.py` and `python test_verify_caller_census.py`,
   then mutation-prove every refusal.
2. With a disposable encrypted key that is authorized nowhere, install into the
   measured Windows account and run the load/remove/restart/logoff/reboot proof.
3. Stop if registry removal destroys in-memory use, if registry material reappears,
   or if a cold boundary leaves the disposable key usable.
4. Only after that proof, create the production replacement key, install its public
   fingerprint and privately run `unlock`.
5. Route and verify all 39 concrete objects plus both direct command classes. The
   census tool must report 32 guarded repository selectors, four installed runtime
   files, three scheduled tasks, and a total governed population of 39. It parses
   only recognized process-launch calls whose executable is the holder and whose ordered
   arguments begin `exec --client <ssh|scp|sftp> --`; comments, print/echo decoys, a
   fake launcher, a remaining direct SSH-family launch, or any unresolved process-launch
   command all fail. Shell continuations are joined deliberately, while every other
   newline remains a command boundary. It validates task actions and installed hashes.

`capture_caller_processes.ps1` is the bounded producer for real-entry evidence. It
requires an exact ten-row plan, subscribes to the Windows `Win32_ProcessStartTrace`
provider before each positive and locked-negative entry, and records the process tree,
invoked-entry pid, observed SSH-family executable image and UTC time. The verifier follows
parent ids back to that invoked entry; an unrelated concurrent client cannot count. A
missing SSH-family executable image is a hard failure when
`seal_caller_evidence.py` seals the result. Quiesce the three scheduled tasks and
concurrent hooks before capture so an unrelated SSH process cannot be attributed to an
entry window.

Copy the raw `journalctl -u ssh.service --since ... --until ... -o json` output covering
the capture into `server-journal.jsonl` beside the process capture. The sealer selects
accepted-publickey records only by the capture windows and expected fingerprint; it does
not accept a hand-entered fingerprint or spawned-client list. The final
`dt-caller-capture-v1` bundle SHA-256-binds both raw files. The census verifier re-derives
the client set from process events, rejects overlapping windows or reused journal cursors,
requires one matching raw server record per entry, and proves the negative windows contain
zero SSH-family starts. A ten-row summary JSON without these raw artifacts cannot pass.

The passphrase must be entered only at the interactive `ssh-add` prompt. It must not
appear in any argument, file, environment variable, task definition, repository
record, or log.

The disposable-key proof runs installer failure injection after files, service mode,
Group Policy and task registration. Each injected failure must end at the captured
pre-state using the reported manifest. The fault switch is accepted only when the key
filename contains `disposable` and `DT_KEYHOLDER_ENABLE_FAULT_TESTS=I_UNDERSTAND` is
set for that proof process.
