# B-OPEN-TRADES-DISPLAY — PRE-AUDIT

**change-class: non_architecture** · Owner: Claude Analyst (CC-C) · produced to close the governance docgap; the census below is what was actually traced before implementation.

## SIM / System-Manual read (Step-2 mandatory)
- **`SYSTEM_IMPACT_MAP.md` P19-B8.5f** — the SIZED-SIGNAL METADATA TRANSIT CONTRACT: keys ride `signal.metadata` → `active_open_positions.metadata` via the `...signal.metadata` spread at the open write; **maintenance rule: "adding a field there is additive and safe; REMOVING one silently breaks downstream."** ⇒ my change (adding six display keys) is the blessed additive case.
- **`SYSTEM_IMPACT_MAP.md` P19-B8.10** — the genesis display-context capture already stamps the regime LABEL (+ friction/DBS) into `active_open_positions.metadata`; item 5 EXTENDS exactly this pattern to the regime confidence/phase. So the SIM's own sibling entry is where the new keys are documented (updated in governance).
- **System Manual: N/A** — no architecture / strategy / regime-detection / filter / signal-pipeline / math change (Langston concurred). Display plumbing only.

## Component census (§9.5) — before editing the live open path

**Writers of `active_open_positions`:** exactly ONE — `active-execution-engine.ts:3288` `createActiveOpenPosition` (via `storage`), stated as a single-member list per rule 22. My edit is additive to that write's metadata object; no new writer.

**Readers of `active_open_positions.metadata` — the safety question (does an additive key perturb any reader?):** every reader is **key-specific**, none iterate the object:
- budget governor `exploration-lane.ts:85-115` — `metadata->>'admissionBasis'` / `metadata->>'assetClass'` (named JSON pluck).
- exit engine — `metadata.atr_at_open` / `metadata.regime` by name (`active-execution-engine.ts:1491+`).
- RTB rank floor — `meta.atr` by name.
No `Object.keys` / `for..in` / `->` spread-into-a-sum anywhere. **`phase` collision check:** it lands after `...signal.metadata`, so I chased other writers of a `metadata.phase` key — the only `metadata.phase` usages are exit-event objects (`mkExit`) and validation-session objects, **different objects, never `active_open_positions.metadata`**; nothing does `UPDATE active_open_positions SET metadata` with a `phase` key. ⇒ additive-and-safe. (Langston Step-4 independently traced this; CC-A + CC-B both corroborated against their own reads of the object.)

**Item 3 census — closed-trades display readers (does any show not-yet-closed rows?):** `trade-history-tab.tsx` passes `closedOnly=true` (since 2025-12-11) → `getClosedTradesPaginated` (`storage.ts:3210-3215`, gates `closed_at IS NOT NULL` + valid-exit); analytics (`routes.ts:12886`) filters ghosts post-query. All three filter the NULL-close rows ⇒ the "open positions in the closed table" premise does not reproduce (rule 24 — no fix fabricated). Orphans measured: 2 (07-15/07-18, none since).

## Blast radius
- Engine edit is additive to one write's metadata object — cannot alter admission / ranking / sizing / exit (display-only telemetry, honest-null). Runs on the live active-trading open path; additive-only.
- Adapter + test are client/test only.
- **Deconfliction:** `active-execution-engine.ts` is contended with CC-B (#556/#581 ATR work); claimed in-channel before editing, region `~:3288` distinct from their `sizingContext.atr`/`signal-orchestrator` surface — confirmed no overlap by CC-B.

## Verification plan
tsc baseline · `paper-trade-adapter.test` (present→mapped, absent→null) · Langston Step-4 · §9.3 UI on a freshly-opened position (item 5) + the closed table (item 3).
