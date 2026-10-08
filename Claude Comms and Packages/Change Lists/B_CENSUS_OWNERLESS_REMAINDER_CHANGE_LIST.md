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

## r2 — Langston's Step-4 send-back (code SENT BACK, ledger APPROVED), folded at `2fc2fcdd9`
- **BLOCKER-1, two 0x08 bytes at `census.mjs:235`:** written through a shell heredoc that turned `\b` into BACKSPACE. Replaced with `\bHOME\b` (bounded — parity with `:214`/`:397`; the unbounded form misreads `#693`). 0x08 bytes in the file now: **0**.
- **BLOCKER-2, no test reached the leg:** two `runCensus` cases with no stub — `#303` placed only by `HOME: B-ALPHA` (row 1, CC-A) → `placing-line CC-A`; `#304` placed only by a note homing form `with B-NOTEONLY` (row 107, CC-B) → `placing-line CC-B`. **Mutation-proved:** on the shipped `8655a1bfd` bytes both FAIL (`owner ?`); with the bytes fixed but `noteHomesId` removed, `#304` alone FAILS. Census 166 → **168**, poller 443.
- **FINDING-1:** the HOME-id leg now applies `noteHomesId` — the same rules as `placement()`, so the docblock is true.
- **FINDING-2:** a comment at the guard: `runCensus` always sets `r.b.placedOwnerless` (the dry run reads it unguarded); the guards serve the hand-built P45 size fixture that predates the key.
- **Measured at `origin/migration/aws-supabase`:** the repair changes `placingOwnerOf`'s answer on **186 of 504** OPEN (you measured 185 of 500 at `e8c247aec`); list (b′) **0**, unknown **0**.
- **Your record items, said beside the zero:** list (b′) = 0 means *ownerless AND not self-filed* — **15** OPEN issues rest on a `filer` token alone and all 15 are placed, excluded by the Step-1 spec; and the `unknown` arm's live size is the **59 of 233** after-live lines that still read `(—)`.
- **OBJ-2's "19":** the 18 issues whose placing §4 row named a session before this batch, plus `#537` (after-live line naming CC-B) — i.e. the comparator excluding every line this batch wrote. On the objective's literal text your wider counts (38 shipped, 41 repaired, 0 mismatches) stand.
