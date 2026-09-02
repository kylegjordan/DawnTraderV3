# B-MEASURE-GATE leg 2 — COMPLETION REPORT (#623 leg 2 · CC-A / OLD Claude · closed 2026-09-02)

**Batch:** convert rule 29 (measurement discipline) from prose into hooks that fire at MEASURE time. **Change-class:** architecture. **Reviewed code:** `a452ad29b` on `origin/migration/aws-supabase` (Langston Step-4 APPROVED on `debd7419b^..a452ad29b`; Step-8 CONFIRMED). **CI:** run `33617452940` on head `0f522b5ac` — Test Suite · TypeScript Check (baseline gate) · Build · Docker Build, each `success` per-job. **Deploy:** NONE — the batch touches no runtime path; staging stays at `2cc4a03ec`. **Scope/design record:** `Claude Comms and Packages/Scope Files/B_MEASURE_GATE_LEG2_SCOPE.md` (r13) · pre-audit r7 · change list r1 (amended in place through r3) · `..._OBJ4_FIRE_RATE.md` · `..._OBJ6B_RESULT.md` r3 · `..._OBJ6B_ENUMERATION.md`.

## ⛔ OPEN AT CLOSE — stated first, not buried
| item | owner | home | closes when | fails when |
|---|---|---|---|---|
| **OBJ-4 live window — PRE-REGISTERED, opens at this close** | CC-A, adjudicated by a **NON-AUTHOR** session | scope §4c (Langston-amended) | ≥50 real (non-synthetic) fires **enumerated**, precision ≥20 %, ≥1 adjudicated published-claim catch | precision <20 % ⇒ the guard is re-scoped or deleted; n<50 after one extension ⇒ **DELETE** — a guard nobody trips is decoration |
| `#984` `guard-measurement-shape` writes `fired` as a list (an empty list is truthy) | CC-A | `B-MEASURE-GATE` leg 3 | field aligned to boolean + `legs[]`, self-test reads `legs` | — |
| `#981` `B-CLAIM-REDERIVE` — the claim-sourced re-derivation Langston would accept in place of OBJ-6d | CC-A | `PHASE_19_PLAN` row 6.6, after leg 3 | its own Step 1 pre-registers its bars | — |
| `#982` ack silences an event-wait alert; no `unack` verb; three keyed rows silenced | CC-A | `B-GOV-REPORTING` row 8 item (v) | the verb exists, the protocol corrected, the three rows restored by the verb | — |
| `#980` the mandated `tail -50` read is specified wrong in four homes | CC-A | `B-GOV-REPORTING` row 8 item (iv) | the wording converges on the whole-file read the injector performs | — |
| `#571` obligation #46 — no alert fires across a boot-time subscribe gap | CC-A | #571 | an alert class exists for a feed that never started | — |

🚨 **SCAFFOLDING DECLARATION:** OBJ-6d ships NOTHING functional — it is closed *"observed, not built"* with its pre-registered bars (≥5 of 8 known positives; ≤2 % escalation) **unmet and stated**. The capability it named (independent re-derivation of a claim against the object) remains inert until `B-CLAIM-REDERIVE`.

## Objectives — YES / NO / PARTIAL, each with its evidence
| OBJ | deliverable | verdict | evidence |
|---|---|---|---|
| 0 | crew notice + the design asks discharged | YES | `686bd683a`; the notice itself was blocked by the probe it warned about — the self-reference hazard, folded into the scope [r4] |
| 1 | §10.5 alert read as a hook | YES | `observe-userpromptsubmit.mjs` recorded the live payload first (no `tool_input`; keys recorded in scope r5); `inject-due-alerts.mjs` reads the WHOLE file on staging, injects full ids, 3 s cap enforced twice, visible failure line; live: 2.0-2.5 s; the mandated `tail -50` saw 4 of 11 due (#980) |
| 2 | stale-fetch guard | YES | `guard-stale-fetch.mjs`; quote-aware gate + silencer, `.git/description` clone clock; suite 69/69 shared with OBJ-3 |
| 3 | completion-report citation guard | YES | `guard-ci-cited.mjs` after six reader rounds: msgfile written in-command ⇒ command text; else the file vs the turn start read from the transcript (8 MB back); earlier-turn limit MEASURED FREE (0 of 58 closes; the warn's FP cost, not the hazard, is what is free — scope [r12]); sees 53 of 84 real closes (the `git add`-only form is invisible to a command-text trigger) |
| 4 | pre-execution measurement-shape guard | YES (shipped, window open) | `guard-measurement-shape.mjs`, Langston SHIP + condition 5; 79/79, 11 mutations; the window above |
| 5 | hook self-test | YES | `hook-selftest.mjs` — REGISTERED / PRESENT / CURRENT / RUNNING per clone, attributed by `project_dir`; 5/5; it caught the deleted probe lingering unregistered at Step 4 |
| 6a | `Stop` hook observation | YES | observed per scope |
| 6b | tool-distribution enumeration | YES | 95 instances / 92 commits at `235132805`, reproduced by Langston byte-for-byte; **the BASH/non-BASH split VACATED** (whole-body regex matched search terms in negative results) — never restated |
| 6c | after-the-fact result guard | YES | `guard-result-shape.mjs` after three replay rounds over 75,819 real results: stderr is merged into stdout on the wire, the cwd notice begins with a newline, single-pipeline only; r3 rate 3.00 % (cap-bound 2,273 · html-not-json 1 true · error-counted 0 · other-document 0); cap-bound on its own terse deduped channel, rates per leg; 76/76, 21 mutations; **instance 8 as it occurred is NOT caught — pinned as a known-gap control** |
| 6d | agent escalation on 6c survivors | NO — observed, not built | an agent hook FIRES on PostToolUse (undocumented), reason delivered, Read/Grep/Bash ok, Write denied, 10-40 s per fire, **the `if` gate did not hold** (scope [r7]); Langston refused both gated shapes as blind to the motivating case (scope [r11]) → `B-CLAIM-REDERIVE` |

## What was verified, and by whom
- **Step 4 (Langston, at the ref):** one blocker — the delivery probe could block and matched its sentinel raw, no mention-elision — unregistered then deleted (archive `.removed`, `DELETED_COMPONENTS_LOG`); seven findings applied (full alert ids; quote-aware fetch gate; basename anchored; gap wording; bare `Not Found` dropped; a header sentence a grep could falsify; five missing paths in the exclusion list). Re-derived by him: 0 `permissionDecision` across the shipped hooks, 7/7 last-line `exit(0)`, every result-shape leg keyed on command AND output.
- **Step 7 (fresh reader, scope [r13]):** the five hook hashes at the ref match the stamps on real sink rows — measurement-shape 56 rows/16 fired, result-shape 55/2, stale-fetch 7, ci-cited 6, injector 6 — **in three clones** (old, new, analyst).
- **Step 8 (Langston):** 5/5 hashes exact at the ref; registration enumerated (24 entries; the leg-2 set complete; probe 0 occurrences); no-deploy confirmed two ways (21/21 batch commits touch no runtime path; the only undeployed runtime change is CC-C's own); CI per-job. The sink rows themselves are `RULED ON REPORTED FACT` on his side — a boundary he cannot cross, decision-inert for a no-deploy batch.

## New findings (settled, each with a home)
1. **The harness merges a command's stderr INTO stdout on the PostToolUse wire**, and its own cwd notice begins with a newline — a guard keyed on stderr had zero reachable inputs across 75,819 real results. Recorded in the SIM hook-layer section.
2. **A message file written in the same Bash command does not exist when a PreToolUse hook runs**; in Git-Bash `/tmp` IS `$TEMP` and names are reused, so a naive file read carried the previous commit's citation. Fixed in OBJ-3; the population measured (scope [r12]).
3. **Acknowledging an event-wait alert silences it**, and the CLI has no way back (#982).
4. **An agent-type hook's `if` argument gate does not hold**, and its subagent's Bash calls re-enter PostToolUse (scope [r7]; `DELETED_COMPONENTS_LOG`).
5. **APR/USD boot-time subscribe gap of 13.8 min with no alert** (#571 obligation #46; the unevaluated-position half was withdrawn by its finder).

## Honest residual — what this batch did not establish
- Whether the guards are USEFUL: the pre-registered window decides it, by enumeration, adjudicated by someone who did not write them. **This report does not and may not say "catches N % of `wrong-object`"** — that inference is unavailable from a set selected on *noticed*.
- The replayed rates are one laptop's transcripts, unreplicated.
- `error-counted` has zero real fires in 75,819 results — proven on fixtures only.
- **The completion-report guard did not trigger on THIS report's own commit** (`ci-cited.jsonl` 10:33: `fired:false, cited:null`): the paths were passed through a shell array and the message file through `"$TEMP/…"`, and both indirect forms are invisible to a command-text trigger. The "sees 53 of 84 real closes" figure therefore overstates its reach for variable-indirect commit forms — filed as #984 (b)/(c), leg 3. Found by the batch's own sink, an hour after the ledger closed.
- Other clones run whatever their last session start refreshed (`B-HOOK-ESTATE-VERSION`, CC-C).
- Per-Bash-call cost: eight node spawns at the ref, ~47-85 ms each on one laptop — Langston accepted it as warn-only instruments, the absolute stated.

## PREVIOUSLY STATED / NOW
- **PREVIOUSLY STATED:** OBJ-4 fires at 50.5 %. **NOW:** withdrawn — it measured my own test suite; the live rate is the window's to measure. **REASON:** synthetic rows were not marked; `GUARD_SYNTHETIC` now marks them.
- **PREVIOUSLY STATED:** OBJ-6b enrichment +11.1 pp. **NOW:** +0.3 pp on the control; the enrichment was a period effect. **REASON:** `contaminated-feed` — the correct conclusion was pre-written in the script's else branch.
- **PREVIOUSLY STATED:** OBJ-6c fires at 3.00 % (aggregate). **NOW:** reported per leg only — cap-bound 2,273 of 75,819, html-not-json 1, error-counted 0, other-document 0. **REASON:** Langston — an aggregate rate is a mixture average that concealed a 99.96/0.04 split.
- **PREVIOUSLY STATED:** seven node spawns per Bash call. **NOW:** eight. **REASON:** Langston enumerated the ref; my prose listed six PreToolUse hooks and the sentence said five.

## Governance files changed — TRANSCRIBED FROM THE STEP-10 COMMIT MESSAGE (the tier ledger), not from memory
CHANGE-CLASS: architecture

| # | document | verdict | one line |
|---|---|---|---|
| T1 | `BATCH_CATALOG.md` | ✅ | new row: what shipped, the reviewed ref, CI run, no-deploy, the findings, CLOSED 2026-09-02 |
| T1 | `PHASE_HISTORY.md` | ✅ | Phase-19 governance block: rule 29 gained its mechanism; the five measured findings; the OBJ-6d refusal |
| T1 | `PHASE_19_PLAN.md` | ✅ | row 6 marked LEG 2 CLOSED; rows 6.6 (`B-CLAIM-REDERIVE`) and 8 (v) placed earlier this batch |
| T1 | shared `MEMORY.md` + `MEMORY_CC_A.md` | ✅ | shared: the hook layer is live, the injector does the §10.5 read, ack silences an event-wait alert; own: position → Step 10/11 |
| T1 | the batch `SCOPE` | ✅ | r13 is current — the OBJ-6c replays, the 6d close, the OBJ-3 measurement, the Step-7 evidence |
| T1 | the batch `PRE_AUDIT` | ✅ | r7 (Step 2) — unchanged this step; its P8 row pre-registered the SYSTEM_MANUAL BLOCKED reason |
| T1 | `COMPLETION_REPORT` | ✅ | written at Step 11, ledger transcribed from this message *(the commit's wording; "this message" = commit `ececf99dc`)* |
| T1 | Langston's `/home/langston/MEMORY.md` | ✅ | closure block appended after the last batch row (backup taken; his file is 2× the byte cap — Infra Claude's #946) |
| T2 | `SYSTEM_MANUAL.md` | BLOCKED | pre-registered in the pre-audit (:282) and accepted by Langston at Step 8: its scope is trading architecture / strategy / regime / filter / signal pipeline / maths and this batch touches none — a chapter invented to discharge a required row would be padding, which is worse than the gap. Not N/A: a required row cannot take N/A; the class stays architecture because the hook layer IS architecture (cross-cutting session state), just not the manual's |
| T2 | `SYSTEM_IMPACT_MAP.md` | ✅ | new section "Claude Code Hook Layer (laptop sessions, NOT the app)": components, sinks, cross-cutting state, measured harness facts, known gaps, what was retired |
| T2 | `RUNNING_ISSUES.md` | ✅ | #983 opened (fired-as-list truthiness, homed leg 3); #980 #981 #982 and the #571 obligation earlier this batch — **RENUMBERED #984 after the commit: CC-INFRA minted #983 ten minutes earlier** |
| T2 | `CHANGES_AND_FIXES.md` | N/A | nothing under `server/`, `client/`, `drizzle/` or `shared/` changed (git diff base..a452ad29b on those paths is empty) |
| T2 | `POST_AUDIT_ROADMAP.md` | N/A | no phase-level change; the batch sits in `PHASE_19_PLAN` row 6 |
| T2 | `ADJUSTMENT_FRAMEWORK.md` | N/A | no trading parameter touched — the diff has no module_constants or config write |
| T2 | `AUTHORITY_BASELINE.md` | N/A | no constitutional change |
| T2 | `STORAGE_POLICY.md` | N/A | no table, tier or retention touched; the sinks are laptop jsonl files outside the policy's scope |
| T2 | `MULTI_ASSET_VTS_EXPANSION_PLAN.md` | N/A | no asset-class code in the diff; working list reviewed, nothing reset |
| T2 | `ASSET_CLASS_ONBOARDING_WORKFLOW.md` | N/A | no onboarding learning surfaced |
| T2 | `BUILD_METHOD_PLAYBOOK.md` | ✅ | rule added to §7: a rule firing at announce time cannot catch a measure-time failure — give it a warn-only mechanism; readers built the mechanism |
| T2 | `LANGSTON_ARCHITECTURE.md` | N/A | his build (model, runtime, invocation, read path, auth, files) is unchanged |
| T2 | `CLAUDE.md` / `CONDUCT.md` | N/A | no stable rule changed in this batch; the §10.5 wording change (tail → the injector) is homed at `B-GOV-REPORTING` (iv), #980 |
| T2 | `_archive/CLAUDE_MD_RULE_HISTORY.md` | N/A | no `CLAUDE.md` rule added or materially changed |
| T2 | `DELETED_COMPONENTS_LOG.md` | ✅ | two entries: the OBJ-6d agent-hook probe (never at a ref, logged anyway) and `probe-warn-delivery.mjs` (unregistered, deleted, archived `.removed`) |
| T2 | `MISTAKE_PATTERNS.md` | ✅ | one dated instance line under each slug this batch's trailers used: wrong-object (3), fix-relocates, silence-not-evidence, fragment-not-whole (2) |
| T2 | `GOVERNANCE_EXCEPTIONS.md` | N/A | Kyle granted no exception; the SYSTEM_MANUAL BLOCKED is a declared state, not an exception |
| T2 | `ALERT_HANDLING_PROTOCOL.md` | N/A | the ack-vs-route correction is homed at `B-GOV-REPORTING` (v), #982 — not edited here so the protocol and the CLI change together |
| T2 | `DELIVERY_BOARD_PROTOCOL.md` | N/A | no column, field or ownership changed |
| T2 | `CLAUDE_CODE_FEATURE_WATCH.md` | N/A | the daily model/feature check did not run in this batch |

**Board:** card `B-MEASURE-GATE leg 2` → `Observation` (the OBJ-4 window), Blocked on = Kyle for acknowledgement after Langston's sign-off on this report. **The batch is CLOSED as a build; the OBJ-4 window is the observation this report will be amended with when the data is in AND the decision is taken.**
