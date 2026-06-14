Alerts queue clean — one scheduled item (B-NEW-53 parity re-run) due 2026-07-05, not yet fired. Nothing active and due. Proceeding to the review.

---

**APPROVE-WITH-CONDITIONS.**

Verification anchor (proving I read the right file): the inbox file's §3 measurement is "Friday 2026-06-12 ... ~7.9M ticks, 485 symbols," RTH-core p99 inter-tick gap **8.75s**, and the freshness threshold resolves to **max(15s, 13.1s) = 15s** with the 15s floor governing. That's the artifact I'm reviewing — P19-B4a chunk C3, scope A2, not whatever MEMORY's current-state block says.

The three-gate architecture is sound and the measurement is decision-grade — you measured instead of guessing, the freshness floor is justified, and Q5's load-bearing argument is exactly right. Four conditions, one of which is a real bug in 6c.

---

**Q1 — session boundary: agree on RTH 09:30–16:00, DB-resolved. The "empirical vs hardcoded" framing is a false dichotomy here — the evidence POINTS to RTH.**

Your own discovery-rate table makes the call: hour 9 jumps to 20.2%, 10–15 holds 11.6–19.2%, 16 spikes to 21.9% on the close auction, and pre/after-hours collapse to 2–7%. The empirically-tradeable window and ARCA RTH are the same window in this data. So use 570/960 ET-minutes, resolved from `module_constants` for `xstock_spot` (open/close ET minutes), fail-CLOSED if missing. That gives you the evidence-derived boundary AND rule-15 cleanliness AND Kyle's config-widen lever in one move.

On proceeding-then-confirming overnight: **I'm fine with it, and here's the principled reason** — your conservative default fails SAFE. RTH-only under-fills (skips a dispatch, retries next cycle); it never mis-fills. And it's config-widenable without a code change, so Kyle "widen the window" in the morning is a one-row update, not a re-batch. A reversible, fail-safe default is exactly the kind of decision the §5 delegation says we don't wake Kyle for overnight. Flag it to him in the morning as you planned; don't block the run.

One framing nit per §16: in the code/governance, name this a **fill-quality liquidity gate**, not a "session" or "market-hours" gate — `isXstockTradeableSessionET` reads close to a market-hours claim and that's the exact rule-17 confusion you're trying to avoid. Consider `isXstockLiquidFillWindowET` or a clear header comment. Minor, but it'll save a future reader from re-litigating rule 17.

---

**Q1 condition (CHANGE, must be homed): the clock-only session gate has a holiday/half-day hole, and it leaks through the load-bearing gate.**

The audit itself flags "no US-holiday gate." Walk the failure: July 4th, 11:00 ET. Clock says in-window → session gate PASSES. ARCA is closed, so `last` barely moves — but `captured_at` is fresh (the token feed is 24/5) → freshness gate PASSES. **Both gates pass and you fill on a holiday reference price that hasn't moved in hours.** That's the identical fresh-`captured_at`-but-stale-`last` failure mode the session gate exists to stop (your Q5 case) — just leaking through a different door. Same for half-days (early close 13:00 ET): the gate permits fills 13:00–16:00 onto a closed book.

This doesn't have to ship fixed in B4a (dormant until B7b), but per §13 + §15 it needs a **named home decided now**, not "later." Two options, pick one with me:
- **(a)** A US-equity-holiday/half-day calendar predicate folded into the fill-window check — homed to a named sub-batch before B7b enables fills.
- **(b)** The more robust long-term answer: a **price-discovery-liveness gate** — require `last` to have actually moved within the last N minutes / M snapshots for the symbol before permitting a fill. That directly measures tradeable-ness and is immune to holidays, half-days, AND DST/clock bugs in one stroke; it can piggyback on the freshness query (same per-symbol read). I lean (b) as the eventual gate and (a) as the stopgap if (b) slips past B7b. Either way: **B7b must not flip active fills on with this hole open.** Name the home in RUNNING_ISSUES + the roadmap before you close C3.

---

**Q2 — freshness threshold: agree on max(15s, p99·1.5). DB-resolve it NOW, not "constant + homed follow-up."**

The margin (p99 rounded up +50%, floored 15s) is reasonable and the 15s floor giving ~1.7× headroom over RTH p99.9 (28.7s)… wait — 15s is BELOW p99.9. That's intentional and fine: ~0.1% of legitimate RTH inter-tick gaps exceed 15s, so a tiny fraction of dispatches get a 1-cycle skip-and-retry. For a fill gate that's the correct bias (skip-and-retry costs nothing; filling on a 30s-stale price costs real money). Just confirm the block is counted-skip-and-return (it is, in 6b) and not a hard error — good.

But on DB-resolution: shipping a constant-in-gate "with a homed follow-up to DB-resolve" is the rule-11 patch path. You already have the `module_constants` + `xstock_spot` plumbing in this very batch for the session window; resolve `active_fill_max_age_ms` through the same read now. No reason to ship the patch version when the proper version is the same wiring you're already adding.

---

**Q3 — watchdog: agree on the principle, but 6c has a real bug — you're gating the stall watchdog on the FILL window, which blinds it 75% of the time.**

This is the most important condition. The watchdog's whole job (audit-4 R1) is catching a feed that dies on an OPEN socket. In 6c you gate it on `isXstockTradeableSessionET()` — the RTH fill window. So if the socket goes silent at 16:30 ET and stays dead all night and pre-market, **nothing reconnects until 09:30 the next day.** That's ~17 hours of dead feed, VTS learning from nothing, and the silent-stall watchdog asleep through exactly the silence it exists to catch.

The fill gate and the watchdog gate are two different predicates:
- **Fill gate** → RTH liquid window (`isXstockLiquidFillWindowET`). Correct as you have it.
- **Watchdog** → the **feed-live window** = the 24/5 boundary (`isXstockMarketOpenUTC` / `!isInXstockWeekendClose`). The feed *should* be live 24/5, so the watchdog must cover 24/5 and only sleep on the weekend close.

The catch that makes this non-trivial: off-RTH legitimate gaps are large (your off-RTH p99 = 192s, p99.9 = 1253s). A single 24/5 threshold tight enough to catch an RTH stall fast (~60s) would false-reconnect constantly off-RTH; a single threshold loose enough to not thrash off-RTH (~1300s) is uselessly slow during RTH. So **make the stall threshold session-aware (two-tier), both DB-resolved**:
- `stall_reconnect_ms_rth` ≈ 60–90s (above RTH p99.9 of 28.7s with margin) when in the liquid window,
- `stall_reconnect_ms_offrth` ≈ 600–900s (above off-RTH p99 of 192s with comfortable margin; accept that genuine 20-min off-RTH lulls are rare and a reconnect on one is cheap/idempotent) otherwise.

Watchdog runs across the full feed-live window; threshold switches by session. That catches RTH stalls fast (protects fills) and off-RTH stalls within ~10 min (protects VTS) without thrashing. Keep the dedup'd `critical` alert.

---

**Q4 — reconnect mechanism: agree, close-the-socket to reuse the existing backoff path.** That's the rule-11-clean answer — one reconnect path, not two parallel ones. The OPEN-readyState guard is already there; add a guard against firing when a reconnect is already pending (don't close a socket that the close-handler is mid-reconnecting) so the watchdog and an in-flight backoff don't race. Minor.

---

**Q5 — session gate load-bearing on top of freshness: strongly agree, YES.** Your reasoning is airtight and the data proves it: freshness reads `captured_at` age; it is structurally blind to fresh-`captured_at`-but-stale-`last`. The 1.9–2.4% after-hours movement rate on a fresh feed IS the empirical proof — a 03:00 ET dispatch passes freshness (2s-old snapshot) onto a price that hasn't moved in an hour, and only the session gate blocks it. Not redundant; it's the primary defense against the exact R1 case. (Which is also why the holiday hole in Q1 matters — it's a leak in the load-bearing member, not a cosmetic one.)

---

**One infra check to add to the test list:** the freshness query is `SELECT max(captured_at) ... WHERE symbol=$1` against an append-only table taking ~7.9M rows/session. Confirm an index on `xstock_spot_ticker_snap (symbol, captured_at DESC)` exists — without it that per-dispatch read degrades to a scan as the table grows. If it's missing, add it in this batch.

---

**Summary of conditions before C3 closes:**
1. **(CHANGE — 6c bug)** Watchdog gates on the 24/5 feed-live window, not the RTH fill window; two-tier session-aware stall threshold, both DB-resolved.
2. **(CHANGE — must be homed per §13/§15)** Holiday/half-day hole in the session gate — name a concrete home (sub-batch or roadmap item) before B7b enables fills; my lean is the price-discovery-liveness gate as the durable answer.
3. **(rule-11)** DB-resolve `active_fill_max_age_ms` now via the same `module_constants`/`xstock_spot` wiring, not constant-plus-follow-up.
4. **(infra)** Confirm/add the `(symbol, captured_at DESC)` index.

Q1 session boundary, Q4 reconnect mechanism, and Q5 load-bearing call: approved as proposed. Proceed overnight on the conservative RTH default; flag the fill-window policy to Kyle in the morning. Land conditions 1 and 3 in the diff, conditions 2 and 4 homed/verified before close — I'll check all four at Step 4.
