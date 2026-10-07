# B-CENSUS-OWNERLESS-TRIAGE — CHANGE LIST (Step 4)

| field | value |
|---|---|
| **(i) DECLARED CHANGE-CLASS** | `non_architecture` (scope header, `169a2cf5d`) |
| **(ii) DOC SET for that class** (`config.mjs` `CLASS_DOCSET.non_architecture`) | scope — **present**, `Scope Files/B_CENSUS_OWNERLESS_TRIAGE_SCOPE.md` · pre-audit — **present**, `Scope Files/B_CENSUS_OWNERLESS_TRIAGE_PRE_AUDIT.md` · completion report — **absent, Step 11** · `BATCH_CATALOG.md` — **absent, Step 10** · `PHASE_HISTORY.md` — **absent, Step 10** · `MEMORY.md` (Langston, every class) — **Step 10** · SIM — **judged N/A**: no component changes; the census and plan-state check gain rows, not structure (a one-line note in the governance-checker SIM entry at Step 10 if you want the pattern recorded) · System Manual — **N/A**, nothing under `server/`/`client/`/`shared/` |
| **(iii) STEP-2 REFERENCE** | `Scope Files/B_CENSUS_OWNERLESS_TRIAGE_PRE_AUDIT.md` r2 at `d23d71841`, APPROVED by Langston 2026-10-07 with C1/C2 (both below) |

## REFS
- **Code (P1), review branch:** `migration/b-census-ownerless-triage` at `7da9d78e6` (one commit on `0c8ef5da2`). **Not on `migration/aws-supabase`.**
- **Ledger and plan (P2/P3/OBJ-4/OBJ-5), on `migration/aws-supabase`:** `9763073f7` (the 55) and `86e39dc47` (CC-A's four and `#532`).

## P1 — THE CODE (whole diff, three lines)
```
census.mjs:310
-    else if (section === 4 && c.length === 7 && /^\d+[a-z]?$/.test(c[0])) {
+    else if (section === 4 && c.length === 7 && /^\d+[a-z0-9]*$/.test(c[0])) {   // ids like 2a0b (#1139 P1)
census.mjs:408
-const AFTER_ROW = /\bafter row (\d+[a-z]?(?:\.[a-z0-9]+)?)\b/g;
+const AFTER_ROW = /\bafter row (\d+[a-z0-9]*(?:\.[a-z0-9]+)?)\b/g;   // deeper ids AND the dotted suffix
checker.mjs:336
-const PLAN_ROW_NO = /^\d+[a-z]?$/;
+const PLAN_ROW_NO = /^\d+[a-z0-9]*$/;
```
**Your C1 (dotted suffix):** kept at `:408`, with a test (`after row 2a0b.v2` keeps `.v2`).
**Tests:** `census.test.mjs` 151 → 158 (7 new: a `2a0b` row parses; it counts in the recount; an issue on it places by number; one not on it stays unplaced; `after row 2a0b` resolves; the dotted case; `after row 9z9` unmatched). `poller.test.mjs` 442 → 443 (`planRowsByBatch` keeps a `2a0b` row). **Control — the new tests on the OLD code:** 5 of the 7 census cases FAIL and the poller case FAILS; the 2 that pass are the negative controls.

## YOUR C2 — BLAST RADIUS, MEASURED BEFORE THE PUSH (`plan-lines-preview.mjs` at `0c8ef5da2`)
| | rows4 | ids | graded | fail | a fresh tick would open |
|---|---|---|---|---|---|
| live pattern | 271 | 152 | 9 | 0 | **0** |
| widened | 285 | 165 | 9 | 0 | **0** |
| **positive control** (`--plan-file`: row `2a0b`'s batch cell set to `B-WAKE-QUIET`, which has a report, status QUEUED) — widened | 285 | 165 | 10 | 1 | **1** — `gov-planline:B-WAKE-QUIET:s4` |
| same control — live pattern | 271 | 152 | 9 | 0 | **0** (blind) |
⇒ **deploying P1 raises nothing today**: none of the 14 newly visible rows has a completion report. The B-SLOT-PLACEMENT-CHECK join has no consumer yet beyond `poller.mjs:497`.

## THE LEDGER WORK
- **The 55** (`9763073f7`): 24 CLOSED · 4 WITHDRAWN · 27 PLACED (+ `#410`'s second entry). Each head's status word updated with the original quoted as *"originally:"*; one `W41 TRIAGE` line per entry with outcome, owner, HOME and `CITE:` tokens, **line numbers stamped `0c8ef5da2`** (your record item (b)). `+ #N` on 18 §4 rows; after-live `B-EVENT-LOOP-RESIDUAL` (`#225`) and `B-CI-TEST-HYGIENE` (`#403`) added, `#174`/`#431` on their lines.
- **Your §5(1):** `#301` and `#320` now quote their report line with `path:line`; `#536`'s report does not record it, so it cites the ledger commit `a6ca3598a` and quotes that.
- **CC-A's four and `#532`** (`86e39dc47`): `#439`, `#575`, `#596`, `#532` → CC-B (rows 3a, 54, 122, 55), **agreed by NEW Claude**; `#613` → Infra Claude, `B-CREDENTIALS-PRIVATE-REPO` OBJ-1, **agreed by Infra Claude** — your discharge test is already measured there (your own `dt-api` call, HTTP 200, `da54e6617`). Owner phrases edited in place, each quoting what it read.

## OBJECTIVES — STATE AT THIS DISPATCH
| obj | result | instrument |
|---|---|---|
| OBJ-1 | **61 lines, 79 tokens resolve, 7 measured, 0 unresolved** at `86e39dc47`; five deliberately bad tokens all flagged | `resolve1n.py <ref> --from-ledger [--bad-control]` (review branch copy: its own plan scan) |
| OBJ-2 | **0 of the 60 unplaced, 0 ownerless** with P1's `census.mjs`; **2 unplaced (`#214`, `#404`, row `2a0b`) with the live pattern** — exactly the gap P1 closes. Control at `be41f8585`: 55 unplaced, 55 ownerless | `census.mjs` `parseLedger`/`ownerOfIssue`/`placement` over the working tree |
| OBJ-3 | three hand-over posts by number, 2026-10-07 ~04:50Z | Discord |
| OBJ-4 | decided, each with who agreed | the entries |
| OBJ-5 | `selfContradicting` = `[]` (was `[532]`) | `parseLedger` |
| OBJ-6 | **the 55 outcomes are in `data1n.py` and the pre-audit §2 table — pick your 10 now** (≥5 from CLOSED/WITHDRAWN, per your weighting) | — |
| OBJ-7 | §6 is recounted **in the commit that lands P1 on `migration/aws-supabase`** (the widened recount moves CC-B +13 and CC-C +1 for the 14 deep rows), not before — recounting now would read wrong against the live pattern | `recountS6` at that sha |

## JUDGEMENT CALLS TO ATTACK
1. **P1 merges after your approval as its own commit, with the §6 recount in the same commit.** Is that the right join, or do you want the recount in a separate commit?
2. **`#214`/`#404` read unplaced on `migration/aws-supabase` until P1 lands** — the only two of the 60 that do.
3. **The deep-row comment says "hid every such row"** rather than a count, because the count moves (12 → 14 in one night).
