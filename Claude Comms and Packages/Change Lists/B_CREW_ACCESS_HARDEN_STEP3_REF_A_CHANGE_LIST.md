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
- `comms-infra/laptop/ssh-keyholder/verify_caller_census.py`
- `comms-infra/laptop/ssh-keyholder/test_ssh_keyholder.py`
- `comms-infra/laptop/ssh-keyholder/README.md`

The lifecycle accepts exactly one configured fingerprint, removes its attributed persistent registry material while requiring current-service memory use to survive, and binds its owner-only marker to the current logon LUID and agent process epoch. Every assertion also requires an empty persistence store and exactly one expected in-memory identity before it can start an absolute Windows OpenSSH client. Lock deletes the marker first, purges identity and registry state, then stops the Manual service.

Ten deterministic tests cover current-session success; zero, wrong and multiple identities; stale logon; restarted service; rewritten persistent material; missing attribution; registry removal that destroys memory use; absolute client selection; and complete lock cleanup. The census tool fixes the denominator at 32 repository selectors, four installed runtime files and three scheduled task definitions, and will reject unguarded sources during Ref B activation.

## Dormant server-hardening source

- `comms-infra/security/ssh/10-dawntrader-key-only.conf`
- `comms-infra/security/ssh/manage-ssh-hardening.sh`
- `comms-infra/security/ssh/README.md`
- `comms-infra/security/fail2ban/dawntrader-sshd.local`
- `comms-infra/security/fail2ban/manage-fail2ban.sh`
- `comms-infra/security/fail2ban/emit-invalid-ssh-attempts.sh`
- `comms-infra/security/fail2ban/verify-live-ban.sh`
- `comms-infra/security/fail2ban/README.md`

The SSH manager requires two held laptop recovery sessions, saves only the exact replaced drop-in, validates syntax, reloads rather than restarts, and evaluates every required Helsinki account/source context. The fail2ban manager pins the audited package version, renders an ignore set containing loopback and the current laptop but not the peer test source, requires a real journal filter-match positive control, and preserves exact rollback state. Separate peer-attempt and target-observation tools drive the production jail/firewall proof without a valid password and explicitly unban the disposable source.

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

## Continuous verification

- `.github/workflows/ci.yml`
  - runs the key-holder mutation tests and parses every new shell tool inside the existing Test Suite job.

Local evidence before dispatch:

- Watchlist mounted test: 1/1 passed.
- Key-holder tests: 10/10 passed.
- TypeScript baseline: 337 existing errors over the whole project, 0 new errors.
- Production build: passed.
- Four server shell tools: syntax checks passed.
- Two PowerShell tools: parser checks passed.

## Sequencing boundary

Coltrane ruled on 2026-10-14 that Ref A must remain dormant and leave all 39 governed runtime objects plus both direct-command classes unchanged. After exact-ref review, only a disposable encrypted key authorized nowhere may exercise the holder in isolation; the captured service, registry, marker and agent state must be restored afterward. Ref B will bind the exact production fingerprint and contain the complete coherent caller rewiring; it must be reviewed before checkout into any active laptop lane because checkout in this Infra folder is activation.
