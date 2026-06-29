# P19-B6.8 — Completion Report

**Batch:** P19-B6.8 — per-mode guardrail completeness (the user-facing guardrails tab) + #323 failsafe (#302 + #323)
**change-class:** architecture
**Owner:** Claude New (CC-B) · **Reviewer:** Langston (Step-1 consensus / Step-4 APPROVE / Step-8)
**Closed:** 2026-06-29 (pending Kyle ack)
**Head:** `ffb737b0c` · **CI:** `28357436217` all-4-green · **Deploy:** staging restart, HTTP 200, **no migration** (UI + endpoint only)

---

## ★ Premise correction (verify-everything pre-audit, Kyle-directed — the headline)

#302's premise — "user-settable guardrails still live in the mode-blind legacy `trading_settings` table → migrate them to per-mode `guardrails_v2`" — was **OUTDATED**. Verified against live code + DB:
- `trading_settings` user reads PURGED (Phase 41F-L); old `guardrails` table bypassed.
- The LIVE guardrails tab = **`<CoreFourGuardrails/>`** (goals-engine.tsx:71) → `/api/guardrails-v2` (GET+PUT), per-mode. **`GuardrailsTab` was imported but NEVER rendered** — its whole split-brain/dead-save-path tangle had zero user impact.
- DB confirmed **distinct paper + live `guardrails_v2` rows** — per-mode guardrails for both modes ALREADY exist + work. So #302's functional core was **already satisfied** (Langston consensus: "kills the word 'largely'").

**So B6.8 reframed (Langston Step-1 consensus) to: surface the one residual + cleanup.**

## Objectives + results

| OBJ | Description | Met | Evidence |
|---|---|---|---|
| 1 (functional) | Surface the daily-loss WARNING TIERS (50/75) as per-mode user controls — the one residual (they were DB-backed + firing in the failsafe but NOT user-settable; #323 fold) | ✅ YES | 2 controls render in the live paper tab (§9.3); persist per-mode (API/DB); RULE_011 coherency rejects bad values |
| 2 (§15) | Delete the stranded-dead `GuardrailsTab` + orphaned `copy-to-live-modal` | ✅ YES | git-rm + archived `_archive/deleted-code/*.removed` + DELETED_COMPONENTS_LOG; tsc-trace ZERO dangling refs; only CoreFourGuardrails renders |
| 3 (#323 failsafe) | Confirm failsafe = 50/75 alerts → auto-trip → manual restart | ✅ YES (already built B6 + now user-settable) | daily-loss-budget.ts behavior verified matches Kyle intent; the tab kill-switch + tiers now reach the per-mode v2 row it reads |

## Implementation (the 4 wiring places — Step-8 caught the 4th)
1. **UI** (`core-four-guardrails.tsx`): added `dailyLossWarning1/2Pct` to the local `GuardrailsV2` interface + `GuardrailParam` Pick + `CORE_FOUR_PARAMS_BASE` (after the kill switch, unit "% of kill switch") + descriptions; `handleSave` does the **per-mode** client coherency `0<w1<w2<100` (on `guardrails?.data` merged with edits → no paper/live cross-bleed).
2. **PUT endpoint** (`routes.ts /api/guardrails-v2`): added warning-tier EXTRACTION + `validationPayload` + `updatePayload` (the allow-list was silently dropping them).
3. **Server validation:** RULE_011 (`guardrail-policy.ts:421`) already enforced `0<warn1<warn2<100` (B6); PUT already calls `guardrailPolicy.validate`.
4. **★ Persistence (Step-8 fix `ffb737b0c`):** `upsertGuardrailsV2` UPDATE merge-map (`storage.ts:784`) had no entry for the warning tiers → a valid save validated + returned ok but **never persisted**. Caught by Step-8 DB cross-check; fixed by adding them to the merge-map (mirroring all siblings).

## Verification (Step-7 CC + Step-8)
- Bench: tsc-baseline GREEN; 23/23 guardrail tests pass (incl RULE_011 "Daily Loss Warning Tier Ordering").
- CI `28357436217`: TypeScript / Test Suite / Build / Docker all success.
- Deploy: HTTP 200, no migration.
- **API/DB (Langston OBJ-5 verify-wiring + DB-cross-check):** PUT paper 55/80 → fresh GET 55/80; DB paper=55/80 UPDATED + live=50/75 UNTOUCHED (per-mode isolation); coherency PUT 80/55 → RULE_011 FAIL; restore 50/75. **Not** a live failsafe trip (isEngineActive-gated, dormant — per OBJ-5 framing).
- **§9.3 STAGING-UI-VERIFIED (Claude-in-Chrome, /goals-engine paper tab):** all 8 Core Guardrails render including the 2 NEW "Daily Loss Warning 1/2 (% of kill switch)" with descriptions; mode indicator PAPER; only CoreFourGuardrails renders (GuardrailsTab gone).

## Scheduled follow-ups (named homes, §9.4/§13/§15)
- **P19-B6.10** (PHASE_19_PLAN §1): retire the legacy `guardrails` table + `PUT /api/guardrails` + `upsertGuardrails` throw-stub — requires migrating the 2 live callers to v2 first (cross-blast-radius, split per §15(b)).
- **RUNNING_ISSUES #400:** the 2 latent bugs (`reasoning-orchestrator.ts:500` stale old-table read; `intent-executor.ts:418` throwing upsert) — HOME P19-B6.10.

## Governance files changed
SYSTEM_MANUAL.md (Ch4 warning-tier user-control content), SYSTEM_IMPACT_MAP.md (guardrail-tab→v2 + GuardrailsTab §15-deletion), DELETED_COMPONENTS_LOG.md, PHASE_19_PLAN.md (§1 close + §5 decision + B6.10 row), RUNNING_ISSUES.md (#302 close-as-satisfied + #400), BATCH_CATALOG.md, MEMORY (CC-B + Langston).
