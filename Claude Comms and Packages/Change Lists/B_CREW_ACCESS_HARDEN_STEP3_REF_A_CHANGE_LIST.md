# B-CREW-ACCESS-HARDEN — Step 3 Ref A change list

## Mandatory Step-4 dispatch fields

**i. DECLARED CHANGE-CLASS:** `sub_batch`

**ii. SUB-BATCH DOCUMENT SET, ROW BY ROW:**

| document-set row | status at Ref A |
|---|---|
| batch `SCOPE` | **present** — `Claude Comms and Packages/Scope Files/B_CREW_ACCESS_HARDEN_SCOPE.md` |
| batch `PRE_AUDIT` | **present** — `Claude Comms and Packages/Scope Files/B_CREW_ACCESS_HARDEN_PRE_AUDIT.md` |
| `COMPLETION_REPORT` | **absent** — Step 11 deliverable; Ref A is an internal Step-3/4 source boundary, not batch completion |
| `BATCH_CATALOG.md` | **absent from this ref's change** — required Step-10 close update |
| `PHASE_HISTORY.md` | **absent from this ref's change** — required Step-10 close update |
| `SYSTEM_MANUAL.md` | **judged N/A for Ref A** — no trading architecture, strategy, regime, filter, signal-pipeline or quantitative-math behavior changes |
| `SYSTEM_IMPACT_MAP.md` | **absent from this ref's change** — applicable Step-10 update because the laptop access component and server controls are new |
| `CHANGES_AND_FIXES.md` | **absent from this ref's change** — applicability will be recorded in the complete Step-10 ledger after live outcomes are known |
| `RUNNING_ISSUES.md` | **present at the ref** — existing `#1092` and `#924` govern this sub-batch; Ref A does not change their disposition |
| `POST_AUDIT_ROADMAP.md` | **judged N/A for Ref A** — no phase-level roadmap decision changes |
| `DELETED_COMPONENTS_LOG.md` | **judged N/A for Ref A** — no component is removed |
| `ADJUSTMENT_FRAMEWORK.md` | **judged N/A for Ref A** — no governed trading parameter changes |
| `PHASE_19_PLAN.md` | **judged N/A** — this batch is not `P19-*` and has no in-flight row there |
| active plan `SPRINT_TO_LIVE_PLAN.md` | **present at the ref** — the batch has its active pre-sprint row; close status waits for Step 10 |
| shared and Infra memory files | **present at the ref** — batch position is recorded; final step position waits for the step boundary |
| four session task lists | **absent from this ref's change** — Infra's required close update and the other three `N/A — not mine` verdicts wait for Step 10 |
| Langston memory | **absent from this ref's change** — required Step-10 close update after the finished outcome is known |

**iii. STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_CREW_ACCESS_HARDEN_PRE_AUDIT.md` at approved ref `47aa50f25fe8a0c1c0a7da18d33510f2dfe348e5`.

**Review target:** the passive dashboard prerequisite and dormant implementation assets only. No database value, server authorization, private key, Windows service/task/profile, installed wrapper, SSH server setting, package, jail, firewall state or governed caller source is changed by this ref.

**Issues:** `#1092`, `#924`

## Dashboard prerequisite

- `client/src/components/trading/watchlist.tsx`
  - replaces the administrator-only on-demand scan call with the existing passive latest-scan read;
  - unwraps the route's `{ ok, data }` response and anchors `nextScanInMs` to the successful fetch time;
  - retains the visible one-second countdown without starting scanner work.
- `client/src/components/trading/watchlist.test.tsx`
  - mounts the real Watchlist under React Query;
  - supplies the passive response, proves the displayed countdown decreases, requires the passive URL and rejects any on-demand scan URL.
- `vitest.config.ts`, `package.json`, `package-lock.json`
  - add client test discovery, the client path alias and the pinned DOM test environment.

## Dormant Windows key-holder source

- `comms-infra/laptop/ssh-keyholder/ssh_keyholder.py`
- `comms-infra/laptop/ssh-keyholder/dt-ssh-keyholder.py`
- `comms-infra/laptop/ssh-keyholder/config.example.json`
- `comms-infra/laptop/ssh-keyholder/install.ps1`
- `comms-infra/laptop/ssh-keyholder/rollback.ps1`
- `comms-infra/laptop/ssh-keyholder/capture_caller_processes.ps1`
- `comms-infra/laptop/ssh-keyholder/caller_capture_bindings.json`
- `comms-infra/laptop/ssh-keyholder/seal_caller_evidence.py`
- `comms-infra/laptop/ssh-keyholder/verify_caller_census.py`
- `comms-infra/laptop/ssh-keyholder/test_ssh_keyholder.py`
- `comms-infra/laptop/ssh-keyholder/test_verify_caller_census.py`
- `comms-infra/laptop/ssh-keyholder/README.md`

The lifecycle accepts exactly one configured fingerprint, removes its attributed persistent registry material while requiring current-service memory use to survive, and binds its owner-only marker to the current logon LUID and agent process epoch. Every assertion also requires an empty persistence store and exactly one expected in-memory identity before it can start an absolute Windows OpenSSH client. Lock attempts marker deletion, identity purge and verification, registry purge and verification, and service stop and verification independently; it aggregates failures only after every cleanup attempt and cannot emit `LOCKED` for a partial result.

Eleven deterministic key-holder tests cover current-session success; zero, wrong and multiple identities; stale logon; restarted service; rewritten persistent material; missing attribution; registry removal that destroys memory use; absolute client selection; complete lock cleanup; and injected failure at each lock cleanup stage. Thirty-six census-parser/evidence tests prove comment-only, print/echo, fake-launcher and unrelated strings cannot count as guards; direct, aliased, nested, wildcard-imported, from-imported, assigned, rebound, shadowed, cross-scope, shell-backed or unresolved launchers invalidate a guarded Python, JavaScript or shell file; multiply assigned command names cannot hide an earlier direct launch; shell command boundaries cannot merge away a direct client; task arguments require the exact canonical source and sole action; and duplicate, raw-artifact-tampered, non-descendant, source-changed or binding-substituted evidence is rejected. The census tool fixes the denominator at 32 repository selectors, four installed runtime files and three scheduled task definitions, and will reject unguarded sources during Ref B activation.

## Dormant server-hardening source

- `comms-infra/security/ssh/10-dawntrader-key-only.conf`
- `comms-infra/security/ssh/manage-ssh-hardening.sh`
- `comms-infra/security/ssh/README.md`
- `comms-infra/security/fail2ban/dawntrader-sshd.local`
- `comms-infra/security/fail2ban/manage-fail2ban.sh`
- `comms-infra/security/fail2ban/emit-invalid-ssh-attempts.sh`
- `comms-infra/security/fail2ban/verify-live-ban.sh`
- `comms-infra/security/fail2ban/README.md`

The SSH manager requires two held laptop recovery sessions, saves only the exact replaced drop-in, validates syntax, reloads rather than restarts, and evaluates every required Helsinki account/source context. It accepts both safe canonical root values and requires an active service plus a nonempty port-22 listener attributed to `sshd`. Both server managers parse the peer endpoint column actually emitted by `ss`, with IPv4 and IPv6 self-tests, so the two-session gate cannot silently measure the wrong column. The fail2ban manager pins the audited package version, renders an ignore set containing loopback and the current laptop but not the peer test source, requires a real journal filter-match positive control, and preserves package inventory, exact version, active/enabled states, prior bans and local bytes for rollback. Separate peer-attempt and target-observation tools drive the production jail/firewall proof without a valid password and explicitly unban only the disposable source.

## Coltrane correction round at `db0edf8bf93e035f8e3c8c0338ff5e9d347cc996`

1. **Independent lock cleanup:** every cleanup and its verification now runs even if an earlier operation fails; errors are aggregated and eleven tests inject every failure class.
2. **Transactional Windows install/rollback:** the secured manifest is written outside runtime state before the first runtime mutation; failures automatically invoke the source rollback; success is printed only after the installed lock runs and service, registry, marker and agent state are positively cold.
3. **Real logoff boundary:** a synchronous local Group Policy command runs at both logoff and logon, with synchronous logon policy forced; the scheduled task remains defence in depth. The later disposable proof must use a real sign-out/sign-in and raw client, so an asynchronous race cannot pass.
4. **Concrete caller verifier:** repository guards are parsed as executable calls, installed files must match their sources, task XML must select the exact guarded source, and ten real-entry evidence rows cover all eight logical callers plus direct PowerShell and Git Bash while naming spawned Windows OpenSSH clients.
5. **SSH semantic and listener proof:** both OpenSSH key-only canonical values pass; unsafe root values, an empty listener and a non-`sshd` listener fail; live verify also requires the active production service.
6. **fail2ban recovery and exact rollback:** install requires two held authenticated sessions, supports a pinned downgrade, preserves prior bans without global unban, restores active/enabled state and package inventory, and refuses unequal rollback. The required real install-to-rollback mutation remains deliberately deferred to the separately reviewed live P6 exact-ref gate; running it during Ref A would violate Coltrane's source/proof and live-mutation boundary.

## Coltrane correction round at `edfbd548162a51e9ab67af6de583672e4040d104`

1. **Executable caller proof:** Python is now accepted only when a recognized process-launch API receives a statically resolved argv beginning with the exact key-holder path and ordered `exec --client <client> --` arguments. Shell and JavaScript use the same command-vector rule. Any recognized direct `ssh`, `scp` or `sftp` launch invalidates the file. The exact print decoy and echo-plus-direct-SSH bypasses from review are mutation tests.
2. **Raw capture provenance:** a bounded PowerShell producer observes the full Windows process-start tree for every positive and locked-negative real entry; a separate sealer correlates non-overlapping windows to raw `ssh.service` journal JSON. The verifier SHA-256-binds both raw artifacts, derives client images and accepted fingerprint from them, proves each SSH-family process descends from the invoked entry process, requires unique journal cursors, and rejects a hand-written ten-row summary.
3. **Dependency rollback boundary:** the fail2ban preflight now rejects a simulated version transition for any already-installed dependency before package mutation. The only permitted existing-package transition is `fail2ban` itself, whose exact prior version is captured and restored; self-test covers both the safe new-dependency case and an unsafe dependency upgrade.
4. **Firewall absence proof:** `verify-live-ban.sh` captures the complete nftables ruleset before matching. Its self-test uses a long captured ruleset and requires a present peer to fail the absence condition, eliminating the `nft | grep -q`/SIGPIPE false pass.

Object-level self-review after the round found that shell newlines were initially tokenized as whitespace. The parser now emits an explicit command boundary at every non-continued line, and a guarded line followed by direct `ssh` is a rejecting mutation.

## Coltrane correction round at `3d78604799bb75fae615faf11763d4ea1ace90d0`

1. **Aliased Python launchers:** module aliases, `from subprocess import ...` aliases, wildcard imports, unresolved calls and rebound launcher names are all part of the recognized/fail-closed launch population. Direct or unresolved alias mutations turn the census red.
2. **Exact task action:** the task argument string is parsed with Windows quote/backslash rules. The canonical source must be argument zero exactly and the sole task action must be that Exec; suffix, prefix, additional executable and second-action mutations reject.
3. **Entry-bound raw capture:** the producer no longer accepts arbitrary plan commands. It reads one immutable byte snapshot of the repo-canonical ten-entry binding file, currently inert at Ref A, which Ref B must fill with reviewed source hashes and exact positive/negative command vectors. Those same parsed bytes are sealed and compared byte-for-byte with the reviewed repo source; helper substitution or row relabelling fails.
4. **Added-package rollback:** the common added-package purge runs whether fail2ban was absent or already installed. The mutation self-test drives the same existing-install restoration helper used by rollback for an existing fail2ban version plus one new dependency, then proves the reconstructed package inventory is byte-equal to the captured pre-state.

## Coltrane correction round at `178bfe8f2423e4875da8f4731d0a10d5a319b0b2`

The remaining parser correction fails closed when a recognized module or launcher name is shadowed through a function/class definition, parameter, delete, loop, context-manager, exception target, nested import or module re-alias. A command-name input with multiple bindings is unresolved rather than evaluated from its final value. Coltrane's exact function-shadow decoy and direct-then-guard reassignment mutations are included.

REVIEWER: claim-only · name the settling objects and alternate states for the four correction mechanisms · identified parser-alias, second-task-action, mutable-binding-read and synthetic-package-test risks; each actionable source-level hit was re-derived and corrected, while the real package transaction remains the separately gated P6 proof · re-derived y

## Load-bearing diff snippets

### MODIFIED — dashboard scan source

Before:

```tsx
// Phase 27.F.19b: Fetch diagnostics for nextScanAt
const { data: diagnosticsData } = useQuery<{ nextScanAt?: string }>({
  queryKey: ['/api/active-engine/diagnostics/scan?mode=paper&limit=10&trace=false&strategies=false'],
  staleTime: 10 * 1000,
  refetchInterval: 10 * 1000,
});

if (!diagnosticsData?.nextScanAt) {
  setCountdown('—:—');
  return;
}
```

After:

```tsx
const latestScan = useQuery<LatestScanResponse>({
  queryKey: ['/api/active-engine/diagnostics/scan-latest', 'paper'],
  queryFn: () => apiFetch('/api/active-engine/diagnostics/scan-latest?mode=paper'),
  staleTime: 10 * 1000,
  refetchInterval: 10 * 1000,
});

const nextScanInMs = latestScan.data?.data?.nextScanInMs;
const nextScanAtMs = typeof nextScanInMs === 'number'
  ? (latestScan.dataUpdatedAt || Date.now()) + nextScanInMs
  : null;
```

### NEW — fail-closed key-holder assertion

Before: file absent.

After:

```python
def assert_unlocked(self) -> dict[str, Any]:
    marker = self.backend.read_marker()
    epoch = self.backend.service_epoch()
    expected = {
        "version": 1,
        "fingerprint": self.config.expected_fingerprint,
        "luid": self.backend.current_luid(),
        "agentPid": epoch.pid,
        "agentStartTicks": epoch.start_ticks,
    }
    if marker != expected:
        raise KeyholderError("unlock marker does not match this logon and ssh-agent epoch")
    if self.backend.registry_snapshot():
        raise KeyholderError("Windows ssh-agent has persistent registry material")
    self._expected_only()
    return expected
```

### NEW — key-only server policy

Before: file absent.

After:

```text
# B-CREW-ACCESS-HARDEN — canonical production key-only authentication.
PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitRootLogin prohibit-password
```

### NEW — production SSH ban policy template

Before: file absent.

After:

```ini
[sshd]
enabled = true
backend = systemd
port = ssh
filter = sshd
bantime = 10m
findtime = 10m
maxretry = 5
ignoreip = 127.0.0.1/8 ::1 __LAPTOP_ADDRESS__
```

### MODIFIED — lock cleanup is failure-closed as a whole

Before:

```python
self.backend.remove_marker()
self.backend.purge_identities()
if self.backend.list_fingerprints():
    raise KeyholderError("Windows ssh-agent still holds an identity after purge")
self.backend.purge_registry()
if self.backend.registry_snapshot():
    raise KeyholderError("Windows ssh-agent registry still holds identity material")
self.backend.stop_service()
```

After:

```python
try:
    self.backend.remove_marker()
except Exception as exc:
    errors.append(f"marker removal failed: {exc}")
# Identity, registry and service cleanup each run in their own try block.
if errors:
    raise KeyholderError("lock incomplete: " + "; ".join(errors))
```

### MODIFIED — manifest precedes runtime mutation

Before:

```powershell
Set-Service -Name ssh-agent -StartupType Manual
Register-ScheduledTask -TaskName $taskName -Xml $taskXml -Force | Out-Null
$installState | ConvertTo-Json | Set-Content -LiteralPath $installStatePath
Write-Output "INSTALLED_LOCKED fingerprint=$ExpectedFingerprint"
```

After:

```powershell
[IO.File]::WriteAllText($installStatePath, ($installState | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))
Set-OwnerOnlyAcl $installStatePath $false
try {
    # Files, service, synchronous logon/logoff policy and task are installed here.
    & $python $installedCli lock
    Assert-LockedState
    Write-Output "INSTALLED_LOCKED fingerprint=$ExpectedFingerprint rollback=$installStatePath"
} catch {
    & $rollbackScript -InstallState $installStatePath -Confirm:$false
}
```

### MODIFIED — listener check discriminates absence

Before:

```bash
ss -ltnp '( sport = :22 )'
[[ $(effective_value root "$LAPTOP_ADDRESS" permitrootlogin) == prohibit-password ]]
```

After:

```bash
systemctl is-active --quiet ssh.service
listener=$(ss -H -ltnp '( sport = :22 )')
listener_is_production "$listener" || exit 1
permit_root_is_key_only "$(effective_value root "$LAPTOP_ADDRESS" permitrootlogin)"
```

### MODIFIED — prior bans are reconciled, never globally erased

Before:

```bash
fail2ban-client set sshd unbanip --all
systemctl restart fail2ban.service
```

After:

```bash
comm -13 "$prior" "$current" > "$extra"
comm -23 "$prior" "$current" > "$missing"
while read -r address; do fail2ban-client set sshd unbanip "$address"; done < "$extra"
while read -r address; do fail2ban-client set sshd banip "$address"; done < "$missing"
cmp -s "$prior" "$current"
```

## Continuous verification

- `.github/workflows/ci.yml`
  - runs the key-holder mutation tests and parses every new shell tool inside the existing Test Suite job.

Local evidence before dispatch:

- Watchlist mounted test: 1/1 passed.
- Key-holder tests: 11/11 passed.
- Caller-census parser/evidence tests: 36/36 passed.
- Caller census inventory: 39/39 concrete runtime objects present and hash-consistent (32 repository selectors, four installed files, three task definitions); guarded count remains intentionally 0 at inert Ref A.
- TypeScript baseline: 337 existing errors over the whole project, 0 new errors.
- Production build: passed.
- SSH and fail2ban manager syntax plus mutation self-tests: passed.
- Two PowerShell tools: parser checks passed.

## Sequencing boundary

Coltrane ruled on 2026-10-14 that Ref A must remain dormant and leave all 39 governed runtime objects plus both direct-command classes unchanged. After exact-ref review, only a disposable encrypted key authorized nowhere may exercise the holder in isolation; the captured service, registry, marker and agent state must be restored afterward. Ref B will bind the exact production fingerprint and contain the complete coherent caller rewiring; it must be reviewed before checkout into any active laptop lane because checkout in this Infra folder is activation.
