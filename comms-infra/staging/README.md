# comms-infra/staging — the crew login (B-CREDENTIALS-PRIVATE-REPO OBJ-1, #1023)

**What it is:** one authenticated staging API call for every session and Langston, and a signed-in
browser for both agents, **with no password held by any of them.** The password lives in one file
readable only by the `dtapi` account; `dt-api` makes the call; `dt-api mint` hands the agents'
browsers a 7-day token through a forced-command key. Design: scope §2.1, pre-audit §2.2 (r4) and
Langston's Step-2 conditions C1–C11 (pre-audit §6). Change list:
`Claude Comms and Packages/Change Lists/B_CREDENTIALS_PRIVATE_REPO_OBJ1_CHANGE_LIST.md`.

⚠️ **An accident guard, not a boundary.** The CC sessions reach staging as root, both agents hold the
minted token, and `deploy` has `NOPASSWD: ALL` until `#1102` (`B-SEC-HARDEN`). Writes are
default-deny (an EMPTY allowlist); reads are default-allow against a denylist built from a census
that followed each handler one level deep (C11).

## How to call it
```
sudo -u dtapi /usr/local/bin/dt-api GET /api/settings                 # as root (a CC session)
sudo -n -u dtapi /usr/local/bin/dt-api GET /api/settings              # as deploy (Langston's `ssh staging`)
sudo -u dtapi /usr/local/bin/dt-api GET --mode live /api/guardrails-v2?mode=live
```
Exit 0 = the app answered 2xx (body on stdout) · 1 = it answered otherwise · 2 = dt-api refused
(nothing sent) · 3 = no working login (nothing sent), or no answer · 5 = PAGE for Infra Claude.
**No write is reachable** (decision 19): trip the kill switch from the website or a root shell.

## Install map
| repo | staging path | mode owner |
|---|---|---|
| `staging/dt-api` | `/usr/local/bin/dt-api` | 0755 root:root |
| `staging/dt-api-set-crew-password` | `/usr/local/sbin/dt-api-set-crew-password` | 0700 root:root |
| `staging/sudoers-dtapi` | `/etc/sudoers.d/dtapi` (**no dot in the name** — sudo skips it) | 0440 root:root |
| `staging/dtmint-authorized_keys` | `/home/dtmint/.ssh/authorized_keys` | 0640 root:dtmint |
| `staging/dt-install-drift` | `/usr/local/sbin/dt-install-drift` | 0700 root:root |
| `staging/dt-unit-failure-alert` | `/usr/local/bin/dt-unit-failure-alert` | 0755 root:root |
| `staging/systemd/dt-install-drift.{service,timer}`, `dt-unit-failure@.service` | `/etc/systemd/system/` | 0644 |
| `staging/systemd/dt-install-drift.service.d/onfailure.conf` | `/etc/systemd/system/dt-install-drift.service.d/` | 0644 |
| *(no file)* | `/etc/dt-api/` 0750 root:dtapi · `/var/lib/dt-api/` 0700 dtapi:dtapi · `/home/dtmint/` 0750 dtmint:dtmint · `/home/dtmint/.ssh/` 0750 root:dtmint | |
| *(the setter writes it)* | `/etc/dt-api/staging-api.env` | 0600 dtapi:dtapi |
| *(the install writes it, both boxes)* | `/var/lib/dt-install-drift/installed.sha` — the reviewed sha installed from | 0644 root, dir 0755 |

| repo | Helsinki path | mode owner |
|---|---|---|
| `agent-staging-session` | `/usr/local/bin/agent-staging-session` | 0750 root:root |
| `systemd/agent-staging-session.{service,timer}` | `/etc/systemd/system/` | 0644 |
| `systemd/onfailure.conf` (drop-in, twice) | `/etc/systemd/system/agent-staging-session.service.d/onfailure.conf` and `/etc/systemd/system/dt-install-drift.service.d/onfailure.conf` | 0644 |
| `staging/dt-install-drift` + `staging/systemd/dt-install-drift.{service,timer}` | as on staging | as on staging |
| `systemd/agent-unit-failure@.service`, `tools/agent-unit-failure-alert` (the paging chain, already installed) | `/etc/systemd/system/`, `/usr/local/bin/` | 0644, 0755 |
| *(no file)* | `/root/.ssh/dtmint_ed25519` (the mint key; its public half is `staging/dtmint-authorized_keys`) | 0600 root:root |
| *(no file)* | root's `known_hosts` must hold staging's host key (the mint uses `StrictHostKeyChecking=yes`) | |

`dt-install-drift` checks exactly these, **daily**, on each box, against their blobs **at the recorded
installed sha** (so a change in review is not drift): staging reads the governance checker's clone
(fetched every 30 min), Helsinki the backup mirror. It also checks the units are loaded, reloaded,
carry only the expected drop-ins and the timers are enabled and active, that no other sudoers file
names dtapi/dtmint, that dtmint has no `authorized_keys2`, the accounts' shells and password
fields, the mint key's pairing and root's known_hosts. A committed change not yet installed is
PENDING, and fails once it is over a week old.
**Order: install → `daemon-reload` → run the setter → write `installed.sha` (0644 root) → `systemctl enable --now` the timer → run `dt-install-drift`
by hand: its PASS is the install's verification** (before the setter the env file is MISSING).

## Accounts
- `dtapi` — system account, shell `/usr/sbin/nologin` (sudo runs dt-api directly, never a shell).
- `dtmint` — shell **`/bin/sh`** (a `nologin` shell would break the forced command), password
  field `*` (no password, not locked — so pubkey login is allowed). Its `.ssh` is **root-owned**, so
  it cannot edit its own forced command. Staging's sshd has no `AllowUsers`/`AllowGroups`/`Match`
  (`sshd -T -C user=dtmint,addr=204.168.141.77`, measured 2026-09-29).

## Setting the password (the setter)
The operator — a root CC session — makes a **run-only** PGPASSFILE (root 0600, outside /home) from
the app's `DATABASE_URL` without printing it, then runs the setter, which reads it and REMOVES it:
```
PGPASSFILE=/root/dtapi-pgpass-<run> /usr/local/sbin/dt-api-set-crew-password
```
It refuses if the shared login ledger records any loopback login in the last 900 s (the limiter's
window is FIXED per key, 5 attempts), or if a psql from an earlier run is still connected. A killed
run leaves a marker; **re-running reconciles it** (no earlier than 900 s after the killed run's own
login). It ignores SIGHUP (a dropped ssh does not stop it), turns SIGTERM/SIGINT into a restore,
and logs every step to `/var/lib/dt-api-setter/run.log`. Worst case it runs ~20 minutes (a wait of
up to 900 s for the login bucket before step (6)). A second run refused because the first holds the
lock does NOT remove the file it was given — remove your own copy. Steps and failure rules: its header.

## Pages
- `dt-api` exit 5 writes `/var/lib/dt-api/page.json`. **While it exists dt-api makes NO login** (calls
  on a still-good cached token continue). The daily `dt-install-drift` FAILS while it exists →
  `dt-unit-failure@` → a system alert naming Infra Claude, deduped per failure CLASS (a new page kind
  is a new alert). **Fix the cause, then remove page.json; the setter removes it when it succeeds.**
- The agents' mint pages through Helsinki's `agent-unit-failure@` (crew channel) when it fails.

## Tests (run on Helsinki as root)
`tests/dt_api_tests.py` · `tests/dt_api_mutations.py` · `tests/setter_tests.py` ·
`tests/setter_mutations.py` · `tests/drift_tests.py` · `tests/staging_session_tests.py` · `tests/drift_mutations.py`. Each runs a copy of the committed file that
differs ONLY in its CONSTANTS block (asserted). The mutation runners refuse to report unless the
unmutated suite passes, and count a crash as a problem, never as a kill.
`tests/c10_express_variants.js` runs on staging (as deploy) against the installed Express.
