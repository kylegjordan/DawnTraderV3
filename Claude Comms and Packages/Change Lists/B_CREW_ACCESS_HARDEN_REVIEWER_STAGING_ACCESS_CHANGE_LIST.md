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
  - resolves the effective staging SSH configuration, rejects command/CA authorization
    sources, and requires exactly one matching key across every configured authorization file
    with the Helsinki-only restriction and expected label;
  - binds the client trace to the accepted fingerprint, requires remote identity `deploy`, an
    actual byte read from each current log, and a read-only application-table database positive
    control without putting the database address in process arguments;
  - generates a fresh wrong key for each actor and requires an explicit public-key denial trace
    with every non-public-key authentication method disabled;
  - includes thirteen positive/mutation checks covering authorization parsing, cross-file
    duplicates, alternate SSH authorization sources, explicit denial, authenticated remote
    failure and transport failure.
- `comms-infra/security/reviewer-staging-access/README.md` — install, verification, recovery,
  fingerprints, backup provenance and the full-`deploy` residual.
- `.github/workflows/ci.yml` — runs the thirteen-check self-test in the existing access-hardening
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
  were disabled in the effective configuration.
- The new verifier ran from a private temporary Helsinki directory and, for both actors,
  independently bound the accepted fingerprint, returned remote identity `deploy`, read a
  byte from both current logs, read the `users` application table under a read-only database
  transaction, and returned an explicit public-key denial trace for a fresh wrong key. The
  temporary directory was removed by the same command.
- The thirteen-check self-test passed locally and on Helsinki.

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
