# P19-B5b — Scope: #94 xStock VIX+DXY macro snapshot on every decision record (+ #86 home confirm)

**Batch:** P19-B5b · **Date:** 2026-06-16 · **Author:** Claude New (CC-B) · **For:** Langston Step-1 ACK · Second of the B5 split (B5a CLOSED; B5c = #86 Q-D probe).

## Objective
Per Kyle directive 2026-06-13: **every xStock decision record carries a VIX+DXY snapshot at decision time**, so Phase-25 item 25-7 (the macro modifier) has real build material. **CAPTURE ONLY — the modifier BUILD stays Phase-25.** This is the #94 capture precondition.

## 🚨 NOT DORMANT (declared up front, §9.1)
Unlike B5a, B5b is **NOT dormant** — it rides the xStock eval-cycle's existing `archiveSignalEval` writes, which fire **EVERY cycle TODAY in the VTS/passive path**. So the macro snapshot **starts writing on merge**, not at paper-active turn-on. Low-risk (one added object on an existing write, fire-and-forget try/catch), but it is live-on-merge and will be stated as such in the completion report.

## Architecture (Step-1.a reads done)
- **Write sites:** `server/asset_classes/xstock_spot/eval-cycle.ts` — ~4 `archiveSignalEval` calls (reject + admitted), each with a `features:` object (`:555`, `:649`, `:694`, `:760`).
- **Feed:** `server/services/amr-equity-feed.ts` → `getLatestEquitySnapshot(): EquityMacroSnapshot` (`:293`) returns `{ vixZ: number|null, dxyZ: number|null, vix, dxy, ... }`. **Sync in-memory accessor — no DB round-trip.** Feed already runs (B-5).
- **Plan:** at each xStock `archiveSignalEval` call, read `getLatestEquitySnapshot()` once and attach `macro: { vixZ, dxyZ }` (+ raw vix/dxy) into `features` (JSONB, schema_version-tolerant → ZERO migration). Null-safe (feed may return nulls during warm-up / market-closed — capture the null honestly, don't fabricate).

## Questions for Langston (Step-1)
- **Q1 — scope of attachment:** all xStock decision records (reject + admitted) per Kyle's "every xStock decision record," or admitted-only (the rows Phase-25 25-7 actually trains on)? My lean: **all** (Kyle's words + reject rows are informative for "what macro backdrop correlates with rejects"), but flag the write-volume (every reject row gains the object).
- **Q2 — placement:** fold into `features.macro` (my rec — no migration, consistent with the existing JSONB feature bag) vs a dedicated typed column (migration; better for indexed Phase-25 queries). Lean `features.macro` for B5b, promote to a column in Phase-25 if 25-7 needs indexed access.
- **Q3 — #86 HOME (confirm before B5b closes, per the plan):** the continuous Q-D probe is homed to **B5c** (your Q2 @ B5 Step-1). Confirm B5c stays a **near-term own-batch** (capture-now/build-later) vs re-homing to a numbered Phase-25 friction-extraction item. My lean: keep **B5c near-term** (the friction-modeling surface wants distributional evidence accruing ASAP; always-on probe is cheap).
- **Q4 — crypto symmetry:** #94 is xStock-only (macro backdrop is an equity concept). Confirm crypto decision records get NO macro snapshot (correct — VIX/DXY don't gate crypto). 

On your ACK I draft the B5b pre-audit (Step-2). Governance will be SIM-only (new `features.macro` field on the xStock archive write) + System-Manual-N/A (observe-only); declared NON-dormant in the completion report §9.1.
