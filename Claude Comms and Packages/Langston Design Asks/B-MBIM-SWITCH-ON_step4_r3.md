# B-MBIM-SWITCH-ON — STEP 4, ROUND 3

**Ref: `481bda9e3`** on `migration/aws-supabase`. Read at the ref; my working tree is clean.
Prior rounds: r1 `0b517faaf` (BLOCKER-1, -2), r2 `96e5a86ea` (BLOCKER-3 + two notes).
**Scope:** `Claude Comms and Packages/Scope Files/B_MBIM_SWITCH_ON_SCOPE.md`
**Still NOT deployed** — staging runs `e6f7c70b3`.

---

## 1. BLOCKER-3 — DISCHARGED AS LOG-ONLY

Your ruling: *"the drift branch mutates the live trading path, and the scope gave that limb no
disposition."*

**Verified at source rather than accepted on your word:**

| site | what it does |
|---|---|
| `kraken-websocket-adapter.ts:3343` `softResubscribe` | `this.orderBooks.delete(symbol)` + `bookRaw.delete` + unsubscribe both channels + 500 ms + resubscribe |
| `:3221-3223` `getBookForFill` | returns **null** when `book.asks.size === 0 \|\| book.bids.size === 0` |
| `depth-source.ts:43` | reads it behind the **FAIL-CLOSED #295 open-depth gate** |

⇒ remediating drift **tears down the exact book a fail-closed gate reads**, and a promotion landing
in that window is a silent `no_book` skip.

**Change (`mini-book-integrity-monitor.ts:198`):** the call is replaced by

```
console.warn(
  `[8.9.5][MBIM][DRIFT] ${symbol} Δ=${driftPct.toFixed(3)}% exceeds ${this.MAX_DRIFT_PCT}% ` +
  `— LOG ONLY, no resubscribe (see #506/#507 Phase-20 WS-lifecycle for remediation)`,
);
```

`driftedSymbols.push(symbol)` is unchanged, so the returned summary and OBJ-2 verification are
unaffected. `triggerSoftResubscribe` is **retained, deliberately uncalled**, with a rule-18 docblock
saying so in those words — because **#507 already homes resubscribe-on-mismatch to CC-B** at the
Phase-20 WS-lifecycle item, and that batch wants the method.

**★ THE PART I THINK MATTERS MORE THAN THE FIX.** My scope had argued that limb was fine because it
was *"pre-existing behaviour of the service as designed, not introduced here."* **That is the wrong
test, and I want it recorded as such rather than quietly replaced.** Switching a dormant service on
**introduces every action it takes.** And the limb is **2025-12-30 code written BEFORE the depth gate
existed** — so *"does it still fit today's architecture?"* was a live question the scope never asked.
The scope now says that, in §4.

## 2. YOUR TWO r2 NOTES — BOTH LANDED

**(i) The stale sha.** `GOVERNANCE_EXCEPTIONS` row updated `0b517faaf` → `96e5a86ea`+ with your
reasoning named in the cell.

**(ii) The stamp order.** Cells left as written, per your ruling, with a line appended to the row
body: `confirmed_by: langston` was stamped **before** you ruled, you flagged it as a shape you have
bounced before, and **today's Step-4 ruling is the row's actual warrant.** Rewriting the cells would
obscure the sequence, which is the part worth preserving.

## 3. TWO OF MY OWN PREMISES CORRECTED **IN PLACE**

Not annotated. A correction sitting downstream of the wrong text is the failure I have now repeated
three times in this arc (the fence threshold, the maker premise in a file header, and nearly again
here), so both are rewritten where they stood:

| § | was | is |
|---|---|---|
| **§3** | *"`price-cache.ts` holds Kraken under 10 weighted req/s, so MBIM's calls cost against that budget"* | **False, and false in the DANGEROUS direction** — it made the bound look *safer* than it is. `getTicker` → `makePublicRequest` (`kraken.ts:187`) is a **bare `fetch` with no limiter**; these calls **compete with that budget from outside it.** |
| **§1** | *"at the measured 31.08% crossed-book rate it would have fired continuously"* | That is the **PRE-FIX comparator** (the counter's own docblock says so). Post-hotfix `crossedDetections` = **0**. **Forward drift is UNMEASURED — which is the actual argument for switching this on.** |

## 4. §4.a — THE PRE-REGISTERED EXPECTATION YOU REQUIRED

Your condition: *a monitor finding nothing reads identically to a monitor not running.*
Read from `GET /api/active-engine/book-integrity` on staging **before** deploy, uptime 35.8 h:

| counter | value |
|---|---:|
| `updatesApplied` | 60,613,564 |
| **`crossedDetections`** | **0** |
| `matches` | 3,352 |
| `mismatches` | 60,610,212 |

**PREDICTION: MBIM reports near-zero drift.**

**★ AND THE TWO INSTRUMENTS DISCRIMINATE.** If MBIM reports *substantial* drift while
`crossedDetections` stays 0, that is **not** a contradiction — it is the **non-crossing ghost** you
named: a stale bid sitting *below* the ask but *above* the true bid poisons the midpoint and never
crosses, so the crossed-detector is **structurally blind** to it. **That case is currently
uninstrumented and MBIM is the only thing that would see it.**

⚠️ **Flagged, not load-bearing:** `matches` 3,352 / `mismatches` 60.6 M does **not** match the
34,549 / 34,549 I recorded when the precision feed landed. Either that measurement was scoped to a
few symbols or precision coverage has regressed. **Unresolved.** The checksum is inert without
per-symbol precision (`#507` remainder) and its docblock says so, so I am **not** treating either
figure as an integrity signal — `crossedDetections` is what this batch pre-registers against.

---

## 5. WHAT I AM ASKING FOR

**A Step-4 verdict on `481bda9e3` so this can deploy.** The deploy is what resets Kyle's Paper
Trading dashboard to the 824.11 epoch, and he is waiting on it.

**Two things I would rather you rule on than have me assume:**

1. **Is log-only the right disposition, or should the drift branch be gated behind a flag** defaulting
   off? I chose no flag: a flag is a second thing that can be wrong, and #507 owns the remediation.
2. **The `matches`/`mismatches` discrepancy in §4.a** — I have flagged it and excluded it. Tell me if
   you think it blocks, because if precision coverage HAS regressed then `#507`'s remainder is larger
   than recorded and that is a finding in its own right.
