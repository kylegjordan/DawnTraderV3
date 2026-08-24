# B-MBIM-SWITCH-ON — PRE-IMPLEMENTATION AUDIT + IMPLEMENTATION PLAN

> **Owner:** Claude Analyst (CC-C) · **change-class: non_architecture** · **Deployed `afb7d326c`**
> ⛔ **WRITTEN AFTER IMPLEMENTATION, 2026-08-24.** The governance checker raised
> `Missing required governance doc: pre_audit` and it was **correct**. Recorded, not backdated —
> the alert is the only independent signal the step was skipped, and a plausible document silences it.

---

## 1. WHAT WAS GENUINELY AUDITED BEFORE THE CODE — AND IT IS THE REASON THE BATCH EXISTS

★ **THE PROVENANCE READ (§9.5(b)) WAS DONE FIRST, AT KYLE'S DIRECTION, AND IT CHANGED THE WHOLE BATCH.**
He refused to accept that a defect as fundamental as `#741` had never been considered and sent me to
`bridge/canonical/` and the pre-governance archives. **He was right.**

**Directive 8.9.5, `92e9c15fc`, 2025-12-30T22:40Z** — ninety minutes after the mini-book was created —
specifies the Mini-Book Integrity Monitor: audit the book midpoint against an **independent REST
midpoint** every five minutes, flag drift over 0.2%, trigger a soft resync.

**VERIFIED IT DETECTS OUR DEFECT, not merely something adjacent:** `getLatestPriceData` reads
`this.orderBooks` and takes `Math.max(bids)` — **precisely the ghost-bid value behind `#741`** — and MBIM
compares it against `restMid = (restBid + restAsk)/2` from an independent REST call (`:148`), flagging
`driftPct > MAX_DRIFT_PCT = 0.2` (`:39`, `:152`).

⇒ **THE PLAN CHANGED FROM BUILD TO SWITCH-ON.** Langston had already approved me to *build* a divergence
instrument. Building one beside a dormant instrument specified for the same purpose would have been the
duplicate-mechanism failure this arc had already cost a night on (`CONDUCT.md` §1 — *use what already
exists before proposing new code*).

## 2. THE ENTRY-POINT ENUMERATION (§9.5(a-ii)) — RUN, AND IT RETURNED EXACTLY ONE

**Question: what starts this service?** Repo-wide grep for `miniBookIntegrityMonitor.start`, tests excluded:

| call site | verdict |
|---|---|
| `routes.ts:826` — a manual API route | the only one |
| `server/index.ts` | **absent** |
| `server/startup/*` | **absent** |

★ **EXACTLY ONE, AND I SAY SO EXPLICITLY** because an asserted absence needs presence-evidence (rule 22).
**Corroborated independently:** zero `[8.9.5][MBIM]` lines in the current log or any retained log — and
the positive control is that the service's own start line is unconditional, so if it had ever run the
line would exist.

## 3. ⛔ WHAT THE AUDIT DID *NOT* ASK, AND IT IS THE ONE LANGSTON BLOCKED ON

I enumerated **what STARTS the service.** I never enumerated **what the service DOES once started.**

**The census question I skipped:** *for each action this component takes, does that action still fit
today's architecture?* `runAudit`'s drift branch calls `triggerSoftResubscribe` →
`softResubscribe:3343` → **`orderBooks.delete(symbol)`**, and `getBookForFill:3221-3223` returns null on
an empty book, read by `depth-source.ts:43` behind the **FAIL-CLOSED `#295` open-depth gate**
⇒ **remediating drift can silently block a promotion.**

⚠️ **That limb is 2025-12-30 code written BEFORE the depth gate existed.** My scope excused it as
*"pre-existing behaviour of the service as designed, not introduced here"* — **the wrong test.
SWITCHING A DORMANT SERVICE ON INTRODUCES EVERY ACTION IT TAKES.** Opened as
`pre-existing-therefore-fine` in `MISTAKE_PATTERNS.md`.

## 4. LOAD ANALYSIS — AND MY FIRST VERSION OF IT WAS WRONG IN THE DANGEROUS DIRECTION

`runAudit` looped **every subscribed symbol — MEASURED 291 on staging** — with a sequential
`krakenService.getTicker(pair)` each.

⛔ **I argued this mattered because `price-cache.ts` (a LOCKED module) holds Kraken under 10 weighted
req/s. FALSE for this path.** `getTicker` → `makePublicRequest` (`kraken.ts:187`) is a **bare `fetch`
with NO limiter**: these calls **never enter that budget — they compete with it from outside.** My
argument made the load look *safer* than it is. **This is the audit failure, not merely a wording one:
I reasoned about a limiter without following the call path to see whether it was on it.**

**What is actually true, and is the real cost:** `makePublicRequest` **throws on any Kraken `data.error`
— which is exactly what a rate-limit response is** — and a REST failure pushes `fetchLivePrice` into its
`last_known_good` legs (`#743`), so an unbounded pass would have **aggravated the very staleness defect
this monitor exists to detect.**

## 5. THE PLAN AS IMPLEMENTED

1. `miniBookIntegrityMonitor.start()` in `server/index.ts` beside `systemHealth.start()`, paired `stop()`.
2. `AUDIT_SLICE = 30` with a rotating cursor; **`take` clamped to the universe size** (unclamped it
   double-audits when N < 30 — reachable at boot, and it WAS reached: the first live pass ran 6 symbols).
3. The 100 ms inter-call spacing moved into a **`finally`** — it had sat below four `continue`s and
   outside the `catch`.
4. The drift branch made **LOG-ONLY**; `triggerSoftResubscribe` retained, deliberately uncalled, rule-18
   docblock, reciprocal rider on `#507`.

## 6. SIM / SYSTEM MANUAL

**SIM: APPLICABLE and it was the real gap** — this component has existed since 2025-12-30 and **was never
in the map**, which is part of how it stayed dormant for eight months. Added at close.
**SYSTEM MANUAL: NOT applicable** — a monitoring service that observes and logs changes no architecture,
strategy logic, regime detection, filter design, signal pipeline or math. **Judged out loud, not skipped.**
