# B-SIZING-DEC-RESTORE — increment 1 change list (Step 4): guardrail-edit safety and the kill-switch write

## Dispatch header (the three fields)
| # | field | value |
|---|---|---|
| i | **Declared change-class** | `architecture` (`B_SIZING_DEC_RESTORE_SCOPE.md` header, unchanged at r8) |
| ii | **That class's doc set** | scope — present (`Scope Files/B_SIZING_DEC_RESTORE_SCOPE.md`, r8 `b9bda0787`) · pre_audit — present (`Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md`, §13 Step-2 APPROVED `a0d58b57a`) · completion_report — absent, Step 11 · batch_catalog — absent, Step 10 · phase_history — absent, Step 10 · system_manual — absent, Step 10 (the anchor-reason list F11, the sizer formula F13) · sim — absent, Step 10 (the new storage methods, the audit builder, the range CHECKs) · conditional: running_issues — present (`#1088`, `#1089`), phase_19_plan — present (placement `:19`), deleted_log — N/A in this increment (nothing deleted; obj-3/obj-4 deletions are increment 2), changes_and_fixes / roadmap — N/A (no roadmap change) |
| iii | **Step-2 reference** | `B_SIZING_DEC_RESTORE_PRE_AUDIT.md` §13 (r2 approved, conditions A-F in §13.4) |

## What this increment is
The three plan items that make a HAND-EDITED sizing % safe, which Kyle's corrected `PAPER-RESET-3000` depends on (he adjusts the paper position % every few days to hold $140-150 a trade), plus the kill-switch write they share code with. **Nothing here changes how a trade is sized or opened.** Increment 2 = obj-3/obj-4 deletions + derived slots + the dying coherency rules; increment 3 = the reset (P1) and the band alert (P4).

| plan item | finding | what changed |
|---|---|---|
| **P7** | F9, **F15 / `#1088`** | trip and reset write ONLY `killSwitchTripped` / `killSwitchReason` / `killSwitchTrippedAt`, through a new `storage.setKillSwitchState` — so a trip is now SAVED, and a guardrail saved moments before a trip is no longer reverted |
| **P5 (a)** | F7, F13 | new `RULE_012` (position %) and `RULE_013` (exposure %): `0 < x ≤ 100`, non-finite fails; **new ids** (not RULE_002, Langston condition D); `p > e` deliberately NOT refused |
| **P5 (a)** | F7 | migration: DB CHECKs `guardrails_v2_max_position_percent_pct_range` and `…_max_total_exposure_pct_range`, same bounds; rollback beside it, MANIFEST entry |
| **P5 (b)** | F7 (Langston B3) | the settings screen no longer turns an emptied box into 0, for all eight fields; save refuses anything that is not a number |
| **P5, folded** | found in Step 3 | `getEffective` no longer masks a stored position % with a hard-coded 30 / 10 (rule 15). The same pattern in the three low-price settings is `#1089`, homed to increment 2 |
| **P6** | F8 | the save signs `lastUpdatedBy`; its audit rows are built from the payload (every changed field, numbers compared as numbers — exposure was never audited) and written in the SAME transaction as the save |

## The load-bearing hunks

**P7 — `server/services/guardrail-policy.ts` (`tripKillSwitch`; `resetKillSwitch` is the same shape with false / null / null)**
```ts
// BEFORE
    const guardrails = await storage.getGuardrailsV2({ mode });
    if (!guardrails) { throw new Error(`... Cannot trip kill switch: no guardrails_v2 row ...`); }
    const { lockedByUser: _lockedByUserRaw, ...rest } = guardrails;
    const lockedByUser = _lockedByUserRaw as InsertGuardrailsV2['lockedByUser'];
    await storage.upsertGuardrailsV2({ ...rest, mode, lockedByUser,
      killSwitchTripped: true, killSwitchReason: reason, killSwitchTrippedAt: new Date() });
// AFTER
    await storage.setKillSwitchState(mode, { tripped: true, reason, trippedAt: new Date() });
```
**`server/storage.ts` — the new method (throws when the mode has no row, as the old null-guard did)**
```ts
  async setKillSwitchState(mode, state) {
    const [result] = await db.update(guardrailsV2)
      .set({ killSwitchTripped: state.tripped, killSwitchReason: state.reason,
             killSwitchTrippedAt: state.trippedAt, lastUpdated: new Date() })
      .where(eq(guardrailsV2.mode, mode)).returning();
    if (!result) throw new Error(`[#1088][setKillSwitchState] no guardrails_v2 row for mode=${mode} ...`);
    return result;
  }
```
**P6 — `server/storage.ts`: the upsert takes an executor, and the audited save is one transaction**
```ts
  async upsertGuardrailsV2(data, exec: Pick<typeof db, 'select' | 'update' | 'insert'> = db) {
    const [existing] = await exec.select().from(guardrailsV2).where(eq(guardrailsV2.mode, data.mode));
    ...  // the field list is UNCHANGED; `db` → `exec` in the update and the insert
  }
  async upsertGuardrailsV2WithAudit(data, audit) {
    return await db.transaction(async (tx) => {
      const row = await this.upsertGuardrailsV2(data, tx);
      if (audit.length > 0) await tx.insert(auditLog).values(audit);
      return row;
    });
  }
```
**P6 — `server/routes.ts` (the PUT): 110 lines of per-field audit blocks replaced**
```ts
      updatePayload.lastUpdatedBy = String(userId);
      const oldGuardrails = await storage.getGuardrailsV2({ mode });
      const { buildGuardrailAuditEntries } = await import('./services/guardrail-audit.js');
      const auditEntries = buildGuardrailAuditEntries(oldGuardrails as unknown as Record<string, unknown> | null, updatePayload, userId, mode);
      const guardrailsData = await storage.upsertGuardrailsV2WithAudit(updatePayload, auditEntries);
```
`server/services/guardrail-audit.ts` (NEW, pure): one row per changed field in the payload; `mode` and `lastUpdatedBy` excluded; `lockedByUser` compared as JSON; numeric fields compared as numbers.

**P5 — `server/services/guardrail-policy.ts` `validate()`**
```ts
    const pctRangeRules = [
      { id: 'RULE_012', name: 'Position Size Range', param: 'maxPositionPercentPct', ... },
      { id: 'RULE_013', name: 'Total Exposure Range', param: 'maxTotalExposurePct', ... },
    ];
    for (const r of pctRangeRules) {
      const raw = (guardrail as Record<string, unknown>)[r.param];
      if (raw === undefined) continue;
      const v = parseFloat(String(raw));
      const ok = Number.isFinite(v) && v > 0 && v <= 100;
      if (!ok) { failures.push({ ruleId: r.id, ... }); this.incrementMetric('ruleFailures', r.id); }
    }
```
**`getEffective`**: `maxPositionPercentPct = value ? parse : (paper 30.00 | live 10.00)` → `parseFloat(String(guardrail.maxPositionPercentPct))`.
**`audit/coherency_rules.yaml`**: RULE_012 and RULE_013 added (name, condition, rationale, error message, examples).
**`client/src/components/goals/core-four-guardrails.tsx`**: `handleValueChange` keeps a non-number as typed (was `parseFloat(value) || 0`); `handleSave` refuses while any edited value is not a finite number.

## Tests
| file | legs | proves |
|---|---|---|
| `server/tests/unit/b-sizing-p5-p6-guardrail-edits.test.ts` (NEW, 20) | RULE_012 / 013 refuse 0, −1, 500, 100.01, NaN, '' (position) and 0, 150, 'abc' (exposure); pass 5 / 100 and the live row's 30 / 25; absent field unchecked; `getEffective` reads 0 as 0; the audit builder (exposure audited, `20` over `20.00` not audited, JSON lock map, booleans, no old row) | **mutations run:** deleting the RULE_012 entry → 6 legs fail; string comparison in the builder → 1 fails; restored → 20 pass |
| `server/tests/integration/b-sizing-inc1-guardrails-db.test.ts` (NEW, 12, real Postgres; all 12 ran and passed in CI `36550084772` on `5af3acb49`) | P7: a trip saves all three columns, a reset clears all three, a trip does not revert a % saved after a stale read; P5: the DB refuses position 0 / 500 and exposure 0 (control: 5 / 100 accepted); P6: a failing audit row (`audit_log.field` longer than its `varchar(100)`) rolls the save back (control: no audit rows → the save lands); FINDING-2: a valid audit row is written beside the save with the STORED value (sent 6.555, logged 6.56) | the DB legs run in CI only (no local Postgres here: Docker is not installed), so locally they report SKIPPED, and in CI an unreachable DB FAILS the file. Mutation witnesses are stated per leg; FINDING-2's (delete `tx.insert(auditLog)`) was not executed |

Related suites re-run: `b-guardrail-fail-closed`, `p19-b6-daily-loss-budget` (+ integration): 66 pass. TypeScript baseline gate: 377 = 377.

**CI (graded ref `7417aa3d8`): run `36548460845`, 4/4 per job.** All 11 real-database legs RAN and passed in the Test Suite job (each with a timing; none skipped). The previous run, `36547982436` on `05715c150`, failed ONE leg: the rollback leg forced its audit insert to fail with an unknown `changed_by` user, and the test database does not enforce that foreign key, so the insert succeeded. `7417aa3d8` makes it fail on `audit_log.field` `varchar(100)` instead; the other ten legs passed in both runs.

## Judgement calls to attack
1. **`upsertGuardrailsV2` takes an executor rather than a second copy of its field list.** A second list would be a second place to forget a column, which is exactly `#1088`'s class. The `Pick<typeof db, ...>` type accepts the transaction object; tsc agrees.
2. **The audit builder audits every field in the PAYLOAD**, not a fixed list. A future field the route writes is audited automatically; a field the route stops writing is not. It still audits only when a row existed before (unchanged).
3. **Exposure bounded at `≤ 100`.** `#698` am.1 once weighed `e` = 400 as a config-only option; that option died with the two-term formula (F13), and spot trading cannot commit more than the balance.
4. **`getEffective`'s fallback removed in this increment, not deferred**: it is the same field P5 bounds, and it masked the one value (0) the sizer refuses on.
5. **The integration file combines P5, P6 and P7 legs** because they write the same `guardrails_v2` row and vitest runs files in parallel.

## Step 4 — APPROVED at `aa6f934cf` with two conditions (Langston, 2026-09-29); both landed, plus three records
| # | item | disposition |
|---|---|---|
| FINDING-1 (condition) | the audit recorded what the route SENT, not what the database TOOK — two hand-maintained lists (route whitelist, merge map) could diverge and the log would assert a change that never happened | **Landed:** `buildGuardrailAuditEntries(old, written, fields, …)` takes the payload's FIELDS and the VALUES from the row `upsertGuardrailsV2` returned; `upsertGuardrailsV2WithAudit` takes a builder and calls it inside the transaction |
| FINDING-2 (condition) | the transaction was proved in one direction only; deleting `tx.insert(auditLog)` left every leg green | **Landed:** a real-DB leg saves `6.555`, reads `audit_log` back and expects one row, old `6.00`, new `6.56` (the stored value) |
| FINDING-3 (record) | `EffectiveGuardrails` lacked `maxTotalExposurePct`, so RULE_013 could never fire through `validate(getEffective(row))` | **Fixed now** rather than recorded: the field is added (no fallback); unit leg + mutation (drop it → 1 fails) |
| FINDING-4 (§13, HYPOTHESIS) | a `type="number"` controlled input may let `7.5` land as `75` (browser value sanitisation) — passes RULE_012, both CHECKs and the sizer | **HOME:** folded into increment 2 as a named P5(b) item, owner CC-C, placed with the obj-3/obj-4 UI work, verified by an actual typed-entry check in the browser, not a code read |
| FINDING-5 (record) | `selectGoalsPreset` writes guardrails through the bare upsert (no audit, no `lastUpdatedBy`) | **Wording narrowed** in the storage docstring (the settings ROUTE never lands an edit unrecorded, not every writer); `selectGoalsPreset` has no callers, so it joins increment 2's rule-18 census |
| record | **paper now sits AT the exposure ceiling** (100.00): a future "raise exposure" is a migration, not a setting | stated here; SIM + System Manual at Step 10 |
| record | `audit_log` on staging has NO foreign key at all (only `audit_log_pkey`), so the first rollback leg tested a constraint production does not have either | the varchar(100) leg stands |

### Evidence for FINDING-2 — the CI log lines (Langston cannot open job logs; pasted verbatim, ANSI stripped)
Run `36550084772` on `5af3acb49`, job Test Suite:
```
 ✓ server/tests/integration/b-sizing-inc1-guardrails-db.test.ts > B-SIZING-INC1-GUARDRAILS-DB > the persistence is only proved on the test database (guard on the guard) 1ms
 ✓ … > CONTROL — after a reset the row reads not-tripped, no reason, no time 8ms
 ✓ … > a trip SAVES all three kill-switch columns 8ms
 ✓ … > a reset CLEARS all three kill-switch columns 7ms
 ✓ … > a trip does NOT revert a guardrail saved after a stale read 12ms
 ✓ … > CONTROL — the CHECKs accept 5 and 100 2ms
 ✓ … > the database refuses max_position_percent_pct = 0 3ms
 ✓ … > the database refuses max_position_percent_pct = 500 12ms
 ✓ … > the database refuses max_total_exposure_pct = 0 9ms
 ✓ … > CONTROL — a guardrails write with no audit rows lands 20ms
 ✓ … > a failing audit row rolls the guardrails write back 6ms
 ✓ … > a valid audit row is written with the stored value, beside the save 9ms
 Test Files  312 passed (312)
      Tests  3658 passed (3658)
```
The run-level summary carries NO skipped count at all (vitest prints `| N skipped` when any test skips), so no test in the whole suite skipped. **FINDING-5 corrected:** the storage docstring now names all THREE bare-upsert writers (Langston's census), and the live one is `#1090`, homed to increment 2.
