# PHASE 25-5 OBSERVATIONAL DECISION GATE — PARTIAL RUN, 2026-08

**CC-C, 2026-08-11. P19-B-FEEVIABILITY OBJ-0.** This is a **PARTIAL** run — items 2 and 3 only, the two whose triggers have fired. **It is deliberately NOT named `PHASE_19_OBSERVATIONAL_DECISIONS.md`** (the gate's terminal artifact): per Langston's condition (a), a two-item file under the terminal name would read as "the gate ran" to the next reader. The full gate runs at its Phase-25 home.

**The gate:** roadmap item **25-5** (`POST_AUDIT_ROADMAP:310`; §19.4.5 is its preserved section anchor, not its phase — `:291`). Created 2026-04-26 after B65.6 closed via SKIP. Reference: `Claude Comms and Packages/Scope Files/B65_6_FINDINGS_PAPER.md`.

**⚠️ THE GATE'S OWN PRECONDITION IS UNMET — DECLARED, NOT SKIPPED (Langston):** `:412` requires SQE recalibration (19.4, Phase-25-homed, incomplete) and *"1–2 weeks of clean active-paper data"*. **Crypto's 15 organic trades in ~28 days is not that.** This partial run happens anyway **because the starvation is itself item 2's answer** — waiting for the data the gate needs would mean waiting on the condition the gate exists to detect.

---

## ITEM 2 — Daily signal volume (trigger: < 5 signals/day across the whole universe)

**OBSERVED** (`closed_trades`, `close_reason IS DISTINCT FROM 'never_filled'`, since the 2026-07-14 switch-on; organic = `metadata->>'admissionBasis'='organic'`):

| population | trades | per day |
|---|---|---|
| **crypto organic** | **15** | **0.60** |
| crypto all lanes | 255 | 9.42 |
| xStock organic | 192 | 7.46 |

**THRESHOLD MET?** **YES for crypto organic — 0.60/day vs the 5/day bar, met by ~8×.** (xStock at 7.46/day does NOT trigger. Crypto-all-lanes at 9.42/day is dominated by the exploration lane, which is the learning subsidy, not organic capture — pooling them would mask exactly the condition this item watches for. Population argument per rule 29(a).)

**THE GATE'S PRESCRIBED REMEDY:** *"move XStocks + Perp Futures (currently Phase 21.5) forward into pre-launch so the pair universe expands."*

**DECISION: the remedy is OVERTAKEN BY EVENTS and by a standing Kyle ruling; the CONDITION stands confirmed and feeds P19-B-FEEVIABILITY.**
- The xStock half **already happened** — xStock is live in paper-active (192 organic trades) — so that leg is moot.
- The perp-futures half is **RULED OUT by Kyle, 2026-08-11**: no perp trading until after go-live (possibly late Phase 25/19; a VTS-only data turn-on undecided). **The deferral is the decision, and it is his.** The narrower **perp FEED ingest** (data capture only) is homed to batch two (`P19-B-DROUGHT-2`).
- **What the confirmed condition DOES drive:** the crypto organic drought is the subject of the active batch (P19-B-FEEVIABILITY) — the fee-viability survey, the geometry change set, and the reachability recalibration are the responses, with the root-cause record at pre-audit A.1–A.15.

**JUSTIFICATION:** the trigger fired on the population it was designed to watch; its prescribed remedy from April assumed a world where neither leg had happened. Acting on the condition (via the active batch) rather than the stale remedy honours the gate's purpose without resurrecting a superseded plan.

---

## ITEM 3 — Per-pair classifier misclassification / outcome-vs-confidence inversion (trigger: inversion in active trading comparable to the 04-22 VTS pattern)

**⚠️ The 04-22 figures (TFS 13.8% WR vs STR 83.3% WR, `POST_AUDIT_ROADMAP:421-422`) are the roadmap's own COMPARATOR — the yardstick, not an observation of ours** (Langston's correction; CC-C had glossed them as a measurement).

**OBSERVED:** the evaluable population is **crypto organic n = 15** closed trades across ~28 days (and any per-regime split of 15 divides it further). A per-regime win-rate inversion **is not estimable at this n** — a two-regime split at these volumes puts multiple regimes at n < 8, where a single trade moves the win rate by ≥12 points.

**RULING FROM VTS INSTEAD?** **NO — circular by construction** (Langston): the trigger exists *because* active filters are stricter than VTS; using VTS to answer "does active differ from VTS?" assumes the answer.

**DECISION: `NOT EVALUABLE — insufficient active-paper population (crypto organic n=15).`** This is decision-grade (Langston: *"that's decision-grade and fine"*), and it is **not** a dismissal: **item 2's condition is precisely what destroys item 3's evidence base.** Item 3 re-evaluates when the active-paper population supports a per-regime split — concretely, after the P19-B-FEEVIABILITY marked window has accumulated its post-mark cohort.

**Kept separate by design:** the distinct calibration finding that HIGHER-confidence signals LOSE MORE OFTEN (an empirical calibration problem, NOT an inverted score — Kyle's correction on the record) is homed to batch two, and is not folded into this item.

---

## STATUS OF ALL NINE ITEMS (Langston condition (b) — one line each, so "did it ever run?" has a permanent answer)

| # | item | status 2026-08-11 |
|---|---|---|
| 1 | Hostile-window recurrence at active scale | **NOT EVALUABLE** — same starvation as item 3 (crypto organic n=15) |
| 2 | Daily signal volume < 5/day | **EVALUATED — TRIGGER MET (crypto organic 0.60/day). See above.** |
| 3 | Outcome-vs-confidence inversion | **EVALUATED — NOT EVALUABLE at n=15. See above.** |
| 4 | Hardcoded constants causing operational pain | NOT EVALUATED here — partially superseded by B72's lever migration; residue tracked per-item (e.g. LEVER_INVENTORY KEEP tier) |
| 5 | Modularization friction | NOT EVALUATED here — no trigger fired |
| 6 | ML data sufficiency | NOT EVALUATED here — no trigger fired |
| 7 | Ladder net contribution (needs ≥30 laddered trades, `:426`) | **NOT EVALUABLE** — same starvation (Langston: items 1/7/8 blocked by the same condition) |
| 8 | Low-volume pair moonbag exclusion | **NOT EVALUABLE** — same starvation |
| 9 | Daily-loss budget + kill-switch auto-trip | **ALREADY CLOSED** — P19-B6 restored the auto-trip (`SYSTEM_IMPACT_MAP:1710`); re-homed to 19.0.B (`:430`). *Nine minus two is NOT seven live (Langston condition (c) — enumerate, don't count).* |

**Escalations carried:** item 3 → if ever evaluable and met, reopening B65.6 pre-launch is **Kyle's call**. Item 2's perp leg → **already ruled by Kyle** (above).

**Cross-references updated at batch close:** `PHASE_19_PLAN.md` (25-5 status), `POST_AUDIT_ROADMAP.md` 25-5 row, `RUNNING_ISSUES` #336.
