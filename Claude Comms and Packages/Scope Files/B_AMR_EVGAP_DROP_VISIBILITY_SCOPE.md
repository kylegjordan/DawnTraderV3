# B-AMR-EVGAP-DROP-VISIBILITY — Step-1 scope

**change-class: `non_architecture`**
**Owner:** CC-B · **Date:** 2026-07-28 · **Parent:** #604 (leg A of B-AMR-INPUT-INTEGRITY)
**Authorisation:** Langston approved the instrumentation explicitly — *"instrument the `:156` drop before choosing — approved. It's the residue, it's cheap, it's not a behaviour change, and it's the last invisible drop on this path."*
**Evidence base at a ref:** `1-system-manual/AMR_INPUT_CHARACTERIZATION_2026-07-28.md` + `RUNNING_ISSUES.md` #604.

---

## 0. 🚨 SCAFFOLDING DECLARATION (§9.1)

> 🚨 **THIS BATCH DOES NOT FIX THE AMR EV-GAP INPUT. THE INPUT WILL REMAIN ABSENT ON ~98% OF CRYPTO CYCLES AFTER THIS BATCH SHIPS.**
> It makes **one currently-invisible drop countable**. It changes no behaviour, recovers no observations, and moves no threshold. Its entire product is a number we cannot obtain today.

---

## 1. Why this is worth a batch of its own

`server/services/amr-weather-report.ts:156` is the first line of `feedEvGapObservation`:

```ts
if (!Number.isFinite(predictedNetEv) || !Number.isFinite(realizedNetPnl)) return;
```

It **logs nothing, counts nothing, and mutates nothing.** An observation that dies here is indistinguishable from one that was never offered.

★ **This is not merely one unmeasured item — it is the reason candidate (a) cannot be excluded or confirmed.** Every attempt to size it today has failed, and each failure taught the same lesson:

| attempt | why it failed |
|---|---|
| the store's `sample_count` (8,334) | counts successful **writes**, after the guards — a low total is *consistent with* the drop, not evidence against it. Window is also a mixed floor (durable persistence only from 2026-05-25; `/tmp` wiped on restart before; 7-day hard expiry each start). |
| `PERSIST 60 = [B67.4] 60` | covers `:1083` → `:1094` → `updateEma`'s success line. **`feedEvGapObservation` fails silently inside that span and leaves nothing to count.** |
| `updateEma`'s two logged guards | ⚠️ **tests a DIFFERENT OPERAND.** `updateEma` guards on `netPnlPct` (from `tradeData.pnl`); `:156` guards on `predictedNetEv` = `expectedEdge * 100`. **An undefined `expectedEdge` drops at `:156` and passes `updateEma` cleanly** — so these warns are blind to exactly the failure we suspect. |

⇒ **The one measurement that would settle it is blind to the thing being looked for.** That is the definition of a visibility defect, and it is why this precedes any fix decision.

## 2. Objectives

**OBJ-1 — make the drop countable.** At `:156`, before the `return`, emit a counted/logged record distinguishing **which** operand was non-finite (`predictedNetEv` vs `realizedNetPnl` vs both) and carrying `assetClass`. Rate-limit or aggregate so a high-frequency drop cannot flood the log — **the failure mode to avoid is a fix that makes the log unreadable and gets reverted.**

**OBJ-2 — no behaviour change.** The `return` stays. No observation is admitted that is not admitted today. **This batch must be provably inert to trading behaviour** — that is a verification criterion, not an aspiration.

**OBJ-3 — state the taxonomy for the drop itself.** A silent discard on a learning input is a defect **regardless** of how many observations it is losing. Record it as bucket 1 on the *visibility* axis, independent of whatever (a)'s magnitude turns out to be.

## 3. Explicitly OUT of scope

- ❌ **Splitting `ev_gap_window_n`** (#604 leg (a)) — parked; it was never the volume cause.
- ❌ **Changing what feeds the window** (#604 leg (b)) — **Kyle's decision, not CC's.**
- ❌ **Fixing whatever makes `expectedEdge` undefined** — cannot be scoped before OBJ-1 says whether it happens.
- ❌ **The routing finding** (#604 leg (c)) — the ~60-closes/day volume answer stands on its own and needs no code here.

## 4. Verification

- Unit: non-finite `predictedNetEv`, non-finite `realizedNetPnl`, both, and the clean path — assert the counter increments correctly **and that the clean path still pushes**.
- Live (§9.3): after deploy, read the counter over a known interval and **state (a)'s magnitude directly, not by subtraction.** Near-zero ⇒ (a) genuinely excluded and the conclusion is *earned*; large ⇒ (a) is dominant and the 07-14 `expectedEdge` re-source becomes the prime suspect again.
- ⚠️ **The result is not predicted here.** Writing an expected outcome into the scope of a measurement designed to settle a disputed question is how the measurement stops being one (#606).

## 5. Governance

Tier 1 per §3. SIM: the AMR component gains an observability surface — judge at close. System Manual: **not applicable** (no architecture, math, or pipeline change). #604 updated with the measured magnitude when it lands; **#606** carries the method note.
