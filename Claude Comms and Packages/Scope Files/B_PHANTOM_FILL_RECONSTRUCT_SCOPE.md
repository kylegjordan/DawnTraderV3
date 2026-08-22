# B-PHANTOM-FILL-RECONSTRUCT — SCOPE

change-class: architecture

> **Batch id:** `B-PHANTOM-FILL-RECONSTRUCT` · **Owner:** Claude Analyst (CC-C) · **Opened:** 2026-08-23
> **Parent defect:** `#507` (B-BOOK-TRUNCATE-HOTFIX, code fix deployed `e6f7c70b3` 2026-08-22T22:01Z)
> **Kyle directive, 2026-08-23, verbatim and in two parts:**
> *"go with what you suggested that we flag and remove from our accounts, but we don't delete these
> trades"* and *"yes, we can replace the phantom exits with real market prices if we have them"*

**Change-class declared `architecture` deliberately, not defensively.** No new component and no
routing change — but this batch changes the **canonical meaning of realized P&L** for every reader
in the system, which is System-Manual scope (§9.4: *"canonical meaning of regime/strategy/filter
terms"* — the P&L basis is the same kind of object). Declaring `non_architecture` would have been
the under-declaration the checker cross-checks for.

---

## 1. WHAT HAPPENED, IN ONE PARAGRAPH

The Kraken mini-book never truncated to its subscribed depth, so dead price levels accumulated
instead of falling out. A stale bid left over from an earlier, higher price could sit **above** the
real ask, and the paper close-fill walks the bid side — so a stop-triggered sell filled against a
buyer that did not exist. Under the old logic **31.08% of observed book states were crossed; under
the fix, 0%.** The code defect is fixed and deployed. **This batch deals with the records it left
behind**, which are still being summed into every money figure Kyle reads.

## 2. OBJECTIVES

| # | Objective | Done when |
|---|---|---|
| **OBJ-1** | Flag every closed trade whose recorded exit came from a ghost book level | `phantom_fill_suspect` set, and the detector's negative control (maker exits silent) holds |
| **OBJ-2** | Reconstruct the honest exit from retained market data, **beside** the original, never over it | `reconstructed_exit_price` / `_net_pnl` / `_pnl_percent` / `_basis` populated; a fence proves the recorded columns were untouched |
| **OBJ-3** | Every money figure and risk gate reads the honest value | one SQL expression + one JS helper, both fenced to agree; census below shows no unrepointed money reader |
| **OBJ-4** | State the corrected numbers to Kyle, with the size of the correction | 24h / 7d / 30d / lifetime, recorded vs corrected, both shown |
| **OBJ-5** | Name what is NOT corrected and why | §5 below, each with a disposition (§9.4: no "later" without a home) |

## 3. THE DETECTOR, AND WHY IT IS A MEASUREMENT RATHER THAN A NUMBER

```
taker exit  AND  exit_price > the recorded ASK within ±5s of the close
```

You cannot sell above the ask. The criterion is deliberately conservative — it will miss phantom
fills that landed between bid and ask — because a **false positive rewrites a real trade**, which
is worse than leaving one uncorrected.

**★ THE NEGATIVE CONTROL IS THE WHOLE REASON THIS COUNT IS TRUSTWORTHY.** A **maker** exit fills at
its own resting limit and **never reads the order book**, so an honest book-defect detector must be
*silent* on maker fills. Measured over the last 24h: **maker 0 of 4** with usable snapshots, **taker
7 of 8**. That silence is what distinguishes "this measures the book" from "this finds rows".

> ⚠️ **THREE EARLIER ESTIMATES ARE WITHDRAWN — $187.78, 111 rows, and ~$111.** Each was produced
> *without* that control and none was reproducible. They are recorded here rather than quietly
> dropped, because a withdrawn number that vanishes gets re-derived by the next person.

**Reconstruction uses the BID, not the ask.** The ask is the correct *detector* (selling above it is
impossible); a market sell takes the *bid*, so the honest fill is the bid at that moment. This was
corrected **before** the figures in §4 were computed.

**The percentage basis was derived from the data, not assumed.** Over all 521 closed rows,
`pnl / (entry_price × quantity) × 100` reproduces the recorded `pnl_percent` to a mean absolute
deviation of **0.008**; `gross_pnl`-over-notional deviates by **2.10** and raw price-move by
**1.22**. Three candidates, one fits — a measurement of the writer's formula, not a plausible guess.

## 4. MEASURED EFFECT (521 lifetime closed trades; 21 affected = 4.0%; all 21 reconstructable)

| Window | As recorded | Corrected | Overstatement |
|---|---:|---:|---:|
| 24h | $63.33 | $35.91 | $27.42 |
| 7d | $235.09 | $204.99 | $30.10 |
| 30d | $157.07 | $101.30 | $55.77 |
| **Lifetime** | **−$74.11** | **−$132.74** | **$58.63** |

The 21 affected trades were recorded as **+$88.14** and are actually **+$29.50** — still genuinely
profitable, which is *precisely why they are corrected rather than excluded*: dropping them would
have discarded $29.50 of real gains along with the fiction.

**★ INDEPENDENT CORROBORATION:** Langston, using his own data pull and a different method, put the
overstatement at *"about $55"*. This lands at **$58.63**. Two methods, no coordination.

**★ AND THE CLASSIFICATION MOVES TOO, WHICH IS WHY THE WIN-RATE FAMILY IS IN SCOPE.** Of the 21,
**11 were recorded as wins and 4 of those are losses once corrected** (0 flip the other way).
Leaving win rate, profit factor and the per-strategy table on the recorded column would have put an
honest headline P&L directly beside metrics still computed from the fiction.

## 5. WHAT IS **NOT** CORRECTED — each with a disposition (§9.4)

| Reader | Why not repointed | Disposition |
|---|---|---|
| `ml-calibration.ts` | reads a **rolling recent window** via an injected `getRecentTradesFn`, not the stored ledger | **self-heals** as the window advances past the 2026-08-22T22:01Z fix line — dated verification, see RUNNING_ISSUES |
| `slippage-fee-model.ts` | its own in-memory model record; never re-reads the ledger | no action; recorded here so a later census does not re-open it |
| `daily-brief.ts` | reads `trades.realizedPL` (different table), today-only | out of population |
| c13/c14 validation, c5 diagnostics, factor-replay, rtb-shadow-store, aj19b, vts | diagnostics and telemetry, not money figures or risk gates | no action |
| **xStock closes** | the detector needs a contemporaneous **crypto** ticker snapshot; the xStock capture path is separate | crypto-only by construction — stated, not silently scoped away |

## 6. §9.5(a) COMPONENT CENSUS — who READS realized P&L per closed trade

Repo-wide grep, tests excluded. **Repointed (stored-ledger money + risk):** `storage.ts` (3 SUM
aggregates + 1 row read → `DatabaseStorage.HONEST_PNL`); `routes.ts` (equity curve, headline netPnl,
wins/losses, profit factor, byStrategy, largest winner/loser, avg pnl% — 10 sites); 
`dashboard-metrics.ts` (rolling earnings, avg net R, max drawdown, by-asset-class — 4 sites).

**★ INHERITED AUTOMATICALLY, AND THIS IS THE CENSUS EARNING ITS KEEP:** the **kill-switch 24h
numerator** (`daily-loss-budget.ts:131`) and the **guardrail current-balance**
(`guardrail-settings.ts:129`) both route their paper leg through `storage.getRealizedPnlSince()`, so
repointing that one aggregate corrects both risk gates with no separate edit. The lines a naive grep
flags in those two files are their **live** legs, which read `trades.realizedPL` — a different table,
live mode, not running. **Direction of the correction matters: phantom fills INFLATED profits, so the
24h loss budget read as *less* consumed than it was. Correcting it makes the kill switch strictly
more conservative** — up to ~$27 in a 24h window against a ~$824 balance, roughly 3.3 points of
loss-percent, which is not negligible at a threshold.

## 7. OUT OF SCOPE

- **No trade is deleted.** Kyle, explicitly.
- **No recorded column is modified.** Langston's condition: *"rewriting buries the distinction
  between recorded and reconstructed, and if a better reconstruction lands later you have to
  un-rewrite."*
- Live-mode exit pricing — Phase 21 gate `21-3c`/`21-3d`, already homed.
- The gross-vs-net split in the win/loss classification predates this batch and is not harmonised here.
