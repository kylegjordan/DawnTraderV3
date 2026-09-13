# `B-PRICE-SIDE-BY-JOB` ROW `8a` — MOVE THE EXIT TRIGGER OFF THE MIDPOINT

**Batch:** `B-PRICE-SIDE-BY-JOB` (`3n`) · **Row:** `8a` · **Owner:** CC-C · **change-class: architecture**
**r1, 2026-09-13. KYLE-AUTHORISED: *"Make the change — move the trigger to the bid."***

> ⛔ **THIS IS D1, THE ROW THE WHOLE BATCH WAS FOR.** Everything shipped so far (`8f`, `8l`, `8c`) is admission, the xStock exit ladder, and a shadow. **The live crypto exit trigger has read the midpoint throughout** — `active-execution-engine.ts:2219`'s own comment: *"The live decision above read the book MID."*

---

## 1. THE RULE

**A long position is closed by SELLING. A sell transacts on the BID.** So the question *"has this position reached its stop / its target?"* must be asked of the price we could actually sell at, not of a midpoint that is the average of a price we could sell at and one we could buy at.

⛔ **THE ERROR IS A FULL SPREAD, NOT HALF** (Langston BLOCKER-2, 2026-09-03): entry is a BUY on the ask, stop and target are SELLS on the bid. They are opposite by construction.

---

## 2. THE EVIDENCE THAT THIS IS THE RIGHT CHANGE — the shadow, read 2026-09-13

`F-G-2` OBJ-0 has run the bid arm as a shadow since 2026-09-02. **41 closed crypto trades carry it.** The pre-registered 2×2:

| bid arm would exit | mid arm did | actual close | n |
|---|---|---|---|
| stop | stop | stop | **34** |
| target | target | target | **5** |
| ⭐ **stop** | **target** | target | **2** |

✅ **39 of 41 IDENTICAL — the switch is behaviour-neutral on 95% of this population.**
⭐⭐ **AND THE TWO DISCORDANT ROWS ARE ONE CASE TWICE, MEASURED:**

| | stop | bid at that instant | mid at that instant | outcome |
|---|---|---|---|---|
| `TRIA/USD` 09-05 | 0.004930 | **0.004920 — BELOW** | 0.004935 — above | ran to target, +$7.04 |
| `UNI/EUR` 09-11 | 5.021600 | **5.012100 — BELOW** | 5.025000 — above | ran to target, +$2.02 |

⇒ ⛔ **ON BOTH, THE PRICE WE COULD ACTUALLY HAVE SOLD AT WAS ALREADY THROUGH THE STOP AND THE MIDPOINT SAID IT WAS NOT.** The position ran on below its own stop and the market came back. **That is not the midpoint being right — it is the stop not being enforced.**
★ **KYLE'S RULING, and it is the one that governs:** risk limits are HARD BOUNDARIES, never dials (`CLAUDE.md` §0). **A stop that holds only when the midpoint agrees is not a stop.**
⚠️ **STATED HONESTLY: the switch would have given up ~$9.06 of realised profit across these 41** (total net −$108.95, 7 targets / 34 stops). **Two of seven winners were rescues.** The cost is real and small; the risk-control argument is what carries it, not the P&L.
⚠️ **`UNI/EUR` is a non-USD quote (`#966`/D9) so its dollar figure carries a conversion error. Direction unaffected — the bid was below the stop either way.**

---

## 3. ⛔⛔ THE SOURCE IS THE D3 LADDER, **NOT** THE RAW BOOK BID — AND THIS IS THE LOAD-BEARING DESIGN CALL

**The shadow used `fg2BookBid`, the raw maintained-book top. THE LIVE TRIGGER MUST NOT.**
⛔ **MEASURED TODAY: the trading socket carries a book for ONE symbol** (`venueTimestampPresence.book.distinctSymbols = 1`, and the adapter's own health line `- Subscribed Symbols: 1`, two independent instruments). **Gating the live exit trigger on the book bid would stop exits for every other symbol** — a fail-closed on the risk-control path, which is the worst possible direction.

✅ **`8c` ALREADY BUILT THE RIGHT SOURCE AND MEASURED IT: `selectTouchPrice` (`touch-price.ts:96`), D3's order — valid fresh book top → valid ticker sides within the age → REFUSE.** Its live reading on the active crypto lane: **37,199 of 37,220 = 99.94% can name a transactable basis**, against 0.089% for the book alone.
⇒ ★ **THIS ROW IS WHAT `8c` WAS BUILT FOR, AND SWITCHING IT ON IS WHAT LANGSTON'S HOLD WAS WAITING FOR** — his condition was *trigger first, then the level basis*, not *don't do it*.

⇒ **`currentPrice` for `evaluateTECExit` becomes `selection.quote.bid`.**

---

## 4. ⛔ ON REFUSAL: SKIP THE EXIT CHECK, NEVER FABRICATE

When the ladder refuses (no valid book AND no valid ticker sides within the age), **the exit check does not run for that position on that cycle.** It does **not** fall back to the midpoint — a fallback would reinstate exactly the defect this row removes, silently, on the rows where it matters most.
✅ **THIS PATH ALREADY EXISTS AND IS ALREADY GOVERNED:** it is the exit-freshness class (`#994`, plan row `3b.f-c`) under **Kyle's 2026-09-03 ruling — the exit standard does not loosen; keep the emit, cut the notify.** The refusal must carry its reason and increment the existing counter, so a rise in refusals is visible rather than silent.
⚠️ **AND THE RESIDUAL IS NAMED: a refused check is an UNGUARDED position for that cycle.** That is already true today whenever the mark is stale; this row does not create it, but it may change its RATE, and the rate must be measured (§7).

---

## 5. ⛔⛔ SCOPE BOUNDARY — THIS ROW MOVES THE **TRIGGER** ONLY

`currentPrice` on this path feeds **four** consumers, and they are four different jobs:

| consumer | job | in this row? |
|---|---|---|
| `evaluateTECExit({ currentPrice })` `:2174` | **TRIGGER** — has it reached stop/target | ✅ **YES** |
| `closePosition(id, currentPrice, …)` `:2056` and `exitProvenance.decisionPrice` | **BOOKING** — the price recorded | ⛔ **NO** |
| the P&L log `:1901` and `:1905`/`:1915` | reporting | ⛔ **NO** |
| the maker-rest trade-through test `:1966`-`:2028` | fill adjudication | ⛔ **NO** |

⛔ **BOOKING IS JOB 4 AND IS A SEPARATE ROW.** Changing what we RECORD alters historical P&L comparability and needs its own blast-radius measurement and its own `calibration_epoch` decision. **Moving both at once would make every resulting exit unattributable — the exact mixed-population failure Langston's hold was about, one layer down.**
⚠️ **CONSEQUENCE, STATED RATHER THAN DISCOVERED: after this row, the trigger fires on the bid and the exit books at the mid.** That is a KNOWN, DELIBERATE, TEMPORARY inconsistency, it is the conservative direction (we exit when genuinely through the stop, and record the same number we record today), and it is closed by the booking row.

---

## 6. POPULATION: **crypto_spot ONLY**

Matches the shadow's population exactly. xStock has no maintained book (`fg2BookBid` is `null` by construction) and its exit ladder is `8l`, already shipped. **xStock behaviour is byte-unchanged by this row.**

---

## 7. VERIFICATION — PRE-REGISTERED BEFORE ANY CODE

| | |
|---|---|
| **OBJ-1** | `evaluateTECExit` receives `selection.quote.bid` on crypto, and the value is the LADDER's, not the raw book's. Unit-tested with mutations. |
| **OBJ-2** | On ladder refusal the exit check is SKIPPED with a reason, and the midpoint is never substituted. **Mutation: make the refusal fall back to the mid — the test must go red.** |
| **OBJ-3** | xStock path byte-unchanged. |
| **OBJ-4** | **LIVE, POST-DEPLOY:** the refusal RATE on the crypto exit path, against the pre-deploy rate on the same counter. ⛔ **A material rise means positions are going unguarded more often and is a REVERT trigger, not a tuning input.** |
| **OBJ-5** | **LIVE:** the shadow keeps running. Post-switch the ARMS SWAP — the bid arm is live and the mid becomes the counterfactual — so the 2×2 stays readable across the boundary. **The boundary must be stamped; do not pool across it.** |

⛔ **WHAT THIS ROW DOES NOT CLAIM:** that it improves P&L. On the measured 41 it costs ~$9.06. **It is a risk-control correction, and it should be argued and judged as one.**
