# B-CREW-ACCESS-HARDEN — Step 3 Ref A change list

**Review target:** the passive dashboard prerequisite and dormant implementation assets only. No database value, server authorization, private key, Windows service/task/profile, installed wrapper, SSH server setting, package, jail, firewall state or governed caller source is changed by this ref.

**Change class:** sub-batch implementation / access hardening

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
