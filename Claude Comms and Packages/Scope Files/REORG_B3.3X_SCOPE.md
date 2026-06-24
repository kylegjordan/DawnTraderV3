# reorg-B3.3x — xStock VTS un-strangle (the xStock half of reorg-B3.3)

change-class: architecture (signal-pipeline / VTS — xStock)
Author: CC-B (NEW Claude) 2026-06-24 · Reviewer: Langston (Step-1 scope + the §3 design fork) · RUNNING_ISSUES #382

---

## 0. Why (Option A from reorg-B3.3)

reorg-B3.3 un-strangled the CRYPTO VTS path (`vts-runner`) by opting it into `gateDisposition='tag'` so the 18
strategies stop hard-dropping quality-gated signals at signal-gen. The **xStock VTS path
(`server/asset_classes/xstock_spot/eval-cycle.ts:526`) was deliberately left default-`'enforce'`** (still
strangled) because its downstream is structurally different. B3.3x un-strangles it.

## 1. Step-2 pre-audit — the xStock VTS gate chain (DONE, in code)

`eval-cycle.ts` post-detect flow: `callStrategyDetect(:526)` → setup-hash dedupe (:590) → post-detect scores
(:606) → **Net-EV kernel + floor (:631/:657)** → pre-open gates (:686) → open `xOpenTrade` (:731) →
`registerOpenVtsTrade(:860)`.

**The structural differences from crypto `vts-runner`:**
1. **No `normalizeAndGateTarget` call.** Crypto re-derives the RR/reachability verdict at `vts-runner:1203`
   (the reorg-B3.2 tag-don't-drop point + the reorg-B3.3y `target<=entry` validity). xStock has NONE of that —
   it relies entirely on the strategy guard's internal drop.
2. **No `vtsGateVerdict`.** The `xOpenTrade` record (:731) has no verdict field; crypto's `OpenVirtualTrade`
   got it in B3.2. (The sink `registerOpenVtsTrade` is SHARED — its interface already carries `vtsGateVerdict`,
   so adding the field to `xOpenTrade` flows with zero sink change.)
3. **Its own Net-EV floor** (`VTS_NET_EV_FLOOR`, :657) — already imported.

**Confirmed:** eval-cycle is VTS-ONLY (`mode:'vts'` everywhere); xStock ACTIVE (when it turns on, Phase 21)
routes through the orchestrator, which already has the normalizer at :1227. So a normalizer addition here is
purely a VTS-path change. The inputs the normalizer needs are all in scope at the detect site: `entryPrice`
(:607), `stopLoss` (:609), `takeProfit` (:608 = native target), `mceContext.indicators.atr` (:753).

## 2. Objectives

**OBJ-1 — opt the xStock VTS dispatch into `'tag'`.** `eval-cycle.ts:526` `callStrategyDetect(..., 'tag')` →
the strategy guard stops hard-dropping quality fails (rr_below_min/unreachable) on the xStock VTS path; validity
(invalid_atr, stop_distance) still drops at the strategy. This ALONE removes the strategy-level strangle.

**OBJ-2 — give xStock the same downstream disposition + verdict as crypto (the §3 fork).**

**OBJ-3 — `vtsGateVerdict` on the xStock trade record** (parity for the "what active would do" analysis filter).

**OBJ-4 — tests + Step-7 (xStock `TAG_NO_DROP`-equivalent markers fire; xStock VTS opens climb) + governance.**

## 3. ⚠️ DESIGN FORK — needs your call

- **Option B — UNIFY (my recommendation):** add the `normalizeAndGateTarget` call to eval-cycle right after
  detect (mirroring `vts-runner:1189-1229`'s reorg-B3.2 + reorg-B3.3y block): tag quality (rr_below_min,
  unreachable) → set `vtsGateVerdict` + continue with native target; DROP validity (invalid_atr,
  invalid_geometry) → skip. Then add `vtsGateVerdict` to `xOpenTrade`. **Upside:** ONE VTS-gating SSOT across
  both classes; xStock gets the reorg-B3.3y `target<=entry` validity backstop FOR FREE (it currently lacks
  it — without this, a degenerate xStock long could flow, the exact B3.3y bug on the xStock side); full
  crypto/xStock parity. This is the NO-PATCHES architecture — closes the gap, doesn't paper it.
- **Option A — MINIMAL:** opt into `'tag'` only (OBJ-1), compute `vtsGateVerdict` inline, and add a bespoke
  `target<=entry` check in eval-cycle. **Downside:** parallel disposition logic (a second copy of B3.2/B3.3y),
  drifts from the crypto SSOT — exactly the kind of duplication we keep consolidating.

**I strongly recommend Option B.** The reason eval-cycle lacks the normalizer is a build-history GAP (it was
built separately at B79.0m), not a deliberate exclusion — unifying is the right close. Your call.

## 4. Blast radius / risk

VTS-only (eval-cycle is `mode:'vts'`); xStock ACTIVE path (orchestrator) untouched. Adds the normalizer +
verdict to ONE file (eval-cycle) + the trailing `'tag'` arg. No schema/migration (verdict re-derivable, shared
sink interface already has the field). The crypto path is untouched. Risk concentrated in slotting the
normalizer at the right point in eval-cycle's flow (right after detect, before the Net-EV kernel — same order
as crypto) and the disposition/verdict wiring, both pinned by a unit test mirroring crypto's.
