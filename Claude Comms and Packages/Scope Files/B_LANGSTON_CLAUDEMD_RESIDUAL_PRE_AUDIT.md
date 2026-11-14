# B-LANGSTON-CLAUDEMD-RESIDUAL — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

> **r1 → r2 (Langston, 2026-10-20 22:46Z: CHANGES, three small, PROCEED on landing):** C-1 `.gitignore:72` is KEPT (it ignores a credentials reference doc); C-2 the checker's CLAUDE.md exemption also covers CC's root rules file — recorded on `#744` as a hypothesis for its owner, not built here; C-3 P6 names its read-site, not a carried byte figure. He ruled root:root 0644 for the live file YES, with a no-input installer (P1). He withdrew his r1 CHANGES-3 to his own ledger: A6 stands.

change-class: non_architecture · scope `Scope Files/B_LANGSTON_CLAUDEMD_RESIDUAL_SCOPE.md` (r3, `80ba70062`, Langston PROCEED on landing C-1/C-2/C-3) · measured 2026-10-20/21 on Helsinki as root unless stated

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

**A4 — the load canary reads the numbered headings.** Probe 1 asks for the count and the highest of the `## §N` headings (today: 9 and 19). **Corrected (Langston r2):** it derives that answer at run time, so a renumbering re-baselines itself; only removing every `## §N` heading would break it (`expect: []` ⇒ MALFORMED). The reason not to renumber is A3's citations, which stands alone.

**A5 — the 20 paths in `Claude Comms and Packages/Langston/` (168,456 B in git).**
- Classes: persona/rules (`SOUL.md` 18,571, `BOOTSTRAP.md` 22,512, `IDENTITY.md` 5,095, `AGENTS.md` 4,724, `MEMORY.md` 10,425, `USER.md` 3,377, `CCPI_LANGSTON_SECTION.md` 7,385, `HONESTY_RULE_ADDENDUM_DRAFT.md` 6,198, `staged-updates-2026-04-14/` 2 files 22,335); procedures (`OPUS_4_6_SWAP_PROCEDURE.md` 4,169, `LANGSTON_TELEGRAM_FORUM_SETUP.docx` 13,176); 7 `skills/*/SKILL.md` (46,297 — none installed anywhere under his `.claude`, Langston measured); `langston-call.sh` 4,192.
- **Readers:** no live tool (box-wide grep: only `langston-call` backups match, plus his CLAUDE.md, whose one hit is a DIFFERENT folder, `Langston Design Asks/`). In the repo: `.gitignore:72` (an ignore line for a file not tracked), the archived CCPI, and frozen completion reports / scope files (history, not readers).
- **`langston-call.sh` is already dispositioned in the ledger:** `RUNNING_ISSUES.md` (~4573) — *(5) disconnected, stays disconnected; mark historical or remove*. A second, also stale fork lives at `Claude Comms and Packages/comms-infra/langston-call.sh`; the live script `/usr/local/bin/langston-call` has no repo source. Making it repo-canonical is homed on `#1004` / P19-B12 with `#652` (Langston r2 C-2) and is NOT this batch.

**A6 — the privacy check's prediction:** see §0 — `excluded` +0 from the OBJ-1 commit; private key lines stay ~166, far above the floor of 30 (`MIN_PRIVATE_KEYS`, `:98`).

**A7 — the headroom's consumer, baseline:** `## ★ Kept lines from closed batches` in his MEMORY.md is 11,003 B; 26 `keep:` lines file-wide. Rate unknown (n=1 batch close under the new trim). The headroom itself moves daily with his memory — read it from `langston-size-watch --status` at the time, never from a figure here (Langston measured 4,743 B at ≤55,000 on 2026-10-20 ~22:30Z; the scope's 4,645 came off a stale total).

**A2a — the same exemption covers CC's own root `CLAUDE.md` (Langston r2 C-2).** An untagged edit to the crew's always-loaded rules file passes the checker silently today. **A HYPOTHESIS until its history is read:** `MEMORY.md` is in that list because a memory sync legitimately carries no batch id, so this may be working-as-designed-but-unaddressed rather than a defect. Recorded on `#744` (B-GATE-GUARD, owner CC-A) as an item; not built here, not started without Kyle.

**A9 — reach of the citations above:** the backup and privacy-check lines were read at the REPO copies; Langston cannot read the installed copies from his account, so repo-vs-installed identity is unverified from his side. P1's install-by-hash discipline is the fix for that class going forward.

**A8 — Coltrane:** `comms-infra/codex/AGENTS.md` blob sha256 = `/home/coltrane/.codex/AGENTS.md` sha256 = `591d9bc3…` (root, 2026-10-20). Other files in `comms-infra/codex/` (`CODEX_DISCORD_RULES.md`, `BROWSER_GUIDE.md`, the READMEs) are not yet censused for being superseded persona copies — P8.

## 3. Implementation plan — each item points at its finding

| # | item | from | done when |
|---|---|---|---|
| P1 | Commit the live file byte-identical as **`comms-infra/langston/LANGSTON_CLAUDE.md`** (NOT `CLAUDE.md` — A2), with a README naming its install path `/home/langston/CLAUDE.md`, that its history starts at this commit (the past is not recoverable), and that `scripts/check-reviewer-siblings.mjs` `isInstruction` would need this path if his rules ever carry the reviewer mechanism. **Installer (Langston r2 condition):** root-only, takes NO path, ref or content argument — it reads the pinned commit from the root-owned backup mirror and replaces the live file only when the blob's sha matches; no NOPASSWD entry, no langston→root path. The live file becomes **root:root 0644 in the same step as the installer's first run.** **When a rule must land now:** Langston asks Infra Claude (or any CC session) in the channel; the session commits and installs it, by the hotfix path if urgent. It is never parked in his `MEMORY.md`. | A1, A2 | repo blob sha256 = live sha256; live file root:root 0644; a langston write to it refused |
| P2 | Privacy check around P1: record `excluded` and `live_key_lines` from the last run before the commit, predict them unchanged (A6), run `--dry-run` after the mirror holds the commit. | A6 | readable verdict (PASS or a named EXPOSED), `excluded` as predicted |
| P3 | The 20 paths (A5): the 19 persona/procedure/skill files deleted with one `DELETED_COMPONENTS_LOG.md` row each and a copy under `_archive/deleted-code/`. **`.gitignore:72` STAYS** (Langston r2 C-1): it ignores `LANGSTON_SETUP_REFERENCE.md`, which the archived CCPI names as the Langston infrastructure and credentials doc, and no working tree can be proved never to hold it. **`langston-call.sh` NOT deleted**: a one-line comment added at its top — "NOT the live script (/usr/local/bin/langston-call); a stale copy; making the live one repo-canonical is #1004" — and the same line on the second fork. | A5 | 19 rows logged; the two forks carry the warning |
| P4 | The per-section census (scope OBJ-3) committed as a table beside the repo copy, on the scope's byte convention; Langston rules each row. | A1, A3, A4 | rows sum to 67,896; every row placed |
| P5 | Retire/compress (i)-(x) on the repo copy, one reviewed commit per ruling group, each with its byte delta. **Never renumber**; a retired numbered section keeps its heading with a one-line pointer (to `§9` for §18's surviving instruction, to the dispatch header for the `dt-review` mechanics). Then install by hash. | A3, A4 | CLAUDE.md ≤ 55,000 B; canary probe 1 still answers 9 / 19 |
| P6 | Record the kept-lines size at start (11,003 B) and at close; propose a successor to Kyle only if its growth over the batch's span, carried forward, would use the headroom `langston-size-watch --status` shows at close. | A7 | both figures recorded, with the read-site |
| P7 | Canary `--self-test` + one live run after each install; size watch two consecutive daily runs ≤ ceiling. | A4 | LOADED; two UNDER runs |
| P8 | Coltrane: census `comms-infra/codex/*.md` for superseded persona copies (A8); record the per-objective applies/does-not-apply. | A8 | written |
| P9 | SIM entry for his rules file: location, install path, readers (A1 list), the checker exemption avoided (A2). | A1 | landed at Step 10 |

**`UNAUDITED`:** none. **Not planned:** the module read-check (scope out-of-scope; only if P5 cannot reach 55,000 B).

## 4. Plain-language summary

Langston's rules file loads on every request, has no backup, no history, and nothing has ever checked an edit to it. The plan puts it in the repo under a name the governance checker won't wave through, deletes 19 old persona files that could be mistaken for it, then trims about 13 KB of repeated and retired text — his own rulings — without renumbering anything, so the 20+ references to his sections keep working. The privacy check is unaffected: none of its sample lines come from this file.

## 5. ITEM ADDED 2026-11-14 — the index write-time check (`#1197` rider): audit, then plan

### 5.1 Audit (measured 2026-11-14 ~15:50Z, Helsinki, as root)
| # | finding | evidence |
|---|---|---|
| R1 | **The object.** The harness auto-memory index is `/home/langston/.claude/projects/-home-langston/memory/MEMORY.md`, `langston:langston` 0644, no immutable flag, 12,096 B. It is one of the three files the size watch sums. Its folder holds 92 files; only the index loads on every invoke, the topic files load on demand. | `ls -la`, `lsattr`, `find -maxdepth 1 -type f \| wc -l`; `#1197` (14:10Z annotation) for the three-file sum |
| R2 | **Writers (census).** (a) Langston himself, through the harness's auto-memory writes on his Write/Edit tools: the 11-14 growth was two index lines he added at my request at `B-DTREVIEW-ABSENCE-PROVENANCE` Step 8, plus a hook clause re-grown on 14 lines since 2026-10-17. (b) `obj3_automem_hooks.py`, root, one-time, run once in `B-LANGSTON-RELIEF` OBJ-3. **No other writer found** in `comms-infra/` (grep `automemory\|auto-memory index`: only that script). A write through his Bash tool is possible and was not measured either way. | `#1197` 11-14 annotations; `comms-infra/langston-memory/bin/obj3_automem_hooks.py:1-22` |
| R3 | **Readers.** The harness at every `claude -p` invoke; `langston-size-watch` (daily 05:40Z, and `--status`). | `#1197`; `comms-infra/langston-memory/bin/langston-size-watch` |
| R4 | **The gate to copy.** `langston-memory-write` refuses a write that GROWS `MEMORY.md` and would leave the loaded set over the ceiling (exit 7). It is a non-increase gate, not an absolute ceiling: it reads only `ceiling_bytes` from the ratchet state and sums the set live (the other files by stat, `MEMORY.md` as the new bytes); anything it cannot establish refuses. `--allow-growth` is root-only (r2: dropped for his account). Installed sha256 `6e4a304a…` = the blob at `origin/migration/aws-supabase`. | `langston-memory-write:834-963` (`watched_paths` :852, `read_ratchet` :857), `:1942-1950` |
| R5 | **Where a write-time check can sit.** His `~/.claude/settings.json` is `langston:langston` 0644, not in the repo, and carries no hooks (keys: permissions, telemetry, enabledPlugins, cleanupPeriodDays). There is no `/etc/claude-code/` (no managed settings). Claude Code on the box is 2.1.318. He runs with `--permission-mode bypassPermissions`. | `ls -la`, `python3 -c json.load(...)`, `claude --version`; invoke form in `LANGSTON_ARCHITECTURE.md` |

### 5.2 The one ruling asked of Langston: which mechanism
- **Option A — a root-owned PreToolUse hook in managed settings** (`/etc/claude-code/managed-settings.json`, root 0644, versioned under `comms-infra/langston-memory/`). It matches Write, Edit and MultiEdit; when the target resolves (realpath) to the index, it computes the bytes after the edit and applies R4's rule through the same `read_ratchet` (imported, not re-implemented), refusing with exit 2 and the same wording. **Reach:** every harness tool write to the index. **Not reached:** a write through his Bash tool; the daily watch stays the backstop for that path. **His workflow is unchanged.**
- **Option B — fence the index like `MEMORY.md`:** root-owned and immutable, written only through a new `langston-memory-write` mode. **Reach:** every path, Bash included (impossible rather than intercepted). **Cost:** the harness's own auto-memory writes start failing on a permission error, so every memory save he makes goes through a command instead, and how the harness behaves on that error is unmeasured.
- **Recommendation: A.** The growth that happened came through ordinary harness writes, which A catches. B's cost lands on every memory save to close a Bash path that has not been seen in use. If he prefers B, the plan below changes at P11-P12 only.
- **Unproven, NOT RE-READ:** that 2.1.318 on Linux reads `/etc/claude-code/managed-settings.json`, and that a PreToolUse exit 2 blocks under `bypassPermissions`. Both are proven at Step 3 with a positive control before anything else is built on them (P10).

### 5.3 Plan (each item points at its finding)
| # | item | from | done when |
|---|---|---|---|
| P10 | Positive control first: a throwaway managed hook that refuses a Write to a scratch path under a fixture account, invoked the way his bridge invokes him. If it does not fire, stop and bring Option B back to him. | R5 | the scratch write is refused, and with the hook removed it succeeds |
| P11 | The hook (Option A): realpath match on the index; the post-edit size for Write (content), Edit and MultiEdit (replacements applied to the current bytes; an `old_string` that does not match passes through, since the tool will refuse it itself); R4's rule through the imported `read_ratchet`; refuses whatever it cannot establish, like the gate. | R1, R4 | code reviewed at Step 4 |
| P12 | Tests on a fixture ratchet state with a **synthetic ceiling** (his ruling): growth over → refused; growth under → passes; shrink → passes; a non-index path → passes; unreadable state → refused; plus a mutant per branch. | R4, the ruling | all pass; each mutant killed |
| P13 | Install through `deploy.sh` with a sha256 equal to the blob at the shipping head; one live check that an ordinary index write by him still lands, and that the real set is not pushed over. | R1 | sha matches; his next memory save lands |
| P14 | SIM row for the hook (writer, reach, the Bash-path residual); `LANGSTON_ARCHITECTURE.md` change-log row. | R3, R5 | landed at Step 10 |

### 5.4 Langston's ruling — OPTION A, five conditions binding at Step 4 (Discord `1571187971703701525`, re-read at `1d5651dac`)
His reason beyond §5.2: the harness's own auto-memory instruction ("write to it directly with the Write tool") is injected into every invoke and is not ours to edit; B would make it false on disk, and if the harness swallows a permission error on a save he loses a memory he believes he stored — a data-loss gap traded for a size gap. He re-derived R1, R4 and R5 as langston (measured_total 143,246 vs 143,856) and accepted P10 NOT RE-READ.
| # | condition | folds into |
|---|---|---|
| C-1 | **Every decision is logged** (tool, realpath, bytes before and after, verdict) to a root-owned jsonl. P13 asserts the row for his live write AND that a non-index write produces no row — otherwise "fired and passed" and "never matched" both end in a landed write (#661 leg 3). | P11, P13 |
| C-2 | **One summer:** import `read_ratchet` AND the set-sum from `langston-memory-write`, or call a dry-run `--check-size` mode there. No second implementation of the byte rule. | P11 |
| C-3 | **The hook runs as langston, not root.** `ratchet-state.json` is root:root 0644 today; if it were tightened to 0600 the fail-closed hook would block every save (B's cost, unannounced). `deploy.sh` asserts the state is readable as langston, and the refusal text distinguishes "over ceiling" from "could not establish". | P11, P13 |
| C-4 | **The refusal names the ordering.** An add and a delete are separate Edits, so at the ceiling the add is refused even when the net is a shrink; the message says delete first, and says that each call is judged on its own bytes. A blocked stateless Langston with no stated path would route through Bash, the one path A does not reach. | P11, P12 |
| C-5 | **The matcher is enumerated at the installed CLI version**, not a hardcoded three (MultiEdit is not in his tool set; NotebookEdit is), and the enumeration is recorded so a version bump re-checks it. The byte prediction handles `replace_all`, or fails closed — an assumed single replacement under-counts growth into a false pass. | P11, P12, P14 |
**P10 RESULT — PASS, 2026-11-14 15:48Z, Helsinki** (script `comms-infra/langston-memory/controls/p10_managed_hook_control.sh`, run as root while no langston `claude` process was live). Invoked as langston the bridge's way (`sudo -u langston`, token sourced from `oauth.env`, prompt on stdin, `--permission-mode bypassPermissions`), with HOME and cwd a fresh langston-owned 0700 fixture dir so his own files did not load. ARM 1, managed file `/etc/claude-code/managed-settings.json` holding a Write PreToolUse hook that exits 2 on ONE scratch path: the Write was refused (`P10_REFUSED_BY_MANAGED_HOOK` returned to the model), file absent after, 1 hook log row. ARM 2 (control), managed file removed: the same Write landed, file present after, no new hook row. So 2.1.318 reads that path, and exit 2 blocks under bypassPermissions. Model was `claude-sonnet-5-5` (cheaper; the hook runs in the harness, not the model). Managed file, hook and fixture removed after; `/etc/claude-code` absent again.
**If P10 fails:** before Option B goes back to him, measure the permission-error behaviour first — a fixture index made immutable, one harness Write against it, record what the harness does. That is B's whole cost, and a measurement, not a ruling.

**`UNAUDITED`:** none. Plain-language: his memory index can still grow past the size limit without anything stopping it, because only his main memory file is guarded. The plan adds a guard at the moment he saves, tested only against a pretend limit.
