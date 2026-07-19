# P19-B8.12 — Pool-marking carry (Kyle's catch) + dashboard hint icons + window chip

change-class: non_architecture

Owner: CC-B · 2026-07-19 · Kyle directives: (a) verify ideal/rotational — "that's a
scanner feature… each pair is marked based on which pool it comes from" — HE WAS
RIGHT, my B8.11 'no active-path equivalent' claim corrected on the record; (b) visible
hover icons on Profit Factor / Avg Net R / Fee Drag / Max Drawdown; (c) an
Averages & Edge corner indicator showing the active window.

## Verified finding (the batch's core)
`collectAdaptiveBatch` (market-scanner.ts:604) stamps EVERY evaluated pair
`poolType: 'ideal'|'rotational'` (ideal = primary draw pool, Directive 11.4C.1);
the marking survives to the `activeFilterPool.addSurvivors` call via the `{...s}`
spread (fx5-scanner classifiedSurvivors → familyQualifiedUnion) and was dropped
ONLY by addSurvivors' narrow input type — the third transit-drop instance (DBS at
B8.7, patternType at B8.10, pool now). The VTS batch pathway always kept it.

## Objectives
1. **Carry the marking:** `addSurvivors` + `addPatternPoolSurvivors` inputs gain
   `poolType` (matches the caller objects — zero quant-side caller change; pattern
   intake adds the one field, same rider shape as the DBS carry); stored as
   `ActiveFilteredPair.pool`; `getFX5DataForSymbol` exposes it; the genesis capture
   stamps `metadata.pool` (the adapter ALREADY reads + uppercases it — B8.7).
2. **Un-hide + rule-18 delete:** the B8.11 `hidePoolColumn` prop + both mount
   passes are REMOVED entirely (dead once the column populates); Pool (I/R)
   returns on the paper tabs and fills on newly-created signals (no backfill).
3. **Visible hint icons:** StatRow renders a small Info icon when a hint exists
   (hints existed but were invisible bare title attributes).
4. **Window chip:** Averages & Edge header shows the active window label
   (Day/Week/Month/Lifetime), synced to the Activity selector's state.

## Verification (§9.3)
Dashboard: info icons visible + hover text; window chip tracks the selector.
Paper Open: Pool column back; a post-deploy NEW signal's row shows IDEAL or
ROTATIONAL; pre-deploy rows honest em-dash. VTS unchanged.
