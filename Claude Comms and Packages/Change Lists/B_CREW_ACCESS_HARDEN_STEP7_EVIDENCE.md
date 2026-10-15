# B-CREW-ACCESS-HARDEN — Step 7 first-pass staging evidence

**Deployed application ref:** `183deb6ef1bd41ee7a05e4ab326e02c8fc480291`

**Verified source boundary:** the Dashboard `Ready to Buy` card uses the passive
`GET /api/active-engine/diagnostics/scan-latest?mode=paper` read for its countdown and does
not invoke the administrator-only on-demand scan.

## Backend checks

- The authenticated passive latest-scan request returned HTTP 200 with `ok: true` and a
  numeric `nextScanInMs` while the paper engine was active.
- The deployed dashboard and test blobs match the Coltrane-approved Ref A objects.
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
