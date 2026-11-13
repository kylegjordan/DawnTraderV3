# B-SIZE-WATCH-BREACH-ALARM — SCOPE r1

change-class: non_architecture

> Owner: Infra Claude (CC-INFRA). Plan: `SPRINT_TO_LIVE_PLAN.md` §0, Infra order 10, agreed by Kyle 2026-11-06 (KD-50): before live, after `B-AGENT-INVOKE-FAILURE-NOTICE`. Issue `#1215`. Drafted 2026-11-13.
> Reviewer: Langston (crew mode CLAUDE since S6, 2026-11-13).

## 0. What happens today — measured 2026-11-13 ~13:50Z on Helsinki, read-only

- **The installed watch is the repo's.** `/usr/local/bin/langston-size-watch` hashes (`git hash-object --no-filters`) to `336f8e9ac8a9888b252c653335996c9e715efea9`, the blob at `origin/migration/aws-supabase`.
- **A breach is a Discord post and nothing else.** `run()` sets `status = "BREACH"` when the loaded set is over the ceiling (`langston-size-watch:415-416`) and builds an alarm string (`:433-442`) that goes only to `post()` (`:448`). The only alert the tool ever creates is the liveness heartbeat, dedupe key `langston-size-watch-heartbeat` (`:95`, minted at `:255`), whose subject is "the watch did not run". **No alert row anywhere has the breach as its subject** (Langston's finding, `#1215`, 2026-10-17).
- **So a breach run reads like a pass in the alert store.** The same run that posts the breach also resolves the pending heartbeat and arms the next one (`heartbeat(st, status)` at `:485`). The per-turn alert read, which is how every session learns what is wrong, never sees the breach.
- **How often it has happened.** The rotated run logs (`/opt/langston-memory/state/size-watch.jsonl.*`, read together) hold **55 real BREACH runs**, 2 real UNDER runs, and 24 fire-drill runs (6 BREACH, 18 UNDER). The current file holds 6 runs, 2026-11-08 → 11-13, all UNDER. Each of the 55 posted to Discord; none produced an alert row. (Population: every row in the eight rotated files `.1.gz`-`.8.gz` plus the current file; drills separated by the row's own `drill` flag. Rotation keeps eight files, and whether any older file was already dropped is NOT established, so 55 is a floor.)
- **Today the set is under its ceiling:** `ratchet-state.json` reads `last_status: UNDER`, `last_total_bytes: 142959` against `ceiling_bytes: 143856`, last run 2026-11-13T05:41:42Z. ⛔ Read the live values with `langston-size-watch --status`, never from this line.
- **The ceiling's history has one entry**, the 2026-09-05 first-run seed. That is accurate rather than a missing write: `set_ceiling()` appends to `history` (`:577`) and nobody has lowered the ceiling. What the state does NOT keep is any record of the breaches themselves: whether the set was over, for how long, by how much at worst. That lives only in the run log, which rotates.
- **Coltrane's watch has neither alarm.** `comms-infra/codex/coltrane-size-watch` posts a BREACH to Discord (`:189-196`) and has no alert plumbing at all (its header, `:10-16`: the staging alert path was deliberately not ported in 2026-09; Coltrane gained his own staging key on 2026-10-15). Kyle's standing rule, 2026-09-09: *"What you add for Langston please add for Coltrane."*

## 1. Provenance (step-1 1.b) — corpora searched: `git log` on the tool's path and `-S` on the heartbeat key (not path-limited); `RUNNING_ISSUES.md` by issue number and tool name (`#1215`, `#1007`); `SYSTEM_IMPACT_MAP.md` and `LANGSTON_ARCHITECTURE.md` by tool name. `bridge/canonical/` has no coverage (the tool is from 2026-09).

**TIER 1 — behaviour changes: `langston-size-watch`.**
- Introduced at `f2a90077a` (2026-09-05). Its message, verbatim: *"The ratchet Kyle approved this morning was a number in a document. This is the instrument that makes it a rule. It matters because the ceiling's own history is the argument for it: item 2 of the 2026-08-05 plan CONTAINED a daily size watch, it was never started, and that is exactly why his MEMORY.md grew 137% in 28 days with nobody noticing. The alarm was itself the unfinished item."*
- The heartbeat came in at `9e8bbd69b` (2026-09-06), verbatim: *"gap_h can only be computed on a run that HAPPENS, so a disabled or erroring unit reports nothing forever and the ratchet quietly has no instrument. … A watchdog that can only bark while it is alive is not a watchdog. Now: every successful run RESOLVES the pending staging alert and ARMS the next one 26h out."*
- So the intent was always that a breach is an alarm a human sees. The heartbeat solved liveness with an alert row; the breach was left on the Discord post, which the per-turn alert read does not see.
- **Disposition: (2) relevant, needs updating to today's intent** — the per-turn alert read is now how sessions learn what is wrong, so the breach must reach it.

**TIER 1 — `coltrane-size-watch`** (if OBJ-3 is ruled in). Created 2026-09-09 as a port of the same invariant, deliberately without alert plumbing; its header homes a merge into one `--agent` tool "after his review closes". **Disposition: (2).**

**TIER 2 — read or called, unchanged:**
- `scripts/system-alerts.ts` `add` / `resolve` — the same CLI the heartbeat uses over SSH (`STAGING_CMD`, `:97`). A non-terminal alert blocks a new one with the same dedupe key (`server/services/system-alerts.ts`, non-terminal dedupe), which is exactly the one-open-row behaviour wanted here.
- `langston-memory-write`'s growth gate reads only `ceiling_bytes` from the state file (`SYSTEM_IMPACT_MAP.md`, Langston memory block). Any new state field must not change that read.
- The heartbeat path (`heartbeat()`, from `:207`) — kept exactly as it is.

## 2. Objectives and how each is verified

**OBJ-1 — a breach is an alert row, and it closes itself when the set is back under.** When a run finds the loaded set over its ceiling (or a watched file missing), it makes sure ONE active alert exists with its own dedupe key, separate from the heartbeat's, carrying the total, the ceiling, the overage and the per-file sizes. When a later run finds the set at or under the ceiling, it resolves that alert with the run row as evidence. While the breach lasts, no second row is created. A drill never touches the real breach row. The heartbeat is unchanged.
*Verified:* a fixture test drives `run()` from its production entry with an injected over-ceiling total and asserts the exact `add` call (key, severity, category, body fields); a second run under the ceiling asserts the `resolve` call with run-row evidence; a second breach run while one is open asserts no new row. Mutations: drop the add, drop the resolve, reuse the heartbeat key — each must fail a check. Live: the next scheduled run after install, read in the run log, with its alert outcome recorded in the row.

**OBJ-2 — the breach history survives log rotation.** The state file keeps each breach episode: when it started, when it ended (or that it is still open), and the worst overage seen. `--status` prints the ceiling history and the episodes. The ceiling itself and its refusals are unchanged.
*Verified:* fixture runs over → over (larger) → under produce one closed episode with the right start, end and peak; `--status` prints it; `langston-memory-write`'s read of `ceiling_bytes` is unaffected (its own test suite passes against the new state shape).

**OBJ-3 — Coltrane's watch gets the same breach alarm** (Kyle 2026-09-09). Same dedupe discipline, his own key, owned by the Infra session, through his own staging access.
*Verified:* the same fixture shape against `coltrane-size-watch`.

## 3. Out of scope
- Raising or lowering any ceiling. The ceiling is set only by the batch that lands a trim.
- Merging the two watches into one tool (homed by the Coltrane tool's own header as a later step).
- The heartbeat's behaviour.
- Langston's rules-file tamper alarm and the archive-size alarm (`:450-484`) stay Discord posts. ⚠️ **They have the same shape as this finding** (a condition a human must act on that never reaches the per-turn alert read). Judgement call (c) asks whether they belong here.

## 4. Judgement calls I want attacked
- **(a) Should the breach alert fire immediately, or only after N consecutive breach runs?** I propose immediately: a breach is already a day old when the daily run sees it, and a transient is worth one alert row.
- **(b) Live verification:** the set is UNDER today, so no real breach can be observed after install. I propose a drill that writes a real alert row titled as a drill and resolves it in the same run, so the staging path is proven end to end, instead of a fixture-only claim. A row that says "drill" in its title and is resolved within seconds should not page anyone. Is that acceptable on the shared alert store, or should the live leg be accepted on the fixture?
- **(c) Fold the tamper alarm and the archive-size alarm** into the same alert path now, or leave them as posts? Folding them is a few lines each and the same failure shape, but it widens the batch.
- **(d) OBJ-3 now, or with the planned merge?** Kyle's rule says now. The cost is a second copy of the alert code in the Coltrane tool until the merge.

## 5. Risks named now
1. **An alert storm.** A breach lasting weeks must stay ONE row. The dedupe key does this structurally; the fixture proves it.
2. **A failed resolve.** If the resolve fails, the row stays open and the next breach collapses onto it, so nothing is lost; the run row records the failure, the same discipline as the heartbeat (`:241-249`).
3. **State-shape change under a reader.** `langston-memory-write` reads the state file; a new field must be additive only.
