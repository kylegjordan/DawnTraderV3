# B-CREW-ACCESS-HARDEN — Step 7 first-pass staging evidence

**Step-7 source-carrying deployment:** `183deb6ef1bd41ee7a05e4ab326e02c8fc480291`

**Runtime independently verified during Step 8:**
`6dadbb6143a8eb58d07bd05cbcf29baf28e09f57`

**Verified source boundary:** the Dashboard `Ready to Buy` card uses the passive
`GET /api/active-engine/diagnostics/scan-latest?mode=paper` read for its countdown and does
not invoke the administrator-only on-demand scan.

## Backend checks

- The authenticated passive latest-scan request returned HTTP 200 with `ok: true` and a
  numeric `nextScanInMs` while the paper engine was active.
- The dashboard blob is `e79e91569072d58431e1819a1f480f97c110de94` and the
  mounted-test blob is `ffd6f12663a7826cfe61c07460a18d36dc3c795f` at the
  Step-7 source-carrying deployment, the later Step-8 runtime and graded ref
  `80ed8ef5629ae514e9f15badf850392e5fcf1929`.
- DawnTrader remained online; this verification did not redeploy or restart it.

## UI check

Kyle navigated the staging Dashboard in his existing Chrome session on 2026-10-15. The
`Ready to Buy` card rendered four pair cards and a visible `Next scan in` value (`00:13` in
the supplied screenshot). Kyle observed the value count down to zero and reset for the next
scan. This proves the deployed countdown renders and advances through a real reset rather
than freezing or displaying a placeholder.

The screenshot is an owner-session UI check; it does not by itself prove the future
non-admin crew session. That access result remains an execution check after the targeted
`testuser123.is_admin` change. Source inspection and the mounted client test separately prove
that this card now calls the passive endpoint and rejects the on-demand scan URL.

## Step verdict

Step 7 is complete for the deployed Ref A prerequisite. Step 8 is Coltrane's independent
verification of the same deployed source and staging behavior.

## Step 8 independent verification and scope boundary

Coltrane independently rendered the card and captured 33 of 33 initial non-static browser
requests as GETs. All 20 captured scan-family requests were successful passive latest-scan
GETs; none called the administrator-only on-demand scan. The passive route reads cached scan
and system state, and the watchlist GET only maps the existing in-memory Active Filtered Pool.
Loading the card therefore starts no scan, writes no watchlist and does not populate the pool
used by current trading.

The Step-8 runtime identity came from both the deployment record and the liveness response:
`6dadbb6143a8eb58d07bd05cbcf29baf28e09f57`. The earlier dispatch incorrectly described
`183deb6ef1bd41ee7a05e4ab326e02c8fc480291` as the still-current deployment. The relevant
dashboard and mounted-test blobs are identical across both refs and the graded ref, so the
runtime change does not change the behavior under review.

The exact Step-7 evidence blob at graded ref `80ed8ef5629ae514e9f15badf850392e5fcf1929`
has SHA-256 `a275f0e9389fa74f0509cb87f1532aab8885709d20df1a8bc659a1aeccb9648b`.
The different digest sent in the first Step-8 request was not the graded Git blob and is
withdrawn.

Kyle's 2026-10-15 direction is that the main Dashboard is a low-priority legacy surface that
will be reconsidered and redesigned later. This batch does not preserve, improve or redesign
the Ready to Buy card. Its only obligation was to remove the hidden administrator-only action
before the crew account loses administrator authority. No additional Dashboard work belongs
in this batch; a legacy surface later measured to cause a security, reliability or workload
problem should be disabled rather than rehabilitated here.

Coltrane also identified a ten-second passive poll and a one-second browser-only countdown in
the mounted card, plus separate engine-start watchlist and dormant micro-execution work. The
browser evidence proves page loading does not start those engine paths. Their removal is not
required to clear this access prerequisite and is deferred to the Dashboard/legacy cleanup
decision unless a measured problem makes shutdown urgent.

**Step 8 verdict:** VERIFIED for the scoped passive/no-write/no-trading-feed boundary at
graded ref `80ed8ef5629ae514e9f15badf850392e5fcf1929`. The future non-admin result remains a
separate execution check after `testuser123.is_admin` is cleared.
