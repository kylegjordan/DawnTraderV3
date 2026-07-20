# A decision for Kyle — should the system check that a price is believable before it closes a trade?

**From:** NEW Claude (CC-B) · **Reviewed by:** Langston (lock cleared 2026-07-20 — *"take it to Kyle as a decision, not a fix"*)
**Batch:** `B-XSTOCK-EXIT-PLAUSIBILITY` · Phase 19 · scope `afddc25d7`
**Why you and not us:** this adds a new rule about *when a position is allowed to close*. That moves risk, so it is your call, not something we agree among ourselves and ship.

---

## What happened

On 17 July one of your xStock positions was closed automatically at a price the market never traded at. The system recorded it as a stop being hit, at $369.51, and it sold.

We investigated it properly and the honest finding is: **nothing is broken.** The safety check that exists asks four questions about an incoming price — is the setting configured, did a price arrive, is it a real positive number, and is it recent enough? A wrong price that arrives promptly answers all four correctly. The check does exactly what it was built to do.

**The gap is that nobody ever decided whether we should also ask "is this price believable?"** Not a decision made badly — a decision never made at all. That is why this comes to you rather than getting quietly fixed.

## Why we cannot tell you how often this happens

We tried to prove exactly what the system saw at the moment of that trade. **We cannot.** The piece of information that would have settled it is worked out by the system, used to make the decision, and then thrown away. Six days later it is simply gone, and the server logs from that day have since been overwritten.

That is worth knowing in its own right: **it is the same record-keeping gap Analyst found earlier this week, and it just cost us a real answer.** It is recorded and scheduled separately; it is not part of this decision.

**What we do know:** six trades in the soak closed on prices that look wrong. Five of them were a different, already-fixed problem. **One is this problem.** So: at least one, in roughly two weeks of trading, on a small number of xStock positions.

---

## The decision

### First question: should we add a believability check at all?

**Option 1 — No. Leave it as it is.**
Prices arriving promptly are trusted. Occasionally a bad one closes a trade at a price that never existed. Costs nothing to build, nothing new can go wrong.

**Option 2 — Yes. Add a check.**
Before a price is allowed to trigger a stop, compare it against that instrument's own recent price history. If it looks impossible, refuse to act on it.

### Second question, and this is the real one: what happens when a price fails the check?

**If we refuse to act on a suspicious price, the position stays open and unevaluated.** That means a stop that *should* have fired, does not.

⚠️ **So the choice is not "bug versus no bug." It is choosing which failure you would rather have:**

| | What goes wrong | When it bites |
|---|---|---|
| **Do nothing** | a trade closes at a price that never existed | rare, and it has already happened once |
| **Add the check** | a trade that should have closed stays open | whenever the check wrongly refuses a real price |

**And the second one is more dangerous than it sounds**, because it fails *silently*. A phantom exit shows up in your trade list as a strange number you can see. A missed exit looks like nothing at all — the position is simply still open, quietly running past the level where it should have been cut, during exactly the kind of fast move that makes prices look implausible in the first place.

### The honest asymmetry you should weigh

**We know the cost of doing nothing: at least one bad exit in two weeks.**
**We do not know the cost of the fix.** How often a believability check would wrongly refuse a real price has not been measured, and it depends on settings we have not chosen yet.

**Langston caught a specific version of this that would have bitten immediately:** xStock prices legitimately jump when the market reopens after the weekend, by more than any normal intraday movement. A naively-built check would reject that first Sunday-evening price **every single week** — refusing real prices on exactly the instruments currently generating alerts. That is not a hypothetical; it is the design I was leaning toward until he pointed it out.

---

## What we recommend, and what we are not deciding for you

**Our lean is Option 2 — add the check — but built so that refusing a price is loud rather than silent**, and with the settings chosen only after measuring how often a check would refuse real prices in real xStock history. **We are not asking you to approve a design. We are asking whether the trade-off above is one you want us to make at all.**

**If you say yes**, the next step measures the false-refusal cost against real price history *before* anything is built, and the specific answer to "what happens on failure" comes back to you once we can tell you how often it would trigger.

**If you say no**, that is a legitimate answer and we record it as a decision made rather than a gap left open — which is the whole point of bringing it to you.

**One thing already settled and not up for debate:** any believability check compares an instrument against **its own price history only, never against a different exchange.** Checking one venue's price against another's is what produced an earlier round of phantom trades, and that path is closed permanently.

---

### Open design questions we own (not yours)

Once you rule on the *whether*, these are ours to work through with Langston: the exact shape of the comparison (Langston and I both lean toward a band scaled to the instrument's own recent volatility, built from prices we accepted rather than raw incoming ticks, referenced against a short rolling median rather than the single last price so that successive slightly-wrong prices cannot walk the reference away); and whether to build fresh or revive a retired setting (Langston ruled: **build fresh** — the retired one compared *different sources* against each other, which is the wrong shape and adjacent to the cross-exchange approach we have permanently closed).
