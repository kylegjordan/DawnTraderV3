# B-PLAN-CURRENCY-CHECK — CHANGE LIST (Step 4, the code)

| field | value |
|---|---|
| **(i) declared change-class** | `non_architecture` (scope header, line 3) |
| **(ii) that class's doc set** (`CLASS_DOCSET.non_architecture`, `config.mjs:131-134`) | scope — **present** `Scope Files/B_PLAN_CURRENCY_CHECK_SCOPE.md` · pre-audit — **present** `Scope Files/B_PLAN_CURRENCY_CHECK_PRE_AUDIT.md` · completion report, `BATCH_CATALOG.md` row, `PHASE_HISTORY.md` — **absent** until Steps 10-11 · conditional: `SYSTEM_IMPACT_MAP.md` — **owed** (the governance-checker entry: the new files and the four-file drift list, P48/P50, Group 8) · `SYSTEM_MANUAL.md` — **judged N/A** (governance tooling, not trading architecture) · `RUNNING_ISSUES.md`, `DELETED_COMPONENTS_LOG.md` — **present** (Group 1-3 doc work, already on the branch) |
| **(iii) Step-2 reference** | `B_PLAN_CURRENCY_CHECK_PRE_AUDIT.md` — Step 2 APPROVED 2026-09-30T04:53:10Z; §12 "the plan as ruled" (65 items) |

## WHERE TO READ IT — NOT on `migration/aws-supabase` yet (R1-Q6)
- **Code under review:** `migration/b-plan-currency-check-review` at **`51c3563c28804d010ca5078c4a2d3bea1a2d19fe`** — 17 commits on top of `75adf500f` (review-branch head when rebased, 2026-09-30 ~12:35Z). 18 files, +3,749 / −152. `migration/aws-supabase` advances to it only after this review.
- **CI control (kept, never merged):** `migration/b-plan-currency-check-ci-control` at `9745c93c3` — the same 17 commits plus one commit planting ONE failing `ok(…, false)` in each of `poller.test.mjs`, `heartbeat-check.test.mjs`, `census.test.mjs`. Locally each suite goes red (`422/1`, `84/1`, `125/1`, rc 1). **CI, per step (§10i Q4, Q33):** review branch `51c3563c2`, run **36715502178** — TypeScript Check, Build, Docker Build success; Test Suite success with steps *Governance checker tests (poller)*, *(heartbeat)*, *(census)* each **success**. Control branch `9745c93c3`, run **36715496853** — Test Suite **failure**, with each of the same three steps **failure** on its own; TypeScript Check, Build, Docker Build success. ⇒ each checker step runs in CI on Node 20 and goes red independently.
- **Local, rebased, before push:** `poller.test.mjs` 422 passed / 0 · `heartbeat-check.test.mjs` 84 / 0 · `census.test.mjs` 125 / 0 (Node 22 locally; CI runs Node 20 — only the CI run proves it there).
- **Rebase note:** one conflict, `SPRINT_TO_LIVE_PLAN.md` §5 — origin had re-worded the B-FEED-MISMATCH-FIX `closes` cell; resolved by keeping origin's text and adding the `report` column (`—`) to each of the three rows. **Every sha quoted in the Step-3 commit messages and preview headers is pre-rebase**; the P26 two-ref preview and the P39 runs must be re-taken at the rebased shas (the builders say so, items G4-2 and G6-7 below).

## THE FOUR GROUPS — ONE DISPATCH EACH (the 900 s ceiling)
| group | commits (rebased) | what |
|---|---|---|
| **G4** exceptions grammar | `a3097dc6a`, `eae74b3c1` | P21-P26: pure exported parser, roster + accept sets, closed grammar, class-override regex, `gov-exceptions-malformed:*` keys — all behind `EXCEPTIONS_V2_ENABLED = false`; the one-time ledger pass on `GOVERNANCE_EXCEPTIONS.md`; `exceptions-preview.mjs` (two-ref preview) |
| **G5** heartbeat + CI | `a35d2cb7c`, `81b438d13`, `5be9c4c41`, `6df203da8`, `5fe03ffb9`, `e9131116d` | P30 CI steps; P27 default-off flags + `isoWeek`; P29 `heartbeat-check.mjs` into the drift list, injectable blob read; P28 pure `decideHeartbeat` with census/mistake-pass liveness legs; P64 atomic `saveState`; `heartbeat-differential.mjs` |
| **G6** plan-state check | `793224a68`, `a698e6188`, `d56cd23fb`, `6bd37eb83`, `c33df1ec7`, `42aac2a63`, `6b6969586` | P31 id patterns (live on push); N8/P58 one fetch point (live on push); P32/C′ `PLAN_LINE` disabled + §5 report column; P33/P34 parser/join/predicate; P36-P38 decisions, per-leg orphan branch, tick wiring behind `PLAN_LINE.enabled = false`; P39 `plan-lines-preview.mjs` |
| **G7** weekly census + mistake pass | `269646066`, `51c3563c2` | P40-P46: `census.mjs`, dormant behind `WEEKLY_CENSUS_ENABLED = MISTAKE_PASS_ENABLED = false`; the census CI step; the §6 history read refusing on a failed read |

## THE BUILDERS' OPEN QUESTIONS, BY GROUP (verbatim source: the Step-3 workflow journal; condensed here, nothing dropped)
**G4 — exceptions**
- G4-1 **The flag cannot gate the ledger DATA edits.** With the flag OFF, today's rule already drops the 3 pre-registered set members at the PUSH tick (B-XSTOCK-FEED-LIVENESS `open`; B-CROSS-SESSION-BLEED and B-DIAG-387 `system_manual` na-skip) — so the flip tick shows 0 removals, and reverting the flag would not undo them. HY-A4 says none moves a live alert (not re-derived at the current ref). Confirm the reading, or move the retypes into the flip commit (which is ruled one-line).
- G4-2 Re-run `exceptions-preview.mjs` on the commit as pushed (the parent changed with the rebase) and re-derive the three numbers there.
- G4-3 A VALID roster confirmer outside the type's accept set (e.g. `cc-c` on `na-skip`) is FLAGGED malformed, not just uncounted — the builder's choice where P22 is silent; 0 rows at the ref.
- G4-4 An unterminated `<!--` raises `gov-exceptions-malformed:_ledger:comment` and grading CONTINUES on the rows above — or should it take the `#449` refuse-to-grade path (`gov-exceptions-unreadable`)? 0 instances.
- G4-5 The ledger's dormancy sentences go stale between the one-line flip and Step 10 — may the flip commit touch them?
- G4-6 `exceptions-preview.mjs` carries a verbatim copy of today's rule next to `parseExceptionsLegacy` — retire the preview at Step 10 or keep it?
- G4-7 No test pins dormancy (flipping the flag still passes 210/0); a pin would make the flip two lines. Yours to decide.
- G4-8 Owner notices for other sessions' retyped rows (B-MBIM-SWITCH-ON, B-BALANCE-TRUTH → CC-C; B-PHANTOM-FILL-RECONSTRUCT, B-XSTOCK-FEED-LIVENESS) — not yet sent; I send them after your ruling. The class-override regex is case-sensitive per P24's literal pattern; all 13 values parse.

**G5 — heartbeat + CI**
- G5-1 Flag flipped back OFF while a liveness alert is open ⇒ no intent; it stays open until resolved by hand (a resolve needs positive freshness). No ruling covers it.
- G5-2 A non-finite anchor (corrupt `lastCensusAt`) ⇒ OPEN, a warning naming the bad values, never auto-resolves. Fail-closed, unspecified.
- G5-3 Liveness alerts use category `governance` (§10e Q1's `verification` read as the census row's own).
- G5-4 P29 committed before P28 (separate commits); squash? The seam is `blobAt(ref, file)` (not `hashAt`), reading `ls-tree --full-tree` — blob ids identical; `absentBoth` is counted + logged, not persisted.
- G5-5 Keep `heartbeat-differential.mjs` in the tree (not loaded, not in the drift list, CI cannot run it)?
- G5-6 Test gap: only `writeStateAtomic` is tested; reverting the one-line `saveState` wrapper would pass CI. The heartbeat's own `HB_STATE` write is still a plain `writeFileSync` (a torn file throws every run — fail-closed, outside P64).
- G5-7 Preserved byte-exact for the differential: the silent-alert body reads "last tick: never ago" when `lastTick` is null — own disposition if it should change.

**G6 — plan-state check**
- G6-1 Two keys, "plan unreadable = governance; listing empty = infra": both still post under `--category governance` until P41's per-alert category — confirm, or name the listing key's category.
- G6-2 Both reads (plan + Batch Completion listing) happen every tick, so each singleton opens/resolves on its own read; the rule FREEZES if either fails — a departure from the re-cut's "listing only after the plan parses".
- G6-3 The P37 verifier returns `null` for a leg graded this tick (sweep skips it), `true` for a leg not required at the ref, `() => false` when frozen.
- G6-4 N6 "dash-only = empty" also counts U+2012, U+2015, U+2212.
- G6-5 **N8 is live on push:** after a failed fetch the poller no longer runs `git log`; if `rev-parse GOV_REF` fails after a good fetch, the resolver THROWS out of the tick (fail-closed; before, it graded with the no-evidence sentinel). The one fetch is `git fetch --quiet origin`; a `GOV_REF` naming another remote would not be fetched (the box uses origin).
- G6-6 The §5 leg runs only the report test on the C′ column, not the status test.
- G6-7 P39 runs 1 / (b″) / (b‴) must be re-taken at the rebased shas. Run 3's fixture ids were renamed after the first run and the status-only control was added after a planted fault slipped past — the `#744` rider may apply.
- G6-8 Not built: the P38 zero-batch tick fixture (no `tick()` harness) — the tick's wiring is covered by the pure units and by reading.
- G6-9 `scripts/inventory/plan_doc.py:118` still writes the pre-C′ §5 header; if it ever ran the rule would FREEZE (fail-closed). **STALE — `plan_doc.py` is not at `origin/migration/aws-supabase`** (`git ls-tree` on the path returns nothing, while the same read of `scripts/inventory/` lists 19 entries); this batch deleted it at Group 3 (`DELETED_COMPONENTS_LOG.md`). No action.

**G7 — weekly census + mistake pass**
- G7-1 R1-Q13 (c): the homing forms were applied to HOME batch ids inside note cells too.
- G7-2 The self-contradicting detector (the builder's own, as asked): lists #348, #450, #456, #532, #1098 — 5 against 8 under the crude rule.
- G7-3 R3-Q7: walks up to 20 plan commits for the newest tally change; alerts if §6 disagrees and that commit left §6 untouched, or if no tally change is found.
- G7-4 The §0-reference rule resolves 107a and 160a through §0 — list (e) reads 33 + 2 against the pre-registered 35.
- G7-5 List (a): a report is "not-closed-in-plan" only when NONE of its matching lines is closed.
- G7-6 List (d): an EMPTY status on an id-less row counts as "not QUEUED" (none at the refs read).
- G7-7 **Box precondition before P62:** `/var/lib/governance-checker/census` must be writable by the checker's user.
- G7-8 Figures moved from the audit, for P44: list (d) 0 rows, list (e) 0 unmatched at `c6751f5b3`; placements 377/155 and 369/157 against the audit's 352/117 and 354/115.
- G7-9 Fail-open edge: in `planHistory`, a failed read of the oldest commit's PARENT reads as `''`.
- G7-10 R2-Q2: list (d)'s excluded set has no count in `counts` (lost if the lists are cut at the 64 KB cap).
- G7-11 R2-Q3 (b): `cellClosed` matches CLOSED/DONE case-insensitively — 0 differences at five refs; the only changed line is B-CREDENTIALS §0 "OBJ-4a DONE".
- G7-12 P44: the dry-run SCRIPT is committed, its OUTPUT is not — commit it before P62?
- G7-13 Q6: a null-id add records the week but keeps no `openAlerts` key, so the next week cannot escalate it.
- G7-14 `gov-census-failed` / `gov-mistakepass-failed` use category `governance` at warning.

NOT RE-READ: nothing in this change list went to a second reader.
