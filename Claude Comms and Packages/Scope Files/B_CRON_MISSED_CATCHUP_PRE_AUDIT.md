# B-CRON-MISSED-CATCHUP — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: architecture

**Batch:** `B-CRON-MISSED-CATCHUP` · **Issue:** `#691` · **Owner:** CC-C / ANALYST Codex · **Reviewer:** Coltrane for this Codex shift · **Code ref audited:** `origin/migration/aws-supabase` = `b65ed5b6872961ce964b800fae647447d1dcac5f` · **Runtime/DB reads:** staging, 2026-11-12 02:09–02:22Z.

## 0. PREVIOUSLY-STATED-VS-NOW

- **PREVIOUSLY STATED: the Step-1 fire-evidence population was 94,849 rows for the six production node-cron jobs. NOW: 94,868 rows at 2026-11-12T02:21:48.311745Z. REASON:** the live five-minute and hourly schedules continued firing normally during the audit; this is 19 additional rows in the same named six-job population.
- **PREVIOUSLY STATED: all 94,849 six-job rows used `scheduled_for = fired_at`. NOW: all 94,868/94,868 still do. REASON:** every current wrapper creates one `new Date()` and supplies it as both fields; no true schedule boundary is stored yet.
- **PREVIOUSLY STATED: `scheduled_tasks_audit` should carry durable per-occurrence decisions. NOW: it remains terminal, failure-tolerant fire evidence; a new narrow occurrence ledger carries admission and decisions. REASON:** its writer deliberately swallows database failure after work and has neither a unique occurrence key nor claim/running states, so using it as the correctness gate would contradict its existing contract and could admit duplicate side effects.
- **PREVIOUSLY STATED: a later successful fire may be accepted as recovery evidence for an earlier `cron_stale` occurrence. NOW: only successful execution of that exact scheduled occurrence auto-resolves its exact stale key. REASON:** a later current-state run proves the scheduler is alive but does not perform or reconstruct the missed work; failed, skipped and indeterminate occurrences remain active for a human disposition.
- **PREVIOUSLY STATED: recovery is a missed-event path added beside the normal callbacks. NOW: natural and missed events must enter the same occurrence runner and per-job serialization boundary. REASON:** otherwise the library's late natural callback and its missed notification can race and both perform one occurrence; Coltrane made this an explicit Step-2 gate after Step 1.

## 1. Audit conclusion

The scope is valid, and the defect has two proved mechanisms: node-cron 4.2.1 can skip a boundary after a wall-clock step, and it can skip when the event loop wakes after the scheduled second. The current registry observes schedules but cannot execute them; the current fire-evidence table records completed callbacks but cannot admit work safely.

The implementation will add one durable `scheduled_job_occurrences` row per `(job_name, scheduled_for)` and one execution lane per job shared by natural, missed, boot and manual paths. A database uniqueness constraint admits each scheduled identity once; the lane serializes it with every other invocation for that job. The runner records the true calendar boundary, actual start and finish, source, lag, policy decision and terminal state. `scheduled_tasks_audit` remains the compatible completed-execution stream read by the verifier and Formula Health.

Recovery is intentionally bounded. Every missed boundary receives a durable decision, but only recent work whose current inputs still truthfully represent that boundary may run. Backlog bursts, historical Q-D fabrication, parallel provider sweeps and blind retries after an uncertain crash are refused. A deterministic staging harness proves the mechanism at the deployed ref; no host-clock change or multi-day observation gate is required.

## 2. Six-source read and evidence boundary

All required sources were read at the fixed ref above.

| # | Source read | What it established |
|---|---|---|
| 1 | **Actual code and installed dependency:** registry, next-fire helper, fire writer/verifier, arm smoke/logger, all six wrappers and inner jobs, bootstrap/manual routes, node-cron 4.2.1 runner and inline task | Exactly six production schedule sites; callback and side-effect boundaries; node-cron advances the expected date before emitting `execution:missed`; `TaskContext.date` is the natural scheduled boundary. |
| 2 | **Runtime logs and database:** rotated PM2 logs, table schema/indexes/counts/statuses, 7/30-day fires, gaps and runtimes | The audit stream is live and large, has no occurrence uniqueness, uses the wrong clock in every six-job row, and contains job runtimes/side effects that rule out one universal replay policy. |
| 3 | **System Impact Map:** B-NEW-49 scheduler layer, Q-D, universe-discovery and feed-integrity entries | Registry/arm/audit/verifier topology and downstream blast radius; current map still says five sites/seven schedules and old fixed-interval verifier semantics. |
| 4 | **System Manual:** scheduled-job evidence, feed integrity, awareness/post-audit review and dynamic-universe chapters | Original forensic role of the audit table, authoritative feed monitor, awareness mutations, universe provider sweep, and stale claims that the audit store has no production reader and low growth. |
| 5 | **Ledger, batches and reports:** `#691`, withdrawn duplicate `#1185`, B-NEW-36/49/51/52, P19-B5c, verifier-query-fail scope/report | Both miss mechanisms, exact alert interlock, original observability contract, and the requirement never to auto-resolve `cron_verifier_blind`. |
| 6 | **`bridge/canonical/` and git origins:** target-term corpus search plus introducing commits `00945ddf`, `c7529f1`, `c491a6f`, `2303485`, `a7887c2`, `b4ca15d`, `dc83501` | The canonical pre-governance corpus has no material coverage; git history proves the six business purposes and that B-NEW-49 added detection, not recovery. |

This is a server-side scheduler batch. There is no user-facing scheduler screen and no UI path exercises occurrence admission, so UI is N/A; API/log/database/harness proof is required.

## 3. Entry points first — production census

Repository-wide enumeration, tests and `scripts/inventory/**` excluded, finds **exactly six** production `cron.schedule` calls:

| job | schedule owner | production starts | other work entry points |
|---|---|---|---|
| `formula_audit_cron` | `formula-auto-audit.ts` | server boot starts the daily 03:00 UTC schedule | admin manual route calls the same audit purpose but is not a scheduled occurrence |
| `feed_integrity_cron` | `feed-integrity-auto-check.ts` | server boot starts configured five-minute cron; a separate boot timeout performs one check | admin manual route performs one check |
| `awareness_state_update_cron` | `awareness-scheduler.ts` | server boot starts hourly cron; a separate boot timeout updates state | no second cron |
| `awareness_reflection_cron` | `awareness-scheduler.ts` | server boot starts six-hour cron | admin reflection route invokes the reflection purpose |
| `xstock_qd_probe_cron` | `xstock-qd-probe-cron.ts` | server boot starts configured cadence, currently five minutes | no production manual route |
| `xstock_universe_discovery_cron` | `xstock-universe-cron.ts` | server boot starts daily 06:00 UTC schedule | admin manual discovery route performs one sweep |

There is one PM2 application process on staging and one boot registration for each schedule. Manual and boot work remain outside scheduled occurrence identity, but they call the same side-effecting cores: feed and awareness-state have boot-time calls, while formula, feed, reflection and universe have manual routes. Every production caller therefore enters the same per-job execution lane. Scheduled natural/missed work receives durable occurrence identity; boot/manual work receives an invocation ID and serialization but never a fabricated scheduled boundary.

The separate interval-based `scheduler-registry`, lifecycle polling, verifier `setInterval`, boot smoke test and manual routes are not additional node-cron schedules and do not gain missed-occurrence replay in this batch.

## 4. Component census at each shared-state hop

### 4.1 Registry and calendar helpers

- **Writers:** exactly six registration sites call `cronRegistry.register` after `cron.schedule` returns.
- **Readers:** arm smoke, arm logger and fire-evidence verifier read registered metadata/handles.
- **Mutators/deleters:** registration inserts into an in-memory map; duplicate names are warned and ignored; no production code deletes a registration.
- **Starters:** server bootstrap calls each owning initialization path once.

`cron-next-fire.ts` is the one calendar-aware previous/next occurrence implementation. The missed event date is not the missed boundary: node-cron 4.2.1 advances `expectedNextExecution`, then calls `onMissedExecution`, and the inline task emits that advanced date. Recovery must compute the previous schedule match and prove it is earlier than the event date and exactly on the expression/timezone.

### 4.2 `scheduled_tasks_audit`

- **Writers:** the six wrappers plus older non-node-cron lifecycle evidence paths call the shared writer or equivalent SQL.
- **Production readers:** the cadence-aware fire verifier and Formula Health read completed rows; operator SQL and governance use them too.
- **Mutators/deleters:** the shared writer is append-only; no production update/delete path was found. Positive control: the repo census finds real update/delete paths for `system_alerts` and lifecycle tables.
- **Indexes:** primary key plus `(task_name,status,fired_at DESC)`; there is no unique `(task_name,scheduled_for)` constraint.

The writer is explicitly failure-safe: it catches database errors because the job work has already happened. That is correct for terminal observability and incorrect for admission. The new correctness ledger therefore cannot be an overloaded status row in this table. Completed natural/catch-up executions still append a success/error audit row so existing readers remain compatible; claims and skips do not masquerade as fires.

### 4.3 Job state and side effects

| job | data clock | important side effects | present overlap/idempotency result |
|---|---|---|---|
| formula | current formula/config/database state at execution | report files and formula-warning/failure system alerts | manual/natural paths are not globally idempotent; no automatic retry after `running` |
| feed integrity | current feed/monitor state after up to 30 s jitter | report, alert acknowledge/create, monitor-state update | a historical check is meaningless; duplicate alerts hit a live unique-key failure today |
| awareness state | current app/account state | inserts awareness log row and broadcasts | insert/broadcast is repeatable side effect, not exactly-once |
| awareness reflection | latest awareness state at execution | updates latest row and broadcasts | repeated reflection changes state/broadcasts |
| Q-D probe | current quote/depth snapshots, stored in scheduled fire bucket | inserts per-symbol probe history; key conflict is ignored | storage key is idempotent, but old replay with current inputs is semantically false |
| universe discovery | current CoinGecko/Kraken/Finnhub responses | provider calls, universe upserts/delists/cache and discovery-run row | expensive external sweep; not safe to overlap or blindly retry |

### 4.4 System alerts

The verifier mints one `cron_stale:<job>:<occurrence>` key. `system-alerts` already supports exact-key resolution with actor/evidence, so no second alert store is needed. Successful execution of the exact occurrence resolves only that key after the terminal ledger and fire-evidence writes. A failed, skipped or indeterminate occurrence remains active and receives recovery metadata/its own failure signal. The `cron_verifier_blind` family is neither queried nor resolved by recovery code.

## 5. Runtime findings

### A1 — Current evidence has no true boundary or admission identity

At 2026-11-12T02:21:48.311745Z the whole `scheduled_tasks_audit` table held 95,304 rows; the named six-job population held 94,868 rows, and 94,868/94,868 had `scheduled_for=fired_at`. The six-job counts were: feed 47,198; Q-D 42,759; awareness state 3,934; awareness reflection 653; formula 162; universe 162. The schema has no unique occurrence key. **Falls to P1–P4.**

### A2 — One replay policy cannot be truthful for all six jobs

Over the last seven days, observed completed-run p50/p99/max runtimes were: formula 165/211/212 ms; feed 175/1,203/8,625 ms; awareness state 530/1,622/1,717 ms; awareness reflection 292/632/672 ms; Q-D 4,458/12,289/65,878 ms; universe 596,700/733,499/741,785 ms. These are named completed-row populations, not scheduler-delay measurements.

The current-state jobs cannot reconstruct historical inputs. Q-D is the sharpest case: its unique storage key prevents a duplicate row, but it does not make current snapshots truthful evidence for an old fire bucket. Universe discovery's observed maximum is 12.36 minutes and calls three external providers. **Falls to P3, P5 and P8.**

### A3 — Recent gaps show exposure, not a cause count

In the 30-day completed-row population there were seven feed gaps and three Q-D gaps greater than 1.5 cadence, with maxima 19:39.948 and 19:59.997. The same query positively returned all six jobs and 8,631/8,635 five-minute rows. These gaps are not labelled missed callbacks and can include deploy/restart time, so they are not used as a count of node-cron failures. The proved cause remains the October log/ledger evidence in `#691`. **Falls to P7 and P9.**

### A4 — Normal, missed and auxiliary work must share the same gate

Node-cron advances the missed expected date and launches its missed listener without awaiting it, then proceeds to the natural `checkAndRun(currentDate)`. Using the advanced event date directly creates a false same-occurrence collision; correctly taking its previous schedule match produces adjacent occurrences that can still execute concurrently. The uniqueness constraint is useful only when every scheduled occurrence, including natural fires, enters admission before work. The per-job lane must also wrap boot/manual callers, because they reach the same cores without node-cron's `noOverlap`. **Falls to P2–P5.**

### A5 — Crash truth stops at the side-effect boundary

The ledger can distinguish `claimed` from `running` before it calls a core. A crash while merely claimed can be retried because no core was entered. Once `running` is durable, none of the six full jobs has an end-to-end idempotency proof covering all side effects. An unfinished running row therefore becomes `indeterminate` at reconciliation and blocks automatic retry. Q-D's row conflict alone does not cover snapshot truth or audit/alert side effects. **Falls to P1, P4, P6 and P8.**

### A6 — Fire evidence and decisions are different populations

Formula Health needs the latest completed formula result. The verifier needs completed execution evidence. A skip, duplicate refusal or claim is neither. Keeping those decisions in a separate ledger means legacy readers need only accept corrected boundary/source metadata on success/error rows; they do not need status filters for a new class of non-fire records. **Falls to P1, P4 and P7.**

### A7 — Exact stale-alert recovery is narrower than scheduler recovery

The alert body promises automatic clearing, but the verifier contains no resolve call. A later natural occurrence proves liveness only. The implementation will resolve `cron_stale:<job>:<scheduled_for>` only after that same occurrence reaches `succeeded` and its fire row is attempted. If policy records `skipped`, `failed` or `indeterminate`, the stale row remains open for a human evidence decision. `cron_verifier_blind` stays manual-only. **Falls to P7.**

### A8 — Governance is stale in both directions

The System Manual still calls `scheduled_tasks_audit` operator-only with no production reader and low annual growth; the current table has 95,304 rows and two production readers. The System Impact Map still describes five sites/seven schedules and the old interval-times-1.5 verifier; production has six node-cron schedules and a calendar-aware verifier. Awareness documentation says its write paths are unknown even though current code proves log insert/update and broadcast side effects. **Falls to P10.**

### A9 — Provenance preserves business purpose and changes only execution truth

B-NEW-49's origin explicitly added observability and a safety net; it did not add recovery. The six introduction commits establish a daily formula audit, five-minute feed monitor, hourly/six-hour awareness work, five-minute capture-only Q-D probe and daily provider discovery. The plan keeps those purposes/cadences and adds one execution contract around them. `bridge/canonical/` has no coverage of these later components and supplies no conflicting architecture. **Falls to P2–P10.**

## 6. Reviewed per-job recovery policy

Every missed event is processed in boundary order and receives a ledger decision. `max backlog = 1` means at most the newest still-eligible occurrence may execute; older boundaries are first recorded `skipped_backlog_cap` so the queue cannot silently discard them. All eligibility is checked again when the occurrence reaches the head of the shared FIFO.

| job | maximum executable lag | max executable backlog | eligible work | skip/refusal reasons | crash-after-running |
|---|---:|---:|---|---|---|
| formula | 6 hours | 1 | one delayed current-state daily audit, labelled `missed_catchup` | `too_old`, `backlog_cap`, `overlap`, `claim_unavailable` | `indeterminate`; no automatic retry |
| feed integrity | 4 minutes | 1 | one current-state check; apply existing 0–30 s jitter only when enough time remains before next boundary | `next_boundary_imminent`, `too_old`, `backlog_cap`, `claim_unavailable` | `indeterminate`; no automatic retry |
| awareness state | 30 minutes | 1 | one current-state update, serialized with natural scheduled work | `too_old`, `backlog_cap`, `overlap`, `claim_unavailable` | `indeterminate`; no automatic retry |
| awareness reflection | 1 hour | 1 | one delayed reflection, serialized with natural work | `too_old`, `backlog_cap`, `overlap`, `claim_unavailable` | `indeterminate`; no automatic retry |
| Q-D probe | 30 seconds and before next boundary | 1 | only a near-boundary capture whose input snapshots pass existing freshness checks; preserve actual capture timestamps | `historical_inputs_unreconstructable`, `next_boundary_imminent`, `too_old`, `backlog_cap`, `claim_unavailable` | `indeterminate`; no automatic retry |
| universe discovery | 4 hours and before the next regular xStock session minus a 30-minute completion guard | 1 | one delayed provider sweep, serialized with natural/manual discovery | `market_guard`, `too_old`, `backlog_cap`, `overlap`, `claim_unavailable` | `indeterminate`; no automatic retry |

The limits are fail-closed operating policy, not claims that older work is technically impossible. Feed keeps at least 30 seconds before its next five-minute boundary after maximum normal jitter. Q-D's 30-second limit permits the proved ~2-second clock-step/stall case but forbids historical telemetry. Awareness is current-state work, so half an hourly cadence and one-sixth of the reflection cadence are the largest useful delays before the next natural work is preferable. Formula remains useful within the same operating morning. Universe's four-hour limit plus the session guard is far larger than the measured 12.36-minute maximum while still preventing a stale pre-session sweep from launching into the trading window.

These constants live in one policy registry with version `b-cron-missed-catchup/v1`; they are not duplicated across six wrappers. Any later widening is a reviewed policy change, not a config tweak.

## 7. Load-bearing fresh-reader record

`REVIEWER: claim-only · “what objects settle whether one durable occurrence identity and one shared natural/missed runner are required, and what other states fit them?” · HIT: node-cron launches missed listeners without awaiting them before natural check; correct boundary reconstruction can still produce adjacent overlapping runs; all six audit only after work; boot/manual callers bypass scheduled wrappers; a safely redesigned audit table remains theoretically possible, but the existing writer cannot be the claim · re-derived yes at audited ref with installed runner, six wrappers, audit writer/schema/indexes and route/boot call sites`

The hit changed the plan in two places. First, the shared lane covers every production caller, while durable scheduled identity remains limited to real schedule boundaries. Second, this document treats a new ledger as the smallest compatibility-preserving choice, not the only imaginable schema: extending `scheduled_tasks_audit` would require changing its post-work/failure-swallowing contract and every terminal-row consumer.

## 8. Implementation plan — every item falls out of the audit

There are no `UNAUDITED` plan items.

### P1 — Add the narrow occurrence ledger (← A1, A5, A6)

Add forward/rollback migrations and schema types for `scheduled_job_occurrences`: UUID primary key; job name; microsecond `scheduled_for`; first source (`natural|missed_catchup`); policy version; status (`claimed|running|succeeded|failed|skipped|indeterminate`); claimed/started/completed times; lag; reason/error; attempt/owner identity; and JSONB metadata. Enforce unique `(job_name,scheduled_for)` and checks tying terminal states to completion/reason fields. Index `(job_name,scheduled_for DESC)` and unfinished states for reconciliation.

The table is append-in-identity and transition-only-in-state; no routine delete exists. Rollback disables the new runner and removes the table only before any production occurrence rows exist. It never rewrites or deletes `scheduled_tasks_audit` or alerts.

### P2 — One recovery-capable registry contract (← A4, A9)

Extend `RegisteredCronJob` with the typed occurrence core, expression/timezone, policy key and optional eligibility hook. Add one `runScheduledOccurrence(job, boundary, source)` entry point used by both the `cron.schedule` callback and the registry-installed `execution:missed` listener. Natural callbacks pass `TaskContext.date`; missed listeners compute `computePrevFire(event.date)`, prove exact schedule membership and reject an impossible/non-earlier result.

Pin node-cron 4.2.1 event ordering with a source-contract test. A dependency update that changes ordering fails loudly until the adapter is reviewed.

### P3 — Shared FIFO, policy and durable admission (← A2–A5)

Implement one in-memory execution lane per registered job. Natural and missed sources enqueue the same occurrence shape; boundary order wins within scheduled work, while different jobs may proceed independently. Boot/manual callers enqueue auxiliary invocations in arrival order, receive an invocation ID, and cannot overlap scheduled work, but they do not create a fake occurrence row. At queue head, scheduled work evaluates the central v1 policy, creates/claims the unique ledger row atomically, and only then transitions to `running` immediately before calling the core. A duplicate identity reads the existing durable decision and never invokes work again.

Admission failure is correctness-critical: neither natural nor catch-up scheduled work runs when its unique identity cannot be proved. The wrapper logs/pages this separately from the existing best-effort terminal audit writer. Preserve Q-D `noOverlap`; add the same shared runner boundary to the other five schedules rather than six ad hoc locks.

### P4 — Crash reconciliation and process overlap (← A4, A5)

Assign each process a boot instance ID and each attempt an ID. On boot, reconcile this batch's unfinished rows before arming recovery: `claimed` rows with no `started_at` return to the queue; any `running` row owned by a dead prior boot becomes `indeterminate` and raises an exact occurrence alert. No running row is automatically retried.

Use a per-job database advisory lock on a dedicated checked-out connection around every scheduled or auxiliary queue-head run so a deploy overlap cannot run two invocations for one job concurrently. Keep node-cron's local `noOverlap` where present. If the lock/admission connection cannot be held, do not enter the core. A lock-session failure stops that job's lane for the process; once a core has started, loss of terminal persistence produces `indeterminate` evidence and a manual decision, never a blind replay.

### P5 — Refactor all six wrappers without changing business work (← A2, A4, A9)

Extract or adapt each existing callback into one core receiving either a scheduled context `{scheduledFor,firedAt,triggerSource,occurrenceId}` or an auxiliary context `{firedAt,triggerSource,invocationId}`. Preserve expressions, UTC/timezone behavior, Q-D configured cadence, enablement, feed jitter, Q-D `noOverlap`, inner error handling, formula counts, Q-D coverage metadata and discovery-run evidence. Route the feed/awareness boot timers and formula/feed/reflection/universe manual routes through the same per-job lane. They keep their present business source labels and do not mint a fake scheduled boundary.

Add a compile-driven census test requiring exactly six production `cron.schedule` sites and proving each natural callback and missed listener delegates to the shared runner. A seventh unregistered site fails.

### P6 — Preserve fire evidence while correcting clocks (← A1, A5, A6)

Keep `scheduled_tasks_audit` success/error-only. On completed execution, write `scheduled_for` from the true boundary and `fired_at` from actual core start. Extend metadata with `trigger_source: cron|missed_catchup`, occurrence ID, lag and policy version while retaining each job's existing fields. Legacy rows remain readable.

The best-effort audit write does not decide whether work ran. Ledger terminalization is attempted separately and loudly; a terminal-write ambiguity after core entry is indeterminate. Formula Health selects completed formula execution rows exactly as before. The verifier treats successful exact catch-up fire evidence as a real fire and never treats ledger claims/skips as fire evidence.

### P7 — Exact stale-alert resolution and failure alerts (← A7)

After the exact occurrence reaches `succeeded`, call `resolveAlertsByDedupeKey` for only `cron_stale:<job>:<scheduled boundary>` with actor `engine` and evidence containing occurrence ID, policy version and terminal time. A different boundary/job, failure, skip or indeterminate state cannot resolve it. Correct the verifier body to say exact successful recovery auto-clears; later ordinary occurrences do not erase an earlier missed row.

Add exact recovery-failure/indeterminate alert keys with durable occurrence metadata. Do not call ack. Tests fence the `cron_verifier_blind` key/prefix from every recovery resolver.

### P8 — Deterministic tests and mutations (← A2–A7)

Add unit/integration tests for: natural context date; missed previous-boundary reconstruction; UTC/non-UTC calendar matches; duplicate event; natural/missed race; adjacent missed/natural ordering; boot/manual versus scheduled contention; two database contenders; FIFO ordering; cross-job independence; all six age/backlog policies; Q-D historical-input refusal; universe market guard; feed jitter boundary; claim DB failure; process restart; crash before claim, after claim, during work and after work/before terminal; advisory-lock contention; terminal audit-write failure; exact alert resolution; and blind-alert non-resolution.

Required mutations must fail: use missed event date directly; remove unique occurrence constraint; let natural callback bypass runner; let recovery bypass FIFO; admit two contenders; write Q-D current input into an old bucket; retry an indeterminate job; count a skip as fire; resolve wrong occurrence; resolve `cron_verifier_blind`; add a seventh ungoverned schedule.

### P9 — Exact-ref staging harness and deploy proof (← A3, A8)

Add an operator-only harness that registers synthetic, side-effect-free jobs through the real registry/admission/ledger/audit/alert path. At the deployed SHA inject: one natural fire, eligible missed fire, duplicate, natural/missed race, two queued boundaries, too-old skip, thrown core and simulated unfinished attempt. Read back one identity/terminal decision per event and exact fire rows only for executed cases.

Then prove the real six-job arm census, next-run calculations, one natural production fire per cadence available during the session, corrected boundary/start clocks, no duplicate execution/unhandled recovery error/restart, and all four CI jobs individually green. Do not alter the host clock or wait for a natural multi-day miss. UI is N/A.

### P10 — Governance and closeout (← A8, A9)

At Step 10 update the System Impact Map, System Manual, Batch Catalog, Running Issues, migration manifest and lifecycle records with: six schedules, true boundary semantics, the separate occurrence ledger, policy matrix, crash/skip states, exact alert resolution and harness. Correct the obsolete audit-table readers/volume and awareness-write claims. Preserve `cron_verifier_blind` as manual-only and close `#691` only after Step 11.

## 9. Verification matrix

| objective | positive proof | failure/mutation that must refuse |
|---|---|---|
| true occurrence identity | natural context and reconstructed missed boundary both match expression/timezone | event date used as missed boundary; invalid/non-earlier match |
| one admission | two contenders and natural/missed race yield one unique row and one core entry | unique constraint or shared runner removed |
| bounded honest recovery | one eligible synthetic catch-up executes; every old production policy records exact skip | old Q-D uses current input; backlog burst; universe overlap |
| crash truth | claimed-before-work can resume; running from dead boot becomes indeterminate | any after-start automatic retry |
| compatible evidence | completed rows carry true boundary and actual start; Formula Health/verifier still select them | claim/skip counted as fire; legacy row unreadable |
| exact alert recovery | exact succeeded occurrence resolves exact stale key with evidence | wrong job/boundary, skip/fail/indeterminate or blind key clears |
| deploy closure | real six-job arm census plus deterministic harness and four green CI jobs at deployed SHA | host clock change, natural multi-day gate, external production side effect in harness |

## 10. Plain-language summary

Today the scheduler can notice that it missed an alarm, but it has no safe way to decide whether that alarm's work already started. The fix gives every alarm a durable ticket—job name plus the time it was supposed to run—and makes both the normal ring and the late/missed ring use the same ticket desk and the same one-at-a-time line.

Not every missed job should be replayed. A formula check can still be useful a few hours late, while putting today's market snapshot into an old five-minute bucket would create false history. The policy therefore either runs one recent, honest catch-up or records exactly why it refused; uncertain work after a crash is handed to a person instead of being repeated blindly.
