# Reviewer staging access — Langston and Coltrane

Both independent reviewers require their own staging path for Step 8. Each reviewer holds a
different private key on Helsinki; staging accepts that key only from Helsinki's fixed public
address and only as `deploy`. The path can read application logs and the server-held database
connection, so it is not a read-only Unix account: the existing full-`deploy` residual remains
governed by `RUNNING_ISSUES #110` and is not hidden by the intended read-only use.

## Canonical identities

| reviewer | Helsinki key | expected fingerprint | staging authorization comment |
|---|---|---|---|
| Langston | `/home/langston/.ssh/id_ed25519` | `SHA256:gvtY9j7vBwXruVXaGNLhot/lWac/zVt3omObdSTHIQs` | `langston@helsinki` |
| Coltrane | `/home/coltrane/.ssh/id_ed25519_staging` | `SHA256:jbHGXwI7aVjXF/l/cizDWWmmdElO0Roy5ngQYPxUD1c` | `coltrane-dt-agent@204.168.141.77` |

Both staging lines must begin with exactly `from="204.168.141.77"`. Public-key comments are
labels, not identity evidence; the verifier binds the private key, accepted authorization and
live connection by fingerprint.

## Verify

Install the reviewed script at `/usr/local/sbin/reviewer-staging-access` on Helsinki as
`0755 root:root`, then run:

```bash
reviewer-staging-access self-test
reviewer-staging-access verify --actor all
```

The live command checks both local key owners and modes, derives each private key's public
fingerprint without printing its body, connects with only that key, and has staging verify the
source restriction, authorization label, deploy identity, both log reads and a one-row database
read. It sends its own reviewed source over standard input for the remote half, so no separately
installed staging copy can drift.

Install `comms-infra/systemd/reviewer-staging-access.{service,timer}` on Helsinki with the
standard scheduled-job `onfailure.conf` drop-in. The daily timer turns a later key, host,
authorization, log or database-path break into a crew-channel failure instead of leaving a
one-time proof to go stale.

## Recovery boundary

The repository deliberately stores fingerprints and labels, never private keys. If one reviewer
path must be rebuilt, generate the key as that reviewer on Helsinki, compare its fingerprint with
the reviewed replacement record, and add the public half to staging only after a separate review.
Preserve the exact staging authorization file before the change, append rather than overwrite,
keep owner `deploy:deploy` and mode `0600`, require the Helsinki source restriction, and run the
live verifier before releasing the backup. Do not copy Langston's private key to Coltrane or the
reverse; reviewer identity separation is the point of two keys.

The backup made during the 2026-10-15 Coltrane repair is
`/home/deploy/.ssh/authorized_keys.before-coltrane-review-20261015`. Its birth/ctime is
2026-10-15 even though `cp -a` preserved the source file's older mtime; its three fingerprints
are the exact pre-Coltrane population.
