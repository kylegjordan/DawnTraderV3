# P19-B5b — Pre-Audit: #94 xStock VIX+DXY macro snapshot on every decision record

**Batch:** P19-B5b · **Date:** 2026-06-16 · **Author:** Claude New (CC-B) · **For:** Langston Step-2 review. Your 4 Step-1 calls + 2 refinements adopted; both refinements are **already satisfiable by the existing snapshot** (good news below).

## Anchor 1 — the feed (your Step-4 sync-read check, pre-confirmed)
`getLatestEquitySnapshot()` (`server/services/amr-equity-feed.ts:293-318`) is a **pure sync in-memory read** — it reads `state.*` + `vixWindow.stats()`/`dxyWindow.stats()` (in-memory observation windows) and computes z inline. **No `await`, no DB query, no lazy fetch.** Calling it once per xStock archive write adds zero round-trips. (You'll re-confirm against the diff at Step-4; pre-flagging it holds.)

## Anchor 2 — your refinement #1 (FRESHNESS) is ALREADY in the snapshot
`EquityMacroSnapshot` (`:87-111`) already carries **`ageSeconds`** ("Seconds since the last successful poll of ANY source"; `Infinity` if never polled) — exactly the fresh-vs-stale discriminator you asked for. Plus per-source observation stamps `vixObservedAt` (CBOE last_trade_time) + `dxyEcbDate`, and `partialFeed` (one source flowing, other not). So freshness is captured natively — no new feed field needed.

## Anchor 3 — your refinement #2 (EXPLICIT NULL) is structural
All snapshot value fields are already `number | null` (`vixZ`/`dxyZ` null below min-obs; `vix`/`dxy` null until first observation). The macro object is built by **straight field copy** (`{ vixZ: snap.vixZ, ... }`), NOT an omit-on-null spread — so `JSON.stringify` preserves `vixZ: null` as an explicit null, distinct from `vixZ: 0`. The diff will show no conditional key-drop. A market-closed null and a neutral 0.0 stay different facts.

## Anchor 4 — the attach (the `features.macro` object)
A shared helper `buildMacroSnapshot()` (co-located, xStock-only) returns:
```
macro: { vixZ, dxyZ, vix, dxy, ageSeconds, partialFeed, vixObservedAt, dxyEcbDate }
```
attached into the existing `features` JSONB at each xStock archive write (Q2 = features.macro, no column → ZERO migration). The helper keeps the 4 call-sites one-liners and the snapshot-shaping in one place. Null-safe by construction (straight copy).

## Anchor 5 — the write sites (Q1 = ALL xStock decision records)
`server/asset_classes/xstock_spot/eval-cycle.ts` has the per-decision `archiveSignalEval` calls at **~:555 (reject), :649, :694, :760 (admitted)** — each already builds a `features` object. Step-3 threads `...buildMacroSnapshot()` into each `features`. **Q4 crypto-no-macro is satisfied BY CONSTRUCTION** — this file is the xStock eval cycle; crypto's `vts-runner`/orchestrator writes are untouched, so crypto records never get a macro field.

## 🚨 NOT DORMANT (§9.1, declared)
These 4 writes fire **EVERY cycle TODAY in the VTS/passive path** → the macro snapshot **starts writing on merge**, not at paper-active. Low-risk (one ~6-field object on rows already written; sync read; fire-and-forget try/catch already wraps these archive calls). Will be declared NON-dormant in the completion report.

## Proposed Step-3 chunking (small batch)
- **A** — `buildMacroSnapshot()` helper (reads `getLatestEquitySnapshot()`, returns the curated null-preserving object) + thread it into the 4 eval-cycle `features` objects.
- **B** — unit tests: (1) macro object present with vixZ/dxyZ/ageSeconds on an xStock archive row; (2) **null-preserved** — feed returning `vixZ:null` yields an explicit `null` key, NOT omitted, NOT 0; (3) freshness present (ageSeconds carried); (4) crypto path unaffected (no macro key) — assert by construction.
- Bench (tsc no-regression + vitest) → CI → deploy → Langston Step-4 (embedded diff) → governance.

## Governance
- **SIM:** content note — `features.macro` snapshot now on the xStock `signal_eval_archive` writes (the #94 capture precondition for Phase-25 25-7). Pointer that the typed-column promotion is homed in 25-7.
- **System Manual: N/A** (observe-only instrumentation; no signal/regime/strategy/math change) — stated in completion report.
- RUNNING_ISSUES #94 → capture precondition LANDED (build stays 25-7).

## Questions for you (Step-2)
- **Q-A:** the macro field SET — is `{ vixZ, dxyZ, vix, dxy, ageSeconds, partialFeed, vixObservedAt, dxyEcbDate }` the right capture set, or trim/extend? (I lean: keep raw vix/dxy too — z-scores depend on the rolling baseline which 25-7 may recompute; raw values are baseline-independent ground truth.)
- **Q-B:** chunking A/B OK for a batch this small?
