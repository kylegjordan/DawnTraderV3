# B-TOKEN-ECONOMY — OBJ-0 baseline, pre-registered (PM Claude, 2026-11-19)

Record: actor PM Claude (session 994e6488); crew mode CLAUDE gen 3. Written and committed **before any change commit of this batch**. Instrument: `scripts/crew-tooling/token-baseline.py` ("token-baseline 1.0"). Raw output: `B_TOKEN_ECONOMY_BASELINE_RAW.json` (window) and `B_TOKEN_ECONOMY_BASELINE_CONTROL_RAW.json` (control).

## PREVIOUSLY STATED / NOW
- **PREVIOUSLY STATED** (scope r2 condition 4): the window starts 2026-11-09 23:26Z, "crew resumed on Claude". **NOW:** it starts **2026-11-13T11:44:00Z**. **REASON:** 11-09 23:26Z was the CODEX crew's resume. The crew-switch record (`/var/lib/crew-switch/state.json` history) shows S3 claude→codex 2026-11-09T20:32:08Z and **S6 codex→claude 2026-11-13T11:44:00Z**. The window end is unchanged: 2026-11-16T19:45:00Z, the usage stop.

## Method (unchanged from the 11-05 pack §3.1, rebuilt in the repo)
- **Turn:** one assistant API call, de-duplicated by `message.id` (the last usage wins). `<synthetic>` entries are excluded.
- **Context per turn:** input + cache_creation + cache_read.
- **Population:** every top-level `*.jsonl` in each session folder (`C--DawnTraderV3-{old,new,analyst,infra,pm}`), plus its `*/subagents/*.jsonl` (helpers), counting entries timestamped inside the window. Lines read and unparsed lines are in the raw file; 0 lines were unparsed.
- **Active crew-hours:** UTC hours with at least one turn by a BUILDING session (CC-A, B, C, INFRA). PM is excluded.
- **Not covered:** Langston, Coltrane and the alert lane, which run on Helsinki and are not in these transcripts. The Codex crew is not covered either.

## Positive control (the 11-05 pack's own window, 2026-10-29 to 11-05)

| session | pack median ctx | re-run median ctx | pack turns | re-run turns |
|---|---|---|---|---|
| OLD | 560.6k | 533.9k | 2,486 | 1,917 |
| NEW | 552.3k | 549.2k | 1,576 | 1,127 |
| ANALYST | 479.0k | 527.6k | 1,550 | 1,241 |
| INFRA | 543.2k | 526.6k | 1,571 | 1,083 |
| PM | 511.2k | 539.2k | 1,248 | 981 |

- **The medians reproduce within 1-10%.**
- **Turn counts are 69-80% of the pack's.** The transcripts were trimmed by hand after 11-05 (CLAUDE.md §3.1), and the pack's window ended at its measuring time, not at 12:00Z.
- **Conclusion:** the instrument measures the same thing. Absolute totals from older windows are lower bounds wherever trimming happened. The baseline window below was not trimmed between capture and now: the trims ran before 11-13.

## Baseline (2026-11-13T11:44Z to 11-16T19:45Z)

| session | turns | total tokens | cache-read share | median ctx/turn | p90 ctx/turn | compactions | helper turns (model) |
|---|---|---|---|---|---|---|---|
| CC-A | 2,672 | 1,338.0M | 99.2% | 458.2k | 831.0k | 13 | 0 |
| CC-B | 1,419 | 537.2M | 98.6% | 345.0k | 583.9k | 12 | 81 (opus-5-5) |
| CC-C | 1,487 | 512.6M | 98.6% | 321.4k | 494.0k | 12 | 0 |
| CC-INFRA | 3,463 | 1,843.9M | 99.3% | 504.0k | 851.1k | 13 | 9 (opus-5-5) |
| CC-PM | 1,368 | 803.7M | 99.6% | 600.8k | 874.3k | 2 | 61 (sonnet-5-5) |

**How the table was counted:**
- **Compactions:** `compact_boundary` and `isCompactSummary` agree inside this window (13/13, 12/12, 12/12, 13/13, 2/2). The 8-versus-13 disagreement seen earlier was over the whole PM file.
- **Active crew-hours:** 73.
- **Building tokens per active crew-hour:** 58.1M. This is the headline rate. It is not a percentage of the weekly allowance, which the transcripts cannot see.
- **Always-loaded bytes per start, resume or compaction** (`instructions-loaded.jsonl`; median by alias):
  - CC-A 195,613 (n 17)
  - CC-B 195,558 (13)
  - CC-C 195,992 (15)
  - unmapped 171,532 (16): the Infra and PM rows, which carry no alias in this log
- **Per-prompt alert injection** (`~/.claude/inject-due-alerts.jsonl`, 2,624 non-synthetic prompts in the window):
  - median 21 due alerts, maximum 38;
  - **the full list was injected on 1,732 of the 2,624 prompts (66%)** (`narrowed=false`);
  - the sink holds counts, not bytes. Each listed alert is one line of about 150-180 characters, so a full injection is roughly 3-5 KB (ESTIMATE). It is **added to the conversation on every prompt and stays there until compaction.**

## Pre-registered acceptance and rollback criteria (each leg read with this same instrument)

| leg | accept when | roll back when |
|---|---|---|
| **A: compact at ~250k** (P1 canary, then P2 rollout) | (1) on each Claude session `get_usage` shows `autoCompactsAtPercent` ≈ 25 (control today: 97); (2) building median ctx/turn ≤ 250k and p90 ≤ 300k; (3) building tokens per active crew-hour ≤ 70% of 58.1M (≥ 30% cut; the 11-05 pack's 64-68% is an upper bound, so 30% is the floor) over ≥ 20 active crew-hours | any P1 continuity check fails, or any session loses its CURRENT POSITION across a compaction (one occurrence) → remove the setting |
| **D: helpers on cheaper models** | ≥ 90% of helper turns on non-Opus models where no model was requested (baseline: B and INFRA helpers 90 of 90 on Opus); the four served-model controls pass | a control fails |
| **B: slim CLAUDE.md** | always-loaded median ≤ 152,000 B per start (−44 KB with CLAUDE.md ≤ 78,000 B); every move-ledger check passes | any rule unreachable for either crew (reachability manifest) → restore that passage |
| **OBJ-6: alert delta** (shadow first) | in shadow, every logged delta matches a recomputed diff for 50 prompts or 3 days; after the switch, the median injected alert lines per prompt fall from 21 to the changed lines only | any alert absent from both the full list and the delta when due → back to the full list |
| **OBJ-7: warnings once** | identical advisory repeats suppressed; `hook-selftest` still reports running | a block or changed violation was suppressed |
