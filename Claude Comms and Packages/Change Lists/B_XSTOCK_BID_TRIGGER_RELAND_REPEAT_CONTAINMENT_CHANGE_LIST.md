# B-XSTOCK-BID-TRIGGER-RELAND #1191 — temporary repeat containment

- `scripts/system-alerts.ts` verifies the exact 450-ID manifest and applies an
  expiring predicate only to Discord repeats of matching active VTS warnings.
- `server/services/system-alerts.ts` reports deferred repeats separately from
  failed delivery and does not modify the row or its delivery clock.
- `B_XSTOCK_BID_TRIGGER_RELAND_REPEAT_CONTAINMENT_SCOPE.md` carries the
  serving reference, disposition, independent controls and rollback.

Ask Coltrane whether the exact predicate and isolation proof suffice, and
whether INFRA's proposed dispatcher-only rollout can preserve restart 716
and the protected windows. The currently running dispatch stays in place.
Do not read queue drain as proof of activation. Step 3 P3 remains the
permanent path for newly qualified incident warnings, independent escalation
and genuine-input recovery.
