# P19-B6.5a COMPLETION REPORT — Per-Asset-Class Active Gate

> **Batch:** P19-B6.5a · **Phase:** 19 · **Author:** Claude New (CC-B) · **Date:** 2026-06-17
> **Status:** code shipped + deployed + Step-7 verified; **Langston Step-8 CONFIRMED (independent staging verification 2026-06-17); closes on Kyle ack.**
> **Issue:** #235 · **Gate:** PHASE_19_PLAN §6 gate 10 (the B6.5a half) · **Scope:** `P19_B6_5_SCOPE.md` Rev-2 · **Pre-audit:** `P19_B6_5a_PRE_AUDIT.md`

---

## 🚨 §9.1 DORMANCY DECLARATION
**THIS BATCH DOES NOT TURN ANY ASSET CLASS ON.** It builds the per-asset-class active GATE, shipped **default-OFF for both classes** (`active_asset_classes = {}` on both modes, verified). Combined with the engine being passive (`is_engine_active=false`), nothing can trade regardless. The gate only ever RESTRICTS. It becomes load-bearing at **B6.5b's crypto-only dry-run** (which flips `crypto_spot` on via the new setter) and at the **B7b** crypto-first flip.

## §1 WHAT & WHY (one paragraph)
Active trading was gated only on the per-MODE `system_context.isEngineActive`; both the crypto scan and the xStock dispatch read that one flag, so flipping it on for paper mode would co-activate BOTH crypto and the still-incomplete xStock active path. B7b is staged crypto-first with xStock dormant → B7b *itself* cannot use the existing flag. B6.5a builds the missing infrastructure: an **additional, fail-closed, default-OFF per-(mode, asset_class) AND-gate** — a class trades iff `isEngineActive(mode) && isAssetClassActive(mode, class)`. B7b crypto-first becomes expressible (master ON + crypto ON + xStock OFF), with xStock provably untouched.

## §2 OBJECTIVES CHECKLIST
| # | Objective | Status | Evidence |
|---|---|---|---|
| A | Additive JSONB `active_asset_classes` on `system_context` (Q-A), fail-closed default `{}` | ✅ YES | migration applied; staging psql: `{}` on both modes |
| B | Single typed gate read (`isAssetClassActiveInContext`, `=== true`, no coercion) + async accessor delegating, fail-closed | ✅ YES | `trading-state-sync.ts`; 7 pure fail-closed unit cases |
| C | Setter `setAssetClassActive` mirroring `setEngineActive` H1 (await DB write FIRST, then broadcast; read-merge-write, no sibling clobber) (Q-C) | ✅ YES | round-trip test (flip without clobber); static-`contextBridge` cleanup (Step-4) |
| D | AND-gate wired at the 2 class entry points (crypto `fx5-scanner`, xStock `active-dispatch`) | ✅ YES | both gated; `classDormantSkips` counter; crypto falls to passive/VTS when OFF |
| E | Per-class witness (Q-D) — gate allow/skip counter + LIVENESS_SPLIT hard-breach hook | ✅ YES | `getAssetClassGateStats` + `witnessAssetClassEmissionWhileInactive` (uncalled → #321 home) |
| F | RTB entry-only + upstream-guarantee comment (Q-B); defense-in-depth → B6.5b/#320 | ✅ YES | 2 comments at `ready_to_buy_service.ts` |
| G | **xStock-ISOLATION acceptance test (gate 10)** — master ON + crypto ON + xStock OFF → zero xStock emission | ✅ YES | integration test: class-dormant branch, `dispatched` unchanged, orchestrator never reached |
| H | Both classes default OFF (Q-E) | ✅ YES | migration default `{}`; staging-verified |

## §3 WHAT LANDED
- **NEW column** `system_context.active_asset_classes jsonb NOT NULL DEFAULT '{}'` (additive migration + rollback + MANIFEST) + `schema.ts`.
- **`trading-state-sync.ts`:** pure `isAssetClassActiveInContext` (the single typed gate read) + async `isAssetClassActive` (delegates, fail-closed) + `setAssetClassActive` (H1 write-then-broadcast, read-merge-write) + per-class witness (`recordAssetClassGateDecision`/`getAssetClassGateStats` + `witnessAssetClassEmissionWhileInactive`).
- **Gates:** `fx5-scanner.ts` (crypto scan → falls to passive/VTS when crypto OFF) + `active-dispatch.ts` (xStock → `classDormantSkips` when OFF). Both use the context already in hand (no extra query).
- **`ready_to_buy_service.ts`:** 2 upstream-guarantee comments (#320).
- **Tests:** `p19-b6-5a-per-class-active-gate.test.ts` (11) + 2 existing C2/C3 mocks opt xStock active.

## §4 REVIEW + VERIFICATION
- **Langston Step-1** ACK + Option-C ruling + split; **Step-2** PROCEED + Q-A..Q-E rulings; **Step-4 APPROVE for push** + 2 non-blocking items (both addressed: static-`contextBridge` cleanup; #321 homes the uncalled witness + dual-active edge to B6.5b). **Step-8 CONFIRMED** (independent staging verification 2026-06-17, HEAD `500127614`: column present `{}` both modes fail-closed, `is_engine_active=false` both dormant, clean boot RTB-skipping, dormancy-by-construction on BOTH axes — "live in schema, fail-closed, and inert").
- **Bench:** tsc-baseline NO-regression; **47 targeted tests green** (11 new + 2 corrected C2/C3 + b70-run-mode + b5a-reject + item4-switch-cleave).
- **CI:** all-4-green on `500127614` (run 27686440014).
- **Deploy:** staging `git pull` + `db:migrate` (✓ applied) + build + pm2 restart; HTTP 200; clean boot.
- **Step-7:** psql — `active_asset_classes={}` both modes (fail-closed), `is_engine_active=false` both (dormant-correct), no gate errors in boot log.

## §5 GOVERNANCE FILES CHANGED
SIM (Cross-Cutting-State registry — new per-class gate entry), SYSTEM_MANUAL (gate-logic content), PHASE_19_PLAN (§1 board B6.5a→DONE + §5 log), RUNNING_ISSUES (#321 + #320 referenced), BATCH_CATALOG, PHASE_HISTORY, MEMORY (4-way), scope Rev-2, pre-audit, Step-4 change list, this report.

## §6 OPEN FOLLOW-UPS (named homes)
- **#321 → B6.5b:** wire or delete `witnessAssetClassEmissionWhileInactive` per the audit; record the dual-active (live+paper both ON) edge.
- **#320 → B6.5b:** RTB defense-in-depth decision pending the audit's upstream-guarantee proof.
- **B6.5b (next):** accretion-delta audit + crypto-only time-boxed reverted dry-run THROUGH this gate + fill-parity.

---
*Batch CLOSED only after Langston Step-8 CONFIRMED + Kyle acknowledgment.*
