# DawnTrader Windows SSH key-holder

This directory is the repository source for the shared laptop key lifecycle. It is
inactive until the reviewed installer is run from an elevated PowerShell window.
The installer leaves `ssh-agent` in Manual mode and installs a logon/lock/disconnect
task that purges identities; it does not create, copy, or authorize a private key.

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
  empty, and stops it. A stale marker with the expected key deliberately left loaded
  must still refuse before any network client starts.

## Review and activation order

1. Run `python test_ssh_keyholder.py` and mutation-prove every refusal.
2. With a disposable encrypted key that is authorized nowhere, install into the
   measured Windows account and run the load/remove/restart/logoff/reboot proof.
3. Stop if registry removal destroys in-memory use, if registry material reappears,
   or if a cold boundary leaves the disposable key usable.
4. Only after that proof, create the production replacement key, install its public
   fingerprint and privately run `unlock`.
5. Route and verify all 39 concrete objects plus both direct command classes. The
   census tool must report 32 guarded repository selectors, four installed runtime
   files, three scheduled tasks, and a total governed population of 39.

The passphrase must be entered only at the interactive `ssh-add` prompt. It must not
appear in any argument, file, environment variable, task definition, repository
record, or log.
