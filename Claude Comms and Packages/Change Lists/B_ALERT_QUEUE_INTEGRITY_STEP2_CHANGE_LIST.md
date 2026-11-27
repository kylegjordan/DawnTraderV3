# B-ALERT-QUEUE-INTEGRITY — Step 2 review

KD-123 · #647(i) · Sprint to Live 3c1 · CC-B. Scope approved at `98393bec848b97c318888b1bdce2edfa209740ed` (Coltrane, 2026-11-27 03:34:15 UTC).

| Object | Change |
|---|---|
| `Scope Files/B_ALERT_QUEUE_INTEGRITY_SCOPE.md` | Exact approved scope. |
| `Scope Files/B_ALERT_QUEUE_INTEGRITY_PRE_AUDIT.md` | Installed writer census, lock and dispatch audit, and the implementation and acceptance plan. |

Review the shared ownership protocol and pending recovery together, especially the dead-owner reaper race, overlapping same-key attempts, retirement after a persisted terminal row and the no-mixed-writer cutover. Check that the isolated receipt proof reaches the ordinary dispatcher for both orderings and distinguishes failed promotion delivery from the existing re-surface retry. #994 Step 3 waits for verified #647(i). The remaining #647 items stay after live.

Revision 2 folds Coltrane's four findings on `a78ec62e1`: final exact-token recheck after death proof, durable UUID before the CLI and stale-worker exclusion, the healthy-before-dispatch and failed-delivery controls, and the actual PM2/CLI/normal dispatcher inventory plus staging/Helsinki scheduled admissions. Review the receipt guard, durable cleared-condition evidence and re-arm specifically. No runtime change is included.

Revision 3 adds the durable recovery edge for an absent, locked-out alert and queues a newly debounced relapse under its own UUID before the old row can be delivered. It covers the installed archive direct-add crons and generic retrying failure hook in the cutover and rollback drain. Review the guarded attempt ordering and the one-healthy-tick relapse control against Coltrane's 04:01:21 UTC send-back on `a80064c7d`.

Revision 4 adds the verified direct database-map and install-drift service starts, the Token Watch mint and failure routes, and the installed Helsinki and laptop SSH entrances. Both directions of the writer drain explicitly block the parent services as well as their failure hooks, and account for late child processes. P1–P4 are unchanged from revision 3.
