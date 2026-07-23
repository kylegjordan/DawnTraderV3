# P19-B8.5i — COMPLETION REPORT
## The trailing master switch: TWO flags (VTS + active), gated at the chokepoint

**Batch:** P19-B8.5i · **Issue:** #562 · **change-class:** architecture (per the scope header — see correction below)
**Owner:** CC-B (Claude New) · **Reviewer:** Langston (Step-1, Step-4, Step-4-delta, Step-8)
**Head commit:** `4768d6862` · **CI:** 4/4 GREEN on headSha `4768d6862` (run 29970163220)
**Deployed:** staging 2026-07-23 ~00:53 UTC, migration-FIRST · **Status:** COMPLETE

---

## ⚠️ SELF-CORRECTION — THIS REPORT OVERCLAIMED "GOVERNANCE COMPLETE" (2026-07-23, caught by the checker)

**Two required docs were absent when this batch was first reported closed, and this report asserted one of
them had landed. It had not.**

1. **`system_manual` — ABSENT.** The original text of this report read: *"the trailing control's
   two-mechanism structure … is recorded so the overlap is discoverable."* **`SYSTEM_MANUAL.md` was never
   edited** — a grep for `B8.5i|trailing_enabled` returned **0**. The claim was false. It has since been
   written properly (the two-mechanism control, its precedence, the shipped-off state, and the unchanged
   close-label chain).
2. **`pre_audit` — ABSENT.** No `P19_B8_5I_PRE_AUDIT.md` existed; the pre-audit findings had been recorded
   *inside the scope doc* instead. Now written, and **explicitly dated at close** rather than presented as
   foresight — because its absence is causally connected to this batch's one real failure (see below).
3. **change-class contradiction.** This report declared `non_architecture` while the scope header declares
   `architecture`. **The scope header governs** — it is what Langston reviewed and what the checker grades.
   Declaring a *lower* class at close, unreviewed, is backwards. Corrected to `architecture`.

**The lesson, which is the transferable part:** the missing Step-2 pre-audit is *why* CI went red. A
pre-audit doing the §9.5(a-ii) consumer census would have predicted that a new `requireKey` becomes a
precondition of `primeTECConfig` and therefore of **every DB-mocking TEC fixture** (8 files). Instead that
surfaced as a CI failure and a revert. Skipping the artifact did not just skip paperwork — it skipped the
one check that would have caught the defect before it shipped.

**Nothing about the deployed behaviour changed as a result of this correction.** The code, the migration,
the verification and the deploy were all as reported; the gap was in the governance record.

---

## 🚨 BEHAVIOUR DECLARATION

**THIS BATCH DOES NOT TURN TRAILING ON. Trailing remains OFF and shipped behaviour is
byte-identical.** Both flags seed `false` in the migration across all four asset classes,
per Kyle's standing directive ("trailing stays off entirely — we're not ready"). This batch
delivers the *control*, not a behaviour change.

---

## PREVIOUSLY-STATED-VS-NOW

| Item | Previously stated | Now | Reason |
|---|---|---|---|
| TEC governed key count | 11 | **13** | The two trailing master switches are now registered in `ALL_TEC_KEYS`. |
| Test files touched | 1 (`b65-tec-parity`) | **8** | The new `requireKey` hard-fails `primeTECConfig` in *every* DB-mocking TEC test — the red-CI cause. |
| Batch state | code reverted off-branch (`10d5dd33b`) | **re-applied + deployed** | CI cause identified and fixed. |

---

## OBJECTIVES

| # | Objective | Result | Evidence |
|---|---|---|---|
| OBJ-1 | Two flags — one VTS, one active (Kyle ruling) | ✅ YES | `trailing_enabled_vts` / `trailing_enabled_active`, resolved by `mode: CallerMode` at `trailing-exit-controller.ts:510`. Kyle's two-flag ruling **overrode** Langston's Step-1 Condition-1 options — per-lane flags put the VTS sites *in* scope rather than declaring them out. |
| OBJ-2 | Gate at the single chokepoint, not the 3 `useTrailing` sites | ✅ YES | `isMoonbagQualifier` is the sole gate; its one consumer is `tec-evaluator.ts:309`. The three `useTrailing:true` hardcodes are **unchanged**. |
| OBJ-3 | Behaviour-neutral, asserted on the `closeReason` STRING, both paths, via the config-seed path | ✅ YES | Full writer-chain trace below + 4 flag-gating tests in `b65-tec-parity`. |
| OBJ-4 | No runtime default — hard-fail from the DB row | ✅ YES | `requireKey('trailing_enabled_vts'/'_active')` at `:465-466`; `TEC_DEFAULTS` entries are fixture-seeding only. |
| OBJ-5 | Self-documenting overlap (Langston Condition-2) | ✅ YES | Semantics documented at both sites; the `moonbagQualifyingStrategies: []` comment rewritten from "variant-K-aligned" to its **subordinate** role. |

---

## OBJ-3 — THE CLOSED-TRADE LABEL SOURCE (Langston's ask), traced end-to-end

1. `trailing-exit-controller.ts:1225` — qualifier rejection sets `closeReason = 'target_hit_no_trailing'`
2. `tec-evaluator.ts:373-375` — **converts** it → returns `exitReason: 'target_hit'`
3. `active-execution-engine.ts:1581-1587` — `case 'target_hit'` → `{ type: 'target_hit' }`
4. `active-execution-engine.ts:1801` — writer persists `closeReason: exitCondition.type` = **`'target_hit'`**

**⇒ `target_hit_no_trailing` is a purely INTERNAL discriminator on the TEC→evaluator hop. It
never reaches the closed-trade row, storage, or analytics.** The persisted label is `target_hit`.

**Neutrality proof.** Today (empty allowlist) the qualifier returns false → `:1225` → persisted
`target_hit`. With the flag seeded FALSE it returns false at the *new* gate (`:510`), takes the
*same* `:1225` branch → persisted `target_hit`. Even the denial log text is identical
(`strategy-not-qualified`), because `!moonbagQualified` holds in both cases. **Zero observable delta.**

**Live corroboration:** all 14 open staging positions are `trade_mode = 'TARGET'`; zero in
`TRAILING_TAKE`.

---

## THE FIND — an internal contradiction in the previously-approved diff

The Langston-approved `21db08228` added `requireKey` for both keys but did **not** register them
in `ALL_TEC_KEYS`. That state was unsurvivable both ways: seeding the hardfail fixture failed
tripwire `(e)`, and not seeding failed `(a)`. `ALL_TEC_KEYS` has exactly one consumer — the
`b79-0n-tec-b-strict-hardfail` tripwire — and `requireKey` never consults it, so it is a canonical
key **registry**. Registering the two keys is what the tripwire demands, not a workaround.
Langston independently re-read and concurred.

---

## VERIFICATION

- **tsc baseline:** OK, no regressions above baseline.
- **FULL vitest A/B on the bench** (not just `b65` — the omission that caused the original red CI):

| Run | Failed files | Failed tests | Passed |
|---|---|---|---|
| Baseline (clean origin `cd444fc5`) | 10 | **0** | 2423 |
| With changes | 10 | **0** | **2427** |

  The 10 failed *files* are pre-existing pg-pool collection failures, **identical in both runs**.
  **+4 passing** = the 4 flag-gating tests.
- **CI:** 4/4 green on headSha `4768d6862`, verified by sha (not list position).
- **Deploy (migration-FIRST):** pulled → `db:migrate` (1 applied) → **verified all 8 rows present
  and `false`** → *then* build + restart. Zero `TEC_BOOTSTRAP_FAIL` / `TEC_MISSING_KEY`; HTTPS 200.
- **§9.3 UI (Claude-in-Chrome, staging):** dashboard, Ready-to-Buy (populated, live prices),
  Filter Health (1,546 scanned / 12 eligible), strategy cards — all render; no crash, no `--`,
  no undefined.

---

## SEPARATE FINDING SURFACED DURING §9.3 (not this batch, not caused by it)

The Paper dashboard's **"Active Trades" card reads 0** while `active_open_positions` holds
**14 open + 1 pending**. Traced: the card calls `/api/paper/trades/active`
(`client/src/components/trading/active-trades.tsx:157`) → `routes.ts:5480` →
`storage.getAllPaperTrades()` → reads `from(paperTrades)` — the **legacy `paper_trades` table**,
measured at **0 rows**. The active path writes `active_open_positions`, so the card is wired to a
retired table and is structurally always 0.

**Not caused by B8.5i** (this diff touches only the TEC config path; the route and storage method
are untouched, and the positions opened *before* the deploy). **Rule 24 outcome (3)** — legacy that
no longer fits intent. Filed with a named home; see RUNNING_ISSUES.

---

## GOVERNANCE FILES CHANGED

- `1-system-manual/BATCH_CATALOG.md` — batch entry
- `1-system-manual/PHASE_HISTORY.md` — phase status
- `1-system-manual/PHASE_19_PLAN.md` — §1 status board + §5 decision log
- `1-system-manual/RUNNING_ISSUES.md` — #562 resolved; new finding filed with home
- `1-system-manual/SYSTEM_IMPACT_MAP.md` — TEC governed-key set 11 → 13
- `1-system-manual/SYSTEM_MANUAL.md` — the trailing master switch: two mechanisms, precedence, shipped-off state, unchanged close-label chain **(added at correction)**
- `Claude Comms and Packages/Scope Files/P19_B8_5I_PRE_AUDIT.md` — Step-2 pre-audit **(added at correction, dated honestly)**
- `Claude Comms and Packages/Batch Completion/P19_B8_5I_COMPLETION_REPORT.md` — this file
- `.claude/memory/MEMORY_CC_B.md` (+ truth file)

**System Manual:** **APPLICABLE and now landed.** My original "applicable-lite" judgement was used to
justify describing the update instead of making it. The batch changes the exit-control surface — a second
governing mechanism with a precedence order — which is squarely System-Manual scope, and Langston's Step-1
Condition-2 (self-documenting overlap) required it explicitly.
