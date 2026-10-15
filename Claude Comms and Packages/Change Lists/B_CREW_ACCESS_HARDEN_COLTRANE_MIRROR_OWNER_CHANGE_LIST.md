# B-CREW-ACCESS-HARDEN — Coltrane mirror ownership correction

## Finding

The scheduled Coltrane mirror refresh ran as root even though the mirror belongs to the
`coltrane` account. A scheduled refresh therefore created root-owned Git objects and the branch
reference. A later exact-ref review pin as `coltrane` failed until the whole mirror was restored
to `coltrane:coltrane` ownership.

The original unit had no `User=` or `Group=` setting. The original design required a separate
Coltrane-owned mirror but did not bind the scheduled writer to that owner.

## Correction

- Run `coltrane-repo-refresh.service` as `coltrane:coltrane`.
- Keep the existing successful-fetch-only stamp behavior unchanged.
- Record the installation proof: one real service refresh must succeed and every path in the
  mirror must remain owned by `coltrane:coltrane`.

## Live boundary

No live unit is changed by this commit. The timer remains stopped during the exact-ref P2 review.
Installation requires independent review, byte-identical unit installation, a daemon reload,
one manual service run, ownership census, exact mirror-ref check, and timer restart proof.

REVIEWER: confirm the service account can read the source mirror, write the Coltrane mirror and
successful-fetch stamp, and that no root-only operation remains in the refresh script ·
APPROVED TO INSTALL by Coltrane at exact ref
`383c3b88bc6ae7706a6dee42c692bae3e882327b` · re-derived y

## Live installation — 2026-10-15

The installed unit's SHA-256 matched the exact reviewed Git blob. After daemon reload,
systemd reported `User=coltrane` and `Group=coltrane`. With the timer still stopped, one manual
service run exited 0 with `Result=success`, refreshed the graded mirror to the exact reviewed
ref, left 0 of 3,140 mirror paths owned by another user/group, and passed `git fsck` as
`coltrane` (the bare mirror retains its pre-existing unborn `master` HEAD notice).

The timer was then restarted. It is active and enabled with its next run scheduled. The prior
two positive controls created 14 and then 30 non-Coltrane-owned paths through root-run refresh
or pin operations; the installed service account prevents that scheduled-writer state.

The first scheduled run after installation started and completed at 08:05:11 UTC with
`Result=success` and exit status 0 under `User=coltrane` and `Group=coltrane`. It advanced the
mirror to shared ref `805a4b6bef2eb18f4177106a8952d34b4dee7f18`, wrote a matching successful-fetch
stamp, and left 0 of 3,159 mirror paths owned by another user or group. The timer remained active
and enabled. This scheduled-path proof is separate from the earlier manual service proof.

DISPOSITION: folded into B-CREW-ACCESS-HARDEN because exact-ref Langston/Coltrane review is a
required gate for this batch and the stopped timer could not safely return to service without
the correction.
