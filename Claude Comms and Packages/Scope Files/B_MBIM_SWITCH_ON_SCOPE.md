# B-MBIM-SWITCH-ON — SCOPE

change-class: non_architecture

> **Batch id:** `B-MBIM-SWITCH-ON` · **Owner:** Claude Analyst (CC-C) · **2026-08-23/24**
> **Part F piece:** **F-A** · **Code at `0b517faaf`** · ⛔ **NOT DEPLOYED**
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
lines in the current log or any retained log.** At the measured **31.08% crossed-book rate** it would
have fired continuously for months.

⇒ `CONDUCT.md` §1 — *use what already exists before proposing new code*. Langston had approved me to
**build** a divergence instrument; building one beside a dormant instrument specified for the same
purpose would have been the duplicate-mechanism failure this arc already cost a night on.

## 2. OBJECTIVES

| # | Objective | Verified when |
|---|---|---|
| **OBJ-1** | MBIM starts at boot, not by manual API call | `[8.9.5][MBIM] Integrity monitor started` in the deploy's logs |
| **OBJ-2** | It actually audits and reports | `[8.9.5][MBIM] <symbol> WS=… REST=… Δ=…%` lines appear within ~30s of boot |
| **OBJ-3** | **It cannot spend the Kraken budget the LOCKED price-cache module protects** | REST calls per pass bounded to `AUDIT_SLICE`; no rate-limit errors in the deploy window |
| **OBJ-4** | Full universe coverage despite the bound | cursor advances per pass; all 291 symbols seen within ~50 min |

## 3. ★ THE SWITCH-ON IS NOT A ONE-LINER, AND THE REASON IS THE POINT

`runAudit` looped **every subscribed symbol** — **MEASURED 291 live on staging** — with a sequential
`krakenService.getTicker(pair)` each.

⛔ **THAT IS NOT A NEUTRAL COST.** `price-cache.ts` is a **LOCKED module** (*"changes require a formal
directive"*, Directive 8.8.4-A4.R10R-4) whose entire stated purpose is holding Kraken **under 10
weighted requests/second**. And a REST failure pushes `fetchLivePrice` into its `last_known_good` legs
(`#743`). ⇒ **a naive switch-on would have aggravated the very staleness defect this monitor exists to
detect.**

**Fix: a rotating slice.** `AUDIT_SLICE = 30` symbols per 5-minute pass, cursor advancing and wrapping
⇒ full 291-symbol coverage in **~50 minutes**. Against **eight months** of this going unseen, an
hourly cycle is not a meaningful loss of sensitivity.

## 4. CHANGE-CLASS REASONING

`non_architecture`: no new component (the service has existed since 2025-12-30), no decision path
touched, no schema change. The diff is one boot-path line plus a load bound inside an existing
monitoring service. **It observes and logs; it changes no trading behaviour.**
⚠️ It *does* call `triggerSoftResubscribe` on drift — a real action on the WS adapter — but that is
**pre-existing behaviour of the service as designed**, not introduced here.

## 5. OUT OF SCOPE

- **Acting on what MBIM reports.** This batch makes the signal exist. Bounding staleness is **F-C**
  (`#743`); tiering the history is **F-E**.
- **Batching the REST call.** `getTicker()` with no argument returns all pairs in one request and
  would remove the bound entirely — **deliberately not taken here**, because Kraken's response keys
  are its own pair names and mapping them back is a correctness risk this batch does not need.
  Homed as a follow-up if the rotation proves too slow.
- **`price-cache.ts` itself** — LOCKED. Nothing here touches it.
