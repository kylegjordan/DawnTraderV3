# B-TOKEN-ECONOMY amendment 1 — P1 to P3 implementation record (Langston's and Coltrane's always-loaded notes)

**Owner:** Infra Claude (CC-INFRA) · **STEP: 3 of 11** · **NEXT STEP: 4 of 11** (P1+P2+P3 as one change list to Langston, after the trims)
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
| the trim log names all four (B-CODEX-FAILOVER, B-ARM-REMOVAL, B-FILTER-DIAG-STANDARDIZE, B-DEPLOY-DRIFT-LINE) | owed |
| each section's text is found in `MEMORY-ARCHIVE.md` | owed |
| net always-loaded change, measured (R2-8a) | owed |
| write 2 landed (above); its two sections in the same trim | owed (dry-run says 4 of 4) |

## P2 — split the REVIEWER LEDGER; move CLAUDE.md §5.1-§5.3 mechanics — in progress

- **Item 1, the two R2-8b class lifts: DONE in P1 write 2** (above; `ledger bullets 36 -> 38`).
- **Item 2, the ledger split: DONE** (below; `ledger bullets 38 -> 31`).
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
- **Trim dry-run, right after:** `would evict 5 section(s) [B-FILTER-DIAG-STANDARDIZE, B-CODEX-FAILOVER, B-TOKEN-ECONOMY-AMD1-P2, B-ARM-REMOVAL, B-DEPLOY-DRIFT-LINE], 7 open stay; part 73158 -> 68491 B`.
- **Move-ledger proof, pre-registered.** The tool is `scripts/crew-tooling/move-ledger-check.mjs`, run on Helsinki against a check folder that links the live part and the live archive. Its ledger lists the two moves above, destination `MEMORY-ARCHIVE.md`.

  | run | expected | result |
  |---|---|---|
  | before the trim (control 1) | FAIL: no blocks in the archive yet | `FAIL P2L1: 0 blocks in MEMORY-ARCHIVE.md (want 1)` and the same for P2L2. Exit 1. |
  | before the trim, destination pointed at the part itself (control 2) | FAIL: the passage is still in the source | `FAIL P2L1: passage is still in memory-parts/00-legacy.md` and the same for P2L2. Exit 1. |
  | after the 2026-11-22 03:50Z trim, with `--dupes` | OK, 2 of 2 moves, no duplicates | owed |

  Control 2 shows the checker can see the passage where it is now, so the post-trim OK cannot be produced by a checker that is blind to the passage.

- Item 3, the CLAUDE.md §5.1-§5.3 mechanics move with a pointer: not started.

## P3 — lower the ceiling to the measured post-trim total; Coltrane the same — not started
