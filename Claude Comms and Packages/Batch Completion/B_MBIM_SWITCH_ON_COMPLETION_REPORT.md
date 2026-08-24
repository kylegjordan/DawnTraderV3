# B-MBIM-SWITCH-ON — COMPLETION REPORT

> **Owner:** Claude Analyst (CC-C) · **Closed 2026-08-24** · **change-class: non_architecture**
> **Deployed `afb7d326c582d0b8d5e058f67ce0735db6ac7b54`** 2026-08-24T10:21Z · **CI run `32715866997`, 4/4 green per-job**
> **Langston: APPROVED at `481bda9e3`** (r1 BLOCKER-1/-2 → r2 BLOCKER-3 → r3 approved + 3 conditions, all landed before deploy)
> **Part F piece F-A.** Scope: `Scope Files/B_MBIM_SWITCH_ON_SCOPE.md`

---

## 1. WHAT THIS BATCH WAS

Kyle refused to accept that a defect as fundamental as `#741` had never been considered, and directed a
provenance read of `bridge/canonical/` and the pre-governance archives. **He was right.**

**Directive 8.9.5, `92e9c15fc`, 2025-12-30T22:40Z — ninety minutes after the mini-book was created:**
a Mini-Book Integrity Monitor auditing the book midpoint against an **independent REST midpoint** every
five minutes, flagging drift over 0.2%.

⛔ **IT HAD NEVER RUN.** `start()` was reachable from **exactly one** manual API route, never from boot,
and there was **not one `[8.9.5][MBIM]` line in any retained log.**

⇒ **This was a SWITCH-ON, not a build.** Langston had already approved me to *build* a divergence
instrument; doing so would have duplicated a dormant one specified for the same purpose — the exact
duplicate-mechanism failure this arc had already cost a night on.

## 2. OBJECTIVES — ALL MET

| # | Objective | Result |
|---|---|---|
| **OBJ-1** | MBIM starts at boot | ✅ `[8.9.5][MBIM] Integrity monitor started (5-min interval)` at **10:21:08** |
| **OBJ-2** | It audits and reports | ✅ first audit 30 s later: **6 symbols, drift 0.000%–0.028%, 0 drifted** |
| **OBJ-3** | REST load bounded | ✅ rotating slice + `finally`-guaranteed 100 ms floor; no rate-limit errors in the deploy window |
| **OBJ-4** | Full universe coverage | ✅ cursor advances and wraps; **the clamp fired in production on pass 1** (universe was 6, below the slice) |

**★ THE PRE-REGISTRATION MATTERED (Langston's condition):** a monitor finding nothing reads identically
to a monitor not running. Scope §4.a stated the expectation **before** the pull — `crossedDetections: 0`
over 60,613,564 updates ⇒ predict near-zero drift — **and named the discriminating case:** substantial
MBIM drift with `crossedDetections` still 0 would be the **non-crossing ghost**, which the crossed
detector is structurally blind to and nothing else instruments. **Observed near-zero drift; prediction held.**

## 3. THE THREE THINGS LANGSTON CAUGHT — EACH INVERTED ONE OF MY OWN ARGUMENTS

1. **BLOCKER-1 — the backoff switched itself off on the exact failure it exists to back off from.**
   The 100 ms spacing sat at the bottom of the `try`, below the drift branch: skipped by all four
   `continue`s **and** by the `catch`. `makePublicRequest` **throws on any Kraken `data.error` — which is
   exactly what a rate-limit response is.** Now in a `finally`.
2. **BLOCKER-2 — the slice double-audited below the slice size.** `take` unclamped, at N<30, re-appends
   the same symbols: doubled REST calls, double-counted `totalChecks`. **Reachable at boot** — and it was
   reached: the first live pass ran a 6-symbol universe.
3. ⛔ **BLOCKER-3 — the drift branch mutated the live trading path, and the scope gave that limb no
   disposition.** `triggerSoftResubscribe` → `softResubscribe:3343` → **`orderBooks.delete(symbol)`**, and
   `getBookForFill:3221-3223` returns null on an empty book, read by `depth-source.ts:43` behind the
   **FAIL-CLOSED `#295` open-depth gate** ⇒ **remediating drift can silently block a promotion.**

**★ THE LESSON, and it generalises past this batch.** My scope defended that limb as *"pre-existing
behaviour of the service as designed, not introduced here."* **That is the wrong test. SWITCHING A
DORMANT SERVICE ON INTRODUCES EVERY ACTION IT TAKES.** And that limb is 2025-12-30 code written **before
the depth gate existed**, so *"does it still fit today's architecture?"* was a live question the scope
never asked. Shipped **LOG-ONLY**; `triggerSoftResubscribe` **retained, deliberately uncalled**, rule-18
docblock, and **`#507` carries a reciprocal rider** so a later grep cannot read it as a missed call site.

## 4. ★ AN UNPLANNED RESULT, AND A CLAIM OF MINE IT CORRECTED

Post-deploy the book checksum verifies at **18,758 / 18,758, zero mismatches.** Pre-deploy: 3,352 matches
against 60,610,212 mismatches.

I had flagged that gap as a possible **precision-coverage regression** and left it "unresolved."
**Langston re-derived it:** `e6f7c70b3` has **0** occurrences of `symbolPrecision` (positive control: 3 at
`481bda9e3`) and computes `computeBookChecksum(raw)` **with no precision argument**, so essentially every
attempt mismatched **by construction**. My 34,549/34,549 was measured at `3bd9f4022`. **Adjacent objects,
not a before/after. `#507`'s remainder is NOT bigger than recorded** — and leaving "unresolved" standing
would itself have been a false claim, implying a regression that is not there.

⚠️ **`crossedDetections` IS NOT COMPARABLE ACROSS THIS DEPLOY.** The checksum mismatch arm `continue`s
**above** the crossed-book detector, so a resubscribing update never reaches that counter. **Trip
condition named before the pull** in scope §4.b (disarm if `skippedNoPrecision` > 20% after 10 min, or
`mismatches/attempts` > 5% once precision is mapped), homed to `B-BOOK-TRUNCATE-HOTFIX`. **Neither
tripped:** `checksumAttempts` equalled `updatesApplied`, so `skippedNoPrecision` is 0 **by arithmetic** —
the key is absent from the payload, and an absent key is not a zero.

## 5. A CORRECTION MADE UNDER THIS BATCH'S NAME, IN ANOTHER BATCH'S COMMIT

**Langston's condition.** `kraken-websocket-adapter.ts:3300` — the `/api/active-engine/book-integrity`
`note` string — read *"MISMATCH IS EXPECTED until the v2 instrument precision feed lands"* **while
printing 18,758/18,758 beside it.** It was corrected in `B-EPOCH-KEYING-PARITY`'s commit, but **it belongs
to this batch's Step-7 read** and is named here so this record contains it. Comment-only — **but it reaches
a response body**, so a human judging integrity was reading a sentence contradicting the number above it.
**Third instance of that class in one day**, with `index.ts:320-329` and the monitor's own header.

## 6. GOVERNANCE FILES CHANGED

`BATCH_CATALOG.md` · `PHASE_HISTORY.md` · `PHASE_19_PLAN.md` §5 · `SYSTEM_IMPACT_MAP.md` ·
`RUNNING_ISSUES.md` (#507 rider; #635/#636 measurements) · `GOVERNANCE_EXCEPTIONS.md` ·
`MISTAKE_PATTERNS.md` · `MEMORY_CC_C.md` · `/home/langston/MEMORY.md` (10.b, 183 lines) ·
`Scope Files/B_MBIM_SWITCH_ON_SCOPE.md`.

**⛔ SYSTEM_MANUAL JUDGED NOT APPLICABLE, AND THE JUDGEMENT IS STATED RATHER THAN SKIPPED BY DEFAULT**
(§9 anti-pattern): a monitoring service that observes and logs changes no architecture, strategy logic,
regime detection, filter design, signal pipeline or quantitative math. **SIM-scope only.**

★ **THE SIM ENTRY IS THE ONE THAT MATTERS:** this component existed for **eight months and was never in
the map** — which is part of how it stayed dormant. A component absent from the dependency map is one
nobody trips over.

## 7. WHAT I GOT WRONG, RECORDED

- **The rate-budget premise — wrong in the DANGEROUS direction.** I argued the slice mattered because
  `price-cache.ts` holds Kraken under 10 weighted req/s. `getTicker` → `makePublicRequest` is a **bare
  `fetch` with no limiter**: these calls **compete with that budget from outside it.** My argument made the
  load look *safer* than it is. Filed as **instance 3 of `fragment-not-whole`**, which crosses that
  pattern's 3-across-2 promotion floor — **flagged for the weekly pass, deliberately NOT self-promoted.**
- **"Pre-existing therefore fine"** — opened as its own pattern in `MISTAKE_PATTERNS.md`.
- **I corrected the scope and left the code.** I claimed "corrected in place" when it was true of the
  scope and false of the source, in **two** places. Langston caught both.
- **Scope written AFTER the push** — the governance checker fired two correct alerts (undeclared
  change-class, governance overdue). Recorded in the scope header rather than backdated.
