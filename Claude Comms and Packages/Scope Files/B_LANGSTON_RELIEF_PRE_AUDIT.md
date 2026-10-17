# B-LANGSTON-RELIEF — pre-audit (Step 2)

change-class: architecture

> ⛔ **WRITTEN AFTER THE FACT, AND SAYING SO.** Kyle directed this batch at hotfix pace on 2026-10-16 while Langston was
> ~13 hours behind. Each increment's audit-and-plan was done and reviewed — but inside the scope file, the change lists
> and the review dispatches, not in this document. Every Step-4 dispatch carried `NO STEP 2 DOCUMENT — …` honestly.
> This file collects those audits in one place so the batch's Step 2 is findable; it introduces nothing that was not
> reviewed. It does NOT retroactively make the order 1 → 2 → 3.

## 1. Where each increment's audit lives

| increment | audit-and-plan | reviewed by | where |
|---|---|---|---|
| OBJ-1 people first + recovery | blast-radius census of the task queue's writers/readers, the new floor state, the replay guard | Coltrane (r1 send-back: floor deleted on failure, started chunk groups not skipped → fixed; r2 approved) | `Scope Files/B_LANGSTON_RELIEF_SCOPE.md` §"Increment 1" |
| OBJ-2 the alert lane | the bridge's `is_alert` path, the wake filter's trusted-marker contract (`langston_outbound`), publication + delivery checks, restart durability | Coltrane (r1: raw markers published, delivery unchecked; r2: restart loses alerts → spool; r3: escalated work deleted on dequeue, posting/escalation crash window, silent spool-write failure; r4 approved) | scope OBJ-2 + the dispatches in `#general` 10:52-12:56Z |
| OBJ-3 memory split + trim | his ledger guards (C-1..C-3, Q3), the reader's priority source, the parts/compose model, the retraction census, the per-section allowlist | Langston (Q1-Q5 ruling 12:01Z; allowlist r1 12:18Z; three gates approved with conditions) | `Langston Design Asks/B-LANGSTON-RELIEF_OBJ3_memory-trim_r1.md`, `/home/langston/inbox/B-LANGSTON-RELIEF/OBJ3_section_allowlist_r1.md`, `Change Lists/B_LANGSTON_RELIEF_OBJ3_INC1_CHANGE_LIST.md` |
| OBJ-4 Coltrane parity | per objective: OBJ-1/2 do not apply (threaded bot, no alert path); OBJ-3 applies to `AGENTS.md` only; then Kyle's library ask | Coltrane (AGENTS.md approved; library r1-r4: paging, lossless de-dup, Telegram copy, symlink-write, two swap windows → approved at `d4774b13c`) | scope OBJ-4 + dispatches |
| lane precedent (post-burst) | the 438-marker precedent series, per-symbol vs per-template consistency | Langston (ruling ~13:55Z; gate at `cf89e0c0b` pending) | dispatches + `alert_lane.py` header |
| *2026-10-17 increments — each audited in its review dispatch; recorded here so Step 2 is findable* | | | |
| delivered-only replies (OBJ-1 follow-on) | every reader of `langston_outbound` as "answered": recovery's `handled`, `inbox_evidence`, `langston_precedent`; the people branch's post path when Discord returns no id | Langston (`5018aca33` → `b81720646`; riders C1-C3 `52562b2d7`) | dispatches + bridge comments |
| Coltrane restart recovery (OBJ-4) | his bot's channel reader, what counts as answered (`answered: true` only), re-entrancy of `recover()`, a SILENT print from a failed invoke | Langston (r1 `e399a449f` → r2 `4f8f69072` → r3 `0004feaa6`) | `comms-infra/codex/coltrane-bot.py` header + dispatches |
| restart helper `langston-bridge-restart` | the 04:35Z drop (no floor written); the floor's writers and its one reader (`read_recover_floor`); the bridge's summary line as the only proof of recovery; the 24 h clamp (23 of 74 restarts since 2026-06-19 would clamp) | Langston (r1 blockers `1c3ff8b24`, r2 blockers `5c7c34fa5`, live crash fix `c03514e6a`, r4 record `7056d8445`) | the helper's header |
| ★ **clean stop** | **process census of the bridge:** two agent spawn sites (Langston's turn and the alert lane) — both go through `run_agent`, which gives each its own process group and registers it in `_AGENTS`; three short helpers stay outside groups (`git ls-remote` 30 s, `langston-log-loaded` 5 s, the staging `ssh` grep 60 s) and are bounded by the unit's `TimeoutStopSec=15`; the state file's one writer `save_state` (made atomic); the failure notifier's false "crash-looped" page at 08:19Z | Langston (`bfcb7b026` approved with one condition → `cb95097bf`) | dispatch 08:31Z; gate `test_bridge_clean_stop.py` registered in `COMMS_BRIDGE_RUNBOOK.md` |
| privacy check bounds | repo text counted as private memory (alert `2109222e`); the exclusion's blind band, its floor, level and step terms | Langston (`59c6c8b10` → `913305ec6` → `8e9f81f1c` → `b862a6526`; separation fence `030ed50e5`) | the check's header |
| trim no-op rows | every reader of `index.jsonl` that walks the sha chain (`last_index_row`, `cas_mismatch_message`, recall's `_split_evidence`); a torn last line | Langston (r1-r4 sent back; r5 `64f20a0b0` in review) | dispatches |
| memory size (79 KB MEMORY.md, harness index cut) | what auto-loads per invoke (the three watched files); who writes each; the 37 trim index lines and the harness index's hooks as the growth; a write-time gate reading the live sum | Langston (ruling on my 14:06Z ask; `481a836fe` → `3872c50a4` → `4071ec6ec` → `90354999c`; retire script `cd65f7a3f`/`738739d12`; harness index option A) | dispatches + the writer's ratchet comment |

## 2. System Impact Map and System Manual

- **SIM:** applicable and updated — Discord fabric (queue, lane, spool, precedent), the memory writer (three files, the trim, the timer), and a new section for Coltrane's library (`1c146a78b`); 2026-10-17: delivered-only replies, the clean stop, the restart helper, Coltrane's recovery, the writer's exit 7 and its two new index row types, the trim's no-index-line change and the dated sizes.
- **System Manual:** judged N/A — no trading architecture, strategy, regime, filter, signal-pipeline or math change. The batch touches only the crew's reviewer tooling on Helsinki.
- **Upstream / downstream / shared state / background execution, per increment, are in the change lists above.** The cross-cutting state introduced: the recover floor file, the lane spool, `LEDGER.md`, `MEMORY-ARCHIVE.md`, the trim timer, Coltrane's `.history/` and `.corpus/`.

## 3. Risks the reviews found that the first designs missed

The reason this batch is trustworthy is the review loop, not the first drafts: alerts lost on restart; escalated alert work cleared before it was answered; raw model markers published; a split that would have filed a batch record as a retraction; a trim that read state from headings that quote their own history; a convention enforced by a refusal and documented nowhere Langston loads; recall stamping eviction time as a record's date; a recall caution that fired falsely on every archived hit; a root-run installer with a symlink-write primitive, two entry-swap races and a source-side leak; and a lane that would have cited its own routing as precedent.
