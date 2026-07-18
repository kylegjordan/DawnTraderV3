# P19-B8.10 — COMPLETION REPORT
## Trade-table truthfulness: genesis capture + Rank honesty + RTB freeze + Phase-8 metrics purge

Owner: CC-B (NEW Claude) · Closed: 2026-07-18 · change-class: **architecture**
Head: `8b13fe0b8` · CI: 4-green run `29658573585` · No migration · Deployed ~19:53Z,
HTTP 200, engine promoting within the same minute.
Scope: `Scope Files/P19_B8_10_SCOPE.md` (bc0ad5951) · Pre-audit:
`P19_B8_10_PRE_AUDIT.md` (8214844e2 + the §F pin-down reconciliation).

## Objectives checklist

| OBJ | Verdict | Evidence |
|---|---|---|
| 1 — RTB freeze panes (sticky header + Rank/Symbol) | **YES** | §9.3 Chrome: deep horizontal scroll to the far-right column set with Rank + the stacked Symbol cell pinned; header held during vertical scroll (screenshots in-session) |
| 2 — Phase-8 metrics purge (panel + SLAL, rule 18) | **YES** | Page ends cleanly after the RTB card (§9.3); `execution-metrics.tsx` + `signal_lifecycle_audit.ts` archived `.removed`; both endpoints spliced; ~15 `record*` call sites removed; repo-wide grep zero refs; **`generateSignalId` relocated verbatim to `server/utils/signal-id.ts`, format pinned by `signal-id-format.test.ts` (a stored-data contract)** |
| 3 — Slot to position 2 | **YES** | §9.3: Symbol · Slot · B/S … on the paper Open tab; `afterSymbolHeaders`/`renderAfterSymbolCells` props default OFF — VTS mount unchanged |
| 4 — Genesis display-context capture | **YES — live-proven** | First post-deploy queued signal (AAVE/USD, 19:57:04Z, Supabase read): `regime: HIGH_VOLATILITY_UNSTABLE`, `patternType: INSIDE_BAR` (a PATTERN signal carrying its pattern name — the #530-shape transit gap closed), `pairFriction 57.78`, `globalFriction 54`, `pairDirectionalBias DOWN_MODERATE (-0.332)`, `globalDirectionalBias UP_MODERATE (+0.438)`, `entryLiquidityValue/Kind` — and NO legacy `rankingScore` key (fence removal working). `globalRegime` honestly absent (class aggregator warming). Sources are the SAME shared helpers the VTS capture reads; `computePairFrictionIndex` extracted to cost-model, vts-runner refactored onto it |
| 5 — Rank honesty | **YES** | Fallback removed at the queue enrich; `rankAtPromote` stamped at the engine promote site via `getDisplayRankKey` (transit cited end-to-end + confirmed by Langston at ref; persists via the same spread the live DB rows prove); open table shows the DISTINCT **"Promote R"** header (pin-down 2) with honest `–` on pre-stamp rows — the fabricated 0.6x finalScore values are GONE from the cell; dead `getTopSignal`+`checkForPromotion` deleted as a unit. **2026-06-18 dead-ranker coupling RESOLVED — DISCHARGED, not overridden: getRankedSignals/R-multiple won, rankingScore-ordering never adopted, P25 verdict delete** |
| 6 — "pending" placeholder killed | **YES** | §9.3: Glbl DBS renders `—` on both tables |
| 7 — Regime Wt off the closed table | **YES** | §9.3: closed header runs Net P/L → Edge → Glbl Regime (no Regime Wt); colSpan 33→32 |

**⚠️ FLAG FOR KYLE (required by Langston Step-2/Step-4):** removing Regime Wt from
the SHARED closed-trades component removes it from the **VTS Closed Trades tab as
well** (the shared-component architecture is deliberate). The directive came from the
paper tab; say the word if the VTS side should keep it (it would return as a
VTS-only optional column).

**Also shipped:** Edge column feeds `netExpectedEdge ?? netEvAtAdmit` (the honest
post-friction number) — deliberately NOT mirroring the VTS Edge formula, which still
computes from the retired finalScore (noted in the SysManual capture section as a
VTS-side candidate for a future honesty pass).

## Review trail
Langston Step-1 PROCEED (3 pin-downs, all resolved §F) · Step-2 PROCEED (B.3→"Promote
R" reconciliation done pre-implementation; shadow-null posture confirmed intended) ·
Step-4 r1 **CHANGES-NEEDED**: **his catch on record — the deletion archive
over-scooped five LIVE methods (a copy-the-region artifact); regenerated
programmatically from git HEAD with an assert-no-live-method-leaks check**; plus the
rankAtPromote transit demanded-and-cited (in-memory spread end-to-end, no DB re-read,
live-row proof) · Step-4 r2 **APPROVED** (both closures independently re-read at ref).
Step-8 second pass: dispatched with this close.

## Bench + tests
tsc baseline OK (no regressions). New/changed suites green: paper-trade-adapter
(honest-keys test incl. legacy-key rejection), signal-id-format pin, gate-shadow
regression guard — 20/20. Ten file-load failures in the full local run reproduced
IDENTICALLY at clean origin HEAD (stash/run/pop) — pre-existing bench-env, all their
tests skipped at collect; CI (which has the env) is 4-green on the head commit.

## Governance files changed (this close)
BATCH_CATALOG.md · PHASE_HISTORY.md · PHASE_19_PLAN.md (§5 row) ·
RUNNING_ISSUES.md (#529 rider: regimeWeight 0.5 constant, same family) ·
SYSTEM_MANUAL.md (**content**: §9 SLAL retired + reference sweep; NEW "Genesis
Display-Context Capture" section in the signal-pipeline chapter) ·
SYSTEM_IMPACT_MAP.md (**content**: ★ B8.10 banner — SLAL/panel dereg, signal-id
relocation, SizingContext carriers, shared friction formula; S6 registry citation
re-pointed) · DELETED_COMPONENTS_LOG.md (2 entries: the metrics stack incl. SLAL;
the dead ranker pair) · this report · MEMORY_CC_B (+ repo mirror) · Langston MEMORY
sync (with this close).

## Open follow-ons (named homes)
- Entry-slip correctness investigation — **OLD Claude** (Kyle hand-off, Discord id 1528114437041426653).
- #529 B-STRATEGY-WEIGHT-INVESTIGATION (+ the regimeWeight rider) — own batch immediately BEFORE #522.
- Untracked orphan `server/scripts/b-xstock-freshness-monitor.ts` found in the shared working tree (NOT this batch's; left untouched) — flagged to the crew for disposition (wrench protocol).
- Watch: first post-deploy trade OPEN carries the captured fields + a Promote R value onto the Open tab (promotions were firing at deploy; depth gate warming).
