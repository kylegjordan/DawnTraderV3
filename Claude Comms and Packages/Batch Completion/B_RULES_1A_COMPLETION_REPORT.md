# B-RULES-1a — COMPLETION REPORT

**Batch:** B-RULES-1a (governance programme Part 1, first fix) · change-class: `non_architecture` (no engine paths touched; instruction files + observability hooks only)
**Owner:** CC-A (OLD Claude) · **Closed:** 2026-08-05
**Scope:** `Claude Comms and Packages/Scope Files/B_RULES_1A_SCOPE.md` (@ `a8bb9a188`) · Pre-audit: `B_RULES_1A_PRE_AUDIT.md` (@ `88c5be3e9`, corrected `512cb6450`)
**Langston gates:** Step-1 PROCEED (4 conditions) · Step-2 ACCEPTED (5 corrections) · OBJ-2 design ruled per-item at `c3e93c1c1` (B5 via r2→r3) · OBJ-1 design CHANGES-NEEDED→r2 PROCEED (4 fixes + 2 folds + 1 guard) · instrument verification he ran HIMSELF (row-5 self-observation) · backup-reachability finding resolved with presence-evidence + fix.

## PREVIOUSLY-STATED-VS-NOW
- **PREVIOUSLY: "six false/stale statements" counted as 5 items (A2,B1..B5). NOW: the B3 fix grew under Langston's amendment** — not just the count "18" but BOTH stored enumerations (omitting `orb`; true split 10 file-based + 9 in-class) and BOTH stale line refs (`:365`→`:511`). REASON: his enumeration of the SSOT at the ref caught more than the ask.
- **PREVIOUSLY: CC-A own-memory baseline stated as "23,900" with no denominator. NOW: same number, population stated** — single file `MEMORY_CC_A.md`, exactly what the load-own-memory hook injects. REASON: Langston BLOCKER-2 (rule 29(a)).
- **PREVIOUSLY (my dispatch): "shared MEMORY.md 25,488 over-cap, mine to prune." NOW: that object is `/home/langston/MEMORY.md`** (the @import target), NOT the CC-side shared file (20,081 B). REASON: Langston fold-2 — adjacent-object conflation in the message proposing the gate; rows now carry absolute paths as identity.

## OBJECTIVES (all YES)

**OBJ-1 — instructions-load observability: YES.**
CC side: `.claude/hooks/log-instructions-loaded.mjs` (SessionStart `startup|resume|compact`, fail-open, appends to `~/.claude/instructions-loaded.jsonl`), registered in `.claude/settings.local.json` (4th SessionStart hook). Langston side: `/usr/local/bin/langston-log-loaded` called from BOTH invocation sites (`langston-call:104`; `discord-langston-bridge.py` `invoke_claude`), log root-pre-created `langston:langston 0644`, logrotate weekly/8/compress. Shared row contract: absolute paths as identity, `population` per entry, memory-directory census (per-file), and the `measures` honesty string verbatim: *"candidate set — path existence + size at invoke time; NOT proof the harness loaded them (load proof = sentinel method)"*.
**Verified, not asserted:** falsifiable-at-birth — row 1 reproduced Langston's four independently-predicted values exactly (63,750 / 25,488 / 6,254 / 19 files 53,340). Fail-open walked THREE ways (injected raise; chmod-000 logger run; a FULL `langston-call` invoke with the log dead — reply returned, row count unchanged). Discord path proven by Langston himself: row 5 = his own invoke, `invoke_path=discord-bridge`, observed by him in the log before replying. Scope's required before/after: his `MEMORY.md` ABSENT from context pre-fix (measured `/context`, 2026-07-31), PRESENT post-fix (sentinel, both paths) — and the instrument recorded its own file shrinking between rows 1→5 (25,488→23,490) from the prune.

**OBJ-2 — Langston's `MEMORY.md` actually loads: YES.**
One-line `@MEMORY.md` import (labelled to disambiguate from the harness auto-memory index, his condition 3). Sentinel existed ONLY in `MEMORY.md` (condition 2) and returned verbatim with correct file attribution from BOTH real invocation paths (condition 1): `langston-call` invoke AND a Discord-bridge invoke. §10/§12's "auto-loads" claims are now true. Full record: RUNNING_ISSUES **#651**; before-states in `LANGSTON_ARCHITECTURE.md` §10.
Plus the six false/stale statements corrected in his always-loaded file under his per-item ruling (B1 graded-ref wording with corrective parenthetical; B2 dormant-era + "Kraken's paper order system" replaced, Trap paragraph hash-checked intact; B3 SSOT pointer replacing count+enumerations+line-refs; B4 retired `/mnt/gdrive` path struck, §18 re-pointed; B5 §10.5 step-3 REPLACED with his own re-derived mechanism text — an ack SILENCES via dedupe-key blocking `system-alerts.ts:388-389`; short-id no-op is loud unless stderr muted; `--evidence` hard-required `scripts/system-alerts.ts:294`).

**OBJ-3 — F-A/F-B/F-C in repo `CLAUDE.md`: YES** (shipped `ae9d702e0` + `5a79633ba`, prior week). Rule 1 per-session-clones with anti-zip clause verbatim (sole-home note); `bridge/canonical/` pointer in §4; the false Langston-autoload claim corrected with #564's conclusion preserved on CC-side grounds; self-referential figures relocated to history doc §5.30.

**OBJ-4 — version gates measured: YES** (recorded in pre-audit @ `5185f1787` context): Langston runs Claude Code 2.1.159 on his box; CC desktop sessions on the app's shipped CLI. Consequence recorded: no leg may assume `/doctor`-trim (2.1.206+) or the 2.1.198/207/211/217 rules-loading behaviors on his side until his runtime moves; the 1c/1d designs must gate on measured versions at their own Step-1.

**OBJ-5 — baseline recorded, bytes not lines, populations named: YES.**
CC-A session start loaded set: **185,139 B** = `CLAUDE.md` 141,158 + shared `MEMORY.md` 20,081 (single file at `~/.claude/projects/C--DawnTraderV3-old/memory/MEMORY.md`, NOT the directory) + `MEMORY_CC_A.md` 23,900 (single file). Memory-dir census 24 files / 181,299 B (present, mostly not loaded).
Langston per-invoke loaded set: **93,494 B** = `/home/langston/CLAUDE.md` 63,750 + `/home/langston/MEMORY.md` 23,490 (post-prune; 25,488 at row 1) + auto-memory index 6,254. Census 19 files / 53,340 B.
⚠️ **Annotation (Langston's OBJ-5 minor, his annotate option):** `context_bytes_total` sums the LOADED CANDIDATE SET ONLY and deliberately excludes census bytes — the census is adjacent material, not loaded context. Field name retained for row-schema stability across the first five rows.

## ADDITIONAL WORK LANDED IN-BATCH (all Langston-ruled)
- **His `MEMORY.md` pruned under cap** (25,488→23,490 B) via his own collapse-to-pointers convention; REVIEWER LEDGER byte-identity proven by sha256 guard in the prune script AND re-derived from the pre-image after his challenge (`d99939…b30fce` both sides).
- **Backup-reachability fix:** all five same-day pre-images copied to `/home/langston/backups/` (langston-owned) after his enumeration couldn't reach `/root/backups` (mode-700 `/root`) — his absence finding was an instrument-reach finding; the operational point (reviewer-reachable rollback) was right and is fixed.
- **Wave D alert `74a661e5…` resolved in-flight** (routed to CC-A mid-batch): four checks PASS, evidence commit `1d004b364`, row read back `resolved/cc-a/cli`. The evidence-token gate + read-back rule both fired on the author in real use — first resolve (prose evidence) rejected AND caught still-active by read-back.

## GOVERNANCE FILES CHANGED (this batch, cumulative)
- `CLAUDE.md` (rule 29 leg-1 `b43af6c1d`; OBJ-3 `ae9d702e0`/`5a79633ba`)
- `1-system-manual/_archive/CLAUDE_MD_RULE_HISTORY.md` (§5.29, §5.30)
- `1-system-manual/RUNNING_ISSUES.md` (#651; Wave D verification annotation; B6 home `B-RULES-1E-LANGSTON-SLIM`)
- `1-system-manual/BATCH_CATALOG.md` (entry, this commit)
- `1-system-manual/PHASE_HISTORY.md` (governance-arc note, this commit)
- `1-system-manual/LANGSTON_ARCHITECTURE.md` (§10 rows: OBJ-2 with before-states; OBJ-1 instrument, this commit)
- `.claude/hooks/log-instructions-loaded.mjs` + `.claude/settings.local.json` (the CC instrument, this commit)
- Langston box (off-repo, backed up + reachable): `/home/langston/CLAUDE.md`, `/home/langston/MEMORY.md`, `/usr/local/bin/langston-call`, `/opt/discord-bridges/discord-langston-bridge.py`, `/usr/local/bin/langston-log-loaded` (new), `/etc/logrotate.d/langston-instructions-loaded` (new)
- Scope/pre-audit/design asks: `B_RULES_1A_SCOPE.md`, `B_RULES_1A_PRE_AUDIT.md`, `B_RULES_1A_OBJ2_LANGSTON_FILE_FIXES_r1.md`
- `MEMORY_CC_A.md` (truth + mirror) — per-batch state
- SIM / SYSTEM_MANUAL: **not applicable** (no system component or architecture/math changed; instruction files + observability tooling only — applicability judged explicitly per §9 rule, not skipped by default)

## WHAT THIS BATCH DID NOT DO (scope §5, honest)
No trimming, no reordering, no skills extraction, no `.claude/rules/` conversion — those are 1b/1c/1d/1e, now unblocked by the instrument. `B-RULES-1E-LANGSTON-SLIM` (his file, 63,750 B and grown by the import) is homed at the 1e leg. The shared CC-side `MEMORY.md` cap-watch continues (20,081 B, under cap).
