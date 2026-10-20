# B-LANGSTON-CLAUDEMD-RESIDUAL — scope (Step 1, r2)

change-class: architecture

> **Owner:** Infra Claude (CC-INFRA), with Langston (it is his instructions file). **Slotted by Kyle 2026-10-20** as Infra Claude's next batch, immediately after `B-LANGSTON-RELIEF`, started during that batch's 7-day window (`SPRINT_TO_LIVE_PLAN.md`, the row below `B-LANGSTON-RELIEF`). **Carries `B-LANGSTON-RELIEF` OBJ-3's ceiling** (Kyle 2026-10-20, option A; that batch's scope row OBJ-3a).
> **Folds in `B-RULES-1E-LANGSTON-SLIM`** (`#974`; "lean core + on-demand modules + ledger split", Infra Claude's since 2026-08-05; listed "parked by Kyle, deliberately undated" in `PRE_LIVE_SPRINT.md`). The ledger-split leg shipped in `B-LANGSTON-RELIEF` OBJ-3. **Kyle's 2026-10-20 instruction to slot this work is read as unparking the rest — he was told so in chat, with the option to keep it parked** (recorded on `#974` too).
> **r1 → r2 (Langston's CHANGES on r1, 2026-10-20 21:37Z):** (0) r1 was dispatched before the backup mirror held its commit, so it could not be read at the stated ref; (1) OBJ-4 now targets CLAUDE.md's own bytes with named headroom, not the moving 8 KB gap; (2) new OBJ-2: the 20 superseded persona files in `Claude Comms and Packages/Langston/` are dispositioned in this batch; (3) OBJ-1's done-when now measures the privacy check before and after; (4) OBJ-7's parity is proved by hash, not size; (5) the modules are bounded by a mechanical read check — without one, a section stays in core; the bytes come from his retire/compress rulings instead. Order: OBJ-1 → OBJ-2 → OBJ-3 → OBJ-4 → OBJ-5.

## Why (measured 2026-10-20, Helsinki)

Every Langston invocation auto-loads three files; their SUM is capped at 143,856 B and may only decrease (`PHASE_19_PLAN` row 2.8b; read the live values with `langston-size-watch --status`):

| file | bytes (2026-10-20) | changes |
|---|---|---|
| `/home/langston/CLAUDE.md` — persona + standing rules | 67,896 | only by hand; **no copy in git** |
| `/home/langston/MEMORY.md` — composed memory | 75,061 – 75,159 (moves daily) | trimmed nightly since 2026-10-16 |
| harness auto-memory index | 9,052 | title + link only since 2026-10-17 |

The sum is 152,068–152,107 B, over by ~8,200 — a figure that moves with his memory every day, so it is NOT the target (OBJ-5 sets one). CLAUDE.md grew from 63,750 B on 2026-08-05 (`#651` B6) to 67,896 B, and it cannot be reviewed at a ref because it is not in the repo. Meanwhile 20 SUPERSEDED copies of a Langston persona and rulebook ARE in the repo (`Claude Comms and Packages/Langston/`, incl. `SOUL.md`, `BOOTSTRAP.md`, `IDENTITY.md`, `AGENTS.md`, `MEMORY.md`, `USER.md` — 64,704 B of April-era standing rules naming Telegram and a Windows `G:` path), which is the class his own file names as the bug.

**Byte convention for every figure here:** UTF-8 bytes from a `## ` heading line through the line before the next heading, each line with its newline; the title block is its own row. On that convention the 25 sections plus the title sum to 67,897 against the 67,896-byte file (the last line has no newline). Langston's own measure runs 40–80 B lower per section — a different boundary convention; OBJ-3's census states this one.

## Objectives

| # | objective | done when |
|---|---|---|
| OBJ-1 | **Version his rules file** — parity with Coltrane, whose `comms-infra/codex/AGENTS.md` is byte-identical to his live file (sha256 `591d9bc3…`, repo blob and `/home/coltrane/.codex/AGENTS.md`, measured 2026-10-20). The live `CLAUDE.md` is committed byte-identical to `comms-infra/langston/CLAUDE.md`; from then on it changes only by a reviewed commit installed by hash. Langston ruled: commit all of it, no line fails on confidentiality (one rider is Kyle's — see Questions). | Repo blob sha256 = live file sha256; a written install procedure. **The privacy check:** its `excluded` count is measured BEFORE the commit, the after-value predicted, and after the commit it still returns a readable verdict (PASS or a named EXPOSED — not `INSTRUMENT`) — it counts `CLAUDE.md` in its protected set (`langston-privacy-check:140`) and treats any line present in the review branch as public (`:84`). |
| OBJ-2 | **Disposition the 20 superseded persona files** in `Claude Comms and Packages/Langston/` (rule 18 / his §15), in the same batch that creates the canonical copy, so there is ONE copy anyone is told is authoritative. | Each of the 20 paths: deleted with a `DELETED_COMPONENTS_LOG.md` row + `_archive/deleted-code/` copy, or kept with an explicit HISTORICAL header naming `comms-infra/langston/CLAUDE.md` as the live file. Census of any reader of those paths first (Step 2). |
| OBJ-3 | **A per-section census with a placement for each**, using the byte convention above: bytes; what it governs; its trigger; stale facts; placement — **core**, **retire/compress** (by Langston's ruling), or **module** (only under OBJ-4's condition). Langston's test (r1, Q2): *a section is core if its trigger is something he cannot see coming* — anything that fires when he measures, assumes, or finds something unexpected. | Every row placed and ruled by Langston; the rows sum to the file's bytes. |
| OBJ-4 | **Retire and compress first; modules only where non-reading is detectable.** His r1 rulings, each with a stated byte delta: (i) the `dt-review` command mechanics in the governed-artifact section go — every dispatch header already carries them; the invariant stays; (ii) §18 (GDrive mount) is dead — its one surviving instruction (never `find /`) moves to §9; (iii) §2 states the plain-language rule once, plus the four questions every Kyle-facing message answers; (iv) §3 Expertise retired or moved; (v) §13 compressed to the five dispositions and the `HOME:` form. **A section becomes a module ONLY if a mechanical check shows it was read when its trigger fired** (his r1 Q3: a token on the module's first line, carried in the reply and checked by the queue). **Without that check, the section stays in core.** Retired text is not lost: it is in git (OBJ-1) and in the archive copy. | Each change's byte delta stated; every retired paragraph traceable to the OBJ-1 commit; no module ships without its check. |
| OBJ-5 | **Meet the ceiling with named headroom.** Target for CLAUDE.md's OWN bytes: **≤ 55,000 B** (−12,896, ~19%), which with today's memory (75,061) and index (9,052) leaves ~4.7 KB of headroom for memory growth under 143,856. | `langston-size-watch --status` shows the sum ≤ ceiling for two consecutive daily runs, and CLAUDE.md ≤ 55,000 B. Lowering the ceiling itself is row 2.8a, not assumed. |
| OBJ-6 | **He still receives what he needs.** The load canary's probe 1 counts the `## §N` sections and is re-derived after the change. **Negative control:** for any module shipped, a dispatch whose trigger fires with the module deliberately unread — the check must catch it. | Canary `--self-test` passes and a live run returns LOADED; if a module ships, its negative control fails loudly. |
| OBJ-7 | **Coltrane parity.** Measured: one auto-loaded file, 14,446 B, under its own ceiling, already versioned (hash-equal, above). | Written per objective: OBJ-1 already met for him (the model); OBJ-2 — check for superseded Coltrane persona copies in the repo; OBJ-3–6 do not apply unless his file nears its ceiling. |

## Provenance read (Step 1.b)

- **Tier 1 — `/home/langston/CLAUDE.md` (behaviour changes):** corpora searched — `RUNNING_ISSUES.md` (`#651`, `#974`, `#1197`), `LANGSTON_ARCHITECTURE.md` (§4 files, change log), `PHASE_19_PLAN.md` rows 2.8a/2.8b, `PRE_LIVE_SPRINT.md` (parked list), the `B-LANGSTON-RELIEF` scope and pre-audit. Intent, from `LANGSTON_ARCHITECTURE.md`: his persona and standing rules, auto-loaded so a stateless invoke starts with them. `#651` (2026-08-05) is its last audited correction pass. The batch that created it (the 2026-05-06 move off OpenClaw) never committed its text — **anything before 2026-08-05 is `INFERRED-FROM-CODE`.** Disposition **(2)**: relevant, needs updating — content kept or retired by his ruling, loading changes.
- **Tier 1 — `Claude Comms and Packages/Langston/` (20 paths, OBJ-2):** the April-era persona set from before the 2026-05-06 runtime move (OpenClaw), superseded by his live `CLAUDE.md`. Disposition **(5)**: disconnected, should stay disconnected — delete or mark historical. Readers censused in Step 2.
- **Tier 2 — read, not changed:** `langston-size-watch`, `langston-load-canary` (probe 1 re-derived, OBJ-6), `langston-memory-write`, `langston-privacy-check` (OBJ-1's done-when).

## Questions

- **For Kyle (Langston's rider (a) on Q1):** his rules file states *"Kyle is at a beginner level on trading math, quant analysis, and coding"* plus a paragraph on not rubber-stamping. Committing it makes that text readable by every session. Keep, cut, or reword? — asked in chat 2026-10-20.
- **Settled by Langston r1:** commit all of it (Q1); his core/module test (Q2); a mechanical read check or no module (Q3); modules, if any, root-owned and read-only to him, installed by hash (Q4).

## Out of scope

Lowering the ceiling (row 2.8a); his `MEMORY.md` (trimmed nightly by `B-LANGSTON-RELIEF`); his model. **The module read-check mechanism** (a token per module, checked by the queue) is built here only if OBJ-5's target cannot be met by retiring and compressing — otherwise it is proposed to Kyle as its own item, not started.
