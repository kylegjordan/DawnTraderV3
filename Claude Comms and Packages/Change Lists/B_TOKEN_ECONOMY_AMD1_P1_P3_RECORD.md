# B-TOKEN-ECONOMY amendment 1 — P1 to P3 implementation record (Langston's and Coltrane's always-loaded notes)

**Owner:** INFRA Codex (standing in for CC-INFRA) · **STEP: 3 of 11** · **NEXT STEP: 4 of 11** (combined P1–P3 independent review after the 03:50Z trim)
**Plan rows:** `Claude Comms and Packages/Scope Files/B_TOKEN_ECONOMY_AMENDMENT_1_PRE_AUDIT.md`, rows P1, P2 and P3 (lines 334-336 at this commit's parent).
**Requested by:** PM Claude, Discord `1573658836009619527` (P6 is in its 7-day read meanwhile).

Langston's memory content stays on Helsinki and is not copied here. Every figure below is read from the live write tool's own output on Helsinki and labelled with its object.

---

## P1 — close the four finished sections so the 03:50Z trim moves them out

### Write 1 — 2026-11-21 ~11:30Z — B-CODEX-FAILOVER and B-ARM-REMOVAL

- **Object:** `/home/langston/memory-parts/00-legacy.md` (the part of record; `MEMORY.md` is composed from it).
- **Change:** two `STATE: open · batch: <ID>` lines flipped to
  `STATE: closed · batch: <ID> · superseded-by: Claude Comms and Packages/Batch Completion/<X>_COMPLETION_REPORT.md`.
  This is the same form as all 50 sections already in `MEMORY-ARCHIVE.md`. Both reports exist in `Claude Comms and Packages/Batch Completion/`.
  Neither section has a class rule or a forward-binding line, so neither gets a `keep:` line.
- **Command:** `langston-memory-write --part 00-legacy.md --expect-sha 4f5c7a65…4d48 --ledger-delta 0 --retractions-delta 0 --by langston`, with no `--allow-growth` (the plan row forbids it).
- **Tool output:** `WRITTEN part 00-legacy.md (4f5c7a656a4d->0c8b9ec697e8)`, `MEMORY.md 73848 -> 74047 B`, `ledger bullets 36 -> 36`,
  `loaded set 143812 B vs ceiling 143856 B (under by 44 B; row 2.8b)`. Exit 0.
- **Trim dry-run, right after the write:** `would evict 2 section(s) [B-CODEX-FAILOVER, B-ARM-REMOVAL], 9 open stay; part 73845 -> 72944 B`.
  So the trim will take out 901 B, against 199 B added by the flips.

### Why two now and two later (an in-task correction)

- **The headroom.** Before the write, the loaded set was 143,613 B against a ceiling of 143,856 B, which left 243 B. The three files and their stat sizes were:
  - `/home/langston/CLAUDE.md`: 57,049 B
  - `/home/langston/MEMORY.md`: 73,848 B
  - the auto-memory `MEMORY.md`: 12,716 B
- **What each option would have added** (built and measured, never written):
  - all four flips plus a `keep:` on the DEPLOY-DRIFT-LINE line: +419 B;
  - with the two class bullets as well: +1,569 B.
- **Why the larger options were wrong.** Either one is refused by the growth gate (exit 7). My first draft bundled the two class bullets into P1, but plan row P2 owns them ("first lift the two class rules named in R2-8b into the class subsection"). I asked Langston for an override, then withdrew the ask (`1573661002971611199`), because P1 says "no `--allow-growth`".
- **What happens to the other two.** B-FILTER-DIAG-STANDARDIZE and B-DEPLOY-DRIFT-LINE each carry a class rule that R2-8b lifts into GENERALISE. They stay OPEN until P2 has made that lift, with P2's shrink paying for it. Then they are flipped, with `keep:` on the DEPLOY-DRIFT-LINE line that says "a clear runs on EVERY terminal exit… a pre-registered observation is never run by hand". This way neither class rule is ever outside the loaded set.

### Write 2 — 2026-11-21 ~11:32Z — B-FILTER-DIAG-STANDARDIZE and B-DEPLOY-DRIFT-LINE, with P2's class lift in the same write

- **Ruling it follows:** Langston, Discord `1573661772844367984` — not an override and not a wait, but the third option the gate names: shrink in the same write, so the class rules never leave the loaded set.
- **Change, in one write to the same part:**
  - the two R2-8b class rules added as two bullets under "Rulings of mine that GENERALISE" (this is P2's first item: the FILTER-DIAG own-ruling-stream rule and the DEPLOY-DRIFT-LINE known-good-set rule with its two-clause `#744` rider);
  - both STATE lines flipped to `closed … superseded-by: Claude Comms and Packages/Batch Completion/<X>_COMPLETION_REPORT.md`;
  - `keep:` on the DEPLOY-DRIFT-LINE pointer line ("a clear runs on EVERY terminal exit … a pre-registered observation is never run by hand");
  - four lines removed, each because its content already has a home outside the loaded set:

    | removed line | where its content lives |
    |---|---|
    | FILTER-DIAG "you vacated your own 11:34 ruling" | `/home/langston/LEDGER.md` line 19, and now the lifted GENERALISE bullet |
    | DEPLOY-DRIFT "two findings outlive the batch" (`#1001`, `#1002`) | `1-system-manual/BATCH_CATALOG.md` line 917 (Langston's citation) |
    | DEPLOY-DRIFT "the defect to carry" (404 read as zero drift) | the batch completion report line 131, and now the lifted bullet |
    | DEPLOY-DRIFT "filed as a two-clause rider on #744" | the completion report line 139, and now the lifted bullet |

- **Narrower than the ruling, and why.** Langston approved leaning both bodies to pointer-plus-keep (≈ −3 KB). I removed only the four lines above. The other body lines (the `#669` and `#675` notes, and the 2026-10-12 "never fired" withdrawal) have no other home, so they stay in the section and the trim carries them verbatim into `MEMORY-ARCHIVE.md`, where `langston-recall` finds them. Cutting them before the flip would have lost them. The write is still a shrink, which is all the gate needs.
- **Command:** `langston-memory-write --part 00-legacy.md --expect-sha 0c8b9ec697e8… --ledger-delta 2 --retractions-delta 0 --by langston`, no `--allow-growth`.
- **Tool output:** `WRITTEN part 00-legacy.md (0c8b9ec697e8->9f7699f7c35d)`, `MEMORY.md 74047 -> 73722 B`, `ledger bullets 36 -> 38`, `loaded set 143487 B vs ceiling 143856 B (under by 369 B; row 2.8b)`. Exit 0.
- **Trim dry-run, right after:** `would evict 4 section(s) [B-FILTER-DIAG-STANDARDIZE, B-CODEX-FAILOVER, B-ARM-REMOVAL, B-DEPLOY-DRIFT-LINE], 7 open stay; part 73520 -> 69961 B`.
- The draft files on Helsinki were removed after the write.

### P1 proof — owed after the 2026-11-22 03:50Z trim

| check | result |
|---|---|
| the trim log names all four (B-CODEX-FAILOVER, B-ARM-REMOVAL, B-FILTER-DIAG-STANDARDIZE, B-DEPLOY-DRIFT-LINE) | PASS. `journalctl -u langston-memory-trim.service`, 2026-11-22 03:50:34Z: `TRIM: evicted 5 section(s) [B-FILTER-DIAG-STANDARDIZE, B-CODEX-FAILOVER, B-TOKEN-ECONOMY-AMD1-P2, B-ARM-REMOVAL, B-DEPLOY-DRIFT-LINE] to MEMORY-ARCHIVE.md; 7 open stay` |
| each section's text is found in `MEMORY-ARCHIVE.md` | PASS: four tagged sections match the writer's archived pre-trim part at `6403341ff652d5cb12c35b8a2b6582753c44c881e3563c9e0318ae007ea44d7e` byte-for-byte between each heading and its STATE line. The later disappearance of the hoisted P1 line from loaded memory is recorded in the Step-4 handoff. |
| net always-loaded change, measured (R2-8a) | Langston's `MEMORY.md` 73,848 B before P1 -> 73,360 B after the P1+P2 writes (-488 B, FINDING-1) -> 68,693 B after the trim (-4,667 B); loaded set 138,458 B vs ceiling 143,856 B, under by 5,398 B (trim tool's own line). Read again 2026-11-22 ~10:45Z: `MEMORY.md` 68,836 B (Langston's own saves since); the ceiling for P3 is read fresh at P3, not from here. |
| write 2 landed (above); its two sections in the same trim | PASS: all four P1 sections plus the P2 section went in the one 03:50:34Z run. |

## P2 — split the REVIEWER LEDGER; move CLAUDE.md §5.1-§5.3 mechanics — in progress

- **Item 1, the two R2-8b class lifts: DONE in P1 write 2** (above; `ledger bullets 36 -> 38`).
- **Item 2, the ledger split: DONE** (below; `ledger bullets 38 -> 31`).
- **Item 3, the CLAUDE.md §5.1-§5.3 mechanics move: BUILT and checked; installs only after Langston's Step-4 review** (below).
### Item 2 — the ledger split — 2026-11-21 ~12:10Z

- **Object:** the same part, `/home/langston/memory-parts/00-legacy.md`, from sha `9f7699f7c35d…` to `6403341ff652d5cb12c35b8a2b6582753c44c881e3563c9e0318ae007ea44d7e`.
- **What stays in the REVIEWER LEDGER:** the "Rulings of mine that GENERALISE" subsection, whole (it holds the class rulings, including the two lifted in write 2); the `### CC-A errors I logged` heading; and the "WHAT IS IN FLIGHT IS A READ-SITE" bullet (ledger line 105 before this write). That bullet is a standing rule about how to read headroom, not an instance, so it stays loaded.
- **What moves, verbatim, as two marked blocks** in a new closed section `## Ledger instances moved 2026-11-21 (B-TOKEN-ECONOMY amd-1 P2)`, which tonight's trim carries to `MEMORY-ARCHIVE.md`:

  | id | the bullets | passage sha256 (bullets joined with LF) |
  |---|---|---|
  | `P2L1` | the 3 CC-A error notes under `### CC-A errors I logged` | `da5964cf58ad2e91d90e6ca636656bc4933304f4cc4aa19b1abec93c0593ea8a` |
  | `P2L2` | the 4 state lines that sat below them (Phase-19 tail, Recently CLOSED, Fee reality, Governance-checker LIVE) | `e86952af52fdba09ee07c1e5cee4ea1e613c814113de93a9c88dea907de56673` |

  The section's STATE line is `closed · batch: B-TOKEN-ECONOMY-AMD1-P2 · superseded-by:` this record. Under the CC-A heading a one-line pointer names both ids and `langston-recall B-TOKEN-ECONOMY-AMD1-P2`.
- **Also removed:** the 1,013 B "REVIEW HOLD on #675" note in the closed B-FILTER-DIAG-STANDARDIZE section (Langston's suggestion). It is already homed at `RUNNING_ISSUES.md` line 3810, and line 10571 (row 93). Without this cut the write grew by 556 B, which is more than the 369 B left under the ceiling.
- **Disclosures:**
  - The two `### P2L1 —` / `### P2L2 —` block titles are new text, needed by the move-ledger format. The bullets under them are byte-for-byte.
  - The CC-A subsection is now its heading plus the pointer. The heading stays because the write tool's ledger-integrity guard requires it (below).
  - Correction: I told Langston and PM that five status lines move. It is four. Line 105 stays, as above.
- **First attempt refused, exit 5:** `ledger subsection '### CC-A errors I logged' absent from the composed file`. My first draft moved the heading along with its bullets. The tool restored the part and `MEMORY.md` byte-identical, and the fix was to keep the heading in the ledger. The guard did its job.
- **Command:** `langston-memory-write --part 00-legacy.md --expect-sha 9f7699f7c35d… --ledger-delta -7 --retractions-delta 0 --by langston --reason …`, with no `--allow-growth`.
- **Tool output:** `WRITTEN part 00-legacy.md (9f7699f7c35d->6403341ff652)`, `MEMORY.md 73722 -> 73360 B`, `ledger bullets 38 -> 31`, `loaded set 143125 B vs ceiling 143856 B (under by 731 B; row 2.8b)`. Exit 0.
  The 731 B is a reading at this moment, not a balance to spend. The auto-memory index (12,716 B at this write) moves whenever Langston saves a memory, so headroom is read again at each write (Langston's correction).
  **Only 488 B of that is this batch's (Langston FINDING-1, msg `1573670751121313833`, re-derived by him):** P1+P2 took his memory file 73,848 -> 73,360 B. The other 1,035 B came from the auto-memory index shrinking on its own (13,751 -> 12,716 B). The Step-4 change list states **488 B** as P1+P2's result, not 731.
- **Trim dry-run, right after:** `would evict 5 section(s) [B-FILTER-DIAG-STANDARDIZE, B-CODEX-FAILOVER, B-TOKEN-ECONOMY-AMD1-P2, B-ARM-REMOVAL, B-DEPLOY-DRIFT-LINE], 7 open stay; part 73158 -> 68491 B`.
- **Move-ledger proof, pre-registered.** The tool is `scripts/crew-tooling/move-ledger-check.mjs`, run on Helsinki against a check folder that links the live part and the live archive. Its ledger lists the two moves above, destination `MEMORY-ARCHIVE.md`.

  | run | expected | result |
  |---|---|---|
  | before the trim (control 1) | FAIL: no blocks in the archive yet | `FAIL P2L1: 0 blocks in MEMORY-ARCHIVE.md (want 1)` and the same for P2L2. Exit 1. |
  | before the trim, destination pointed at the part itself (control 2) | FAIL: the passage is still in the source | `FAIL P2L1: passage is still in memory-parts/00-legacy.md` and the same for P2L2. Exit 1. |
  | after the 2026-11-22 03:50Z trim, with `--dupes` | OK, 2 of 2 moves, no duplicates | PASS, run 2026-11-22 ~10:42Z in `/root/p2check`: `OK — p2_ledger.json: 2 moves, each present once at its destination, unchanged, gone from every source, one home each` |

  Control 2 shows the checker can see the passage where it is now, so the post-trim OK cannot be produced by a checker that is blind to the passage.

### Item 3 — the §5.1-§5.3 mechanics move — 2026-11-21

- **Object:** `comms-infra/langston/LANGSTON_CLAUDE.md`, taken from ref `1e22a5d6e` (its live installed copy at `/home/langston/CLAUDE.md` is sha `36dbd2e9…f791`, equal to that blob). Destination: the new file `comms-infra/langston/LANGSTON_COMMS_MECHANICS.md`, which Langston reads on demand with `dt-review show` at the REVIEW SOURCE stamp (no stamp: `dt-review ref`), as the top of his rules file says. The pointer names the path, never a sha (his condition 3). Ledger: `Change Lists/B_TOKEN_ECONOMY_AMD1_P2_MOVE_LEDGER.json` (marker `P2-MOVED`).
- **What moves, word for word, as four marked blocks:**

  | id | passage | source lines at `1e22a5d6e` | sha256 (LF) |
  |---|---|---|---|
  | `P2C1` | §5.1 body (file-first large content) | 145-155 | `370ab00e43a7abc4d957ef9259503bfa5f59ae84a3f3e3562229de5bad2dda7b` |
  | `P2C2` | §5.2 body (voice notes) | 163 | `ab7dac318c2fd2b928441951d295d4ee4dd13af7ef5d6e201aabb58348462c04` |
  | `P2C3` | §5.3 intro and item 1 (replies wake the sessions) | 168-170 | `c2f3e3662555a8e4a254fe6720526b9dc4be5e6fc8d26a505e5e4935cb9534e1` |
  | `P2C4` | §5.3 item 3 (wake file), name routing, the limitation | 172-176 | `9a29c00d149d40ab7130ad05e30ad595029aa3b8193c37197512140271b6aa5b` |

- **What stays loaded, as the plan row says:** the §5 roles and live-channel paragraph (the stateless boundary), the Telegram-decommissioned block, the escalation criteria, and §5.3 item 2 (the dead alert-log line, a false-absence guard). The three headings become one pointer heading, `### 5.1–5.3 … the mechanics are on demand`, which names the file, the four ids, when to read it, how to read it, and what to do when the read is refused. The §5 intro's citations of "§5.3" and "(§5.1, §12)" now land on that heading.
- **Bytes (blob at the ref):** source 57,049 -> 55,570 B, **−1,479 B** on the rules file. The new file is 3,620 B and is not loaded.
  PREVIOUSLY STATED: about 2.5-3 KB off the loaded set (my plan), and Langston's estimate of about 2.0-2.3 KB (his condition 4, written before the move). THEN, at `61b8db3eb`: −1,808 B. NOW: −1,479 B. REASON: the refusal branch his condition 3 asks for adds 329 B; item 2, the §5 intro and the pointer text stay loaded. **The result is below his estimated range, and is stated here as it is.**
- **Langston's four conditions on this item (msg `1573670751121313833`):**

  | # | condition | how it is met |
  |---|---|---|
  | 1 | keep the §5.3 item 2 guard loaded | kept verbatim under the pointer, still numbered 2 |
  | 2 | mirror byte-identical; mechanics in a new repo path installed by `langston-rules-install` from the reviewed commit | the mirror is the file that installs; the new file is read through `dt-review`, so the install carries no second copy |
  | 3 | name the refusal branch; never "proceed without the protocol"; a path, never a sha | the pointer says a REFUSED read or exit 2/3 means nothing was read: retry once at `dt-review ref`; if that refuses, say so and do not do the part of the task that needs it. No sha in the pointer |
  | 4 | state the expected net | stated above, with the gap to his range |
  The saving counts only once the file is installed (`langston-rules-install <sha>`, after Step 4). Until then `langston-size-watch` notes `pending`, which is a note, not an alert.
- **Move-ledger check** (`node scripts/crew-tooling/move-ledger-check.mjs --ledger "<P2_MOVE_LEDGER.json>" --root . --dupes`):

  | run | expected | result |
  |---|---|---|
  | the new files | OK, 4 of 4, one home each | OK, exit 0 |
  | control: the same ledger against the PRE-move source (ref `1e22a5d6e`) | FAIL | 12 FAILs (each passage still in the source, each pointer missing, each passage in two homes), exit 1 |

  The control shows the check can see each passage where it used to sit, so its OK on the new files is not a blind check passing.
- **Disclosures, for Langston to attack:**
  - Each block's `### ` title line is new text, added so the file can be searched. The passage between the title and the closing marker is the moved text.
  - §5.3 is split into two blocks (`P2C3`, `P2C4`) because its item 2 stays loaded between them.
  - The pointer keeps one restated rule: "Never ask Claude Code to shorten an ask; read the staged file in full." It is the one line of §5.1 that changes his behaviour without the file open, so it stays loaded on purpose (about 80 B).
  - The kept item 2 now opens a list that starts at "2.", on purpose, so the number still matches every citation of "§5.3 item 2".
  - `SECTION_CENSUS.md` is a dated snapshot and is left as it was.
- **Per-rule exercise list (what will use each moved rule after install):**

  | id | the rule | the case that will exercise it |
  |---|---|---|
  | `P2C1` | read a staged file in full; inbox before the Drive mount; the canonical committed home | first genuine staged-file dispatch after installation that requires reading the pointer and the staged file. This Step-4 dispatch precedes installation, so the exercise is pending |
  | `P2C2` | a voice note naming him arrives as text; a failure is a `*_voice_failed` row | no seeded case: the first natural voice failure after install. Unexercised until then |
  | `P2C3` | his replies wake the sessions they name | Step 8 gives the reviewer a fresh wake-routing case and records the rule he actually reads and applies. An automatic reply by itself supplies no exercise |
  | `P2C4` | the wake-file summon, name routing, closed sessions | seeded at Step 8: ask him how he would summon a closed session, without naming the file, and check he follows the pointer to `P2C4` |

- **Install order — Langston ruled HOLD (msg `1573672336627081260`, 2026-11-21 12:12Z, replying to `1573671756248522815`).** Item 3 is not installed on its own. It is reviewed with P1+P2+P3 in one combined Step-4 change list after the 03:50Z trim.
  - **Binding condition:** P3's ceiling is stamped from a fresh `langston-size-watch --status` `measured_total`, read after item 3 is installed and in the same close. It is never taken from the stored state block.
  - **The trap he measured that turn:** `measured_total` was 143,125 against a ceiling of 143,856. The state block still read `last_total_bytes` 144,648 / `BREACH` from 05:40:52Z. Stamping from the state block would have set the ceiling 1,523 B loose.
  - **His expected post-install figure is 141,646.** It is a prediction, not the stamp. The stamp is whatever `--status` reads at the time.

## Folded-in fix — the index guard refused Langston's Reads of his own index (alert 875456c7) — 2026-11-21

- **What happened.** `langston-index-guard` refused every tool outside `WRITERS` that named the index, including tools that only read. Its Helsinki log held 75 rows when read. Rows 17 and 19 are two `Read` calls (2026-11-20 and 11-21), refused as "not a tool this guard was enumerated for". A Read cannot change the file, so those refusals measured nothing and cost him two reads of his own index. Size-watch raised `langston-index-guard-unenumerated-tool` as alert `875456c7`.
- **Intent read.** The fail-closed branch was built for an unmeasurable WRITE (B-LANGSTON-CLAUDEMD-RESIDUAL, #1197 rider, C-5: "a tool outside it that targets the index is refused"). The 11-14 enumeration it records lists Write, Edit and NotebookEdit as the file-writing tools. Read-only tools were never assessed, so refusing them was over-reach, not design (rule 24 outcome 1).
- **Fix, commit `a5a8739cc`:**
  - New `READ_ONLY = ("Read", "Grep", "Glob")` from the same 2.1.318 enumeration. These are allowed and logged as `allowed-read-only`. Anything in neither list is still refused.
  - The size-watch alert text no longer says "a save did not land", which was wrong for a read.
  - Tests: case 8b (Read/Grep/Glob exit 0, three rows, bytes unchanged) and case 8c (an unknown tool stays refused). The guard suite gives 32 pass / 0 fail on Helsinki.
  - Mutation check: three new mutants. 11 of 11 are killed, and the baseline passes.
  - `test_size_watch_alerts.py` gives 134 passed / 0 failed.
- **Not installed.** It rides the combined Step-4 review. After that comes `install-index-guard.sh`, then the size-watch install. `875456c7` is then resolved by hand with `--by cc-infra --evidence`. It is never acked.
- **DISPOSITION:** added to B-TOKEN-ECONOMY amd-1 P1–P3 (this record; the combined Step-4 change list carries it as its own section).

## P3 — reviewer instruction ceilings and the combined review

**Resume check, 2026-11-25 22:14Z.** Helsinki's scheduled Langston trim on 2026-11-22 at 03:50:34Z named five evictions, including the four tracked P1 sections and the P2 ledger section. The trim log records 73,360 → 68,693 B in the loaded `MEMORY.md`, with seven open sections retained. The net change since the pre-P1 measurement of 73,848 B was −5,155 B. The ledger check matched both P2 ledger moves in the captured files and all four P2 communications passages in Git, each byte-for-byte at one declared destination. The Step-4 re-read adds byte-identity proof for the four P1 blocks.

| Reviewer | Helsinki measured total, 22:14Z | Existing ceiling | Proposed instruction-file bytes |
|---|---:|---:|---:|
| Langston, three loaded files | 139,096 B (57,049 rules + 68,896 memory + 13,151 index) | 143,856 B | 55,672 B, 1,377 B below the installed rules file |
| Coltrane, AGENTS.md | 14,755 B | 15,000 B | 14,555 B, 200 B below the installed file |

The two Helsinki reads reported all watched files present. Langston's installed rules hash is `36dbd2e9bb55ce18f1d2acc04796f996bf75fbb3c55413aac35418c8eaf6f791`. Coltrane's installed hash `fce4976f2fb46147cc799e134c253aeccf913a14e7371e0adfcaca91387d5362` matches the Git baseline. The amendment's A2 size-watch observation was historical. Helsinki already has Coltrane's size watch, and its state records the 15,000 B ceiling reapplied under KD-115 on November 22. The increment reuses the existing watch.

- **P3 scope.** Both loaded rules now put one-in-one-out beside the live ceiling lookup. Coltrane's archived paragraph is a dated proof incident. The prohibition on inventing an answer and what to do when evidence is unavailable remain in his loaded rules. The pointer names this record and the exact heading below. The 413-byte paragraph (SHA-256 `4e505802a393dc6e22869cc41221d1f2fcfa48c95060c4a3fcfaf511f911144c`) occurs once in the baseline, zero times in the revised loaded rules and once unchanged under P3-C1. Changing one byte breaks the match.
- **Combined review.** Grade this change list with Langston's P2 item 3 at `adbafcd34` and the folded guard fix at `a5a8739cc`. Langston's original hold in `1573672336627081260` requires the combined review before installation. Coltrane is the on-duty reviewer. His own loaded rules and ceiling require independently authorized review before that increment can install. Langston remains off for the Codex shift.
- **Install gate and verification.** Confirm the approved window and install exact reviewed bytes with the existing governed install path. Confirm both installed hashes, then take fresh `--status` readings. For each reviewed ceiling change, require all watched files present and `measured_total` at or below the existing ceiling, then lower the ceiling to that measured total with an authorized actor in the same close. Use a second fresh status and record its actual total, ceiling, actor, timestamp and net change from baseline. Stop if content or state differs. The table is a pre-install reading. Any shortfall against the approved reduction returns to review with the measured gap and the next one-in-one-out candidate.
- **Observation return points.** Token Watch P10 resumes after ANALYST reports the actual Phase A restart, to check publish freshness against that timestamp and disposition alert `6f9fa1d3-0aa6-4ac2-aa29-61fd3b5428aa`. Its seven-day read is armed for 2026-11-27 00:05Z under `88fc097f-b903-4a3e-9720-7f9c353dadbd`. Birth-cap OBJ-5 stays in observation through 2026-11-27 00:00Z. Protected staging windows and the Phase B restart hold stay in force.

### Step 4 — review handoff

**Implementation READY-AT:** `1656e1c5205cb4a560695b34599438fd7b3ae887`. The combined gates are P1 trim evidence, P2 moves and index-guard fix, and P3 instruction and ceiling procedure.

1. **DECLARED CHANGE-CLASS:** `non_architecture`, from `Claude Comms and Packages/Scope Files/B_TOKEN_ECONOMY_AMENDMENT_1.md`.
2. **DOC SET for this class:**

   | Document | Disposition at Step 4 |
   |---|---|
   | Scope | Present in the amendment named above |
   | Pre-audit | Present in the Step-2 reference below |
   | Completion report | Absent for this increment. The parent progress report is `Claude Comms and Packages/Batch Completion/B_TOKEN_ECONOMY_PROGRESS_REPORT.md` |
   | Batch catalog | Parent present in `1-system-manual/BATCH_CATALOG.md`. Increment reconciliation is due at Step 10 |
   | Phase history | Parent present in `1-system-manual/PHASE_HISTORY.md`. Increment reconciliation is due at Step 10 |
   | Sprint plan | Parent present at stage 0 row 1 in `1-system-manual/SPRINT_TO_LIVE_PLAN.md` |
   | Memory | Shared `.claude/memory/MEMORY.md`, INFRA's `.claude/memory/MEMORY_CC_INFRA.md` and PM's `.claude/memory/MEMORY_PM.md` present. Langston's capture and trim are evidenced above. Closeout synchronization is due |
   | System Impact Map | `1-system-manual/SYSTEM_IMPACT_MAP.md` present. The increment's reconciliation is due at Step 10 under A10 |
   | Changes and Fixes | `1-system-manual/CHANGES_AND_FIXES.md` present. Increment entry due at Step 10 under A10 |
   | Running Issues | `1-system-manual/RUNNING_ISSUES.md` present. #1256 pertains to the Coltrane ceiling setter and state below |
   | System Manual and Adjustment Framework | N/A. This increment covers reviewer tooling and instructions |
   | Deleted Components log | N/A. The closed text moved, and the instruction operation still exists |
   | Post-audit roadmap and Phase 19 plan | N/A. The amendment is already placed in the sprint plan |
   | Reviewer architecture and related comms docs | `1-system-manual/LANGSTON_ARCHITECTURE.md` and the comms file named above are present. A10's remaining parent documentation stays with its applicable legs |
3. **STEP-2 REFERENCE:** `Claude Comms and Packages/Scope Files/B_TOKEN_ECONOMY_AMENDMENT_1_PRE_AUDIT.md`, R2-8 and A1–A2.

**Modified, Coltrane AGENTS.md, §4.** Verify that the operational prohibition remains at the point of action. The deleted lines below are exactly the P3-C1 block archived in this record.

```diff
 ✅ **"I DON'T KNOW" IS A GOOD ANSWER. INVENTING A PLAUSIBLE ONE IS THE WORST THING YOU CAN
 DO.**
-★ **This is not hypothetical.** On 2026-09-08 an automated probe asked the reviewer for a
-value he could not reach. Instead of refusing, he produced a convincing token and a
-convincing file path — **neither of which existed anywhere on the machine** — and the
-checking tool scored it clean. **A fabricated answer is worse than a wrong one, because a
-wrong answer gets caught and a plausible one gets used.**
 ⇒ **If you do not have something, say that. Do not supply the shape of an answer.**
+The 2026-09-08 example is in `B_TOKEN_ECONOMY_AMD1_P1_P3_RECORD.md` under P3-C1
+(`coltrane-review ls` locates the record).
```

**Modified, loaded ceiling pointers.** Each points to its own authority, preserving the existing live lookup and pairing it with one-in-one-out.

```diff
+> **Loaded-set cap: `langston-size-watch --status`. ONE-IN-ONE-OUT** — to add a rule, move one out.
+> **Cap: `coltrane-size-watch --status`. ONE-IN-ONE-OUT** — to add a rule, move one out.
```

**P1 archive and keep re-read.** Compared the writer's SHA-256-verified 73,158 B pre-trim part to the archive blocks at the exact November 22 eviction stamp. All four match byte-for-byte through STATE (FILTER-DIAG 907 B, CODEX-FAILOVER 342 B, ARM-REMOVAL 555 B, DEPLOY-DRIFT 1,028 B). The DEPLOY-DRIFT `keep:` line matches once in the archive and once in the first post-trim loaded snapshot `23e074e328ab6d…`. In the November 24 02:27:31Z whole-part write for B-DB-REGIME-ENUM-ALIGN, it was present in both before objects (`1b9e2296e7828a…`, `a309f207480637…`) and absent from both after objects (`7c5d4689d04492…`, `710bd512e2f94b…`). The current composed memory still has both lifted class rulings. It has zero copies of the DEPLOY-DRIFT keep line against the one-copy archive and pre-write controls. The separate terminal-exit and scheduled-observation obligations on that line were approved to remain loaded. Proposed repair is one exact-line restoration under the existing kept-lines heading through the governed part writer, with a fresh expected SHA, no growth bypass, a one-line before/after check and a composed-memory re-read. Take a reviewer ruling before any restore. The writer audit shows which write removed it, without establishing intent.

**Remaining before install.** The measured 5,155 B memory change plus the proposed 1,377 B rules change accounts for 6,532 B across those two Langston files. KD-108 described approximately 55 KB of material to consider. This increment leaves roughly 48 KB of that estimate to account for. A further one-in-one-out pass under R2-8c is owed. Report the measured reduction and preserve point-of-action rules while inventorying further candidates. Live verification and a final ceiling reading remain future gates.

**Ceiling-setter checks.** The installed Langston actor allowlist must admit the actor actually performing the change. The reviewed source admits the Claude actor and excludes `codex-infra`. Keep the lower-ceiling operation gated pending an authorized actor or reviewed allowlist parity. The two setters accept a number that can differ from the live measured total. The Coltrane setter also accepts a number below the currently measured size. Scratch reproduction of the current source used a 14,755 B file and a 15,000 B ceiling. A 15,100 B request was refused (exit 3), and a 14,555 B request succeeded while the larger file was still present (exit 0). The operational step must pin the installed file and verify the live total immediately before any setter call. Preserve the independent ruling on Coltrane's own files and knobs.

**#1256.** Live `ceiling_bytes` and the latest history entry both read 15,000 B after the KD-115 recovery. The underlying history-integrity requirement remains open. A scratch fixture with top-level 15,118 B and latest history 15,000 B was accepted by the current `--status` (exit 0). This is the first approved work touching the size watches after that issue's disposition. Carry the history-consistency check as an install prerequisite for Coltrane's ceiling change and review it separately from this trim diff. No live state was written by these checks.

REVIEWER: claim-only · What states could the loaded rules, move evidence and ceiling executables still permit? · Found the P1 archive backup and a later missing keep line, prospective P2C1 proof, setters that accept ceilings different from the fresh total, and the Langston actor restriction · re-derived y

### Step 4 — send-back response

**Coltrane, 2026-11-25 22:28:46Z, reply to `1575275701932916930`.** SEND BACK on the combined increment. He approved the exact P1 restore, verified the P2 ledger and index guard, and ruled that Coltrane can review this author’s Coltrane-specific increment. The live ceiling and rules writes still require an authorized actor and the combined install gates.

- **P1 restore performed.** The governed writer accepted the current part SHA and restored one 306-byte line, with zero bytes removed and no growth override. Part `6600db19e7e2… → 46bd1b7103524c0e0e058b6d029b5ef59d1bb4469c3df3fca3865c82e9c85936`. Composed `MEMORY.md` SHA-256 is `115199c10d5c136c52b31ec529ae786856d292a4f613a9a2bf5249abf59362eb`, with exactly one copy of the approved line. Archive bytes unchanged. The three-file loaded set increased 139,096 → 139,402 B, under the 143,856 B ceiling.
- **P2 proof rider.** Keep installation bundled. Each moved rule still needs a post-install exercise and a record showing the reviewer consulted it. The P2C3 row above names the exercise.
- **P3 watch and setter.** Coltrane paused the old watch after its state read, let the setter lower the ceiling, and found the resumed watch could write back the old ceiling and matching old history. The two write entry points now share one state lock through their last save or readback. The common state reader refuses a ceiling that disagrees with the latest history entry before any run or setter mutation. A first-run state with only alert bookkeeping can still seed. The P3 setter uses `--require-current-total` to compare the explicit requested number against the fresh total within the lock. It reads back the new history entry before it returns. Equality leaves the state bytes unchanged. Scheduled reporting and status stay in place. Existing numeric commands without the exact-measurement flag retain their prior cap-setting behavior.
- **Coverage.** The size-watch suite passed 153/153 checks as an unprivileged user on Helsinki with a fake alert store and scratch files. The 1,000 B → 900 B overlap preserved the new ceiling and measured value after both the overlapping and the subsequent watch runs. Deleting the lock reproduced the 1,000 B overwrite (four failed checks), and deleting the history comparison made inconsistent state pass and mutate (six failed checks). The consistent-history, stale-measurement and equality cases passed.
- **R2-8c additional one-in-one-out pass.** P3-L1 archives the 474 B historical opening example from Langston's governed-artifact section and leaves a 90 B pointer. Its operative rules, read procedure and ref instructions stay loaded. The candidate file is 55,288 B, down another 384 B from the previous proposal and 1,761 B from the live file. The moved block's SHA-256 is `4ef5c7e696d5a70b79f69199a2e7b292913356167af72926b9d3a20c135b439e`. After the 306 B P1 restoration, the original 5,155 B memory change plus the proposed 1,761 B rules change, minus the restore, accounts for a net 6,610 B at the recorded comparison points. KD-108's roughly 55 KB estimate leaves about 48 KB to account for. This additional pass removes a dated example and preserves the operating rules. A larger trim needs an itemized review of the remaining load.
- **Install gate.** Reach the approved candidate from the shared branch and verify green CI. Perform the installation in the authorized window and prove the target hashes. Use a fresh `--status` with all watched files present and a confirmed actor. For Coltrane, pass the fresh result to `--set-ceiling` with `--require-current-total` and verify both the new ceiling and the corresponding history row after a normal scheduled watch. Use Langston's supported actor for his setter. Keep the R2-8c ceiling decision and protected staging holds. The scratch results carry no live installation or ceiling approval.

### P3-C1 — Coltrane's 2026-09-08 proof example

★ **This is not hypothetical.** On 2026-09-08 an automated probe asked the reviewer for a
value he could not reach. Instead of refusing, he produced a convincing token and a
convincing file path — **neither of which existed anywhere on the machine** — and the
checking tool scored it clean. **A fabricated answer is worse than a wrong one, because a
wrong answer gets caught and a plausible one gets used.**

### P3-L1 — Langston's 2026-07-10 governed-artifact example

**On 2026-07-10 the crew found that our governance-checker grades fresh commits against a rulebook it reads from a stale worktree (`poller.mjs:313`), that its sibling `checker.mjs:25-28` already STATES the correct invariant and is ignored, and that YOU had the identical defect at two layers. Three independent readers, one bug. Each had a fast-and-wrong path sitting beside a slow-and-right one, and took the fast one every time, because nothing announced the difference.**
