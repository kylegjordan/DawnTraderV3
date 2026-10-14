# B-CREW-ACCESS-HARDEN — SCOPE

change-class: sub_batch

**Owner:** Infra Claude / INFRA Codex (`cc-infra` / `codex-infra`)

**Issues:** `#1092`, `#924`

**Authority:** Kyle, 2026-10-08 alert `aaf0b2b5-3ff9-4721-8121-4aa011e1dce9`; expanded by Kyle on 2026-10-14 to all Claude sessions, all Codex sessions, Langston and Coltrane.

**Plan home:** `SPRINT_TO_LIVE_PLAN.md` §0 while this directed access increment is in flight. It extracts only the immediate crew-access decisions from row 85a `B-USER-RESOLUTION-PIN` and row 158 `B-SEC-HARDEN`; both parent rows keep their other work.

## 0. Outcome and boundary

This sub-batch reduces the authority of the shared crew login and the two server-entry surfaces without taking any of the ten crew identities off duty. It has three independently reviewed gates because the failure modes differ:

1. **Crew app privilege:** clear `testuser123.is_admin` while keeping the sanctioned read paths working.
2. **Laptop server key:** replace the unencrypted, unlabelled shared Windows key with a passphrase-protected key held by the Windows OpenSSH agent, then remove the old key only after every required path works.
3. **Server login hardening:** turn password authentication off on Helsinki and install an SSH fail2ban jail on Helsinki and staging without breaking key logins.

The finished result covers **ten named identities**: OLD/NEW/ANALYST/Infra Claude; OLD/NEW/ANALYST/INFRA Codex; Langston; Coltrane. The ten names currently collapse to three credential planes, which the verification must state rather than pretending there are ten independent credentials:

| identity population | credential plane today | effect of this sub-batch |
|---|---|---|
| four Claude + four Codex sessions | one Windows account and one shared SSH key fingerprint `SHA256:8A/uD7…`; the eight sessions use the server-held `dt-api` read path | new passphrase-protected shared key through a key-holder; `dt-api` reads survive; no crew password is exposed |
| Langston | its own browser storage state and its own Helsinki/staging keys | browser remains signed in as non-admin; existing dedicated keys stay distinct and working |
| Coltrane | its own browser storage state and its own Helsinki/agent-work keys | browser remains signed in as non-admin; existing dedicated keys stay distinct and working |

### Explicit exclusions

- The unordered user-pick census, pin/delete decisions, `testuser` deletion and its foreign-key/seeder prerequisites remain in `B-USER-RESOLUTION-PIN` after row 78 and `B-CREDENTIALS-PRIVATE-REPO` OBJ-2.
- Route-by-route authorization, database TLS, path containment, deploy passwordless root, the full staging-key census/remediation and the other row-158 items remain in `B-SEC-HARDEN` / its named child rows.
- No app code, trading rule, mode, signal path, risk setting or live/paper behavior changes here.
- This scope does not give the ten identities separate credentials. That is a later architecture decision, not a silent promise of this access-hardening increment.

## 1. Current state measured before drafting

Population and controls are stated because every zero below is load-bearing.

1. **Crew app row:** a read-only query on staging on 2026-10-14 returned `kylegjordan|owner|true`, `testuser|owner|true`, `testuser123|editor|true`. The target is exactly one row, `testuser123`; no other user row is changed.
2. **Laptop key and complete effective authorization population:** `C:\Users\kyleg\.ssh\id_ed25519` has fingerprint `SHA256:8A/uD7…`, comment `kyle-dawntrader`, and accepts an empty passphrase. On both hosts, `sshd -T` resolves `AuthorizedKeysFile` to `.ssh/authorized_keys .ssh/authorized_keys2`, `AuthorizedKeysCommand` and its user to `none`, and the included SSH configuration contains no `Match` blocks or alternate authorization source. Enumerating those resolved paths for every login-capable account found four files: staging root, deploy and dtmint, plus Helsinki root. The old fingerprint occurs exactly three times—staging root, staging deploy and Helsinki root—and does not occur in dtmint's file. Positive control: all three matches were read by exact public-key body, not comment text. No `authorized_keys2` file exists in this population.
3. **Key-holder and bounded laptop-key population:** Windows `ssh-agent` exists but is `Stopped` and `Disabled`; `ssh-add -l` cannot connect. PowerShell resolves the Windows OpenSSH clients, while Git Bash resolves `/usr/bin/ssh` first and has no `SSH_AUTH_SOCK`. A passphrase alone would therefore lock out Bash-driven workflow commands; the implementation must route both shells through the same agent-aware client before rotating the key. The bounded `C:\Users\kyleg\.ssh` census contains two keypairs: the target `id_ed25519` fingerprint and a distinct `copilot_hetzner` fingerprint; no SSH config file exists there. Step 2 must extend that bounded copy/caller census to every governed wrapper or profile that selects an SSH binary or identity before deletion.
4. **Staging SSH:** effective configuration is `PasswordAuthentication no`, `KbdInteractiveAuthentication no`, `PubkeyAuthentication yes`, `PermitRootLogin without-password`.
5. **Helsinki SSH:** effective configuration is `PasswordAuthentication yes`, `KbdInteractiveAuthentication no`, `PubkeyAuthentication yes`, `PermitRootLogin without-password`. `root`, `langston`, `coltrane` and `nova` have locked/no-password status.
6. **Retained auth-log population:** five log files per server spanning 2026-09-13 through 2026-10-14 contain zero accepted-password logins on either box. Positive control: accepted-public-key lines are 29,167 on staging and 12,952 on Helsinki. Helsinki also has 378,557 failed-password lines in that population; staging has zero because password authentication is already off.
7. **fail2ban:** the binary is absent and the service is inactive/not-found on both boxes.
8. **Existing key separation:** staging's forced mint key is restricted to `dt-api mint` from Helsinki; Langston's staging key is source-restricted; the Helsinki-root staging key and the shared laptop key remain unrestricted. This sub-batch labels and rotates only the shared laptop key. It does not claim to close `#924`'s full remediation.

## 2. Mandatory architectural read

The direct read covered the current entries in both governed architecture documents:

- **System Impact Map — Infrastructure Dependencies:** crew staging access feeds the four local session lanes and the two agent browsers; `dt-api` starts read-only with an empty write allowlist. Agent staging sessions depend on a valid seven-day token and a failed refresh preserves prior state. Crew-access drift detects installation drift but does not repair it.
- **System Impact Map — Agent Bridges / Discord fabric:** Helsinki is the reviewer/comms host; Langston's dedicated staging key is a separate medium-blast-radius path. The old statement that one source-restricted key mitigates the whole deploy account is not applied to the other keys.
- **System Impact Map — B-CODEX-FAILOVER:** Codex adds four actor identities but works in the same four folders and resumes the Claude counterparts' positions. That is why the identity population is ten while the local credential plane is one.
- **System Manual — Authentication:** authentication re-reads the database user on every request, so clearing `is_admin` takes effect without changing or reminting the token. `requireAdmin` reads the boolean flag; editor permissions do not substitute for it.
- **System Manual — Server-held Crew Access:** the local sessions use `dt-api`; Langston and Coltrane receive stored browser sessions from one mint. The read grammar already denies account/auth/user, mode-switch and kill-switch routes.
- **System Manual — Security:** the app's declared viewer-role promise is not enforced across the whole API. This sub-batch therefore preserves the already-built structural read boundary and removes only the explicit admin flag; it does not present role text as a security control.

### Dependency and blast-radius conclusions

- Clearing the flag changes the two agent browsers' access to admin routes and Settings → Users. The eight local sessions' sanctioned `dt-api` path already denies those routes and therefore does not depend on the flag.
- `GET /api/active-engine/diagnostics/scan` is both admin/owner-gated and on `dt-api`'s denylist because it performs an on-demand universe scan and moves diagnostic counters. It is not silently opened. Before the flag is cleared, all ten identities receive the explicit usage question; a real dependency becomes a separately reviewed least-privilege decision, not a reason to retain admin.
- The laptop key is one physical key serving eight named local identities and three server accounts. A cutover error can block every local session at once, so replacement is add → prove → cold-start prove → remove server authorizations → retire the old private key and bounded copies, never an in-place irreversible edit.
- Helsinki's password-auth change affects the reviewer/comms host, not DawnTrader's app runtime. fail2ban changes network filtering on both hosts and therefore needs a self-ban/allow control and a rollback path on each host.

## 3. Mandatory provenance read

**Corpora actually searched:** `BATCH_CATALOG.md`; all batch completion reports; `RUNNING_ISSUES.md` (`#353`, `#924`, `#1022`, `#1092`); existing scope/pre-audit files for `B-NEW-41`, `B-CREDENTIALS-PRIVATE-REPO` and `B-SEC-HARDEN`; `git log -S` without a path limit for the relevant symbols, followed by reads of the introducing commits; current live SSH/key/service state on both hosts. No bridge/canonical fallback was needed for the app components because the introducing commits were recoverable. The laptop key and fail2ban have no introducing repo commit; those rows are marked accordingly.

| component / behavior | original intent, quoted verbatim | disposition |
|---|---|---|
| `requireAdmin` and admin user management | `7378c29c6`: **“Implement an admin panel for user management, disable public registration, and add role-based access control.”** | **(2) relevant but needs updating to today's intent.** Admin remains valid for Kyle's owner account; it is removed from the shared crew row. |
| permission matrix and role-bearing tokens | `6bb3b4632`: **“Integrate a new permission cache service, update JWT tokens to include user roles and permissions, and enhance trading state synchronization mechanisms across the system.”** | **(2) relevant but needs updating to today's intent.** The crew row remains editor; the separate admin boolean is cleared. No claim is made that the editor matrix itself enforces every route. |
| active-engine diagnostic scan | `74d841305`: **“Introduce a read-only diagnostic endpoint for PaperSim to scan the Kraken universe, and enhance the system to report separate live and paper trading engine statuses.”** | **(1) still relevant and correct.** Its admin/owner gate remains. This batch checks usage; it does not weaken the gate or mislabel the side-effecting scan as a passive read. |
| Langston/Coltrane browser-session tool | `952ad94ac`: **“Kyle: give the access to all of them, and stop discussing it. Done. The four CC sessions already browse staging through his own Chrome; the two who could not are the headless pair, and both now can.”** The same commit says: **“Each agent still gets its OWN credential file … and its OWN session file - what is shared is the CODE, never the state.”** | **(2) relevant but needs updating to today's intent.** Both browsers keep access, but as editor/non-admin; Codex counterparts are added to the verification matrix even though they share the four local folders. |
| server-held crew read path | `bd698603a`: **“dt-api: one authenticated call to the staging API as the dtapi account”** and **“one mint over the dtmint forced-command key writes both agents' states; --check moves to GET /api/settings …; no password on Helsinki.”** | **(1) still relevant and correct.** It is the positive path all ten identities must retain; no credential is moved back to a session. |
| staging SSH password-off posture | `1f6963998` subject, verbatim: **“B-SEC-HARDEN #353: staging SSH password-off + ufw firewall done+verified (feeds untouched)”**. `RUNNING_ISSUES #353` records the lockout-safe key proof and reload-not-restart procedure. | **(1) still relevant and correct.** This batch keeps and re-verifies it; it does not rewrite a working control. |
| Helsinki SSH password posture | No introducing repo commit was found for the live `PasswordAuthentication yes` state. Kyle's alert supplies the current directive verbatim: **“agent server: PasswordAuthentication off”**. Current effective state and locked-account census are live-measured. | **(2) relevant but needs updating to today's intent; INFERRED-FROM-LIVE-STATE for the old intent.** The new intent is explicit and approved. |
| shared laptop key | No introducing repo commit/fingerprint record was recovered. Live evidence binds its fingerprint to Kyle's laptop and three unrestricted authorized-key entries; `AGENTS.md` says the Windows key is used automatically by the sessions. | **(2) relevant but needs updating to today's intent; INFERRED-FROM-LIVE-USE.** Replace with a labelled, passphrase-protected key after proving the new path. |
| Windows OpenSSH agent | No project provenance: present, disabled OS component. Its general purpose is inferred from the installed component and its `ssh-add` client, not asserted as repo history. | **(3) disconnected and should be RECONNECTED; INFERRED-FROM-LIVE-STATE.** It becomes the one key-holder for both PowerShell and Git Bash callers. |
| fail2ban SSH jail | No existing project component or introducing commit; both boxes report the binary absent. Kyle's alert supplies the directive verbatim: **“fail2ban on both”**. | **(3) disconnected and should be RECONNECTED/introduced.** Its scope is SSH attack throttling only, with a proven positive trigger and a non-banned crew control. |

## 4. Objectives and verification criteria

### OBJ-1 — Remove administrator authority from the shared crew app account

**Change:** use a reviewed, single-row, transactional database operation executed under an existing privileged path to set `is_admin = false` only where `username = 'testuser123'`; assert exactly one row changed and record the before/after role and admin flag without printing any credential.

**Verification:**

1. Database read returns `testuser123|editor|false`; the two other named rows are byte-for-byte unchanged in `(username, role, is_admin)`.
2. A current crew token still gets 200 from `GET /api/settings`; no-token control gets 401.
3. The same crew token gets 403 from `GET /api/admin/users`; Kyle's owner session remains the positive admin control without any session typing or seeing his password.
4. Both stored browser sessions pass their existing `--check`; a fresh browser context is still sent to login.
5. `dt-api` keeps refusing account/user/mode/kill-switch paths and keeps serving its sanctioned read control.
6. All ten identities receive a named route-use disposition before the flag changes. A direct reply is recorded where one exists; a non-reply is not converted into a reply, and instead requires explicit evidence for that identity's actual access plane and governing policy showing whether the privilege removal can take away a sanctioned capability. Any reported or structurally possible sanctioned use of the diagnostic scan is resolved through a separately reviewed least-privilege path or a documented no-longer-needed verdict before the flag changes.
7. Settings → Users loss for the two headless browser sessions is recorded as intended, not a regression; the four Claude sessions' separate Kyle-Chrome path is not confused with the crew login, and Codex does not receive a password or browser exception.

### OBJ-2 — Replace the shared laptop key with an encrypted, labelled key held once

**Change:** prepare Windows OpenSSH agent and a governed Git-Bash handoff to the Windows client; Kyle enters the new key passphrase privately. Step 2 first re-derives the complete effective authorization population from `AuthorizedKeysFile`, `AuthorizedKeysCommand`, included configuration and every applicable `Match` context, and inventories every governed Windows caller/wrapper or profile that selects an SSH binary or identity. Add the new labelled public key beside the old key on the resulting exact accounts, prove it from every caller and all required session lanes, complete the mandatory cold-start proof, then remove the old fingerprint from the complete server population and retire `C:\Users\kyleg\.ssh\id_ed25519` plus any bounded discovered copies. Do not re-encrypt or delete the only working key in place.

**Verification:**

1. Before unlock, the new private key refuses unattended use; after Kyle's one private unlock, `ssh-add -l` shows the new fingerprint and no command line, file or repo contains the passphrase.
2. PowerShell and Git Bash both reach staging root, staging deploy and Helsinki root through the same agent-held new fingerprint. Git Bash no longer selects a client that bypasses the Windows key-holder. Every governed caller/wrapper found by the Step-2 census is exercised through its real entry point, and server authentication logs prove the new fingerprint—not merely some accepted key—was used for each path.
3. Each of the eight local identities has a named check record: OLD/NEW/ANALYST/Infra Claude and OLD/NEW/ANALYST/INFRA Codex. Because they share one Windows account, the record explicitly distinguishes identity coverage from credential independence.
4. Langston and Coltrane's dedicated access paths still work and do not resolve to the shared laptop fingerprint.
5. After removal, a fresh effective-configuration and account/file census returns zero old-fingerprint authorizations across every resolved key file or command source, while the new line carries an unambiguous `kyle-dawntrader-laptop` label. Positive control: every intended destination still contains and accepts the new fingerprint.
6. A real agent/service cold start and user logoff/logon boundary prove the passphrase-protected key is unavailable before Kyle unlocks it once, then available to every governed caller after that one private unlock. This check is mandatory before old-key removal; it cannot be deferred to Observation.
7. Only after items 1-6 pass, the empty-passphrase private key at `C:\Users\kyleg\.ssh\id_ed25519`, its public mate and any bounded discovered private-key copies are retired from disk. A final fingerprint/copy census proves absence, with the new private key and new accepted fingerprint as positive controls.

### OBJ-3 — Disable Helsinki password authentication and install SSH attack throttling on both boxes

**Change:** add a repo-canonical SSH hardening drop-in for Helsinki and repo-canonical fail2ban SSH-jail configuration for both boxes. Re-enumerate included configuration and all `Match` blocks first. Validate syntax and every required user/host/source evaluation before reload. Install/reload one host at a time, with a second proven key session held open until a fresh login succeeds.

**Verification:**

1. `sshd -t` succeeds on both hosts. Bare `sshd -T` reports `passwordauthentication no`, `kbdinteractiveauthentication no`, `pubkeyauthentication yes`, and each required account/source plane is separately evaluated with `sshd -T -C user=…,host=…,addr=…` after a complete `Match`-block census. Every contextual result is password-off and key-on; root remains key-only.
2. Fresh key logins succeed for every required plane: the eight-session laptop plane, Langston's dedicated path, Coltrane's local/browser services that depend on the host, the staging→Helsinki alert path and the Helsinki→staging mint/review paths.
3. A deliberately invalid password attempt is refused by SSH, while a known key login succeeds. No valid password is created or tested.
4. fail2ban is installed, enabled and active on both hosts with the production `sshd` jail active. A bounded sequence of real failed SSH attempts from a disposable source drives that exact jail, the source appears in `fail2ban-client status sshd` and the host's enforcement state, and a known crew source remains unbanned. The test must not risk banning Kyle's only current path.
5. The disposable source is explicitly unbanned, the ban list is empty of required crew sources, and fresh key access is re-proved after the unban and after a configuration reload. Rollback commands and an out-of-band recovery path are recorded before the first live change.
6. The retained pre-change log population is recorded honestly as 2026-09-13 through 2026-10-14: 0 accepted-password logins with accepted-public-key positive controls, not “zero ever.”

## 5. Review, sequence and stop conditions

1. Coltrane reviews **three independent Step-1 verdicts**, one for each objective, at the pushed ref. Approval of one does not approve the others.
2. Step 2 audits lockout mechanics, package/config provenance, source allow/ignore rules, rollback, and the ten-identity test matrix before any live write.
3. OBJ-2 prepares the replacement key and key-holder before OBJ-3 changes Helsinki authentication. The old key stays installed until the new key passes.
4. OBJ-1 may execute independently once its ten-identity dependency check and its own review gate pass.
5. Any unexplained lost access, a failed positive control, or inability to keep a recovery session open is a hard stop and rollback, not an accepted residual.
6. The live alert resolves only with a pushed commit covering all three reviewed gates and their evidence.

## 6. Step-1 disposition

The three approved access decisions form one bounded sub-batch because they share the same ten-identity test matrix and lockout risk, but they remain separately reviewable. This avoids reopening completed `B-CREDENTIALS-PRIVATE-REPO` OBJ-1 and avoids pretending that the much larger `B-USER-RESOLUTION-PIN` or `B-SEC-HARDEN` parent work has started or closed.
