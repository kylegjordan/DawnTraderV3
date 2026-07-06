# P19-B8.3b — Scope (Step-1 draft, for Langston consensus)

change-class: non_architecture

> **RE-DECLARED non_architecture (2026-07-06, Langston Step-1 consensus — Option A APPROVED, he independently verified the mode-multiplex + destinationCount reader claims on staging before ruling).** No new scanner computation; the diff is display-state + a dead-field retirement + two surgical rider fixes. **Langston Step-1 conditions folded in:** (C1) OBJ-2's blast-radius is the whole justification for RETIRE, so it must be PROVEN at Step-4, not asserted — grep-clean + tsc-zero-dangling in the diff + show the `routes.ts:7809/:7853` independent `familyFanOutSum+patternFanOut` computation so he can confirm the FD number never transited the retired field; if ANY real reader surfaces it flips to FIX-conditional-on-destination. (C2) OBJ-1's active-trading-ON funnel render branch CANNOT be Chrome-walked at B8.3b (active trading is off until B8.4) — the verification criteria walk only the OFF/dormant state, and the ON-state funnel render gets a NAMED §13 verification home at B8.4.

**Batch:** P19-B8.3b (pre-named at B8.3 Step-2; the fast-follow to the per-mode dashboards). CC-B implements; Langston gates.
**Sequence:** B8.3b → B8.4 (THE SWITCH-ON). B8.3b does NOT gate the switch-on functionally; it finishes the display honesty B8.3 staged.

---

## The Step-1 architectural read (done before this draft, per §2.1a — findings that reshape the pre-declared framing)

The B8.3 pre-audit said "the scanner tracks NO per-path funnel — path-agnostic counters." A deeper read refines that materially:

1. **The fx5-scanner runs ONE funnel per cycle, keyed on engine-active state** (`fx5-scanner.ts:698` `isPassiveLearningMode = !isEngineActive`; `:704-709` swaps the quant filter row to `vts_quant` when passive; `:1474` `destination: isEngineActive ? 'active_pool' : 'vts_batch'`). There is NO parallel active-vs-VTS funnel computed in a cycle. So the per-stage counters are not "missing" — they are **mode-multiplexed**: today (active trading OFF since Phase 8) the funnel IS the VTS funnel; when paper-active turns ON at B8.4, the SAME scanDiag funnel loads `active_quant` thresholds and routes to `active_pool` — i.e. it BECOMES the active-path funnel automatically.

2. **`scanDiag.destinationCount` is a mislabel with a near-empty reader surface — it is essentially retire-able.** It is set unconditionally to `taggedVtsSurvivors.length` at `:1671` even when `destination === 'active_pool'`. Its ONLY consumers: the internal rolling-aggregate loop (`:447` → `totalDestinationCount` `:469`), a stored-diagnostic trace log (`:1545`), and a VTS handoff trace log (`vts-runner.ts:4191`). **`totalDestinationCount` has ZERO readers** anywhere in server/ or client/ (dead rollup). **The FD endpoints do NOT read it** — `routes.ts:7809/:7853` compute their displayed "destinationCount" independently as `familyFanOutSum + patternFanOut` off the eval-cycle counters. So retiring `scanDiag.destinationCount` + `totalDestinationCount` touches only two trace strings and a dead field — no UI, no decision path.

**Consequence for #417 (the VTS funnel sub-blocks bleeding onto the enforce FD tabs):** because the scanner produces the active funnel automatically once active trading is on, the enforce (Paper/Live) FD tabs do NOT need a newly-built parallel funnel. Before the switch-on the active pipeline is genuinely dormant; after it, the shared scanner's funnel IS the active funnel. The honest fix is display-state, not a second funnel engine.

---

## Objectives

**OBJ-1 — #417: replace the bleeding VTS funnel sub-blocks on the enforce (Paper/Live) FD tabs with an honest active-state view.** On enforce tabs, the "VTS Signal Funnel (Last Cycle)" block + the "VTS EVALUATION (24H ROLLING — VTS-SIDE COUNTERS)" rows (incl. the VTS Trades-Opened counts) inside shared scanner tables 1–2 must NOT render VTS numbers. Instead:
  - while active trading is OFF (pre-B8.4): show an honest "Active pipeline dormant — this mode's funnel populates when active trading is switched on (B8.4); the scan-stage numbers above are the shared scanner feed" state (the `ActivePipelineTail` card already does the tail; this extends the same honesty to the funnel body).
  - while active trading is ON: the scanner's own funnel (now `active_*`-thresholded, `destination=active_pool`) is the active funnel — surface it in place.
  The VTS page (`'tag'`) is unchanged — the VTS sub-blocks are correct there.

**OBJ-2 — retire `scanDiag.destinationCount` + `totalDestinationCount` (RETIRE; Langston Step-1 concurred).** ★ NAMING-COLLISION CARVE-OUT (Langston catch): retire ONLY `scanDiag.destinationCount` + `totalDestinationCount`; the **FD-response top-level `destinationCount`** at `routes.ts:7809/:7853` (`familyFanOutSum+patternFanOut`) is an INTENTIONAL SURVIVOR — do not touch. ★ CORRECTED blast radius (Langston catch, deeper trace in pre-audit §3): `scanDiag.destinationCount` is NOT just two trace logs — it's serialized wholesale to the crypto FD client via `getLastScanDiagnostics()` and typed at `vts-shared.tsx:154`, but the panel NEVER renders it (transported-but-dead-on-client). So the retire touches the scanner type/init/assign/aggregate + both getter return shapes + the client type mirror + the two trace tokens, and is a RESPONSE-SHAPE change with ZERO visible UI effect (proven: no panel reader). rule-18 (DELETED_COMPONENTS_LOG, tsc-zero-dangling). Fallback if the panel turns out to read it: FIX-conditional-on-`destination`.

**OBJ-3 — #415: reconcile the two basis splits (B8.3 rider).** (a) confirm `getAnchorState(mode).balance` is the anchor level (not a running cash balance) between anchors so the card's %-vs-starting and the curve's anchor baseline agree; (b) pick ONE basis for headline `netPnl` vs `byAssetClass[].netPnl` (headline sums `t.pnl`, per-class sums `t.netPnl ?? t.pnl`) and state it. Small, surgical.

**OBJ-4 — #416: wire or drop the balance-curve `carrier`/`startLevel` (B8.3 rider).** Either render the carrier at the chart's left edge (so a quiet in-window still draws the level line) or drop the dead field + fix the `hasData:true`/`points:[]` empty-state mismatch.

**OBJ-5 — governance + close.** SIM (scanner destinationCount retirement + the mode-multiplexed-funnel clarification; FD enforce-tab funnel state), SysManual if the funnel semantics change is architectural, catalog/history/plan, RUNNING_ISSUES (#415/#416/#417 → RESOLVED), completion report.

## Verification criteria (OFF/dormant state only — ON-state funnel render → B8.4 §13 per Langston C2)
- Enforce FD tabs (Paper + Live) render NO VTS-sourced funnel numbers (§9.3 Chrome walk both tabs); VTS tab unchanged.
- OBJ-2: zero references to `scanDiag.destinationCount` + `totalDestinationCount` (source + both scanner getters + the `vts-shared.tsx:154` client-type mirror + the two trace tokens); the routes-computed FD-response `destinationCount` is an intentional survivor and REMAINS; tsc-clean; DELETED_COMPONENTS_LOG entry.
- #415 standardized on `netPnl` with the `?? pnl` fallback REASON stated (not silently reconciled) + parity test-pinned; #416 resolved (carrier rendered or dropped, no hasData/empty mismatch).
- Bench green (tsc baseline + vitest); CI 4-green; deployed; Langston Step-4 (corrected blast-radius shown in-diff) + Step-8 PASS.

## Open question for Langston (Step-1 decision)
**Option A (recommended): display-honesty + retire, NO new scanner computation.** The enforce funnel "arrives" via the existing mode-multiplexed scanner at switch-on; B8.3b makes the pre-switch-on state honest and retires the dead-labeled field. → narrows change-class to `non_architecture`.
**Option B: build a genuine dual funnel** (scanner computes BOTH active- and VTS-thresholded funnels every cycle so the Paper FD tab shows the active funnel WHILE VTS is the live path). → stays `architecture`, doubles per-cycle filter evaluation, and arguably violates "one live at a time" (D7) by running the active funnel before the switch-on. I do not recommend it; surfacing it so the choice is explicit.
