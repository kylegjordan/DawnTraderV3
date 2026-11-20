# B-TOKEN-ECONOMY AMENDMENT 1 — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture (settled in A10; the docset consequence is named there)

Step 2 for the five objectives Kyle added on 2026-11-20 (KD-108, `1-system-manual/pm/DECISIONS.md`), scoped in `B_TOKEN_ECONOMY_AMENDMENT_1.md` (pushed `eb53cdc2c`). Langston's Step-1 verdict (Discord `1573296874692149378`): **PROCEED TO STEP 2**, with two corrections to the amendment text and seven fold-ins. All nine are taken below. Infra Claude's three inputs (Discord `1573297384920719491`) are taken in A4 and A6. All code reads are at `origin/migration/aws-supabase` = `02b5b666a`. Author: PM Claude.

## PREVIOUSLY STATED → NOW

| # | PREVIOUSLY STATED | NOW | REASON |
|---|---|---|---|
| 1 | The PM clone stays unmapped in `alert-split.mjs` and keeps the full alert list (`B_TOKEN_ECONOMY_PRE_AUDIT.md:7`). Before that: PM is mapped so it sees unrouted alerts in full and critical ones as one line (`B_PM_CLAUDE_PRE_AUDIT.md:47`). | **PM gets no per-prompt alert list.** It runs one quiet check on its hourly wake. | Kyle, KD-108(d). That decision supersedes both earlier lines. PM's role file obligation (`1-system-manual/PM_CLAUDE_RULES.md:15`, chase governance-overdue alerts) stays with the PM crew check (`pm-crew-check` step 6), which reads the queue directly; the hourly check covers critical and stale alerts (A7). |
| 2 | Langston's always-loaded set is 144,666 B, and OBJ-11 writes a ceiling. | **144,656 B measured, against an existing ceiling of 143,856 B. It is 800 B over today.** | Langston, correction 1: `langston-size-watch --status`. The harness index moved 10 B at 11:13Z. The ceiling exists (seeded 2026-09-05), so OBJ-11 lowers it rather than writing one. |
| 3 | "Closed-batch sections (about 8 KB)" are moved out by hand. | **Zero sections read `STATE: closed`. All 11 read `open`.** About 5.1 KB belongs to batches with a completion report at the ref whose STATE line was never flipped. | Langston, correction 2, re-derived in A1. The 03:50Z trim already moves a closed section verbatim and keeps its `keep:` lines. Flipping the STATE line is the method; a hand-move would lose the keep-line step and duplicate a built tool. |
| 4 | Kept lines 22,143 B; REVIEWER LEDGER 11,862 B. | **Kept lines 22,464 B; ledger 12,009 B.** Langston measured 22,463 and 12,008. | Byte-exact re-measure. The 1 B difference is whether the section's final newline is counted. The kept-lines heading appears twice (byte 3,048 is a quotation in the preamble); both of us measured the second one. |
| 5 | OBJ-13(b): "the session that most recently committed to the affected code." | **Not readable from git.** 1,929 commits in 14 days carry one author identity, and the trailer names the model, never the session. (b) becomes: the batch-id leading the commit subject, looked up against the register. | Infra Claude, input 1. The lane can reach git through the push-disabled mirror `/srv/dawntrader-backup.git` (input 2). |
| 6 | "A count of currently unowned due alerts goes to zero." | **No due alert lacks an owner. But 4 of 25 read as unrouted in every session**, because their owner changed within 24 h. | Measured with the real `splitAlerts` over today's due list (A5). An unowned count of zero does not discriminate; the churn count does. |
| 7 | Helper start load is 85,422–87,725 tokens (the last six helpers). | **Median 92,963 tokens, range 84,728–103,823, n = 64** Sonnet `general-purpose` helpers in this session. **A narrow-tool `Explore` helper on Sonnet starts at 32,661–32,692 (n = 3).** | The full population, not the last six (A3). The Explore figure is a positive control: a narrow definition does reach the low 30k range in this harness. |
| 8 | Coltrane 47.9k tokens per invoke, set beside Langston's 144,656 bytes. | **First model call: Langston 81,735 tokens (median, last 40 invokes), Coltrane 22,878 tokens (median, n = 57 rollouts since 11-12).** | Langston, fold-in 9: the old row compared two objects. Both now give the same object in the same unit (A9). |
| 9 | P3: ceiling ≤131,856 B, "12,000 below today's ceiling". | **No fixed figure.** The ceiling is set to the measured post-trim total, stated against the NET bytes after the flip. | Langston round 2: the 12,000 was PM's number, not Kyle's (KD-108 quotes "about 55 KB of 145 KB"). 5,141 B is gross: `keep:` lines hoist back. |
| 10 | P4 floor: ≤60,000 first-turn tokens, re-argued if MCP does not drop. | **A fork, registered here before P4 runs:** ≤60,000 if an explicit `tools:` list drops the MCP block; ≤78,815 if it does not, with the saving restated from ~33k to ~14k and taken to Kyle. | Langston round 2. An attribution test runs first (R2-3). |
| 11 | P6 source (a): `OPEN_BATCH_REGISTER.md`, read from the mirror at HEAD. | **A committed key table** (`comms-infra/discord/alert_owner_table.json`), with the register kept as the batch input. The mirror is read at `refs/heads/migration/aws-supabase`. A failed read escalates. | Langston round 2, blockers 1–2: the mirror's HEAD is an empty `master`; the register has no key column, and rule (a) alone reaches 8 of 25 due alerts. |
| 12 | P6 proof: churn falls to 0, interleaves below 3.6 a day. | **Per-alert correctness first:** every due alert's routed owner against the table owner, enumerated. Churn and the interleave rate become secondary legs. Plus a daily fallback count. | Langston round 2, blocker 3: a wrong but stable route reads churn 0. |
| 13 | No `DEPLOY_WINDOWS.jsonl` row. | **Kept, with Langston's substitute:** P6's 7-day read lists, per day, the staging deploy reflog, the due count and the installed lane sha. | Langston round 2 accepted the departure on that condition. |
| 14 | R2-5: "more than 2 fallback routings a day", population unnamed. | **Newly minted queue rows per UTC day (by `created_at`) that reach the fallback.** Before the round-3 fixes: mean 6.4 a day, over 2 on 13 of 14 days. After: **3 rows in 14 days (one job's failures on 11-11), mean 0.2, over 2 on 1 day.** | Langston round-2 ruling, R2-2 item 5: the due list read 0 while new rows read 8.6 a day on his count. Ours is the builder's own count over the same 14 days. |
| 15 | R2-7: if P4 lands above 60,000 the components go to Langston. | **P4 is not re-floored.** A miss goes to Kyle as a miss against KD-108(b)'s "about 86k", with the measured components. The proof measurement is taken in a session started after the edit lands. | Langston round-2 ruling, R2-7 conditions (a) and (b). |

## STEP-2 ROUND 2 — Langston's ruling folded in

Langston's verdict (Discord `1573307920056066049`, 2026-11-20 12:04Z) sent P6 back with three blockers and four conditions. He confirmed the four completion reports, the size figures and the A4 counts himself. Each point is taken below, and the plan rows are rewritten to match.

**R2-1 — The mirror's branch.** The push-disabled mirror's `HEAD` points at `master`, which has no commits. Every read names the branch: `git --git-dir=/srv/dawntrader-backup.git show refs/heads/migration/aws-supabase:1-system-manual/pm/OPEN_BATCH_REGISTER.md`. A read that fails or returns nothing **escalates** to Langston; it never falls back to the next rule.

**R2-2 — The key table (condition 1).** Built and committed: `comms-infra/discord/alert_owner_table.json`, from `scripts/pm/build-alert-owner-table.py`.
- **Seed:** Langston's own `[[ALERT … owner=]]` markers, 2026-11-06 to 2026-11-20 (14 days, the inbox log, `langston_outbound` only), joined to the staging alert keys. Each family's owner is his majority; a tie goes to his latest ruling. One override is written in, with its reason: venue-quiet goes to CC-C, because he corrected CC-B to CC-C today.
- **Shape:** 20 batches (governance keys name their batch), 37 key prefixes (the longest prefix wins), 4 title stems for keyless rows, then the CC-INFRA fallback for keys no rule knows. Two generic rules run first: a title that opens with a session alias (`CC-C: …`) goes to that session, and a `deploy-window-stale:<batch>` key goes through the batch table.
- **Owning batch:** each prefix row names its batch and ledger reference where one exists (for example `db-unencrypted-connection:` → B-DB-APP-TLS, CC-A until T-P3, from his ruling).
- **21 rows are flagged** for him to rule before the lane uses them: agreement below 80% or a tied vote. The large ones are `cron_stale:` (52%) and `cron_recovery:` (69%), both assigned to CC-C under B-CRON-MISSED-CATCHUP; a split by job name does not settle them (feed_integrity_cron alone is CC-C 29, CC-B 13, CC-INFRA 12). Also flagged: `deploy-drift-rung-` (76%), `venue-quiet-paper-` (71%, the override), `app-unplanned-restart:` (67%), `switch_on_shadow_evidence` (70%), and the two writer-permanent families (50%).
- **Against the register:** of the table's 20 batches, 13 have a register row, and all 13 owners agree. The other 7 have none (B-DB-SIZE-RELIEF, B-DISK-HEADROOM, B-PRICE-FEED-COVERAGE, B-TOKEN-WATCH-FOLLOWUP-MEMORY, B-GUARDRAIL-FAIL-CLOSED, B-TOKEN-WATCH-LIQ-SHED-HOTFIX, B-TRANSCRIPT-ARCHIVE). This is his blocker 2, measured. So the register stays an input, not the source.
- **Rule order in the lane:** the table first; then the register for a batch the table lacks; then (b), the batch-id leading the most recent commit subject, as a recency check only; then CC-INFRA. CC-INFRA receives only keys no rule matches.

**R2-3 — The per-alert proof (condition 2).**
- **Today's 25 due alerts, routed through the table: 25 of 25 match Langston's latest owner for that alert.** That includes c8f67c1c (CC-C), 0a4276cb and 13ee54de (CC-A) and c909cc94 (CC-C).
- **This check does not discriminate on its own**: the table was seeded from the same markers it is checked against. So a holdout ran. **Seeded only from markers before 2026-11-17, the table matches 22 of 25.** All three misses (0a4276cb, 13ee54de, c909cc94) went to the **fallback, not to a wrong session**: their families had no marker before 11-17. That is the failure mode condition 4 counts.
- **The P6 leg** repeats this enumeration on every day of the 7-day window. The lane's routed owner is checked against the table or ledger owner for every due alert. Each difference is listed, never netted.

**R2-4 — Escalation on a failed read (condition 3).** The lane escalates to Langston when the mirror read fails or the table cannot be parsed. Before P6 is installed, a seeded failure (the table path renamed) must produce an escalation, not a fallback routing.

**R2-5 — The daily fallback count (condition 4).** The lane's post states which rule set the owner. The daily read counts fallback routings. More than 2 in a day means the table is incomplete: it goes to Langston and the table gets a new row. It is never left to the fallback.

**R2-6 — When a register or table owner settles an interleave.** With R2-2 to R2-5 in place, Langston agreed that a table or register owner may settle an interleave. With neither, the alert still escalates to him.

**R2-7 — P4's fork, pre-registered (committed before P4 runs).**
- **First, an attribution test.** One throwaway agent definition, identical to `general-purpose.md` except for an explicit `tools: Read, Grep, Glob, Bash, Edit, Write`, and one helper start, measured with the A3 method.
- **(i) The MCP block drops** (the helper's tool list has no `mcp__` entries, and its first-turn tokens fall by roughly the MCP share): the floor is **≤60,000**.
- **(ii) It does not drop:** the floor is **≤78,815**. The expected saving is restated from about 33k to about 14k tokens per helper, and that restatement goes to Kyle, because KD-108(b) quoted "about 86k".
- The result of the attribution test is recorded under this paragraph before P4 changes `general-purpose.md`.

**R2-7 RESULT (2026-11-20, after the fork above was pushed at `98e053424`).**
- **Method change, stated:** a new agent definition is not loaded mid-session (`Agent type 'probe-narrow-tools' not found`, listing only the session-start set), and the headless CLI on this laptop is not signed in (`Not logged in`; signing it in is Kyle's call). So the throwaway definition could not start. The test used the one definition already loaded that carries an explicit `tools:` list, `Explore.md` (`tools: Glob, Grep, Read`), beside a default `general-purpose` helper. Both were given the same prompt in one turn and asked to list their tools and whether their context holds the CLAUDE.md heading text. First-turn tokens are taken by the A3 method (input plus cache creation plus cache read, first assistant record of each `subagents/agent-*.jsonl`).
- **general-purpose (Sonnet): 85,140 tokens.** It listed 52 tools, 41 of them `mcp__` (the docs connector, session, turn, Claude_Browser ×20, terminal, visualize), and it holds the CLAUDE.md text.
- **Explore (Haiku): 39,329 tokens.** It listed `Glob, Grep, Read` and **no `mcp__` tool**, and it does not hold the CLAUDE.md text.
- **Branch selected: (i). An explicit `tools:` list drops the MCP block.** The floor is **≤60,000**.
- **Limit, stated:** Explore also drops CLAUDE.md, which a `general-purpose` definition with a tool list will not. The estimate for P4 is therefore about 32.7k (Explore's Sonnet start, A3) plus about 21k for the instruction files (81.7 KB: project CLAUDE.md 77,744 B, user CLAUDE.md 3,475 B, memory index 457 B) plus Bash, Edit and Write. **That is close to 60,000, so the floor is not assured.** This estimate is a hypothesis; P4's measured start decides it. If P4 lands above 60,000, the measured figure and the remaining components go to Langston before anything else changes.

**R2-8 — P1–P3 corrections.**
- **(a) Net, not gross.** All four sections flip (FILTER-DIAG-STANDARDIZE, CODEX-FAILOVER, ARM-REMOVAL, DEPLOY-DRIFT-LINE). His `#675` hold on FILTER-DIAG lifts (`RUNNING_ISSUES:3809`, `#682`, plan row 93). The 5,141 B is gross: the `keep:` lines hoist back into the kept-lines section. The floor is stated against the net change measured after the flip.
- **(b) Class against instance.** The REVIEWER LEDGER split keeps the class rulings loaded and archives the instances. Two instance-bound rulings carry a class rule that is lifted into the class subsection before the move: DEPLOY-DRIFT-LINE's 404-counts-as-zero ruling, and FILTER-DIAG's own-ruling-stream ruling.
- **(c) No fixed target.** The ceiling becomes the measured post-trim total. If the trim falls short of what Kyle asked, the measured shortfall is reported and another one-in-one-out pass is taken. Load-bearing content is never cut to reach a number.
- **CLAUDE.md §5, the movable parts:** the mechanics of §5.1, §5.2 and §5.3. These stay loaded: the escalation criteria, the stateless boundary, and the two decommissioned-channel lines.
- **Start:** Infra Claude may begin P1–P3 now, with the net-byte correction. Nothing on P6 starts until this table and the amended proof are filed and Langston has ruled on them.

## STEP-2 ROUND 3 — Langston's round-2 ruling folded in

Langston's ruling (Discord `1573316684633350144`, 2026-11-20 12:38Z): R2-1, R2-3, R2-4 and R2-6 **PROCEED**; R2-2 and R2-5 **CHANGES-NEEDED**, five measured defects in the table's tail; the 21 flagged rows ruled (17 confirmed, 4 corrected) plus 3 unflagged rows corrected; R2-7 settled on branch (i) with two conditions; P1–P3 PROCEED. **P6 installs once the fixes below are filed; he checks them at Step 4, with no third design round.**

**R2-1 / R2-4 addition — what counts as a failed read.** The lane escalates on a non-zero exit, **or** empty stdout, **or** a parsed table with zero rows (`#449` degraded silently to `{}`). The seeded failure before install covers all three.

**R2-3 — install baseline.** Langston re-routed the 27 due alerts himself against the register and his own records, not the seed markers: **27 of 27 correct, 0 fallbacks.** That is the install baseline. The rebuilt table, run over the same 27: **27 route to a session, 0 to the fallback;** 25 match his latest marker in the seed extract, and the other 2 (551043f6 → CC-INFRA, b6f2a538 → CC-A) were ruled in the 12:38Z message itself, after the extract, and match it.

**R2-2 — the five defects, fixed in `scripts/pm/build-alert-owner-table.py`:**
1. **Colonless `gov-` keys.** `family()` splits a `gov-` key on `:` only when it has one; `gov-fetch-failed` and `gov-code-drift` fall to the prefix table, each with its own row (CC-INFRA, inferred, the governance checker's box). The builder now runs `family()` over every queue row (`rows_per`), so a crash on any live row fails the build.
2. **Build-time refusal.** The builder exits 2 and writes no table if any row's batch disagrees with that batch's owner, or one batch carries two owners across sections. The batch owner is the register, and, for a batch the register lacks, the sprint plan's owner column (200 single-owner batches parsed after C-5; the register wins where both exist; no register/plan conflict printed — a zero over the 33 batches the two documents share, not over all 200). **Positive control:** with the B-TRANSCRIPT-ARCHIVE correction removed, the build refuses with two contradictions (CC-A in the batches section against plan row 4b's Infra Claude, and two owners across sections), exit 2, no file written.
3. **A sample-size floor.** A row is flagged when agreement is under 80%, a real tie, **n ≤ 3 markers, or fewer than 1 marker per 20 queue rows.** Every row carries `n` and `rows` beside `agree`. 43 of 72 rows are now flagged (after the Step-4 riders below); `price-skip-paper-` (1 marker, 603 rows) is among them.
4. **Tie against plurality.** A tie is now the top two counts equal, at any number of owners; it goes to his latest ruling. A plurality without a tie is marked `plurality`. The two writer-permanent rows are pluralities (8/4/4, 6/3/2/1) and carry his corrected owners.
5. **The fallback population, named, and the five families seeded:** `xstock-equity-feed-stall` → CC-C; `disk-utilization-` (warning and critical) → CC-A, B-DB-SIZE-RELIEF; `server-disk-utilization-` → CC-INFRA; `book-state-hollow-` → CC-C, B-XSTOCK-BID-TRIGGER-RELAND; the `strong_bull_trend xStock` carrier, through a generic rule (`owner CC-x` anywhere in the title); `deploy-in-window:<BATCH>` beside `deploy-window-stale:`. Further rules taken to bring the new-row fallback down, each stated in the table's `_about.order`: a title that opens with a session's Discord name (`NEW Claude:`, `Infra Claude —`); a keyed row whose title opens with its batch-id; a batch the register or plan knows, named anywhere in the title; and five inferred rows — `langston-size-watch-`, `coltrane-size-watch-` and `langston-index-guard-` → CC-INFRA, `transcript-archive-deadman-` → CC-INFRA (plan row 4b), `no-trigger-paper-` → CC-C. **Result: 3 newly minted rows reached the fallback in 14 days, all `b75-snapshot:` retention failures on 11-11** (PREVIOUSLY/NOW row 14). They stay on the fallback until he rules; that family has no batch or marker.

**Owner corrections taken as ruled:** `ohlc-writer-permanent` → CC-C · `ticker-writer-permanent` → CC-A · `switch_on_shadow_evidence` → CC-B, batch attribution corrected to the `#592` retention-expiry review, inferred · `xstock-fill-safety-config-missing` → CC-C, inferred · `price-skip-paper-` → CC-C · `db-pool-acquire-timeout` and `db-pool-idle-in-tx` → CC-A · `book-state-ring-snapshot-failing` → CC-B and `deploy-notice-watcher-heartbeat` → CC-INFRA, both inferred. Each override row carries the ruling it came from. **One PM correction, for his Step-4 check:** the batches row `B-TRANSCRIPT-ARCHIVE` → CC-INFRA (1 marker said CC-A; plan row 4b names Infra Claude), caught by the refusal above.

**New inferred rows for his Step-4 check** (no marker; the owner confirms or bounces on day 1): `langston-size-watch-`, `coltrane-size-watch-`, `langston-index-guard-`, `transcript-archive-deadman-`, `no-trigger-paper-`, and `B-TRANSCRIPT-ARCHIVE` above.

**R2-6 — the limit at the read site, recorded.** `effective_owner` bites only at 3 or more owners (`alert_lane.py:280`); a clean one-way correction returns `ok=True` with the old owner as `superseded`. The corrections above do not trip it unless an old owner is written back.

**Step-4 riders (Langston, Discord `1573321813814157454`, 2026-11-20: PROCEED on the P6 install with C-1 and C-2 in the install commit), landed in the builder:**
- **C-1, input completeness.** One live key ends in a carriage return, and text-mode reading split that line and dropped the row silently (3,502 of 3,503 rows reached `family()`). The queue is now split on line feeds only, and the build refuses (exit 2, no table) when input lines and parsed rows differ. `xstock-bar-availability-` now counts 22 rows, not 21. Positive control: one extra tab injected into a copy of the queue gives `3503 lines but 3502 parsed rows`, exit 2, no file.
- **C-2, only the four building sessions own a family.** Markers naming anyone else are dropped from the seed votes and counted in `_about.seed_votes_dropped_by_owner` (16, all naming Kyle). The refusal also rejects any row whose owner is not CC-A, CC-B, CC-C or CC-INFRA. Positive control: an override seating Kyle on `price-skip-paper-` refuses, exit 2, no file. Consequence: `disk-utilization-` reads 16 of 17 CC-A (one CC-B), agreement 0.94, so it is unflagged because it clears the 0.80 bar, not because the votes are unanimous.
- **C-3.** A plan batch with two owners is printed, not dropped silently, and left out of the cross-check. At the ref there is exactly one: `B-ALERT-LANE-LEDGER-OWNER` (Infra Claude in the phase-0 table row, CC-B in the CC-B section table). No table row carries that batch.
- **C-4.** `_about.order` now names every step, including a keyed row whose title opens with its batch-id.
- **Added:** `crypto-spot-shard0-data-dead` → CC-A, inferred, on his ruling (his marker is not in the seed extract). 72 rows, 43 flagged; due list 27 of 27 to a session, 0 fallback; new-row fallback unchanged at 3 in 14 days.
- **C-5, Langston's second Step-4 check (2026-11-20, Discord 1573325076240277506).** (a) The plan parse reads both cells beside a batch (the owner sits after it in some tables and before it in the session-section tables) and counts a cell only when the whole cell is an owner name, never a name found inside prose. It examines every cell of a row, the last included. 200 single-owner batches parse; the register has 39; they share 33, with no disagreement over those 33. All three numbers are written into `_about`. The stricter match drops exactly two prose-like owner cells (B-SHADOW-HOLD-CLOCK, B-XSTOCK-WEEKEND-POSTURE), confirmed complete by Langston's own scan. (b) The refusal's reach is now measured and written into `_about.refusal_reach_measured`: on this extract, 47 families / 618 queue rows are cross-checked against the register or plan, 3 / 8 carry a batch neither document lists, and 22 / 2,226 carry no batch — about 78% of the covered rows, though by families the cross-check reaches 47 of 72; three families (`no-trigger-vts-` 1,140, `price-skip-paper-` 603, `xstock-stale-fill-block` 308) are 92% of the unchecked rows. For those an exit 0 means only that the seed markers and PM overrides agree with themselves. The table's 72 rows are byte-identical in owner, votes and flags to `dd7568b49`.

**R2-7 — conditions taken.** (a) P4's proof measurement is taken in a session started after the edit lands, never this one. (b) A start above 60,000 is not re-floored: the measured components go to Kyle as a miss against KD-108(b)'s "about 86k" (PREVIOUSLY/NOW row 15).

## AUDIT

### A1 — Langston's always-loaded notes (OBJ-11)
**Object:** the files `langston-size-watch` sums. These are `/home/langston/CLAUDE.md` (57,049 B), `/home/langston/MEMORY.md` (73,856 B), and the harness index `/home/langston/.claude/projects/-home-langston/memory/MEMORY.md` (13,751 B, 100 lines). Total 144,656 B; ceiling 143,856 B.

**MEMORY.md, section bytes (byte-exact):**
- Kept lines from closed batches: 22,464.
- REVIEWER LEDGER: 12,009.
- STANDING NOTES: 7,941.
- GOVERNANCE-INTEGRITY: 5,084.
- CURRENT STATE: 4,144.
- DELIVERY BOARD: 1,894.
- 11 sections read `STATE: open`, about 13.1 KB together.

**STATE-line census against the ref:**

| section | bytes | report at ref | flip? |
|---|---|---|---|
| B-FILTER-DIAG-STANDARDIZE | 2,301 | `B_FILTER_DIAG_STANDARDIZE_COMPLETION_REPORT.md` | candidate |
| B-CODEX-FAILOVER | 243 | `B_CODEX_FAILOVER_COMPLETION_REPORT.md` | candidate |
| B-ARM-REMOVAL | 459 | `B_ARM_REMOVAL_COMPLETION_REPORT.md` | candidate |
| B-DEPLOY-DRIFT-LINE | 2,138 | `B_DEPLOY_DRIFT_LINE_COMPLETION_REPORT.md` (prose says "✅ CLOSED 2026-09-09") | candidate |
| B-MEASURE-GATE | 925 | leg 2 only (`B_MEASURE_GATE_LEG2_COMPLETION_REPORT.md`); legs 3+ parked after live (register :35) | **no**: leg 3 is open |
| B-SILENT-STRATEGY-CENSUS | 3,723 | progress report only; Step 10 watch window (register :48) | no |
| B-CREDENTIALS-PRIVATE-REPO | 531 | progress report only; in flight (plan :97) | no |
| B-PRICE-SIDE-BY-JOB | 795 | progress reports only | no |
| B-XSTOCK-BID-TRIGGER-RELAND | 416 | progress report only | no |
| P19-B8.5l / B-ATR-SOURCE-FIX | 827 | none found under either name | no |
| #618 | 715 | an issue, not a batch | no |

The four candidates total 5,141 B. Each is flipped only after Langston confirms the close in his own file. It is his file, and the report's existence is the lead, not the verdict.

**CLAUDE.md, the large sections:**
- governed-artifact read: 7,970.
- §2 personality: 4,492.
- block-thin-scopes: 4,075.
- §13 surfaced-issue rule: 3,309.
- §10.5 alert check: 3,123.
- §8 critical rules: 2,876.
- **§5 comms protocol: 2,720.**

Langston's fold-in 4: §10.5 and §13 are verbs, not mirrors. They stay; replacing them with a hook is `#623` leg 3, which waits until leg 2's hooks are proven (`RUNNING_ISSUES:2613`). **§5 is the only CLAUDE.md candidate.**

**Who owns the CLAUDE.md headroom:** Langston's fold-in names `B-LANGSTON-CLAUDEMD-RESIDUAL` as its owner. That batch is **CLOSED 2026-11-14** (`SPRINT_TO_LIVE_PLAN.md:86`). No batch owns the CLAUDE.md headroom now, so OBJ-11 carries the §5 move. This is disposition 1, folded into the work in hand under KD-108, which covers "Langston's always-loaded notes".

**Write path:** MEMORY.md is root-owned since `B-LANGSTON-MEMORY-WRITE-FENCE`. Every edit goes through `/usr/local/bin/langston-memory-write` with `--expect-sha` on the part, and never with `--allow-growth`. A shrinking write always passes the gate. The daily `langston-memory-trim.timer` (03:50Z) runs `--trim`, which moves sections whose STATE is closed to `MEMORY-ARCHIVE.md` and hoists their `keep:` lines (`SYSTEM_IMPACT_MAP.md:4118`, `LANGSTON_ARCHITECTURE.md:69`). The archive `/home/langston/.memory-archive` exists and is not counted in the total.

**Tokens:** Langston's first model call is a median 81,735 input tokens (range 81,154–83,831, last 40 transcripts). The summed input and output across each invoke's turns has a median of 4,325,330, because every turn re-reads the context. A trimmed KB is therefore saved on every turn of every invoke.

**Proof gap (fold-in 3):** "one real review passes with no missing-rule refusal" cannot see a loss, because a review that exercises none of the moved rules is silent. The proof must list each moved rule and name, per rule, the review or seeded case that exercised it after the move.

### A2 — Coltrane's per-invoke load (OBJ-11 for Coltrane, OBJ-15)
**Coltrane's files:** `/home/coltrane/.codex/AGENTS.md` 14,437 B. Config: `gpt-5.6-sol`, high effort. His notes (`/home/coltrane/memory`, 71,496 B) are read on demand through `coltrane-memory recall`, not always loaded.

**First model call:** median 22,878 input tokens, range 19,483–25,835, over 57 rollouts since 11-12. Source: `token_count` events in `/home/coltrane/.codex/sessions/**`, `last_token_usage.input_tokens` on the first event. The whole-invoke cumulative input has a median of 648,131.

The trim rule applies to his AGENTS.md exactly as to Langston's set: measure, move closed material out verbatim, set a ceiling with one-in-one-out. **Coltrane has no size watch and no ceiling today.** That gap is the Codex leg of OBJ-11.

### A3 — Helper start load (OBJ-12)
**Object:** cache-read plus cache-creation plus input tokens on the first assistant record of each helper transcript under `~/.claude/projects/C--DawnTraderV3-pm/994e6488-…/subagents/*.jsonl`. Each transcript is joined to its `.meta.json` to get the helper type.

| helper type | model | n | min | median | max |
|---|---|---|---|---|---|
| general-purpose (inherits every tool) | sonnet | 64 | 84,728 | 92,963 | 103,823 |
| general-purpose | opus / haiku | 3 / 2 | 102,398 / 102,400 | — | 102,488 / 102,491 |
| claude-code-guide (5 tools) | sonnet | 4 | 78,418 | 78,767 | 78,815 |
| **Explore (Glob, Grep, Read)** | **sonnet** | **3** | **32,661** | **32,692** | **32,692** |

**`.claude/agents/general-purpose.md`** (1,437 B) pins `model: sonnet` and has no `tools:` line. It therefore inherits every tool, including the MCP set.

The Explore row shows a narrow definition can start at about 33k. **What I cannot attribute:** how much of the roughly 60k gap is tool descriptions and how much is other context the custom Explore definition does not load. The 5-tool guide helper still starts at 78k, so tool count alone does not explain the gap. The Step-3 measurement on the new definition settles the attribution; it is not assumed here.

**Reachability:** whether a `tools:` list also excludes MCP tools is the harness's own behaviour, not code I can read. It is measured at Step 3, not asserted.

**Langston's RULED-ON-REPORTED-FACT objection:** the baseline sits in PM-side transcripts he cannot read. Infra Claude runs on this laptop and can read them, so the baseline and the post-change figure are re-derived by Infra Claude with the method above (P4). The figures here are the author's.

### A4 — The alert lane (OBJ-13)
**`comms-infra/discord/alert_lane.py`** (pure logic; installed at `/opt/discord-bridges/alert_lane.py`, sha prefix `37c0e4143b0f`):
- It runs on `claude-sonnet-5-5` (`LANE_MODEL`, :21).
- `OWNERS = ("CC-A","CC-B","CC-C","CC-INFRA","Kyle")` (:25). A marker naming anyone else is dropped (:256, :430).
- The lane cannot read files: every tool is denied. The bridge passes in the live rows, plus a precedent line that `langston_precedent()` builds from Langston's own markers over 7 days.
- `effective_owner` (:276–288) takes the newest owner on a clean change. On an interleave it returns `ok=False`, and the precedent line then says to escalate to Langston.
- `read_answer` (:417) escalates any marker whose owner is unknown.

**Call sites** (`discord-langston-bridge.py`):
- `alert_id_of` (:1227), `alert_key` (:1235), `langston_precedent` (:1238), `build_prompt` → `invoke_lane` (:1247);
- `read_answer` (:1252), `apply_precedent` (:1253), `enforce_live_rows` (:1254);
- then the post "Alert lane — …" (:1259).

**What it does today:** bridge log `/var/log/discord-langston-bridge.log`, current file, 2026-11-15T00:00Z to 2026-11-20T11:40Z (5.5 days). Across 76 lane invokes, the per-batch summary lines ("batch of N - routed N, escalated N") sum to **107 routed and 33 escalated**. The per-escalation lines ("escalated msg … to Langston (reason)") number 34. One escalation has no matching batch summary; that is recorded, not reconciled. Reasons, from the per-escalation lines:

| reason | count |
|---|---|
| Langston has gone back and forth (interleave) | 20 |
| critical | 10 |
| addressed to Kyle | 2 |
| unreadable id | 1 |
| long-open | 1 |

**Baseline rate for P6(iv): 20 interleave escalations in 5.5 days, about 3.6 a day.** Langston was invoked 248 times over 11-15, 11-16, 11-19 and 11-20.

**Interleave example (Langston, live today):** `xstock-stale-fill-block` has 71 consecutive CC-C markers, poisoned by one stray CC-B marker at 11-05T08:12:05Z.

**Join blind spot (Langston, re-derived at :263):** a marker becomes precedent only through a join to a `langston_alert_inbound` row. Markers on alerts Langston found through his §10.5 queue read never count: 247 of his 838 valid 7-day markers. The join fix is a proposal on Kyle's list (owner CC-INFRA), **not placed**. OBJ-13 states it as a known limit.

**Overlaps, ledger search (§9.5(b-ii)):**
- **`#1201` B-ALERT-LANE-LEDGER-OWNER** (Infra Claude): the lane reads an alert's owner from the plan, not from past markers, together with an alert-id-first fix. Kyle moved it to the after-live list on 2026-11-06 (KD-51; `PRE_LIVE_SPRINT.md:92`). The lane's own comments name it as the authoritative owner-from-plan job. **OBJ-13(a) is that job's owner-from-plan half.** KD-108 asks for it now. The alert-id-first half is not part of KD-108 and stays on the after-live list.
- **`#1137` B-ALERT-OWNER-ON-ROW** (CC-A, `SPRINT_TO_LIVE_PLAN.md` row 1l, QUEUED): the owner moves onto the alert row's own `metadata.owner`, used on 8 of 1,130 rows when filed. That changes where the owner is **stored**; OBJ-13 changes how it is **decided**. The two fit together: when row 1l lands, the lane writes its decision there as well. OBJ-13 does not touch the store.
- **`#647` / 2.4b B-ALERT-QUEUE-INTEGRITY** (CC-B, after live): queue locking. Not touched.

**Fallback owner (fold-in 5):** it must be one of the lane's five names, and it must also be in the wake filter's `ALERT_OWNERS` (`cc-wake-filter.py:192`, six names including Langston). **CC-INFRA** is in both. It owns the alert machinery and the servers, and an alert no rule can place is a routing gap that is Infra's to close. This is a correction to the amendment text: OBJ-13(c) names CC-INFRA.

**How the lane reaches the register:** `git --git-dir=/srv/dawntrader-backup.git show HEAD:1-system-manual/pm/OPEN_BATCH_REGISTER.md`. The mirror is readable by the langston account and self-pulls every 15 minutes. The lane itself stays tool-less: the **bridge** reads the register and the recent subjects and passes them in, as it already passes the live rows.

**Provenance:** built in B-LANGSTON-RELIEF OBJ-2 (Kyle 2026-10-08; 8 commits, all that batch's). Escalating on an interleave was deliberate: when Langston himself has changed his mind, the lane does not pick a side. **OBJ-13 changes that intent for one case:** when the register or the recent work names exactly one owner, that owner settles the interleave. When neither does, it still goes to Langston. This is Langston's call at review; it is a change to his own lane's rule.

### A5 — The per-session alert split (OBJ-13 proof, OBJ-14)
**`.claude/hooks/alert-split.mjs`:** a pure module (no state).
- `CLONE_TO_ALIAS` has four entries (:19–23: old, new, analyst, infra). The PM clone is unmapped.
- `splitAlerts` sorts due alerts into mine, unrouted, critical-elsewhere (one line each) and others (a count).
- An owner changed within `CHURN_HOURS = 24` reads as unrouted. That was by design (B-TOKEN-BURN-CUT amendment 1, round 3), and `#1137` records the cost.

**Measured today with the real function** (due list read with the hook's own remote filter, positive control `COUNT|25|3501`. The 25 is the filter's own total over the whole 3,501-id file, not the hook's display cap: the hook prints "+N more NOT shown" when the total passes `MAX_INJECT` (:202), and it printed none; owner records `~/.claude/cc-wake-state/<ALIAS>.alert-owners.json`):

| session | mine | unrouted (all churn) | critical | not shown |
|---|---|---|---|---|
| CC-A | 6 | 4 | 0 | 15 |
| CC-B | 3 | 4 | 0 | 18 |
| CC-C | 8 | 4 | 0 | 13 |
| CC-INFRA | 4 | 4 | 0 | 17 |

The four churning alerts:
- `c8f67c1c` xStock venue quiet: now CC-C, 3 changes. Langston's verdict listed this class under CC-B, which is the churn in action.
- `0a4276cb` and `13ee54de` database connection without encryption: CC-A, 7 and 9 changes.
- `8bd256bc` open-batch alert for B-XSTOCK-BAR-AVAILABILITY: CC-C, 1 change.

**This is the discriminating proof for OBJ-13:** the churn count, today 4, falls to 0 and stays there across a week while owner changes are still happening (P6(iii)), and the interleave escalations, 3.6 a day in the current log, fall.

### A6 — The per-prompt alert hook (OBJ-14)
**`.claude/hooks/inject-due-alerts.mjs`:**
- Registered as a UserPromptSubmit hook in each clone's untracked `.claude/settings.local.json`.
- It SSHes to staging with a fixed filter (:78–103, positive-control COUNT line), reads the alias at :136 from the clone's folder name, and reads the owner record and the lost-routing record (:141, :158).
- It appends a shadow row to `~/.claude/inject-due-alerts.jsonl` (:41–60).
- It caps output at `MAX_INJECT = 25`.
- **Fail-open:** an unmapped clone or an unreadable record shows the full list. For PM today, that means all 25 alerts on every prompt.

**Provenance:** B-MEASURE-GATE leg 2 (the §10.5 read as a hook, 2026-09-02), then B-GOV-REPORTING, B-TOKEN-BURN-CUT, B-WAKE-OWNER-LOSS-VISIBLE, and B-TOKEN-ECONOMY's own OBJ-6 shadow (`ea9c7c1dc`).

**The PM role it served:** `B_PM_CLAUDE_PRE_AUDIT.md:47` intended PM to see unrouted alerts in full and critical ones as one line, "the right view for a PM that owns no alerts". Kyle's KD-108(d) replaces that view with a follow-up role.

**Copy of the clone map:** `.claude/hooks/guard-pm-slot.mjs:22` keeps a separate `CLONES` map and already holds `'DawnTraderV3-pm': 'PM'`. It is a different consumer and is not changed.

### A7 — PM's follow-up role (OBJ-14)
Kyle's words, KD-108(d): PM checks alerts quietly on its hourly wake and speaks only for urgent follow-up. First it checks whether the owner received the alert, then whether the owner is acting.

**What exists:**
- the hourly guard cron `b1514f3e` (:17, usage line, KD-106);
- the per-alias owner records (who an alert was routed to);
- Langston's and the lane's markers in `/var/log/cc-discord-inbox.jsonl`;
- the ack state on the staging row.

**Received** = the owner's own record holds the id, meaning the owner's wake filter saw the routing. **Acting** = an ack or resolve on the row, or a post or commit by the owner that cites the id prefix, within the last 24 h.

**Which alerts qualify for follow-up:**
- every critical alert;
- any alert due for more than 24 h with no recorded action, unless its latest marker says it waits on an event ("never ack", "held to … window").

The governance open-batch classes (`gov-openmaxage`, `gov-staleopen`) are carried by their batch rows and stay with the PM crew check (`pm-crew-check` step 6), not the hourly follow-up. That is where `PM_CLAUDE_RULES.md:15`'s obligation lands.

**Repeat limit:** one follow-up per alert per 24 h, recorded in `1-system-manual/pm/SESSION_LOG.md`.

### A8 — Codex side (OBJ-15, and the Codex legs of OBJ-12, -13 and -14)
- **Building sessions:** `AGENTS.md:49`. "Alerts reach nobody automatically": each Codex session reads the whole queue with `scripts/due-alerts.py` and takes its Claude counterpart's alerts (CC-A → OLD Codex …). There is no owner filter, so a Codex session reads all 25, the same waste OBJ-6 removed on the Claude side. "Coltrane sorts unrouted alerts during the shift": on the Codex crew, Coltrane does the alert lane's job.
- **Compaction cap and helper roles:** `~/.codex/config.toml` has `gpt-5.6-sol`, high effort, no `[agents]` section and no `model_auto_compact_token_limit`, and the repo has no `.codex/`. These are parent items P3 and P4, waiting for the next Codex session.
- **PM Codex:** reads the queue the same way and is not yet told to follow the hourly follow-up form.
- **Codex has no hooks**, so every Codex control is an instruction plus a script the session runs. Its proof is an observed run in a Codex session, never the instruction text alone (OBJ-15's own proof rule).

### A9 — The parity table's objects (OBJ-15, fold-in 9)
Every cell states its object and its unit. The reviewer row compares the first model call's input tokens: Langston 81,735 against Coltrane 22,878. It does not compare Langston's file bytes with Coltrane's whole invoke.

### A10 — Change-class, governance, observation window
**Class: `non_architecture`, kept.** OBJ-13 adds an input and a tiebreak to the alert lane's routing decision. OBJ-14 replaces one consumer's per-prompt view with an hourly check. Both are crew tooling. No trading-engine path, formula, threshold or routing of signals is touched.

**Docset consequence** (`closeout.mjs --class non_architecture`):
- **Required:** scope, pre-audit, completion report, `BATCH_CATALOG.md`, `PHASE_HISTORY.md`, the plan row, the memory files.
- **`SYSTEM_IMPACT_MAP.md` is required regardless** (Langston §17). It needs the lane's new inputs and tiebreak (:3119), the PM consumer change and the hourly follow-up script beside the hook (:3195), the owner record's new reader (:4015), the Codex alert CLI, and the helper definition in the Loading Estate (:1128).
- **Also:** `LANGSTON_ARCHITECTURE.md`, `ALERT_HANDLING_PROTOCOL.md`, `PM_CLAUDE_RULES.md`, `AGENTS.md`, Coltrane's AGENTS.md, `RUNNING_ISSUES.md` (cross-refs on #1137 and #1201) and `CHANGES_AND_FIXES.md`.
- **N/A:** `SYSTEM_MANUAL.md` (no trading architecture), `ADJUSTMENT_FRAMEWORK.md`, `DELETED_COMPONENTS_LOG.md` (nothing removed).
- If the class moves, it is re-declared before close, never at close (`#1245`).

**Observation window: no `DEPLOY_WINDOWS.jsonl` row is filed.** None of the four legs reads anything a staging deploy can disturb: OBJ-11 runs on Langston's box, OBJ-12 is a laptop transcript read, OBJ-13's seeded alert is a row a restart does not touch, and OBJ-14 is a laptop script. An `open` row would make `dt-deploy` refuse every other session's deploy for nothing. **R2-9:** Langston accepted this on one condition, taken: P6's 7-day read lists, per day, the staging deploy reflog, the due count and the installed lane sha, so a deploy that coincides with a change in the routing is visible.

### Blind-spot lines (the eight classes the audit aids cannot see)
1. **Two value lists agreeing — APPLIES.** The owner sets are `alert_lane.py:25` (5 names), `cc-wake-filter.py:192` (6, adds Langston) and `alert-split.mjs:19–23` (4 clones). `obs-windows.py` OWNERS is the actor namespace, a different object. Compared by hand: the CC-INFRA fallback is in both owner sets. **CC-PM must not enter either owner set** (PM owns no alerts). Mapping the PM clone is done in the hook, not in the owner sets.
2. **Literal copies of a list — APPLIES.** `guard-pm-slot.mjs:22` copies the clone map and already carries PM; it is not changed. The Codex→Claude map in `AGENTS.md:49` is a prose copy, and the new Codex CLI (P9) carries the same four pairs.
3. **Properties and fields — APPLIES, read only.** The marker fields `owner=` and `action=`, and the row's `metadata.owner` (`#1137`), are not written by this batch.
4. **Sibling producers of one label — APPLIES.** `[[ALERT … owner=]]` has two producers: Langston's own replies and the lane's posts. That is the interleave source. The tiebreak in P6 reads both.
5. **What a site means — APPLIES.** "Unrouted" in `splitAlerts` includes churned owners. "No owner" is a different count (0 today). OBJ-13's proof uses the churn count.
6. **Error paths — APPLIES.** The hook is fail-open: no alias shows the full list. PM's branch (P7) shows no list by design, so a failed hourly check must say it failed. The follow-up script carries the same COUNT positive control.
7. **A library's own behaviour — APPLIES.** Whether a subagent `tools:` list removes MCP tools is measured at Step 3 (P4), not assumed.
8. **Files outside the TypeScript programs — APPLIES to all four components.** The hooks are `.mjs`, the lane is Python, and the agent definition is markdown. The census aid does not see `scripts/`, hooks or Python and does not say so. The census below is by hand with `git grep` at the ref.

### Census (write · read · mutate · delete · start), by hand at the ref
- **`alert_lane.py`:**
  - Runtime importer: `discord-langston-bridge.py:1117` (exactly one).
  - Installed by `deploy.sh:70`. `langston-bridge-restart:156` imports its `inbox_evidence`.
  - Tests: `alert_lane_test.py`, `alert_lane_tool_probe.py`, `test_langston_bridge_restart.py`, `test_address_gates.py`.
  - State it writes: the spool (`spool_write` / `spool_remove`, bridge :542, :552, :847, :1172, :1200–1203, :1267–1269), plus markers in its Discord posts.
  - Started by the bridge's alert path only.
- **`alert-split.mjs`:** no state. Importers: `inject-due-alerts.mjs:33` and `scripts/analysis/test-alert-split.mjs:4` (CI `ci.yml:270`). Copy: `guard-pm-slot.mjs:22`. No mutator, no deleter.
- **Owner record `<ALIAS>.alert-owners.json`:**
  - Writer: exactly one in normal running, `cc-wake-filter.py:784`. There was also a one-time seed in `B_TOKEN_BURN_CUT_AMENDMENT_1_SWITCH.py`.
  - Reader today: `inject-due-alerts.mjs:141`; the new PM follow-up script becomes a second reader.
  - Deleter: none (`cc-wake-filter.py:826`).
- **`inject-due-alerts.mjs`:** started per prompt by `settings.local.json` in each clone. Writes `~/.claude/inject-due-alerts.jsonl`. Reads staging, the owner record and the lost-routing record.
- **`general-purpose.md`:** read by the harness only. Its sibling is `Explore.md`, which is not changed.

### Six sources read
1. **Code at the ref:** the four components plus the bridge call sites, the wake filter and the guard.
2. **Runtime:** the bridge log, the inbox log, the staging alerts file via the hook's filter, the transcripts, and Coltrane's rollouts.
3. **System Impact Map:** :1128, :3119, :3195, :4015–4016, :4118.
4. **System Manual:** silent on crew tooling by scope. That is not a gap: its scope is trading architecture (CLAUDE.md §9 rule 4).
5. **Ledger and reports:** `#1137`, `#1201`, `#647`, `#623`, KD-51, KD-108, the register, and the four completion reports in A1. `history.mjs` ran on all four components; its "not covered" line is that batch-ids appearing only in commit bodies, and issues citing a component by prose name, are missed. `#1201` was found by prose search, not by the aid.
6. **`bridge/canonical/`:** consulted; **no coverage** of the alert lane, alert owners or helper definitions. The machinery postdates it.

Dispositions for the existing components: all four are working as designed, with the intent changed by KD-108. That is disposition 1, folded into this batch, for `alert_lane.py`, `alert-split.mjs`, `inject-due-alerts.mjs` and `general-purpose.md`.

## IMPLEMENTATION PLAN

| # | change | owner | back-ref | proof |
|---|---|---|---|---|
| P1 | Flip the STATE line to closed for the four sections in A1, all four confirmed by Langston (R2-8), and prefix their forward-binding lines with `keep:`. The 03:50Z trim then moves them and hoists the keeps. Via `langston-memory-write --expect-sha`, no `--allow-growth`. | Infra Claude + Langston | A1 | The next trim log names each section; each section's text is found in `MEMORY-ARCHIVE.md`. The net change in always-loaded bytes after the hoist is measured and stated (R2-8a). |
| P2 | Split the REVIEWER LEDGER into class rulings, which stay loaded, and instances, which move verbatim to the archive; first lift the two class rules named in R2-8b into the class subsection. Move the mechanics of CLAUDE.md §5.1–§5.3 verbatim to an on-demand file and leave a pointer; the escalation criteria, the stateless boundary and the two decommissioned-channel lines stay. §10.5 and §13 stay (A1, `#623` leg 3). | Infra Claude + Langston | A1 | `scripts/crew-tooling/move-ledger-check.mjs` finds every moved passage at its destination. A per-rule exercise list names, for each moved rule, the review or seeded case that used it after the move. |
| P3 | **Lower the ceiling to the measured post-trim total** (R2-8c), stated against the net bytes after P1's hoist. No fixed target: if P1 + P2 fall short of what Kyle asked for, the measured shortfall goes to Langston and Kyle and another one-in-one-out pass is taken; load-bearing content is never cut to reach a number. Add one-in-one-out beside the ceiling in the CONDUCT form. Coltrane gets the same: a size reading of his AGENTS.md, a ceiling, and the closed-material move. | Infra Claude | A1, A2, R2-8 | `langston-size-watch --status` shows the new total under the new ceiling, with the net change stated. Coltrane's equivalent reading is committed. |
| P4 | After the attribution test in R2-7: give `general-purpose.md` an explicit tool list: Read, Grep, Glob, Bash, Edit, Write. Rewrite CLAUDE.md's delegation line: a helper is for a big, self-contained read with a short answer, never a small lookup. | PM | A3, R2-7 | **The floor is the one R2-7 selects, registered before P4 runs: ≤60,000 first-turn tokens if the MCP block drops, ≤78,815 if it does not** (then the saving is restated to Kyle). Re-derived by Infra Claude with the A3 method against the n = 64 baseline. The served model is still Sonnet. |
| P5 | Codex leg of OBJ-12: each `[agents]` role carries minimal instructions and tools. This lands with parent P4 in the next Codex session. | the next Codex session | A8 | An observed role run in a Codex session, with its start tokens. |
| P6 | Alert lane: the bridge reads `alert_owner_table.json` and the register from the mirror at `refs/heads/migration/aws-supabase` (R2-1), and passes each alert's matched rule to the lane. Order: the table (batch, then longest key prefix, then title); the register for a batch the table lacks; (b), the batch-id leading the most recent commit subject, as a recency check; then **CC-INFRA**, for keys no rule matches. A failed read or an unparseable table escalates (R2-4). A table or register owner settles an interleave; with neither it still escalates (R2-6). The 21 flagged rows are ruled by Langston before install. Owner set unchanged. | Infra Claude | A4, A5, R2-2 | **(i) Per-alert correctness, the primary leg (R2-3):** every day for 7 days, every due alert's routed owner is enumerated against the table or ledger owner; each difference is listed, never netted. (ii) A seeded alert naming a table batch gets that owner and shows in that session only, and the lane's post states the rule that set it. A second seeded alert with an unknown key gets CC-INFRA with the rule stated as fallback. A seeded failed read escalates (R2-4). All survive `effective_owner` with `ok=True`. (iii) The daily fallback count stays at 2 or fewer (R2-5). (iv) Secondary: churn reads 0 on days with owner changes, and interleave escalations fall below 3.6 a day (A4). (v) Each day's read also lists the staging deploy reflog, the due count and the installed lane sha (R2-9). The join blind spot is stated as a limit. |
| P7 | The PM clone gets no per-prompt list: `inject-due-alerts.mjs` returns one line for the PM folder, saying alerts are checked hourly, and skips the SSH. The owner sets are unchanged. | PM | A5, A6 | PM prompts carry the one line and no list; the hook's shadow row shows zero alerts shown for PM. |
| P8 | New `scripts/pm/alert-followup.mjs`, run by the hourly guard cron. It reads the due list with the COUNT control, the owner records, the markers and the ack state, and applies A7's rule and repeat limit. It prints nothing when nothing qualifies, and one line per follow-up otherwise. PM then messages the owner: received first, acting second. Rows go to `SESSION_LOG.md`. `1-system-manual/PM_CLAUDE_RULES.md` gets a line for the hourly follow-up; its :15 governance-overdue chase stays with the crew check. | PM | A7 | A seeded stale alert produces exactly one follow-up to its owner, and none in the next hour. A run with nothing due prints its COUNT line and nothing else. |
| P9 | Codex alert parity. New `scripts/crew-tooling/my-alerts.mjs --alias <CODEX-X>`. It maps to the Claude counterpart, reads the due list from staging and the markers from the inbox, and calls the same `splitAlerts`. `AGENTS.md:49` tells Codex sessions to run it instead of the full read, and tells PM Codex to run P8's script on its hourly automation. Coltrane's AGENTS.md gets P6's order: register, then recent work, then CC-INFRA's Codex counterpart. | PM (repo) + Infra Claude (Coltrane) | A8 | An observed run in a Codex session shows the narrowed list, and an observed Coltrane routing uses the register. |
| P10 | The parity table at the ref, every cell carrying its object and unit, with an observed control for each Codex or Coltrane row. | PM | A9 | The table is filled; no row carries documentation as its proof. |
| P11 | Governance as A10 lists, plus cross-ref lines on `#1137` and `#1201`. The `#1201` row on the after-live list is amended to its id-first half. | PM | A10, A4 | Step 10. |

**Order:** the R2-7 attribution test, then P4. P1–P3 may start now (R2-8). P6 waits for Langston's ruling on the table and its 21 flagged rows. Then P7–P8. P9 and P10 fill in as each leg lands, and the Codex rows close when a Codex session runs. The parent's OBJ-6 still leads P6 and P7, as the amendment's order says.

**Nothing in the plan is UNAUDITED.**

## Plain-language summary
The audit found Kyle's main worry, alerts going to every session, is mostly solved already: every due alert has an owner, and each session sees about a quarter of the list. The real leaks are smaller and specific: four alerts whose owner keeps flipping (so everyone sees them), the PM seeing all 25 every time, Langston being asked to break ties the plan could settle, and helpers loading far more tools than they use. The plan fixes each one, gives the Codex and Coltrane side the same treatment, and checks every fix against a measured before-and-after. After Langston's second review, alert owners come from a written table built from his own past routing, checked alert by alert, instead of from the batch list, which turned out to be too old and too thin to route alerts on its own.

---
REVIEWER: fresh-reader pass, one Sonnet helper, 2026-11-20, against `origin/migration/aws-supabase` @ `8799b2df9`. It checked 14 code and plan claims: 13 confirmed, and one path corrected (`1-system-manual/PM_CLAUDE_RULES.md`). It raised five issues, all taken: the row-1 contradiction with A7; the escalation sum (re-derived: 107 routed, 33 escalated, 34 escalation lines); the churn proof passing on a quiet day (P6(iii) now needs owner changes in the period); the seeded-alert proof passing on a human routing (P6(i) now needs the stated rule); and P3's zero margin (the P2 minimum is now stated). Its fifth point, that 25 might be the display cap, was checked and withdrawn: 25 is the filter's own total (A5).

REVIEWER, round 2: Langston, Discord `1573307920056066049` (2026-11-20 12:04Z), at `fe2c160ad`. P1–P3 PROCEED with the net-byte correction; P4 PROCEED once the fork is registered (R2-7); P6 SEND BACK on three blockers, answered in R2-1 to R2-6. DEPLOY_WINDOWS departure accepted with the R2-9 substitute.
