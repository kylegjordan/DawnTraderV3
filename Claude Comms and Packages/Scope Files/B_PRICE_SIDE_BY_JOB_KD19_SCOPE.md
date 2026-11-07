# B-PRICE-SIDE-BY-JOB — KD-19 (b) + (c) — STEP 1 SCOPE ADDENDUM

change-class: architecture (the batch's declared class; this addendum adds objectives, it does not re-declare)

**Owner:** CC-C (Analyst Claude). **Batch:** `B-PRICE-SIDE-BY-JOB` (plan row 17, row `3n`). **Directive:** Kyle, KD-19 (2026-11-04, `1-system-manual/pm/DECISIONS.md:42`): *"VTS exit pricing matches paper: (a) finish VTS xStock exits on the real sell side instead of the midpoint; (b) book VTS exits with the same order-book walk paper uses, not the single best price; (c) then remove the fixed 0.05% per-leg slippage allowance."* (a) is delivered (`8a-P4c` incs 2-3, closed 2026-11-06). This addendum scopes (b) and (c). Written 2026-11-07 ~00:50Z.

---

## 1. What exists today (architectural read + measurements)

| object | today | source |
|---|---|---|
| paper close | walks the BID side at the position's quantity, always full-fills (`closeFillFull`, `server/services/execution/depth-walk.ts`), remainder beyond captured depth priced at the worst bid worsened by a DB-resolved per-class penalty | the file header; the engine close seam `active-execution-engine.ts:4497` |
| VTS close | books ONE price: the top-of-book bid that decided the exit (`resolveVtsBookedExitPrice`, `server/core/trading/vts-exit-booking.ts`); a missing bid or mark books nothing (`timeout_unpriced`, `3n.q3`) | the file header |
| VTS friction | `composeVtsLegFriction` (`server/core/trading/vts-friction.ts:42-46`): entry fee + exit fee + **`slippage × 2`** + a half-spread only on a leg booked at a level; `slippage` is `costMetrics.slippage` at open (`vts-runner.ts:2565` and `:2799`, xStock `eval-cycle.ts:1221`) | the code |
| VTS trade size | `vts_open_trades` carries `quantity` and `position_size` (265,247 rows: crypto 199,073, xStock 66,174) | DB, 2026-11-07 |

**THE COVERAGE FACT THAT SHAPES (b) — measured 2026-11-07 ~00:45Z, level-basis funnel, one process lifetime (boot 2026-11-05T14:39:52Z), cell `vts:crypto_spot:vts_exit_trigger:book`:** **3,803 of 51,160 VTS crypto exit attempts (7.4 %) had an order book usable at that moment** — `no_book` 37,518 (73.3 %: the symbol has no book subscription), `stale_book` 9,831 (19.2 %), `implausible_spread` 8. Control, same instant: the ACTIVE exit cell accepts the book on 85,899 of 97,124 (88.4 %) — the active lane trades a few subscribed symbols; the VTS trades the universe. Attempts, not distinct exits.
**xStock has no depth at all on either lane** — top-of-book bid/ask plus their sizes (`xstock_spot_ticker_snap.bid_qty`/`ask_qty`); the 20-level xStock book is plan row 189a, never built (`#949`, D3).
⇒ **"the same walk paper uses" can be done literally on ~7 % of VTS crypto exits and on no xStock exit.** Everything else has one price level and its size.

## 2. Provenance (tier 1 — behaviour this addendum changes)
Corpora searched: `BATCH_CATALOG`, the `8a-P3` progress report, `RUNNING_ISSUES` (`#914`, `#1118`), the scope's own D-table, and `git log -S` (not path-limited).
- **`closeFillFull`** — introduced `b74526dc3` (2026-06-16), *"P19-B4b.1 Step-3: depth-walked paper fill + partial-open + #295 24/5 book-depth-sufficiency gate (DORMANT til B7b)"*. Built as *"the honest friction model for the active paper fill … Replaces the flat 0.05% slippage on the active seam"* (file header). **Disposition (1): still relevant and correct — reused unchanged.**
- **`resolveVtsBookedExitPrice`** — introduced `d3e643032` (2026-09-02), *"F-G-2 Step 3: OBJ-0 shadow arm (crypto bid vs live mid), OBJ-5a/5b/5c — VTS books realistic exits and honest maker fees, one vts epoch bump"*; moved to the bid by `8a-P3`, clamp arms book nothing since `3n.q3`. **Disposition (2): relevant, updated to today's intent** — KD-19 (b) asks it to book the walk where depth exists.
- **`composeVtsLegFriction`** — introduced `eea2dca65` (2026-09-30), *"B-PRICE-SIDE-BY-JOB 8a-P4c Step-3, increment 3a-ii: P14 per-leg VTS friction, recomposed at close (plan §C3.8, #1118)"*. The `slippage × 2` term predates it (Directive 11.3B, the flat allowance P19-B4b.1 already retired on the active seam). **Disposition (2): updated** — (c) removes the allowance where the booked price already carries the impact.
Tier 2 (read only): `tec-evaluator.ts` (the trigger; unchanged), `calibration-epoch.ts` (the epoch bump mechanism; used, unchanged).

## 3. Objectives

| # | objective | verification |
|---|---|---|
| **K1** | **(b) Where a usable book exists at the exit, VTS books the walk** — `closeFillFull(quantity, bids, penalty)` with the SAME function and the SAME per-class penalty source paper uses; the booking arm records `walk`. | Unit: a fixture book and quantity give the identical price to the paper seam's call; a mutation that books the top bid instead fails. Live: post-deploy VTS crypto closes on the `walk` arm carry a price ≤ the top bid. |
| **K2** | ~~Where no usable book exists, VTS books the top-of-book bid … arm `bid_top`~~ **(corrected per Coltrane's D-1 ruling, below): ONE mechanism everywhere — `closeFillFull` over whatever valid fresh depth exists: a full book is walked; a valid top-of-book with its size is walked as ONE level and the excess takes the existing beyond-depth penalty; a valid bid with no size gives zero walked quantity and the whole quantity is extrapolated under D8; no valid fresh bid ⇒ refuse (D3, the existing no-decision path). Every close records its SOURCE basis unchanged (`book_top` / `ticker_bbo` / … — never replaced by a model label), plus the model arm and the WALKED vs EXTRAPOLATED quantity (D8, `PRICING_DECISIONS_2026-09-11.md:127-133`); `top_size_exceeded` may be a derived convenience flag.** | Unit: each of the four input shapes; the source basis survives; walked + extrapolated = quantity. Live: the arm and walked/extrapolated mix are reported (book-depth walks expected on ~7 % of crypto attempts, none on xStock). |
| **K3** | **(c) The fixed slippage term is removed from VTS friction on a leg whose price is a walk** (the walk already carries the impact). On a `bid_top` leg it is removed only when the quantity fits inside the top level; when it does not, the leg keeps an impact charge (decision D-2 below). | Unit per arm; the friction columns still sum to the booked cost (the P19-B8.7 split). |
| **K4** | **One `crypto_spot/vts` epoch bump** (and `xstock_spot/vts` if K2/K3 change xStock booking), dated by deploy (`ADJUSTMENT_FRAMEWORK` rule 7). | Read the epoch rows after deploy. |
| **K5** | **The walk needs a fresh book, judged by the same freshness rule the VTS exit trigger already uses** — no looser ceiling for booking than for deciding. | Unit: a stale book ⇒ `bid_top`, not `walk`. |

## 4. Decisions to settle at Step 1 (owner + Langston + Coltrane, KD-34 — technical, not Kyle's)
- **D-1 — the 93 % without a book.** (A) walk where a book exists, top bid otherwise, named per arm (**recommended**: honest about what was seen, no new transport, the arm becomes a stratification key); (B) refuse to book without a book — turns most VTS exits into unpriced closes, defeating the learning lane; (C) subscribe books for the VTS universe first — a transport change and its own batch, which would need a slot on Kyle's list. **KD-19's words say "the same walk"; (A) is the literal reading wherever a walk is possible. Whether (A) satisfies Kyle's intent or (C) is needed is the one point that may need Kyle — flagged, not assumed.**
- **D-2 — `bid_top` legs larger than the top level.** Keep an impact charge (the existing `slippage` value, or the walk's beyond-depth penalty applied to the excess), or drop it. Recommendation: apply the same beyond-depth penalty `closeFillFull` uses to the excess — one rule for "beyond what we saw" in both lanes.
- **D-3 — order.** KD-19 says (c) follows (a) and (b) being live. K3 ships in the same deploy as K1/K2 but only on arms where (b) holds; the epoch bump marks the boundary.

## 5. Not in scope
The VTS ENTRY side (a separate KD-19 reading would be needed; KD-19 names exits). The 20-level xStock book (row 189a). Book subscriptions for the VTS universe (D-1 option C — its own batch if chosen). The paper seam (unchanged).

## 6. Honest limits
The coverage figure is one process lifetime of in-memory attempts, not distinct exits, read at the deployed build `0f4835b5a` (staging is a day behind the branch until the 2026-11-07 joint deploy). `NOT RE-READ` by a second reader: the D-1 recommendation (a mechanism and coverage claim) — Langston is the first second pass.

### ✅ D-1 RULED 2026-11-07 (Coltrane, KD-34; Discord inbox ~00:58Z): **(A), corrected — (C) is not a prerequisite and does not go to Kyle first.**
KD-19's "same walk" means the same `closeFillFull` mechanism and the D8 completion rule, not universal 20-level coverage: the governing record already says a market sell walks the available bid depth and models the missing depth (`PRICING_DECISIONS_2026-09-11.md:30-35`), and D8 keeps full completion with walked vs extrapolated quantity on every close (`:127-133`); a missing valid bid refuses under D3 (`:52-76`). K2 above is rewritten to that rule, and the source basis is never replaced by a model label. (C) would raise coverage — the measured 3,803 of 51,160 motivates it — but it is a transport batch needing Kyle's slot, not a KD-19 (b) dependency. D-2 is subsumed (the beyond-depth penalty on the excess is the D8 extrapolation). Coltrane's ruling covers D-1 only; Step-1 approval is Langston's review of this file.

