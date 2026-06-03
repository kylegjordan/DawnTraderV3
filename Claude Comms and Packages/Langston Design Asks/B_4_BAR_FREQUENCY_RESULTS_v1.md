# B.4-bar-frequency — STUDY RESULTS v1 — Langston review/iterate (W1)

**INFRASTRUCTURE NOTE: do NOT cd the gdrive mount or git-grep it (FUSE hangs). Engine = `scripts/b-... b4-bar-frequency-study.ts` (committed, ran on staging). Results below are the full output; use `ssh staging` for any repo inspection.**

Read-only study per the Langston-approved scope §2 W1. Window 7 live days, 1,134,897 1m bars, 485 symbols, forward horizon 2h (clock-anchored). For each candidate F I rebuilt bars from the 1m archive and measured: pattern availability (MORNING_STAR + INSIDE_BAR recognizer replicas), forward-EXCESS-return AUC of those patterns (de-meaned vs the cross-sectional universe), regime-read flip-rate (a lightweight ATR-normalized 3-bar directional proxy, labelled), and bars-per-2h-hold.

## Results

| F(min) | F-bars | MS-rate | MS-AUC(2h) [nP/nR] | IB-rate | IB-AUC(2h) [nP/nR] | regime-flip% | bars/2h-hold |
|--------|--------|---------|--------------------|---------|--------------------|--------------|--------------|
| 5  | 317,527 | 2.55% | 0.505 [3962/133419] | 60.0% | 0.494 [77159/60322] | 40.7% | 24 |
| 15 | 127,234 | 2.68% | 0.497 [1403/45097]  | 49.0% | 0.497 [19831/26769] | 37.5% | 8  |
| 30 | 71,046  | 2.59% | 0.515 [698/22711]   | 43.6% | 0.495 [8380/15121]  | 35.5% | 4  |
| 60 | 40,001  | 2.73% | **0.523** [365/10832] | 40.0% | 0.500 [3471/7825]   | 34.4% | 2  |

MS excess (present vs absent): 5m +0.054/−0.002%, 15m −0.021/+0.004%, 30m +0.054/+0.005%, 60m **+0.170/−0.007%**.
IB excess (present vs absent): inverted at every F (present ~−0.045% vs absent +0.02 to +0.06%).

## My read
1. **MORNING_STAR rate is FLAT (~2.5-2.7%) at every bar size** — finer bars do NOT surface more morning-stars (refutes the "finer = more setups" hypothesis for that pattern). INSIDE_BAR rate rises with finer bars (40%→60%) — but its AUC is ~0.50 and INVERTED at every F (present underperforms), so the extra inside bars carry no usable edge.
2. **Pattern forward-edge is weak-to-none at ALL frequencies** (max AUC 0.523; most ~0.50). This echoes the B3.1a finding that the patterns don't discriminate for xStocks — and it means the frequency choice does NOT unlock a strong pattern edge. MS edge is marginally best at 60m, not finer.
3. **Regime read is jumpier at finer bars** (34.4%@60m → 40.7%@5m) — modest, confirms your gap-2 concern.
4. **Structure: bars/2h-hold** = 2 (60m) / 4 (30m) / 8 (15m) / 24 (5m). 60m's 2 bars is the current problem (can't time entries/exits, and ORB can't run); your ≥8 heuristic points to 15m.

**The tension:** structure wants finer; pattern-edge + stability want coarser. Since the patterns are weak regardless of F, the edge dimension doesn't discriminate the choice — so the decision rests on **structure + regime-stability + ORB-revival** (ORB needs sub-hourly bars; B-NEW-34 parked it on exactly this).

## My preliminary recommendation: **15-minute bars**
- 8 bars per 2h hold (clears your ≥8 heuristic; gives the trend/pullback/breakout strategies room to time entries/exits — the current 60m gives only 2).
- Regime flips 37.5% — between 60m's 34% and 5m's 41% (acceptable, not the jumpiest).
- Pattern edge weak everywhere, so 15m sacrifices nothing on that axis.
- Revives ORB (the one equity-native strategy).
- 30m is the conservative alternative (steadier 35.5% flips, but only 4 bars/hold — thinner timing room).

## The one real LIMITATION (your call on whether to close it before deciding)
The edge dimension was tested **only via the two patterns (MS/IB)** — NOT the trend/pullback/breakout strategies, which are the majority. The patterns are weak everywhere, so they can't discriminate the frequency. **Should I extend the engine with a GENERIC trend/momentum-setup edge test per F** (e.g. "short-term momentum or pullback-to-MA setup → forward excess AUC at each F") before finalizing — to check whether a finer bar surfaces better TREND setups (the thing 15m's structure is meant to help)? Or is the structure + stability + ORB argument sufficient to lock 15m now?

## Questions for you
1. Agree **15m**, or prefer **30m** (more conservative on stability) — or do you read it differently?
2. Extend the edge test to a generic trend/momentum setup per F before deciding, or is structure+stability+ORB enough?
3. The W1 bar-size **architecture pre-audit** (scanner / regime classifier / DBS / forming-bar blast radius of changing the xStock bar interval) — run it now before locking, or in parallel? Anything specific you want checked there?

Reply verbatim; I relay to Kyle (he is asleep, wants the results when he wakes).
