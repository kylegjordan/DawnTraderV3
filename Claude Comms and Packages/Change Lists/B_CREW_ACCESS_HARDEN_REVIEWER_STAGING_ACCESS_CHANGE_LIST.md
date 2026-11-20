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

### F-2 round 4 — Langston's C-1 and C-2 (Infra Claude, 2026-11-20)
**Why.** Round 3 came back CHANGES-NEEDED, narrow. **C-1:** the self-test checked the remote worst case against the budget but never checked that the client timeout exceeds the budget, so `CLIENT_SSH_TIMEOUT_S = REMOTE_BUDGET_S - 30` survived it. **C-2 (folded in this round, at his preference):** `DT_SQL_CALL_BOUND_S = 300 + 150` is a copy of two numbers that live in `dt-sql`; if `dt-sql` raises either, this check's ssh timeout silently falls below dt-sql's real bound and can kill it mid-attempt, which locks it.
**What changed** (same file):
1. **C-1.** `self_test` now raises `client ssh timeout N s does not exceed the remote budget M s` when `CLIENT_SSH_TIMEOUT_S <= REMOTE_BUDGET_S`.
2. **C-2, staging half.** New `parse_dt_sql_bounds(text)`: exactly one line starting `CALL_TIMEOUT_S = ` with an integer, exactly one `def alert(`, and exactly one integer `timeout=` literal in that function's body; anything else refuses (never a default). `verify_remote` reads the installed `/usr/local/bin/dt-sql` right after its ownership check and reports `"dt_sql_bounds": {"call_timeout_s", "alert_timeout_s"}` in its JSON.
3. **C-2, client half.** New `check_dt_sql_bounds(actor, payload)`, called in `verify_actor` straight after the payload is parsed: it refuses unless the report is a dict with exactly those two keys, each a real positive `int` (a bool is refused), and then refuses if `DT_SQL_CALL_BOUND_S < call + alert`, saying the bound must be raised. The client's own timeout stays a constant (it has to be known before the ssh call); what changed is that a staging `dt-sql` that outgrows it now fails the daily check loudly instead of risking a lock.
4. Self-test 28 → 30 checks: the C-2 parser (a good source gives 300/150; non-integer, missing, duplicated `CALL_TIMEOUT_S`, two alert timeouts, a named timeout, and no `alert()` all refuse; `verify_remote` must call the parser on `STAGING_DT_SQL` and report it), and the C-2 client check (`verify_actor` must call it; sum equal to the bound passes; bound + 1, no report, a missing key, a bool and zeros all refuse). C-1 is an added assertion inside the existing derivation check, so it adds no count.
**Evidence.**
- Self-test on Helsinki: `self-test passed: 30 checks`, rc 0.
- Mutants on Helsinki, each judged by a non-zero exit plus its FAIL/REFUSED line, each patch verified to apply exactly once, baseline passing: client = budget − 30 (Langston's survivor); client = budget; client never checks the report; staging omits the report; staging hard-codes 300/150; comparison off by one; parser keeps only the first alert timeout; parser defaults a missing `CALL_TIMEOUT_S`; client accepts a bool; client accepts a missing report — **10 of 10 KILLED**.
- Behaviour through `main()` → `verify_actor` (staging's payload faked, the earlier key checks stubbed to pass), langston: no report → `main()` raises `VerificationError: langston staging did not report dt-sql's call bounds`; report 400 + 150 → raises `… dt-sql on staging can now run 550 s per call, above DT_SQL_CALL_BOUND_S 450 s …`; report 300 + 150 → passes, `main()` rc 0. The harness calls `main()` directly, so a refusal shows as a traceback; the script's own `__main__` block turns it into `REFUSED: …` and exit 2.
- The live staging `dt-sql`: `sha256 e56fb089…7c582c` on staging equals `git show origin/migration/aws-supabase:comms-infra/staging/dt-sql | sha256sum`, and `parse_dt_sql_bounds` on the live file returns `{'call_timeout_s': 300, 'alert_timeout_s': 150}`.
**C-3 (his batch item) — DISPOSITION: added to B-CREW-ACCESS-HARDEN, owner Infra Claude, after this F-2 install:** set `TimeoutStartSec` on `reviewer-staging-access.service` above the `--actor all` worst case (two actors run in sequence, about 2,080 s, so about 2,400 s, never below the client bound), and bound the remaining unbounded `subprocess` calls (`ssh-keygen` in `verify_actor`, `private_key_fingerprint`, and the two in `read_root_text_if_exists`). Not in this round.
**Not proven yet:** a live `verify-remote` on staging with this file. It runs at install, after the verdict.

### F-2 round 4 — verdict and install (Infra Claude, 2026-11-20)
**Verdict.** Langston PROCEED at `678131671` (Discord `1573295507818946653`), C-1 and C-2 discharged. He ruled the 10/10 mutant table on reported fact and not load-bearing.
**Install** (his conditions: install at `678131671`; report the first live `verify --actor all` exit and the `dt_sql_bounds` it reported):
- The blob was read on Helsinki from its own mirror (`/srv/dawntrader-backup.git`, as langston) at `678131671c0708a230e2be46bda792d06797835c`. sha256 `50a4ba17…7673623a` equals `git show 678131671:comms-infra/security/reviewer-staging-access/reviewer_staging_access.py | sha256sum` on the laptop. Self-test on that copy passed (30 checks).
- Installed to `/usr/local/sbin/reviewer-staging-access` 755 root:root at 2026-11-20T11:17Z. The previous file (sha256 `8a4d82d4…`, equal to the `d26e6d960` blob) is kept as `/root/reviewer-staging-access.pre-f2r4` for rollback.
- First live run, `systemctl start reviewer-staging-access.service` (`verify --actor all`), 11:17:02Z → 11:17:06Z: **Result=success, ExecMainStatus=0.** Both JSON rows report **`"dt_sql_bounds": {"alert_timeout_s": 150, "call_timeout_s": 300}`**, `database_read` ok, `database_write_refused` ok, `wrong_key_control` `explicit_publickey_denial`, separate fingerprints (langston `SHA256:gvtY9j7v…`, coltrane `SHA256:jbHGXwI7…`). Afterwards `dt-sql --status` on staging read `OK — not locked`. Timer enabled and active; next run 11-21 06:20Z.
- Drift enrolment of this file stays filed on `#1004` (with `P19-B12`), as recorded above. Not done here.

**Carries from the verdict, recorded here as he asked:**
- **C-4 (into C-3's round):** the parser's refusal for a non-integer `CALL_TIMEOUT_S` reports the count of matching lines, not the bad value. Split the count branch from the value branch so each refusal names what it saw.
- **C-5 (invariant, recorded, not checked):** the budget assumes **at most one `alert()` and exactly one `run_psql()` per `dt-sql` invocation**, held today at `dt-sql:333`/`:346` (one `run_psql` site; the three `alert()` sites at `:333`, `:363`, `:366` are mutually exclusive). The parser reads the two literal values, not how many times dt-sql calls them, so a dt-sql change that adds a second call per invocation would not be caught. Carried on C-3's line.
- **C-6 (hypothesis, not established):** `alert()`'s `timeout=150` may not be a hard bound. Its npm child runs under `/usr/bin/timeout -k 10 120` (`dt-sql:73`), but an orphaned grandchild that keeps the stdout pipe open could hold `subprocess.run` past 150 s. To be checked in C-3's round, against the code, before it changes any number.
- **(c) ordering — DECISION: take his free improvement in C-3's round.** Move `check_dt_sql_bounds` to just before the final `print(json.dumps(payload …))`, so a bounds refusal comes after the wrong-key control and that control stays in the evidence. Today, under `--actor all`, an early bounds refusal on langston would also skip coltrane's verification.
**C-3 line (amended):** `TimeoutStartSec` about 2,400 s on the unit; bound the `ssh-keygen` call in `verify_actor`, `private_key_fingerprint`, and the two in `read_root_text_if_exists`; plus C-4, the (c) reorder, and a check of C-6. C-5 rides as a recorded invariant.

### F-2 C-3 round — time limits, C-4, (c), C-6 checked (Infra Claude, 2026-11-20)
**Why.** The C-3 line above: the unit had no `TimeoutStartSec`, four local `subprocess` calls had no bound, and the verdict's C-4, (c) and C-6 rode with it.
**What changed** (`reviewer_staging_access.py`, `comms-infra/systemd/reviewer-staging-access.service`):
1. **New constants.** `LOCAL_TOOL_TIMEOUT_S = 10` (ssh-keygen, sudo test/cat, sshd -T: sub-second local commands), `WRONG_KEY_TIMEOUT_S = 30` (the wrong-key login), `REMOTE_PRE_DT_SQL_S = 30`, `REMOTE_LOGIN_REPLY_S = 30`, `UNIT_TIMEOUT_START_S = 2400`. Derived: `PER_ACTOR_WORST_S = 3 × 10 + 1010 + 30 = 1,070 s`; `UNIT_WORST_CASE_S = 2 actors × 1,070 = 2,140 s` (`verify --actor all` runs them in sequence). `TIMEOUT_NAMES` lists the only three names a `timeout=` may use.
2. **`bounded_run(argv, what, **kwargs)`** — `subprocess.run` with `timeout=LOCAL_TOOL_TIMEOUT_S`; on expiry it raises `VerificationError("<what> did not finish within 10 s")`. It now carries every local call: `fingerprint_public_key`, both calls in `read_root_text_if_exists`, `private_key_fingerprint`, `verify_remote`'s `sshd -T`, and `verify_actor`'s wrong-key `ssh-keygen`. The wrong-key ssh control uses `timeout=WRONG_KEY_TIMEOUT_S`.
3. **`run_dt_sql` stays unbounded, by design.** A client timeout there would kill dt-sql mid-attempt, which is what locks it. Its bound is dt-sql's own (`CALL_TIMEOUT_S` + the alert's), checked by C-2.
4. **Pre-dt-sql gate in `verify_remote`.** It records `started = time.monotonic()` on entry; after `parse_dt_sql_bounds` and before the first `run_dt_sql` it refuses with `pre-database checks took N s, above REMOTE_PRE_DT_SQL_S 30 s: dt-sql was NOT started`. Refusing before dt-sql starts is always safe; that is the only place a remote time check can go without risking a lock. `REMOTE_PRE_DT_SQL_S + REMOTE_LOGIN_REPLY_S <= REMOTE_OTHER_BOUND_S` (30 + 30 ≤ 60), so the 60 s the budget allows around the two calls is now enforced, not assumed.
5. **Unit.** `TimeoutStartSec=2400` on `reviewer-staging-access.service`, above the 2,140 s worst case. At the limit systemd kills the whole unit's cgroup, grandchildren included, and the drop-in's `OnFailure=` pages.
6. **C-4.** The parser's two refusals are split: `expected exactly one CALL_TIMEOUT_S line, found N` for the count, and `CALL_TIMEOUT_S is not an integer literal: '<value>'` for the value (ASCII digits only, so a Unicode digit is refused too).
7. **(c).** `check_dt_sql_bounds(actor, payload)` moved from straight after `json.loads` to after `payload["wrong_key_control"]` is set and just before the JSON print, so a bounds refusal comes after the wrong-key control.
8. **Self-test 30 → 35 checks:** C-4's two messages; the (c) ordering; an AST walk over the module (no `os.system`/`os.popen`, no `subprocess` call other than `run`, `run_dt_sql`'s call has no `timeout=`, every other `subprocess.run` has one, and every `timeout=` names a member of `TIMEOUT_NAMES`); the gate's text and position (after `parse_dt_sql_bounds`, before the first `run_dt_sql`) plus `PRE + LOGIN_REPLY <= REMOTE_OTHER_BOUND_S`; `UNIT_TIMEOUT_START_S > UNIT_WORST_CASE_S`; and the unit file holding exactly `TimeoutStartSec=2400`. The unit is read from the repo-relative path first, then `/etc/systemd/system`; if neither exists the check prints a note and adds no count.
**C-6 — DISPOSITION: no work, withdrawn as a number change, citing `dt-sql:72-73` and `:171` at `origin/migration/aws-supabase`.** `ALERT_NPM` at `:73` runs npm under `/usr/bin/timeout -k 10 120`, and the comment at `:72` states the intent: *"so a wedged npm/node dies with its whole group"*. GNU `timeout` signals its whole process group, so everything in that group holding the pipe is ended by 120 s (TERM) or 130 s (KILL), before `subprocess.run(..., timeout=150)` at `:171`. **Residual, stated:** a process that leaves the group (`setsid`), or ignores TERM and outlives npm, is not reached by that group kill; for it, the bound is the unit's cgroup kill at 2,400 s, not 150. **NOT RE-READ:** that npm's script runner never calls `setsid`.
**C-5 — recorded invariant, unchanged:** one `run_psql()` and at most one `alert()` per dt-sql invocation, held at `dt-sql:333`/`:346`, with the three `alert()` sites `:333`, `:363`, `:366` mutually exclusive. The parser reads values, not call counts.
**Evidence.**
- Self-test: `self-test passed: 35 checks`, rc 0, on the laptop and on Helsinki.
- Mutants, laptop and Helsinki, each patch applied exactly once, baseline passing, judged by a non-zero exit plus a FAIL/REFUSED line: `bounded_run` loses its timeout; `bounded_run` uses a literal 3000; `run_dt_sql` gains a client timeout; the gate removed; the gate weakened ×100; `elapsed` forced to 0; `UNIT_TIMEOUT_START_S` set to 2000; unit file `TimeoutStartSec=2000`; unit file loses `TimeoutStartSec`; C-4 messages re-merged; (c) undone; wrong-key timeout a literal 3000; a `bounded_run` replaced by a raw `subprocess.run`; an `os.system` added; `LOCAL_TOOL_TIMEOUT_S` raised to 200; a `subprocess.Popen` added — **16 of 16 KILLED** on both hosts.
- Behaviour through `verify_remote` itself (every check before the gate stubbed to pass, the clock faked to 0 s at entry and N s at the gate, `run_dt_sql` recording whether it was started): **31.0 s and 30.5 s → refused with the message above, dt-sql calls 0; 30.0 s and 29.0 s → dt-sql started, calls 1.**
**Not proven yet:** a live `verify --actor all` with this file and the new unit. It runs at install, after the verdict. Install order: unit first, then `systemctl daemon-reload`, then the script, then a hand run.

#### F-2 C-3 round — verdict and install (Infra Claude, 2026-11-20)
**Verdict.** Langston PROCEED at `eca5607f7` (Discord `1573314108051169483`): *"Install now."* Conditions: unit first, `daemon-reload`, then the script; self-test from `/usr/local/sbin`, reporting the count and the unit path; the live `verify --actor all` exit and its `dt_sql_bounds`; this record; the board card's stale "Blocked on". He carried six items (C-7 to C-12) into a follow-on increment, below.
**Install, Helsinki, 2026-11-20T12:48:13Z:**
- Both blobs read from Helsinki's own mirror (`/srv/dawntrader-backup.git`, as langston) at `eca5607f7`. Script sha256 `5f7a3d8b…8474e491`, unit `4f3fbafd…7b0b417`; each equals `git show eca5607f7:<path> | sha256sum` on the laptop, and the installed files read back the same.
- Rollback copies: `/root/reviewer-staging-access.pre-f2c3` (sha256 `50a4ba17…7673623a`, the `678131671` install) and `/root/reviewer-staging-access.service.pre-f2c3` (`2f84ae86…`).
- Unit installed `root:root 0644`, then `systemctl daemon-reload`: `TimeoutStartUSec` read `infinity` before and **`40min`** after (2,400 s). Script installed `root:root 0755`.
- **Self-test from `/usr/local/sbin/reviewer-staging-access`, cwd `/root`: `self-test passed: 35 checks`, rc 0.** The unit path it read is `/etc/systemd/system/reviewer-staging-access.service`: from that location the repo-relative candidate resolves to `/systemd/reviewer-staging-access.service`, which does not exist (`ls`: no such file), and the count is 35 rather than 34, so the unit check ran. The script does not print the path on a pass; C-9 below makes it.
- **Live run, `systemctl start reviewer-staging-access.service` (`verify --actor all`), 12:48:24Z → 12:48:28Z: Result=success, ExecMainStatus=0.** Both rows (langston, coltrane): **`"dt_sql_bounds": {"alert_timeout_s": 150, "call_timeout_s": 300}`**, `database_read` ok, `database_write_refused` ok, `wrong_key_control` `explicit_publickey_denial`. Afterwards `dt-sql --status` on staging: `OK — not locked`. Timer active; next run 11-21 06:20Z.
- Drift enrolment stays on `#1004` (with `P19-B12`).

**Carried to the follow-on increment (his items, owner Infra Claude, next on this batch):**
- **C-7:** move the dt-sql bound refusal to the remote side, before dt-sql starts, using `DT_SQL_CALL_BOUND_S`.
- **C-8:** the AST fence walks the whole module, refuses `from subprocess import …` and aliased imports, bounds the two `subprocess.run` calls inside `self_test`, and drops the blanket exemption.
- **C-9:** the unit check covers every existing candidate, names the object in its pass line, and prints `34 of 35 (unit not present)` when none exists.
- **C-10:** cite dt-sql's alert `subprocess.run` at `:172`, not `:171`.
- **C-11:** reword the C-6 residual: dt-sql runs on staging and the unit's cgroup is on Helsinki, so the cgroup kill does not reach a staging grandchild; the first bound is `CLIENT_SSH_TIMEOUT_S` = 1,010 s.
- **C-12:** reword the comment the verdict cited at `:48-50`: the gate decides whether dt-sql starts; it does not cap the fan-out.

#### F-2 C-7..C-12 increment (Infra Claude, 2026-11-20)
**Refs.** Code at `b45df59fe`, with the C-10 line restored at `da2076bc8`. One file changed: `comms-infra/security/reviewer-staging-access/reviewer_staging_access.py`. The unit file is unchanged.
- **C-7, the bound refusal now also runs on staging, before dt-sql starts.** New module-level `require_dt_sql_bounds_fit(who, bounds)` checks the shape, then refuses if `call_timeout_s + alert_timeout_s > DT_SQL_CALL_BOUND_S` (450). The script runs on both ends, so the same function is in scope remotely. `verify_remote` calls it as `require_dt_sql_bounds_fit("%s, dt-sql NOT started" % actor, dt_sql_bounds)` straight after `parse_dt_sql_bounds`, before the time gate and before `database = run_dt_sql(query)`. The client-side `check_dt_sql_bounds(actor, payload)` now calls the same function, so the two sides cannot drift. The self-test checks there is exactly one remote call, sitting between `dt_sql_bounds = parse_dt_sql_bounds(` and the first `run_dt_sql(`, and that a sum over the bound is refused with `dt-sql NOT started`.
- **C-8, the AST fence covers the whole module.** New module-level `subprocess_fence(source)`, called by the self-test on the file's own text. It refuses: any `from subprocess import …`; `from os import` any command starter (`system`, `popen`, `posix_spawn(p)`, `fork`, `forkpty`, `exec*`, `spawn*`, `*`); `subprocess` or `os` imported under another name; a bare `subprocess` name that is not the owner of an attribute; `os.<starter>`; a `subprocess.<attr>` that is held but not called (only `TimeoutExpired` and `CompletedProcess` are allowed); any call other than `run`. Inside `run_dt_sql` it refuses `timeout=` and `**kwargs`. Everywhere else it refuses a call with no timeout, a timeout that is not a name in `TIMEOUT_NAMES`, and `**kwargs` without an explicit `timeout=` (Python refuses a repeated keyword, so an explicit `timeout=` beside `**kwargs` cannot be overridden). Each refusal names the enclosing function or "module level". The blanket `self_test` exemption is gone: its two `ssh-keygen` calls (key generation and `-s` signing) now go through `bounded_run`. The self-test also feeds the fence 14 known-bad sources, each of which must be refused with its expected reason, and one good source, which must pass.
- **C-9, the unit check covers every candidate and names what it read.** The candidates are the repo's `systemd/reviewer-staging-access.service` (relative to the script) and `/etc/systemd/system/reviewer-staging-access.service`. Every one that exists is checked, deduplicated by resolved path. The pass line is `self-test passed: N checks (unit checked: <path>)`. With none present it prints `self-test passed: N-1 of N checks (unit not present)` and still exits 0.
- **C-10, DISPOSITION: no work, withdrawn, citing `comms-infra/staging/dt-sql:171` at `origin/migration/aws-supabase`.** Line 171 is `r = subprocess.run(argv, capture_output=True, text=True, cwd=APP_DIR, timeout=150)`; line 172 is `log("alert", alert_rc=r.returncode)`. The same lines hold at `eca5607f7` and at the installed `678131671`. `b45df59fe` changed the citation to `:172` and its commit message lists C-10 as done. Both were wrong; `da2076bc8` restores `:171`.
- **C-11, the C-6 residual reworded.** The C-6 record above said the bound for a process that leaves npm's group is "the unit's cgroup kill at 2,400 s". That is wrong. The unit and its cgroup are on Helsinki. dt-sql, and anything it starts, runs on staging, where the cgroup cannot reach. The comment on `UNIT_TIMEOUT_START_S` now says so. Corrected residual: on staging, a grandchild that calls `setsid`, or ignores TERM and outlives npm, is bounded by nothing this verifier controls. On Helsinki, the verifier's own first bound is `CLIENT_SSH_TIMEOUT_S` = 1,010 s: that limits how long the verifier waits, not how long the staging process lives. C-6 stays no work: the residual is outside what this verifier can bound. **NOT RE-READ:** that npm's script runner never calls `setsid`.
- **C-12, the gate comment reworded.** The `REMOTE_PRE_DT_SQL_S` comment now says the gate does not cap the remote work either. Once that work is done, the gate decides whether dt-sql starts at all.

**Evidence (laptop, at `da2076bc8`).**
- Self-test: `self-test passed: 37 checks (unit checked: …\comms-infra\systemd\reviewer-staging-access.service)`, rc 0.
- Mutants were applied by exact anchor. Each one was checked to apply exactly once and judged by exit code. All are **KILLED (rc 2)**:
  - M1, the remote fit call removed.
  - M2, a `from subprocess import run as _r` added.
  - M3, a module-level `subprocess.run(["x"])` with no timeout.
  - M4, the self-test key generation reverted to a raw unbounded call.
  - M5, the second unit candidate pointed at a unit with `TimeoutStartSec=60`.
  - M6, the remote fit call moved after `database = run_dt_sql(query)`.
- Behaviour with no unit file present (both candidates pointed at missing paths): `self-test passed: 36 of 37 checks (unit not present)`, rc 0.
- Positive control for the dynamic-import residual: a grep for `__import__`, `importlib` and `getattr(subprocess` matches only the fence's own docstring line.

**Residual, stated.** The fence is lexical, not a sandbox. It cannot see a call built at run time (`__import__`, `importlib`, `getattr` on a string, `eval`). The docstring says so. It holds this file to a shape a reviewer can read; it does not prove that no unbounded process can start.

**Not proven yet: the install.** Script only, since the unit is unchanged. Read the blob from Helsinki's mirror at the approved sha, compare its sha256 with the laptop's, and keep a rollback copy. Then run the self-test from `/usr/local/sbin`, which should report 37 checks and name the unit path. Then do a live `systemctl start reviewer-staging-access.service` and check `dt-sql --status` afterwards.
