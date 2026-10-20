# B-LANGSTON-CLAUDEMD-RESIDUAL — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture · scope `Scope Files/B_LANGSTON_CLAUDEMD_RESIDUAL_SCOPE.md` (r3, `80ba70062`, Langston PROCEED on landing C-1/C-2/C-3) · measured 2026-10-20/21 on Helsinki as root unless stated

## 0. PREVIOUSLY STATED → NOW

- **PREVIOUSLY STATED:** the loaded sum is 152,107 B (scope r1/r2). **NOW:** 152,009 B (Langston, `langston-size-watch --status`, 2026-10-20 ~22:15Z). **REASON:** his memory moves daily; the target is CLAUDE.md's own bytes (scope OBJ-5), not this gap.
- **PREVIOUSLY STATED:** committing CLAUDE.md "moves its key lines wholesale into the exclusion set" of the privacy check (Langston r1 CHANGES-3). **NOW:** CLAUDE.md is not a key-line source at all — the check takes its key lines from `MEMORY.md` only (`copies_in`, defined at `langston-privacy-check:240`, builds its keys from the one file it is passed; `:470` passes `cfg["live_memory"]`, which is `LIVE_MEMORY` = `/home/langston/MEMORY.md`, `:41`); CLAUDE.md is one of its `read_targets` (`:140,151`), the files whose non-readability by the other account it confirms. **0 of the 186 memory key lines (≥40 chars) appear in CLAUDE.md**; positive control, same count against the memory's own source part: 185 of 186. **REASON:** predicted change to `excluded` from the commit = 0. The done-when (measure before, predict, readable verdict after) stays.
- **PREVIOUSLY STATED:** the sections sum to 67,897 B (scope r1/r2). **NOW:** 67,896 B exactly (Langston r2). **REASON:** a phantom final newline.

## 1. Sources read

| # | source | read |
|---|---|---|
| 1 | code at the ref | `langston-size-watch:56`, `langston-memory-write:502`, `langston-load-canary:80,136-184`, `langston-privacy-check:41,98-103,134-166,212-300,363-388`, `langston-selfmemory-backup:46-48`, `scripts/governance-checker/config.mjs:36-41` + `checker.mjs:161`, `scripts/check-reviewer-siblings.mjs:25-29` |
| 2 | runtime | `langston-size-watch --status`; the last `state/privacy-check.jsonl` row (2026-10-20 06:04:48Z, PASS, `live_key_lines` 184, `excluded` 18); box-wide grep of `/usr/local/bin /usr/local/sbin /opt/discord-bridges /etc/systemd/system /etc/cron.d` for the CLAUDE.md path and for `Claude Comms and Packages/Langston` |
| 3 | `SYSTEM_IMPACT_MAP.md` | the `langston-memory-write` entry and the OBJ-3 block (the three auto-loaded files); **silent on CLAUDE.md as a component** — no entry names its writers, readers or install path. **That silence is a gap (A1)** |
| 4 | `SYSTEM_MANUAL.md` | judged N/A — no trading architecture, strategy, regime, filter, pipeline or math |
| 5 | ledger | `RUNNING_ISSUES` `#651`, `#974`, `#1004`, the `langston-call` fork table (`RUNNING_ISSUES.md` ~4558-4576); `B_RULES_1E_SCOPE.md` / `B_RULES_1E_PRE_AUDIT.md` (CC-A's B-RULES-1e — a DIFFERENT batch, `#739-#741`; its P5 planned to reconnect the live `langston-call`, never done) |
| 6 | `bridge/canonical/` | **not consulted, and why:** his CLAUDE.md was created at the 2026-05-06 runtime move, after the 2026-01/02 governance change; nothing here predates it |

## 2. Audit findings

**A1 — CLAUDE.md: the census at its one location (`/home/langston/CLAUDE.md`, langston:langston 0644, mtime 2026-09-30 17:33Z).**
- **Writers:** none. No tool writes it; every change has been a hand edit (box-wide grep: no executable writes the path). **Deleters:** none. **Schedulers:** none.
- **Readers (five, plus the harness):** the harness auto-load (every invoke); `langston-size-watch` (sums it, `:56`); `langston-memory-write` (the growth gate's watched list, `:502`); `langston-load-canary` probe 1 (counts `## §N` headings, `:80,143`); `langston-privacy-check` (a read-target: it confirms the other account cannot read it, `:140`); `/usr/local/bin/langston-log-loaded` (stats it per invoke) — **that last one is on the box only, not in the repo.**
- **Backup: none.** `langston-selfmemory-backup` copies the harness memory store and `.memory-archive/` only (`:46-48`). His rules file has no backup and no history.
- **SIM: no entry.** ⇒ a SIM entry is owed at Step 10.

**A2 — the governance checker exempts every file NAMED `CLAUDE.md`.** `HOUSEKEEPING_ONLY_BASENAMES = ['MEMORY.md', 'CLAUDE.md']` (`config.mjs:41`), matched as `f === b || f.endsWith('/' + b)` (`checker.mjs:161`). A repo copy at `comms-infra/langston/CLAUDE.md` would make every commit that touches only it count as housekeeping — **never flagged as untagged code, so an edit to his rules with no batch id would pass silently.** `check-reviewer-siblings.mjs:29` matches the root `CLAUDE.md` exactly and is unaffected.

**A3 — section numbers are cited across the repo.** At least 20 citations in 11 files name his sections by number (`§14` ×10, `§5.3` ×4, `§11` ×2, `§6`, `§19`, `§13`, `§10`). **A floor:** the search matched one phrasing ("Langston's / his CLAUDE.md §N"). ⇒ retiring or merging a section must not renumber anything.

**A4 — the load canary depends on the numbered headings.** Probe 1 asks for the count and the highest of the `## §N` headings (today: 9 and 19). Removing a numbered heading changes the expected answer; keeping the headings keeps it stable.

**A5 — the 20 paths in `Claude Comms and Packages/Langston/` (168,456 B in git).**
- Classes: persona/rules (`SOUL.md` 18,571, `BOOTSTRAP.md` 22,512, `IDENTITY.md` 5,095, `AGENTS.md` 4,724, `MEMORY.md` 10,425, `USER.md` 3,377, `CCPI_LANGSTON_SECTION.md` 7,385, `HONESTY_RULE_ADDENDUM_DRAFT.md` 6,198, `staged-updates-2026-04-14/` 2 files 22,335); procedures (`OPUS_4_6_SWAP_PROCEDURE.md` 4,169, `LANGSTON_TELEGRAM_FORUM_SETUP.docx` 13,176); 7 `skills/*/SKILL.md` (46,297 — none installed anywhere under his `.claude`, Langston measured); `langston-call.sh` 4,192.
- **Readers:** no live tool (box-wide grep: only `langston-call` backups match, plus his CLAUDE.md, whose one hit is a DIFFERENT folder, `Langston Design Asks/`). In the repo: `.gitignore:72` (an ignore line for a file not tracked), the archived CCPI, and frozen completion reports / scope files (history, not readers).
- **`langston-call.sh` is already dispositioned in the ledger:** `RUNNING_ISSUES.md` (~4573) — *(5) disconnected, stays disconnected; mark historical or remove*. A second, also stale fork lives at `Claude Comms and Packages/comms-infra/langston-call.sh`; the live script `/usr/local/bin/langston-call` has no repo source. Making it repo-canonical is homed on `#1004` / P19-B12 with `#652` (Langston r2 C-2) and is NOT this batch.

**A6 — the privacy check's prediction:** see §0 — `excluded` +0 from the OBJ-1 commit; private key lines stay ~166, far above the floor of 30 (`MIN_PRIVATE_KEYS`, `:98`).

**A7 — the headroom's consumer, baseline:** `## ★ Kept lines from closed batches` in his MEMORY.md is 11,003 B; 26 `keep:` lines file-wide. Rate unknown (n=1 batch close under the new trim).

**A8 — Coltrane:** `comms-infra/codex/AGENTS.md` blob sha256 = `/home/coltrane/.codex/AGENTS.md` sha256 = `591d9bc3…` (root, 2026-10-20). Other files in `comms-infra/codex/` (`CODEX_DISCORD_RULES.md`, `BROWSER_GUIDE.md`, the READMEs) are not yet censused for being superseded persona copies — P8.

## 3. Implementation plan — each item points at its finding

| # | item | from | done when |
|---|---|---|---|
| P1 | Commit the live file byte-identical as **`comms-infra/langston/LANGSTON_CLAUDE.md`** (NOT `CLAUDE.md` — A2), with a README naming its install path `/home/langston/CLAUDE.md`. Install from then on by hash (a small installer like the tools'); propose the live file become **root:root 0644** so it changes only by an installed commit — **Langston to rule** (Q4 applied to the core). | A1, A2 | repo blob sha256 = live sha256 |
| P2 | Privacy check around P1: record `excluded` and `live_key_lines` from the last run before the commit, predict them unchanged (A6), run `--dry-run` after the mirror holds the commit. | A6 | readable verdict (PASS or a named EXPOSED), `excluded` as predicted |
| P3 | The 20 paths (A5): the 19 persona/procedure/skill files deleted with one `DELETED_COMPONENTS_LOG.md` row each and a copy under `_archive/deleted-code/`; the `.gitignore:72` line removed with them. **`langston-call.sh` NOT deleted**: a one-line comment added at its top — "NOT the live script (/usr/local/bin/langston-call); a stale copy; making the live one repo-canonical is #1004" — and the same line on the second fork. | A5 | 19 rows logged; the two forks carry the warning |
| P4 | The per-section census (scope OBJ-3) committed as a table beside the repo copy, on the scope's byte convention; Langston rules each row. | A1, A3, A4 | rows sum to 67,896; every row placed |
| P5 | Retire/compress (i)-(x) on the repo copy, one reviewed commit per ruling group, each with its byte delta. **Never renumber**; a retired numbered section keeps its heading with a one-line pointer (to `§9` for §18's surviving instruction, to the dispatch header for the `dt-review` mechanics). Then install by hash. | A3, A4 | CLAUDE.md ≤ 55,000 B; canary probe 1 still answers 9 / 19 |
| P6 | Record the kept-lines size at start (11,003 B) and at close; propose a successor to Kyle only if growth would use the 4,645 B headroom within the batch's span. | A7 | both figures recorded |
| P7 | Canary `--self-test` + one live run after each install; size watch two consecutive daily runs ≤ ceiling. | A4 | LOADED; two UNDER runs |
| P8 | Coltrane: census `comms-infra/codex/*.md` for superseded persona copies (A8); record the per-objective applies/does-not-apply. | A8 | written |
| P9 | SIM entry for his rules file: location, install path, readers (A1 list), the checker exemption avoided (A2). | A1 | landed at Step 10 |

**`UNAUDITED`:** none. **Not planned:** the module read-check (scope out-of-scope; only if P5 cannot reach 55,000 B).

## 4. Plain-language summary

Langston's rules file loads on every request, has no backup, no history, and nothing has ever checked an edit to it. The plan puts it in the repo under a name the governance checker won't wave through, deletes 19 old persona files that could be mistaken for it, then trims about 13 KB of repeated and retired text — his own rulings — without renumbering anything, so the 20+ references to his sections keep working. The privacy check is unaffected: none of its sample lines come from this file.
