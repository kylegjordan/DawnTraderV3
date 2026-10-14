# Production SSH fail2ban jail

The manager installs Ubuntu package version `1.0.2-3ubuntu0.1`, enables only the
canonical SSH jail, validates the real journal-backed filter, and records the
exact prior package, service and local-file state for rollback. It is run on
staging first and Helsinki second, never in parallel.

Install and verify require the current laptop and peer source addresses. The
rendered jail protects loopback and the laptop source from the proof ban, while
the verifier refuses if the peer source is ignored. The journal check requires a
real matched line as a positive control before the jail is accepted.

The live proof is deliberately split across source and target. From the peer,
`emit-invalid-ssh-attempts.sh` creates an ephemeral private directory and key,
sends at least six invalid-user attempts through fresh connections, and destroys
the key in the same process. From one of two held laptop recovery sessions, the
target-side verifier must show the peer in both the real `sshd` jail and firewall
while the laptop source remains unbanned. The operator then proves a new peer
connection is blocked, runs `unban`, proves fresh peer access is restored, and
re-runs every dedicated path before moving to the second host.

A filter simulation, an active service, an alternate jail, or an existing
multiplexed connection does not satisfy the live proof.
