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
successful-fetch stamp, and that no root-only operation remains in the refresh script.
