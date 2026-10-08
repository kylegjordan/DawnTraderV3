# B-LEDGER-TAIL-DISPOSITION — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN (Step 2, r1)

change-class: non_architecture · **Owner:** CC-A (OLD Claude) · **Plan row:** `SPRINT_TO_LIVE_PLAN.md` 1u · **Issue:** `#1169` · **Scope:** r2 `1f353111f`, **APPROVED by Langston 2026-10-08 with C-1..C-3** (carried to Step 4; C-3 fixed below).

## PREVIOUSLY STATED → NOW
- **PREVIOUSLY STATED (scope r2 OBJ-3): "eleven strategy files 8-15 each". NOW: ten strategy files at 5-15 each; 12 of the 179 lines are in four test files and 1 is the definition (`server/utils/null-reason-tracker.ts`), so 166 production call sites.** REASON: Langston C-3; re-derived at `HEAD` with `git grep -c -w setNullReason`.
- **PREVIOUSLY STATED (scope r2 OBJ-3): the leftover is a durability refactor, to be homed or withdrawn. NOW: the tracker's own safety condition does not hold at one of its three read sites, so it is homed as a defect hypothesis, not withdrawn.** REASON: §1.C below.

## 1. AUDIT

### A. The detector (code, at `HEAD`)
`parseLedger` (`census.mjs:148-190`): heads → `byNum`; `openR1` = an entry with an OPEN head and no closing head (`:166-167`); the S1/S2 widenings and the existing self-contradicting leg run only past `:169` (`if (e.words.has('OPEN') || closed) continue;`) — no-status-head entries. `CONTRADICTS` (`:109`) carries the `g` flag. **Reach of the list (Langston, re-verified):** `:603`, `:622`, `:637`, `:678`, `:829` — the record, the counts, the lists, the body line, the dry-run; nothing gates, closes or pages on it.

### B. The two entries (OBJ-1)
| # | tail | what the record says now | evidence read |
|---|---|---|---|
| `#398` | `RESOLVED (P19-B6.9)` | fixed: parity-gate WS uptime re-based on the rolling 1 h window | `c1e5ef80c` (2026-06-30, `P19-B6.9 OBJ-1 (#398)`) is an ancestor of `HEAD`; `server/services/parity-gate.ts:70` and `:107-119` carry the rolling-window formula and name `#398` |
| `#395` | `RESOLVED (historical; no live bug; log cleared; durable refactor recommended-scheduled)` | the `ReferenceError: setNullReason is not defined` stream: not present | staging `/var/log/dawntrader/error__2026-10-0{2..8}*.log` + `error.log`: **0** `setNullReason is not defined`, **0** `ReferenceError` (7 daily files, 4,016,987 lines, plus the current `error.log`); **positive control** on `error__2026-10-08`: 6,557 lines contain `Error`, 50 `TypeError` — the instrument records errors |
⇒ both close in place (row 1n's method). `#395`'s refactor note is §C, not a reason to keep it open.

### C. The null-reason global (OBJ-3) — the safety condition fails at one read site
`null-reason-tracker.ts:1-6`: *"safe ONLY because the VTS evaluation pipeline is strictly serial … If strategy evaluation ever becomes concurrent … this MUST be replaced with evaluation-local state."* Census of the three production READ sites (fresh reader, re-derived at `HEAD` for the load-bearing one):
| read site | reset → detect → read | `await` in the window? |
|---|---|---|
| active signal orchestrator, `signal-orchestrator.ts:2756-3226` (18 strategies) | sync engine detect | no (the only `await` is after the read, non-null branch) |
| xStock `eval-cycle.ts:562` → `:565` → `:602` | sync | no |
| **crypto VTS `vts-runner.ts:5668` → `:5671` → `:5682`** | **`await generatePhase10Signal(...)`** | **yes** — re-derived: `:5668` `resetNullReason()`, `:5671` `const result = await generatePhase10Signal(…)`, `:5682` `const detailReason = getNullReason()` |
Inside `generatePhase10Signal`, two null returns follow real I/O with no fresh `setNullReason`: `:2337` (asset-class resolution fails at trade-open) and `:2580` (`[B79.0g][PERSIST_FAIL]`). Any VTS null also crosses a microtask hop before `:5682`. The three loops run as independent timers in one process (crypto VTS `setInterval` `vts-runner.ts:6046`; orchestrator `signal-orchestrator.ts:426`; xStock clock `xstock_spot/scanner.ts:246`), with no shared lock.
**Runtime, measured on staging:** the crypto VTS IS running (boot 2026-10-07 15:55:53Z: `passiveLearning=true … Auto-start enabled (passive mode)`; 10,288 `[VTS]` lines in the current `out.log`). The two I/O null paths did not fire in the last two days (`PERSIST_FAIL` 0, `[B79.TEC][VTS]` 0 in `error__2026-10-0{7,8}`).
⇒ **HYPOTHESIS, not a measured defect:** a VTS null can record ANOTHER evaluation's reason when an xStock or orchestrator evaluation runs inside the VTS window. Possible by construction; not observed; the failure is silent (a wrong reason is a well-formed string), and it lands in the VTS learning telemetry (`classifyVtsNullReason`, the per-strategy null counters, the archived stage). Rule 24: a hypothesis, not a verdict. Two stale comments rest on the wrong argument (*"zero `Promise.all` in this file"*): `active-funnel-tracker.ts:378-382` (also cites `vts-runner.ts:4863`, now `:5682`) and `signal-orchestrator.ts:30`.
**DISPOSITION — own batch, placed (§9.4 disposition 3), owner CC-B** (VTS and strategies, §6 grouping): `B-NULL-REASON-LOCAL` — measure first whether any VTS null reason is mis-attributed (e.g. a per-call token checked at the read), then make the reason evaluation-local (`#395`'s "return-value" design) across the 166 call sites, and correct the two comments. Placement to settle with Langston at this step (proposed: the sprint's VTS/learning-data group, not after-live — it is calibration input).
`REVIEWER: claim-only · "can two detect evaluations interleave through the null-reason global?" · hit: possible at the VTS read only, (c) not established · re-derived y (the window lines, boot state, the two failure-path counts)`

### D. Sources read
1 code (`census.mjs`, `null-reason-tracker.ts`, `vts-runner.ts`, `parity-gate.ts`, `boot_orchestrator.ts`) · 2 staging error and out logs, positive-controlled · 3 SIM — the census table ("owner sources", the Monday gate) — the list's definition changes, owed at Step 10 · 4 System Manual: N/A for the census; the null-reason finding is homed, not changed here · 5 ledger: `#395`, `#396`, `#398`, `#1169`; `B-PLAN-CURRENCY-CHECK` · 6 `bridge/canonical/`: not applicable (the census post-dates it; the tracker is Batch 31, 2026-01 — its intent is in its own header).

## 2. PLAN (each item → its finding)
| # | item | from |
|---|---|---|
| **P1** | close `#395` and `#398` in place: head `✅ CLOSED <date> (W41 tail triage, CC-A) — originally:`, and one citation line each (§B); `#395`'s line also names `B-NULL-REASON-LOCAL` as the home of its refactor note | §B, OBJ-1 |
| **P2** | `census.mjs`: a second self-contradicting leg, placed **before** the `:169` `continue`, gated on **`openR1` membership** (`words.has('OPEN') && !closed`, Langston C-1); cell = text after the head line's last ` \| `, skipped when the backtick count before it is odd; `statusWord(cell)` tested against a **Set built from `CONTRADICTS.source`** — never `CONTRADICTS.test(...)`, which is stateful under `g` (Langston C-2); pushed with `reason: "trailing cell carries \"<WORD>\" after an OPEN head"` and a `leg: 'tail'` field; the existing leg's entries get `leg: 'head'` | §A, OBJ-2 |
| **P3** | tests in `census.test.mjs`: (i) an OPEN-headed entry with `\| RESOLVED (x)` is listed; (ii) **two** such entries in **one** parse are both listed (C-2's failure mode); (iii) an OPEN-headed entry whose code span holds ` \| RESOLVED` is not listed — and IS listed with the parity filter removed (stated as the control); (iv) `\| PARKED …` and `\| OPEN …` not listed; (v) an entry with an OPEN head AND a later `✅ CLOSED` head is not listed (C-1); (vi) the existing head leg's fixtures unchanged | §A, OBJ-2 |
| **P4** | measured on the live ledger before it ships: the dry run at the change's sha lists `{#395, #398}` with P1 not yet applied (via `--ref` at the pre-P1 ledger) and `0` at the close commit | OBJ-2 |
| **P5** | home `B-NULL-REASON-LOCAL`: a `RUNNING_ISSUES` entry (next number) with §C's evidence and the `HOME:` line; a plan line at the place Langston settles; hand-over to CC-B by number | §C, OBJ-3 |
| **P6** | Step 10: SIM census table — the self-contradicting list's two legs | §D |

## 3. JUDGEMENT CALLS TO ATTACK
1. **§C is placed as CC-B's batch, not fixed here** — it is VTS/strategy code, 166 call sites, and a hypothesis that needs measuring first; this batch is a ledger + census batch.
2. Placement of `B-NULL-REASON-LOCAL` in the sprint rather than after live (it feeds calibration data).
3. The `leg` field on every self-contradicting entry — a schema addition to the census record, kept because the two legs mean different things.
