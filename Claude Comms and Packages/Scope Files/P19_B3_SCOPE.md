# P19-B3 SCOPE — Known-Broken Active-Path Repairs (+ OrderPlacer execution port)

> **Phase 19 · Batch 3.** Author: Claude New (CC-B). Reviewer: Langston (Opus 4.8). Decider: Kyle.
> Status: **v2 — Langston Step-1 ACK 2026-06-13** (approved to proceed to pre-audit; refinements folded into §5 consensus). Created 2026-06-13.
> Opens with the typed `OrderPlacer` execution port (P19-B2 §9 Q3 first-deliverable), then de-mines the dormant active-trading path (#137) and root-cause-fixes the fragile asset-class lookups (#139).

---

## 🚨 SCAFFOLDING-VS-FUNCTIONAL (§9.1)
**THIS BATCH DOES NOT TURN PAPER-MODE ACTIVE TRADING ON. The pipeline remains in VTS/passive learning after B3.** B3 repairs the dormant active-trading path so it is *correct and type-safe* before the switch-on (P19-B7b). No scanner→orchestrator→RTB→execution flow is activated here; live stays 409-gated until Phase 21. Functional turn-on is gated on B4–B7 (xStock wire-in, capture hooks, kill switch, UI shells, the staged flip).

---

## PREVIOUSLY-STATED-VS-NOW (§9.2)
- **#137 error surface: PREVIOUSLY "54 files / 231 Phase-19-tagged errors." NOW: the real allow-list is 494 errors across 66 files, ALL currently tagged `phase_tag: "TBD"` (untriaged). REASON: the "231/54" was a pre-triage rough cut; the genuine active-path must-fix count is unknown until B3's opening triage pass runs and labels every file. The triage *produces* the real number; B3 reports it back.**
- **#139 fix posture: PREVIOUSLY (B3 plan shorthand) "switch 9 throwing `resolveAssetClass` → safe variant + skip-on-null." NOW: root-cause fix — normalize-before-classify + fix the normalizer if a real form-gap exists + a LOUD named alarm on any residual fall-through (never a silent skip/accept). REASON: Kyle directive 2026-06-13 — a silent skip tolerates an unclassified pair we should have classified; the symbol-normalizer mismatch is the suspected root and must be fixed at the source, not masked.**

---

## §0 — Empirical ground truth (pre-draft probe, 2026-06-13)
Staging `out.log` over the current live window shows **zero** of: `unknown symbol pattern` (safe-resolve WARN), `did not match any registered pattern` (resolver throw), `COLLISION_RESOLVE`, `QUEUE_FALLBACK` (RTB missing-assetClass). ⇒ **No pair is failing classification today.** The 9 throwing sites are a *latent* landmine (would hard-throw the whole scan cycle if a malformed/un-normalized symbol ever reached them), not an active leak. This sets the #139 work as defensive hardening + root-cause confirmation, not an active-incident fix — but the hardening is mandatory before the active path executes under load with the full live symbol universe.

---

## §1 — OBJECTIVES (numbered, with verification criteria)

### OBJ-1 — `OrderPlacer` typed execution port (FIRST deliverable; P19-B2 §9 Q3)
Build one typed order-placement boundary that every order — open and close — passes through, returning a `FillResult` that can express **filled / partially-filled / delayed / rejected from day one**. Paper plugs its current instant-fill behind the port; the boundary is shaped so live's async/partial/rejectable reality (P19-B2 invariant #1, the fill-confirmation lifecycle) slots in later with no reshaping.

- **Current seams wrapped:** open = `storage.createPaperSimOpenPosition(this.mode, {...})` (`paper-execution-engine.ts:~2196`); close = `closePosition(...)` (`paper-execution-engine.ts:~1104`). The engine is already mode-parametric (`mode:'live'|'paper'`), so the port is a typed extraction of the two seams, not a rewrite.
- **FillResult shape (design intent):** discriminated union — `{status:'filled', fillPrice, fillQty, fees, slippage}` | `{status:'partial', fillQty, requestedQty, fillPrice, fees, remaining}` | `{status:'delayed', orderRef, submittedAt}` | `{status:'rejected', reason, code}`. Paper today only ever returns `filled` (synchronous atomic), but the *type* carries the full union so paper's fill-handling is written against live's reality from the start.
- **VERIFY:** (a) port compiles + is the sole open/close path in `paper-execution-engine.ts`; (b) unit tests cover each `FillResult` variant + the paper adapter's filled-path; (c) `npx tsc --noEmit` clean; (d) paper open→close still works end-to-end in the bench (no behavior change to paper fills — pure structural extraction).

### OBJ-2 — #137 baseline triage (B3 opening task)
Label every one of the **66 files** in `.tsc-baseline.json` with a real `phase_tag` + `context`: `active-trading-path` (must-fix to turn paper on) / `legacy` (removal candidate → never-leave-legacy §rule-18 disposition) / `ui-support` (client screens; fix only if on a paper page) / `infra-other` (out of active-path scope). Pin the genuine active-path must-fix error count (replaces the "231" estimate).
- **VERIFY:** every file's `phase_tag` ≠ "TBD"; triage table in `P19_B3_PRE_AUDIT.md` with per-file disposition + rationale; Langston reviews the active-path/legacy split before any fix lands. Legacy-tagged files get a §rule-18 disposition (delete-now or concrete-dated home) recorded in `DELETED_COMPONENTS_LOG.md` / `RUNNING_ISSUES.md`.

### OBJ-3 — #137 active-path error fixes (the must-fix set, properly)
Fix every `active-trading-path`-tagged error by **real type alignment**, never by `@ts-ignore`/`as any`/suppression (baseline discipline). Two code-confirmed priority landmines, fixed first:
- **L1 — trade-record builder leaves archive-read fields unset.** The `Phase10TradeRecord` literal (`vts-runner.ts:~1497-1545`) doesn't populate ~13 fields the data-archive reader (`~1882-1921` / signal-eval archiver) expects ⇒ archived decision rows carry holes in exactly the fields Phase-25 calibration needs. Fix: align the record shape so every archive-read field is set (or explicitly typed-optional with an honest null), verified by an archive round-trip test.
- **L2 — RTB queue silently drops qualified signals.** `queueSQESignal` reads `input.ngc` / `input.riskScore` / `input.profitRate` (e.g. `input.ngc.toFixed(4)`, `ready_to_buy_service.ts:~1671/1736-1738`) which the `SQESignalInput` type doesn't guarantee (the 9 TS2339s). A missing value throws; the caller's `.catch()` swallows it ⇒ a fully-qualified signal vanishes before the buy queue with no log. Fix: align `SQESignalInput` with what SQE actually produces + guard the reads + ensure a genuine failure surfaces (logs/alarms) instead of silent-drop.
- **VERIFY:** every active-path error cleared in `.tsc-baseline.json` (counts driven DOWN, never up); L1 archive round-trip test passes (no blank required fields); L2 test proves a malformed SQE input is rejected loudly, not silently dropped; `tsc` + full `vitest` green in bench.

### OBJ-4 — #139 asset-class classification: root-cause fix (Kyle directive 2026-06-13)
Make unclassifiable pairs impossible-by-construction on the active path, and impossible-to-ignore if they ever occur.
- **4a — Normalize-before-classify.** Trace symbol provenance at all 9 throwing sites (`vts-runner.ts` lines 1248, 1540, 1894, 1935, 1972, 2637, 3013, 3660, 3751). Confirm each receives a canonicalized symbol (`toCanonical`) before `resolveAssetClass`; where it doesn't, add normalization so the resolver always sees a clean `BASE/QUOTE`.
- **4b — Fix the normalizer if a real gap exists.** If any live pair-form `toCanonical` doesn't handle is found (incomplete Kraken asset-code map, etc.), fix `symbol-canonicalizer.ts` so that pair matches consistently across whitelist / universe-list / classifier / Kraken-inbound — the real "matched-up-across-all-parts" fix.
- **4c — Loud alarm, never silent accept.** Replace the throwing `resolveAssetClass` at the 9 sites with `safeResolveAssetClass`, but route a null result to a **visible named alarm** (loud WARN at minimum; system-alert if on the live execution path) + skip only that one pair so the cycle survives. NOT a silent skip — every fall-through is heard immediately.
- **4d — Silent-misclassification cousin.** Verify reachability of an xStock arriving on `exchange='kraken'` without its `x`-marker / universe-membership and silently resolving as `crypto_spot` (not throwing). If reachable on the active path, fix here; if not active-path-reachable, give it a concrete scheduled home (§9.4).
- **VERIFY:** all 9 sites normalized + safe-resolved + alarm-wired; any normalizer gap fixed with a unit test locking the form; a synthetic malformed symbol produces a loud alarm + single-pair skip (not a cycle crash, not a silent drop) in a unit test; 4d resolved or homed with evidence.

### OBJ-5 — No regression to VTS / passive learning
All fixes preserve current VTS behavior (the system stays in passive learning through B3). Paper-engine fill behavior unchanged (OrderPlacer is a structural extraction). 
- **VERIFY:** full `vitest` 1880/1880 green in bench; staging deploy boots clean (no new throws in `out.log`); VTS cycle metrics unchanged post-deploy.

---

## §2 — OUT OF SCOPE (boundary clarity)
xStock→orchestrator wire-in (#92), capture hooks (#56 residue), daily loss kill-switch (19-4), paper UI shells/dashboard, the actual switch-on — all **B4–B7**. B3 is purely: the order doorway + de-mine the broken path + root-cause the fragile lookups. The `FillResult` *type* is built here; the high-fidelity fill MODEL (real fees + L2 slippage + partial-fill realism) is **B4**.

---

## §3 — WORKFLOW + AUTONOMY
Kyle granted autonomous CC↔Langston iteration to verified-correct completion (2026-06-13). Escalate to Kyle only on: (a) something we can't resolve as legacy-vs-current; (b) any fix that deviates from current architecture or changes what we're building (notify BEFORE acting per §5 rule-5); (c) true CC↔Langston deadlock. Don't dismiss any surfaced issue, big or small — investigate now to decide fix-now-vs-later; if later, give it a concrete home (§9.4). Each surfaced legacy item follows never-leave-legacy (rule-18).

---

## §4 — OPEN QUESTIONS FOR LANGSTON (Step-1 ACK)
1. **Triage-then-fix sequencing:** OK to do OBJ-2 triage as the literal first code activity (after OBJ-1 port), with a Langston review gate on the active-path/legacy split BEFORE any OBJ-3 fix lands? Or fold triage into the pre-audit (Step 2) entirely?
2. **OrderPlacer placement:** new `server/services/execution/order-placer.ts` (port + FillResult type) consumed by `paper-execution-engine.ts`, vs. an in-file typed boundary? Lean: separate file (clean live-swap seam, matches Option-A intent).
3. **#139 alarm channel:** loud WARN sufficient for the VTS/paper path, reserving a system-alert for the live path only — or system-alert from the start on any residual fall-through?
4. **#137 scope cut:** confirm `active-trading-path` tag = "executes when paper-active is ON" (scanner→regime→orchestrator→SQE→RTB→TEC→paper-engine + their direct storage/route reads). Client UI (machine-learning.tsx 23, enhanced-system-monitoring.tsx 8, etc.) = `ui-support`, fixed only if on a paper page — agree?
5. **Batch size:** B3 is large (port + triage + ~N active-path fixes + classify hardening). Sub-batch it (B3a port+classify, B3b #137 fixes) or run as one with chunked diffs?

---

## §5 — LANGSTON STEP-1 CONSENSUS (2026-06-13, ACK'd)
Langston ACK'd the scope to proceed to pre-audit, no deadlock, nothing for Kyle. Agreed refinements (binding on implementation):

- **A1 (Q1) — triage lives in Step 2 pre-audit, NOT "first code activity."** The #137 triage is classification, not code → produce the labeled table in `P19_B3_PRE_AUDIT.md`; Langston gates the active-path/legacy split + §rule-18 dispositions THERE before any OBJ-3 fix lands. OBJ-1 (the port) is self-contained implementation → lands as its own reviewable diff in parallel/ahead of the triage.
- **A2 (Q2) — OrderPlacer placement = TWO files.** `server/services/execution/order-placer.ts` (port + paper adapter) + sibling `server/services/execution/types.ts` holding the `FillResult` discriminated union + the port interface — so the future live adapter (B7) imports the TYPE without importing the paper adapter. Clean live-swap seam.
- **A3 (Q3) — #139 alarm cut on ACTIVE-vs-PASSIVE, not paper-vs-live.** A bare `out.log` WARN is functionally a silent skip (Kyle scrolls past, §10.5 logic) → forbidden by the directive. So: **VTS/passive path** = loud WARN **+ a counter/metric** (telemetry-only, acceptable); **active execution path (paper-active ON OR live)** = **system-alert from the start** + single-pair skip. Maps to the trading-mode taxonomy + clears Kyle's "heard immediately" bar.
- **A4 (Q4) — #137 tag = "reachable on the active execution path, INCLUDING modules SHARED between active path and VTS"** (not "exclusively active path"). The two landmines prove it: L1 lives in `vts-runner.ts`, L2 in `ready_to_buy_service.ts` — both straddle → both active-path must-fix. UI-support deferral OK, BUT any client screen that is an operational **paper-mode control** (kill switch, position monitor, RTB queue view) gets a concrete **B6 home**, not a silent ui-support shrug.
- **A5 (Q5) — SUB-BATCH it.** **B3a = OBJ-1 port + OBJ-4 #139 classify hardening** (both bounded, neither depends on the triage gate). **B3b = OBJ-2 triage → OBJ-3 #137 fixes** (judgment-heavy, behind Langston's split-review gate). **Land B3a first, rebase B3b on it.** File-overlap watch: B3a edits the 9 classify sites in `vts-runner.ts` (1248…3751) and B3b edits the L1 builder ~1497–1545 (line 1540 is adjacent to the builder block) — no line collision, but keep diffs clean by sequencing B3a→B3b.
- **L2 DURABLE FIX (Langston, beyond the questions) — fix the SWALLOWING `.catch()`, not only the type.** Type-aligning `SQESignalInput` stops *this* throw, but the silent-drop *mechanism* is the caller's catch-all that eats the error. Per rule-11 (NO PATCHES) the durable fix is **both**: align the type AND change that catch to surface/alarm a genuine failure instead of swallowing it — else the next missing-field bug drops a qualified signal just as silently. Folded into OBJ-3 L2 VERIFY (a malformed SQE input must be rejected LOUDLY).

**Sub-batch sequence:** P19-B3a (port + classify) → Langston Step-4 on the port diff → P19-B3b (triage gate + #137 fixes). Each sub-batch returns to Langston at its own Step-4 / Step-8.

---

*Drafted by Claude New (CC-B). Langston Step-1 ACK 2026-06-13 — proceeding to Step 2 pre-audit (B3a portion first).*
