# B-WORKFLOW-IMPROVE — Step 7 first-pass verification (PM Claude)

Ref: local HEAD `7538c9244` (origin `f8eb0f4c1` + the Step 5/6 record); CI 4/4 at `29303adff`, an ancestor (run 44907099007). Raw runs, verbatim: `B_WORKFLOW_IMPROVE_STEP7_EVIDENCE.md` (gathered by a Sonnet helper, each surprise re-read by PM).

**No UI surface:** nothing this batch touched runs on staging (Step 6 record), so there is no tab to navigate. Verification is the tools' own instruments at the ref and the CI log.

| OBJ | instrument | result | matches expected |
|---|---|---|---|
| 1 ledger | `ledger-validate --self-test` | PASS 10 / FAIL 0, exit 0 | yes |
| 2, 3 drafts | text at the ref, marked draft | `◇ DRAFT` heading in workflow-01 :51, -08 :25, -09 :28, -10 :268, -11 :62 | yes |
| 4 code-refs | `code-refs toCanonical` | uses 65, definitions 1, total 66 (change list: 65); pinned refs `c8b07e21f`, `e16767ef7` exist | yes; red mutation and Codex run not re-run here (Step 3 record) |
| 5 census | `census --path active-portfolio-manager.ts` / `--path census.mjs` / `--table nonexistent_zz_table` | exit 0 / 1 / 1 | yes |
| 6 history | `history ml-calibration.ts`; B55 control `history server/jobs/formula-auto-audit.ts --ref 36126033e` | B59 + B55, #174 at `RUNNING_ISSUES:2389` (was :2387, file grew); control lists `BATCH_55_COMPLETION_REPORT.md, BATCH_55_SCOPE.md` | yes |
| 7 closeout | `closeout --self-test`; `--compare` | 7/7; "every row equal" | yes; first-commit positive control not re-run |
| 8 workflow text | `REACHABILITY.md` | 8/8 canary; Codex leg simulated (carried to B-TOKEN-ECONOMY OBJ-3) | document claim; partial by the batch's own ruling |
| 9 pilot | `PILOT.md` | four batch tables + ten blind spots | yes |
| 10 enum check | CI run 44907099007, step "Enum parity (advisory, not required)" | 73 declared enums vs 85 database types; drift both ways; one test marked failed; run `success` because advisory | yes: matches `ENUM_PARITY_FIRST_RUN.md` (the gate-4 drift) |
| 11 skills | `move-ledger-check --self-test`; `--dupes` default and batch ledger; `skill-cites --self-test` | 9/9; OK 55 moves; OK 14 moves; 6/6; all exit 0 | yes; `skill-cites --check` not re-run (needs a before listing) |
| 12 search index | none | waits on row 5b | CLOSED-UNPROVEN at close unless 5b delivers (condition 6) |

**Surprises, each resolved:**
- `history B55 --ref 36126033e` exits 1 ("NO COMMITS"): the bare id is not the documented form; the path form (`PILOT.md:53`) is the control, and it passes.
- The B55 control prints two `fatal: path ... exists on disk, but not in '36126033e'` lines: that is git's own stderr passing through (`history.mjs:19`, `execFileSync` default stdio). The tool also prints its labelled `UNREADABLE at <ref>` line on stdout (`history.mjs:81`, `:116`), which is the blind spot 9 behaviour. Noise, not a defect: no work.
- The Test Suite step logs `invalid input value for enum market_regime: "TREND_FRIENDLY_STABLE"`: one of the six `market_regime` names in the gate-4 drift (code declares, database lacks). Already with Kyle under gate 4; not this batch's to fix.

**For Step 8 (Langston):** leg 1 can re-run the same commands from the evidence file; the four not re-run here (OBJ-4 red mutation, OBJ-7 first-commit control, `skill-cites --check`, the real Codex canary) are the natural targets for leg 2. Gate-2 and gate-3 conditions he said he would take at Step 8 are listed in the change list's condition tables.
