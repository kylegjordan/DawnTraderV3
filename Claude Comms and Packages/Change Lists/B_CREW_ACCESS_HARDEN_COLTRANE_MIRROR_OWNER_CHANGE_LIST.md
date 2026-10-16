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

## Amendment — independent mirror objects

The first correction fixed the scheduled writer but measured ownership only in Coltrane's
mirror. A later whole-path census found 9 packed-object files with link count 2 across the source
and Coltrane mirrors; changing their owner through either path changed the same inode in both.
After concurrent exact-ref pins, 32 of 581 source-mirror paths were not owned by `langston`, even
while 0 of 3,241 Coltrane-mirror paths had the wrong owner. The target-only census therefore could
pass while the source mirror was being changed.

This was not a new mechanism: the B-CREDENTIALS-PRIVATE-REPO pre-audit had already measured three
shared packs and identified the original local `--mirror` clone as the likely mechanism, with a
target-side repack as its prescribed correction. A fresh Linux control did not reproduce hardlink
creation through the scheduled fetch command, so no unsupported fetch rewrite was retained. The
live correction broke the 9 shared links and then restored source ownership. Acceptance requires zero
shared object inodes, zero wrong-owner paths in both mirrors, successful Git integrity checks in
both mirrors, an exact shared ref, a fresh success stamp and one real scheduled-account service
run before the timer is restarted.

The live correction left 0 shared object inodes across 369 source object files and 2,978 target
object files. The complete ownership censuses found 0 of 628 source paths outside
`langston:langston` and 0 of 3,276 target paths outside `coltrane:coltrane`; both mirrors passed
Git's integrity check. With the timer still stopped, a service run under `coltrane:coltrane`
completed successfully at 09:44:11 UTC, kept both mirrors at
`159d16134a805eb9c9840bc1b4d199b88fb43f00`, wrote a fresh success stamp, and preserved all four
zero-failure measurements. The timer was then returned to active/enabled state for its independent
scheduled-run proof.

The first scheduled run after that correction completed successfully at 09:59:18 UTC under
`coltrane:coltrane`, kept both mirrors at
`159d16134a805eb9c9840bc1b4d199b88fb43f00`, and wrote a matching success stamp. After the adjacent
source-mirror sync settled, both mirrors passed Git's integrity check; the full censuses found 0 of
650 source paths and 0 of 3,276 target paths under the wrong owner, plus 0 shared object inodes
across 387 source object files and 2,978 target object files. The timer remained active and enabled.

DISPOSITION: folded into B-CREW-ACCESS-HARDEN because exact-ref Langston/Coltrane review is a
required gate for this batch and the stopped timer could not safely return to service without
the correction.

## Exact review-branch reads — 2026-10-16 (Infra Claude)

Coltrane, the Kyle-routed reviewer for OLD Claude's `B-B75-COUNT-GATE` hotfix (#1195),
held at 09:20Z because his tools could read only `migration/aws-supabase`, while the hotfix
waited on `review/b-b75-count-gate` at `97233c2baa03d054b2faeb216e68ccc79bc4b432` (present in
`/srv/dawntrader-backup.git`). Langston's `dt-review` already reads a pinned commit and labels
an off-branch read, so this is the parity correction.

- `coltrane-repo-refresh` also fetches `+refs/heads/review/*:refs/heads/review/*` with
  `--prune` limited by the refspecs; the stamp is still written only after that fetch succeeds.
- `coltrane-review --ref <sha>` reads one exact commit: full 40-char lowercase id, present in
  the mirror, and on `migration/aws-supabase` or a fetched `review/*` branch, else REFUSED. An
  off-branch read prints one OFF-BRANCH line first on stdout and on stderr.

Commit `92c8a422fd41a603af172a188d325919de9efb81`; tested as `coltrane` on a scratch clone
(cases and exit codes in the commit message). Coltrane **APPROVED TO INSTALL** at that exact
ref after his own disposable-repository run. Installed 09:33Z: `/usr/local/bin/coltrane-review`
= blob `1ce02b214da4333a6f7b977b31af4a6ff2b8a627`, `/usr/local/bin/coltrane-repo-refresh` =
blob `24a571b632e8fcc0140c18cb341286c97a1e49a6` (`git hash-object` of the installed files),
both 0755 root:root. Rollback copies: `/root/coltrane-tool-rollback-20261016/`. The first
post-install refresh fetched `review/b-b75-count-gate` at `97233c2ba`, and the installed tool
read its two commits with the OFF-BRANCH line first (rc 0). `AGENTS.md` unchanged (his
auto-loaded size may only go down); the tool's usage text documents `--ref`.

DISPOSITION: folded into B-CREW-ACCESS-HARDEN (reviewer-access parity, the same scope as the
2026-10-15 corrections above).
