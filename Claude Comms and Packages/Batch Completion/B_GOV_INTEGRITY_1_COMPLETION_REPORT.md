# B-GOV-INTEGRITY-1 — Completion Report

**Owner:** CC-A (Claude Old). **Date:** 2026-07-10. **change-class:** architecture.
**Origin:** Kyle directive 2026-07-10 — *"our system is broken because it has allowed all of these things to happen… acknowledged and just falsely verified and pushed to the side as completed."* The CC-A workstream of the 3-way governance-integrity program. **Absorbs** B-ALERT-TAXONOMY (RUNNING_ISSUES #38).

---

## Objectives — checklist with evidence

| Obj | Result | Evidence |
|---|---|---|
| **OBJ-1** resolve provenance (2 trust-level fields + hard evidence gate) | ✅ YES | `SystemAlert` gains `resolved_at`, `resolved_by_claimed`, `resolved_by_transport`, `resolution_evidence`; `resolveAlert(id, by, evidence, transport)` hard-gates via `isValidResolutionEvidence`. **LIVE-verified on staging:** `resolve` w/o `--evidence` → "Missing required flag"; `resolve … --evidence "looks fine"` → gate rejects with the sentinel-list error. |
| **OBJ-2** honest backfill of 250 historical resolves | ✅ YES | `scripts/b-gov-integrity-1-backfill-resolve-provenance.ts` + `__backfillResolveProvenance__`. **Applied live:** 250 backfilled, id-set conserved (lost=[] gained=[]), 255/255, all pass the gate. **Independent re-read:** 250/250 carry the sentinel; 0 fabricated `resolved_at` (all == `acknowledged_at`); 0 invented identity (all `claimed == acknowledged_by`); 0 non-null transport. Idempotent (2nd apply → 0). |
| **OBJ-3** class-driven delivery | ✅ YES | `shouldDeliverToDiscord()` — warning/critical always deliver; info delivers iff category ∈ `{governance, breakage}`. Fixes 117 info alerts (incl. info-severity governance gaps) that never reached Discord. |
| **OBJ-4** category SSOT (delete the cast) | ✅ YES | `as AlertCategory` cast DELETED (both sites); `AlertCategory` DERIVED from `ALERT_CATEGORIES` const (7 members); `addAlert` validates via `assertCategoryCreatable` (throws on off-SSOT); `routes.ts` imports the SSOT (was a hand-literal omitting `governance` — 181 rows / 71% unfilterable). `recurring` dropped (0 writers); `health_check` kept (2 live writers at the ref — code-view beat the 0-rows data-view). |
| **OBJ-5** JSONL migration safety | ✅ YES | Backfill reuses the store's own `withLock` + `writeAllAlertsAtomic`; pre-hash recorded (`5602ce3c…` → `9858d6b6…`); id-set conservation checked (a SET diff, not `len` — #495); no delete path. |

## Verification (outcomes-based)
- CI 4-green on head `19f80d3b8` (run 29112674183): Test Suite · Build · TypeScript Check · Docker Build all success.
- Bench: tsc baseline no regressions; alert unit suite **24/24 green** (9 new B-GOV-INTEGRITY-1 cases + 15 existing).
- Staging deployed (HTTP 200); the evidence gate, category validation, and honest backfill all verified LIVE on the real 255-row store.
- **The seam (Layer-A ∩ Layer-B):** proven by running the Layer-A gate against the exact strings CC-B's checker emits (40-hex sha + `NO-EVIDENCE-GIVEN`) — both pass; a regression-guard test locks the shape contract.

## Langston reviews
- Step-1 scope APPROVED; Step-2 pre-audit PROCEED (all counts independently re-derived by id-set); Step-4 diff APPROVED (fix-forward on 2 minor non-blocking notes, both applied: evidence `path:line` rule tightened so a bare time fails; seam-test marked shape-not-coupling). Msg `1525197135530823771` → done.

## Deviations surfaced (not buried)
- **`resolved_by_transport = null` on backfill** (scope implied a free-form sentinel). The field is a typed `ResolveTransport` enum; `null` is the truthful "channel unknown" for a historical row. Langston Step-4: *"better than my written scope… keep it."*
- **Evidence gate is a forcing function, not airtight validation** (documented HONEST LIMIT block): an English hex-word passes the sha rule; the real safety is the `NO-EVIDENCE-GIVEN` honest escape + Layer-B semantic verification at the checker's graded ref.
- **`ResolveTransport` member `'governance-checker'` is currently unused** — the checker resolves VIA the CLI, so its resolves carry `resolved_by_claimed='governance-checker'` (identity claim) + `resolved_by_transport='cli'` (verifiable channel), which is the two-field design working. The enum member is left intentionally for a future direct-call path (per rule 18, listed here so a grep doesn't read it as a miss).

## Process incident (surfaced + homed)
- `c24599cfa` reached origin before its Step-4 via CC-B's shared-HEAD push (the exact hazard flagged 40 min prior). CI-green + undeployed → bounded; Step-4 completed before the DEPLOY gate. Homed: **RUNNING_ISSUES #460**, proposed fix per-CC `git worktree` isolation (`B-CC-WORKTREE-ISOLATION`). Interim mitigation adopted: **pre-push enumeration** (`git log --oneline origin..HEAD`, read every commit) — used on the fix-forward push, caught clean.

## Governance files changed
BATCH_CATALOG, PHASE_HISTORY, RUNNING_ISSUES (#447 resolved-by-this, #38 absorbed, #460 filed, #493 cross-ref), SIM (SystemAlert shape + resolve-provenance + delivery routing + category SSOT), CHANGES_AND_FIXES (FIX-2026-07-10), MEMORY_CC_A, this report. SYSTEM_MANUAL judged NOT applicable (alert infrastructure is SIM-scope; this batch changed no strategy/regime/filter/signal/math — the applicability judgment per CLAUDE.md 9).

## Forward item - NOW OBSERVED (2026-07-10, CC-B)
- **Live seam end-to-end CONFIRMED.** CC-B ran the checker's exact resolve shape through the live gate (alert 48166fa3, "--by cc-b-seam-test --evidence 773c987dd4..." the graded-ref sha). Stored row: state=resolved, resolved_by_claimed=cc-b-seam-test, resolved_by_transport=cli, resolution_evidence=773c987dd4e87e805101226d37151e0fc089d1c4, resolved_at==acknowledged_at (no fabricated time). The sha RE-DERIVES ("git show 773c987dd4...:RUNNING_ISSUES.md" returns the real header). Full chain proven: checker EMITS sha --evidence -> live gate ACCEPTS+STORES -> stored sha genuinely re-derivable; the reject leg (no evidence / "looks fine") already proven. CC-B's "resolved_by=None" was a field-name mismatch: there is deliberately no bare resolved_by field (#447 -- we never named a field we cannot authenticate); the identity is in resolved_by_claimed (=cc-b-seam-test, correct). No defect.

## Scaffolding-vs-functional
Not scaffolding — the capability is FUNCTIONAL and LIVE: closures now carry an enforced, honest record; 250 historical closures backfilled; off-taxonomy categories rejected; info governance alerts now deliver.
