# B-OUTCOME-FEEDBACK-WIRE — SCOPE (#602)

change-class: architecture
**Owner:** CC-A (OLD Claude) · 2026-08-05 · Kyle-sequenced: "fix immediately, before the quick-fix-list debates" — slotted in the break after B-RULES-1a's close, per his 2026-08-05 direction.

## 1. THE DEFECT (rule 24 outcome 3 — legacy that no longer fits today's data shape; nothing corrupted, nothing lost)

`active-execution-engine.ts` reads `(position as any).regime` at TWO sites. `active_open_positions` declares NO regime column (asserted WITH control at the #602 filing), and the runtime object is the row type — **the cast yields `undefined` on every read, always has.**

- **Consumer 1 — `:2101` (B67.4 outcome-feedback hook):** `regimeAtOpen` undefined → the `:2103` truthiness gate fails → **the active path has NEVER written the outcome-learning store.** Measured (population: last 100 `[B67.4][feedback]` writes): **100/100 `source=vts`, 0 active.** The system's real trading outcomes contribute nothing to calibration.
- **Consumer 2 — `:1561` (TEC exit-evaluation context, found in this scope's read):** `context.regime` undefined → **regime-scoped exit-knob resolution on the active path degrades to the wildcard tier on every cycle.** Blast-radius NOTE: whether any per-regime exit constant currently differs from its `'*'` row decides whether this consumer's fix CHANGES live exit behavior — measured in the pre-audit (§ pre-audit item 3) BEFORE implementation, per rule 24's don't-inject-bugs fear.

## 2. PROVENANCE (§2 1.b tier 1, both consumers; corpora searched: git -S at the ref, BATCH_CATALOG, RUNNING_ISSUES #602/#210/D9, SIM active-engine section)

- **Consumer 1 introduced `24c887023` 2026-05-01 — subject verbatim: "B67.4 cheap-tier bundle — outcome feedback + regime-age + Path B sustainability".** Born with the cast on its first line, WHILE active trading was OFF (Phase 8 → Phase 19 dormancy) — it sat in a path that never ran, so the dead read was unobservable until Phase 19 turned the path on. The VTS twin (`vts-service:persistRealPriceTrade`, same singleton store) works because VTS position objects DO carry `.regime` first-class. **Original intent (from the hook's own comment): "both close paths feed the same singleton OutcomeFeedbackStore … a unified per-tuple history." The intent is CORRECT and UNCHANGED — the active leg simply never functioned.** Disposition: (2) relevant, needs updating to today's data shape.
- **Consumer 2 introduced `dd1f53726` 2026-04-23 — subject verbatim: "B65.2: TEC exit-evaluator — centralize VTS + paper exit decisions".** Same era, same assumption that the position object carries `.regime`. Disposition: (2).
- **The data source that DOES exist today:** signals carry `metadata.regime` (`:2894` reads it for persistence), and `createActiveOpenPosition` spreads `...signal.metadata` into position metadata (`:3445-3446`). **Measured live (object: `active_open_positions`, population: ALL 8 current rows): 8/8 have `metadata->>'regime'`, values canonical (TREND_FRIENDLY_STABLE ×5, IMPULSE_EXPANSION ×3).** Positive control: the same query's GROUP BY returns real labels, not nulls.

## 3. THE FIX (surgical, both sites, one shape)

At both `:2101` and `:1561`: read the regime from position METADATA (the SSOT stamped at open), retiring the dead cast:
`const regimeAtOpen = (position.metadata as Record<string, unknown> | null)?.['regime'] as string | undefined ?? null;`
(exact typing to match surrounding idiom; no fallback to the cast — it never carried data, and a dead fallback is the absent-as-valid shape). Honest-absent stays honest: a position opened with no MCE context has no metadata regime → gate still (correctly) skips, and consumer 2 still resolves wildcard — same as today, not worse.

## 4. VERIFICATION
1. Unit fence: position with `metadata.regime` → `updateEma` called with that label; without → skipped (consumer 1); TEC context carries the label (consumer 2).
2. Staging, post-deploy: on the next real active close, a `[B67.4][feedback]` write with `source=paper_sim` appears (population check: the store's per-source counts move from 100/0). If no close occurs in the soak window, a §13 self-rescheduling alert carries the verification — zero rows is not a pass.
3. Consumer 2: log-line evidence that exit-knob resolution received the real regime (and the pre-audit's item-3 delta table says whether behavior changes).

## 5. OUT OF SCOPE
The `[0.85,1.05]` clamp, alpha, or any learning-math change; VTS-side anything; backfill of missed learning (the store is an EMA — history is not reconstructible and we do not fake it).
