# B-BOOK-STATE-RESTART-DURABLE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

**Owner:** CC-C · plan row `3n.q8` · `#1066` · scope `B_BOOK_STATE_RESTART_DURABLE_SCOPE.md` (r1, `6e2c5ec20`, **Step 1 APPROVED by Langston 2026-09-24 13:40Z**).
**Status:** `STEP: 2 of 11` · `NEXT STEP: 3 of 11`. **IN PROGRESS.** §0 was written first because it was the time-sensitive part. The audit body (§1 onwards) follows.

---

## 0. THE POSITIVE CONTROL, CAPTURED NOW (Langston's Step-1 condition 1)

**Why now, not at Step 8:** `console.warn` lines go to `error.log`, which staging keeps as daily files for about 14 days (the oldest on disk 2026-09-24 is `error__2026-09-11`). The control event is 2026-09-19. The deploy is held to after 2026-09-30, and OBJ-6 needs a second restart after that, so waiting would lose the evidence (`#1044` class).

**Captured:** every `[BOOK_STATE]` line in `/var/log/dawntrader/error__2026-09-20_00-00-00.log`, the file covering 2026-09-19 00:00:00 → 23:59:59Z. That is **498 lines, 108,066 bytes**, untruncated, filed as `Scope Files/B_BOOK_STATE_RESTART_DURABLE_CONTROL_2026-09-19.txt`. The sha256 prefix `18ea0c9b48f33247` matches on staging and on the local copy.
- **Counts by kind (whole file):** 245 ANET REFUSE · 105 AMC REFUSE · 76 LOW REFUSE · 59 ANET SKIP · 7 REFUSAL_BASIS (ANET 3, AMC 2, LOW 1, MDB 1) · 2 MDB REFUSE · 1 ANET YIELD · 1 ANET SEED_IMPLAUSIBLE · 1 ANET COMPARATOR_CLEARED · 1 AMC SKIP.
- ⛔ **NOT CAPTURABLE, stated so no one looks for it: `COMPARATOR_SEEDED`.** It is written with `console.log` (`book-state-tracker.ts:279`), so it went to `out.log`. On 2026-09-24 staging keeps 14 rotated `out__` files of about 25 minutes each, and nothing from 2026-09-19 survives. **The seed fact is carried instead by `REFUSAL_BASIS`** (`seedRetainedMedian`, `retainedMedianNow`), which is `console.warn` and is kept.

**THE CONTROL, in five lines from that file** *(log prefixes and some fields trimmed for width; the full lines are in the file)*:
```
2026-09-19 00:02:43  ANET/USD REFUSAL_BASIS seedImplausible=false seedSpread=0.00436 seedRetainedMedian=none retainedMedianNow=none ... seededAt=2026-09-19T00:02:42.914Z
2026-09-19 00:16:29  ANET/USD COMPARATOR_CLEARED reason=yield_after_60_hollow validated=true framesSinceSeed=488 observedMovement=true ringAfter=true
2026-09-19 00:16:30  ANET/USD SEED_IMPLAUSIBLE seedSpread=0.32368 retainedMedian=0.00415 kRel=3
2026-09-19 00:16:30  ANET/USD REFUSAL_BASIS seedImplausible=true seedSpread=0.32368 seedRetainedMedian=0.00415 retainedMedianNow=0.00415 ratio=78.03
2026-09-19 00:54:15  ANET/USD REFUSAL_BASIS seedImplausible=false seedSpread=0.32368 seedRetainedMedian=none retainedMedianNow=none ratio=none seededAt=2026-09-19T00:54:15.224Z
```
- **The same seed spread (0.32368) is JUDGED and refused at 00:16:30** (ratio 78.03 against a retained median of 0.00415, which the 00:16:29 clear wrote with `ringAfter=true`). **At 00:54:15, one restart later, it is ACCEPTED VACUOUSLY** (`retainedMedianNow=none`). Nothing else differs, and that is the defect in one comparison.
- **There were two restarts that night, and both show it.** At 00:02:43 all four held names (ANET, AMC, LOW, MDB) seeded with `seedRetainedMedian=none`. At 00:54:15 AMC also seeded vacuously, at spread 0.05185 against its own earlier 0.00370.
- **What the later restarts can and cannot show:** the error files for the 2026-09-21T21:19Z and 2026-09-22T14:38:49Z restarts hold **6 and 0** `[BOOK_STATE]` lines for the whole day. So those restarts are **not** usable controls. Their seed evidence was `console.log`, and it has rotated away.

## Step-1 conditions carried into this document (Langston, 13:40Z)

1. **Q2 (a):** split the failure modes. If the whole store is unreadable, fall back to empty maps and alert. If a single row is invalid, skip that row, keep the rest, and count it.
2. **Q2 (b):** the boot alert is dedupe-keyed. It is **resolved, never acked**.
3. **Q3:** record-only is right *pending measurement*, not settled. His S25b ruling was made against a ring whose life was bounded by the process, so it is **not** cited for this. OBJ-4's read publishes the **downtime-age distribution of restored rings** beside the judged/vacuous split.
4. **SIM and System Manual are REQUIRED rows** in the Step-10 ledger, whatever the `sub_batch` class says. That covers the S25b amendment, a new store component, and the §3.5.1a rewrite.
5. **State it plainly:** a restored ring is consumed at the first plausible seed exactly like a clear-written one (`:313`). **It judges one seed and is gone. Persistence does not create a standing yardstick.**
