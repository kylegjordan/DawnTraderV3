# B-CENSUS-OWNERLESS-REMAINDER — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · **Owner:** CC-A (OLD Claude) · **Plan row:** `SPRINT_TO_LIVE_PLAN.md` 1s · **Issue:** `#1167` · **Scope:** r1 `15840860b`, **APPROVED by Langston 2026-10-07 with C1-C5** (folded below).

## PREVIOUSLY STATED → NOW
- **PREVIOUSLY STATED (scope §0): "measured … after `f440dd232`". NOW: measured at `035d0f7e5`** (Langston C5 — `RUNNING_ISSUES` `#1167` names that ref for the same 407/34/15/48; one ref, named).
- **PREVIOUSLY STATED (scope): 48 to own. NOW: 45 to own + 3 to CLOSE.** REASON: reading the 48 found three that are already finished — `#154` (its file `adaptive-ratio-manager.ts` no longer exists at the ref; deleted by `B-ARM-REMOVAL`, `B_ARM_REMOVAL_COMPLETION_REPORT.md`), `#298` (own tail: *"#298 CLOSED — both … halves are shipped + UI-verified"* | RESOLVED; fix `534d582ed` is in the branch), `#302` (own tail: *"Closed: head `ffb737b0c` … | RESOLVED (P19-B6.8)"*; its leftover → P19-B6.10, row 185, `#400`). Closing them is §9.4 disposition 1 (row 1n's method), not new scope; owning them would put a live owner on dead work.
- **PREVIOUSLY STATED (scope OBJ-3): I lean (a). NOW: (c) — a LABELLED `placingLine` source plus the list.** REASON: Langston C3.

## 1. AUDIT

### 1.1 The 48, by placing line (re-derived at `035d0f7e5`; Langston re-derived the same at `15840860b`)
| group | n | ids |
|---|---|---|
| §4 row naming a session | 18 | 166, 168, 199, 201, 204, 218, 220, 221, 231, 233, 235, 296, 322, 370, 374, 375, 376, 652 |
| after-live line naming a session | 1 | 537 (CC-B) |
| after-live line naming Kyle | 2 | 229, 298 |
| after-live line with no owner | 21 | 144, 148, 151, 152, 154, 155, 156, 157, 158, 159, 169, 171, 172, 173, 198, 202, 209, 217, 219, 226, 234 |
| HOME batch or roadmap | 6 | 203, 205 (roadmap, no batch id) · 237, 324, 539 (HOME batch on an after-live line with no owner) · 302 (HOME batch P19-B6.10 → §4 row 185, CC-A) |

### 1.2 The census — where ownership is read today
`census.mjs` `ownerOfIssue(e)` takes the ledger entry only; sources in order `ownerLine` → `homeLine` → `filer` → `unknown`, each LABELLED (R3-Q9). Call sites (Langston C4): `census.mjs:544` (`runCensus`, for list (b) labels), `:807`/`:808` (the dry-run's as-built placement path), `census.test.mjs:281`. The placing line is known only to `placement()` (`plan.s4` / `pls.afterLive`).

### 1.3 Sources read
Code (`census.mjs`, the placing rows) · ledger (each of the 48 in full; `git log -S` for #154's file) · completion reports (`B_ARM_REMOVAL`, B-NAMES/B-NAMES.1 via #298's own text, P19-B6.8 via #302's) · SIM governance-checker entry (read; changes at Step 10 if the census changes) · System Manual N/A · no runtime/DB read needed (ledger-only batch).

## 2. THE OWNERS (45) — rule: the placing line's owner where it names a session; else the §6 grouping; a departure from a session the entry names is stated
| # | owner | why |
|---|---|---|
| 166, 168, 652 | Infra Claude | §4 rows 71, 163, 164. (#652's head names CC-B as the FILER; the row doing the work is Infra's — stated departure) |
| 199, 201, 220, 221, 231, 233, 374, 376 | CC-B | §4 rows 50, 137, 117, 134a, 124, 49, 80a, 80a |
| 204, 296 | CC-C | §4 rows 67, 176 |
| 218, 235, 322, 370, 375 | CC-A | §4 rows 84, 102, 184, 153, 153 |
| 537 | CC-B | its after-live line and its head name CC-B |
| 144 | CC-C | perpetual futures (the perp feed is CC-C's) |
| 148, 169, 171, 172, 198, 202 | Infra Claude | servers, storage jobs, cron evidence, deploy hygiene |
| 151, 156, 173, 203, 217, 237 | CC-B | scanner cadence, per-class consumer swaps, learning-data guard, a strategy's enablement (ORB), RTB |
| 152, 158, 159, 205, 219 | CC-A | module-lock boundary, trade-record reads, trade-closed log, the EV gate's rejected arm, a regime input |
| 155, 157, 209, 226, 234 | Infra Claude | diagnostic-screen payloads, the type-check baseline and test tiers (CI) |
| 229 | Infra Claude | identity — the symbol-form modules (§6: "Identity, the coin list"); Kyle's decision marker kept |
| 324, 539 | CC-A | the checker's pre-activation gate (`B-GOV-2`, my governance line), EOL normalisation (`B-EOL-NORMALISE`, my queue) |
Totals: CC-A 12 · CC-B 15 · CC-C 3 · Infra Claude 15 = 45. **Closed:** 154, 298, 302.

## 3. GRADING (Langston C1, C2)
- **OBJ-1 is graded with the PRE-change predicate** — `ownerOfIssue(e)` with no placing-line context — so it measures the 45 written owner lines, not the widened rule. Target: `source: 'unknown'` = 0 among the 45; the 3 closed are out of the OPEN set. The post-change run is reported as a separate number.
- **OBJ-2's discriminating denominator is 20 of 48, published as such:** the 18 §4-row issues + `#537` + `#302` (HOME → row 185) have an owner that existed BEFORE this batch; the comparator is that owner. For the 23 after-live lines that read `(—)`/Kyle and `#237`/`#324`/`#539`, the after-live line is written by this batch, so a match is by construction — stated, not counted as evidence. `#203`/`#205` (roadmap, no owner field anywhere) are **carved out** of OBJ-2.

## 4. THE CENSUS RULE (OBJ-3) — (c), Langston C3, priced per C4
- **`ownerOfIssue(e, ctx)`** — a second, OPTIONAL argument; with no `ctx` the result is byte-identical to today (all four existing call sites unchanged). With `ctx.placingOwner(n)`, an issue that has NO owner from its own text reads `source: 'placingLine'`, labelled `placing-line <session>` — never flattened into `owner <session>`.
- **List (b′) "placed but ownerless"** in the census body and metadata: OPEN issues placed but whose source is `placingLine` or `unknown`. Only `runCensus` passes `ctx`.
- **Before it ships (row 1n's C2 rule):** the census dry run at the close sha states list (b′)'s count and members — expected 0 after this batch's owner lines — with a positive control (an issue with its owner line removed in a `--plan-file`-style fixture reads `placingLine`/listed).

## 5. IMPLEMENTATION PLAN (each item → its finding)
| # | item | from |
|---|---|---|
| P1 | close `#154`, `#298`, `#302` in place (head CLOSED, "originally:", a citation line) | PREVIOUSLY STATED |
| P2 | one `W41 OWNER (CC-A, <date>): OWNER <session> — <why>` line in each of the 45; edit in place | §2 |
| P3 | after-live: write the owner on each line that reads `(—)`/Kyle for the 23 + `#237`/`#324`/`#539`'s batch lines | §2, §3 |
| P4 | census: `ownerOfIssue(e, ctx)` + `placingLine` + list (b′), with tests (the old predicate unchanged when `ctx` is absent — a test pins it) | §4 |
| P5 | hand-over by number: CC-B 15, Infra Claude 15, CC-C 3 | scope OBJ-4 |
| P6 | grade: OBJ-1 (old predicate), OBJ-2 (20 discriminating), OBJ-3 (list (b′) measured, control), OBJ-5 (`recountS6`) | §3, §4 |

## 6. JUDGEMENT CALLS TO ATTACK
1. Closing `#154`/`#298`/`#302` here rather than handing them to an owner to close.
2. `#652` departs from its named filer (CC-B) to the row's owner (Infra Claude).
3. `#324` (`B-GOV-2`) and `#539` (EOL) to CC-A — both are governance-tooling items with no §6 group; I hold the governance line.

**NOT RE-READ** (no fresh reader routed): the §6 group chosen for each of the 23 un-owned after-live items.
