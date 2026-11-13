# Codex to Claude handover — 2026-11-13 — SWITCH-READY

Prepared by PM Codex after Kyle asked to prepare the Claude-PM handover. This record does **not** itself issue a crew-switch order. At preparation time the crew is still in CODEX mode, all five Codex sessions are stopped at safe pushed boundaries under the KD-71 usage hold, `pm-codex-crew-heartbeat` is paused, Coltrane and Langston are disabled, and there is no open crew-switch order.

## Start here — what changed during the Codex shift

The project continued through the pre-live foundation and data-truth work. It did not reach strategy calibration or broad xStock strategy activation. Storage relief and archive integrity produced strong proof; price-feed and missed-cron work exposed additional real verification requirements; the SBT xStock observation remained inside its registered decision window. Nothing in this handover authorizes an automatic strategy-setting change.

The Codex weekly allowance crossed Kyle's 92% stop line at 2026-11-12T13:12:43Z. PM stopped all four builders at safe boundaries, paused the PM heartbeat last, turned Coltrane off, preserved pushed POSITION records, and spent no reset credit. Kyle later reported 6% remaining. Do not restart the Codex crew.

## PM Claude — immediate actions on pickup

1. Read this sheet and each shared `MEMORY_CC_*` POSITION before waking an owner.
2. Keep the desktop Computer Use disable test in force: both desktop Computer Use plugins disabled, `notify = []`, `SKY_CUA_NATIVE_PIPE_DIRECTORY = ""`; Browser and Chrome backend remain enabled. Do not restore or kill the Swift helper without Kyle's instruction. Use browser-scoped Chrome automation only.
3. Turn work back over to the Claude owners in the sequence below. Langston comes back through the authorized crew switch; Coltrane remains the Codex-shift reviewer of record only.
4. Route the new B-CRON-MISSED-CATCHUP failures to ANALYST Claude before it resumes Step 5. Do not acknowledge event-wait alerts merely to silence them.
5. Re-enable only the Claude-side schedules and watchers recorded in PM memory/automation inventory; do not resume the paused Codex heartbeat.
6. A timed observation is not an instruction for an owner to sit idle. Once its boundary captures and watcher are safely armed, move the owner to the next independent eligible batch. If the nominal next batch depends on the pending observation, temporarily skip to the next recorded independent item and return when the evidence matures.

## OLD Claude — storage relief and archive UI dependency

- **Current work:** `B-DB-SIZE-RELIEF`, Step 6 complete; Step 7 is parked on the binding `B-ARCHIVE-WRITER-LIFECYCLE` / issue `#1037` / plan-row-119 dependency that must make the Data Archive UI objective reachable.
- **Why this batch exists:** reduce database pressure without losing historical evidence, prove archives can be restored, and make the archive visible and trustworthy in the product UI.
- **What Codex proved:** reviewed deploy `957b13fde2fdb9b9c12791699b8fabeaa3a9afed`; partition creation passed; the sweep examined 22 partitions with zero failures; 36,117,551 rows were archived; 22,374,408,192 hot bytes were dropped; 16/16 manifests were verified; the database measured 119,199,132,819 bytes, 19,442.8 MiB below the warning line.
- **What remains:** signed-in 30-day Data Archive UI returned an AbortError. Do not retry or pass Step 7 until row 119 or a separately reviewed/deployed equivalent makes OBJ-2 reachable. Preserve the deploy hold at and after `a2f5cbc6d`.
- **Related finding:** repeated pool-wait alert `bfc4d89c` self-cleared. OLD measured 36 same-key rows since Nov. 8, 35 naming the xStock ticker-snapshot path, and folded the recurrence into existing `B-DB-POOL-GUARD` Step 7 / `#1239`; no duplicate issue or code change.
- **Pushed stop:** shared branch `migration/aws-supabase`, stop ref `43edb402df4d40abe041be545166c5b88941dbc2`; current shared tip also contains later PM-only handoff records. Only local `.claude/launch.json` was preserved outside tracked work.
- **Plan alignment:** correct foundational work. It is waiting on another owner, not stalled or drifting.

## NEW Claude — price-feed proof, entry gate, and SBT observation

- **Current work:** `B-PRICE-FEED-COVERAGE` increment 0, Step 7; Step 8 is forbidden until one complete registered U.S. regular session proves continuous runtime, a positive exact dispatch delta, and a natural `cold_tick` carrier. “Complete” describes the experiment's evidence, not general app uptime.
- **Why this batch exists:** prove the engine receives and classifies the price/depth evidence the later entry gate and strategy evaluation rely on. It is one part of the data-truth chain, not the final trading fix.
- **What Codex proved:** `e7ef8413efb59bbeb757aca18a0770c5ffb960ae` deployed on Nov. 11; exact-ref CI was four-job green; pre-window evidence showed two dispatches and two stale-book controls but no natural cold-depth carrier.
- **Why earlier windows do not qualify:** Nov. 11 was genuinely interrupted by normal crew deployments/restarts, including restart 691 at 17:16:25Z inside U.S. regular hours; the later inc-0 and ANALYST deployments advanced the process through restarts 693 and 694 in that same already-invalid session. Nov. 12 is different: no interruption was established, but the KD-71 allowance stop occurred at 13:12Z before the 14:30Z open, so NEW did not preserve the registered start and end snapshots. The app running 24/7 cannot substitute for those missing experiment boundaries.
- **FRIDAY NOV. 13 RESERVED WINDOW — DO NOT MISS:** preserve raw no-cache start evidence immediately before 14:30Z and end evidence after 21:00Z (15:30-22:00 Warsaw), with the same PID, rising uptime, restart delta zero, a positive exact dispatch delta and the natural `cold_tick` carrier. Treat 14:30-21:00Z as deploy/restart-free for all owners unless an operational emergency outweighs the observation. If any unavoidable restart occurs, declare the window invalid and repeat; do not blend partial windows or infer success from app uptime.
- **Next batch:** `B-ENTRY-GATE` increment B — complete the entry-admission data and behavior contract so later xStock strategy observations and calibration are based on trustworthy accepts/refusals.
- **SBT xStock observation:** `B-SILENT-STRATEGY-CENSUS` remains Step 10. Last recorded read (2026-11-11 21:55Z) had 15 filled closes, mean net return -0.337373%, four winners, seven taker and eight maker closes across two UTC dates. This means **keep observing**, not kill and not promote: it had not reached 20 filled closes and was above the -1.5% early-stop line. The registered end rule remains 20 closes (pass if mean >= 0; fail if mean < 0), early stop at n>=10 and mean<=-1.5%, or Nov. 28 backstop. Strategy remains ON; every end is reported to Kyle; there is no automatic switch-off.
- **Additional xStock strategies:** KD-57 still puts the other four candidates after the entry-gate verification, one at a time. KD-73's new baseline research gates SBT/xStock target-geometry or `min_rr` action only; it does not gate those four other candidates.
- **Weekend capacity observation:** NEW retains technical and policy ownership of existing plan row 166b, `B-XSTOCK-WEEKEND-POSTURE`, but INFRA Claude is the read-only evidence collector so NEW's price-feed/entry-gate work is not displaced. After Friday's xStock close and NEW's price-feed end capture, INFRA counts total open slots, xStock positions held across the closure, crypto positions and unused capacity; identifies qualified crypto attempts refused specifically because capacity was full; and compares the same measures over prior weekends. It distinguishes a slot-capacity block from every other refusal reason and hands the evidence to NEW. Report whether weekend xStock holds repeatedly crowd out crypto and how long those xStocks remain open. This is evidence for a later cutoff/close-policy decision, not authority to close positions or change the live policy.
- **Pushed stop:** branch `migration/b-price-feed-coverage-inc0-codex`, ref `43edb402df4d40abe041be545166c5b88941dbc2`, no unpublished tracked work; local `.claude/launch.json` preserved.
- **Due on pickup:** daily SBT read alert `b7a96f04` is due. Read the full registered population before applying the decision rule.
- **Plan alignment:** correct work, but the usage stop forced a new observation window rather than a conclusion.

## ANALYST Claude — missed-cron recovery repair and pricing waits

- **Current work:** `B-CRON-MISSED-CATCHUP` Step-11 repair, Step 4 complete; next Step 5 exact-head CI and continuation through deploy/runtime proof.
- **Why this batch exists:** ensure missed scheduled jobs are recovered exactly once and that monitoring distinguishes real misses from successful slower or legacy-timestamp jobs. This is foundational feed/data reliability, not strategy calibration.
- **What Codex achieved:** after multiple send-backs, the final R10 package fixed the exact-current evidence contract: accept a succeeded durable occurrence or an exact cron/missed-catchup audit row carrying the occurrence id, while keeping the preboot legacy case partition-shaped. Implementation ref `32b2c5e28b...`; review/package tip `59f9f13fae...`; focused proof and earlier exact-head CI were green.
- **Important post-stop result:** Coltrane APPROVED exact ref `59f9f13fae...` at 2026-11-12T13:14:29Z and repeated at 13:15:32Z that Step 4 was cleared. Do not wait for another Coltrane answer; record the approval and run Step 5.
- **New runtime failures after the stop:** five `feed_integrity_cron` recovery attempts at 21:00, 21:05, 21:10, 21:15 and 21:20Z failed with `duplicate key value violates unique constraint "unique_global_alert"` (`31cb8ae3`, `f6fb55f0`, `b65b566c`, `e32f90d7`, `adcd3614`). Stale-fire alerts `7dfa0ce2` and `a3917180` show missed occurrences still open. Inspect the durable occurrences and alert-key behavior before retrying; PM makes no technical ruling.
- **Other preserved waits:** KD-19 first qualifying live unpriced close alert `7e20ed0f` stays active and unacknowledged; xStock bar-availability certification continues toward the Nov. 18 gate; `#1250` still needs its registered evidence/UI completion, which should use browser-scoped signed-in staging if authentication remains valid.
- **Pushed stop:** review branch `review/b-cron-missed-catchup-step8-r9-codex`, stop ref `fdcfb79854ec9425d01823b3026d54daf2c4d13d`, 0/0 at stop. Preserve `.claude/launch.json` and the withheld completion-report draft as untracked local files.
- **Plan alignment:** correct pre-sprint reliability work. The new failures are additional evidence inside the same problem, not project drift, and they mean the batch is not closed.

## Infra Claude — disk headroom proof and the next safeguards

- **Current work:** `B-DISK-HEADROOM`, Step 9; Step 10 is allowed only after the scheduled 2026-12-01 02:05Z direct pre-sweep peak and table-size comparison.
- **Why this batch exists:** keep the database and host within safe storage headroom while proving archival removal is complete, reversible and lock-safe.
- **What Codex proved:** Stage B freed 28.35 GB across a 22-child run with zero failures, 21/21 manifests, a 113,256-row May 1 rehydration hash match, and 515 lock-sampler ticks with zero waits/failures. The Nov. 12 production run dropped 14 target children / 14.83 GB within a 19-child / 18.52 GB sweep, with 14/14 manifests and 528 sampler ticks without a failed, waiting or denied lock.
- **What remains:** wait for alert `f8188c60` on Dec. 1; no earlier Step-10 claim.
- **Next batch:** `B-AGENT-INVOKE-FAILURE-NOTICE` Step 6 — make reviewer/agent invocation failures durable and visible. It was blocked only because its installer would enable Langston while the Codex crew had him off; Claude mode unblocks it. After that: `B-SIZE-WATCH-BREACH-ALARM` (alert when storage/headroom thresholds are breached), then `B-DEPLOY-WINDOW-GUARD` (prevent deployment outside approved safe windows).
- **Bounded weekend assignment (KD-74):** at the first safe boundary after Friday's 21:00Z close, collect row 166b's read-only xStock-slot/crypto-capacity evidence and prior-weekend comparison, then hand it to NEW and resume the recorded Infra queue. Do not make the trading-policy decision or change live behavior. The fresh comparative slot checks found this is less disruptive here than on OLD or ANALYST; it may briefly defer only the next eligible Infra step.
- **Standing alert:** token-watch store `7b19347d` was approximately 7.71 GB, above the approximately 6.44 GB warning and below the approximately 8.59 GB cap; do not resolve until below the registered threshold.
- **Pushed stop:** branch `migration/b-disk-headroom-step7-final`, ref `287dd74ba6f9f347233738aaf67a1e80bbe8ba10`, clean and 0/0 at stop.
- **Plan alignment:** correct work. The base batch is legitimately time-gated; Claude mode opens the separate agent-failure-notice work.

## PM Claude — decisions, plan and operating state

- **KD-73:** Coltrane agreed that the missing Nov. 6 SBT/xStock-specific reputable-practice comparison is restored as `R-SBT-XSTOCK-PUBLISHED-BASELINE`, prerequisite to sprint row 129 / roadmap 25-17 and any row 131 / 25-20 action touching SBT xStock `min_rr`. Preserve KD-57/O3, the active SBT observation and all live settings. Research may start after higher-priority data-truth work; its transferability verdict waits for the clean post-entry-gate SBT window. NEW owns current-setting/mechanism provenance and plan integration; ANALYST owns published-practice and DawnTrader empirical comparison; Langston reviews transferability. No live setting changes are authorized.
- **Open Kyle decisions:** row-172 `B-TEC-PRIME-BOOT-RACE` reassignment from INFRA to NEW after `B-ENTRY-GATE` increment B (group recommendation: approve); Apr-Jul conversation-archive expansion after live (recommend approve after live, first read-only overlap count, then deduplicate only if material); B-PRICE-SIDE-BY-JOB 8c switch-on waits for ANALYST's plain-language flow/risk report; issue `#1201` pull-forward remains recorded as unanswered. Do not re-ask without checking `DECISIONS.md` and the PM archive.
- **Plan view:** the project is still progressing through pre-live foundations: storage, archives, price/feed truth, scheduler recovery and entry-admission truth. The evidence is converging, but runtime proof continues to expose prerequisites and failure modes. It is not yet at broad strategy activation or profitability calibration.
- **Decision reconcile:** the 2026-11-13 run found 73 decisions and 13 historical anchor mismatches. These are reconcile/reporting debt, not new Kyle decisions; do not silently rewrite decisions during pickup.
- **Desktop test:** continue browser-scoped Chrome only. The signed-in staging tab is normally in one of Kyle's two long-lived Chrome windows; inspect both browser windows/tabs by Dawn Trader title or `https://188.245.193.8.sslip.io/`, never by the currently active ESPN/Athletic title.
- **Automation:** leave `pm-codex-crew-heartbeat` paused. Recreate/re-enable Claude-side monitoring from the Claude inventory only after the crew switch is complete.

## Alerts to route immediately, without blanket acknowledgement

- ANALYST: the seven missed-cron failure/stale-fire rows listed above; VTS unpriced close `efa192ad`; shadow count `f2d0244c`; KD-19 `7e20ed0f`; xStock bar tallies/final gate.
- NEW: SBT daily read `b7a96f04`; entry-gate stale-governance row `9d1acdd9` after current position is reconciled.
- OLD: database pool-guard/stale-governance rows remain with the existing batches; do not create duplicates.
- INFRA: token-watch `7b19347d`; Dec. 1 disk-headroom carrier `f8188c60` remains the Step-10 gate.

## Memory and exact-copy record

After CI run `43385164986` passed all four jobs at handoff ref `226a217bd55bc6d8dfcf4e253002d78f0959129b`, PM Codex replaced all five outside Claude copies from the pushed `origin/migration/aws-supabase` blobs. Each outside copy exactly matched the pushed repo blob:

| file | outside size | repo size | SHA-256 (both copies) |
|---|---:|---:|---|
| `MEMORY_PM.md` | 9.991 KB | 9.991 KB | `b49fbe604cde5f1ac4edb2d3b7aa5f38f432879737afb9695996e8ada28bb065` |
| `MEMORY_CC_A.md` | 24.071 KB | 24.071 KB | `fbda563eabbeb0bde8ad7bfe5897c89e07e2d3582a165d9bb77d4550ad613ea7` |
| `MEMORY_CC_B.md` | 23.396 KB | 23.396 KB | `23867d1cc9a0a9df1bf77d906f6d599ca6b4c40bb846da836b1d5174c366a071` |
| `MEMORY_CC_C.md` | 33.000 KB | 33.000 KB | `7379174eca597bd815de3b6251a1201aa67d79fbf4e312abc75027ba7d4c960d` |
| `MEMORY_CC_INFRA.md` | 24.543 KB | 24.543 KB | `294d389ec9bcfff3a4d925083a2ecbe6e02d66f414074b2f1fc446607a74a4cc` |

`MEMORY_CC_C.md` is still above its 24.576 KB loaded-notebook cap. ANALYST Claude should prune whole closed items into its archive before adding more notebook history; do not replace this exact current copy with an older shorter one.

## Exact next action

Once this sheet, the shared POSITION copies, PM memory and session log are pushed with four-job green CI and all five outside copies match, Kyle can authorize the actual switch with **`SWITCH TO CLAUDE`**. PM Codex then runs `crew-switch start claude`, verifies all five Claude acknowledgements, and tells PM Claude: `We're back on Claude. Handover sheet: 1-system-manual/pm/handovers/2026-11-13_codex-to-claude.md`.
