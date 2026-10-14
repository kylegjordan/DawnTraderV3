# B-CREW-ACCESS-HARDEN — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Batch:** `B-CREW-ACCESS-HARDEN`

**Owner:** Infra Claude / INFRA Codex (`cc-infra` / `codex-infra`)

**Issues:** `#1092`, `#924`

**Scope:** `B_CREW_ACCESS_HARDEN_SCOPE.md`

**Audit ref:** `origin/migration/aws-supabase` at the Step-2 dispatch ref; live measurements dated 2026-10-14 unless another date is stated.

## 0. PREVIOUSLY STATED vs NOW

1. **PREVIOUSLY STATED:** the target database row would be selected by the label `testuser123`. **NOW:** the change will select immutable user id `6c591801-3072-431d-b192-30aaf426f15e` and require the current username, editor role and administrator flag as preconditions. **REASON:** `testuser123` is also the email of a different user; a broad label match can change the wrong row.
2. **PREVIOUSLY STATED:** no application code changes were in this sub-batch. **NOW:** one prerequisite application correction is required before the administrator flag is cleared: the dashboard watchlist must use the existing passive latest-scan read instead of the administrator-only on-demand scan. **REASON:** the audit found an unconditional dashboard caller that would begin returning 403 for Langston and Coltrane after the privilege removal.
3. **PREVIOUSLY STATED:** the administrator-only diagnostic scan was treated as an individually reported-use question. **NOW:** the direct questionnaire has replies from 3 of the 10 identities, while the code census establishes that the shared dashboard invokes it for every authenticated browser session. **REASON:** machine evidence overturned the safe-use assumption; non-replies are recorded as non-replies, not converted to “does not use.”
4. **PREVIOUSLY STATED:** Windows `ssh-agent` could be enabled and a user logoff/logon would establish that the key was unavailable until Kyle unlocked it. **NOW:** the implementation must explicitly prevent or purge the agent's persisted identity and gate every governed caller on the intended fingerprint. **REASON:** Microsoft documents that Windows OpenSSH agent private keys persist in the registry across sessions; a service restart or user logoff alone does not prove a cold lock.
5. **PREVIOUSLY STATED:** Git Bash needed a handoff to an agent-aware client. **NOW:** every governed PowerShell, Git Bash and scheduled caller is enumerated and must use the same Windows OpenSSH client and exact-fingerprint gate. **REASON:** the actual scheduled Python jobs inherit Windows PATH, while an interactive Git Bash resolves `/usr/bin/ssh`; proving one shell does not prove the other.
6. **PREVIOUSLY STATED:** fail2ban required a bounded real trigger, with a surrogate allowed if production enforcement could not be tested safely. **NOW:** the production `sshd` jail itself will be triggered one host at a time from the peer server with a disposable key and invalid user, then immediately unbanned and all dedicated paths re-proved. **REASON:** the package/filter/firewall audit found a safe discriminating production test that does not risk Kyle's only laptop path.
7. **PREVIOUSLY STATED:** the architectural documents describe four local sessions and two browser agents, or six crew users. **NOW:** governance and verification must name all ten identities—four Claude sessions, four Codex sessions, Langston and Coltrane—and separately state that they collapse to three credential planes. **REASON:** Kyle expanded the batch and identity coverage is not the same as credential independence.
8. **PREVIOUSLY STATED:** four effective authorized-key files were in scope and the old laptop key occurred three times. **NOW:** that count is confirmed, but removal is keyed to the complete effective authorization sources, not to a memorized file list. **REASON:** the server configuration permits two file names and may be changed by included files or `Match` contexts; the re-census immediately before deletion is the authority.
9. **PREVIOUSLY STATED:** bare `sshd -T` was the effective-configuration proof. **NOW:** it is only the default-context control; every required user/source plane gets a separate `sshd -T -C` evaluation after a complete included-file and `Match` census. **REASON:** default output cannot reveal a contextual override.
10. **PREVIOUSLY STATED:** the Step-1 SSH-log snapshot contained 29,167 staging and 12,952 Helsinki accepted-public-key lines and 378,557 Helsinki failed-password lines. **NOW:** the same five-file population through 2026-10-14 14:16 UTC contains 29,228, 13,079 and 379,018 respectively; accepted-password remains 0 on each host and staging failed-password remains 0. **REASON:** these are live append-only logs; the later audit snapshot includes subsequent traffic.

## 1. Sources actually read

All six required Step-2 sources were read; the audit also read the live operating-system and package objects because two objectives are infrastructure changes.

1. **Actual code at `origin/migration/aws-supabase`:** authentication and admin routes in `server/routes.ts`; the dashboard and watchlist; the existing passive scan consumer; the server-held API wrapper and all repository SSH callers, wrappers, scheduled-job definitions and service definitions. Introducing commits were read for the app access, diagnostic, browser-session and server-held access components.
2. **Runtime logs and database:** retained web access logs, both servers' SSH journals, application/API controls, live agent-session checks, service/timer state and a read-only database query of the administrator population.
3. **System Impact Map:** Infrastructure Dependencies, Agent Bridges / Discord fabric, server-held crew access and `B-CODEX-FAILOVER` entries, including upstream, downstream, shared state, background execution and blast radius.
4. **System Manual:** Authentication, Server-held Crew Access and Security. The manual's warning that role names are not broadly enforced was retained; this batch does not call the editor role a read-only control.
5. **Batch reports and ledger:** `BATCH_CATALOG`, `RUNNING_ISSUES` (`#353`, `#924`, `#1022`, `#1092`) and the relevant `B-NEW-41`, `B-NEW-45`, `B-CREDENTIALS-PRIVATE-REPO` and `B-CODEX-FAILOVER` reports.
6. **`bridge/canonical/`:** all 14 current files were searched with a broad positive control and then for SSH, authorized keys, fail2ban, server-held access, agent sessions and administrator access. The corpus contains general server/user/auth material but no coverage of these modern components. It supplies no current-state claim and establishes a governance-history gap.
7. **Additional authoritative/runtime sources:** Microsoft OpenSSH agent documentation, live Windows service/registry/shell/profile/task state, live `sshd` configuration and account/key state on both servers, and the Ubuntu fail2ban package contents before installation.

## 2. Audit findings

### F-APP-1 — The database is the live authority for administrator access

`server/routes.ts:181-254` verifies the token, re-reads the user row on every request, derives permissions from the current database role and sets `req.user.isAdmin` from the current database value. The admin-user routes at `server/routes.ts:1082-1225` require that boolean, so clearing it takes effect on the next request and requires neither a token remint nor a password.

The current administrator population is three rows: `kylegjordan|owner|true`, `testuser|owner|true`, and `testuser123|editor|true`. The target is immutable id `6c591801-3072-431d-b192-30aaf426f15e`; the intended post-change population is two administrator rows. Nine scheduled reads in the autonomy scheduler select an administrator with `LIMIT 1`; the remaining two rows mean this batch does not remove the administrator population, but scheduler health must be observed because `#1092` already records the ambiguous first-admin behavior.

### F-APP-2 — The ten identities use three access planes

The four Claude and four Codex sessions share one Windows account, four working folders and the server-held `dt-api` read grammar. Langston and Coltrane each have separate stored browser state and dedicated server/repository keys. `dt-api` positively served settings and the passive latest-scan route, while it refused admin/user/auth routes and the on-demand diagnostic scan. A successful browser read and a successful `dt-api` read are different controls; neither substitutes for the other.

The direct Discord question was sent to all ten identities in message `1559918058808680492`. Coltrane reported that he needs authenticated, non-mutating rendered staging pages but not Settings → Users or the on-demand scan. ANALYST Codex reported normal dashboard and batch-specific analytical reads, not those admin surfaces. INFRA Codex reported neither. Seven identities did not individually reply; their state remains “no direct reply,” not “no use.”

### F-APP-3 — The dashboard has a hidden administrator-only dependency

The watchlist mounted on the normal dashboard (`client/src/pages/dashboard.tsx:120-137`) calls `/api/active-engine/diagnostics/scan` every ten seconds (`client/src/components/trading/watchlist.tsx:93-128`) only to render the next-scan countdown. The route is not passive: `server/routes.ts:13552-13600` requires administrator/owner access and can run a universe scan. The existing authenticated `/api/active-engine/diagnostics/scan-latest` route at `server/routes.ts:13689-13735` already returns `nextScanInMs` without starting a scan, and another diagnostics panel already consumes it.

Retained web logs from 2026-09-30 through 2026-10-14 14:12 UTC contain 49 on-demand scan requests, all from loopback; status population: 20×200, 22×304, 1×499 and 6×503. The positive-control API population is 243,868 requests. This proves no external browser hit in that retained log population, but it does not cancel the unconditional current-code caller. Clearing crew administrator access without changing the watchlist would turn the normal agent dashboard into a repeating 403 and blank countdown.

### F-APP-4 — Removing `is_admin` is least privilege, not a read-only-role conversion

The System Manual explicitly says viewer/editor role enforcement is incomplete across the API. The batch removes the separate administrator capability and preserves the structural `dt-api` denylist; it does not assert that `editor` makes every browser route read-only. Settings → Users loss is intended. The on-demand diagnostic scan remains administrator/owner-only because it performs work, not merely a read.

### F-KEY-1 — The old laptop key has three effective authorizations

Both production listeners are the systemd-launched `/usr/sbin/sshd` on IPv4/IPv6 port 22 using the default config and the included `/etc/ssh/sshd_config.d/*.conf` set. Both resolve authorized keys to `.ssh/authorized_keys .ssh/authorized_keys2`; `AuthorizedKeysCommand`, trusted user CA, authorized-principals sources and revoked-key file all resolve to `none`, and `AuthenticationMethods` resolves to `any`. The included configuration contains no `Match` block today. The NSS census adds the locked system `sync` principal on each host; its home resolves to `/bin` and both resolved authorization files are absent. Four populated effective files exist across the required service/login accounts: staging root, staging deploy, staging dtmint and Helsinki root. Exact public-key-body comparison finds the old laptop fingerprint `SHA256:8A/uD7oibDmK87ZMHYkWeiXGUFLAJQUY3773YcDkUOw` in exactly three lines—staging root, staging deploy and Helsinki root—and not in dtmint. No `authorized_keys2` file exists in that population.

The other server-held keys are distinct and must remain so: staging dtmint's forced-command key; Langston's source-restricted staging key; Helsinki root's staging alert-dispatcher key; and Langston/Coltrane agent-work keys. The replacement laptop key belongs only on the same three account authorizations as the old laptop key.

### F-KEY-2 — Governed laptop callers do not currently share one client path

Windows PowerShell resolves Windows OpenSSH 9.5; Git Bash resolves its bundled `/usr/bin/ssh`, `/usr/bin/scp`, `/usr/bin/sftp` and `/usr/bin/ssh-add`. No `SSH_AUTH_SOCK` exists, all four relevant shell profiles are absent and the Windows `ssh-agent` is stopped and disabled. The agent registry key is absent because no identity has been loaded. Git uses HTTPS for repository fetch/push, so Git transport is not part of this key rotation.

The live Task Scheduler XML—not only the installer source—shows `codex-channel-mirror`, `codex-discord-outbox` and disabled `DawnTrader Crew Status` run as Kyle's SID with `InteractiveToken`; the first two use time triggers rather than a logon-order dependency. The installed media wrappers are byte-identical to the repo copies, and the installed wake follower is content-identical after line-ending normalization. The four clone roots each contain their own caller copies, so installed-copy and clone-ref hashes must be part of cutover evidence.

PowerShell has no alternate client or SSH config on PATH. Git Bash lists its bundled clients before Windows OpenSSH. WSL is present but has no installed distribution; Plink, PSCP, WinSCP, Paramiko and AsyncSSH are absent from the measured environment. Those are audit-time facts, not permanent assumptions, so the installer and verifier repeat the selection census.

The entry-point census found these governed callers:

| entry point | starts how | current SSH selection | must be exercised after cutover |
|---|---|---|---|
| direct PowerShell `ssh` / `scp` / `sftp` | operator command | Windows OpenSSH | staging root/deploy, Helsinki root, transfer control |
| direct Git Bash `ssh` / `scp` / `sftp` | workflow commands | bundled Git client | same destinations through governed handoff |
| Codex channel mirror | scheduled Python job | Windows PATH → Windows OpenSSH | real mirror check |
| Codex Discord outbox | scheduled Python job | Windows PATH → Windows OpenSSH | real upload/send path |
| DawnTrader Crew Status | interactive scheduled Python job | Windows PATH → Windows OpenSSH | both servers |
| due-alert injection/manual read | Claude hook or Codex command | invoking shell | staging deploy path |
| agent-artifact verification | Python tool | inherited PATH | real verification entry point |
| media get/post wrappers | Git Bash wrapper | `ssh`/`scp` lookup | one real read and bounded write test |
| wake-watcher pipeline | Git Bash workflow | `ssh` lookup | inbox-follow startup/control |
| operational commands (`cc-send`, `crew-switch`, deploy/log/API/database) | direct shell | invoking shell | representative real commands, not only `true` |

The scheduled Windows tasks run only for an interactive `kyleg` logon. That contains their availability window but does not make an already persisted agent identity private.

### F-KEY-3 — Windows agent persistence defeats the naive cold-start claim

Microsoft's OpenSSH documentation states that keys added to the Windows agent are stored persistently in the user's registry across sessions ([Microsoft Learn, “OpenSSH Client Can't Connect to a Server via SSH”](https://learn.microsoft.com/en-us/troubleshoot/windows-server/system-management-components/open-client-can-not-connect-server)). Therefore “enable the service, add the key once, then log off/on” is consistent with the private key still being usable without a new unlock. A cold-start proof must inspect and discriminate the actual identity store, not only the service state.

The implementation needs a repo-canonical unlock/lock/assert lifecycle: the service remains Manual; lock purges all agent identities and stops the service; unlock starts it, purges unexpected persisted identities, asks Kyle for the new key's passphrase through `ssh-add`, and accepts only the exact expected fingerprint; assert refuses governed callers unless exactly that fingerprint is loaded. Merely scheduling a purge “at logon” is not sufficient because the existing callers have independent time triggers and could win the race. Every automated caller therefore needs the assertion as a direct dependency, while a logoff/logon lock mechanism clears service memory and persistent state.

Before creating or authorizing the production replacement key, a disposable encrypted key must prove that the proposed lifecycle can keep one key in memory for the current session without leaving a registry identity that rehydrates on service start, and that a real logoff/logon and reboot both return to a locked state. An unexpected persisted identity is the mutation control: the gate must refuse it even if Windows loads it successfully. If that mechanism cannot be demonstrated, the built-in agent design does not satisfy the approved outcome; implementation stops with the old key untouched and returns to review rather than weakening “unlock once per login” into a wrapper-only claim.

### F-SSH-1 — Staging is password-off; Helsinki is not

Both hosts run Ubuntu 24.04. Staging's included hardening drop-in makes password and keyboard-interactive authentication off. Helsinki has no hardening drop-in and resolves password authentication on, keyboard-interactive off, public-key on, PAM on and root login without-password. The listener/service and alternate-authorizer census in F-KEY-1 proves the queried binary/config is the one serving production port 22 today. Contextual checks were run for staging root from the laptop, staging deploy from the laptop and Helsinki, staging dtmint from Helsinki, Helsinki root from the laptop and staging, and Helsinki langston/coltrane from loopback. The contexts match the stated defaults today; the plan repeats them after the final included-file census and change.

Required service/login accounts are staging root/deploy/dtmint and Helsinki root/langston/coltrane/nova; the NSS census also includes the locked `sync` principal described in F-KEY-1. The five retained auth-log files on each host span 2026-09-13 00:00 UTC through 2026-10-14 14:16 UTC. That population has 0 accepted-password entries on each host, with 29,228 staging and 13,079 Helsinki accepted-public-key lines as positive controls. Helsinki has 379,018 failed-password lines; staging has 0 in the same population because password authentication is already off.

### F-SSH-2 — Dedicated cross-server paths are live and outside the laptop-key cut

The staging alert-dispatcher key successfully reached Helsinki root, and Langston's dedicated key successfully reached staging deploy. Both Langston and Coltrane browser-session checks are healthy; their refresh timer is enabled and active. Coltrane's dedicated agent-work key authenticated to its restricted repository. Relevant agent-session, repository-refresh, sync and Discord services were checked in their actual service context. These paths are the post-change controls and must not be rewritten to the shared laptop fingerprint.

### F-F2B-1 — The production jail can be tested safely, but package defaults are insufficient

fail2ban is not installed on either host. Ubuntu offers `1.0.2-3ubuntu0.1`; the package was unpacked in a private temporary directory and removed in the same command. Defaults are a ten-minute ban, ten-minute find window and five retries; the SSH jail is disabled by default. The systemd backend's filter matches `_COMM=sshd`, which is present in both hosts' real journals even though the unit is `ssh.service`. Both hosts use UFW with nftables-backed enforcement, incoming deny and port 22 allowed.

A production test is possible without password knowledge: from the peer server, use an ephemeral key against a deliberately invalid username for `maxretry+1` attempts. The default SSH filter counts invalid-user failures. Hold two proven laptop key sessions open, verify the laptop source is not banned, observe the peer source in both fail2ban status and the firewall, prove a new peer connection is blocked, immediately unban it, destroy the ephemeral key and re-prove every dedicated peer path. Run one host at a time. Loopback and the current laptop address may be ignored; the peer server must not be ignored during this discriminating test.

### F-DOC-1 — Governance still describes six users and omits the hardening mechanisms

The System Impact Map and System Manual describe four local sessions plus two agents as six crew users. The actual governed population is ten identities over three credential planes. The agent authoring guide describes browser sessions as owner access; after this batch they are editor/non-admin. No repo-canonical Windows key-holder lifecycle, Helsinki password-off file or fail2ban jail currently exists. `bridge/canonical/` has no historical coverage of these modern mechanisms. Step 10 must update the current architecture documents and record that the pre-governance corpus is silent.

### 2.1 Per-component writer/reader/mutator/deleter/scheduler census

| component/state | writers / creators | readers | mutators | deleters | schedulers / starters | multiplicity / exclusion conclusion |
|---|---|---|---|---|---|---|
| user administrator flag | privileged database operation; admin user routes | request authentication, admin middleware, scheduler/admin lookup jobs, admin UI | admin update route and this one bounded migration | admin user deletion path | request handlers plus nine autonomy scheduler reads | multiple readers/mutators; immutable-id precondition prevents wrong-row collision; this batch does not delete a user |
| dashboard scan countdown | FX5 Stage-3 cache and scanner timing | passive latest-scan route and diagnostics UI | on-demand scan route also mutates diagnostic/cache state | cache expiry/reset paths | dashboard polling and scanner schedule | two route choices exist; watchlist must select the passive one so countdown display cannot start work |
| laptop private key / agent identity | Kyle creates encrypted key; unlock script loads it | Windows OpenSSH clients used by all governed callers | unlock replaces agent set; lock purges it | lock script and final old-key retirement | interactive unlock, logon gate, scheduled callers | multiple callers, one permitted loaded fingerprint; gate supplies mutual exclusion between locked and usable states |
| server authorized-key state | root-controlled install/rollback script | each host's SSH server | add-new/remove-old phases | exact-fingerprint removal | each inbound login | three intended laptop authorizations plus distinct dedicated keys; re-census before each cut, no global text replacement |
| SSH effective configuration | base config plus included drop-ins | SSH server and contextual verifier | root-controlled install/rollback | drop-in rollback/removal only | service reload and every new connection | multiple sources, currently no Match blocks; syntax and per-context evaluation precede reload |
| fail2ban SSH jail / ban set | journal failures create bans | fail2ban client, firewall, verification | retries extend state; explicit unban removes test state | expiry/manual unban | fail2ban service reads SSH journal continuously | one jail per host; host-at-a-time testing prevents simultaneous loss, peer source is deliberately unignored only during proof |
| agent browser storage state | daily agent-session mint | Langston/Coltrane browser processes and checker | daily refresh replaces valid state only after success | explicit cleanup, not this batch | daily timer plus manual check | two separate states; no shared file and no batch deletion |

No application code is deleted in this plan. The one changed watchlist reader remains mounted; its state dependency moves from `nextScanAt` on the active route to `nextScanInMs` on the passive route. Tests must assert the active route is absent from that component and the passive state still drives the countdown.

## 3. Implementation plan

### P1 — Remove the dashboard's active-scan dependency before privilege removal `[F-APP-3, F-APP-4]`

Change the watchlist countdown to read the existing passive latest-scan endpoint and derive its local deadline from `nextScanInMs`. Add a focused client test that mounts the component, supplies the passive response, proves the countdown changes, and fails if the on-demand scan URL is requested. Re-read the route contract rather than duplicating scanner timing in the client. This is a prerequisite code correction, not a widening of the crew's rights.

### P2 — Clear exactly one administrator flag transactionally `[F-APP-1, F-APP-2, F-APP-4]`

After P1 is reviewed, deployed and verified, run one transaction against immutable id `6c591801-3072-431d-b192-30aaf426f15e` with preconditions `username='testuser123'`, `role='editor'`, `is_admin=true`; require exactly one returned row or rollback. Record the before/after three-row `(id, username, role, is_admin)` population without credentials. Prove crew settings/passive reads remain 200, no-token remains 401, crew admin user access becomes 403 and Kyle's owner access remains the positive admin control without entering or exposing his password. Verify both agent browser states, a fresh unauthenticated browser control, normal dashboard rendering and the `dt-api` denylist. Check scheduler logs for absence of “No admin user” with a positive successful-cycle control.

Identity evidence must name all ten identities. The eight laptop identities may share one physical execution result only where the report says so explicitly; each identity still gets a named lane/ownership check. Langston and Coltrane each get their own browser and dedicated-key results. Non-replies to the earlier questionnaire remain recorded as non-replies; the code correction, route tests and shared-plane verification close the actual dependency instead of pretending replies exist.

### P3 — Add a repo-canonical Windows key-holder lifecycle `[F-KEY-2, F-KEY-3]`

First use a disposable encrypted key to mutation-prove the Windows agent lifecycle described in F-KEY-3. Capture service state, registry identity store and `ssh-add` state before load, after load, after removal of persistence, after service restart, after logoff/logon and after reboot. Also deliberately leave an unexpected persisted identity once and prove the assertion refuses it. No production server authorizes this disposable key. A failure is a design stop, not a reason to continue with the production key.

After that proof, add a bounded `comms-infra/laptop/ssh-keyholder/` implementation containing:

- an unlock command that starts the Manual agent, purges unexpected identities, invokes Windows `ssh-add` so Kyle alone enters the passphrase, and accepts only the configured new fingerprint;
- a lock command that deletes all agent identities, proves the agent list is empty with an expected-new-key positive control available in the same tool, and stops the service;
- an assertion/wrapper used by all governed automated callers that refuses unless exactly the expected fingerprint is loaded;
- an installer that makes Git Bash invoke Windows OpenSSH consistently, puts the assertion directly in every automated caller rather than relying on task ordering, applies logoff/logon lock handling, and records/rolls back every profile/task/service change;
- automated tests for wrong fingerprint, zero identities, multiple identities and shell-path selection.

No passphrase is stored in a file, command argument, task, environment variable, repository or log. Re-export live task XML, compare every installed copy and all four clone roots, and record the actual spawned client image for each real caller. The key-holder design fails closed if the agent registry repopulates before Kyle unlocks it or if a caller can outrun/bypass the gate. Kyle's private passphrase entry is the only manual secret step.

### P4 — Rotate the shared laptop key add → prove → cold-start prove → remove `[F-KEY-1, F-KEY-2, F-KEY-3, F-SSH-2]`

Generate a new labelled, passphrase-protected laptop key without overwriting the old key. Add its public key beside the old key only on staging root, staging deploy and Helsinki root. Exercise every entry point in F-KEY-2 through its real command and bind each accepted login to the new fingerprint in the server log. Re-prove all distinct Langston, Coltrane, mint and alert keys do not resolve to that fingerprint.

Before removing the old authorization, perform both a real user logoff/logon and machine reboot. In each cold state, prove the new key is unavailable before Kyle's one private unlock and available to PowerShell, Git Bash and scheduled/real callers after it. Inspect the agent identity store as well as connection failure so an unrelated outage cannot masquerade as a lock. Any pre-unlock usability is a hard failure and leaves the old key installed.

Then re-derive the actual listener/daemon, included config, `Match` contexts, NSS accounts/groups/homes, authorization files/commands, trusted CA/principal sources and certificates; remove the exact old fingerprint from the resulting three authorizations. Before destroying the old private material, make a fresh old-key-only attempt to each of the three destinations with an empty config, no agent, `IdentitiesOnly=yes`, no multiplexing and no fallback, and pair each refusal with the server journal. Make the parallel new-key-only attempts and bind them to exact server fingerprints. Only after zero old authorizations and three old-key-only refusals are proven may the old private/public pair plus any bounded discovered copies be retired. The distinct `copilot_hetzner` pair and every server-held dedicated key are out of the deletion set.

### P5 — Install repo-canonical Helsinki password-off configuration `[F-SSH-1, F-SSH-2, F-DOC-1]`

Add a canonical hardening drop-in and an idempotent install/verify/rollback tool under `comms-infra/security/ssh/`. Re-census the actual production listener, daemon argv/config, includes, `Match` blocks, NSS groups and every authorization/authentication source; validate with `sshd -t`; and evaluate every required user/source/destination plane with `sshd -T -C`. Hold two proven laptop sessions open, install on Helsinki, reload rather than restart, then prove a fresh key login before releasing either recovery session. Capture a fresh production-wire authentication-method transcript with public-key authentication disabled client-side and prove neither password nor keyboard-interactive is offered; an invalid-password rejection alone is not accepted because a wrong password or locked account would also reject while the method remained enabled. Never create or test a valid password. Re-check every dedicated local/cross-server service path in its real service user, HOME and timer context.

### P6 — Install and mutation-prove the real fail2ban SSH jail on both hosts `[F-F2B-1, F-SSH-2]`

Add canonical package/config/install/verify/rollback assets under `comms-infra/security/fail2ban/`. Pin the package source/version in evidence, enable only the production SSH jail with the systemd backend, set explicit ban/find/retry values, and verify the filter against each host's real journal before enabling. Keep loopback and the current laptop source protected; do not hide the peer test source in `ignoreip`.

Run staging first, then Helsinki. For each host, hold two laptop sessions, establish pre-ban peer reachability, create an ephemeral peer-side key in a private temporary directory, make `maxretry+1` invalid-user attempts, observe the exact journal source address in jail and firewall state, and prove a fresh connection with `ControlMaster=no` is blocked while an independent laptop control still succeeds. Immediately unban the peer, prove fresh peer reachability is restored, prove the ban set contains no required crew source, destroy the ephemeral key in the same private-temp lifecycle and re-prove all dedicated paths. A simulated filter match, service-active state, stale multiplexed session or test jail does not satisfy this item.

### P7 — Run the ten-identity / three-plane verification matrix `[F-APP-2, F-KEY-2, F-SSH-2]`

The final matrix has ten named rows and three credential-plane columns: app/server-held reads, laptop server entry where applicable, and dedicated browser/server/repository access where applicable. It distinguishes “not applicable” from “not tested,” names the working folder or service user, real entry point, actual spawned client, destination/account, expected result, observed result and fingerprint used, and includes unauthenticated/wrong-key/wrong-password controls. Run fingerprint-bound checks one at a time or with a unique connection marker so a concurrent job's successful log line cannot be credited to the wrong caller. Claude and Codex counterparts are never collapsed into a six-user statement. Langston and Coltrane are first-class rows, not footnotes.

### P8 — Preserve bounded rollback until every destructive cut is proven `[F-APP-1, F-KEY-1, F-KEY-3, F-SSH-1, F-F2B-1]`

Before the first live write, capture only the exact database row, three authorization files, relevant SSH drop-ins, fail2ban config and Windows key-holder/task/profile state needed to reverse this batch, with permissions and checksums where applicable. Rollback order is host-local and explicit: restore authorization/config, syntax-check, reload, remove test ban, and prove fresh key access; database rollback restores only the captured boolean under the same immutable-id preconditions. Keep the old key authorized until P4's cold-start proof passes; never treat an open terminal alone as recovery.

### P9 — Update current governance and close the alert with evidence `[F-DOC-1]`

Update the System Impact Map, System Manual, agent authoring guide, applicable infrastructure runbooks, batch catalog, issue ledger and completion report to describe ten identities over three planes; editor/non-admin agent browsers; the Windows key-holder lifecycle; Helsinki password-off; fail2ban ownership, test and rollback; exact new/retired fingerprints; and the retained-log population. Record `bridge/canonical/` as consulted with no coverage, not as current truth. Resolve alert `aaf0b2b5-3ff9-4721-8121-4aa011e1dce9` only after all three objectives are complete and evidence is pushed.

## 4. Ordered execution and stop gates

1. Implement, test, review and deploy P1. Stop if the passive endpoint cannot supply the countdown without starting work.
2. Execute and verify P2. Stop and roll back if the immutable precondition changes, row count is not exactly one, normal dashboard access fails or the owner positive control is lost.
3. Implement and test P3; Kyle privately creates/unlocks the new key. Stop if the exact-fingerprint gate can be bypassed or the agent identity survives a cold boundary before unlock.
4. Execute P4 through add/prove/cold-prove/remove. The old key remains recoverable until the entire old-authorization population is gone and the new path is proven.
5. Execute P5 on Helsinki with recovery sessions held. Stop before reload on any syntax/context mismatch; roll back on any lost fresh key path.
6. Execute P6 one host at a time. Stop and unban/roll back immediately if Kyle's source or a required service source enters the ban set.
7. Run P7, complete P8 evidence, then P9 governance and alert resolution.

Every live server or database mutation gets its own exact-ref review boundary and evidence. No production access setting changes during Step 2.

## 5. Planned file/change inventory

| area | planned change |
|---|---|
| dashboard watchlist and focused test | replace active scan polling with existing passive latest-scan data |
| `comms-infra/laptop/ssh-keyholder/` | unlock, lock, assert/wrapper, installer/rollback and tests |
| governed laptop caller definitions | route all listed callers through the exact-fingerprint assertion and Windows client |
| `comms-infra/security/ssh/` | canonical Helsinki hardening drop-in plus install/verify/rollback |
| `comms-infra/security/fail2ban/` | canonical SSH jail plus install/verify/rollback and live-test procedure |
| change lists / evidence | exact-ref inputs, before/after objects, ten-identity matrix and rollback record |
| governance set | System Impact Map, System Manual, agent authoring guide, runbooks, catalog, issue ledger, completion report |

The database value, server authorization files, Windows key material/service/task/profile state and live package/configuration are controlled runtime changes, not repository substitutes. The repository assets make those changes repeatable and reviewable.

## 6. Test matrix

| layer | positive control | negative/discriminating control |
|---|---|---|
| watchlist | passive response drives visible countdown | active scan URL is never requested |
| app privilege | Kyle owner still reaches admin route; crew reaches settings/dashboard | crew gets 403 on admin route; no token gets 401 |
| database cut | exactly one immutable id returns editor/non-admin; two other admin rows unchanged | wrong current-state precondition updates zero rows and rolls back |
| key-holder | exact new fingerprint loaded once and works in both shells | zero/wrong/multiple identities refuse; post-logon/reboot pre-unlock connection refuses |
| key rotation | new fingerprint accepted on exactly three accounts | old fingerprint absent from all effective sources and no longer authenticates |
| dedicated paths | Langston, Coltrane, mint and alert paths pass with their own fingerprints | none resolves to shared laptop fingerprint |
| SSH hardening | every contextual key path works | production listener advertises neither password nor keyboard-interactive when public key is disabled; both resolve off in every context |
| fail2ban | known laptop and required service sources remain unbanned | disposable peer source enters real production jail/firewall, is blocked, then is unbanned and restored |
| governance | all ten names and three planes appear consistently | searches for the retired six-user/owner-browser claims produce no surviving current-state assertion in changed documents |

## 7. Fresh-reader record

`REVIEWER: claim-only · Which objects distinguish complete authorization/caller coverage, a truly locked Windows cold state, key-only production authentication and an enforced production ban—and what alternate states fit adjacent evidence? · HIT: alternate authorizers/daemon contexts, old-key exclusivity, password-method offer, scheduled-task race, installed-copy/client bypass, service-context key attribution and ControlMaster/firewall ambiguity required stronger discriminators · re-derived y (live listeners/unit/config sources, alternate authorizers, NSS accounts, effective key files/fingerprints, Windows client/task XML and installed-copy objects); corrections folded into F-KEY-1/2/3, F-SSH-1 and P3-P7`

## 8. Plain-language summary

The privilege removal is sound, but the audit found that the normal dashboard quietly calls an administrator-only action just to show a countdown. The plan first moves that display to an existing safe read, then removes the shared administrator flag without affecting Kyle's owner account.

The laptop key cannot safely be protected by merely turning on the Windows key-holder because Windows can remember loaded keys across sign-outs. The plan therefore adds an explicit lock/unlock gate, proves a real sign-out and reboot while the old key still works, rotates only the three intended authorizations, and verifies all eight local sessions plus Langston and Coltrane through their real access paths.

Finally, Helsinki is made key-only and both servers receive a real, tested SSH attack ban. Each live change is host-by-host, reversible and tested against the production control it claims to provide before the recovery path is removed.
