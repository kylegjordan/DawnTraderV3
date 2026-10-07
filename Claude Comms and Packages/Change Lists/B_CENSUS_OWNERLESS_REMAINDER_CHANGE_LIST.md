# B-CENSUS-OWNERLESS-REMAINDER — CHANGE LIST (Step 4)

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` (scope header) |
| **(ii) DOC SET for that class** | scope — **present** `Scope Files/B_CENSUS_OWNERLESS_REMAINDER_SCOPE.md` · pre-audit — **present** `Scope Files/B_CENSUS_OWNERLESS_REMAINDER_PRE_AUDIT.md` · completion report — **absent, Step 11** · `BATCH_CATALOG.md` / `PHASE_HISTORY.md` — **absent, Step 10** · `MEMORY.md` — **Step 10** · SIM — **Step 10** (the census entry gains the labelled source and list (b′)) · System Manual — **N/A** (nothing under server/, client/, shared/) |
| **(iii) STEP-2 REFERENCE** | pre-audit r1 at `a39ea496f`, APPROVED by Langston with one condition (OBJ-2 denominator 19), folded |

## REFS
- **Code (P4):** review branch `migration/b-census-ownerless-remainder` at **`8655a1bfd`** (one commit; `census.mjs` + `census.test.mjs`, +56/−5). Not on `migration/aws-supabase`.
- **Ledger (P1-P3), on `migration/aws-supabase`:** `e8c247aec`.

## P4 — THE CODE
| site | change |
|---|---|
| `ownerOfIssue(e)` → `ownerOfIssue(e, ctx)` | `ctx` optional. **No `ctx`: unchanged** — same four sources, same objects, no new key (a test pins it). With `ctx.placingOwner(n)`, an issue with no `ownerLine`/`homeLine`/`filer` reads `{ label: 'placing-line <S>', source: 'placingLine', placingLine: <S> }` — labelled, never `owner <S>` (your C3). |
| new `placingOwnerOf(ledger, plan, pls)` | the session on the line that places `n`, by `placement()`'s rules: a §4 row's item/batch cell or a named homing form in its note → its owner cell; an after-live line → its `(owner)`; else a HOME id's §4 row or after-live line. |
| `runCensus` | `owner(n)` passes `{ placingOwner }`; new `b.placedOwnerless` = OPEN, placed, source ∈ {placingLine, unknown}; `ownerSources.placingLine`; `counts.po`; `lists.po`; the (b) body line gains `; placed but ownerless N` (+ examples while they fit); the dry run prints the list. |
| call sites (your C4) | `:807`/`:808` (dry-run as-built placement) and `census.test.mjs:281` pass no `ctx` — unchanged. |

**Tests:** census **158 → 166**: no-ctx unchanged; with ctx → `placing-line CC-B`; own owner still wins over ctx for ownerLine, homeLine and filer; ctx with no placing owner → `owner ?`; `runCensus` lists a placed, unowned `#302` as `placing-line CC-B` (positive) and not a placed `#300` with a filer (negative); counts/lists/body carry it. **Control:** the old census fails the first new case, then the suite errors on the missing list. Poller 443 unchanged.

## MEASURED BEFORE SHIPPING (row 1n's C2 rule)
Dry run with the new code at `origin/migration/aws-supabase` (after `e8c247aec`): owner sources **ownerLine 451 · homeLine 34 · filer 15 · placingLine 0 · unknown 0** of 500 OPEN; **list (b′) = 0**. So the new clause reads 0 today. **Positive control on the real ledger:** with `#166`'s owner line removed in a copy, list (b′) = `#166 (placing-line CC-INFRA)`; the old predicate on the same copy reads `owner ?`.

## THE LEDGER (P1-P3, `e8c247aec`)
- **45 owners** — one `W41 triage, row 1s … OWNER <session> — <why>` line each: CC-A 12 · CC-B 15 · CC-C 3 · Infra Claude 15. **3 closed** (`#154`, `#298`, `#302`) with citations. **23 after-live lines** now name their owner (`(—)` → the owner; Kyle's two keep "Kyle's decision").
- **OBJ-1, graded with the UNCHANGED predicate** (your C1): `source: 'unknown'` = **0 of the 45**; ledger-wide open unknown **48 → 0** (control: 48 at `035d0f7e5`).
- **OBJ-2 on its 19 discriminating items** (your Step-2 condition): **0 mismatches**.
- ⚠️ **Caught before commit:** my first label read `W41 OWNER (CC-A, …)`, and `ownerOfIssue`'s `OWNER` + 30-character window read it as CC-A for all 45 — the census run caught it; the label was reworded and re-run (`MISTAKE` trailer on `e8c247aec`).
- `#1169` filed for your §13 surface; **row 1u** (a hyphen, `1s-a`, is not a row id the grammar accepts). §6 recounted: CC-A 74, CC-C 79 (row 1t had been added without a recount), Total 286.
- **OBJ-4:** hand-over posts by number to NEW Claude (15), Infra Claude (15), ANALYST Claude (3).

## JUDGEMENT CALLS TO ATTACK
1. `placingOwnerOf` sits AFTER `filer` in precedence — a filer (weak, own-text) outranks the placing line (derived from layout).
2. The list counts `unknown` as well as `placingLine`, so an issue placed on an after-live line with no owner is listed too.
