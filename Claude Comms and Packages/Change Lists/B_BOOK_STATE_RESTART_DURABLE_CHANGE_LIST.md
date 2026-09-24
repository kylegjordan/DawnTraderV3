# B-BOOK-STATE-RESTART-DURABLE — CHANGE LIST (Step 4)

**Graded ref:** `origin/migration/aws-supabase` at **`f07c86c3776282391f21de61944c7c63de2c54fe`** (the build commit, `f07c86c37`). Plan row `3n.q8`, `#1066`, a sub-batch of `B-PRICE-SIDE-BY-JOB`.

## THE THREE HEADER FIELDS

**(i) DECLARED CHANGE-CLASS:** `change-class: sub_batch` (scope header, verbatim).

**(ii) THAT CLASS'S DOC SET, ROW BY ROW** (`scripts/governance-checker/config.mjs` `CLASS_DOCSET.sub_batch`), **plus your Step-1 condition 4, which makes SIM and System Manual required here:**

| doc | class status | now |
|---|---|---|
| completion_report | required | **absent** — Step 11 |
| batch_catalog | required | **absent** — Step 10 |
| phase_history | required | **absent** — Step 10 |
| system_manual | conditional → **required** (your condition 4) | **absent** — Step 10: §3.5.1a rewrite; the caution is removed only after P9 passes |
| sim | conditional → **required** (your condition 4) | **absent** — Step 10: S25b amendment plus a new row for the store |
| scope | conditional | **present** — `Scope Files/B_BOOK_STATE_RESTART_DURABLE_SCOPE.md` (r1, approved) |
| pre_audit | conditional | **present** — `Scope Files/B_BOOK_STATE_RESTART_DURABLE_PRE_AUDIT.md` (r2, approved) |
| phase_19_plan | conditional | **present** — row `3n.q8` status (and `3n.c`'s new item) |
| running_issues | conditional | **present** as `#1066`; its close lands at Step 10 |
| changes_and_fixes | conditional | **absent** — Step 10: applicable, since this fixes `#1066` |
| adjustment_framework | conditional | **absent** — Step 10: judged applicable, to record "impact named, not epoch-bumped" (Step-2 C2) |
| deleted_log | conditional | **N/A** — nothing removed |

**(iii) THE STEP-2 REFERENCE:** `Scope Files/B_BOOK_STATE_RESTART_DURABLE_PRE_AUDIT.md` at `d4c3c90b9` (r2), approved by you 2026-09-24 14:02Z.

## WHAT CHANGED (8 files, +741 / −7)

| file | what |
|---|---|
| `server/asset_classes/xstock_spot/book-state-tracker.ts` | P1 `retainsRing`, P2 the typed S25b entry, P3 `snapshotRetainableRings`, P6 `restoreRetainedRings`, P7 the `RESTORED_RING_CONSUMED` line |
| `server/asset_classes/xstock_spot/book-state-ring-store.ts` (**new**) | P4-P7: the 30 s snapshot, the shutdown flush, the boot restore, per-row validation, the whole-store alert, the `RING_RESTORED` line |
| `server/index.ts` | the restore and snapshot start **before `resumeActiveEngines()`**; the flush beside the trailing-state flush |
| `shared/schema.ts` | `xstockBookStateRings` declared |
| `drizzle/migrations/2026-09-24-b-book-state-restart-durable.sql` (+ rollback, **both in git**), `MANIFEST.txt` | the table |
| `server/tests/unit/b-book-state-restart-durable.test.ts` (**new**) | 20 cases on the real tracker; 7 mutations, all killed |

## THE LOAD-BEARING HUNKS

**P1 — the one predicate (tracker):**
```ts
export function retainsRing(chain: Pick<BookStateComparator, 'seedImplausible' | 'observedMovement' | 'spreads'>): boolean {
  return !chain.seedImplausible && chain.observedMovement && chain.spreads.length > 0;
}
```
The clear, BEFORE: `if (!prev.seedImplausible && prev.observedMovement && prev.spreads.length > 0) { _retainedSpreads.set(key, [...prev.spreads]); }`
The clear, AFTER:
```ts
  if (retainsRing(prev)) {
    _retainedSpreads.set(key, {
      spreads: [...prev.spreads],
      seedBasis: seedWasJudged(prev) ? 'judged' : 'vacuous',
      writtenAtMs: prev.priorAtMs, // feed time of the ring's last frame — the tracker reads no clock
      restored: false,
    });
  }
```
`seedWasJudged` is `seedRetainedMedian !== null && seedRetainedMedian > 0`, mirroring the seed test's own condition exactly.

**P3 — the snapshot:**
```ts
export function snapshotRetainableRings(): RingSnapshotEntry[] {
  const out: RingSnapshotEntry[] = [];
  const keys = new Set<string>([...Array.from(_comparators.keys()), ...Array.from(_retainedSpreads.keys())]);
  for (const key of Array.from(keys)) {
    const cmp = _comparators.get(key);
    if (cmp && retainsRing(cmp)) {
      out.push({ symbol: key, spreads: [...cmp.spreads], seedBasis: seedWasJudged(cmp) ? 'judged' : 'vacuous', source: 'live', writtenAtMs: cmp.priorAtMs });
      continue;
    }
    const r = _retainedSpreads.get(key);
    if (r) out.push({ symbol: key, spreads: [...r.spreads], seedBasis: r.seedBasis, source: 'retained', writtenAtMs: r.writtenAtMs });
  }
  return out;
}
```

**P7 — the seed branch (after the unchanged `:313` consumption):**
```ts
    if (!seedImplausible) _retainedSpreads.delete(key);
    if (retained?.restored) {
      const verdict = !(retainedMedian !== null && retainedMedian > 0) ? 'not_judged' : (seedImplausible ? 'implausible' : 'plausible');
      console.warn(`[3n.q8][BOOK_STATE] ${key} RESTORED_RING_CONSUMED verdict=${verdict} ... ringAgeMs=${frame.atMs - retained.writtenAtMs} ringDeleted=${!seedImplausible}`);
    }
```

**Boot (`server/index.ts`), immediately before the `Phase 27.F.8` block that calls `resumeActiveEngines()`:**
```ts
  try {
    const { restoreRingsAtBoot, startRingSnapshots } = await import('./asset_classes/xstock_spot/book-state-ring-store.js');
    await restoreRingsAtBoot();
    startRingSnapshots();
  } catch (ringErr) { console.error('[3n.q8][RING_STORE] ring restore/snapshot start failed — the guard runs as before 3n.q8:', ringErr); }
```

**The store's failure rules (`book-state-ring-store.ts`):**
- `validateRingRows(rows, ringCap)` checks each row: a non-empty symbol, spreads an array with `1 <= length <= ringCap`, every value finite and `>= 0`, a basis in {judged, vacuous}, and valid timestamps. A bad row is skipped and counted by reason.
- `restoreRingsAtBoot()`: if the guard config is unreadable, or the query throws, it returns 0 and raises the alert `book-state-ring-restore-failed`, whose body says *"RESOLVE this row with evidence, do not ACK it"*.
- `persistRingSnapshot()`: one transaction, one upsert per ring, then `DELETE ... WHERE symbol NOT IN (SELECT jsonb_array_elements_text($1::jsonb))`.

## DEVIATIONS FROM THE APPROVED PLAN, STATED

1. **`writtenAtMs` is FEED time (`priorAtMs`), not the wall clock.** The first build used `Date.now()` in the tracker, and the `8a-P4a` fence (test 10: *"the tracker reads no clock"*, Kyle 2026-09-03) failed on it. Only the store reads the clock, for `persisted_at`. ⇒ **`RING_RESTORED`'s ring age is the age of the last price in the ring, and `downtimeMin` comes from `persisted_at`.** Both are in the line.
2. **`spreads` is JSONB, not `double precision[]`.** One JSON parameter per row, and the reader validates every element itself. Stated in the migration header.

## JUDGEMENT CALLS I WANT ATTACKED

- **A.** `restoreRetainedRings` refuses to overwrite a live chain or an existing retained entry. At boot both maps are empty, so this only bites if a later caller ever runs it. Is "live evidence wins" the right tie-break?
- **B.** `RESTORED_RING_CONSUMED` fires on **every** seed a restored ring judges, including implausible ones where the ring is **not** consumed (`ringDeleted=false`). The token is the one your P9 floor names, and I kept the name rather than rename it after your approval. Is the "used vs deleted" split clear enough for the P9 read?
- **C.** A `not_judged` verdict (a restored ring whose median is 0) is reported but never counts as judged. A ring of all-zero spreads is possible (a locked book). Should `validateRingRows` refuse a ring whose median is 0 instead?
- **D.** The snapshot deletes every row not in the snapshot. A symbol whose ring is consumed and whose new chain has not moved yet is **deleted from the store** (audit A10's gap). That is faithful to "the ring a clear would leave", but it means a restart in that gap loses a ring the store held 30 s earlier.

## EVIDENCE

- Tests: `npx vitest run server/tests/unit/b-book-state-restart-durable.test.ts` → **20/20**. With the 16 related book-state, feed-sanity, `8a-P4` and fence files: **17 files, 376 tests, all green.**
- Mutations (each applied, run and reverted; originals byte-compared after): M1 the snapshot bypasses the predicate → 2 failed · M2 `seedImplausible` cleared mid-chain (I-1) → 1 · M3 a plausible seed does not consume the ring → 1 · M4 the consumed line is not emitted → 1 · M5 restore loads nothing → 4 · M6 one bad row discards the store → 1 · M7 the clear drops `observedMovement` from its gate → 1. **7 of 7 killed.**
- `node scripts/check-tsc-baseline.mjs` → **377 = 377**, no new (file, code) pair.
- CI for `f07c86c37`: running at dispatch; the per-job result follows.


---

## r2 — LANGSTON'S STEP-4 RULING (2026-09-24 14:28Z, CHANGES-NEEDED), FOLDED

**⛔ BLOCKER-1 — FIXED. A failed restore can no longer let a snapshot delete the store.**
- **(a)** The delete sweep is ARMED only by a successful boot restore: config readable, query succeeded, and the tracker accepted the rows. Any whole-store failure leaves the store **UPSERT-ONLY for the life of the process**; stale rows are swept at the next healthy boot. The alert body now says so, which makes the old reassuring line true rather than false.
- **(b)** An over-long ring is **TRUNCATED to its last `ringCap` values**, mirroring the tracker's own `spreads.shift()`, and never skipped. `spreads_length` now fires only on an empty ring, and `RING_RESTORED` counts `truncated=`.
- **(c)** Test section 9 has 4 cases: config unreadable, store unreadable with an empty tracker, the tracker's fence refusing, and "before any restore". Each asserts **no DELETE is issued**. Mutations: **M8** (the sweep unguarded) → 3 failed; **M9** (the sweep armed at the top of the restore) → 3 failed; **M10** (over-long skipped, not truncated) → 1 failed.

**FINDING-1 — ACCEPTED, no code.** The store docstring no longer calls the shutdown flush the normal path. **Until a real pm2 restart logs `SHUTDOWN_FLUSH written=`, the honest crash bound is the 30 s snapshot.** That line is a Step-7/8 read. The flush line also prints `swept=` and `durationMs=`.

**FINDING-2 — FENCED (your preference).** `restoreRetainedRings` **throws if any live chain exists** (boot-only). `restoreRingsAtBoot` catches that as a restore failure, raises the alert, and leaves the sweep disarmed. Mutation **M11** (fence removed) → 2 failed.

**Your answers, applied:**
- **A** — done through the fence.
- **B** — the token is kept. **Step-10 condition, recorded here so it cannot be lost: the P9 floor is a FILTERED count.** The record publishes all three verdicts (`plausible` / `implausible` / `not_judged`) and both `ringDeleted` values, enumerated. It names `verdict=not_judged ringDeleted=true` explicitly: a restored ring destroyed without judging anything.
- **C** — a median-0 ring is **not** refused. It loads, and `RING_RESTORED` counts it as `cannotJudge=`, separate from `skippedInvalid`.
- **D** — unchanged. **The exposure, stated for the record:** the window in which a restart seeds a symbol unjudged runs from the ring's **consumption** to the new chain's **first observed movement**. It is not 30 s; on a quiet name it can be long.

**Nits:**
- **`source`:** now selected and validated at restore, and `RING_RESTORED` prints `live=`/`retained=`. That is its reader.
- **Two populations in one line:** fixed. `restoreRetainedRings` returns the symbols it loaded, and every count in `RING_RESTORED` comes from that set; `notLoaded=` shows the difference.
- **Mixed clocks:** labelled in the line itself: `ringAgeMin(wallNow-lastFeedFrame)` and `downtimeMin(wallNow-newestPersist)`.
- **`rowCount`:** still `res.rowCount`. **Shown non-zero once at Step 7** (the first swept snapshot after a real restart) or reported as unshown.
- **O(symbols) round trips:** removed. **One `INSERT … SELECT FROM jsonb_to_recordset` for every ring**, plus the delete: 2 statements per snapshot whatever the symbol count (test 8 asserts 2). A per-process `FIRST_SNAPSHOT written= deleted= swept= durationMs=` line (warn) gives the measured duration against the 5 s budget at Step 7.

**CLASS RE-DECLARED `sub_batch` → `architecture`** (checker alert `a6195e1f`; scope header amended). It adds nothing to the doc set beyond your condition 4.

**Evidence at the new head:** 25/25 in the batch's file; **22 related files, 435 tests, all green**; **11/11 mutations killed** (M1-M7 as before, plus M8-M11); `check-tsc-baseline` **377 = 377**. CI: per job, on the re-dispatched head.
