# Production SSH key-only configuration

`10-dawntrader-key-only.conf` is the canonical Helsinki drop-in. The early
name is intentional because OpenSSH keeps the first value it obtains and a
later file cannot reliably override an earlier cloud-image setting. The manager
refuses installation unless two established recovery sessions from the supplied
laptop address are visible, saves only the exact replaced file, checks syntax,
reloads rather than restarts, and evaluates root, Langston, Coltrane and Nova in
their required source contexts. Verification requires an active `ssh.service` and a
nonempty port-22 listener attributed to `sshd`; an empty successful `ss` command is a
failure. It accepts OpenSSH's equivalent canonical root values `prohibit-password`
and `without-password` while rejecting every password-permitting value.

Before releasing either recovery session, the operator must make a fresh laptop
key connection and re-run every dedicated cross-server path. The external proof
must also disable public-key authentication on the client and record the real
production listener offering neither password nor keyboard-interactive; an
invalid-password rejection is not evidence that those methods are disabled.

Rollback takes the exact state directory printed by install, restores or removes
only this drop-in, checks syntax and reloads. A fresh key connection is required
after rollback too.

`manage-ssh-hardening.sh self-test` mutation-checks both canonical root values and
proves that an empty listener or a non-`sshd` port-22 listener is rejected.
