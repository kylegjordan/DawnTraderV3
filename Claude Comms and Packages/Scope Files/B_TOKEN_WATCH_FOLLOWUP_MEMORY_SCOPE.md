# B-TOKEN-WATCH-FOLLOWUP-MEMORY — SCOPE r1

change-class: non_architecture

**Issue:** `#1132` (and its riders). **Owner:** Infra Claude (CC-INFRA). **Placement:** `SPRINT_TO_LIVE_PLAN.md` §0a, Infra Claude order 5 (Kyle 2026-11-04, after the Langston size work). **Parent:** `B-TOKEN-WATCH` (paused, after live); this batch makes its follow-up sweep safe to switch back on. It does NOT point the Helius feed or clear the Alchemy switch (pre-registration amendment 15) — those stay with the parent.

> **Class:** `non_architecture`, on the same reasoning as `B-TOKEN-WATCH-STORAGE` amendment 1's sibling batches: no trading architecture, strategy, regime, filter, pipeline or math. The SIM applies (OBJ-6 of the storage batch writes the token-watch entry; this batch adds to it).

## 0. What happens today, measured 2026-11-05 on staging (read-only)

- `token-watch-followup.timer` is **disabled** (since 2026-09-30, `#1132` immediate mitigation). Its cursor (`state/follow_up_cursor.json`) reads `2026-09-30T13`.
- **The unit already has `MemoryMax=512M`** (in the repo since `e0ddfa437`, 2026-08-29, *"B-TOKEN-WATCH Step-6: the units, and the isolation that replaces the fence"*) and, since yesterday, `OnFailure=token-watch-failed@%n.service` (`310132582`, the storage batch).
- ⚠️ **So `#1132`'s premise needs correcting, and this batch does it in the ledger:** the `Result=oom-kill` of 2026-09-30 was the unit hitting ITS OWN 512 MB cgroup limit, which kills only that cgroup — not the kernel OOM killer choosing among the box's processes. The trading app was not exposed by it. `#1132`'s plan items (b) (`MemoryMax=`) and (c) (`OnFailure=`) are **already done**; (a), the cause, is not.
- **The cause is not established, and reading the code does not settle it.** The largest file the pass loads is `dead/dead.jsonl` (258,564,193 B, 766,794 rows), but `dead_set()` streams it (`store._read` is a generator) and keeps only the mint strings — on the order of 100 MB, not 512. The pass also loads `state/last_seen.json` (7,885,869 B, parsed whole), and walks every due bucket since its cursor. **A cause is a claim; this scope makes it a measurement (OBJ-1), not a guess.** The box has 3,814 MB with ~2.5 GB available (`free -m`, today).
- The journal starts 2026-10-11, so the September kills' own logs are gone.

**What has accumulated while the job was off (carried in from `B-TOKEN-WATCH-STORAGE` and Langston's rulings):**
- 851 due buckets since the cursor that were never read (1.016 GiB);
- the outcome record stopped on 2026-09-30, so every checkpoint published since then carries no evidence, and the summary still shows those tokens as survivors (`#1132` rider, 2026-11-05);
- the feed gap of 2026-10-18 → 10-27 (`#1247`);
- `state/liveness.json` gains a second writer once the storage batch's feed watch is live (`#1132` rider C-4).

## 1. Provenance read

- **`follow_up.py`** came in `bdb688284` (2026-08-28): *"B-TOKEN-WATCH Step 3 (2/2): receiver, scheduler, tiering, units - 54 checks, every block controlled"*. Its catch-up bound (`CATCHUP_MAX_BUCKETS = 48`) and the "first run reads only this hour" rule are documented in its own docstrings (`follow_up.py:111-156`). Disposition (2): relevant, needs its memory bound and its outage handling.
- **The memory limit** (`MemoryMax=512M`) came in `e0ddfa437` as part of the isolation that let the study share the trading box. Disposition (1): correct; it did its job on 09-30 by killing only the study.
- **Corpora searched:** `RUNNING_ISSUES` (`#1132`, `#1246`, `#1247`, `#986`), the `B-TOKEN-WATCH` pre-audit and pre-registration (amendments 1-15), `B-TOKEN-WATCH-STORAGE` scope and pre-audit. `bridge/canonical/`: no coverage (the study postdates the governance change).

## 2. Objectives

**OBJ-1 — find the cause, by measurement.** Run one follow-up pass in a scratch store copied from the live one (same `due`, `dead`, `state`, `births`), with every outbound network call stubbed to a fixed reply, under `tracemalloc` and with `MemoryMax=512M` held, and report the peak and the top allocation sites. **Done when:** the allocation that crosses 512 MB is named with its line, and its size is reproduced on a second run; or the pass completes under 512 MB, which itself is a finding (then the September cause was the 09-30 data, and the measurement says so).

**OBJ-2 — fix the cause structurally**, at the allocation OBJ-1 names (stream instead of load, bound the batch, or index instead of scan). **No raising of `MemoryMax`** as the fix: the cap is the study's isolation from the trading box. **Done when:** the same scratch run peaks under half the cap, with the number stated.

**OBJ-3 — decide the 36-day backlog before the timer returns.** If the job is simply re-enabled it walks 851 never-read buckets at 48 an hour (~18 h), observing tokens a month after the checkpoint they were scheduled for, and recording them as that checkpoint. The study's question needs a measurement at the scheduled age, so a late observation is not that checkpoint. **Proposed:** do not catch up; move the cursor to the current hour in one recorded step, write the skipped window into the pre-registration as an append-only amendment (checkpoints scheduled 2026-09-30T13 → the restart hour are NOT OBSERVED), and let the storage batch's cursor-bounded prune clear the skipped buckets once spent. Langston to rule; Kyle only if the study's design is his to change.

**OBJ-4 — one writer for `state/liveness.json`** (`#1132` rider C-4). Once the storage batch's feed watch runs, `follow_up` stops calling `liveness.check()`: the feed watch is the dead-man's switch. **Done when:** a repo-wide grep finds one production caller of `liveness.check()`, and a test drives `run_hour` and asserts it did not touch `liveness.json`.

**OBJ-5 — an uninstrumented checkpoint renders as NOT INSTRUMENTED, never as alive** (`#1132` rider, Langston). The summary's `alive/by_age` and `died/by_age_at_death` for a checkpoint with zero observations in the window publish "not instrumented"; `oldest_survivors` excludes tokens with `observed_at: null`. **Done when:** today's state renders the 30d and 90d checkpoints as not instrumented (they read 511,996 alive and 0 died today), with a test fixture that has observations rendering numbers.

**OBJ-6 — the B2 version census and orphan reconciliation** (`#1132` rider, Langston Step 9 item 3). A read-only tool lists every version under `token-watch/cold/` (`b2_list_file_versions`, because the key can hide) and reconciles it against the manifest: each manifest row matches exactly one live version by file id; any other version is an orphan, named with its upload time. Removing an orphan is a separate, recorded step. **Done when:** the census runs and reports, with a seeded orphan in a test bucket found and a clean case reporting zero.

**OBJ-7 — the closed-month spend journals** (`#1132` rider, Langston). `state/spend-journal-<month>.jsonl` is ~260-287 MB a month and never leaves the box. Once a month is closed and folded (`budget._drain_previous_month`), its journal moves to the cold tier and off the box like the other cold archives. **Done when:** the September and October journals are off the box, verified by the manifest, and the burn monitor still reads the current month.

**OBJ-8 — switch the timer back on and measure what the storage batch could only project.** Re-enable under the memory fix; then measure, over the first 7 days, the write rates of `observations`, `provenance/follow-up` and `due`, and the store against its 8 GiB cap. **Done when:** 7 daily store-watch readings are recorded with the per-folder split; if the forecast crosses the cap, the next step is the disk conversation with Kyle (Langston, 2026-11-05), not a cap change.

**OBJ-9 — governance:** the token-watch SIM entry (unit, memory profile, one liveness writer, the census); `STORAGE_POLICY` (the journals' cold path); the pre-registration amendment (OBJ-3); `#1132` corrected (§0) and closed; my task list; the completion report.

## 3. Out of scope, with its home
- Pointing the Helius feed and the Alchemy switch: `B-TOKEN-WATCH` (paused, after live).
- Why the feed stopped 10-18 → 10-27: `#1247`, a decision with Kyle.
- `(mint, observed_at)` not unique: `#986`, outcome (2), unchanged.

## 4. What I want attacked
1. **OBJ-3's "do not catch up".** Is a month-late observation worth recording at all, under a separate label, rather than dropped?
2. **OBJ-1's stubbed network.** Could the real allocation be in a response-handling path the stub cannot exercise (a large DexScreener batch)?
