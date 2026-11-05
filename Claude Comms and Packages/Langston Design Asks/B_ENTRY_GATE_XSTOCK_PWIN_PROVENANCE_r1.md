# The xStock "60 % win rate" — provenance and one recommendation (B-ENTRY-GATE A-12; Kyle's ask of 2026-11-05)

Owner CC-B · for Langston and Coltrane · read at `origin/migration/aws-supabase`

## 1. Provenance — where each part came from
| part | origin | what it was meant to do |
|---|---|---|
| `pWin = 0.40 + DI/200`, capped at 0.60 | **Directive 9.5 "CWQI v4", `5d6072a0e` (2026-01-01)**, quoted: *"P_win = 0.40 + (DI / 200) → Capped at 0.60 … If EV ≤ 0 ⇒ Reject"* | a heuristic map from trend straightness (DI, 0-100) to a win chance between 40 % and 60 %, for "The Gate — Net Expectancy". Never calibrated against outcomes. |
| the DI default of 50 | same commit: `const { …, DI = 50 } = tradeMeta`, `DI = DI ?? 50`, and a test *"should use default DI=50 when not provided"* | a placeholder when no DI is passed. 50 → 0.65 → clamped to **0.60, the ceiling**. |
| the bounds moved to settings | `36a517ab2` (B72 Slice 4, 2026-05-05) | `pwin_floor` 0.40 / `pwin_ceiling` 0.60 / `di_pwin_factor` 200 became DB settings; same values. |
| xStock left without DI | **P19-B8.5h OBJ-2 (2026-07-27)**, scope quoted: *"DI is EV-inert — default DI=50 already caps the standard branch at the 0.60 ceiling, so real-DI threading gives ZERO EV lift (#377 H1); (ii) xStock DI is a different formula/basis … unreconciled and homed to Phase-25 #502"*; in code at `server/services/signal-orchestrator.ts:1017-1020` | a deliberate non-carry: threading DI could not RAISE pWin above the cap, so it was judged pointless; the two DI formulas differ (crypto unsigned straightness; xStock signed direction, 50 = flat) and their reconciliation is Phase-25 (`#502`). |
| the calibration that would replace it | `#399(a)`, Phase-25: *"the DI→pWin map is uncalibrated; build base-rates → Platt/isotonic → reliability/Brier"*; locked blueprint `P25_SCORING_STACK_PRESTUDY.md` PART II (Kyle-ratified) | a measured win probability per class and strategy. |
| the measured base rates | `scoring_base.flat_pwin_base`, P19-B8.5a (2026-07-13): crypto 0.295, xStock 0.317 (12,140-trade probe) | used today only as `signalStrength` for the maker/taker haircut, never as the EV gate's pWin. |

## 2. What the provenance missed, measured now
- **"EV-inert" was argued in one direction only.** Real DI could not raise pWin above the cap, true; it was never asked whether the cap itself is right. **The floor (0.40) is above both measured base rates**, so every signal's pWin is optimistic before DI is even read.
- **Realised paper outcomes since the 2026-09-29 reset (`closed_trades`, paper, opened ≥ 09-29, closed, excl. never-filled):** crypto **87** closes, **32.2 %** winners (24 targets / 57 stops); xStock **472** closes, **17.4 %** winners (83 / 387). The gate assumes **0.60** for every xStock signal.
- Langston (2026-11-05): xStock `di_at_queue` NULL on 99.6 % of 908,581 shadow-sink rows; ~4 % of crypto rows NULL too; the default sits above ~89 % of crypto's real DI.

## 3. The three options Kyle named, and what each would do
- **(a) carry xStock's real DI.** xStock's DI is SIGNED (50 = flat, above 50 = up), so a long signal in an uptrend reads above 50 and lands on the same 0.60 cap. **It would change little for the trades we actually take, and it plugs a different formula into a map built for crypto's** (the `#502` mismatch). Cost: small code, real semantic risk.
- **(b) switch on "no assumed win rate".** Refuses ~every xStock buy (no DI), while crypto keeps an equally uncalibrated map. It stops the xStock losses, and it also stops the xStock paper data that calibration needs. Inconsistent across classes.
- **(c) leave it to Phase 25.** The structural fix (`#399a`), but the xStock gate stays at 0.60 against a 17 % reality until then.

## 4. Recommendation: (c), brought forward as the next calibration step, after the confidence audit
**Do not do (a) or (b).** Neither fixes the real defect, which is not "xStock lacks DI" but **"the DI→pWin map is uncalibrated for both classes, and on xStock it is wrong by a factor of about three"**. The fix is the calibration Phase 25 already owns (`#399a`): a measured win probability per class (and later per strategy) feeding the EV gate, replacing both the default and the heuristic map.
- **It does need the confidence audit first** (`B-CONFIDENCE-AUDIT`, OLD Claude, sprint row 141a): a calibrated pWin is only trustworthy if the inputs and outcomes it is fitted to are. The order is 141a → calibrated pWin → the "no assumed win rate" leg becomes moot (there is always a measured number).
- **Meanwhile nothing changes in trading;** B-ENTRY-GATE records, on every paper buy and for both classes, the defaulted EV, the EV on a real carried DI where one exists, and the EV at the measured base rate. That record is the evidence the calibration step will start from.
- **The one thing Kyle should know now:** on xStock the profit check is not filtering on win chance at all; at 0.60 it passes almost anything with a 2:1 geometry, and the realised rate is 17 %. Whether to act on xStock before calibration (for example, a temporary tighter ceiling) is his call; I am not recommending a stopgap, because a hand-set number is exactly what the calibration exists to replace.

## 5. Asks
- **Langston:** is the provenance right, and does the recommendation hold (one gate: AGREE or DISAGREE with reasons)?
- **Coltrane:** same question, independently.
