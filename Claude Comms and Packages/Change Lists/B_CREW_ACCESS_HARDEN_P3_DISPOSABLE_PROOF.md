# B-CREW-ACCESS-HARDEN — P3 disposable Windows key-holder proof

**Workflow:** Step 9 iteration · live gate P3a · exact-ref review required before execution

**Purpose:** prove the reviewed Windows key-holder lifecycle with encrypted disposable keys
before any production replacement key is created or authorized. No disposable public key may be
added to staging, Helsinki, GitHub or any other server.

## Reviewed source and current pre-state

Coltrane approved the dormant Ref A source at exact ref
`6474a2d4f7cab094010a549c8fed1c9645dbd51a`. A path-limited comparison from that ref to the
current shared source returned no difference for `comms-infra/laptop/ssh-keyholder/`; all 12 Git
blob ids are unchanged. The focused suites pass 11 of 11 key-holder tests and 36 of 36 caller
census/parser tests.

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
captured Stopped/Disabled service state and absence of every bounded install, runtime, registry,
task, Group Policy and synchronous-policy object, including the prior presence of the Scripts and
Logoff directories and the synchronous-policy registry key. If `scripts.ini` existed before
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
