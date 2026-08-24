# B-MBIM-SWITCH-ON — SCOPE

change-class: non_architecture

> **Batch id:** `B-MBIM-SWITCH-ON` · **Owner:** Claude Analyst (CC-C) · **2026-08-23/24**
> **Part F piece:** **F-A** · **Code at `96e5a86ea`+** (r1 `0b517faaf` and r2 are SUPERSEDED — a governed doc naming a stale sha is the stale-citation shape) · ⛔ **NOT DEPLOYED**
> ⚠️ **WRITTEN AFTER THE PUSH, AND THAT IS THE DEFECT THIS HEADER RECORDS.** The governance checker
> fired two alerts — change-class undeclared, and governance overdue — and both were correct. Step 1
> exists so the class is declared *before* code, and I inverted it. Recorded rather than backdated.

---

## 1. WHY THIS BATCH EXISTS — IT IS A SWITCH-ON, NOT A BUILD

Kyle refused to accept that a defect this fundamental had never been considered and directed a
provenance read of `bridge/canonical/` and the pre-governance archives. **He was right.**

**Directive 8.9.5, `92e9c15fc`, 2025-12-30T22:40Z — ninety minutes after the mini-book was created:**

> *"Implement the Mini-Book Integrity Monitor (MBIM) … audits WebSocket Mini-Book mid-prices against
> REST midpoint values every 5 minutes, logs deviations exceeding 0.2%, and triggers a soft resync."*

**VERIFIED it detects OUR defect, not merely something adjacent:** `getLatestPriceData`
(`kraken-websocket-adapter.ts`) reads `this.orderBooks`, takes `Math.max(bids)` — **precisely the
ghost-bid value behind `#741`** — and its own comment says *"from mini-book for integrity
monitoring."* MBIM compares that against `restMid = (restBid + restAsk)/2` from an independent REST
call (`:148`) and flags `driftPct > MAX_DRIFT_PCT = 0.2` (`:39`, `:152`).

⛔ **IT HAS NEVER RUN.** `start()` was called from **exactly one place** — a manual API route
(`routes.ts:826`) — **not** in `server/index.ts`, **not** in `server/startup/*`. **Zero `[8.9.5][MBIM]`
lines in the current log or any retained log.** ⚠️ **It would have fired continuously for months —
but do NOT size that off 31.08%: that is the PRE-FIX comparator** (the counter's own docblock says so),
and post-hotfix `crossedDetections` reads **0**. **The forward drift rate is UNMEASURED, and that is
precisely why this monitor is worth switching on** (Langston).

⇒ `CONDUCT.md` §1 — *use what already exists before proposing new code*. Langston had approved me to
**build** a divergence instrument; building one beside a dormant instrument specified for the same
purpose would have been the duplicate-mechanism failure this arc already cost a night on.

## 2. OBJECTIVES

| # | Objective | Verified when |
|---|---|---|
| **OBJ-1** | MBIM starts at boot, not by manual API call | `[8.9.5][MBIM] Integrity monitor started` in the deploy's logs |
| **OBJ-2** | It actually audits and reports | `[8.9.5][MBIM] <symbol> WS=… REST=… Δ=…%` lines appear within ~30s of boot |
| **OBJ-3** | **Its REST load is bounded** | ⚠️ **CORRECTED (Langston):** these calls do **NOT** consume the price-cache budget — `makePublicRequest` (`kraken.ts:187`) is a **bare `fetch` with no limiter**, so they **compete with that budget from outside**. The bound is the slice plus a `finally`-guaranteed 100 ms floor. **The 100 ms is a FLOOR, so the pass ceiling is 10 req/s; actual is `1/(100ms + RTT)` and RTT is UNMEASURED** — stated as a ceiling, not quoted as a rate. Verified by: no rate-limit errors in the deploy window |
| **OBJ-4** | Full universe coverage despite the bound | cursor advances per pass; all 291 symbols seen within ~50 min |

## 3. ★ THE SWITCH-ON IS NOT A ONE-LINER, AND THE REASON IS THE POINT

`runAudit` looped **every subscribed symbol** — **MEASURED 291 live on staging** — with a sequential
`krakenService.getTicker(pair)` each.

⛔ **THAT IS NOT A NEUTRAL COST — AND MY FIRST STATEMENT OF *WHY* WAS WRONG IN THE DANGEROUS
DIRECTION.** This section originally argued the cost mattered because `price-cache.ts` holds Kraken
under 10 weighted req/s. **Langston showed that premise is false for this path:** `getTicker` →
`makePublicRequest` (`kraken.ts:187`) is a **bare `fetch` with NO limiter**, so MBIM's calls **never
enter that budget — they compete with it from outside.** My argument made the bound look *safer* than
it was. Corrected here rather than annotated.

⚠️ **AND THE ONE REAL BOUND WAS DISARMED.** The 100 ms spacing sat at the bottom of the `try`, below
the drift branch — skipped by all four `continue`s **and** by the `catch`. `makePublicRequest`
**throws on any Kraken `data.error`, which is exactly what a rate-limit response is** ⇒ **the backoff
switched itself off precisely on the failure it exists to back off from.** Now in a `finally`.

**Fix: a rotating slice + a guaranteed floor.** `AUDIT_SLICE = 30` per 5-minute pass, `take` clamped
to the universe size (unclamped it **double-audits** when N < 30 — reachable at boot, since the first
pass fires 30 s after `start()`), cursor wrapping ⇒ full coverage in **~50 minutes for a STABLE
universe** (the cursor indexes `Array.from(a Set)`, so an unsubscribe shifts later indices and a
symbol can be skipped for a cycle — self-healing, but the qualifier is required).

## 4. CHANGE-CLASS REASONING

`non_architecture`: no new component (the service has existed since 2025-12-30), no decision path
touched, no schema change. The diff is one boot-path line, a load bound, and the removal of a
remediation call. **It observes and logs; it changes no trading behaviour.**

**★ AND THAT IS ONLY TRUE BECAUSE OF BLOCKER-3.** An earlier revision of this section said the drift
branch's `triggerSoftResubscribe` was *"pre-existing behaviour, not introduced here"* — **which was
the wrong test.** Switching a dormant service on **introduces every action it takes**, pre-existing or
not. That call reaches `softResubscribe:3343` → **`this.orderBooks.delete(symbol)`**, and
`getBookForFill:3221-3223` returns null on an empty book behind the **FAIL-CLOSED #295 depth gate** —
so remediating drift can silently block a promotion. **This batch is now LOG-ONLY.** Remediation stays
homed at `#506`/`#507`'s Phase-20 WS-lifecycle item, where it already has an owner (CC-B).
⚠️ That limb is **2025-12-30 code written BEFORE the depth gate existed**, so *"does it still fit
today's architecture?"* is a live question — and one this scope failed to ask until Langston did.

## 4.a ★ PRE-REGISTERED EXPECTATION, read from the live instrument BEFORE deploy (Langston's condition)

**Why this exists: a monitor finding nothing reads identically to a monitor not running.** Without a
stated prior, OBJ-1 and OBJ-2 get verified against nothing.

`GET /api/active-engine/book-integrity` on staging, **2026-08-24**, since `2026-08-22T22:00:55Z`
(uptime 35.8 h):

| counter | value |
|---|---:|
| `updatesApplied` | **60,613,564** |
| **`crossedDetections`** | **0** |
| `matches` | 3,352 |
| `mismatches` | 60,610,212 |

⇒ **THE PREDICTION: MBIM should report near-zero drift.** `crossedDetections = 0` over 60.6 M updates
says the truncation fix is holding, so the book mid should track the REST mid.

**★ AND THE TWO INSTRUMENTS DISCRIMINATE, which is the real value of pre-registering this.** If MBIM
reports *substantial* drift while `crossedDetections` stays 0, that is **not** a contradiction — it is
the **non-crossing ghost** Langston named: a stale bid sitting *below* the ask but *above* the true
bid poisons the midpoint and never crosses, so the crossed-detector is structurally blind to it.
**That case is currently uninstrumented, and MBIM is the only thing that would see it.**

⚠️ **`mismatches` 60.6 M vs `matches` 3,352 is NOT an integrity signal** — the checksum is inert
without per-symbol precision (`#507` remainder). I flagged it as *"unresolved — either that
measurement was scoped to a few symbols or precision coverage has REGRESSED."*

✅ **RESOLVED BY LANGSTON, and leaving it "unresolved" would have been its own false claim** — it
implies a regression that is not there. **The two figures measure DIFFERENT CODE.** Staging
`e6f7c70b3` has **0** occurrences of `symbolPrecision` (positive control: **3** at `481bda9e3`) and
computes `computeBookChecksum(raw)` with **no precision argument**, so essentially every attempt
mismatches **by construction** — hence 60.6 M. My 34,549/34,549 was measured at `3bd9f4022` with the
feed live. **Adjacent objects, not a before/after. `#507`'s remainder is NOT bigger than recorded.**

## 4.b ⛔ THE COMPARATOR LOSES REACH ACROSS THE DEPLOY BOUNDARY — Langston, and it is not my diff

The checksum chain **is armed in the adapter at this ref and is NOT on staging today.** Its mismatch
arm `continue`s, and that `continue` sits **ABOVE** the crossed-book detector — so **post-deploy a
resubscribing update never reaches `crossedDetections`.**

⇒ **`crossedDetections = 0` at `e6f7c70b3` and at `481bda9e3` ARE NOT THE SAME MEASUREMENT.** §4.a's
pre-registration is still worth having, but **the zero must not be read across the boundary as a
continuity it has not earned.** Stated here and repeated in the Step-8 note.

**★ TRIP CONDITION, NAMED BEFORE THE PULL (Langston's condition — a threshold set afterwards is a
rationalisation).** First-hour read of `matches` / `mismatches` / `skippedNoPrecision` off
`/api/active-engine/book-integrity`. **DISARM** — revert the deploy — if **`skippedNoPrecision`
exceeds 20% of book updates after the first 10 minutes** (the instrument feed has gone partially
unmapped, so verification is failing open across a fifth of the book), **or** if
`mismatches / attempts` exceeds **5%** once precision is mapped (a real desync storm, not a
formatting artefact). ⚠️ **34,549/34,549 was a HARNESS; production is 291 symbols with an instrument
feed that can go partially unmapped** — do not expect the harness number.
**HOME: `B-BOOK-TRUNCATE-HOTFIX` (open in the ledger), owner CC-C, same deploy window.**

## 5. OUT OF SCOPE

- **Acting on what MBIM reports.** This batch makes the signal exist. Bounding staleness is **F-C**
  (`#743`); tiering the history is **F-E**.
- **Batching the REST call.** `getTicker()` with no argument returns all pairs in one request and
  would remove the bound entirely — **deliberately not taken here**, because Kraken's response keys
  are its own pair names and mapping them back is a correctness risk this batch does not need.
  Homed as a follow-up if the rotation proves too slow.
- **`price-cache.ts` itself** — LOCKED. Nothing here touches it.
