# B-CREW-ACCESS-HARDEN — Step 2 change list

**Review target:** the merged pre-implementation audit and implementation plan only. No application, database, key, account, package, firewall or server setting changed in Step 2.

**Change class:** sub-batch design / infrastructure and access hardening

**Issues:** `#1092`, `#924`

## Added

- `Claude Comms and Packages/Scope Files/B_CREW_ACCESS_HARDEN_PRE_AUDIT.md`
  - names all six mandatory audit sources and the additional live operating-system/package sources;
  - records every scope-to-audit delta at the top;
  - enumerates entry points before tracing and includes the per-component writer/reader/mutator/deleter/scheduler census;
  - covers all ten identities—four Claude sessions, four Codex sessions, Langston and Coltrane—while stating the three physical credential planes;
  - finds and plans the prerequisite dashboard correction from the administrator-only active scan to the existing passive scan read;
  - strengthens the database operation from a username label to immutable id plus current-state preconditions;
  - records Windows OpenSSH agent registry persistence and makes a disposable cold-start mechanism proof a hard gate before production key creation;
  - extends key removal to the actual production listener, NSS users/groups/homes, alternate authorization mechanisms, old-key-only fresh refusals and exact server-log fingerprints;
  - replaces an invalid-password-only check with a production-wire proof that password and keyboard-interactive methods are not offered;
  - requires the real production fail2ban jail/firewall to block a fresh non-multiplexed peer connection and then restore it after unban;
  - supplies ordered implementation, rollback, stop gates, file inventory, tests and governance work, with every plan item back-referencing audit findings.

## Audit-overturn items needing explicit review

1. The approved scope excluded application code, but the current dashboard unconditionally invokes an administrator-only action for a countdown. The plan includes one prerequisite application correction before clearing the crew administrator flag.
2. Normal Windows OpenSSH agent use does not satisfy “unavailable after sign-out/reboot until Kyle unlocks once,” because added keys persist across sessions. The plan first mutation-proves a non-persistent in-memory lifecycle with a disposable encrypted key and stops if Windows cannot provide it.
3. Seven of the ten identities did not individually reply to the route-use question. The plan records that honestly and closes the discovered universal dashboard dependency through code, route and shared-plane evidence rather than inventing replies.

## Coltrane correction round at `5ce1cdac37881af6c854535745dc11b8d9b51d89`

- The fingerprint-only cold gate is replaced by an assertion bound to the current Windows logon authentication id and current agent-service process epoch. Its mutation deliberately carries the expected fingerprint and a stale marker across sign-out/reboot, then proves a real governed caller refuses before starting SSH.
- The caller census now gives the exact four clone roots, eight selection-bearing source paths, all normalized hashes, 32/32 repo-copy denominator, four installed runtime files, three live task identifiers, run-as/working-directory context, a 39-object concrete denominator, current client selection and a real-entry test for every row. The broad 52-hit source search is the positive control and every excluded hit is classified.
- The scope criterion now requires ten named dispositions rather than inventing seven missing replies. Each Claude, Codex, Langston and Coltrane row is resolved with its actual access plane, direct reply where available and governing browser/API policy; Langston's browser plane is explicit.
- Database rollback now has its own post-state predicate: immutable id, unchanged username/role, `is_admin=false`, exactly one returned row, then restore captured `true`.
- Every governed cold-state negative test must stop at the assertion before an SSH-family child exists, so the still-authorized old default-path key cannot mask a failure. A separate raw new-key-only attempt excludes the agent and old identity.
- The claim that loopback application logs excluded external browser use is withdrawn. The app sees the local reverse proxy address for browser traffic, so the plan uses the code caller and per-plane evidence instead.

## Coltrane correction round at `e0b55f8c18a757bd17cb8336e88efdd630906e8f`

- The wrapper's session marker is now explicitly defence in depth, not the cold-key proof. Unlock must remove and verify absence of the expected key's attributed persistent registry record while preserving its current-session in-memory use; inability to do that stops the design or requires a separately reviewed genuinely nonpersistent holder.
- After service restart, real sign-out/sign-in and reboot, the Manual agent is started without unlock and must show both an absent persistent record and an empty identity list. Raw Windows OpenSSH then bypasses the wrapper with the agent enabled: normal selection must not offer or authenticate the expected fingerprint, and a disk-identity-disabled run must fail before unlock and succeed after unlock with exact server-log attribution.
- The stale-marker/expected-fingerprint mutation remains as a separate defence-in-depth proof that every governed caller refuses before starting SSH; it no longer stands in for key unavailability.

## Required fresh-reader pass

The one claim-only pass identified alternate authorizers/daemon contexts, old-key exclusivity, password-method offers, scheduled-task races, installed-copy/client bypass, service-context fingerprint attribution and stale multiplexing/firewall ambiguity as states compatible with weaker evidence. Those leads were re-derived against the live listeners, server configuration/auth sources, NSS population, Windows client/task XML, installed copies and fingerprints, then folded into the audit and P3-P7. The reader's silence is not cited as evidence.

## Reviewer questions

1. Does the one prerequisite dashboard correction properly resolve the newly discovered dependency before the crew administrator flag is cleared?
2. Is the Windows agent stop gate honest and sufficient: no production key or old-key removal unless the disposable proof survives real logoff/logon and reboot without a pre-unlock usable identity or caller race?
3. Does the authorization/caller census cover the actual listener, alternate authorizers, installed copies, four clone roots, all real caller contexts and every dedicated Langston/Coltrane/cross-server path?
4. Do the old-key-only, password-method and real production-jail tests distinguish the unsafe alternate states rather than merely showing that the new path also works?
5. Does the ten-row matrix preserve identity-specific evidence without falsely claiming ten independent credentials?
