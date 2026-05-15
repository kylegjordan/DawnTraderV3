# B-NEW-39 — Pre-Audit

**Date:** 2026-05-16
**Branch:** `migration/aws-supabase`
**Scope:** `B-NEW-39_SCOPE.md` (sibling file)

---

## 1. Current module_constants state (verified 2026-05-16 via staging psql)

### Target row for Phase 1

```
module_name        | constant_name                | value
-------------------|------------------------------|-------
regime_classifier  | b67_5_post_composition_floor | 0.20
```

History per `1-system-manual/CURRENT_SETTINGS_REGISTRY.md:365`:
- Value: 0.2
- Scope: `(*, *, *, *)` (all wildcards)
- Override reason: `b70-3b-floor-drop-for-observation`
- Set at: `2026-05-05T13:21:00.654Z`

History per `1-system-manual/SYSTEM_IMPACT_MAP.md:1246`:
- Original value pre-B70.3b: 0.45
- Dropped to 0.20 by B70.3b on 2026-05-05 as "Post-composition floor drop for visibility — until B67.5 lands and re-tunes based on real distribution data"
- Code default fallback at `signal-orchestrator.ts:943-944`: 0.4 (`?? 0.4`)

### Target rows for Phase 2

```
module_name             | constant_name              | value
------------------------|----------------------------|-------
path_b_sustainability   | b68_5_dbs_slope_min        | 0.0
path_b_sustainability   | b68_5_path_b_momentum_min  | 0.001
path_b_sustainability   | b68_5_path_b_momentum_min  | 0.0005
```

**Two rows for `b68_5_path_b_momentum_min`** — likely scoped overrides (asset_class / strategy / regime / exchange). Code default in `DEFAULT_REGIME_CONFIG` at `market-regime.ts:76`: 0.002. Both DB values are MORE PERMISSIVE than code default already.

Per `1-system-manual/LEVER_INVENTORY.md:69`: "`b68_5_path_b_momentum_min` are DB-loaded as of B70.3."

---

## 2. SIM consult: components affected

### Components touched by B-NEW-39

| Component | Pre-B-NEW-39 | B-NEW-39 change |
|---|---|---|
| `module_constants` table | DB row at `regime_classifier.b67_5_post_composition_floor = 0.20` | Phase 1 UPDATE to 0.45 (one row, wildcard scope) |
| `module_constants` table | Two DB rows at `path_b_sustainability.b68_5_path_b_momentum_min = 0.001 / 0.0005` | Phase 2 UPDATE to 0.0 (or pre-audit-decided value, both rows) |
| `signal-orchestrator.ts:943-944` orchFloor read | Reads `b67_5_post_composition_floor` via getConstant; ?? 0.4 fallback | NO CHANGE — picks up new value on next module_constants read |
| `market-regime.ts:276` Path B gate | Reads `b68_5PathBMomentumMin` from regimeConfig | NO CHANGE — picks up new value on next config refresh |
| Live scanner / VTS / signal-orchestrator | live | NO CODE CHANGE — config-driven |

### UPSTREAM dependencies

- `getConstant` infrastructure operates with DB read + cache (verify cache TTL is short enough for changes to propagate on next signal cycle)
- `fullRegimeConfig` is populated from module_constants per `market-regime.ts:74-78` defaults overridden by DB

### DOWNSTREAM consumers

- `regime_factor_alternates` rows emitted post-fix will have higher `real_decision.confidence` values (no longer clamped at 0.20 in Phase 1, less compressed by b68_5 in Phase 2)
- B-NEW-37 forensic CLI re-run on post-fix data will show new decile shape
- `/api/analytics/factor-calibration` live UI panel will show different numbers post-fix (panel reads from regime_factor_alternates)

### SHARED STATE / BLAST RADIUS

**Blast radius:** LOW. Config changes only; no code; no PM2 restart. Module_constants is the canonical config store; live system reads from it on each evaluation cycle (or near-line-rate per cache TTL).

### NOT affected

- Active trading (currently OFF per Phase 19)
- xstock pipeline (asset_class-scoped — config changes only affect crypto_spot if scoped correctly)
- B70 archive
- B73 exit-strategy ablation
- B-NEW-33 / B-NEW-36 / B-NEW-37 historical outputs (rows already in DB unchanged)

---

## 3. Phase 2 value-choice analysis (what-if)

To decide between 0.0 vs 0.0005 vs 0.001 vs other values, ideally we'd query: "for trades that had Path B momentum just above each threshold, what's the post-modulation WR?" But the regime_factor_alternates table doesn't directly store `mom` — it stores the resulting confidence. So the what-if can't be exactly computed from existing data.

**Proposal:** start at 0.0 (the most permissive non-negative threshold). If Phase 2 verification shows the inversion fully resolved with no obvious over-correction, hold at 0.0. If post-Phase-2 forensic shows degraded predictive content somewhere (e.g., lift sign flips), step back to 0.0005 / 0.001 and re-verify.

Two-row scoping handling: identify the scoping columns for the 0.001 and 0.0005 rows (likely asset_class differences) before UPDATE. Both rows update to the same target value (0.0) initially; if scope-specific behavior emerges in verification, revisit.

---

## 4. Test plan

| Test | Phase | Pass criterion |
|---|---|---|
| Phase 1 SQL applies | 1 | 1 row updated; value column = '0.45' |
| Phase 1 forensic re-run completes | 1 | B-NEW-37 forensic exits 0 with new report |
| Phase 1 % pinned at 0.200 → ~0% | 1 | Forensic Phase 4 metric |
| Phase 1 top-decile WR improves | 1 | Forensic Phase 5 decile table |
| Phase 2 SQL applies | 2 | 2 rows updated; value = '0.0' |
| Phase 2 Δconf magnitude drops | 2 | Forensic Phase 3 |
| Phase 2 decile shape = monotonic-up or flat | 2 | Forensic Phase 5 shape verdict |
| B-NEW-36 cohort diagnostic shows broader improvement | post-2 | Re-run `npm run b-new-36:cohort-diagnostic` |
| Crypto regression: NONE | both phases | Live scanner unchanged; `/api/analytics/factor-calibration` panel reads new data |
| Rollback works | each phase | Rollback SQL re-applied returns to pre-fix state |

---

## 5. Estimated work + sequencing

- Step 1 (scope) — DONE
- Step 2 (this pre-audit) — DONE
- Langston review — pending
- Step 3a + 6a + 7a (Phase 1 SQL + apply + verify) — ~30 min
- Step 3b + 6b + 7b (Phase 2 SQL + apply + verify) — ~30 min
- Step 8 (Langston review of post-fix forensic) — ~10-30 min
- Phase 3 (conditional, if shape still problematic) — variable; possibly split to B-NEW-40
- Step 10-11 (governance + completion report) — ~45 min

Total CC work ≈ 2-3 hours if Phases 1+2 resolve cleanly; +1-2 days if Phase 3 fires.

---

## 6. Standing rules verified

- Scope file written before implementation: YES
- Pre-audit consults SIM: YES (Section 2)
- Plain-language Kyle summary planned: YES (completion report, overnight summary)
- NO PATCHES doctrine: YES — Phase 1 is config revert to pre-B70.3b original value (NOT a workaround); Phase 2 is calibration of an already-tunable knob
- Per-asset-class default: pre-audit will verify scope of the b68_5 rows; floor row is wildcard
- Crypto regression check planned: YES (verification criterion 9)
- File-first protocol for Langston ask: YES — scope + pre-audit total ~13KB

---

## 7. Open questions deferred to Langston review

Q1-Q5 from `B-NEW-39_SCOPE.md` §8.
