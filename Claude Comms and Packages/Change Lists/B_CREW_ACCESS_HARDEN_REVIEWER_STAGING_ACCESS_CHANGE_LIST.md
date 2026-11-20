# B-CREW-ACCESS-HARDEN — reviewer staging-access parity correction

**Change class:** `sub_batch` (correction inside the active access-hardening batch)

**Review boundary:** repository records and a dormant Helsinki verifier only. The working
Coltrane key and staging authorization were created by ANALYST Codex to unblock an active
Step-8 review before this correction. This ref does not change either server, either private
key, the application, the database, or any running service. The verifier must be reviewed
before installation.

## Why this correction exists

B-CODEX-FAILOVER made Coltrane the Codex-shift reviewer but omitted Langston-equivalent
database/log access. B-XSTOCK-BAR-AVAILABILITY Step 8 exposed the omission: Coltrane could
read the exact ref and evidence package but could not independently run the staging checks.
ANALYST Codex restored the immediate path with a distinct Coltrane key restricted to the
Helsinki source address. This change makes that capability reviewable and durable.

## Files

- `comms-infra/security/reviewer-staging-access/reviewer_staging_access.py`
  - binds Langston and Coltrane to separate expected fingerprints, key paths and labels;
  - checks local owners and modes, derives each private key's public fingerprint without
    printing key material, and connects with only the named key;
  - executes the same reviewed source from standard input on staging, avoiding a second
    installed remote copy;
  - resolves the effective staging SSH configuration, rejects command/CA and `cert-authority`
    sources, and requires exactly one matching key across every configured authorization file
    with the Helsinki-only restriction and expected label;
  - forbids a sidecar certificate, passes `CertificateFile=none` in both SSH paths, and binds
    the accepted trace to the raw ED25519 key, expected path and fingerprint;
  - requires remote identity `deploy`, an actual byte read from each current log, and a read-only
    application-table database positive control without putting the database address in process
    arguments;
  - generates a fresh wrong key for each actor and requires an explicit public-key denial trace
    with every non-public-key authentication method disabled;
  - includes twenty positive/mutation checks covering authorization parsing, cross-file
    duplicates, alternate SSH authorization sources, raw-key trace binding, a real signed
    sidecar certificate plus unrestricted CA entry, explicit denial, authenticated remote
    failure and transport failure.
- `comms-infra/security/reviewer-staging-access/README.md` — install, verification, recovery,
  fingerprints, backup provenance and the full-`deploy` residual.
- `.github/workflows/ci.yml` — runs the twenty-check self-test in the existing access-hardening
  test step.
- `comms-infra/systemd/reviewer-staging-access.{service,timer}` — daily live parity check with
  the existing scheduled-job failure page; dormant until exact-ref review and installation.
- `comms-infra/tools/verify-agent-artifacts.py` — adds the installed verifier to the existing
  repository-versus-Helsinki hash check so installation drift is visible.
- `CLAUDE.md`, `comms-infra/AGENT_AUTHORING_GUIDE.md`,
  `comms-infra/codex/README-browser.md`, `comms-infra/codex/coltrane-size-watch`, and
  `comms-infra/systemd/README.md` — replace the one-reviewer or no-Coltrane statements with
  the two-reviewer boundary and install map.
- `B_CODEX_FAILOVER_SCOPE.md` and `B_CODEX_FAILOVER_COMPLETION_REPORT.md` — preserve the
  post-close omission and correction without rewriting the original switch verdict.
- `B_CREW_ACCESS_HARDEN_SCOPE.md` — records Coltrane's distinct staging key in the active
  ten-identity access population.

## Live evidence before dispatch

- Langston key fingerprint matched `SHA256:gvtY9j7vBwXruVXaGNLhot/lWac/zVt3omObdSTHIQs`.
- Coltrane key fingerprint matched `SHA256:jbHGXwI7aVjXF/l/cizDWWmmdElO0Roy5ngQYPxUD1c`.
- Each fingerprint occurred exactly once across staging's effective deploy authorization-file
  population with `from="204.168.141.77"` and its own expected label; command and CA sources
  were disabled in the effective configuration, no authorization file contained a
  `cert-authority` entry, and neither reviewer key had a sidecar certificate.
- The new verifier ran from a private temporary Helsinki directory and, for both actors,
  independently bound the accepted fingerprint, returned remote identity `deploy`, read a
  byte from both current logs, read the `users` application table under a read-only database
  transaction, and returned an explicit public-key denial trace for a fresh wrong key. The
  temporary directory was removed by the same command.
- The twenty-check self-test passed locally and on Helsinki, including a real signed
  certificate positive control whose raw key and certificate returned the same fingerprint.

## Honest boundary

The verifier proves the currently intended review path, not least privilege. Both keys land
as the application-owning `deploy` Unix account, which can do more than read evidence.
`RUNNING_ISSUES #110` already owns the ForceCommand restriction; this correction names that
residual instead of calling the path structurally read-only. It also does not rotate, copy,
or escrow either private key. Distinct key fingerprints prove credential separation, not
failure isolation: both reviewers still depend on Helsinki, staging's `deploy` account and
the same database/log surfaces.

REVIEWER: claim-only · which objects settle whether the verifier proves two independent,
source-restricted staging review paths without exposing credentials, and what alternate
states fit those objects? · HIT — accepted-key trace, real log-byte read, application-table
read-only database control, credential-bearing argv, wrong-key fallback, installed-source
drift and one-time-proof staleness needed stronger discriminators; corrected with explicit
publickey-only traces, byte reads, URI-to-libpq environment translation, a real read-only
table query, per-actor wrong-key controls, same-source remote execution and a daily failing
timer. Distinct keys are now stated as credential separation rather than failure isolation;
installed-hash proof remains an installation condition after review · re-derived y

## Coltrane review round 1

At exact ref `88855908d4880f2b03f0334065a79af4b66812b7`, Coltrane found two alternate
states that the first verifier admitted:

1. The expected restricted key could also exist unrestricted in another effective
   `AuthorizedKeysFile` or `AuthorizedKeysCommand` source.
2. Any nonzero wrong-key SSH result was labelled a refusal, including a successful
   authentication followed by a failing remote command or a transport failure.

The correction now derives the effective per-connection SSH authorization configuration,
requires every authorization source to be enumerable, searches every configured file as one
population, and rejects command/CA sources. The wrong-key control now requires exit 255 plus
the explicit public-key denial trace and rejects accepted-authentication and transport-failure
mutations.

## Coltrane review round 2

At exact ref `9784c170f89e31b134467c1fad714d2052115407`, Coltrane demonstrated that
OpenSSH can auto-load `<IdentityFile>-cert.pub`, and that the raw key and its signed certificate
report the same fingerprint. An unrestricted `cert-authority` entry could therefore authenticate
the reviewer while the restricted raw-key line and the prior positive/negative checks stayed
green.

The correction now passes `CertificateFile=none` in the shared positive/negative SSH command,
refuses any sidecar certificate beside either reviewer key, rejects `cert-authority` entries
across the effective authorization-file population, and requires the accepted trace to name the
raw ED25519 type, expected key path and fingerprint. The new mutation generates and signs a real
ED25519 certificate, proves its fingerprint matches the raw key, adds an unrestricted CA entry,
and requires both the authorization and sidecar guards to reject the state.

## Coltrane review round 3

At exact ref `c46b9714572059cc8af979d3862901dfafbce02d`, Coltrane proved that OpenSSH
accepts authorization option keywords case-insensitively while the verifier compared only the
lowercase spelling. An uppercase `CERT-AUTHORITY` entry therefore passed the verifier.

The correction normalizes every authorization option keyword before comparison and adds both
uppercase and mixed-case CA-entry mutations. The effective authorization population is now
refused for every tested spelling OpenSSH treats as the same option.

## Approval and Helsinki installation

Coltrane approved exact ref `efa0531a3c1884571546019dd1c1492151ca1690` after rerunning all
twenty checks and mutation-proving that removing the option normalization makes the uppercase
CA test fail. CI run `38684075114` passed Build, TypeScript Check, Test Suite and Docker Build
individually at that exact ref.

The reviewed verifier was installed on Helsinki at
`/usr/local/sbin/reviewer-staging-access` as `root:root 0755`; its service, daily timer and
standard failure drop-in were installed as `root:root 0644`. The installed verifier SHA-256 is
`d72bb4f630df78cf1ae5e06f3b448c27b2a11e5cd3304f5c93342b53487543b2`, equal to the reviewed
source. The service completed with `Result=success` and `ExecMainStatus=0`; the timer is enabled
and active for 06:20 UTC daily. Its two emitted rows independently reported the expected
Langston and Coltrane fingerprints, distinct restricted authorizations, deploy identity, both
log byte reads, a read-only database read and `wrong_key_control=explicit_publickey_denial`.

The full 18-pair install comparator found this new artifact `MATCH` at mode `755` and its
deliberately mismatched positive control returned `DIFFERS`. It also reported three unrelated,
pre-existing live differences (`coltrane-size-watch` and the two installed copies of
`AGENT_AUTHORING_GUIDE.md`); those are not represented as part of this installation.

## 2026-11-13 — one owed install TRANSFERRED to B-SIZE-WATCH-BREACH-ALARM (Infra Claude)
The `coltrane-size-watch` difference named above (installed `ac244b69…` vs the repo's header-only update) is no longer this batch's to install. `B-SIZE-WATCH-BREACH-ALARM` changed that file and installed it at its reviewed ref `8a2cdefbb594754422fac1b5395d47a7ec8b9e30` (installed blob `ded9da661cb21ae8c5a225febfd8313ed1d2f348`), which carries the header update too. `verify-agent-artifacts.py 8a2cdefbb` now shows it MATCH; the two remaining DIFFERs are the installed copies of `AGENT_AUTHORING_GUIDE.md`, still this batch's. Record: `B_SIZE_WATCH_BREACH_ALARM_CHANGE_LIST.md`, Step 6.

## 2026-11-20 — the daily check refused since 11-17: the psql wrapper (Infra Claude)
**Symptom.** `reviewer-staging-access.service` failed every day from 2026-11-17 06:20Z. The OnFailure page fired on every run — `agent-unit-failure@reviewer-staging-access.service` started and finished at 06:20Z on 11-17, 11-18, 11-19 and 11-20 (Helsinki journal) — and nobody acted on it for four days; the miss was attention, not alerting (Langston F-1). The unit's message was the first 500 characters of `ssh -v` stderr — all debug trace — so the remote refusal never showed.
**Cause (re-derived on staging 2026-11-20).** `B-DB-READ-TOOL` installed a root-owned wrapper at `/usr/local/bin/psql` (2026-11-16 16:46Z). As deploy, `shutil.which("psql")` returns `/usr/local/bin/psql`, and `verify_remote` refused unless it was `/usr/bin/psql`. The probe itself called `/usr/bin/psql` by absolute path, bypassing the wrapper's lock refusal and its `sslmode=require` default (`.env`'s `DATABASE_URL` carries no `sslmode`, so the probe ran libpq `prefer`: a wrong password sent twice).
**Fix.**
1. `STAGING_PSQL = "/usr/local/bin/psql"`; the check requires `which psql` to equal it AND `require_path(STAGING_PSQL, "root", 0o755)` (regular file, one link, not a symlink). Its CONTENT is `dt-install-drift`'s to prove on staging (the wrapper is enrolled there), not this verifier's.
2. The probe runs `STAGING_PSQL` — the positive control now proves what the reviewer's own `psql` does, and inherits the lock refusal and the one-attempt default.
3. `failure_text()` drops `OpenSSH_`/`debugN:` lines and shows the last 500 characters of what remains (stdout if nothing remains); the database refusal now carries the probe's stderr tail.
4. Self-test 20 → 23 checks: the failure text (refusal shown, no trace; stdout fallback) and the probe-uses-wrapper check. Mutants: probe path reverted to `/usr/bin/psql`, the debug filter broken, the `require_path` removed — each REFUSED (exit 2, with its own message).
**Live proof before commit:** the patched `verify-remote` run on staging as deploy for both actors returned `database_read: ok` (langston, coltrane). The Helsinki install and the full service run follow Langston's review.

## 2026-11-20 — F-3: the Helsinki dt-install-drift failures 11-15 → 11-20 05:18Z were my pin miss (Infra Claude)
**What failed.** `dt-install-drift.service` on Helsinki reported `DRIFT` for `/usr/local/bin/dt-deploy-notice` on six daily runs, 11-15 05:17Z through 11-20 05:18Z (one per day, each FAIL with OnFailure; the 11-14 run PASSED). Like F-1, the page fired every day and was not acted on until today.
**Cause.** On 2026-11-15 01:39:54Z I installed `dt-deploy-notice` at `6feb763d2` (the B-DEPLOY-WINDOW-GUARD heartbeat-evidence fix) and did not move its per-file pin in `/var/lib/dt-install-drift/installed.sha`, which still read `831591e7b`. The comparator was right: the installed file was not the pinned copy.
**Evidence the installed file is the reviewed one, not a wrong file.** Installed `sha256 a24b78a65fb5f25c2fb5a7fc1334c550b4779bb4aa9bd037736a8d92f213f593` (Helsinki, `sha256sum` of the installed file) equals `git show 6feb763d2:comms-infra/discord/dt-deploy-notice.py | sha256sum` (object store) — same value. `git log` on that path shows `6feb763d2` as its last change, after the `831591e7b` pin.
**Fix.** Both pins updated 2026-11-20 07:29:42Z (`dt-deploy-notice` → `6feb763d2280`, `dt-install-drift` → `b9ad4f0269fa`, the latter's own pending source change); the 07:30:10Z run PASSED. `/usr/local/sbin/dt-install-drift` mode corrected 755 → 700 (its enrolled mode).
**Lesson carried to the install step:** an install of an enrolled file is not done until its pin is moved in the same sitting.

## 2026-11-20 — F-2: the database positive control now goes through dt-sql (Infra Claude, Langston F-2)
**Why.** The verifier logged in to the staging database every day with its own hand-built probe (it read the connection string, translated it to libpq fields and ran psql). That was a second login path beside `dt-sql`, the one-attempt reader B-DB-READ-TOOL built so that no helper can send the second wrong password that gets this address banned. A daily scheduled login is exactly the kind of caller that should not have its own path.
**What changed** (`comms-infra/security/reviewer-staging-access/reviewer_staging_access.py`):
1. The probe is now `dt-sql -c "select current_user,current_database(),(select count(*) >= 0 from public.users)"`, after `require_path(STAGING_DT_SQL, "root", 0o755)`. The hand-built probe and the `base64` import are gone; the verifier no longer touches the connection string at all.
2. Exit 5 (BUSY: another `dt-sql` call held the lock and **no attempt was made**) is retried up to 3 times, 20 s apart. Nothing else is retried — a refused login (exit 3) or a lock (exit 4) fails the check at once, with the exit's meaning in the refusal.
3. The `psql` wrapper check stays: the reviewer's own `psql` must still resolve to the root-owned `/usr/local/bin/psql`.
4. **Read-only is re-proved by BEHAVIOUR, from inside the session.** `dt-sql` refuses any SQL that names the read-only setting (exit 2, "this SQL names the read-only setting"), so the old `current_setting('transaction_read_only')` read cannot come through it. Instead, after the read, the check sends `create temp table reviewer_ro_probe(a int)` and requires `dt-sql` exit 1 with the server's own refusal text `cannot execute CREATE TABLE in a read-only transaction`. That text names no setting, so `dt-sql`'s guard does not refuse it first; it can only come from the server refusing a write in this session. Anything else (exit 0, meaning a write succeeded, or a different error) fails the check. It is a temp table, so even a broken read-only guard leaves nothing behind when the session ends. Both calls go through one helper, `run_dt_sql`, which carries the BUSY retry. `dt-sql` was not changed.
5. Self-test 23 → 26 checks. Mutants, each judged by exit code plus its FAIL/REFUSED line: probe accepts exit 0; refusal text dropped; probe call removed; probe made a non-temp table; BUSY retry removed; retry on any failure; the `dt-sql` ownership check removed; the wrapper check removed: **8 of 8 KILLED**.

**Install decision (Langston asked for one):** the Helsinki copy is HELD at `d26e6d960` on purpose until this F-2 verdict, then installed at the reviewed sha and the unit re-run. That `reviewer-staging-access` sits in no `dt-install-drift` pin is filed on `#1004` (enrol it, with `P19-B12`).

**Live proof before commit:** the patched `verify-remote` run on staging as deploy, 2026-11-20 ~08:35Z: langston and coltrane each exit 0 with `database_read: ok` and `database_write_refused: ok`; the `dt-sql` log shows the read at exit 0 and the probe at `sql_error`/exit 1, and `dt-sql --status` afterwards "OK — not locked". The Helsinki install and the full service run (each reviewer's own key) follow Langston's review.

### F-2 round 3 — the client ssh timeout now covers the remote worst case (Infra Claude, 2026-11-20, Langston's two-line fix)
**Why.** Round 2 kept the client ssh call at `timeout=60`, while the remote side can legitimately run far longer: each `dt-sql` call that attempts a login is bounded only by `dt-sql`'s own psql timeout (`CALL_TIMEOUT_S = 300`, `comms-infra/staging/dt-sql:69`) plus, if that attempt locks it, the alert subprocess (`timeout=150`, `dt-sql:171`). A client that gives up first kills `dt-sql` mid-attempt, and `dt-sql:34` says a call killed mid-attempt leaves its INTENT behind and LOCKS it `ambiguous` for every caller. A failed daily check is cheap; a locked database reader is not.
**What changed** (same file):
1. The client timeout is DERIVED, not chosen: `REMOTE_BUDGET_S = DT_SQL_CALLS × ((DT_SQL_BUSY_TRIES − 1) × DT_SQL_BUSY_WAIT_S + DT_SQL_CALL_BOUND_S) + REMOTE_OTHER_BOUND_S` with `DT_SQL_CALLS = 2`, `DT_SQL_CALL_BOUND_S = 300 + 150`, `REMOTE_OTHER_BOUND_S = 60`; `CLIENT_SSH_TIMEOUT_S = REMOTE_BUDGET_S + 30`. Worst case 920 s, budget 980 s, client timeout **1010 s**.
2. `DT_SQL_BUSY_WAIT_S` 20 → 5. A `dt-sql` call measured 0.30 s in the B-DB-READ-TOOL log, so 5 s spans many calls; it also keeps the BUSY share of the budget small (2 × 2 × 5 = 20 s).
3. Both bounded calls in `verify_actor` (the live ssh run and the 30 s wrong-key control) now catch `subprocess.TimeoutExpired` and raise `VerificationError`, so a timeout ends as `REFUSED: …` and exit 2, never a traceback.
4. The unit adds no conflicting bound: `reviewer-staging-access.service` is `Type=oneshot` with no `TimeoutStartSec`.
5. Self-test 26 → 28 checks (two new: the timeout derivation, including `DT_SQL_CALLS` equal to the number of `run_dt_sql(` calls in `verify_remote`; and one `except subprocess.TimeoutExpired` per `timeout=` in `verify_actor`). **Count history, corrected:** 23 at `d26e6d960`, 25 at `655efeb3e`, 26 at `8c41ef0da`, 28 now.
**Evidence.** Mutants on Helsinki, each judged by exit code plus its FAIL/REFUSED line, baseline passing: timeout back to 60; ssh `TimeoutExpired` not caught; wrong-key `TimeoutExpired` not caught; call bound set to 20; client timeout 80; `DT_SQL_CALLS = 1`; an extra uncounted `dt-sql` call — **7 of 7 KILLED**. Behaviour through the production entry: `verify_actor` with `subprocess.run` raising `TimeoutExpired` prints `REFUSED: <actor> live verification did not finish within 1010 s (remote budget 980 s)` and exits 2, for langston and coltrane. Scratch dir `/root/f2r3` removed afterwards.
**Not proven yet:** a live `verify-remote` on staging with this file (the remote path changed only in the BUSY wait). It runs at install, after the verdict.
