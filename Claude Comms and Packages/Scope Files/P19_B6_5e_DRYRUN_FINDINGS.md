# P19-B6.5e — Dry-run findings (OBJ-2): the open path works; the EV gate is the honest blocker

> **Date:** 2026-06-18 · **Author:** Claude New (CC-B) · Contained crypto-only paper dry-run on staging (Phase A deployed `dbd0a2283`), reverted to dormant baseline after.

## 1. Phase A PROVED itself — the silent failure is gone
The invariant now reconciles AND names the stage:
```
[8.8.3-I3][INVARIANT_CHECK][OK] ✓ attempts=8, opened=0, blocked=0, openFailed=8 [EV_REJECT:8]
```
Pre-B6.5e this was `attempts=N/opened=0/blocked=0/reasonSum=0` (a silent MISMATCH). **#325 (open-path silent failure) is RESOLVED** — every attempt is now accounted; the failing stage is self-reported.

## 2. The blocker is NOT the depth gate — it's the Net-Expectancy gate (11.8B)
Every crypto signal reaches the EV gate (well upstream of the depth gate) and is rejected with NEGATIVE NetEV. The open path **executes correctly** up to a legitimate gate. EV breakdown (`[11.8B-A][ExpectancyGate]`):

| Symbol | NetEV | RawEV | Friction | pWin | DI | VolNoise |
|---|---|---|---|---|---|---|
| LTC/EUR | −0.326 | **0.348** | 0.673 | 0.60 | 50.0 | 0.300 |
| SOL/EUR | −0.381 | **0.697** | 1.078 | 0.60 | 50.0 | 0.300 |
| SOL/USD | −0.090 | **1.149** | 1.239 | 0.60 | 50.0 | 0.300 |
| ETH/USD | −7.49 | **22.46** | 29.95 | 0.60 | 50.0 | 0.300 |
| TAO/USD | −0.505 | **3.891** | 4.396 | 0.60 | 50.0 | 0.300 |

`NetEV = RawEV − Friction`, all in price-scaled absolute units (the ETH −7.49 is just ETH's ~$3000 price scaling — NOT a bug; the math is internally consistent).

## 3. Two real sub-findings
**(A) RawEV is POSITIVE on every signal** — the signals carry genuine edge — **but Friction exceeds RawEV everywhere (~1.1–1.9×)** → negative NetEV → the gate correctly refuses to open a friction-losing trade.

**(B) ⚠️ pWin=0.60, DI=50.0, VolNoise=0.300 are IDENTICAL on every signal — they are hardcoded DEFAULTS, not computed.** The EV kernel is running on placeholder inputs (the signal metadata `DI`/`VolNoise`/`prices`/`dbsScore` is not reaching `evaluateTradeExpectancy`). This is the **already-homed RUNNING_ISSUES #233** ("driftScore/volZ/DI defaults verify → P19 pre-go-live"). A TRUE per-signal pWin (good reversal/pattern signals often clear 0.62–0.70) would lift RawEV and some signals would beat friction → real opens. The default pWin=0.60 is suppressing the edge.

## 4. What this means for B6.5e scope (the question for you)
- **The open-path silent-failure repair (#325) — the actual B6.5e objective — is DONE** (Phase A, observable + reconciled). The open path is sound in execution.
- **Gate-10 (≥1 full closed lifecycle) is blocked by HONEST EV rejection**, rooted in #233 (default EV inputs) + a friction-vs-edge reality. That is **EV-kernel / friction-math / signal-metadata-threading territory** — sensitive (core math), and likely a multi-step fix, not a one-liner.

**CC recommendation (for your ratify / counter):** CLOSE B6.5e on its proven deliverable — Phase A (the silent-failure fix) + this conclusive diagnosis — and **promote the EV-input/gate-10 work to a named successor** (your "promote to P19-B7 if the surface is large" escape hatch), folded with the already-homed #233. Reason: B6.5e scoped the *open-path silent failure*, which is fixed; forcing gate-10 now means changing decision-grade EV math under the same batch, which violates "separate proof/repair from flip" and risks an unbounded balloon. The honest EV gate is arguably WORKING — we should not weaken it to force an open; we should fix the *inputs* (#233) as its own reviewed work.

**Questions:** (1) Agree B6.5e closes on Phase A + diagnosis, with gate-10 + EV-input integrity promoted to B7 (or folded into #233's pre-go-live home)? Or do you want the #233 input-threading fix pulled INTO B6.5e? (2) Is the ETH −7.49 / friction-scale anything other than price-scaling to you? (3) The friction-exceeds-RawEV pattern — correct (tight reversal geometry vs crypto round-trip cost) or does friction look over-counted to you?

## 5. SEPARATE finding surfaced by the dry-run (NOT B6.5e) — recurring classify fall-through
The dry-run fired **6 critical `classify-fallthrough-active` alerts** (ETH/EUROP, ETH/PYUSD, XBT/EUROP, XBT/PYUSD, XRP/RLUSD + the earlier A/EUR). **Root cause (Langston-confirmed):** `symbol-canonicalizer.ts:151` `knownQuotes = ['USD','USDT','EUR','GBP','JPY','CAD','AUD','CHF']` is missing the newer Kraken stablecoin QUOTE currencies (**EUROP, PYUSD, RLUSD**, likely also USDC/DAI/USDG). The base assets are obviously crypto; the QUOTE leg isn't recognized → classify fall-through → active-path signal skipped. **Clean, well-scoped, urgent (6 criticals).** → **Home: needs a named home (a small canonicalizer-completeness fix — fold into the B-NAMES/canonicalizer lineage or a standalone B6.5f).** Distinct from B6.5e's open-path repair; surfaced here for §9.4 homing.
