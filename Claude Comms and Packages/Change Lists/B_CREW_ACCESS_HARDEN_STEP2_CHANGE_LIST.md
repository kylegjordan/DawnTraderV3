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

## Required fresh-reader pass

The one claim-only pass identified alternate authorizers/daemon contexts, old-key exclusivity, password-method offers, scheduled-task races, installed-copy/client bypass, service-context fingerprint attribution and stale multiplexing/firewall ambiguity as states compatible with weaker evidence. Those leads were re-derived against the live listeners, server configuration/auth sources, NSS population, Windows client/task XML, installed copies and fingerprints, then folded into the audit and P3-P7. The reader's silence is not cited as evidence.

## Reviewer questions

1. Does the one prerequisite dashboard correction properly resolve the newly discovered dependency before the crew administrator flag is cleared?
2. Is the Windows agent stop gate honest and sufficient: no production key or old-key removal unless the disposable proof survives real logoff/logon and reboot without a pre-unlock usable identity or caller race?
3. Does the authorization/caller census cover the actual listener, alternate authorizers, installed copies, four clone roots, all real caller contexts and every dedicated Langston/Coltrane/cross-server path?
4. Do the old-key-only, password-method and real production-jail tests distinguish the unsafe alternate states rather than merely showing that the new path also works?
5. Does the ten-row matrix preserve identity-specific evidence without falsely claiming ten independent credentials?
