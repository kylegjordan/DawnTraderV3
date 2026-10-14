# Production SSH fail2ban jail

The manager installs Ubuntu package version `1.0.2-3ubuntu0.1`, enables only the
canonical SSH jail, validates the real journal-backed filter, and records the
exact prior package, service and local-file state for rollback. It is run on
staging first and Helsinki second, never in parallel.

Installation requires two established authenticated laptop recovery sessions before
the package transaction begins. The state directory captures the complete installed
package inventory, exact prior fail2ban version, enabled and active states, local jail
bytes and existing ban set. Downgrades use the package manager's explicit downgrade
mode. Rollback removes only bans added since capture, restores missing prior bans,
restores the exact package/file/service state, and fails if the final package inventory
or service state differs. It never issues a global unban.

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

The host-specific review gate includes a real install→rollback mutation before the
lasting install. That mutation must end with byte-equal local configuration, equal
package inventory, the captured enabled/active state and the captured ban set.
`manage-fail2ban.sh self-test` mutation-checks the set-difference logic that preserves
prior bans and removes only additions.
