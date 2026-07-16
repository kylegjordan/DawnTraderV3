# P19-B8.6 — MAKER TARGET-EXITS: Completion Report (2026-07-15)

> change-class: architecture. Head `06560c299`, CI run `29452718741` all 4 GREEN.
> Migration `2026-07-15-p19-b8-6-maker-target-exits.sql` applied FIRST on staging
> (7 ALTERs + knob seed `INSERT 0 2`), then deploy 21:42Z + engine CONTINUE
> (session `paper_cO3fPFOjOK`). Langston: Step-1+2 PASS → Step-4 CHANGES → rev2
> CLOSED → Step-8 PASS.

## PREVIOUSLY-STATED-VS-NOW
- PREVIOUSLY STATED: bench "2130 passed". NOW: 2277 passed. REASON: the test bench
  pulled newer origin commits between benches; same 5 new B8.6 tests both times.

## Scope objectives (P19_B8_6_SCOPE.md)

| OBJ | Status | Evidence |
|---|---|---|
| OBJ-1 rest lifecycle (place/fill/convert/rest) in the paper exit monitor | **YES (code+deploy verified; first runtime event = OPEN LIVE-WATCH)** | seam in `checkOpenPositions`; Langston Step-4 rev2 verified in-diff; deployed head confirmed by Langston Step-8 |
| OBJ-2 honest trade-through only (AC-1) | YES | `evaluatePendingMaker(side:'sell')` reused verbatim; D1 same-tick place-and-fill prohibited; 5 tests incl. the D1-premise pin |
| OBJ-3 stop precedence absolute | YES | structural: tec-evaluator hard-floor stop-before-target + TARGET-only placement guard; Langston independently re-read `tec-evaluator.ts` and confirmed |
| OBJ-4 fill=limit + maker fee + zero slippage through the one close path | YES | `closePosition` makerExitFill leg; CI guard extended to exits (test) |
| OBJ-5 convert books real taker friction (AC-2) | YES | drop → the existing depth-walked taker close books fee+slippage; zero new accounting code |
| OBJ-6 fills-vs-converts denominator surfaced (AC-6) | YES | 4 cohort stamps on `closed_trades`, passed EXPLICITLY via `closePosition options.exitRest` (Langston ① fix — never reconstructed from the re-fetched row) |
| OBJ-7 knob per class | YES | `maker_taker.exit_maker_max_pending_ms` seeded by INSERT..SELECT from entry rows; Langston Step-8 verified byte-identical (3600000 ×2) and warm-by-extension (maker_taker in PREFETCH_MODULES) |
| OBJ-8 pre-pass consumes only the venue-only-gated price | YES | the seam sits after the venue-only chain; null price can never fill (test) |

## 🔶 RUNTIME EVIDENCE
**FIRST FILL — RUNTIME-PROVEN (2026-07-16 01:18Z, USDC/AUD):**
`[EXIT_REST_PLACED]` target 1.42991429 touched at 1.4301 → rested, NOT filled on the
touch tick (D1 held live); next tick `[EXIT_REST_FILLED]` + `[MAKER_EXIT_FILL]`.
closed_trades stamps: `exit_fee_mode=maker` · `exit_rest_outcome=fill` ·
`exit_rested_at_price=1.4299142900` == `actual_exit_price` (fill=limit EXACTLY) ·
`exit_slippage=0.00000000` · `exit_fee=0.83790033` (0.40% maker on ~$209 notional;
taker would have been ~$1.676 + slippage) · `exit_rest_duration_ms=1551`.
**Langston rulings (his exact wording):** the closed_trades row is **independently
confirmed, not reported** (he re-queried staging himself). D1: **basic guard VERIFIED
(DB** — `exit_rest_duration_ms=1551` proves a later-tick fill**), strong form VERIFIED
(log, re-read at the archive line myself)** — the placement tick printed 1.4301,
genuinely through the 1.42991429 limit, and the engine still rested (checked as a true
touch, not rounding). **n=1 stands and must be flagged either way — one placement is a
working instance, not a soak.**
Reviewer note (Langston, for the record): the app stdout ROTATED two minutes after the
event, so a grep of the live out path comes up empty — the evidence lives in the
rotation archive `out__2026-07-16_01-20-22.log:8233413`, not the live `out` path.
Closure bar: fill=limit ✅ + per-class maker rate ✅ RUNTIME-PROVEN (independently);
**deadline-convert booking taker friction = still an open watch** (no rest has aged out
its 60-min deadline yet); the monitor stays armed against Langston's four discriminants
(fee_mode→taker, non-zero exit_slippage off the convert tick, outcome=convert, fee at
the taker rate) and the first CONVERT gets posted + appended the same way.

## Langston findings + dispositions
- **① (BLOCKER, fixed):** deadline-convert lost `exit_rested_at_price` because
  `closePosition` re-fetches the row after the drop leg cleared it. Fix: explicit
  `options.exitRest` payload from all three sources (fill / deadline-drop /
  stop-during-rest); drop clears ALL three DB rest fields; stamps read only options.
- **② (comment):** precedence is structural, not a comparator — comment rewritten.
- **③:** rest-at-target vs gap-capture forfeit — dispositioned at Step-2 D1;
  measurable from the stamps; verdict lands at #513's trigger.
- **④:** `orderPlacer.closeOrder` verified pure-compute (types.ts:155 binding rule).
- **⑤ (real find):** the B8.5 ENGINE-side work (venue-only chain, C-gate deletion,
  skip rail, ANCHOR_ASSERT engine leg) was uncommitted while believed shipped —
  staging had been safe only because the deployed C-gate fail-safe-skips on the
  migration-deleted knob. CO-SHIPPED in this head; Step-8 proved it live
  (`[VENUE_ONLY]` rejecting binance → direct Kraken REST, 187 hits).

## Riders shipped in the same head
- **Open Trades whole-page crash (Kyle-blocking, B8.5 soak):** volume-tiers endpoint
  returns bare tier STRINGS (classifier retains no per-symbol volume); the client
  typed `{tier, volume24h}` objects → `formatVolume(undefined).toFixed()` crash when
  USD/CHF+USDC/CHF matched the slashless setTier keys. Client-only fix (real
  contract + dual-key lookup + em-dash guard). Langston rider APPROVED; §9.3
  UI-verified: tab renders 12 positions, no error boundary.
- **b72-warmup stale comment** rewritten (module warm-list unchanged — no drift).
- **Sizing tune-2** (prior commit `968cf4b93`): paper risk 2.70→1.95% measured off 5
  live ~$209 opens → pins ~$150. PREVIOUSLY STATED: 2.70% pins ~$150. NOW: 1.95%.
  REASON: the sizing relation measured steeper (~7.75%/1% risk) at $2,400 than the
  $800-era estimate; the Langston-signed design is "tune to pin, measured."

## Process notes
- The pre-B8.6 head CI red was the manifest-drift guard working as designed
  (MANIFEST listed the B8.6 migration one commit before the gitignored .sql shipped);
  this push shipped the file and cured it.
- Deploy-chain trap recorded: `npm run build 2>&1 | tail -3 && pm2 restart` masks a
  build failure (pipe exit code) — verified harmless this time (dist contained the
  new engine); never pipe the build inside a deploy chain.

## Governance files changed (this close)
SYSTEM_MANUAL.md (new B8.6 subsection after B7.2c) · SYSTEM_IMPACT_MAP.md (★ B8.6 +
B8.5-engine-state block) · BATCH_CATALOG.md (row) · PHASE_HISTORY.md (entry) ·
PHASE_19_PLAN.md (§5 decision log) · RUNNING_ISSUES.md (#513 already homed at Step-2;
trigger now armed) · MEMORY_CC_B.md (+ repo mirror) · Langston MEMORY (10.b sync) ·
this report. Scope + pre-audit committed at Step-1/2 (`297bb37bf`).

## Follow-ups (all homed)
- #513 P19-B8.6v: VTS maker-exit parity — trigger = validated fill model from these stamps.
- Open live-watch: first EXIT_REST lifecycle evidence → append here + post to Langston.
- P19-B8.5 batch (#78/#79) remains OPEN with its own close obligations (this report
  does not close B8.5).
